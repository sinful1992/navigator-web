// src/repositories/CompletionRepository.ts
// Completion data access layer

import { BaseRepository } from './BaseRepository';
import { clearProtectionFlag } from '../utils/protectionFlags';
import type { Completion } from '../types';

/**
 * CompletionRepository - Completion data access ONLY
 *
 * Responsibility: Persist completion operations
 * - NO business logic
 * - Just CRUD operations
 */
export class CompletionRepository extends BaseRepository {
  /**
   * Persist new completion
   */
  async saveCompletion(completion: Completion): Promise<void> {
    // Clear active protection flag
    clearProtectionFlag('navigator_active_protection');

    await this.submit({
      type: 'COMPLETION_CREATE',
      payload: { completion },
    });
  }

  /**
   * Persist completion update
   */
  async updateCompletion(
    originalTimestamp: string,
    updates: Partial<Completion>
  ): Promise<void> {
    await this.submit({
      type: 'COMPLETION_UPDATE',
      payload: {
        originalTimestamp,
        updates,
      },
    });
  }

  /**
   * Persist completion deletion
   */
  async deleteCompletion(
    timestamp: string,
    index: number,
    listVersion: number
  ): Promise<void> {
    await this.submit({
      type: 'COMPLETION_DELETE',
      payload: {
        timestamp,
        index,
        listVersion,
      },
    });
  }
}
