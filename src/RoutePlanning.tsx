import { useState, useCallback } from "react";
import type { AddressRow } from "./types";
import { SubscriptionGuard } from "./SubscriptionGuard";
import { AddressAutocomplete } from "./components/AddressAutocomplete";
import { ImportExcel } from "./ImportExcel";
import { 
  geocodeAddresses, 
  addressRowToGeocodingResult, 
  geocodingResultToAddressRow,
  formatConfidence,
  type GeocodingResult 
} from "./services/geocoding";
import { optimizeRoute, formatDistance, formatDuration } from "./services/routeOptimization";
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
  const [geocodingProgress, setGeocodingProgress] = useState<{
    completed: number;
    total: number;
    current: string;
  } | null>(null);
  
  // Settings
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  // Optimization results
  const [optimizationResult, setOptimizationResult] = useState<{
    optimizedOrder: number[];
    totalDistance: number;
    totalDuration: number;
    unassigned: number[];
    error?: string;
  } | null>(null);

  // Get API key from localStorage on mount
  const storedApiKey = (() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ors_api_key') || '';
    }
    return '';
  })();

  const handleApiKeyChange = (newKey: string) => {
    setApiKey(newKey);
    if (typeof window !== 'undefined') {
      if (newKey) {
        localStorage.setItem('ors_api_key', newKey);
      } else {
        localStorage.removeItem('ors_api_key');
      }
    }
  };

  // Import addresses from Excel
  const handleImportExcel = useCallback((importedAddresses: AddressRow[]) => {
    const geocodingResults = importedAddresses.map(addressRowToGeocodingResult);
    setAddresses(geocodingResults);
    setOptimizationResult(null);
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

    setAddresses(prev => [...prev, newResult]);
    setNewAddress("");
    setOptimizationResult(null);
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

    setAddresses(prev => [...prev, newResult]);
    setNewAddress("");
    setOptimizationResult(null);
  };

  // Remove address
  const handleRemoveAddress = (index: number) => {
    setAddresses(prev => prev.filter((_, i) => i !== index));
    setOptimizationResult(null);
  };

  // Edit address inline
  const handleEditAddress = (index: number, newAddressText: string) => {
    setAddresses(prev => prev.map((addr, i) => 
      i === index 
        ? { ...addr, address: newAddressText, success: false, error: "Modified - needs geocoding" }
        : addr
    ));
    setOptimizationResult(null);
  };

  // Geocode all addresses that need it
  const handleGeocodeAll = async () => {
    const keyToUse = apiKey || storedApiKey;
    if (!keyToUse) {
      alert("Please enter your OpenRouteService API key first");
      setShowSettings(true);
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
        keyToUse,
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
      alert('Geocoding failed. Please check your API key and try again.');
    } finally {
      setIsGeocoding(false);
      setGeocodingProgress(null);
    }
  };

  // Optimize route
  const handleOptimizeRoute = async () => {
    const keyToUse = apiKey || storedApiKey;
    if (!keyToUse) {
      alert("Please enter your OpenRouteService API key first");
      setShowSettings(true);
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

    setIsOptimizing(true);
    setOptimizationResult(null);

    try {
      const addressRows = addresses.map(geocodingResultToAddressRow);
      const result = await optimizeRoute(addressRows, keyToUse);
      
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
    }
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
      <div className="route-planning" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Route Planning</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div style={{ 
            background: 'var(--surface)', 
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>OpenRouteService API Key</h4>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--text-muted)',
              margin: '0 0 0.5rem 0'
            }}>
              Get your free API key at{' '}
              <a 
                href="https://openrouteservice.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)' }}
              >
                openrouteservice.org
              </a>
            </p>
            <input
              type="password"
              placeholder="Enter your OpenRouteService API key"
              value={apiKey || storedApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="input"
              style={{ width: '100%', marginBottom: '0.5rem' }}
            />
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-muted)',
              margin: 0
            }}>
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>
        )}

        {/* Import/Add Section */}
        <div style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius)',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Add Addresses</h3>
          
          {/* Excel Import */}
          <div style={{ marginBottom: '1rem' }}>
            <ImportExcel onImported={handleImportExcel} />
          </div>

          {/* Manual Address Entry with Autocomplete */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                Or add addresses manually:
              </label>
              <AddressAutocomplete
                value={newAddress}
                onChange={setNewAddress}
                onSelect={handleSelectFromAutocomplete}
                placeholder="Start typing an address..."
                apiKey={apiKey || storedApiKey}
                disabled={!apiKey && !storedApiKey}
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
            background: 'var(--surface)', 
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            marginBottom: '1.5rem'
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
            borderRadius: 'var(--radius)',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>
              Geocoding: {geocodingProgress.completed}/{geocodingProgress.total}
            </div>
            <div style={{ 
              background: 'var(--surface)',
              borderRadius: 'var(--radius)',
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
            borderRadius: 'var(--radius)',
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

        {/* Address List */}
        {addresses.length > 0 && (
          <div style={{ 
            background: 'var(--surface)', 
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '1rem', 
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--background)'
            }}>
              <h3 style={{ margin: 0 }}>Addresses ({addresses.length})</h3>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {addresses.map((addr, index) => (
                <div
                  key={index}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: index < addresses.length - 1 ? '1px solid var(--border-light)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ 
                    width: '1.5rem', 
                    height: '1.5rem', 
                    borderRadius: '50%',
                    background: addr.success ? 'var(--success)' : 'var(--warning)',
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
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
        )}

        {/* Empty State */}
        {addresses.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'var(--text-muted)'
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
      background: 'var(--surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius)',
      margin: '1rem'
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗺️</div>
      <h2>Route Planning</h2>
      <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
        Plan your daily routes with intelligent address geocoding and route optimization.
      </p>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ 
          background: 'var(--primary-light)', 
          color: 'var(--primary)', 
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          fontSize: '0.875rem'
        }}>
          Premium Feature
        </span>
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
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