// src/sync/reducer.ts - State reconstruction from operations
// PHASE 1.3: Enhanced with vector clock-based conflict resolution
import type { AppState } from '../types';
import type { Operation } from './operations';
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

        if (!completion) {
          logger.error('❌ COMPLETION_CREATE: completion is undefined!', {
            operation: operation.id,
            payload: operation.payload,
          });
          return state;
        }

        // USER REQUIREMENT: Duplicate = Same timestamp (system bug creating 2 completions at exact same time)
        // - Different timestamps = Different completions (even if same address/case)
        // - Allows: Same address visited multiple times (2 people at same house)
        // - Blocks: System creating duplicate completions with identical timestamp
        const isDuplicate = state.completions.some(c => c.timestamp === completion.timestamp);

        if (isDuplicate) {
          logger.warn('🚨 DUPLICATE DETECTED: Skipping completion with identical timestamp', {
            timestamp: completion.timestamp,
            address: completion.address,
            caseRef: completion.caseReference,
            outcome: completion.outcome,
            amount: completion.amount,
          });
          return state; // Skip this duplicate
        }

        // 🔍 DEBUG: Log completion being added (only in verbose mode)
        logger.debug('📥 COMPLETION_CREATE applied:', {
          seq: operation.sequence,
          timestamp: completion.timestamp,
          address: completion.address,
          outcome: completion.outcome,
          currentTotal: state.completions.length + 1
        });

        // PHASE 2: Set initial version on create
        const versionedCompletion = {
          ...completion,
          version: completion.version || 1, // Default to 1 if not provided
        };

        return {
          ...state,
          completions: [versionedCompletion, ...state.completions].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
          // Clear active index if this completion was for the active address
          activeIndex: state.activeIndex === versionedCompletion.index ? null : state.activeIndex,
        };
      }

      case 'COMPLETION_UPDATE': {
        const { originalTimestamp, updates, expectedVersion } = operation.payload;

        // PHASE 2: Optimistic concurrency control
        // Check version if expectedVersion provided
        const targetCompletion = state.completions.find(c => c.timestamp === originalTimestamp);

        if (expectedVersion !== undefined && targetCompletion) {
          const currentVersion = targetCompletion.version || 1;

          if (currentVersion !== expectedVersion) {
            // Version mismatch - conflict detected
            logger.warn('🚨 VERSION CONFLICT: Completion update rejected', {
              timestamp: originalTimestamp,
              expectedVersion,
              currentVersion,
              operation: operation.id,
            });

            // PHASE 3: Create conflict object for UI resolution
            // Prevent duplicate conflicts for the same entity (check ALL statuses, not just pending)
            // FIX: Include dismissed/resolved conflicts to prevent recreation on state reconstruction
            const existingConflict = state.conflicts?.find(
              c => c.entityType === 'completion' &&
                   c.entityId === originalTimestamp
              // Removed status === 'pending' check - conflicts for this entity already exist
            );

            if (existingConflict) {
              logger.warn('🚨 DUPLICATE CONFLICT: Skipping duplicate conflict for completion', {
                timestamp: originalTimestamp,
                existingConflictId: existingConflict.id,
                existingStatus: existingConflict.status,
              });
              return state; // Skip creating duplicate conflict
            }

            // DETERMINISTIC CONFLICT ID: Based on operation ID, not random
            // This ensures the same operation always creates the same conflict
            // which allows CONFLICT_DISMISS/RESOLVE to work across state reconstructions
            const conflict: import('../types').VersionConflict = {
              id: `conflict_completion_${operation.id}`,
              timestamp: new Date().toISOString(),
              entityType: 'completion',
              entityId: originalTimestamp,
              operationId: operation.id,
              expectedVersion,
              currentVersion,
              remoteData: updates,
              localData: targetCompletion,
              status: 'pending',
            };

            // Add conflict to state
            return {
              ...state,
              conflicts: [...(state.conflicts || []), conflict],
            };
          }
        }

        // Apply update with incremented version
        return {
          ...state,
          completions: state.completions.map(c =>
            c.timestamp === originalTimestamp
              ? {
                  ...c,
                  ...updates,
                  // Increment version on update (default to 1 if not set)
                  version: (c.version || 1) + 1,
                }
              : c
          ),
        };
      }

      case 'COMPLETION_DELETE': {
        const { timestamp, index, listVersion } = operation.payload;

        // PHASE 3: Auto-dismiss conflicts for deleted entity
        const updatedConflicts = state.conflicts?.map(c =>
          c.entityType === 'completion' &&
          c.entityId === timestamp &&
          c.status === 'pending'
            ? {
                ...c,
                status: 'dismissed' as const,
                resolvedAt: new Date().toISOString(),
              }
            : c
        );

        if (updatedConflicts && updatedConflicts !== state.conflicts) {
          logger.info('🗑️ CONFLICT AUTO-DISMISS: Entity deleted, dismissing conflicts', {
            entityType: 'completion',
            timestamp,
          });
        }

        return {
          ...state,
          completions: state.completions.filter(c => !(
            c.timestamp === timestamp &&
            c.index === index &&
            c.listVersion === listVersion
          )),
          conflicts: updatedConflicts,
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
                (new Date(s.date + 'T23:59:59.999Z').getTime() - new Date(s.start || new Date()).getTime()) / 1000
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
        const { date, endTime} = operation.payload;

        return {
          ...state,
          daySessions: state.daySessions.map(session => {
            if (session.date === date && !session.end) {
              const startTime = new Date(session.start || new Date()).getTime();
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

      case 'SESSION_UPDATE': {
        const { date, updates } = operation.payload;

        return {
          ...state,
          daySessions: state.daySessions.map(session => {
            if (session.date === date) {
              const updatedSession = { ...session, ...updates };

              // Recalculate duration if both start and end are present
              if (updatedSession.start && updatedSession.end) {
                const startTime = new Date(updatedSession.start).getTime();
                const endTime = new Date(updatedSession.end).getTime();
                updatedSession.durationSeconds = Math.floor((endTime - startTime) / 1000);
              }

              return updatedSession;
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

        // PHASE 2: Set initial version on create
        const versionedArrangement = {
          ...arrangement,
          version: arrangement.version || 1, // Default to 1 if not provided
        };

        return {
          ...state,
          arrangements: [...state.arrangements, versionedArrangement],
        };
      }

      case 'ARRANGEMENT_UPDATE': {
        const { id, updates, expectedVersion } = operation.payload;

        // PHASE 2: Optimistic concurrency control
        // Check version if expectedVersion provided
        const targetArrangement = state.arrangements.find(arr => arr.id === id);

        if (expectedVersion !== undefined && targetArrangement) {
          const currentVersion = targetArrangement.version || 1;

          if (currentVersion !== expectedVersion) {
            // Version mismatch - conflict detected
            logger.warn('🚨 VERSION CONFLICT: Arrangement update rejected', {
              id,
              expectedVersion,
              currentVersion,
              operation: operation.id,
            });

            // PHASE 3: Create conflict object for UI resolution
            // Prevent duplicate conflicts for the same entity (check ALL statuses, not just pending)
            // FIX: Include dismissed/resolved conflicts to prevent recreation on state reconstruction
            const existingConflict = state.conflicts?.find(
              c => c.entityType === 'arrangement' &&
                   c.entityId === id
              // Removed status === 'pending' check - conflicts for this entity already exist
            );

            if (existingConflict) {
              logger.warn('🚨 DUPLICATE CONFLICT: Skipping duplicate conflict for arrangement', {
                id,
                existingConflictId: existingConflict.id,
                existingStatus: existingConflict.status,
              });
              return state; // Skip creating duplicate conflict
            }

            // DETERMINISTIC CONFLICT ID: Based on operation ID, not random
            // This ensures the same operation always creates the same conflict
            // which allows CONFLICT_DISMISS/RESOLVE to work across state reconstructions
            const conflict: import('../types').VersionConflict = {
              id: `conflict_arrangement_${operation.id}`,
              timestamp: new Date().toISOString(),
              entityType: 'arrangement',
              entityId: id,
              operationId: operation.id,
              expectedVersion,
              currentVersion,
              remoteData: updates,
              localData: targetArrangement,
              status: 'pending',
            };

            // Add conflict to state
            return {
              ...state,
              conflicts: [...(state.conflicts || []), conflict],
            };
          }
        }

        // Apply update with incremented version
        return {
          ...state,
          arrangements: state.arrangements.map(arr =>
            arr.id === id
              ? {
                  ...arr,
                  ...updates,
                  updatedAt: operation.timestamp,
                  // Increment version on update (default to 1 if not set)
                  version: (arr.version || 1) + 1,
                }
              : arr
          ),
        };
      }

      case 'ARRANGEMENT_DELETE': {
        const { id } = operation.payload;

        // PHASE 3: Auto-dismiss conflicts for deleted entity
        const updatedConflicts = state.conflicts?.map(c =>
          c.entityType === 'arrangement' &&
          c.entityId === id &&
          c.status === 'pending'
            ? {
                ...c,
                status: 'dismissed' as const,
                resolvedAt: new Date().toISOString(),
              }
            : c
        );

        if (updatedConflicts && updatedConflicts !== state.conflicts) {
          logger.info('🗑️ CONFLICT AUTO-DISMISS: Entity deleted, dismissing conflicts', {
            entityType: 'arrangement',
            id,
          });
        }

        return {
          ...state,
          arrangements: state.arrangements.filter(arr => arr.id !== id),
          conflicts: updatedConflicts,
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

      case 'CONFLICT_DISMISS': {
        const { conflictId } = operation.payload;

        // Find and mark conflict as dismissed
        return {
          ...state,
          conflicts: state.conflicts?.map(c =>
            c.id === conflictId
              ? {
                  ...c,
                  status: 'dismissed' as const,
                  resolvedAt: operation.timestamp,
                }
              : c
          ),
        };
      }

      case 'CONFLICT_RESOLVE': {
        const { conflictId, resolution } = operation.payload;

        // Find and mark conflict as resolved
        return {
          ...state,
          conflicts: state.conflicts?.map(c =>
            c.id === conflictId
              ? {
                  ...c,
                  status: 'resolved' as const,
                  resolvedAt: operation.timestamp,
                  resolution,
                }
              : c
          ),
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
  // Sort operations by timestamp to ensure chronological replay
  const sortedOps = [...operations].sort((a, b) => {
    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id); // Tie-breaker for same timestamp
  });

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
  operations: Operation[]
): AppState {
  const reconstructionInfo = {
    totalOperations: operations.length,
    hasVectorClocks: operations.some(op => !!op.vectorClock),
    completionOps: operations.filter(op => op.type === 'COMPLETION_CREATE').length,
  };
  logger.debug('🔄 STATE RECONSTRUCTION WITH CONFLICT RESOLUTION START:', reconstructionInfo);

  // Apply conflict resolution
  const { validOperations, conflictsResolved, operationsRejected } =
    processOperationsWithConflictResolution(operations, initialState);

  const conflictInfo = {
    conflictsResolved,
    operationsRejected,
    validOperations: validOperations.length,
    validCompletions: validOperations.filter(op => op.type === 'COMPLETION_CREATE').length,
  };

  if (conflictsResolved > 0 || operationsRejected > 0) {
    logger.debug('Conflict resolution applied:', conflictInfo);
  }

  // Sort resolved operations by timestamp
  const sortedOps = [...validOperations].sort((a, b) => {
    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id); // Tie-breaker for same timestamp
  });

  logger.debug('🔄 About to apply', sortedOps.length, 'operations (', sortedOps.filter(op => op.type === 'COMPLETION_CREATE').length, 'completions)');

  // Apply resolved operations to state
  const finalState = sortedOps.reduce(applyOperation, initialState);

  const finalInfo = {
    addresses: finalState.addresses?.length || 0,
    completions: finalState.completions?.length || 0,
    arrangements: finalState.arrangements?.length || 0,
    daySessions: finalState.daySessions?.length || 0,
    currentListVersion: finalState.currentListVersion,
    conflictsResolved,
    operationsRejected,
  };
  logger.debug('🔄 STATE RECONSTRUCTION WITH CONFLICT RESOLUTION COMPLETE:', finalInfo);

  return finalState;
}

