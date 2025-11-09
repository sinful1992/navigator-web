// src/sync/operationLog.ts - Operation log management with atomic transactions
import type { Operation } from './operations';
import { nextSequence, setSequence } from './operations';
import { storageManager } from '../utils/storageManager';
import { logger } from '../utils/logger';
import { ENABLE_SEQUENCE_CONTINUITY_VALIDATION, SEQUENCE_CORRUPTION_THRESHOLD } from './syncConfig';

const OPERATION_LOG_KEY = 'navigator_operation_log_v1';
const TRANSACTION_LOG_KEY = 'navigator_transaction_log_v1';

/**
 * PHASE 1.2.1: Vector Clock for Multi-Device Conflict Detection
 *
 * Vector clock tracks logical timestamp from each device
 * Example: { 'device-1': 5, 'device-2': 3, 'device-3': 7 }
 *
 * Interpretation:
 * - This device has seen 5 operations from device-1
 * - This device has seen 3 operations from device-2
 * - This device has seen 7 operations from device-3
 *
 * Usage:
 * - Compare vector clocks to detect causal relationships
 * - Detect concurrent operations (not causally related)
 * - Prevent duplicate completions using causality
 */
export type VectorClock = Record<string, number>;

export type OperationLog = {
  operations: Operation[];
  lastSequence: number;
  lastSyncTimestamp: string | null; // Last timestamp we synced to cloud (null = never synced)
  checksum: string;
  vectorClock?: VectorClock; // PHASE 1.2.1: Track logical time per device
};

/**
 * 🔧 ATOMIC: Transaction log for write-ahead logging
 * Stores the intent to merge operations before actually merging
 * Used for recovery if app crashes mid-transaction
 */
export type TransactionLog = {
  isInProgress: boolean;
  operationsBefore: Operation[];
  operationsToMerge: Operation[];
  lastSequenceBefore: number;
  lastSyncTimestampBefore: string | null;
  checksumBefore: string;
  timestamp: string;
};

/**
 * Manages the local operation log with atomic merge transactions
 * This is the source of truth for what operations have been applied locally
 *
 * ATOMIC GUARANTEE: mergeRemoteOperations is all-or-nothing
 * - Either all operations are merged or none are
 * - Uses write-ahead logging for crash recovery
 * - Transaction flag prevents partial merges
 *
 * PHASE 1.1.3: Per-Client Sequence Tracking
 * - Tracks highest sequence number seen from each device
 * - Detects out-of-order operations (sequence goes backwards)
 * - Helps identify which device has sync issues
 */
export class OperationLogManager {
  private log: OperationLog = {
    operations: [],
    lastSequence: 0,
    lastSyncTimestamp: null,
    checksum: '',
  };

  // PHASE 1.1.3: Track per-client sequence for out-of-order detection
  private clientSequences: Map<string, number> = new Map();

  // PHASE 1.2.1: Vector clock for multi-device conflict detection
  private vectorClock: VectorClock = {};

  private deviceId: string;
  private isLoaded = false;
  private onCorruptionDetected?: () => void;

  constructor(deviceId: string, onCorruptionDetected?: () => void) {
    this.deviceId = deviceId;
    this.onCorruptionDetected = onCorruptionDetected;
  }

  /**
   * Load operation log from IndexedDB
   * Also checks for incomplete transactions and recovers from them
   */
  async load(): Promise<void> {
    try {
      // First check for incomplete transaction (crash recovery)
      await this.recoverFromIncompleteTransaction();

      const saved = await storageManager.queuedGet(OPERATION_LOG_KEY) as OperationLog | null;

      if (saved) {
        // BEST PRACTICE: Validate saved data structure
        if (saved.operations && !Array.isArray(saved.operations)) {
          logger.error('IndexedDB corrupted: operations is not an array!', {
            type: typeof saved.operations,
            value: saved.operations,
          });

          // Notify app of corruption
          if (this.onCorruptionDetected) {
            try {
              this.onCorruptionDetected();
            } catch (err) {
              logger.error('Error calling onCorruptionDetected callback:', err);
            }
          }

          // Reset to empty log (corrupted data unusable)
          this.log = {
            operations: [],
            lastSequence: 0,
            lastSyncTimestamp: null,
            checksum: '',
          };
          this.isLoaded = true;
          return;
        }

        this.log = saved;

        // 🔧 CRITICAL FIX: Detect and cleanup corrupted sequences in local log
        // This happens when operations were created with huge sequence numbers (e.g., Unix timestamps)
        let hasCorruptedSequences = false;
        try {
          const sequences = this.log.operations.map(op => op.sequence).sort((a, b) => a - b);

          // If we have a huge gap in sequences (e.g., gap > 10000), it indicates corruption
          // Example: sequences [1, 2, 46, 1758009505, 1758009894] - big jump after 46
          if (sequences.length > 2) {
            for (let i = 0; i < sequences.length - 1; i++) {
              const gap = sequences[i + 1] - sequences[i];
              if (gap > SEQUENCE_CORRUPTION_THRESHOLD) {
                // Found a huge jump - likely corruption
                hasCorruptedSequences = true;
                logger.warn('🔧 LOAD: Detected corrupted sequences in local log', {
                  gapAt: `${sequences[i]}...${sequences[i + 1]}`,
                  gapSize: gap,
                  threshold: SEQUENCE_CORRUPTION_THRESHOLD,
                });
                break;
              }
            }
          }

          // If corrupted, reassign proper sequential numbers
          if (hasCorruptedSequences) {
            logger.info('🔧 LOAD: Fixing corrupted sequences - reassigning sequential numbers');

            // BEST PRACTICE: Notify app of corruption detection
            if (this.onCorruptionDetected) {
              try {
                this.onCorruptionDetected();
              } catch (err) {
                logger.error('Error calling onCorruptionDetected callback:', err);
              }
            }

            // Sort operations by timestamp to maintain chronological order
            const sortedOps = [...this.log.operations].sort((a, b) => {
              const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
              if (timeDiff !== 0) return timeDiff;
              return a.id.localeCompare(b.id);
            });

            // Reassign clean sequential numbers
            for (let i = 0; i < sortedOps.length; i++) {
              sortedOps[i].sequence = i + 1;
            }

            this.log.operations = sortedOps;
            this.log.lastSequence = this.log.operations.length;
            this.log.lastSyncTimestamp = null; // Reset to resync everything
            this.log.checksum = this.computeChecksum();

            // CRITICAL FIX: MUST await persist() to ensure corruption fix is saved to IndexedDB
            // Without await, persist() might not complete before next page load, causing corruption to reappear
            await this.persist();

            logger.info('✅ LOAD: Fixed and persisted corrupted sequences', {
              totalOperations: this.log.operations.length,
              newLastSequence: this.log.lastSequence,
              newLastSyncTimestamp: this.log.lastSyncTimestamp,
            });
          }
        } catch (error) {
          logger.warn('🔧 LOAD: Error during corruption detection/fix (continuing anyway):', {
            error: String(error),
            message: (error as Error).message || 'Unknown error',
            stack: (error as Error).stack?.split('\n').slice(0, 3).join(' ') || 'No stack'
          });
          // Continue loading - corruption fix is not critical to load
          // Even if corruption detection fails, we can continue with the log as-is
        }

        setSequence(this.log.lastSequence);

        // PHASE 1.1.3: Rebuild per-client sequence map
        this.rebuildClientSequences();

        // PHASE 1.2.1: Restore vector clock from persisted state
        if (saved.vectorClock) {
          this.vectorClock = { ...saved.vectorClock };
        }

        // 🔍 DEBUG: Log operation types breakdown
        const byType: Record<string, number> = {};
        for (const op of this.log.operations) {
          byType[op.type] = (byType[op.type] || 0) + 1;
        }

        logger.info('Loaded operation log:', {
          operationCount: this.log.operations.length,
          lastSequence: this.log.lastSequence,
          lastSyncTimestamp: this.log.lastSyncTimestamp,
          uniqueClients: this.clientSequences.size,
          vectorClock: this.vectorClock,
          // 🔍 DEBUG: Show operation type breakdown
          operationsByType: byType,
          // 🔍 CRITICAL: How many SESSION_START operations are loaded?
          sessionStartCount: byType['SESSION_START'] || 0,
          completionCount: byType['COMPLETION_CREATE'] || 0,
          completionUpdateCount: byType['COMPLETION_UPDATE'] || 0,
          corruptedSequencesDetected: hasCorruptedSequences,
        });
      }

      this.isLoaded = true;
    } catch (error) {
      logger.error('Failed to load operation log:', error);
      this.isLoaded = true; // Continue with empty log
    }
  }

  /**
   * 🔧 ATOMIC: Recover from incomplete transaction
   * If app crashed during merge, this restores consistency
   */
  private async recoverFromIncompleteTransaction(): Promise<void> {
    try {
      const savedTransaction = await storageManager.queuedGet(TRANSACTION_LOG_KEY) as TransactionLog | null;

      if (!savedTransaction) {
        return; // No incomplete transaction
      }

      if (!savedTransaction.isInProgress) {
        // Transaction was completed, clear the log
        await storageManager.queuedSet(TRANSACTION_LOG_KEY, null);
        return;
      }

      // Transaction was incomplete - determine what happened
      const currentLog = await storageManager.queuedGet(OPERATION_LOG_KEY) as OperationLog | null;

      if (!currentLog) {
        // Main log was cleared - rollback by restoring from before-state
        logger.warn('🔧 ATOMIC: Recovering from incomplete transaction - rolling back');
        const restoredLog: OperationLog = {
          operations: savedTransaction.operationsBefore,
          lastSequence: savedTransaction.lastSequenceBefore,
          lastSyncTimestamp: savedTransaction.lastSyncTimestampBefore,
          checksum: savedTransaction.checksumBefore,
        };
        await storageManager.queuedSet(OPERATION_LOG_KEY, restoredLog);
        setSequence(restoredLog.lastSequence);
      } else if (currentLog.checksum === savedTransaction.checksumBefore) {
        // Merge was never applied - clear transaction and continue
        logger.warn('🔧 ATOMIC: Incomplete transaction detected, rolling back');
      } else {
        // Merge was partially or fully applied - check if consistent
        const expectedOpsCount = savedTransaction.operationsBefore.length +
          savedTransaction.operationsToMerge.filter(op => op.clientId !== this.deviceId).length;

        if (currentLog.operations.length !== expectedOpsCount) {
          logger.error('🔧 ATOMIC: State mismatch detected, attempting restoration');
          await storageManager.queuedSet(OPERATION_LOG_KEY, {
            operations: savedTransaction.operationsBefore,
            lastSequence: savedTransaction.lastSequenceBefore,
            lastSyncTimestamp: savedTransaction.lastSyncTimestampBefore,
            checksum: savedTransaction.checksumBefore,
          });
        }
      }

      // Clear completed or rolled-back transaction
      await storageManager.queuedSet(TRANSACTION_LOG_KEY, null);
      logger.info('✅ ATOMIC: Transaction recovery completed');
    } catch (error) {
      logger.error('Failed to recover from incomplete transaction:', error);
      // Continue - data may be corrupted but app won't crash
    }
  }

  /**
   * Append a new operation to the log
   */
  async append(operation: Omit<Operation, 'sequence'>): Promise<Operation> {
    if (!this.isLoaded) {
      await this.load();
    }

    // Get sequence number (now async and thread-safe)
    const sequence = await nextSequence();

    // PHASE 1.2.1: Increment our vector clock for new local operation
    this.incrementVectorClockForDevice();

    const fullOperation = {
      ...operation,
      sequence,
      // BEST PRACTICE: Single-user apps don't need vector clocks (timestamp + sequence is sufficient)
      // vectorClock: this.getVectorClock(), // REMOVED - unnecessary overhead for single-user app
    } as any as Operation;

    this.log.operations.push(fullOperation);
    this.log.lastSequence = sequence;
    this.log.checksum = this.computeChecksum();

    // Persist to IndexedDB
    await this.persist();

    logger.debug('Appended operation to log:', {
      type: fullOperation.type,
      sequence: fullOperation.sequence,
      id: fullOperation.id,
    });

    return fullOperation;
  }

  /**
   * Get operations since a specific timestamp
   * Returns all operations with timestamp > sinceTimestamp
   */
  getOperationsSince(sinceTimestamp: string | null): Operation[] {
    if (!sinceTimestamp) {
      return [...this.log.operations]; // Return all if never synced
    }

    const sinceTime = new Date(sinceTimestamp).getTime();
    return this.log.operations.filter(op => {
      const opTime = new Date(op.timestamp).getTime();
      return opTime > sinceTime;
    });
  }

  /**
   * Get all operations
   */
  getAllOperations(): Operation[] {
    return [...this.log.operations];
  }

  /**
   * Mark operations as synced to cloud up to a specific timestamp
   * Only advances the timestamp (never goes backwards)
   */
  async markSyncedUpTo(timestamp: string): Promise<void> {
    const newTime = new Date(timestamp).getTime();
    const currentTime = this.log.lastSyncTimestamp ? new Date(this.log.lastSyncTimestamp).getTime() : 0;

    if (newTime > currentTime) {
      this.log.lastSyncTimestamp = timestamp;
      await this.persist();
    }
  }

  /**
   * Get operations that haven't been synced to cloud yet
   */
  getUnsyncedOperations(): Operation[] {
    if (!this.log.lastSyncTimestamp) {
      return [...this.log.operations]; // All unsynced if never synced
    }

    const lastSyncTime = new Date(this.log.lastSyncTimestamp).getTime();
    return this.log.operations.filter(op => {
      const opTime = new Date(op.timestamp).getTime();
      return opTime > lastSyncTime;
    });
  }

  /**
   * 🔧 CRITICAL FIX: Update an operation's sequence number (for sequence collision repair)
   * Used when an operation fails to upload due to sequence collision with cloud
   */
  async updateOperationSequence(operationId: string, newSequence: number): Promise<void> {
    const opIndex = this.log.operations.findIndex(op => op.id === operationId);
    if (opIndex === -1) {
      logger.error('❌ Cannot update sequence - operation not found:', operationId);
      return;
    }

    const operation = this.log.operations[opIndex];
    const oldSequence = operation.sequence;

    // Update the operation's sequence
    this.log.operations[opIndex] = {
      ...operation,
      sequence: newSequence,
    };

    // Update lastSequence if this is now the highest
    this.log.lastSequence = Math.max(this.log.lastSequence, newSequence);

    // Update checksum
    this.log.checksum = this.computeChecksum();

    // Persist changes
    await this.persist();

    logger.info('✅ Operation sequence updated:', {
      operationId,
      type: operation.type,
      oldSequence,
      newSequence,
    });
  }

  /**
   * 🔧 ATOMIC: Add operations received from cloud sync
   * Handles merging remote operations with local ones - guaranteed all-or-nothing
   *
   * ATOMICITY GUARANTEE:
   * - Uses write-ahead logging (transaction log)
   * - All operations merged together or none at all
   * - If app crashes: recovery on next load restores consistency
   * - Sequence tracking is atomic with operation merge
   *
   * STEPS:
   * 1. Validate all operations before modifying state
   * 2. Write transaction log (intent to merge)
   * 3. Apply all operations to in-memory state
   * 4. Persist merged state
   * 5. Clear transaction log (marks transaction complete)
   */
  async mergeRemoteOperations(remoteOps: Operation[]): Promise<Operation[]> {
    if (!this.isLoaded) {
      await this.load();
    }

    // 🔍 DEBUG: Track deduplication
    const duplicatesByType: Record<string, number> = {};
    const newByType: Record<string, number> = {};
    const ownDeviceCount = { count: 0 };
    const duplicateOperations: Operation[] = [];

    // Filter operations to merge (deduplication)
    const operationsToMerge = remoteOps.filter(remoteOp => {
      // Skip operations from this device (we already have them)
      if (remoteOp.clientId === this.deviceId) {
        ownDeviceCount.count++;
        return false;
      }

      // Check if we already have this operation
      const exists = this.log.operations.some(localOp => localOp.id === remoteOp.id);

      if (exists) {
        // 🔍 DEBUG: Track which operation types are being marked as duplicates
        duplicatesByType[remoteOp.type] = (duplicatesByType[remoteOp.type] || 0) + 1;
        duplicateOperations.push(remoteOp);
        logger.debug('🔍 DEDUP: Skipping duplicate operation', {
          opId: remoteOp.id.substring(0, 8),
          type: remoteOp.type,
          sequence: remoteOp.sequence,
          clientId: remoteOp.clientId.substring(0, 8),
        });
        return false;
      }

      // 🔍 DEBUG: Track which operation types are new
      newByType[remoteOp.type] = (newByType[remoteOp.type] || 0) + 1;
      logger.debug('🔍 DEDUP: NEW operation from cloud', {
        opId: remoteOp.id.substring(0, 8),
        type: remoteOp.type,
        sequence: remoteOp.sequence,
        clientId: remoteOp.clientId.substring(0, 8),
      });
      return true;
    });

    // 🔍 DEBUG: Log summary of deduplication
    const dedupSummary = {
      totalRemoteOps: remoteOps.length,
      ownDeviceOps: ownDeviceCount.count,
      duplicateOps: duplicateOperations.length,
      newOpsToMerge: operationsToMerge.length,
      duplicatesByType: Object.keys(duplicatesByType).length > 0 ? duplicatesByType : 'none',
      newByType: Object.keys(newByType).length > 0 ? newByType : 'none',
      // 🔍 CRITICAL: Show if SESSION_START is missing from local operations
      sessionStartInDuplicates: duplicatesByType['SESSION_START'] || 0,
      sessionStartInNew: newByType['SESSION_START'] || 0,
      localSessionStarts: this.log.operations.filter(op => op.type === 'SESSION_START').length,
      localTotalOps: this.log.operations.length,
    };
    logger.debug('🔍 DEDUP SUMMARY', dedupSummary);

    if (operationsToMerge.length === 0) {
      // No new operations to merge
      logger.warn('🔍 WARNING: All remote operations were duplicates', {
        remoteCount: remoteOps.length,
        localCount: this.log.operations.length,
        duplicatesByType,
        possibleIssue: 'Cloud operations may not match local operation IDs - deduplication may be broken',
      });
      return [];
    }

    // Step 2: Write transaction log BEFORE making any changes
    // This is write-ahead logging - if crash occurs, recovery can restore consistency
    const transactionLog: TransactionLog = {
      isInProgress: true,
      operationsBefore: [...this.log.operations],
      operationsToMerge,
      lastSequenceBefore: this.log.lastSequence,
      lastSyncTimestampBefore: this.log.lastSyncTimestamp,
      checksumBefore: this.log.checksum,
      timestamp: new Date().toISOString(),
    };

    try {
      // Persist transaction log (intent)
      await storageManager.queuedSet(TRANSACTION_LOG_KEY, transactionLog);

      // Step 3: Apply all operations to in-memory state (ATOMIC: all at once)
      const newOperations: Operation[] = [];

      for (const remoteOp of operationsToMerge) {
        // PHASE 1.1.3: Detect out-of-order operations (logs warnings if detected)
        this.detectOutOfOrderOperation(remoteOp);

        this.log.operations.push(remoteOp);
        newOperations.push(remoteOp);

        // PHASE 1.1.3: Update per-client sequence tracking
        this.updateClientSequence(remoteOp);

        // PHASE 1.2.1: Update vector clock from incoming operation
        this.updateVectorClockFromOperation((remoteOp as any).vectorClock);

        // Update sequence tracking - done after all operations added
        this.log.lastSequence = Math.max(this.log.lastSequence, remoteOp.sequence);
      }

      // Sort operations by timestamp to maintain chronological order
      this.log.operations.sort((a, b) => {
        const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });

      // Compute new checksum for validation
      this.log.checksum = this.computeChecksum();

      // Validate sequence continuity (CRITICAL)
      this.validateSequenceContinuity('after merge');

      // Step 4: Persist merged state atomically
      await this.persist();

      // Update sequence generator AFTER successful persist
      setSequence(this.log.lastSequence);

      // Step 5: Clear transaction log (marks transaction as complete)
      await storageManager.queuedSet(TRANSACTION_LOG_KEY, null);

      logger.info('✅ ATOMIC MERGE COMPLETE:', {
        newOperationCount: newOperations.length,
        totalOperationCount: this.log.operations.length,
        lastSequence: this.log.lastSequence,
        checksumAfter: this.log.checksum,
      });

      return newOperations;
    } catch (error) {
      // ATOMIC ROLLBACK: Clear transaction log without updating main log
      logger.error('🔧 ATOMIC: Merge failed, marking transaction incomplete:', error);
      try {
        // Mark transaction as incomplete (recovery on next load will restore)
        const failedTransaction = { ...transactionLog, isInProgress: true };
        await storageManager.queuedSet(TRANSACTION_LOG_KEY, failedTransaction);
      } catch (transactionError) {
        logger.error('Failed to mark transaction as failed:', transactionError);
      }

      throw new Error(`Atomic merge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * PHASE 1.1.4: Validate sequence continuity
   * Detects gaps in operation sequences that indicate data loss
   *
   * Sequence gaps can occur from:
   * 1. Network loss - operations sent but not received
   * 2. Device crash - operations lost before sync
   * 3. Sync bug - operations skipped during merge
   * 4. Clock jump - sequence counter got corrupted
   *
   * This is critical to detect because gaps = silent data loss!
   *
   * @returns Array of detected gaps for potential recovery
   */
  validateSequenceContinuity(context: string): Array<{ from: number; to: number; size: number; lostOps: number }> {
    if (!ENABLE_SEQUENCE_CONTINUITY_VALIDATION) {
      return []; // Validation disabled, skip
    }

    if (this.log.operations.length === 0) {
      return []; // Empty log, nothing to validate
    }

    const sequences = this.log.operations.map(op => op.sequence).sort((a, b) => a - b);
    const gaps: Array<{ from: number; to: number; size: number; lostOps: number }> = [];

    for (let i = 1; i < sequences.length; i++) {
      if (sequences[i] !== sequences[i - 1] + 1) {
        const gap = sequences[i] - sequences[i - 1] - 1;
        gaps.push({
          from: sequences[i - 1],
          to: sequences[i],
          size: gap,
          lostOps: gap, // Each gap position = 1 lost operation
        });
      }
    }

    if (gaps.length > 0) {
      // PHASE 1.1.4: Enhanced diagnostics for sequence gaps
      const totalLost = gaps.reduce((sum, g) => sum + g.lostOps, 0);

      logger.error('🚨 CRITICAL: Sequence gaps detected ' + context, {
        message: 'Data loss detected - operations were lost during sync',
        gapCount: gaps.length,
        totalLostOperations: totalLost,
        gaps: gaps.map(g => ({
          between: `${g.from}...${g.to}`,
          missedCount: g.size,
        })),
        totalOperations: this.log.operations.length,
        sequenceRange: { min: sequences[0], max: sequences[sequences.length - 1] },
        percentage: ((totalLost / sequences[sequences.length - 1]) * 100).toFixed(2) + '%',
        recommendation: 'Check network stability and device clock settings',
      });

      // Additional logging per gap for debugging
      gaps.forEach((gap, index) => {
        logger.warn(`Gap #${index + 1}: Operations ${gap.from}..${gap.to} (${gap.size} missing)`, {
          clientsAffected: this.getClientsInSequenceRange(gap.from + 1, gap.to),
        });
      });
    } else {
      // All sequences continuous - good!
      logger.debug('✅ Sequence validation: No gaps detected', {
        context,
        totalOperations: this.log.operations.length,
        sequenceRange: { min: sequences[0], max: sequences[sequences.length - 1] },
      });
    }

    return gaps;
  }

  /**
   * PHASE 1.1.4: Find which clients had operations in a sequence range
   * Helps diagnose which device's operations were lost
   */
  private getClientsInSequenceRange(fromSeq: number, toSeq: number): string[] {
    const clients = new Set<string>();

    for (const op of this.log.operations) {
      if (op.sequence >= fromSeq && op.sequence <= toSeq) {
        clients.add(op.clientId);
      }
    }

    return Array.from(clients);
  }

  /**
   * PHASE 1.1.3: Rebuild per-client sequence tracking
   * Called after loading log to reconstruct client sequence map
   */
  private rebuildClientSequences(): void {
    this.clientSequences.clear();

    for (const op of this.log.operations) {
      const currentMax = this.clientSequences.get(op.clientId) || 0;
      this.clientSequences.set(op.clientId, Math.max(currentMax, op.sequence));
    }

    logger.debug('🔧 Rebuilt per-client sequence map:', {
      uniqueClients: this.clientSequences.size,
      clients: Array.from(this.clientSequences.entries()).map(([clientId, seq]) => ({
        clientId: clientId.substring(0, 8), // Truncate for logging
        maxSequence: seq,
      })),
    });
  }

  /**
   * PHASE 1.1.3: Detect out-of-order operations from a client
   * Returns warning info if operation arrived out-of-order
   */
  private detectOutOfOrderOperation(operation: Operation): { isOutOfOrder: boolean; previousMax?: number } {
    const currentMax = this.clientSequences.get(operation.clientId) || 0;
    const isOutOfOrder = operation.sequence <= currentMax;

    if (isOutOfOrder) {
      logger.warn('🔧 OUT-OF-ORDER OPERATION detected:', {
        clientId: operation.clientId.substring(0, 8),
        operationSequence: operation.sequence,
        previousMax: currentMax,
        gap: currentMax - operation.sequence,
      });
    }

    return { isOutOfOrder, previousMax: currentMax };
  }

  /**
   * PHASE 1.1.3: Update per-client sequence tracking
   * Called for each operation processed
   */
  private updateClientSequence(operation: Operation): void {
    const currentMax = this.clientSequences.get(operation.clientId) || 0;
    if (operation.sequence > currentMax) {
      this.clientSequences.set(operation.clientId, operation.sequence);
    }
  }

  /**
   * PHASE 1.2.1: Update our vector clock when processing an operation
   * Merges incoming vector clock with ours to track logical time
   *
   * Example:
   * - Our clock: { device-1: 5, device-2: 3 }
   * - Incoming op clock: { device-1: 4, device-2: 5, device-3: 2 }
   * - Result: { device-1: 5, device-2: 5, device-3: 2 }
   * (We take max of each device's clock)
   */
  private updateVectorClockFromOperation(operationVectorClock?: VectorClock): void {
    if (!operationVectorClock) return; // Skip if operation has no vector clock

    for (const [deviceId, timestamp] of Object.entries(operationVectorClock)) {
      const currentTimestamp = this.vectorClock[deviceId] || 0;
      this.vectorClock[deviceId] = Math.max(currentTimestamp, timestamp);
    }
  }

  /**
   * PHASE 1.2.1: Increment our own device's vector clock
   * Called when we create a local operation
   *
   * This marks that we've created a new operation and increments our logical time
   */
  private incrementVectorClockForDevice(): void {
    const currentTimestamp = this.vectorClock[this.deviceId] || 0;
    this.vectorClock[this.deviceId] = currentTimestamp + 1;
  }

  /**
   * PHASE 1.2.1: Compare two vector clocks to detect causality
   *
   * Returns:
   * - 'before': vc1 happened before vc2 (vc1 is ancestor of vc2)
   * - 'after': vc1 happened after vc2 (vc2 is ancestor of vc1)
   * - 'concurrent': neither is ancestor of other (operations are concurrent)
   * - 'equal': both clocks are identical
   */
  compareVectorClocks(vc1: VectorClock, vc2: VectorClock): 'before' | 'after' | 'concurrent' | 'equal' {
    let hasGreater = false;
    let hasLess = false;

    // Get all unique devices
    const allDevices = new Set([...Object.keys(vc1), ...Object.keys(vc2)]);

    for (const device of allDevices) {
      const ts1 = vc1[device] || 0;
      const ts2 = vc2[device] || 0;

      if (ts1 > ts2) hasGreater = true;
      if (ts1 < ts2) hasLess = true;
    }

    // Determine relationship
    if (!hasGreater && !hasLess) return 'equal';
    if (!hasLess) return 'after'; // vc1 is strictly >= vc2
    if (!hasGreater) return 'before'; // vc1 is strictly <= vc2
    return 'concurrent'; // Neither is ancestor of other
  }

  /**
   * PHASE 1.2.1: Get current vector clock state
   * Used when serializing operations to include causality info
   */
  getVectorClock(): VectorClock {
    return { ...this.vectorClock };
  }

  /**
   * BEST PRACTICE: Clean up old operations to prevent unbounded growth
   * Removes operations older than the retention period
   * @param retentionDays Number of days to retain operations (default: 90)
   * @returns Number of operations removed
   */
  async cleanupOldOperations(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    const initialCount = this.log.operations.length;

    // Keep operations from last N days
    this.log.operations = this.log.operations.filter(op => op.timestamp >= cutoffISO);

    // Update checksums and persist
    this.log.checksum = this.computeChecksum();
    await this.persist();

    const removed = initialCount - this.log.operations.length;

    if (removed > 0) {
      logger.info(`🧹 CLEANUP: Removed ${removed} operations older than ${retentionDays} days`, {
        initialCount,
        remainingCount: this.log.operations.length,
        cutoffDate: cutoffISO,
      });
    } else {
      logger.debug(`🧹 CLEANUP: No operations older than ${retentionDays} days found`);
    }

    return removed;
  }

  /**
   * Get current log state
   */
  getLogState(): OperationLog {
    return {
      ...this.log,
      // BEST PRACTICE: Single-user apps don't need vector clocks
      // vectorClock: this.getVectorClock(), // REMOVED - unnecessary overhead
    };
  }

  /**
   * PHASE 1.1.3: Get per-client sequence statistics
   * Used for diagnostics and identifying problematic devices
   */
  getClientSequenceStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const [clientId, maxSeq] of this.clientSequences.entries()) {
      stats[clientId] = maxSeq;
    }

    return stats;
  }

  /**
   * Compact the operation log by removing old operations
   * Keep only operations from the last N days to prevent unbounded growth
   */
  async compact(daysToKeep: number = 30): Promise<void> {
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - daysToKeep);
    const cutoffTimestamp = cutoffTime.toISOString();

    const sizeBefore = this.log.operations.length;

    this.log.operations = this.log.operations.filter(op =>
      op.timestamp >= cutoffTimestamp
    );

    const sizeAfter = this.log.operations.length;

    if (sizeBefore !== sizeAfter) {
      this.log.checksum = this.computeChecksum();
      await this.persist();

      logger.info('Compacted operation log:', {
        removed: sizeBefore - sizeAfter,
        remaining: sizeAfter,
        cutoffDate: cutoffTimestamp,
      });
    }
  }

  /**
   * Clear the entire operation log (used for testing or reset)
   */
  async clear(): Promise<void> {
    this.log = {
      operations: [],
      lastSequence: 0,
      lastSyncTimestamp: null,
      checksum: '',
    };
    setSequence(0);
    await this.persist();
    logger.info('Cleared operation log');
  }

  /**
   * 🔧 CRITICAL FIX: Clear operations but preserve sync timestamp for restore
   * This prevents missing operations during backup restore by:
   * 1. Preserving the last sync timestamp (if valid)
   * 2. New operations will be created after this timestamp
   * 3. On next sync, we'll fetch operations since this timestamp
   * This ensures we don't re-download everything we already had
   */
  async clearForRestore(): Promise<void> {
    const previousLastSyncTimestamp = this.log.lastSyncTimestamp;
    const maxLocalSeq = this.log.operations.length > 0
      ? Math.max(...this.log.operations.map(op => op.sequence))
      : 0;

    logger.info('🔧 RESTORE: Clearing operation log with timestamp preservation:', {
      previousLastSyncTimestamp,
      maxLocalSeq,
      operationsCleared: this.log.operations.length,
    });

    // Clear operations but preserve sync timestamp
    this.log = {
      operations: [],
      lastSequence: 0,
      lastSyncTimestamp: previousLastSyncTimestamp, // Preserve timestamp
      checksum: '',
    };

    // Reset sequence counter to 0 (will start fresh)
    setSequence(0);

    await this.persist();

    logger.info('✅ RESTORE: Operation log cleared, timestamp preserved:', {
      preservedTimestamp: previousLastSyncTimestamp,
      newStartSequence: 1,
    });
  }

  private async persist(): Promise<void> {
    try {
      await storageManager.queuedSet(OPERATION_LOG_KEY, this.log);
    } catch (error) {
      logger.error('Failed to persist operation log:', error);
    }
  }

  private computeChecksum(): string {
    // Compute proper hash of operation log for data integrity
    // Uses a simple but effective hash of operation IDs and sequences
    if (this.log.operations.length === 0) {
      return '0';
    }

    // Create deterministic string from operations
    const operationsStr = this.log.operations
      .sort((a, b) => {
        const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }) // Ensure consistent ordering
      .map(op => `${op.id}:${op.sequence}:${op.type}`)
      .join('|');

    // Simple but effective hash function (FNV-1a)
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < operationsStr.length; i++) {
      hash ^= operationsStr.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }

    // Convert to unsigned 32-bit hex
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

// User-isolated operation log instances to prevent data leakage between accounts
const operationLogManagers = new Map<string, OperationLogManager>();

/**
 * Get operation log for a specific user+device combination
 * @param deviceId - Device identifier
 * @param userId - User identifier (optional, defaults to 'local')
 */
export function getOperationLog(deviceId: string, userId: string = 'local'): OperationLogManager {
  const key = `${userId}_${deviceId}`;

  if (!operationLogManagers.has(key)) {
    operationLogManagers.set(key, new OperationLogManager(deviceId));
  }

  return operationLogManagers.get(key)!;
}

/**
 * Clear operation logs for a specific user (call on sign out)
 * This prevents data leakage when a different user signs in
 */
export function clearOperationLogsForUser(userId: string): void {
  const keysToDelete: string[] = [];

  for (const [key, manager] of operationLogManagers.entries()) {
    if (key.startsWith(`${userId}_`)) {
      manager.clear().catch(err =>
        logger.error('Failed to clear operation log:', err)
      );
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => operationLogManagers.delete(key));

  if (keysToDelete.length > 0) {
    logger.info('Cleared operation logs for user:', {
      userId,
      clearedCount: keysToDelete.length,
    });
  }
}

/**
 * DEBUG: Get statistics about the operation log
 */
export function getOperationLogStats(manager: OperationLogManager): {
  totalOperations: number;
  byType: Record<string, number>;
  duplicateCompletions: number;
  sequenceRange: { min: number; max: number };
  lastSyncTimestamp: string | null;
} {
  const ops = manager.getAllOperations();
  const byType: Record<string, number> = {};
  const completionKeys = new Set<string>();
  let duplicateCompletions = 0;

  for (const op of ops) {
    // Count by type
    byType[op.type] = (byType[op.type] || 0) + 1;

    // Check for duplicate completions
    if (op.type === 'COMPLETION_CREATE') {
      const key = `${op.payload.completion.timestamp}_${op.payload.completion.index}_${op.payload.completion.outcome}`;
      if (completionKeys.has(key)) {
        duplicateCompletions++;
      } else {
        completionKeys.add(key);
      }
    }
  }

  const sequences = ops.map(o => o.sequence);
  const min = sequences.length > 0 ? Math.min(...sequences) : 0;
  const max = sequences.length > 0 ? Math.max(...sequences) : 0;
  const lastSyncTimestamp = manager.getLogState().lastSyncTimestamp;

  return {
    totalOperations: ops.length,
    byType,
    duplicateCompletions,
    sequenceRange: { min, max },
    lastSyncTimestamp,
  };
}

/**
 * DEPRECATED: This function is no longer needed with timestamp-based sync
 * Sequence corruption is no longer possible since we use timestamps for sync tracking
 *
 * @deprecated Use timestamp-based sync instead
 */
export async function repairCorruptedSequences(
  _manager: OperationLogManager,
  _actualCloudMaxSequence: number
): Promise<number> {
  logger.warn('⚠️ repairCorruptedSequences() is deprecated - timestamp-based sync does not have sequence corruption');
  return 0;
}