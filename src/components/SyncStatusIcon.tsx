// src/components/SyncStatusIcon.tsx
import React, { useState, useEffect, useRef } from 'react';

interface SyncStatusIconProps {
  lastSyncTime?: Date | string | null;
  isSyncing?: boolean;
  onForceSync?: () => void;
}

export const SyncStatusIcon: React.FC<SyncStatusIconProps> = ({
  lastSyncTime,
  isSyncing = false,
  onForceSync
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const getStatus = () => {
    if (isSyncing) return { icon: '🟡', label: 'Syncing...', color: '#f59e0b' };
    if (!isOnline) return { icon: '🔴', label: 'Offline', color: '#ef4444' };
    return { icon: '🟢', label: 'Online', color: '#10b981' };
  };

  const getLastSyncText = () => {
    if (!lastSyncTime) return 'Never synced';

    const syncDate = typeof lastSyncTime === 'string' ? new Date(lastSyncTime) : lastSyncTime;
    const minutesAgo = Math.floor((Date.now() - syncDate.getTime()) / 60000);

    if (minutesAgo < 1) return 'Just now';
    if (minutesAgo < 60) return `${minutesAgo} min ago`;

    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;

    const daysAgo = Math.floor(hoursAgo / 24);
    return `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;
  };

  const status = getStatus();

  return (
    <div className="sync-status-icon-container" ref={dropdownRef}>
      <button
        className="sync-status-icon"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-label={`Sync status: ${status.label}`}
        title={status.label}
      >
        <span style={{ fontSize: '1.25rem' }}>{status.icon}</span>
      </button>

      {showDropdown && (
        <div className="sync-status-dropdown">
          <div className="sync-status-header">
            <span style={{ fontSize: '1rem' }}>{status.icon}</span>
            <span style={{ fontWeight: 600 }}>{status.label}</span>
          </div>
          <div className="sync-status-detail">
            Last synced: {getLastSyncText()}
          </div>
          {onForceSync && isOnline && (
            <button
              className="sync-force-button"
              onClick={() => {
                onForceSync();
                setShowDropdown(false);
              }}
            >
              Force Sync Now
            </button>
          )}
        </div>
      )}

      <style>{`
        .sync-status-icon-container {
          position: relative;
          display: inline-block;
        }

        .sync-status-icon {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
        }

        .sync-status-icon:hover {
          opacity: 0.8;
        }

        .sync-status-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          z-index: 1000;
          background: var(--surface, white);
          border: 1px solid var(--border-light, #e5e7eb);
          border-radius: var(--radius, 0.5rem);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          padding: 1rem;
          min-width: 200px;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .sync-status-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          color: var(--text, #1f2937);
        }

        .sync-status-detail {
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
          margin-bottom: 0.75rem;
        }

        .sync-force-button {
          width: 100%;
          padding: 0.5rem;
          background: var(--primary, #3b82f6);
          color: white;
          border: none;
          border-radius: var(--radius, 0.5rem);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .sync-force-button:hover {
          background: var(--primary-hover, #2563eb);
        }

        /* Dark mode support */
        .dark-mode .sync-status-dropdown {
          background: var(--surface, #1f2937);
          border-color: var(--border-light, #374151);
          color: var(--text, #f9fafb);
        }

        .dark-mode .sync-status-header {
          color: var(--text, #f9fafb);
        }

        .dark-mode .sync-status-detail {
          color: var(--text-secondary, #9ca3af);
        }
      `}</style>
    </div>
  );
};
