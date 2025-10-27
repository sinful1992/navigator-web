/**
 * Sync Configuration Constants
 *
 * This file contains tunable parameters for the sync system.
 * Changing these values affects data integrity, performance, and network behavior.
 * Each constant has documented rationale and impact analysis.
 */

/**
 * PHASE 1.1.2 FIX: Sequence Corruption Detection Threshold
 *
 * Maximum allowed gap between local max sequence and cloud max sequence
 * Before marking cloud as corrupted.
 *
 * Rationale:
 * - Legitimate gaps occur when multiple devices create operations
 * - A 5-device setup with 2000 ops each = 10,000 gap
 * - Only flag as corrupted if gap is UNREASONABLY large (>10k)
 * - Also requires localMaxSeq > 100 (don't flag brand new devices)
 *
 * History:
 * - v1: 1000 (too aggressive, caused false positives)
 * - v2: 10000 (current, allows legitimate multi-device gaps)
 * - v3: Could use adaptive threshold based on operation count
 *
 * Impact if changed:
 * - Too low: False positives, skip legitimate syncs
 * - Too high: Miss actual corruption, poison sequence generator
 *
 * Recommendation: Only increase if you have 10+ devices actively syncing
 */
export const SEQUENCE_CORRUPTION_THRESHOLD = 10000;

/**
 * PHASE 1: Multi-Device Protection Window
 *
 * How long to prevent sync after completing an address (milliseconds).
 * Prevents duplicate completion race condition between devices.
 *
 * Scenario:
 * - Device A completes address, sets protection flag
 * - Device B completes same address shortly after
 * - If protection expires before sync, Device B doesn't see Device A's completion
 * - Results in duplicate completion record
 *
 * Current value: 30000ms (30 seconds)
 * Phase 1.2: Plan to increase to 120000ms (2 minutes) or use vector clocks
 *
 * Trade-off:
 * - Higher = safer but blocks syncing longer
 * - Lower = riskier but faster response
 *
 * Real-world: Most completions 1-2 seconds apart, so 30s is safe
 * High-throughput: If completing 1 address/sec, need to increase
 */
export const PROTECTION_WINDOW_MS = 30000;

/**
 * PHASE 1: Operation Log Retention
 *
 * How many days to keep operations in the local log.
 * Older operations are compacted (removed) to prevent unbounded growth.
 *
 * Recommendation: Keep at least 30 days
 * - Users may work offline for weeks
 * - Cloud retention is separate (handled by server)
 * - Memory impact: 1000 operations ≈ 200KB
 *
 * Current: 30 days
 * If storage is constrained: Reduce to 14 days
 * If users work offline frequently: Increase to 60+ days
 */
export const OPERATION_LOG_RETENTION_DAYS = 30;

/**
 * PHASE 1.1.3: Per-Client Sequence Tracking
 *
 * Enable per-client sequence tracking to detect out-of-order operations.
 * Helps identify which device had the issue.
 *
 * Current: true (enabled by default, feature is fully implemented)
 * Tracks highest sequence number per device, logs out-of-order warnings
 * Enabled in Phase 1.1.3 and fully integrated in operation merge
 */
export const ENABLE_PER_CLIENT_SEQUENCE_TRACKING = true;

/**
 * PHASE 1.1.4: Continuous Sequence Validation
 *
 * Enable validation of sequence continuity on every merge.
 * Logs errors if gaps detected (indicates lost operations).
 * Sequence gaps = data loss, must be detected early.
 *
 * Current: true (enabled by default, critical for data integrity)
 * Impact: Negligible performance cost (<1ms per 1000 ops)
 * Benefits: Catches data loss immediately, enables early debugging
 *
 * Rationale:
 * - Gaps in sequence numbers indicate operations were lost or not synced
 * - Could be from network issues, device crashes, or sync bugs
 * - Better to detect and log than silently lose data
 * - Performance impact is negligible (just a sort + linear scan)
 */
export const ENABLE_SEQUENCE_CONTINUITY_VALIDATION = true;

/**
 * PHASE 1.2: Vector Clock Implementation
 *
 * Enable vector clock-based conflict detection.
 * Prevents duplicate completions using causality tracking.
 *
 * Current: false (planned for Phase 1.2.1)
 * Impact: ~5% performance overhead for clock updates
 * Benefit: Eliminates duplicate completion race condition
 */
export const ENABLE_VECTOR_CLOCKS = false;

/**
 * PHASE 1.2: IndexedDB for Protection Flags
 *
 * Use IndexedDB for atomic protection flag storage.
 * Prevents race conditions between tabs/workers.
 *
 * Current: false (still using localStorage)
 * Migration: Planned for Phase 1.2.2
 * Impact: More reliable multi-tab support
 */
export const USE_INDEXED_DB_FOR_FLAGS = false;

/**
 * Sync Throttling
 *
 * Minimum milliseconds between consecutive sync attempts.
 * Prevents spamming the server with sync requests.
 *
 * Current: 2000ms (2 seconds)
 * Trade-off:
 * - Higher = less server load but slower sync
 * - Lower = faster sync but more network traffic
 *
 * Recommendation: 2-5 seconds for most use cases
 * For high-frequency apps: 1000ms
 * For battery-constrained: 10000ms
 */
export const SYNC_THROTTLE_MS = 2000;

/**
 * Bootstrap Timeout
 *
 * How long to wait for initial sync before proceeding offline.
 * Long bootstrap delays the app startup.
 *
 * Current: 10000ms (10 seconds)
 * Recommendation: 5-15 seconds
 * - Slow network: 20000ms
 * - Fast network: 5000ms
 * - Offline-first priority: 2000ms (fail fast)
 */
export const BOOTSTRAP_TIMEOUT_MS = 10000;

/**
 * MAX_OPERATIONS_IN_LOG
 *
 * Hard limit on number of operations to keep in memory.
 * Prevents memory exhaustion.
 *
 * Current: 100000 operations
 * Impact:
 * - ~20MB of memory for 100k operations
 * - Hitting limit triggers compaction
 * - Older operations deleted (but synced to cloud)
 *
 * Recommendation: 50k-200k depending on device memory
 * - Mobile: 50k
 * - Desktop: 200k
 * - Tablets: 100k
 */
export const MAX_OPERATIONS_IN_LOG = 100000;

/**
 * Network Retry Configuration
 *
 * How to handle transient network errors.
 * Automatic retry with exponential backoff.
 */
export const NETWORK_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Validation Summary
 *
 * Use this to check configuration consistency:
 */
export function validateSyncConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (SEQUENCE_CORRUPTION_THRESHOLD < 1000) {
    errors.push('SEQUENCE_CORRUPTION_THRESHOLD too low - will cause false positives');
  }

  if (PROTECTION_WINDOW_MS < 5000) {
    errors.push('PROTECTION_WINDOW_MS too low - insufficient protection from duplicates');
  }

  if (OPERATION_LOG_RETENTION_DAYS < 7) {
    errors.push('OPERATION_LOG_RETENTION_DAYS too low - operations pruned too aggressively');
  }

  if (SYNC_THROTTLE_MS < 500) {
    errors.push('SYNC_THROTTLE_MS too low - excessive server load');
  }

  if (BOOTSTRAP_TIMEOUT_MS < 1000) {
    errors.push('BOOTSTRAP_TIMEOUT_MS too low - app may start offline unnecessarily');
  }

  if (MAX_OPERATIONS_IN_LOG < 1000) {
    errors.push('MAX_OPERATIONS_IN_LOG too low - insufficient operation buffering');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Environment-Specific Overrides
 *
 * Customize configuration per environment:
 */
export function getEnvironmentConfig(): Record<string, any> {
  const isDev = process.env.NODE_ENV === 'development';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return {
    // Development: More aggressive validation for debugging
    ...(isDev && {
      ENABLE_SEQUENCE_CONTINUITY_VALIDATION: true,
      ENABLE_PER_CLIENT_SEQUENCE_TRACKING: true,
      SYNC_THROTTLE_MS: 1000,
    }),

    // Mobile: Conservative resources
    ...(isMobile && {
      MAX_OPERATIONS_IN_LOG: 50000,
      PROTECTION_WINDOW_MS: 60000, // More time for slow networks
      OPERATION_LOG_RETENTION_DAYS: 14,
    }),
  };
}
