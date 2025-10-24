// src/sync/operationSync.ts - Operation-based cloud sync service
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { AppState } from "../types";
import type { Operation } from "./operations";
import { OperationLogManager, getOperationLog, clearOperationLogsForUser, getOperationLogStats } from "./operationLog";
import { reconstructState } from "./reducer";
import { logger } from "../utils/logger";

type UseOperationSync = {
  user: User | null;
  isLoading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  clearError: () => void;

  // Auth methods
  signIn: (email: string, password: string) => Promise<{ user: User }>;
  signUp: (email: string, password: string) => Promise<{ user: User }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;

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
  reminderSettings: undefined,
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

  // State change listeners (for notifying App.tsx of local operations)
  const stateChangeListeners = useRef<Set<(operations: Operation[]) => void>>(new Set());

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

        // Initialize operation log (will be re-initialized with user ID when user signs in)
        // Using 'local' as placeholder until user is authenticated
        operationLog.current = getOperationLog(storedDeviceId, 'local');
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

  // Re-initialize operation log when user changes
  useEffect(() => {
    if (!user || !deviceId.current) return;

    const initUserOperationLog = async () => {
      try {
        logger.info('🔄 Initializing operation log for user:', user.id);

        // Get operation log for this user (this ensures proper user isolation)
        operationLog.current = getOperationLog(deviceId.current, user.id);
        await operationLog.current.load();

        // Reconstruct state from local operations first
        const operations = operationLog.current.getAllOperations();
        const reconstructedState = reconstructState(INITIAL_STATE, operations);
        setCurrentState(reconstructedState);

        logger.info('✅ Operation log initialized:', {
          userId: user.id,
          deviceId: deviceId.current,
          operationCount: operations.length,
        });

        // Now fetch any new operations from cloud
        if (isOnline && supabase) {
          logger.info('🔄 BOOTSTRAP: Fetching operations from cloud for user:', user.id);

          // Inline fetch to avoid dependency issues
          const lastSequence = operationLog.current.getLogState().lastSyncSequence;

          const { data, error } = await supabase
            .from('navigator_operations')
            .select('operation_data')
            .eq('user_id', user.id)
            .gt('sequence_number', lastSequence)
            .order('sequence_number', { ascending: true });

          if (error) {
            logger.error('❌ BOOTSTRAP FETCH FAILED:', error.message);
          } else if (data && data.length > 0) {
            logger.info(`📥 BOOTSTRAP: Received ${data.length} operations`);

            const remoteOperations: Operation[] = data.map(row => row.operation_data);
            const newOps = await operationLog.current.mergeRemoteOperations(remoteOperations);

            if (newOps.length > 0) {
              const maxSeq = Math.max(...remoteOperations.map(op => op.sequence));
              if (Number.isFinite(maxSeq)) {
                await operationLog.current.markSyncedUpTo(maxSeq);
              }

              // Reconstruct state with merged operations
              const allOps = operationLog.current.getAllOperations();
              const newState = reconstructState(INITIAL_STATE, allOps);
              setCurrentState(newState);

              logger.info('✅ BOOTSTRAP: Complete with remote operations');
            }
          } else {
            logger.info('✅ BOOTSTRAP: No new operations on server');
          }

          setLastSyncTime(new Date());
        }
      } catch (err) {
        logger.error('Failed to initialize user operation log:', err);
      }
    };

    initUserOperationLog();
  }, [user?.id, isOnline]);

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

  // Operation batching for backpressure control
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingBatchRef = useRef<boolean>(false);

  // Trigger batch sync with debouncing
  const scheduleBatchSync = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }

    if (pendingBatchRef.current) {
      return; // Already syncing
    }

    batchTimerRef.current = setTimeout(async () => {
      if (!isOnline || !user || !operationLog.current) return;

      const unsyncedCount = operationLog.current.getUnsyncedOperations().length;

      // Only sync if we have operations to sync
      if (unsyncedCount > 0) {
        try {
          pendingBatchRef.current = true;
          await syncOperationsToCloud();
        } catch (err) {
          logger.warn('Batch sync failed:', err);
        } finally {
          pendingBatchRef.current = false;
        }
      }
    }, 2000); // 2 second debounce
  }, [isOnline, user]);

  // Submit a new operation
  const submitOperation = useCallback(async (
    operationData: Omit<Operation, 'id' | 'timestamp' | 'clientId' | 'sequence'>
  ): Promise<void> => {
    if (!operationLog.current) {
      logger.error('❌ SYNC FAILURE: Operation log not initialized');
      throw new Error('Operation log not initialized');
    }

    if (!user) {
      logger.error('❌ SYNC FAILURE: No user authenticated - operation will NOT sync to cloud');
      logger.error('Operation type:', operationData.type);
      logger.error('This operation will be stored locally but never reach other devices!');
    }

    if (!supabase) {
      logger.error('❌ SYNC FAILURE: Supabase not configured - operation will NOT sync to cloud');
      logger.error('Operation type:', operationData.type);
    }

    // Create envelope without sequence - OperationLog will assign it
    const operationEnvelope = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      clientId: deviceId.current,
      type: operationData.type,
      payload: operationData.payload,
    } as Omit<Operation, 'sequence'>;

    // Add to local log (assigns sequence internally)
    const persistedOperation = await operationLog.current.append(operationEnvelope);

    // Apply to local state immediately for optimistic update
    const newState = reconstructState(INITIAL_STATE, operationLog.current.getAllOperations());
    setCurrentState(newState);

    // Notify all listeners of state change (critical for App.tsx to update!)
    stateChangeListeners.current.forEach(listener => {
      try {
        listener([persistedOperation]);
      } catch (err) {
        logger.error('Error in state change listener:', err);
      }
    });

    // Schedule batched sync instead of immediate sync
    if (isOnline && user) {
      logger.info('📤 Scheduling sync for operation:', operationData.type);
      scheduleBatchSync();
    } else {
      if (!isOnline) {
        logger.warn('⚠️ OFFLINE: Operation stored locally, will sync when online');
      }
      if (!user) {
        logger.warn('⚠️ NOT AUTHENTICATED: Operation stored locally but will NOT sync');
      }
    }

    logger.debug('Submitted operation:', {
      type: persistedOperation.type,
      id: persistedOperation.id,
      willSync: isOnline && !!user,
    });
  }, [isOnline, user, scheduleBatchSync]);

  // Sync operations to cloud
  const syncOperationsToCloud = useCallback(async () => {
    if (!operationLog.current || !user || !supabase) {
      logger.warn('⚠️ SYNC SKIPPED:', {
        hasOperationLog: !!operationLog.current,
        hasUser: !!user,
        hasSupabase: !!supabase,
      });
      return;
    }

    setIsSyncing(true);
    try {
      const unsyncedOps = operationLog.current.getUnsyncedOperations();

      if (unsyncedOps.length === 0) {
        logger.debug('✅ No unsynced operations');
        return; // Nothing to sync
      }

      logger.info(`📤 UPLOADING ${unsyncedOps.length} operations to cloud...`);

      // Upload operations to cloud
      for (const operation of unsyncedOps) {
        logger.debug('Uploading operation:', operation.type, operation.id);

        // Derive entity from operation type
        const entity = operation.type.includes('COMPLETION') ? 'completion'
          : operation.type.includes('ADDRESS') ? 'address'
          : operation.type.includes('SESSION') ? 'session'
          : operation.type.includes('ARRANGEMENT') ? 'arrangement'
          : operation.type.includes('ACTIVE_INDEX') ? 'active_index'
          : operation.type.includes('SETTINGS') ? 'settings'
          : 'unknown';

        const { error } = await supabase
          .from('navigator_operations')
          .insert({
            user_id: user.id,
            operation_id: operation.id,
            sequence_number: operation.sequence,
            type: operation.type,
            entity: entity,
            operation_data: operation,
            client_id: operation.clientId,
            timestamp: operation.timestamp,
            local_timestamp: operation.timestamp,
          });

        if (error && error.code !== '23505') { // Ignore duplicate key errors
          logger.error('❌ UPLOAD FAILED:', {
            operation: operation.type,
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
          throw error;
        }

        if (error?.code === '23505') {
          logger.debug('⚠️ Duplicate operation (already uploaded):', operation.id);
        }
      }

      // Mark operations as synced
      const maxSequence = Math.max(...unsyncedOps.map(op => op.sequence));
      await operationLog.current.markSyncedUpTo(maxSequence);
      setLastSyncTime(new Date());

      logger.info('✅ SYNC SUCCESS:', {
        count: unsyncedOps.length,
        maxSequence,
      });
    } catch (err) {
      logger.error('❌ SYNC FAILED:', err);
      // Don't mark as synced so we can retry later
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // Fetch operations from cloud
  const fetchOperationsFromCloud = useCallback(async () => {
    if (!operationLog.current || !user || !supabase) {
      logger.warn('⚠️ FETCH SKIPPED:', {
        hasOperationLog: !!operationLog.current,
        hasUser: !!user,
        hasSupabase: !!supabase,
      });
      return;
    }

    try {
      const lastSequence = operationLog.current.getLogState().lastSyncSequence;

      logger.info(`📥 FETCHING operations from cloud (after sequence ${lastSequence})...`);

      const { data, error } = await supabase
        .from('navigator_operations')
        .select('operation_data')
        .eq('user_id', user.id)
        .gt('sequence_number', lastSequence)
        .order('sequence_number', { ascending: true });

      if (error) {
        logger.error('❌ FETCH FAILED:', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      if (data && data.length > 0) {
        logger.info(`📥 RECEIVED ${data.length} operations from cloud`);

        const remoteOperations: Operation[] = data.map(row => row.operation_data);

        // Merge remote operations and resolve conflicts
        const newOperations = await operationLog.current!.mergeRemoteOperations(remoteOperations);

        if (newOperations.length > 0) {
          const maxRemoteSequence = Math.max(...remoteOperations.map(op => op.sequence));

          if (Number.isFinite(maxRemoteSequence)) {
            await operationLog.current!.markSyncedUpTo(maxRemoteSequence);
          }

          // Reconstruct state from all operations
          const allOperations = operationLog.current.getAllOperations();
          const newState = reconstructState(INITIAL_STATE, allOperations);
          setCurrentState(newState);

          logger.info('✅ FETCH SUCCESS: State updated with remote operations');
        } else {
          logger.debug('No new operations after merge (already had them)');
        }
      } else {
        logger.debug('✅ No new operations on server');
      }

      setLastSyncTime(new Date());
    } catch (err) {
      logger.error('❌ FETCH ERROR:', err);
    }
  }, [user]);

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
      if (!user || !supabase) {
        logger.warn('⚠️ SUBSCRIPTION SKIPPED:', {
          hasUser: !!user,
          hasSupabase: !!supabase,
        });
        return () => {};
      }

      logger.info('📡 SETTING UP real-time subscription for user:', user.id);

      // Register this listener for local operations (critical for App.tsx updates!)
      stateChangeListeners.current.add(onOperations);

      // Clean up existing subscription first to prevent duplicates
      if (subscriptionCleanup.current) {
        logger.debug('Cleaning up existing subscription before creating new one');
        subscriptionCleanup.current();
        subscriptionCleanup.current = null;
      }

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
            logger.info('📥 REAL-TIME: Received operation from another device');
            const operation: Operation = payload.new.operation_data;

            logger.debug('Operation details:', {
              type: operation.type,
              clientId: operation.clientId,
              myClientId: deviceId.current,
              sequence: operation.sequence,
            });

            // Skip our own operations
            if (operation.clientId === deviceId.current) {
              logger.debug('⏭️ Skipping own operation');
              return;
            }

            logger.info('✅ Processing remote operation:', operation.type);

            if (operationLog.current) {
              const newOps = await operationLog.current.mergeRemoteOperations([operation]);

              if (newOps.length > 0) {
                await operationLog.current.markSyncedUpTo(operation.sequence);

                // Reconstruct state and notify
                const allOperations = operationLog.current.getAllOperations();
                const newState = reconstructState(INITIAL_STATE, allOperations);
                setCurrentState(newState);
                onOperations(newOps);

                logger.info('✅ REAL-TIME SYNC: State updated with remote operation');
              } else {
                logger.debug('No new operations after merge (already had it)');
              }
            }
          } catch (err) {
            logger.error('❌ REAL-TIME ERROR: Failed to process operation:', err);
          }
        }
      );

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('✅ Real-time subscription CONNECTED successfully');
        } else if (status === 'CHANNEL_ERROR') {
          logger.error('❌ Real-time subscription ERROR');
        } else if (status === 'TIMED_OUT') {
          logger.error('❌ Real-time subscription TIMED OUT');
        } else if (status === 'CLOSED') {
          logger.warn('⚠️ Real-time subscription CLOSED');
        } else {
          logger.info('📡 SUBSCRIPTION STATUS:', status);
        }
      });

      logger.info('✅ Real-time subscription active');

      const cleanup = () => {
        logger.info('🔌 Cleaning up real-time subscription');

        // Remove from state change listeners
        stateChangeListeners.current.delete(onOperations);

        try {
          if (supabase) {
            supabase.removeChannel(channel);
          }
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

    // Clear operation logs for this user BEFORE signing out
    if (user?.id) {
      clearOperationLogsForUser(user.id);
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Clear local operation log reference
    if (operationLog.current) {
      await operationLog.current.clear();
      operationLog.current = null;
    }
    setCurrentState(INITIAL_STATE);
  }, [user]);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  // Auto-sync unsynced operations after initialization
  // This handles restored operations from backup that weren't uploaded
  useEffect(() => {
    logger.info('🔍 AUTO-SYNC EFFECT TRIGGERED:', {
      hasUser: !!user,
      userId: user?.id,
      isOnline,
      isLoading,
      hasOperationLog: !!operationLog.current,
      hasSupabase: !!supabase,
    });

    if (!user || !isOnline || !operationLog.current || isLoading || !supabase) {
      logger.warn('⚠️ AUTO-SYNC SKIPPED - conditions not met:', {
        hasUser: !!user,
        isOnline,
        hasOperationLog: !!operationLog.current,
        isLoading,
        hasSupabase: !!supabase,
      });
      return;
    }

    const checkAndSyncUnsynced = async () => {
      try {
        const unsyncedOps = operationLog.current?.getUnsyncedOperations() || [];
        if (unsyncedOps.length > 0) {
          logger.info(`📤 AUTO-SYNC: Found ${unsyncedOps.length} unsynced operations on startup, triggering upload`);
          // Delay slightly to ensure everything is ready
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Inline sync to avoid dependency issues
          if (operationLog.current && user && isOnline && supabase) {
            setIsSyncing(true);
            try {
              const opsToSync = operationLog.current.getUnsyncedOperations();
              logger.info(`📤 UPLOADING ${opsToSync.length} operations to cloud...`);

              for (const operation of opsToSync) {
                // Derive entity from operation type
                const entity = operation.type.includes('COMPLETION') ? 'completion'
                  : operation.type.includes('ADDRESS') ? 'address'
                  : operation.type.includes('SESSION') ? 'session'
                  : operation.type.includes('ARRANGEMENT') ? 'arrangement'
                  : operation.type.includes('ACTIVE_INDEX') ? 'active_index'
                  : operation.type.includes('SETTINGS') ? 'settings'
                  : 'unknown';

                const { error } = await supabase
                  .from('navigator_operations')
                  .insert({
                    user_id: user.id,
                    operation_id: operation.id,
                    sequence_number: operation.sequence,
                    type: operation.type,
                    entity: entity,
                    operation_data: operation,
                    client_id: operation.clientId,
                    timestamp: operation.timestamp,
                    local_timestamp: operation.timestamp,
                  });

                if (error) {
                  logger.error('Failed to upload operation:', error);
                  throw error;
                }
              }

              // Mark as synced
              const maxSeq = Math.max(...opsToSync.map(op => op.sequence));
              await operationLog.current.markSyncedUpTo(maxSeq);

              logger.info(`✅ AUTO-SYNC: Uploaded ${opsToSync.length} operations successfully`);
              setLastSyncTime(new Date());
            } catch (err) {
              logger.error('AUTO-SYNC failed:', err);
            } finally {
              setIsSyncing(false);
            }
          }
        }
      } catch (err) {
        logger.error('Failed to auto-sync unsynced operations:', err);
      }
    };

    checkAndSyncUnsynced();
  }, [user?.id, isOnline, isLoading]);

  // Cleanup batch timer on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, []);

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
      resetPassword,
      updatePassword,
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
      resetPassword,
      updatePassword,
      submitOperation,
      subscribeToOperations,
      forceSync,
      getStateFromOperations,
    ]
  );
}

// DEBUG: Expose sync debugging utilities globally
if (typeof window !== 'undefined') {
  (window as any).syncDebug = {
    /**
     * Get statistics about the current operation log
     */
    async getStats() {
      const deviceId = localStorage.getItem('navigator_device_id');
      const user = await supabase?.auth.getUser();
      const userId = user?.data?.user?.id;

      if (!deviceId || !userId) {
        console.error('Not authenticated or device ID missing');
        return null;
      }

      const manager = getOperationLog(deviceId, userId);
      await manager.load();
      const stats = getOperationLogStats(manager);

      console.log('📊 Operation Log Statistics:');
      console.log('  Total operations:', stats.totalOperations);
      console.log('  By type:', stats.byType);
      console.log('  Duplicate completions:', stats.duplicateCompletions);
      console.log('  Sequence range:', stats.sequenceRange);
      console.log('  Last synced sequence:', stats.lastSyncSequence);

      return stats;
    },

    /**
     * Check cloud database for operations
     */
    async checkCloud() {
      const user = await supabase?.auth.getUser();
      const userId = user?.data?.user?.id;

      if (!userId || !supabase) {
        console.error('Not authenticated');
        return null;
      }

      const { data, error } = await supabase
        .from('navigator_operations')
        .select('operation_id, sequence_number, operation_type, client_id, timestamp')
        .eq('user_id', userId)
        .order('sequence_number', { ascending: false })
        .limit(20);

      if (error) {
        console.error('❌ Error fetching from cloud:', error);
        return null;
      }

      console.log('☁️ Latest 20 operations in cloud:');
      console.table(data);

      return data;
    },

    /**
     * Compare local vs cloud operations
     */
    async compare() {
      const stats = await this.getStats();
      const cloud = await this.checkCloud();

      if (!stats || !cloud) return;

      console.log('\n📊 COMPARISON:');
      console.log('  Local operations:', stats.totalOperations);
      console.log('  Cloud operations (total): Checking...');

      const user = await supabase?.auth.getUser();
      const userId = user?.data?.user?.id;

      if (userId && supabase) {
        const { count } = await supabase
          .from('navigator_operations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        console.log('  Cloud operations (total):', count);
        console.log('  Local sequence:', stats.sequenceRange.max);
        console.log('  Last synced sequence:', stats.lastSyncSequence);
        console.log('  Unsynced operations:', stats.totalOperations - stats.lastSyncSequence);
      }
    },

    /**
     * Clear local operation log (WARNING: This will require re-sync from cloud)
     */
    async clearLocal() {
      const confirmed = confirm('⚠️ This will clear your local operation log. You will need to refresh to re-sync from cloud. Continue?');
      if (!confirmed) return;

      const deviceId = localStorage.getItem('navigator_device_id');
      const user = await supabase?.auth.getUser();
      const userId = user?.data?.user?.id;

      if (!deviceId || !userId) {
        console.error('Not authenticated');
        return;
      }

      const manager = getOperationLog(deviceId, userId);
      await manager.clear();

      console.log('✅ Local operation log cleared. Refresh the page to re-sync from cloud.');
    },

    /**
     * Force a full sync
     */
    async forceSync() {
      console.log('🔄 Triggering force sync...');
      // This will be called from App.tsx context
      console.log('Please use cloudSync.forceSync() from the main app context');
    },

    /**
     * Fix corrupted sequence numbers and force upload all operations
     */
    async repairSync() {
      const confirmed = confirm('⚠️ This will reset sync sequence numbers and re-upload all operations to cloud. Continue?');
      if (!confirmed) return;

      try {
        const deviceId = localStorage.getItem('navigator_device_id');
        const user = await supabase?.auth.getUser();
        const userId = user?.data?.user?.id;

        if (!deviceId || !userId || !supabase) {
          console.error('Not authenticated');
          return;
        }

        console.log('🔧 Starting sync repair...');

        const manager = getOperationLog(deviceId, userId);
        await manager.load();

        const operations = manager.getAllOperations();
        console.log(`📊 Found ${operations.length} operations to sync`);

        // Reset the last sync sequence to 0
        await manager.markSyncedUpTo(0);
        console.log('✅ Reset lastSyncSequence to 0');

        // Upload all operations to cloud
        let uploaded = 0;
        for (const operation of operations) {
          console.log(`📤 Uploading operation ${uploaded + 1}/${operations.length}: ${operation.type}`);

          // Derive entity from operation type
          const entity = operation.type.includes('COMPLETION') ? 'completion'
            : operation.type.includes('ADDRESS') ? 'address'
            : operation.type.includes('SESSION') ? 'session'
            : operation.type.includes('ARRANGEMENT') ? 'arrangement'
            : operation.type.includes('ACTIVE_INDEX') ? 'active_index'
            : operation.type.includes('SETTINGS') ? 'settings'
            : 'unknown';

          const { error } = await supabase
            .from('navigator_operations')
            .insert({
              user_id: userId,
              operation_id: operation.id,
              sequence_number: operation.sequence,
              type: operation.type,
              entity: entity,
              operation_data: operation,
              client_id: operation.clientId,
              timestamp: operation.timestamp,
              local_timestamp: operation.timestamp,
            });

          if (error && error.code !== '23505') {
            console.error('❌ Upload failed:', error);
            throw error;
          }

          if (error?.code === '23505') {
            console.log('⚠️ Already exists (skipping)');
          } else {
            uploaded++;
          }
        }

        // Mark all as synced
        const maxSeq = Math.max(...operations.map(op => op.sequence));
        await manager.markSyncedUpTo(maxSeq);

        console.log(`✅ Repair complete! Uploaded ${uploaded} operations, synced up to sequence ${maxSeq}`);
        alert(`✅ Sync repaired! Uploaded ${uploaded} operations to cloud. Refresh the page.`);
      } catch (err) {
        console.error('❌ Repair failed:', err);
        alert('❌ Repair failed: ' + String(err));
      }
    }
  };

  console.log('🛠️ Sync debugging utilities available at window.syncDebug');
  console.log('  syncDebug.getStats() - View local operation log statistics');
  console.log('  syncDebug.checkCloud() - View operations in cloud database');
  console.log('  syncDebug.compare() - Compare local vs cloud');
  console.log('  syncDebug.clearLocal() - Clear local operation log (requires refresh)');
}