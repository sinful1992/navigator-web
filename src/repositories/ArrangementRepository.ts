// src/repositories/ArrangementRepository.ts
// Arrangement data access layer - CRUD operations only

import { BaseRepository } from './BaseRepository';
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
   */
  async saveArrangement(arrangement: Arrangement): Promise<void> {
    await this.submit({
      type: 'ARRANGEMENT_CREATE',
      payload: { arrangement },
    });
  }

  /**
   * Persist arrangement update
   */
  async updateArrangement(id: string, updates: Partial<Arrangement>): Promise<void> {
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
