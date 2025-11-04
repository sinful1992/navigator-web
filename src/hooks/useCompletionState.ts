// src/hooks/useCompletionState.ts
// Completion management hook - Create, Update, Delete, Undo completions
// PHASE 2 Task 1: Extracted from useAppState.ts (lines 925-1209)

import React from 'react';
import { logger } from '../utils/logger';
import { showWarning, showError } from '../utils/toast';
import type { AppState, Completion, Outcome } from '../types';
import type { SubmitOperationCallback } from '../types/operations';
import { generateOperationId } from '../utils/validationUtils';
import type { CompletionService } from '../services/CompletionService';
import type { CompletionRepository } from '../repositories/CompletionRepository';

// PHASE 2 Task 3: Updated to use proper SubmitOperationCallback type
export type { SubmitOperationCallback } from '../types/operations';

export interface UseCompletionStateProps {
  baseState: AppState;
  addOptimisticUpdate: (operation: string, entity: string, data: unknown, operationId?: string) => string;
  confirmOptimisticUpdate: (operationId: string, confirmedData?: unknown) => void;
  submitOperation?: SubmitOperationCallback;
  setBaseState: React.Dispatch<React.SetStateAction<AppState>>;
  services?: {
    completion: CompletionService;
    [key: string]: any;
  } | null;
  repositories?: {
    completion: CompletionRepository;
    [key: string]: any;
  } | null;
}

export interface UseCompletionStateReturn {
  complete: (
    index: number,
    outcome: Outcome,
    amount?: string,
    arrangementId?: string,
    caseReference?: string,
    numberOfCases?: number,
    enforcementFees?: number[]
  ) => Promise<string>;
  updateCompletion: (completionArrayIndex: number, updates: Partial<Completion>) => void;
  undo: (index: number) => void;
  pendingCompletions: Set<number>;
}

/**
 * useCompletionState - Manages completion CRUD operations
 *
 * Responsibilities:
 * - Create completions with validation and time tracking
 * - Update existing completions (outcome, amount, etc.)
 * - Delete completions with undo support
 * - Prevent duplicate submissions
 * - Handle cloud sync for all operations
 * - Track pending completions and recent activity
 *
 * @param props - Hook configuration
 * @returns Object with completion actions and state
 */
export function useCompletionState({
  baseState,
  addOptimisticUpdate,
  confirmOptimisticUpdate,
  submitOperation,
  setBaseState,
  services,
  repositories
}: UseCompletionStateProps): UseCompletionStateReturn {
  // Track pending completions (prevent double-submission)
  const pendingCompletionsRef = React.useRef<Set<number>>(new Set());
  const [pendingCompletions, setPendingCompletions] = React.useState<Set<number>>(new Set());

  // Track recent completions (for memory cleanup)
  const recentCompletionsRef = React.useRef<Map<string, { timestamp: number; completion: Completion }>>(
    new Map()
  );

  // ---- Cleanup interval for recent completions ----
  React.useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes

      for (const [key, value] of recentCompletionsRef.current.entries()) {
        if (now - value.timestamp > maxAge) {
          recentCompletionsRef.current.delete(key);
        }
      }
    }, 30000);

    return () => clearInterval(cleanupInterval);
  }, []);

  /**
   * Create a new completion for an address
   * - Validates address and index
   * - Prevents duplicate submissions
   * - Calculates time spent if address was active
   * - Submits to cloud sync
   */
  const complete = React.useCallback(
    async (
      index: number,
      outcome: Outcome,
      amount?: string,
      arrangementId?: string,
      caseReference?: string,
      numberOfCases?: number,
      enforcementFees?: number[]
    ): Promise<string> => {
      // Validate index is a valid number
      if (!Number.isInteger(index) || index < 0) {
        const error = `Invalid index: ${index}. Index must be a non-negative integer.`;
        logger.error(error);
        showError('Invalid address index. Please refresh and try again.');
        throw new Error(error);
      }

      // Check array bounds
      const currentState = baseState;
      if (index >= currentState.addresses.length) {
        const error = `Index ${index} out of bounds. Total addresses: ${currentState.addresses.length}`;
        logger.error(error);
        showError('Address not found. The list may have changed. Please refresh.');
        throw new Error(error);
      }

      // Check if completion is already pending for this index
      if (pendingCompletionsRef.current.has(index)) {
        throw new Error(`Completion already pending for index ${index}`);
      }

      // Check if address exists and has valid data
      const address = currentState.addresses[index];
      if (!address || !address.address) {
        const error = `Address at index ${index} is invalid or empty`;
        logger.error(error);
        showError('Invalid address data. Please refresh and try again.');
        throw new Error(error);
      }

      // Check if already completed (timestamp-based check)
      const existingCompletion = currentState.completions.find(
        (c) => c.address === address.address && c.listVersion === currentState.currentListVersion
      );

      if (existingCompletion) {
        // If there's an existing completion, check if it's recent (within last 30 seconds)
        // This prevents rapid duplicate submissions but allows legitimate re-completion
        const existingTime = new Date(existingCompletion.timestamp).getTime();
        const now = Date.now();
        const timeDiff = now - existingTime;

        if (timeDiff < 30000) { // 30 seconds
          showWarning(`Address "${address.address}" was already completed ${Math.round(timeDiff / 1000)} seconds ago`);
          return Promise.reject(); // Exit early but maintain function signature
        }

        logger.info(
          `🔄 RE-COMPLETING: Address "${address.address}" was previously completed ${new Date(existingCompletion.timestamp).toLocaleString()}, allowing new completion`
        );
      }

      // Create completion object using service (with automatic time tracking)
      const completion = services?.completion
        ? services.completion.createCompletionObject(
            {
              index,
              address: address.address,
              lat: address.lat ?? null,
              lng: address.lng ?? null,
              outcome,
              amount,
              listVersion: currentState.currentListVersion,
              arrangementId,
              caseReference,
              numberOfCases,
              enforcementFees,
            },
            currentState.activeIndex === index ? currentState.activeStartTime : null
          )
        : (() => {
            // Fallback when services not available
            const nowISO = new Date().toISOString();
            let timeSpentSeconds: number | undefined;

            if (currentState.activeIndex === index && currentState.activeStartTime) {
              const startTime = new Date(currentState.activeStartTime).getTime();
              const endTime = new Date(nowISO).getTime();
              timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
              logger.info(
                `⏱️ CASE TIME TRACKED: ${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s on "${address.address}"`
              );
            }

            return {
              index,
              address: address.address,
              lat: address.lat ?? null,
              lng: address.lng ?? null,
              outcome,
              amount,
              timestamp: nowISO,
              listVersion: currentState.currentListVersion,
              arrangementId,
              caseReference,
              timeSpentSeconds,
              numberOfCases,
              enforcementFees,
            };
          })();

      const operationId = generateOperationId('create', 'completion', completion);

      try {
        // Mark as pending
        pendingCompletionsRef.current.add(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));

        // Apply all changes synchronously to avoid race conditions
        const completionKey = `${index}_${outcome}_${currentState.currentListVersion}`;

        // Track recent completion (cleanup happens in interval)
        recentCompletionsRef.current.set(completionKey, {
          timestamp: Date.now(),
          completion
        });

        // Apply both optimistic and base state updates in single transaction
        addOptimisticUpdate('create', 'completion', completion, operationId);

        setBaseState((s) => {
          if (s.activeIndex === index) {
            // 🔧 FIX: Clear protection when completing active address
            logger.info(`📍 COMPLETED ACTIVE ADDRESS: Clearing active state - SYNC RESUMED`);
          }

          return {
            ...s,
            completions: [completion, ...s.completions],
            activeIndex: s.activeIndex === index ? null : s.activeIndex,
            activeStartTime: s.activeIndex === index ? null : s.activeStartTime,
          };
        });

        // 🔥 DELTA SYNC: Submit operation to cloud immediately
        if (repositories?.completion) {
          repositories.completion.saveCompletion(completion).catch(err => {
            logger.error('Failed to save completion:', err);
            // Don't throw - operation is saved locally and will retry
          });
        } else if (submitOperation) {
          // Fallback to direct submission
          submitOperation({
            type: 'COMPLETION_CREATE',
            payload: { completion }
          }).catch(err => {
            logger.error('Failed to submit completion operation:', err);
            // Don't throw - operation is saved locally and will retry
          });
        }

        return operationId;
      } finally {
        // Always clear pending state, even if above operations fail
        pendingCompletionsRef.current.delete(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));
      }
    },
    [baseState, addOptimisticUpdate, submitOperation, setBaseState, services, repositories]
  );

  /**
   * Update an existing completion (e.g., change outcome or amount)
   */
  const updateCompletion = React.useCallback(
    (completionArrayIndex: number, updates: Partial<Completion>) => {
      let originalTimestamp: string | undefined;
      let currentVersion: number | undefined;
      let shouldSubmit = false;

      setBaseState((s) => {
        if (
          !Number.isInteger(completionArrayIndex) ||
          completionArrayIndex < 0 ||
          completionArrayIndex >= s.completions.length
        ) {
          logger.error('Invalid completion index:', completionArrayIndex);
          return s;
        }

        const originalCompletion = s.completions[completionArrayIndex];
        originalTimestamp = originalCompletion.timestamp;
        // PHASE 2: Capture current version for optimistic concurrency
        currentVersion = originalCompletion.version;
        shouldSubmit = true;

        const updatedCompletion = { ...originalCompletion, ...updates };

        const operationId = generateOperationId('update', 'completion', {
          originalTimestamp: originalCompletion.timestamp,
          updates
        });

        // Add optimistic update
        addOptimisticUpdate('update', 'completion', updatedCompletion, operationId);

        const newCompletions = s.completions.slice();
        newCompletions[completionArrayIndex] = updatedCompletion;

        // Confirm immediately for local operations
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);

        return { ...s, completions: newCompletions };
      });

      // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
      if (shouldSubmit && originalTimestamp) {
        if (repositories?.completion) {
          // PHASE 2: Pass current version for conflict detection
          repositories.completion.updateCompletion(originalTimestamp, updates, currentVersion).catch(err => {
            logger.error('Failed to update completion:', err);
          });
        } else if (submitOperation) {
          // Fallback to direct submission
          submitOperation({
            type: 'COMPLETION_UPDATE',
            payload: {
              originalTimestamp,
              updates,
              expectedVersion: currentVersion,
            }
          }).catch(err => {
            logger.error('Failed to submit completion update operation:', err);
          });
        }
      }
    },
    [setBaseState, addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, repositories]
  );

  /**
   * Delete the most recent completion for an index (Undo)
   * Finds the most recent completion for the index and list version, then deletes it
   */
  const undo = React.useCallback(
    (index: number) => {
      let completionToDelete: Completion | undefined;

      setBaseState((s) => {
        const arr = s.completions.slice();

        // Find the most recent completion for this index and list version
        let mostRecentPos = -1;
        let mostRecentTime = 0;

        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (
            Number(c.index) === Number(index) &&
            c.listVersion === s.currentListVersion
          ) {
            const completionTime = new Date(c.timestamp).getTime();
            if (completionTime > mostRecentTime) {
              mostRecentTime = completionTime;
              mostRecentPos = i;
            }
          }
        }

        if (mostRecentPos >= 0) {
          const completion = arr[mostRecentPos];
          completionToDelete = completion;

          const operationId = generateOperationId('delete', 'completion', completion);

          // Add optimistic update for deletion
          addOptimisticUpdate('delete', 'completion', completion, operationId);

          arr.splice(mostRecentPos, 1);

          // Confirm immediately for local operations
          setTimeout(() => confirmOptimisticUpdate(operationId), 0);
        }

        return { ...s, completions: arr };
      });

      // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
      if (completionToDelete) {
        if (repositories?.completion) {
          repositories.completion.deleteCompletion(
            completionToDelete.timestamp,
            completionToDelete.index,
            completionToDelete.listVersion ?? 1
          ).catch(err => {
            logger.error('Failed to delete completion:', err);
          });
        } else if (submitOperation) {
          // Fallback to direct submission
          submitOperation({
            type: 'COMPLETION_DELETE',
            payload: {
              timestamp: completionToDelete.timestamp,
              index: completionToDelete.index,
              listVersion: completionToDelete.listVersion ?? 1,
            }
          }).catch(err => {
            logger.error('Failed to submit completion delete operation:', err);
          });
        }
      }
    },
    [setBaseState, addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, repositories]
  );

  return {
    complete,
    updateCompletion,
    undo,
    pendingCompletions
  };
}
