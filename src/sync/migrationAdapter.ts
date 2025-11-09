// src/sync/migrationAdapter.ts - Delta sync adapter (operations-only)
import type React from "react";
import type { AppState } from "../types";
import { useOperationSync } from "./operationSync";
import { logger } from "../utils/logger";
import { reconstructState } from "./reducer";
import { DEFAULT_REMINDER_SETTINGS } from "../services/reminderScheduler";
import { DEFAULT_BONUS_SETTINGS } from "../utils/bonusCalculator";

// Fresh initial state for reconstruction
const INITIAL_STATE: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1,
  subscription: null,
  reminderSettings: DEFAULT_REMINDER_SETTINGS,
  reminderNotifications: [],
  lastReminderProcessed: undefined,
  bonusSettings: DEFAULT_BONUS_SETTINGS,
};

/**
 * Unified sync hook - now only supports operation-based delta sync
 * Legacy sync has been completely removed
 */
export function useUnifiedSync() {
  const operationSync = useOperationSync();

  // Wrap subscribeToOperations to match the expected interface
  const subscribeToData = (onChange: React.Dispatch<React.SetStateAction<AppState>>): (() => void) => {
    return operationSync.subscribeToOperations((allOperations) => {
      // 🔧 CRITICAL FIX: Reconstruct state from ALL operations, not from React currentState
      // The allOperations parameter now contains the COMPLETE operation history from the log,
      // not just the delta/new operations. This avoids the race condition where React's
      // async setState hasn't completed yet, causing stale state to be returned.
      // By reconstructing from allOperations, we get the guaranteed correct state.
      const state = reconstructState(INITIAL_STATE, allOperations);
      logger.debug('📤 subscribeToData: Notifying App.tsx with state:', {
        addresses: state.addresses?.length,
        completions: state.completions?.length,
        arrangements: state.arrangements?.length,
        daySessions: state.daySessions?.length,
        operationCount: allOperations.length,
      });
      onChange(state);
    });
  };

  // 🔧 CRITICAL: Get the operation log state for restore operations
  // This is needed to preserve lastSyncTimestamp during backup restore
  const getOperationLogState = () => {
    const logState = operationSync.getOperationLogState?.();
    return logState;
  };

  // syncData converts bulk state changes into operations
  // This is called when importing from backup or restoring from cloud
  const syncData = async (newState: AppState): Promise<void> => {
    if (!operationSync.user) {
      return; // Not authenticated, can't sync
    }

    // 🔧 CRITICAL FIX: Preserve timestamp tracking during backup restore
    // This prevents re-downloading operations we already have
    const opLogState = operationSync.getOperationLogState?.();
    if (opLogState && opLogState.lastSyncTimestamp) {
      logger.info('📋 RESTORE: Preserving sync timestamp:', {
        previousLastSynced: opLogState.lastSyncTimestamp,
        operations: opLogState.operations.length,
      });
      // Timestamp cursor will continue tracking from this point
      // No action needed - just documenting for clarity
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
    getOperationLogState, // 🔧 FIX: Export for restore operations
    clearOperationLogForRestore: operationSync.clearOperationLogForRestore, // 🔧 FIX: Clear with timestamp preservation

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
