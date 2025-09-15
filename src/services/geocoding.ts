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
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class GeocodingService {
  private cache: GeocodeCache = {};
  public apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.loadCache();
  }

  private async loadCache(): Promise<void> {
    try {
      const cachedData = await get(CACHE_KEY);
      if (cachedData) {
        this.cache = cachedData;
        this.cleanExpiredEntries();
      }
    } catch (error) {
      console.warn('Failed to load geocoding cache:', error);
      this.cache = {};
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await set(CACHE_KEY, this.cache);
    } catch (error) {
      console.warn('Failed to save geocoding cache:', error);
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

    try {
      console.log(`Geocoding with Google Maps: "${address}"`);

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results?.length > 0) {
        const result = data.results[0];
        const geocodeResult: GeocodingResult = {
          success: true,
          address,
          originalAddress: address,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          confidence: 1.0, // Google Maps doesn't provide confidence, assume high
          formattedAddress: result.formatted_address,
        };

        // Cache the result
        this.cache[normalizedAddress] = {
          result: geocodeResult,
          timestamp: Date.now(),
        };

        // Save cache asynchronously
        this.saveCache().catch(console.warn);

        return geocodeResult;
      } else if (data.status === 'ZERO_RESULTS') {
        const failureResult: GeocodingResult = {
          success: false,
          address,
          originalAddress: address,
          error: 'No geocoding results found'
        };

        // Cache negative results too to avoid repeated API calls
        this.cache[normalizedAddress] = {
          result: failureResult,
          timestamp: Date.now(),
        };
        this.saveCache().catch(console.warn);
        return failureResult;
      } else {
        const error = `Geocoding failed: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`;
        console.warn(error);
        return {
          success: false,
          address,
          originalAddress: address,
          error
        };
      }
    } catch (error) {
      console.error('Geocoding request failed:', error);
      return {
        success: false,
        address,
        originalAddress: address,
        error: error instanceof Error ? error.message : 'Geocoding failed'
      };
    }
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
 */
export async function geocodeAddress(
  address: string,
  _apiKey?: string // For backward compatibility, but uses env var by default
): Promise<GeocodingResult> {
  const service = getGeocodingService();
  return service.geocodeAddressInternal(address);
}

/**
 * Batch geocode multiple addresses
 */
export async function geocodeAddresses(
  addresses: string[],
  _apiKey?: string, // For backward compatibility
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<GeocodingResult[]> {
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

  return results;
}

import { getPlaceAutocomplete, getPlaceDetailsNew, isNewPlacesAPIAvailable, getCurrentSessionToken, clearCurrentSessionToken } from './newPlacesAPI';

// Legacy session token management - now handled by newPlacesAPI service

/**
 * Address autocomplete/search using new Places API with session tokens
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

  // Try new Places API first
  if (isNewPlacesAPIAvailable()) {
    try {
      console.log(`Searching addresses with new Places API: "${query}"`);

      const predictions = await getPlaceAutocomplete(query, {
        componentRestrictions: { country: countryCode.toLowerCase() },
        types: ['street_address', 'route', 'establishment']
      });

      return predictions.slice(0, limit).map(prediction => ({
        label: prediction.description,
        coordinates: [0, 0], // Will be resolved when user selects
        confidence: 0.9,
        placeId: prediction.place_id
      }));

    } catch (error) {
      console.warn('New Places API search failed:', error);
    }
  }

  // Fallback to basic geocoding (but this also fails due to API restrictions)
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
      console.warn('Geocoding fallback also failed:', fallbackError);
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
      console.error('Failed to resolve place details with new API:', error);
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
      console.warn('Geocoding fallback for place resolution failed:', error);
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

/**
 * Format confidence score as percentage
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get confidence level description
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

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