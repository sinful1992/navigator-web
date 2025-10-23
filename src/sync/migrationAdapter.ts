// src/sync/migrationAdapter.ts - Delta sync adapter (operations-only)
import type React from "react";
import type { AppState } from "../types";
import { useOperationSync } from "./operationSync";

/**
 * Unified sync hook - now only supports operation-based delta sync
 * Legacy sync has been completely removed
 */
export function useUnifiedSync() {
  const operationSync = useOperationSync();

  // Wrap subscribeToOperations to match the expected interface
  const subscribeToData = (onChange: React.Dispatch<React.SetStateAction<AppState>>): (() => void) => {
    return operationSync.subscribeToOperations((_operations) => {
      // Reconstruct state from operations and notify
      const state = operationSync.getStateFromOperations();
      onChange(state);
    });
  };

  // syncData is a no-op in operations mode
  // Operations are auto-synced via submitOperation() called by app actions
  const syncData = async (_state: AppState): Promise<void> => {
    // No-op: operations are automatically synced when submitted
    return Promise.resolve();
  };

  return {
    // Core sync properties
    user: operationSync.user,
    isLoading: operationSync.isLoading,
    isOnline: operationSync.isOnline,
    isSyncing: operationSync.isSyncing,
    error: operationSync.error,
    lastSyncTime: operationSync.lastSyncTime,
    clearError: operationSync.clearError,

    // Auth methods
    signIn: operationSync.signIn,
    signUp: operationSync.signUp,
    signOut: operationSync.signOut,
    resetPassword: operationSync.resetPassword,
    updatePassword: operationSync.updatePassword,

    // Sync methods
    syncData,
    subscribeToData,
    submitOperation: operationSync.submitOperation,
    forceSync: operationSync.forceSync,
    forceFullSync: operationSync.forceSync, // Alias for legacy compatibility
    getStateFromOperations: operationSync.getStateFromOperations,

    // Migration stubs (no longer needed, but kept for compatibility)
    canMigrate: () => false,
    performMigration: async () => { throw new Error('Migration not needed - already using operations mode'); },
    getMigrationStatus: () => ({
      currentMode: 'operations' as const,
      canMigrate: false,
      config: { mode: 'operations' as const, rolloutPercentage: 100, migrationEnabled: false }
    }),

    // Mode info
    currentSyncMode: 'operations' as const,
  };
}

/**
 * Utility to check if operations table exists
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
