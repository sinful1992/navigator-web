// src/hooks/useSettings.ts - Context Provider Pattern
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

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

// Context type
interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  toggleBackup: () => void;
  toggleDarkMode: () => void;
  togglePushNotifications: () => void;
  toggleAutoSync: () => void;
  toggleConfirmBeforeDelete: () => void;
  updateReminderText: (text: string) => void;
  updateKeepDataForMonths: (months: 0 | 3 | 6 | 12) => void;
  predefinedReminders: typeof PREDEFINED_REMINDERS;
}

// Create context with undefined default (will throw if used outside provider)
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Provider component
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  // Memoize functions to prevent unnecessary re-renders
  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const toggleBackup = useCallback(() => {
    setSettings((prev) => ({ ...prev, backupOnEndOfDay: !prev.backupOnEndOfDay }));
  }, []);

  const toggleDarkMode = useCallback(() => {
    setSettings((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  }, []);

  const togglePushNotifications = useCallback(() => {
    setSettings((prev) => ({ ...prev, pushNotifications: !prev.pushNotifications }));
  }, []);

  const toggleAutoSync = useCallback(() => {
    setSettings((prev) => ({ ...prev, autoSyncOnStart: !prev.autoSyncOnStart }));
  }, []);

  const toggleConfirmBeforeDelete = useCallback(() => {
    setSettings((prev) => ({ ...prev, confirmBeforeDelete: !prev.confirmBeforeDelete }));
  }, []);

  const updateReminderText = useCallback((text: string) => {
    setSettings((prev) => ({ ...prev, reminderText: text }));
  }, []);

  const updateKeepDataForMonths = useCallback((months: 0 | 3 | 6 | 12) => {
    setSettings((prev) => ({ ...prev, keepDataForMonths: months }));
  }, []);

  const value = {
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

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// Custom hook to use settings context
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
};