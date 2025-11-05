// src/sync/commandQueue.ts
// Command Queue for buffering operations before submission
// Clean Architecture - Infrastructure Layer

import { openDB, type IDBPDatabase } from 'idb-keyval';
import { logger } from '../utils/logger';
import type { Operation } from './operations';

/**
 * Command queue item
 */
export interface CommandQueueItem {
  id: string;
  operation: Omit<Operation, 'id' | 'timestamp' | 'clientId' | 'sequence'>;
  addedAt: string; // ISO timestamp
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttempt: string | null;
  error: string | null;
}

const DB_NAME = 'navigator-command-queue';
const DB_VERSION = 1;
const STORE_NAME = 'commands';

/**
 * CommandQueue - Buffers operations before submission
 *
 * Clean Architecture:
 * - Infrastructure Layer (database access)
 * - Persistent buffer for commands
 * - Enables batching and atomic operations
 *
 * Business Rules:
 * - Commands buffered before submission to operation log
 * - Enables batch submission (multiple commands at once)
 * - Failed commands can be retried
 * - Commands processed in FIFO order
 * - Commands expire after 24 hours if not processed
 */
export class CommandQueue {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  /**
   * Initialize database connection
   */
  private async initDB(): Promise<IDBPDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        logger.error('Failed to open command queue database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result as IDBPDatabase);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

          // Indexes for querying
          store.createIndex('status', 'status');
          store.createIndex('addedAt', 'addedAt');
          store.createIndex('operationType', 'operation.type');

          logger.debug('Created command queue object store');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Add command to queue
   *
   * @param operation - Operation data (without id/timestamp/clientId/sequence)
   * @returns Command ID
   */
  async add(
    operation: Omit<Operation, 'id' | 'timestamp' | 'clientId' | 'sequence'>
  ): Promise<string> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const item: CommandQueueItem = {
        id: commandId,
        operation,
        addedAt: new Date().toISOString(),
        status: 'pending',
        attempts: 0,
        lastAttempt: null,
        error: null,
      };

      await store.put(item);
      await tx.done;

      logger.debug('📨 COMMAND QUEUE: Added command', {
        commandId,
        operationType: operation.type,
      });

      return commandId;
    } catch (err) {
      logger.error('Failed to add command to queue:', err);
      throw err;
    }
  }

  /**
   * Get next pending commands (FIFO order)
   *
   * @param limit - Maximum number of commands to get
   * @returns Pending commands
   */
  async getNextPending(limit: number = 10): Promise<CommandQueueItem[]> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');

      const items = await index.getAll('pending', limit);
      await tx.done;

      // Sort by addedAt (FIFO)
      items.sort((a, b) => a.addedAt.localeCompare(b.addedAt));

      return items;
    } catch (err) {
      logger.error('Failed to get pending commands:', err);
      return [];
    }
  }

  /**
   * Mark command as processing
   *
   * @param commandId - ID of command to mark
   */
  async markProcessing(commandId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const item = await store.get(commandId);
      if (item) {
        item.status = 'processing';
        item.attempts += 1;
        item.lastAttempt = new Date().toISOString();
        await store.put(item);
      }

      await tx.done;

      logger.debug('📨 COMMAND QUEUE: Marked as processing', { commandId });
    } catch (err) {
      logger.error('Failed to mark command as processing:', err);
      throw err;
    }
  }

  /**
   * Mark command as completed
   *
   * @param commandId - ID of command to mark
   */
  async markCompleted(commandId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Remove from queue (completed commands don't need to be kept)
      await store.delete(commandId);

      await tx.done;

      logger.debug('📨 COMMAND QUEUE: Marked as completed and removed', {
        commandId,
      });
    } catch (err) {
      logger.error('Failed to mark command as completed:', err);
      throw err;
    }
  }

  /**
   * Mark command as failed
   *
   * @param commandId - ID of command to mark
   * @param error - Error message
   */
  async markFailed(commandId: string, error: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const item = await store.get(commandId);
      if (item) {
        item.status = 'failed';
        item.error = error;
        await store.put(item);
      }

      await tx.done;

      logger.warn('📨 COMMAND QUEUE: Marked as failed', { commandId, error });
    } catch (err) {
      logger.error('Failed to mark command as failed:', err);
      throw err;
    }
  }

  /**
   * Reset command to pending (for retry)
   *
   * @param commandId - ID of command to reset
   */
  async resetToPending(commandId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const item = await store.get(commandId);
      if (item) {
        item.status = 'pending';
        item.error = null;
        await store.put(item);
      }

      await tx.done;

      logger.debug('📨 COMMAND QUEUE: Reset to pending', { commandId });
    } catch (err) {
      logger.error('Failed to reset command to pending:', err);
      throw err;
    }
  }

  /**
   * Get statistics about command queue
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    failed: number;
    byType: Record<string, number>;
  }> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const items = await store.getAll();
      await tx.done;

      const stats = {
        total: items.length,
        pending: 0,
        processing: 0,
        failed: 0,
        byType: {} as Record<string, number>,
      };

      for (const item of items) {
        // Count by status
        if (item.status === 'pending') stats.pending++;
        else if (item.status === 'processing') stats.processing++;
        else if (item.status === 'failed') stats.failed++;

        // Count by type
        const type = item.operation.type;
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }

      return stats;
    } catch (err) {
      logger.error('Failed to get command queue stats:', err);
      return { total: 0, pending: 0, processing: 0, failed: 0, byType: {} };
    }
  }

  /**
   * Clean up old commands (> 24 hours)
   *
   * Business Rule: Commands expire after 24 hours
   */
  async cleanupOld(): Promise<number> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const items = await store.getAll();
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      let removed = 0;
      for (const item of items) {
        const addedTime = new Date(item.addedAt).getTime();
        if (addedTime < oneDayAgo) {
          await store.delete(item.id);
          removed++;
        }
      }

      await tx.done;

      if (removed > 0) {
        logger.info(`📨 COMMAND QUEUE: Cleaned up ${removed} old commands (>24h)`);
      }

      return removed;
    } catch (err) {
      logger.error('Failed to cleanup old commands:', err);
      return 0;
    }
  }

  /**
   * Clear all commands from queue
   */
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await store.clear();
      await tx.done;

      logger.info('📨 COMMAND QUEUE: Cleared all commands');
    } catch (err) {
      logger.error('Failed to clear command queue:', err);
      throw err;
    }
  }
}

// Singleton instance
let commandQueueInstance: CommandQueue | null = null;

/**
 * Get command queue singleton
 */
export function getCommandQueue(): CommandQueue {
  if (!commandQueueInstance) {
    commandQueueInstance = new CommandQueue();
  }
  return commandQueueInstance;
}
