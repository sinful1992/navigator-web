// src/services/deviceIdService.ts
// Device ID management for multi-device sync tracking

/**
 * Get or create a unique device ID for this device
 * - Device ID is stored in localStorage for persistence
 * - Format: "device_" + timestamp + random string
 * - Used to track which device created which operations
 *
 * @returns Stable device ID string
 */
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'navigator_device_id';

  // Try to get existing device ID
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  // Generate new device ID
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const deviceId = `device_${timestamp}_${random}`;

  // Store for future use
  localStorage.setItem(STORAGE_KEY, deviceId);

  return deviceId;
}
