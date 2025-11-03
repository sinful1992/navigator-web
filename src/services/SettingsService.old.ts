// src/services/SettingsService.ts
// Settings management and validation

import { logger } from '../utils/logger';
import type { UserSubscription, ReminderSettings, BonusSettings } from '../types';
import type { SubmitOperationFn } from './SyncService';

export interface SettingsServiceDeps {
  submitOperation: SubmitOperationFn;
}

/**
 * SettingsService - Settings management
 *
 * Features:
 * - Subscription management with feature checking
 * - Reminder settings with validation
 * - Bonus settings with validation
 * - Tier-based feature gates
 */
export class SettingsService {
  private submitOperation: SubmitOperationFn;

  constructor(deps: SettingsServiceDeps) {
    this.submitOperation = deps.submitOperation;
  }

  /**
   * Update subscription settings
   */
  async updateSubscription(subscription: UserSubscription | null): Promise<void> {
    await this.submitOperation({
      type: 'SETTINGS_UPDATE_SUBSCRIPTION',
      payload: { subscription },
    });

    logger.info('Updated subscription:', subscription?.tier || 'none');
  }

  /**
   * Update reminder settings
   */
  async updateReminderSettings(settings: ReminderSettings): Promise<void> {
    if (!this.validateReminderSettings(settings)) {
      throw new Error('Invalid reminder settings');
    }

    await this.submitOperation({
      type: 'SETTINGS_UPDATE_REMINDER',
      payload: { settings },
    });

    logger.info('Updated reminder settings');
  }

  /**
   * Update bonus settings
   */
  async updateBonusSettings(settings: BonusSettings): Promise<void> {
    if (!this.validateBonusSettings(settings)) {
      throw new Error('Invalid bonus settings');
    }

    await this.submitOperation({
      type: 'SETTINGS_UPDATE_BONUS',
      payload: { settings },
    });

    logger.info('Updated bonus settings');
  }

  /**
   * Get subscription features based on tier
   */
  getSubscriptionFeatures(tier: string | undefined): {
    maxAddresses: number;
    cloudSync: boolean;
    routeOptimization: boolean;
    earningsTracking: boolean;
    multiDevice: boolean;
  } {
    switch (tier) {
      case 'enterprise':
        return {
          maxAddresses: Infinity,
          cloudSync: true,
          routeOptimization: true,
          earningsTracking: true,
          multiDevice: true,
        };

      case 'pro':
        return {
          maxAddresses: 10000,
          cloudSync: true,
          routeOptimization: true,
          earningsTracking: true,
          multiDevice: true,
        };

      case 'free':
      default:
        return {
          maxAddresses: 100,
          cloudSync: true,
          routeOptimization: false,
          earningsTracking: true,
          multiDevice: false,
        };
    }
  }

  /**
   * Check if user has access to feature
   */
  hasFeatureAccess(
    subscription: UserSubscription | null,
    feature: 'routeOptimization' | 'cloudSync' | 'multiDevice' | 'earningsTracking'
  ): boolean {
    const features = this.getSubscriptionFeatures(subscription?.tier);
    return features[feature];
  }

  /**
   * Validate reminder settings
   */
  validateReminderSettings(settings: Partial<ReminderSettings>): boolean {
    if (settings.enabled === undefined) {
      logger.error('Reminder settings missing enabled flag');
      return false;
    }

    if (settings.daysBeforeReminder !== undefined) {
      if (typeof settings.daysBeforeReminder !== 'number' || settings.daysBeforeReminder < 0) {
        logger.error('Invalid daysBeforeReminder:', settings.daysBeforeReminder);
        return false;
      }
    }

    if (settings.smsEnabled !== undefined) {
      if (typeof settings.smsEnabled !== 'boolean') {
        logger.error('Invalid smsEnabled:', settings.smsEnabled);
        return false;
      }
    }

    if (settings.emailEnabled !== undefined) {
      if (typeof settings.emailEnabled !== 'boolean') {
        logger.error('Invalid emailEnabled:', settings.emailEnabled);
        return false;
      }
    }

    return true;
  }

  /**
   * Validate bonus settings
   */
  validateBonusSettings(settings: Partial<BonusSettings>): boolean {
    if (settings.enabled === undefined) {
      logger.error('Bonus settings missing enabled flag');
      return false;
    }

    if (settings.type !== undefined) {
      const validTypes = ['simple', 'complex'];
      if (!validTypes.includes(settings.type)) {
        logger.error('Invalid bonus type:', settings.type);
        return false;
      }
    }

    // Simple bonus validation
    if (settings.type === 'simple') {
      if (settings.simpleThreshold !== undefined) {
        if (typeof settings.simpleThreshold !== 'number' || settings.simpleThreshold < 0) {
          logger.error('Invalid simpleThreshold:', settings.simpleThreshold);
          return false;
        }
      }

      if (settings.simplePercentage !== undefined) {
        if (typeof settings.simplePercentage !== 'number' ||
            settings.simplePercentage < 0 ||
            settings.simplePercentage > 1) {
          logger.error('Invalid simplePercentage:', settings.simplePercentage);
          return false;
        }
      }
    }

    // Complex bonus validation
    if (settings.type === 'complex') {
      if (settings.dailyThreshold !== undefined) {
        if (typeof settings.dailyThreshold !== 'number' || settings.dailyThreshold < 0) {
          logger.error('Invalid dailyThreshold:', settings.dailyThreshold);
          return false;
        }
      }

      if (settings.largePifThreshold !== undefined) {
        if (typeof settings.largePifThreshold !== 'number' || settings.largePifThreshold < 0) {
          logger.error('Invalid largePifThreshold:', settings.largePifThreshold);
          return false;
        }
      }

      if (settings.largePifPercentage !== undefined) {
        if (typeof settings.largePifPercentage !== 'number' ||
            settings.largePifPercentage < 0 ||
            settings.largePifPercentage > 1) {
          logger.error('Invalid largePifPercentage:', settings.largePifPercentage);
          return false;
        }
      }

      if (settings.regularPifPercentage !== undefined) {
        if (typeof settings.regularPifPercentage !== 'number' ||
            settings.regularPifPercentage < 0 ||
            settings.regularPifPercentage > 1) {
          logger.error('Invalid regularPifPercentage:', settings.regularPifPercentage);
          return false;
        }
      }

      if (settings.daPercentage !== undefined) {
        if (typeof settings.daPercentage !== 'number' ||
            settings.daPercentage < 0 ||
            settings.daPercentage > 1) {
          logger.error('Invalid daPercentage:', settings.daPercentage);
          return false;
        }
      }

      if (settings.donePercentage !== undefined) {
        if (typeof settings.donePercentage !== 'number' ||
            settings.donePercentage < 0 ||
            settings.donePercentage > 1) {
          logger.error('Invalid donePercentage:', settings.donePercentage);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get default reminder settings
   */
  getDefaultReminderSettings(): ReminderSettings {
    return {
      enabled: true,
      daysBeforeReminder: 1,
      smsEnabled: false,
      emailEnabled: false,
    };
  }

  /**
   * Get default bonus settings
   */
  getDefaultBonusSettings(): BonusSettings {
    return {
      enabled: false,
      type: 'simple',
      simpleThreshold: 1000,
      simplePercentage: 0.1,
      dailyThreshold: 100,
      largePifThreshold: 1000,
      largePifPercentage: 0.025,
      regularPifPercentage: 0.015,
      daPercentage: 0.005,
      donePercentage: 0.002,
    };
  }
}
