// src/utils/protectionFlags.ts
// PHASE 1.2.2 (REVISED): Hybrid cache + IndexedDB protection flags
// Synchronous API with atomic IndexedDB backend and cross-tab coordination
//
// Architecture:
// - In-memory cache: Fast synchronous reads via Map
// - IndexedDB backend: Atomic operations and cross-tab sync
// - BroadcastChannel: Real-time updates between tabs
// - Fallback: If IndexedDB unavailable, cache is source of truth

import { logger } from './logger';

type ProtectionFlag =
  | 'navigator_restore_in_progress'
  | 'navigator_import_in_progress'
  | 'navigator_active_protection';

interface FlagData {
  timestamp: number;
  expiresAt: number;
}

const FLAG_CONFIGS: Record<ProtectionFlag, number> = {
  'navigator_restore_in_progress': 60000, // 60 seconds - extended to cover sync operation
  'navigator_import_in_progress': 6000,   // 6 seconds
  'navigator_active_protection': Infinity // 🔧 FIX: Never expire - only cleared on complete/cancel
};

// ============================================================================
// FIX #5: INPUT VALIDATION (Security & Data Integrity)
// ============================================================================

/**
 * Check if value is a valid ProtectionFlag
 */
function isValidProtectionFlag(value: unknown): value is ProtectionFlag {
  return typeof value === 'string' && value in FLAG_CONFIGS;
}

/**
 * Validate timestamp is within reasonable range (±1 year)
 * Prevents clock skew attacks and data corruption
 */
function isValidTimestamp(ts: any): boolean {
  if (typeof ts !== 'number' || !isFinite(ts)) {
    return false;
  }

  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  // Reject timestamps too far in past/future
  return ts >= (now - oneYearMs) && ts <= (now + oneYearMs);
}

/**
 * Check if value is valid FlagData object
 */
function isValidFlagData(value: unknown): value is FlagData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as any;

  // Check timestamp
  if (!isValidTimestamp(obj.timestamp)) {
    return false;
  }

  // Check expiresAt (either number or Infinity)
  if (typeof obj.expiresAt !== 'number') {
    return false;
  }

  // If Infinity, that's valid
  if (obj.expiresAt === Infinity) {
    return true;
  }

  // If number, must be finite and valid timestamp
  return isFinite(obj.expiresAt) && obj.expiresAt >= obj.timestamp && isValidTimestamp(obj.expiresAt);
}

/**
 * Safely parse and validate IndexedDB record
 * Returns null if invalid
 */
function parseIndexedDBRecord(record: any): { flag: ProtectionFlag; data: FlagData } | null {
  if (!record || typeof record !== 'object') {
    logger.warn('Invalid IndexedDB record: not an object');
    return null;
  }

  const { flag, timestamp, expiresAt } = record;

  // Validate flag
  if (!isValidProtectionFlag(flag)) {
    logger.warn('Invalid flag in IndexedDB record:', flag);
    return null;
  }

  // Validate data structure
  const data: any = { timestamp, expiresAt };
  if (!isValidFlagData(data)) {
    logger.warn('Invalid flag data in IndexedDB for', flag, ':', { timestamp, expiresAt });
    return null;
  }

  return { flag, data };
}

/**
 * Safely parse and validate BroadcastChannel message
 * Returns null if invalid
 */
function parseBroadcastMessage(event: MessageEvent): { flag: ProtectionFlag; data: FlagData | null } | null {
  if (!event || !event.data || typeof event.data !== 'object') {
    logger.warn('Invalid BroadcastChannel message: malformed event');
    return null;
  }

  const { flag, data } = event.data;

  // Validate flag
  if (!isValidProtectionFlag(flag)) {
    logger.warn('Invalid flag in BroadcastChannel message:', flag);
    return null;
  }

  // Handle delete message (data === null is valid)
  if (data === null) {
    return { flag, data: null };
  }

  // Validate data structure for set message
  if (!isValidFlagData(data)) {
    logger.warn('Invalid flag data in BroadcastChannel for', flag, ':', data);
    return null;
  }

  return { flag, data };
}

// ============================================================================
// IN-MEMORY CACHE (for synchronous reads)
// ============================================================================

const flagCache = new Map<ProtectionFlag, FlagData>();

// ============================================================================
// INDEXEDDB BACKEND (for atomic operations and persistence)
// ============================================================================

const DB_NAME = 'navigator-protection-flags';
const DB_VERSION = 1;
const STORE_NAME = 'flags';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB database
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

// ============================================================================
// CROSS-TAB SYNCHRONIZATION (BroadcastChannel API)
// ============================================================================

let broadcastChannel: BroadcastChannel | null = null;

function initBroadcastChannel() {
  if (typeof window === 'undefined') return;

  try {
    if (!broadcastChannel) {
      broadcastChannel = new BroadcastChannel('navigator-protection-flags');
      broadcastChannel.onmessage = (event) => {
        // 🔧 FIX #5: Use validated parsing function for security
        const parsed = parseBroadcastMessage(event);
        if (!parsed) {
          // Invalid message, already logged by parser
          return;
        }

        const { flag, data } = parsed;

        if (data === null) {
          // Flag was cleared in another tab
          flagCache.delete(flag);
          logger.debug(`🗑️ Protection flag cleared from another tab: ${flag}`);
        } else {
          // Flag was set in another tab
          flagCache.set(flag, data);
          logger.debug(`🔄 Protection flag updated from another tab: ${flag}`);
        }
      };
    }
  } catch (err) {
    logger.warn('BroadcastChannel not available:', err);
    // Fallback: no cross-tab sync
  }
}

function broadcastFlagChange(flag: ProtectionFlag, data: FlagData | null) {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ flag, data });
    } catch (err) {
      logger.warn('Failed to broadcast flag change:', err);
    }
  }
}

// ============================================================================
// PUBLIC API (Synchronous)
// ============================================================================

/**
 * Initialize protection flags by loading from IndexedDB into cache
 * Call this once during app initialization
 */
export async function initializeProtectionFlags(): Promise<void> {
  try {
    initBroadcastChannel();

    const store = await getStore('readonly');

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const allFlags = request.result;

        // Clear existing cache
        flagCache.clear();

        // 🔧 FIX #5: Validate all data loaded from IndexedDB
        let loadedCount = 0;
        let skippedCount = 0;

        for (const record of allFlags) {
          // Validate record structure and values
          const parsed = parseIndexedDBRecord(record);
          if (!parsed) {
            skippedCount++;
            continue;
          }

          const { flag, data } = parsed;
          const now = Date.now();

          // Skip expired flags
          if (data.expiresAt !== Infinity && now >= data.expiresAt) {
            logger.debug(`Skipping expired flag: ${flag}`);
            skippedCount++;
            continue;
          }

          // Load valid, non-expired flag into cache
          flagCache.set(flag, data);
          loadedCount++;
        }

        if (skippedCount > 0) {
          logger.warn(`Loaded ${loadedCount} valid flags, skipped ${skippedCount} invalid/expired flags`);
        } else {
          logger.debug(`Loaded ${loadedCount} protection flags from IndexedDB`);
        }
        resolve();
      };

      request.onerror = () => {
        logger.warn('Failed to load protection flags from IndexedDB:', request.error);
        // Fallback: empty cache, operations will still work
        resolve();
      };
    });
  } catch (err) {
    logger.warn('Error initializing protection flags:', err);
    // Fallback: continue with empty cache
  }
}

/**
 * Set a protection flag with atomic transaction
 * Updates both cache and IndexedDB
 * @returns timestamp when flag was set
 */
export function setProtectionFlag(flag: ProtectionFlag): number {
  const now = Date.now();
  const timeout = FLAG_CONFIGS[flag];
  const expiresAt = timeout === Infinity ? Infinity : now + timeout;

  // Update cache immediately (synchronous)
  flagCache.set(flag, { timestamp: now, expiresAt });
  logger.debug(`Set protection flag: ${flag}`);

  // Update IndexedDB asynchronously (fire and forget)
  (async () => {
    try {
      const store = await getStore('readwrite');

      const flagData = {
        flag,
        timestamp: now,
        expiresAt,
      };

      return new Promise<void>((resolve, reject) => {
        const request = store.put(flagData);

        request.onsuccess = () => {
          logger.debug(`Persisted protection flag to IndexedDB: ${flag}`);
          broadcastFlagChange(flag, { timestamp: now, expiresAt });
          resolve();
        };

        request.onerror = () => {
          logger.error(`Failed to persist protection flag ${flag}:`, request.error);
          reject(request.error);
        };
      });
    } catch (err) {
      logger.error('Error persisting protection flag:', err);
      // Fallback: cache is still valid
    }
  })();

  return now;
}

/**
 * Check if protection flag is active (within timeout window)
 * Reads from in-memory cache (synchronous, fast)
 * @param flag - Protection flag to check
 * @param customMinTimeout - Optional custom minimum timeout in ms (flag must be older than this)
 * @returns true if protection is active, false otherwise
 */
export function isProtectionActive(flag: ProtectionFlag, customMinTimeout?: number): boolean {
  const flagData = flagCache.get(flag);

  if (!flagData) {
    return false;
  }

  const { timestamp, expiresAt } = flagData;
  const now = Date.now();
  const elapsed = now - timestamp;

  // If custom minimum timeout is specified, flag must be older than that to be considered active
  if (customMinTimeout !== undefined && elapsed < customMinTimeout) {
    return true; // Still in waiting period
  }

  // Check expiration
  if (expiresAt !== Infinity && elapsed >= (expiresAt - timestamp)) {
    // Timeout expired, clear the flag
    clearProtectionFlag(flag);
    return false;
  }

  return true;
}

/**
 * Clear a protection flag atomically
 * Updates both cache and IndexedDB
 */
export function clearProtectionFlag(flag: ProtectionFlag): void {
  // Update cache immediately (synchronous)
  flagCache.delete(flag);
  logger.debug(`Cleared protection flag: ${flag}`);

  // Update IndexedDB asynchronously (fire and forget)
  (async () => {
    try {
      const store = await getStore('readwrite');

      return new Promise<void>((resolve, reject) => {
        const request = store.delete(flag);

        request.onsuccess = () => {
          logger.debug(`Deleted protection flag from IndexedDB: ${flag}`);
          broadcastFlagChange(flag, null);
          resolve();
        };

        request.onerror = () => {
          logger.error(`Failed to delete protection flag ${flag}:`, request.error);
          reject(request.error);
        };
      });
    } catch (err) {
      logger.error('Error deleting protection flag:', err);
      // Fallback: cache is still valid
    }
  })();
}

/**
 * Get remaining time on protection flag
 * Reads from in-memory cache (synchronous)
 * @returns milliseconds remaining, or 0 if not active
 */
export function getProtectionTimeRemaining(flag: ProtectionFlag): number {
  const flagData = flagCache.get(flag);

  if (!flagData || flagData.expiresAt === Infinity) {
    return 0;
  }

  const { expiresAt } = flagData;
  const now = Date.now();
  const remaining = expiresAt - now;

  return Math.max(0, remaining);
}

/**
 * Execute callback only if protection is NOT active
 * Sets protection flag before executing
 * @returns result of callback, or null if protection blocked execution
 */
export async function executeWithProtection<T>(
  flag: ProtectionFlag,
  callback: () => Promise<T>
): Promise<T | null> {
  if (isProtectionActive(flag)) {
    const remaining = getProtectionTimeRemaining(flag);
    logger.warn(`Protection flag ${flag} is active. ${Math.round(remaining / 1000)}s remaining.`);
    return null;
  }

  setProtectionFlag(flag);

  try {
    const result = await callback();
    return result;
  } finally {
    // Only clear flag after successful execution
    clearProtectionFlag(flag);
  }
}

/**
 * Clear all protection flags
 * Useful for cleanup/debugging
 */
export function clearAllProtectionFlags(): void {
  Object.keys(FLAG_CONFIGS).forEach(flag => {
    clearProtectionFlag(flag as ProtectionFlag);
  });
}

/**
 * Close the IndexedDB connection and cleanup resources
 * FIX #4: Proper cleanup prevents memory leaks
 * Useful in tests or when tearing down the app
 */
export function closeDB(): void {
  // Close BroadcastChannel if open
  if (broadcastChannel) {
    try {
      broadcastChannel.close();
      logger.debug('Closed BroadcastChannel');
    } catch (err) {
      logger.warn('Error closing BroadcastChannel:', err);
    }
    broadcastChannel = null;
  }

  // Close IndexedDB connection if open
  if (dbPromise) {
    dbPromise.then(db => {
      try {
        db.close();
        logger.debug('Closed IndexedDB connection');
      } catch (err) {
        logger.warn('Error closing IndexedDB:', err);
      }
    }).catch(err => {
      logger.error('Error accessing IndexedDB for cleanup:', err);
    });

    dbPromise = null;
  }

  // Clear cache
  flagCache.clear();
  logger.debug('Cleared protection flag cache');
}
