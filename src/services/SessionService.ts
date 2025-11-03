// src/services/SessionService.ts (REFACTORED - Pure Business Logic)
// Session business logic ONLY

import { logger } from '../utils/logger';
import type { DaySession } from '../types';

/**
 * SessionService - Pure business logic for sessions
 *
 * Responsibility: Business rules, validations, calculations ONLY
 * - NO data access
 * - Just pure functions
 */
export class SessionService {
  /**
   * Create new session object
   */
  createSessionObject(date: string, startTime: string): DaySession {
    return {
      date,
      start: startTime,
    };
  }

  /**
   * Calculate duration for a session in seconds
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
  validateSession(session: Partial<DaySession>): { valid: boolean; error?: string } {
    if (!session.date) {
      return { valid: false, error: 'Session missing date' };
    }

    if (!session.start) {
      return { valid: false, error: 'Session missing start time' };
    }

    // Validate ISO format
    if (isNaN(new Date(session.start).getTime())) {
      return { valid: false, error: `Invalid start time format: ${session.start}` };
    }

    if (session.end && isNaN(new Date(session.end).getTime())) {
      return { valid: false, error: `Invalid end time format: ${session.end}` };
    }

    // Validate end is after start
    if (session.start && session.end) {
      const startTime = new Date(session.start).getTime();
      const endTime = new Date(session.end).getTime();

      if (endTime < startTime) {
        return { valid: false, error: 'End time before start time' };
      }
    }

    return { valid: true };
  }

  /**
   * Find active session for a specific date
   */
  findActiveSession(sessions: DaySession[], date: string): DaySession | undefined {
    return sessions.find(session => session.date === date && !session.end);
  }

  /**
   * Find stale sessions (sessions from previous days that are still open)
   */
  findStaleSessions(sessions: DaySession[], currentDate: string): DaySession[] {
    return sessions.filter(session => session.date < currentDate && !session.end);
  }

  /**
   * Calculate end of day time for auto-close
   */
  calculateEndOfDay(date: string): Date {
    return new Date(date + 'T23:59:59.999Z');
  }

  /**
   * Auto-close a stale session (end of day)
   */
  autoCloseSession(session: DaySession, now: Date): DaySession {
    const endOfDay = this.calculateEndOfDay(session.date);
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

  /**
   * Check if session is active (no end time)
   */
  isActive(session: DaySession): boolean {
    return !session.end;
  }

  /**
   * Check if session is stale (from previous day and still active)
   */
  isStale(session: DaySession, currentDate: string): boolean {
    return session.date < currentDate && this.isActive(session);
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  getTodayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Get all active sessions
   */
  filterActive(sessions: DaySession[]): DaySession[] {
    return sessions.filter(s => this.isActive(s));
  }

  /**
   * Get all completed sessions
   */
  filterCompleted(sessions: DaySession[]): DaySession[] {
    return sessions.filter(s => !this.isActive(s));
  }

  /**
   * Get sessions for a specific date
   */
  filterByDate(sessions: DaySession[], date: string): DaySession[] {
    return sessions.filter(s => s.date === date);
  }

  /**
   * Sort sessions by date (descending)
   */
  sortByDate(sessions: DaySession[]): DaySession[] {
    return [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Calculate total working time across all sessions
   */
  calculateTotalWorkingTime(sessions: DaySession[]): number {
    return sessions.reduce((total, session) => {
      const duration = this.calculateDuration(session);
      return total + (duration || 0);
    }, 0);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessions: DaySession[]): {
    total: number;
    active: number;
    completed: number;
    totalHours: number;
  } {
    const active = this.filterActive(sessions);
    const completed = this.filterCompleted(sessions);
    const totalSeconds = this.calculateTotalWorkingTime(completed);
    const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

    return {
      total: sessions.length,
      active: active.length,
      completed: completed.length,
      totalHours,
    };
  }

  /**
   * Format duration for display
   */
  formatDuration(durationSeconds: number): string {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);

    if (hours === 0) {
      return `${minutes}min`;
    }

    return `${hours}h ${minutes}min`;
  }
}
