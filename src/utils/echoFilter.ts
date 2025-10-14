// src/utils/echoFilter.ts
/**
 * Echo Filter Utility
 *
 * Filters out "echo" updates from cloud sync - updates that originated
 * from this device and are bouncing back through the realtime subscription.
 *
 * Works in conjunction with change tracker to identify and skip echoes.
 *
 * Feature: Optimistic UI with Change Tracking (DISABLED by default)
 */

import type { AppState } from '../types';
import { changeTracker } from '../services/changeTracker';
import { logger } from './logger';

export interface EchoFilterResult {
  isEcho: boolean;              // Whether this update is an echo
  reason?: string;              // Why it was identified as echo
  confidence: number;           // Confidence level (0-1)
  shouldApply: boolean;         // Final decision: apply or skip
}

export interface EchoFilterOptions {
  deviceId?: string;            // Device ID from cloud update
  timestamp?: string | number;  // Timestamp from cloud update
  version?: number;             // Version number from cloud update
  checksum?: string;            // Checksum from cloud update
  entityType?: 'address' | 'arrangement' | 'completion' | 'session';
  entityId?: string;            // Specific entity ID
  entityIndex?: number;         // Specific entity index
}

/**
 * Get the current device ID
 */
function getCurrentDeviceId(): string {
  return localStorage.getItem('navigator_device_id') || '';
}

/**
 * Check if an update is an echo based on device ID
 */
function checkDeviceIdEcho(cloudDeviceId: string | undefined): EchoFilterResult | null {
  if (!cloudDeviceId) return null;

  const currentDeviceId = getCurrentDeviceId();
  if (cloudDeviceId === currentDeviceId) {
    return {
      isEcho: true,
      reason: 'Same device ID - this update originated from this device',
      confidence: 1.0,
      shouldApply: false,
    };
  }

  return null;
}

/**
 * Check if an update is an echo based on timestamp
 */
function checkTimestampEcho(cloudTimestamp: string | number | undefined): EchoFilterResult | null {
  if (!cloudTimestamp) return null;

  const timestampMs = typeof cloudTimestamp === 'string'
    ? new Date(cloudTimestamp).getTime()
    : cloudTimestamp;

  const now = Date.now();
  const age = now - timestampMs;

  // If the update is very recent (< 100ms), it's likely an echo
  // This is a heuristic - adjust the threshold based on your network latency
  if (age >= 0 && age < 100) {
    return {
      isEcho: true,
      reason: `Very recent update (${age}ms old) - likely an echo`,
      confidence: 0.8,
      shouldApply: false,
    };
  }

  return null;
}

/**
 * Main echo filter function
 */
export async function filterEcho(
  cloudState: AppState,
  options?: EchoFilterOptions
): Promise<EchoFilterResult> {
  function recordAndReturn(result: EchoFilterResult): EchoFilterResult {
    recordFilterResult(result);
    return result;
  }

  // If change tracker is disabled, never filter
  if (!changeTracker.isEnabled()) {
    return recordAndReturn({
      isEcho: false,
      reason: 'Change tracker disabled - applying all updates',
      confidence: 1.0,
      shouldApply: true,
    });
  }

  // Check #1: Device ID matching
  if (options?.deviceId) {
    const deviceResult = checkDeviceIdEcho(options.deviceId);
    if (deviceResult) {
      if (import.meta.env.DEV) {
        logger.info('🔍 Echo filter: Device ID match', deviceResult);
      }
      return recordAndReturn(deviceResult);
    }
  }

  // Check #2: Timestamp-based heuristic
  if (options?.timestamp) {
    const timestampResult = checkTimestampEcho(options.timestamp);
    if (timestampResult && timestampResult.confidence > 0.7) {
      if (import.meta.env.DEV) {
        logger.info('🔍 Echo filter: Timestamp heuristic', timestampResult);
      }
      return recordAndReturn(timestampResult);
    }
  }

  // Check #3: Change tracker - most reliable method
  const isTrackedEcho = await changeTracker.isEcho(cloudState, {
    entityId: options?.entityId,
    entityIndex: options?.entityIndex,
  });

  if (isTrackedEcho) {
    return recordAndReturn({
      isEcho: true,
      reason: 'Change tracker detected this as a local change',
      confidence: 1.0,
      shouldApply: false,
    });
  }

  // Not an echo - apply the update
  return recordAndReturn({
    isEcho: false,
    reason: 'No echo indicators found - genuine cloud update',
    confidence: 1.0,
    shouldApply: true,
  });
}

/**
 * Batch filter multiple potential echoes
 */
export async function filterEchoBatch(
  updates: Array<{ state: AppState; options?: EchoFilterOptions }>
): Promise<EchoFilterResult[]> {
  const results: EchoFilterResult[] = [];

  for (const update of updates) {
    const result = await filterEcho(update.state, update.options);
    results.push(result);
  }

  return results;
}

/**
 * Get echo filter statistics (for debugging)
 */
export interface EchoFilterStats {
  enabled: boolean;
  totalFiltered: number;
  deviceIdFiltered: number;
  timestampFiltered: number;
  trackerFiltered: number;
  lastFilterTime: number | null;
}

let stats: EchoFilterStats = {
  enabled: false,
  totalFiltered: 0,
  deviceIdFiltered: 0,
  timestampFiltered: 0,
  trackerFiltered: 0,
  lastFilterTime: null,
};

/**
 * Record an echo filter result (for statistics)
 */
export function recordFilterResult(result: EchoFilterResult): void {
  if (!result.isEcho) return;

  stats.totalFiltered++;
  stats.lastFilterTime = Date.now();

  if (result.reason?.includes('device ID')) {
    stats.deviceIdFiltered++;
  } else if (result.reason?.includes('timestamp')) {
    stats.timestampFiltered++;
  } else if (result.reason?.includes('tracker')) {
    stats.trackerFiltered++;
  }
}

/**
 * Get echo filter statistics
 */
export function getEchoFilterStats(): EchoFilterStats {
  return {
    ...stats,
    enabled: changeTracker.isEnabled(),
  };
}

/**
 * Reset echo filter statistics
 */
export function resetEchoFilterStats(): void {
  stats = {
    enabled: changeTracker.isEnabled(),
    totalFiltered: 0,
    deviceIdFiltered: 0,
    timestampFiltered: 0,
    trackerFiltered: 0,
    lastFilterTime: null,
  };
}

/**
 * Helper: Check if a specific entity update is an echo
 */
export async function isEntityUpdateEcho(
  entityType: 'address' | 'arrangement' | 'completion' | 'session',
  entityId: string | number,
  cloudState: AppState,
  options?: Omit<EchoFilterOptions, 'entityType' | 'entityId' | 'entityIndex'>
): Promise<boolean> {
  const filterOptions: EchoFilterOptions = {
    ...options,
    entityType,
  };

  if (typeof entityId === 'string') {
    filterOptions.entityId = entityId;
  } else {
    filterOptions.entityIndex = entityId;
  }

  const result = await filterEcho(cloudState, filterOptions);
  recordFilterResult(result);

  return result.isEcho;
}
