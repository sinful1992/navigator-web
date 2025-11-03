// src/repositories/SettingsRepository.ts
// Settings data access layer - CRUD operations only

import { BaseRepository } from './BaseRepository';
import type { UserSubscription, ReminderSettings, BonusSettings } from '../types';

/**
 * SettingsRepository - Settings data access
 *
 * Responsibility: Data persistence ONLY
 * - Submit SETTINGS_UPDATE_SUBSCRIPTION operations
 * - Submit SETTINGS_UPDATE_REMINDER operations
 * - Submit SETTINGS_UPDATE_BONUS operations
 * - NO business logic (validation, feature checking)
 */
export class SettingsRepository extends BaseRepository {
  /**
   * Persist subscription update
   */
  async saveSubscription(subscription: UserSubscription | null): Promise<void> {
    await this.submit({
      type: 'SETTINGS_UPDATE_SUBSCRIPTION',
      payload: { subscription },
    });
  }

  /**
   * Persist reminder settings update
   */
  async saveReminderSettings(settings: ReminderSettings): Promise<void> {
    await this.submit({
      type: 'SETTINGS_UPDATE_REMINDER',
      payload: { settings },
    });
  }

  /**
   * Persist bonus settings update
   */
  async saveBonusSettings(settings: BonusSettings): Promise<void> {
    await this.submit({
      type: 'SETTINGS_UPDATE_BONUS',
      payload: { settings },
    });
  }
}
