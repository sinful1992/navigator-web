// src/sync/operationLog.ts - Operation log management with atomic transactions
import type { Operation } from './operations';
import { nextSequence, setSequence } from './operations';
import { storageManager } from '../utils/storageManager';
import { logger } from '../utils/logger';
import { ENABLE_SEQUENCE_CONTINUITY_VALIDATION } from './syncConfig';

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
  lastSyncSequence: number; // Last sequence we synced to cloud
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
  lastSyncSequenceBefore: number;
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
    lastSyncSequence: 0,
    checksum: '',
  };

  // PHASE 1.1.3: Track per-client sequence for out-of-order detection
  private clientSequences: Map<string, number> = new Map();

  // PHASE 1.2.1: Vector clock for multi-device conflict detection
  private vectorClock: VectorClock = {};

  private deviceId: string;
  private isLoaded = false;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
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
        this.log = saved;
        setSequence(this.log.lastSequence);

        // PHASE 1.1.3: Rebuild per-client sequence map
        this.rebuildClientSequences();

        // PHASE 1.2.1: Restore vector clock from persisted state
        if (saved.vectorClock) {
          this.vectorClock = { ...saved.vectorClock };
        }

        logger.info('Loaded operation log:', {
          operationCount: this.log.operations.length,
          lastSequence: this.log.lastSequence,
          lastSyncSequence: this.log.lastSyncSequence,
          uniqueClients: this.clientSequences.size,
          vectorClock: this.vectorClock,
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
          lastSyncSequence: savedTransaction.lastSyncSequenceBefore,
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
            lastSyncSequence: savedTransaction.lastSyncSequenceBefore,
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
      // PHASE 1.2.1: Attach current vector clock to operation for causality tracking
      vectorClock: this.getVectorClock(),
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
   * Get operations since a specific sequence number
   */
  getOperationsSince(sequence: number): Operation[] {
    return this.log.operations.filter(op => op.sequence > sequence);
  }

  /**
   * Get all operations
   */
  getAllOperations(): Operation[] {
    return [...this.log.operations];
  }

  /**
   * Mark operations as synced to cloud up to a specific sequence
   */
  async markSyncedUpTo(sequence: number): Promise<void> {
    const nextValue = Math.max(this.log.lastSyncSequence, sequence);

    if (nextValue !== this.log.lastSyncSequence) {
      this.log.lastSyncSequence = nextValue;
      await this.persist();
    }
  }

  /**
   * Get operations that haven't been synced to cloud yet
   */
  getUnsyncedOperations(): Operation[] {
    return this.log.operations.filter(op => op.sequence > this.log.lastSyncSequence);
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

    // Step 1: Validate all operations BEFORE any state changes
    const operationsToMerge = remoteOps.filter(remoteOp => {
      // Skip operations from this device (we already have them)
      if (remoteOp.clientId === this.deviceId) {
        return false;
      }

      // Check if we already have this operation
      const exists = this.log.operations.some(localOp => localOp.id === remoteOp.id);
      return !exists;
    });

    if (operationsToMerge.length === 0) {
      // No new operations to merge
      return [];
    }

    // Step 2: Write transaction log BEFORE making any changes
    // This is write-ahead logging - if crash occurs, recovery can restore consistency
    const transactionLog: TransactionLog = {
      isInProgress: true,
      operationsBefore: [...this.log.operations],
      operationsToMerge,
      lastSequenceBefore: this.log.lastSequence,
      lastSyncSequenceBefore: this.log.lastSyncSequence,
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

      // Sort operations by sequence to maintain order
      this.log.operations.sort((a, b) => a.sequence - b.sequence);

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
   */
  private validateSequenceContinuity(context: string): void {
    if (!ENABLE_SEQUENCE_CONTINUITY_VALIDATION) {
      return; // Validation disabled, skip
    }

    if (this.log.operations.length === 0) {
      return; // Empty log, nothing to validate
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
   * Get current log state
   */
  getLogState(): OperationLog {
    return {
      ...this.log,
      vectorClock: this.getVectorClock(), // PHASE 1.2.1: Include vector clock in state
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
      lastSyncSequence: 0,
      checksum: '',
    };
    setSequence(0);
    await this.persist();
    logger.info('Cleared operation log');
  }

  /**
   * 🔧 CRITICAL FIX: Clear operations but preserve sequence continuity for restore
   * This prevents sequence gaps during backup restore by:
   * 1. Detecting if lastSyncSequence is corrupted (unreasonably high)
   * 2. If corrupted, reset to 0 to start fresh
   * 3. If valid, preserve it to continue sequence from cloud
   * 4. Setting sequence counter appropriately
   * This ensures new operations don't conflict with old ones, and doesn't perpetuate corruption
   */
  async clearForRestore(): Promise<void> {
    const previousLastSynced = this.log.lastSyncSequence;
    const maxLocalSeq = this.log.operations.length > 0
      ? Math.max(...this.log.operations.map(op => op.sequence))
      : 0;

    // 🔧 CRITICAL: Detect corrupted lastSyncSequence
    // If lastSyncSequence > maxLocalSeq, it's corrupted (came from cloud operations with huge sequence numbers)
    const isCorrupted = previousLastSynced > maxLocalSeq;

    const nextLastSynced = isCorrupted ? 0 : previousLastSynced;

    logger.info('🔧 RESTORE: Clearing operation log with sequence preservation:', {
      previousLastSynced,
      maxLocalSeq,
      isCorrupted,
      nextLastSynced,
      operationsCleared: this.log.operations.length,
    });

    // Clear operations and reset sequence if corrupted
    this.log = {
      operations: [],
      lastSequence: nextLastSynced,
      lastSyncSequence: nextLastSynced,
      checksum: '',
    };

    // Set sequence counter - if it was corrupted, reset to 0 so we start fresh
    // This prevents perpetuating huge sequence numbers from cloud
    setSequence(nextLastSynced);

    await this.persist();

    logger.info('✅ RESTORE: Operation log cleared, sequence state reset:', {
      newLastSynced: nextLastSynced,
      newStartSequence: nextLastSynced + 1,
      corruptionDetected: isCorrupted,
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
      .sort((a, b) => a.sequence - b.sequence) // Ensure consistent ordering
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
  lastSyncSequence: number;
  isCorrupted: boolean;
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
  const lastSyncSequence = manager.getLogState().lastSyncSequence;

  // Detect corruption: lastSyncSequence should never be greater than max sequence
  const isCorrupted = lastSyncSequence > max;

  return {
    totalOperations: ops.length,
    byType,
    duplicateCompletions,
    sequenceRange: { min, max },
    lastSyncSequence,
    isCorrupted,
  };
}

/**
 * REPAIR: Fix corrupted sequence numbers
 * This fixes the bug where lastSyncSequence becomes corrupted (too high)
 * Returns the number of operations that need to be synced
 */
export async function repairCorruptedSequences(
  manager: OperationLogManager,
  actualCloudMaxSequence: number
): Promise<number> {
  const state = manager.getLogState();
  const ops = manager.getAllOperations();

  if (ops.length === 0) {
    logger.warn('No operations to repair');
    return 0;
  }

  const maxLocalSequence = Math.max(...ops.map(o => o.sequence));

  // Detect corruption
  if (state.lastSyncSequence <= maxLocalSequence) {
    logger.info('No corruption detected - lastSyncSequence is valid');
    return 0;
  }

  logger.warn('🔧 CORRUPTION DETECTED:', {
    lastSyncSequence: state.lastSyncSequence,
    maxLocalSequence,
    difference: state.lastSyncSequence - maxLocalSequence,
  });

  // Reset lastSyncSequence to the actual cloud max
  // This will make getUnsyncedOperations() work correctly
  await manager.markSyncedUpTo(actualCloudMaxSequence);

  const unsyncedCount = ops.filter(op => op.sequence > actualCloudMaxSequence).length;

  logger.info('✅ REPAIRED:', {
    newLastSyncSequence: actualCloudMaxSequence,
    unsyncedOperations: unsyncedCount,
  });

  return unsyncedCount;
}