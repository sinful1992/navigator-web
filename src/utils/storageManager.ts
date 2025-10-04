// src/utils/storageManager.ts - CRITICAL FIX: Robust storage with persistence
import { get, set } from "idb-keyval";
import { logger } from "./logger";
import { showError, showWarning } from "./toast";

type StorageOperation = {
  key: string;
  data: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

class StorageManager {
  private queue: StorageOperation[] = [];
  private processing = false;
  private persistenceGranted = false;

  constructor() {
    this.initializePersistence();
  }

  // CRITICAL: Request persistent storage to prevent browser eviction
  private async initializePersistence() {
    try {
      if ('storage' in navigator && 'persist' in navigator.storage) {
        const persistent = await navigator.storage.persist();
        this.persistenceGranted = persistent;

        if (persistent) {
          logger.info('✅ Persistent storage granted - data protected from eviction');
        } else {
          logger.warn('⚠️ Persistent storage denied - data may be evicted by browser');
          showWarning('Storage persistence not granted. Your data may be lost if browser storage is full.', 8000);
        }

        // Check storage quota
        if ('estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          const usedMB = Math.round((estimate.usage || 0) / 1024 / 1024);
          const quotaMB = Math.round((estimate.quota || 0) / 1024 / 1024);
          logger.info(`📊 Storage: ${usedMB}MB used / ${quotaMB}MB quota`);

          // Warn if storage is getting full
          if (estimate.usage && estimate.quota && estimate.usage > estimate.quota * 0.8) {
            logger.warn('⚠️ Storage quota 80% full - may cause data loss');
            showWarning('Storage is 80% full. Consider clearing old data to prevent loss.', 10000);
          }
        }
      } else {
        logger.warn('🚫 Storage persistence API not available');
      }
    } catch (error) {
      logger.error('Failed to initialize storage persistence:', error);
    }
  }

  // CRITICAL: Serialize IndexedDB writes to prevent corruption
  async queuedSet(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, data, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;

      try {
        // Add retry logic for IndexedDB failures
        let retries = 3;
        let lastError: any;

        while (retries > 0) {
          try {
            await set(operation.key, operation.data);
            operation.resolve(undefined);
            break;
          } catch (error: unknown) {
            lastError = error;
            retries--;

            if (retries > 0) {
              logger.warn(`IndexedDB write failed, retrying... (${3 - retries}/3)`, error);
              await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries)));
            }
          }
        }

        if (retries === 0) {
          logger.error('IndexedDB write failed after 3 retries:', lastError);
          showError('Failed to save data. Please check your browser storage settings.', 10000);
          operation.reject(lastError);
        }

      } catch (error) {
        logger.error('Storage queue operation failed:', error);
        operation.reject(error);
      }
    }

    this.processing = false;
  }

  async queuedGet(key: string): Promise<any> {
    try {
      // Check storage health before reading
      await this.checkStorageHealth();
      return await get(key);
    } catch (error) {
      logger.error('IndexedDB read failed:', error);
      showError('Failed to load data from storage. Please refresh the page.', 10000);
      throw error;
    }
  }

  private async checkStorageHealth(): Promise<void> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();

        // Check if we're running out of space
        if (estimate.usage && estimate.quota && estimate.usage > estimate.quota * 0.95) {
          logger.error('🚨 CRITICAL: Storage quota 95% full - immediate data loss risk');
          showError('CRITICAL: Storage almost full! Clear browser data immediately to prevent loss.', 15000);
          throw new Error('Storage quota exhausted');
        }
      }
    } catch (error) {
      logger.warn('Storage health check failed:', error);
    }
  }

  // Force persistence re-request (useful after major operations)
  async requestPersistence(): Promise<boolean> {
    try {
      if ('storage' in navigator && 'persist' in navigator.storage) {
        const granted = await navigator.storage.persist();
        this.persistenceGranted = granted;
        return granted;
      }
    } catch (error) {
      logger.error('Failed to request storage persistence:', error);
    }
    return false;
  }

  get isPersistent(): boolean {
    return this.persistenceGranted;
  }
}

// Singleton instance to coordinate all storage operations
export const storageManager = new StorageManager();