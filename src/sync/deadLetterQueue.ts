// src/sync/deadLetterQueue.ts
// Dead Letter Queue for permanently failed operations
// Clean Architecture - Infrastructure Layer

import { openDB, type IDBPDatabase } from 'idb-keyval';
import { logger } from '../utils/logger';
import type { Operation } from './operations';

/**
 * Dead letter queue item
 */
export interface DeadLetterItem {
  id: string;
  operation: Operation;
  error: string;
  failureCount: number;
  firstFailure: string; // ISO timestamp
  lastFailure: string; // ISO timestamp
  addedToDLQ: string; // ISO timestamp
}

const DB_NAME = 'navigator-dead-letter-queue';
const DB_VERSION = 1;
const STORE_NAME = 'deadLetters';

/**
 * DeadLetterQueue - Stores permanently failed operations
 *
 * Clean Architecture:
 * - Infrastructure Layer (database access)
 * - Persistent storage for failed operations
 * - Allows manual recovery or inspection
 *
 * Business Rules:
 * - Operations go to DLQ after max retries exhausted
 * - DLQ items can be inspected by user/admin
 * - DLQ items can be manually retried
 * - DLQ items can be permanently discarded
 * - Old DLQ items auto-expire after 30 days
 */
export class DeadLetterQueue {
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
        logger.error('Failed to open DLQ database:', request.error);
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
          store.createIndex('addedToDLQ', 'addedToDLQ');
          store.createIndex('operationType', 'operation.type');

          logger.debug('Created dead letter queue object store');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Add operation to dead letter queue
   *
   * @param operation - Operation that failed permanently
   * @param error - Error message
   * @param failureCount - Number of times operation failed
   * @param firstFailure - When operation first failed
   */
  async add(
    operation: Operation,
    error: string,
    failureCount: number,
    firstFailure: string
  ): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const item: DeadLetterItem = {
        id: operation.id,
        operation,
        error,
        failureCount,
        firstFailure,
        lastFailure: new Date().toISOString(),
        addedToDLQ: new Date().toISOString(),
      };

      await store.put(item);
      await tx.done;

      logger.error('💀 DLQ: Added operation to dead letter queue', {
        operationId: operation.id,
        operationType: operation.type,
        failureCount,
        error,
      });
    } catch (err) {
      logger.error('Failed to add operation to DLQ:', err);
      throw err;
    }
  }

  /**
   * Get all items in dead letter queue
   */
  async getAll(): Promise<DeadLetterItem[]> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const items = await store.getAll();
      await tx.done;

      return items;
    } catch (err) {
      logger.error('Failed to get DLQ items:', err);
      return [];
    }
  }

  /**
   * Get item by operation ID
   */
  async get(operationId: string): Promise<DeadLetterItem | null> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const item = await store.get(operationId);
      await tx.done;

      return item || null;
    } catch (err) {
      logger.error('Failed to get DLQ item:', err);
      return null;
    }
  }

  /**
   * Remove item from dead letter queue
   *
   * @param operationId - ID of operation to remove
   */
  async remove(operationId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await store.delete(operationId);
      await tx.done;

      logger.info('💀 DLQ: Removed operation from dead letter queue', {
        operationId,
      });
    } catch (err) {
      logger.error('Failed to remove DLQ item:', err);
      throw err;
    }
  }

  /**
   * Clear all items from dead letter queue
   */
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await store.clear();
      await tx.done;

      logger.info('💀 DLQ: Cleared all items from dead letter queue');
    } catch (err) {
      logger.error('Failed to clear DLQ:', err);
      throw err;
    }
  }

  /**
   * Clean up old items (> 30 days)
   *
   * Business Rule: DLQ items expire after 30 days
   */
  async cleanupOld(): Promise<number> {
    try {
      const items = await this.getAll();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      let removed = 0;
      for (const item of items) {
        const addedTime = new Date(item.addedToDLQ).getTime();
        if (addedTime < thirtyDaysAgo) {
          await this.remove(item.id);
          removed++;
        }
      }

      if (removed > 0) {
        logger.info(`💀 DLQ: Cleaned up ${removed} old items (>30 days)`);
      }

      return removed;
    } catch (err) {
      logger.error('Failed to cleanup old DLQ items:', err);
      return 0;
    }
  }

  /**
   * Get statistics about dead letter queue
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    oldestItem: string | null;
  }> {
    try {
      const items = await this.getAll();

      const byType: Record<string, number> = {};
      let oldest: string | null = null;

      for (const item of items) {
        // Count by type
        const type = item.operation.type;
        byType[type] = (byType[type] || 0) + 1;

        // Track oldest
        if (!oldest || item.addedToDLQ < oldest) {
          oldest = item.addedToDLQ;
        }
      }

      return {
        total: items.length,
        byType,
        oldestItem: oldest,
      };
    } catch (err) {
      logger.error('Failed to get DLQ stats:', err);
      return { total: 0, byType: {}, oldestItem: null };
    }
  }
}

// Singleton instance
let deadLetterQueueInstance: DeadLetterQueue | null = null;

/**
 * Get dead letter queue singleton
 */
export function getDeadLetterQueue(): DeadLetterQueue {
  if (!deadLetterQueueInstance) {
    deadLetterQueueInstance = new DeadLetterQueue();
  }
  return deadLetterQueueInstance;
}
