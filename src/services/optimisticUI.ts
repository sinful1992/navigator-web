// src/services/optimisticUI.ts
/**
 * Optimistic UI Manager
 *
 * Manages optimistic updates to provide instant UI feedback while changes
 * are being synced to the cloud. Handles rollbacks on failures and conflict
 * resolution when cloud state differs from expected.
 *
 * Feature: Optimistic UI with Change Tracking (DISABLED by default)
 */

import type { AppState } from '../types';
import { changeTracker, type ChangeType } from './changeTracker';
import { logger } from '../utils/logger';

export type OptimisticUpdateStatus = 'pending' | 'confirmed' | 'failed' | 'conflicted';

export interface OptimisticUpdate {
  id: string;                          // Unique update ID
  changeId: string;                    // Linked change tracking ID
  type: ChangeType;                    // Type of operation
  timestamp: number;                   // When update was applied
  status: OptimisticUpdateStatus;      // Current status
  previousState: AppState;             // State before update (for rollback)
  expectedState: AppState;             // State after update (what we expect)
  actualState?: AppState;              // State from cloud (if different)
  error?: string;                      // Error message if failed
  retryCount: number;                  // Number of retry attempts
  maxRetries: number;                  // Maximum retries before giving up
}

export interface OptimisticUIConfig {
  enabled: boolean;                    // Master switch
  maxPendingUpdates: number;           // Max concurrent pending updates
  updateTimeoutMs: number;             // How long before marking as failed
  autoRetry: boolean;                  // Auto-retry failed updates
  maxRetries: number;                  // Maximum retry attempts
}

const DEFAULT_CONFIG: OptimisticUIConfig = {
  enabled: false,                      // DISABLED by default
  maxPendingUpdates: 100,
  updateTimeoutMs: 30 * 1000,          // 30 seconds
  autoRetry: true,
  maxRetries: 3,
};

/**
 * Generate unique update ID
 */
function generateUpdateId(): string {
  return `update_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Deep clone state for rollback
 */
function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Compare two states to detect conflicts
 */
function statesMatch(state1: AppState, state2: AppState): boolean {
  // Compare key fields that matter for sync
  return (
    JSON.stringify(state1.addresses) === JSON.stringify(state2.addresses) &&
    JSON.stringify(state1.completions) === JSON.stringify(state2.completions) &&
    JSON.stringify(state1.arrangements) === JSON.stringify(state2.arrangements) &&
    state1.activeIndex === state2.activeIndex &&
    state1.currentListVersion === state2.currentListVersion
  );
}

/**
 * Optimistic UI Manager
 */
class OptimisticUIManager {
  private config: OptimisticUIConfig;
  private pendingUpdates: Map<string, OptimisticUpdate>;
  private updateCallbacks: Map<string, (update: OptimisticUpdate) => void>;
  private timeouts: Map<string, NodeJS.Timeout>;

  constructor() {
    this.config = DEFAULT_CONFIG;
    this.pendingUpdates = new Map();
    this.updateCallbacks = new Map();
    this.timeouts = new Map();
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OptimisticUIConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Optimistic UI config updated:', this.config);
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && changeTracker.isEnabled();
  }

  /**
   * Enable optimistic UI
   */
  async enable(): Promise<void> {
    // Ensure change tracker is also enabled
    if (!changeTracker.isEnabled()) {
      await changeTracker.enable();
    }
    this.config.enabled = true;
    logger.info('✅ Optimistic UI ENABLED');
  }

  /**
   * Disable optimistic UI
   */
  disable(): void {
    // Clear all pending updates
    this.pendingUpdates.clear();
    this.updateCallbacks.clear();

    // Clear all timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    this.config.enabled = false;
    logger.info('❌ Optimistic UI DISABLED');
  }

  /**
   * Apply an optimistic update
   */
  async applyUpdate(
    type: ChangeType,
    previousState: AppState,
    newState: AppState,
    options?: {
      entityId?: string;
      entityIndex?: number;
      metadata?: Record<string, any>;
      onConfirmed?: (update: OptimisticUpdate) => void;
      onFailed?: (update: OptimisticUpdate) => void;
      onConflict?: (update: OptimisticUpdate) => void;
    }
  ): Promise<string> {
    if (!this.isEnabled()) {
      return ''; // Silently skip if disabled
    }

    // Check if we have too many pending updates
    if (this.pendingUpdates.size >= this.config.maxPendingUpdates) {
      logger.warn('Too many pending optimistic updates, rejecting new update');
      return '';
    }

    const updateId = generateUpdateId();

    // Track the change
    const changeId = await changeTracker.trackChange(type, newState, {
      entityId: options?.entityId,
      entityIndex: options?.entityIndex,
      metadata: options?.metadata,
    });

    const update: OptimisticUpdate = {
      id: updateId,
      changeId,
      type,
      timestamp: Date.now(),
      status: 'pending',
      previousState: cloneState(previousState),
      expectedState: cloneState(newState),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
    };

    this.pendingUpdates.set(updateId, update);

    // Register callbacks
    if (options?.onConfirmed) {
      this.updateCallbacks.set(`${updateId}_confirmed`, options.onConfirmed);
    }
    if (options?.onFailed) {
      this.updateCallbacks.set(`${updateId}_failed`, options.onFailed);
    }
    if (options?.onConflict) {
      this.updateCallbacks.set(`${updateId}_conflict`, options.onConflict);
    }

    // Set timeout for update
    const timeout = setTimeout(() => {
      this.handleUpdateTimeout(updateId);
    }, this.config.updateTimeoutMs);
    this.timeouts.set(updateId, timeout);

    if (import.meta.env.DEV) {
      logger.info('🚀 Optimistic update applied:', {
        updateId,
        changeId,
        type,
        entityId: options?.entityId,
        entityIndex: options?.entityIndex,
      });
    }

    return updateId;
  }

  /**
   * Confirm an optimistic update (when sync succeeds)
   */
  async confirmUpdate(updateId: string, actualState?: AppState): Promise<void> {
    const update = this.pendingUpdates.get(updateId);
    if (!update) {
      logger.warn(`Cannot confirm unknown update: ${updateId}`);
      return;
    }

    // Clear timeout
    const timeout = this.timeouts.get(updateId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(updateId);
    }

    // Check for conflicts if actual state provided
    if (actualState && !statesMatch(update.expectedState, actualState)) {
      logger.warn('⚠️ Conflict detected: actual state differs from expected', {
        updateId,
        type: update.type,
      });
      update.status = 'conflicted';
      update.actualState = actualState;

      // Call conflict callback
      const conflictCallback = this.updateCallbacks.get(`${updateId}_conflict`);
      if (conflictCallback) {
        conflictCallback(update);
      }

      // Remove from pending
      this.pendingUpdates.delete(updateId);
      return;
    }

    // Mark as confirmed
    update.status = 'confirmed';
    await changeTracker.markSynced(update.changeId);

    if (import.meta.env.DEV) {
      logger.info('✅ Optimistic update confirmed:', {
        updateId,
        type: update.type,
        age: `${Date.now() - update.timestamp}ms`,
      });
    }

    // Call confirmed callback
    const confirmedCallback = this.updateCallbacks.get(`${updateId}_confirmed`);
    if (confirmedCallback) {
      confirmedCallback(update);
    }

    // Cleanup
    this.pendingUpdates.delete(updateId);
    this.updateCallbacks.delete(`${updateId}_confirmed`);
    this.updateCallbacks.delete(`${updateId}_failed`);
    this.updateCallbacks.delete(`${updateId}_conflict`);
  }

  /**
   * Fail an optimistic update (when sync fails)
   */
  async failUpdate(updateId: string, error: string): Promise<void> {
    const update = this.pendingUpdates.get(updateId);
    if (!update) {
      logger.warn(`Cannot fail unknown update: ${updateId}`);
      return;
    }

    // Clear timeout
    const timeout = this.timeouts.get(updateId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(updateId);
    }

    update.error = error;
    update.retryCount++;

    // Check if we should retry
    if (this.config.autoRetry && update.retryCount < update.maxRetries) {
      logger.warn(`⚠️ Optimistic update failed, retrying (${update.retryCount}/${update.maxRetries}):`, {
        updateId,
        error,
      });

      // Set new timeout for retry
      const retryTimeout = setTimeout(() => {
        this.handleUpdateTimeout(updateId);
      }, this.config.updateTimeoutMs);
      this.timeouts.set(updateId, retryTimeout);

      return;
    }

    // Max retries exceeded or auto-retry disabled
    update.status = 'failed';

    logger.error('❌ Optimistic update failed permanently:', {
      updateId,
      type: update.type,
      error,
      retries: update.retryCount,
    });

    // Call failed callback
    const failedCallback = this.updateCallbacks.get(`${updateId}_failed`);
    if (failedCallback) {
      failedCallback(update);
    }

    // Cleanup
    this.pendingUpdates.delete(updateId);
    this.updateCallbacks.delete(`${updateId}_confirmed`);
    this.updateCallbacks.delete(`${updateId}_failed`);
    this.updateCallbacks.delete(`${updateId}_conflict`);
  }

  /**
   * Handle update timeout
   */
  private async handleUpdateTimeout(updateId: string): Promise<void> {
    const update = this.pendingUpdates.get(updateId);
    if (!update) return;

    logger.warn('⏱️ Optimistic update timed out:', {
      updateId,
      type: update.type,
      age: `${Date.now() - update.timestamp}ms`,
    });

    await this.failUpdate(updateId, 'Update timed out');
  }

  /**
   * Get rollback state for a failed update
   */
  getRollbackState(updateId: string): AppState | null {
    const update = this.pendingUpdates.get(updateId);
    if (!update) return null;
    return update.previousState;
  }

  /**
   * Rollback a specific update
   */
  rollback(updateId: string): AppState | null {
    const rollbackState = this.getRollbackState(updateId);
    if (rollbackState) {
      this.pendingUpdates.delete(updateId);
      logger.info('↩️ Rolled back optimistic update:', updateId);
    }
    return rollbackState;
  }

  /**
   * Rollback all pending updates
   */
  rollbackAll(): AppState[] {
    const rollbackStates: AppState[] = [];

    for (const [updateId, update] of this.pendingUpdates.entries()) {
      rollbackStates.push(update.previousState);

      // Clear timeout
      const timeout = this.timeouts.get(updateId);
      if (timeout) {
        clearTimeout(timeout);
        this.timeouts.delete(updateId);
      }
    }

    this.pendingUpdates.clear();
    this.updateCallbacks.clear();

    if (rollbackStates.length > 0) {
      logger.warn(`↩️ Rolled back ${rollbackStates.length} pending optimistic update(s)`);
    }

    return rollbackStates;
  }

  /**
   * Get all pending updates
   */
  getPendingUpdates(): OptimisticUpdate[] {
    return Array.from(this.pendingUpdates.values());
  }

  /**
   * Get statistics for debugging
   */
  getStats(): {
    enabled: boolean;
    totalPending: number;
    pendingByType: Record<string, number>;
    oldestPendingAge: number | null;
    avgPendingAge: number | null;
  } {
    const pending = this.getPendingUpdates();
    const now = Date.now();

    const pendingByType = pending.reduce((acc, update) => {
      acc[update.type] = (acc[update.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const ages = pending.map(u => now - u.timestamp);

    return {
      enabled: this.isEnabled(),
      totalPending: pending.length,
      pendingByType,
      oldestPendingAge: ages.length > 0 ? Math.max(...ages) : null,
      avgPendingAge: ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
    };
  }

  /**
   * Clear all pending updates (use with caution!)
   */
  clearAll(): void {
    // Clear all timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }

    this.pendingUpdates.clear();
    this.updateCallbacks.clear();
    this.timeouts.clear();

    logger.warn('🧹 All optimistic updates cleared');
  }
}

// Export singleton instance
export const optimisticUI = new OptimisticUIManager();

// Export for testing
export { OptimisticUIManager };
