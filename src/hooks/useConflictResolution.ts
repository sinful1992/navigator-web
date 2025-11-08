// src/hooks/useConflictResolution.ts
// PHASE 3: Conflict Resolution Hook (Application Layer)
// Clean Architecture: Application layer orchestrates conflict resolution

import { useCallback, useMemo, useEffect, useRef } from 'react';
import type { AppState, VersionConflict, Completion, Arrangement } from '../types';
import { ConflictResolutionService } from '../services/ConflictResolutionService';
import { ConflictMetricsService } from '../services/ConflictMetricsService';
import { logger } from '../utils/logger';

// Type for submitOperation callback
type SubmitOperationCallback = (operation: { type: string; payload: any }) => Promise<void>;

export interface UseConflictResolutionProps {
  conflicts: VersionConflict[];
  completions: Completion[];
  arrangements: Arrangement[];
  onStateUpdate: (updater: (state: AppState) => AppState) => void;
  // PHASE 3 FIX: Operation submission for sync
  updateCompletion: (index: number, updates: Partial<Completion>) => void;
  updateArrangement: (id: string, updates: Partial<Arrangement>) => void;
  submitOperation?: SubmitOperationCallback;
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
  arrangements: _arrangements, // Prefix with _ to indicate intentionally unused (may be needed in future)
  onStateUpdate,
  updateCompletion,
  updateArrangement,
  submitOperation,
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

  // PHASE 3: Auto-cleanup resolved/dismissed conflicts after 24 hours
  useEffect(() => {
    const cleanupOldConflicts = () => {
      const now = new Date().getTime();
      const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

      const conflictsToRemove = resolvedConflicts.filter(c => {
        if (!c.resolvedAt) return false;
        const resolvedTime = new Date(c.resolvedAt).getTime();
        return (now - resolvedTime) > CLEANUP_AGE_MS;
      });

      if (conflictsToRemove.length > 0) {
        onStateUpdate((state) => ({
          ...state,
          conflicts: state.conflicts?.filter(c =>
            !conflictsToRemove.some(removed => removed.id === c.id)
          ),
        }));

        logger.info('🗑️ Auto-cleanup: Removed old resolved conflicts', {
          count: conflictsToRemove.length,
        });
      }
    };

    // Run cleanup every hour
    const interval = setInterval(cleanupOldConflicts, 60 * 60 * 1000);

    // Run once on mount
    cleanupOldConflicts();

    return () => clearInterval(interval);
  }, [resolvedConflicts, onStateUpdate]);

  // PHASE 3: Auto-dismiss stale pending conflicts after 7 days
  useEffect(() => {
    const dismissStaleConflicts = () => {
      const now = new Date().getTime();
      const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

      const staleConflicts = pendingConflicts.filter(c => {
        const detectedTime = new Date(c.timestamp).getTime();
        return (now - detectedTime) > STALE_AGE_MS;
      });

      if (staleConflicts.length > 0) {
        // Dismiss all stale conflicts
        onStateUpdate((state) => ({
          ...state,
          conflicts: state.conflicts?.map(c =>
            staleConflicts.some(stale => stale.id === c.id)
              ? {
                  ...c,
                  status: 'dismissed' as const,
                  resolvedAt: new Date().toISOString(),
                }
              : c
          ),
        }));

        // Track dismissals in metrics
        staleConflicts.forEach(conflict => {
          ConflictMetricsService.trackConflictDismissed(conflict).catch(err => {
            logger.error('Failed to track auto-dismissal:', err);
          });
        });

        logger.warn('⏰ Auto-dismiss: Stale conflicts auto-dismissed', {
          count: staleConflicts.length,
          ages: staleConflicts.map(c => {
            const days = (now - new Date(c.timestamp).getTime()) / (24 * 60 * 60 * 1000);
            return `${days.toFixed(1)} days`;
          }),
        });
      }
    };

    // Run stale check every 6 hours
    const interval = setInterval(dismissStaleConflicts, 6 * 60 * 60 * 1000);

    // Run once on mount
    dismissStaleConflicts();

    return () => clearInterval(interval);
  }, [pendingConflicts, onStateUpdate]);

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

      // Domain Layer: Validate conflict can be resolved
      const validation = ConflictResolutionService.canResolve(conflict);
      if (!validation.valid) {
        logger.error('Cannot resolve conflict:', validation.reason);
        return;
      }

      // For keep-local strategy, no data changes needed (local version stays)
      // Just need to mark conflict as resolved
      ConflictResolutionService.resolveKeepLocal(conflict); // Logs the resolution

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

      // Submit CONFLICT_RESOLVE operation for persistence
      if (submitOperation) {
        submitOperation({
          type: 'CONFLICT_RESOLVE',
          payload: { conflictId, resolution: 'keep-local' },
        }).catch(err => {
          logger.error('Failed to submit conflict resolve operation:', err);
        });
      }

      // PHASE 3: Track resolution in metrics
      ConflictMetricsService.trackConflictResolved(conflict, 'keep-local').catch(err => {
        logger.error('Failed to track conflict resolution:', err);
      });

      logger.info('✅ Conflict resolved: Kept local changes', { conflictId });
    },
    [conflicts, onStateUpdate, submitOperation]
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

      // Submit CONFLICT_RESOLVE operation for persistence
      if (submitOperation) {
        submitOperation({
          type: 'CONFLICT_RESOLVE',
          payload: { conflictId, resolution: 'use-remote' },
        }).catch(err => {
          logger.error('Failed to submit conflict resolve operation:', err);
        });
      }

      // PHASE 3: Track resolution in metrics
      ConflictMetricsService.trackConflictResolved(conflict, 'use-remote').catch(err => {
        logger.error('Failed to track conflict resolution:', err);
      });

      logger.info('✅ Conflict resolved: Used remote changes (synced)', { conflictId });
    },
    [conflicts, completions, updateCompletion, updateArrangement, onStateUpdate, submitOperation]
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

      // Submit CONFLICT_RESOLVE operation for persistence
      if (submitOperation) {
        submitOperation({
          type: 'CONFLICT_RESOLVE',
          payload: { conflictId, resolution: 'manual' },
        }).catch(err => {
          logger.error('Failed to submit conflict resolve operation:', err);
        });
      }

      // PHASE 3: Track resolution in metrics
      ConflictMetricsService.trackConflictResolved(conflict, 'manual').catch(err => {
        logger.error('Failed to track conflict resolution:', err);
      });

      logger.info('✅ Conflict resolved: Manual merge (synced)', { conflictId });
    },
    [conflicts, completions, updateCompletion, updateArrangement, onStateUpdate, submitOperation]
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

      // Submit CONFLICT_DISMISS operation for persistence
      if (submitOperation) {
        submitOperation({
          type: 'CONFLICT_DISMISS',
          payload: { conflictId },
        }).catch(err => {
          logger.error('Failed to submit conflict dismiss operation:', err);
        });
      }

      // PHASE 3: Track dismissal in metrics
      ConflictMetricsService.trackConflictDismissed(conflict).catch(err => {
        logger.error('Failed to track conflict dismissal:', err);
      });

      logger.info('✅ Conflict dismissed', { conflictId });
    },
    [conflicts, onStateUpdate, submitOperation]
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
