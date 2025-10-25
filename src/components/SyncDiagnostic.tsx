// src/components/SyncDiagnostic.tsx - Mobile-friendly sync diagnostic panel
import * as React from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOperationLog } from '../sync/operationLog';
import { logger } from '../utils/logger';
import './SyncDiagnostic.css';

type DiagnosticData = {
  // Local stats
  localOperations: number;
  localAddresses: number;
  localCompletions: number;
  lastSyncSequence: number;
  unsyncedOperations: number;
  operationBreakdown: Record<string, number>;

  // Cloud stats
  cloudOperations: number;
  cloudLatestSequence: number;

  // Comparison
  syncHealth: 'good' | 'warning' | 'error';
  issues: string[];
  recommendations: string[];
};

export function SyncDiagnostic({ userId, currentState }: {
  userId: string;
  currentState: { addresses: any[]; completions: any[] };
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<DiagnosticData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setError(null);

    try {
      const issues: string[] = [];

      // Get local operation log stats
      const deviceId = localStorage.getItem('navigator_device_id') || '';
      const opLog = getOperationLog(deviceId, userId);
      await opLog.load();

      const localOps = opLog.getAllOperations();
      const logState = opLog.getLogState();
      const unsyncedOps = opLog.getUnsyncedOperations();

      // Get operation type breakdown
      const operationBreakdown = localOps.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      logger.info('📊 DIAGNOSTIC: Local stats:', {
        totalOps: localOps.length,
        lastSyncSeq: logState.lastSyncSequence,
        unsynced: unsyncedOps.length,
        breakdown: operationBreakdown,
      });

      // Get cloud operation stats
      let cloudOps = 0;
      let cloudLatestSeq = 0;

      if (supabase) {
        const { data: cloudData, error: cloudError } = await supabase
          .from('navigator_operations')
          .select('sequence_number', { count: 'exact' })
          .eq('user_id', userId)
          .order('sequence_number', { ascending: false })
          .limit(1);

        if (cloudError) {
          issues.push(`Cloud fetch error: ${cloudError.message}`);
        } else {
          cloudOps = cloudData?.length || 0;
          cloudLatestSeq = cloudData?.[0]?.sequence_number || 0;

          // Get total count
          const { count } = await supabase
            .from('navigator_operations')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

          cloudOps = count || 0;
        }
      }

      // Analyze issues
      const recommendations: string[] = [];

      if (unsyncedOps.length > 0) {
        issues.push(`${unsyncedOps.length} operations not uploaded to cloud`);
        recommendations.push('Tap "Force Upload" to upload pending operations');
      }

      if (localOps.length > cloudOps) {
        issues.push(`Local has ${localOps.length - cloudOps} more operations than cloud`);
        if (unsyncedOps.length === 0) {
          // This is the CRITICAL case - sync tracker is broken!
          recommendations.push('⚠️ Sync tracker corrupted - use "Nuclear Reset" to fix');
        }
      }

      if (currentState.addresses.length === 0 && cloudOps > 0) {
        issues.push('No addresses in UI but operations exist in cloud');
        recommendations.push('⚠️ State reconstruction failing - check operation types');
      }

      if (currentState.addresses.length === 0 && localOps.length > 0) {
        // Check if we have ADDRESS_BULK_IMPORT operations
        const hasAddressOps = operationBreakdown['ADDRESS_BULK_IMPORT'] > 0 || operationBreakdown['ADDRESS_ADD'] > 0;
        if (!hasAddressOps) {
          issues.push('No address operations found in log');
          recommendations.push('Import addresses from Excel to create fresh operations');
        } else {
          issues.push('Address operations exist but not being applied');
          recommendations.push('⚠️ CRITICAL: State reducer may be broken - use "Nuclear Reset"');
        }
      }

      if (cloudOps === 0 && localOps.length > 0) {
        issues.push('Operations in local log but none uploaded to cloud');
        recommendations.push('Check internet connection and authentication');
      }

      // Determine health
      let syncHealth: 'good' | 'warning' | 'error' = 'good';
      if (issues.length > 0) {
        syncHealth = unsyncedOps.length > 5 || cloudOps === 0 || currentState.addresses.length === 0 ? 'error' : 'warning';
      }

      setData({
        localOperations: localOps.length,
        localAddresses: currentState.addresses.length,
        localCompletions: currentState.completions.length,
        lastSyncSequence: logState.lastSyncSequence,
        unsyncedOperations: unsyncedOps.length,
        operationBreakdown,
        cloudOperations: cloudOps,
        cloudLatestSequence: cloudLatestSeq,
        syncHealth,
        issues,
        recommendations,
      });

    } catch (err: any) {
      logger.error('Diagnostic error:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const forceUpload = async () => {
    if (!window.confirm('Force upload all operations to cloud? This will re-upload everything.')) {
      return;
    }

    setLoading(true);
    try {
      // Use the syncDebug utility if available
      if ((window as any).syncDebug?.repairSync) {
        await (window as any).syncDebug.repairSync();
        alert('✅ Upload complete! Refresh the page.');
      } else {
        throw new Error('Repair utility not available');
      }
    } catch (err: any) {
      alert('❌ Upload failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating diagnostic button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && !data) {
            runDiagnostic();
          }
        }}
        className="sync-diagnostic-fab"
        title="Sync Diagnostic"
      >
        🔍
      </button>

      {/* Diagnostic panel */}
      {isOpen && (
        <div className="sync-diagnostic-panel">
          <div className="sync-diagnostic-header">
            <h3>🔍 Sync Diagnostic</h3>
            <button onClick={() => setIsOpen(false)} className="close-btn">✕</button>
          </div>

          <div className="sync-diagnostic-body">
            {loading && <div className="loading">Running diagnostic...</div>}

            {error && <div className="error">❌ {error}</div>}

            {data && (
              <>
                {/* Health Status */}
                <div className={`health-badge ${data.syncHealth}`}>
                  {data.syncHealth === 'good' && '✅ Sync Healthy'}
                  {data.syncHealth === 'warning' && '⚠️ Sync Warning'}
                  {data.syncHealth === 'error' && '❌ Sync Error'}
                </div>

                {/* Stats Grid */}
                <div className="stats-grid">
                  <div className="stat-box">
                    <div className="stat-label">Local Operations</div>
                    <div className="stat-value">{data.localOperations}</div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">Cloud Operations</div>
                    <div className="stat-value">{data.cloudOperations}</div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">UI Addresses</div>
                    <div className="stat-value">{data.localAddresses}</div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">Unsynced Ops</div>
                    <div className="stat-value">{data.unsyncedOperations}</div>
                  </div>
                </div>

                {/* Issues */}
                {data.issues.length > 0 && (
                  <div className="issues-section">
                    <h4>⚠️ Issues Found:</h4>
                    <ul>
                      {data.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="actions">
                  <button onClick={runDiagnostic} disabled={loading}>
                    🔄 Refresh
                  </button>

                  {data.unsyncedOperations > 0 && (
                    <button onClick={forceUpload} disabled={loading} className="danger">
                      📤 Force Upload
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
