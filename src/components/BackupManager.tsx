import React from 'react';
import { LocalBackupManager } from '../utils/localBackup';
import { logger } from '../utils/logger';

interface BackupManagerProps {
  currentData: any;
  onRestore: (data: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function BackupManager({ currentData, onRestore, isOpen, onClose }: BackupManagerProps) {
  const [localBackups, setLocalBackups] = React.useState<any[]>([]);
  const [storageUsage, setStorageUsage] = React.useState<{ used: number; quota: number; percentage: number }>({ used: 0, quota: 0, percentage: 0 });
  const [isCreatingBackup, setIsCreatingBackup] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      loadBackups();
      loadStorageUsage();
    }
  }, [isOpen]);

  const loadBackups = () => {
    try {
      const backups = LocalBackupManager.getLocalBackups();
      setLocalBackups(backups);
    } catch (error) {
      logger.error('Failed to load backups:', error);
    }
  };

  const loadStorageUsage = async () => {
    try {
      const usage = await LocalBackupManager.getStorageUsage();
      setStorageUsage(usage);
    } catch (error) {
      logger.error('Failed to load storage usage:', error);
    }
  };

  const createManualBackup = async () => {
    setIsCreatingBackup(true);
    try {
      await LocalBackupManager.performCriticalBackup(currentData, 'manual');
      loadBackups(); // Refresh the list
      logger.info('Manual backup created successfully');
    } catch (error) {
      logger.error('Failed to create manual backup:', error);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const restoreFromBackup = (backupIndex: number) => {
    try {
      const data = LocalBackupManager.restoreFromLocalBackup(backupIndex);
      onRestore(data);
      onClose();
    } catch (error) {
      logger.error('Failed to restore from backup:', error);
    }
  };

  const downloadBackup = (backup: any, index: number) => {
    try {
      const timestamp = new Date(backup.timestamp).toISOString().replace(/[:.]/g, '-');
      LocalBackupManager.downloadBackup(backup.data, `navigator-backup-${timestamp}.json`);
    } catch (error) {
      logger.error('Failed to download backup:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getStorageColor = (percentage: number): string => {
    if (percentage > 80) return 'var(--danger)';
    if (percentage > 60) return 'var(--warning)';
    return 'var(--success)';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2>💾 Backup Manager</h2>
          <p style={{ margin: '0.5rem 0 0', opacity: 0.8, fontSize: '0.9rem' }}>
            Local backups are automatically created and downloaded to prevent data loss
          </p>
        </div>

        <div className="modal-body">
          {/* Storage Usage */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>📊 Storage Usage</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <div style={{ flex: 1, height: '8px', background: 'var(--gray-200)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: getStorageColor(storageUsage.percentage),
                    width: `${Math.min(storageUsage.percentage, 100)}%`,
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--gray-600)', minWidth: '60px' }}>
                {storageUsage.percentage.toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
              {formatFileSize(storageUsage.used)} of {formatFileSize(storageUsage.quota)} used
              {storageUsage.percentage > 80 && (
                <span style={{ color: 'var(--danger)', fontWeight: 500, marginLeft: '0.5rem' }}>
                  ⚠️ Storage running low!
                </span>
              )}
            </div>
          </div>

          {/* Manual Backup */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--blue-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--blue-200)' }}>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--blue-700)' }}>📁 Create Manual Backup</h4>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--blue-600)' }}>
              Create an immediate backup and download it to your computer for safekeeping.
            </p>
            <button
              className="btn btn-primary"
              onClick={createManualBackup}
              disabled={isCreatingBackup}
            >
              {isCreatingBackup ? '📦 Creating...' : '📦 Create & Download Backup'}
            </button>
          </div>

          {/* Local Backups List */}
          <div>
            <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem' }}>📚 Local Backups ({localBackups.length})</h4>

            {localBackups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                No local backups found. Create your first backup above!
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                {localBackups.map((backup, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '1rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '0.5rem',
                      background: 'white',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                          {formatDate(backup.timestamp)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                          Size: {formatFileSize(backup.size || 0)} • Version: {backup.version || 1}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => downloadBackup(backup, index)}
                          title="Download backup file"
                        >
                          📥
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => restoreFromBackup(index)}
                          title="Restore from this backup"
                        >
                          🔄 Restore
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backup Info */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--green-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--green-200)' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--green-700)' }}>✅ Data Protection Features</h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--green-600)' }}>
              <li>Automatic backups every 5 minutes when data changes</li>
              <li>Critical backups downloaded after completions</li>
              <li>Local browser storage with 10 backup rotation</li>
              <li>Storage monitoring and cleanup</li>
              <li>Data integrity verification</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }

        .modal-content {
          background: white;
          border-radius: var(--radius-lg);
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-2xl);
          border: 1px solid var(--border);
          width: 100%;
        }

        .modal-header {
          padding: 1.5rem 1.5rem 1rem;
          border-bottom: 1px solid var(--border-light);
        }

        .modal-header h2 {
          margin: 0 0 0.5rem;
          color: var(--text-primary);
          font-size: 1.25rem;
          font-weight: 600;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .modal-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid var(--border-light);
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}