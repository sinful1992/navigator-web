// src/sync/deadLetterQueue.ts
// Dead Letter Queue for permanently failed operations
// Clean Architecture - Infrastructure Layer

import { get, set } from 'idb-keyval';
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

const DLQ_KEY = 'navigator-dead-letter-queue';

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
  /**
   * Get all DLQ items from storage
   */
  private async getQueue(): Promise<DeadLetterItem[]> {
    try {
      const queue = await get<DeadLetterItem[]>(DLQ_KEY);
      return queue || [];
    } catch (err) {
      logger.error('Failed to get dead letter queue:', err);
      return [];
    }
  }

  /**
   * Save DLQ items to storage
   */
  private async saveQueue(queue: DeadLetterItem[]): Promise<void> {
    try {
      await set(DLQ_KEY, queue);
    } catch (err) {
      logger.error('Failed to save dead letter queue:', err);
    }
  }

  /**
   * Add failed operation to DLQ
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
      const queue = await this.getQueue();

      const item: DeadLetterItem = {
        id: operation.id,
        operation,
        error,
        failureCount,
        firstFailure,
        lastFailure: new Date().toISOString(),
        addedToDLQ: new Date().toISOString(),
      };

      // Check if already exists (update instead of add)
      const existingIndex = queue.findIndex(i => i.id === operation.id);
      if (existingIndex >= 0) {
        queue[existingIndex] = item;
      } else {
        queue.push(item);
      }

      await this.saveQueue(queue);

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
      return await this.getQueue();
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
      const queue = await this.getQueue();
      return queue.find(item => item.id === id) || null;
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
      const queue = await this.getQueue();
      const filteredQueue = queue.filter(item => item.id !== id);
      await this.saveQueue(filteredQueue);

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
      const queue = await this.getQueue();
      const item = queue.find(i => i.id === id);

      if (!item) {
        logger.warn('☠️ DEAD LETTER QUEUE: Item not found for retry', { id });
        return null;
      }

      // Remove from DLQ (will be re-added if fails again)
      await this.remove(id);

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
      const queue = await this.getQueue();

      if (queue.length === 0) {
        return { total: 0, byType: {}, oldest: null, newest: null };
      }

      const stats = {
        total: queue.length,
        byType: {} as Record<string, number>,
        oldest: queue[0].addedToDLQ,
        newest: queue[0].addedToDLQ,
      };

      for (const item of queue) {
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
      const queue = await this.getQueue();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      const before = queue.length;
      const filteredQueue = queue.filter(item => {
        const addedTime = new Date(item.addedToDLQ).getTime();
        return addedTime >= thirtyDaysAgo;
      });
      const removed = before - filteredQueue.length;

      if (removed > 0) {
        await this.saveQueue(filteredQueue);
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
      await this.saveQueue([]);
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
