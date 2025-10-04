import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import type { AddressRow } from "../types";
import { getOptimizedRouteDirections } from "../services/hybridRouting";

// Create numbered marker icon
function createNumberedIcon(number: number, isStart: boolean, isGeocoded: boolean, confidence?: number): L.DivIcon {
  let pinClass = 'marker-pin';

  if (isStart) {
    pinClass += ' marker-start';
  } else if (!isGeocoded) {
    pinClass += ' marker-not-geocoded';
  } else if (confidence !== undefined) {
    if (confidence < 0.5) {
      pinClass += ' marker-low-confidence';
    } else if (confidence < 0.8) {
      pinClass += ' marker-medium-confidence';
    }
  }

  return L.divIcon({
    className: 'custom-numbered-marker',
    html: `<div class="${pinClass}">
      <div class="marker-number">${isStart ? '🏠' : number}</div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
}

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
  onAddressesUpdate?: (addresses: AddressRow[]) => void; // Optional - not used since drag removed
  startingPointIndex?: number;
  onStartingPointChange: (index: number | null) => void;
  optimizedOrder?: number[];
  showRouteLines?: boolean;
  confidences?: (number | undefined)[];  // Optional confidence scores for each address
}

// Component to fit map bounds to markers (recenters when addresses change)
function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (pins.length === 0) {
      return;
    }

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
  }, [map, pins.length]); // Recenter whenever pins count changes

  return null;
}

export function LeafletMap({
  addresses,
  startingPointIndex,
  onStartingPointChange,
  optimizedOrder,
  showRouteLines = false,
  confidences
}: LeafletMapProps) {
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
      confidence: confidences?.[index] // Use confidence from prop if available
    }));
  };

  const pins = createPins();
  const geocodedPins = pins.filter(pin => pin.isGeocoded);

  // Load route directions when optimized order changes
  // Track last fetched order to prevent redundant API calls
  const lastFetchedOrderRef = useRef<string>('');

  useEffect(() => {
    async function loadRouteDirections() {
      if (!showRouteLines || !optimizedOrder || optimizedOrder.length < 2) {
        setRouteSegments([]);
        lastFetchedOrderRef.current = '';
        return;
      }

      // Validate that optimizedOrder indices are valid for addresses array
      const invalidIndices = optimizedOrder.filter(idx => idx < 0 || idx >= addresses.length);
      if (invalidIndices.length > 0) {
        console.error('Invalid optimizedOrder indices:', invalidIndices);
        setRouteSegments([]);
        return;
      }

      // Create a unique key for this route configuration
      const routeKey = `${optimizedOrder.join(',')}-${startingPointIndex}`;

      // Skip if we already fetched this exact route
      if (lastFetchedOrderRef.current === routeKey) {
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
          lastFetchedOrderRef.current = routeKey; // Mark as fetched
        } else {
          console.error('Route directions failed:', result.error);
          setRouteSegments([]);
        }
      } catch (error) {
        console.error('Route directions error:', error);
        setRouteSegments([]);
      } finally {
        setIsLoadingRoute(false);
      }
    }

    loadRouteDirections();
  }, [showRouteLines, optimizedOrder, addresses.length, startingPointIndex]); // Use addresses.length instead of addresses

  // Handle starting point selection
  const handleSetStartingPoint = (index: number) => {
    onStartingPointChange(startingPointIndex === index ? null : index);
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
        {geocodedPins.map((pin, displayIndex) => {
          const addressIndex = addresses.findIndex(addr =>
            addr.lat === pin.lat && addr.lng === pin.lng && addr.address === pin.address
          );

          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={createNumberedIcon(displayIndex + 1, pin.isStart, pin.isGeocoded, pin.confidence)}
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


      {/* Custom Pin Styles */}
      <style>{`
        /* Custom Numbered Markers */
        .custom-numbered-marker {
          background: transparent;
          border: none;
        }

        .marker-pin {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .marker-pin::before {
          content: '';
          position: absolute;
          width: 36px;
          height: 36px;
          background: var(--primary);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          border: 3px solid white;
        }

        .marker-pin.marker-start::before {
          background: var(--success);
          animation: markerPulse 2s ease-in-out infinite;
        }

        .marker-pin.marker-not-geocoded::before {
          background: var(--gray-400);
        }

        .marker-pin.marker-low-confidence::before {
          background: var(--danger);
        }

        .marker-pin.marker-medium-confidence::before {
          background: var(--warning);
        }

        @keyframes markerPulse {
          0%, 100% {
            transform: rotate(-45deg) scale(1);
          }
          50% {
            transform: rotate(-45deg) scale(1.1);
          }
        }

        .marker-number {
          position: relative;
          z-index: 1;
          color: white;
          font-weight: bold;
          font-size: 0.875rem;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          transform: translateY(-2px);
        }

        /* Leaflet Popup Override for Dark Mode */
        .leaflet-popup-content-wrapper {
          background: var(--surface) !important;
          color: var(--text-primary) !important;
          border: 1px solid var(--border) !important;
          box-shadow: 0 3px 14px rgba(0, 0, 0, 0.4) !important;
        }

        .leaflet-popup-tip {
          background: var(--surface) !important;
          border: 1px solid var(--border) !important;
        }

        .leaflet-popup-close-button {
          color: var(--text-primary) !important;
        }

        .leaflet-popup-close-button:hover {
          color: var(--primary) !important;
        }
      `}</style>
    </div>
  );
}