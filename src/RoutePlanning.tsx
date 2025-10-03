import { useState, useCallback, useEffect, startTransition } from "react";
import type { AddressRow } from "./types";
import { SubscriptionGuard } from "./SubscriptionGuard";
import { AddressAutocomplete } from "./components/AddressAutocomplete";
import { LeafletMap } from "./components/LeafletMap";
import { ImportExcel } from "./ImportExcel";
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

export function RoutePlanning({ user, onAddressesReady }: RoutePlanningProps) {
  // State management
  const [addresses, setAddresses] = useState<GeocodingResult[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [startingPointIndex, setStartingPointIndex] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [geocodingProgress, setGeocodingProgress] = useState<{
    completed: number;
    total: number;
    current: string;
  } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Handle responsive layout
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile(); // Check initial size
    window.addEventListener('resize', checkIsMobile);

    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

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

      // Use starting point if selected
      let startLocation: [number, number] | undefined;
      if (startingPointIndex !== null && startingPointIndex >= 0) {
        const startAddr = addresses[startingPointIndex];
        if (startAddr.success && startAddr.lat && startAddr.lng) {
          startLocation = [startAddr.lng, startAddr.lat];
        }
      }

      const result = await optimizeRoute(addressRows, startLocation);

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
      <div className="route-planning">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>🗺️ Route Planning</h2>
            {optimizationResult && !optimizationResult.error && optimizationResult.optimizedOrder.length > 0 && (
              <span style={{
                background: 'var(--success)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                ✓ Route Optimized
              </span>
            )}
          </div>
        </div>

        {/* Service Status */}
        {!isHybridRoutingAvailable() && (
          <div style={{
            background: 'var(--warning-light)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontWeight: 'bold', color: 'var(--warning)', marginBottom: '0.5rem' }}>
              ⚠️ Service Unavailable
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              Route planning services are currently unavailable. Please check your internet connection and subscription status.
            </div>
          </div>
        )}

        {/* Import/Add Section */}
        <div style={{
          background: 'var(--gray-100)',
          border: '1px solid var(--gray-200)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          color: 'var(--gray-800)'
        }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Add Addresses</h3>
          
          {/* Excel Import */}
          <div style={{ marginBottom: '1rem' }}>
            <ImportExcel onImported={handleImportExcel} />
          </div>

          {/* Manual Address Entry with Autocomplete */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="manual-address-input" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                Or add addresses manually:
              </label>
              <AddressAutocomplete
                id="manual-address-input"
                value={newAddress}
                onChange={setNewAddress}
                onSelect={handleSelectFromAutocomplete}
                placeholder="Start typing an address..."
                disabled={!isHybridRoutingAvailable()}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleAddAddress}
              disabled={!newAddress.trim()}
              style={{ minWidth: '80px' }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Statistics */}
        {addresses.length > 0 && (
          <div style={{
            background: 'var(--gray-100)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--gray-800)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Address Status</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {stats.total}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Total Addresses
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {stats.geocoded}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Geocoded
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                  {stats.needsGeocoding}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Need Geocoding
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {stats.highConfidence}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  High Confidence
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {addresses.length > 0 && (
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            marginBottom: '1.5rem',
            flexWrap: 'wrap'
          }}>
            <button
              className="btn btn-primary"
              onClick={handleGeocodeAll}
              disabled={isGeocoding || stats.needsGeocoding === 0}
            >
              {isGeocoding ? (
                <>
                  <span className="spinner" style={{ 
                    display: 'inline-block',
                    width: '1rem',
                    height: '1rem',
                    marginRight: '0.5rem'
                  }} />
                  Geocoding...
                </>
              ) : (
                `🌍 Geocode All (${stats.needsGeocoding})`
              )}
            </button>

            <button
              className="btn btn-primary"
              onClick={handleOptimizeRoute}
              disabled={isOptimizing || stats.geocoded < 2}
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
                `🗺️ Optimize Route (${stats.geocoded})`
              )}
            </button>

            <button
              className="btn btn-primary"
              onClick={() => setShowMap(!showMap)}
              disabled={addresses.length === 0}
            >
              {showMap ? '🗺️ Hide Map' : '🗺️ Show Map'}
            </button>

            <button
              className="btn btn-success"
              onClick={handleExportToMainList}
              disabled={addresses.length === 0}
            >
              📤 Export to Main List
            </button>

            <button
              className="btn btn-ghost"
              onClick={handleClearAll}
              disabled={addresses.length === 0}
            >
              🗑️ Clear All
            </button>
          </div>
        )}

        {/* Geocoding Progress */}
        {geocodingProgress && (
          <div style={{
            background: 'var(--primary-light)',
            border: '1px solid var(--primary)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>
              Geocoding: {geocodingProgress.completed}/{geocodingProgress.total}
            </div>
            <div style={{
              background: 'var(--gray-200)',
              borderRadius: 'var(--radius-md)',
              height: '0.5rem',
              overflow: 'hidden',
              marginBottom: '0.5rem'
            }}>
              <div style={{
                background: 'var(--primary)',
                height: '100%',
                width: `${(geocodingProgress.completed / geocodingProgress.total) * 100}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Currently: {geocodingProgress.current}
            </div>
          </div>
        )}

        {/* Optimization Results */}
        {optimizationResult && (
          <div style={{
            background: optimizationResult.error ? 'var(--danger-light)' : 'var(--success-light)',
            border: `1px solid ${optimizationResult.error ? 'var(--danger)' : 'var(--success)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            {optimizationResult.error ? (
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--danger)', marginBottom: '0.5rem' }}>
                  ❌ Route Optimization Failed
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>
                  {optimizationResult.error}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--success)', marginBottom: '0.5rem' }}>
                  ✅ Route Optimized Successfully!
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  <div>📍 {optimizationResult.optimizedOrder.length} addresses in optimized order</div>
                  <div>🚗 Estimated time: {formatDuration(optimizationResult.totalDuration)}</div>
                  <div>📏 Estimated distance: {formatDistance(optimizationResult.totalDistance)}</div>
                  {optimizationResult.unassigned.length > 0 && (
                    <div style={{ color: 'var(--warning)' }}>
                      ⚠️ {optimizationResult.unassigned.length} addresses couldn't be included
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Interactive Map and Address List */}
        {addresses.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '1rem',
            flexDirection: isMobile ? 'column' : 'row',
            height: isMobile ? 'auto' : '600px' // Explicit height for desktop
          }}>
            {/* Address List */}
            <div style={{
              flex: showMap ? '1' : '2',
              minWidth: '300px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                background: 'var(--gray-100)',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
                color: 'var(--gray-800)'
              }}>
                <div style={{
                  padding: '1rem',
                  borderBottom: '1px solid var(--gray-200)',
                  background: 'var(--gray-50)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  <h3 style={{ margin: 0 }}>
                    {optimizationResult && !optimizationResult.error && optimizationResult.optimizedOrder.length > 0
                      ? '📍 Optimized Route Sequence'
                      : `Addresses (${addresses.length})`
                    }
                  </h3>
                  {startingPointIndex !== null && (
                    <div style={{
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      padding: '0.25rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.875rem'
                    }}>
                      🏠 Start: #{startingPointIndex + 1}
                    </div>
                  )}
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {addresses.map((addr, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: index < addresses.length - 1 ? '1px solid var(--gray-200)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: index === startingPointIndex ? 'var(--primary-light)' : 'transparent'
                      }}
                    >
                      <div style={{
                        width: '1.5rem',
                        height: '1.5rem',
                        borderRadius: '50%',
                        background: index === startingPointIndex ? 'var(--primary)' :
                                   addr.success ? 'var(--success)' : 'var(--warning)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                      onClick={() => setStartingPointIndex(index === startingPointIndex ? null : index)}
                      title={index === startingPointIndex ? 'Remove as starting point' : 'Set as starting point'}
                      >
                        {index === startingPointIndex ? '🏠' : index + 1}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          name={`address-${index}`}
                          type="text"
                          value={addr.address}
                          onChange={(e) => handleEditAddress(index, e.target.value)}
                          className="input"
                          style={{
                            width: '100%',
                            marginBottom: '0.25rem',
                            fontSize: '0.875rem'
                          }}
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                          {addr.success ? (
                            <>
                              ✅ {addr.formattedAddress || addr.address}
                              {addr.confidence && (
                                <span style={{
                                  marginLeft: '0.5rem',
                                  color: addr.confidence >= 0.8 ? 'var(--success)' :
                                         addr.confidence >= 0.5 ? 'var(--warning)' : 'var(--danger)'
                                }}>
                                  {formatConfidence(addr.confidence)} confidence
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--warning)' }}>
                              ⚠️ {addr.error}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRemoveAddress(index)}
                        title="Remove address"
                        style={{ flexShrink: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Interactive Map */}
            {showMap && (
              <div style={{
                flex: '1',
                minWidth: isMobile ? '100%' : '400px',
                height: isMobile ? '400px' : '100%',
                background: 'var(--gray-100)',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <LeafletMap
                  addresses={addresses.map(geocodingResultToAddressRow)}
                  onAddressesUpdate={handleMapAddressesUpdate}
                  startingPointIndex={startingPointIndex ?? undefined}
                  onStartingPointChange={setStartingPointIndex}
                  optimizedOrder={optimizationResult?.optimizedOrder}
                  showRouteLines={!!optimizationResult && !optimizationResult.error}
                  confidences={addresses.map(addr => addr.confidence)}
                />
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {addresses.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'var(--gray-500)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗺️</div>
            <h3 style={{ marginBottom: '0.5rem' }}>No addresses yet</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              Import an Excel file or add addresses manually to get started with route planning.
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
}