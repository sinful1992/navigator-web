// src/types/validation.ts
// PHASE 2 Task 4: Centralized validation types and error reporting
// Provides unified structure for all validation operations

/**
 * Standard validation error codes
 * Used consistently across all validators
 */
export const ValidationErrorCode = {
  REQUIRED: 'REQUIRED',
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_FORMAT: 'INVALID_FORMAT',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  INVALID_VALUE: 'INVALID_VALUE',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
  CLOCK_SKEW: 'CLOCK_SKEW',
  INVALID_STATE: 'INVALID_STATE',
  CUSTOM: 'CUSTOM',
} as const;

export type ValidationErrorCode = typeof ValidationErrorCode[keyof typeof ValidationErrorCode];

/**
 * Validation error with field, code, and message
 * Enables structured error reporting and easy localization
 */
export type ValidationError = {
  /** Field name that failed validation (e.g., 'email', 'amount', 'addresses[0].address') */
  field: string;
  /** Standard error code for programmatic handling */
  code: ValidationErrorCode | string;
  /** User-friendly error message */
  message: string;
  /** Additional context about the error (e.g., min/max values, constraints) */
  metadata?: Record<string, unknown>;
};

/**
 * Validation result - either success with data or failure with errors
 * This is a Result<T> / Either pattern for type-safe error handling
 *
 * @template T - The type of data if validation succeeds
 */
export type ValidationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/**
 * Helper to create a success result
 */
export function ValidationSuccess<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}

/**
 * Helper to create a failure result with single error
 */
export function ValidationFailure<T>(
  field: string,
  code: ValidationErrorCode | string,
  message: string,
  metadata?: Record<string, unknown>
): ValidationResult<T> {
  return {
    success: false,
    errors: [{ field, code, message, metadata }],
  };
}

/**
 * Helper to create a failure result with multiple errors
 */
export function ValidationFailureMultiple<T>(
  errors: ValidationError[]
): ValidationResult<T> {
  return { success: false, errors };
}

/**
 * Validator function type - validates unknown value and returns typed result
 *
 * @template T - The type after successful validation
 */
export type Validator<T = unknown> = (value: unknown) => ValidationResult<T>;

/**
 * Composite validator - combines multiple validators with AND logic
 * All validators must pass for composite to pass
 */
export function combineValidators<T>(...validators: Validator<T>[]): Validator<T> {
  return (value: unknown): ValidationResult<T> => {
    const allErrors: ValidationError[] = [];

    for (const validator of validators) {
      const result = validator(value);
      if (!result.success) {
        allErrors.push(...result.errors);
      }
    }

    return allErrors.length > 0
      ? { success: false, errors: allErrors }
      : (validators[validators.length - 1](value) as ValidationResult<T>);
  };
}

/**
 * Chain validators - applies validators in sequence, short-circuits on first failure
 */
export function chainValidators<T>(...validators: Validator<T>[]): Validator<T> {
  return (value: unknown): ValidationResult<T> => {
    for (const validator of validators) {
      const result = validator(value);
      if (!result.success) {
        return result;
      }
    }

    return validators.length > 0
      ? (validators[validators.length - 1](value) as ValidationResult<T>)
      : ValidationSuccess(value as T);
  };
}

/**
 * Map validator result - transforms the data if validation succeeds
 */
export function mapValidationResult<T, U>(
  result: ValidationResult<T>,
  mapper: (data: T) => U
): ValidationResult<U> {
  if (result.success) {
    try {
      return ValidationSuccess(mapper(result.data));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return ValidationFailure<U>('_mapper', ValidationErrorCode.CUSTOM, `Mapping failed: ${message}`);
    }
  }
  return { success: false, errors: result.errors };
}

/**
 * Check if validation succeeded
 */
export function isValidationSuccess<T>(result: ValidationResult<T>): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * Check if validation failed
 */
export function isValidationFailure<T>(result: ValidationResult<T>): result is { success: false; errors: ValidationError[] } {
  return result.success === false;
}

/**
 * Get all error messages from validation result
 */
export function getValidationErrorMessages(result: ValidationResult): string[] {
  if (result.success) {
    return [];
  }
  return result.errors.map((err) => err.message);
}

/**
 * Get errors grouped by field
 */
export function groupValidationErrorsByField(result: ValidationResult): Record<string, ValidationError[]> {
  if (result.success) {
    return {};
  }

  const grouped: Record<string, ValidationError[]> = {};
  for (const error of result.errors) {
    if (!grouped[error.field]) {
      grouped[error.field] = [];
    }
    grouped[error.field].push(error);
  }
  return grouped;
}
