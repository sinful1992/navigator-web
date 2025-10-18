// src/hooks/useDataCleanup.ts
import { useEffect } from 'react';
import { shouldRunCleanup, performDataCleanup, applyDataCleanup } from '../services/dataCleanup';
import { logger } from '../utils/logger';
import type { AppState } from '../types';

/**
 * Custom hook to perform automatic data retention cleanup
 *
 * Runs once on mount to clean up old data based on retention settings.
 * Cleanup runs maximum once per day (tracked in localStorage).
 *
 * @param state - Current application state
 * @param setState - State setter function
 * @param settings - User settings with keepDataForMonths configuration
 */
export function useDataCleanup(
  state: AppState,
  setState: (state: AppState | ((prev: AppState) => AppState)) => void,
  settings: {
    keepDataForMonths: 0 | 3 | 6 | 12;
  }
) {
  useEffect(() => {
    const runCleanup = async () => {
      // Check if cleanup should run (max once per day)
      if (!shouldRunCleanup()) {
        return;
      }

      // Perform cleanup and get results
      const result = await performDataCleanup(state, settings.keepDataForMonths);

      // Apply cleanup if anything was deleted
      if (result && (result.deletedCompletions > 0 || result.deletedArrangements > 0 || result.deletedSessions > 0)) {
        const cleanedState = applyDataCleanup(state, settings.keepDataForMonths);
        setState(cleanedState);

        // Log cleanup results (silent - no user notification)
        logger.info(
          `Data cleanup completed: ${result.deletedCompletions} completions, ` +
          `${result.deletedArrangements} arrangements, ${result.deletedSessions} sessions removed`
        );
      }
    };

    runCleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount - ignore state/settings changes
}
