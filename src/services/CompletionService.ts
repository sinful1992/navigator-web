// src/services/CompletionService.ts
// Business logic for completion management

import type { Completion, Outcome, AppState } from '../types';
import { logger } from '../utils/logger';
import { clearProtectionFlag } from '../utils/protectionFlags';
import type { Operation } from '../sync/operations';

export interface CompletionServiceConfig {
  submitOperation: (op: Partial<Operation>) => Promise<void>;
  deviceId: string;
}

/**
 * Service for managing completions
 * Handles business logic, validation, and operation submission
 */
export class CompletionService {
  private submitOperation: (op: Partial<Operation>) => Promise<void>;
  private deviceId: string;

  constructor(config: CompletionServiceConfig) {
    this.submitOperation = config.submitOperation;
    this.deviceId = config.deviceId;
  }

  /**
   * Create a new completion
   */
  async createCompletion(
    completion: Omit<Completion, 'timestamp' | 'device'>,
    activeStartTime?: string | null
  ): Promise<Completion> {
    const now = new Date().toISOString();

    // Calculate time spent if there was an active timer
    let timeSpentSeconds: number | undefined;
    if (activeStartTime) {
      const startTime = new Date(activeStartTime).getTime();
      const endTime = new Date(now).getTime();
      timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
    }

    const newCompletion: Completion = {
      ...completion,
      timestamp: now,
      device: this.deviceId,
      timeSpentSeconds
    };

    // Validate completion
    const validation = this.validateCompletion(newCompletion);
    if (!validation.valid) {
      throw new Error(`Invalid completion: ${validation.errors.join(', ')}`);
    }

    logger.info('Creating completion:', newCompletion);

    // Clear active protection flag if set
    clearProtectionFlag('navigator_active_protection');

    // Submit operation to cloud
    await this.submitOperation({
      type: 'COMPLETION_CREATE',
      payload: { completion: newCompletion }
    });

    return newCompletion;
  }

  /**
   * Update an existing completion
   */
  async updateCompletion(
    originalTimestamp: string,
    updates: Partial<Completion>
  ): Promise<Partial<Completion>> {
    logger.info('Updating completion:', { originalTimestamp, updates });

    // Validate updates
    if (updates.outcome) {
      const validation = this.validateOutcome(updates.outcome);
      if (!validation.valid) {
        throw new Error(`Invalid outcome: ${validation.errors.join(', ')}`);
      }
    }

    // Submit operation to cloud
    await this.submitOperation({
      type: 'COMPLETION_UPDATE',
      payload: {
        originalTimestamp,
        updates
      }
    });

    return updates;
  }

  /**
   * Delete a completion (undo)
   */
  async deleteCompletion(
    timestamp: string,
    index: number,
    listVersion: number
  ): Promise<void> {
    logger.info('Deleting completion:', { timestamp, index, listVersion });

    // Submit operation to cloud
    await this.submitOperation({
      type: 'COMPLETION_DELETE',
      payload: {
        timestamp,
        index,
        listVersion
      }
    });
  }

  /**
   * Calculate enforcement fees based on TCG Regulations 2014
   * @param debtAmount - The debt amount
   * @param numberOfCases - Number of cases (for multi-case enforcement)
   * @returns Calculated enforcement fee
   */
  calculateEnforcementFees(debtAmount: number, numberOfCases: number = 1): number {
    if (numberOfCases > 1) {
      // For multiple cases, fees calculated differently
      // This is a placeholder - actual calculation depends on bonus settings
      return 0;
    }

    // Single case enforcement fees (TCG Regulations 2014)
    const complianceFee = 75;
    const baseFee = 235;
    const amountOverThreshold = Math.max(0, debtAmount - 1500);
    const percentageFee = amountOverThreshold * 0.075; // 7.5%

    return complianceFee + baseFee + percentageFee;
  }

  /**
   * Validate completion data
   */
  validateCompletion(completion: Partial<Completion>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (completion.index === undefined || completion.index < 0) {
      errors.push('Valid index is required');
    }

    if (!completion.outcome) {
      errors.push('Outcome is required');
    } else {
      const outcomeValidation = this.validateOutcome(completion.outcome);
      if (!outcomeValidation.valid) {
        errors.push(...outcomeValidation.errors);
      }
    }

    if (!completion.address || completion.address.trim() === '') {
      errors.push('Address is required');
    }

    if (completion.listVersion === undefined || completion.listVersion < 0) {
      errors.push('Valid list version is required');
    }

    // Validate PIF-specific fields
    if (completion.outcome === 'PIF') {
      if (completion.amount === undefined || completion.amount <= 0) {
        errors.push('PIF completions must have a positive amount');
      }
      if (!completion.caseReference || completion.caseReference.trim() === '') {
        errors.push('PIF completions must have a case reference');
      }
    }

    // Validate arrangement-specific fields
    if (completion.outcome === 'ARR' && completion.arrangementId) {
      // Arrangement ID should be validated against existing arrangements
      // This would require access to state, so we'll skip for now
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate outcome
   */
  validateOutcome(outcome: string): { valid: boolean; errors: string[] } {
    const validOutcomes: Outcome[] = ['PIF', 'Done', 'DA', 'ARR', 'Gone Away', 'Vulnerable'];
    const errors: string[] = [];

    if (!validOutcomes.includes(outcome as Outcome)) {
      errors.push(`Invalid outcome: ${outcome}. Must be one of: ${validOutcomes.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if completion is for a PIF outcome
   */
  isPIF(completion: Completion): boolean {
    return completion.outcome === 'PIF';
  }

  /**
   * Check if completion is for an arrangement
   */
  isArrangement(completion: Completion): boolean {
    return completion.outcome === 'ARR' && !!completion.arrangementId;
  }

  /**
   * Get completion date (formatted as YYYY-MM-DD)
   */
  getCompletionDate(completion: Completion): string {
    return completion.timestamp.slice(0, 10);
  }

  /**
   * Group completions by date
   */
  groupByDate(completions: Completion[]): Map<string, Completion[]> {
    const grouped = new Map<string, Completion[]>();

    completions.forEach(completion => {
      const date = this.getCompletionDate(completion);
      const existing = grouped.get(date) || [];
      existing.push(completion);
      grouped.set(date, existing);
    });

    return grouped;
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
   * Get completions for a specific date
   */
  getCompletionsForDate(completions: Completion[], date: string): Completion[] {
    return completions.filter(c => this.getCompletionDate(c) === date);
  }

  /**
   * Get PIF completions for a specific date
   */
  getPIFsForDate(completions: Completion[], date: string): Completion[] {
    return this.getCompletionsForDate(completions, date).filter(c => c.outcome === 'PIF');
  }
}
