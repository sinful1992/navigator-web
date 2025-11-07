// src/useAppStateV2.ts - Enhanced app state with operation-based sync
import * as React from "react";
import type {
  AddressRow,
  AppState,
  Completion,
  Outcome,
  DaySession,
  Arrangement,
  UserSubscription,
  ReminderSettings,
} from "./types";
import type { Operation } from "./sync/operations";
import { useUnifiedSync } from "./sync/migrationAdapter";
import { logger } from "./utils/logger";

const DEVICE_ID_KEY = "navigator_device_id";

/**
 * Enhanced useAppState hook with operation-based sync support
 * Maintains backward compatibility while adding new capabilities
 */
export function useAppStateV2() {
  const unifiedSync = useUnifiedSync();

  // Get device ID
  const deviceId = React.useMemo(() => {
    try {
      const existing = localStorage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const generated =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? (crypto as any).randomUUID()
          : "dev_" + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_ID_KEY, generated);
      return generated;
    } catch {
      return "dev_" + Math.random().toString(36).slice(2);
    }
  }, []);

  // State management
  const [state, setState] = React.useState<AppState>(() => {
    // Initialize with operations state if available
    if (unifiedSync.currentSyncMode === 'operations' && unifiedSync.getStateFromOperations) {
      return unifiedSync.getStateFromOperations();
    }

    // Otherwise use default initial state
    return {
      addresses: [],
      activeIndex: null,
      completions: [],
      daySessions: [],
      arrangements: [],
      currentListVersion: 1,
      subscription: null,
      reminderSettings: undefined,
      reminderNotifications: [],
      lastReminderProcessed: undefined,
    };
  });

  const [loading, setLoading] = React.useState(true);

  // Subscribe to state changes from unified sync
  React.useEffect(() => {
    const cleanup = unifiedSync.subscribeToData(setState);

    setLoading(false);
    return cleanup;
  }, [unifiedSync]);

  // Helper to submit operation or fall back to direct state update
  const submitOperationOrUpdate = React.useCallback(async (
    operationType: Operation['type'],
    payload: any,
    stateUpdater?: (prev: AppState) => AppState
  ) => {
    if (unifiedSync.currentSyncMode === 'operations' && unifiedSync.submitOperation) {
      try {
        await unifiedSync.submitOperation({
          type: operationType,
          payload,
        });
        // State will be updated via subscription
      } catch (error) {
        logger.error('Failed to submit operation:', error);
        // Fall back to direct state update
        if (stateUpdater) {
          setState(stateUpdater);
        }
      }
    } else {
      // Legacy mode - direct state update
      if (stateUpdater) {
        setState(stateUpdater);
      }
    }
  }, [unifiedSync.currentSyncMode, unifiedSync.submitOperation, deviceId]);

  // Enhanced actions that work with both sync modes

  /** Import a new Excel list */
  const setAddresses = React.useCallback(
    async (rows: AddressRow[], preserveCompletions = true) => {
      const validRows = Array.isArray(rows) ? rows.filter(row =>
        row && typeof row.address === 'string' && row.address.trim().length > 0
      ) : [];

      if (validRows.length === 0) {
        logger.warn('No valid addresses to import');
        return;
      }

      const currentVersion =
        typeof state.currentListVersion === "number"
          ? state.currentListVersion
          : 1;
      const newListVersion = currentVersion + 1;

      await submitOperationOrUpdate(
        'ADDRESS_BULK_IMPORT',
        {
          addresses: validRows,
          newListVersion,
          preserveCompletions,
        },
        (s) => ({
          ...s,
          addresses: validRows,
          activeIndex: null,
          currentListVersion: newListVersion,
          completions: preserveCompletions ? s.completions : [],
        })
      );
    },
    [state.currentListVersion, submitOperationOrUpdate]
  );

  /** Add a single address */
  const addAddress = React.useCallback(
    async (addressRow: AddressRow): Promise<number> => {
      return new Promise<number>((resolve) => {
        if (!addressRow || !addressRow.address?.trim()) {
          resolve(-1);
          return;
        }

        const newIndex = state.addresses.length;

        submitOperationOrUpdate(
          'ADDRESS_ADD',
          { address: addressRow },
          (s) => {
            const newAddresses = [...s.addresses, addressRow];
            resolve(newAddresses.length - 1);
            return { ...s, addresses: newAddresses };
          }
        );

        // For operations mode, resolve immediately with expected index
        if (unifiedSync.currentSyncMode === 'operations') {
          resolve(newIndex);
        }
      });
    },
    [state.addresses.length, submitOperationOrUpdate, unifiedSync.currentSyncMode]
  );

  /** Set active address index */
  const setActive = React.useCallback(
    async (idx: number) => {
      await submitOperationOrUpdate(
        'ACTIVE_INDEX_SET',
        { index: idx },
        (s) => ({ ...s, activeIndex: idx })
      );
    },
    [submitOperationOrUpdate]
  );

  /** Cancel active address */
  const cancelActive = React.useCallback(
    async () => {
      await submitOperationOrUpdate(
        'ACTIVE_INDEX_SET',
        { index: null },
        (s) => ({ ...s, activeIndex: null })
      );
    },
    [submitOperationOrUpdate]
  );

  /** Complete an address */
  const complete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string): Promise<string> => {
      const address = state.addresses[index];
      if (!address) {
        throw new Error(`Address at index ${index} not found`);
      }

      // Check if already completed
      const existingCompletion = state.completions.find(
        (c) => c.index === index && c.listVersion === state.currentListVersion
      );
      if (existingCompletion) {
        throw new Error(`Address at index ${index} is already completed`);
      }

      const nowISO = new Date().toISOString();
      const completion: Completion = {
        index,
        address: address.address,
        lat: address.lat ?? null,
        lng: address.lng ?? null,
        outcome,
        amount,
        timestamp: nowISO,
        listVersion: state.currentListVersion,
        arrangementId,
      };

      await submitOperationOrUpdate(
        'COMPLETION_CREATE',
        { completion },
        (s) => ({
          ...s,
          completions: [completion, ...s.completions],
          activeIndex: s.activeIndex === index ? null : s.activeIndex,
        })
      );

      return completion.timestamp;
    },
    [state.addresses, state.completions, state.currentListVersion, submitOperationOrUpdate]
  );

  /** Undo a completion */
  const undo = React.useCallback(
    async (index: number) => {
      const completion = state.completions.find(
        (c) => c.index === index && c.listVersion === state.currentListVersion
      );

      if (!completion) {
        logger.warn('No completion found to undo for index:', index);
        return;
      }

      await submitOperationOrUpdate(
        'COMPLETION_DELETE',
        {
          timestamp: completion.timestamp,
          index: completion.index,
          listVersion: completion.listVersion,
        },
        (s) => ({
          ...s,
          completions: s.completions.filter(c => c.timestamp !== completion.timestamp),
        })
      );
    },
    [state.completions, state.currentListVersion, submitOperationOrUpdate]
  );

  /** Start a day session */
  const startDay = React.useCallback(
    async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      // Check if already active
      const activeTodaySession = state.daySessions.find(
        (d) => d.date === today && !d.end
      );

      if (activeTodaySession) {
        logger.info('Day already active for today, skipping start');
        return;
      }

      const session: DaySession = {
        date: today,
        start: now.toISOString(),
      };

      await submitOperationOrUpdate(
        'SESSION_START',
        { session },
        (s) => {
          // Auto-close stale sessions
          const updatedSessions = s.daySessions.map((session) => {
            if (session.date < today && !session.end) {
              return {
                ...session,
                end: new Date(session.date + 'T23:59:59.999Z').toISOString(),
                durationSeconds: Math.floor(
                  (new Date(session.date + 'T23:59:59.999Z').getTime() -
                   new Date(session.start || new Date()).getTime()) / 1000
                )
              };
            }
            return session;
          });

          return {
            ...s,
            daySessions: [...updatedSessions, session]
          };
        }
      );
    },
    [state.daySessions, submitOperationOrUpdate]
  );

  /** End the current day session */
  const endDay = React.useCallback(
    async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const endTime = now.toISOString();

      // Find active session for today
      const activeSession = state.daySessions.find(
        (d) => d.date === today && !d.end
      );

      if (!activeSession) {
        logger.info('No active session to end for today');
        return;
      }

      await submitOperationOrUpdate(
        'SESSION_END',
        { date: today, endTime },
        (s) => ({
          ...s,
          daySessions: s.daySessions.map(session => {
            if (session.date === today && !session.end) {
              const startTime = new Date(session.start || new Date()).getTime();
              const endTimeMs = new Date(endTime).getTime();
              const durationSeconds = Math.floor((endTimeMs - startTime) / 1000);

              return {
                ...session,
                end: endTime,
                durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
              };
            }
            return session;
          }),
        })
      );
    },
    [state.daySessions, submitOperationOrUpdate]
  );

  /** Add arrangement */
  const addArrangement = React.useCallback(
    async (arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">): Promise<string> => {
      const now = new Date().toISOString();
      const id = `arr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const newArrangement: Arrangement = {
        ...arrangementData,
        id,
        createdAt: now,
        updatedAt: now,
      };

      await submitOperationOrUpdate(
        'ARRANGEMENT_CREATE',
        { arrangement: newArrangement },
        (s) => ({
          ...s,
          arrangements: [...s.arrangements, newArrangement],
        })
      );

      return id;
    },
    [submitOperationOrUpdate]
  );

  /** Update arrangement */
  const updateArrangement = React.useCallback(
    async (id: string, updates: Partial<Arrangement>): Promise<void> => {
      await submitOperationOrUpdate(
        'ARRANGEMENT_UPDATE',
        { id, updates },
        (s) => ({
          ...s,
          arrangements: s.arrangements.map((arr) =>
            arr.id === id
              ? { ...arr, ...updates, updatedAt: new Date().toISOString() }
              : arr
          ),
        })
      );
    },
    [submitOperationOrUpdate]
  );

  /** Delete arrangement */
  const deleteArrangement = React.useCallback(
    async (id: string): Promise<void> => {
      await submitOperationOrUpdate(
        'ARRANGEMENT_DELETE',
        { id },
        (s) => ({
          ...s,
          arrangements: s.arrangements.filter((arr) => arr.id !== id),
        })
      );
    },
    [submitOperationOrUpdate]
  );

  /** Set subscription */
  const setSubscription = React.useCallback(
    (subscription: UserSubscription | null) => {
      setState((s) => ({ ...s, subscription }));
    },
    []
  );

  /** Update reminder settings */
  const updateReminderSettings = React.useCallback(
    (settings: ReminderSettings) => {
      setState((s) => ({ ...s, reminderSettings: settings }));
    },
    []
  );

  /** Backup state */
  const backupState = React.useCallback((): AppState => {
    return { ...state };
  }, [state]);

  /** Restore state */
  const restoreState = React.useCallback(
    async (obj: unknown, _mergeStrategy: "replace" | "merge" = "replace") => {
      // For operations mode, convert restored state to operations
      if (unifiedSync.currentSyncMode === 'operations') {
        logger.info('Restoring state in operations mode - converting to operations');
        // This would need to convert the restored state to operations
        // For now, fall back to direct state update
      }

      // Direct state update for legacy mode or fallback
      if (typeof obj === 'object' && obj !== null) {
        setState(obj as AppState);
      }
    },
    [unifiedSync.currentSyncMode]
  );

  // Migration utilities
  const migrationStatus = unifiedSync.getMigrationStatus();

  return {
    // Core state
    state,
    loading,
    setState,

    // Sync properties
    user: unifiedSync.user,
    isOnline: unifiedSync.isOnline,
    isSyncing: unifiedSync.isSyncing,
    error: unifiedSync.error,
    lastSyncTime: unifiedSync.lastSyncTime,
    clearError: unifiedSync.clearError,

    // Device info
    deviceId,

    // Actions
    setAddresses,
    addAddress,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
    addArrangement,
    updateArrangement,
    deleteArrangement,
    setSubscription,
    updateReminderSettings,
    backupState,
    restoreState,

    // Migration utilities
    canMigrate: unifiedSync.canMigrate,
    performMigration: unifiedSync.performMigration,
    migrationStatus,
    currentSyncMode: unifiedSync.currentSyncMode,

    // Operation-specific methods (when available)
    submitOperation: unifiedSync.submitOperation,
    forceSync: unifiedSync.forceSync,
  };
}

export default useAppStateV2;