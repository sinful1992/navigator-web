// src/utils/userUtils.ts

/**
 * Get user initials from email address
 *
 * Attempts to extract initials from email local part (before @).
 * If email is in format "firstname.lastname@domain.com", returns "FL".
 * Otherwise, returns first 2 characters of email.
 *
 * @param email - User's email address
 * @returns Two-letter uppercase initials
 *
 * @example
 * getUserInitials("john.smith@example.com") // Returns: "JS"
 * getUserInitials("alice@example.com") // Returns: "AL"
 * getUserInitials("") // Returns: ""
 */
export function getUserInitials(email: string): string {
  if (!email) return "";

  const parts = email.split("@")[0].split(".");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}
