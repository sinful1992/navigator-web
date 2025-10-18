/**
 * New Places API integration using direct HTTP calls
 * This replaces the Maps JavaScript API with the new Places API (New)
 */

import { get, set } from 'idb-keyval';

import { logger } from '../utils/logger';

export interface PlaceAutocompleteResult {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  types: string[];
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
}

// Cache types
type AutocompleteCache = {
  [cacheKey: string]: {
    results: PlaceAutocompleteResult[];
    timestamp: number;
  };
};

type PlaceDetailsCache = {
  [placeId: string]: {
    details: PlaceDetails;
    timestamp: number;
  };
};

const AUTOCOMPLETE_CACHE_KEY = 'places-autocomplete-cache';
const PLACE_DETAILS_CACHE_KEY = 'places-details-cache';
const AUTOCOMPLETE_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLACE_DETAILS_CACHE_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// In-memory cache with IndexedDB persistence
let autocompleteCache: AutocompleteCache = {};
let placeDetailsCache: PlaceDetailsCache = {};
let cachesLoaded = false;

/**
 * Load caches from IndexedDB
 */
async function loadCaches(): Promise<void> {
  if (cachesLoaded) return;

  try {
    const [autoCache, detailsCache] = await Promise.all([
      get(AUTOCOMPLETE_CACHE_KEY),
      get(PLACE_DETAILS_CACHE_KEY)
    ]);

    if (autoCache) {
      autocompleteCache = autoCache;
    }
    if (detailsCache) {
      placeDetailsCache = detailsCache;
    }

    cachesLoaded = true;
    logger.info('Places API caches loaded:', {
      autocomplete: Object.keys(autocompleteCache).length,
      details: Object.keys(placeDetailsCache).length
    });
  } catch (error) {
    logger.warn('Failed to load Places API caches:', error);
    cachesLoaded = true; // Continue even if loading fails
  }
}

/**
 * Save autocomplete cache to IndexedDB
 */
async function saveAutocompleteCache(): Promise<void> {
  try {
    await set(AUTOCOMPLETE_CACHE_KEY, autocompleteCache);
  } catch (error) {
    logger.warn('Failed to save autocomplete cache:', error);
  }
}

/**
 * Save place details cache to IndexedDB
 */
async function savePlaceDetailsCache(): Promise<void> {
  try {
    await set(PLACE_DETAILS_CACHE_KEY, placeDetailsCache);
  } catch (error) {
    logger.warn('Failed to save place details cache:', error);
  }
}

/**
 * Clean expired entries from caches
 */
function cleanExpiredEntries(): void {
  const now = Date.now();

  // Clean autocomplete cache
  for (const [key, entry] of Object.entries(autocompleteCache)) {
    if (now - entry.timestamp > AUTOCOMPLETE_CACHE_DURATION_MS) {
      delete autocompleteCache[key];
    }
  }

  // Clean place details cache
  for (const [key, entry] of Object.entries(placeDetailsCache)) {
    if (now - entry.timestamp > PLACE_DETAILS_CACHE_DURATION_MS) {
      delete placeDetailsCache[key];
    }
  }
}

/**
 * Generate cache key for autocomplete request
 */
function generateAutocompleteCacheKey(
  input: string,
  countryCode?: string,
  types?: string[]
): string {
  const normalized = input.trim().toLowerCase();
  const country = countryCode || 'GB';
  const typesStr = types?.sort().join(',') || '';
  return `${normalized}|${country}|${typesStr}`;
}

/**
 * Session token management for cost-efficient Places API usage
 */
class SessionManager {
  private currentToken: string | null = null;

  generateToken(): string {
    this.currentToken = 'session_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    return this.currentToken;
  }

  getToken(): string | null {
    return this.currentToken;
  }

  clearToken(): void {
    this.currentToken = null;
  }
}

const sessionManager = new SessionManager();

/**
 * Get place autocomplete predictions using the new Places API
 * Results are cached for 24 hours to minimize API calls
 */
export async function getPlaceAutocomplete(
  input: string,
  options: {
    sessionToken?: string;
    componentRestrictions?: { country: string };
    types?: string[];
  } = {}
): Promise<PlaceAutocompleteResult[]> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  if (!input.trim() || input.length < 3) {
    return [];
  }

  // Load cache if not already loaded
  await loadCaches();

  // Generate cache key
  const cacheKey = generateAutocompleteCacheKey(
    input,
    options.componentRestrictions?.country,
    options.types
  );

  // Check cache first
  const cached = autocompleteCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < AUTOCOMPLETE_CACHE_DURATION_MS) {
    logger.info(`Using cached autocomplete results for: "${input}"`);
    return cached.results;
  }

  try {
    // Use session token for cost efficiency
    const sessionToken = options.sessionToken || sessionManager.generateToken();

    // Build request body for the new Places API
    const requestBody = {
      input: input,
      sessionToken: sessionToken,
      ...(options.componentRestrictions && {
        regionCode: options.componentRestrictions.country.toUpperCase()
      }),
      ...(options.types && options.types.length > 0 && {
        includedPrimaryTypes: options.types
      })
    };

    logger.info('Making Places API (New) autocomplete request:', requestBody);

    const response = await fetch(
      `https://places.googleapis.com/v1/places:autocomplete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Places API error:', response.status, errorData);
      throw new Error(`Places API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    logger.info('Places API response:', data);

    // Transform the new API response to match our expected format
    let results: PlaceAutocompleteResult[] = [];
    if (data.suggestions) {
      results = data.suggestions
        .filter((suggestion: any) => suggestion.placePrediction)
        .map((suggestion: any) => ({
          place_id: suggestion.placePrediction.placeId,
          description: suggestion.placePrediction.text?.text || '',
          structured_formatting: {
            main_text: suggestion.placePrediction.structuredFormat?.mainText?.text || '',
            secondary_text: suggestion.placePrediction.structuredFormat?.secondaryText?.text || ''
          },
          types: suggestion.placePrediction.types || []
        }));
    }

    // Cache the results
    autocompleteCache[cacheKey] = {
      results,
      timestamp: Date.now()
    };
    saveAutocompleteCache().catch(logger.warn);
    cleanExpiredEntries();

    return results;
  } catch (error) {
    logger.error('Places API autocomplete failed:', error);
    throw error;
  }
}

/**
 * Get place details using the new Places API
 * Results are cached for 30 days to minimize API calls
 */
export async function getPlaceDetailsNew(
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetails | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  // Load cache if not already loaded
  await loadCaches();

  // Check cache first
  const cached = placeDetailsCache[placeId];
  if (cached && Date.now() - cached.timestamp < PLACE_DETAILS_CACHE_DURATION_MS) {
    logger.info(`Using cached place details for: ${placeId}`);
    // Still clear session token even when using cache
    if (sessionToken) {
      sessionManager.clearToken();
    }
    return cached.details;
  }

  try {
    logger.info('Getting place details for:', placeId);

    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Place details API error:', response.status, errorData);
      throw new Error(`Place details API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    logger.info('Place details response:', data);

    // Clear session token after successful place details call
    if (sessionToken) {
      sessionManager.clearToken();
    }

    if (data.id && data.location) {
      const placeDetails: PlaceDetails = {
        place_id: data.id,
        name: data.displayName?.text || '',
        formatted_address: data.formattedAddress || '',
        geometry: {
          location: {
            lat: data.location.latitude,
            lng: data.location.longitude
          }
        },
        types: data.types || []
      };

      // Cache the result
      placeDetailsCache[placeId] = {
        details: placeDetails,
        timestamp: Date.now()
      };
      savePlaceDetailsCache().catch(logger.warn);
      cleanExpiredEntries();

      return placeDetails;
    }

    return null;
  } catch (error) {
    logger.error('Place details failed:', error);
    // Clear session token on error too
    if (sessionToken) {
      sessionManager.clearToken();
    }
    throw error;
  }
}

/**
 * Check if the new Places API is available (has API key)
 */
export function isNewPlacesAPIAvailable(): boolean {
  return !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}

/**
 * Get current session token
 */
export function getCurrentSessionToken(): string | null {
  return sessionManager.getToken();
}

/**
 * Clear current session token
 */
export function clearCurrentSessionToken(): void {
  sessionManager.clearToken();
}

/**
 * Get cache statistics for debugging
 */
export function getPlacesCacheStats(): {
  autocomplete: { total: number; valid: number; expired: number };
  placeDetails: { total: number; valid: number; expired: number };
} {
  const now = Date.now();

  // Autocomplete cache stats
  let autoValid = 0;
  let autoExpired = 0;
  for (const entry of Object.values(autocompleteCache)) {
    if (now - entry.timestamp < AUTOCOMPLETE_CACHE_DURATION_MS) {
      autoValid++;
    } else {
      autoExpired++;
    }
  }

  // Place details cache stats
  let detailsValid = 0;
  let detailsExpired = 0;
  for (const entry of Object.values(placeDetailsCache)) {
    if (now - entry.timestamp < PLACE_DETAILS_CACHE_DURATION_MS) {
      detailsValid++;
    } else {
      detailsExpired++;
    }
  }

  return {
    autocomplete: {
      total: Object.keys(autocompleteCache).length,
      valid: autoValid,
      expired: autoExpired
    },
    placeDetails: {
      total: Object.keys(placeDetailsCache).length,
      valid: detailsValid,
      expired: detailsExpired
    }
  };
}

/**
 * Clear all Places API caches
 */
export async function clearPlacesCaches(): Promise<void> {
  autocompleteCache = {};
  placeDetailsCache = {};
  await Promise.all([
    saveAutocompleteCache(),
    savePlaceDetailsCache()
  ]);
  logger.info('Places API caches cleared');
}