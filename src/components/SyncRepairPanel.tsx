// src/components/SyncRepairPanel.tsx
// Mobile-friendly sync repair interface for Settings tab

import React, { useState, useEffect } from 'react';
import { diagnoseSyncIssues, repairSequenceCollisions, clearAllFailedOperations, getSyncStatus } from '../utils/syncDiagnostics';
import type { SyncDiagnostics } from '../utils/syncDiagnostics';
import { logger } from '../utils/logger';

interface SyncRepairPanelProps {
  userId: string;
  deviceId: string;
}

export const SyncRepairPanel: React.FC<SyncRepairPanelProps> = ({ userId, deviceId }) => {
  const [status, setStatus] = useState<'loading' | 'healthy' | 'warning' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Checking sync status...');
  const [diagnostics, setDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Load status on mount and every 10 seconds
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, [userId, deviceId]);

  const loadStatus = async () => {
    try {
      const result = await getSyncStatus(userId, deviceId);
      setStatus(result.status);
      setMessage(result.message);
      setDiagnostics(result.details);
    } catch (err) {
      logger.error('Failed to load sync status:', err);
      setStatus('error');
      setMessage('Failed to check sync status');
    }
  };

  const handleRepair = async () => {
    if (!window.confirm('This will fix sequence collisions by reassigning new sequence numbers. Continue?')) {
      return;
    }

    setIsRepairing(true);
    try {
      const result = await repairSequenceCollisions(userId, deviceId);

      if (result.success) {
        alert(`✅ Repair complete!\n\n${result.reassignedCount} operations fixed.\n\nWait 10 seconds for sync to complete.`);
        await loadStatus();
      } else {
        alert(`❌ Repair failed:\n\n${result.errors.join('\n')}`);
      }
    } catch (err) {
      logger.error('Repair failed:', err);
      alert('❌ Repair failed: ' + String(err));
    } finally {
      setIsRepairing(false);
    }
  };

  const handleClearFailed = async () => {
    if (!window.confirm('⚠️ This will permanently delete all failed operations. They cannot be recovered. Continue?')) {
      return;
    }

    setIsRepairing(true);
    try {
      await clearAllFailedOperations();
      alert('✅ All failed operations cleared.');
      await loadStatus();
    } catch (err) {
      logger.error('Clear failed:', err);
      alert('❌ Failed to clear: ' + String(err));
    } finally {
      setIsRepairing(false);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.25rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#111827',
        }}>
          Sync Status
        </h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6366f1',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
          }}
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
      </div>

      {/* Status Card */}
      <div style={{
        background: `linear-gradient(135deg, ${getStatusColor()}15 0%, ${getStatusColor()}08 100%)`,
        border: `2px solid ${getStatusColor()}40`,
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: showDetails ? '1rem' : '0',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.5rem',
        }}>
          <span style={{ fontSize: '1.5rem' }}>{getStatusIcon()}</span>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '0.25rem',
            }}>
              {status === 'loading' ? 'Checking...' : status.toUpperCase()}
            </div>
            <div style={{
              fontSize: '0.8125rem',
              color: '#6b7280',
            }}>
              {message}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        {diagnostics && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
          }}>
            <div>
              <div style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Retry Queue
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: diagnostics.retryQueueCount > 0 ? '#f59e0b' : '#10b981' }}>
                {diagnostics.retryQueueCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Collisions
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: diagnostics.sequenceCollisions.length > 0 ? '#ef4444' : '#10b981' }}>
                {diagnostics.sequenceCollisions.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Diagnostics */}
      {showDetails && diagnostics && (
        <div style={{
          background: '#f9fafb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#6b7280',
            marginBottom: '0.75rem',
          }}>
            Diagnostic Details
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <DetailRow label="Local Sequence" value={diagnostics.localMaxSequence} />
            <DetailRow label="Cloud Sequence" value={diagnostics.cloudMaxSequence} />
            <DetailRow label="Last Synced" value={diagnostics.localLastSynced} />
            <DetailRow label="Gap" value={diagnostics.gap} color={diagnostics.gap > 100 ? '#f59e0b' : undefined} />
            <DetailRow label="Unsynced" value={diagnostics.unsyncedCount} color={diagnostics.unsyncedCount > 0 ? '#f59e0b' : undefined} />
            <DetailRow label="Dead Letter" value={diagnostics.deadLetterCount} color={diagnostics.deadLetterCount > 0 ? '#ef4444' : undefined} />
          </div>

          {diagnostics.recommendation && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: 'white',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              color: '#374151',
              lineHeight: '1.5',
            }}>
              <strong>Recommendation:</strong> {diagnostics.recommendation}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {diagnostics && (diagnostics.sequenceCollisions.length > 0 || diagnostics.retryQueueCount > 0 || diagnostics.deadLetterCount > 0) && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {diagnostics.sequenceCollisions.length > 0 && (
            <button
              onClick={handleRepair}
              disabled={isRepairing}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.875rem 1rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: isRepairing ? 'not-allowed' : 'pointer',
                opacity: isRepairing ? 0.6 : 1,
                boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)',
              }}
            >
              {isRepairing ? '⏳ Repairing...' : '🔧 Repair Sequence Collisions'}
            </button>
          )}

          {(diagnostics.retryQueueCount > 0 || diagnostics.deadLetterCount > 0) && (
            <button
              onClick={handleClearFailed}
              disabled={isRepairing}
              style={{
                background: 'white',
                color: '#ef4444',
                border: '2px solid #ef4444',
                borderRadius: '8px',
                padding: '0.875rem 1rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: isRepairing ? 'not-allowed' : 'pointer',
                opacity: isRepairing ? 0.6 : 1,
              }}
            >
              {isRepairing ? '⏳ Clearing...' : '🗑️ Clear Failed Operations'}
            </button>
          )}
        </div>
      )}

      {/* Healthy State Message */}
      {status === 'healthy' && diagnostics && diagnostics.sequenceCollisions.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '1rem',
          color: '#10b981',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          ✨ Everything is syncing perfectly!
        </div>
      )}
    </div>
  );
};

// Helper component for detail rows
const DetailRow: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }}>
    <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{label}</span>
    <span style={{
      fontSize: '0.875rem',
      fontWeight: 600,
      color: color || '#111827',
      fontFamily: 'monospace',
    }}>
      {value.toLocaleString()}
    </span>
  </div>
);
