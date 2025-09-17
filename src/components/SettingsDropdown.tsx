// src/components/SettingsDropdown.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useSettings, PREDEFINED_REMINDERS, isSupabaseConfigured } from '../hooks/useSettings';

interface SettingsDropdownProps {
  trigger?: React.ReactNode;
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({ trigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    settings,
    toggleBackup,
    toggleDarkMode,
    togglePushNotifications,
    toggleAutoSync,
    updateReminderText,
    predefinedReminders,
  } = useSettings();

  const [customReminder, setCustomReminder] = useState(settings.reminderText);
  const [selectedReminder, setSelectedReminder] = useState(
    predefinedReminders.includes(settings.reminderText as any)
      ? (settings.reminderText as typeof PREDEFINED_REMINDERS[number])
      : 'custom'
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleReminderChange = (value: string) => {
    if (value === 'custom') {
      updateReminderText(customReminder);
    } else {
      updateReminderText(value);
      setCustomReminder(value);
    }
    setSelectedReminder(value);
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomReminder(e.target.value);
    if (selectedReminder === 'custom') {
      updateReminderText(e.target.value);
    }
  };

  const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: () => void;
    id: string;
  }> = ({ checked, onChange, id }) => (
    <div className="toggle-switch" onClick={onChange}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="toggle-input"
      />
      <div className={`toggle-slider ${checked ? 'checked' : ''}`}>
        <div className="toggle-thumb"></div>
      </div>
    </div>
  );

  return (
    <div className="settings-dropdown" ref={dropdownRef}>
      <button
        className="settings-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {trigger || (
          <>
            <span className="settings-icon">⚙️</span>
            <span className="settings-text">Settings</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="settings-dropdown-content">
          <div className="settings-header">
            <h3 className="settings-title">App Settings</h3>
            <p className="settings-subtitle">Customize your experience</p>
          </div>

          {/* Backup Option - Conditional */}
          {isSupabaseConfigured() && (
            <>
              <div className="settings-section">
                <div className="setting-item">
                  <div className="setting-info">
                    <label htmlFor="backup-toggle" className="setting-label">
                      Backup download on end of day
                    </label>
                    <p className="setting-description">
                      Automatically download backup when finishing the day (requires cloud sync).
                    </p>
                  </div>
                  <ToggleSwitch
                    id="backup-toggle"
                    checked={settings.backupOnEndOfDay}
                    onChange={toggleBackup}
                  />
                </div>
              </div>
              <div className="settings-separator" />
            </>
          )}

          {/* Arrangement Reminder Text */}
          <div className="settings-section">
            <label className="setting-label">Arrangement Reminder Text</label>
            <select
              className="settings-select"
              value={selectedReminder}
              onChange={(e) => handleReminderChange(e.target.value)}
            >
              {predefinedReminders.map((text) => (
                <option key={text} value={text}>
                  {text.length > 50 ? `${text.substring(0, 50)}...` : text}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {selectedReminder === 'custom' && (
              <input
                type="text"
                value={customReminder}
                onChange={handleCustomInputChange}
                placeholder="Enter your custom reminder text..."
                className="settings-input"
              />
            )}
            <p className="setting-description">
              This text will be used for sending SMS arrangement reminders.
            </p>
          </div>
          <div className="settings-separator" />

          {/* Other Settings */}
          <div className="settings-section">
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="dark-mode" className="setting-label">
                  Dark Mode
                </label>
              </div>
              <ToggleSwitch
                id="dark-mode"
                checked={settings.darkMode}
                onChange={toggleDarkMode}
              />
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="push-notifs" className="setting-label">
                  Push Notifications
                </label>
              </div>
              <ToggleSwitch
                id="push-notifs"
                checked={settings.pushNotifications}
                onChange={togglePushNotifications}
              />
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="auto-sync" className="setting-label">
                  Auto-sync on app start
                </label>
              </div>
              <ToggleSwitch
                id="auto-sync"
                checked={settings.autoSyncOnStart}
                onChange={toggleAutoSync}
              />
            </div>
          </div>

          {/* Footer note */}
          <div className="settings-footer">
            Settings are saved locally and synced to cloud if configured.
          </div>
        </div>
      )}

      <style>{`
        .settings-dropdown {
          position: relative;
          display: inline-block;
        }

        .settings-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--gray-100);
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-md);
          color: var(--gray-700);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition-normal);
        }

        .settings-trigger:hover {
          background: var(--gray-200);
          color: var(--gray-800);
        }

        .settings-icon {
          font-size: 1rem;
        }

        .settings-dropdown-content {
          position: absolute;
          top: 100%;
          right: 0;
          z-index: 1000;
          min-width: 320px;
          max-width: 400px;
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          padding: 1.5rem;
          margin-top: 0.5rem;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .settings-header {
          margin-bottom: 1.5rem;
        }

        .settings-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--gray-800);
          margin: 0 0 0.25rem 0;
        }

        .settings-subtitle {
          font-size: 0.875rem;
          color: var(--gray-500);
          margin: 0;
        }

        .settings-section {
          margin-bottom: 1rem;
        }

        .settings-separator {
          height: 1px;
          background: var(--gray-200);
          margin: 1rem 0;
        }

        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .setting-item:last-child {
          margin-bottom: 0;
        }

        .setting-info {
          flex: 1;
        }

        .setting-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--gray-700);
          margin-bottom: 0.25rem;
          cursor: pointer;
        }

        .setting-description {
          font-size: 0.75rem;
          color: var(--gray-500);
          margin: 0.25rem 0 0 0;
          line-height: 1.4;
        }

        .settings-select,
        .settings-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--gray-300);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          background: white;
          transition: var(--transition-normal);
        }

        .settings-select:focus,
        .settings-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-light);
        }

        .settings-input {
          margin-top: 0.5rem;
        }

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
          cursor: pointer;
        }

        .toggle-input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--gray-300);
          border-radius: 24px;
          transition: var(--transition-normal);
        }

        .toggle-slider.checked {
          background: var(--primary);
        }

        .toggle-thumb {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 2px;
          bottom: 2px;
          background: white;
          border-radius: 50%;
          transition: var(--transition-normal);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .toggle-slider.checked .toggle-thumb {
          transform: translateX(20px);
        }

        .settings-footer {
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--gray-200);
          font-size: 0.75rem;
          color: var(--gray-500);
          text-align: center;
        }

        /* Dark mode styles */
        .dark-mode .settings-dropdown-content {
          background: var(--gray-800);
          border-color: var(--gray-700);
          color: var(--gray-100);
        }

        .dark-mode .settings-title {
          color: var(--gray-100);
        }

        .dark-mode .settings-subtitle,
        .dark-mode .setting-description,
        .dark-mode .settings-footer {
          color: var(--gray-400);
        }

        .dark-mode .setting-label {
          color: var(--gray-200);
        }

        .dark-mode .settings-separator {
          background: var(--gray-700);
        }

        .dark-mode .settings-select,
        .dark-mode .settings-input {
          background: var(--gray-700);
          border-color: var(--gray-600);
          color: var(--gray-100);
        }

        .dark-mode .settings-select:focus,
        .dark-mode .settings-input:focus {
          border-color: var(--primary);
        }

        @media (max-width: 768px) {
          .settings-dropdown-content {
            position: fixed;
            top: 50%;
            left: 50%;
            right: auto;
            transform: translate(-50%, -50%);
            min-width: 280px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
          }
        }
      `}</style>
    </div>
  );
};