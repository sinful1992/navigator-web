// src/hooks/useConflictResolution.ts
// PHASE 3: Conflict Resolution Hook (Application Layer)
// Clean Architecture: Application layer orchestrates conflict resolution

import { useCallback, useMemo, useEffect, useRef } from 'react';
import type { AppState, VersionConflict, Completion, Arrangement } from '../types';
import { ConflictResolutionService, type ResolutionStrategy } from '../services/ConflictResolutionService';
import { ConflictMetricsService } from '../services/ConflictMetricsService';
import { logger } from '../utils/logger';

export interface UseConflictResolutionProps {
  conflicts: VersionConflict[];
  completions: Completion[];
  arrangements: Arrangement[];
  onStateUpdate: (updater: (state: AppState) => AppState) => void;
  // PHASE 3 FIX: Operation submission for sync
  updateCompletion: (index: number, updates: Partial<Completion>) => void;
  updateArrangement: (id: string, updates: Partial<Arrangement>) => void;
}

export interface UseConflictResolutionReturn {
  pendingConflicts: VersionConflict[];
  resolvedConflicts: VersionConflict[];
  resolveKeepLocal: (conflictId: string) => void;
  resolveUseRemote: (conflictId: string) => void;
  resolveManual: (conflictId: string, manualData: Partial<Completion> | Partial<Arrangement>) => void;
  dismissConflict: (conflictId: string) => void;
  clearResolvedConflicts: () => void;
}

/**
 * useConflictResolution - Application Layer Orchestration
 *
 * Responsibilities (Clean Architecture - Application Layer):
 * - Coordinate between UI and Domain services
 * - Manage conflict state
 * - Apply resolutions to app state
 * - NO business logic (delegates to ConflictResolutionService)
 * - NO UI rendering (just state management)
 *
 * Why Application Layer?
 * - Orchestrates use cases
 * - Bridges UI and domain logic
 * - React-specific (uses hooks)
 * - Manages side effects
 */
export function useConflictResolution({
  conflicts,
  completions,
  arrangements,
  onStateUpdate,
  updateCompletion,
  updateArrangement,
}: UseConflictResolutionProps): UseConflictResolutionReturn {

  // Track conflicts we've already recorded in metrics
  const recordedConflictsRef = useRef<Set<string>>(new Set());

  // Filter conflicts by status
  const pendingConflicts = useMemo(
    () => conflicts.filter(c => c.status === 'pending'),
    [conflicts]
  );

  const resolvedConflicts = useMemo(
    () => conflicts.filter(c => c.status === 'resolved' || c.status === 'dismissed'),
    [conflicts]
  );

  // PHASE 3: Track conflict detection in metrics
  useEffect(() => {
    const trackNewConflicts = async () => {
      for (const conflict of pendingConflicts) {
        // Only track if we haven't recorded this conflict yet
        if (!recordedConflictsRef.current.has(conflict.id)) {
          await ConflictMetricsService.trackConflictDetected(conflict);
          recordedConflictsRef.current.add(conflict.id);
        }
      }
    };

    trackNewConflicts().catch(err => {
      logger.error('Failed to track conflict detection:', err);
    });
  }, [pendingConflicts]);

  /**
   * Resolve conflict by keeping local version
   * Application Layer: Coordinates resolution action
   */
  const resolveKeepLocal = useCallback(
    (conflictId: string) => {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (!conflict) {
        logger.error('Conflict not found:', conflictId);
        return;
      }

      // Domain Layer: Get resolution strategy
      const validation = ConflictResolutionService.canResolve(conflict);
      if (!validation.valid) {
        logger.error('Cannot resolve conflict:', validation.reason);
        return;
      }

      const resolution = ConflictResolutionService.resolveKeepLocal(conflict);

      // Application Layer: Apply resolution to state
      onStateUpdate((state) => ({
        ...state,
        conflicts: state.conflicts?.map(c =>
          c.id === conflictId
            ? {
                ...c,
                status: 'resolved' as const,
                resolvedAt: new Date().toISOString(),
                resolution: 'keep-local' as const,
              }
            : c
        ),
      }));

      // PHASE 3: Track resolution in metrics
      ConflictMetricsService.trackConflictResolved(conflict, 'keep-local').catch(err => {
        logger.error('Failed to track conflict resolution:', err);
      });

      logger.info('✅ Conflict resolved: Kept local changes', { conflictId });
    },
    [conflicts, onStateUpdate]
  );

  /**
   * Resolve conflict by using remote version
   * Application Layer: Coordinates resolution and state update
   *
   * PHASE 3 FIX: Now submits UPDATE operation for cross-device sync
   */
  const resolveUseRemote = useCallback(
    (conflictId: string) => {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (!conflict) {
        logger.error('Conflict not found:', conflictId);
        return;
      }

      // Domain Layer: Get resolution strategy
      const validation = ConflictResolutionService.canResolve(conflict);
      if (!validation.valid) {
        logger.error('Cannot resolve conflict:', validation.reason);
        return;
      }

      const resolution = ConflictResolutionService.resolveUseRemote(conflict);

      // PHASE 3 FIX: Submit UPDATE operation for sync
      if (conflict.entityType === 'completion') {
        // Find completion index in array
        const completionIndex = completions.findIndex(
          c => c.timestamp === conflict.entityId
        );

        if (completionIndex !== -1) {
          // Submit UPDATE operation (will sync to other devices)
          updateCompletion(completionIndex, resolution.resolvedData as Partial<Completion>);
        } else {
          logger.error('Completion not found for conflict resolution:', conflict.entityId);
        }
      } else {
        // Submit UPDATE operation (will sync to other devices)
        updateArrangement(conflict.entityId, resolution.resolvedData as Partial<Arrangement>);
      }

      // Mark conflict as resolved in state
      onStateUpdate((state) => ({
        ...state,
        conflicts: state.conflicts?.map(c =>
          c.id === conflictId
            ? {
                ...c,
                status: 'resolved' as const,
                resolvedAt: new Date().toISOString(),
                resolution: 'use-remote' as const,
              }
            : c
        ),
      }));

      // PHASE 3: Track resolution in metrics
      ConflictMetricsService.trackConflictResolved(conflict, 'use-remote').catch(err => {
        logger.error('Failed to track conflict resolution:', err);
      });

      logger.info('✅ Conflict resolved: Used remote changes (synced)', { conflictId });
    },
    [conflicts, completions, updateCompletion, updateArrangement, onStateUpdate]
  );

  /**
   * Resolve conflict with manual merge
   * Application Layer: Coordinates manual resolution
   *
   * PHASE 3 FIX: Now submits UPDATE operation for cross-device sync
   */
  const resolveManual = useCallback(
    (conflictId: string, manualData: Partial<Completion> | Partial<Arrangement>) => {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (!conflict) {
        logger.error('Conflict not found:', conflictId);
        return;
      }

      // Domain Layer: Get resolution strategy
      const validation = ConflictResolutionService.canResolve(conflict);
      if (!validation.valid) {
        logger.error('Cannot resolve conflict:', validation.reason);
        return;
      }

      const resolution = ConflictResolutionService.resolveManual(conflict, manualData);

      // PHASE 3 FIX: Submit UPDATE operation for sync
      if (conflict.entityType === 'completion') {
        // Find completion index in array
        const completionIndex = completions.findIndex(
          c => c.timestamp === conflict.entityId
        );

        if (completionIndex !== -1) {
          // Submit UPDATE operation (will sync to other devices)
          updateCompletion(completionIndex, resolution.resolvedData as Partial<Completion>);
        } else {
          logger.error('Completion not found for conflict resolution:', conflict.entityId);
        }
      } else {
        // Submit UPDATE operation (will sync to other devices)
        updateArrangement(conflict.entityId, resolution.resolvedData as Partial<Arrangement>);
      }

      // Mark conflict as resolved in state
      onStateUpdate((state) => ({
        ...state,
        conflicts: state.conflicts?.map(c =>
          c.id === conflictId
            ? {
                ...c,
                status: 'resolved' as const,
                resolvedAt: new Date().toISOString(),
                resolution: 'manual' as const,
              }
            : c
        ),
      }));

      // PHASE 3: Track resolution in metrics
      ConflictMetricsService.trackConflictResolved(conflict, 'manual').catch(err => {
        logger.error('Failed to track conflict resolution:', err);
      });

      logger.info('✅ Conflict resolved: Manual merge (synced)', { conflictId });
    },
    [conflicts, completions, updateCompletion, updateArrangement, onStateUpdate]
  );

  /**
   * Dismiss conflict without resolving
   * Application Layer: Marks conflict as dismissed
   */
  const dismissConflict = useCallback(
    (conflictId: string) => {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (!conflict) {
        logger.error('Conflict not found:', conflictId);
        return;
      }

      // Domain Layer: Dismiss conflict
      ConflictResolutionService.dismissConflict(conflict);

      // Application Layer: Update state
      onStateUpdate((state) => ({
        ...state,
        conflicts: state.conflicts?.map(c =>
          c.id === conflictId
            ? {
                ...c,
                status: 'dismissed' as const,
                resolvedAt: new Date().toISOString(),
              }
            : c
        ),
      }));

      // PHASE 3: Track dismissal in metrics
      ConflictMetricsService.trackConflictDismissed(conflict).catch(err => {
        logger.error('Failed to track conflict dismissal:', err);
      });

      logger.info('✅ Conflict dismissed', { conflictId });
    },
    [conflicts, onStateUpdate]
  );

  /**
   * Clear resolved/dismissed conflicts from state
   * Application Layer: Cleanup old conflicts
   */
  const clearResolvedConflicts = useCallback(() => {
    onStateUpdate((state) => ({
      ...state,
      conflicts: state.conflicts?.filter(c => c.status === 'pending'),
    }));

    logger.info('🗑️ Cleared resolved conflicts');
  }, [onStateUpdate]);

  return {
    pendingConflicts,
    resolvedConflicts,
    resolveKeepLocal,
    resolveUseRemote,
    resolveManual,
    dismissConflict,
    clearResolvedConflicts,
  };
}
