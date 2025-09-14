import { useState, useCallback } from "react";
import type { AddressRow } from "./types";
import { optimizeRoute, formatDistance, formatDuration } from "./services/routeOptimization";
import { SubscriptionGuard } from "./SubscriptionGuard";
import type { User } from "@supabase/supabase-js";

interface RouteOptimizerProps {
  addresses: AddressRow[];
  onOptimizedOrder: (optimizedIndices: number[]) => void;
  user: User | null;
}

export function RouteOptimizer({ addresses, onOptimizedOrder, user }: RouteOptimizerProps) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [lastResult, setLastResult] = useState<{
    optimizedOrder: number[];
    totalDistance: number;
    totalDuration: number;
    unassigned: number[];
    error?: string;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Get API key from localStorage on mount
  const [storedApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ors_api_key') || '';
    }
    return '';
  });

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

  const handleOptimize = useCallback(async () => {
    const keyToUse = apiKey || storedApiKey;
    
    if (!keyToUse) {
      alert("Please enter your OpenRouteService API key first");
      setShowSettings(true);
      return;
    }

    if (addresses.length === 0) {
      alert("No addresses to optimize");
      return;
    }

    // Check if addresses have coordinates
    const validAddresses = addresses.filter(addr => 
      addr.lat !== null && addr.lat !== undefined && 
      addr.lng !== null && addr.lng !== undefined &&
      !isNaN(addr.lat) && !isNaN(addr.lng)
    );

    if (validAddresses.length === 0) {
      alert("No addresses have valid coordinates. Please ensure your addresses are geocoded first.");
      return;
    }

    if (validAddresses.length < addresses.length) {
      const missing = addresses.length - validAddresses.length;
      if (!confirm(`${missing} addresses are missing coordinates and will be excluded from optimization. Continue?`)) {
        return;
      }
    }

    setIsOptimizing(true);
    setLastResult(null);

    try {
      const result = await optimizeRoute(addresses, keyToUse);
      
      setLastResult({
        optimizedOrder: result.optimizedOrder,
        totalDistance: result.totalDistance,
        totalDuration: result.totalDuration,
        unassigned: result.unassigned,
        error: result.error
      });

      if (result.success && result.optimizedOrder.length > 0) {
        onOptimizedOrder(result.optimizedOrder);
      }
    } catch (error) {
      console.error('Optimization failed:', error);
      setLastResult({
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: [],
        error: error instanceof Error ? error.message : 'Optimization failed'
      });
    } finally {
      setIsOptimizing(false);
    }
  }, [addresses, apiKey, storedApiKey, onOptimizedOrder]);

  const validAddressCount = addresses.filter(addr => 
    addr.lat !== null && addr.lat !== undefined && 
    addr.lng !== null && addr.lng !== undefined &&
    !isNaN(addr.lat) && !isNaN(addr.lng)
  ).length;

  return (
    <SubscriptionGuard user={user} fallback={<RouteOptimizerLockedView />}>
      <div className="route-optimizer" style={{ 
        background: 'var(--surface)', 
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius)',
        padding: '1rem',
        marginBottom: '1rem'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h3 style={{ margin: 0 }}>Route Optimization</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div style={{ 
            background: 'var(--background)', 
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            marginBottom: '1rem'
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

        {/* Status Info */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            📍 {validAddressCount} of {addresses.length} addresses have coordinates
            {validAddressCount < addresses.length && (
              <span style={{ color: 'var(--warning)' }}>
                {' '}(Missing coordinates will be excluded)
              </span>
            )}
          </div>
        </div>

        {/* Optimize Button */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleOptimize}
            disabled={isOptimizing || validAddressCount === 0}
            style={{ width: '100%' }}
          >
            {isOptimizing ? (
              <>
                <span className="spinner" style={{ 
                  display: 'inline-block',
                  width: '1rem',
                  height: '1rem',
                  marginRight: '0.5rem'
                }} />
                Optimizing Route...
              </>
            ) : (
              <>🗺️ Optimize Route ({validAddressCount} addresses)</>
            )}
          </button>
        </div>

        {/* Results */}
        {lastResult && (
          <div style={{ 
            background: lastResult.error ? 'var(--danger-light)' : 'var(--success-light)',
            border: `1px solid ${lastResult.error ? 'var(--danger)' : 'var(--success)'}`,
            borderRadius: 'var(--radius)',
            padding: '0.75rem'
          }}>
            {lastResult.error ? (
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--danger)', marginBottom: '0.5rem' }}>
                  ❌ Optimization Failed
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>
                  {lastResult.error}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--success)', marginBottom: '0.5rem' }}>
                  ✅ Route Optimized Successfully!
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  <div>📍 {lastResult.optimizedOrder.length} addresses in optimized order</div>
                  <div>🚗 Estimated time: {formatDuration(lastResult.totalDuration)}</div>
                  <div>📏 Estimated distance: {formatDistance(lastResult.totalDistance)}</div>
                  {lastResult.unassigned.length > 0 && (
                    <div style={{ color: 'var(--warning)' }}>
                      ⚠️ {lastResult.unassigned.length} addresses couldn't be optimized
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div style={{ 
          fontSize: '0.75rem', 
          color: 'var(--text-muted)',
          marginTop: '1rem',
          lineHeight: 1.4
        }}>
          💡 <strong>How it works:</strong> The optimizer calculates the most efficient route 
          to visit all addresses, minimizing travel time and distance. Your address list will 
          be reordered automatically after optimization.
        </div>
      </div>
    </SubscriptionGuard>
  );
}

function RouteOptimizerLockedView() {
  return (
    <div style={{ 
      padding: '1.5rem', 
      textAlign: 'center',
      background: 'var(--surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius)',
      marginBottom: '1rem'
    }}>
      <h3>🗺️ Route Optimization</h3>
      <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
        Automatically calculate the most efficient route to visit all your addresses, 
        saving time and fuel costs.
      </p>
      <div style={{ marginBottom: '1rem' }}>
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
      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        <div>✅ Minimize travel time between addresses</div>
        <div>✅ Reduce fuel costs and maximize efficiency</div>
        <div>✅ Complete more addresses per day</div>
      </div>
    </div>
  );
}