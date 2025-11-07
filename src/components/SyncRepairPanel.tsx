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

  const getStatusIcon = () => {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div className="sync-repair-panel">
      {/* Header */}
      <div className="sync-panel-header">
        <h3 className="sync-panel-title">
          Sync Status
        </h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="sync-details-toggle"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
      </div>

      {/* Status Card */}
      <div className={`sync-status-card status-${status}`}>
        <div className="sync-status-content">
          <span className="sync-status-icon">{getStatusIcon()}</span>
          <div className="sync-status-text">
            <div className="sync-status-label">
              {status === 'loading' ? 'Checking...' : status.toUpperCase()}
            </div>
            <div className="sync-status-message">
              {message}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        {diagnostics && (
          <div className="sync-stats-grid">
            <div className="sync-stat-item">
              <div className="sync-stat-label">
                Retry Queue
              </div>
              <div className={`sync-stat-value ${diagnostics.retryQueueCount > 0 ? 'warning' : 'success'}`}>
                {diagnostics.retryQueueCount}
              </div>
            </div>
            <div className="sync-stat-item">
              <div className="sync-stat-label">
                Collisions
              </div>
              <div className={`sync-stat-value ${diagnostics.sequenceCollisions.length > 0 ? 'danger' : 'success'}`}>
                {diagnostics.sequenceCollisions.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Diagnostics */}
      {showDetails && diagnostics && (
        <div className="sync-diagnostics-details">
          <div className="sync-diagnostics-title">
            Diagnostic Details
          </div>

          <div className="sync-diagnostics-rows">
            <DetailRow label="Local Sequence" value={diagnostics.localMaxSequence} />
            <DetailRow label="Cloud Sequence" value={diagnostics.cloudMaxSequence} />
            <DetailRow label="Last Synced" value={diagnostics.localLastSynced} />
            <DetailRow label="Gap" value={diagnostics.gap} warning={diagnostics.gap > 100} />
            <DetailRow label="Unsynced" value={diagnostics.unsyncedCount} warning={diagnostics.unsyncedCount > 0} />
            <DetailRow label="Dead Letter" value={diagnostics.deadLetterCount} danger={diagnostics.deadLetterCount > 0} />
          </div>

          {diagnostics.recommendation && (
            <div className="sync-recommendation">
              <strong>Recommendation:</strong> {diagnostics.recommendation}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {diagnostics && (diagnostics.sequenceCollisions.length > 0 || diagnostics.retryQueueCount > 0 || diagnostics.deadLetterCount > 0) && (
        <div className="sync-actions">
          {diagnostics.sequenceCollisions.length > 0 && (
            <button
              onClick={handleRepair}
              disabled={isRepairing}
              className="sync-action-button primary"
            >
              {isRepairing ? '⏳ Repairing...' : '🔧 Repair Sequence Collisions'}
            </button>
          )}

          {(diagnostics.retryQueueCount > 0 || diagnostics.deadLetterCount > 0) && (
            <button
              onClick={handleClearFailed}
              disabled={isRepairing}
              className="sync-action-button danger"
            >
              {isRepairing ? '⏳ Clearing...' : '🗑️ Clear Failed Operations'}
            </button>
          )}
        </div>
      )}

      {/* Healthy State Message */}
      {status === 'healthy' && diagnostics && diagnostics.sequenceCollisions.length === 0 && (
        <div className="sync-healthy-message">
          ✨ Everything is syncing perfectly!
        </div>
      )}
    </div>
  );
};

// Helper component for detail rows
const DetailRow: React.FC<{
  label: string;
  value: number;
  warning?: boolean;
  danger?: boolean;
}> = ({ label, value, warning, danger }) => (
  <div className="sync-detail-row">
    <span className="sync-detail-label">{label}</span>
    <span className={`sync-detail-value ${danger ? 'danger' : warning ? 'warning' : ''}`}>
      {value.toLocaleString()}
    </span>
  </div>
);

// Inject styles into document head
if (typeof document !== 'undefined') {
  const styleId = 'sync-repair-panel-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Sync Repair Panel Styles */
      .sync-repair-panel {
        background: white;
        border-radius: 14px;
        padding: 1.25rem;
        margin-bottom: 1rem;
        border: 1.5px solid rgba(99, 102, 241, 0.08);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sync-repair-panel:hover {
        border-color: rgba(99, 102, 241, 0.15);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.06);
      }

      /* Header */
      .sync-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .sync-panel-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #111827;
        letter-spacing: -0.01em;
      }

      .sync-details-toggle {
        background: transparent;
        border: none;
        color: #6366f1;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .sync-details-toggle:hover {
        background: rgba(99, 102, 241, 0.1);
      }

      /* Status Card */
      .sync-status-card {
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 0;
        transition: all 0.3s;
      }

      .sync-status-card.status-healthy {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%);
        border: 2px solid rgba(16, 185, 129, 0.25);
      }

      .sync-status-card.status-warning {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.04) 100%);
        border: 2px solid rgba(245, 158, 11, 0.25);
      }

      .sync-status-card.status-error {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%);
        border: 2px solid rgba(239, 68, 68, 0.25);
      }

      .sync-status-card.status-loading {
        background: linear-gradient(135deg, rgba(107, 114, 128, 0.08) 0%, rgba(107, 114, 128, 0.04) 100%);
        border: 2px solid rgba(107, 114, 128, 0.25);
      }

      .sync-status-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }

      .sync-status-icon {
        font-size: 1.5rem;
        line-height: 1;
      }

      .sync-status-text {
        flex: 1;
      }

      .sync-status-label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #111827;
        margin-bottom: 0.25rem;
      }

      .sync-status-message {
        font-size: 0.8125rem;
        color: #6b7280;
        line-height: 1.4;
      }

      /* Quick Stats Grid */
      .sync-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid rgba(0, 0, 0, 0.06);
      }

      .sync-stat-item {
        text-align: center;
      }

      .sync-stat-label {
        font-size: 0.6875rem;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .sync-stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        line-height: 1;
      }

      .sync-stat-value.success {
        color: #10b981;
      }

      .sync-stat-value.warning {
        color: #f59e0b;
      }

      .sync-stat-value.danger {
        color: #ef4444;
      }

      /* Diagnostics Details */
      .sync-diagnostics-details {
        background: rgba(99, 102, 241, 0.03);
        border-radius: 10px;
        padding: 1rem;
        margin-top: 1rem;
        border: 1px solid rgba(99, 102, 241, 0.08);
      }

      .sync-diagnostics-title {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6366f1;
        margin-bottom: 0.75rem;
      }

      .sync-diagnostics-rows {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }

      .sync-detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: white;
        border-radius: 6px;
      }

      .sync-detail-label {
        font-size: 0.8125rem;
        color: #6b7280;
        font-weight: 500;
      }

      .sync-detail-value {
        font-size: 0.875rem;
        font-weight: 600;
        color: #111827;
        font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
      }

      .sync-detail-value.warning {
        color: #f59e0b;
      }

      .sync-detail-value.danger {
        color: #ef4444;
      }

      /* Recommendation */
      .sync-recommendation {
        margin-top: 0.75rem;
        padding: 0.75rem;
        background: white;
        border-radius: 8px;
        font-size: 0.8125rem;
        color: #374151;
        line-height: 1.5;
        border: 1px solid rgba(99, 102, 241, 0.12);
      }

      .sync-recommendation strong {
        color: #6366f1;
      }

      /* Action Buttons */
      .sync-actions {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        margin-top: 1rem;
      }

      .sync-action-button {
        width: 100%;
        padding: 0.875rem 1rem;
        font-size: 0.9375rem;
        font-weight: 600;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }

      .sync-action-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .sync-action-button.primary {
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
      }

      .sync-action-button.primary:hover:not(:disabled) {
        box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
        transform: translateY(-1px);
      }

      .sync-action-button.danger {
        background: white;
        color: #ef4444;
        border: 2px solid #ef4444;
      }

      .sync-action-button.danger:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.08);
        border-color: #dc2626;
      }

      /* Healthy Message */
      .sync-healthy-message {
        text-align: center;
        padding: 1rem;
        color: #10b981;
        font-size: 0.875rem;
        font-weight: 500;
        background: rgba(16, 185, 129, 0.05);
        border-radius: 8px;
        margin-top: 1rem;
      }

      /* Dark Mode Support */
      .dark-mode .sync-repair-panel {
        background: rgba(17, 24, 39, 0.8);
        border-color: rgba(139, 92, 246, 0.15);
      }

      .dark-mode .sync-repair-panel:hover {
        border-color: rgba(139, 92, 246, 0.25);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
      }

      .dark-mode .sync-panel-title,
      .dark-mode .sync-status-label,
      .dark-mode .sync-detail-value {
        color: #f9fafb;
      }

      .dark-mode .sync-status-message,
      .dark-mode .sync-detail-label {
        color: #9ca3af;
      }

      .dark-mode .sync-status-card.status-healthy {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%);
        border-color: rgba(16, 185, 129, 0.3);
      }

      .dark-mode .sync-status-card.status-warning {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
        border-color: rgba(245, 158, 11, 0.3);
      }

      .dark-mode .sync-status-card.status-error {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.08) 100%);
        border-color: rgba(239, 68, 68, 0.3);
      }

      .dark-mode .sync-status-card.status-loading {
        background: linear-gradient(135deg, rgba(107, 114, 128, 0.12) 0%, rgba(107, 114, 128, 0.08) 100%);
        border-color: rgba(107, 114, 128, 0.3);
      }

      .dark-mode .sync-stats-grid {
        border-top-color: rgba(255, 255, 255, 0.08);
      }

      .dark-mode .sync-diagnostics-details {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99, 102, 241, 0.15);
      }

      .dark-mode .sync-detail-row {
        background: rgba(17, 24, 39, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .dark-mode .sync-recommendation {
        background: rgba(17, 24, 39, 0.8);
        border-color: rgba(99, 102, 241, 0.2);
        color: #e5e7eb;
      }

      .dark-mode .sync-action-button.danger {
        background: rgba(17, 24, 39, 0.8);
        border-color: #ef4444;
        color: #ef4444;
      }

      .dark-mode .sync-action-button.danger:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.15);
        border-color: #dc2626;
      }

      .dark-mode .sync-healthy-message {
        background: rgba(16, 185, 129, 0.12);
      }

      /* Mobile Responsive */
      @media (max-width: 768px) {
        .sync-repair-panel {
          padding: 1rem;
          border-radius: 12px;
        }

        .sync-panel-title {
          font-size: 0.9375rem;
        }

        .sync-status-icon {
          font-size: 1.375rem;
        }

        .sync-status-label {
          font-size: 0.8125rem;
        }

        .sync-status-message {
          font-size: 0.75rem;
        }

        .sync-stat-value {
          font-size: 1.25rem;
        }

        .sync-stat-label {
          font-size: 0.625rem;
        }

        .sync-action-button {
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
        }

        .sync-stats-grid {
          gap: 0.5rem;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
