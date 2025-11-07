// src/constants/businessConstants.ts
// PHASE 2 Task 5: Centralized business logic constants
// Thresholds, limits, and business rules extracted from scattered magic numbers

/**
 * ============================================================================
 * FINANCIAL LIMITS & THRESHOLDS
 * ============================================================================
 */

/** Maximum arrangement amount (£) */
export const MAX_ARRANGEMENT_AMOUNT = 1_000_000;

/** Maximum single payment amount (£) */
export const MAX_PAYMENT_AMOUNT = 1_000_000;

/** Minimum arrangement amount (£) */
export const MIN_ARRANGEMENT_AMOUNT = 0.01;

/** Minimum payment amount (£) */
export const MIN_PAYMENT_AMOUNT = 0.01;

/** Maximum number of cases per arrangement */
export const MAX_CASES_PER_ARRANGEMENT = 100;

/**
 * ============================================================================
 * COMPLETION VALIDATION RULES
 * ============================================================================
 */

/** Duplicate completion detection window (ms) - Prevent submitting same address twice in quick succession */
export const DUPLICATE_COMPLETION_DETECTION_WINDOW_MS = 30 * 1000; // 30 seconds

/** Memory cleanup period for recent completions tracking (ms) */
export const RECENT_COMPLETIONS_CLEANUP_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ============================================================================
 * ADDRESS VALIDATION RULES
 * ============================================================================
 */

/** Minimum address length (characters) */
export const MIN_ADDRESS_LENGTH = 3;

/** Maximum address length (characters) */
export const MAX_ADDRESS_LENGTH = 500;

/** Maximum number of addresses per list (safety limit) */
export const MAX_ADDRESSES_PER_LIST = 10_000;

/**
 * ============================================================================
 * ARRANGEMENT RULES
 * ============================================================================
 */

/** Default number of installment payments */
export const DEFAULT_INSTALLMENT_COUNT = 4;

/** Maximum number of installment payments */
export const MAX_INSTALLMENT_COUNT = 52; // One year of weekly

/** Valid recurrence intervals (days) */
export const VALID_RECURRENCE_INTERVALS = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
} as const;

/**
 * ============================================================================
 * STORAGE & PERFORMANCE LIMITS
 * ============================================================================
 */

/** Maximum concurrent operations before queuing */
export const MAX_CONCURRENT_OPERATIONS = 5;

/** Maximum operation queue size */
export const MAX_OPERATION_QUEUE_SIZE = 1000;

/** Batch size for processing operations */
export const OPERATION_BATCH_SIZE = 100;

/**
 * ============================================================================
 * DATA VALIDATION RULES
 * ============================================================================
 */

/** Valid completion outcomes */
export const VALID_OUTCOMES = ['PIF', 'DA', 'Done', 'ARR'] as const;

/** Valid subscription statuses */
export const VALID_SUBSCRIPTION_STATUSES = ['active', 'trial', 'expired', 'cancelled'] as const;

/** Valid arrangement statuses */
export const VALID_ARRANGEMENT_STATUSES = ['Scheduled', 'Confirmed', 'Cancelled', 'Completed', 'Missed'] as const;

/**
 * ============================================================================
 * PAGINATION & DISPLAY LIMITS
 * ============================================================================
 */

/** Default page size for list pagination */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum items to display in a list before pagination */
export const MAX_VISIBLE_ITEMS_PER_PAGE = 100;

/** Truncate long strings to this length in UI */
export const MAX_DISPLAY_STRING_LENGTH = 100;

/**
 * ============================================================================
 * VERSION TRACKING
 * ============================================================================
 */

/** Initial app state schema version */
export const INITIAL_SCHEMA_VERSION = 5;

/** Current app state schema version */
export const CURRENT_SCHEMA_VERSION = 5;

/**
 * ============================================================================
 * TIME TRACKING RULES
 * ============================================================================
 */

/** Minimum time to track on an address (seconds) */
export const MIN_TIME_TRACKING_SECONDS = 1;

/** Maximum reasonable time tracking per address (hours) */
export const MAX_TIME_TRACKING_HOURS = 24;

/** Maximum time tracking in seconds */
export const MAX_TIME_TRACKING_SECONDS = MAX_TIME_TRACKING_HOURS * 60 * 60;

/**
 * ============================================================================
 * USER PREFERENCES & SETTINGS
 * ============================================================================
 */

/** PWA install prompt dismissal duration (days) */
export const PWA_DISMISS_DURATION_DAYS = 7;

/** Default reminder schedule (days before payment) */
export const DEFAULT_REMINDER_DAYS = [3, 1, 0] as const; // 3 days, 1 day, day of
