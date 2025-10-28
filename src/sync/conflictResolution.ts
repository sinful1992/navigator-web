// src/sync/conflictResolution.ts - Conflict resolution for concurrent operations
// PHASE 1.3: Vector clock-based conflict detection and resolution
import type { Operation } from './operations';
import type { AppState } from '../types';
import type { VectorClock } from './operationLog';
import { OperationLogManager } from './operationLog';
import { logger } from '../utils/logger';

/**
 * Represents a conflict between operations
 */
export type OperationConflict = {
  operation1: Operation;
  operation2: Operation;
  conflictType: 'duplicate' | 'concurrent_edit' | 'dependency_violation' | 'race_condition';
  description: string;
};

/**
 * Result of conflict resolution
 */
export type ConflictResolution = {
  resolvedOperations: Operation[];
  rejectedOperations: Operation[];
  transformedOperations: Operation[];
};

/**
 * PHASE 1.3: Conflict metrics for monitoring
 */
export type ConflictMetrics = {
  totalConflicts: number;
  conflictsByType: Record<string, number>;
  resolutionsByStrategy: Record<string, number>;
  dataLossEvents: number;
};

/**
 * PHASE 1.3: Outcome priority for concurrent completions
 * Higher priority wins in concurrent scenarios
 */
const OUTCOME_PRIORITY: Record<string, number> = {
  'PIF': 4,      // Paid in Full - highest priority
  'ARR': 3,      // Arrangement - medium-high
  'Done': 2,     // Done - medium
  'DA': 1,       // Did not attend - lowest priority
};

/**
 * PHASE 1.3: Global conflict metrics
 */
let conflictMetrics: ConflictMetrics = {
  totalConflicts: 0,
  conflictsByType: {},
  resolutionsByStrategy: {},
  dataLossEvents: 0,
};

/**
 * PHASE 1.3: Helper function to detect concurrency using vector clocks
 * Returns true if operations are concurrent (neither happened before the other)
 */
function detectConcurrency(
  op1: Operation,
  op2: Operation,
  manager?: OperationLogManager
): boolean {
  // If manager provided and both operations have vector clocks, use vector clock comparison
  if (manager && op1.vectorClock && op2.vectorClock) {
    const relationship = manager.compareVectorClocks(op1.vectorClock, op2.vectorClock);
    return relationship === 'concurrent';
  }

  // Fallback to timestamp-based detection (weak indicator, but better than nothing)
  // Operations are considered concurrent if timestamps are within 1 second
  const time1 = new Date(op1.timestamp).getTime();
  const time2 = new Date(op2.timestamp).getTime();
  return Math.abs(time1 - time2) < 1000;
}

/**
 * Detects conflicts between operations
 * PHASE 1.3: Now accepts optional OperationLogManager for vector clock comparison
 */
export function detectConflicts(
  operation: Operation,
  existingOperations: Operation[],
  _currentState: AppState,
  manager?: OperationLogManager
): OperationConflict[] {
  const conflicts: OperationConflict[] = [];

  for (const existing of existingOperations) {
    const conflict = detectConflictBetween(operation, existing, _currentState, manager);
    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Detects conflict between two specific operations
 * PHASE 1.3: Uses vector clocks for more reliable concurrency detection
 */
function detectConflictBetween(
  op1: Operation,
  op2: Operation,
  _currentState: AppState,
  manager?: OperationLogManager
): OperationConflict | null {
  // Same operation ID = exact duplicate
  if (op1.id === op2.id) {
    return {
      operation1: op1,
      operation2: op2,
      conflictType: 'duplicate',
      description: 'Exact duplicate operation',
    };
  }

  // Check for specific conflict types
  switch (op1.type) {
    case 'COMPLETION_CREATE':
      if (op2.type === 'COMPLETION_CREATE') {
        const comp1 = op1.payload.completion;
        const comp2 = op2.payload.completion;

        // Same address, same list version = potential conflict
        if (comp1.index === comp2.index && comp1.listVersion === comp2.listVersion) {
          // PHASE 1.3: Check if these completions are actually concurrent
          // If they're causally related, only one truly happened at this address
          const isConcurrent = detectConcurrency(op1, op2, manager);

          if (isConcurrent) {
            return {
              operation1: op1,
              operation2: op2,
              conflictType: 'duplicate',
              description: `Concurrent completion of address ${comp1.index}`,
            };
          }
        }
      }
      break;

    case 'ACTIVE_INDEX_SET':
      if (op2.type === 'ACTIVE_INDEX_SET') {
        // PHASE 1.3: Use vector clocks for reliable concurrency detection
        // Vector clocks are more reliable than sequence proximity
        const isConcurrent = detectConcurrency(op1, op2, manager);

        if (isConcurrent) {
          return {
            operation1: op1,
            operation2: op2,
            conflictType: 'race_condition',
            description: `Concurrent active index changes (detected via vector clock)`,
          };
        }
      }
      break;

    case 'ARRANGEMENT_UPDATE':
      if (op2.type === 'ARRANGEMENT_UPDATE') {
        const arr1 = op1.payload;
        const arr2 = op2.payload;

        // Same arrangement = concurrent edit
        if (arr1.id === arr2.id) {
          return {
            operation1: op1,
            operation2: op2,
            conflictType: 'concurrent_edit',
            description: `Concurrent edits to arrangement ${arr1.id}`,
          };
        }
      }
      break;

    case 'SESSION_START':
      if (op2.type === 'SESSION_START') {
        const sess1 = op1.payload.session;
        const sess2 = op2.payload.session;

        // Same date = concurrent session start
        if (sess1.date === sess2.date) {
          return {
            operation1: op1,
            operation2: op2,
            conflictType: 'duplicate',
            description: `Concurrent session start for ${sess1.date}`,
          };
        }
      }
      break;
  }

  return null;
}

/**
 * Resolves conflicts using deterministic rules
 * PHASE 1.3: Now accepts optional OperationLogManager for vector clock-aware resolution
 */
export function resolveConflicts(
  conflicts: OperationConflict[],
  _currentState: AppState,
  manager?: OperationLogManager
): ConflictResolution {
  const resolvedOperations: Operation[] = [];
  const rejectedOperations: Operation[] = [];
  const transformedOperations: Operation[] = [];

  for (const conflict of conflicts) {
    const resolution = resolveConflict(conflict, _currentState, manager);

    resolvedOperations.push(...resolution.resolvedOperations);
    rejectedOperations.push(...resolution.rejectedOperations);
    transformedOperations.push(...resolution.transformedOperations);

    // PHASE 1.3: Track conflict metrics
    trackConflict(conflict, resolution);
  }

  return {
    resolvedOperations,
    rejectedOperations,
    transformedOperations,
  };
}

/**
 * Resolves a single conflict using type-specific rules
 * PHASE 1.3: Enhanced with vector clock-aware resolution strategies
 */
function resolveConflict(
  conflict: OperationConflict,
  _currentState: AppState,
  manager?: OperationLogManager
): ConflictResolution {
  const { operation1: op1, operation2: op2, conflictType } = conflict;

  logger.info('Resolving conflict:', {
    type: conflictType,
    op1Type: op1.type,
    op2Type: op2.type,
    description: conflict.description,
  });

  switch (conflictType) {
    case 'duplicate':
      // PHASE 1.3: For concurrent completions, use priority-based resolution
      if (op1.type === 'COMPLETION_CREATE' && op2.type === 'COMPLETION_CREATE') {
        return resolveConcurrentCompletions(op1, op2, manager);
      }
      return resolveDuplicateConflict(op1, op2);

    case 'race_condition':
      // PHASE 1.3: For concurrent active index, use vector clock causality
      if (op1.type === 'ACTIVE_INDEX_SET' && op2.type === 'ACTIVE_INDEX_SET') {
        return resolveConcurrentActiveIndex(op1, op2, manager);
      }
      return resolveRaceCondition(op1, op2);

    case 'concurrent_edit':
      return resolveConcurrentEdit(op1, op2, _currentState);

    case 'dependency_violation':
      return resolveDependencyViolation(op1, op2, _currentState);

    default:
      logger.warn('Unknown conflict type, keeping first operation:', conflictType);
      return {
        resolvedOperations: [op1],
        rejectedOperations: [op2],
        transformedOperations: [],
      };
  }
}

/**
 * PHASE 1.3: Resolve concurrent completions using priority-based strategy
 * Higher priority outcomes win in concurrent scenarios
 * Same priority: first-writer-wins based on vector clock causality
 */
function resolveConcurrentCompletions(
  op1: Operation,
  op2: Operation,
  manager?: OperationLogManager
): ConflictResolution {
  const comp1 = op1.payload.completion;
  const comp2 = op2.payload.completion;

  // Get outcome priorities (default to 0 for unknown outcomes)
  const priority1 = OUTCOME_PRIORITY[comp1.outcome] || 0;
  const priority2 = OUTCOME_PRIORITY[comp2.outcome] || 0;

  // Different priorities: highest priority wins
  if (priority1 !== priority2) {
    const winner = priority1 > priority2 ? op1 : op2;
    const loser = winner === op1 ? op2 : op1;

    logger.info('Resolved concurrent completion by priority:', {
      winner: winner.payload.completion.outcome,
      priority: Math.max(priority1, priority2),
      loser: loser.payload.completion.outcome,
    });

    trackConflictMetric('resolution_strategy', 'priority_based');

    return {
      resolvedOperations: [winner],
      rejectedOperations: [loser],
      transformedOperations: [],
    };
  }

  // Same priority: use vector clock causality if available
  if (manager && op1.vectorClock && op2.vectorClock) {
    const relationship = manager.compareVectorClocks(op1.vectorClock, op2.vectorClock);

    if (relationship === 'before') {
      // op1 happened before op2 - keep op1 (first writer wins)
      logger.info('Resolved concurrent completion by vector clock causality:', {
        outcome: comp1.outcome,
        winner: 'op1 (before op2)',
      });

      trackConflictMetric('resolution_strategy', 'first_writer_wins');

      return {
        resolvedOperations: [op1],
        rejectedOperations: [op2],
        transformedOperations: [],
      };
    } else if (relationship === 'after') {
      logger.info('Resolved concurrent completion by vector clock causality:', {
        outcome: comp2.outcome,
        winner: 'op2 (before op1)',
      });

      trackConflictMetric('resolution_strategy', 'first_writer_wins');

      return {
        resolvedOperations: [op2],
        rejectedOperations: [op1],
        transformedOperations: [],
      };
    }
    // If concurrent, fall through to timestamp tiebreaker
  }

  // Concurrent and same priority: use timestamp + clientId tiebreaker
  logger.info('Resolved concurrent completion by timestamp tiebreaker:', {
    outcome: comp1.outcome,
    op1Timestamp: op1.timestamp,
    op2Timestamp: op2.timestamp,
  });

  trackConflictMetric('resolution_strategy', 'timestamp_tiebreaker');

  return resolveRaceCondition(op1, op2);
}

/**
 * PHASE 1.3: Resolve concurrent active index changes
 * Uses vector clock causality to determine correct operation order
 */
function resolveConcurrentActiveIndex(
  op1: Operation,
  op2: Operation,
  manager?: OperationLogManager
): ConflictResolution {
  // Try to use vector clock causality if available
  if (manager && op1.vectorClock && op2.vectorClock) {
    const relationship = manager.compareVectorClocks(op1.vectorClock, op2.vectorClock);

    if (relationship === 'before') {
      // op1 happened before op2 - apply op2 (it came later)
      logger.info('Resolved concurrent active index by vector clock causality:', {
        winner: op2.payload.index,
        loser: op1.payload.index,
        reason: 'op2 happened after op1',
      });

      trackConflictMetric('resolution_strategy', 'causality_based');

      return {
        resolvedOperations: [op2],
        rejectedOperations: [op1],
        transformedOperations: [],
      };
    } else if (relationship === 'after') {
      logger.info('Resolved concurrent active index by vector clock causality:', {
        winner: op1.payload.index,
        loser: op2.payload.index,
        reason: 'op1 happened after op2',
      });

      trackConflictMetric('resolution_strategy', 'causality_based');

      return {
        resolvedOperations: [op1],
        rejectedOperations: [op2],
        transformedOperations: [],
      };
    }
    // If concurrent, fall through to timestamp tiebreaker
  }

  // Concurrent: use timestamp (latest active index wins)
  const time1 = new Date(op1.timestamp).getTime();
  const time2 = new Date(op2.timestamp).getTime();

  const winner = time1 > time2 ? op1 : op2;
  const loser = winner === op1 ? op2 : op1;

  logger.warn('Resolved concurrent active index by timestamp:', {
    winner: winner.payload.index,
    loser: loser.payload.index,
  });

  trackConflictMetric('resolution_strategy', 'timestamp_latest');

  return {
    resolvedOperations: [winner],
    rejectedOperations: [loser],
    transformedOperations: [],
  };
}

/**
 * PHASE 1.3: Track conflict metrics for monitoring
 */
function trackConflict(conflict: OperationConflict, resolution: ConflictResolution): void {
  conflictMetrics.totalConflicts++;
  conflictMetrics.conflictsByType[conflict.conflictType] =
    (conflictMetrics.conflictsByType[conflict.conflictType] || 0) + 1;

  if (resolution.rejectedOperations.length > 0) {
    conflictMetrics.dataLossEvents++;
  }

  logger.debug('Conflict tracked:', {
    type: conflict.conflictType,
    resolved: resolution.resolvedOperations.length,
    rejected: resolution.rejectedOperations.length,
  });
}

/**
 * PHASE 1.3: Track specific conflict resolution metric
 */
function trackConflictMetric(category: string, strategy: string): void {
  const key = `${category}:${strategy}`;
  conflictMetrics.resolutionsByStrategy[key] =
    (conflictMetrics.resolutionsByStrategy[key] || 0) + 1;
}

/**
 * Resolve duplicate operations - first writer wins
 */
function resolveDuplicateConflict(op1: Operation, op2: Operation): ConflictResolution {
  // For exact duplicates, keep the one with earlier timestamp
  const time1 = new Date(op1.timestamp).getTime();
  const time2 = new Date(op2.timestamp).getTime();

  if (time1 <= time2) {
    return {
      resolvedOperations: [op1],
      rejectedOperations: [op2],
      transformedOperations: [],
    };
  } else {
    return {
      resolvedOperations: [op2],
      rejectedOperations: [op1],
      transformedOperations: [],
    };
  }
}

/**
 * Resolve race conditions - use timestamp + clientId tiebreaker
 */
function resolveRaceCondition(op1: Operation, op2: Operation): ConflictResolution {
  const time1 = new Date(op1.timestamp).getTime();
  const time2 = new Date(op2.timestamp).getTime();

  // If timestamps are very close, use clientId as tiebreaker for determinism
  if (Math.abs(time1 - time2) < 1000) {
    const winner = op1.clientId < op2.clientId ? op1 : op2;
    const loser = winner === op1 ? op2 : op1;

    return {
      resolvedOperations: [winner],
      rejectedOperations: [loser],
      transformedOperations: [],
    };
  }

  // Otherwise, later timestamp wins
  const winner = time1 > time2 ? op1 : op2;
  const loser = winner === op1 ? op2 : op1;

  return {
    resolvedOperations: [winner],
    rejectedOperations: [loser],
    transformedOperations: [],
  };
}

/**
 * Resolve concurrent edits - merge when possible, otherwise last writer wins
 */
function resolveConcurrentEdit(
  op1: Operation,
  op2: Operation,
  _currentState: AppState
): ConflictResolution {
  // For arrangement updates, try to merge the changes
  if (op1.type === 'ARRANGEMENT_UPDATE' && op2.type === 'ARRANGEMENT_UPDATE') {
    const updates1 = op1.payload.updates;
    const updates2 = op2.payload.updates;

    // Check if updates affect different fields - if so, merge them
    const fields1 = Object.keys(updates1);
    const fields2 = Object.keys(updates2);
    const overlapping = fields1.some(field => fields2.includes(field));

    if (!overlapping) {
      // No overlapping fields - can merge safely
      const mergedOperation: Operation = {
        ...op1,
        timestamp: new Date(
          Math.max(
            new Date(op1.timestamp).getTime(),
            new Date(op2.timestamp).getTime()
          )
        ).toISOString(),
        payload: {
          ...op1.payload,
          updates: { ...updates1, ...updates2 },
        },
      };

      return {
        resolvedOperations: [],
        rejectedOperations: [op1, op2],
        transformedOperations: [mergedOperation],
      };
    }
  }

  // Can't merge - use last writer wins
  return resolveRaceCondition(op1, op2);
}

/**
 * Resolve dependency violations - reject operations that depend on missing state
 */
function resolveDependencyViolation(
  op1: Operation,
  op2: Operation,
  _currentState: AppState
): ConflictResolution {
  // For now, just reject the later operation
  // In a more sophisticated system, we'd try to transform the operation
  const time1 = new Date(op1.timestamp).getTime();
  const time2 = new Date(op2.timestamp).getTime();

  if (time1 <= time2) {
    return {
      resolvedOperations: [op1],
      rejectedOperations: [op2],
      transformedOperations: [],
    };
  } else {
    return {
      resolvedOperations: [op2],
      rejectedOperations: [op1],
      transformedOperations: [],
    };
  }
}

/**
 * Batch process operations with conflict resolution
 * PHASE 1.3: Now accepts optional OperationLogManager for vector clock-aware resolution
 */
export function processOperationsWithConflictResolution(
  operations: Operation[],
  currentState: AppState,
  manager?: OperationLogManager
): {
  validOperations: Operation[];
  conflictsResolved: number;
  operationsRejected: number;
} {
  const processed: Operation[] = [];
  const rejected: Operation[] = [];
  let conflictsResolved = 0;

  // Sort by sequence to process in order
  const sortedOps = [...operations].sort((a, b) => a.sequence - b.sequence);

  for (const operation of sortedOps) {
    // Check for conflicts with already processed operations
    const conflicts = detectConflicts(operation, processed, currentState, manager);

    if (conflicts.length === 0) {
      // No conflicts - accept the operation
      processed.push(operation);
    } else {
      // Resolve conflicts
      const resolution = resolveConflicts(conflicts, currentState, manager);

      processed.push(...resolution.resolvedOperations);
      processed.push(...resolution.transformedOperations);
      rejected.push(...resolution.rejectedOperations);

      conflictsResolved += conflicts.length;
    }
  }

  return {
    validOperations: processed,
    conflictsResolved,
    operationsRejected: rejected.length,
  };
}

/**
 * PHASE 1.3: Get current conflict metrics for monitoring
 */
export function getConflictMetrics(): ConflictMetrics {
  return { ...conflictMetrics };
}

/**
 * PHASE 1.3: Reset conflict metrics (useful for testing)
 */
export function resetConflictMetrics(): void {
  conflictMetrics = {
    totalConflicts: 0,
    conflictsByType: {},
    resolutionsByStrategy: {},
    dataLossEvents: 0,
  };
}