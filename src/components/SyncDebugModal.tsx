// src/components/SyncDebugModal.tsx - Mobile-friendly sync diagnostics
import * as React from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOperationLog, getOperationLogStats, repairCorruptedSequences } from '../sync/operationLog';

type SyncStats = {
  totalOperations: number;
  byType: Record<string, number>;
  duplicateCompletions: number;
  sequenceRange: { min: number; max: number };
  lastSyncSequence: number;
  isCorrupted: boolean;
};

export function SyncDebugModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = React.useState<SyncStats | null>(null);
  const [cloudCount, setCloudCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [deviceId, setDeviceId] = React.useState('');
  const [userId, setUserId] = React.useState('');

  const loadDiagnostics = React.useCallback(async () => {
    setLoading(true);
    try {
      const storedDeviceId = localStorage.getItem('navigator_device_id') || '';
      const user = await supabase?.auth.getUser();
      const currentUserId = user?.data?.user?.id || '';

      setDeviceId(storedDeviceId);
      setUserId(currentUserId);

      if (!storedDeviceId || !currentUserId) {
        return;
      }

      // Get local stats
      const manager = getOperationLog(storedDeviceId, currentUserId);
      await manager.load();
      const localStats = getOperationLogStats(manager);
      setStats(localStats);

      // Get cloud count
      if (supabase) {
        const { count } = await supabase
          .from('navigator_operations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUserId);
        setCloudCount(count);
      }
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLocal = React.useCallback(async () => {
    if (!confirm('⚠️ Clear local log and refresh? This will re-sync from cloud.')) {
      return;
    }

    try {
      const storedDeviceId = localStorage.getItem('navigator_device_id');
      const user = await supabase?.auth.getUser();
      const currentUserId = user?.data?.user?.id;

      if (!storedDeviceId || !currentUserId) return;

      const manager = getOperationLog(storedDeviceId, currentUserId);
      await manager.clear();

      alert('✅ Cleared. Refreshing...');
      window.location.reload();
    } catch (err) {
      alert('❌ Error: ' + String(err));
    }
  }, []);

  const repairAndSync = React.useCallback(async () => {
    if (!confirm('🔧 This will repair corrupted sequence numbers and force sync unsynced operations. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      const storedDeviceId = localStorage.getItem('navigator_device_id');
      const user = await supabase?.auth.getUser();
      const currentUserId = user?.data?.user?.id;

      if (!storedDeviceId || !currentUserId || !supabase) {
        alert('❌ Not authenticated');
        return;
      }

      // Get actual max sequence from cloud
      const { data, error } = await supabase
        .from('navigator_operations')
        .select('sequence_number')
        .eq('user_id', currentUserId)
        .order('sequence_number', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      const cloudMaxSequence = data && data.length > 0 ? data[0].sequence_number : 0;

      // Repair the corruption
      const manager = getOperationLog(storedDeviceId, currentUserId);
      await manager.load();
      const unsyncedCount = await repairCorruptedSequences(manager, cloudMaxSequence);

      alert(`✅ Repaired!\n\n${unsyncedCount} operations need to be synced.\n\nRefreshing to apply changes...`);
      window.location.reload();
    } catch (err) {
      alert('❌ Error: ' + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const unsyncedCount = stats ? stats.totalOperations - stats.lastSyncSequence : 0;
  const isInSync = cloudCount !== null && stats && cloudCount >= stats.totalOperations;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 1
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🛠️ Sync Diagnostics</h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div>Loading diagnostics...</div>
            </div>
          ) : (
            <>
              {/* Sync Status */}
              <Section title="📊 Sync Status">
                <Row label="Status">
                  {isInSync ? (
                    <span style={{ color: '#4caf50' }}>✅ In Sync</span>
                  ) : (
                    <span style={{ color: '#ff9800' }}>⚠️ Out of Sync</span>
                  )}
                </Row>
                <Row label="Unsynced Ops">
                  <span style={{ color: unsyncedCount > 0 ? '#ff9800' : '#4caf50' }}>
                    {unsyncedCount} {unsyncedCount > 0 ? '⚠️' : '✅'}
                  </span>
                </Row>
                {stats?.isCorrupted && (
                  <Row label="Corruption">
                    <span style={{ color: '#f44336', fontWeight: 'bold' }}>
                      🚨 DETECTED
                    </span>
                  </Row>
                )}
              </Section>

              {/* Corruption Warning */}
              {stats?.isCorrupted && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  backgroundColor: '#ffebee',
                  border: '2px solid #f44336',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#c62828' }}>
                    🚨 SEQUENCE NUMBER CORRUPTION DETECTED
                  </div>
                  <div>
                    Your sync sequence numbers are corrupted. This prevents operations from syncing to the cloud.
                    Use <strong>"Repair & Sync"</strong> button below to fix this.
                  </div>
                </div>
              )}

              {/* Local Storage */}
              {stats && (
                <Section title="💾 Local Storage">
                  <Row label="Total Operations">{stats.totalOperations}</Row>
                  <Row label="Sequence Range">{stats.sequenceRange.min} - {stats.sequenceRange.max}</Row>
                  <Row label="Last Synced">{stats.lastSyncSequence}</Row>
                  <Row label="Duplicate Completions">
                    <span style={{ color: stats.duplicateCompletions > 0 ? '#ff9800' : 'inherit' }}>
                      {stats.duplicateCompletions} {stats.duplicateCompletions > 0 ? '⚠️' : ''}
                    </span>
                  </Row>
                </Section>
              )}

              {/* Cloud Storage */}
              <Section title="☁️ Cloud Storage">
                <Row label="Total Operations">
                  {cloudCount !== null ? cloudCount : 'Loading...'}
                </Row>
              </Section>

              {/* Operations by Type */}
              {stats && Object.keys(stats.byType).length > 0 && (
                <Section title="📋 Operations by Type">
                  {Object.entries(stats.byType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <Row key={type} label={type} mono>{count}</Row>
                    ))}
                </Section>
              )}

              {/* Device Info */}
              <Section title="📱 Device Info">
                <Row label="Device ID" mono>{deviceId.slice(0, 30)}...</Row>
                <Row label="User ID" mono>{userId.slice(0, 30)}...</Row>
              </Section>

              {/* Actions */}
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={loadDiagnostics}
                  style={{
                    padding: '0.75rem 1rem',
                    border: '1px solid #2196f3',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    flex: '1',
                    minWidth: '120px'
                  }}
                >
                  🔄 Refresh
                </button>
                {stats?.isCorrupted && (
                  <button
                    onClick={repairAndSync}
                    disabled={loading}
                    style={{
                      padding: '0.75rem 1rem',
                      border: '1px solid #ff9800',
                      backgroundColor: '#ff9800',
                      color: 'white',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      flex: '1',
                      minWidth: '120px',
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    🔧 Repair & Sync
                  </button>
                )}
                <button
                  onClick={clearLocal}
                  style={{
                    padding: '0.75rem 1rem',
                    border: '1px solid #f44336',
                    backgroundColor: '#f44336',
                    color: 'white',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    flex: '1',
                    minWidth: '120px'
                  }}
                >
                  🗑️ Clear Local
                </button>
              </div>

              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '6px',
                fontSize: '0.875rem'
              }}>
                ⚠️ <strong>Clear Local</strong> will delete all local operations and re-sync from cloud on page refresh.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: '1.5rem',
      paddingBottom: '1rem',
      borderBottom: '1px solid #e0e0e0'
    }}>
      <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.5rem',
      backgroundColor: '#f5f5f5',
      borderRadius: '4px'
    }}>
      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{label}:</span>
      <span style={{
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: mono ? '0.85rem' : '0.9rem',
        fontWeight: 500
      }}>
        {children}
      </span>
    </div>
  );
}
