// src/services/SyncService.ts
// Centralized sync service with error handling and retry logic

import { logger } from '../utils/logger';
import type { Operation } from '../sync/operations';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncServiceConfig {
  maxRetries?: number;
  retryDelay?: number;
  onStatusChange?: (status: SyncStatus) => void;
}

export interface SubmitOperationFn {
  (operation: Partial<Operation>): Promise<void>;
}

/**
 * SyncService - Centralized sync operations with retry logic
 *
 * Features:
 * - Exponential backoff retry
 * - Status tracking
 * - Event callbacks
 * - Consistent error handling
 */
export class SyncService {
  private submitOperation: SubmitOperationFn;
  private config: Required<SyncServiceConfig>;
  private status: SyncStatus = 'idle';

  constructor(submitOperation: SubmitOperationFn, config: SyncServiceConfig = {}) {
    this.submitOperation = submitOperation;
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000, // 1 second base delay
      onStatusChange: config.onStatusChange ?? (() => {}),
    };
  }

  /**
   * Submit operation with automatic retry on failure
   */
  async submit(operation: Partial<Operation>, retryCount: number = 0): Promise<void> {
    try {
      this.setStatus('syncing');

      await this.submitOperation(operation);

      this.setStatus('success');
      logger.info('Operation synced successfully:', operation.type);

    } catch (error) {
      logger.error('Sync error (attempt ' + (retryCount + 1) + '):', error);

      if (retryCount < this.config.maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        logger.info(`Retrying sync in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));

        return this.submit(operation, retryCount + 1);
      }

      this.setStatus('error');
      logger.error('Sync failed after ' + this.config.maxRetries + ' retries');
      throw error;
    }
  }

  /**
   * Submit operation silently (no status updates, used for non-critical operations)
   */
  async submitSilent(operation: Partial<Operation>): Promise<void> {
    try {
      await this.submitOperation(operation);
      logger.debug('Silent operation synced:', operation.type);
    } catch (error) {
      logger.warn('Silent sync failed (not retrying):', error);
      // Don't throw - silent operations should not block UI
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Reset status to idle
   */
  reset(): void {
    this.setStatus('idle');
  }

  /**
   * Update status and trigger callback
   */
  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.config.onStatusChange(status);
  }
}
