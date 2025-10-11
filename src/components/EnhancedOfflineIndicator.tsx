// Enhanced Offline Indicator - Better visibility for sync status
import React, { useEffect, useState } from 'react';
import { pwaManager } from '../utils/pwaManager';

interface Props {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  onForceSync?: () => void;
}

export const EnhancedOfflineIndicator: React.FC<Props> = ({ isOnline, isSyncing, lastSyncTime, onForceSync }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [connectivity, setConnectivity] = useState<'checking' | 'connected' | 'disconnected'>('connected');

  useEffect(() => {
    // Periodic connectivity check
    const checkConnection = async () => {
      if (!isOnline) {
        setConnectivity('disconnected');
        return;
      }

      setConnectivity('checking');
      const connected = await pwaManager.checkConnectivity();
      setConnectivity(connected ? 'connected' : 'disconnected');
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [isOnline]);

  const getStatusColor = () => {
    if (!isOnline || connectivity === 'disconnected') return '#ef4444';
    if (isSyncing) return '#f59e0b';
    return '#10b981';
  };

  const getStatusText = () => {
    if (!isOnline || connectivity === 'disconnected') return 'Offline';
    if (isSyncing) return 'Syncing';
    if (connectivity === 'checking') return 'Checking';
    return 'Online';
  };

  const getStatusIcon = () => {
    if (!isOnline || connectivity === 'disconnected') return '📡';
    if (isSyncing) return '⟳';
    if (connectivity === 'checking') return '⏳';
    return '✓';
  };

  const getLastSyncText = () => {
    if (!lastSyncTime) return 'Never synced';

    const now = Date.now();
    const diff = now - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Status Badge */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.875rem',
          background: !isOnline || connectivity === 'disconnected'
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15))'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.15))',
          border: `1.5px solid ${getStatusColor()}`,
          borderRadius: '10px',
          color: getStatusColor(),
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        }}
      >
        <span style={{ fontSize: '1rem' }}>{getStatusIcon()}</span>
        <span>{getStatusText()}</span>
        {isSyncing && (
          <div style={{
            width: '8px',
            height: '8px',
            background: getStatusColor(),
            borderRadius: '50%',
            animation: 'pulse 1.5s infinite'
          }} />
        )}
      </button>

      {/* Details Popup */}
      {showDetails && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          zIndex: 9999,
          width: '280px',
          background: 'white',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15)',
          padding: '1rem',
          animation: 'slideDown 0.2s ease-out',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)'
          }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Connection Status</h4>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer',
                color: '#9ca3af',
                padding: 0,
                lineHeight: 1
              }}
            >
              ✕
            </button>
          </div>

          {/* Status Details */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.75rem'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                background: getStatusColor(),
                borderRadius: '50%',
                flexShrink: 0
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#111827' }}>
                  {getStatusText()}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.125rem' }}>
                  {!isOnline || connectivity === 'disconnected'
                    ? 'Working in offline mode'
                    : isSyncing
                    ? 'Syncing your data...'
                    : 'All changes synced'}
                </div>
              </div>
            </div>

            <div style={{
              fontSize: '0.8125rem',
              color: '#6b7280',
              padding: '0.5rem',
              background: 'rgba(0, 0, 0, 0.02)',
              borderRadius: '6px'
            }}>
              Last sync: <strong style={{ color: '#111827' }}>{getLastSyncText()}</strong>
            </div>
          </div>

          {/* Force Sync Button */}
          {onForceSync && isOnline && connectivity === 'connected' && !isSyncing && (
            <button
              type="button"
              onClick={() => {
                onForceSync();
                setShowDetails(false);
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '0.75rem',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              🔄 Force Sync Now
            </button>
          )}

          {/* Offline Tips */}
          {(!isOnline || connectivity === 'disconnected') && (
            <div style={{
              padding: '0.75rem',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              color: '#6b7280'
            }}>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.25rem' }}>
                📡 Offline Mode
              </div>
              <div>
                • All changes saved locally<br />
                • Will sync when connection returns<br />
                • Background sync enabled
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
