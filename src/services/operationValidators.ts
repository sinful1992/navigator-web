// src/services/operationValidators.ts
// PHASE 2 Task 4 Phase 2: Extract operation validators from operationSync
// Provides type-safe validation for all operation types with detailed error messages

import type { ValidationResult } from '../types/validation';
import {
  ValidationSuccess,
  ValidationFailure,
  ValidationErrorCode,
} from '../types/validation';

/**
 * Sync operation type - from operationSync context
 * Note: This is the transport/storage format for operations
 */
export type SyncOperation = {
  id: string;
  timestamp: string;
  clientId: string;
  sequence: number;
  type: string;
  payload: Record<string, unknown>;
};

/**
 * Validate a complete sync operation (used in operationSync.ts)
 * Checks all required base fields and type-specific payloads
 */
export function validateSyncOperation(operation: unknown): ValidationResult<SyncOperation> {
  // Type check
  if (!operation || typeof operation !== 'object') {
    return ValidationFailure('', ValidationErrorCode.INVALID_TYPE, 'Operation must be an object');
  }

  const op = operation as Record<string, unknown>;

  // Required: id (non-empty string)
  if (typeof op.id !== 'string' || !op.id.trim()) {
    return ValidationFailure('id', ValidationErrorCode.REQUIRED, 'Operation ID must be a non-empty string');
  }

  // Required: timestamp (ISO string)
  if (typeof op.timestamp !== 'string' || !op.timestamp.trim()) {
    return ValidationFailure('timestamp', ValidationErrorCode.REQUIRED, 'Operation timestamp is required');
  }

  const opTime = new Date(op.timestamp).getTime();
  if (isNaN(opTime)) {
    return ValidationFailure('timestamp', ValidationErrorCode.INVALID_FORMAT, 'Operation timestamp must be a valid ISO date string');
  }

  // BEST PRACTICE: Check for clock skew (reduced from 24h to 5min)
  const now = Date.now();
  const maxFutureMs = 5 * 60 * 1000; // 5 minutes

  if (opTime > now + maxFutureMs) {
    return ValidationFailure(
      'timestamp',
      ValidationErrorCode.CLOCK_SKEW,
      'Operation timestamp too far in future (clock skew attack?)',
      { maxFutureMs, received: opTime, now }
    );
  }

  // BEST PRACTICE: Check for operations from distant past (replay attack prevention)
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  if (opTime < now - maxAgeMs) {
    return ValidationFailure(
      'timestamp',
      ValidationErrorCode.CLOCK_SKEW,
      'Operation timestamp too old (>30 days) - possible replay attack',
      { maxAgeMs, received: opTime, now, ageMs: now - opTime }
    );
  }

  // Required: clientId (non-empty string)
  if (typeof op.clientId !== 'string' || !op.clientId.trim()) {
    return ValidationFailure('clientId', ValidationErrorCode.REQUIRED, 'Client ID must be a non-empty string');
  }

  // Required: sequence (non-negative integer)
  if (!Number.isInteger(op.sequence) || (op.sequence as number) < 0) {
    return ValidationFailure('sequence', ValidationErrorCode.INVALID_VALUE, 'Sequence must be a non-negative integer');
  }

  // Required: type (non-empty string)
  if (typeof op.type !== 'string' || !op.type.trim()) {
    return ValidationFailure('type', ValidationErrorCode.REQUIRED, 'Operation type is required');
  }

  // Required: payload (non-empty object)
  if (!op.payload || typeof op.payload !== 'object') {
    return ValidationFailure('payload', ValidationErrorCode.REQUIRED, 'Operation payload is required and must be an object');
  }

  // Type-specific payload validation
  const typeValidationResult = validateOperationTypePayload(op.type as string, op.payload as Record<string, unknown>);
  if (!typeValidationResult.success) {
    return typeValidationResult;
  }

  return ValidationSuccess(op as SyncOperation);
}

/**
 * Validate operation-type-specific payloads
 * Handles COMPLETION_CREATE, COMPLETION_UPDATE, ADDRESS_BULK_IMPORT, etc.
 */
function validateOperationTypePayload(type: string, payload: Record<string, unknown>): ValidationResult<void> {
  switch (type) {
    case 'COMPLETION_CREATE':
      return validateCompletionCreatePayload(payload);

    case 'COMPLETION_UPDATE':
      return validateCompletionUpdatePayload(payload);

    case 'COMPLETION_DELETE':
      return validateCompletionDeletePayload(payload);

    case 'ADDRESS_BULK_IMPORT':
      return validateAddressBulkImportPayload(payload);

    case 'ADDRESS_ADD':
      return validateAddressAddPayload(payload);

    case 'SESSION_START':
    case 'SESSION_END':
    case 'SESSION_UPDATE':
      return ValidationSuccess(undefined);

    case 'ARRANGEMENT_CREATE':
      return validateArrangementCreatePayload(payload);

    case 'ARRANGEMENT_UPDATE':
      return validateArrangementUpdatePayload(payload);

    case 'ARRANGEMENT_DELETE':
      return validateArrangementDeletePayload(payload);

    case 'ACTIVE_INDEX_SET':
      return validateActiveIndexSetPayload(payload);

    case 'SETTINGS_UPDATE_SUBSCRIPTION':
    case 'SETTINGS_UPDATE_REMINDER':
    case 'SETTINGS_UPDATE_BONUS':
      return ValidationSuccess(undefined);

    default:
      return ValidationFailure('type', ValidationErrorCode.INVALID_VALUE, `Unknown operation type: ${type}`);
  }
}

/**
 * Validate COMPLETION_CREATE payload
 * Required: completion object with timestamp and index
 */
function validateCompletionCreatePayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.completion || typeof payload.completion !== 'object') {
    return ValidationFailure('completion', ValidationErrorCode.REQUIRED, 'COMPLETION_CREATE: completion object is required');
  }

  const completion = payload.completion as Record<string, unknown>;

  if (!completion.timestamp || typeof completion.timestamp !== 'string') {
    return ValidationFailure('completion.timestamp', ValidationErrorCode.REQUIRED, 'COMPLETION_CREATE: completion timestamp is required');
  }

  if (!Number.isInteger(completion.index) || (completion.index as number) < 0) {
    return ValidationFailure('completion.index', ValidationErrorCode.REQUIRED, 'COMPLETION_CREATE: completion index must be a non-negative integer');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate COMPLETION_UPDATE payload
 * Required: originalTimestamp and updates object
 */
function validateCompletionUpdatePayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.originalTimestamp || typeof payload.originalTimestamp !== 'string') {
    return ValidationFailure('originalTimestamp', ValidationErrorCode.REQUIRED, 'COMPLETION_UPDATE: originalTimestamp is required');
  }

  if (!payload.updates || typeof payload.updates !== 'object') {
    return ValidationFailure('updates', ValidationErrorCode.REQUIRED, 'COMPLETION_UPDATE: updates object is required');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate COMPLETION_DELETE payload
 * Required: timestamp and index
 */
function validateCompletionDeletePayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.timestamp || typeof payload.timestamp !== 'string') {
    return ValidationFailure('timestamp', ValidationErrorCode.REQUIRED, 'COMPLETION_DELETE: timestamp is required');
  }

  if (!Number.isInteger(payload.index) || (payload.index as number) < 0) {
    return ValidationFailure('index', ValidationErrorCode.INVALID_VALUE, 'COMPLETION_DELETE: index must be a non-negative integer');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate ADDRESS_BULK_IMPORT payload
 * Required: addresses array and newListVersion
 */
function validateAddressBulkImportPayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!Array.isArray(payload.addresses)) {
    return ValidationFailure('addresses', ValidationErrorCode.REQUIRED, 'ADDRESS_BULK_IMPORT: addresses must be an array');
  }

  if (!Number.isInteger(payload.newListVersion) || (payload.newListVersion as number) < 1) {
    return ValidationFailure('newListVersion', ValidationErrorCode.INVALID_VALUE, 'ADDRESS_BULK_IMPORT: newListVersion must be a positive integer');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate ADDRESS_ADD payload
 * Required: address object
 */
function validateAddressAddPayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.address || typeof payload.address !== 'object') {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'ADDRESS_ADD: address object is required');
  }

  const address = payload.address as Record<string, unknown>;

  if (typeof address.address !== 'string' || !address.address.trim()) {
    return ValidationFailure('address.address', ValidationErrorCode.REQUIRED, 'ADDRESS_ADD: address string is required and must not be empty');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate ARRANGEMENT_CREATE payload
 * Required: arrangement object
 */
function validateArrangementCreatePayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.arrangement || typeof payload.arrangement !== 'object') {
    return ValidationFailure('arrangement', ValidationErrorCode.REQUIRED, 'ARRANGEMENT_CREATE: arrangement object is required');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate ARRANGEMENT_UPDATE payload
 * Required: id and updates object
 */
function validateArrangementUpdatePayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.id || typeof payload.id !== 'string') {
    return ValidationFailure('id', ValidationErrorCode.REQUIRED, 'ARRANGEMENT_UPDATE: arrangement ID is required');
  }

  if (!payload.updates || typeof payload.updates !== 'object') {
    return ValidationFailure('updates', ValidationErrorCode.REQUIRED, 'ARRANGEMENT_UPDATE: updates object is required');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate ARRANGEMENT_DELETE payload
 * Required: id
 */
function validateArrangementDeletePayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!payload.id || typeof payload.id !== 'string') {
    return ValidationFailure('id', ValidationErrorCode.REQUIRED, 'ARRANGEMENT_DELETE: arrangement ID is required');
  }

  return ValidationSuccess(undefined);
}

/**
 * Validate ACTIVE_INDEX_SET payload
 * Required: index field (can be null)
 */
function validateActiveIndexSetPayload(payload: Record<string, unknown>): ValidationResult<void> {
  if (!('index' in payload)) {
    return ValidationFailure('index', ValidationErrorCode.REQUIRED, 'ACTIVE_INDEX_SET: index field is required');
  }

  return ValidationSuccess(undefined);
}
