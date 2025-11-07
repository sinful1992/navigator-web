// src/hooks/useSyncState.ts
// Sync state management - Optimistic updates, conflict resolution, device ID
// PHASE 2 Task 1: Extracted from useAppState.ts (lines 456-726, 1946-1991)

import React from 'react';
import { logger } from '../utils/logger';
import type { StateUpdate, OptimisticState } from '../utils/optimisticUpdatesUtils';
import { generateOperationId } from '../utils/validationUtils';
import { getOrCreateDeviceId } from '../services/deviceIdService';

export interface UseSyncStateReturn {
  // State
  optimisticUpdates: Map<string, StateUpdate>;
  pendingOperations: Set<string>;
  conflicts: Map<string, any>;
  deviceId: string;
  ownerMetadata: { ownerUserId?: string; ownerChecksum?: string };

  // Optimistic update management
  addOptimisticUpdate: (
    operation: 'create' | 'update' | 'delete',
    entity: 'completion' | 'arrangement' | 'address' | 'session',
    data: any,
    operationId?: string
  ) => string;
  confirmOptimisticUpdate: (operationId: string, confirmedData?: any) => void;
  revertOptimisticUpdate: (operationId: string, reason?: string) => void;
  clearOptimisticUpdates: () => void;
  enqueueOp: (
    entity: 'completion' | 'arrangement' | 'address' | 'session',
    operation: 'create' | 'update' | 'delete',
    data: any,
    operationId?: string
  ) => string;

  // Conflict management
  resolveConflict: (conflictId: string, resolution: 'prefer_incoming' | 'prefer_existing') => void;
  setConflicts: React.Dispatch<React.SetStateAction<Map<string, any>>>;

  // Ownership metadata
  setOwnerMetadata: React.Dispatch<React.SetStateAction<{ ownerUserId?: string; ownerChecksum?: string }>>;
}

/**
 * useSyncState - Manages all sync-related state and operations
 *
 * Responsibilities:
 * - Track optimistic updates with operation IDs and timestamps
 * - Manage pending operations set for quick lookups
 * - Confirm or revert optimistic updates with auto-cleanup
 * - Resolve conflicts from cloud sync
 * - Manage device ID for multi-device support
 * - Track ownership metadata for security
 * - Auto-clean confirmed/reverted updates after delays
 *
 * This hook handles the complete lifecycle of optimistic updates:
 * 1. addOptimisticUpdate: Create new update, add to pending
 * 2. confirmOptimisticUpdate: Mark confirmed, remove from pending, cleanup after 5s
 * 3. OR revertOptimisticUpdate: Mark reverted, remove from pending, cleanup after 1s
 *
 * @returns Object with sync state and actions
 */
export function useSyncState(): UseSyncStateReturn {
  // Optimistic updates state
  const [optimisticState, setOptimisticState] = React.useState<OptimisticState>({
    updates: new Map(),
    pendingOperations: new Set()
  });

  // Track conflicts
  const [conflicts, setConflicts] = React.useState<Map<string, any>>(new Map());

  // Track loaded owner metadata for ownership verification
  const [ownerMetadata, setOwnerMetadata] = React.useState<{
    ownerUserId?: string;
    ownerChecksum?: string;
  }>({});

  // Stable device ID
  const deviceId = React.useMemo(() => getOrCreateDeviceId(), []);

  /**
   * Add a new optimistic update
   * - Generates operation ID if not provided
   * - Creates StateUpdate with timestamp
   * - Adds to updates Map and pendingOperations Set
   * - Returns operation ID for reference
   *
   * @param operation - Type of operation (create, update, delete)
   * @param entity - Entity type (completion, arrangement, address, session)
   * @param data - Operation data payload
   * @param operationId - Optional pre-generated operation ID
   * @returns Operation ID
   */
  const addOptimisticUpdate = React.useCallback(
    (
      operation: 'create' | 'update' | 'delete',
      entity: 'completion' | 'arrangement' | 'address' | 'session',
      data: any,
      operationId?: string
    ): string => {
      const id = operationId || generateOperationId(operation, entity, data);
      const timestamp = new Date().toISOString();

      const update: StateUpdate = {
        id,
        timestamp,
        type: 'optimistic',
        operation,
        entity,
        data
      };

      setOptimisticState((prev) => {
        const updates = new Map(prev.updates);
        updates.set(id, update);
        return {
          updates,
          pendingOperations: new Set([...prev.pendingOperations, id])
        };
      });

      return id;
    },
    []
  );

  /**
   * Confirm an optimistic update
   * - Changes type from "optimistic" to "confirmed"
   * - Removes from pendingOperations Set
   * - Auto-deletes from updates Map after 5 seconds
   *
   * @param operationId - Operation ID to confirm
   * @param confirmedData - Optional updated data to store
   */
  const confirmOptimisticUpdate = React.useCallback((operationId: string, confirmedData?: any) => {
    setOptimisticState((prev) => {
      const updates = new Map(prev.updates);
      const pendingOperations = new Set(prev.pendingOperations);

      const existing = updates.get(operationId);
      if (existing) {
        updates.set(operationId, {
          ...existing,
          type: 'confirmed',
          data: confirmedData || existing.data
        });
      }

      pendingOperations.delete(operationId);

      return { updates, pendingOperations };
    });

    // Clean up confirmed updates after a delay
    setTimeout(() => {
      setOptimisticState((prev) => {
        const updates = new Map(prev.updates);
        updates.delete(operationId);
        return { ...prev, updates };
      });
    }, 5000);
  }, []);

  /**
   * Revert an optimistic update
   * - Changes type to "reverted"
   * - Removes from pendingOperations Set
   * - Auto-deletes from updates Map after 1 second
   * - Logs reason for debugging
   *
   * @param operationId - Operation ID to revert
   * @param reason - Optional reason for revert (for logging)
   */
  const revertOptimisticUpdate = React.useCallback((operationId: string, reason?: string) => {
    logger.debug(`Reverting optimistic update ${operationId}:`, reason);

    setOptimisticState((prev) => {
      const updates = new Map(prev.updates);
      const pendingOperations = new Set(prev.pendingOperations);

      const existing = updates.get(operationId);
      if (existing) {
        updates.set(operationId, {
          ...existing,
          type: 'reverted'
        });
      }

      pendingOperations.delete(operationId);

      return { updates, pendingOperations };
    });

    // Clean up reverted updates after a short delay
    setTimeout(() => {
      setOptimisticState((prev) => {
        const updates = new Map(prev.updates);
        updates.delete(operationId);
        return { ...prev, updates };
      });
    }, 1000);
  }, []);

  /**
   * Clear all optimistic updates
   * - Resets updates Map to empty
   * - Resets pendingOperations Set to empty
   * - Used when syncing fresh state or recovering from errors
   */
  const clearOptimisticUpdates = React.useCallback(() => {
    setOptimisticState({
      updates: new Map(),
      pendingOperations: new Set()
    });
  }, []);

  /**
   * Enqueue an operation (wrapper around addOptimisticUpdate)
   * - Convenience method with different parameter order
   * - Returns operation ID for reference
   *
   * @param entity - Entity type
   * @param operation - Operation type
   * @param data - Operation data
   * @param operationId - Optional operation ID
   * @returns Operation ID
   */
  const enqueueOp = React.useCallback(
    (
      entity: 'completion' | 'arrangement' | 'address' | 'session',
      operation: 'create' | 'update' | 'delete',
      data: any,
      operationId?: string
    ): string => {
      return addOptimisticUpdate(operation, entity, data, operationId);
    },
    [addOptimisticUpdate]
  );

  /**
   * Resolve a conflict
   * - Removes conflict from conflicts Map
   * - Called after user chooses conflict resolution
   *
   * @param conflictId - Conflict ID to resolve
   * @param _resolution - Resolution choice (prefer_incoming or prefer_existing)
   */
  const resolveConflict = React.useCallback(
    (conflictId: string, _resolution: 'prefer_incoming' | 'prefer_existing') => {
      setConflicts((prev) => {
        const updated = new Map(prev);
        updated.delete(conflictId);
        return updated;
      });
    },
    []
  );

  return {
    // State
    optimisticUpdates: optimisticState.updates,
    pendingOperations: optimisticState.pendingOperations,
    conflicts,
    deviceId,
    ownerMetadata,

    // Optimistic update management
    addOptimisticUpdate,
    confirmOptimisticUpdate,
    revertOptimisticUpdate,
    clearOptimisticUpdates,
    enqueueOp,

    // Conflict management
    resolveConflict,
    setConflicts,

    // Ownership metadata
    setOwnerMetadata
  };
}
