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
   *
   * 🔧 CLEAN ARCHITECTURE FIX:
   * - Protection flag set at repository layer (infrastructure concern)
   * - Flag NOT cleared immediately - let 6s timeout expire naturally
   * - This gives operation time to sync to cloud before allowing state overwrites
   */
  async saveBulkImport(
    addresses: AddressRow[],
    newListVersion: number,
    preserveCompletions: boolean
  ): Promise<void> {
    // Set 6-second protection window
    setProtectionFlag('navigator_import_in_progress');

    // Submit operation to local log (returns immediately, cloud sync happens async)
    await this.submit({
      type: 'ADDRESS_BULK_IMPORT',
      payload: {
        addresses,
        newListVersion,
        preserveCompletions,
      },
    });

    // 🔧 FIX: DON'T clear protection flag here!
    // Let the 6s timeout expire naturally to protect against race condition
    // The flag will auto-clear when isProtectionActive() checks it after 6s
  }

  /**
   * Persist single address add
   *
   * 🔧 CLEAN ARCHITECTURE FIX:
   * - Protection flag set at repository layer (not in hook)
   * - Prevents race condition where cloud sync overwrites new address
   * - Protection expires after 6s naturally (defined in protectionFlags.ts)
   */
  async saveAddress(address: AddressRow, _listVersion: number): Promise<void> {
    // Set 6-second protection window
    setProtectionFlag('navigator_import_in_progress');

    // Submit operation to local log
    await this.submit({
      type: 'ADDRESS_ADD',
      payload: {
        address,
      },
    });

    // 🔧 FIX: DON'T clear protection flag here!
    // Let the 6s timeout expire naturally to protect against race condition
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
   * 🔧 CRITICAL FIX: Clear protection flag AFTER operation completes, not before
   */
  async clearActiveAddress(): Promise<void> {
    try {
      await this.submit({
        type: 'ACTIVE_INDEX_SET',
        payload: { index: null, startTime: null },
      });
    } finally {
      // Clear protection flag after operation completes
      clearProtectionFlag('navigator_active_protection');
    }
  }
}
