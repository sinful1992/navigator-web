// src/utils/optimisticUpdatesUtils.ts - Optimistic update application logic
// PHASE 2: Extracted from useAppState.ts to reduce duplication

import type { AppState } from '../types';
import { logger } from './logger';

/**
 * Optimistic update type - describes what changed before cloud sync
 */
export type StateUpdate = {
  entity: 'completion' | 'arrangement' | 'address' | 'session';
  operation: 'create' | 'update' | 'delete' | 'reverted';
  data: any;
  timestamp: string;
};

/**
 * Apply optimistic updates to base state
 * Returns new state without mutating inputs
 * This is non-blocking and handles errors gracefully
 */
export function applyOptimisticUpdates(
  baseState: AppState,
  updates: Map<string, StateUpdate>
): AppState {
  // Return base state immediately if no updates
  if (updates.size === 0) {
    return baseState;
  }

  try {
    // Use immutable spread pattern instead of deep copy to avoid data corruption
    let result: AppState = {
      ...baseState,
      addresses: [...baseState.addresses],
      completions: [...baseState.completions],
      arrangements: [...baseState.arrangements],
      daySessions: [...baseState.daySessions]
    };

    // Sort updates by timestamp to apply in order
    const sortedUpdates = Array.from(updates.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Track if any critical state changes occur
    let hasAddressChanges = false;
    let hasCompletionChanges = false;

    for (const update of sortedUpdates) {
      if (update.type === "reverted") continue;

      try {
        switch (update.entity) {
          case "completion":
            hasCompletionChanges = true;
            if (update.operation === "create") {
              // Validate completion data
              if (!update.data || typeof update.data.index !== 'number' || !update.data.outcome) {
                logger.warn('Invalid completion data in optimistic update:', update.data);
                continue;
              }

              // Check for duplicates before adding
              const isDuplicate = result.completions.some(c =>
                c.index === update.data.index &&
                c.outcome === update.data.outcome &&
                Math.abs(new Date(c.timestamp).getTime() - new Date(update.data.timestamp).getTime()) < 1000
              );

              if (!isDuplicate) {
                result.completions = [update.data, ...result.completions];
              }
            } else if (update.operation === "update") {
              result.completions = result.completions.map((c) =>
                c.timestamp === update.data.originalTimestamp
                  ? { ...c, ...update.data }
                  : c
              );
            } else if (update.operation === "delete") {
              result.completions = result.completions.filter(
                (c) => c.timestamp !== update.data.timestamp
              );
            }
            break;

          case "arrangement":
            if (update.operation === "create") {
              result.arrangements = [...result.arrangements, update.data];
            } else if (update.operation === "update") {
              result.arrangements = result.arrangements.map((arr) =>
                arr.id === update.data.id
                  ? { ...arr, ...update.data, updatedAt: update.timestamp }
                  : arr
              );
            } else if (update.operation === "delete") {
              result.arrangements = result.arrangements.filter(
                (arr) => arr.id !== update.data.id
              );
            }
            break;

          case "address":
            hasAddressChanges = true;
            if (update.operation === "create") {
              // 🔧 FIX: Check for duplicate addresses before adding
              const isDuplicate = result.addresses.some(a =>
                a.address?.trim()?.toLowerCase() === update.data.address?.trim()?.toLowerCase()
              );

              if (!isDuplicate) {
                result.addresses = [...result.addresses, update.data];
              } else {
                logger.warn('Skipping duplicate address in optimistic update:', update.data.address);
              }
            } else if (update.operation === "update") {
              // bulk import path: update carries { addresses, bumpVersion, preserveCompletions }
              if (update.data?.addresses) {
                result.addresses = Array.isArray(update.data.addresses)
                  ? update.data.addresses
                  : result.addresses; // 🔧 FIX: Preserve existing if invalid

                if (update.data.bumpVersion) {
                  const currentVersion =
                    typeof result.currentListVersion === "number"
                      ? result.currentListVersion
                      : 1;
                  result.currentListVersion = currentVersion + 1;
                  // Only reset completions if not preserving them
                  if (!update.data.preserveCompletions) {
                    result.completions = [];
                  }
                  result.activeIndex = null;
                }
              }
            }
            break;

          case "session":
            if (update.operation === "create") {
              // 🔧 FIX: Validate session data
              if (update.data && update.data.date && update.data.start) {
                result.daySessions = [...result.daySessions, update.data];
              } else {
                logger.warn('Invalid session data in optimistic update:', update.data);
              }
            } else if (update.operation === "update") {
              result.daySessions = result.daySessions.map((session) =>
                session.date === update.data.date
                  ? { ...session, ...update.data }
                  : session
              );
            }
            break;

          default:
            logger.warn(`Unknown entity type in optimistic update: ${update.entity}`, update);
            break;
        }
      } catch (updateError) {
        logger.error(`Failed to apply optimistic update for ${update.entity}:`, updateError);
        // Continue with other updates rather than failing completely
      }
    }

    // 🔧 CRITICAL FIX: Validate result state before returning
    if (hasAddressChanges && (!result.addresses || !Array.isArray(result.addresses))) {
      logger.error('Optimistic updates corrupted addresses, reverting to base state');
      return baseState;
    }

    if (hasCompletionChanges && (!result.completions || !Array.isArray(result.completions))) {
      logger.error('Optimistic updates corrupted completions, reverting to base state');
      return baseState;
    }

    return result;

  } catch (error) {
    logger.error('Failed to apply optimistic updates, returning base state:', error);
    return baseState;
  }
}
