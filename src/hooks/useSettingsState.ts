// src/hooks/useSettingsState.ts
// Settings management - Subscription, Reminders, Bonus settings
// PHASE 2 Task 1: Extracted from useAppState.ts (lines 1470-1514)
import type { SubmitOperationCallback } from '../types/operations';

import React from 'react';
import { logger } from '../utils/logger';
import type { AppState, UserSubscription, ReminderSettings, BonusSettings } from '../types';


export interface UseSettingsStateProps {
  submitOperation?: SubmitOperationCallback;
  setBaseState: React.Dispatch<React.SetStateAction<AppState>>;
}

export interface UseSettingsStateReturn {
  setSubscription: (subscription: UserSubscription | null) => void;
  updateReminderSettings: (settings: ReminderSettings) => void;
  updateBonusSettings: (settings: BonusSettings) => void;
}

/**
 * useSettingsState - Manages user settings
 *
 * Responsibilities:
 * - Update subscription status (premium, trial, free)
 * - Update reminder notification settings (frequency, timing)
 * - Update bonus/incentive settings
 * - Cloud sync integration for all settings changes
 * - Simple setter pattern for settings management
 *
 * @param props - Hook configuration
 * @returns Object with settings actions
 */
export function useSettingsState({
  submitOperation,
  setBaseState
}: UseSettingsStateProps): UseSettingsStateReturn {
  /**
   * Update user subscription status
   * - Sets subscription tier (free, trial, premium)
   * - Null means no active subscription
   * - Submits to cloud sync immediately
   *
   * @param subscription - Subscription object or null
   */
  const setSubscription = React.useCallback(
    (subscription: UserSubscription | null) => {
      setBaseState((s) => ({ ...s, subscription }));

      // 🔥 DELTA SYNC: Submit operation to cloud immediately
      if (submitOperation) {
        submitOperation({
          type: 'SETTINGS_UPDATE_SUBSCRIPTION',
          payload: { subscription }
        }).catch((err) => {
          logger.error('Failed to submit subscription update operation:', err);
        });
      }
    },
    [submitOperation, setBaseState]
  );

  /**
   * Update reminder notification settings
   * - Controls reminder frequency and timing for arrangements
   * - Affects when users are notified about upcoming scheduled visits
   * - Submits to cloud sync immediately
   *
   * @param settings - Reminder settings configuration
   */
  const updateReminderSettings = React.useCallback(
    (settings: ReminderSettings) => {
      setBaseState((s) => ({ ...s, reminderSettings: settings }));

      // 🔥 DELTA SYNC: Submit operation to cloud immediately
      if (submitOperation) {
        submitOperation({
          type: 'SETTINGS_UPDATE_REMINDER',
          payload: { settings }
        }).catch((err) => {
          logger.error('Failed to submit reminder settings update operation:', err);
        });
      }
    },
    [submitOperation, setBaseState]
  );

  /**
   * Update bonus/incentive settings
   * - Controls bonus calculation and display settings
   * - Affects earnings tracking and bonus targeting
   * - Submits to cloud sync immediately
   *
   * @param settings - Bonus settings configuration
   */
  const updateBonusSettings = React.useCallback(
    (settings: BonusSettings) => {
      setBaseState((s) => ({ ...s, bonusSettings: settings }));

      // 🔥 DELTA SYNC: Submit operation to cloud immediately
      if (submitOperation) {
        submitOperation({
          type: 'SETTINGS_UPDATE_BONUS',
          payload: { settings }
        }).catch((err) => {
          logger.error('Failed to submit bonus settings update operation:', err);
        });
      }
    },
    [submitOperation, setBaseState]
  );

  return {
    setSubscription,
    updateReminderSettings,
    updateBonusSettings
  };
}
