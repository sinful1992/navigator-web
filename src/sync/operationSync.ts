// src/sync/operationSync.ts - Operation-based cloud sync service
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { AppState } from "../types";
import type { Operation } from "./operations";
import { OperationLogManager, getOperationLog, clearOperationLogsForUser, getOperationLogStats } from "./operationLog";
import { storageManager } from '../utils/storageManager';
import { reconstructState, reconstructStateWithConflictResolution } from "./reducer";
import { logger } from "../utils/logger";
import { DEFAULT_REMINDER_SETTINGS } from "../services/reminderScheduler";
import { DEFAULT_BONUS_SETTINGS } from "../utils/bonusCalculator";
import { SEQUENCE_CORRUPTION_THRESHOLD } from "./syncConfig";
import { validateSyncOperation } from "../services/operationValidators";
import { retryWithCustom, retryWithBackoff, isRetryableError, DEFAULT_RETRY_CONFIG } from "../utils/retryUtils";
import { retryQueueManager } from "./retryQueue";

/**
 * SECURITY: Track used operation nonces to prevent replay attacks
 * Uses a FIFO queue with timestamp-based expiration (24 hours)
 * - More efficient than Set-based approach (O(1) cleanup vs O(n))
 * - Automatically expires old nonces instead of keeping 10k in memory
 */
const nonceQueue: Array<{ nonce: string; timestamp: number }> = [];
// BEST PRACTICE: Reduced from 24 hours to 5 minutes to prevent timing-based replay attacks
const MAX_NONCE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

// Periodic cleanup of expired nonces
let nonceCleanupTimer: NodeJS.Timeout | null = null;
function scheduleNonceCleanup() {
  if (nonceCleanupTimer) return; // Already scheduled

  nonceCleanupTimer = setInterval(() => {
    const now = Date.now();
    const before = nonceQueue.length;

    while (nonceQueue.length > 0 && (now - nonceQueue[0].timestamp) > MAX_NONCE_AGE_MS) {
      nonceQueue.shift();
    }

    if (nonceQueue.length < before) {
      logger.debug(`🧹 Nonce cleanup: removed ${before - nonceQueue.length} expired nonces, ${nonceQueue.length} remaining`);
    }
  }, NONCE_CLEANUP_INTERVAL_MS);
}

function generateNonce(): string {
  // Generate cryptographically unique nonce for replay attack prevention
  // Format: timestamp + random + counter = near-unique identifier
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * SECURITY: Check if operation nonce has been seen before (replay attack detection)
 * Returns true if this is a new operation, false if replay detected
 *
 * OPTIMIZATION: Uses FIFO queue instead of Set for O(1) average case
 * - Most nonces are recent (queue is small)
 * - Old nonces automatically expire after 24 hours
 */
function checkAndRegisterNonce(nonce: string | undefined): boolean {
  if (!nonce) return true; // Allow operations without nonce (legacy)

  scheduleNonceCleanup(); // Ensure cleanup timer is running

  const now = Date.now();

  // Quick check: scan recent nonces (most likely match is at the end)
  for (let i = nonceQueue.length - 1; i >= 0; i--) {
    const entry = nonceQueue[i];

    // Skip expired nonces
    if ((now - entry.timestamp) > MAX_NONCE_AGE_MS) {
      continue;
    }

    if (entry.nonce === nonce) {
      logger.warn('🚨 SECURITY: Replay attack detected - nonce already used:', { nonce });
      return false; // Replay detected
    }
  }

  // Nonce is new - add to queue
  nonceQueue.push({ nonce, timestamp: now });

  return true; // New operation, not a replay
}

/**
 * SECURITY: Operation validation is now centralized in operationValidators
 * @see ../services/operationValidators.ts validateSyncOperation()
 */

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
  subscribeToOperations: (onOperations: (allOperations: Operation[]) => void) => () => void;
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
  // 🔧 CRITICAL FIX: Listeners receive ALL operations from the log, not just deltas
  const stateChangeListeners = useRef<Set<(allOperations: Operation[]) => void>>(new Set());

  // forceSync will be defined later but we need a ref to it for the online/offline effect
  const forceSyncRef = useRef<(() => Promise<void>) | null>(null);

  // 🔧 CRITICAL FIX: Use refs for user and supabase to avoid closure issues
  // Callbacks created early (when user=null) must check CURRENT values, not closure values
  const userRef = useRef<User | null>(null);
  const supabaseRef = useRef(supabase);

  // 🔧 PERFORMANCE: Cache state reconstruction to avoid rebuilding entire state on every operation
  // - Tracks lastOperationCount to only rebuild when operations actually change
  // - Reduces O(n) state reconstruction calls to O(1) when no new operations arrive
  const stateCache = useRef<{ operationCount: number; state: AppState }>({ operationCount: 0, state: INITIAL_STATE });

  const clearError = useCallback(() => setError(null), []);

  /**
   * 🔧 PERFORMANCE: Rebuild state only if operations have changed
   * - Checks if operation count changed before expensive reconstruction
   * - Returns cached state if no changes detected
   * - Reduces main thread blocking from repeated O(n) reconstructions
   */
  const rebuildStateIfNeeded = useCallback((forceRebuild = false): AppState => {
    if (!operationLog.current) return INITIAL_STATE;

    const operations = operationLog.current.getAllOperations();
    const opCount = operations.length;

    // If forced rebuild or operation count changed, rebuild
    if (forceRebuild || stateCache.current.operationCount !== opCount) {
      logger.debug(`🔄 Rebuilding state (operations: ${stateCache.current.operationCount} → ${opCount})`);
      const newState = reconstructState(INITIAL_STATE, operations);
      stateCache.current = { operationCount: opCount, state: newState };
      return newState;
    }

    // State hasn't changed - return cached version
    return stateCache.current.state;
  }, []);

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

        // BEST PRACTICE: Clean up old operations on startup (keep 90 days)
        await operationLog.current.cleanupOldOperations(90);

        // Reconstruct state from operations
        // Note: rebuildStateIfNeeded will be available after component setup, so we do inline rebuild here
        const operations = operationLog.current.getAllOperations();
        const reconstructedState = reconstructState(INITIAL_STATE, operations);
        stateCache.current = { operationCount: operations.length, state: reconstructedState };
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
      } catch (e: unknown) {
        if (mounted) setError((e as Error)?.message || String(e));
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
        stateCache.current = { operationCount: operations.length, state: reconstructedState };
        setCurrentState(reconstructedState);

        // Notify listeners of initial state (if there are operations)
        if (operations.length > 0) {
          stateChangeListeners.current.forEach(listener => {
            try {
              // 🔧 CRITICAL FIX: Pass ALL operations so subscriber can reconstruct complete state
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

          // 🔧 CRITICAL FIX: On bootstrap, fetch ALL operations for the user, not just ones after lastSequence
          // WHY: lastSyncTimestamp tracking ensures we don't miss operations
          // The merge logic will deduplicate anyway, and we get a complete picture
          // This ensures we never miss operations due to sequence tracking issues

          // 🔧 CRITICAL FIX: Paginate to fetch ALL operations (Supabase default limit is 1000)
          // WHY: Users with >1000 operations would only get first 1000, causing data loss on refresh
          const BATCH_SIZE = 1000;
          let allData: any[] = [];
          let page = 0;
          let hasMore = true;
          let fetchError: any = null;

          while (hasMore && !fetchError) {
            const { data, error } = await supabase
              .from('navigator_operations')
              .select('operation_data, sequence_number, timestamp')
              .eq('user_id', user.id)
              .order('timestamp', { ascending: true })
              .order('operation_id', { ascending: true })
              .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

            if (error) {
              fetchError = error;
              break;
            }

            if (data && data.length > 0) {
              allData = allData.concat(data);
              logger.info(`📥 BOOTSTRAP: Fetched page ${page + 1} (${data.length} operations)`);
              hasMore = data.length === BATCH_SIZE; // Continue if we got a full batch
              page++;
            } else {
              hasMore = false;
            }
          }

          if (fetchError) {
            logger.error('❌ BOOTSTRAP FETCH FAILED:', fetchError.message);
          } else if (allData.length > 0) {
            logger.info(`📥 BOOTSTRAP: Received ${allData.length} total operations from cloud`);

            const remoteOperations: Operation[] = [];
            const invalidOps: Array<{raw: any; error: string}> = [];

            // SECURITY: Validate each operation before accepting (prevents malformed data corruption)
            for (const row of allData) {
              const validation = validateSyncOperation(row.operation_data);
              if (!validation.success) {
                const errorMsg = validation.errors?.[0]?.message || 'Unknown validation error';
                logger.warn('🚨 SECURITY: Rejecting invalid operation from cloud:', {
                  error: errorMsg,
                  opId: row.operation_data?.id,
                  opType: row.operation_data?.type,
                });
                invalidOps.push({
                  raw: row.operation_data,
                  error: errorMsg
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
              // 🔧 CRITICAL FIX: Use database sequence_number (correct) instead of operation_data.sequence (corrupted)
              const operation = { ...row.operation_data };
              if (row.sequence_number && typeof row.sequence_number === 'number') {
                operation.sequence = row.sequence_number;
              }
              remoteOperations.push(operation);
            }

            if (invalidOps.length > 0) {
              logger.error(`❌ BOOTSTRAP: Rejected ${invalidOps.length}/${allData.length} malformed operations`, {
                sample: invalidOps.slice(0, 3)
              });
            }

            const remoteByType = remoteOperations.reduce((acc, op) => {
              acc[op.type] = (acc[op.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            const validationSummary = {
              fetchedTotal: allData.length,
              validPassed: remoteOperations.length,
              invalidRejected: invalidOps.length,
              ...remoteByType,
              sessionStartCount: remoteByType['SESSION_START'] || 0,
              completionCount: remoteByType['COMPLETION_CREATE'] || 0,
            };
            logger.debug('📊 BOOTSTRAP: Remote operations by type:', validationSummary);

            // 🔍 DEBUG: Get local operation counts BEFORE merge
            const localOpsBefore = operationLog.current.getAllOperations();
            const localByTypeBefore = localOpsBefore.reduce((acc, op) => {
              acc[op.type] = (acc[op.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            logger.info('📊 BOOTSTRAP: Local operations BEFORE merge:', {
              ...localByTypeBefore,
              total: localOpsBefore.length,
              sessionStartCount: localByTypeBefore['SESSION_START'] || 0,
              completionCount: localByTypeBefore['COMPLETION_CREATE'] || 0,
            });

            // 🔧 CRITICAL FIX: Detect corrupted sequence numbers BEFORE merging
            // If cloud operations have huge sequence numbers compared to local ones, they're likely corrupted
            const localMaxSeqBefore = localOpsBefore.length > 0
              ? Math.max(...localOpsBefore.map(op => op.sequence))
              : 0;

            const cloudMaxSeq = remoteOperations.length > 0
              ? Math.max(...remoteOperations.map(op => op.sequence))
              : 0;

            const seqGap = cloudMaxSeq - localMaxSeqBefore;
            const isCloudSequencesCorrupted = seqGap > SEQUENCE_CORRUPTION_THRESHOLD && localMaxSeqBefore > 100;

            if (isCloudSequencesCorrupted) {
              logger.error('🚨 BOOTSTRAP: Cloud operations have corrupted sequence numbers:', {
                cloudMaxSeq,
                localMaxSeqBefore,
                gap: seqGap,
                threshold: SEQUENCE_CORRUPTION_THRESHOLD,
                remoteOpsCount: remoteOperations.length,
              });

              // 🆕 IMPROVEMENT: Extract valid data from corrupted operations instead of discarding
              // The operation data is valid, only the sequence numbers are corrupted
              // Re-assign clean sequential numbers and apply them
              logger.info('🔧 BOOTSTRAP: Sanitizing corrupted operations - extracting valid data and re-sequencing', {
                corruptedOpsCount: remoteOperations.length
              });

              // Re-assign clean sequences starting after local max
              let nextSequence = localMaxSeqBefore + 1;
              const sanitizedOps = remoteOperations.map((op: Operation) => ({
                ...op,
                sequence: nextSequence++
              }));

              logger.info('✅ BOOTSTRAP: Sanitized corrupted operations', {
                corruptedCount: remoteOperations.length,
                newSequenceRange: `${localMaxSeqBefore + 1} - ${nextSequence - 1}`,
                operationTypes: sanitizedOps.reduce((acc: any, op: Operation) => {
                  acc[op.type] = (acc[op.type] || 0) + 1;
                  return acc;
                }, {})
              });

              // Merge sanitized operations with local operations
              const mergedOps = [...localOpsBefore, ...sanitizedOps];

              // CRITICAL FIX: Persist sanitized operations to IndexedDB immediately
              // Otherwise they'll be lost on page refresh (causing 494→164 data loss)
              const newOpsFromSanitized = await operationLog.current.mergeRemoteOperations(sanitizedOps);

              logger.info('✅ BOOTSTRAP: Persisted sanitized operations to IndexedDB', {
                requestedCount: sanitizedOps.length,
                actuallyMergedCount: newOpsFromSanitized.length,
              });

              // 🔧 CRITICAL VERIFICATION: Mark synced based on ACTUAL log state
              // Even if merge returns 0 (deduplication), we must mark actual ops as synced
              const logStateAfterMerge = operationLog.current.getAllOperations();
              const maxTimestamp = logStateAfterMerge.reduce((max, op) => {
                const maxTime = new Date(max).getTime();
                const opTime = new Date(op.timestamp).getTime();
                return opTime > maxTime ? op.timestamp : max;
              }, logStateAfterMerge[0]?.timestamp || '1970-01-01T00:00:00.000Z');

              if (maxTimestamp && maxTimestamp !== '1970-01-01T00:00:00.000Z') {
                await operationLog.current.markSyncedUpTo(maxTimestamp);
                logger.info('✅ BOOTSTRAP: Marked ALL operations as synced (corruption path)', {
                  sanitizedOpsRequested: sanitizedOps.length,
                  sanitizedOpsMerged: newOpsFromSanitized.length,
                  totalOpsInLog: logStateAfterMerge.length,
                  maxTimestamp,
                  status: newOpsFromSanitized.length > 0 ? 'merged' : 'deduplicated',
                });
              } else {
                logger.warn('⚠️ BOOTSTRAP: Unable to mark synced - no operations in log', {
                  requestedCount: sanitizedOps.length,
                  actualMergedCount: newOpsFromSanitized.length,
                  logSize: logStateAfterMerge.length,
                });
              }

              // Continue to state reconstruction with merged operations
              const newState = reconstructStateWithConflictResolution(
                INITIAL_STATE,
                mergedOps
              );
              logger.info('📊 BOOTSTRAP: Reconstructed state (from local + sanitized cloud):', {
                addresses: newState.addresses?.length || 0,
                completions: newState.completions?.length || 0,
                arrangements: newState.arrangements?.length || 0,
                daySessions: newState.daySessions?.length || 0,
                currentListVersion: newState.currentListVersion,
                mergedOperations: mergedOps.length,
              });
              stateCache.current = { operationCount: mergedOps.length, state: newState };
              setCurrentState(newState);

              // CRITICAL: Notify listeners so App.tsx updates UI!
              // 🔧 CRITICAL FIX: Pass ALL operations from merged log, not just the delta
              const allOperationsAfterMerge = operationLog.current.getAllOperations();
              for (const listener of stateChangeListeners.current) {
                try {
                  listener(allOperationsAfterMerge);
                } catch (err) {
                  logger.error('Error in state change listener:', err);
                }
              }

              return; // Skip the normal merge path
            }

            // 🔍 DEBUG: Log what we're passing to merge (only in verbose mode)
            logger.debug('🔍 BEFORE MERGE:', {
              remoteOpsCount: remoteOperations.length,
              remoteOpIds: remoteOperations.slice(0, 5).map(op => ({id: op.id.substring(0, 8), type: op.type, seq: op.sequence, clientId: op.clientId.substring(0, 8)})),
              totalRemote: remoteOperations.length,
            });

            const newOps = await operationLog.current.mergeRemoteOperations(remoteOperations);

            // 🔍 DEBUG: Log what came back from merge (only in verbose mode)
            logger.debug('🔍 AFTER MERGE:', {
              newOpsCount: newOps.length,
              newOpIds: newOps.slice(0, 5).map(op => ({id: op.id.substring(0, 8), type: op.type})),
            });

            // 🔍 DEBUG: Get local operation counts AFTER merge
            const localOpsAfter = operationLog.current.getAllOperations();
            const localByTypeAfter = localOpsAfter.reduce((acc, op) => {
              acc[op.type] = (acc[op.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            logger.info('📥 BOOTSTRAP MERGE COMPLETE:', {
              newOpsCount: newOps.length,
              duplicateCount: remoteOperations.length - newOps.length,
              localBefore: localByTypeBefore,
              localAfter: localByTypeAfter,
              newOpsAdded: newOps.reduce((acc, op) => {
                acc[op.type] = (acc[op.type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>),
              // 🔍 CRITICAL: Did SESSION_START operations get merged?
              sessionStartBefore: localByTypeBefore['SESSION_START'] || 0,
              sessionStartAfter: localByTypeAfter['SESSION_START'] || 0,
              sessionStartAdded: newOps.filter(op => op.type === 'SESSION_START').length,
            });

            if (newOps.length > 0) {
              // 🔧 CRITICAL FIX: Mark ALL remote operations as synced after bootstrap
              // WHY: Bootstrap fetches ALL operations (paginated), so all should be marked as synced
              // If we only mark "this device's" operations, other devices' operations get re-fetched
              // and then deduplicated away, causing data loss on page refresh (29 PIFs → 10 PIFs)

              const allRemoteSequences = remoteOperations.map(op => op.sequence);

              if (allRemoteSequences.length > 0) {
                const maxCloudSeq = Math.max(...allRemoteSequences);
                const localMaxSeq = operationLog.current.getAllOperations().length > 0
                  ? Math.max(...operationLog.current.getAllOperations().map(op => op.sequence))
                  : 0;

                // PHASE 1.1.2 FIX: Use configurable threshold for sequence corruption detection
                // The SEQUENCE_CORRUPTION_THRESHOLD is defined in syncConfig.ts
                // Increased from 1000 to 10000 to reduce false positives
                const gap = maxCloudSeq - localMaxSeq;
                const isCloudCorrupted = gap > SEQUENCE_CORRUPTION_THRESHOLD && localMaxSeq > 100;

                if (isCloudCorrupted) {
                  logger.error('🚨 BOOTSTRAP: Cloud operations have corrupted sequence numbers!', {
                    cloudMaxSeq: maxCloudSeq,
                    localMaxSeq,
                    gap,
                    threshold: SEQUENCE_CORRUPTION_THRESHOLD,
                  });
                  // DON'T use this corrupted sequence - it will poison our local sequence generator
                  logger.info('📥 BOOTSTRAP: Skipping corrupted sequence number marking (would cause sequence collision)');
                } else if (Number.isFinite(maxCloudSeq)) {
                  // ✅ TIMESTAMP-BASED SYNC: Use max timestamp in log
                  const allOperations = operationLog.current.getAllOperations();
                  const maxTimestampAfterMerge = allOperations.reduce((max, op) => {
                    const maxTime = new Date(max).getTime();
                    const opTime = new Date(op.timestamp).getTime();
                    return opTime > maxTime ? op.timestamp : max;
                  }, allOperations[0]?.timestamp || '1970-01-01T00:00:00.000Z');

                  if (maxTimestampAfterMerge && maxTimestampAfterMerge !== '1970-01-01T00:00:00.000Z') {
                    await operationLog.current.markSyncedUpTo(maxTimestampAfterMerge);
                    logger.info(`✅ BOOTSTRAP: Marked ALL operations as synced (normal path)`, {
                      cloudMaxSeq,
                      localMaxSeqBefore: localMaxSeq,
                      maxTimestampInLog: maxTimestampAfterMerge,
                      totalOpsInLog: allOperations.length,
                      totalRemoteOps: remoteOperations.length,
                      gap,
                      threshold: SEQUENCE_CORRUPTION_THRESHOLD,
                      status: 'valid',
                    });
                  }
                }
              } else {
                logger.info(`📥 BOOTSTRAP: No remote operations to mark as synced`);
              }

              // Reconstruct state with merged operations
              // PHASE 1.3: Use conflict resolution for vector clock-based integrity
              const allOps = operationLog.current.getAllOperations();
              logger.info(`🔄 BOOTSTRAP: Reconstructing state from ${allOps.length} total operations`);
              const newState = reconstructStateWithConflictResolution(
                INITIAL_STATE,
                allOps
              );
              logger.info('📊 BOOTSTRAP: Reconstructed state:', {
                addresses: newState.addresses?.length || 0,
                completions: newState.completions?.length || 0,
                arrangements: newState.arrangements?.length || 0,
                daySessions: newState.daySessions?.length || 0,
                currentListVersion: newState.currentListVersion,
              });
              // Cache the state for later
              stateCache.current = { operationCount: allOps.length, state: newState };
              setCurrentState(newState);

              // CRITICAL: Notify listeners so App.tsx updates UI!
              // 🔧 CRITICAL FIX: Pass ALL operations from log, not just newOps delta
              logger.info(`📤 BOOTSTRAP: Notifying ${stateChangeListeners.current.size} listeners`);
              const allOperationsAfterBootstrap = operationLog.current.getAllOperations();
              stateChangeListeners.current.forEach(listener => {
                try {
                  listener(allOperationsAfterBootstrap);
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

        // 🔧 CRITICAL FIX: Check for unsynced operations after bootstrap and sync immediately
        // This fixes the race condition where operations are created, page refreshes before 2s timer,
        // and operations never upload because AUTO-SYNC effect runs before operationLog is ready
        if (operationLog.current) {
          const unsyncedOps = operationLog.current.getUnsyncedOperations();
          if (unsyncedOps.length > 0) {
            logger.info(`🔄 BOOTSTRAP COMPLETE: Found ${unsyncedOps.length} unsynced operations, triggering immediate sync`);
            // Trigger sync with slight delay to ensure everything is stable
            setTimeout(() => {
              if (scheduleBatchSyncRef.current) {
                scheduleBatchSyncRef.current();
              }
            }, 100);
          }
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

  // 🔧 CRITICAL FIX: Ref to scheduleBatchSync so it can be called from bootstrap effect
  const scheduleBatchSyncRef = useRef<(() => void) | null>(null);

  // Trigger batch sync with debouncing
  const scheduleBatchSync = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
    }

    if (pendingBatchRef.current) {
      return; // Already syncing
    }

    batchTimerRef.current = setTimeout(async () => {
      // 🔧 CRITICAL FIX: Check refs to get current values, not stale closures
      const currentUser = userRef.current;
      const currentSupabase = supabaseRef.current;

      logger.debug('🔄 BATCH SYNC CHECK:', {
        isOnline,
        hasUser: !!currentUser,
        hasOperationLog: !!operationLog.current,
        hasSupabase: !!currentSupabase,
        willSync: isOnline && !!currentUser && !!operationLog.current && !!currentSupabase
      });

      if (!isOnline || !currentUser || !operationLog.current || !currentSupabase) {
        logger.debug('⏭️ BATCH SYNC SKIPPED - preconditions not met:', {
          isOnline,
          user: currentUser ? 'authenticated' : 'NOT AUTHENTICATED',
          operationLog: operationLog.current ? 'loaded' : 'NOT LOADED',
          supabase: currentSupabase ? 'configured' : 'NOT CONFIGURED',
        });
        return;
      }

      const unsyncedCount = operationLog.current.getUnsyncedOperations().length;
      logger.debug('📋 UNSYNCED OPERATIONS:', unsyncedCount);

      // Only sync if we have operations to sync
      if (unsyncedCount > 0) {
        logger.debug('📤 STARTING BATCH SYNC for', unsyncedCount, 'operations');
        try {
          pendingBatchRef.current = true;
          await syncOperationsToCloud();
        } catch (err) {
          logger.warn('Batch sync failed:', err);
          console.error('❌ BATCH SYNC ERROR:', err);
        } finally {
          pendingBatchRef.current = false;
        }
      } else {
        logger.debug('⏭️ NO UNSYNCED OPERATIONS - skipping sync');
      }
    }, 2000); // 2 second debounce
  }, [isOnline, user]);

  // PHASE 1.3: Track current user to detect signout during operation submission
  const currentUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // 🔧 CRITICAL FIX: Keep userRef updated for closure-safe access
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // 🔧 CRITICAL FIX: Keep scheduleBatchSyncRef updated so bootstrap can trigger sync
  useEffect(() => {
    scheduleBatchSyncRef.current = scheduleBatchSync;
  }, [scheduleBatchSync]);

  // Submit a new operation
  const submitOperation = useCallback(async (
    operationData: Omit<Operation, 'id' | 'timestamp' | 'clientId' | 'sequence'>
  ): Promise<void> => {
    // PHASE 1.3: CRITICAL FIX - Validate operation can be submitted to correct user's log
    if (!operationLog.current) {
      logger.error('❌ SYNC FAILURE: Operation log not initialized');
      throw new Error('Operation log not initialized');
    }

    // Verify user hasn't signed out since this operation was initiated
    if (!currentUserIdRef.current) {
      logger.error('❌ SYNC FAILURE: User signed out - rejecting operation');
      throw new Error('User signed out - cannot submit operation');
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
    // SequenceGenerator automatically caps unreasonable sequences to prevent timestamp poisoning
    const persistedOperation = await operationLog.current.append(operationEnvelope);

    // Apply to local state immediately for optimistic update
    // 🔧 PERFORMANCE: Only rebuild if operations changed (most calls do, but cache handles edge cases)
    const newState = rebuildStateIfNeeded(true); // Force rebuild since we just added an operation
    setCurrentState(newState);

    // Notify all listeners of state change (critical for App.tsx to update!)
    // 🔧 CRITICAL FIX: Pass ALL operations from log, not just the single new operation
    const allOperationsAfterSubmit = operationLog.current.getAllOperations();
    stateChangeListeners.current.forEach(listener => {
      try {
        listener(allOperationsAfterSubmit);
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
    // 🔧 CRITICAL FIX: Check refs to get current values, not stale closures
    const currentUser = userRef.current;
    const currentSupabase = supabaseRef.current;

    logger.debug('🔄 syncOperationsToCloud called');
    if (!operationLog.current || !currentUser || !currentSupabase) {
      logger.debug('⏭️ SYNC SKIPPED - missing prerequisites:', {
        operationLog: !!operationLog.current,
        user: !!currentUser,
        supabase: !!currentSupabase,
      });
      return;
    }

    setIsSyncing(true);
    try {
      // 🔄 PHASE 1: Check retry queue for operations ready to retry
      const retryItems = await retryQueueManager.getReadyForRetry();
      logger.debug('🔄 RETRY QUEUE: Operations ready for retry:', retryItems.length);

      // Get unsynced operations from log
      const unsyncedOps = operationLog.current.getUnsyncedOperations();
      logger.debug('📋 Unsynced operations from log:', unsyncedOps.length);

      // Merge retry queue operations with unsynced operations
      // Retry queue operations take priority (they've already failed once)
      const allOpsToSync = [
        ...retryItems.map(item => item.operation),
        ...unsyncedOps.filter(op =>
          // Don't duplicate operations already in retry queue
          !retryItems.some(item => item.operation.sequence === op.sequence)
        )
      ];

      if (allOpsToSync.length === 0) {
        logger.debug('✅ No operations to sync (log + retry queue both empty)');
        return; // Nothing to sync
      }

      const uploadMsg = `📤 UPLOADING ${allOpsToSync.length} operations to cloud (${retryItems.length} from retry queue, ${unsyncedOps.length} new)...`;
      logger.debug(uploadMsg);

      // 🔧 CRITICAL FIX: Track successful uploads instead of assuming all succeed
      const successfulSequences: number[] = [];
      const successfulTimestamps: string[] = [];

      // Upload operations to cloud with retry logic
      for (const operation of allOpsToSync) {
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

        // 🔧 IMPROVEMENT: Upload with retry logic (exponential backoff)
        // If transient failure occurs (network, timeout, 5xx), retry automatically
        // If permanent failure (4xx), fail immediately
        try {
          await retryWithCustom(
            async () => {
              const { error, status } = await currentSupabase!
                .from('navigator_operations')
                .upsert({
                  // New columns
                  user_id: currentUser.id,
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

              // Return error for retry logic to evaluate
              if (error) {
                // Handle duplicate operation_id (idempotency)
                // Error 23505 = unique constraint violation on operation_id
                if (error.code === '23505') {
                  // Duplicate operation_id - already uploaded successfully
                  logger.debug('Operation already uploaded (idempotent):', operation.id);
                  return { success: true, alreadyExists: true };
                }

                const errorObj = new Error(error.message);
                (errorObj as any).status = status;
                (errorObj as any).code = error.code;
                (errorObj as any).details = error.details;
                throw errorObj;
              }

              return { success: true };
            },
            `Upload operation ${operation.type} seq=${operation.sequence}`,
            (error, attempt) => {
              // Only retry on transient errors
              const shouldRetry = isRetryableError(error);
              if (!shouldRetry) {
                logger.error(`❌ Permanent error (not retrying):`, {
                  error: error.message,
                  attempt,
                });
              }
              return shouldRetry;
            },
            // Use slightly different config for uploads: fewer retries, faster timeout
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
          );

          // ✅ Track this as successfully uploaded (by timestamp)
          successfulSequences.push(operation.sequence);
          successfulTimestamps.push(operation.timestamp);

          // 🔄 PHASE 1: Remove from retry queue if this was a retry
          const wasRetry = retryItems.some(item => item.operation.sequence === operation.sequence);
          if (wasRetry) {
            await retryQueueManager.removeFromQueue(operation.sequence);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);

          logger.error('❌ UPLOAD FAILED (after retries):', {
            operation: operation.type,
            sequence: operation.sequence,
            error: errorMsg,
          });

          // 🔄 PHASE 1: Add to persistent retry queue instead of in-memory array
          const existingRetryItem = retryItems.find(item => item.operation.sequence === operation.sequence);
          await retryQueueManager.addToQueue(operation, errorMsg, existingRetryItem);

          // Continue to next operation instead of stopping
        }
      }

      // 🔧 TIMESTAMP-BASED SYNC: Mark up to highest successfully uploaded timestamp
      // Unlike sequences, timestamps don't have "gaps" - each operation is independent
      // We simply track the max timestamp of all successful uploads
      if (successfulTimestamps.length > 0) {
        // Find the maximum timestamp among successful uploads
        const maxTimestamp = successfulTimestamps.reduce((max, ts) => {
          const maxTime = new Date(max).getTime();
          const tsTime = new Date(ts).getTime();
          return tsTime > maxTime ? ts : max;
        });

        const currentLastSynced = operationLog.current.getLogState().lastSyncTimestamp;
        const maxTime = new Date(maxTimestamp).getTime();
        const currentTime = currentLastSynced ? new Date(currentLastSynced).getTime() : 0;

        // Only update if we actually advanced
        if (maxTime > currentTime) {
          await operationLog.current.markSyncedUpTo(maxTimestamp);
          setLastSyncTime(new Date());

          // 🔄 PHASE 1: Get retry queue stats for summary
          const queueStats = await retryQueueManager.getQueueStats();

          const syncSummary = {
            total: allOpsToSync.length,
            succeeded: successfulSequences.length,
            failed: queueStats.total,
            inRetryQueue: queueStats.total,
            readyForRetry: queueStats.ready,
            previousLastSynced: currentLastSynced || '(never)',
            newLastSynced: maxTimestamp,
          };
          logger.debug('✅ SYNC COMPLETE:', syncSummary);

          if (queueStats.total > 0) {
            logger.error('⚠️ RETRY QUEUE STATUS:', {
              totalInQueue: queueStats.total,
              readyForRetry: queueStats.ready,
              waitingForBackoff: queueStats.waiting,
              nextRetry: queueStats.oldestRetry,
            });
          }
        }
      } else {
        console.error('❌ ALL UPLOADS FAILED - no operations marked as synced');
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
      const lastSyncTimestamp = operationLog.current.getLogState().lastSyncTimestamp;

      logger.info(`📥 FETCHING operations from cloud (after timestamp ${lastSyncTimestamp || '(never)'})...`);

      // BEST PRACTICE: Wrap fetch in retry logic to handle transient network failures
      // 🔧 CRITICAL FIX: Paginate to fetch ALL new operations (Supabase default limit is 1000)
      const data = await retryWithBackoff(
        async () => {
          const BATCH_SIZE = 1000;
          let allFetchedData: any[] = [];
          let page = 0;
          let hasMore = true;

          while (hasMore) {
            const query = supabase!
              .from('navigator_operations')
              .select('operation_data, sequence_number, timestamp')
              .eq('user_id', user.id);

            // Filter by timestamp if we've synced before
            if (lastSyncTimestamp) {
              query.gt('timestamp', lastSyncTimestamp);
            }

            const { data: fetchedData, error } = await query
              .order('timestamp', { ascending: true })
              .order('operation_id', { ascending: true })
              .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

            if (error) {
              // Convert Supabase error to Error with status code for retry logic
              const errorObj = new Error(error.message);
              // Map Supabase error codes to HTTP status codes
              (errorObj as any).status = error.code === 'PGRST116' ? 503 : 500;
              logger.error('❌ FETCH FAILED:', {
                error: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
              });
              throw errorObj;
            }

            if (fetchedData && fetchedData.length > 0) {
              allFetchedData = allFetchedData.concat(fetchedData);
              hasMore = fetchedData.length === BATCH_SIZE;
              page++;
              if (hasMore) {
                logger.info(`📥 FETCH: Fetched page ${page} (${fetchedData.length} operations), continuing...`);
              }
            } else {
              hasMore = false;
            }
          }

          return allFetchedData;
        },
        'Fetch operations from cloud',
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        }
      );

      if (data && data.length > 0) {
        logger.info(`📥 RECEIVED ${data.length} operations from cloud`);

        const remoteOperations: Operation[] = [];
        const invalidOps: Array<{error: string; opType?: string}> = [];

        // SECURITY: Validate each operation before accepting (prevents malformed data corruption)
        for (const row of data) {
          const validation = validateSyncOperation(row.operation_data);
          if (!validation.success) {
            const errorMsg = validation.errors?.[0]?.message || 'Unknown validation error';
            logger.warn('🚨 SECURITY: Rejecting invalid operation from cloud:', {
              error: errorMsg,
              opType: row.operation_data?.type,
            });
            invalidOps.push({
              error: errorMsg,
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
          // 🔧 CRITICAL FIX: Use database sequence_number (correct) instead of operation_data.sequence (corrupted)
          const operation = { ...row.operation_data };
          if (row.sequence_number && typeof row.sequence_number === 'number') {
            operation.sequence = row.sequence_number;
          }
          remoteOperations.push(operation);
        }

        if (invalidOps.length > 0) {
          logger.error(`❌ FETCH: Rejected ${invalidOps.length}/${data.length} malformed operations`);
        }

        // Merge remote operations and resolve conflicts
        const newOperations = await operationLog.current!.mergeRemoteOperations(remoteOperations);

        // ✅ TIMESTAMP-BASED SYNC: No gap detection needed!
        // Timestamps don't have "gaps" - each operation is independent
        // Old sequence-based gap recovery code removed
        const gaps: any[] = []; // Unused - dead code below kept for reference
        if (false) { // Dead code - keeping structure for now
          logger.info(`🔄 GAP RECOVERY: Detected ${gaps.length} gaps, attempting recovery...`);

          let totalRecovered = 0;
          for (const gap of gaps) {
            try {
              // Fetch missing operations from cloud with pagination
              // 🔧 CRITICAL FIX: Paginate gap recovery (gaps could be >1000 operations)
              const BATCH_SIZE = 1000;
              let gapData: any[] = [];
              let page = 0;
              let hasMore = true;
              let gapError: any = null;

              while (hasMore && !gapError) {
                const { data: fetchedGapData, error } = await supabase!
                  .from('navigator_operations')
                  .select('operation_data, sequence_number')
                  .eq('user_id', user.id)
                  .gte('sequence_number', gap.from + 1)
                  .lte('sequence_number', gap.to - 1)
                  .order('sequence_number', { ascending: true })
                  .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

                if (error) {
                  gapError = error;
                  break;
                }

                if (fetchedGapData && fetchedGapData.length > 0) {
                  gapData = gapData.concat(fetchedGapData);
                  hasMore = fetchedGapData.length === BATCH_SIZE;
                  page++;
                } else {
                  hasMore = false;
                }
              }

              if (gapError) {
                logger.error(`Failed to fetch gap ${gap.from}...${gap.to}:`, gapError);
                continue;
              }

              if (gapData.length > 0) {
                logger.info(`📥 RECOVERY: Found ${gapData.length} operations for gap ${gap.from}...${gap.to}`);

                const gapOperations: Operation[] = gapData
                  .map(row => {
                    // 🔧 CRITICAL FIX: Use database sequence_number (correct) instead of operation_data.sequence (corrupted)
                    const operation = { ...row.operation_data };
                    if (row.sequence_number && typeof row.sequence_number === 'number') {
                      operation.sequence = row.sequence_number;
                    }
                    return operation;
                  })
                  .filter(op => op && typeof op === 'object');

                // Merge recovered operations and track what was actually merged
                const actuallyMerged = await operationLog.current!.mergeRemoteOperations(gapOperations);
                totalRecovered += actuallyMerged.length;

                logger.info(`✅ RECOVERY: Merged ${actuallyMerged.length}/${gapOperations.length} operations for gap ${gap.from}...${gap.to}`, {
                  requested: gapOperations.length,
                  merged: actuallyMerged.length,
                  duplicates: gapOperations.length - actuallyMerged.length,
                });
              } else {
                logger.warn(`⚠️ RECOVERY: Gap ${gap.from}...${gap.to} not found in cloud (may have been deleted)`);
              }
            } catch (error) {
              logger.error(`❌ RECOVERY: Failed to recover gap ${gap.from}...${gap.to}:`, error);
            }
          }

          if (totalRecovered > 0) {
            logger.info(`✅ GAP RECOVERY COMPLETE: Recovered ${totalRecovered} operations`);
          } else {
            logger.warn(`⚠️ GAP RECOVERY: No operations recovered (gaps may be from deleted operations)`);
          }
        }

        if (newOperations.length > 0) {
          // ✅ TIMESTAMP-BASED SYNC: Mark synced based on max timestamp
          const allOperations = operationLog.current.getAllOperations();
          const maxTimestamp = allOperations.reduce((max, op) => {
            const maxTime = new Date(max).getTime();
            const opTime = new Date(op.timestamp).getTime();
            return opTime > maxTime ? op.timestamp : max;
          }, allOperations[0]?.timestamp || new Date(0).toISOString());

          if (maxTimestamp && maxTimestamp !== new Date(0).toISOString()) {
            await operationLog.current!.markSyncedUpTo(maxTimestamp);
            logger.info('✅ INCREMENTAL SYNC: Marked synced up to max timestamp', {
              maxTimestamp,
              newOpsCount: newOperations.length,
              totalOpsInLog: allOperations.length,
            });
          }

          // Reconstruct state from all operations
          // PHASE 1.3: Use conflict resolution for vector clock-based integrity
          const newState = reconstructStateWithConflictResolution(
            INITIAL_STATE,
            allOperations
          );
          setCurrentState(newState);

          logger.info('✅ FETCH SUCCESS: State updated with remote operations');
        } else {
          // 🔧 CRITICAL DEBUG: All operations marked as duplicates - verify state completeness
          logger.debug('⚠️ BOOTSTRAP: All cloud operations were duplicates - verifying state completeness');

          const allOperations = operationLog.current.getAllOperations();
          const reconstructedState = reconstructStateWithConflictResolution(
            INITIAL_STATE,
            allOperations
          );

          // Check if state looks incomplete (completions without sessions)
          if (reconstructedState.completions.length > 0 && reconstructedState.daySessions.length === 0) {
            logger.warn('⚠️ BOOTSTRAP WARNING: Completions exist but NO day sessions - data structure incomplete!');
            logger.warn(`📊 Completions: ${reconstructedState.completions.length}, Sessions: ${reconstructedState.daySessions.length}`);
          } else if (reconstructedState.completions.length > 0 && reconstructedState.daySessions.length < 5) {
            logger.warn('⚠️ BOOTSTRAP WARNING: Few sessions but many completions - may be showing filtered view');
            logger.warn(`📊 Completions: ${reconstructedState.completions.length}, Sessions: ${reconstructedState.daySessions.length}`);
          }
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

      // BEST PRACTICE: Track subscription health with heartbeat
      let lastHeartbeat = Date.now();
      const HEARTBEAT_INTERVAL = 30000; // Check every 30 seconds
      const HEARTBEAT_TIMEOUT = 90000;  // Reconnect after 90 seconds of silence

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
            // Update heartbeat on any message
            lastHeartbeat = Date.now();

            logger.info('📥 REAL-TIME: Received operation from another device');
            const operation: Operation = payload.new.operation_data;

            // SECURITY: Validate operation before processing (prevents malformed data corruption)
            const validation = validateSyncOperation(operation);
            if (!validation.success) {
              const errorMsg = validation.errors?.[0]?.message || 'Unknown validation error';
              logger.error('🚨 SECURITY: Rejecting invalid real-time operation:', {
                error: errorMsg,
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
              // BEST PRACTICE: Wrap real-time merge in retry logic
              await retryWithBackoff(
                async () => {
                  const newOps = await operationLog.current!.mergeRemoteOperations([operation]);

                  if (newOps.length > 0) {
                    // 🔧 CRITICAL FIX: Don't mark operations from OTHER devices as synced
                    // Only mark as synced if this operation is from THIS device (shouldn't happen here since we filter above)
                    // This is just for safety in case the filter is removed
                    if (operation.clientId === deviceId.current) {
                      await operationLog.current!.markSyncedUpTo(operation.timestamp);
                      logger.info('📥 REAL-TIME: Marked own operation as synced');
                    }

                    // Reconstruct state and notify
                    // PHASE 1.3: Use conflict resolution for vector clock-based integrity
                    const allOperations = operationLog.current!.getAllOperations();
                    const newState = reconstructStateWithConflictResolution(
                      INITIAL_STATE,
                      allOperations
                    );
                    setCurrentState(newState);
                    // 🔧 CRITICAL FIX: Pass ALL operations, not just newOps delta
                    onOperations(allOperations);

                    logger.info('✅ REAL-TIME SYNC: State updated with remote operation');
                  } else {
                    logger.debug('No new operations after merge (already had it)');
                  }
                },
                `Merge real-time operation ${operation.id}`,
                {
                  maxAttempts: 3,
                  initialDelayMs: 500,
                  maxDelayMs: 5000,
                  backoffMultiplier: 2,
                }
              );
            }
          } catch (err) {
            logger.error('❌ REAL-TIME ERROR: Failed to process operation:', err);
          }
        }
      );

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('✅ Real-time subscription CONNECTED successfully');
          lastHeartbeat = Date.now(); // Reset heartbeat on successful connection
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

      // BEST PRACTICE: Monitor subscription health and reconnect if dead
      const healthCheckInterval = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastHeartbeat;

        if (timeSinceLastMessage > HEARTBEAT_TIMEOUT) {
          logger.warn('⚠️ REALTIME: Subscription appears dead, reconnecting...', {
            timeSinceLastMessage: Math.floor(timeSinceLastMessage / 1000) + 's',
            timeout: HEARTBEAT_TIMEOUT / 1000 + 's',
          });

          // Unsubscribe and let React re-establish connection
          try {
            supabase?.removeChannel(channel);
          } catch (error) {
            logger.error('Error removing dead channel:', error);
          }

          // Clear this interval (will be recreated on reconnection)
          clearInterval(healthCheckInterval);

          // Trigger reconnection by calling subscribeToOperations again
          // Note: This will be handled by React's useEffect cleanup and re-run
          if (subscriptionCleanup.current) {
            subscriptionCleanup.current();
            subscriptionCleanup.current = null;
          }
        } else {
          logger.debug('✅ REALTIME: Subscription healthy', {
            timeSinceLastMessage: Math.floor(timeSinceLastMessage / 1000) + 's',
          });
        }
      }, HEARTBEAT_INTERVAL);

      const cleanup = () => {
        logger.info('🔌 Cleaning up real-time subscription');

        // Clean up health check interval
        clearInterval(healthCheckInterval);

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

    // PHASE 1.3: CRITICAL FIX - Prevent user data leakage on signout
    // 1. Immediately nullify the operation log reference to prevent further writes
    //    This ensures no pending operations can be appended to the old user's log
    const oldLog = operationLog.current;
    operationLog.current = null;

    // 2. Clear operation logs for this user from the global cache
    if (user?.id) {
      clearOperationLogsForUser(user.id);
    }

    // 3. If there was an old log, clear it to release memory
    if (oldLog) {
      try {
        await oldLog.clear();
      } catch (err) {
        logger.error('Failed to clear old operation log:', err);
      }
    }

    // 4. Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // 5. Reset app state
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
    // 🔧 CRITICAL FIX: Check refs to get current values, not stale closures
    const currentUser = userRef.current;
    const currentSupabase = supabaseRef.current;

    logger.info('🔍 AUTO-SYNC EFFECT TRIGGERED:', {
      hasUser: !!currentUser,
      userId: currentUser?.id,
      isOnline,
      isLoading,
      hasOperationLog: !!operationLog.current,
      hasSupabase: !!currentSupabase,
    });

    if (!currentUser || !isOnline || !operationLog.current || isLoading || !currentSupabase) {
      logger.warn('⚠️ AUTO-SYNC SKIPPED - conditions not met:', {
        hasUser: !!currentUser,
        isOnline,
        hasOperationLog: !!operationLog.current,
        isLoading,
        hasSupabase: !!currentSupabase,
      });
      return;
    }

    // PHASE 1.3: CRITICAL FIX - Track pending timer to prevent memory leak
    let autoSyncTimerRef: NodeJS.Timeout | null = null;
    let isMounted = true;

    const checkAndSyncUnsynced = async () => {
      try {
        const unsyncedOps = operationLog.current?.getUnsyncedOperations() || [];
        if (unsyncedOps.length > 0) {
          logger.info(`📤 AUTO-SYNC: Found ${unsyncedOps.length} unsynced operations on startup, triggering upload`);
          // PHASE 1.3: CRITICAL FIX - Track timer for proper cleanup
          // Delay slightly to ensure everything is ready
          await new Promise<void>(resolve => {
            autoSyncTimerRef = setTimeout(() => {
              if (isMounted) {
                resolve();
              }
            }, 2000);
          });

          // Inline sync to avoid dependency issues
          if (operationLog.current && currentUser && isOnline && currentSupabase) {
            setIsSyncing(true);
            try {
              // BEST PRACTICE: Wrap auto-sync in retry logic
              await retryWithBackoff(
                async () => {
                  const opsToSync = operationLog.current!.getUnsyncedOperations();
                  logger.info(`📤 AUTO-SYNC: UPLOADING ${opsToSync.length} operations to cloud...`);

              // 🔧 CRITICAL FIX: Track successful uploads (same as syncOperationsToCloud)
              const successfulSequences: number[] = [];
              const successfulTimestamps: string[] = [];
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

                const { error } = await currentSupabase!
                  .from('navigator_operations')
                  .upsert({
                    // New columns
                    user_id: currentUser.id,
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

                // Track successful upload (by timestamp)
                successfulSequences.push(operation.sequence);
                successfulTimestamps.push(operation.timestamp);
              }

              // 🔧 TIMESTAMP-BASED SYNC: Mark up to highest successfully uploaded timestamp
              if (successfulTimestamps.length > 0) {
                // Find the maximum timestamp among successful uploads
                const maxTimestamp = successfulTimestamps.reduce((max, ts) => {
                  const maxTime = new Date(max).getTime();
                  const tsTime = new Date(ts).getTime();
                  return tsTime > maxTime ? ts : max;
                });

                const currentLastSynced = operationLog.current!.getLogState().lastSyncTimestamp;
                const maxTime = new Date(maxTimestamp).getTime();
                const currentTime = currentLastSynced ? new Date(currentLastSynced).getTime() : 0;

                // Only update if we actually advanced
                if (maxTime > currentTime) {
                  await operationLog.current!.markSyncedUpTo(maxTimestamp);

                  logger.info('✅ AUTO-SYNC COMPLETE:', {
                    total: opsToSync.length,
                    succeeded: successfulSequences.length,
                    failed: failedOps.length,
                    previousLastSynced: currentLastSynced || '(never)',
                    newLastSynced: maxTimestamp,
                  });

                  if (failedOps.length > 0) {
                    logger.error('⚠️ AUTO-SYNC FAILED OPERATIONS (will retry):', failedOps);
                  }

                  setLastSyncTime(new Date());
                }
              } else {
                logger.error('❌ AUTO-SYNC: All uploads failed');
                throw new Error('All auto-sync uploads failed');
              }
                },
                'Auto-sync unsynced operations',
                {
                  maxAttempts: 2,
                  initialDelayMs: 2000,
                  maxDelayMs: 10000,
                  backoffMultiplier: 2,
                }
              );
            } catch (err) {
              logger.error('AUTO-SYNC failed after retries:', err);
              // Don't throw - operation will be retried next time app starts
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

    // PHASE 1.3: CRITICAL FIX - Cleanup timer on unmount or dependency change
    return () => {
      isMounted = false;
      if (autoSyncTimerRef) {
        clearTimeout(autoSyncTimerRef);
        autoSyncTimerRef = null;
      }
    };
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
      console.log('  Last synced timestamp:', stats.lastSyncTimestamp || '(never)');

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
        console.log('  Last synced timestamp:', stats.lastSyncTimestamp || '(never)');
        console.log('  Unsynced operations:', manager.getUnsyncedOperations().length);
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

        // Reset sync timestamp to force re-upload (use epoch timestamp so all operations are "newer")
        const logState = manager.getLogState();
        logState.lastSyncTimestamp = '1970-01-01T00:00:00.000Z'; // Epoch - all operations are newer than this
        await storageManager.queuedSet('navigator_operation_log_v1', logState);
        console.log('✅ Reset lastSyncTimestamp to epoch (all operations will be uploaded)');

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