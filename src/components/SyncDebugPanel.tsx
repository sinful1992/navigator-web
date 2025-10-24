// src/components/SyncDebugPanel.tsx - Debug panel for sync system
import * as React from 'react';
import { getOperationLog, getOperationLogStats } from '../sync/operationLog';
import type { Operation } from '../sync/operations';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabaseClient';

type Props = {
  visible?: boolean;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
};

export function SyncDebugPanel({
  visible = false,
  position = 'bottom-right'
}: Props) {
  const appState = useAppStateV2();
  const [operations, setOperations] = React.useState<Operation[]>([]);
  const [expandedSection, setExpandedSection] = React.useState<string | null>(null);

  // Load operations for debugging
  React.useEffect(() => {
    if (visible && appState.deviceId) {
      const log = getOperationLog(appState.deviceId);
      log.load().then(() => {
        setOperations(log.getAllOperations());
      });
    }
  }, [visible, appState.deviceId]);

  // Auto-refresh operations
  React.useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      if (appState.deviceId) {
        const log = getOperationLog(appState.deviceId);
        setOperations(log.getAllOperations());
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [visible, appState.deviceId]);

  if (!visible) return null;

  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: '1rem', right: '1rem' },
    'bottom-left': { bottom: '1rem', left: '1rem' },
    'top-right': { top: '1rem', right: '1rem' },
    'top-left': { top: '1rem', left: '1rem' },
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    ...positionStyles[position],
    width: '320px',
    maxHeight: '400px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    fontSize: '12px',
    fontFamily: 'monospace',
    zIndex: 9999,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #ddd',
    fontWeight: 'bold',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const contentStyle: React.CSSProperties = {
    padding: '12px',
    overflowY: 'auto',
    flex: 1,
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '12px',
    borderBottom: '1px solid #eee',
    paddingBottom: '8px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 8px',
    margin: '2px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    fontSize: '11px',
  };

  const getStatusIcon = () => {
    if (appState.isSyncing) return '⏳';
    if (!appState.isOnline) return '📴';
    if (appState.error) return '❌';
    return '✅';
  };

  const truncateJson = (obj: any, maxLength = 100) => {
    const str = JSON.stringify(obj);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Sync Debug</span>
        <span>{getStatusIcon()}</span>
      </div>

      <div style={contentStyle}>
        {/* Sync Status */}
        <div style={sectionStyle}>
          <div><strong>Status</strong></div>
          <div>Mode: {appState.currentSyncMode}</div>
          <div>Online: {appState.isOnline ? '✅' : '❌'}</div>
          <div>Syncing: {appState.isSyncing ? '⏳' : '✅'}</div>
          <div>Device: {appState.deviceId.slice(-8)}</div>
          {appState.lastSyncTime && (
            <div>Last Sync: {appState.lastSyncTime.toLocaleTimeString()}</div>
          )}
          {appState.error && (
            <div style={{ color: 'red', wordBreak: 'break-word' }}>
              Error: {appState.error}
            </div>
          )}
        </div>

        {/* State Summary */}
        <div style={sectionStyle}>
          <div
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleSection('state')}
          >
            <strong>State {expandedSection === 'state' ? '▼' : '▶'}</strong>
          </div>
          <div>Addresses: {appState.state.addresses.length}</div>
          <div>Completions: {appState.state.completions.length}</div>
          <div>Arrangements: {appState.state.arrangements.length}</div>
          <div>Sessions: {appState.state.daySessions.length}</div>
          <div>Active: {appState.state.activeIndex ?? 'none'}</div>

          {expandedSection === 'state' && (
            <pre style={{
              fontSize: '10px',
              overflow: 'auto',
              maxHeight: '100px',
              backgroundColor: '#f8f9fa',
              padding: '4px',
              margin: '4px 0',
            }}>
              {JSON.stringify(appState.state, null, 2)}
            </pre>
          )}
        </div>

        {/* Operations Log */}
        <div style={sectionStyle}>
          <div
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleSection('operations')}
          >
            <strong>Operations ({operations.length}) {expandedSection === 'operations' ? '▼' : '▶'}</strong>
          </div>

          {expandedSection === 'operations' && (
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {operations.slice(-10).reverse().map((op, i) => (
                <div
                  key={op.id}
                  style={{
                    padding: '4px',
                    margin: '2px 0',
                    backgroundColor: i % 2 ? '#f8f9fa' : 'white',
                    borderRadius: '4px',
                    fontSize: '10px',
                  }}
                >
                  <div><strong>{op.type}</strong> #{op.sequence}</div>
                  <div>{new Date(op.timestamp).toLocaleTimeString()}</div>
                  <div style={{ color: '#666' }}>
                    {truncateJson(op.payload, 80)}
                  </div>
                </div>
              ))}
              {operations.length === 0 && (
                <div style={{ color: '#666', fontStyle: 'italic' }}>
                  No operations yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={sectionStyle}>
          <div><strong>Actions</strong></div>
          <button
            style={buttonStyle}
            onClick={() => appState.forceSync?.()}
            disabled={!appState.isOnline}
          >
            Force Sync
          </button>
          <button
            style={buttonStyle}
            onClick={() => appState.clearError?.()}
          >
            Clear Error
          </button>
          <button
            style={buttonStyle}
            onClick={() => logger.info('AppState:', appState)}
          >
            Log to Console
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to easily add debug panel with keyboard shortcut
 */
export function useSyncDebug() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+Shift+D to toggle debug panel
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return {
    visible,
    setVisible,
    DebugPanel: SyncDebugPanel,
  };
}

export default SyncDebugPanel;