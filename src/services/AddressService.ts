// src/services/AddressService.ts
// Business logic for address management

import type { AddressRow, AppState } from '../types';
import { logger } from '../utils/logger';
import { setProtectionFlag, clearProtectionFlag } from '../utils/protectionFlags';
import type { Operation } from '../sync/operations';

export interface AddressServiceConfig {
  submitOperation: (op: Partial<Operation>) => Promise<void>;
  deviceId: string;
}

/**
 * Service for managing addresses
 * Handles business logic, validation, and operation submission
 */
export class AddressService {
  private submitOperation: (op: Partial<Operation>) => Promise<void>;
  private deviceId: string;

  constructor(config: AddressServiceConfig) {
    this.submitOperation = config.submitOperation;
    this.deviceId = config.deviceId;
  }

  /**
   * Import bulk addresses (e.g., from Excel)
   */
  async importAddresses(
    addresses: AddressRow[],
    preserveCompletions: boolean,
    currentListVersion: number
  ): Promise<{ addresses: AddressRow[]; newListVersion: number }> {
    const newListVersion = currentListVersion + 1;

    logger.info(`Importing ${addresses.length} addresses`, {
      preserveCompletions,
      newListVersion
    });

    setProtectionFlag('navigator_import_in_progress');

    try {
      // Submit operation to cloud
      await this.submitOperation({
        type: 'ADDRESS_BULK_IMPORT',
        payload: {
          addresses,
          newListVersion,
          preserveCompletions
        }
      });

      return { addresses, newListVersion };
    } finally {
      clearProtectionFlag('navigator_import_in_progress');
    }
  }

  /**
   * Add a single address
   */
  async addAddress(address: Omit<AddressRow, 'importedAt'>): Promise<AddressRow> {
    const now = new Date().toISOString();
    const newAddress: AddressRow = {
      ...address,
      importedAt: now
    };

    // Validate address
    const validation = this.validateAddress(newAddress);
    if (!validation.valid) {
      throw new Error(`Invalid address: ${validation.errors.join(', ')}`);
    }

    logger.info('Adding new address:', newAddress);

    // Submit operation to cloud
    await this.submitOperation({
      type: 'ADDRESS_ADD',
      payload: { address: newAddress }
    });

    return newAddress;
  }

  /**
   * Set active address (for time tracking)
   */
  async setActiveAddress(index: number | null, startTime?: string | null): Promise<void> {
    if (index !== null && index < 0) {
      throw new Error('Invalid address index');
    }

    logger.info('Setting active address:', { index, startTime });

    if (index !== null) {
      setProtectionFlag('navigator_active_protection');
    }

    // Submit operation to cloud
    await this.submitOperation({
      type: 'ACTIVE_INDEX_SET',
      payload: {
        index,
        startTime
      }
    });
  }

  /**
   * Cancel active address
   */
  async cancelActiveAddress(): Promise<void> {
    logger.info('Cancelling active address');
    clearProtectionFlag('navigator_active_protection');

    // Submit operation to cloud
    await this.submitOperation({
      type: 'ACTIVE_INDEX_SET',
      payload: {
        index: null,
        startTime: null
      }
    });
  }

  /**
   * Validate address data
   */
  validateAddress(address: Partial<AddressRow>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!address.address || address.address.trim() === '') {
      errors.push('Address is required');
    }

    // Optional: Validate coordinates if present
    if (address.lat !== undefined && (isNaN(address.lat) || address.lat < -90 || address.lat > 90)) {
      errors.push('Invalid latitude (must be between -90 and 90)');
    }

    if (address.lng !== undefined && (isNaN(address.lng) || address.lng < -180 || address.lng > 180)) {
      errors.push('Invalid longitude (must be between -180 and 180)');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Normalize address data (clean up formatting)
   */
  normalizeAddress(address: AddressRow): AddressRow {
    return {
      ...address,
      address: address.address.trim(),
      notes: address.notes?.trim() || undefined
    };
  }

  /**
   * Check if address has coordinates
   */
  hasCoordinates(address: AddressRow): boolean {
    return (
      address.lat !== undefined &&
      address.lng !== undefined &&
      !isNaN(address.lat) &&
      !isNaN(address.lng)
    );
  }

  /**
   * Calculate distance between two addresses (in kilometers)
   */
  calculateDistance(addr1: AddressRow, addr2: AddressRow): number | null {
    if (!this.hasCoordinates(addr1) || !this.hasCoordinates(addr2)) {
      return null;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(addr2.lat! - addr1.lat!);
    const dLng = this.toRad(addr2.lng! - addr1.lng!);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(addr1.lat!)) *
        Math.cos(this.toRad(addr2.lat!)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
