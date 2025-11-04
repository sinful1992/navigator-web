// src/services/SettingsService.ts (REFACTORED - Pure Business Logic)
// Settings business logic ONLY

import { logger } from '../utils/logger';
import type { UserSubscription, ReminderSettings, BonusSettings } from '../types';

/**
 * SettingsService - Pure business logic for settings
 *
 * Responsibility: Business rules, validations, feature checking ONLY
 * - NO data access
 * - Just pure functions
 */
export class SettingsService {
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
   * Check if address limit is reached
   */
  isAddressLimitReached(
    currentAddressCount: number,
    subscription: UserSubscription | null
  ): boolean {
    const features = this.getSubscriptionFeatures(subscription?.tier);
    return currentAddressCount >= features.maxAddresses;
  }

  /**
   * Get remaining address slots
   */
  getRemainingAddressSlots(
    currentAddressCount: number,
    subscription: UserSubscription | null
  ): number {
    const features = this.getSubscriptionFeatures(subscription?.tier);

    if (features.maxAddresses === Infinity) {
      return Infinity;
    }

    return Math.max(0, features.maxAddresses - currentAddressCount);
  }

  /**
   * Validate reminder settings
   */
  validateReminderSettings(settings: Partial<ReminderSettings>): { valid: boolean; error?: string } {
    if (settings.enabled === undefined) {
      return { valid: false, error: 'Reminder settings missing enabled flag' };
    }

    if (settings.daysBeforeReminder !== undefined) {
      if (typeof settings.daysBeforeReminder !== 'number' || settings.daysBeforeReminder < 0) {
        return { valid: false, error: `Invalid daysBeforeReminder: ${settings.daysBeforeReminder}` };
      }
    }

    if (settings.smsEnabled !== undefined) {
      if (typeof settings.smsEnabled !== 'boolean') {
        return { valid: false, error: `Invalid smsEnabled: ${settings.smsEnabled}` };
      }
    }

    if (settings.emailEnabled !== undefined) {
      if (typeof settings.emailEnabled !== 'boolean') {
        return { valid: false, error: `Invalid emailEnabled: ${settings.emailEnabled}` };
      }
    }

    return { valid: true };
  }

  /**
   * Validate bonus settings
   */
  validateBonusSettings(settings: Partial<BonusSettings>): { valid: boolean; error?: string } {
    if (settings.enabled === undefined) {
      return { valid: false, error: 'Bonus settings missing enabled flag' };
    }

    if (settings.type !== undefined) {
      const validTypes = ['simple', 'complex'];
      if (!validTypes.includes(settings.type)) {
        return { valid: false, error: `Invalid bonus type: ${settings.type}` };
      }
    }

    // Simple bonus validation
    if (settings.type === 'simple') {
      if (settings.simpleThreshold !== undefined) {
        if (typeof settings.simpleThreshold !== 'number' || settings.simpleThreshold < 0) {
          return { valid: false, error: `Invalid simpleThreshold: ${settings.simpleThreshold}` };
        }
      }

      if (settings.simplePercentage !== undefined) {
        if (
          typeof settings.simplePercentage !== 'number' ||
          settings.simplePercentage < 0 ||
          settings.simplePercentage > 1
        ) {
          return { valid: false, error: `Invalid simplePercentage: ${settings.simplePercentage}` };
        }
      }
    }

    // Complex bonus validation
    if (settings.type === 'complex') {
      if (settings.dailyThreshold !== undefined) {
        if (typeof settings.dailyThreshold !== 'number' || settings.dailyThreshold < 0) {
          return { valid: false, error: `Invalid dailyThreshold: ${settings.dailyThreshold}` };
        }
      }

      if (settings.largePifThreshold !== undefined) {
        if (typeof settings.largePifThreshold !== 'number' || settings.largePifThreshold < 0) {
          return { valid: false, error: `Invalid largePifThreshold: ${settings.largePifThreshold}` };
        }
      }

      if (settings.largePifPercentage !== undefined) {
        if (
          typeof settings.largePifPercentage !== 'number' ||
          settings.largePifPercentage < 0 ||
          settings.largePifPercentage > 1
        ) {
          return { valid: false, error: `Invalid largePifPercentage: ${settings.largePifPercentage}` };
        }
      }

      if (settings.regularPifPercentage !== undefined) {
        if (
          typeof settings.regularPifPercentage !== 'number' ||
          settings.regularPifPercentage < 0 ||
          settings.regularPifPercentage > 1
        ) {
          return { valid: false, error: `Invalid regularPifPercentage: ${settings.regularPifPercentage}` };
        }
      }

      if (settings.daPercentage !== undefined) {
        if (
          typeof settings.daPercentage !== 'number' ||
          settings.daPercentage < 0 ||
          settings.daPercentage > 1
        ) {
          return { valid: false, error: `Invalid daPercentage: ${settings.daPercentage}` };
        }
      }

      if (settings.donePercentage !== undefined) {
        if (
          typeof settings.donePercentage !== 'number' ||
          settings.donePercentage < 0 ||
          settings.donePercentage > 1
        ) {
          return { valid: false, error: `Invalid donePercentage: ${settings.donePercentage}` };
        }
      }
    }

    return { valid: true };
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

  /**
   * Calculate bonus potential based on settings
   */
  calculateBonusPotential(
    totalEarnings: number,
    bonusSettings: BonusSettings
  ): number {
    if (!bonusSettings.enabled) {
      return 0;
    }

    if (bonusSettings.type === 'simple') {
      if (totalEarnings < bonusSettings.simpleThreshold) {
        return 0;
      }

      return totalEarnings * bonusSettings.simplePercentage;
    }

    // Complex bonus calculation would require more context (completions breakdown)
    // This is a simplified version
    return 0;
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(subscription: UserSubscription | null): boolean {
    if (!subscription) {
      return false;
    }

    const now = new Date();
    const expiresAt = new Date(subscription.currentPeriodEnd);

    return expiresAt > now;
  }

  /**
   * Get days until subscription expires
   */
  getDaysUntilExpiration(subscription: UserSubscription | null): number | null {
    if (!subscription) {
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(subscription.currentPeriodEnd);
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Check if subscription is expiring soon (within 7 days)
   */
  isSubscriptionExpiringSoon(subscription: UserSubscription | null): boolean {
    const daysUntilExpiration = this.getDaysUntilExpiration(subscription);

    if (daysUntilExpiration === null) {
      return false;
    }

    return daysUntilExpiration <= 7 && daysUntilExpiration > 0;
  }

  /**
   * Get subscription tier display name
   */
  getSubscriptionTierDisplayName(tier: string | undefined): string {
    switch (tier) {
      case 'enterprise':
        return 'Enterprise';
      case 'pro':
        return 'Professional';
      case 'free':
      default:
        return 'Free';
    }
  }
}
