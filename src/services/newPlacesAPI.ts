/**
 * New Places API integration using direct HTTP calls
 * This replaces the Maps JavaScript API with the new Places API (New)
 */

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

  try {
    // Use session token for cost efficiency
    const sessionToken = options.sessionToken || sessionManager.generateToken();

    // Build request body for the new Places API
    const requestBody = {
      input: input,
      sessionToken: sessionToken,
      ...(options.componentRestrictions && {
        locationRestriction: {
          country: options.componentRestrictions.country.toUpperCase()
        }
      }),
      ...(options.types && options.types.length > 0 && {
        includedTypes: options.types
      })
    };

    console.log('Making Places API (New) autocomplete request:', requestBody);

    const response = await fetch(
      `https://places.googleapis.com/v1/places:autocomplete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'suggestions.place.id,suggestions.place.displayName,suggestions.place.formattedAddress'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Places API error:', response.status, errorData);
      throw new Error(`Places API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Places API response:', data);

    // Transform the new API response to match our expected format
    if (data.suggestions) {
      return data.suggestions
        .filter((suggestion: any) => suggestion.place)
        .map((suggestion: any) => ({
          place_id: suggestion.place.id,
          description: suggestion.place.formattedAddress || suggestion.place.displayName?.text || '',
          structured_formatting: {
            main_text: suggestion.place.displayName?.text || '',
            secondary_text: suggestion.place.formattedAddress || ''
          },
          types: suggestion.place.types || []
        }));
    }

    return [];
  } catch (error) {
    console.error('Places API autocomplete failed:', error);
    throw error;
  }
}

/**
 * Get place details using the new Places API
 */
export async function getPlaceDetailsNew(
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetails | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    console.log('Getting place details for:', placeId);

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
      console.error('Place details API error:', response.status, errorData);
      throw new Error(`Place details API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Place details response:', data);

    // Clear session token after successful place details call
    if (sessionToken) {
      sessionManager.clearToken();
    }

    if (data.id && data.location) {
      return {
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
    }

    return null;
  } catch (error) {
    console.error('Place details failed:', error);
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