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
    logger.info(`[geocodeInternal] Starting for: "${address}"`);

    // RACE CONDITION FIX: Wait for cache to load before proceeding
    if (this.cacheLoadPromise) {
      await this.cacheLoadPromise;
    }

    if (!this.apiKey) {
      logger.error(`[geocodeInternal] No API key configured!`);
      return {
        success: false,
        address,
        originalAddress: address,
        error: 'Google Maps API key not configured'
      };
    }

    if (!address?.trim()) {
      logger.warn(`[geocodeInternal] Empty address provided`);
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
      logger.info(`[geocodeInternal] Cache hit for: "${address}"`);
      return cached.result;
    }

    // Use client-side SDK (works with referer-restricted API keys)
    try {
      const { geocodeAddressSDK, isGoogleMapsSDKAvailable } = await import('./googleMapsSDK');
      logger.info(`[geocodeInternal] SDK available: ${isGoogleMapsSDKAvailable()}`);

      if (isGoogleMapsSDKAvailable()) {
        // Append ", UK" to bias results towards United Kingdom
        const addressWithUK = address.includes('UK') || address.includes('United Kingdom')
          ? address
          : `${address}, UK`;

        logger.info(`Geocoding with SDK: "${addressWithUK}"`);
        const result = await geocodeAddressSDK(addressWithUK);

        // Restore original address in result
        result.address = address;
        result.originalAddress = address;

        // Only cache successful results - don't cache failures
        if (result.success) {
          this.cache[normalizedAddress] = {
            result,
            timestamp: Date.now(),
          };
          this.saveCache().catch(logger.warn);
        }
        return result;
      }
    } catch (sdkError) {
      logger.warn('SDK geocoding failed:', sdkError);
    }

    // Return failure - don't cache failures so they can be retried
    return {
      success: false,
      address,
      originalAddress: address,
      error: 'Geocoding service unavailable'
    };
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
 * Geocode a single address using server-side Edge Function
 * API key is securely stored on server
 */
export async function geocodeAddress(
  address: string,
  _apiKey?: string // For backward compatibility
): Promise<GeocodingResult> {
  const { geocodeAddresses: centralizedGeocode } = await import('./centralizedRouting');
  const results = await centralizedGeocode([address]);
  return results[0] || {
    success: false,
    address,
    originalAddress: address,
    error: 'Geocoding failed'
  };
}

/**
 * Batch geocode multiple addresses
 * Uses server-side Edge Function for reliability and security
 */
export async function geocodeAddresses(
  addresses: string[],
  _apiKey?: string, // For backward compatibility
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<GeocodingResult[]> {
  const { geocodeAddresses: centralizedGeocode } = await import('./centralizedRouting');
  return centralizedGeocode(addresses, onProgress);
}

import { getPlaceDetailsNew, isNewPlacesAPIAvailable, getCurrentSessionToken, clearCurrentSessionToken } from './newPlacesAPI';

import { logger } from '../utils/logger';

// Legacy session token management - now handled by newPlacesAPI service

/**
 * Address autocomplete/search using server-side Edge Function
 * API key is securely stored on server
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

  const { searchAddresses: centralizedSearch } = await import('./centralizedRouting');
  return centralizedSearch(query, countryCode, limit);
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