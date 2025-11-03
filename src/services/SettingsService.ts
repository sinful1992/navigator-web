// src/services/SettingsService.ts
// Business logic for settings management

import type { UserSubscription, ReminderSettings, BonusSettings } from '../types';
import { logger } from '../utils/logger';
import type { Operation } from '../sync/operations';

export interface SettingsServiceConfig {
  submitOperation: (op: Partial<Operation>) => Promise<void>;
  deviceId: string;
}

/**
 * Service for managing user settings
 * Handles business logic, validation, and operation submission
 */
export class SettingsService {
  private submitOperation: (op: Partial<Operation>) => Promise<void>;
  private deviceId: string;

  constructor(config: SettingsServiceConfig) {
    this.submitOperation = config.submitOperation;
    this.deviceId = config.deviceId;
  }

  /**
   * Update user subscription
   */
  async updateSubscription(subscription: UserSubscription | null): Promise<void> {
    logger.info('Updating subscription:', subscription);

    // Validate subscription if present
    if (subscription) {
      const validation = this.validateSubscription(subscription);
      if (!validation.valid) {
        throw new Error(`Invalid subscription: ${validation.errors.join(', ')}`);
      }
    }

    // Submit operation to cloud
    await this.submitOperation({
      type: 'SETTINGS_UPDATE_SUBSCRIPTION',
      payload: { subscription }
    });
  }

  /**
   * Update reminder settings
   */
  async updateReminderSettings(settings: ReminderSettings): Promise<void> {
    logger.info('Updating reminder settings:', settings);

    // Validate settings
    const validation = this.validateReminderSettings(settings);
    if (!validation.valid) {
      throw new Error(`Invalid reminder settings: ${validation.errors.join(', ')}`);
    }

    // Submit operation to cloud
    await this.submitOperation({
      type: 'SETTINGS_UPDATE_REMINDER',
      payload: { settings }
    });
  }

  /**
   * Update bonus settings
   */
  async updateBonusSettings(settings: BonusSettings): Promise<void> {
    logger.info('Updating bonus settings:', settings);

    // Validate settings
    const validation = this.validateBonusSettings(settings);
    if (!validation.valid) {
      throw new Error(`Invalid bonus settings: ${validation.errors.join(', ')}`);
    }

    // Submit operation to cloud
    await this.submitOperation({
      type: 'SETTINGS_UPDATE_BONUS',
      payload: { settings }
    });
  }

  /**
   * Validate subscription data
   */
  validateSubscription(subscription: Partial<UserSubscription>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!subscription.tier) {
      errors.push('Subscription tier is required');
    } else {
      const validTiers = ['free', 'pro', 'enterprise'];
      if (!validTiers.includes(subscription.tier)) {
        errors.push(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
      }
    }

    if (subscription.expiresAt) {
      const expiryDate = new Date(subscription.expiresAt);
      if (isNaN(expiryDate.getTime())) {
        errors.push('Invalid expiry date');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate reminder settings
   */
  validateReminderSettings(settings: Partial<ReminderSettings>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') {
      errors.push('Enabled must be a boolean');
    }

    if (settings.reminderTime) {
      // Validate time format (HH:MM)
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(settings.reminderTime)) {
        errors.push('Invalid reminder time format (expected HH:MM)');
      }
    }

    if (settings.daysBeforeReminder !== undefined) {
      if (!Number.isInteger(settings.daysBeforeReminder) || settings.daysBeforeReminder < 0) {
        errors.push('Days before reminder must be a non-negative integer');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate bonus settings
   */
  validateBonusSettings(settings: Partial<BonusSettings>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') {
      errors.push('Enabled must be a boolean');
    }

    if (settings.complexCalculation !== undefined && typeof settings.complexCalculation !== 'boolean') {
      errors.push('Complex calculation must be a boolean');
    }

    if (settings.baseFee !== undefined) {
      if (isNaN(settings.baseFee) || settings.baseFee < 0) {
        errors.push('Base fee must be a non-negative number');
      }
    }

    if (settings.percentageFee !== undefined) {
      if (isNaN(settings.percentageFee) || settings.percentageFee < 0 || settings.percentageFee > 100) {
        errors.push('Percentage fee must be between 0 and 100');
      }
    }

    if (settings.thresholdAmount !== undefined) {
      if (isNaN(settings.thresholdAmount) || settings.thresholdAmount < 0) {
        errors.push('Threshold amount must be a non-negative number');
      }
    }

    if (settings.dailyThreshold !== undefined) {
      if (isNaN(settings.dailyThreshold) || settings.dailyThreshold < 0) {
        errors.push('Daily threshold must be a non-negative number');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(subscription: UserSubscription | null): boolean {
    if (!subscription) return false;
    if (subscription.tier === 'free') return true;

    if (subscription.expiresAt) {
      const expiryDate = new Date(subscription.expiresAt);
      return expiryDate > new Date();
    }

    return false;
  }

  /**
   * Get subscription features based on tier
   */
  getSubscriptionFeatures(tier: string): {
    maxAddresses: number;
    cloudSync: boolean;
    advancedReporting: boolean;
    prioritySupport: boolean;
  } {
    switch (tier) {
      case 'enterprise':
        return {
          maxAddresses: Infinity,
          cloudSync: true,
          advancedReporting: true,
          prioritySupport: true
        };
      case 'pro':
        return {
          maxAddresses: 10000,
          cloudSync: true,
          advancedReporting: true,
          prioritySupport: false
        };
      case 'free':
      default:
        return {
          maxAddresses: 100,
          cloudSync: true,
          advancedReporting: false,
          prioritySupport: false
        };
    }
  }

  /**
   * Calculate days until subscription expires
   */
  getDaysUntilExpiry(subscription: UserSubscription | null): number | null {
    if (!subscription?.expiresAt) return null;

    const expiryDate = new Date(subscription.expiresAt);
    const today = new Date();
    const diff = expiryDate.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if subscription is expiring soon (within N days)
   */
  isExpiringSoon(subscription: UserSubscription | null, daysThreshold: number = 7): boolean {
    const daysUntilExpiry = this.getDaysUntilExpiry(subscription);
    if (daysUntilExpiry === null) return false;

    return daysUntilExpiry > 0 && daysUntilExpiry <= daysThreshold;
  }

  /**
   * Get default reminder settings
   */
  getDefaultReminderSettings(): ReminderSettings {
    return {
      enabled: false,
      reminderTime: '09:00',
      daysBeforeReminder: 1
    };
  }

  /**
   * Get default bonus settings
   */
  getDefaultBonusSettings(): BonusSettings {
    return {
      enabled: false,
      complexCalculation: false,
      baseFee: 235,
      percentageFee: 7.5,
      thresholdAmount: 1500,
      dailyThreshold: 100
    };
  }
}
