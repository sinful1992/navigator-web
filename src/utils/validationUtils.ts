// src/utils/validationUtils.ts - PHASE 2 Task 4: Validation utility consolidation
// Re-exports validators from centralized validationService
// Maintains backward compatibility while centralizing all validation logic

import type { AppState, Completion, AddressRow } from '../types';
import {
  validateCompletion as validateCompletionImpl,
  validateAddressRow as validateAddressRowImpl,
  validateAppState as validateAppStateImpl,
} from '../services/validationService';

// ============================================================================
// TYPE GUARDS - Re-export from validationService with backward-compatible signatures
// ============================================================================

/**
 * Type guard: Check if object is a valid Completion
 * Backward-compatible wrapper around validationService validator
 */
export function validateCompletion(c: unknown): c is Completion {
  const result = validateCompletionImpl(c);
  return result.success;
}

/**
 * Type guard: Check if object is a valid AddressRow
 * Backward-compatible wrapper around validationService validator
 */
export function validateAddressRow(a: unknown): a is AddressRow {
  const result = validateAddressRowImpl(a);
  return result.success;
}

/**
 * Type guard: Check if object is a valid AppState
 * Backward-compatible wrapper around validationService validator
 */
export function validateAppState(state: unknown): state is AppState {
  const result = validateAppStateImpl(state);
  return result.success;
}

// ============================================================================
// DATA TRANSFORMATION - Keep existing functions for backward compatibility
// ============================================================================

/**
 * Add listVersion to completions, defaulting to provided version
 * Used when loading completions from storage
 */
export function stampCompletionsWithVersion(
  completions: unknown[] | undefined,
  version: number
): Completion[] {
  const src = Array.isArray(completions) ? completions : [];
  return src
    .filter(validateCompletion)
    .map((c: Completion) => ({
      ...c,
      listVersion: typeof c?.listVersion === "number" ? c.listVersion : version,
    }));
}

/**
 * Generate a deterministic operation ID from type, entity, and data
 * Used for idempotency tracking
 */
export function generateOperationId(type: string, entity: string, data: unknown): string {
  const key = `${type}_${entity}_${JSON.stringify(data).slice(0, 50)}_${Date.now()}`;
  // Use encodeURIComponent to handle Unicode characters before base64 encoding
  const unicodeSafeKey = encodeURIComponent(key);
  return btoa(unicodeSafeKey).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

// ============================================================================
// EXPORTS - Re-export all validators from validationService for direct use
// ============================================================================

// Type guard validators
export {
  validateCompletion as validateCompletionWithResult,
  validateAddressRow as validateAddressRowWithResult,
  validateAppState as validateAppStateWithResult,
  validateArrangement,
  validateDaySession,
} from '../services/validationService';

// Operation validators
export {
  validateSubmitOperation,
} from '../services/validationService';

// Form validators
export {
  validateAmount,
  validateDate,
  validateAddressString,
  validateString,
} from '../services/validationService';

// Utility validators
export {
  isValidTimestamp,
  isValidFutureTimestamp,
  isValidIndex,
  isWithinRange,
  isOneOf,
  isValidCompletionTimestamp,
  isValidOutcome,
} from '../services/validationService';

// Batch validators
export {
  validateCompletionArray,
  validateAddressArray,
} from '../services/validationService';
