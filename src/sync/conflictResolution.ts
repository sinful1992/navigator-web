// src/sync/conflictResolution.ts - Conflict resolution for concurrent operations
import type { Operation } from './operations';
import type { AppState } from '../types';
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
 * Detects conflicts between operations
 */
export function detectConflicts(
  operation: Operation,
  existingOperations: Operation[],
  _currentState: AppState
): OperationConflict[] {
  const conflicts: OperationConflict[] = [];

  for (const existing of existingOperations) {
    const conflict = detectConflictBetween(operation, existing, _currentState);
    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Detects conflict between two specific operations
 */
function detectConflictBetween(
  op1: Operation,
  op2: Operation,
  _currentState: AppState
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

        // Same address, same list version = conflict
        if (comp1.index === comp2.index && comp1.listVersion === comp2.listVersion) {
          return {
            operation1: op1,
            operation2: op2,
            conflictType: 'duplicate',
            description: `Concurrent completion of address ${comp1.index}`,
          };
        }
      }
      break;

    case 'ACTIVE_INDEX_SET':
      if (op2.type === 'ACTIVE_INDEX_SET') {
        // Concurrent active index changes
        const timeDiff = Math.abs(
          new Date(op1.timestamp).getTime() - new Date(op2.timestamp).getTime()
        );

        // If within 5 seconds, consider it a race condition
        if (timeDiff < 5000) {
          return {
            operation1: op1,
            operation2: op2,
            conflictType: 'race_condition',
            description: 'Concurrent active index changes',
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
 */
export function resolveConflicts(
  conflicts: OperationConflict[],
  _currentState: AppState
): ConflictResolution {
  const resolvedOperations: Operation[] = [];
  const rejectedOperations: Operation[] = [];
  const transformedOperations: Operation[] = [];

  for (const conflict of conflicts) {
    const resolution = resolveConflict(conflict, _currentState);

    resolvedOperations.push(...resolution.resolvedOperations);
    rejectedOperations.push(...resolution.rejectedOperations);
    transformedOperations.push(...resolution.transformedOperations);
  }

  return {
    resolvedOperations,
    rejectedOperations,
    transformedOperations,
  };
}

/**
 * Resolves a single conflict using type-specific rules
 */
function resolveConflict(
  conflict: OperationConflict,
  _currentState: AppState
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
      return resolveDuplicateConflict(op1, op2);

    case 'race_condition':
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
        timestamp: Math.max(
          new Date(op1.timestamp).getTime(),
          new Date(op2.timestamp).getTime()
        ).toString(),
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
 */
export function processOperationsWithConflictResolution(
  operations: Operation[],
  currentState: AppState
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
    const conflicts = detectConflicts(operation, processed, currentState);

    if (conflicts.length === 0) {
      // No conflicts - accept the operation
      processed.push(operation);
    } else {
      // Resolve conflicts
      const resolution = resolveConflicts(conflicts, currentState);

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