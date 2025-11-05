// src/repositories/CompletionRepository.ts
// Completion data access layer

import { BaseRepository } from './BaseRepository';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
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
   *
   * 🔧 CRITICAL FIX - Race Condition Protection:
   * - Sets 6-second protection window to prevent cloud sync from overwriting
   * - Clears active address protection (time tracking complete)
   * - Protection flag auto-expires after 6s (defined in protectionFlags.ts)
   *
   * Why needed: Without protection, completion can disappear if:
   * 1. User creates completion (local operation)
   * 2. Cloud sync event arrives from another device
   * 3. Operation hasn't synced yet → completion lost temporarily
   * 4. Protection blocks cloud updates during critical sync window
   */
  async saveCompletion(completion: Completion): Promise<void> {
    // Set 6-second protection window BEFORE clearing active protection
    // This ensures completion data is protected even after active tracking ends
    setProtectionFlag('navigator_import_in_progress');

    // Clear active address protection (address time tracking complete)
    clearProtectionFlag('navigator_active_protection');

    await this.submit({
      type: 'COMPLETION_CREATE',
      payload: { completion },
    });

    // 🔧 FIX: DON'T clear import protection here!
    // Let the 6s timeout expire naturally to protect against race condition
  }

  /**
   * Persist completion update
   *
   * PHASE 2: Optimistic Concurrency Control (MANDATORY VERSION CHECK)
   * @param originalTimestamp - Timestamp identifying the completion
   * @param updates - Partial updates to apply
   * @param expectedVersion - Expected current version (REQUIRED for conflict detection)
   */
  async updateCompletion(
    originalTimestamp: string,
    updates: Partial<Completion>,
    expectedVersion: number  // ← REQUIRED, not optional
  ): Promise<void> {
    await this.submit({
      type: 'COMPLETION_UPDATE',
      payload: {
        originalTimestamp,
        updates,
        expectedVersion,
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
