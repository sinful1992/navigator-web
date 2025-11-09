// src/utils/syncDiagnostics.ts
// Diagnostic and repair utilities for sync issues

import { supabase } from '../lib/supabaseClient';
import { getOperationLog } from '../sync/operationLog';
import { setSequenceAsync } from '../sync/operations';
import { retryQueueManager } from '../sync/retryQueue';
import { getDeadLetterQueue } from '../sync/deadLetterQueue';
import { logger } from './logger';

/**
 * Diagnostic information about sync state
 */
export interface SyncDiagnostics {
  localMaxSequence: number;
  cloudMaxSequence: number;
  localLastSynced: string | null;
  gap: number;
  unsyncedCount: number;
  retryQueueCount: number;
  deadLetterCount: number;
  sequenceCollisions: Array<{ sequence: number; reason: string }>;
  recommendation: string;
}

/**
 * Diagnose sync issues
 * Call this to understand what's wrong with sync
 */
export async function diagnoseSyncIssues(userId: string, deviceId: string): Promise<SyncDiagnostics> {
  logger.info('🔍 DIAGNOSTICS: Starting sync diagnostics...');

  // Get local operation log
  const operationLog = getOperationLog(deviceId, userId);
  await operationLog.load();

  const logState = operationLog.getLogState();
  const localOps = operationLog.getAllOperations();
  const localMaxSeq = localOps.length > 0 ? Math.max(...localOps.map(op => op.sequence)) : 0;
  const unsyncedOps = operationLog.getUnsyncedOperations();

  // Get cloud max sequence
  let cloudMaxSeq = 0;
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('navigator_operations')
        .select('sequence_number')
        .eq('user_id', userId)
        .order('sequence_number', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        cloudMaxSeq = data[0].sequence_number;
      }
    } catch (err) {
      logger.error('Failed to fetch cloud max sequence:', err);
    }
  }

  // Get retry queue and dead letter queue stats
  const retryStats = await retryQueueManager.getQueueStats();
  const dlq = getDeadLetterQueue();
  const dlqStats = await dlq.getStats();

  // Detect sequence collisions (unsynced operations with sequences <= cloudMaxSeq)
  const collisions: Array<{ sequence: number; reason: string }> = [];
  for (const op of unsyncedOps) {
    if (op.sequence <= cloudMaxSeq) {
      collisions.push({
        sequence: op.sequence,
        reason: `Local operation has sequence ${op.sequence} but cloud already has sequences up to ${cloudMaxSeq}`,
      });
    }
  }

  // Calculate gap
  const gap = Math.abs(cloudMaxSeq - localMaxSeq);

  // Generate recommendation
  let recommendation = '';
  if (collisions.length > 0) {
    recommendation = `CRITICAL: ${collisions.length} sequence collisions detected. Run repairSequenceCollisions() to fix.`;
  } else if (gap > 100) {
    recommendation = `WARNING: Large gap (${gap}) between local and cloud sequences. Consider running syncMissingOperations().`;
  } else if (retryStats.total > 0) {
    recommendation = `${retryStats.total} operations in retry queue. Wait for automatic retry or run forceRetryAll().`;
  } else if (dlqStats.total > 0) {
    recommendation = `${dlqStats.total} operations in dead letter queue (permanently failed). Review and retry manually if needed.`;
  } else {
    recommendation = 'Sync appears healthy. No issues detected.';
  }

  const diagnostics: SyncDiagnostics = {
    localMaxSequence: localMaxSeq,
    cloudMaxSequence: cloudMaxSeq,
    localLastSynced: logState.lastSyncTimestamp,
    gap,
    unsyncedCount: unsyncedOps.length,
    retryQueueCount: retryStats.total,
    deadLetterCount: dlqStats.total,
    sequenceCollisions: collisions,
    recommendation,
  };

  logger.info('🔍 DIAGNOSTICS COMPLETE:', diagnostics);
  return diagnostics;
}

/**
 * Repair sequence collisions by reassigning local operations
 * This fixes the "duplicate key constraint" error
 */
export async function repairSequenceCollisions(userId: string, deviceId: string): Promise<{
  success: boolean;
  reassignedCount: number;
  errors: string[];
}> {
  logger.info('🔧 REPAIR: Starting sequence collision repair...');

  const errors: string[] = [];
  let reassignedCount = 0;

  try {
    // Get local operation log
    const operationLog = getOperationLog(deviceId, userId);
    await operationLog.load();

    // Get cloud max sequence
    let cloudMaxSeq = 0;
    if (supabase && userId) {
      const { data, error } = await supabase
        .from('navigator_operations')
        .select('sequence_number')
        .eq('user_id', userId)
        .order('sequence_number', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        cloudMaxSeq = data[0].sequence_number;
      } else if (error) {
        throw new Error(`Failed to fetch cloud sequences: ${error.message}`);
      }
    }

    logger.info('🔧 REPAIR: Cloud max sequence:', cloudMaxSeq);

    // Get unsynced operations
    const unsyncedOps = operationLog.getUnsyncedOperations();
    logger.info('🔧 REPAIR: Found', unsyncedOps.length, 'unsynced operations');

    // Find operations with sequence collisions
    const collidingOps = unsyncedOps.filter(op => op.sequence <= cloudMaxSeq);
    logger.info('🔧 REPAIR: Found', collidingOps.length, 'colliding operations');

    if (collidingOps.length === 0) {
      logger.info('✅ REPAIR: No collisions to fix');
      return { success: true, reassignedCount: 0, errors: [] };
    }

    // Update sequence generator to start after cloud max
    await setSequenceAsync(cloudMaxSeq);
    logger.info('🔧 REPAIR: Updated sequence generator to', cloudMaxSeq);

    // Reassign sequences to colliding operations
    // Sort by current sequence to maintain relative order
    collidingOps.sort((a, b) => a.sequence - b.sequence);

    for (const op of collidingOps) {
      try {
        // Generate new sequence
        const { nextSequence } = await import('../sync/operations');
        const newSeq = await nextSequence();

        logger.info('🔧 REPAIR: Reassigning operation', {
          id: op.id,
          type: op.type,
          oldSequence: op.sequence,
          newSequence: newSeq,
        });

        // Update in operation log
        await operationLog.updateOperationSequence(op.id, newSeq);

        // Remove from retry queue if present
        try {
          await retryQueueManager.removeFromQueue(op.sequence);
        } catch {
          // Ignore if not in queue
        }

        reassignedCount++;
      } catch (err) {
        const errorMsg = `Failed to reassign operation ${op.id}: ${err}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Note: markSyncedUpTo now requires timestamp, not sequence
    // Since we've reassigned sequences, we don't need to call this
    // The next sync will handle marking operations as synced by timestamp

    logger.info('✅ REPAIR: Complete', {
      reassignedCount,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      reassignedCount,
      errors,
    };
  } catch (err) {
    const errorMsg = `Repair failed: ${err}`;
    logger.error(errorMsg);
    return {
      success: false,
      reassignedCount,
      errors: [errorMsg, ...errors],
    };
  }
}

/**
 * Clear all retry queue and dead letter queue items
 * Use this as a last resort if sync is completely broken
 */
export async function clearAllFailedOperations(): Promise<void> {
  logger.warn('🗑️ CLEAR: Clearing all failed operations...');

  // Clear retry queue
  await retryQueueManager.clearQueue();

  // Clear dead letter queue
  const dlq = getDeadLetterQueue();
  await dlq.clear();

  logger.info('✅ CLEAR: All failed operations cleared');
}

/**
 * Get detailed status for display in UI
 */
export async function getSyncStatus(userId: string, deviceId: string): Promise<{
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details: any;
}> {
  const diagnostics = await diagnoseSyncIssues(userId, deviceId);

  let status: 'healthy' | 'warning' | 'error' = 'healthy';
  let message = 'All operations synced successfully';

  if (diagnostics.sequenceCollisions.length > 0) {
    status = 'error';
    message = `${diagnostics.sequenceCollisions.length} operations blocked by sequence collisions`;
  } else if (diagnostics.retryQueueCount > 0) {
    status = 'warning';
    message = `${diagnostics.retryQueueCount} operations pending retry`;
  } else if (diagnostics.deadLetterCount > 0) {
    status = 'warning';
    message = `${diagnostics.deadLetterCount} operations permanently failed`;
  } else if (diagnostics.unsyncedCount > 0) {
    status = 'warning';
    message = `${diagnostics.unsyncedCount} operations waiting to sync`;
  }

  return {
    status,
    message,
    details: diagnostics,
  };
}
