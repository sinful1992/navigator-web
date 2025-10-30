// src/hooks/useAddressState.ts
// Address management - Import, Add addresses with version tracking
// PHASE 2 Task 1: Extracted from useAppState.ts (lines 731-851)

import React from 'react';
import { logger } from '../utils/logger';
import type { AppState, AddressRow } from '../types';
import type { SubmitOperationCallback } from '../types/operations';
import { validateAddressRow, generateOperationId } from '../utils/validationUtils';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';

// PHASE 2 Task 3: Updated to use proper SubmitOperationCallback type
export type { SubmitOperationCallback } from '../types/operations';

export interface UseAddressStateProps {
  baseState: AppState;
  addOptimisticUpdate: (operation: string, entity: string, data: unknown, operationId?: string) => string;
  confirmOptimisticUpdate: (operationId: string, confirmedData?: unknown) => void;
  submitOperation?: SubmitOperationCallback;
  setBaseState: React.Dispatch<React.SetStateAction<AppState>>;
}

export interface UseAddressStateReturn {
  setAddresses: (rows: AddressRow[], preserveCompletions?: boolean) => void;
  addAddress: (addressRow: AddressRow) => Promise<number>;
}

/**
 * useAddressState - Manages address CRUD operations
 *
 * Responsibilities:
 * - Bulk import addresses with validation and version tracking
 * - Add individual addresses to the list
 * - Preserve or reset completions during import
 * - Prevent concurrent imports with protection flags
 * - Handle cross-device conflicts (activeIndex validation)
 * - Cloud sync integration for all operations
 *
 * @param props - Hook configuration
 * @returns Object with address actions
 */
export function useAddressState({
  baseState,
  addOptimisticUpdate,
  confirmOptimisticUpdate,
  submitOperation,
  setBaseState
}: UseAddressStateProps): UseAddressStateReturn {
  /**
   * Bulk import addresses with optional completion preservation
   * - Sets protection flag to prevent cloud sync override (2 second window)
   * - Validates all addresses before importing
   * - Bumps list version to track address list changes
   * - Can preserve existing completions or clear them
   * - Submits to cloud sync for all devices
   *
   * @param rows - Array of addresses to import
   * @param preserveCompletions - Keep existing completions when true, clear when false
   */
  const setAddresses = React.useCallback(
    (rows: AddressRow[], preserveCompletions = true) => {
      logger.info(
        `🔄 IMPORT START: Importing ${rows.length} addresses, preserveCompletions=${preserveCompletions}`
      );

      // 🔧 CRITICAL FIX: Set import protection flag to prevent cloud sync override
      const importTime = setProtectionFlag('navigator_import_in_progress');
      logger.info('🛡️ IMPORT PROTECTION ACTIVATED:', new Date(importTime).toISOString());

      const operationId = generateOperationId('update', 'address', {
        type: 'bulk_import',
        count: rows.length,
        preserve: preserveCompletions
      });

      // 🔧 FIX: Validate rows before applying
      const validRows = Array.isArray(rows) ? rows.filter(validateAddressRow) : [];

      logger.info(
        `🔄 IMPORT VALIDATION: ${validRows.length} valid out of ${rows.length} total`
      );

      if (validRows.length === 0) {
        logger.warn('No valid addresses to import');
        clearProtectionFlag('navigator_import_in_progress');
        return;
      }

      // Apply optimistically
      addOptimisticUpdate(
        'update',
        'address',
        { addresses: validRows, bumpVersion: true, preserveCompletions },
        operationId
      );

      // Apply to base state
      setBaseState((s) => {
        const newListVersion =
          (typeof s.currentListVersion === 'number' ? s.currentListVersion : 1) + 1;
        logger.info(
          `🔄 IMPORT BASE STATE UPDATE: addresses=${validRows.length}, preserveCompletions=${preserveCompletions}, oldCompletions=${s.completions.length}, newListVersion=${newListVersion}`
        );

        // Active protection should prevent this from happening while address is active
        if (s.activeIndex !== null) {
          logger.error(
            `❌ IMPORT WHILE ACTIVE: This should never happen! activeIndex=${s.activeIndex}, protection should be blocking this`
          );
        }

        const newState = {
          ...s,
          addresses: validRows,
          activeIndex: null,
          currentListVersion: newListVersion,
          completions: preserveCompletions ? s.completions : []
        };

        logger.info(
          `🔄 IMPORT RESULT STATE: addresses=${newState.addresses.length}, completions=${newState.completions.length}, listVersion=${newState.currentListVersion}`
        );
        return newState;
      });

      // Confirm immediately for local operations
      confirmOptimisticUpdate(operationId);

      // 🔥 DELTA SYNC: Submit operation to cloud immediately
      if (submitOperation) {
        submitOperation({
          type: 'ADDRESS_BULK_IMPORT',
          payload: {
            addresses: validRows,
            newListVersion:
              (typeof baseState.currentListVersion === 'number'
                ? baseState.currentListVersion
                : 1) + 1,
            preserveCompletions
          }
        }).catch((err) => {
          logger.error('Failed to submit bulk import operation:', err);
        });
      }

      // 🔧 CRITICAL FIX: Clear import protection flag after a delay to allow state to settle
      setTimeout(() => {
        clearProtectionFlag('navigator_import_in_progress');
        logger.info('🛡️ IMPORT PROTECTION CLEARED after import completion');
      }, 2000); // 2 second protection window
    },
    [baseState, addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, setBaseState]
  );

  /**
   * Add a single address to the list
   * - Validates address before adding
   * - Returns Promise<number> with the new index
   * - Used by Arrangements "manual address" feature
   * - Submits to cloud sync immediately
   *
   * @param addressRow - Single address to add
   * @returns Promise resolving to new index, or -1 if validation fails
   */
  const addAddress = React.useCallback(
    (addressRow: AddressRow): Promise<number> => {
      return new Promise<number>((resolve) => {
        // 🔧 FIX: Validate address before adding
        if (!validateAddressRow(addressRow)) {
          resolve(-1);
          return;
        }

        const operationId = generateOperationId('create', 'address', addressRow);

        // Apply optimistically
        addOptimisticUpdate('create', 'address', addressRow, operationId);

        // Apply to base state
        setBaseState((s) => {
          const newAddresses = [...s.addresses, addressRow];
          const newIndex = newAddresses.length - 1;

          // Resolve immediately with the new index
          confirmOptimisticUpdate(operationId);
          resolve(newIndex);

          return { ...s, addresses: newAddresses };
        });

        // 🔥 DELTA SYNC: Submit operation to cloud immediately
        if (submitOperation) {
          submitOperation({
            type: 'ADDRESS_ADD',
            payload: { address: addressRow }
          }).catch((err) => {
            logger.error('Failed to submit address add operation:', err);
            // Don't throw - operation is saved locally and will retry
          });
        }
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate, submitOperation, setBaseState]
  );

  return {
    setAddresses,
    addAddress
  };
}
