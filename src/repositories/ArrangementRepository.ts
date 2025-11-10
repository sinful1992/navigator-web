// src/repositories/ArrangementRepository.ts
// Arrangement data access layer - CRUD operations only

import { BaseRepository } from './BaseRepository';
import { setProtectionFlag } from '../utils/protectionFlags';
import type { Arrangement } from '../types';

/**
 * ArrangementRepository - Arrangement data access
 *
 * Responsibility: Data persistence ONLY
 * - Submit ARRANGEMENT_CREATE operations
 * - Submit ARRANGEMENT_UPDATE operations
 * - Submit ARRANGEMENT_DELETE operations
 * - NO business logic (validation, calculations, outcome determination)
 */
export class ArrangementRepository extends BaseRepository {
  /**
   * Persist new arrangement
   *
   * 🔧 CRITICAL FIX - Race Condition Protection:
   * - Sets 6-second protection window to prevent cloud sync from overwriting
   * - Protection flag auto-expires after 6s (defined in protectionFlags.ts)
   *
   * Why needed: Without protection, arrangement can disappear if:
   * 1. User creates arrangement (local operation)
   * 2. Cloud sync event arrives from another device
   * 3. Operation hasn't synced yet → arrangement lost temporarily
   * 4. Protection blocks cloud updates during critical sync window
   */
  async saveArrangement(arrangement: Arrangement): Promise<void> {
    // Set 6-second protection window
    setProtectionFlag('navigator_import_in_progress');

    await this.submit({
      type: 'ARRANGEMENT_CREATE',
      payload: { arrangement },
    });

    // 🔧 FIX: DON'T clear protection here!
    // Let the 6s timeout expire naturally to protect against race condition
  }

  /**
   * Persist arrangement update
   *
   * TIMESTAMP-ORDERED DELTA SYNC: No version checking needed
   * Operations are applied in timestamp order, latest update wins
   *
   * @param id - Arrangement identifier
   * @param updates - Partial updates to apply
   */
  async updateArrangement(
    id: string,
    updates: Partial<Arrangement>
  ): Promise<void> {
    await this.submit({
      type: 'ARRANGEMENT_UPDATE',
      payload: { id, updates },
    });
  }

  /**
   * Persist arrangement deletion
   */
  async deleteArrangement(id: string): Promise<void> {
    await this.submit({
      type: 'ARRANGEMENT_DELETE',
      payload: { id },
    });
  }
}
