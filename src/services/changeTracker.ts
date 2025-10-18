// src/services/changeTracker.ts
/**
 * Change Tracking Service
 *
 * Tracks all local changes with timestamps and operation IDs to prevent echo
 * from cloud sync. Persists to IndexedDB to survive page refreshes.
 *
 * Feature: Optimistic UI with Change Tracking (DISABLED by default)
 */

import { get, set, del, entries } from 'idb-keyval';

import { logger } from '../utils/logger';

export type ChangeType =
  | 'set_active'
  | 'complete'
  | 'cancel_active'
  | 'add_address'
  | 'import_addresses'
  | 'add_arrangement'
  | 'update_arrangement'
  | 'delete_arrangement'
  | 'start_day'
  | 'end_day';

export interface TrackedChange {
  id: string;                    // Unique change ID
  type: ChangeType;              // Type of change
  timestamp: number;             // When the change was made (ms since epoch)
  deviceId: string;              // Which device made the change
  entityId?: string;             // ID of affected entity (arrangement ID, etc.)
  entityIndex?: number;          // Index of affected entity (address index, etc.)
  stateSnapshot: string;         // Checksum of state after this change
  synced: boolean;               // Whether this change has been synced to cloud
  syncedAt?: number;             // When it was synced
  expiresAt: number;             // When this tracking record should be cleaned up
  metadata?: Record<string, any>; // Additional context
}

export interface ChangeTrackerConfig {
  enabled: boolean;              // Master switch
  ttlMs: number;                 // How long to keep change records (ms)
  maxChanges: number;            // Maximum number of changes to track
  syncWindowMs: number;          // How long to wait before assuming sync complete
}

const DEFAULT_CONFIG: ChangeTrackerConfig = {
  enabled: false,                // DISABLED by default - set to true to activate
  ttlMs: 5 * 60 * 1000,         // 5 minutes
  maxChanges: 1000,              // Track up to 1000 changes
  syncWindowMs: 10 * 1000,       // 10 second sync window
};

const STORAGE_PREFIX = 'navigator_change_';
const CONFIG_KEY = 'navigator_change_tracker_config';

/**
 * Generate a device-consistent ID
 */
function getDeviceId(): string {
  let deviceId = localStorage.getItem('navigator_device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('navigator_device_id', deviceId);
  }
  return deviceId;
}

/**
 * Generate a unique change ID
 */
function generateChangeId(): string {
  return `change_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Calculate SHA-256 checksum of data (for state snapshots)
 */
async function calculateChecksum(data: any): Promise<string> {
  const str = JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Change Tracker Service
 */
class ChangeTrackerService {
  private config: ChangeTrackerConfig;
  private deviceId: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = DEFAULT_CONFIG;
    this.deviceId = getDeviceId();
    this.loadConfig();
  }

  /**
   * Load configuration from storage
   */
  private async loadConfig(): Promise<void> {
    try {
      const stored = await get<ChangeTrackerConfig>(CONFIG_KEY);
      if (stored) {
        this.config = { ...DEFAULT_CONFIG, ...stored };
      }
    } catch (err) {
      logger.warn('Failed to load change tracker config:', err);
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<ChangeTrackerConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    try {
      await set(CONFIG_KEY, this.config);
      logger.info('✅ Change tracker config updated:', this.config);
    } catch (err) {
      logger.error('Failed to save change tracker config:', err);
    }
  }

  /**
   * Check if change tracking is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable change tracking
   */
  async enable(): Promise<void> {
    await this.updateConfig({ enabled: true });
    this.startCleanupInterval();
    logger.info('✅ Change tracking ENABLED');
  }

  /**
   * Disable change tracking
   */
  async disable(): Promise<void> {
    await this.updateConfig({ enabled: false });
    this.stopCleanupInterval();
    logger.info('❌ Change tracking DISABLED');
  }

  /**
   * Track a new change
   */
  async trackChange(
    type: ChangeType,
    stateAfter: any,
    options?: {
      entityId?: string;
      entityIndex?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    if (!this.config.enabled) {
      return ''; // Silently skip if disabled
    }

    const now = Date.now();
    const changeId = generateChangeId();
    const stateSnapshot = await calculateChecksum(stateAfter);

    const change: TrackedChange = {
      id: changeId,
      type,
      timestamp: now,
      deviceId: this.deviceId,
      entityId: options?.entityId,
      entityIndex: options?.entityIndex,
      stateSnapshot,
      synced: false,
      expiresAt: now + this.config.ttlMs,
      metadata: options?.metadata,
    };

    try {
      const key = `${STORAGE_PREFIX}${changeId}`;
      await set(key, change);

      if (import.meta.env.DEV) {
        logger.info('📝 Change tracked:', {
          id: changeId,
          type,
          deviceId: this.deviceId,
          entityId: options?.entityId,
          entityIndex: options?.entityIndex,
        });
      }

      // Cleanup old changes if we have too many
      await this.enforceMaxChanges();

      return changeId;
    } catch (err) {
      logger.error('Failed to track change:', err);
      return '';
    }
  }

  /**
   * Mark a change as synced
   */
  async markSynced(changeId: string): Promise<void> {
    if (!this.config.enabled || !changeId) return;

    try {
      const key = `${STORAGE_PREFIX}${changeId}`;
      const change = await get<TrackedChange>(key);

      if (change) {
        change.synced = true;
        change.syncedAt = Date.now();
        await set(key, change);

        if (import.meta.env.DEV) {
          logger.info('✅ Change marked as synced:', changeId);
        }
      }
    } catch (err) {
      logger.error('Failed to mark change as synced:', err);
    }
  }

  /**
   * Check if a cloud update is an echo of a local change
   */
  async isEcho(
    cloudState: any,
    options?: {
      type?: ChangeType;
      entityId?: string;
      entityIndex?: number;
    }
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return false; // If disabled, nothing is an echo
    }

    try {
      const cloudChecksum = await calculateChecksum(cloudState);
      const now = Date.now();
      const syncWindow = now - this.config.syncWindowMs;

      // Get all recent unsynced or recently synced changes
      const allEntries = await entries<string, TrackedChange>();
      const recentChanges = allEntries
        .filter(([key]) => key.startsWith(STORAGE_PREFIX))
        .map(([, change]) => change)
        .filter(change => {
          // Include if unsynced or synced within the window
          if (!change.synced) return true;
          if (change.syncedAt && change.syncedAt > syncWindow) return true;
          return false;
        });

      // Check if any recent change matches this cloud state
      for (const change of recentChanges) {
        let matches = change.stateSnapshot === cloudChecksum;

        // Additional filtering if options provided
        if (matches && options) {
          if (options.type && change.type !== options.type) {
            matches = false;
          }
          if (options.entityId && change.entityId !== options.entityId) {
            matches = false;
          }
          if (options.entityIndex !== undefined && change.entityIndex !== options.entityIndex) {
            matches = false;
          }
        }

        if (matches) {
          if (import.meta.env.DEV) {
            logger.info('🔍 Echo detected! Cloud update matches local change:', {
              changeId: change.id,
              changeType: change.type,
              age: `${now - change.timestamp}ms ago`,
            });
          }
          return true;
        }
      }

      return false;
    } catch (err) {
      logger.error('Failed to check for echo:', err);
      return false; // On error, allow the update (safer)
    }
  }

  /**
   * Get all tracked changes (for debugging)
   */
  async getAllChanges(): Promise<TrackedChange[]> {
    try {
      const allEntries = await entries<string, TrackedChange>();
      return allEntries
        .filter(([key]) => key.startsWith(STORAGE_PREFIX))
        .map(([, change]) => change)
        .sort((a, b) => b.timestamp - a.timestamp); // Newest first
    } catch (err) {
      logger.error('Failed to get all changes:', err);
      return [];
    }
  }

  /**
   * Get recent changes for a specific entity
   */
  async getChangesForEntity(
    _entityType: 'address' | 'arrangement' | 'session',
    entityId?: string,
    entityIndex?: number
  ): Promise<TrackedChange[]> {
    const all = await this.getAllChanges();
    return all.filter(change => {
      if (entityId && change.entityId === entityId) return true;
      if (entityIndex !== undefined && change.entityIndex === entityIndex) return true;
      return false;
    });
  }

  /**
   * Clean up expired changes
   */
  async cleanup(): Promise<number> {
    if (!this.config.enabled) return 0;

    try {
      const now = Date.now();
      const allEntries = await entries<string, TrackedChange>();
      let removed = 0;

      for (const [key, change] of allEntries) {
        if (!key.startsWith(STORAGE_PREFIX)) continue;

        // Remove if expired or synced and old
        const shouldRemove =
          change.expiresAt < now ||
          (change.synced && change.syncedAt && (now - change.syncedAt) > this.config.ttlMs);

        if (shouldRemove) {
          await del(key);
          removed++;
        }
      }

      if (import.meta.env.DEV && removed > 0) {
        logger.info(`🧹 Cleaned up ${removed} expired change(s)`);
      }

      return removed;
    } catch (err) {
      logger.error('Failed to cleanup changes:', err);
      return 0;
    }
  }

  /**
   * Enforce maximum number of tracked changes
   */
  private async enforceMaxChanges(): Promise<void> {
    try {
      const all = await this.getAllChanges();

      if (all.length > this.config.maxChanges) {
        // Sort by timestamp (oldest first) and remove excess
        const toRemove = all
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(0, all.length - this.config.maxChanges);

        for (const change of toRemove) {
          await del(`${STORAGE_PREFIX}${change.id}`);
        }

        if (import.meta.env.DEV) {
          logger.info(`🧹 Enforced max changes limit, removed ${toRemove.length} old change(s)`);
        }
      }
    } catch (err) {
      logger.error('Failed to enforce max changes:', err);
    }
  }

  /**
   * Clear all tracked changes (use with caution!)
   */
  async clearAll(): Promise<void> {
    try {
      const allEntries = await entries<string, TrackedChange>();
      for (const [key] of allEntries) {
        if (key.startsWith(STORAGE_PREFIX)) {
          await del(key);
        }
      }
      logger.info('🧹 All change tracking cleared');
    } catch (err) {
      logger.error('Failed to clear all changes:', err);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;

    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => {
        logger.error('Cleanup interval failed:', err);
      });
    }, 60 * 1000);

    if (import.meta.env.DEV) {
      logger.info('🧹 Change tracker cleanup interval started');
    }
  }

  /**
   * Stop periodic cleanup
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      if (import.meta.env.DEV) {
        logger.info('🧹 Change tracker cleanup interval stopped');
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ChangeTrackerConfig {
    return { ...this.config };
  }

  /**
   * Get statistics for debugging
   */
  async getStats(): Promise<{
    enabled: boolean;
    totalChanges: number;
    syncedChanges: number;
    unsyncedChanges: number;
    oldestChangeAge: number | null;
    newestChangeAge: number | null;
  }> {
    const all = await this.getAllChanges();
    const now = Date.now();

    return {
      enabled: this.config.enabled,
      totalChanges: all.length,
      syncedChanges: all.filter(c => c.synced).length,
      unsyncedChanges: all.filter(c => !c.synced).length,
      oldestChangeAge: all.length > 0 ? now - Math.min(...all.map(c => c.timestamp)) : null,
      newestChangeAge: all.length > 0 ? now - Math.max(...all.map(c => c.timestamp)) : null,
    };
  }
}

// Export singleton instance
export const changeTracker = new ChangeTrackerService();

// Export for testing
export { ChangeTrackerService };
