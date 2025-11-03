// src/services/SessionService.ts
// Business logic for day session management

import type { DaySession, AppState } from '../types';
import { logger } from '../utils/logger';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import type { Operation } from '../sync/operations';

export interface SessionServiceConfig {
  submitOperation: (op: Partial<Operation>) => Promise<void>;
  deviceId: string;
}

/**
 * Service for managing day sessions
 * Handles business logic, validation, and operation submission
 */
export class SessionService {
  private submitOperation: (op: Partial<Operation>) => Promise<void>;
  private deviceId: string;

  constructor(config: SessionServiceConfig) {
    this.submitOperation = config.submitOperation;
    this.deviceId = config.deviceId;
  }

  /**
   * Start a new day session
   */
  async startSession(existingSessions: DaySession[]): Promise<DaySession> {
    const now = new Date();
    const nowISO = now.toISOString();
    const today = nowISO.slice(0, 10);

    // Auto-close any sessions from previous days that are still open
    const updatedSessions = existingSessions.map(session => {
      if (session.date < today && !session.end) {
        logger.info('Auto-closing stale session from previous day:', session);
        return {
          ...session,
          end: new Date(session.date + 'T23:59:59.999Z').toISOString(),
          durationSeconds: Math.floor(
            (new Date(session.date + 'T23:59:59.999Z').getTime() - new Date(session.start).getTime()) / 1000
          )
        };
      }
      return session;
    });

    // Check if session already exists for today
    const existingToday = updatedSessions.find(s => s.date === today && !s.end);
    if (existingToday) {
      throw new Error('Session already active for today');
    }

    const newSession: DaySession = {
      date: today,
      start: nowISO,
      createdAt: nowISO,
      updatedAt: nowISO,
      updatedBy: this.deviceId,
    };

    logger.info('Starting new day session:', newSession);
    setProtectionFlag('navigator_day_session_protection');

    // Submit operation to cloud
    await this.submitOperation({
      type: 'SESSION_START',
      payload: { session: newSession }
    });

    return newSession;
  }

  /**
   * End the current day's session
   */
  async endSession(existingSessions: DaySession[]): Promise<DaySession | null> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Find and close stale sessions from previous days
    const updatedSessions = existingSessions.map(session => {
      if (session.date < today && !session.end) {
        logger.info("Auto-closing stale day session before ending today", session);
        return {
          ...session,
          end: new Date(session.date + 'T23:59:59.999Z').toISOString(),
          durationSeconds: Math.floor(
            (new Date(session.date + 'T23:59:59.999Z').getTime() - new Date(session.start).getTime()) / 1000
          )
        };
      }
      return session;
    });

    // Find today's active session
    const todaySession = updatedSessions.find(s => s.date === today && !s.end);

    if (!todaySession) {
      logger.info("No active session to end for today");
      return null;
    }

    const endTime = now.toISOString();
    const startTime = new Date(todaySession.start).getTime();
    const endTimeMs = new Date(endTime).getTime();
    const durationSeconds = Math.floor((endTimeMs - startTime) / 1000);

    const endedSession: DaySession = {
      ...todaySession,
      end: endTime,
      durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
      updatedAt: endTime,
      updatedBy: this.deviceId,
    };

    logger.info("Ending day session:", endedSession);
    clearProtectionFlag('navigator_day_session_protection');

    // Submit operation to cloud
    await this.submitOperation({
      type: 'SESSION_END',
      payload: {
        date: todaySession.date,
        endTime: endTime,
      }
    });

    return endedSession;
  }

  /**
   * Update an existing session or create one if it doesn't exist
   */
  async updateSession(
    date: string,
    updates: Partial<DaySession>,
    existingSessions: DaySession[],
    createIfMissing: boolean = false
  ): Promise<{ session: DaySession; created: boolean }> {
    const sessionIndex = existingSessions.findIndex(s => s.date === date);

    if (sessionIndex < 0) {
      if (!createIfMissing) {
        throw new Error(`Session not found for date: ${date}`);
      }

      // Create new session
      const now = new Date().toISOString();
      const newSession: DaySession = {
        date,
        start: updates.start || now,
        end: updates.end,
        durationSeconds: updates.durationSeconds,
        createdAt: now,
        updatedAt: now,
        updatedBy: this.deviceId,
      };

      // Calculate duration if both start and end present
      if (newSession.start && newSession.end) {
        const startTime = new Date(newSession.start).getTime();
        const endTime = new Date(newSession.end).getTime();
        newSession.durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
      }

      logger.info('Creating new session:', newSession);

      // Submit SESSION_START operation
      await this.submitOperation({
        type: 'SESSION_START',
        payload: { session: newSession }
      });

      return { session: newSession, created: true };
    }

    // Update existing session
    const existingSession = existingSessions[sessionIndex];
    const updatedSession = { ...existingSession, ...updates };

    // Recalculate duration if both start and end are present
    if (updatedSession.start && updatedSession.end) {
      const startTime = new Date(updatedSession.start).getTime();
      const endTime = new Date(updatedSession.end).getTime();

      if (endTime >= startTime) {
        updatedSession.durationSeconds = Math.floor((endTime - startTime) / 1000);
      } else {
        logger.warn('End time is before start time, setting duration to 0');
        updatedSession.durationSeconds = 0;
      }
    }

    const now = new Date().toISOString();
    updatedSession.updatedAt = now;
    updatedSession.updatedBy = this.deviceId;

    logger.info('Updating session:', updatedSession);

    // Submit SESSION_UPDATE operation
    await this.submitOperation({
      type: 'SESSION_UPDATE',
      payload: {
        date,
        updates: {
          ...updates,
          updatedAt: now,
          updatedBy: this.deviceId,
        }
      }
    });

    return { session: updatedSession, created: false };
  }

  /**
   * Validate session data
   */
  validateSession(session: Partial<DaySession>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!session.date) {
      errors.push('Session must have a date');
    }

    if (!session.start) {
      errors.push('Session must have a start time');
    }

    if (session.start && session.end) {
      const startTime = new Date(session.start).getTime();
      const endTime = new Date(session.end).getTime();

      if (isNaN(startTime)) {
        errors.push('Invalid start time');
      }

      if (isNaN(endTime)) {
        errors.push('Invalid end time');
      }

      if (startTime > endTime) {
        errors.push('End time cannot be before start time');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
