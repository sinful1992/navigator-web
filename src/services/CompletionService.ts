// src/services/CompletionService.ts (REFACTORED - Pure Business Logic)
// Completion business logic ONLY

import { logger } from '../utils/logger';
import type { Completion, Outcome } from '../types';

/**
 * CompletionService - Pure business logic for completions
 *
 * Responsibility: Business rules, validations, calculations ONLY
 * - NO data access
 * - Just pure functions
 */
export class CompletionService {
  /**
   * Create completion object with calculated fields
   */
  createCompletionObject(
    data: Omit<Completion, 'timestamp' | 'timeSpentSeconds'>,
    activeStartTime?: string | null
  ): Completion {
    const now = new Date().toISOString();
    let timeSpentSeconds: number | undefined;

    // Calculate time spent if address was active
    if (activeStartTime) {
      timeSpentSeconds = this.calculateTimeSpent(activeStartTime);
      logger.info(
        `Time tracked: ${timeSpentSeconds}s (${Math.floor(timeSpentSeconds / 60)}min)`
      );
    }

    return {
      ...data,
      timestamp: now,
      timeSpentSeconds,
    };
  }

  /**
   * Calculate time spent in seconds
   */
  calculateTimeSpent(startTime: string): number {
    const startMs = new Date(startTime).getTime();
    const endMs = Date.now();
    return Math.floor((endMs - startMs) / 1000);
  }

  /**
   * Calculate enforcement fees (TCG Regulations 2014)
   * £75 compliance + £235 base + 7.5% over £1500
   */
  calculateEnforcementFees(debtAmount: number, numberOfCases: number): number {
    if (numberOfCases > 1) {
      // For multiple cases, user should enter enforcement fees manually
      return 0;
    }

    const complianceFee = 75;
    const baseFee = 235;
    const amountOverThreshold = Math.max(0, debtAmount - 1500);
    const percentageFee = amountOverThreshold * 0.075; // 7.5%

    const totalFees = complianceFee + baseFee + percentageFee;

    logger.debug('Enforcement fees calculated:', {
      debtAmount,
      complianceFee,
      baseFee,
      percentageFee,
      totalFees,
    });

    return totalFees;
  }

  /**
   * Calculate total earnings from completions
   */
  calculateTotalEarnings(completions: Completion[]): number {
    return completions.reduce((total, completion) => {
      if (completion.outcome === 'PIF' && completion.amount) {
        return total + parseFloat(completion.amount);
      }
      return total;
    }, 0);
  }

  /**
   * Group completions by date
   */
  groupByDate(completions: Completion[]): Map<string, Completion[]> {
    const grouped = new Map<string, Completion[]>();

    for (const completion of completions) {
      const date = completion.timestamp.slice(0, 10);
      const existing = grouped.get(date) || [];
      grouped.set(date, [...existing, completion]);
    }

    return grouped;
  }

  /**
   * Filter PIF completions
   */
  filterPIFs(completions: Completion[]): Completion[] {
    return completions.filter((c) => c.outcome === 'PIF');
  }

  /**
   * Filter arrangement-related completions
   */
  filterArrangements(completions: Completion[]): Completion[] {
    return completions.filter((c) => c.arrangementId !== undefined);
  }

  /**
   * Count completions by outcome
   */
  countByOutcome(completions: Completion[]): Record<Outcome, number> {
    const counts: Record<Outcome, number> = {
      PIF: 0,
      DA: 0,
      Done: 0,
      ARR: 0,
    };

    for (const completion of completions) {
      counts[completion.outcome]++;
    }

    return counts;
  }

  /**
   * Get completions for a specific date
   */
  getCompletionsForDate(completions: Completion[], date: string): Completion[] {
    return completions.filter((c) => c.timestamp.startsWith(date));
  }

  /**
   * Calculate average time spent per completion
   */
  calculateAverageTimeSpent(completions: Completion[]): number | null {
    const withTime = completions.filter((c) => c.timeSpentSeconds !== undefined);

    if (withTime.length === 0) {
      return null;
    }

    const totalSeconds = withTime.reduce((sum, c) => sum + (c.timeSpentSeconds || 0), 0);

    return totalSeconds / withTime.length;
  }

  /**
   * Validate completion data
   */
  validateCompletion(completion: Partial<Completion>): { valid: boolean; error?: string } {
    if (completion.index === undefined && completion.index !== 0) {
      return { valid: false, error: 'Completion missing index' };
    }

    if (!completion.address || typeof completion.address !== 'string') {
      return { valid: false, error: 'Completion missing or invalid address' };
    }

    if (!completion.outcome) {
      return { valid: false, error: 'Completion missing outcome' };
    }

    const validOutcomes: Outcome[] = ['PIF', 'DA', 'Done', 'ARR'];
    if (!validOutcomes.includes(completion.outcome)) {
      return { valid: false, error: `Invalid outcome: ${completion.outcome}` };
    }

    // PIF completions should have amount
    if (completion.outcome === 'PIF' && !completion.amount) {
      logger.warn('PIF completion missing amount');
    }

    return { valid: true };
  }

  /**
   * Calculate earnings for date range
   */
  calculateEarningsForRange(
    completions: Completion[],
    startDate: string,
    endDate: string
  ): number {
    const filtered = completions.filter((c) => {
      const date = c.timestamp.slice(0, 10);
      return date >= startDate && date <= endDate;
    });

    return this.calculateTotalEarnings(filtered);
  }

  /**
   * Get top earning days
   */
  getTopEarningDays(completions: Completion[], limit: number = 5): Array<{
    date: string;
    earnings: number;
    count: number;
  }> {
    const byDate = this.groupByDate(completions);
    const earnings: Array<{ date: string; earnings: number; count: number }> = [];

    for (const [date, comps] of byDate) {
      earnings.push({
        date,
        earnings: this.calculateTotalEarnings(comps),
        count: comps.length,
      });
    }

    return earnings.sort((a, b) => b.earnings - a.earnings).slice(0, limit);
  }
}
