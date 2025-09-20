import { useState, useEffect, useRef, useCallback } from "react";
import type { AddressRow } from "../types";
import { geocodeAddresses } from "../services/hybridRouting";
import { loadGoogleMapsSDK, isGoogleMapsSDKAvailable } from "../services/googleMapsSDK";

interface MapPin {
  id: string;
  address: string;
  lat: number;
  lng: number;
  isStart: boolean;
  isGeocoded: boolean;
  confidence?: number;
}

interface InteractiveMapProps {
  addresses: AddressRow[];
  onAddressesUpdate: (addresses: AddressRow[]) => void;
  startingPointIndex?: number;
  onStartingPointChange: (index: number | null) => void;
}

export function InteractiveMap({
  addresses,
  onAddressesUpdate,
  startingPointIndex,
  onStartingPointChange
}: InteractiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [editingAddress, setEditingAddress] = useState<{
    index: number;
    marker: google.maps.Marker;
  } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState(false);

  // Initialize Google Map
  useEffect(() => {
    if (!mapRef.current || map || !isGoogleMapsSDKAvailable()) return;

    const initializeMap = async () => {
      // Add small delay to prevent conflicts with autocomplete and ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        setIsLoadingMap(true);
        setMapError(null);

        await loadGoogleMapsSDK();

        if (!window.google?.maps) {
          throw new Error('Google Maps failed to load');
        }

        // Default to London, UK if no addresses
        const defaultCenter = { lat: 51.5074, lng: -0.1278 };

        const newMap = new google.maps.Map(mapRef.current!, {
          zoom: 10,
          center: defaultCenter,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        setMap(newMap);
      } catch (error) {
        console.error('Failed to initialize Google Maps:', error);
        setMapError(error instanceof Error ? error.message : 'Failed to load map');
      } finally {
        setIsLoadingMap(false);
      }
    };

    initializeMap();
  }, [map]);

  // Create map pins from addresses
  const createPins = useCallback((): MapPin[] => {
    return addresses.map((addr, index) => ({
      id: `pin-${index}`,
      address: addr.address,
      lat: addr.lat || 0,
      lng: addr.lng || 0,
      isStart: index === startingPointIndex,
      isGeocoded: addr.lat !== null && addr.lng !== null,
      confidence: 1.0 // Could be enhanced with actual confidence from geocoding
    }));
  }, [addresses, startingPointIndex]);

  // Update markers on map
  useEffect(() => {
    if (!map) return;

    // Use requestAnimationFrame to ensure DOM is stable
    const updateMarkers = () => {
      console.debug('🗺️ InteractiveMap: Starting marker update');

      // Clear existing markers using ref (more reliable)
      markersRef.current.forEach((marker, index) => {
        try {
          if (marker && typeof marker.setMap === 'function') {
            console.debug(`🗺️ InteractiveMap: Removing marker ${index}`);
            marker.setMap(null);
          }
        } catch (error) {
          // Ignore errors if marker was already removed
          console.debug('Marker cleanup error (ignoring):', error);
        }
      });
      markersRef.current = [];
      console.debug('🗺️ InteractiveMap: Cleared all existing markers');

      const pins = createPins();
      const geocodedPins = pins.filter(pin => pin.isGeocoded);

      if (geocodedPins.length === 0) {
        return;
      }

      // Create new markers with additional safety checks
      const newMarkers = geocodedPins.map((pin, index) => {
        try {
          console.debug(`🗺️ InteractiveMap: Creating marker ${index} for ${pin.address}`);

          if (!window.google?.maps?.Marker) {
            console.warn('Google Maps Marker not available');
            return null;
          }

          const marker = new google.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map: map,
        title: pin.address,
        label: {
          text: pin.isStart ? '🏠' : (index + 1).toString(),
          color: pin.isStart ? 'white' : 'white',
          fontWeight: 'bold',
          fontSize: '12px'
        },
        icon: {
          url: pin.isStart
            ? 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="14" fill="#2563eb" stroke="white" stroke-width="2"/>
                  <text x="16" y="20" font-family="Arial" font-size="16" fill="white" text-anchor="middle">🏠</text>
                </svg>
              `)
            : 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="14" fill="#dc2626" stroke="white" stroke-width="2"/>
                  <text x="16" y="20" font-family="Arial" font-size="12" font-weight="bold" fill="white" text-anchor="middle">${index + 1}</text>
                </svg>
              `),
          scaledSize: new google.maps.Size(32, 32),
          anchor: new google.maps.Point(16, 16)
        },
        draggable: true
      });

      // Add click listener for starting point selection
      marker.addListener('click', () => {
        const addressIndex = addresses.findIndex(addr =>
          addr.lat === pin.lat && addr.lng === pin.lng && addr.address === pin.address
        );
        if (addressIndex !== -1) {
          onStartingPointChange(addressIndex === startingPointIndex ? null : addressIndex);
        }
      });

      // Add drag listener for manual geocoding adjustment
      marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) {
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();

          const addressIndex = addresses.findIndex(addr =>
            addr.lat === pin.lat && addr.lng === pin.lng && addr.address === pin.address
          );

          if (addressIndex !== -1) {
            const updatedAddresses = [...addresses];
            updatedAddresses[addressIndex] = {
              ...updatedAddresses[addressIndex],
              lat,
              lng
            };
            onAddressesUpdate(updatedAddresses);
          }
        }
      });

      // Add right-click listener for editing
      marker.addListener('rightclick', () => {
        const addressIndex = addresses.findIndex(addr =>
          addr.lat === pin.lat && addr.lng === pin.lng && addr.address === pin.address
        );
        if (addressIndex !== -1) {
          setEditingAddress({ index: addressIndex, marker });
        }
      });

          return marker;
        } catch (error) {
          console.error('Error creating marker:', error);
          return null;
        }
      }).filter((marker): marker is google.maps.Marker => marker !== null);

      markersRef.current = newMarkers;

    // Fit map to show all markers
    if (newMarkers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      newMarkers.forEach(marker => {
        const position = marker.getPosition();
        if (position) {
          bounds.extend(position);
        }
      });
      map.fitBounds(bounds);

      // Don't zoom too close for single markers
      google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom()! > 15) {
          map.setZoom(15);
        }
      });
    }
    };

    // Use double setTimeout to ensure markers update well after React reconciliation
    const timeoutId1 = setTimeout(() => {
      const timeoutId2 = setTimeout(() => {
        updateMarkers();
      }, 0);
      return () => clearTimeout(timeoutId2);
    }, 0);

    return () => clearTimeout(timeoutId1);
  }, [map, addresses, startingPointIndex]);

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(marker => {
        try {
          marker.setMap(null);
        } catch (error) {
          // Ignore cleanup errors
          console.debug('Marker cleanup on unmount error (ignoring):', error);
        }
      });
      markersRef.current = [];
    };
  }, []);

  // Handle manual geocoding for addresses without coordinates
  const handleGeocodeAddress = async (index: number) => {
    const address = addresses[index];
    if (!address || address.lat !== null) return;

    setIsGeocoding(true);
    try {
      const results = await geocodeAddresses([address.address]);
      const result = results[0];

      if (result.success && result.lat && result.lng) {
        const updatedAddresses = [...addresses];
        updatedAddresses[index] = {
          ...updatedAddresses[index],
          lat: result.lat,
          lng: result.lng
        };
        onAddressesUpdate(updatedAddresses);
      } else {
        alert(`Failed to geocode "${address.address}": ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Geocoding failed:', error);
      alert('Geocoding service unavailable. Please try again later.');
    } finally {
      setIsGeocoding(false);
    }
  };

  // Handle map click for manual placement
  useEffect(() => {
    if (!map) return;

    const handleMapClick = (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;

      const lat = event.latLng.lat();
      const lng = event.latLng.lng();

      // Find first address without coordinates
      const ungecodedIndex = addresses.findIndex(addr => addr.lat === null || addr.lng === null);

      if (ungecodedIndex !== -1) {
        const confirmPlace = confirm(
          `Place "${addresses[ungecodedIndex].address}" at this location?`
        );

        if (confirmPlace) {
          const updatedAddresses = [...addresses];
          updatedAddresses[ungecodedIndex] = {
            ...updatedAddresses[ungecodedIndex],
            lat,
            lng
          };
          onAddressesUpdate(updatedAddresses);
        }
      }
    };

    const listener = map.addListener('click', handleMapClick);

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, addresses, onAddressesUpdate]);

  const stats = {
    total: addresses.length,
    geocoded: addresses.filter(addr => addr.lat !== null && addr.lng !== null).length,
    needsGeocoding: addresses.filter(addr => addr.lat === null || addr.lng === null).length
  };

  return (
    <div style={{
      background: 'var(--gray-100)',
      border: '1px solid var(--gray-200)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      color: 'var(--gray-800)'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid var(--gray-200)',
        background: 'var(--gray-50)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>📍 Interactive Map</h3>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
            <span>📍 {stats.geocoded} located</span>
            <span style={{ color: 'var(--warning)' }}>❓ {stats.needsGeocoding} need location</span>
            {startingPointIndex !== undefined && startingPointIndex !== null && (
              <span style={{ color: 'var(--primary)' }}>🏠 Start: #{startingPointIndex + 1}</span>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--primary-light)',
        fontSize: '0.875rem'
      }}>
        <div style={{ marginBottom: '0.25rem' }}>
          <strong>How to use:</strong>
        </div>
        <div>• Click pins to set starting point (🏠) • Right-click to edit • Drag to adjust location • Click map to place unlocated addresses</div>
      </div>

      {/* Map Container */}
      <div
        ref={mapRef}
        style={{
          height: '400px',
          width: '100%',
          background: '#f0f0f0',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Loading State */}
        {isLoadingMap && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--gray-100)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--gray-200)',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>Loading map...</div>
            <div className="spinner" style={{ width: '1.5rem', height: '1.5rem', margin: '0 auto' }} />
          </div>
        )}

        {/* Error State */}
        {mapError && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--danger-light)',
            color: 'var(--danger)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--danger)',
            textAlign: 'center',
            maxWidth: '80%'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Map failed to load
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {mapError}
            </div>
          </div>
        )}

        {/* Fallback for no Google Maps */}
        {!isGoogleMapsSDKAvailable() && !isLoadingMap && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--warning-light)',
            color: 'var(--warning)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--warning)',
            textAlign: 'center',
            maxWidth: '80%'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Map unavailable
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              Google Maps API key not configured
            </div>
          </div>
        )}
      </div>

      {/* Ungeocoded Addresses */}
      {stats.needsGeocoding > 0 && (
        <div style={{
          padding: '1rem',
          borderTop: '1px solid var(--gray-200)',
          background: 'var(--warning-light)'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--warning)' }}>
            ❓ Addresses needing location ({stats.needsGeocoding})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {addresses.map((addr, index) => {
              if (addr.lat !== null && addr.lng !== null) return null;

              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem',
                    background: 'var(--gray-100)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--gray-200)'
                  }}
                >
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    background: 'var(--warning)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}>
                    {index + 1}
                  </div>

                  <div style={{ flex: 1, fontSize: '0.875rem' }}>
                    {addr.address}
                  </div>

                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleGeocodeAddress(index)}
                    disabled={isGeocoding}
                    style={{ flexShrink: 0 }}
                  >
                    {isGeocoding ? '...' : '🌍 Locate'}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--gray-500)',
            marginTop: '0.75rem'
          }}>
            Click "🌍 Locate" to geocode automatically, or click on the map where you want to place the address.
          </div>
        </div>
      )}

      {/* Empty State */}
      {addresses.length === 0 && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--gray-500)'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
          <div>Add addresses to see them on the map</div>
        </div>
      )}

      {/* Edit Address Modal */}
      {editingAddress && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--gray-100)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            minWidth: '300px',
            maxWidth: '90vw',
            boxShadow: 'var(--shadow-lg)',
            color: 'var(--gray-800)'
          }}>
            <h4 style={{ margin: '0 0 1rem 0' }}>Edit Address</h4>
            <input
              type="text"
              value={addresses[editingAddress.index]?.address || ''}
              onChange={(e) => {
                const updatedAddresses = [...addresses];
                updatedAddresses[editingAddress.index] = {
                  ...updatedAddresses[editingAddress.index],
                  address: e.target.value
                };
                onAddressesUpdate(updatedAddresses);
              }}
              className="input"
              style={{ width: '100%', marginBottom: '1rem' }}
              placeholder="Enter address..."
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setEditingAddress(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handleGeocodeAddress(editingAddress.index);
                  setEditingAddress(null);
                }}
                disabled={isGeocoding}
              >
                Re-geocode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}