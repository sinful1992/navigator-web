// src/services/dataCleanup.ts
import type { AppState } from '../types';
import { MS_PER_DAY } from '../constants';

const CLEANUP_KEY = 'navigator_last_cleanup';

interface CleanupResult {
  deletedCompletions: number;
  deletedArrangements: number;
  deletedSessions: number;
}

/**
 * Performs data cleanup based on retention settings
 * Runs maximum once per day
 * @param state Current app state
 * @param keepDataForMonths Data retention period (0 = forever, 3/6/12 = months)
 * @returns Number of items deleted
 */
export async function performDataCleanup(
  state: AppState,
  keepDataForMonths: 0 | 3 | 6 | 12
): Promise<CleanupResult | null> {
  // Check if cleanup already ran today
  const lastCleanup = localStorage.getItem(CLEANUP_KEY);
  const now = Date.now();

  if (lastCleanup) {
    const lastCleanupTime = parseInt(lastCleanup, 10);
    if (!isNaN(lastCleanupTime) && (now - lastCleanupTime) < MS_PER_DAY) {
      return null; // Already ran today
    }
  }

  // If keepDataForMonths is 0 (forever), don't delete anything
  if (keepDataForMonths === 0) {
    localStorage.setItem(CLEANUP_KEY, now.toString());
    return { deletedCompletions: 0, deletedArrangements: 0, deletedSessions: 0 };
  }

  // Calculate threshold date
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - keepDataForMonths);

  const result: CleanupResult = {
    deletedCompletions: 0,
    deletedArrangements: 0,
    deletedSessions: 0
  };

  // Count old completions
  const oldCompletions = state.completions.filter(c => {
    if (!c.timestamp) return false;
    return new Date(c.timestamp) < threshold;
  });
  result.deletedCompletions = oldCompletions.length;

  // Count old arrangements
  const oldArrangements = state.arrangements.filter(a => {
    if (!a.createdAt) return false;
    return new Date(a.createdAt) < threshold;
  });
  result.deletedArrangements = oldArrangements.length;

  // Count old day sessions
  const oldSessions = state.daySessions.filter(s => {
    if (!s.date) return false;
    return new Date(s.date) < threshold;
  });
  result.deletedSessions = oldSessions.length;

  // Update last cleanup time
  localStorage.setItem(CLEANUP_KEY, now.toString());

  return result;
}

/**
 * Applies cleanup result to app state
 * @param state Current app state
 * @param keepDataForMonths Data retention period
 * @returns New state with old items removed
 */
export function applyDataCleanup(
  state: AppState,
  keepDataForMonths: 0 | 3 | 6 | 12
): AppState {
  // If keepDataForMonths is 0 (forever), don't delete anything
  if (keepDataForMonths === 0) {
    return state;
  }

  // Calculate threshold date
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - keepDataForMonths);

  // Filter out old items
  const newCompletions = state.completions.filter(c => {
    if (!c.timestamp) return true; // Keep if no timestamp
    return new Date(c.timestamp) >= threshold;
  });

  const newArrangements = state.arrangements.filter(a => {
    if (!a.createdAt) return true; // Keep if no createdAt
    return new Date(a.createdAt) >= threshold;
  });

  const newSessions = state.daySessions.filter(s => {
    if (!s.date) return true; // Keep if no date
    return new Date(s.date) >= threshold;
  });

  return {
    ...state,
    completions: newCompletions,
    arrangements: newArrangements,
    daySessions: newSessions
  };
}

/**
 * Checks if cleanup should run (once per day)
 * @returns true if cleanup should run
 */
export function shouldRunCleanup(): boolean {
  const lastCleanup = localStorage.getItem(CLEANUP_KEY);
  if (!lastCleanup) return true;

  const lastCleanupTime = parseInt(lastCleanup, 10);
  if (isNaN(lastCleanupTime)) return true;

  const now = Date.now();
  return (now - lastCleanupTime) >= MS_PER_DAY;
}
