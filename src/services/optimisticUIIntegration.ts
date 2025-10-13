// src/services/optimisticUIIntegration.ts
/**
 * Optimistic UI Integration Layer
 *
 * Connects the optimistic UI system with existing sync and state management.
 * Provides hooks and utilities for seamless integration without breaking existing code.
 *
 * Feature: Optimistic UI with Change Tracking (DISABLED by default)
 */

import type { AppState } from '../types';
import { optimisticUI } from './optimisticUI';
import { changeTracker, type ChangeType } from './changeTracker';
import { filterEcho, isEntityUpdateEcho, recordFilterResult } from '../utils/echoFilter';
import { logger } from '../utils/logger';

export interface OptimisticUIHooks {
  // Called before a state-changing action
  beforeAction?: (actionType: ChangeType, currentState: AppState) => Promise<void>;

  // Called after action is applied locally
  afterAction?: (actionType: ChangeType, newState: AppState, updateId: string) => Promise<void>;

  // Called when cloud sync confirms the update
  onSyncConfirmed?: (actionType: ChangeType, cloudState: AppState) => Promise<void>;

  // Called when sync fails
  onSyncFailed?: (actionType: ChangeType, error: string, rollbackState: AppState) => Promise<void>;
}

/**
 * Wrap a state-changing action with optimistic UI handling
 */
export async function withOptimisticUI<T>(
  actionType: ChangeType,
  previousState: AppState,
  action: () => Promise<{ newState: AppState; result: T }>,
  options?: {
    entityId?: string;
    entityIndex?: number;
    metadata?: Record<string, any>;
    hooks?: OptimisticUIHooks;
  }
): Promise<T> {
  // If optimistic UI is disabled, just run the action normally
  if (!optimisticUI.isEnabled()) {
    const { result } = await action();
    return result;
  }

  try {
    // Execute before hooks
    await options?.hooks?.beforeAction?.(actionType, previousState);

    // Execute the action
    const { newState, result } = await action();

    // Apply optimistic update
    const updateId = await optimisticUI.applyUpdate(
      actionType,
      previousState,
      newState,
      {
        entityId: options?.entityId,
        entityIndex: options?.entityIndex,
        metadata: options?.metadata,
        onConfirmed: async (update) => {
          if (import.meta.env.DEV) {
            logger.info('✅ Optimistic update confirmed:', {
              updateId: update.id,
              type: update.type,
            });
          }
          await options?.hooks?.onSyncConfirmed?.(actionType, update.expectedState);
        },
        onFailed: async (update) => {
          logger.error('❌ Optimistic update failed:', {
            updateId: update.id,
            type: update.type,
            error: update.error,
          });

          // Get rollback state
          const rollbackState = optimisticUI.getRollbackState(updateId);
          if (rollbackState) {
            await options?.hooks?.onSyncFailed?.(actionType, update.error || 'Unknown error', rollbackState);
          }
        },
        onConflict: async (update) => {
          logger.warn('⚠️ Optimistic update conflict:', {
            updateId: update.id,
            type: update.type,
          });
          // For now, just log - can add custom conflict resolution later
        },
      }
    );

    // Execute after hooks
    await options?.hooks?.afterAction?.(actionType, newState, updateId);

    return result;
  } catch (error) {
    logger.error('Failed to execute action with optimistic UI:', error);
    throw error;
  }
}

/**
 * Filter incoming cloud updates to detect and skip echoes
 */
export async function filterCloudUpdate(
  cloudState: AppState,
  options?: {
    deviceId?: string;
    timestamp?: string | number;
    version?: number;
    checksum?: string;
  }
): Promise<{ shouldApply: boolean; reason?: string; confidence: number }> {
  // If optimistic UI is disabled, always apply updates
  if (!optimisticUI.isEnabled()) {
    return {
      shouldApply: true,
      reason: 'Optimistic UI disabled - applying all updates',
      confidence: 1.0,
    };
  }

  try {
    const result = await filterEcho(cloudState, options);

    // Record statistics
    recordFilterResult(result);

    if (result.isEcho && import.meta.env.DEV) {
      logger.info('🔍 Echo detected and filtered:', {
        reason: result.reason,
        confidence: result.confidence,
      });
    }

    return {
      shouldApply: result.shouldApply,
      reason: result.reason,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.error('Error filtering cloud update:', error);
    // On error, allow the update (safer)
    return {
      shouldApply: true,
      reason: 'Filter error - applying update',
      confidence: 0,
    };
  }
}

/**
 * Check if a specific entity update is an echo
 */
export async function isEntityEcho(
  entityType: 'address' | 'arrangement' | 'completion' | 'session',
  entityId: string | number,
  cloudState: AppState,
  options?: {
    deviceId?: string;
    timestamp?: string | number;
    version?: number;
    checksum?: string;
  }
): Promise<boolean> {
  // If optimistic UI is disabled, nothing is an echo
  if (!optimisticUI.isEnabled()) {
    return false;
  }

  try {
    return await isEntityUpdateEcho(entityType, entityId, cloudState, options);
  } catch (error) {
    logger.error('Error checking entity echo:', error);
    // On error, assume not an echo (safer)
    return false;
  }
}

/**
 * Confirm an optimistic update when cloud sync succeeds
 */
export async function confirmCloudSync(updateId: string, cloudState?: AppState): Promise<void> {
  if (!optimisticUI.isEnabled()) {
    return;
  }

  try {
    await optimisticUI.confirmUpdate(updateId, cloudState);
  } catch (error) {
    logger.error('Error confirming optimistic update:', error);
  }
}

/**
 * Fail an optimistic update when cloud sync fails
 */
export async function failCloudSync(updateId: string, error: string): Promise<void> {
  if (!optimisticUI.isEnabled()) {
    return;
  }

  try {
    await optimisticUI.failUpdate(updateId, error);
  } catch (err) {
    logger.error('Error failing optimistic update:', err);
  }
}

/**
 * Get statistics for monitoring and debugging
 */
export function getOptimisticUIStats() {
  return {
    optimisticUI: optimisticUI.getStats(),
    changeTracker: changeTracker.getStats(),
  };
}

/**
 * Enable the optimistic UI system
 */
export async function enableOptimisticUI(): Promise<void> {
  try {
    await optimisticUI.enable();
    logger.info('✅ Optimistic UI system ENABLED');
  } catch (error) {
    logger.error('Failed to enable optimistic UI:', error);
    throw error;
  }
}

/**
 * Disable the optimistic UI system
 */
export function disableOptimisticUI(): void {
  try {
    optimisticUI.disable();
    logger.info('❌ Optimistic UI system DISABLED');
  } catch (error) {
    logger.error('Failed to disable optimistic UI:', error);
    throw error;
  }
}

/**
 * Check if optimistic UI is enabled
 */
export function isOptimisticUIEnabled(): boolean {
  return optimisticUI.isEnabled();
}

/**
 * Rollback all pending optimistic updates (emergency use)
 */
export function rollbackAllOptimisticUpdates(): AppState[] {
  if (!optimisticUI.isEnabled()) {
    return [];
  }

  try {
    const rollbackStates = optimisticUI.rollbackAll();
    logger.warn(`↩️ Rolled back ${rollbackStates.length} optimistic updates`);
    return rollbackStates;
  } catch (error) {
    logger.error('Error rolling back optimistic updates:', error);
    return [];
  }
}

/**
 * Clear all optimistic UI state (use with caution!)
 */
export async function clearOptimisticUIState(): Promise<void> {
  if (!optimisticUI.isEnabled()) {
    return;
  }

  try {
    optimisticUI.clearAll();
    await changeTracker.clearAll();
    logger.warn('🧹 Cleared all optimistic UI state');
  } catch (error) {
    logger.error('Error clearing optimistic UI state:', error);
    throw error;
  }
}

/**
 * Integration hook for cloud sync subscriptions
 *
 * Use this in subscribeToData to filter incoming cloud updates
 */
export async function handleIncomingCloudUpdate(
  cloudState: AppState,
  options?: {
    deviceId?: string;
    timestamp?: string;
    version?: number;
    checksum?: string;
  }
): Promise<AppState | null> {
  // Filter for echoes
  const filterResult = await filterCloudUpdate(cloudState, options);

  if (!filterResult.shouldApply) {
    if (import.meta.env.DEV) {
      logger.info('🚫 Skipping echo update:', {
        reason: filterResult.reason,
        confidence: filterResult.confidence,
      });
    }
    return null; // Skip this update
  }

  // Update is not an echo, return it for application
  return cloudState;
}

/**
 * Integration hook for state-changing actions
 *
 * Use this wrapper in useAppState actions like complete(), setActive(), etc.
 */
export function createOptimisticAction<TArgs extends any[], TResult>(
  actionType: ChangeType,
  originalAction: (...args: TArgs) => Promise<TResult>,
  options?: {
    getEntityInfo?: (...args: TArgs) => { entityId?: string; entityIndex?: number };
    getPreviousState?: () => AppState;
    getNewState?: (result: TResult) => AppState;
  }
) {
  return async (...args: TArgs): Promise<TResult> => {
    // If optimistic UI is disabled, just run the original action
    if (!optimisticUI.isEnabled()) {
      return await originalAction(...args);
    }

    const previousState = options?.getPreviousState?.() || ({} as AppState);
    const entityInfo = options?.getEntityInfo?.(...args);

    return await withOptimisticUI(
      actionType,
      previousState,
      async () => {
        const result = await originalAction(...args);
        const newState = options?.getNewState?.(result) || ({} as AppState);
        return { result, newState };
      },
      {
        entityId: entityInfo?.entityId,
        entityIndex: entityInfo?.entityIndex,
      }
    );
  };
}
