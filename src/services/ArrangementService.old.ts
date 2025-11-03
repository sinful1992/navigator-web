// src/services/ArrangementService.ts
// Payment arrangement operations and management

import { logger } from '../utils/logger';
import type { Arrangement, Outcome } from '../types';
import type { SubmitOperationFn } from './SyncService';

export interface ArrangementServiceDeps {
  submitOperation: SubmitOperationFn;
  deviceId: string;
}

/**
 * ArrangementService - Payment arrangement management
 *
 * Features:
 * - Create/update/delete arrangements
 * - Payment outcome determination (ARR vs PIF)
 * - Next payment date calculation
 * - Overdue tracking
 * - Payment recording with installment logic
 */
export class ArrangementService {
  private submitOperation: SubmitOperationFn;
  private deviceId: string;

  constructor(deps: ArrangementServiceDeps) {
    this.submitOperation = deps.submitOperation;
    this.deviceId = deps.deviceId;
  }

  /**
   * Create new arrangement
   */
  async createArrangement(
    arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Arrangement> {
    const now = new Date().toISOString();
    const id = `arr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newArrangement: Arrangement = {
      ...arrangementData,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // Validate arrangement
    if (!this.validateArrangement(newArrangement)) {
      throw new Error('Invalid arrangement data');
    }

    await this.submitOperation({
      type: 'ARRANGEMENT_CREATE',
      payload: { arrangement: newArrangement },
    });

    logger.info('Created arrangement:', id);

    return newArrangement;
  }

  /**
   * Update existing arrangement
   */
  async updateArrangement(id: string, updates: Partial<Arrangement>): Promise<void> {
    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.submitOperation({
      type: 'ARRANGEMENT_UPDATE',
      payload: { id, updates: updatedData },
    });

    logger.info('Updated arrangement:', id);
  }

  /**
   * Delete arrangement
   */
  async deleteArrangement(id: string): Promise<void> {
    await this.submitOperation({
      type: 'ARRANGEMENT_DELETE',
      payload: { id },
    });

    logger.info('Deleted arrangement:', id);
  }

  /**
   * Determine outcome for payment recording
   * - Installment payments → ARR
   * - Final payment → PIF
   * - Single payments → PIF
   */
  determinePaymentOutcome(
    arrangement: Arrangement,
    paymentNumber: number
  ): { outcome: Outcome; isLastPayment: boolean } {
    const isRecurring = arrangement.paymentSchedule !== 'Single';
    const isLastPayment = paymentNumber >= arrangement.numberOfPayments;

    // For recurring arrangements, only the last payment is PIF
    // All other payments are ARR
    const outcome: Outcome = isRecurring && !isLastPayment ? 'ARR' : 'PIF';

    return { outcome, isLastPayment };
  }

  /**
   * Calculate next payment date based on schedule
   */
  calculateNextPaymentDate(
    currentDate: Date,
    schedule: 'Single' | 'Weekly' | 'Bi-weekly' | 'Monthly'
  ): Date | null {
    if (schedule === 'Single') {
      return null;
    }

    const nextDate = new Date(currentDate);

    switch (schedule) {
      case 'Weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'Bi-weekly':
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case 'Monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
    }

    return nextDate;
  }

  /**
   * Check if arrangement payment is overdue
   */
  isPaymentOverdue(nextPaymentDate: string | undefined): boolean {
    if (!nextPaymentDate) {
      return false;
    }

    const now = new Date();
    const paymentDate = new Date(nextPaymentDate);

    return paymentDate < now;
  }

  /**
   * Get overdue days
   */
  getOverdueDays(nextPaymentDate: string | undefined): number {
    if (!nextPaymentDate) {
      return 0;
    }

    const now = new Date();
    const paymentDate = new Date(nextPaymentDate);

    if (paymentDate >= now) {
      return 0;
    }

    const diffMs = now.getTime() - paymentDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Calculate remaining amount
   */
  calculateRemainingAmount(
    arrangement: Arrangement,
    paidPayments: number
  ): number {
    const totalPaid = paidPayments * arrangement.paymentAmount;
    const remaining = arrangement.totalAmount - totalPaid;

    return Math.max(0, remaining);
  }

  /**
   * Calculate progress percentage
   */
  calculateProgress(paidPayments: number, totalPayments: number): number {
    if (totalPayments === 0) {
      return 0;
    }

    return Math.round((paidPayments / totalPayments) * 100);
  }

  /**
   * Validate arrangement data
   */
  validateArrangement(arrangement: Partial<Arrangement>): boolean {
    if (!arrangement.address || typeof arrangement.address !== 'string') {
      logger.error('Arrangement missing or invalid address');
      return false;
    }

    if (!arrangement.customerName || typeof arrangement.customerName !== 'string') {
      logger.error('Arrangement missing or invalid customer name');
      return false;
    }

    if (!arrangement.totalAmount || arrangement.totalAmount <= 0) {
      logger.error('Arrangement missing or invalid total amount');
      return false;
    }

    if (!arrangement.paymentAmount || arrangement.paymentAmount <= 0) {
      logger.error('Arrangement missing or invalid payment amount');
      return false;
    }

    if (!arrangement.numberOfPayments || arrangement.numberOfPayments <= 0) {
      logger.error('Arrangement missing or invalid number of payments');
      return false;
    }

    if (!arrangement.paymentSchedule) {
      logger.error('Arrangement missing payment schedule');
      return false;
    }

    const validSchedules = ['Single', 'Weekly', 'Bi-weekly', 'Monthly'];
    if (!validSchedules.includes(arrangement.paymentSchedule)) {
      logger.error('Invalid payment schedule:', arrangement.paymentSchedule);
      return false;
    }

    // Validate payment amount doesn't exceed total
    const totalPaymentAmount = arrangement.paymentAmount * arrangement.numberOfPayments;
    if (totalPaymentAmount > arrangement.totalAmount * 1.1) {
      // Allow 10% tolerance for rounding
      logger.warn('Payment amount times number of payments exceeds total amount');
    }

    return true;
  }

  /**
   * Filter active arrangements
   */
  filterActive(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr => arr.paidPayments < arr.numberOfPayments);
  }

  /**
   * Filter completed arrangements
   */
  filterCompleted(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr => arr.paidPayments >= arr.numberOfPayments);
  }

  /**
   * Filter overdue arrangements
   */
  filterOverdue(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr => this.isPaymentOverdue(arr.nextPaymentDate));
  }

  /**
   * Sort arrangements by next payment date
   */
  sortByNextPayment(arrangements: Arrangement[]): Arrangement[] {
    return [...arrangements].sort((a, b) => {
      if (!a.nextPaymentDate) return 1;
      if (!b.nextPaymentDate) return -1;

      return new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime();
    });
  }
}
