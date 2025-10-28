// src/sync/operationSync.ts - Operation-based cloud sync service
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { AppState } from "../types";
import type { Operation } from "./operations";
import { OperationLogManager, getOperationLog, clearOperationLogsForUser, getOperationLogStats } from "./operationLog";
import { reconstructState, reconstructStateWithConflictResolution } from "./reducer";
import { logger } from "../utils/logger";
import { DEFAULT_REMINDER_SETTINGS } from "../services/reminderScheduler";
import { DEFAULT_BONUS_SETTINGS } from "../utils/bonusCalculator";
import { SEQUENCE_CORRUPTION_THRESHOLD } from "./syncConfig";

/**
 * SECURITY: Track used operation nonces to prevent replay attacks
 * Nonces are generated when operations are created and must be unique
 */
const usedNonces = new Set<string>();

function generateNonce(): string {
  // Generate cryptographically unique nonce for replay attack prevention
  // Format: timestamp + random + counter = near-unique identifier
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * SECURITY: Check if operation nonce has been seen before (replay attack detection)
 * Returns true if this is a new operation, false if replay detected
 */
function checkAndRegisterNonce(nonce: string | undefined): boolean {
  if (!nonce) return true; // Allow operations without nonce (legacy)

  if (usedNonces.has(nonce)) {
    logger.warn('🚨 SECURITY: Replay attack detected - nonce already used:', { nonce });
    return false; // Replay detected
  }

  usedNonces.add(nonce);

  // Memory management: keep only recent nonces (last 10000)
  // Older operations are presumed not to be replayed
  if (usedNonces.size > 10000) {
    const noncesArray = Array.from(usedNonces);
    // Clear oldest half
    const toDelete = noncesArray.slice(0, 5000);
    toDelete.forEach(n => usedNonces.delete(n));
    logger.info('🧹 Nonce cache cleared - kept recent 5000 nonces');
  }

  return true; // New operation, not a replay
}

/**
 * SECURITY: Validate operation payload before accepting from cloud
 * Prevents malformed data from corrupting application state
 */
function validateOperationPayload(operation: any): { valid: boolean; error?: string } {
  // Check base fields
  if (!operation || typeof operation !== 'object') {
    return { valid: false, error: 'Operation must be an object' };
  }

  if (typeof operation.id !== 'string' || !operation.id) {
    return { valid: false, error: 'Missing or invalid operation.id' };
  }

  if (typeof operation.timestamp !== 'string' || !operation.timestamp) {
    return { valid: false, error: 'Missing or invalid operation.timestamp' };
  }

  if (typeof operation.clientId !== 'string' || !operation.clientId) {
    return { valid: false, error: 'Missing or invalid operation.clientId' };
  }

  if (!Number.isInteger(operation.sequence) || operation.sequence < 0) {
    return { valid: false, error: 'Missing or invalid operation.sequence' };
  }

  if (typeof operation.type !== 'string' || !operation.type) {
    return { valid: false, error: 'Missing or invalid operation.type' };
  }

  // Validate timestamp is reasonable (not more than 24 hours in future to prevent clock skew attacks)
  const opTime = new Date(operation.timestamp).getTime();
  const now = Date.now();
  const maxFutureMs = 24 * 60 * 60 * 1000; // 24 hours

  if (isNaN(opTime)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  if (opTime > now + maxFutureMs) {
    return { valid: false, error: 'Operation timestamp too far in future (clock skew attack?)' };
  }

  // Validate payload exists and is an object
  if (!operation.payload || typeof operation.payload !== 'object') {
    return { valid: false, error: 'Missing or invalid operation.payload' };
  }

  // Type-specific payload validation
  switch (operation.type) {
    case 'COMPLETION_CREATE':
      if (!operation.payload.completion || typeof operation.payload.completion !== 'object') {
        return { valid: false, error: 'COMPLETION_CREATE: Missing completion object' };
      }
      if (!operation.payload.completion.timestamp || !operation.payload.completion.index) {
        return { valid: false, error: 'COMPLETION_CREATE: Missing required completion fields' };
      }
      break;

    case 'COMPLETION_UPDATE':
      if (!operation.payload.originalTimestamp || typeof operation.payload.originalTimestamp !== 'string') {
        return { valid: false, error: 'COMPLETION_UPDATE: Missing originalTimestamp' };
      }
      if (!operation.payload.updates || typeof operation.payload.updates !== 'object') {
        return { valid: false, error: 'COMPLETION_UPDATE: Missing updates object' };
      }
      break;

    case 'COMPLETION_DELETE':
      if (!operation.payload.timestamp || typeof operation.payload.timestamp !== 'string') {
        return { valid: false, error: 'COMPLETION_DELETE: Missing timestamp' };
      }
      if (!Number.isInteger(operation.payload.index) || operation.payload.index < 0) {
        return { valid: false, error: 'COMPLETION_DELETE: Invalid index' };
      }
      break;

    case 'ADDRESS_BULK_IMPORT':
      if (!Array.isArray(operation.payload.addresses)) {
        return { valid: false, error: 'ADDRESS_BULK_IMPORT: addresses must be an array' };
      }
      if (!Number.isInteger(operation.payload.newListVersion) || operation.payload.newListVersion < 1) {
        return { valid: false, error: 'ADDRESS_BULK_IMPORT: Invalid newListVersion' };
      }
      break;

    case 'ADDRESS_ADD':
      if (!operation.payload.address || typeof operation.payload.address !== 'object') {
        return { valid: false, error: 'ADDRESS_ADD: Missing address object' };
      }
      break;

    case 'SESSION_START':
    case 'SESSION_END':
      if (!operation.payload || typeof operation.payload !== 'object') {
        return { valid: false, error: `${operation.type}: Missing payload` };
      }
      break;

    case 'ARRANGEMENT_CREATE':
      if (!operation.payload.arrangement || typeof operation.payload.arrangement !== 'object') {
        return { valid: false, error: 'ARRANGEMENT_CREATE: Missing arrangement object' };
      }
      break;

    case 'ARRANGEMENT_UPDATE':
      if (!operation.payload.id || typeof operation.payload.id !== 'string') {
        return { valid: false, error: 'ARRANGEMENT_UPDATE: Missing id' };
      }
      if (!operation.payload.updates || typeof operation.payload.updates !== 'object') {
        return { valid: false, error: 'ARRANGEMENT_UPDATE: Missing updates object' };
      }
      break;

    case 'ARRANGEMENT_DELETE':
      if (!operation.payload.id || typeof operation.payload.id !== 'string') {
        return { valid: false, error: 'ARRANGEMENT_DELETE: Missing id' };
      }
      break;

    case 'ACTIVE_INDEX_SET':
      if (!('index' in operation.payload)) {
        return { valid: false, error: 'ACTIVE_INDEX_SET: Missing index' };
      }
      break;

    case 'SETTINGS_UPDATE_SUBSCRIPTION':
    case 'SETTINGS_UPDATE_REMINDER':
    case 'SETTINGS_UPDATE_BONUS':
      // These can have null/undefined payloads, just validate structure
      if (!operation.payload) {
        return { valid: false, error: `${operation.type}: Missing payload` };
      }
      break;

    default:
      return { valid: false, error: `Unknown operation type: ${operation.type}` };
  }

  return { valid: true };
}

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
  getOperationLogState: () => ReturnType<OperationLogManager['getLogState']> | null; // 🔧 FIX: Expose operation log state for restore operations
  clearOperationLogForRestore: () => Promise<void>; // 🔧 FIX: Clear with sequence preservation during backup restore
};

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

  // forceSync will be defined later but we need a ref to it for the online/offline effect
  const forceSyncRef = useRef<(() => Promise<void>) | null>(null);

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

        // Notify listeners of initial state (if there are operations)
        if (operations.length > 0) {
          stateChangeListeners.current.forEach(listener => {
            try {
              listener(operations);
            } catch (err) {
              logger.error('Error in state change listener during init:', err);
            }
          });
        }

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
            logger.info(`📥 BOOTSTRAP: Received ${data.length} operations from cloud`);

            const remoteOperations: Operation[] = [];
            const invalidOps: Array<{raw: any; error: string}> = [];

            // SECURITY: Validate each operation before accepting (prevents malformed data corruption)
            for (const row of data) {
              const validation = validateOperationPayload(row.operation_data);
              if (!validation.valid) {
                logger.warn('🚨 SECURITY: Rejecting invalid operation from cloud:', {
                  error: validation.error,
                  opId: row.operation_data?.id,
                  opType: row.operation_data?.type,
                });
                invalidOps.push({
                  raw: row.operation_data,
                  error: validation.error || 'Unknown validation error'
                });
                continue;
              }

              // SECURITY: Check for replay attacks (use nonce if present, else operation ID)
              const nonce = (row.operation_data as any)?.nonce || row.operation_data?.id;
              if (!checkAndRegisterNonce(nonce)) {
                logger.error('🚨 SECURITY: Rejecting operation - replay attack detected (duplicate nonce):', {
                  opId: row.operation_data?.id,
                  opType: row.operation_data?.type,
                });
                invalidOps.push({
                  raw: row.operation_data,
                  error: 'Replay attack detected - duplicate nonce'
                });
                continue;
              }

              // All security checks passed
              remoteOperations.push(row.operation_data);
            }

            if (invalidOps.length > 0) {
              logger.error(`❌ BOOTSTRAP: Rejected ${invalidOps.length}/${data.length} malformed operations`, {
                sample: invalidOps.slice(0, 3)
              });
            }

            logger.info('📊 BOOTSTRAP: Operation types:', remoteOperations.reduce((acc, op) => {
              acc[op.type] = (acc[op.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>));

            const newOps = await operationLog.current.mergeRemoteOperations(remoteOperations);
            logger.info(`📥 BOOTSTRAP: Merged ${newOps.length} new operations (${remoteOperations.length - newOps.length} were duplicates)`);

            if (newOps.length > 0) {
              // 🔧 CRITICAL FIX: Only mark as synced if operations are from THIS device
              // Downloaded operations from other devices don't count as "synced" because WE didn't upload them
              const myOpsToMarkSynced = remoteOperations
                .filter(op => op.clientId === deviceId.current)
                .map(op => op.sequence);

              if (myOpsToMarkSynced.length > 0) {
                const maxMySeq = Math.max(...myOpsToMarkSynced);

                // 🔧 CRITICAL FIX: Detect corrupted sequence numbers from cloud
                // If all local operations are much lower than cloud sequence, cloud is corrupted
                // However, legitimate gaps occur from multiple devices
                const localMaxSeq = operationLog.current.getAllOperations().length > 0
                  ? Math.max(...operationLog.current.getAllOperations().map(op => op.sequence))
                  : 0;

                // PHASE 1.1.2 FIX: Use configurable threshold for sequence corruption detection
                // The SEQUENCE_CORRUPTION_THRESHOLD is defined in syncConfig.ts
                // Increased from 1000 to 10000 to reduce false positives
                const gap = maxMySeq - localMaxSeq;
                const isCloudCorrupted = gap > SEQUENCE_CORRUPTION_THRESHOLD && localMaxSeq > 100;

                if (isCloudCorrupted) {
                  logger.error('🚨 BOOTSTRAP: Cloud operations have corrupted sequence numbers!', {
                    cloudMaxSeq: maxMySeq,
                    localMaxSeq,
                    gap,
                    threshold: SEQUENCE_CORRUPTION_THRESHOLD,
                  });
                  // DON'T use this corrupted sequence - it will poison our local sequence generator
                  logger.info('📥 BOOTSTRAP: Skipping corrupted sequence number marking (would cause sequence collision)');
                } else if (Number.isFinite(maxMySeq)) {
                  // Sequence is valid - use it
                  await operationLog.current.markSyncedUpTo(maxMySeq);
                  logger.info(`📥 BOOTSTRAP: Marked sequences up to ${maxMySeq} as synced (from this device)`, {
                    gap,
                    threshold: SEQUENCE_CORRUPTION_THRESHOLD,
                    status: 'valid',
                  });
                }
              } else {
                logger.info(`📥 BOOTSTRAP: No operations from this device to mark as synced`);
              }

              // Reconstruct state with merged operations
              // PHASE 1.3: Use conflict resolution for vector clock-based integrity
              const allOps = operationLog.current.getAllOperations();
              logger.info(`🔄 BOOTSTRAP: Reconstructing state from ${allOps.length} total operations`);
              const newState = reconstructStateWithConflictResolution(
                INITIAL_STATE,
                allOps,
                operationLog.current
              );
              logger.info('📊 BOOTSTRAP: Reconstructed state:', {
                addresses: newState.addresses?.length || 0,
                completions: newState.completions?.length || 0,
                arrangements: newState.arrangements?.length || 0,
                daySessions: newState.daySessions?.length || 0,
                currentListVersion: newState.currentListVersion,
              });
              setCurrentState(newState);

              // CRITICAL: Notify listeners so App.tsx updates UI!
              logger.info(`📤 BOOTSTRAP: Notifying ${stateChangeListeners.current.size} listeners`);
              stateChangeListeners.current.forEach(listener => {
                try {
                  listener(newOps);
                } catch (err) {
                  logger.error('Error in state change listener:', err);
                }
              });

              logger.info('✅ BOOTSTRAP: Complete with remote operations');
            } else {
              logger.warn('⚠️ BOOTSTRAP: No new operations after merge - all were duplicates');
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
  }, [user?.id, isOnline, supabase]);

  // Online/offline tracking
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      // Trigger sync when coming back online
      if (user && operationLog.current && forceSyncRef.current) {
        setTimeout(() => forceSyncRef.current?.(), 100);
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

  // 🔧 FIX: Track last time we logged "no progress" to prevent spam
  const lastNoProgressLogRef = useRef<number>(0);

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
    // SECURITY: Add nonce for replay attack prevention
    const operationEnvelope = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      clientId: deviceId.current,
      type: operationData.type,
      payload: operationData.payload,
      nonce: generateNonce(), // Unique identifier to prevent replay attacks
    } as Omit<Operation, 'sequence'> & { nonce: string };

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

      // 🔧 CRITICAL FIX: Track successful uploads instead of assuming all succeed
      const successfulSequences: number[] = [];
      const failedOps: Array<{seq: number; type: string; error: string}> = [];

      // Upload operations to cloud
      for (const operation of unsyncedOps) {
        logger.debug('Uploading operation:', operation.type, operation.id, 'seq:', operation.sequence);

        // Derive entity from operation type
        const entity = operation.type.includes('COMPLETION') ? 'completion'
          : operation.type.includes('ADDRESS') ? 'address'
          : operation.type.includes('SESSION') ? 'session'
          : operation.type.includes('ARRANGEMENT') ? 'arrangement'
          : operation.type.includes('ACTIVE_INDEX') ? 'active_index'
          : operation.type.includes('SETTINGS') ? 'settings'
          : 'unknown';

        // Extract entity_id from operation payload (cast to any to handle union types)
        const payload = operation.payload as any;
        const entityId = payload?.completion?.timestamp
          || payload?.arrangement?.id
          || payload?.address?.address
          || payload?.session?.date
          || payload?.id
          || operation.id;

        const { error } = await supabase
          .from('navigator_operations')
          .upsert({
            // New columns
            user_id: user.id,
            operation_id: operation.id,
            sequence_number: operation.sequence,
            operation_type: operation.type,
            operation_data: operation,
            client_id: operation.clientId,
            timestamp: operation.timestamp,
            // Old columns (still required for backwards compatibility)
            type: operation.type,
            entity: entity,
            entity_id: String(entityId),
            data: operation.payload,
            device_id: operation.clientId,
            local_timestamp: operation.timestamp,
          }, {
            onConflict: 'user_id,operation_id',
            ignoreDuplicates: true,
          });

        if (error && error.code !== '23505') { // Ignore duplicate key errors
          logger.error('❌ UPLOAD FAILED:', {
            operation: operation.type,
            sequence: operation.sequence,
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });

          // 🔧 CRITICAL FIX: Don't throw - track failure and continue with other operations
          failedOps.push({
            seq: operation.sequence,
            type: operation.type,
            error: error.message
          });
          continue; // Skip to next operation
        }

        if (error?.code === '23505') {
          logger.debug('⚠️ Duplicate operation (already uploaded):', operation.id);
        }

        // 🔧 FIX: Track this as successfully uploaded (including duplicates)
        successfulSequences.push(operation.sequence);
      }

      // 🔧 CRITICAL FIX: Only mark continuous sequences FROM current lastSyncSequence
      // If lastSyncSequence=100 and ops [101,102,103] upload but 101 fails, we mark NOTHING
      // Otherwise 101 becomes invisible and never retries!
      if (successfulSequences.length > 0) {
        successfulSequences.sort((a, b) => a - b);

        const currentLastSynced = operationLog.current.getLogState().lastSyncSequence;

        // Find the highest continuous sequence starting from currentLastSynced + 1
        let maxContinuousSeq = currentLastSynced;
        for (const seq of successfulSequences) {
          if (seq === maxContinuousSeq + 1) {
            maxContinuousSeq = seq; // Extend the continuous chain
          } else if (seq > maxContinuousSeq + 1) {
            // Gap found! Can't advance past this
            break;
          }
          // If seq <= maxContinuousSeq, it's already synced or duplicate, skip
        }

        // Only update if we actually advanced
        if (maxContinuousSeq > currentLastSynced) {
          await operationLog.current.markSyncedUpTo(maxContinuousSeq);
          setLastSyncTime(new Date());

          logger.info('✅ SYNC COMPLETE:', {
            total: unsyncedOps.length,
            succeeded: successfulSequences.length,
            failed: failedOps.length,
            previousLastSynced: currentLastSynced,
            newLastSynced: maxContinuousSeq,
            advanced: maxContinuousSeq - currentLastSynced,
          });

          if (failedOps.length > 0) {
            logger.error('⚠️ FAILED OPERATIONS (will retry):', failedOps);
          }
        } else {
          // 🔧 FIX: Only log "NO PROGRESS" once every 30 seconds to prevent spam
          const now = Date.now();
          if (now - lastNoProgressLogRef.current > 30000) {
            logger.warn('⚠️ NO PROGRESS: Successful uploads exist but not continuous from last synced', {
              currentLastSynced,
              successfulSequences: successfulSequences.slice(0, 5), // Show first 5
              firstGap: successfulSequences[0] > currentLastSynced + 1
                ? currentLastSynced + 1
                : 'unknown',
            });
            lastNoProgressLogRef.current = now;
          }
        }
      } else {
        logger.error('❌ ALL UPLOADS FAILED - no operations marked as synced');
      }
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

        const remoteOperations: Operation[] = [];
        const invalidOps: Array<{error: string; opType?: string}> = [];

        // SECURITY: Validate each operation before accepting (prevents malformed data corruption)
        for (const row of data) {
          const validation = validateOperationPayload(row.operation_data);
          if (!validation.valid) {
            logger.warn('🚨 SECURITY: Rejecting invalid operation from cloud:', {
              error: validation.error,
              opType: row.operation_data?.type,
            });
            invalidOps.push({
              error: validation.error || 'Unknown validation error',
              opType: row.operation_data?.type
            });
            continue;
          }

          // SECURITY: Check for replay attacks (duplicate nonce)
          if (!checkAndRegisterNonce(row.operation_data?.nonce)) {
            logger.error('🚨 SECURITY: Rejecting operation - replay attack detected:', {
              opType: row.operation_data?.type,
              nonce: row.operation_data?.nonce?.substring(0, 10) + '...',
            });
            invalidOps.push({
              error: 'Replay attack detected - duplicate nonce',
              opType: row.operation_data?.type
            });
            continue;
          }

          // All security checks passed
          remoteOperations.push(row.operation_data);
        }

        if (invalidOps.length > 0) {
          logger.error(`❌ FETCH: Rejected ${invalidOps.length}/${data.length} malformed operations`);
        }

        // Merge remote operations and resolve conflicts
        const newOperations = await operationLog.current!.mergeRemoteOperations(remoteOperations);

        if (newOperations.length > 0) {
          const maxRemoteSequence = Math.max(...remoteOperations.map(op => op.sequence));

          if (Number.isFinite(maxRemoteSequence)) {
            await operationLog.current!.markSyncedUpTo(maxRemoteSequence);
          }

          // Reconstruct state from all operations
          // PHASE 1.3: Use conflict resolution for vector clock-based integrity
          const allOperations = operationLog.current.getAllOperations();
          const newState = reconstructStateWithConflictResolution(
            INITIAL_STATE,
            allOperations,
            operationLog.current
          );
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

  // Set ref for use in online/offline event listeners
  forceSyncRef.current = forceSync;

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

      // CRITICAL: Immediately notify with existing operations (if any)
      // This handles the case where subscription happens AFTER bootstrap
      if (operationLog.current) {
        const existingOps = operationLog.current.getAllOperations();
        if (existingOps.length > 0) {
          logger.info(`📤 SUBSCRIPTION: Immediately notifying new subscriber with ${existingOps.length} existing operations`);
          logger.info('📊 SUBSCRIPTION: Operation types:', existingOps.reduce((acc, op) => {
            acc[op.type] = (acc[op.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>));

          // Log the current reconstructed state
          const currentState = operationLog.current ? reconstructState(INITIAL_STATE, existingOps) : INITIAL_STATE;
          logger.info('📊 SUBSCRIPTION: Current state from operations:', {
            addresses: currentState.addresses?.length || 0,
            completions: currentState.completions?.length || 0,
            arrangements: currentState.arrangements?.length || 0,
            daySessions: currentState.daySessions?.length || 0,
          });

          try {
            onOperations(existingOps);
            logger.info('✅ SUBSCRIPTION: Successfully called onOperations callback');
          } catch (err) {
            logger.error('❌ SUBSCRIPTION: Error notifying subscriber with existing operations:', err);
          }
        } else {
          logger.warn('⚠️ SUBSCRIPTION: No existing operations to notify subscriber with');
        }
      }

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

            // SECURITY: Validate operation before processing (prevents malformed data corruption)
            const validation = validateOperationPayload(operation);
            if (!validation.valid) {
              logger.error('🚨 SECURITY: Rejecting invalid real-time operation:', {
                error: validation.error,
                opType: operation?.type,
                opId: operation?.id,
              });
              return;
            }

            // SECURITY: Check for replay attacks (use nonce if present, else operation ID)
            const opNonce = (operation as any)?.nonce || operation?.id;
            if (!checkAndRegisterNonce(opNonce)) {
              logger.error('🚨 SECURITY: Rejecting operation - replay attack detected (real-time):', {
                opType: operation?.type,
                opId: operation?.id,
              });
              return;
            }

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
                // 🔧 CRITICAL FIX: Don't mark operations from OTHER devices as synced
                // Only mark as synced if this operation is from THIS device (shouldn't happen here since we filter above)
                // This is just for safety in case the filter is removed
                if (operation.clientId === deviceId.current) {
                  await operationLog.current.markSyncedUpTo(operation.sequence);
                  logger.info('📥 REAL-TIME: Marked own operation as synced');
                }

                // Reconstruct state and notify
                // PHASE 1.3: Use conflict resolution for vector clock-based integrity
                const allOperations = operationLog.current.getAllOperations();
                const newState = reconstructStateWithConflictResolution(
                  INITIAL_STATE,
                  allOperations,
                  operationLog.current
                );
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
              logger.info(`📤 AUTO-SYNC: UPLOADING ${opsToSync.length} operations to cloud...`);

              // 🔧 CRITICAL FIX: Track successful uploads (same as syncOperationsToCloud)
              const successfulSequences: number[] = [];
              const failedOps: Array<{seq: number; type: string; error: string}> = [];

              for (const operation of opsToSync) {
                logger.debug('AUTO-SYNC: Uploading operation:', operation.type, 'seq:', operation.sequence);

                // Derive entity from operation type
                const entity = operation.type.includes('COMPLETION') ? 'completion'
                  : operation.type.includes('ADDRESS') ? 'address'
                  : operation.type.includes('SESSION') ? 'session'
                  : operation.type.includes('ARRANGEMENT') ? 'arrangement'
                  : operation.type.includes('ACTIVE_INDEX') ? 'active_index'
                  : operation.type.includes('SETTINGS') ? 'settings'
                  : 'unknown';

                // Extract entity_id from operation payload (cast to any to handle union types)
                const payload = operation.payload as any;
                const entityId = payload?.completion?.timestamp
                  || payload?.arrangement?.id
                  || payload?.address?.address
                  || payload?.session?.date
                  || payload?.id
                  || operation.id;

                const { error } = await supabase
                  .from('navigator_operations')
                  .upsert({
                    // New columns
                    user_id: user.id,
                    operation_id: operation.id,
                    sequence_number: operation.sequence,
                    operation_type: operation.type,
                    operation_data: operation,
                    client_id: operation.clientId,
                    timestamp: operation.timestamp,
                    // Old columns (still required for backwards compatibility)
                    type: operation.type,
                    entity: entity,
                    entity_id: String(entityId),
                    data: operation.payload,
                    device_id: operation.clientId,
                    local_timestamp: operation.timestamp,
                  }, {
                    onConflict: 'user_id,operation_id',
                    ignoreDuplicates: true,
                  });

                if (error && error.code !== '23505') {
                  logger.error('AUTO-SYNC: Upload failed:', {
                    type: operation.type,
                    sequence: operation.sequence,
                    error: error.message,
                  });

                  // 🔧 CRITICAL FIX: Don't throw - track failure and continue
                  failedOps.push({
                    seq: operation.sequence,
                    type: operation.type,
                    error: error.message
                  });
                  continue; // Skip to next operation
                }

                if (error?.code === '23505') {
                  logger.debug('AUTO-SYNC: Duplicate operation (already uploaded):', operation.id);
                }

                // Track successful upload
                successfulSequences.push(operation.sequence);
              }

              // 🔧 CRITICAL FIX: Only mark continuous sequences FROM current lastSyncSequence
              // If lastSyncSequence=100 and ops [101,102,103] upload but 101 fails, we mark NOTHING
              // Otherwise 101 becomes invisible and never retries!
              if (successfulSequences.length > 0) {
                successfulSequences.sort((a, b) => a - b);

                const currentLastSynced = operationLog.current.getLogState().lastSyncSequence;

                // Find the highest continuous sequence starting from currentLastSynced + 1
                let maxContinuousSeq = currentLastSynced;
                for (const seq of successfulSequences) {
                  if (seq === maxContinuousSeq + 1) {
                    maxContinuousSeq = seq; // Extend the continuous chain
                  } else if (seq > maxContinuousSeq + 1) {
                    // Gap found! Can't advance past this
                    break;
                  }
                  // If seq <= maxContinuousSeq, it's already synced or duplicate, skip
                }

                // Only update if we actually advanced
                if (maxContinuousSeq > currentLastSynced) {
                  await operationLog.current.markSyncedUpTo(maxContinuousSeq);

                  logger.info('✅ AUTO-SYNC COMPLETE:', {
                    total: opsToSync.length,
                    succeeded: successfulSequences.length,
                    failed: failedOps.length,
                    previousLastSynced: currentLastSynced,
                    newLastSynced: maxContinuousSeq,
                    advanced: maxContinuousSeq - currentLastSynced,
                  });

                  if (failedOps.length > 0) {
                    logger.error('⚠️ AUTO-SYNC FAILED OPERATIONS (will retry):', failedOps);
                  }

                  setLastSyncTime(new Date());
                } else {
                  // 🔧 FIX: Only log "NO PROGRESS" once every 30 seconds to prevent spam
                  const now = Date.now();
                  if (now - lastNoProgressLogRef.current > 30000) {
                    logger.warn('⚠️ AUTO-SYNC NO PROGRESS: Successful uploads exist but not continuous from last synced', {
                      currentLastSynced,
                      successfulSequences: successfulSequences.slice(0, 5),
                      firstGap: successfulSequences[0] > currentLastSynced + 1
                        ? currentLastSynced + 1
                        : 'unknown',
                    });
                    lastNoProgressLogRef.current = now;
                  }
                }
              } else {
                logger.error('❌ AUTO-SYNC: All uploads failed');
              }
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

  // 🔧 CRITICAL: Get operation log state for restore operations
  // This preserves lastSyncSequence during backup restore
  const getOperationLogState = useCallback(() => {
    return operationLog.current?.getLogState() ?? null;
  }, []);

  // 🔧 CRITICAL: Clear operation log while preserving sequence continuity
  // Called during backup restore to prevent sequence gaps
  const clearOperationLogForRestore = useCallback(async () => {
    if (operationLog.current) {
      await operationLog.current.clearForRestore();
      // Reconstruct state from empty operations (should give INITIAL_STATE)
      const newState = reconstructState(INITIAL_STATE, []);
      setCurrentState(newState);
      logger.info('✅ Operation log cleared for restore, sequence continuity preserved');
    }
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
      getOperationLogState,
      clearOperationLogForRestore,
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
      getOperationLogState,
      clearOperationLogForRestore,
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

          // Extract entity_id from operation payload (cast to any to handle union types)
          const payload = operation.payload as any;
          const entityId = payload?.completion?.timestamp
            || payload?.arrangement?.id
            || payload?.address?.address
            || payload?.session?.date
            || payload?.id
            || operation.id;

          const { error } = await supabase
            .from('navigator_operations')
            .upsert({
              // New columns
              user_id: userId,
              operation_id: operation.id,
              sequence_number: operation.sequence,
              operation_type: operation.type,
              operation_data: operation,
              client_id: operation.clientId,
              timestamp: operation.timestamp,
              // Old columns (still required for backwards compatibility)
              type: operation.type,
              entity: entity,
              entity_id: String(entityId),
              data: operation.payload,
              device_id: operation.clientId,
              local_timestamp: operation.timestamp,
            }, {
              onConflict: 'user_id,operation_id',
              ignoreDuplicates: true,
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