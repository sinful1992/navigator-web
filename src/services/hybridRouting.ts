import { supabase } from "../lib/supabaseClient";
import type { AddressRow } from "../types";
import { geocodeAddresses as googleGeocodeAddresses, searchAddresses as googleSearchAddresses, type GeocodingResult } from "./geocoding";

// Re-export types and utility functions from centralizedRouting
export type { GeocodingResult } from "./geocoding";
export {
  addressRowToGeocodingResult,
  geocodingResultToAddressRow,
  formatDistance,
  formatDuration,
  formatConfidence,
  getConfidenceLevel,
  isCentralizedRoutingAvailable
} from "./centralizedRouting";

export interface AddressAutocompleteResult {
  label: string;
  coordinates: [number, number]; // [lng, lat]
  confidence: number;
  placeId?: string; // For Places API results
}

interface RouteOptimizationResult {
  success: boolean;
  optimizedOrder: number[]; // Array of original address indices in optimized order
  totalDistance: number; // In meters
  totalDuration: number; // In seconds
  unassigned: number[]; // Indices of addresses that couldn't be included
  error?: string;
}

/**
 * Geocode multiple addresses using Google Maps with caching
 * This is the new hybrid approach - Google Maps for geocoding
 */
export async function geocodeAddresses(
  addresses: string[],
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<GeocodingResult[]> {
  console.log(`Geocoding ${addresses.length} addresses via Google Maps (hybrid service)`);

  try {
    // Use our cached Google Maps geocoding service
    const results = await googleGeocodeAddresses(addresses, undefined, onProgress);

    console.log(`Google Maps geocoding completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;

  } catch (error) {
    console.error('Google Maps geocoding service failed:', error);
    // Return error results for all addresses
    return addresses.map(address => ({
      success: false,
      address,
      originalAddress: address,
      error: error instanceof Error ? error.message : 'Google Maps service unavailable'
    }));
  }
}

/**
 * Search for addresses with autocomplete using Google Maps
 * Falls back to centralized service if Google Maps fails
 */
export async function searchAddresses(
  query: string,
  countryCode = "GB",
  limit = 5,
  focusLat?: number,
  focusLon?: number,
): Promise<AddressAutocompleteResult[]> {
  try {
    // Try Google Maps search first (basic geocoding-based)
    const googleResults = await googleSearchAddresses(query);

    if (googleResults.length > 0) {
      return googleResults.slice(0, limit);
    }
  } catch (error) {
    console.warn('Google Maps search failed, falling back to centralized service:', error);
  }

  // Fallback to centralized service (OpenRouteService)
  if (!supabase) {
    console.error('No search services available');
    return [];
  }

  try {
    if (!query.trim() || query.length < 3) {
      return [];
    }

    const { data, error } = await supabase.functions.invoke('search-addresses', {
      body: {
        query: query.trim(),
        countryCode,
        limit: Math.min(limit, 10),
        ...(focusLat !== undefined && focusLon !== undefined ? { focusLat, focusLon } : {})
      }
    });

    if (error) {
      console.error('Address search error:', error);
      return [];
    }

    return data?.results || [];

  } catch (error) {
    console.error('Address search failed:', error);
    return [];
  }
}

/**
 * Optimize route using centralized service (OpenRouteService)
 * This keeps the existing route optimization logic unchanged
 */
export async function optimizeRoute(
  addresses: AddressRow[],
  startLocation?: [number, number],
  avoidTolls?: boolean
): Promise<RouteOptimizationResult> {
  if (!supabase) {
    throw new Error('Supabase client not available');
  }

  try {
    // Filter addresses that have valid coordinates and prepare for API
    const validAddresses = addresses
      .map((addr, index) => ({ ...addr, originalIndex: index }))
      .filter(({ lat, lng }) =>
        lat !== null &&
        lat !== undefined &&
        lng !== null &&
        lng !== undefined &&
        !isNaN(lat) &&
        !isNaN(lng)
      );

    if (validAddresses.length === 0) {
      return {
        success: false,
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: addresses.map((_, i) => i),
        error: "No addresses have valid coordinates for route optimization"
      };
    }

    // If only one address, return it as-is
    if (validAddresses.length === 1) {
      return {
        success: true,
        optimizedOrder: [validAddresses[0].originalIndex],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: []
      };
    }

    console.log(`Optimizing route for ${validAddresses.length} addresses via OpenRouteService (hybrid service)`);

    const requestBody = {
      addresses: validAddresses.map(addr => ({
        address: addr.address,
        lat: addr.lat!,
        lng: addr.lng!
      })),
      startLocation,
      // NOTE: No endLocation - VROOM will optimize a one-way route
      avoidTolls
    };

    console.log('Route optimization request:', {
      addressCount: requestBody.addresses.length,
      hasStartLocation: !!startLocation,
      firstAddress: requestBody.addresses[0]
    });

    /**
     * IMPORTANT: Backend Edge Function should configure VROOM vehicle for ONE-WAY routes:
     *
     * vehicle = {
     *   id: 1,
     *   start: startLocation,  // Optional starting location
     *   // NO end property - VROOM will find the best one-way route ending at the last optimized stop
     * }
     *
     * See VROOM docs: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md#vehicles
     *
     * "At least one of start or end must be present"
     * "If end is omitted, the resulting route will stop at the last visited task"
     */

    // Try direct HTTP request to get better error details
    let data = null;
    let error = null;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration missing');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/optimize-route`;
      const userToken = (await supabase.auth.getSession()).data.session?.access_token;

      console.log('Making direct request to Edge Function:', {
        url: functionUrl,
        hasAuthToken: !!userToken,
        requestBodySize: JSON.stringify(requestBody).length
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey
      };

      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
      }

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      console.log('Edge Function response status:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge Function error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        // Try to parse as JSON for structured error
        try {
          const errorData = JSON.parse(errorText);
          error = new Error(`Edge Function error (${response.status}): ${errorData.error || errorText}`);
        } catch {
          error = new Error(`Edge Function error (${response.status}): ${errorText}`);
        }
      } else {
        data = await response.json();
      }
    } catch (fetchError) {
      console.error('Failed to make direct request to Edge Function:', fetchError);
      // Fallback to original Supabase method
      const result = await supabase.functions.invoke('optimize-route', {
        body: requestBody
      });
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Route optimization error details:', {
        error,
        errorMessage: error.message,
        errorName: error.name,
        errorStack: error.stack,
        data: data // Sometimes data contains error details even when error is present
      });

      // Provide user-friendly error messages with more details
      let userError = `Route optimization service error: ${error.message || 'Unknown error'}`;

      if (error.message?.includes('OpenRouteService API key')) {
        userError = 'Route optimization service not configured. Please contact support.';
      } else if (error.message?.includes('non-2xx status code')) {
        userError = 'Route optimization service is temporarily unavailable. Please try again later.';
      } else if (error.message?.includes('Unauthorized')) {
        userError = 'Authentication required. Please log in again.';
      } else if (error.message?.includes('Subscription required')) {
        userError = 'Route optimization requires an active subscription.';
      } else if (error.message?.includes('OpenRouteService API error')) {
        userError = `OpenRouteService API error: ${error.message.split('OpenRouteService API error: ')[1] || error.message}`;
      } else if (error.message?.includes('Maximum 100 addresses')) {
        userError = 'Too many addresses. Maximum 100 addresses allowed per optimization.';
      } else if (error.message?.includes('No addresses have valid coordinates')) {
        userError = 'No addresses have valid coordinates for route optimization.';
      }

      return {
        success: false,
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: addresses.map((_, i) => i),
        error: userError
      };
    }

    console.log('Route optimization response received:', {
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : null,
      success: data?.success
    });

    if (!data) {
      console.error('Route optimization: No data received from Edge Function');
      return {
        success: false,
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: addresses.map((_, i) => i),
        error: 'No response from optimization service'
      };
    }

    console.log(`Route optimization completed: ${data.optimizedOrder?.length || 0} addresses optimized`);
    return data;

  } catch (error) {
    console.error('Route optimization failed:', error);
    return {
      success: false,
      optimizedOrder: [],
      totalDistance: 0,
      totalDuration: 0,
      unassigned: addresses.map((_, i) => i),
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get route directions for an optimized route
 * Returns polyline geometry for each segment of the route
 */
export async function getOptimizedRouteDirections(
  addresses: AddressRow[],
  optimizedOrder: number[],
  startLocation?: [number, number],
  avoidTolls?: boolean
): Promise<{
  success: boolean;
  routeSegments: Array<{
    from: number;
    to: number;
    geometry: [number, number][];
    distance: number;
    duration: number;
  }>;
  error?: string;
}> {
  if (!supabase) {
    return {
      success: false,
      routeSegments: [],
      error: 'Supabase client not available'
    };
  }

  try {
    // Build coordinates in optimized order
    const waypoints: [number, number][] = [];

    // Add start location if provided
    if (startLocation) {
      waypoints.push(startLocation);
    }

    // Add addresses in optimized order
    for (const index of optimizedOrder) {
      const address = addresses[index];
      if (address.lat && address.lng) {
        waypoints.push([address.lng, address.lat]);
      }
    }

    if (waypoints.length < 2) {
      return {
        success: false,
        routeSegments: [],
        error: 'Need at least 2 waypoints to generate route'
      };
    }

    // Get directions from OpenRouteService
    const { data, error } = await supabase.functions.invoke('get-route-directions', {
      body: {
        coordinates: waypoints,
        profile: 'driving-car',
        avoidTolls
      }
    });

    if (error) {
      console.error('Route directions error:', error);
      return {
        success: false,
        routeSegments: [],
        error: error.message || 'Failed to get route directions'
      };
    }

    return {
      success: true,
      routeSegments: data?.segments || [],
      error: undefined
    };

  } catch (error) {
    console.error('Failed to get route directions:', error);
    return {
      success: false,
      routeSegments: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Check if the hybrid routing service is available
 */
export function isHybridRoutingAvailable(): boolean {
  // Google Maps geocoding is always available (client-side)
  // Route optimization requires Supabase
  return true; // Geocoding will always work, optimization may fallback gracefully
}