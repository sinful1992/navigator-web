// src/components/SyncStatusPanel.tsx
// PHASE 1: Retry Queue UI Component
// Displays sync status, retry queue, and failed operations

import React, { useState, useEffect } from 'react';
import { retryQueueManager } from '../sync/retryQueue';
import type { RetryQueueItem } from '../sync/retryQueue';
import { logger } from '../utils/logger';

interface SyncStatusPanelProps {
  onForceRetry?: () => Promise<void>;
  isSyncing?: boolean;
}

export const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({
  onForceRetry,
  isSyncing = false,
}) => {
  const [queueItems, setQueueItems] = useState<RetryQueueItem[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    ready: 0,
    waiting: 0,
    oldestRetry: null as string | null,
  });
  const [deadLetterItems, setDeadLetterItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Load retry queue data
  const loadData = async () => {
    try {
      setLoading(true);
      const [items, queueStats, deadLetter] = await Promise.all([
        retryQueueManager.getAllQueueItems(),
        retryQueueManager.getQueueStats(),
        retryQueueManager.getDeadLetterItems(),
      ]);
      setQueueItems(items);
      setStats(queueStats);
      setDeadLetterItems(deadLetter);
    } catch (error) {
      logger.error('Failed to load retry queue data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and every 5 seconds
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle manual retry
  const handleManualRetry = async () => {
    if (onForceRetry) {
      await onForceRetry();
      await loadData(); // Reload data after retry
    }
  };

  // Handle clear queue
  const handleClearQueue = async () => {
    if (window.confirm('Are you sure you want to clear the entire retry queue? Failed operations will be lost.')) {
      await retryQueueManager.clearQueue();
      await loadData();
      logger.info('🗑️ RETRY QUEUE: Manually cleared by user');
    }
  };

  // Format time until next retry
  const formatTimeUntil = (isoTime: string): string => {
    const now = new Date();
    const target = new Date(isoTime);
    const diffMs = target.getTime() - now.getTime();

    if (diffMs <= 0) return 'Ready now';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Format operation type for display
  const formatOperationType = (type: string): string => {
    return type.replace(/_/g, ' ').toLowerCase();
  };

  // Get status color
  const getStatusColor = () => {
    if (stats.total === 0) return '#10b981'; // Green - all synced
    if (stats.ready > 0) return '#f59e0b'; // Orange - ready to retry
    return '#6366f1'; // Purple - waiting
  };

  return (
    <div className="modern-subsection">
      <div className="modern-subsection-title">Sync Status</div>

      {/* Summary Card */}
      <div
        className="modern-storage-card"
        style={{ borderColor: getStatusColor(), cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="modern-storage-header">
          <div className="modern-storage-label">
            {isSyncing ? '⏳ Syncing...' : stats.total === 0 ? '✅ All Synced' : `⚠️ ${stats.total} Failed Operations`}
          </div>
          <button
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#6b7280',
              transition: 'transform 0.3s',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            ▶
          </button>
        </div>

        {stats.total > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '0.375rem'
            }}>
              <span>{stats.ready} ready to retry</span>
              <span>{stats.waiting} waiting</span>
            </div>

            {stats.oldestRetry && (
              <div style={{
                fontSize: '0.8125rem',
                color: '#9ca3af',
                marginTop: '0.5rem'
              }}>
                Next retry in: {formatTimeUntil(stats.oldestRetry)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ marginTop: '1rem' }}>
          {/* Action Buttons */}
          {stats.total > 0 && (
            <div className="modern-button-group" style={{ marginBottom: '1rem' }}>
              <button
                className="modern-action-button primary small"
                onClick={handleManualRetry}
                disabled={isSyncing || stats.ready === 0}
              >
                <span className="modern-button-icon">🔄</span>
                <span className="modern-button-text">
                  Retry Now {stats.ready > 0 && `(${stats.ready})`}
                </span>
              </button>

              <button
                className="modern-action-button danger small"
                onClick={handleClearQueue}
                disabled={isSyncing}
              >
                <span className="modern-button-icon">🗑️</span>
                <span className="modern-button-text">Clear Queue</span>
              </button>
            </div>
          )}

          {/* Failed Operations List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9ca3af' }}>
              Loading...
            </div>
          ) : queueItems.length === 0 && deadLetterItems.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '1.5rem',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.05)',
              borderRadius: '10px',
              border: '1.5px solid rgba(16, 185, 129, 0.2)'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
              <div style={{ fontWeight: 600 }}>All operations synced</div>
              <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem', opacity: 0.8 }}>
                No failed operations in queue
              </div>
            </div>
          ) : (
            <>
              {/* Active Retry Queue */}
              {queueItems.length > 0 && (
                <>
                  <div className="modern-subsection-title" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                    Retry Queue ({queueItems.length})
                  </div>

                  {queueItems.map((item, idx) => {
                    const isReady = new Date(item.nextRetry) <= new Date();
                    return (
                      <div
                        key={idx}
                        style={{
                          background: isReady ? 'rgba(245, 158, 11, 0.05)' : 'rgba(99, 102, 241, 0.05)',
                          border: `1.5px solid ${isReady ? 'rgba(245, 158, 11, 0.2)' : 'rgba(99, 102, 241, 0.15)'}`,
                          borderRadius: '10px',
                          padding: '0.875rem',
                          marginBottom: '0.625rem',
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '0.5rem'
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              color: '#111827',
                              marginBottom: '0.25rem'
                            }}>
                              {formatOperationType(item.operation.type)}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              fontFamily: 'monospace'
                            }}>
                              Seq: {item.operation.sequence}
                            </div>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <div style={{
                              background: isReady ? '#fbbf24' : '#6366f1',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              {isReady ? 'READY' : 'WAITING'}
                            </div>

                            <div style={{
                              background: '#ef4444',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              Attempt {item.attempts + 1}/10
                            </div>
                          </div>
                        </div>

                        <div style={{
                          fontSize: '0.8125rem',
                          color: '#dc2626',
                          background: 'rgba(220, 38, 38, 0.08)',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          marginBottom: '0.5rem',
                          fontFamily: 'monospace'
                        }}>
                          {item.error.slice(0, 100)}{item.error.length > 100 && '...'}
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: '#9ca3af'
                        }}>
                          <span>Last attempt: {new Date(item.lastAttempt).toLocaleString()}</span>
                          <span>
                            {isReady ? 'Ready now' : `Retry in: ${formatTimeUntil(item.nextRetry)}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Dead Letter Queue */}
              {deadLetterItems.length > 0 && (
                <>
                  <div className="modern-danger-zone" style={{ marginTop: '1rem' }}>
                    <div className="modern-danger-zone-header">
                      <div className="modern-danger-icon">☠️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem' }}>
                          Dead Letter Queue ({deadLetterItems.length})
                        </div>
                        <div className="modern-danger-desc">
                          These operations have exceeded maximum retry attempts and will not be retried automatically.
                        </div>
                      </div>
                    </div>

                    {deadLetterItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(220, 38, 38, 0.08)',
                          border: '1.5px solid rgba(220, 38, 38, 0.25)',
                          borderRadius: '10px',
                          padding: '0.875rem',
                          marginTop: idx > 0 ? '0.625rem' : 0,
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: '#dc2626',
                          marginBottom: '0.5rem'
                        }}>
                          <span>{formatOperationType(item.operation.type)}</span>
                          <span>Seq: {item.operation.sequence}</span>
                        </div>

                        <div style={{
                          fontSize: '0.8125rem',
                          color: '#dc2626',
                          fontFamily: 'monospace',
                          marginBottom: '0.5rem'
                        }}>
                          {item.error}
                        </div>

                        <div style={{
                          fontSize: '0.75rem',
                          color: '#9ca3af'
                        }}>
                          Failed after {item.attempts} attempts · {new Date(item.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
