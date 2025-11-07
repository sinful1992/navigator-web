// src/sync/retryQueue.ts
// Persistent retry queue for failed sync operations
// PHASE 1: Enterprise Pattern - Event Queues with Exponential Backoff

import { get, set, del, keys } from 'idb-keyval';
import { logger } from '../utils/logger';
import type { Operation } from './operations';

/**
 * Retry metadata for failed operations
 */
export interface RetryQueueItem {
  operation: Operation;
  attempts: number;
  lastAttempt: string; // ISO timestamp
  nextRetry: string; // ISO timestamp
  error: string;
  addedAt: string; // ISO timestamp
}

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  initialDelay: 1000, // 1 second
  maxDelay: 60000, // 60 seconds
  maxAttempts: 10, // Give up after 10 attempts
} as const;

/**
 * Calculate next retry delay using exponential backoff
 * Formula: min(initialDelay * 2^attempts, maxDelay)
 *
 * Examples:
 * - Attempt 0: 1s
 * - Attempt 1: 2s
 * - Attempt 2: 4s
 * - Attempt 3: 8s
 * - Attempt 4: 16s
 * - Attempt 5: 32s
 * - Attempt 6+: 60s (capped)
 */
function calculateBackoff(attempts: number): number {
  const delay = RETRY_CONFIG.initialDelay * Math.pow(2, attempts);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

/**
 * RetryQueueManager - Persistent queue for failed sync operations
 *
 * Responsibilities:
 * - Store failed operations in IndexedDB
 * - Calculate exponential backoff delays
 * - Track retry attempts and errors
 * - Provide operations ready for retry
 * - Persist across app restarts
 *
 * Why needed:
 * - Current implementation tracks failures in memory only (operationSync.ts:948)
 * - Failed operations lost on app restart
 * - No backoff strategy - retries happen immediately
 * - No visibility into sync failures
 */
export class RetryQueueManager {
  private readonly storePrefix = 'retry_queue_';

  /**
   * Add failed operation to retry queue
   */
  async addToQueue(
    operation: Operation,
    error: string,
    existingItem?: RetryQueueItem
  ): Promise<void> {
    const attempts = existingItem ? existingItem.attempts + 1 : 0;
    const now = new Date().toISOString();
    const backoffMs = calculateBackoff(attempts);
    const nextRetry = new Date(Date.now() + backoffMs).toISOString();

    // Check if exceeded max attempts
    if (attempts >= RETRY_CONFIG.maxAttempts) {
      logger.error('❌ RETRY QUEUE: Max attempts exceeded, giving up', {
        operationId: operation.id,
        sequence: operation.sequence,
        type: operation.type,
        attempts,
        error,
      });

      // Move to dead letter queue (future enhancement)
      await this.moveToDeadLetterQueue(operation, error, attempts);
      return;
    }

    const queueItem: RetryQueueItem = {
      operation,
      attempts,
      lastAttempt: now,
      nextRetry,
      error,
      addedAt: existingItem?.addedAt || now,
    };

    const key = this.getKey(operation.sequence);
    await set(key, queueItem);

    logger.info('📥 RETRY QUEUE: Operation added', {
      sequence: operation.sequence,
      type: operation.type,
      attempts,
      nextRetryIn: `${backoffMs / 1000}s`,
      nextRetry,
    });
  }

  /**
   * Get operations ready for retry (past their nextRetry time)
   */
  async getReadyForRetry(): Promise<RetryQueueItem[]> {
    const now = new Date();
    const allKeys = await keys();
    const queueKeys = allKeys.filter((k) =>
      typeof k === 'string' && k.startsWith(this.storePrefix)
    ) as string[];

    const readyItems: RetryQueueItem[] = [];

    for (const key of queueKeys) {
      const item = await get<RetryQueueItem>(key);
      if (!item) continue;

      const nextRetryTime = new Date(item.nextRetry);
      if (now >= nextRetryTime) {
        readyItems.push(item);
      }
    }

    // Sort by sequence number (oldest first)
    readyItems.sort((a, b) => a.operation.sequence - b.operation.sequence);

    if (readyItems.length > 0) {
      logger.info('🔄 RETRY QUEUE: Operations ready for retry', {
        count: readyItems.length,
        sequences: readyItems.map((i) => i.operation.sequence),
      });
    }

    return readyItems;
  }

  /**
   * Remove operation from queue (successful retry)
   */
  async removeFromQueue(sequence: number): Promise<void> {
    const key = this.getKey(sequence);
    await del(key);

    logger.info('✅ RETRY QUEUE: Operation succeeded, removed from queue', {
      sequence,
    });
  }

  /**
   * Get all items in queue (for UI display)
   */
  async getAllQueueItems(): Promise<RetryQueueItem[]> {
    const allKeys = await keys();
    const queueKeys = allKeys.filter((k) =>
      typeof k === 'string' && k.startsWith(this.storePrefix)
    ) as string[];

    const items: RetryQueueItem[] = [];

    for (const key of queueKeys) {
      const item = await get<RetryQueueItem>(key);
      if (item) {
        items.push(item);
      }
    }

    // Sort by sequence number
    items.sort((a, b) => a.operation.sequence - b.operation.sequence);

    return items;
  }

  /**
   * Get queue statistics (for UI display)
   */
  async getQueueStats(): Promise<{
    total: number;
    ready: number;
    waiting: number;
    oldestRetry: string | null;
  }> {
    const allItems = await this.getAllQueueItems();
    const now = new Date();

    const readyCount = allItems.filter(
      (item) => new Date(item.nextRetry) <= now
    ).length;

    const waitingItems = allItems.filter(
      (item) => new Date(item.nextRetry) > now
    );

    const oldestRetry =
      waitingItems.length > 0
        ? waitingItems.reduce((oldest, item) =>
            new Date(item.nextRetry) < new Date(oldest.nextRetry)
              ? item
              : oldest
          ).nextRetry
        : null;

    return {
      total: allItems.length,
      ready: readyCount,
      waiting: waitingItems.length,
      oldestRetry,
    };
  }

  /**
   * Clear entire queue (for testing or manual intervention)
   */
  async clearQueue(): Promise<void> {
    const allKeys = await keys();
    const queueKeys = allKeys.filter((k) =>
      typeof k === 'string' && k.startsWith(this.storePrefix)
    ) as string[];

    for (const key of queueKeys) {
      await del(key);
    }

    logger.info('🗑️ RETRY QUEUE: Queue cleared', {
      itemsRemoved: queueKeys.length,
    });
  }

  /**
   * Move operation to dead letter queue (max retries exceeded)
   */
  private async moveToDeadLetterQueue(
    operation: Operation,
    error: string,
    attempts: number
  ): Promise<void> {
    const deadLetterKey = `dead_letter_${operation.sequence}`;
    const deadLetterItem = {
      operation,
      error,
      attempts,
      timestamp: new Date().toISOString(),
    };

    await set(deadLetterKey, deadLetterItem);

    // Remove from retry queue
    const key = this.getKey(operation.sequence);
    await del(key);

    logger.error('☠️ DEAD LETTER QUEUE: Operation permanently failed', {
      sequence: operation.sequence,
      type: operation.type,
      attempts,
      error,
    });
  }

  /**
   * Get dead letter queue items (permanently failed operations)
   */
  async getDeadLetterItems(): Promise<
    Array<{
      operation: Operation;
      error: string;
      attempts: number;
      timestamp: string;
    }>
  > {
    const allKeys = await keys();
    const deadLetterKeys = allKeys.filter((k) =>
      typeof k === 'string' && k.startsWith('dead_letter_')
    ) as string[];

    const items = [];

    for (const key of deadLetterKeys) {
      const item = await get(key);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Generate IndexedDB key for operation
   */
  private getKey(sequence: number): string {
    return `${this.storePrefix}${sequence}`;
  }
}

// Export singleton instance
export const retryQueueManager = new RetryQueueManager();
