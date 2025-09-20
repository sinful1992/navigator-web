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
  endLocation?: [number, number]
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

    const { data, error } = await supabase.functions.invoke('optimize-route', {
      body: {
        addresses: validAddresses.map(addr => ({
          address: addr.address,
          lat: addr.lat!,
          lng: addr.lng!
        })),
        startLocation,
        endLocation
      }
    });

    if (error) {
      console.error('Route optimization error:', error);

      // Provide user-friendly error messages
      let userError = 'Route optimization service error';
      if (error.message?.includes('OpenRouteService API key')) {
        userError = 'Route optimization service not configured. Please contact support.';
      } else if (error.message?.includes('non-2xx status code')) {
        userError = 'Route optimization service is temporarily unavailable. Please try again later.';
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

    if (!data) {
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
 * Check if the hybrid routing service is available
 */
export function isHybridRoutingAvailable(): boolean {
  // Google Maps geocoding is always available (client-side)
  // Route optimization requires Supabase
  return true; // Geocoding will always work, optimization may fallback gracefully
}