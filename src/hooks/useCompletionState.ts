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
import { AtomicOperationService } from '../services/AtomicOperationService';

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
  completeHistorical: (
    date: string,
    address: string,
    amount: string,
    caseReference: string,
    numberOfCases: number,
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

  // Refs to avoid stale closures - same pattern as useAppState.ts
  // See CLAUDE.md "Session Tracking Stale Closure Fix" for explanation
  const repositoriesRef = React.useRef(repositories);
  const submitOperationRef = React.useRef(submitOperation);

  React.useEffect(() => {
    repositoriesRef.current = repositories;
  }, [repositories]);

  React.useEffect(() => {
    submitOperationRef.current = submitOperation;
  }, [submitOperation]);

  // Create atomic operation service instance
  const atomicService = React.useMemo(
    () => new AtomicOperationService({
      setBaseState,
      submitOperation,
      addOptimisticUpdate,
      confirmOptimisticUpdate
    }),
    [setBaseState, submitOperation, addOptimisticUpdate, confirmOptimisticUpdate]
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
        // 🔧 FIX 2E: Check if it's recent (within last 5 seconds) to prevent rapid double-clicks
        // This prevents duplicate submissions while allowing legitimate re-completion
        const existingTime = new Date(existingCompletion.timestamp).getTime();
        const now = Date.now();
        const timeDiff = now - existingTime;

        if (timeDiff < 5000) { // 5 seconds - user-specified duplicate window
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

        // 🔧 ATOMIC OPERATION: State mutation + operation submission with automatic rollback
        const result = await atomicService.execute({
          stateMutator: (s) => {
            if (s.activeIndex === index) {
              logger.info(`📍 COMPLETED ACTIVE ADDRESS: Clearing active state - SYNC RESUMED`);
            }

            return {
              ...s,
              completions: [completion, ...s.completions],
              activeIndex: s.activeIndex === index ? null : s.activeIndex,
              activeStartTime: s.activeIndex === index ? null : s.activeStartTime,
            };
          },
          operation: {
            type: 'COMPLETION_CREATE',
            payload: { completion }
          },
          operationId,
          optimisticData: completion,
          optimisticOperation: 'create',
          optimisticEntity: 'completion',
          rollbackOnFailure: true
        });

        // Handle operation failure
        if (!result.success) {
          logger.error('Atomic completion operation failed:', result.error);
          showError('Failed to save completion. Please try again.');
          throw result.error;
        }

        // NOTE: Repository submission REMOVED - atomicService.execute() already submits the operation
        // The duplicate call was causing all completions to be doubled in the database

        return operationId;
      } finally {
        // Always clear pending state, even if above operations fail
        pendingCompletionsRef.current.delete(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));
      }
    },
    [baseState, addOptimisticUpdate, setBaseState, services, atomicService]
  );

  /**
   * Update an existing completion (e.g., change outcome or amount)
   */
  const updateCompletion = React.useCallback(
    (completionArrayIndex: number, updates: Partial<Completion>) => {
      let originalTimestamp: string | undefined;
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
        shouldSubmit = true;

        // DON'T increment version locally - only reducer should increment versions
        // Incrementing here causes conflicts when operation replays (expectedVersion mismatch)
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
      // Use refs to avoid stale closure bug (same pattern as useAppState.ts)
      if (shouldSubmit && originalTimestamp) {
        const currentRepos = repositoriesRef.current;
        const currentSubmit = submitOperationRef.current;

        if (currentRepos?.completion) {
          // TIMESTAMP-ORDERED SYNC: No version checking needed
          currentRepos.completion.updateCompletion(originalTimestamp, updates).catch(err => {
            logger.error('Failed to update completion:', err);
          });
        } else if (currentSubmit) {
          // Fallback to direct submission
          currentSubmit({
            type: 'COMPLETION_UPDATE',
            payload: {
              originalTimestamp,
              updates,
            }
          }).catch(err => {
            logger.error('Failed to update completion update operation:', err);
          });
        }
      }
    },
    [setBaseState, addOptimisticUpdate, confirmOptimisticUpdate]
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
      // Use refs to avoid stale closure bug (same pattern as useAppState.ts)
      if (completionToDelete) {
        const currentRepos = repositoriesRef.current;
        const currentSubmit = submitOperationRef.current;

        if (currentRepos?.completion) {
          currentRepos.completion.deleteCompletion(
            completionToDelete.timestamp,
            completionToDelete.index,
            completionToDelete.listVersion ?? 1
          ).catch(err => {
            logger.error('Failed to delete completion:', err);
          });
        } else if (currentSubmit) {
          // Fallback to direct submission
          currentSubmit({
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
    [setBaseState, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /**
   * Create a historical completion with custom date
   * Used for recording payments received while off work
   * - Creates completion with custom timestamp (end of selected day)
   * - Uses index -1 to indicate historical entry (not tied to address list)
   * - No time tracking for historical entries
   * - Submits to cloud sync with COMPLETION_CREATE operation
   */
  const completeHistorical = React.useCallback(
    async (
      date: string,
      address: string,
      amount: string,
      caseReference: string,
      numberOfCases: number,
      enforcementFees?: number[]
    ): Promise<string> => {
      // Validate inputs
      if (!date || !address || !amount || !caseReference) {
        throw new Error('All fields are required for historical PIF recording');
      }

      // Validate date format
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date format');
      }

      const currentState = baseState;

      // Create completion object using service
      const completion = services?.completion
        ? services.completion.createHistoricalCompletionObject(
            {
              address: address.trim(),
              outcome: 'PIF',
              amount,
              listVersion: currentState.currentListVersion,
              arrangementId: undefined,
              caseReference,
              numberOfCases,
              enforcementFees,
            },
            date
          )
        : {
            // Fallback when services not available
            index: -1,
            address: address.trim(),
            lat: null,
            lng: null,
            outcome: 'PIF' as Outcome,
            amount,
            timestamp: new Date(`${date}T23:59:59`).toISOString(),
            listVersion: currentState.currentListVersion,
            arrangementId: undefined,
            caseReference,
            timeSpentSeconds: undefined,
            numberOfCases,
            enforcementFees,
            version: 1,
          };

      const operationId = generateOperationId('create', 'completion', completion);

      try {
        // Apply optimistic and base state updates
        addOptimisticUpdate('create', 'completion', completion, operationId);

        setBaseState((s) => ({
          ...s,
          completions: [completion, ...s.completions],
        }));

        // 🔥 DELTA SYNC: Submit operation to cloud immediately
        // Use refs to avoid stale closure bug (same pattern as useAppState.ts)
        const currentRepos = repositoriesRef.current;
        const currentSubmit = submitOperationRef.current;

        if (currentRepos?.completion) {
          currentRepos.completion.saveCompletion(completion).catch(err => {
            logger.error('Failed to save historical completion:', err);
            // Don't throw - operation is saved locally and will retry
          });
        } else if (currentSubmit) {
          // Fallback to direct submission
          currentSubmit({
            type: 'COMPLETION_CREATE',
            payload: { completion }
          }).catch(err => {
            logger.error('Failed to submit historical completion operation:', err);
            // Don't throw - operation is saved locally and will retry
          });
        }

        logger.info(`📅 HISTORICAL PIF RECORDED: ${address} on ${date} - £${amount}`);

        return operationId;
      } catch (error) {
        logger.error('Failed to create historical completion:', error);
        throw error;
      }
    },
    [baseState, addOptimisticUpdate, setBaseState, services]
  );

  return {
    complete,
    completeHistorical,
    updateCompletion,
    undo,
    pendingCompletions
  };
}
