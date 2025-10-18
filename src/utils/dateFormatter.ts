// src/utils/dateFormatter.ts

/**
 * Format a date to YYYY-MM-DD key format
 *
 * @param date - The date to format
 * @param timeZone - IANA timezone (defaults to Europe/London)
 * @returns Formatted date string in YYYY-MM-DD format
 *
 * @example
 * formatDateKey(new Date('2025-01-15T14:30:00Z'), 'Europe/London')
 * // Returns: "2025-01-15"
 */
export function formatDateKey(date: Date, timeZone = "Europe/London"): string {
  const year = date.toLocaleDateString("en-GB", { timeZone, year: "numeric" });
  const month = date.toLocaleDateString("en-GB", { timeZone, month: "2-digit" });
  const day = date.toLocaleDateString("en-GB", { timeZone, day: "2-digit" });
  return `${year}-${month}-${day}`;
}
