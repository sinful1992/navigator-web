import { supabase } from "../lib/supabaseClient";
import type { AddressRow } from "../types";

import { logger } from '../utils/logger';

// Centralized routing service that uses Supabase Edge Functions
// No API key required - handled server-side

export interface GeocodingResult {
  success: boolean;
  address: string;
  originalAddress: string;
  lat?: number;
  lng?: number;
  confidence?: number;
  formattedAddress?: string;
  error?: string;
}

export interface AddressAutocompleteResult {
  label: string;
  coordinates: [number, number]; // [lng, lat]
  confidence: number;
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
 * Geocode multiple addresses using centralized service
 * No API key required - handled server-side
 */
export async function geocodeAddresses(
  addresses: string[],
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<GeocodingResult[]> {
  if (!supabase) {
    throw new Error('Supabase client not available');
  }

  try {
    logger.info(`Geocoding ${addresses.length} addresses via centralized service`);

    // For progress tracking, we'll process in smaller batches
    const results: GeocodingResult[] = [];
    const batchSize = 10; // Process 10 addresses at a time

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      
      const { data, error } = await supabase.functions.invoke('geocode', {
        body: {
          addresses: batch,
          countryCode: 'GB'
        }
      });

      if (error) {
        logger.error('Geocoding batch error:', error);
        // Create error results for this batch
        const errorResults = batch.map(address => ({
          success: false,
          address,
          originalAddress: address,
          error: error.message || 'Geocoding service error'
        }));
        results.push(...errorResults);
      } else if (data?.results) {
        results.push(...data.results);
      } else {
        logger.error('Unexpected geocoding response:', data);
        const errorResults = batch.map(address => ({
          success: false,
          address,
          originalAddress: address,
          error: 'Unexpected service response'
        }));
        results.push(...errorResults);
      }

      // Report progress
      if (onProgress) {
        onProgress(results.length, addresses.length, batch[batch.length - 1]);
      }
    }

    logger.info(`Geocoding completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;

  } catch (error) {
    logger.error('Geocoding service failed:', error);
    // Return error results for all addresses
    return addresses.map(address => ({
      success: false,
      address,
      originalAddress: address,
      error: error instanceof Error ? error.message : 'Service unavailable'
    }));
  }
}

/**
 * Search for addresses with autocomplete
 * No API key required - handled server-side
 * Optional focusLat/focusLon bias results toward a region
 */
export async function searchAddresses(
  query: string,
  countryCode = "GB",
  limit = 5,
  focusLat?: number,
  focusLon?: number,
): Promise<AddressAutocompleteResult[]> {
  if (!supabase) {
    logger.error('Supabase client not available for address search');
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
      logger.error('Address search error:', error);
      return [];
    }

    return data?.results || [];

  } catch (error) {
    logger.error('Address search failed:', error);
    return [];
  }
}

/**
 * Optimize route using centralized service
 * No API key required - handled server-side
 */
export async function optimizeRoute(
  addresses: AddressRow[],
  startLocation?: [number, number],
  endLocation?: [number, number],
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

    logger.info(`Optimizing route for ${validAddresses.length} addresses via centralized service`);

    const { data, error } = await supabase.functions.invoke('optimize-route', {
      body: {
        addresses: validAddresses.map(addr => ({
          address: addr.address,
          lat: addr.lat!,
          lng: addr.lng!
        })),
        startLocation,
        endLocation,
        avoidTolls
      }
    });

    if (error) {
      logger.error('Route optimization error:', error);
      return {
        success: false,
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: addresses.map((_, i) => i),
        error: error.message || 'Route optimization service error'
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

    logger.info(`Route optimization completed: ${data.optimizedOrder?.length || 0} addresses optimized`);
    return data;

  } catch (error) {
    logger.error('Route optimization failed:', error);
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
 * Convert AddressRow to GeocodingResult
 */
export function addressRowToGeocodingResult(row: AddressRow): GeocodingResult {
  const hasCoordinates = row.lat !== null && row.lat !== undefined && 
                        row.lng !== null && row.lng !== undefined &&
                        !isNaN(row.lat) && !isNaN(row.lng);
  
  return {
    success: hasCoordinates,
    address: row.address,
    originalAddress: row.address,
    lat: hasCoordinates && row.lat !== null ? row.lat : undefined,
    lng: hasCoordinates && row.lng !== null ? row.lng : undefined,
    confidence: hasCoordinates ? 1.0 : undefined,
    error: hasCoordinates ? undefined : "No coordinates available"
  };
}

/**
 * Convert GeocodingResult back to AddressRow
 */
export function geocodingResultToAddressRow(result: GeocodingResult): AddressRow {
  return {
    address: result.address,
    lat: result.success && result.lat !== undefined ? result.lat : null,
    lng: result.success && result.lng !== undefined ? result.lng : null
  };
}

// Re-export formatters from shared utilities
export { formatDuration, formatDistance, formatConfidence, getConfidenceLevel } from '../utils/formatters';

/**
 * Check if the centralized routing service is available
 */
export function isCentralizedRoutingAvailable(): boolean {
  return supabase !== null;
}