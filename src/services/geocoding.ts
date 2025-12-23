import { get, set } from 'idb-keyval';
import type { AddressRow } from "../types";

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
  placeId?: string; // For Places API results
}

type GeocodeCache = {
  [address: string]: {
    result: GeocodingResult;
    timestamp: number;
  };
};

const CACHE_KEY = 'geocode-cache';
const CACHE_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

class GeocodingService {
  private cache: GeocodeCache = {};
  private isLoadingCache: boolean = false;
  private cacheLoadPromise: Promise<void> | null = null;
  public apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cacheLoadPromise = this.loadCache();
  }

  private async loadCache(): Promise<void> {
    if (this.isLoadingCache) {
      return this.cacheLoadPromise || Promise.resolve();
    }

    this.isLoadingCache = true;
    try {
      const cachedData = await get(CACHE_KEY);
      if (cachedData) {
        // RACE CONDITION FIX: Merge with existing cache instead of overwriting
        // This preserves any entries written during the load process
        this.cache = { ...cachedData, ...this.cache };
        this.cleanExpiredEntries();
      }
    } catch (error) {
      logger.warn('Failed to load geocoding cache:', error);
      // Don't overwrite existing cache on error
    } finally {
      this.isLoadingCache = false;
      this.cacheLoadPromise = null;
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await set(CACHE_KEY, this.cache);
    } catch (error) {
      logger.warn('Failed to save geocoding cache:', error);
    }
  }

  private cleanExpiredEntries(): void {
    const now = Date.now();
    const addressesToRemove: string[] = [];

    for (const [address, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp > CACHE_DURATION_MS) {
        addressesToRemove.push(address);
      }
    }

    for (const address of addressesToRemove) {
      delete this.cache[address];
    }

    if (addressesToRemove.length > 0) {
      this.saveCache();
    }
  }

  private normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async geocodeAddressInternal(address: string): Promise<GeocodingResult> {
    // RACE CONDITION FIX: Wait for cache to load before proceeding
    if (this.cacheLoadPromise) {
      await this.cacheLoadPromise;
    }

    if (!this.apiKey) {
      return {
        success: false,
        address,
        originalAddress: address,
        error: 'Google Maps API key not configured'
      };
    }

    if (!address?.trim()) {
      return {
        success: false,
        address,
        originalAddress: address,
        error: 'Empty address provided'
      };
    }

    const normalizedAddress = this.normalizeAddress(address);

    // Check cache first
    const cached = this.cache[normalizedAddress];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.result;
    }

    // Use Edge Function (server-side Geocoding API with UK restriction)
    try {
      logger.info(`Geocoding via Edge Function: "${address}"`);
      const { supabase } = await import('../lib/supabaseClient');

      if (supabase) {
        const { data, error } = await supabase.functions.invoke('geocode-google', {
          body: { addresses: [address] }
        });

        logger.info(`Edge Function response - error: ${error?.message || 'none'}, data: ${JSON.stringify(data)}`);

        if (!error && data?.results?.[0]) {
          const result = data.results[0];
          // Cache ALL results (success or failure) to prevent repeated API calls
          this.cache[normalizedAddress] = {
            result,
            timestamp: Date.now(),
          };
          this.saveCache().catch(logger.warn);
          return result;
        } else if (error) {
          logger.error(`Edge Function error: ${error.message}`);
        }
      }
    } catch (edgeFnError) {
      logger.warn('Edge Function geocoding failed:', edgeFnError);
    }

    // Return failure and cache it to prevent repeated calls
    const failureResult: GeocodingResult = {
      success: false,
      address,
      originalAddress: address,
      error: 'Geocoding service unavailable'
    };
    this.cache[normalizedAddress] = {
      result: failureResult,
      timestamp: Date.now(),
    };
    this.saveCache().catch(logger.warn);
    return failureResult;
  }

  getCacheStats(): { totalEntries: number; validEntries: number; expiredEntries: number } {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of Object.values(this.cache)) {
      if (now - entry.timestamp < CACHE_DURATION_MS) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: Object.keys(this.cache).length,
      validEntries,
      expiredEntries,
    };
  }

  async clearCache(): Promise<void> {
    this.cache = {};
    await this.saveCache();
  }
}

// Create singleton instance
let geocodingService: GeocodingService | null = null;

function getGeocodingService(): GeocodingService {
  if (!geocodingService) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    geocodingService = new GeocodingService(apiKey);
  }
  return geocodingService;
}

/**
 * Geocode a single address using Google Maps
 * Uses Google Maps API directly by default
 */
export async function geocodeAddress(
  address: string,
  _apiKey?: string // For backward compatibility, but uses env var by default
): Promise<GeocodingResult> {
  // Try Google Maps API directly first
  const service = getGeocodingService();
  try {
    const result = await service.geocodeAddressInternal(address);
    if (result.success) {
      return result;
    }
  } catch (error) {
    logger.warn('Direct Google Maps API failed, trying Supabase Edge Function:', error);
  }

  // Fallback to Supabase Edge Function if direct API fails
  try {
    const { geocodeAddresses: centralizedGeocode } = await import('./centralizedRouting');
    const results = await centralizedGeocode([address]);
    if (results.length > 0) {
      return results[0];
    }
  } catch (error) {
    logger.warn('Centralized geocoding also failed:', error);
  }

  // Return unsuccessful result if both fail
  return {
    success: false,
    address,
    originalAddress: address,
    error: 'All geocoding methods failed'
  };
}

/**
 * Batch geocode multiple addresses
 * Uses Google Maps API directly by default
 */
export async function geocodeAddresses(
  addresses: string[],
  _apiKey?: string, // For backward compatibility
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<GeocodingResult[]> {
  // Try direct Google Maps API first
  const service = getGeocodingService();
  const results: GeocodingResult[] = [];
  const batchSize = 5; // Process 5 addresses at a time to avoid rate limits

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);

    // Process batch in parallel
    const batchPromises = batch.map(address => service.geocodeAddressInternal(address));
    const batchResults = await Promise.all(batchPromises);

    results.push(...batchResults);

    // Report progress
    if (onProgress) {
      onProgress(results.length, addresses.length, batch[batch.length - 1]);
    }

    // Small delay between batches to be nice to the API
    if (i + batchSize < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Log stats - no retry to avoid double API calls
  const failedCount = results.filter(r => !r.success).length;
  if (failedCount > 0) {
    logger.warn(`${failedCount}/${addresses.length} addresses failed to geocode`);
  }

  return results;
}

import { getPlaceAutocomplete, getPlaceDetailsNew, isNewPlacesAPIAvailable, getCurrentSessionToken, clearCurrentSessionToken } from './newPlacesAPI';

import { logger } from '../utils/logger';

// Legacy session token management - now handled by newPlacesAPI service

/**
 * Address autocomplete/search using Google Places API with fallback to Supabase Edge Functions
 */
export async function searchAddresses(
  query: string,
  _apiKey?: string,
  countryCode = "GB",
  limit = 5
): Promise<AddressAutocompleteResult[]> {
  if (!query.trim() || query.length < 3) {
    return [];
  }

  // Try Google Places API directly first
  if (isNewPlacesAPIAvailable()) {
    try {
      logger.info(`Searching addresses with Google Places API: "${query}"`);

      const predictions = await getPlaceAutocomplete(query, {
        componentRestrictions: { country: countryCode.toLowerCase() },
        types: ['street_address', 'route', 'premise']
      });

      if (predictions.length > 0) {
        return predictions.slice(0, limit).map(prediction => ({
          label: prediction.description,
          coordinates: [0, 0], // Will be resolved when user selects
          confidence: 0.9,
          placeId: prediction.place_id
        }));
      }

    } catch (error) {
      logger.warn('Google Places API search failed, trying Supabase Edge Function:', error);
    }
  }

  // Fallback to Supabase Edge Function
  try {
    const { searchAddresses: centralizedSearch } = await import('./centralizedRouting');
    const results = await centralizedSearch(query, countryCode, limit);
    if (results.length > 0) {
      return results;
    }
  } catch (error) {
    logger.warn('Centralized address search also failed:', error);
  }

  // Final fallback to basic geocoding
  const service = getGeocodingService();
  if (service.apiKey) {
    try {
      const result = await service.geocodeAddressInternal(query);
      if (result.success && result.lat && result.lng) {
        return [{
          label: result.formattedAddress || result.address,
          coordinates: [result.lng, result.lat],
          confidence: result.confidence || 0.7
        }];
      }
    } catch (fallbackError) {
      logger.warn('Direct geocoding fallback also failed:', fallbackError);
    }
  }

  return [];
}

/**
 * Resolve place details when user selects an address
 * This uses the session token for cost-efficient billing
 */
export async function resolveSelectedPlace(placeId: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  if (!placeId) {
    return null;
  }

  // Try new Places API first
  if (isNewPlacesAPIAvailable()) {
    try {
      const sessionToken = getCurrentSessionToken() || undefined;
      const place = await getPlaceDetailsNew(placeId, sessionToken);

      // Clear session token after use (session is complete)
      clearCurrentSessionToken();

      if (place?.geometry?.location) {
        return {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          formattedAddress: place.formatted_address || place.name || ''
        };
      }
    } catch (error) {
      clearCurrentSessionToken(); // Clear on error too
      logger.error('Failed to resolve place details with new API:', error);
    }
  }

  // Fallback to direct API call (though this will likely fail due to CORS)
  const service = getGeocodingService();
  if (service.apiKey) {
    try {
      const result = await service.geocodeAddressInternal(placeId);
      if (result.success && result.lat && result.lng) {
        return {
          lat: result.lat,
          lng: result.lng,
          formattedAddress: result.formattedAddress || result.address
        };
      }
    } catch (error) {
      logger.warn('Geocoding fallback for place resolution failed:', error);
    }
  }

  return null;
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

/**
 * Validate if coordinates are reasonable for UK addresses
 */
export function validateUKCoordinates(lat: number, lng: number): boolean {
  // Rough bounds for UK
  // Lat: 50.0 (south coast) to 60.0 (Shetland Islands)
  // Lng: -8.0 (Northern Ireland) to 2.0 (East Anglia)
  return lat >= 49.0 && lat <= 61.0 && lng >= -9.0 && lng <= 3.0;
}

// Re-export formatters from shared utilities
export { formatConfidence, getConfidenceLevel } from '../utils/formatters';

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
  const service = getGeocodingService();
  return service.getCacheStats();
}

/**
 * Clear the geocoding cache
 */
export async function clearGeocodingCache(): Promise<void> {
  const service = getGeocodingService();
  await service.clearCache();
}