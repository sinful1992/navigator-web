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
    // 🔧 CRITICAL FIX: Track whether this is the first notification for this subscription
    // The first notification happens immediately when subscription is set up,
    // which might be BEFORE bootstrap completes on a new device.
    let isFirstNotification = true;

    return operationSync.subscribeToOperations((operations) => {
      console.log('📥 subscribeToData callback fired:', {
        isFirst: isFirstNotification,
        operationCount: operations.length,
      });

      // 🔧 FIX: Handle first notification specially to avoid race condition
      if (isFirstNotification) {
        isFirstNotification = false;

        // SCENARIO 1: Bootstrap completed before subscription (has operations)
        // SCENARIO 2: Local data exists (has operations)
        // → Notify with current state
        if (operations.length > 0) {
          const state = operationSync.getStateFromOperations();
          console.log('📤 subscribeToData (first): Notifying with existing state:', {
            addresses: state.addresses?.length,
            completions: state.completions?.length,
            arrangements: state.arrangements?.length,
          });
          onChange(state);
        } else {
          // SCENARIO 3: Subscription set up before bootstrap completes (no operations yet)
          // → Don't notify yet, wait for bootstrap to complete and trigger callback
          console.log('⏳ subscribeToData (first): No operations yet, waiting for bootstrap');
        }
        return;
      }

      // All subsequent notifications (bootstrap completion, real-time updates, etc.)
      const state = operationSync.getStateFromOperations();
      console.log('📤 subscribeToData (update): Notifying with updated state:', {
        addresses: state.addresses?.length,
        completions: state.completions?.length,
        arrangements: state.arrangements?.length,
      });
      onChange(state);
    });
  };

  // syncData converts bulk state changes into operations
  // This is called when importing from backup or restoring from cloud
  const syncData = async (newState: AppState): Promise<void> => {
    if (!operationSync.user) {
      return; // Not authenticated, can't sync
    }

    const currentState = operationSync.getStateFromOperations();

    // 🔧 FIX: Submit operations for all differences between current and new state
    // This ensures bulk imports (backup restore, cloud restore) sync to other devices

    // 1. Sync addresses if they changed
    if (JSON.stringify(currentState.addresses) !== JSON.stringify(newState.addresses)) {
      await operationSync.submitOperation({
        type: 'ADDRESS_BULK_IMPORT',
        payload: {
          addresses: newState.addresses,
          newListVersion: newState.currentListVersion || 1,
          preserveCompletions: true,
        },
      });
    }

    // 2. Sync completions - find new ones not in current state
    const currentCompletionKeys = new Set(
      currentState.completions.map(c => `${c.timestamp}_${c.index}_${c.listVersion || 1}`)
    );
    const newCompletions = newState.completions.filter(c =>
      !currentCompletionKeys.has(`${c.timestamp}_${c.index}_${c.listVersion || 1}`)
    );
    for (const completion of newCompletions) {
      await operationSync.submitOperation({
        type: 'COMPLETION_CREATE',
        payload: { completion },
      });
    }

    // 3. Sync arrangements - find new ones not in current state
    const currentArrangementIds = new Set(currentState.arrangements.map(a => a.id));
    const newArrangements = newState.arrangements.filter(a => !currentArrangementIds.has(a.id));
    for (const arrangement of newArrangements) {
      await operationSync.submitOperation({
        type: 'ARRANGEMENT_CREATE',
        payload: { arrangement },
      });
    }

    // 4. Sync sessions - find new ones not in current state
    const currentSessionKeys = new Set(
      currentState.daySessions.map(s => `${s.date}_${s.start}`)
    );
    const newSessions = newState.daySessions.filter(s =>
      !currentSessionKeys.has(`${s.date}_${s.start}`)
    );
    for (const session of newSessions) {
      await operationSync.submitOperation({
        type: 'SESSION_START',
        payload: { session },
      });
    }

    // 5. Sync settings if changed
    if (JSON.stringify(currentState.subscription) !== JSON.stringify(newState.subscription)) {
      await operationSync.submitOperation({
        type: 'SETTINGS_UPDATE_SUBSCRIPTION',
        payload: { subscription: newState.subscription ?? null },
      });
    }

    // Only sync reminder settings if both are defined and different
    if (newState.reminderSettings && JSON.stringify(currentState.reminderSettings) !== JSON.stringify(newState.reminderSettings)) {
      await operationSync.submitOperation({
        type: 'SETTINGS_UPDATE_REMINDER',
        payload: { settings: newState.reminderSettings },
      });
    }

    // Only sync bonus settings if both are defined and different
    if (newState.bonusSettings && JSON.stringify(currentState.bonusSettings) !== JSON.stringify(newState.bonusSettings)) {
      await operationSync.submitOperation({
        type: 'SETTINGS_UPDATE_BONUS',
        payload: { settings: newState.bonusSettings },
      });
    }
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
