// Utility functions for search-addresses Edge Function

/**
 * Sanitize and validate limit parameter
 */
export function sanitizeLimit(value: unknown, fallback = 5): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) {
    return fallback
  }
  
  // Enforce maximum limit to prevent abuse
  if (num > 10) {
    return 10
  }
  
  return num
}
