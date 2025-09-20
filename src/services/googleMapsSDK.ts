/**
 * Google Maps JavaScript SDK integration for Places Autocomplete
 * This handles CORS restrictions properly unlike direct API calls
 */

/// <reference types="google.maps" />

declare global {
  interface Window {
    google: typeof google;
    [key: string]: any; // For dynamic callback names
  }
}

let googleMapsLoaded = false;
let googleMapsPromise: Promise<void> | null = null;

/**
 * Load Google Maps JavaScript SDK
 */
export async function loadGoogleMapsSDK(): Promise<void> {
  if (googleMapsLoaded) {
    return Promise.resolve();
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    // Check if script already exists in the DOM
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Script already exists, check if Google Maps is loaded
      if (window.google?.maps) {
        googleMapsLoaded = true;
        resolve();
        return;
      }
    }

    // Set up global callback with unique name to avoid conflicts
    const callbackName = `initGoogleMaps_${Date.now()}`;
    (window as any)[callbackName] = () => {
      googleMapsLoaded = true;
      // Clean up callback
      try {
        delete (window as any)[callbackName];
      } catch (error) {
        // Ignore cleanup errors
      }
      resolve();
    };

    // Create script tag
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      // Clean up on error
      try {
        delete (window as any)[callbackName];
      } catch (error) {
        // Ignore cleanup errors
      }
      reject(new Error('Failed to load Google Maps SDK'));
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

/**
 * Get autocomplete predictions using Google Maps SDK
 * Uses the newer AutocompleteSuggestion API when available
 */
export async function getPlacesPredictions(
  query: string,
  options: {
    types?: string[];
    componentRestrictions?: { country: string };
    sessionToken?: string;
  } = {}
): Promise<google.maps.places.AutocompletePrediction[]> {
  await loadGoogleMapsSDK();

  if (!window.google?.maps?.places) {
    throw new Error('Google Maps Places library not loaded');
  }

  // Use AutocompleteService (legacy API, but stable and well-documented)
  return new Promise((resolve, reject) => {
    const service = new window.google.maps.places.AutocompleteService();

    const request: google.maps.places.AutocompletionRequest = {
      input: query,
      types: options.types || ['address'],
      componentRestrictions: options.componentRestrictions || { country: 'gb' },
      sessionToken: options.sessionToken ? new window.google.maps.places.AutocompleteSessionToken() : undefined
    };

    service.getPlacePredictions(request, (predictions: google.maps.places.AutocompletePrediction[] | null, status: google.maps.places.PlacesServiceStatus) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
        resolve(predictions);
      } else if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
      } else {
        console.error(`Places service error: ${status}`);
        reject(new Error(`Places service error: ${status}`));
      }
    });
  });
}

/**
 * Get place details using Google Maps SDK
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string
): Promise<google.maps.places.PlaceResult> {
  await loadGoogleMapsSDK();

  if (!window.google?.maps?.places) {
    throw new Error('Google Maps Places library not loaded');
  }

  return new Promise((resolve, reject) => {
    // Create a temporary div for PlacesService (required by Google)
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    const service = new window.google.maps.places.PlacesService(tempDiv);

    let cleanupAttempted = false;
    const cleanupTempDiv = () => {
      if (cleanupAttempted) {
        return;
      }
      cleanupAttempted = true;

      try {
        if (typeof tempDiv.remove === 'function') {
          tempDiv.remove();
          return;
        }
      } catch (error) {
        console.debug('Temp div remove() failed (ignoring):', error);
      }

      const parent = tempDiv.parentNode;
      if (parent && parent.contains(tempDiv)) {
        try {
          parent.removeChild(tempDiv);
        } catch (error) {
          console.debug('Temp div parent removal failed (ignoring):', error);
        }
      }
    };

    const request: google.maps.places.PlaceDetailsRequest = {
      placeId,
      fields: ['geometry', 'formatted_address', 'name'],
      sessionToken: sessionToken ? new window.google.maps.places.AutocompleteSessionToken() : undefined
    };

    try {
      service.getDetails(request, (place: google.maps.places.PlaceResult | null, status: google.maps.places.PlacesServiceStatus) => {
        // Clean up temporary DOM element immediately
        cleanupTempDiv();

        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place);
        } else {
          reject(new Error(`Place details error: ${status}`));
        }
      });
    } catch (error) {
      cleanupTempDiv();
      reject(error);
    }
  });
}

/**
 * Geocode an address using Google Maps JavaScript SDK
 * This bypasses referer restrictions unlike HTTP API calls
 */
export async function geocodeAddressSDK(address: string): Promise<{
  success: boolean;
  address: string;
  originalAddress: string;
  lat?: number;
  lng?: number;
  confidence?: number;
  formattedAddress?: string;
  error?: string;
}> {
  try {
    await loadGoogleMapsSDK();

    if (!window.google?.maps) {
      throw new Error('Google Maps SDK not loaded');
    }

    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();

      geocoder.geocode({ address }, (results, status) => {
        if (status === window.google.maps.GeocoderStatus.OK && results && results.length > 0) {
          const result = results[0];
          resolve({
            success: true,
            address,
            originalAddress: address,
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
            confidence: 1.0, // Google Maps doesn't provide confidence scores
            formattedAddress: result.formatted_address
          });
        } else if (status === window.google.maps.GeocoderStatus.ZERO_RESULTS) {
          resolve({
            success: false,
            address,
            originalAddress: address,
            error: 'No geocoding results found'
          });
        } else {
          console.warn(`Geocoding failed with status: ${status}`);
          resolve({
            success: false,
            address,
            originalAddress: address,
            error: `Geocoding failed: ${status}`
          });
        }
      });
    });
  } catch (error) {
    console.error('SDK geocoding error:', error);
    return {
      success: false,
      address,
      originalAddress: address,
      error: error instanceof Error ? error.message : 'SDK geocoding failed'
    };
  }
}

/**
 * Check if Google Maps SDK is available
 */
export function isGoogleMapsSDKAvailable(): boolean {
  return !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}