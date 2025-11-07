// src/services/ArrangementService.ts (REFACTORED - Pure Business Logic)
// Payment arrangement business logic ONLY

import { logger } from '../utils/logger';
import type { Arrangement, Outcome } from '../types';

/**
 * ArrangementService - Pure business logic for arrangements
 *
 * Responsibility: Business rules, validations, calculations ONLY
 * - NO data access
 * - Just pure functions
 */
export class ArrangementService {
  /**
   * Create arrangement object with generated ID
   */
  createArrangementObject(
    arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ): Arrangement {
    const now = new Date().toISOString();
    const id = `arr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      ...arrangementData,
      id,
      createdAt: now,
      updatedAt: now,
    };
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
    const isLastPayment = paymentNumber >= (arrangement.numberOfPayments ?? 1);

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
    const totalPaid = paidPayments * (arrangement.paymentAmount ?? 0);
    const remaining = (arrangement.totalAmount ?? 0) - totalPaid;

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
  validateArrangement(arrangement: Partial<Arrangement>): { valid: boolean; error?: string } {
    if (!arrangement.address || typeof arrangement.address !== 'string') {
      return { valid: false, error: 'Arrangement missing or invalid address' };
    }

    if (!arrangement.customerName || typeof arrangement.customerName !== 'string') {
      return { valid: false, error: 'Arrangement missing or invalid customer name' };
    }

    if (!arrangement.totalAmount || arrangement.totalAmount <= 0) {
      return { valid: false, error: 'Arrangement missing or invalid total amount' };
    }

    if (!arrangement.paymentAmount || arrangement.paymentAmount <= 0) {
      return { valid: false, error: 'Arrangement missing or invalid payment amount' };
    }

    if (!arrangement.numberOfPayments || arrangement.numberOfPayments <= 0) {
      return { valid: false, error: 'Arrangement missing or invalid number of payments' };
    }

    if (!arrangement.paymentSchedule) {
      return { valid: false, error: 'Arrangement missing payment schedule' };
    }

    const validSchedules = ['Single', 'Weekly', 'Bi-weekly', 'Monthly'];
    if (!validSchedules.includes(arrangement.paymentSchedule)) {
      return { valid: false, error: `Invalid payment schedule: ${arrangement.paymentSchedule}` };
    }

    // Validate payment amount doesn't exceed total
    const totalPaymentAmount = arrangement.paymentAmount * arrangement.numberOfPayments;
    if (totalPaymentAmount > arrangement.totalAmount * 1.1) {
      // Allow 10% tolerance for rounding
      logger.warn('Payment amount times number of payments exceeds total amount');
    }

    return { valid: true };
  }

  /**
   * Filter active arrangements
   */
  filterActive(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr => (arr.paidPayments ?? 0) < (arr.numberOfPayments ?? 1));
  }

  /**
   * Filter completed arrangements
   */
  filterCompleted(arrangements: Arrangement[]): Arrangement[] {
    return arrangements.filter(arr => (arr.paidPayments ?? 0) >= (arr.numberOfPayments ?? 1));
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

  /**
   * Sort arrangements by creation date (newest first)
   */
  sortByCreatedDate(arrangements: Arrangement[]): Arrangement[] {
    return [...arrangements].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Sort arrangements by customer name
   */
  sortByCustomerName(arrangements: Arrangement[]): Arrangement[] {
    return [...arrangements].sort((a, b) => {
      return (a.customerName ?? '').localeCompare(b.customerName ?? '');
    });
  }

  /**
   * Check if arrangement is complete
   */
  isComplete(arrangement: Arrangement): boolean {
    return (arrangement.paidPayments ?? 0) >= (arrangement.numberOfPayments ?? 1);
  }

  /**
   * Check if arrangement is overdue
   */
  isOverdue(arrangement: Arrangement): boolean {
    return this.isPaymentOverdue(arrangement.nextPaymentDate);
  }

  /**
   * Get arrangement statistics
   */
  getArrangementStats(arrangements: Arrangement[]): {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    totalAmount: number;
    remainingAmount: number;
  } {
    const active = this.filterActive(arrangements);
    const completed = this.filterCompleted(arrangements);
    const overdue = this.filterOverdue(arrangements);

    const totalAmount = arrangements.reduce((sum, arr) => sum + (arr.totalAmount ?? 0), 0);
    const remainingAmount = active.reduce((sum, arr) => {
      return sum + this.calculateRemainingAmount(arr, arr.paidPayments ?? 0);
    }, 0);

    return {
      total: arrangements.length,
      active: active.length,
      completed: completed.length,
      overdue: overdue.length,
      totalAmount,
      remainingAmount,
    };
  }

  /**
   * Find arrangements by address
   */
  findByAddress(arrangements: Arrangement[], address: string): Arrangement[] {
    return arrangements.filter(arr =>
      arr.address.toLowerCase().includes(address.toLowerCase())
    );
  }

  /**
   * Find arrangements by customer name
   */
  findByCustomerName(arrangements: Arrangement[], customerName: string): Arrangement[] {
    return arrangements.filter(arr =>
      (arr.customerName ?? '').toLowerCase().includes(customerName.toLowerCase())
    );
  }

  /**
   * Calculate estimated completion date
   */
  calculateEstimatedCompletion(arrangement: Arrangement): Date | null {
    if (this.isComplete(arrangement)) {
      return null;
    }

    const remainingPayments = (arrangement.numberOfPayments ?? 1) - (arrangement.paidPayments ?? 0);

    if (arrangement.paymentSchedule === 'Single') {
      return arrangement.nextPaymentDate ? new Date(arrangement.nextPaymentDate) : null;
    }

    if (!arrangement.nextPaymentDate) {
      return null;
    }

    const nextPaymentDate = new Date(arrangement.nextPaymentDate);
    let estimatedDate = new Date(nextPaymentDate);

    // Calculate date after remaining payments
    for (let i = 0; i < remainingPayments - 1; i++) {
      const nextDate = this.calculateNextPaymentDate(estimatedDate, arrangement.paymentSchedule ?? 'Single');
      if (nextDate) {
        estimatedDate = nextDate;
      }
    }

    return estimatedDate;
  }
}
