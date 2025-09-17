import { logger } from './logger';

// Enhanced local backup system to prevent data loss
export class LocalBackupManager {
  private static readonly BACKUP_KEY = 'navigator_local_backups';
  private static readonly MAX_BACKUPS = 10;
  private static readonly BACKUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  // Download backup as file to user's Downloads folder
  static downloadBackup(data: any, filename?: string): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = filename || `navigator-backup-${timestamp}.json`;

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);

      logger.info(`Backup downloaded: ${name} (${blob.size} bytes)`);
    } catch (error) {
      logger.error('Failed to download backup:', error);
      throw error;
    }
  }

  // Store backup in browser storage (with rotation)
  static storeLocalBackup(data: any): void {
    try {
      const backups = this.getLocalBackups();
      const timestamp = new Date().toISOString();

      const newBackup = {
        timestamp,
        data,
        size: JSON.stringify(data).length,
        version: data._schemaVersion || 1,
      };

      // Add new backup
      backups.unshift(newBackup);

      // Keep only the latest backups
      const trimmedBackups = backups.slice(0, this.MAX_BACKUPS);

      localStorage.setItem(this.BACKUP_KEY, JSON.stringify(trimmedBackups));

      logger.info(`Local backup stored (${trimmedBackups.length}/${this.MAX_BACKUPS})`);
    } catch (error) {
      logger.error('Failed to store local backup:', error);
    }
  }

  // Get all local backups
  static getLocalBackups(): any[] {
    try {
      const stored = localStorage.getItem(this.BACKUP_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error('Failed to get local backups:', error);
      return [];
    }
  }

  // Restore from local backup
  static restoreFromLocalBackup(backupIndex: number): any {
    const backups = this.getLocalBackups();
    if (backupIndex < 0 || backupIndex >= backups.length) {
      throw new Error('Invalid backup index');
    }
    return backups[backupIndex].data;
  }

  // Monitor storage usage
  static async getStorageUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentage = quota > 0 ? (used / quota) * 100 : 0;

        return { used, quota, percentage };
      } catch (error) {
        logger.warn('Failed to get storage estimate:', error);
      }
    }

    return { used: 0, quota: 0, percentage: 0 };
  }

  // Check if storage is running low
  static async isStorageLow(): Promise<boolean> {
    const { percentage } = await this.getStorageUsage();
    return percentage > 80; // Alert when over 80% full
  }

  // Create comprehensive backup with metadata
  static createComprehensiveBackup(data: any): any {
    const backup = {
      version: '1.0',
      created: new Date().toISOString(),
      platform: navigator.platform,
      userAgent: navigator.userAgent.substring(0, 100), // Truncated for privacy
      app: {
        name: 'Navigator Web',
        version: '1.0.0',
      },
      data,
      checksum: this.generateChecksum(data),
    };

    return backup;
  }

  // Generate simple checksum for data integrity
  private static generateChecksum(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Verify backup integrity
  static verifyBackup(backup: any): boolean {
    try {
      if (!backup.data || !backup.checksum) return false;

      const calculatedChecksum = this.generateChecksum(backup.data);
      return calculatedChecksum === backup.checksum;
    } catch (error) {
      logger.error('Backup verification failed:', error);
      return false;
    }
  }

  // Auto-backup with download on critical events (REDUCED FREQUENCY)
  static async performCriticalBackup(data: any, reason: string): Promise<void> {
    try {
      logger.info(`Performing critical backup: ${reason}`);

      // Always store locally
      this.storeLocalBackup(data);

      // Only download files for truly critical events (not every completion)
      const shouldDownload = this.shouldDownloadBackup(reason);
      if (shouldDownload) {
        const comprehensiveBackup = this.createComprehensiveBackup(data);
        this.downloadBackup(comprehensiveBackup, `navigator-critical-${reason}-${Date.now()}.json`);
        logger.info(`Backup file downloaded for critical event: ${reason}`);
      }

      // Check storage health
      const isLow = await this.isStorageLow();
      if (isLow) {
        logger.warn('Browser storage is running low!');
      }

    } catch (error) {
      logger.error('Critical backup failed:', error);
      throw error;
    }
  }

  // Determine if we should download a backup file (reduce frequency)
  private static shouldDownloadBackup(reason: string): boolean {
    const downloadReasons = [
      'manual',           // User manually requested backup
      'import',           // After importing new data
      'day-end',          // At end of work day
      'restore',          // After restoring data
      'data-loss-risk'    // When data loss is detected
    ];

    return downloadReasons.includes(reason);
  }

  // Clean up old backups
  static cleanupOldBackups(): void {
    try {
      const backups = this.getLocalBackups();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days

      const recentBackups = backups.filter(backup =>
        new Date(backup.timestamp) > cutoffDate
      );

      if (recentBackups.length !== backups.length) {
        localStorage.setItem(this.BACKUP_KEY, JSON.stringify(recentBackups));
        logger.info(`Cleaned up ${backups.length - recentBackups.length} old backups`);
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups:', error);
    }
  }

  // Get backup statistics
  static getBackupStats(): { count: number; totalSize: number; oldestDate: string | null; newestDate: string | null } {
    const backups = this.getLocalBackups();

    const totalSize = backups.reduce((sum, backup) => sum + (backup.size || 0), 0);
    const oldestDate = backups.length > 0 ? backups[backups.length - 1].timestamp : null;
    const newestDate = backups.length > 0 ? backups[0].timestamp : null;

    return {
      count: backups.length,
      totalSize,
      oldestDate,
      newestDate,
    };
  }
}