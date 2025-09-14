import type { AddressRow } from "../types";

// OpenRouteService Geocoding API
const ORS_GEOCODING_URL = "https://api.openrouteservice.org/geocode";

interface GeocodeResult {
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    label: string;
    country: string;
    region?: string;
    locality?: string;
    street?: string;
    housenumber?: string;
    confidence: number; // 0-1 confidence score
  };
}

interface GeocodeResponse {
  features: GeocodeResult[];
}

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

/**
 * Geocode a single address using OpenRouteService
 */
export async function geocodeAddress(
  address: string,
  apiKey: string,
  countryCode = "GB" // Default to UK for enforcement agents
): Promise<GeocodingResult> {
  try {
    if (!address.trim()) {
      return {
        success: false,
        address: address,
        originalAddress: address,
        error: "Empty address provided"
      };
    }

    const url = `${ORS_GEOCODING_URL}/search`;
    const params = new URLSearchParams({
      api_key: apiKey,
      text: address.trim(),
      'boundary.country': countryCode,
      size: '1', // Get only the best match
    });

    console.log(`Geocoding: "${address}"`);

    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
    }

    const data: GeocodeResponse = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return {
        success: false,
        address: address,
        originalAddress: address,
        error: "No geocoding results found"
      };
    }

    const result = data.features[0];
    const [lng, lat] = result.geometry.coordinates;
    
    return {
      success: true,
      address: address,
      originalAddress: address,
      lat,
      lng,
      confidence: result.properties.confidence,
      formattedAddress: result.properties.label
    };

  } catch (error) {
    console.error(`Geocoding failed for "${address}":`, error);
    return {
      success: false,
      address: address,
      originalAddress: address,
      error: error instanceof Error ? error.message : 'Geocoding failed'
    };
  }
}

/**
 * Batch geocode multiple addresses
 */
export async function geocodeAddresses(
  addresses: string[],
  apiKey: string,
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<GeocodingResult[]> {
  const results: GeocodingResult[] = [];
  const batchSize = 5; // Process 5 addresses at a time to avoid rate limits
  
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchPromises = batch.map(address => geocodeAddress(address, apiKey));
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

/**
 * Address autocomplete/search using OpenRouteService
 */
export async function searchAddresses(
  query: string,
  apiKey: string,
  countryCode = "GB",
  limit = 5
): Promise<AddressAutocompleteResult[]> {
  try {
    if (!query.trim() || query.length < 3) {
      return [];
    }

    const url = `${ORS_GEOCODING_URL}/search`;
    const params = new URLSearchParams({
      api_key: apiKey,
      text: query.trim(),
      'boundary.country': countryCode,
      size: limit.toString(),
    });

    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data: GeocodeResponse = await response.json();
    
    return data.features.map(feature => ({
      label: feature.properties.label,
      coordinates: feature.geometry.coordinates,
      confidence: feature.properties.confidence
    }));

  } catch (error) {
    console.error('Address search failed:', error);
    return [];
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