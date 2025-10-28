// src/constants/timeConstants.ts
// PHASE 2 Task 5: Centralized time and duration constants
// Extracted from scattered magic number usage throughout the codebase

/**
 * ============================================================================
 * MILLISECOND CONSTANTS - Base time units converted to milliseconds
 * ============================================================================
 */

// Base millisecond conversions
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * ============================================================================
 * SYNC & NETWORK TIMEOUTS
 * ============================================================================
 */

/** Debounce delay for state persistence to storage (ms) */
export const STATE_PERSISTENCE_DEBOUNCE_MS = 150;

/** Sync window for operations before they're considered stale (ms) */
export const SYNC_WINDOW_MS = 10 * 1000; // 10 seconds

/** Minimum threshold between periodic backups */
export const PERIODIC_BACKUP_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

/** Timeout for marking sync as recent */
export const RECENT_SYNC_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/** Maximum allowed future timestamp before rejecting operation (clock skew protection) */
export const MAX_FUTURE_TIMESTAMP_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * ============================================================================
 * DATA RETENTION & CLEANUP TIMEOUTS
 * ============================================================================
 */

/** TTL for tracking recent completions (prevent double-submission) */
export const COMPLETION_TRACKING_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Time to keep change tracking data (ms) */
export const CHANGE_TRACKER_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum age for recent activity tracking (ms) */
export const RECENT_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * ============================================================================
 * OPTIMISTIC UPDATE CLEANUP
 * ============================================================================
 */

/** Time before deleting confirmed optimistic updates from state */
export const CONFIRMED_UPDATE_CLEANUP_DELAY_MS = 5000; // 5 seconds

/** Time before deleting reverted optimistic updates from state */
export const REVERTED_UPDATE_CLEANUP_DELAY_MS = 1000; // 1 second

/**
 * ============================================================================
 * DATA CACHING DURATIONS
 * ============================================================================
 */

/** Google Maps geocoding cache duration (ms) */
export const GEOCODING_CACHE_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Google Places autocomplete cache duration (ms) */
export const PLACES_AUTOCOMPLETE_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Google Places details cache duration (ms) */
export const PLACES_DETAILS_CACHE_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * ============================================================================
 * UI REFRESH & POLLING INTERVALS
 * ============================================================================
 */

/** Time tracking display update interval (ms) */
export const ACTIVE_TIME_DISPLAY_UPDATE_INTERVAL_MS = 1000; // 1 second

/**
 * ============================================================================
 * PROTECTION FLAG TIMEOUTS
 * ============================================================================
 */

/** Protection flag timeout for sync operations during import */
export const ADDRESS_IMPORT_PROTECTION_TIMEOUT_MS = 2000; // 2 seconds

/** Protection flag timeout for active address tracking - NEVER EXPIRES during active session */
export const ACTIVE_ADDRESS_PROTECTION_TIMEOUT_MS = Infinity; // Never auto-clears

/**
 * ============================================================================
 * BACKUP & RESTORE TIMEOUTS
 * ============================================================================
 */

/** Backup retention window (older backups cleaned up) */
export const BACKUP_RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * ============================================================================
 * DEBOUNCE & THROTTLE DELAYS
 * ============================================================================
 */

/** Debounce for form input validation (ms) */
export const FORM_INPUT_DEBOUNCE_MS = 500;

/** Throttle for window resize events (ms) */
export const WINDOW_RESIZE_THROTTLE_MS = 150;

/** Debounce for search input (ms) */
export const SEARCH_DEBOUNCE_MS = 300;
