// src/hooks/useSettings.ts
import { useEffect, useState } from 'react';

// Define the settings interface
export interface Settings {
  backupOnEndOfDay: boolean;
  reminderText: string;
  darkMode: boolean;
  pushNotifications: boolean;
  autoSyncOnStart: boolean;
  confirmBeforeDelete: boolean;
  keepDataForMonths: 0 | 3 | 6 | 12; // 0 = forever
}

// Pre-defined reminder texts for SMS
export const PREDEFINED_REMINDERS = [
  'Reminder: Please arrange payment by end of day to avoid further action.',
  'Friendly reminder: Your arrangement is due. Contact us to confirm.',
  'Action required: Settle outstanding balance today for compliance.',
  'Update: Payment arrangement needed. Reply to reschedule if required.',
] as const;

// Default settings
const DEFAULT_SETTINGS: Settings = {
  backupOnEndOfDay: false,
  reminderText: PREDEFINED_REMINDERS[0],
  darkMode: false,
  pushNotifications: true,
  autoSyncOnStart: true,
  confirmBeforeDelete: true,
  keepDataForMonths: 6,
};

// Key for localStorage
const SETTINGS_KEY = 'navigator-web:settings';

// Custom hook for managing settings with localStorage persistence
export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(() => {
    // Load from localStorage on init
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Persist to localStorage on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  // Apply dark mode to document
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark-mode');
      document.body.style.background = 'linear-gradient(135deg, #1f2937 0%, #111827 100%)';
    } else {
      document.documentElement.classList.remove('dark-mode');
      document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  }, [settings.darkMode]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Toggle helpers
  const toggleBackup = () => updateSettings({ backupOnEndOfDay: !settings.backupOnEndOfDay });
  const toggleDarkMode = () => updateSettings({ darkMode: !settings.darkMode });
  const togglePushNotifications = () => updateSettings({ pushNotifications: !settings.pushNotifications });
  const toggleAutoSync = () => updateSettings({ autoSyncOnStart: !settings.autoSyncOnStart });
  const toggleConfirmBeforeDelete = () => updateSettings({ confirmBeforeDelete: !settings.confirmBeforeDelete });

  // Update reminder text
  const updateReminderText = (text: string) => updateSettings({ reminderText: text });

  // Update data retention
  const updateKeepDataForMonths = (months: 0 | 3 | 6 | 12) => updateSettings({ keepDataForMonths: months });

  return {
    settings,
    updateSettings,
    toggleBackup,
    toggleDarkMode,
    togglePushNotifications,
    toggleAutoSync,
    toggleConfirmBeforeDelete,
    updateReminderText,
    updateKeepDataForMonths,
    predefinedReminders: PREDEFINED_REMINDERS,
  };
};

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
};