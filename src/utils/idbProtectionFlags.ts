// src/utils/idbProtectionFlags.ts
// PHASE 1.2.2: IndexedDB-based protection flags for atomic operations
// Replaces localStorage to prevent race conditions between tabs

import { logger } from './logger';

type ProtectionFlag =
  | 'navigator_restore_in_progress'
  | 'navigator_import_in_progress'
  | 'navigator_active_protection';

const FLAG_CONFIGS: Record<ProtectionFlag, number> = {
  'navigator_restore_in_progress': 60000, // 60 seconds
  'navigator_import_in_progress': 6000,   // 6 seconds
  'navigator_active_protection': Infinity // Never expire - only cleared on complete/cancel
};

const DB_NAME = 'navigator-protection-flags';
const DB_VERSION = 1;
const STORE_NAME = 'flags';

/**
 * PHASE 1.2.2: Protection Flag Store Schema
 *
 * Structure:
 * {
 *   flag: string (e.g., 'navigator_active_protection'),
 *   timestamp: number (when flag was set),
 *   expiresAt: number (when flag expires, or Infinity)
 * }
 */

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB for protection flags
 * Uses singleton pattern to ensure only one connection
 */
function initDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB not available (no window object)'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'flag' });
        logger.debug('Created protection flags object store');
      }
    };
  });

  return dbPromise;
}

/**
 * Get the protection flags object store
 */
async function getStore(mode: 'readonly' | 'readwrite'): Promise<IDBObjectStore> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], mode);
    return transaction.objectStore(STORE_NAME);
  } catch (err) {
    logger.error('Failed to get IndexedDB store:', err);
    throw err;
  }
}

/**
 * Set a protection flag with atomic transaction
 * @param flag - Protection flag to set
 * @returns timestamp when flag was set
 */
export async function setProtectionFlag(flag: ProtectionFlag): Promise<number> {
  try {
    const store = await getStore('readwrite');
    const now = Date.now();
    const timeout = FLAG_CONFIGS[flag];
    const expiresAt = timeout === Infinity ? Infinity : now + timeout;

    const flagData = {
      flag,
      timestamp: now,
      expiresAt,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(flagData);

      request.onsuccess = () => {
        logger.debug(`Set protection flag: ${flag}`);
        resolve(now);
      };

      request.onerror = () => {
        logger.error(`Failed to set protection flag ${flag}:`, request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error in setProtectionFlag:', err);
    throw err;
  }
}

/**
 * Check if protection flag is active (within timeout window)
 * @param flag - Protection flag to check
 * @param customMinTimeout - Optional custom minimum timeout in ms
 * @returns true if protection is active, false otherwise
 */
export async function isProtectionActive(
  flag: ProtectionFlag,
  customMinTimeout?: number
): Promise<boolean> {
  try {
    const store = await getStore('readonly');

    return new Promise((resolve, reject) => {
      const request = store.get(flag);

      request.onsuccess = () => {
        const flagData = request.result;

        if (!flagData) {
          resolve(false);
          return;
        }

        const now = Date.now();
        const elapsed = now - flagData.timestamp;

        // Check custom minimum timeout
        if (customMinTimeout !== undefined && elapsed < customMinTimeout) {
          resolve(true);
          return;
        }

        // Check expiration
        if (flagData.expiresAt !== Infinity && elapsed >= (flagData.expiresAt - flagData.timestamp)) {
          // Flag expired, clear it
          clearProtectionFlag(flag).catch(err => {
            logger.error('Failed to clear expired flag:', err);
          });
          resolve(false);
          return;
        }

        resolve(true);
      };

      request.onerror = () => {
        logger.error(`Failed to check protection flag ${flag}:`, request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error in isProtectionActive:', err);
    throw err;
  }
}

/**
 * Clear a protection flag atomically
 * @param flag - Protection flag to clear
 */
export async function clearProtectionFlag(flag: ProtectionFlag): Promise<void> {
  try {
    const store = await getStore('readwrite');

    return new Promise((resolve, reject) => {
      const request = store.delete(flag);

      request.onsuccess = () => {
        logger.debug(`Cleared protection flag: ${flag}`);
        resolve();
      };

      request.onerror = () => {
        logger.error(`Failed to clear protection flag ${flag}:`, request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error in clearProtectionFlag:', err);
    throw err;
  }
}

/**
 * Get remaining time on protection flag
 * @param flag - Protection flag to check
 * @returns milliseconds remaining, or 0 if not active
 */
export async function getProtectionTimeRemaining(flag: ProtectionFlag): Promise<number> {
  try {
    const store = await getStore('readonly');

    return new Promise((resolve, reject) => {
      const request = store.get(flag);

      request.onsuccess = () => {
        const flagData = request.result;

        if (!flagData || flagData.expiresAt === Infinity) {
          resolve(0);
          return;
        }

        const now = Date.now();
        const remaining = flagData.expiresAt - now;

        resolve(Math.max(0, remaining));
      };

      request.onerror = () => {
        logger.error(`Failed to get remaining time for flag ${flag}:`, request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error in getProtectionTimeRemaining:', err);
    throw err;
  }
}

/**
 * Execute callback only if protection is NOT active
 * Sets protection flag before executing
 * @param flag - Protection flag to use
 * @param callback - Function to execute
 * @returns result of callback, or null if protection blocked execution
 */
export async function executeWithProtection<T>(
  flag: ProtectionFlag,
  callback: () => Promise<T>
): Promise<T | null> {
  try {
    const isActive = await isProtectionActive(flag);

    if (isActive) {
      const remaining = await getProtectionTimeRemaining(flag);
      logger.warn(`Protection flag ${flag} is active. ${Math.round(remaining / 1000)}s remaining.`);
      return null;
    }

    await setProtectionFlag(flag);

    try {
      const result = await callback();
      return result;
    } finally {
      // Only clear flag after successful execution
      await clearProtectionFlag(flag);
    }
  } catch (err) {
    logger.error('Error in executeWithProtection:', err);
    throw err;
  }
}

/**
 * Clear all protection flags atomically
 * Useful for cleanup/debugging
 */
export async function clearAllProtectionFlags(): Promise<void> {
  try {
    const store = await getStore('readwrite');

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.onsuccess = () => {
        logger.debug('Cleared all protection flags');
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to clear all protection flags:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error in clearAllProtectionFlags:', err);
    throw err;
  }
}

/**
 * Migrate flags from localStorage to IndexedDB
 * Call this once during initialization
 * @param localStorageFlagNames - Names of flags to migrate
 */
export async function migrateFromLocalStorage(localStorageFlagNames: ProtectionFlag[]): Promise<void> {
  if (typeof localStorage === 'undefined') {
    return; // localStorage not available
  }

  try {
    for (const flag of localStorageFlagNames) {
      const stored = localStorage.getItem(flag);

      if (!stored) {
        continue; // Flag not in localStorage
      }

      try {
        const timestamp = parseInt(stored, 10);

        if (isNaN(timestamp)) {
          continue; // Corrupted flag
        }

        // Migrate to IndexedDB
        const timeout = FLAG_CONFIGS[flag];
        const expiresAt = timeout === Infinity ? Infinity : timestamp + timeout;
        const now = Date.now();

        // Only migrate if flag hasn't expired
        if (expiresAt === Infinity || now < expiresAt) {
          const store = await getStore('readwrite');

          const flagData = {
            flag,
            timestamp,
            expiresAt,
          };

          await new Promise((resolve, reject) => {
            const request = store.put(flagData);
            request.onsuccess = () => resolve(undefined);
            request.onerror = () => reject(request.error);
          });

          logger.debug(`Migrated flag ${flag} from localStorage to IndexedDB`);
        }
      } catch (err) {
        logger.warn(`Failed to migrate flag ${flag}:`, err);
      }
    }
  } catch (err) {
    logger.error('Error in migrateFromLocalStorage:', err);
    throw err;
  }
}

/**
 * Close the IndexedDB connection (for cleanup)
 */
export function closeDB(): void {
  if (dbPromise) {
    dbPromise.then(db => {
      db.close();
      logger.debug('Closed IndexedDB connection');
    }).catch(err => {
      logger.error('Error closing IndexedDB:', err);
    });

    dbPromise = null;
  }
}
