// src/sync/reducer.ts - State reconstruction from operations
import type { AppState } from '../types';
import type { Operation } from './operations';
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

        // Validate the completion doesn't already exist
        const exists = state.completions.some(c =>
          c.timestamp === completion.timestamp &&
          c.index === completion.index &&
          c.outcome === completion.outcome
        );

        if (exists) {
          logger.warn('Skipping duplicate completion creation:', completion);
          return state;
        }

        return {
          ...state,
          completions: [completion, ...state.completions].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
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

        // Check if we already have an active session for this date
        const hasActiveToday = state.daySessions.some(s =>
          s.date === session.date && !s.end
        );

        if (hasActiveToday) {
          logger.warn('Skipping session start - already active for date:', session.date);
          return state;
        }

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

        // Check if arrangement already exists
        const exists = state.arrangements.some(a => a.id === arrangement.id);
        if (exists) {
          logger.warn('Skipping duplicate arrangement creation:', arrangement.id);
          return state;
        }

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

  return sortedOps.reduce(applyOperation, initialState);
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

      // Other operations are generally safe to apply
      default:
        return true;
    }
  } catch (error) {
    logger.error('Error validating operation:', error, operation);
    return false;
  }
}