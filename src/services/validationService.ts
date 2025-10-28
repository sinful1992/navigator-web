// src/services/validationService.ts
// PHASE 2 Task 4: Centralized validation service for all entity and operation validation
// Provides type-safe validators for:
// - Core entities (Completion, Address, Arrangement, etc.)
// - Operations (sync operations, form data)
// - Form inputs (amounts, dates, strings)
// - Utility validators (timestamps, ranges, etc.)

import type {
  Completion,
  AddressRow,
  AppState,
  Arrangement,
  DaySession,
  Outcome,
  UserSubscription,
  ReminderSettings,
  BonusSettings,
} from '../types';
import type { SubmitOperation } from '../types/operations';
import type {
  ValidationResult,
  Validator,
} from '../types/validation';
import {
  ValidationSuccess,
  ValidationFailure,
  ValidationErrorCode,
} from '../types/validation';

/**
 * ============================================================================
 * TYPE GUARD VALIDATORS - Validate core entity types
 * ============================================================================
 */

/**
 * Validate a single completion entry
 * Ensures all required fields are present with correct types
 */
export function validateCompletion(value: unknown): ValidationResult<Completion> {
  if (!value || typeof value !== 'object') {
    return ValidationFailure('', ValidationErrorCode.INVALID_TYPE, 'Completion must be an object');
  }

  const obj = value as Record<string, unknown>;

  // Required field: index (number)
  if (typeof obj.index !== 'number' || obj.index < 0) {
    return ValidationFailure('index', ValidationErrorCode.INVALID_VALUE, 'Completion index must be a non-negative number');
  }

  // Required field: address (string)
  if (typeof obj.address !== 'string' || obj.address.trim().length === 0) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Completion address is required and must not be empty');
  }

  // Required field: outcome (one of valid outcomes)
  const validOutcomes = ['PIF', 'DA', 'Done', 'ARR'];
  if (typeof obj.outcome !== 'string' || !validOutcomes.includes(obj.outcome)) {
    return ValidationFailure('outcome', ValidationErrorCode.INVALID_VALUE, `Outcome must be one of: ${validOutcomes.join(', ')}`);
  }

  // Required field: timestamp (valid ISO string)
  if (typeof obj.timestamp !== 'string') {
    return ValidationFailure('timestamp', ValidationErrorCode.INVALID_TYPE, 'Completion timestamp must be a string');
  }

  if (isNaN(new Date(obj.timestamp).getTime())) {
    return ValidationFailure('timestamp', ValidationErrorCode.INVALID_FORMAT, 'Completion timestamp must be a valid ISO date string');
  }

  // All validations passed - cast to Completion
  return ValidationSuccess(value as Completion);
}

/**
 * Validate an address row (can be minimal - just address string)
 * Ensures address is present and non-empty
 */
export function validateAddressRow(value: unknown): ValidationResult<AddressRow> {
  if (!value || typeof value !== 'object') {
    return ValidationFailure('', ValidationErrorCode.INVALID_TYPE, 'Address must be an object');
  }

  const obj = value as Record<string, unknown>;

  // Required field: address (non-empty string)
  if (typeof obj.address !== 'string' || obj.address.trim().length === 0) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Address must be a non-empty string');
  }

  // Optional fields: lat, lng (numbers or null/undefined)
  if (obj.lat !== undefined && obj.lat !== null && typeof obj.lat !== 'number') {
    return ValidationFailure('lat', ValidationErrorCode.INVALID_TYPE, 'Latitude must be a number or null');
  }

  if (obj.lng !== undefined && obj.lng !== null && typeof obj.lng !== 'number') {
    return ValidationFailure('lng', ValidationErrorCode.INVALID_TYPE, 'Longitude must be a number or null');
  }

  return ValidationSuccess(value as AddressRow);
}

/**
 * Validate entire app state structure
 * Checks that all required arrays and fields are present
 */
export function validateAppState(value: unknown): ValidationResult<AppState> {
  if (!value || typeof value !== 'object') {
    return ValidationFailure('', ValidationErrorCode.INVALID_TYPE, 'App state must be an object');
  }

  const obj = value as Record<string, unknown>;

  // Required arrays
  if (!Array.isArray(obj.addresses)) {
    return ValidationFailure('addresses', ValidationErrorCode.INVALID_TYPE, 'addresses must be an array');
  }

  if (!Array.isArray(obj.completions)) {
    return ValidationFailure('completions', ValidationErrorCode.INVALID_TYPE, 'completions must be an array');
  }

  if (!Array.isArray(obj.daySessions)) {
    return ValidationFailure('daySessions', ValidationErrorCode.INVALID_TYPE, 'daySessions must be an array');
  }

  if (!Array.isArray(obj.arrangements)) {
    return ValidationFailure('arrangements', ValidationErrorCode.INVALID_TYPE, 'arrangements must be an array');
  }

  // Required fields
  if (obj.activeIndex !== null && typeof obj.activeIndex !== 'number') {
    return ValidationFailure('activeIndex', ValidationErrorCode.INVALID_TYPE, 'activeIndex must be a number or null');
  }

  if (typeof obj.currentListVersion !== 'number' || obj.currentListVersion < 1) {
    return ValidationFailure('currentListVersion', ValidationErrorCode.INVALID_VALUE, 'currentListVersion must be a positive number');
  }

  return ValidationSuccess(value as AppState);
}

/**
 * Validate an arrangement entry
 */
export function validateArrangement(value: unknown): ValidationResult<Arrangement> {
  if (!value || typeof value !== 'object') {
    return ValidationFailure('', ValidationErrorCode.INVALID_TYPE, 'Arrangement must be an object');
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    return ValidationFailure('id', ValidationErrorCode.REQUIRED, 'Arrangement ID is required');
  }

  if (typeof obj.address !== 'string' || obj.address.trim().length === 0) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Arrangement address is required');
  }

  if (typeof obj.scheduledDate !== 'string' || isNaN(new Date(obj.scheduledDate).getTime())) {
    return ValidationFailure('scheduledDate', ValidationErrorCode.INVALID_FORMAT, 'Scheduled date must be a valid ISO date');
  }

  if (typeof obj.createdAt !== 'string' || isNaN(new Date(obj.createdAt).getTime())) {
    return ValidationFailure('createdAt', ValidationErrorCode.INVALID_FORMAT, 'createdAt must be a valid ISO timestamp');
  }

  if (typeof obj.updatedAt !== 'string' || isNaN(new Date(obj.updatedAt).getTime())) {
    return ValidationFailure('updatedAt', ValidationErrorCode.INVALID_FORMAT, 'updatedAt must be a valid ISO timestamp');
  }

  return ValidationSuccess(value as Arrangement);
}

/**
 * Validate a day session entry
 */
export function validateDaySession(value: unknown): ValidationResult<DaySession> {
  if (!value || typeof value !== 'object') {
    return ValidationFailure('', ValidationErrorCode.INVALID_TYPE, 'Day session must be an object');
  }

  const obj = value as Record<string, unknown>;

  // Required field: date (YYYY-MM-DD format)
  if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) {
    return ValidationFailure('date', ValidationErrorCode.INVALID_FORMAT, 'Date must be in YYYY-MM-DD format');
  }

  // Required field: start (ISO timestamp)
  if (typeof obj.start !== 'string' || isNaN(new Date(obj.start).getTime())) {
    return ValidationFailure('start', ValidationErrorCode.INVALID_FORMAT, 'Start must be a valid ISO timestamp');
  }

  // Optional field: end (ISO timestamp or undefined)
  if (obj.end !== undefined && (typeof obj.end !== 'string' || isNaN(new Date(obj.end).getTime()))) {
    return ValidationFailure('end', ValidationErrorCode.INVALID_FORMAT, 'End must be a valid ISO timestamp or undefined');
  }

  // Optional field: durationSeconds (non-negative number)
  if (obj.durationSeconds !== undefined && (typeof obj.durationSeconds !== 'number' || obj.durationSeconds < 0)) {
    return ValidationFailure('durationSeconds', ValidationErrorCode.INVALID_VALUE, 'Duration must be a non-negative number of seconds');
  }

  return ValidationSuccess(value as DaySession);
}

/**
 * ============================================================================
 * OPERATION VALIDATORS - Validate sync operations
 * ============================================================================
 */

/**
 * Validate a submit operation (discriminated union of all operation types)
 */
export function validateSubmitOperation(value: unknown): ValidationResult<SubmitOperation> {
  if (!value || typeof value !== 'object') {
    return ValidationFailure('type', ValidationErrorCode.INVALID_TYPE, 'Operation must be an object');
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.type !== 'string') {
    return ValidationFailure('type', ValidationErrorCode.REQUIRED, 'Operation type is required');
  }

  if (obj.payload === undefined || obj.payload === null) {
    return ValidationFailure('payload', ValidationErrorCode.REQUIRED, 'Operation payload is required');
  }

  // Type-specific validation
  switch (obj.type) {
    case 'COMPLETION_CREATE':
      if (typeof (obj.payload as Record<string, unknown>).index !== 'number') {
        return ValidationFailure('payload.index', ValidationErrorCode.REQUIRED, 'Completion index is required');
      }
      break;

    case 'ADDRESS_IMPORT':
      if (!Array.isArray((obj.payload as Record<string, unknown>).addresses)) {
        return ValidationFailure('payload.addresses', ValidationErrorCode.REQUIRED, 'Addresses array is required');
      }
      break;

    case 'ARRANGEMENT_ADD':
    case 'ARRANGEMENT_UPDATE':
    case 'ARRANGEMENT_DELETE':
      if (typeof (obj.payload as Record<string, unknown>).id !== 'string') {
        return ValidationFailure('payload.id', ValidationErrorCode.REQUIRED, 'Arrangement ID is required');
      }
      break;

    default:
      // Unknown operation type - still valid, let downstream handle it
      break;
  }

  return ValidationSuccess(value as SubmitOperation);
}

/**
 * ============================================================================
 * FORM VALIDATORS - Validate form input fields
 * ============================================================================
 */

/**
 * Validate a monetary amount string
 * Must be a valid decimal number with optional currency symbol
 */
export function validateAmount(value: unknown): ValidationResult<number> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('amount', ValidationErrorCode.REQUIRED, 'Amount is required');
  }

  if (typeof value !== 'string') {
    return ValidationFailure('amount', ValidationErrorCode.INVALID_TYPE, 'Amount must be a string');
  }

  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[$£€¥\s]/g, '').trim();

  const num = parseFloat(cleaned);

  if (isNaN(num) || num < 0) {
    return ValidationFailure('amount', ValidationErrorCode.INVALID_FORMAT, 'Amount must be a valid positive number');
  }

  if (num === 0) {
    return ValidationFailure('amount', ValidationErrorCode.INVALID_VALUE, 'Amount must be greater than 0');
  }

  // Max amount check (e.g., 1 million)
  if (num > 1000000) {
    return ValidationFailure('amount', ValidationErrorCode.OUT_OF_RANGE, 'Amount cannot exceed £1,000,000');
  }

  return ValidationSuccess(num);
}

/**
 * Validate a date string (can be various formats)
 */
export function validateDate(value: unknown): ValidationResult<Date> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('date', ValidationErrorCode.REQUIRED, 'Date is required');
  }

  if (typeof value !== 'string') {
    return ValidationFailure('date', ValidationErrorCode.INVALID_TYPE, 'Date must be a string');
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return ValidationFailure('date', ValidationErrorCode.INVALID_FORMAT, 'Date must be a valid date string');
  }

  // Date must be in future or today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) {
    return ValidationFailure('date', ValidationErrorCode.INVALID_VALUE, 'Date must be today or in the future');
  }

  return ValidationSuccess(date);
}

/**
 * Validate an address string
 */
export function validateAddressString(value: unknown): ValidationResult<string> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Address is required');
  }

  if (typeof value !== 'string') {
    return ValidationFailure('address', ValidationErrorCode.INVALID_TYPE, 'Address must be a string');
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Address cannot be empty');
  }

  if (trimmed.length < 3) {
    return ValidationFailure('address', ValidationErrorCode.INVALID_VALUE, 'Address must be at least 3 characters');
  }

  if (trimmed.length > 500) {
    return ValidationFailure('address', ValidationErrorCode.OUT_OF_RANGE, 'Address cannot exceed 500 characters');
  }

  return ValidationSuccess(trimmed);
}

/**
 * Validate a string field (generic)
 */
export function validateString(value: unknown, fieldName: string, minLength = 1, maxLength = 1000): ValidationResult<string> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure(fieldName, ValidationErrorCode.REQUIRED, `${fieldName} is required`);
  }

  if (typeof value !== 'string') {
    return ValidationFailure(fieldName, ValidationErrorCode.INVALID_TYPE, `${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    return ValidationFailure(fieldName, ValidationErrorCode.INVALID_VALUE, `${fieldName} must be at least ${minLength} characters`);
  }

  if (trimmed.length > maxLength) {
    return ValidationFailure(fieldName, ValidationErrorCode.OUT_OF_RANGE, `${fieldName} cannot exceed ${maxLength} characters`);
  }

  return ValidationSuccess(trimmed);
}

/**
 * ============================================================================
 * UTILITY VALIDATORS - Validate common patterns
 * ============================================================================
 */

/**
 * Validate a timestamp string (ISO format)
 */
export function isValidTimestamp(timestamp: unknown): boolean {
  if (typeof timestamp !== 'string') return false;
  const time = new Date(timestamp).getTime();
  return !isNaN(time);
}

/**
 * Validate a timestamp is not too far in future (prevents clock skew attacks)
 */
export function isValidFutureTimestamp(timestamp: string, maxFutureMs = 24 * 60 * 60 * 1000): boolean {
  const time = new Date(timestamp).getTime();
  if (isNaN(time)) return false;

  const now = Date.now();
  return time <= now + maxFutureMs;
}

/**
 * Validate an array index is in bounds
 */
export function isValidIndex(index: unknown, arrayLength: number): boolean {
  return typeof index === 'number' && index >= 0 && index < arrayLength;
}

/**
 * Validate a number is within range
 */
export function isWithinRange(value: number, min: number, max: number): boolean {
  return typeof value === 'number' && value >= min && value <= max;
}

/**
 * Validate a value is one of allowed options
 */
export function isOneOf<T>(value: unknown, allowedValues: T[]): value is T {
  return allowedValues.includes(value as T);
}

/**
 * Validate a completion timestamp matches expected pattern
 * Completions should be timestamped when created
 */
export function isValidCompletionTimestamp(timestamp: unknown): boolean {
  if (!isValidTimestamp(timestamp)) return false;

  const time = new Date(timestamp as string).getTime();
  const now = Date.now();

  // Completion should not be from future (allow 5 min clock skew)
  return time <= now + 5 * 60 * 1000;
}

/**
 * Check if outcome is valid
 */
export function isValidOutcome(value: unknown): value is Outcome {
  return ['PIF', 'DA', 'Done', 'ARR'].includes(value as string);
}

/**
 * ============================================================================
 * BATCH VALIDATORS - Validate multiple items
 * ============================================================================
 */

/**
 * Validate an array of completions
 */
export function validateCompletionArray(value: unknown): ValidationResult<Completion[]> {
  if (!Array.isArray(value)) {
    return ValidationFailure('completions', ValidationErrorCode.INVALID_TYPE, 'Completions must be an array');
  }

  const validCompletions: Completion[] = [];
  const errors = [];

  for (let i = 0; i < value.length; i++) {
    const result = validateCompletion(value[i]);
    if (result.success) {
      validCompletions.push(result.data);
    } else {
      errors.push(...result.errors.map((e) => ({ ...e, field: `completions[${i}].${e.field}` })));
    }
  }

  return errors.length > 0
    ? { success: false, errors }
    : ValidationSuccess(validCompletions);
}

/**
 * Validate an array of addresses
 */
export function validateAddressArray(value: unknown): ValidationResult<AddressRow[]> {
  if (!Array.isArray(value)) {
    return ValidationFailure('addresses', ValidationErrorCode.INVALID_TYPE, 'Addresses must be an array');
  }

  const validAddresses: AddressRow[] = [];
  const errors = [];

  for (let i = 0; i < value.length; i++) {
    const result = validateAddressRow(value[i]);
    if (result.success) {
      validAddresses.push(result.data);
    } else {
      errors.push(...result.errors.map((e) => ({ ...e, field: `addresses[${i}].${e.field}` })));
    }
  }

  return errors.length > 0
    ? { success: false, errors }
    : ValidationSuccess(validAddresses);
}
