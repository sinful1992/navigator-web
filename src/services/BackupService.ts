// src/services/BackupService.ts
// Business logic for backup and restore operations

import type { AppState } from '../types';
import { logger } from '../utils/logger';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import { supabase } from '../lib/supabaseClient';

export interface BackupServiceConfig {
  userId?: string;
}

/**
 * Service for managing backups and restores
 * Handles validation, local storage, and cloud operations
 */
export class BackupService {
  private userId?: string;

  constructor(config: BackupServiceConfig) {
    this.userId = config.userId;
  }

  /**
   * Create a backup of current state
   */
  createBackup(state: AppState): AppState {
    // Create a clean snapshot without optimistic updates
    const backup: AppState = {
      addresses: state.addresses,
      completions: state.completions,
      activeIndex: state.activeIndex,
      daySessions: state.daySessions,
      arrangements: state.arrangements,
      currentListVersion: state.currentListVersion,
      subscription: state.subscription,
      reminderSettings: state.reminderSettings,
      bonusSettings: state.bonusSettings,
    };

    logger.info('Created backup:', {
      addresses: backup.addresses.length,
      completions: backup.completions.length,
      daySessions: backup.daySessions.length,
      arrangements: backup.arrangements.length
    });

    return backup;
  }

  /**
   * Validate backup data structure
   */
  validateBackup(obj: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!obj || typeof obj !== 'object') {
      errors.push('Backup must be an object');
      return { valid: false, errors };
    }

    const backup = obj as any;

    // Required arrays
    if (!Array.isArray(backup.addresses)) {
      errors.push('Missing or invalid addresses array');
    }

    if (!Array.isArray(backup.completions)) {
      errors.push('Missing or invalid completions array');
    }

    if (!Array.isArray(backup.daySessions)) {
      errors.push('Missing or invalid daySessions array');
    }

    // Required fields
    if (!('activeIndex' in backup)) {
      errors.push('Missing activeIndex field');
    }

    if (!('currentListVersion' in backup)) {
      errors.push('Missing currentListVersion field');
    }

    // Optional arrays
    if ('arrangements' in backup && !Array.isArray(backup.arrangements)) {
      errors.push('Invalid arrangements array');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Prepare backup for restore with merge strategy
   */
  prepareRestore(
    backup: AppState,
    currentState: AppState,
    mergeStrategy: 'replace' | 'merge'
  ): AppState {
    if (mergeStrategy === 'replace') {
      logger.info('Using replace strategy - complete state replacement');
      return {
        ...backup,
        currentListVersion: backup.currentListVersion || 1
      };
    }

    // Merge strategy: combine data from both states
    logger.info('Using merge strategy - combining states');

    // Merge completions (keep all unique by timestamp)
    const completionTimestamps = new Set(currentState.completions.map(c => c.timestamp));
    const newCompletions = backup.completions.filter(c => !completionTimestamps.has(c.timestamp));
    const mergedCompletions = [...currentState.completions, ...newCompletions];

    // Merge arrangements (keep all unique by id)
    const arrangementIds = new Set(currentState.arrangements.map(a => a.id));
    const newArrangements = backup.arrangements?.filter(a => !arrangementIds.has(a.id)) || [];
    const mergedArrangements = [...currentState.arrangements, ...newArrangements];

    // Merge day sessions (keep all unique by date)
    const sessionDates = new Set(currentState.daySessions.map(s => s.date));
    const newSessions = backup.daySessions.filter(s => !sessionDates.has(s.date));
    const mergedSessions = [...currentState.daySessions, ...newSessions];

    // Use backup addresses and list version (usually want latest import)
    return {
      addresses: backup.addresses,
      completions: mergedCompletions,
      activeIndex: backup.activeIndex,
      daySessions: mergedSessions,
      arrangements: mergedArrangements,
      currentListVersion: Math.max(backup.currentListVersion || 1, currentState.currentListVersion),
      subscription: backup.subscription || currentState.subscription,
      reminderSettings: backup.reminderSettings || currentState.reminderSettings,
      bonusSettings: backup.bonusSettings || currentState.bonusSettings,
    };
  }

  /**
   * Serialize backup to JSON string
   */
  serializeBackup(backup: AppState): string {
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Deserialize backup from JSON string
   */
  deserializeBackup(json: string): AppState {
    try {
      const parsed = JSON.parse(json);
      const validation = this.validateBackup(parsed);

      if (!validation.valid) {
        throw new Error(`Invalid backup format: ${validation.errors.join(', ')}`);
      }

      return parsed as AppState;
    } catch (error) {
      logger.error('Failed to deserialize backup:', error);
      throw new Error(`Failed to parse backup: ${(error as Error).message}`);
    }
  }

  /**
   * Create a downloadable backup file
   */
  createBackupFile(backup: AppState): Blob {
    const json = this.serializeBackup(backup);
    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Generate backup filename with timestamp
   */
  generateBackupFilename(prefix: string = 'navigator-backup'): string {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
    return `${prefix}_${timestamp}.json`;
  }

  /**
   * Upload backup to Supabase cloud storage
   */
  async uploadToCloud(backup: AppState, filename?: string): Promise<string> {
    if (!this.userId) {
      throw new Error('User ID required for cloud upload');
    }

    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const actualFilename = filename || this.generateBackupFilename();
    const objectPath = `${this.userId}/${actualFilename}`;
    const json = this.serializeBackup(backup);
    const blob = new Blob([json], { type: 'application/json' });

    logger.info('Uploading backup to cloud:', objectPath);

    const { error } = await supabase.storage
      .from('backups')
      .upload(objectPath, blob, { upsert: true });

    if (error) {
      logger.error('Failed to upload backup:', error);
      throw new Error(`Cloud upload failed: ${error.message}`);
    }

    logger.info('Successfully uploaded backup to cloud');
    return objectPath;
  }

  /**
   * Download backup from Supabase cloud storage
   */
  async downloadFromCloud(objectPath: string): Promise<AppState> {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    logger.info('Downloading backup from cloud:', objectPath);

    const { data, error } = await supabase.storage
      .from('backups')
      .download(objectPath);

    if (error) {
      logger.error('Failed to download backup:', error);
      throw new Error(`Cloud download failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data received from cloud');
    }

    const json = await data.text();
    return this.deserializeBackup(json);
  }

  /**
   * List available cloud backups for current user
   */
  async listCloudBackups(): Promise<Array<{
    name: string;
    path: string;
    size?: number;
    createdAt?: string;
  }>> {
    if (!this.userId) {
      throw new Error('User ID required to list backups');
    }

    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    logger.info('Listing cloud backups for user:', this.userId);

    const { data, error } = await supabase.storage
      .from('backups')
      .list(this.userId, {
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      logger.error('Failed to list backups:', error);
      throw new Error(`Failed to list backups: ${error.message}`);
    }

    return (data || []).map(file => ({
      name: file.name,
      path: `${this.userId}/${file.name}`,
      size: file.metadata?.size,
      createdAt: file.created_at
    }));
  }

  /**
   * Delete a cloud backup
   */
  async deleteCloudBackup(objectPath: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    logger.info('Deleting cloud backup:', objectPath);

    const { error } = await supabase.storage
      .from('backups')
      .remove([objectPath]);

    if (error) {
      logger.error('Failed to delete backup:', error);
      throw new Error(`Failed to delete backup: ${error.message}`);
    }

    logger.info('Successfully deleted cloud backup');
  }

  /**
   * Set protection flag for restore operation
   */
  startRestoreProtection(): void {
    setProtectionFlag('navigator_restore_in_progress');
  }

  /**
   * Clear protection flag after restore
   */
  endRestoreProtection(): void {
    clearProtectionFlag('navigator_restore_in_progress');
  }

  /**
   * Get backup size statistics
   */
  getBackupStats(backup: AppState): {
    totalSize: number;
    addressCount: number;
    completionCount: number;
    sessionCount: number;
    arrangementCount: number;
  } {
    const json = this.serializeBackup(backup);
    const size = new Blob([json]).size;

    return {
      totalSize: size,
      addressCount: backup.addresses.length,
      completionCount: backup.completions.length,
      sessionCount: backup.daySessions.length,
      arrangementCount: backup.arrangements?.length || 0
    };
  }
}
