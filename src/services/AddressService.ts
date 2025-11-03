// src/services/AddressService.ts
// Address operations and management

import { logger } from '../utils/logger';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import type { AddressRow } from '../types';
import type { SubmitOperationFn } from './SyncService';

export interface AddressServiceDeps {
  submitOperation: SubmitOperationFn;
  deviceId: string;
}

/**
 * AddressService - Address management business logic
 *
 * Features:
 * - Import bulk addresses with version management
 * - Add individual addresses
 * - Set/cancel active address (time tracking)
 * - Distance calculations
 * - Coordinate validation
 * - Address normalization
 */
export class AddressService {
  private submitOperation: SubmitOperationFn;
  private deviceId: string;

  constructor(deps: AddressServiceDeps) {
    this.submitOperation = deps.submitOperation;
    this.deviceId = deps.deviceId;
  }

  /**
   * Import bulk addresses
   * - Increments list version
   * - Sets protection flag during import
   * - Optionally preserves existing completions
   */
  async importAddresses(
    addresses: AddressRow[],
    preserveCompletions: boolean,
    currentListVersion: number
  ): Promise<{ addresses: AddressRow[]; newListVersion: number }> {
    // Validate addresses
    for (const addr of addresses) {
      if (!this.validateAddress(addr)) {
        throw new Error(`Invalid address: ${addr.address || 'missing address'}`);
      }
    }

    const newListVersion = currentListVersion + 1;

    // Set protection flag to prevent conflicts during import
    setProtectionFlag('navigator_import_in_progress');

    try {
      await this.submitOperation({
        type: 'ADDRESS_BULK_IMPORT',
        payload: {
          addresses,
          newListVersion,
          preserveCompletions,
        },
      });

      logger.info(`Imported ${addresses.length} addresses (version ${newListVersion})`);

      return { addresses, newListVersion };

    } finally {
      clearProtectionFlag('navigator_import_in_progress');
    }
  }

  /**
   * Add single address to list
   */
  async addAddress(address: AddressRow, currentListVersion: number): Promise<AddressRow> {
    if (!this.validateAddress(address)) {
      throw new Error('Invalid address data');
    }

    const normalized = this.normalizeAddress(address);

    await this.submitOperation({
      type: 'ADDRESS_ADD',
      payload: {
        address: normalized,
        listVersion: currentListVersion,
      },
    });

    logger.info('Added address:', normalized.address);

    return normalized;
  }

  /**
   * Set active address (start time tracking)
   */
  async setActiveAddress(index: number, startTime: string): Promise<void> {
    setProtectionFlag('navigator_active_protection');

    await this.submitOperation({
      type: 'ACTIVE_INDEX_SET',
      payload: { index, startTime },
    });

    logger.info('Set active address:', index);
  }

  /**
   * Cancel active address (stop time tracking)
   */
  async cancelActiveAddress(): Promise<void> {
    clearProtectionFlag('navigator_active_protection');

    await this.submitOperation({
      type: 'ACTIVE_INDEX_CLEAR',
      payload: {},
    });

    logger.info('Cancelled active address');
  }

  /**
   * Calculate distance between two addresses (Haversine formula)
   * Returns distance in kilometers
   */
  calculateDistance(addr1: AddressRow, addr2: AddressRow): number | null {
    if (!addr1.lat || !addr1.lng || !addr2.lat || !addr2.lng) {
      return null;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(addr2.lat - addr1.lat);
    const dLng = this.toRadians(addr2.lng - addr1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(addr1.lat)) *
        Math.cos(this.toRadians(addr2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Validate address data
   */
  validateAddress(address: Partial<AddressRow>): boolean {
    if (!address.address || typeof address.address !== 'string') {
      logger.error('Address missing or invalid');
      return false;
    }

    if (address.address.trim().length === 0) {
      logger.error('Address is empty');
      return false;
    }

    // Validate coordinates if present
    if (address.lat !== undefined && address.lat !== null) {
      if (typeof address.lat !== 'number' || address.lat < -90 || address.lat > 90) {
        logger.error('Invalid latitude:', address.lat);
        return false;
      }
    }

    if (address.lng !== undefined && address.lng !== null) {
      if (typeof address.lng !== 'number' || address.lng < -180 || address.lng > 180) {
        logger.error('Invalid longitude:', address.lng);
        return false;
      }
    }

    return true;
  }

  /**
   * Normalize address data
   */
  normalizeAddress(address: AddressRow): AddressRow {
    return {
      address: address.address.trim(),
      lat: address.lat ?? null,
      lng: address.lng ?? null,
    };
  }

  /**
   * Check if address has coordinates
   */
  hasCoordinates(address: AddressRow): boolean {
    return address.lat !== null && address.lat !== undefined &&
           address.lng !== null && address.lng !== undefined;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
