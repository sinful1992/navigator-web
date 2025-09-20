import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import type { AddressRow } from "../types";
import { geocodeAddresses, getOptimizedRouteDirections } from "../services/hybridRouting";

// Fix for default markers in Leaflet with Webpack
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Configure default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapPin {
  id: string;
  address: string;
  lat: number;
  lng: number;
  isStart: boolean;
  isGeocoded: boolean;
  confidence?: number;
}

interface RouteSegment {
  from: number;
  to: number;
  geometry: [number, number][];
  distance: number;
  duration: number;
}

interface LeafletMapProps {
  addresses: AddressRow[];
  onAddressesUpdate: (addresses: AddressRow[]) => void;
  startingPointIndex?: number;
  onStartingPointChange: (index: number | null) => void;
  optimizedOrder?: number[];
  showRouteLines?: boolean;
}

// Component to fit map bounds to markers
function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (pins.length === 0) return;

    if (pins.length === 1) {
      // Center on single marker
      const pin = pins[0];
      map.setView([pin.lat, pin.lng], 15);
    } else {
      // Fit bounds to all markers
      const group = new L.FeatureGroup(
        pins.map(pin => L.marker([pin.lat, pin.lng]))
      );
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }, [map, pins]);

  return null;
}

export function LeafletMap({
  addresses,
  onAddressesUpdate,
  startingPointIndex,
  onStartingPointChange,
  optimizedOrder,
  showRouteLines = false
}: LeafletMapProps) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Create pins from addresses
  const createPins = (): MapPin[] => {
    return addresses.map((address, index) => ({
      id: `pin-${index}`,
      address: address.address,
      lat: address.lat || 0,
      lng: address.lng || 0,
      isStart: index === startingPointIndex,
      isGeocoded: !!(address.lat && address.lng),
      confidence: 0.8 // Default confidence for AddressRow (already geocoded)
    }));
  };

  const pins = createPins();
  const geocodedPins = pins.filter(pin => pin.isGeocoded);

  // Load route directions when optimized order changes
  useEffect(() => {
    async function loadRouteDirections() {
      console.log('Route directions effect triggered:', {
        showRouteLines,
        optimizedOrder,
        optimizedOrderLength: optimizedOrder?.length
      });

      if (!showRouteLines || !optimizedOrder || optimizedOrder.length < 2) {
        console.log('Route directions skipped:', {
          showRouteLines,
          hasOptimizedOrder: !!optimizedOrder,
          orderLength: optimizedOrder?.length
        });
        setRouteSegments([]);
        return;
      }

      setIsLoadingRoute(true);
      try {
        const startLocation = startingPointIndex !== undefined && addresses[startingPointIndex]
          ? [addresses[startingPointIndex].lng!, addresses[startingPointIndex].lat!] as [number, number]
          : undefined;

        const result = await getOptimizedRouteDirections(addresses, optimizedOrder, startLocation);

        if (result.success) {
          setRouteSegments(result.routeSegments);
        } else {
          console.error('Failed to load route directions:', result.error);
          setRouteSegments([]);
        }
      } catch (error) {
        console.error('Error loading route directions:', error);
        setRouteSegments([]);
      } finally {
        setIsLoadingRoute(false);
      }
    }

    loadRouteDirections();
  }, [showRouteLines, optimizedOrder, addresses, startingPointIndex]);

  // Handle manual geocoding for addresses without coordinates
  const handleGeocodeAddress = async (index: number) => {
    const address = addresses[index];
    if (!address || isGeocoding) return;

    setIsGeocoding(true);
    try {
      const results = await geocodeAddresses([address.address]);
      if (results.length > 0 && results[0].success) {
        const updatedAddresses = [...addresses];
        updatedAddresses[index] = {
          ...updatedAddresses[index],
          lat: results[0].lat,
          lng: results[0].lng
        };
        onAddressesUpdate(updatedAddresses);
      }
    } catch (error) {
      console.error('Failed to geocode address:', error);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Handle marker drag to update coordinates
  const handleMarkerDragEnd = (index: number, event: L.DragEndEvent) => {
    const marker = event.target;
    const position = marker.getLatLng();

    const updatedAddresses = [...addresses];
    updatedAddresses[index] = {
      ...updatedAddresses[index],
      lat: position.lat,
      lng: position.lng
    };
    onAddressesUpdate(updatedAddresses);
  };

  // Handle starting point selection
  const handleSetStartingPoint = (index: number) => {
    onStartingPointChange(startingPointIndex === index ? null : index);
  };

  // Get marker color based on type and confidence
  const getMarkerIcon = (pin: MapPin): L.Icon => {
    let color = '#3388ff'; // Default blue

    if (pin.isStart) {
      color = '#28a745'; // Green for starting point
    } else if (pin.confidence && pin.confidence < 0.5) {
      color = '#dc3545'; // Red for low confidence
    } else if (pin.confidence && pin.confidence < 0.8) {
      color = '#ffc107'; // Yellow for medium confidence
    }

    // Create colored marker using CSS filter
    return new L.Icon({
      iconUrl: markerIcon,
      iconRetinaUrl: markerIcon2x,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      className: `marker-${color.replace('#', '')}`
    });
  };

  // Generate color for route segment based on order
  const getSegmentColor = (segmentIndex: number, totalSegments: number): string => {
    if (totalSegments <= 1) return '#3388ff';

    // Create a gradient from green to red
    const ratio = segmentIndex / (totalSegments - 1);
    const hue = (1 - ratio) * 120; // 120 = green, 0 = red
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Default center (UK)
  const defaultCenter: [number, number] = [54.5, -2.0];
  const defaultZoom = 6;

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Fit bounds to markers */}
        <FitBounds pins={geocodedPins} />

        {/* Render markers */}
        {geocodedPins.map((pin) => {
          const addressIndex = addresses.findIndex(addr =>
            addr.lat === pin.lat && addr.lng === pin.lng && addr.address === pin.address
          );

          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={getMarkerIcon(pin)}
              draggable={true}
              eventHandlers={{
                dragend: (e) => handleMarkerDragEnd(addressIndex, e)
              }}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {pin.address}
                  </div>

                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Lat: {pin.lat.toFixed(6)}, Lng: {pin.lng.toFixed(6)}
                  </div>

                  {pin.confidence && (
                    <div style={{
                      fontSize: '0.875rem',
                      marginBottom: '0.5rem',
                      color: pin.confidence >= 0.8 ? 'var(--success)' :
                             pin.confidence >= 0.5 ? 'var(--warning)' : 'var(--danger)'
                    }}>
                      Confidence: {Math.round(pin.confidence * 100)}%
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleSetStartingPoint(addressIndex)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: pin.isStart ? 'var(--success)' : 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer'
                      }}
                    >
                      {pin.isStart ? '🏁 Starting Point' : '📍 Set as Start'}
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Render route polylines */}
        {showRouteLines && routeSegments.map((segment, index) => {
          // Convert geometry to Leaflet format [lat, lng]
          const positions: [number, number][] = segment.geometry.map(coord => [coord[1], coord[0]]);

          return (
            <Polyline
              key={`route-segment-${index}`}
              positions={positions}
              color={getSegmentColor(index, routeSegments.length)}
              weight={4}
              opacity={0.8}
              dashArray={index === 0 ? undefined : "5, 5"} // First segment solid, others dashed
            >
              <Popup>
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    Route Segment {index + 1}
                  </div>
                  <div style={{ fontSize: '0.875rem' }}>
                    Distance: {(segment.distance / 1000).toFixed(1)} km<br/>
                    Duration: {Math.round(segment.duration / 60)} min
                  </div>
                </div>
              </Popup>
            </Polyline>
          );
        })}
      </MapContainer>

      {/* Geocoding status */}
      {isGeocoding && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'var(--surface)',
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          fontSize: '0.875rem',
          zIndex: 1000
        }}>
          🔄 Geocoding address...
        </div>
      )}

      {/* Route loading status */}
      {isLoadingRoute && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'var(--surface)',
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          fontSize: '0.875rem',
          zIndex: 1000
        }}>
          🗺️ Loading route directions...
        </div>
      )}

      {/* Addresses without coordinates */}
      {addresses.some(addr => !addr.lat || !addr.lng) && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          background: 'var(--surface)',
          padding: '1rem',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          maxWidth: '300px',
          zIndex: 1000
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
            Addresses need geocoding:
          </div>
          {addresses.map((addr, index) => {
            if (addr.lat && addr.lng) return null;
            return (
              <div key={index} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.25rem',
                fontSize: '0.875rem'
              }}>
                <span style={{ flex: 1, marginRight: '0.5rem' }}>
                  {addr.address.substring(0, 30)}...
                </span>
                <button
                  onClick={() => handleGeocodeAddress(index)}
                  disabled={isGeocoding}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    cursor: isGeocoding ? 'not-allowed' : 'pointer',
                    opacity: isGeocoding ? 0.6 : 1
                  }}
                >
                  📍 Find
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}