/**
 * Retry utilities with exponential backoff
 * Implements best practices for handling transient failures
 */

import { logger } from './logger';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,       // Start with 1 second
  maxDelayMs: 30000,          // Cap at 30 seconds
  backoffMultiplier: 2,       // Double each time
};

/**
 * Retry a function with exponential backoff and jitter
 *
 * BEST PRACTICE: Exponential backoff prevents hammering the server
 * JITTER: Prevents thundering herd (all clients retrying simultaneously)
 *
 * Delays: 1s, 2s, 4s, 8s, ... capped at maxDelayMs
 * With jitter: ±0-50% random variation
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operation: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger.debug(`🔄 RETRY: Attempt ${attempt}/${config.maxAttempts} for ${operation}`);
      const result = await fn();

      if (attempt > 1) {
        logger.info(`✅ RETRY: ${operation} succeeded on attempt ${attempt}`);
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === config.maxAttempts) {
        logger.error(`❌ RETRY: ${operation} failed after ${config.maxAttempts} attempts`, {
          lastError: lastError.message,
          stack: lastError.stack?.split('\n').slice(0, 3).join('\n'),
        });
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs
      );

      // Add jitter (±0-50%)
      const jitter = exponentialDelay * (Math.random() * 0.5);
      const delayMs = exponentialDelay + jitter;

      logger.warn(`⏳ RETRY: ${operation} failed, retrying in ${delayMs.toFixed(0)}ms`, {
        attempt,
        maxAttempts: config.maxAttempts,
        error: lastError.message,
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error(`${operation} failed`);
}

/**
 * Retry with custom logic
 * Allows specifying which errors are retryable
 */
export async function retryWithCustom<T>(
  fn: () => Promise<T>,
  operation: string,
  shouldRetry: (error: Error, attempt: number) => boolean,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetry(lastError, attempt) || attempt === config.maxAttempts) {
        throw lastError;
      }

      const exponentialDelay = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs
      );
      const jitter = exponentialDelay * (Math.random() * 0.5);
      const delayMs = exponentialDelay + jitter;

      logger.warn(`⏳ RETRY: ${operation} will retry in ${delayMs.toFixed(0)}ms`, {
        attempt,
        error: lastError.message,
      });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error(`${operation} failed`);
}

/**
 * Determine if an error is retryable
 * BEST PRACTICE: Only retry on transient errors, not client errors
 */
export function isRetryableError(error: any): boolean {
  // Network errors - always retryable
  if (error.message?.includes('network') || error.message?.includes('timeout')) {
    return true;
  }

  // Supabase errors - check status code
  if (error.status) {
    // 408 (request timeout), 429 (rate limit), 502 (bad gateway), 503 (unavailable), 504 (gateway timeout)
    const retryableStatuses = [408, 429, 502, 503, 504];
    return retryableStatuses.includes(error.status);
  }

  // Connection errors
  if (
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('ECONNRESET') ||
    error.message?.includes('ETIMEDOUT')
  ) {
    return true;
  }

  // Default: don't retry (assume client error)
  return false;
}
