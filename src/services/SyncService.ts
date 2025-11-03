// src/services/SyncService.ts
// Centralized sync service for consistent operation submission and error handling

import { logger } from '../utils/logger';
import type { Operation } from '../sync/operations';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncError {
  operation: Partial<Operation>;
  error: Error;
  timestamp: string;
  retryCount: number;
}

export interface SyncServiceConfig {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: SyncError) => void;
  onSuccess?: (operation: Partial<Operation>) => void;
  onStatusChange?: (status: SyncStatus) => void;
}

/**
 * Centralized service for managing sync operations
 * Provides consistent error handling, retry logic, and status tracking
 */
export class SyncService {
  private status: SyncStatus = 'idle';
  private errors: SyncError[] = [];
  private submitOperation: ((op: Partial<Operation>) => Promise<void>) | null = null;
  private config: Required<SyncServiceConfig>;

  constructor(config: SyncServiceConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 2000,
      onError: config.onError ?? (() => {}),
      onSuccess: config.onSuccess ?? (() => {}),
      onStatusChange: config.onStatusChange ?? (() => {}),
    };
  }

  /**
   * Initialize the sync service with a submitOperation function
   */
  initialize(submitOperation: (op: Partial<Operation>) => Promise<void>) {
    this.submitOperation = submitOperation;
    logger.info('SyncService initialized');
  }

  /**
   * Submit an operation to the cloud with error handling and retry logic
   */
  async submit(operation: Partial<Operation>, retryCount: number = 0): Promise<void> {
    if (!this.submitOperation) {
      const error = new Error('SyncService not initialized. Call initialize() first.');
      logger.error('Sync submission failed:', error);
      throw error;
    }

    try {
      this.setStatus('syncing');
      logger.info(`📤 Submitting ${operation.type} operation`, operation);

      await this.submitOperation(operation);

      this.setStatus('success');
      this.config.onSuccess(operation);
      logger.info(`✅ Successfully submitted ${operation.type} operation`);
    } catch (error) {
      const syncError: SyncError = {
        operation,
        error: error as Error,
        timestamp: new Date().toISOString(),
        retryCount,
      };

      logger.error(`❌ Failed to submit ${operation.type} operation:`, error);

      // Retry logic
      if (retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        logger.warn(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.submit(operation, retryCount + 1);
      }

      // Max retries exceeded
      this.errors.push(syncError);
      this.setStatus('error');
      this.config.onError(syncError);

      throw new Error(`Failed to sync ${operation.type} after ${this.config.maxRetries} attempts: ${(error as Error).message}`);
    }
  }

  /**
   * Submit an operation without throwing on error (fire-and-forget)
   * Useful for non-critical operations where we don't want to block the UI
   */
  async submitSilent(operation: Partial<Operation>): Promise<boolean> {
    try {
      await this.submit(operation);
      return true;
    } catch (error) {
      logger.error('Silent submission failed:', error);
      return false;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Get all sync errors
   */
  getErrors(): SyncError[] {
    return [...this.errors];
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
    if (this.status === 'error') {
      this.setStatus('idle');
    }
  }

  /**
   * Retry a failed operation
   */
  async retryError(error: SyncError): Promise<void> {
    const index = this.errors.indexOf(error);
    if (index >= 0) {
      this.errors.splice(index, 1);
    }
    await this.submit(error.operation, 0);
  }

  /**
   * Set status and notify listeners
   */
  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.config.onStatusChange(status);
      logger.info(`Sync status: ${status}`);
    }
  }

  /**
   * Check if service is ready to sync
   */
  isReady(): boolean {
    return this.submitOperation !== null;
  }
}

// Global singleton instance
let syncServiceInstance: SyncService | null = null;

/**
 * Get the global SyncService instance
 */
export function getSyncService(config?: SyncServiceConfig): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService(config);
  }
  return syncServiceInstance;
}

/**
 * Initialize the global SyncService instance
 */
export function initializeSyncService(
  submitOperation: (op: Partial<Operation>) => Promise<void>,
  config?: SyncServiceConfig
): SyncService {
  const service = getSyncService(config);
  service.initialize(submitOperation);
  return service;
}
