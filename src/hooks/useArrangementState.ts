// src/hooks/useArrangementState.ts
// Arrangement management - Create, Update, Delete scheduled visits
// PHASE 2 Task 1: Extracted from useAppState.ts (lines 1314-1466)

import React from 'react';
import { logger } from '../utils/logger';
import type { AppState, Arrangement } from '../types';
import type { SubmitOperationCallback } from '../types/operations';
import { generateOperationId } from '../utils/validationUtils';

// PHASE 2 Task 3: Updated to use proper SubmitOperationCallback type
export type { SubmitOperationCallback } from '../types/operations';

export interface UseArrangementStateProps {
  baseState: AppState;
  addOptimisticUpdate: (operation: string, entity: string, data: unknown, operationId?: string) => string;
  confirmOptimisticUpdate: (operationId: string, confirmedData?: unknown) => void;
  submitOperation?: SubmitOperationCallback;
  setBaseState: React.Dispatch<React.SetStateAction<AppState>>;
}

export interface UseArrangementStateReturn {
  addArrangement: (
    arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<string>;
  updateArrangement: (id: string, updates: Partial<Arrangement>) => Promise<void>;
  deleteArrangement: (id: string) => Promise<void>;
}

/**
 * useArrangementState - Manages arrangement CRUD operations
 *
 * Responsibilities:
 * - Create new arrangements (future visits with customer details)
 * - Update existing arrangements (reschedule, change payment info)
 * - Delete arrangements (remove future visits)
 * - Auto-generate arrangement IDs with timestamp
 * - Track creation and update timestamps
 * - Cloud sync integration for all operations
 *
 * An Arrangement represents a scheduled future visit (not yet completed)
 * with customer information, payment schedule, and case reference.
 *
 * @param props - Hook configuration
 * @returns Object with arrangement CRUD actions
 */
export function useArrangementState({
  addOptimisticUpdate,
  confirmOptimisticUpdate,
  submitOperation,
  setBaseState
}: UseArrangementStateProps): UseArrangementStateReturn {
  /**
   * Create a new arrangement
   * - Auto-generates unique ID with timestamp
   * - Sets creation and update timestamps
   * - Returns Promise<string> with the arrangement ID
   * - Submits to cloud sync immediately
   *
   * @param arrangementData - Arrangement data (id, timestamps auto-generated)
   * @returns Promise resolving to arrangement ID
   */
  const addArrangement = React.useCallback(
    (arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
      return new Promise((resolve) => {
        const now = new Date().toISOString();
        const id = `arr_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`;
        const newArrangement: Arrangement = {
          ...arrangementData,
          id,
          createdAt: now,
          updatedAt: now
        };

        const operationId = generateOperationId('create', 'arrangement', newArrangement);
        addOptimisticUpdate('create', 'arrangement', newArrangement, operationId);

        setBaseState((s) => {
          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve(id);
          }, 0);
          return { ...s, arrangements: [...s.arrangements, newArrangement] };
        });

        // 🔥 DELTA SYNC: Submit operation to cloud immediately
        if (submitOperation) {
          submitOperation({
            type: 'ARRANGEMENT_CREATE',
            payload: { arrangement: newArrangement }
          }).catch((err) => {
            logger.error('Failed to submit arrangement create operation:', err);
          });
        }
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, setBaseState]
  );

  /**
   * Update an existing arrangement
   * - Finds arrangement by ID and applies partial updates
   * - Auto-updates the updatedAt timestamp
   * - Only submits to cloud if arrangement exists
   * - Returns Promise that resolves when complete
   *
   * @param id - Arrangement ID
   * @param updates - Partial updates to apply
   * @returns Promise resolving when update is complete
   */
  const updateArrangement = React.useCallback(
    (id: string, updates: Partial<Arrangement>): Promise<void> => {
      return new Promise((resolve) => {
        let shouldSubmit = false;

        const operationId = generateOperationId('update', 'arrangement', {
          id,
          ...updates
        });

        setBaseState((s) => {
          // Check if arrangement exists before updating
          const arrangement = s.arrangements.find((arr) => arr.id === id);
          if (!arrangement) {
            logger.warn(`Cannot update arrangement ${id} - not found`);
            resolve();
            return s;
          }

          const updatedArrangement = {
            ...updates,
            id,
            updatedAt: new Date().toISOString()
          };
          addOptimisticUpdate('update', 'arrangement', updatedArrangement, operationId);

          const arrangements = s.arrangements.map((arr) =>
            arr.id === id
              ? { ...arr, ...updates, updatedAt: new Date().toISOString() }
              : arr
          );

          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve();
          }, 0);

          shouldSubmit = true;
          return { ...s, arrangements };
        });

        // 🔥 DELTA SYNC: Submit operation to cloud immediately (only if update occurred)
        if (shouldSubmit && submitOperation) {
          submitOperation({
            type: 'ARRANGEMENT_UPDATE',
            payload: { id, updates }
          }).catch((err) => {
            logger.error('Failed to submit arrangement update operation:', err);
          });
        }
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, setBaseState]
  );

  /**
   * Delete an arrangement
   * - Finds arrangement by ID and removes it
   * - Only submits to cloud if arrangement existed
   * - Returns Promise that resolves when complete
   *
   * @param id - Arrangement ID to delete
   * @returns Promise resolving when deletion is complete
   */
  const deleteArrangement = React.useCallback(
    (id: string): Promise<void> => {
      return new Promise((resolve) => {
        let shouldSubmit = false;

        setBaseState((s) => {
          const arrangement = s.arrangements.find((arr) => arr.id === id);
          if (!arrangement) {
            resolve();
            return s;
          }

          const operationId = generateOperationId('delete', 'arrangement', arrangement);
          addOptimisticUpdate('delete', 'arrangement', { id }, operationId);

          const arrangements = s.arrangements.filter((arr) => arr.id !== id);

          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve();
          }, 0);

          shouldSubmit = true;
          return { ...s, arrangements };
        });

        // 🔥 DELTA SYNC: Submit operation to cloud immediately (only if deletion occurred)
        if (shouldSubmit && submitOperation) {
          submitOperation({
            type: 'ARRANGEMENT_DELETE',
            payload: { id }
          }).catch((err) => {
            logger.error('Failed to submit arrangement delete operation:', err);
          });
        }
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, setBaseState]
  );

  return {
    addArrangement,
    updateArrangement,
    deleteArrangement
  };
}
