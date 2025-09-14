// Utility functions for search-addresses Edge Function

/**
 * Sanitize and validate limit parameter
 */
export function sanitizeLimit(limitParam: string | number | null | undefined): number {
  if (limitParam === null || limitParam === undefined) {
    return 5; // default
  }
  
  const parsed = typeof limitParam === 'string' ? parseInt(limitParam, 10) : limitParam;
  
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5; // default for invalid values
  }
  
  if (parsed > 10) {
    return 10; // max limit
  }
  
  return parsed;
}