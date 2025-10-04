// src/utils/protectionFlags.ts
// Centralized protection flag manager to prevent race conditions

type ProtectionFlag =
  | 'navigator_restore_in_progress'
  | 'navigator_import_in_progress'
  | 'navigator_active_protection';

const FLAG_CONFIGS: Record<ProtectionFlag, number> = {
  'navigator_restore_in_progress': 30000, // 30 seconds
  'navigator_import_in_progress': 6000,   // 6 seconds
  'navigator_active_protection': 5000     // 5 seconds
};

/**
 * Set a protection flag with timestamp
 * @returns timestamp when flag was set
 */
export function setProtectionFlag(flag: ProtectionFlag): number {
  const now = Date.now();
  localStorage.setItem(flag, now.toString());
  return now;
}

/**
 * Check if protection flag is active (within timeout window)
 * @param flag - Protection flag to check
 * @param customMinTimeout - Optional custom minimum timeout in ms (flag must be older than this)
 * @returns true if protection is active, false otherwise
 */
export function isProtectionActive(flag: ProtectionFlag, customMinTimeout?: number): boolean {
  const stored = localStorage.getItem(flag);
  if (!stored) return false;

  const timestamp = parseInt(stored, 10);
  if (isNaN(timestamp)) {
    // Corrupted flag, clear it
    clearProtectionFlag(flag);
    return false;
  }

  const timeout = FLAG_CONFIGS[flag];
  const elapsed = Date.now() - timestamp;

  // If custom minimum timeout is specified, flag must be older than that to be considered active
  if (customMinTimeout !== undefined && elapsed < customMinTimeout) {
    return true; // Still in waiting period
  }

  if (elapsed >= timeout) {
    // Timeout expired, clear the flag
    clearProtectionFlag(flag);
    return false;
  }

  return true;
}

/**
 * Clear a protection flag
 */
export function clearProtectionFlag(flag: ProtectionFlag): void {
  localStorage.removeItem(flag);
}

/**
 * Get remaining time on protection flag
 * @returns milliseconds remaining, or 0 if not active
 */
export function getProtectionTimeRemaining(flag: ProtectionFlag): number {
  const stored = localStorage.getItem(flag);
  if (!stored) return 0;

  const timestamp = parseInt(stored, 10);
  if (isNaN(timestamp)) return 0;

  const timeout = FLAG_CONFIGS[flag];
  const elapsed = Date.now() - timestamp;
  const remaining = timeout - elapsed;

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
    console.warn(`Protection flag ${flag} is active. ${Math.round(remaining / 1000)}s remaining.`);
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
 * Clear all protection flags (useful for cleanup/debugging)
 */
export function clearAllProtectionFlags(): void {
  Object.keys(FLAG_CONFIGS).forEach(flag => {
    clearProtectionFlag(flag as ProtectionFlag);
  });
}
