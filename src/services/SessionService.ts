// src/services/SessionService.ts
// Session business logic and management

import { logger } from '../utils/logger';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import type { DaySession } from '../types';
import type { SubmitOperationFn } from './SyncService';

export interface SessionServiceDeps {
  submitOperation: SubmitOperationFn;
  deviceId: string;
}

/**
 * SessionService - Session management business logic
 *
 * Features:
 * - Start/end/update sessions
 * - Auto-close stale sessions
 * - Protection flag management
 * - Duration calculations
 * - Validation
 */
export class SessionService {
  private submitOperation: SubmitOperationFn;
  private deviceId: string;

  constructor(deps: SessionServiceDeps) {
    this.submitOperation = deps.submitOperation;
    this.deviceId = deps.deviceId;
  }

  /**
   * Start a new day session
   * - Auto-closes stale sessions from previous days
   * - Sets protection flag during operation
   */
  async startSession(existingSessions: DaySession[]): Promise<DaySession> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Check if already active today
    const activeTodaySession = existingSessions.find(
      session => session.date === today && !session.end
    );

    if (activeTodaySession) {
      logger.info('Day already active for today');
      throw new Error('Day already active for today');
    }

    // Auto-close stale sessions from previous days
    const staleSessions = existingSessions.filter(
      session => session.date < today && !session.end
    );

    for (const staleSession of staleSessions) {
      const endOfDay = new Date(staleSession.date + 'T23:59:59.999Z');
      const startTime = new Date(staleSession.start).getTime();
      const endTime = endOfDay.getTime();
      const durationSeconds = Math.floor((endTime - startTime) / 1000);

      logger.info('Auto-closing stale session:', staleSession.date);

      await this.submitOperation({
        type: 'SESSION_END',
        payload: {
          date: staleSession.date,
          endTime: endOfDay.toISOString(),
        },
      });
    }

    // Create new session
    const newSession: DaySession = {
      date: today,
      start: now.toISOString(),
    };

    // Set protection flag
    setProtectionFlag('navigator_day_session_protection');

    try {
      await this.submitOperation({
        type: 'SESSION_START',
        payload: { session: newSession },
      });

      logger.info('Started new day session:', today);
      return newSession;

    } catch (error) {
      clearProtectionFlag('navigator_day_session_protection');
      throw error;
    }
  }

  /**
   * End the current day session
   */
  async endSession(existingSessions: DaySession[]): Promise<DaySession | null> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Find active session for today
    const activeSession = existingSessions.find(
      session => session.date === today && !session.end
    );

    if (!activeSession) {
      logger.info('No active session to end for today');
      return null;
    }

    const endTime = now.toISOString();
    const startTime = new Date(activeSession.start).getTime();
    const endTimeMs = now.getTime();
    const durationSeconds = Math.floor((endTimeMs - startTime) / 1000);

    await this.submitOperation({
      type: 'SESSION_END',
      payload: {
        date: today,
        endTime,
      },
    });

    clearProtectionFlag('navigator_day_session_protection');

    logger.info('Ended day session:', today);

    return {
      ...activeSession,
      end: endTime,
      durationSeconds,
    };
  }

  /**
   * Update session (used for manual time edits)
   */
  async updateSession(
    date: string,
    updates: Partial<DaySession>,
    createIfMissing: boolean = false
  ): Promise<void> {
    await this.submitOperation({
      type: 'SESSION_UPDATE',
      payload: { date, updates },
    });

    logger.info('Updated session:', date, updates);
  }

  /**
   * Calculate duration for a session
   */
  calculateDuration(session: DaySession): number | undefined {
    if (!session.start || !session.end) {
      return undefined;
    }

    try {
      const startTime = new Date(session.start).getTime();
      const endTime = new Date(session.end).getTime();

      if (endTime < startTime) {
        logger.warn('End time before start time:', session);
        return undefined;
      }

      return Math.floor((endTime - startTime) / 1000);
    } catch (error) {
      logger.error('Duration calculation failed:', error);
      return undefined;
    }
  }

  /**
   * Validate session data
   */
  validateSession(session: Partial<DaySession>): boolean {
    if (!session.date) {
      logger.error('Session missing date');
      return false;
    }

    if (!session.start) {
      logger.error('Session missing start time');
      return false;
    }

    // Validate ISO format
    if (isNaN(new Date(session.start).getTime())) {
      logger.error('Invalid start time format:', session.start);
      return false;
    }

    if (session.end && isNaN(new Date(session.end).getTime())) {
      logger.error('Invalid end time format:', session.end);
      return false;
    }

    // Validate end is after start
    if (session.start && session.end) {
      const startTime = new Date(session.start).getTime();
      const endTime = new Date(session.end).getTime();

      if (endTime < startTime) {
        logger.error('End time before start time');
        return false;
      }
    }

    return true;
  }

  /**
   * Auto-close a stale session (end of day)
   */
  autoCloseSession(session: DaySession, now: Date): DaySession {
    const endOfDay = new Date(session.date + 'T23:59:59.999Z');
    const endTime = endOfDay.getTime() > now.getTime() ? now : endOfDay;

    const duration = this.calculateDuration({
      ...session,
      end: endTime.toISOString(),
    });

    return {
      ...session,
      end: endTime.toISOString(),
      durationSeconds: duration,
    };
  }
}
