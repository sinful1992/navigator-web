// src/services/CompletionService.ts
// Completion operations and business logic

import { logger } from '../utils/logger';
import { clearProtectionFlag } from '../utils/protectionFlags';
import type { Completion, Outcome } from '../types';
import type { SubmitOperationFn } from './SyncService';

export interface CompletionServiceDeps {
  submitOperation: SubmitOperationFn;
  deviceId: string;
}

/**
 * CompletionService - Completion management business logic
 *
 * Features:
 * - Create/update/delete completions
 * - TCG Regulations 2014 enforcement fee calculations
 * - Time tracking integration
 * - Earnings calculations
 * - Group by date
 * - Filter PIFs and arrangements
 */
export class CompletionService {
  private submitOperation: SubmitOperationFn;
  private deviceId: string;

  constructor(deps: CompletionServiceDeps) {
    this.submitOperation = deps.submitOperation;
    this.deviceId = deps.deviceId;
  }

  /**
   * Create completion
   * - Calculates time spent if active
   * - Clears active protection flag
   */
  async createCompletion(
    completion: Omit<Completion, 'timestamp' | 'device' | 'timeSpentSeconds'>,
    activeStartTime?: string | null
  ): Promise<Completion> {
    const now = new Date().toISOString();
    let timeSpentSeconds: number | undefined;

    // Calculate time spent if address was active
    if (activeStartTime) {
      const startTime = new Date(activeStartTime).getTime();
      const endTime = Date.now();
      timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
      logger.info(`Time tracked: ${timeSpentSeconds}s (${Math.floor(timeSpentSeconds / 60)}min)`);
    }

    const newCompletion: Completion = {
      ...completion,
      timestamp: now,
      device: this.deviceId,
      timeSpentSeconds,
    };

    // Clear active protection flag
    clearProtectionFlag('navigator_active_protection');

    await this.submitOperation({
      type: 'COMPLETION_CREATE',
      payload: { completion: newCompletion },
    });

    logger.info('Created completion:', newCompletion.outcome, newCompletion.address);

    return newCompletion;
  }

  /**
   * Update completion
   */
  async updateCompletion(
    originalTimestamp: string,
    updates: Partial<Completion>
  ): Promise<void> {
    await this.submitOperation({
      type: 'COMPLETION_UPDATE',
      payload: {
        originalTimestamp,
        updates,
      },
    });

    logger.info('Updated completion:', originalTimestamp);
  }

  /**
   * Delete completion (undo)
   */
  async deleteCompletion(
    timestamp: string,
    index: number,
    listVersion: number
  ): Promise<void> {
    await this.submitOperation({
      type: 'COMPLETION_DELETE',
      payload: {
        timestamp,
        index,
        listVersion,
      },
    });

    logger.info('Deleted completion:', timestamp);
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
        return total + completion.amount;
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
    return completions.filter(c => c.outcome === 'PIF');
  }

  /**
   * Filter arrangement-related completions
   */
  filterArrangements(completions: Completion[]): Completion[] {
    return completions.filter(c => c.arrangementId !== undefined);
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
    return completions.filter(c => c.timestamp.startsWith(date));
  }

  /**
   * Calculate average time spent per completion
   */
  calculateAverageTimeSpent(completions: Completion[]): number | null {
    const withTime = completions.filter(c => c.timeSpentSeconds !== undefined);

    if (withTime.length === 0) {
      return null;
    }

    const totalSeconds = withTime.reduce(
      (sum, c) => sum + (c.timeSpentSeconds || 0),
      0
    );

    return totalSeconds / withTime.length;
  }

  /**
   * Validate completion data
   */
  validateCompletion(completion: Partial<Completion>): boolean {
    if (!completion.index && completion.index !== 0) {
      logger.error('Completion missing index');
      return false;
    }

    if (!completion.address || typeof completion.address !== 'string') {
      logger.error('Completion missing or invalid address');
      return false;
    }

    if (!completion.outcome) {
      logger.error('Completion missing outcome');
      return false;
    }

    const validOutcomes: Outcome[] = ['PIF', 'DA', 'Done', 'ARR'];
    if (!validOutcomes.includes(completion.outcome)) {
      logger.error('Invalid outcome:', completion.outcome);
      return false;
    }

    // PIF completions should have amount
    if (completion.outcome === 'PIF' && !completion.amount) {
      logger.warn('PIF completion missing amount');
    }

    return true;
  }
}
