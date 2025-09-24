// src/sync/operationSync.ts - Operation-based cloud sync service
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { AppState } from "../types";
import type { Operation } from "./operations";
import { createOperation, nextSequence } from "./operations";
import { OperationLogManager, getOperationLog } from "./operationLog";
import { reconstructState } from "./reducer";
import { processOperationsWithConflictResolution } from "./conflictResolution";
import { logger } from "../utils/logger";

type UseOperationSync = {
  user: User | null;
  isLoading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  clearError: () => void;

  // Auth methods (same as before)
  signIn: (email: string, password: string) => Promise<{ user: User }>;
  signUp: (email: string, password: string) => Promise<{ user: User }>;
  signOut: () => Promise<void>;

  // New operation-based methods
  submitOperation: (operation: Omit<Operation, 'id' | 'timestamp' | 'clientId' | 'sequence'>) => Promise<void>;
  subscribeToOperations: (onOperations: (operations: Operation[]) => void) => () => void;
  forceSync: () => Promise<void>;
  getStateFromOperations: () => AppState;
};

const INITIAL_STATE: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1,
  subscription: null,
  reminderSettings: {
    enabled: false,
    agentName: 'Navigator Assistant',
    agentPersonality: 'professional',
    messageTemplates: {
      initial: 'Hello {customerName}, this is {agentName} from your service team.',
      followup: 'Hi {customerName}, following up on our previous arrangement.',
      reminder: 'Hello {customerName}, just a friendly reminder about your upcoming appointment.',
      cancellation: 'Hi {customerName}, unfortunately we need to reschedule your appointment.',
    },
    scheduleSettings: {
      reminderMinutes: [60, 1440], // 1 hour and 24 hours before
      workingHours: { start: '09:00', end: '17:00' },
      workingDays: [1, 2, 3, 4, 5], // Monday to Friday
    }
  },
  reminderNotifications: [],
  lastReminderProcessed: undefined,
};

export function useOperationSync(): UseOperationSync {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Operation log and state management
  const operationLog = useRef<OperationLogManager | null>(null);
  const [currentState, setCurrentState] = useState<AppState>(INITIAL_STATE);
  const deviceId = useRef<string>('');

  // Subscription cleanup
  const subscriptionCleanup = useRef<(() => void) | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Initialize device ID and operation log
  useEffect(() => {
    const initializeSync = async () => {
      try {
        // Get or create device ID
        let storedDeviceId = localStorage.getItem('navigator_device_id');
        if (!storedDeviceId) {
          storedDeviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          localStorage.setItem('navigator_device_id', storedDeviceId);
        }
        deviceId.current = storedDeviceId;

        // Initialize operation log
        operationLog.current = getOperationLog(storedDeviceId);
        await operationLog.current.load();

        // Reconstruct state from operations
        const operations = operationLog.current.getAllOperations();
        const reconstructedState = reconstructState(INITIAL_STATE, operations);
        setCurrentState(reconstructedState);

        logger.info('Operation sync initialized:', {
          deviceId: storedDeviceId,
          operationCount: operations.length,
        });
      } catch (err) {
        logger.error('Failed to initialize operation sync:', err);
        setError('Failed to initialize sync system');
      }
    };

    initializeSync();
  }, []);

  // Auth bootstrap (same as original)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!supabase) {
          if (mounted) {
            setError("Supabase not configured");
            setIsLoading(false);
          }
          return;
        }
        const { data, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (mounted) setUser(data.user ?? null);
      } catch (e: any) {
        if (mounted) setError(e?.message || String(e));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    if (!supabase) return () => { mounted = false; };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Online/offline tracking
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      // Trigger sync when coming back online
      if (user && operationLog.current) {
        setTimeout(() => forceSync(), 100);
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [user]);

  // Submit a new operation
  const submitOperation = useCallback(async (
    operationData: Omit<Operation, 'id' | 'timestamp' | 'clientId' | 'sequence'>
  ): Promise<void> => {
    if (!operationLog.current) {
      throw new Error('Operation log not initialized');
    }

    // Create full operation
    const operation = createOperation(
      operationData.type as any,
      operationData.payload,
      deviceId.current,
      nextSequence()
    );

    // Add to local log
    await operationLog.current.append({
      ...operation,
      sequence: operation.sequence,
    });

    // Apply to local state immediately for optimistic update
    const newState = reconstructState(INITIAL_STATE, operationLog.current.getAllOperations());
    setCurrentState(newState);

    // Sync to cloud if online
    if (isOnline && user) {
      try {
        await syncOperationsToCloud();
      } catch (err) {
        logger.warn('Failed to sync operation to cloud:', err);
        // Operation is still saved locally and will sync later
      }
    }

    logger.debug('Submitted operation:', {
      type: operation.type,
      id: operation.id,
    });
  }, [isOnline, user]);

  // Sync operations to cloud
  const syncOperationsToCloud = useCallback(async () => {
    if (!operationLog.current || !user || !supabase) return;

    setIsSyncing(true);
    try {
      const unsyncedOps = operationLog.current.getUnsyncedOperations();

      if (unsyncedOps.length === 0) {
        return; // Nothing to sync
      }

      // Upload operations to cloud
      for (const operation of unsyncedOps) {
        const { error } = await supabase
          .from('navigator_operations')
          .insert({
            user_id: user.id,
            operation_id: operation.id,
            sequence_number: operation.sequence,
            operation_type: operation.type,
            operation_data: operation,
            client_id: operation.clientId,
            timestamp: operation.timestamp,
          });

        if (error && error.code !== '23505') { // Ignore duplicate key errors
          throw error;
        }
      }

      // Mark operations as synced
      const maxSequence = Math.max(...unsyncedOps.map(op => op.sequence));
      operationLog.current.markSyncedUpTo(maxSequence);
      setLastSyncTime(new Date());

      logger.info('Synced operations to cloud:', {
        count: unsyncedOps.length,
        maxSequence,
      });
    } catch (err) {
      logger.error('Failed to sync operations to cloud:', err);
      setError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // Fetch operations from cloud
  const fetchOperationsFromCloud = useCallback(async () => {
    if (!operationLog.current || !user || !supabase) return;

    try {
      const lastSequence = operationLog.current.getLogState().lastSyncSequence;

      const { data, error } = await supabase
        .from('navigator_operations')
        .select('operation_data')
        .eq('user_id', user.id)
        .gt('sequence_number', lastSequence)
        .order('sequence_number', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const remoteOperations: Operation[] = data.map(row => row.operation_data);

        // Merge remote operations and resolve conflicts
        const newOperations = await operationLog.current!.mergeRemoteOperations(remoteOperations);

        if (newOperations.length > 0) {
          // Apply conflict resolution
          const { validOperations, conflictsResolved } = processOperationsWithConflictResolution(
            newOperations,
            currentState
          );

          if (conflictsResolved > 0) {
            logger.info('Resolved conflicts during sync:', conflictsResolved);
          }

          // Reconstruct state from all operations
          const allOperations = operationLog.current.getAllOperations();
          const newState = reconstructState(INITIAL_STATE, allOperations);
          setCurrentState(newState);
        }
      }

      setLastSyncTime(new Date());
    } catch (err) {
      logger.error('Failed to fetch operations from cloud:', err);
      setError(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [user, currentState]);

  // Force sync
  const forceSync = useCallback(async () => {
    await Promise.all([
      syncOperationsToCloud(),
      fetchOperationsFromCloud(),
    ]);
  }, [syncOperationsToCloud, fetchOperationsFromCloud]);

  // Subscribe to operation changes
  const subscribeToOperations = useCallback(
    (onOperations: (operations: Operation[]) => void) => {
      if (!user || !supabase) return () => {};

      const channel = supabase.channel(`navigator_operations_${user.id}`);

      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "navigator_operations",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload: any) => {
          try {
            const operation: Operation = payload.new.operation_data;

            // Skip our own operations
            if (operation.clientId === deviceId.current) return;

            if (operationLog.current) {
              const newOps = await operationLog.current.mergeRemoteOperations([operation]);

              if (newOps.length > 0) {
                // Reconstruct state and notify
                const allOperations = operationLog.current.getAllOperations();
                const newState = reconstructState(INITIAL_STATE, allOperations);
                setCurrentState(newState);
                onOperations(newOps);
              }
            }
          } catch (err) {
            logger.error('Error processing real-time operation:', err);
          }
        }
      );

      channel.subscribe();

      const cleanup = () => {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      };

      subscriptionCleanup.current = cleanup;
      return cleanup;
    },
    [user]
  );

  // Get current state (computed from operations)
  const getStateFromOperations = useCallback((): AppState => {
    return currentState;
  }, [currentState]);

  // Auth methods (simplified - focusing on operation sync)
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user! };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { user: data.user! };
  }, []);

  const signOut = useCallback(async () => {
    if (subscriptionCleanup.current) {
      subscriptionCleanup.current();
      subscriptionCleanup.current = null;
    }
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Clear local operation log on sign out
    if (operationLog.current) {
      await operationLog.current.clear();
    }
    setCurrentState(INITIAL_STATE);
  }, []);

  // Auto-sync on state changes
  useEffect(() => {
    if (!user || !isOnline || !operationLog.current) return;

    const syncTimer = setTimeout(async () => {
      try {
        await syncOperationsToCloud();
      } catch (err) {
        // Sync errors are already handled in syncOperationsToCloud
      }
    }, 1000);

    return () => clearTimeout(syncTimer);
  }, [user, isOnline, syncOperationsToCloud]);

  return useMemo<UseOperationSync>(
    () => ({
      user,
      isLoading,
      isOnline,
      isSyncing,
      error,
      lastSyncTime,
      clearError,
      signIn,
      signUp,
      signOut,
      submitOperation,
      subscribeToOperations,
      forceSync,
      getStateFromOperations,
    }),
    [
      user,
      isLoading,
      isOnline,
      isSyncing,
      error,
      lastSyncTime,
      clearError,
      signIn,
      signUp,
      signOut,
      submitOperation,
      subscribeToOperations,
      forceSync,
      getStateFromOperations,
    ]
  );
}