// src/utils/safetyBackup.ts - Data recovery system for lost data
import { logger } from "./logger";
import type { AppState } from "../types";

export interface SafetyBackup {
  _backup_timestamp: string;
  _previous_user?: string;
  _current_user?: string;
  [key: string]: any; // AppState properties
}

export class SafetyBackupManager {
  // List all available safety backups
  static listSafetyBackups(): Array<{ key: string; backup: SafetyBackup }> {
    const backups: Array<{ key: string; backup: SafetyBackup }> = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('navigator_safety_backup_')) {
          try {
            const data = localStorage.getItem(key);
            if (data) {
              const backup = JSON.parse(data) as SafetyBackup;
              backups.push({ key, backup });
            }
          } catch (parseError) {
            logger.warn(`Failed to parse safety backup ${key}:`, parseError);
          }
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => {
        const aTime = new Date(a.backup._backup_timestamp).getTime();
        const bTime = new Date(b.backup._backup_timestamp).getTime();
        return bTime - aTime;
      });

    } catch (error) {
      logger.error('Failed to list safety backups:', error);
    }

    return backups;
  }

  // Get human-readable info about a backup
  static getBackupInfo(backup: SafetyBackup) {
    const timestamp = new Date(backup._backup_timestamp);
    const addresses = Array.isArray(backup.addresses) ? backup.addresses.length : 0;
    const completions = Array.isArray(backup.completions) ? backup.completions.length : 0;
    const arrangements = Array.isArray(backup.arrangements) ? backup.arrangements.length : 0;

    return {
      timestamp,
      timeAgo: SafetyBackupManager.getTimeAgo(timestamp),
      dataSize: { addresses, completions, arrangements },
      hasData: addresses > 0 || completions > 0 || arrangements > 0
    };
  }

  // Restore from a safety backup
  static restoreSafetyBackup(key: string): AppState | null {
    try {
      const data = localStorage.getItem(key);
      if (!data) {
        logger.error(`Safety backup ${key} not found`);
        return null;
      }

      const backup = JSON.parse(data) as SafetyBackup;

      // Extract AppState properties (excluding metadata)
      const { _backup_timestamp, _previous_user, _current_user, ...appState } = backup;

      // Validate the restored state
      const restoredState: AppState = {
        addresses: Array.isArray(appState.addresses) ? appState.addresses : [],
        completions: Array.isArray(appState.completions) ? appState.completions : [],
        arrangements: Array.isArray(appState.arrangements) ? appState.arrangements : [],
        daySessions: Array.isArray(appState.daySessions) ? appState.daySessions : [],
        activeIndex: typeof appState.activeIndex === 'number' ? appState.activeIndex : null,
        currentListVersion: typeof appState.currentListVersion === 'number' ? appState.currentListVersion : 1,
        subscription: appState.subscription || undefined,
        reminderSettings: appState.reminderSettings || undefined,
        reminderNotifications: Array.isArray(appState.reminderNotifications) ? appState.reminderNotifications : []
      };

      logger.info(`Safety backup restored from ${backup._backup_timestamp}`);
      logger.info(`Restored: ${restoredState.addresses.length} addresses, ${restoredState.completions.length} completions`);

      return restoredState;
    } catch (error) {
      logger.error(`Failed to restore safety backup ${key}:`, error);
      return null;
    }
  }

  // Delete a safety backup
  static deleteSafetyBackup(key: string): boolean {
    try {
      localStorage.removeItem(key);
      logger.info(`Safety backup ${key} deleted`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete safety backup ${key}:`, error);
      return false;
    }
  }

  // Clean up old safety backups (keep only last 5)
  static cleanupOldBackups(): void {
    try {
      const backups = SafetyBackupManager.listSafetyBackups();

      // Keep only the 5 most recent backups
      const toDelete = backups.slice(5);

      for (const { key } of toDelete) {
        SafetyBackupManager.deleteSafetyBackup(key);
      }

      if (toDelete.length > 0) {
        logger.info(`Cleaned up ${toDelete.length} old safety backups`);
      }
    } catch (error) {
      logger.error('Failed to cleanup old safety backups:', error);
    }
  }

  // Create a manual safety backup
  static createManualBackup(state: AppState, reason = 'manual'): string | null {
    try {
      const backupKey = `navigator_safety_backup_${Date.now()}_${reason}`;
      const backupData: SafetyBackup = {
        ...state,
        _backup_timestamp: new Date().toISOString(),
        _backup_reason: reason
      };

      localStorage.setItem(backupKey, JSON.stringify(backupData));
      logger.info(`Manual safety backup created: ${backupKey}`);

      // Cleanup old backups
      SafetyBackupManager.cleanupOldBackups();

      return backupKey;
    } catch (error) {
      logger.error('Failed to create manual safety backup:', error);
      return null;
    }
  }

  private static getTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }
}