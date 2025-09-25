// src/sync/operationLog.ts - Operation log management
import type { Operation } from './operations';
import { nextSequence, setSequence } from './operations';
import { storageManager } from '../utils/storageManager';
import { logger } from '../utils/logger';

const OPERATION_LOG_KEY = 'navigator_operation_log_v1';

export type OperationLog = {
  operations: Operation[];
  lastSequence: number;
  lastSyncSequence: number; // Last sequence we synced to cloud
  checksum: string;
};

/**
 * Manages the local operation log
 * This is the source of truth for what operations have been applied locally
 */
export class OperationLogManager {
  private log: OperationLog = {
    operations: [],
    lastSequence: 0,
    lastSyncSequence: 0,
    checksum: '',
  };

  private deviceId: string;
  private isLoaded = false;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  /**
   * Load operation log from IndexedDB
   */
  async load(): Promise<void> {
    try {
      const saved = await storageManager.queuedGet(OPERATION_LOG_KEY) as OperationLog | null;

      if (saved) {
        this.log = saved;
        setSequence(this.log.lastSequence);
        logger.info('Loaded operation log:', {
          operationCount: this.log.operations.length,
          lastSequence: this.log.lastSequence,
          lastSyncSequence: this.log.lastSyncSequence,
        });
      }

      this.isLoaded = true;
    } catch (error) {
      logger.error('Failed to load operation log:', error);
      this.isLoaded = true; // Continue with empty log
    }
  }

  /**
   * Append a new operation to the log
   */
  async append(operation: Omit<Operation, 'sequence'>): Promise<Operation> {
    if (!this.isLoaded) {
      await this.load();
    }

    const sequence = nextSequence();
    const fullOperation = {
      ...operation,
      sequence,
    } as Operation;

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
   * Add operations received from cloud sync
   * This handles merging remote operations with local ones
   */
  async mergeRemoteOperations(remoteOps: Operation[]): Promise<Operation[]> {
    if (!this.isLoaded) {
      await this.load();
    }

    const newOperations: Operation[] = [];

    for (const remoteOp of remoteOps) {
      // Skip operations from this device (we already have them)
      if (remoteOp.clientId === this.deviceId) {
        continue;
      }

      // Check if we already have this operation
      const exists = this.log.operations.some(localOp =>
        localOp.id === remoteOp.id
      );

      if (!exists) {
        this.log.operations.push(remoteOp);
        newOperations.push(remoteOp);

        // Update sequence tracking
        this.log.lastSequence = Math.max(this.log.lastSequence, remoteOp.sequence);
        setSequence(this.log.lastSequence);
      }
    }

    if (newOperations.length > 0) {
      // Sort operations by sequence to maintain order
      this.log.operations.sort((a, b) => a.sequence - b.sequence);
      this.log.checksum = this.computeChecksum();

      await this.persist();

      logger.info('Merged remote operations:', {
        newOperationCount: newOperations.length,
        totalOperationCount: this.log.operations.length,
      });
    }

    return newOperations;
  }

  /**
   * Get current log state
   */
  getLogState(): OperationLog {
    return { ...this.log };
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

  private async persist(): Promise<void> {
    try {
      await storageManager.queuedSet(OPERATION_LOG_KEY, this.log);
    } catch (error) {
      logger.error('Failed to persist operation log:', error);
    }
  }

  private computeChecksum(): string {
    // Simple checksum based on operation count and last sequence
    // In production, you'd want a proper hash of the operations
    return `${this.log.operations.length}-${this.log.lastSequence}`;
  }
}

// Global operation log instance
let operationLogManager: OperationLogManager | null = null;

export function getOperationLog(deviceId: string): OperationLogManager {
  if (!operationLogManager) {
    operationLogManager = new OperationLogManager(deviceId);
  }
  return operationLogManager;
}