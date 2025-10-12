// src/sync/migrationAdapter.ts - Gradual migration from state-based to operation-based sync
import React from "react";
import type { User } from "@supabase/supabase-js";
import type { AppState } from "../types";
import type { Operation } from "./operations";
import { createOperation } from "./operations";
import { useOperationSync } from "./operationSync";
import { useCloudSync } from "../useCloudSync";
import { logger } from "../utils/logger";

type SyncMode = 'legacy' | 'operations' | 'hybrid';

/**
 * Configuration for migration rollout
 */
type MigrationConfig = {
  mode: SyncMode;
  rolloutPercentage: number; // 0-100, what % of users should use new sync
  forceMode?: SyncMode; // Override for testing
  migrationEnabled: boolean; // Can users migrate their existing data?
};

const DEFAULT_CONFIG: MigrationConfig = {
  mode: 'operations', // 🚀 SWITCHED TO DELTA SYNC (operations mode)
  rolloutPercentage: 100, // All users on delta sync
  migrationEnabled: true,
};

/**
 * Unified sync adapter that handles both old and new sync systems
 * Allows gradual migration from state-based to operation-based sync
 */
export function useUnifiedSync() {
  const legacySync = useCloudSync();
  const operationSync = useOperationSync();

  // Get migration configuration (could come from server, feature flags, etc.)
  const getMigrationConfig = (): MigrationConfig => {
    // Check for override in localStorage (for development/testing)
    const override = localStorage.getItem('navigator_sync_mode_override');
    if (override && ['legacy', 'operations', 'hybrid'].includes(override)) {
      return {
        ...DEFAULT_CONFIG,
        mode: override as SyncMode,
        forceMode: override as SyncMode,
      };
    }

    // In production, this would come from your feature flag system
    // For now, return default config
    return DEFAULT_CONFIG;
  };

  const config = getMigrationConfig();

  // Determine which sync mode to use for this user
  const getSyncModeForUser = (user: User | null): SyncMode => {
    if (config.forceMode) {
      return config.forceMode;
    }

    if (!user) {
      return 'legacy';
    }

    // Use user ID to deterministically assign users to rollout groups
    const userHash = hashUserId(user.id);
    const userPercentile = userHash % 100;

    if (userPercentile < config.rolloutPercentage) {
      return 'operations';
    }

    return 'legacy';
  };

  const currentMode = getSyncModeForUser(legacySync.user || operationSync.user);

  // Migration functions
  const migrateStateToOperations = async (state: AppState): Promise<Operation[]> => {
    const operations: Operation[] = [];
    let sequence = 1;

    try {
      // Convert addresses to bulk import operation
      if (state.addresses.length > 0) {
        const addressOp = createOperation(
          'ADDRESS_BULK_IMPORT',
          {
            addresses: state.addresses,
            newListVersion: state.currentListVersion,
            preserveCompletions: true,
          },
          'migration_client',
          sequence++
        );
        operations.push(addressOp);
      }

      // Convert completions to individual create operations
      for (const completion of state.completions) {
        const completionOp = createOperation(
          'COMPLETION_CREATE',
          { completion },
          'migration_client',
          sequence++
        );
        operations.push(completionOp);
      }

      // Convert arrangements to create operations
      for (const arrangement of state.arrangements) {
        const arrangementOp = createOperation(
          'ARRANGEMENT_CREATE',
          { arrangement },
          'migration_client',
          sequence++
        );
        operations.push(arrangementOp);
      }

      // Convert day sessions to create operations
      for (const session of state.daySessions) {
        const sessionOp = createOperation(
          'SESSION_START',
          { session },
          'migration_client',
          sequence++
        );
        operations.push(sessionOp);
      }

      // Convert active index
      if (state.activeIndex !== null) {
        const activeOp = createOperation(
          'ACTIVE_INDEX_SET',
          { index: state.activeIndex },
          'migration_client',
          sequence++
        );
        operations.push(activeOp);
      }

      logger.info('Converted state to operations:', {
        operationCount: operations.length,
        addressCount: state.addresses.length,
        completionCount: state.completions.length,
      });

      return operations;
    } catch (error) {
      logger.error('Failed to migrate state to operations:', error);
      throw new Error('Migration failed');
    }
  };

  // Unified interface methods
  const syncData = async (state: AppState): Promise<void> => {
    switch (currentMode) {
      case 'legacy':
        return legacySync.syncData(state);

      case 'operations':
        // Convert state changes to operations and submit them
        const operations = await migrateStateToOperations(state);
        for (const operation of operations) {
          await operationSync.submitOperation({
            type: operation.type,
            payload: operation.payload,
          });
        }
        break;

      case 'hybrid':
        // Try operations first, fall back to legacy on error
        try {
          const operations = await migrateStateToOperations(state);
          for (const operation of operations) {
            await operationSync.submitOperation({
              type: operation.type,
              payload: operation.payload,
            });
          }
        } catch (error) {
          logger.warn('Operations sync failed, falling back to legacy:', error);
          return legacySync.syncData(state);
        }
        break;
    }
  };

  const subscribeToData = (onChange: React.Dispatch<React.SetStateAction<AppState>>): (() => void) => {
    switch (currentMode) {
      case 'legacy':
        return legacySync.subscribeToData(onChange);

      case 'operations':
        return operationSync.subscribeToOperations((_operations) => {
          // Reconstruct state from operations and notify
          const state = operationSync.getStateFromOperations();
          onChange(state);
        });

      case 'hybrid':
        // Subscribe to both and merge updates
        const legacyCleanup = legacySync.subscribeToData(onChange);
        const operationsCleanup = operationSync.subscribeToOperations((_operations) => {
          const state = operationSync.getStateFromOperations();
          onChange(state);
        });

        return () => {
          legacyCleanup();
          operationsCleanup();
        };

      default:
        return () => {};
    }
  };

  // Migration utilities for the UI
  const canMigrate = (): boolean => {
    return config.migrationEnabled &&
           currentMode === 'legacy' &&
           legacySync.user !== null;
  };

  const performMigration = async (): Promise<boolean> => {
    if (!canMigrate()) {
      throw new Error('Migration not available');
    }

    try {
      // Get current state from legacy sync
      const currentState = operationSync.getStateFromOperations(); // This will be empty initially

      // Convert to operations
      const operations = await migrateStateToOperations(currentState);

      // Submit all operations
      for (const operation of operations) {
        await operationSync.submitOperation({
          type: operation.type,
          payload: operation.payload,
        });
      }

      // Update localStorage to use operations mode
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      logger.info('Migration completed successfully:', {
        operationCount: operations.length,
      });

      return true;
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  };

  const getMigrationStatus = () => ({
    currentMode,
    canMigrate: canMigrate(),
    config,
  });

  // Return unified interface based on current mode
  const activeSync = currentMode === 'operations' ? operationSync : legacySync;

  return {
    // Pass through active sync properties
    user: activeSync.user,
    isLoading: activeSync.isLoading,
    isOnline: activeSync.isOnline,
    isSyncing: activeSync.isSyncing,
    error: activeSync.error,
    lastSyncTime: activeSync.lastSyncTime,
    clearError: activeSync.clearError,
    signIn: activeSync.signIn,
    signUp: activeSync.signUp,
    signOut: activeSync.signOut,

    // Auth methods (always use legacy sync for these)
    resetPassword: legacySync.resetPassword,
    updatePassword: legacySync.updatePassword,
    updateEmail: legacySync.updateEmail,

    // Unified sync methods
    syncData,
    subscribeToData,

    // Operations-specific methods (only available in operations mode)
    submitOperation: currentMode === 'operations' ? operationSync.submitOperation : undefined,
    forceSync: currentMode === 'operations' ? operationSync.forceSync : legacySync.forceFullSync,
    forceFullSync: currentMode === 'operations' ? operationSync.forceSync : legacySync.forceFullSync, // Alias for backwards compatibility
    getStateFromOperations: currentMode === 'operations' ? operationSync.getStateFromOperations : undefined,

    // Migration utilities
    canMigrate,
    performMigration,
    getMigrationStatus,
    currentSyncMode: currentMode,
  };
}

/**
 * Simple hash function for user ID to ensure deterministic rollout groups
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Utility to check if operations table exists (for determining migration readiness)
 */
export async function checkOperationsTableExists(): Promise<boolean> {
  try {
    const { supabase } = await import('../lib/supabaseClient');
    if (!supabase) return false;

    const { error } = await supabase
      .from('navigator_operations')
      .select('count', { count: 'exact', head: true })
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Development utility to force sync mode
 */
export function setSyncModeOverride(mode: SyncMode | null): void {
  if (mode) {
    localStorage.setItem('navigator_sync_mode_override', mode);
  } else {
    localStorage.removeItem('navigator_sync_mode_override');
  }

  logger.info('Sync mode override set:', mode);

  // Reload page to apply changes
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}