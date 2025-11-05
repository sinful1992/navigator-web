// src/sync/commandQueue.ts
// Command Queue for buffering operations before submission
// Clean Architecture - Infrastructure Layer

import { get, set } from 'idb-keyval';
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

const QUEUE_KEY = 'navigator-command-queue';

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
  /**
   * Get all queue items from storage
   */
  private async getQueue(): Promise<CommandQueueItem[]> {
    try {
      const queue = await get<CommandQueueItem[]>(QUEUE_KEY);
      return queue || [];
    } catch (err) {
      logger.error('Failed to get command queue:', err);
      return [];
    }
  }

  /**
   * Save queue items to storage
   */
  private async saveQueue(queue: CommandQueueItem[]): Promise<void> {
    try {
      await set(QUEUE_KEY, queue);
    } catch (err) {
      logger.error('Failed to save command queue:', err);
    }
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
      const queue = await this.getQueue();

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

      queue.push(item);
      await this.saveQueue(queue);

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
      const queue = await this.getQueue();
      const pending = queue
        .filter(item => item.status === 'pending')
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
        .slice(0, limit);

      return pending;
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
      const queue = await this.getQueue();
      const item = queue.find(i => i.id === commandId);

      if (item) {
        item.status = 'processing';
        item.attempts += 1;
        item.lastAttempt = new Date().toISOString();
        await this.saveQueue(queue);

        logger.debug('📨 COMMAND QUEUE: Marked as processing', { commandId });
      }
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
      const queue = await this.getQueue();
      const filteredQueue = queue.filter(i => i.id !== commandId);
      await this.saveQueue(filteredQueue);

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
      const queue = await this.getQueue();
      const item = queue.find(i => i.id === commandId);

      if (item) {
        item.status = 'failed';
        item.error = error;
        await this.saveQueue(queue);

        logger.warn('📨 COMMAND QUEUE: Marked as failed', { commandId, error });
      }
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
      const queue = await this.getQueue();
      const item = queue.find(i => i.id === commandId);

      if (item) {
        item.status = 'pending';
        item.error = null;
        await this.saveQueue(queue);

        logger.debug('📨 COMMAND QUEUE: Reset to pending', { commandId });
      }
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
      const queue = await this.getQueue();

      const stats = {
        total: queue.length,
        pending: 0,
        processing: 0,
        failed: 0,
        byType: {} as Record<string, number>,
      };

      for (const item of queue) {
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
      const queue = await this.getQueue();
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      const before = queue.length;
      const filteredQueue = queue.filter(item => {
        const addedTime = new Date(item.addedAt).getTime();
        return addedTime >= oneDayAgo;
      });
      const removed = before - filteredQueue.length;

      if (removed > 0) {
        await this.saveQueue(filteredQueue);
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
      await this.saveQueue([]);
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
