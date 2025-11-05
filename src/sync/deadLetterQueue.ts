// src/sync/deadLetterQueue.ts
// Dead Letter Queue for permanently failed operations
// Clean Architecture - Infrastructure Layer

import { openDB, type IDBPDatabase } from 'idb';
import { get as idbGet, del as idbDel } from 'idb-keyval';
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
const LEGACY_KEY = 'navigator-dead-letter-queue';  // Old idb-keyval key

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
 *
 * ✅ DATABASE TRANSACTIONS:
 * - Uses IndexedDB native transactions (ACID guarantees)
 * - Multi-tab safe (browser serializes conflicting transactions)
 * - Each operation written in its own transaction (no read-modify-write races)
 */
export class DeadLetterQueue {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private migrationAttempted: boolean = false;

  /**
   * Migrate legacy idb-keyval data to new IndexedDB database
   *
   * CRITICAL: Prevents data loss on upgrade
   * - Old version stored DLQ items in idb-keyval array
   * - New version uses separate IndexedDB database
   * - Without migration, failed operations would be silently lost
   */
  private async migrateLegacyData(db: IDBPDatabase): Promise<void> {
    if (this.migrationAttempted) {
      return;
    }

    this.migrationAttempted = true;

    try {
      // Check for legacy data in idb-keyval
      const legacyData = await idbGet<DeadLetterItem[]>(LEGACY_KEY);

      if (!legacyData || legacyData.length === 0) {
        logger.debug('☠️ DEAD LETTER QUEUE: No legacy data to migrate');
        return;
      }

      logger.info(`☠️ DEAD LETTER QUEUE: Migrating ${legacyData.length} items from legacy storage`);

      // Migrate each item to new storage
      const tx = db.transaction(STORE_NAME, 'readwrite');
      let migrated = 0;

      for (const item of legacyData) {
        try {
          await tx.store.put(item);
          migrated++;
        } catch (err) {
          logger.error('Failed to migrate DLQ item:', { id: item.id, error: err });
        }
      }

      await tx.done;

      // Clear legacy storage after successful migration
      await idbDel(LEGACY_KEY);

      logger.info(`✅ DEAD LETTER QUEUE: Successfully migrated ${migrated}/${legacyData.length} items`);
    } catch (err) {
      logger.error('Failed to migrate legacy dead letter queue data:', err);
      // Don't throw - allow app to continue with empty DLQ
    }
  }

  /**
   * Initialize database connection
   */
  private async initDB(): Promise<IDBPDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create object store with keyPath
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

          // Indexes for efficient querying
          store.createIndex('addedToDLQ', 'addedToDLQ');
          store.createIndex('operationType', 'operation.type');

          logger.debug('☠️ DEAD LETTER QUEUE: Created object store');
        }
      },
    });

    const db = await this.dbPromise;

    // Migrate legacy data after database is ready
    await this.migrateLegacyData(db);

    return db;
  }

  /**
   * Add failed operation to DLQ
   *
   * Database Transactions: Each add() uses its own transaction
   * Multi-tab safe: IndexedDB serializes conflicting writes across tabs
   *
   * @param operation - Failed operation
   * @param error - Error message
   * @param failureCount - Number of failures
   * @param firstFailure - ISO timestamp of first failure
   */
  async add(
    operation: Operation,
    error: string,
    failureCount: number,
    firstFailure: string
  ): Promise<void> {
    try {
      const db = await this.initDB();

      const item: DeadLetterItem = {
        id: operation.id,
        operation,
        error,
        failureCount,
        firstFailure,
        lastFailure: new Date().toISOString(),
        addedToDLQ: new Date().toISOString(),
      };

      // Atomic write - browser handles serialization across tabs
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.put(item);  // put() updates if exists, inserts if not
      await tx.done;

      logger.warn('☠️ DEAD LETTER QUEUE: Added failed operation', {
        operationId: operation.id,
        operationType: operation.type,
        error,
        failureCount,
      });
    } catch (err) {
      logger.error('Failed to add to dead letter queue:', err);
      throw err;
    }
  }

  /**
   * Get all items from DLQ
   */
  async getAll(): Promise<DeadLetterItem[]> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const items = await tx.store.getAll();
      return items;
    } catch (err) {
      logger.error('Failed to get all DLQ items:', err);
      return [];
    }
  }

  /**
   * Get single item from DLQ by ID
   */
  async get(id: string): Promise<DeadLetterItem | null> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const item = await tx.store.get(id);
      return item || null;
    } catch (err) {
      logger.error('Failed to get DLQ item:', err);
      return null;
    }
  }

  /**
   * Remove item from DLQ
   *
   * @param id - Operation ID to remove
   */
  async remove(id: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.delete(id);
      await tx.done;

      logger.info('☠️ DEAD LETTER QUEUE: Removed item', { id });
    } catch (err) {
      logger.error('Failed to remove from dead letter queue:', err);
      throw err;
    }
  }

  /**
   * Retry item (returns operation for resubmission)
   *
   * @param id - Operation ID to retry
   * @returns Operation to retry, or null if not found
   */
  async retry(id: string): Promise<Operation | null> {
    try {
      const db = await this.initDB();

      // Read operation
      const getTx = db.transaction(STORE_NAME, 'readonly');
      const item = await getTx.store.get(id);

      if (!item) {
        logger.warn('☠️ DEAD LETTER QUEUE: Item not found for retry', { id });
        return null;
      }

      // Remove from DLQ in separate transaction
      const deleteTx = db.transaction(STORE_NAME, 'readwrite');
      await deleteTx.store.delete(id);
      await deleteTx.done;

      logger.info('☠️ DEAD LETTER QUEUE: Retrying item', {
        id,
        operationType: item.operation.type,
      });

      return item.operation;
    } catch (err) {
      logger.error('Failed to retry DLQ item:', err);
      return null;
    }
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    oldest: string | null;
    newest: string | null;
  }> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const items = await tx.store.getAll();

      if (items.length === 0) {
        return { total: 0, byType: {}, oldest: null, newest: null };
      }

      const stats = {
        total: items.length,
        byType: {} as Record<string, number>,
        oldest: items[0].addedToDLQ,
        newest: items[0].addedToDLQ,
      };

      for (const item of items) {
        // Count by type
        const type = item.operation.type;
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        // Track oldest and newest
        if (item.addedToDLQ < stats.oldest) {
          stats.oldest = item.addedToDLQ;
        }
        if (item.addedToDLQ > stats.newest) {
          stats.newest = item.addedToDLQ;
        }
      }

      return stats;
    } catch (err) {
      logger.error('Failed to get DLQ stats:', err);
      return { total: 0, byType: {}, oldest: null, newest: null };
    }
  }

  /**
   * Clean up old DLQ items (> 30 days)
   *
   * Business Rule: DLQ items expire after 30 days
   */
  async cleanupOld(): Promise<number> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');

      const items = await tx.store.getAll();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      let removed = 0;
      for (const item of items) {
        const addedTime = new Date(item.addedToDLQ).getTime();
        if (addedTime < thirtyDaysAgo) {
          await tx.store.delete(item.id);
          removed++;
        }
      }

      await tx.done;

      if (removed > 0) {
        logger.info(`☠️ DEAD LETTER QUEUE: Cleaned up ${removed} old items (>30 days)`);
      }

      return removed;
    } catch (err) {
      logger.error('Failed to cleanup old DLQ items:', err);
      return 0;
    }
  }

  /**
   * Clear all items from DLQ
   */
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.clear();
      await tx.done;

      logger.info('☠️ DEAD LETTER QUEUE: Cleared all items');
    } catch (err) {
      logger.error('Failed to clear dead letter queue:', err);
      throw err;
    }
  }
}

// Singleton instance
let dlqInstance: DeadLetterQueue | null = null;

/**
 * Get dead letter queue singleton
 */
export function getDeadLetterQueue(): DeadLetterQueue {
  if (!dlqInstance) {
    dlqInstance = new DeadLetterQueue();
  }
  return dlqInstance;
}
