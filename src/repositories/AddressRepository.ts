// src/repositories/AddressRepository.ts
// Address data access layer

import { BaseRepository } from './BaseRepository';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import type { AddressRow } from '../types';

/**
 * AddressRepository - Address data access ONLY
 *
 * Responsibility: Persist address operations to sync system
 * - NO business logic
 * - NO validations
 * - NO calculations
 * - Just CRUD operations
 */
export class AddressRepository extends BaseRepository {
  /**
   * Persist bulk address import
   */
  async saveBulkImport(
    addresses: AddressRow[],
    newListVersion: number,
    preserveCompletions: boolean
  ): Promise<void> {
    setProtectionFlag('navigator_import_in_progress');

    try {
      await this.submit({
        type: 'ADDRESS_BULK_IMPORT',
        payload: {
          addresses,
          newListVersion,
          preserveCompletions,
        },
      });
    } finally {
      clearProtectionFlag('navigator_import_in_progress');
    }
  }

  /**
   * Persist single address add
   */
  async saveAddress(address: AddressRow, listVersion: number): Promise<void> {
    await this.submit({
      type: 'ADDRESS_ADD',
      payload: {
        address,
      },
    });
  }

  /**
   * Persist active address change
   */
  async saveActiveAddress(index: number, startTime: string): Promise<void> {
    setProtectionFlag('navigator_active_protection');

    await this.submit({
      type: 'ACTIVE_INDEX_SET',
      payload: { index, startTime },
    });
  }

  /**
   * Persist active address clear
   */
  async clearActiveAddress(): Promise<void> {
    clearProtectionFlag('navigator_active_protection');

    await this.submit({
      type: 'ACTIVE_INDEX_SET',
      payload: { index: null, startTime: null },
    });
  }
}
