// src/utils/errorHandling.ts
// PHASE 2 Task 3: Centralized error handling utilities
// Provides type-safe error handling patterns replacing `catch (e: unknown)`

/**
 * Extracts a user-friendly error message from an unknown error
 * Handles Error objects, strings, and unknown types
 *
 * @param error - Unknown error object
 * @param defaultMessage - Fallback message if error cannot be determined
 * @returns Error message string
 */
export function getErrorMessage(error: unknown, defaultMessage = 'An unknown error occurred'): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error !== null && typeof error === 'object' && 'message' in error) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
  }

  return defaultMessage;
}

/**
 * Extracts stack trace from an error (if available)
 *
 * @param error - Unknown error object
 * @returns Stack trace string or undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  if (error !== null && typeof error === 'object' && 'stack' in error) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.stack === 'string') {
      return errorObj.stack;
    }
  }

  return undefined;
}

/**
 * Type guard to check if value is an Error instance
 *
 * @param value - Value to check
 * @returns true if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard to check if value is an object with error properties
 *
 * @param value - Value to check
 * @returns true if value looks like an error object
 */
export function isErrorLike(value: unknown): value is { message: string; [key: string]: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'message' in value &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

/**
 * Wraps async function calls with error handling
 * Logs error and returns default value on failure
 *
 * @param fn - Async function to execute
 * @param onError - Error handler (receives error message)
 * @param defaultValue - Value to return on error
 * @returns Result or default value
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  onError?: (message: string) => void,
  defaultValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    const message = getErrorMessage(error);
    onError?.(message);
    return defaultValue;
  }
}

/**
 * Wrap synchronous function calls with error handling
 *
 * @param fn - Sync function to execute
 * @param onError - Error handler (receives error message)
 * @param defaultValue - Value to return on error
 * @returns Result or default value
 */
export function tryCatchSync<T>(
  fn: () => T,
  onError?: (message: string) => void,
  defaultValue?: T
): T | undefined {
  try {
    return fn();
  } catch (error) {
    const message = getErrorMessage(error);
    onError?.(message);
    return defaultValue;
  }
}
