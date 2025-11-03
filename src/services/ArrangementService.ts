// src/services/ArrangementService.ts
// Business logic for arrangement management

import type { Arrangement, Outcome } from '../types';
import { logger } from '../utils/logger';
import type { Operation } from '../sync/operations';

export interface ArrangementServiceConfig {
  submitOperation: (op: Partial<Operation>) => Promise<void>;
  deviceId: string;
}

/**
 * Service for managing arrangements (payment plans)
 * Handles business logic, validation, and operation submission
 */
export class ArrangementService {
  private submitOperation: (op: Partial<Operation>) => Promise<void>;
  private deviceId: string;

  constructor(config: ArrangementServiceConfig) {
    this.submitOperation = config.submitOperation;
    this.deviceId = config.deviceId;
  }

  /**
   * Create a new arrangement
   */
  async createArrangement(
    arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Arrangement> {
    const now = new Date().toISOString();
    const id = `arr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const newArrangement: Arrangement = {
      ...arrangementData,
      id,
      createdAt: now,
      updatedAt: now
    };

    // Validate arrangement
    const validation = this.validateArrangement(newArrangement);
    if (!validation.valid) {
      throw new Error(`Invalid arrangement: ${validation.errors.join(', ')}`);
    }

    logger.info('Creating arrangement:', newArrangement);

    // Submit operation to cloud
    await this.submitOperation({
      type: 'ARRANGEMENT_CREATE',
      payload: { arrangement: newArrangement }
    });

    return newArrangement;
  }

  /**
   * Update an existing arrangement
   */
  async updateArrangement(
    id: string,
    updates: Partial<Omit<Arrangement, 'id' | 'createdAt'>>
  ): Promise<Partial<Arrangement>> {
    const now = new Date().toISOString();
    const updatesWithTimestamp = {
      ...updates,
      updatedAt: now
    };

    logger.info('Updating arrangement:', { id, updates: updatesWithTimestamp });

    // Submit operation to cloud
    await this.submitOperation({
      type: 'ARRANGEMENT_UPDATE',
      payload: {
        id,
        updates: updatesWithTimestamp
      }
    });

    return updatesWithTimestamp;
  }

  /**
   * Delete an arrangement
   */
  async deleteArrangement(id: string): Promise<void> {
    logger.info('Deleting arrangement:', id);

    // Submit operation to cloud
    await this.submitOperation({
      type: 'ARRANGEMENT_DELETE',
      payload: { id }
    });
  }

  /**
   * Record a payment for an arrangement
   * Returns the outcome that should be used for the completion
   */
  determinePaymentOutcome(
    arrangement: Arrangement,
    paymentNumber: number
  ): { outcome: Outcome; isLastPayment: boolean } {
    const isRecurring = arrangement.paymentSchedule && arrangement.paymentSchedule !== 'Single';
    const totalPayments = arrangement.numberOfPayments || 1;
    const isLastPayment = paymentNumber >= totalPayments;

    // Installment payments → ARR, Final payment → PIF
    const outcome: Outcome = isRecurring && !isLastPayment ? 'ARR' : 'PIF';

    return { outcome, isLastPayment };
  }

  /**
   * Calculate next payment date based on schedule
   */
  calculateNextPaymentDate(lastPaymentDate: Date, schedule: string): Date | null {
    const next = new Date(lastPaymentDate);

    switch (schedule) {
      case 'Weekly':
        next.setDate(next.getDate() + 7);
        return next;
      case 'Bi-weekly':
        next.setDate(next.getDate() + 14);
        return next;
      case 'Monthly':
        next.setMonth(next.getMonth() + 1);
        return next;
      case 'Single':
      default:
        return null; // No next payment for single payments
    }
  }

  /**
   * Check if arrangement is overdue
   */
  isOverdue(arrangement: Arrangement): boolean {
    if (!arrangement.nextPaymentDate) {
      return false;
    }

    const today = new Date();
    const nextPayment = new Date(arrangement.nextPaymentDate);

    return nextPayment < today;
  }

  /**
   * Check if arrangement is completed (all payments made)
   */
  isCompleted(arrangement: Arrangement): boolean {
    if (!arrangement.numberOfPayments) {
      return false;
    }

    return (arrangement.paymentsMade || 0) >= arrangement.numberOfPayments;
  }

  /**
   * Calculate remaining balance
   */
  getRemainingBalance(arrangement: Arrangement): number {
    const totalAmount = arrangement.totalAmount || 0;
    const paidAmount = arrangement.paidAmount || 0;
    return Math.max(0, totalAmount - paidAmount);
  }

  /**
   * Calculate expected payment amount per installment
   */
  getExpectedPaymentAmount(arrangement: Arrangement): number {
    const totalAmount = arrangement.totalAmount || 0;
    const numberOfPayments = arrangement.numberOfPayments || 1;
    return totalAmount / numberOfPayments;
  }

  /**
   * Validate arrangement data
   */
  validateArrangement(arrangement: Partial<Arrangement>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!arrangement.name || arrangement.name.trim() === '') {
      errors.push('Name is required');
    }

    if (!arrangement.address || arrangement.address.trim() === '') {
      errors.push('Address is required');
    }

    if (arrangement.totalAmount === undefined || arrangement.totalAmount <= 0) {
      errors.push('Total amount must be positive');
    }

    if (!arrangement.paymentSchedule) {
      errors.push('Payment schedule is required');
    } else {
      const validSchedules = ['Single', 'Weekly', 'Bi-weekly', 'Monthly'];
      if (!validSchedules.includes(arrangement.paymentSchedule)) {
        errors.push(`Invalid payment schedule. Must be one of: ${validSchedules.join(', ')}`);
      }
    }

    if (arrangement.numberOfPayments !== undefined && arrangement.numberOfPayments < 1) {
      errors.push('Number of payments must be at least 1');
    }

    // Validate payment tracking
    if (arrangement.paymentsMade !== undefined && arrangement.numberOfPayments !== undefined) {
      if (arrangement.paymentsMade > arrangement.numberOfPayments) {
        errors.push('Payments made cannot exceed total number of payments');
      }
    }

    if (arrangement.paidAmount !== undefined && arrangement.totalAmount !== undefined) {
      if (arrangement.paidAmount > arrangement.totalAmount) {
        errors.push('Paid amount cannot exceed total amount');
      }
    }

    // Validate dates
    if (arrangement.nextPaymentDate) {
      const date = new Date(arrangement.nextPaymentDate);
      if (isNaN(date.getTime())) {
        errors.push('Invalid next payment date');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get arrangements that are due soon (within next N days)
   */
  getUpcomingArrangements(
    arrangements: Arrangement[],
    daysAhead: number = 7
  ): Arrangement[] {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);

    return arrangements.filter(arr => {
      if (!arr.nextPaymentDate) return false;
      const nextPayment = new Date(arr.nextPaymentDate);
      return nextPayment >= today && nextPayment <= futureDate;
    });
  }

  /**
   * Get overdue arrangements
   */
  getOverdueArrangements(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr => this.isOverdue(arr));
  }

  /**
   * Get active arrangements (not completed, not defaulted)
   */
  getActiveArrangements(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr =>
      !this.isCompleted(arr) && arr.status !== 'Defaulted'
    );
  }

  /**
   * Sort arrangements by next payment date (soonest first)
   */
  sortByNextPaymentDate(arrangements: Arrangement[]): Arrangement[] {
    return [...arrangements].sort((a, b) => {
      if (!a.nextPaymentDate) return 1;
      if (!b.nextPaymentDate) return -1;
      return new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime();
    });
  }
}
