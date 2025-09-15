/**
 * Google Maps JavaScript SDK integration for Places Autocomplete
 * This handles CORS restrictions properly unlike direct API calls
 */

/// <reference types="google.maps" />

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps: () => void;
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
    // Set up global callback
    window.initGoogleMaps = () => {
      googleMapsLoaded = true;
      resolve();
    };

    // Create script tag
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps SDK'));

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
    const service = new window.google.maps.places.PlacesService(tempDiv);

    const request: google.maps.places.PlaceDetailsRequest = {
      placeId,
      fields: ['geometry', 'formatted_address', 'name'],
      sessionToken: sessionToken ? new window.google.maps.places.AutocompleteSessionToken() : undefined
    };

    service.getDetails(request, (place: google.maps.places.PlaceResult | null, status: google.maps.places.PlacesServiceStatus) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        resolve(place);
      } else {
        reject(new Error(`Place details error: ${status}`));
      }
    });
  });
}

/**
 * Check if Google Maps SDK is available
 */
export function isGoogleMapsSDKAvailable(): boolean {
  return !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}