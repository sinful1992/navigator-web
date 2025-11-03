// src/services/AddressService.ts (REFACTORED - Pure Business Logic)
// Address business logic ONLY

import { logger } from '../utils/logger';
import type { AddressRow } from '../types';

/**
 * AddressService - Pure business logic for addresses
 *
 * Responsibility: Business rules, validations, calculations ONLY
 * - NO data access
 * - NO submitOperation calls
 * - NO protection flags
 * - Just pure functions
 */
export class AddressService {
  /**
   * Validate address data
   */
  validateAddress(address: Partial<AddressRow>): { valid: boolean; error?: string } {
    if (!address.address || typeof address.address !== 'string') {
      return { valid: false, error: 'Address missing or invalid' };
    }

    if (address.address.trim().length === 0) {
      return { valid: false, error: 'Address is empty' };
    }

    // Validate coordinates if present
    if (address.lat !== undefined && address.lat !== null) {
      if (typeof address.lat !== 'number' || address.lat < -90 || address.lat > 90) {
        return { valid: false, error: `Invalid latitude: ${address.lat}` };
      }
    }

    if (address.lng !== undefined && address.lng !== null) {
      if (typeof address.lng !== 'number' || address.lng < -180 || address.lng > 180) {
        return { valid: false, error: `Invalid longitude: ${address.lng}` };
      }
    }

    return { valid: true };
  }

  /**
   * Validate bulk import
   */
  validateBulkImport(addresses: AddressRow[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (let i = 0; i < addresses.length; i++) {
      const result = this.validateAddress(addresses[i]);
      if (!result.valid) {
        errors.push(`Address ${i}: ${result.error}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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
   * Check if address has coordinates
   */
  hasCoordinates(address: AddressRow): boolean {
    return (
      address.lat !== null &&
      address.lat !== undefined &&
      address.lng !== null &&
      address.lng !== undefined
    );
  }

  /**
   * Calculate next list version
   */
  calculateNextListVersion(currentVersion: number): number {
    return currentVersion + 1;
  }

  /**
   * Filter addresses with coordinates
   */
  filterWithCoordinates(addresses: AddressRow[]): AddressRow[] {
    return addresses.filter((addr) => this.hasCoordinates(addr));
  }

  /**
   * Find nearest address
   */
  findNearest(target: AddressRow, addresses: AddressRow[]): AddressRow | null {
    if (!this.hasCoordinates(target)) {
      return null;
    }

    let nearest: AddressRow | null = null;
    let minDistance = Infinity;

    for (const addr of addresses) {
      if (!this.hasCoordinates(addr)) continue;

      const distance = this.calculateDistance(target, addr);
      if (distance !== null && distance < minDistance) {
        minDistance = distance;
        nearest = addr;
      }
    }

    return nearest;
  }

  /**
   * Convert degrees to radians (helper)
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
