// src/sync/reducer.ts - State reconstruction from operations
// PHASE 1.3: Enhanced with vector clock-based conflict resolution
import type { AppState } from '../types';
import type { Operation } from './operations';
import { OperationLogManager } from './operationLog';
import { processOperationsWithConflictResolution } from './conflictResolution';
import { logger } from '../utils/logger';

/**
 * Applies a single operation to state, producing new state
 * This is the core of event sourcing - state is computed from operations
 */
export function applyOperation(state: AppState, operation: Operation): AppState {
  try {
    switch (operation.type) {
      case 'COMPLETION_CREATE': {
        const { completion } = operation.payload;

        // Single-user app: Keep all operations, show latest per address
        // - If user completes on Device A, Device B syncs and shows it's done
        // - User won't complete same address again (they see it's already completed)
        // - Operation-level deduplication (by operation ID) prevents actual duplicates
        // - This handles concurrent completions by keeping latest completion per address

        // For same address + listVersion, keep only the latest completion
        const otherCompletions = state.completions.filter(c =>
          !(c.index === completion.index && c.listVersion === completion.listVersion)
        );

        // Add new completion and sort by timestamp (latest first)
        const allCompletions = [completion, ...otherCompletions].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        return {
          ...state,
          completions: allCompletions,
          // Clear active index if this completion was for the active address
          activeIndex: state.activeIndex === completion.index ? null : state.activeIndex,
        };
      }

      case 'COMPLETION_UPDATE': {
        const { originalTimestamp, updates } = operation.payload;

        return {
          ...state,
          completions: state.completions.map(c =>
            c.timestamp === originalTimestamp
              ? { ...c, ...updates }
              : c
          ),
        };
      }

      case 'COMPLETION_DELETE': {
        const { timestamp, index, listVersion } = operation.payload;

        return {
          ...state,
          completions: state.completions.filter(c => !(
            c.timestamp === timestamp &&
            c.index === index &&
            c.listVersion === listVersion
          )),
        };
      }

      case 'ADDRESS_BULK_IMPORT': {
        const { addresses, newListVersion, preserveCompletions } = operation.payload;

        // 🔧 CRITICAL FIX: Validate addresses array
        if (!Array.isArray(addresses)) {
          logger.error('❌ ADDRESS_BULK_IMPORT: addresses is not an array!', {
            type: typeof addresses,
            value: addresses,
            operation: operation.id,
          });
          return state; // Don't corrupt state with invalid data
        }

        // 🔧 FIX: Log the import for debugging
        logger.info('📥 APPLYING ADDRESS_BULK_IMPORT:', {
          count: addresses.length,
          newListVersion,
          preserveCompletions,
          operationId: operation.id,
          sequence: operation.sequence,
        });

        return {
          ...state,
          addresses,
          currentListVersion: newListVersion,
          completions: preserveCompletions ? state.completions : [],
          activeIndex: null, // Reset active index on bulk import
        };
      }

      case 'ADDRESS_ADD': {
        const { address } = operation.payload;

        return {
          ...state,
          addresses: [...state.addresses, address],
        };
      }

      case 'SESSION_START': {
        const { session } = operation.payload;

        // Single-user app: No duplicate check needed
        // - If user starts session on Device A, Device B syncs and shows it
        // - User won't start another session for same date (they see it's already started)
        // - Operation-level deduplication (by operation ID) prevents actual duplicates
        // - Duplicate check was blocking legitimate operations during state reconstruction

        // Auto-close any stale sessions from previous days
        const today = session.date;
        const updatedSessions = state.daySessions.map(s => {
          if (s.date < today && !s.end) {
            logger.info('Auto-closing stale session:', s);
            return {
              ...s,
              end: new Date(s.date + 'T23:59:59.999Z').toISOString(),
              durationSeconds: Math.floor(
                (new Date(s.date + 'T23:59:59.999Z').getTime() - new Date(s.start).getTime()) / 1000
              )
            };
          }
          return s;
        });

        return {
          ...state,
          daySessions: [...updatedSessions, session],
        };
      }

      case 'SESSION_END': {
        const { date, endTime } = operation.payload;

        return {
          ...state,
          daySessions: state.daySessions.map(session => {
            if (session.date === date && !session.end) {
              const startTime = new Date(session.start).getTime();
              const endTimeMs = new Date(endTime).getTime();
              const durationSeconds = Math.floor((endTimeMs - startTime) / 1000);

              return {
                ...session,
                end: endTime,
                durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
              };
            }
            return session;
          }),
        };
      }

      case 'ARRANGEMENT_CREATE': {
        const { arrangement } = operation.payload;

        // Single-user app: No duplicate check needed
        // - If user creates arrangement on Device A, Device B syncs and shows it
        // - User won't create same arrangement again (they see it already exists)
        // - Operation-level deduplication (by operation ID) prevents actual duplicates
        // - Duplicate check was blocking legitimate operations during state reconstruction

        return {
          ...state,
          arrangements: [...state.arrangements, arrangement],
        };
      }

      case 'ARRANGEMENT_UPDATE': {
        const { id, updates } = operation.payload;

        return {
          ...state,
          arrangements: state.arrangements.map(arr =>
            arr.id === id
              ? { ...arr, ...updates, updatedAt: operation.timestamp }
              : arr
          ),
        };
      }

      case 'ARRANGEMENT_DELETE': {
        const { id } = operation.payload;

        return {
          ...state,
          arrangements: state.arrangements.filter(arr => arr.id !== id),
        };
      }

      case 'ACTIVE_INDEX_SET': {
        const { index, startTime } = operation.payload;

        return {
          ...state,
          activeIndex: index,
          activeStartTime: startTime ?? (index !== null ? new Date().toISOString() : null),
        };
      }

      case 'SETTINGS_UPDATE_SUBSCRIPTION': {
        const { subscription } = operation.payload;

        return {
          ...state,
          subscription,
        };
      }

      case 'SETTINGS_UPDATE_REMINDER': {
        const { settings } = operation.payload;

        return {
          ...state,
          reminderSettings: settings,
        };
      }

      case 'SETTINGS_UPDATE_BONUS': {
        const { settings } = operation.payload;

        return {
          ...state,
          bonusSettings: settings,
        };
      }

      default:
        logger.warn('Unknown operation type:', (operation as any).type);
        return state;
    }
  } catch (error) {
    logger.error('Failed to apply operation:', error, operation);
    return state; // Return unchanged state on error
  }
}

/**
 * Reconstructs state by applying all operations in sequence
 * This is how we compute current state from the operation log
 */
export function reconstructState(
  initialState: AppState,
  operations: Operation[]
): AppState {
  // Sort operations by sequence number to ensure deterministic replay
  const sortedOps = [...operations].sort((a, b) => a.sequence - b.sequence);

  logger.info('🔄 STATE RECONSTRUCTION START:', {
    totalOperations: operations.length,
    sequenceRange: operations.length > 0
      ? `${operations[0]?.sequence} - ${operations[operations.length - 1]?.sequence}`
      : 'none',
    operationTypes: operations.reduce((acc, op) => {
      acc[op.type] = (acc[op.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  });

  const finalState = sortedOps.reduce(applyOperation, initialState);

  logger.info('🔄 STATE RECONSTRUCTION COMPLETE:', {
    addresses: finalState.addresses?.length || 0,
    completions: finalState.completions?.length || 0,
    arrangements: finalState.arrangements?.length || 0,
    daySessions: finalState.daySessions?.length || 0,
    currentListVersion: finalState.currentListVersion,
  });

  return finalState;
}

/**
 * PHASE 1.3: Reconstruct state with vector clock-based conflict resolution
 * Applies conflict resolution before replaying operations for more accurate state
 */
export function reconstructStateWithConflictResolution(
  initialState: AppState,
  operations: Operation[],
  manager?: OperationLogManager
): AppState {
  logger.info('🔄 STATE RECONSTRUCTION WITH CONFLICT RESOLUTION START:', {
    totalOperations: operations.length,
    hasVectorClocks: operations.some(op => !!op.vectorClock),
  });

  // Apply conflict resolution
  const { validOperations, conflictsResolved, operationsRejected } =
    processOperationsWithConflictResolution(operations, initialState, manager);

  if (conflictsResolved > 0 || operationsRejected > 0) {
    logger.info('Conflict resolution applied:', {
      conflictsResolved,
      operationsRejected,
      validOperations: validOperations.length,
    });
  }

  // Sort resolved operations by sequence
  const sortedOps = [...validOperations].sort((a, b) => a.sequence - b.sequence);

  // Apply resolved operations to state
  const finalState = sortedOps.reduce(applyOperation, initialState);

  logger.info('🔄 STATE RECONSTRUCTION WITH CONFLICT RESOLUTION COMPLETE:', {
    addresses: finalState.addresses?.length || 0,
    completions: finalState.completions?.length || 0,
    arrangements: finalState.arrangements?.length || 0,
    daySessions: finalState.daySessions?.length || 0,
    currentListVersion: finalState.currentListVersion,
    conflictsResolved,
    operationsRejected,
  });

  return finalState;
}

/**
 * Validates that an operation is compatible with current state
 * Used to prevent invalid operations from being applied
 */
export function validateOperation(state: AppState, operation: Operation): boolean {
  try {
    switch (operation.type) {
      case 'COMPLETION_CREATE': {
        const { completion } = operation.payload;
        // Check if address exists
        if (!state.addresses[completion.index]) {
          logger.warn('Invalid completion - address not found:', completion.index);
          return false;
        }
        // Check if already completed
        const existing = state.completions.find(c =>
          c.index === completion.index &&
          c.listVersion === completion.listVersion
        );
        if (existing) {
          logger.warn('Invalid completion - already exists:', completion);
          return false;
        }
        return true;
      }

      case 'ACTIVE_INDEX_SET': {
        const { index } = operation.payload;
        if (index !== null && !state.addresses[index]) {
          logger.warn('Invalid active index - address not found:', index);
          return false;
        }
        return true;
      }

      // Other operations are generally safe to apply
      default:
        return true;
    }
  } catch (error) {
    logger.error('Error validating operation:', error, operation);
    return false;
  }
}