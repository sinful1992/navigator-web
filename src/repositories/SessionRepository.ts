// src/repositories/SessionRepository.ts
// Session data access layer - CRUD operations only

import { BaseRepository } from './BaseRepository';
import type { DaySession } from '../types';
import { setProtectionFlag, clearProtectionFlag } from '../sync/protectionFlags';

/**
 * SessionRepository - Session data access
 *
 * Responsibility: Data persistence ONLY
 * - Submit SESSION_START operations
 * - Submit SESSION_END operations
 * - Submit SESSION_UPDATE operations
 * - NO business logic (validation, calculations)
 */
export class SessionRepository extends BaseRepository {
  /**
   * Persist session start operation
   */
  async saveSessionStart(session: DaySession): Promise<void> {
    setProtectionFlag('navigator_session_protection');

    try {
      await this.submit({
        type: 'SESSION_START',
        payload: { session },
      });
    } finally {
      clearProtectionFlag('navigator_session_protection');
    }
  }

  /**
   * Persist session end operation
   */
  async saveSessionEnd(date: string, endTime: string): Promise<void> {
    setProtectionFlag('navigator_session_protection');

    try {
      await this.submit({
        type: 'SESSION_END',
        payload: { date, endTime },
      });
    } finally {
      clearProtectionFlag('navigator_session_protection');
    }
  }

  /**
   * Persist session update operation
   */
  async saveSessionUpdate(date: string, updates: Partial<DaySession>): Promise<void> {
    await this.submit({
      type: 'SESSION_UPDATE',
      payload: { date, updates },
    });
  }
}
