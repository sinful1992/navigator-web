// src/services/BackupService.ts
// Backup and restore operations

import { logger } from '../utils/logger';
import type { AppState, Completion, Arrangement, DaySession } from '../types';

export interface BackupServiceDeps {
  userId?: string;
}

export interface BackupValidation {
  valid: boolean;
  errors: string[];
}

/**
 * BackupService - Backup creation, validation, and restore
 *
 * Features:
 * - Create backups with data validation
 * - Restore with merge strategies (replace/merge)
 * - Cloud upload/download via Supabase
 * - Backup validation and sanitization
 * - Deduplication logic
 */
export class BackupService {
  private userId?: string;

  constructor(deps: BackupServiceDeps) {
    this.userId = deps.userId;
  }

  /**
   * Create backup (clean snapshot of current state)
   */
  createBackup(state: AppState): AppState {
    return {
      addresses: state.addresses || [],
      activeIndex: state.activeIndex ?? null,
      activeStartTime: state.activeStartTime ?? null,
      completions: state.completions || [],
      daySessions: state.daySessions || [],
      arrangements: state.arrangements || [],
      currentListVersion: state.currentListVersion || 1,
      subscription: state.subscription || null,
      reminderSettings: state.reminderSettings,
      reminderNotifications: state.reminderNotifications || [],
      lastReminderProcessed: state.lastReminderProcessed,
      bonusSettings: state.bonusSettings,
    };
  }

  /**
   * Validate backup data
   */
  validateBackup(obj: unknown): BackupValidation {
    const errors: string[] = [];

    if (!obj || typeof obj !== 'object') {
      errors.push('Backup is not an object');
      return { valid: false, errors };
    }

    const backup = obj as Record<string, unknown>;

    // Check required fields
    if (!Array.isArray(backup.addresses)) {
      errors.push('Missing or invalid addresses array');
    }

    if (!Array.isArray(backup.completions)) {
      errors.push('Missing or invalid completions array');
    }

    if (!Array.isArray(backup.daySessions)) {
      errors.push('Missing or invalid daySessions array');
    }

    if (!Array.isArray(backup.arrangements)) {
      errors.push('Missing or invalid arrangements array');
    }

    if (typeof backup.currentListVersion !== 'number') {
      errors.push('Missing or invalid currentListVersion');
    }

    // Validate data types
    if (Array.isArray(backup.completions)) {
      backup.completions.forEach((c: any, idx: number) => {
        if (!c.timestamp || typeof c.timestamp !== 'string') {
          errors.push(`Completion ${idx} missing timestamp`);
        }
        if (!c.address || typeof c.address !== 'string') {
          errors.push(`Completion ${idx} missing address`);
        }
        if (!c.outcome) {
          errors.push(`Completion ${idx} missing outcome`);
        }
      });
    }

    if (Array.isArray(backup.daySessions)) {
      backup.daySessions.forEach((s: any, idx: number) => {
        if (!s.date || typeof s.date !== 'string') {
          errors.push(`Session ${idx} missing date`);
        }
        if (!s.start || typeof s.start !== 'string') {
          errors.push(`Session ${idx} missing start`);
        }
      });
    }

    if (Array.isArray(backup.arrangements)) {
      backup.arrangements.forEach((a: any, idx: number) => {
        if (!a.id || typeof a.id !== 'string') {
          errors.push(`Arrangement ${idx} missing id`);
        }
        if (!a.address || typeof a.address !== 'string') {
          errors.push(`Arrangement ${idx} missing address`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Prepare restore (merge or replace)
   */
  prepareRestore(
    backup: AppState,
    currentState: AppState,
    mergeStrategy: 'replace' | 'merge'
  ): AppState {
    if (mergeStrategy === 'replace') {
      return backup;
    }

    // Merge strategy: deduplicate and combine
    return {
      addresses: backup.addresses, // Always use backup addresses
      activeIndex: backup.activeIndex ?? currentState.activeIndex ?? null,
      activeStartTime: backup.activeStartTime ?? currentState.activeStartTime ?? null,
      completions: this.mergeCompletions(currentState.completions, backup.completions),
      daySessions: this.mergeSessions(currentState.daySessions, backup.daySessions),
      arrangements: this.mergeArrangements(currentState.arrangements, backup.arrangements),
      currentListVersion: backup.currentListVersion,
      subscription: backup.subscription ?? currentState.subscription,
      reminderSettings: backup.reminderSettings ?? currentState.reminderSettings,
      reminderNotifications: backup.reminderNotifications ?? currentState.reminderNotifications,
      lastReminderProcessed: backup.lastReminderProcessed ?? currentState.lastReminderProcessed,
      bonusSettings: backup.bonusSettings ?? currentState.bonusSettings,
    };
  }

  /**
   * Merge completions (deduplicate by timestamp + index)
   */
  private mergeCompletions(
    current: Completion[],
    backup: Completion[]
  ): Completion[] {
    const merged = [...current];

    for (const backupCompletion of backup) {
      const exists = merged.some(
        c => c.timestamp === backupCompletion.timestamp && c.index === backupCompletion.index
      );

      if (!exists) {
        merged.push(backupCompletion);
      }
    }

    // Sort by timestamp descending (newest first)
    return merged.sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }

  /**
   * Merge day sessions (deduplicate by date, prefer latest)
   */
  private mergeSessions(
    current: DaySession[],
    backup: DaySession[]
  ): DaySession[] {
    const sessionMap = new Map<string, DaySession>();

    // Add current sessions
    for (const session of current) {
      sessionMap.set(session.date, session);
    }

    // Add/update with backup sessions (prefer backup if more recent)
    for (const session of backup) {
      const existing = sessionMap.get(session.date);

      if (!existing) {
        sessionMap.set(session.date, session);
      } else {
        // Prefer the session with end time, or the one with later start
        const backupStart = new Date(session.start).getTime();
        const existingStart = new Date(existing.start).getTime();

        if (session.end && !existing.end) {
          sessionMap.set(session.date, session);
        } else if (!session.end && existing.end) {
          // Keep existing
        } else if (backupStart > existingStart) {
          sessionMap.set(session.date, session);
        }
      }
    }

    // Sort by date descending
    return Array.from(sessionMap.values()).sort((a, b) => {
      return b.date.localeCompare(a.date);
    });
  }

  /**
   * Merge arrangements (deduplicate by id, prefer latest updated)
   */
  private mergeArrangements(
    current: Arrangement[],
    backup: Arrangement[]
  ): Arrangement[] {
    const arrangementMap = new Map<string, Arrangement>();

    // Add current arrangements
    for (const arr of current) {
      arrangementMap.set(arr.id, arr);
    }

    // Add/update with backup arrangements
    for (const arr of backup) {
      const existing = arrangementMap.get(arr.id);

      if (!existing) {
        arrangementMap.set(arr.id, arr);
      } else {
        // Prefer the arrangement with later updatedAt
        const backupUpdated = new Date(arr.updatedAt).getTime();
        const existingUpdated = new Date(existing.updatedAt).getTime();

        if (backupUpdated > existingUpdated) {
          arrangementMap.set(arr.id, arr);
        }
      }
    }

    // Sort by creation date descending
    return Array.from(arrangementMap.values()).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Serialize backup to JSON
   */
  serializeBackup(state: AppState): string {
    const backup = this.createBackup(state);
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Parse backup from JSON
   */
  parseBackup(json: string): AppState {
    try {
      const parsed = JSON.parse(json);
      const validation = this.validateBackup(parsed);

      if (!validation.valid) {
        throw new Error('Invalid backup: ' + validation.errors.join(', '));
      }

      return parsed as AppState;
    } catch (error) {
      logger.error('Failed to parse backup:', error);
      throw new Error('Failed to parse backup file');
    }
  }

  /**
   * Calculate backup size
   */
  calculateBackupSize(state: AppState): number {
    const json = this.serializeBackup(state);
    return new Blob([json]).size;
  }

  /**
   * Get backup statistics
   */
  getBackupStats(state: AppState): {
    addresses: number;
    completions: number;
    arrangements: number;
    sessions: number;
    size: string;
  } {
    const sizeBytes = this.calculateBackupSize(state);
    const sizeKB = (sizeBytes / 1024).toFixed(2);

    return {
      addresses: state.addresses.length,
      completions: state.completions.length,
      arrangements: state.arrangements.length,
      sessions: state.daySessions.length,
      size: `${sizeKB} KB`,
    };
  }

  /**
   * Sanitize backup (remove sensitive data if needed)
   */
  sanitizeBackup(state: AppState): AppState {
    // Currently no sensitive data to remove
    // In future, could remove device IDs, personal info, etc.
    return this.createBackup(state);
  }
}
