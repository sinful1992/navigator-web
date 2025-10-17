import * as React from "react";
import { useState, useCallback, startTransition, useRef } from "react";
import type { AddressRow } from "./types";
import { SubscriptionGuard } from "./SubscriptionGuard";
import { AddressAutocomplete } from "./components/AddressAutocomplete";
import { LeafletMap } from "./components/LeafletMap";
import { ImportExcel } from "./ImportExcel";
import { useSettings } from "./hooks/useSettings";
import {
  geocodeAddresses,
  addressRowToGeocodingResult,
  geocodingResultToAddressRow,
  formatConfidence,
  formatDistance,
  formatDuration,
  optimizeRoute,
  isHybridRoutingAvailable,
  type GeocodingResult
} from "./services/hybridRouting";
import type { User } from "@supabase/supabase-js";

interface RoutePlanningProps {
  user: User | null;
  onAddressesReady: (addresses: AddressRow[]) => void;
}

const RoutePlanningComponent = function RoutePlanning({ user, onAddressesReady }: RoutePlanningProps) {
  // Settings
  const { settings } = useSettings();

  // Ref for address input to support auto-focus
  const addressInputRef = useRef<HTMLInputElement>(null);

  // State management
  const [addresses, setAddresses] = useState<GeocodingResult[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [startingPointIndex, setStartingPointIndex] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [showImportSection, setShowImportSection] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState<{
    completed: number;
    total: number;
    current: string;
  } | null>(null);

  // Optimization results
  const [optimizationResult, setOptimizationResult] = useState<{
    optimizedOrder: number[];
    totalDistance: number;
    totalDuration: number;
    unassigned: number[];
    error?: string;
  } | null>(null);


  // Import addresses from Excel
  const handleImportExcel = useCallback((importedAddresses: AddressRow[]) => {
    const geocodingResults = importedAddresses.map(addressRowToGeocodingResult);
    setAddresses(geocodingResults);
    setOptimizationResult(null);
    setStartingPointIndex(null);
  }, []);

  // Add single address manually
  const handleAddAddress = () => {
    if (!newAddress.trim()) return;

    const newResult: GeocodingResult = {
      success: false,
      address: newAddress.trim(),
      originalAddress: newAddress.trim(),
      error: "Not geocoded yet"
    };

    // Use startTransition to batch updates and prevent DOM conflicts
    startTransition(() => {
      setAddresses(prev => [...prev, newResult]);
      setNewAddress("");
      setOptimizationResult(null);
    });

    // Auto-focus the input for adding more addresses
    setTimeout(() => addressInputRef.current?.focus(), 0);
  };

  // Add address from autocomplete
  const handleSelectFromAutocomplete = (address: string, lat: number, lng: number) => {
    const newResult: GeocodingResult = {
      success: true,
      address: address,
      originalAddress: address,
      lat,
      lng,
      confidence: 1.0,
      formattedAddress: address
    };

    // Use startTransition to batch updates and prevent DOM conflicts
    startTransition(() => {
      setAddresses(prev => [...prev, newResult]);
      setNewAddress("");
      setOptimizationResult(null);
    });

    // Auto-focus the input for adding more addresses
    setTimeout(() => addressInputRef.current?.focus(), 0);
  };

  // Remove address
  const handleRemoveAddress = (index: number) => {
    // Use startTransition to batch updates and prevent DOM conflicts
    startTransition(() => {
      setAddresses(prev => prev.filter((_, i) => i !== index));
      setOptimizationResult(null);
      // Adjust starting point index if needed
      if (startingPointIndex === index) {
        setStartingPointIndex(null);
      } else if (startingPointIndex !== null && startingPointIndex > index) {
        setStartingPointIndex(startingPointIndex - 1);
      }
    });
  };

  // Edit address inline
  const handleEditAddress = (index: number, newAddressText: string) => {
    // Use startTransition to batch updates and prevent DOM conflicts
    startTransition(() => {
      setAddresses(prev => prev.map((addr, i) =>
        i === index
          ? { ...addr, address: newAddressText, success: false, error: "Modified - needs geocoding" }
          : addr
      ));
      setOptimizationResult(null);
    });
  };

  // Geocode a single address
  const handleGeocodeSingle = async (index: number) => {
    if (!isHybridRoutingAvailable()) {
      alert("Geocoding service is not available. Please check your connection and subscription.");
      return;
    }

    const addr = addresses[index];
    if (addr.success) return;

    try {
      const results = await geocodeAddresses([addr.address]);
      const updatedAddresses = [...addresses];
      updatedAddresses[index] = results[0];
      setAddresses(updatedAddresses);
      setOptimizationResult(null);
    } catch (error) {
      console.error('Single geocoding failed:', error);
      alert('Geocoding failed. Please check your connection and subscription.');
    }
  };

  // Handle manual coordinate input
  const handleManualCoordinates = (index: number, lat: number | undefined, lng: number | undefined) => {
    const updatedAddresses = [...addresses];
    updatedAddresses[index] = {
      ...updatedAddresses[index],
      lat: lat,
      lng: lng,
      success: lat !== undefined && lng !== undefined,
      formattedAddress: updatedAddresses[index].formattedAddress || updatedAddresses[index].address,
      error: lat !== undefined && lng !== undefined ? undefined : 'Manual coordinates incomplete'
    };
    setAddresses(updatedAddresses);
    setOptimizationResult(null);
  };

  // Geocode all addresses that need it
  const handleGeocodeAll = async () => {
    if (!isHybridRoutingAvailable()) {
      alert("Geocoding service is not available. Please check your connection and subscription.");
      return;
    }

    const addressesToGeocode = addresses
      .map((addr, index) => ({ addr, index }))
      .filter(({ addr }) => !addr.success);

    if (addressesToGeocode.length === 0) {
      alert("All addresses are already geocoded!");
      return;
    }

    setIsGeocoding(true);
    setGeocodingProgress({ completed: 0, total: addressesToGeocode.length, current: "" });

    try {
      const addressStrings = addressesToGeocode.map(({ addr }) => addr.address);
      const results = await geocodeAddresses(
        addressStrings,
        (completed, total, current) => {
          setGeocodingProgress({ completed, total, current });
        }
      );

      // Update the addresses array with new geocoding results
      const updatedAddresses = [...addresses];
      addressesToGeocode.forEach(({ index }, resultIndex) => {
        updatedAddresses[index] = results[resultIndex];
      });

      setAddresses(updatedAddresses);
      setOptimizationResult(null);

    } catch (error) {
      console.error('Batch geocoding failed:', error);
      alert('Geocoding failed. Please check your connection and subscription.');
    } finally {
      setIsGeocoding(false);
      setGeocodingProgress(null);
    }
  };

  // Optimize route
  const handleOptimizeRoute = async () => {
    if (!isHybridRoutingAvailable()) {
      alert("Route optimization service is not available. Please check your connection and subscription.");
      return;
    }

    const validAddresses = addresses.filter(addr => addr.success && addr.lat && addr.lng);

    if (validAddresses.length === 0) {
      alert("No addresses with valid coordinates available for optimization");
      return;
    }

    if (validAddresses.length < addresses.length) {
      const missing = addresses.length - validAddresses.length;
      if (!confirm(`${missing} addresses don't have coordinates and will be excluded from optimization. Continue?`)) {
        return;
      }
    }

    // Clear previous optimization before starting new one
    setIsOptimizing(true);
    setOptimizationResult(null);

    try {
      const addressRows = addresses.map(geocodingResultToAddressRow);

      // Use starting point if selected (optional)
      let startLocation: [number, number] | undefined;
      if (startingPointIndex !== null && startingPointIndex >= 0) {
        const startAddr = addresses[startingPointIndex];
        if (startAddr.success && startAddr.lat && startAddr.lng) {
          startLocation = [startAddr.lng, startAddr.lat];
        }
      }

      // ALWAYS one-way route - VROOM will find the best route ending at the last optimized stop
      const result = await optimizeRoute(addressRows, startLocation, settings.avoidTolls);

      setOptimizationResult({
        optimizedOrder: result.optimizedOrder,
        totalDistance: result.totalDistance,
        totalDuration: result.totalDuration,
        unassigned: result.unassigned,
        error: result.error
      });

      if (result.success && result.optimizedOrder.length > 0) {
        // Reorder addresses based on optimization
        const optimizedAddresses = result.optimizedOrder.map(index => addresses[index]);
        setAddresses(optimizedAddresses);

        // FIX: Reset optimizedOrder to sequential indices since array is now physically reordered
        // This ensures indices match the new array order for route line drawing
        setOptimizationResult({
          optimizedOrder: optimizedAddresses.map((_, i) => i), // [0, 1, 2, 3, ...]
          totalDistance: result.totalDistance,
          totalDuration: result.totalDuration,
          unassigned: result.unassigned,
          error: result.error
        });

        // Update starting point index to reflect new order
        if (startingPointIndex !== null) {
          const newStartIndex = result.optimizedOrder.indexOf(startingPointIndex);
          setStartingPointIndex(newStartIndex >= 0 ? newStartIndex : null);
        }
      }

    } catch (error) {
      console.error('Route optimization failed:', error);
      setOptimizationResult({
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: [],
        error: error instanceof Error ? error.message : 'Optimization failed'
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  // Export addresses to main app
  const handleExportToMainList = () => {
    const addressRows = addresses.map(geocodingResultToAddressRow);
    onAddressesReady(addressRows);
    alert(`Exported ${addressRows.length} addresses to your main address list!`);
  };

  // Clear all addresses
  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all addresses?")) {
      setAddresses([]);
      setOptimizationResult(null);
      setStartingPointIndex(null);
    }
  };

  // Handle map address updates
  const handleMapAddressesUpdate = (updatedAddresses: AddressRow[]) => {
    const geocodingResults = updatedAddresses.map(addressRowToGeocodingResult);
    setAddresses(geocodingResults);
    setOptimizationResult(null);
  };

  // Statistics
  const stats = {
    total: addresses.length,
    geocoded: addresses.filter(a => a.success).length,
    needsGeocoding: addresses.filter(a => !a.success).length,
    highConfidence: addresses.filter(a => a.success && (a.confidence || 0) >= 0.8).length,
    lowConfidence: addresses.filter(a => a.success && (a.confidence || 0) < 0.5).length
  };

  return (
    <SubscriptionGuard user={user} fallback={<RoutePlanningLockedView />}>
      <div className="route-planning" style={{ maxWidth: '100%', padding: '0' }}>

        {/* Service Status Warning */}
        {!isHybridRoutingAvailable() && (
          <div style={{
            background: 'var(--surface)',
            border: '2px solid var(--warning)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontWeight: 'bold', color: 'var(--warning)', marginBottom: '0.25rem' }}>
              ⚠️ Service Unavailable
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              Check your internet connection
            </div>
          </div>
        )}

        {/* Collapsible Import Section */}
        {addresses.length === 0 && (
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border-light)',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setShowImportSection(!showImportSection)}
              style={{
                width: '100%',
                padding: '1rem 1.5rem',
                background: 'transparent',
                border: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              <span>📁 Import Excel File</span>
              <span style={{ fontSize: '1.25rem' }}>{showImportSection ? '▼' : '▶'}</span>
            </button>

            {showImportSection && (
              <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                <ImportExcel onImported={handleImportExcel} />
              </div>
            )}
          </div>
        )}



        {/* Map View (always visible when addresses exist) */}
        {addresses.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            marginBottom: '1rem',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                🗺️ Map View
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? 'Hide' : 'Show'}
              </button>
            </div>

            {showMap && (
              <div style={{
                height: '400px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--border)'
              }}>
                <LeafletMap
                  addresses={addresses.map(geocodingResultToAddressRow)}
                  onAddressesUpdate={handleMapAddressesUpdate}
                  startingPointIndex={startingPointIndex ?? undefined}
                  onStartingPointChange={setStartingPointIndex}
                  optimizedOrder={optimizationResult?.optimizedOrder}
                  showRouteLines={!!optimizationResult && !optimizationResult.error}
                  confidences={addresses.map(addr => addr.confidence)}
                  avoidTolls={settings.avoidTolls}
                />
              </div>
            )}
          </div>
        )}

        {/* Add Address & Optimize Controls (below map) */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-light)'
        }}>
          {/* Address Input */}
          <div style={{ marginBottom: '1rem' }}>
            <AddressAutocomplete
              ref={addressInputRef}
              id="manual-address-input"
              value={newAddress}
              onChange={setNewAddress}
              onSelect={handleSelectFromAutocomplete}
              placeholder="Type an address to add..."
              disabled={!isHybridRoutingAvailable()}
            />
            <button
              className="btn btn-primary"
              onClick={handleAddAddress}
              disabled={!newAddress.trim()}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.75rem',
                fontSize: '0.9375rem',
                fontWeight: '600'
              }}
            >
              + Add Address
            </button>
          </div>

          {/* Optimization Result */}
          {optimizationResult && (
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: 'var(--surface)',
              border: optimizationResult.error ? '2px solid var(--danger)' : '2px solid var(--success)',
              borderRadius: 'var(--radius-md)',
              color: optimizationResult.error ? 'var(--danger)' : 'var(--success)'
            }}>
              {optimizationResult.error ? (
                <>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', fontSize: '0.9375rem' }}>
                    ❌ Optimization Failed
                  </div>
                  <div style={{ fontSize: '0.8125rem' }}>
                    {optimizationResult.error}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
                    ✓ Route Optimized
                  </div>
                  <div style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}>
                    <div>📍 {optimizationResult.optimizedOrder.length} stops</div>
                    <div>🚗 {formatDuration(optimizationResult.totalDuration)}</div>
                    <div>📏 {formatDistance(optimizationResult.totalDistance)}</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Optimize Button */}
          {addresses.length > 0 && stats.geocoded >= 2 && (
            <button
              className="btn btn-primary"
              onClick={handleOptimizeRoute}
              disabled={isOptimizing}
              style={{
                width: '100%',
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              {isOptimizing ? (
                <>
                  <span className="spinner" style={{
                    display: 'inline-block',
                    width: '1rem',
                    height: '1rem',
                    marginRight: '0.5rem'
                  }} />
                  Optimizing...
                </>
              ) : (
                `🗺️ Optimize ${stats.geocoded} Address${stats.geocoded > 1 ? 'es' : ''}`
              )}
            </button>
          )}
        </div>

        {/* Action Buttons (Export & Clear) - Moved above address list */}
        {addresses.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            <button
              className="btn btn-success"
              onClick={handleExportToMainList}
              style={{
                flex: 1,
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              📤 Export to Main List
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleClearAll}
              style={{
                padding: '0.875rem',
                fontSize: '1rem'
              }}
            >
              🗑️
            </button>
          </div>
        )}

        {/* Address List */}
        {addresses.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            marginBottom: '1rem',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border-light)'
          }}>
            {/* Header with Stats */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
                gap: '0.5rem',
                flexWrap: 'wrap'
              }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                  {optimizationResult && !optimizationResult.error && optimizationResult.optimizedOrder.length > 0
                    ? '📍 Optimized Route'
                    : `Addresses (${addresses.length})`
                  }
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {stats.needsGeocoding > 0 && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleGeocodeAll}
                      disabled={isGeocoding}
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {isGeocoding ? (
                        <>
                          <span className="spinner" style={{
                            display: 'inline-block',
                            width: '0.875rem',
                            height: '0.875rem',
                            marginRight: '0.25rem'
                          }} />
                          Geocoding...
                        </>
                      ) : (
                        `🌍 Geocode ${stats.needsGeocoding}`
                      )}
                    </button>
                  )}
                  {startingPointIndex !== null && (
                    <span style={{
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      padding: '0.25rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      🏠 Start: #{startingPointIndex + 1}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-around',
                gap: '0.5rem',
                padding: '0.75rem',
                background: 'var(--gray-50)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--primary)' }}>
                    {stats.total}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>Total</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--success)' }}>
                    {stats.geocoded}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>Ready</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--warning)' }}>
                    {stats.needsGeocoding}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>Pending</div>
                </div>
              </div>
            </div>

            {/* Geocoding Progress */}
            {geocodingProgress && (
              <div style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'var(--primary-light)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--primary)'
              }}>
                <div style={{
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: 'var(--primary)',
                  fontSize: '0.875rem'
                }}>
                  Geocoding {geocodingProgress.completed} of {geocodingProgress.total}
                </div>
                <div style={{
                  background: 'var(--gray-200)',
                  borderRadius: '999px',
                  height: '0.375rem',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    background: 'var(--primary)',
                    height: '100%',
                    width: `${(geocodingProgress.completed / geocodingProgress.total) * 100}%`,
                    transition: 'width 0.3s ease',
                    borderRadius: '999px'
                  }} />
                </div>
              </div>
            )}

            <div style={{
              maxHeight: '400px',
              overflowY: 'auto',
              margin: '0 -1.5rem',
              padding: '0 1.5rem'
            }}>
              {[...addresses]
                .sort((a, b) => {
                  // Sort ungeocoded addresses first
                  if (!a.success && b.success) return -1;
                  if (a.success && !b.success) return 1;
                  return 0;
                })
                .map((addr) => {
                  // Find original index for operations
                  const index = addresses.indexOf(addr);
                  return (
                <div
                  key={index}
                  style={{
                    padding: '1rem',
                    borderBottom: index < addresses.length - 1 ? '1px solid var(--border-light)' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    background: index === startingPointIndex ? 'var(--primary-light)' : 'transparent',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: index < addresses.length - 1 ? '0.5rem' : '0'
                  }}
                >
                  {/* Number Badge - Click to set as starting point */}
                  <div style={{
                    minWidth: '2rem',
                    height: '2rem',
                    borderRadius: '50%',
                    background: index === startingPointIndex ? 'var(--primary)' :
                               addr.success ? 'var(--success)' : 'var(--warning)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    flexShrink: 0,
                    cursor: 'pointer',
                    border: index === startingPointIndex ? '2px solid white' : 'none'
                  }}
                  onClick={() => {
                    setStartingPointIndex(index === startingPointIndex ? null : index);
                  }}
                  title={
                    index === startingPointIndex ? 'Starting Point (click to clear)' :
                    'Click to set as starting point'
                  }
                  >
                    {index === startingPointIndex ? '🏠' : index + 1}
                  </div>

                  {/* Address Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      name={`address-${index}`}
                      type="text"
                      value={addr.address}
                      onChange={(e) => handleEditAddress(index, e.target.value)}
                      className="input"
                      style={{
                        width: '100%',
                        marginBottom: '0.5rem',
                        fontSize: '0.9375rem',
                        padding: '0.5rem',
                        border: '1px solid var(--border)'
                      }}
                    />
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      {addr.success ? (
                        <>
                          <span style={{ color: 'var(--success)' }}>✓</span> {addr.formattedAddress || addr.address}
                          {addr.confidence && (
                            <span style={{
                              display: 'inline-block',
                              marginLeft: '0.5rem',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '999px',
                              background: addr.confidence >= 0.8 ? 'var(--success-light)' :
                                         addr.confidence >= 0.5 ? 'var(--warning-light)' : 'var(--danger-light)',
                              color: addr.confidence >= 0.8 ? 'var(--success-dark)' :
                                     addr.confidence >= 0.5 ? 'var(--warning-dark)' : 'var(--danger-dark)',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}>
                              {formatConfidence(addr.confidence)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--warning)' }}>
                          ⚠️ {addr.error}
                        </span>
                      )}
                    </div>

                    {/* Manual Coordinates Input - only for ungeocoded addresses */}
                    {!addr.success && (
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginTop: '0.5rem',
                        alignItems: 'center'
                      }}>
                        <input
                          type="number"
                          step="any"
                          placeholder="Latitude"
                          value={addr.lat ?? ''}
                          onChange={(e) => {
                            const lat = e.target.value ? parseFloat(e.target.value) : undefined;
                            handleManualCoordinates(index, lat, addr.lng);
                          }}
                          className="input"
                          style={{
                            flex: 1,
                            fontSize: '0.75rem',
                            padding: '0.375rem 0.5rem',
                            border: '1px solid var(--border)'
                          }}
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="Longitude"
                          value={addr.lng ?? ''}
                          onChange={(e) => {
                            const lng = e.target.value ? parseFloat(e.target.value) : undefined;
                            handleManualCoordinates(index, addr.lat, lng);
                          }}
                          className="input"
                          style={{
                            flex: 1,
                            fontSize: '0.75rem',
                            padding: '0.375rem 0.5rem',
                            border: '1px solid var(--border)'
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    {!addr.success && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleGeocodeSingle(index)}
                        title="Geocode this address"
                        style={{
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.875rem',
                          minWidth: 'auto'
                        }}
                      >
                        🌍
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRemoveAddress(index)}
                      title="Remove"
                      style={{
                        padding: '0.5rem',
                        minWidth: 'auto',
                        fontSize: '1.125rem'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {addresses.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗺️</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
              Start Planning Your Route
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9375rem' }}>
              Import addresses from Excel or add them manually
            </p>
          </div>
        )}
      </div>
    </SubscriptionGuard>
  );
}

function RoutePlanningLockedView() {
  return (
    <div style={{
      padding: '2rem',
      textAlign: 'center',
      background: 'var(--gray-100)',
      border: '1px solid var(--gray-200)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      color: 'var(--gray-800)'
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗺️</div>
      <h2>Route Planning</h2>
      <p style={{ marginBottom: '1.5rem', color: 'var(--gray-500)' }}>
        Plan your daily routes with intelligent address geocoding and route optimization.
      </p>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ 
          background: 'var(--primary-light)',
          color: 'var(--primary)',
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem'
        }}>
          Premium Feature
        </span>
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '0.5rem' }}>✅ Import addresses from Excel</div>
        <div style={{ marginBottom: '0.5rem' }}>✅ Google-style address autocomplete</div>
        <div style={{ marginBottom: '0.5rem' }}>✅ Automatic geocoding with confidence scores</div>
        <div style={{ marginBottom: '0.5rem' }}>✅ Intelligent route optimization</div>
        <div style={{ marginBottom: '0.5rem' }}>✅ Manual address correction</div>
        <div>✅ Export to main address list</div>
      </div>
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export const RoutePlanning = React.memo(RoutePlanningComponent);