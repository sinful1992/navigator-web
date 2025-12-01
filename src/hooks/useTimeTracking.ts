// src/hooks/useTimeTracking.ts
// Time tracking for active addresses - Start, Cancel, Complete
// PHASE 2 Task 1: Extracted from useAppState.ts (lines 853-922, plus time calculation logic)
import type { SubmitOperationCallback } from '../types/operations';

import React from 'react';
import { logger } from '../utils/logger';
import { showWarning } from '../utils/toast';
import type { AppState } from '../types';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import type { CompletionService } from '../services/CompletionService';
import type { AddressRepository } from '../repositories/AddressRepository';


export interface UseTimeTrackingProps {
  baseState: AppState;
  setBaseState: React.Dispatch<React.SetStateAction<AppState>>;
  submitOperation?: SubmitOperationCallback;
  services?: {
    completion: CompletionService;
    [key: string]: any;
  } | null;
  repositories?: {
    address: AddressRepository;
    [key: string]: any;
  } | null;
}

export interface UseTimeTrackingReturn {
  setActive: (index: number) => void;
  cancelActive: () => void;
  activeIndex: number | null;
  activeStartTime?: string | null;
  getTimeSpent: (index: number, startTime?: string | null) => number | undefined;
}

/**
 * useTimeTracking - Manages active address time tracking
 *
 * Responsibilities:
 * - Set active address with protection flag (prevents cloud sync interference)
 * - Cancel active address and resume cloud sync
 * - Calculate time spent on completed address
 * - Prevent multiple active addresses simultaneously
 * - Handle cross-device active state conflicts
 *
 * @param props - Hook configuration
 * @returns Object with time tracking actions and state
 */
export function useTimeTracking({
  baseState,
  setBaseState,
  submitOperation,
  services: _services,
  repositories
}: UseTimeTrackingProps): UseTimeTrackingReturn {
  /**
   * Set an address as active and start time tracking
   * - Sets protection flag to prevent cloud sync interference
   * - Validates: address exists, not already completed, not already active
   * - Saves activeIndex and activeStartTime to state
   * - Submits to cloud sync immediately
   */
  const setActive = React.useCallback(
    (idx: number) => {
      const now = new Date().toISOString();
      let shouldSubmit = false;

      setBaseState((s) => {
        const address = s.addresses[idx];

        // Check if there's already an active address
        if (s.activeIndex !== null && s.activeIndex !== idx) {
          const currentActiveAddress = s.addresses[s.activeIndex];
          logger.warn(
            `Cannot start address #${idx} - address #${s.activeIndex} "${currentActiveAddress?.address}" is already active`
          );
          showWarning(`Please complete or cancel the current active address first`);
          // 🔧 CRITICAL FIX: Don't set/clear protection flag on validation failure
          return s; // Don't change state
        }

        // Check if this address is already completed (cross-device protection)
        if (address) {
          const isCompleted = s.completions.some(
            (c) =>
              c.index === idx &&
              (c.listVersion || s.currentListVersion) === s.currentListVersion
          );

          if (isCompleted) {
            logger.warn(`Cannot set active - address at index ${idx} is already completed`);
            showWarning(`This address is already completed`);
            // 🔧 CRITICAL FIX: Don't set/clear protection flag on validation failure
            return s; // Don't change state
          }
        }

        // 🔧 CRITICAL FIX: Set protection flag AFTER validation passes, BEFORE state mutation
        // This ensures flag is only set for successful operations
        setProtectionFlag('navigator_active_protection');

        logger.info(
          `📍 STARTING CASE: Address #${idx} "${address?.address}" at ${now} - SYNC BLOCKED until Complete/Cancel`
        );
        shouldSubmit = true;

        return { ...s, activeIndex: idx, activeStartTime: now };
      });

      // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
      if (shouldSubmit) {
        if (repositories?.address) {
          // Add abort controller to prevent hung requests
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => {
            abortController.abort();
            clearProtectionFlag('navigator_active_protection');
            logger.error('⚠️ Active address save timed out after 15s - cleared protection flag');
          }, 15000); // 15 second timeout

          repositories.address.saveActiveAddress(idx, now)
            .then(() => {
              clearTimeout(timeoutId);
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              if (err.name === 'AbortError') {
                logger.warn('Active address save aborted due to timeout');
              } else {
                logger.error('Failed to save active address:', err);
              }
              // 🔧 FIX: Clear protection flag on error to prevent deadlock
              clearProtectionFlag('navigator_active_protection');
            });
        } else if (submitOperation) {
          // Fallback to direct submission
          submitOperation({
            type: 'ACTIVE_INDEX_SET',
            payload: { index: idx, startTime: now }
          }).catch((err) => {
            logger.error('Failed to submit active index operation:', err);
            // 🔧 FIX: Clear protection flag on error to prevent deadlock
            clearProtectionFlag('navigator_active_protection');
          });
        } else {
          // 🔧 CRITICAL FIX: No repository or submitOperation available (offline/tests)
          // Clear protection flag immediately to prevent permanent deadlock
          // Without this, the Infinity-timeout flag would block sync forever
          logger.warn('⚠️ SET ACTIVE: No persistence available - clearing protection flag immediately');
          clearProtectionFlag('navigator_active_protection');
        }
      }
    },
    [setBaseState, submitOperation, repositories]
  );

  /**
   * Cancel the active address and resume cloud sync
   * 🔧 CRITICAL FIX: Repository now handles protection flag clearing AFTER operation
   * - Clears activeIndex and activeStartTime from state
   * - Submits to cloud sync immediately
   * - Protection flag cleared by repository after operation completes
   */
  const cancelActive = React.useCallback(() => {
    // 🔧 CRITICAL FIX: Don't clear protection flag here!
    // Repository.clearActiveAddress() will clear it AFTER operation completes
    // This prevents state corruption during the operation

    setBaseState((s) => {
      logger.info(`📍 CANCELING ACTIVE: Clearing active state`);
      return { ...s, activeIndex: null, activeStartTime: null };
    });

    // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
    if (repositories?.address) {
      // Repository handles protection flag clearing AFTER operation completes
      repositories.address.clearActiveAddress().catch((err) => {
        logger.error('Failed to clear active address:', err);
        // 🔧 FIX: Clear protection flag on error to prevent deadlock
        clearProtectionFlag('navigator_active_protection');
      });
    } else if (submitOperation) {
      // Fallback to direct submission with proper protection flag management
      submitOperation({
        type: 'ACTIVE_INDEX_SET',
        payload: { index: null, startTime: null }
      })
        .then(() => {
          // Clear protection flag after successful submission
          clearProtectionFlag('navigator_active_protection');
        })
        .catch((err) => {
          logger.error('Failed to submit cancel active operation:', err);
          // Clear protection flag even on error
          clearProtectionFlag('navigator_active_protection');
        });
    } else {
      // 🔧 CRITICAL FIX: No repository or submitOperation available (offline/tests)
      // Clear protection flag immediately to prevent permanent deadlock
      // Without this, the Infinity-timeout flag would block sync forever
      logger.warn('⚠️ CANCEL ACTIVE: No persistence available - clearing protection flag immediately');
      clearProtectionFlag('navigator_active_protection');
    }
  }, [setBaseState, submitOperation, repositories]);

  /**
   * Calculate time spent on an address
   * - Used when completing an address to record timeSpentSeconds
   * - Returns undefined if address wasn't the active one (no time tracking)
   * - Calculates in seconds from activeStartTime to now
   *
   * @param index - Address index being completed
   * @param startTime - Optional completion time (defaults to now)
   * @returns Time spent in seconds, or undefined if not active
   */
  const getTimeSpent = React.useCallback(
    (index: number, startTime?: string | null): number | undefined => {
      const currentState = baseState;

      // Only calculate time if this address was the active one
      if (currentState.activeIndex !== index || !currentState.activeStartTime) {
        return undefined;
      }

      const startTimestamp = new Date(currentState.activeStartTime).getTime();
      const endTimestamp = new Date(startTime || new Date().toISOString()).getTime();
      const timeSpentSeconds = Math.floor((endTimestamp - startTimestamp) / 1000);

      if (timeSpentSeconds > 0) {
        logger.info(
          `⏱️ CASE TIME TRACKED: ${Math.floor(timeSpentSeconds / 60)}m ${
            timeSpentSeconds % 60
          }s on address index ${index}`
        );
      }

      return timeSpentSeconds;
    },
    [baseState]
  );

  return {
    setActive,
    cancelActive,
    activeIndex: baseState.activeIndex,
    activeStartTime: baseState.activeStartTime,
    getTimeSpent
  };
}
