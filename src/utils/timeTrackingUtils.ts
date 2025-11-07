// src/utils/timeTrackingUtils.ts - Time tracking and session management utilities
// PHASE 2: Extracted from useAppState.ts to reduce duplication

import type { DaySession } from '../types';
import { logger } from './logger';

/**
 * Close a session with proper duration calculation
 */
export function closeSession(session: DaySession, endTime: Date): DaySession {
  const closed: DaySession = {
    ...session,
    end: endTime.toISOString(),
  };

  const startMs = Date.parse(session.start || '');
  const endMs = endTime.getTime();

  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    const diff = endMs - startMs;
    closed.durationSeconds = diff >= 0 ? Math.floor(diff / 1000) : undefined;
  } else {
    closed.durationSeconds = undefined;
  }

  return closed;
}

/**
 * Auto-close stale session (one that started on a previous day)
 */
export function autoCloseStaleSession(session: DaySession, now: Date): DaySession {
  const nowMs = now.getTime();
  const startMs = Date.parse(session.start || '');
  let endMs = Date.parse(`${session.date || ''}T23:59:59.999Z`);

  if (Number.isNaN(endMs)) {
    endMs = nowMs;
  }

  if (!Number.isNaN(startMs) && endMs < startMs) {
    endMs = startMs;
  }

  if (endMs > nowMs) {
    endMs = nowMs;
  }

  if (Number.isNaN(endMs)) {
    endMs = Number.isNaN(startMs) ? nowMs : startMs;
  }

  return closeSession(session, new Date(endMs));
}

/**
 * Sanitize sessions for a given date, closing any that started on previous days
 */
export function sanitizeSessionsForDate(
  sessions: DaySession[],
  today: string,
  now: Date
): { sanitizedSessions: DaySession[]; closedSessions: DaySession[] } {
  const sanitizedSessions: DaySession[] = [];
  const closedSessions: DaySession[] = [];

  for (const session of sessions) {
    if (!session.end && session.date < today) {
      const closed = autoCloseStaleSession(session, now);
      sanitizedSessions.push(closed);
      closedSessions.push(closed);
    } else {
      sanitizedSessions.push(session);
    }
  }

  return { sanitizedSessions, closedSessions };
}

/**
 * Find the most recent open session for a specific date
 * Returns -1 if not found
 */
export function findLatestOpenSessionIndex(
  sessions: DaySession[],
  date: string
): number {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].date === date && !sessions[i].end) {
      return i;
    }
  }
  return -1;
}

/**
 * Calculate elapsed time for an active address
 * Returns seconds (can be fractional)
 */
export function getActiveTimeSpent(startTime: string | null | undefined): number | undefined {
  if (!startTime) return undefined;

  try {
    const startMs = new Date(startTime).getTime();
    const nowMs = Date.now();

    if (Number.isNaN(startMs)) {
      logger.warn('Invalid startTime for time calculation:', startTime);
      return undefined;
    }

    const elapsedMs = nowMs - startMs;
    return elapsedMs / 1000; // Convert to seconds
  } catch (error) {
    logger.error('Failed to calculate active time:', error);
    return undefined;
  }
}
