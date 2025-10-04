// src/components/SettingsDropdown.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useSettings, isSupabaseConfigured } from '../hooks/useSettings';
import { ReminderSettings } from './ReminderSettings';
import type { ReminderSettings as ReminderSettingsType } from '../types';
import { DEFAULT_REMINDER_SETTINGS } from '../services/reminderScheduler';

interface SettingsDropdownProps {
  trigger?: React.ReactNode;
  reminderSettings?: ReminderSettingsType;
  onUpdateReminderSettings?: (settings: ReminderSettingsType) => void;
  onChangePassword?: () => void;
  onChangeEmail?: () => void;
  onDeleteAccount?: () => void;
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  trigger,
  reminderSettings,
  onUpdateReminderSettings,
  onChangePassword,
  onChangeEmail,
  onDeleteAccount
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSMSSettings, setShowSMSSettings] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    settings,
    toggleBackup,
    toggleDarkMode,
    togglePushNotifications,
    toggleAutoSync,
  } = useSettings();


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

          {/* Backup Option - Always Available */}
          <div className="settings-section">
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="backup-toggle" className="setting-label">
                  Auto-download backup on end of day
                </label>
                <p className="setting-description">
                  {isSupabaseConfigured()
                    ? "Automatically download backup file when finishing the day."
                    : "Automatically download backup file when finishing the day (local backup only)."
                  }
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

          {/* Reminder & SMS Settings */}
          <div className="settings-section">
            <button
              className="sms-settings-button"
              onClick={() => {
                setShowSMSSettings(true);
                setIsOpen(false);
              }}
            >
              <span className="sms-settings-icon">🔔</span>
              <div className="sms-settings-info">
                <div className="sms-settings-title">Reminder & SMS Settings</div>
                <div className="sms-settings-desc">Message templates, scheduling, agent profile, and reminder preferences</div>
              </div>
              <span className="sms-settings-arrow">→</span>
            </button>
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

          {/* Account Management */}
          {(onChangePassword || onChangeEmail || onDeleteAccount) && (
            <>
              <div className="settings-separator" />
              <div className="settings-section">
                <h4 className="settings-section-title" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Account Management</h4>

                {onChangePassword && (
                  <button
                    className="settings-action-button"
                    onClick={() => {
                      onChangePassword();
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <span>🔑</span>
                    <span>Change Password</span>
                  </button>
                )}

                {onChangeEmail && (
                  <button
                    className="settings-action-button"
                    onClick={() => {
                      onChangeEmail();
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <span>📧</span>
                    <span>Change Email</span>
                  </button>
                )}

                {onDeleteAccount && (
                  <button
                    className="settings-action-button"
                    onClick={() => {
                      onDeleteAccount();
                      setIsOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'var(--danger-light)',
                      border: '1px solid var(--danger)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      color: 'var(--danger)'
                    }}
                  >
                    <span>🗑️</span>
                    <span>Delete Account</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Footer note */}
          <div className="settings-footer">
            Settings are saved locally and synced to cloud if configured.
          </div>
        </div>
      )}

      {/* SMS Template Settings Modal */}
      {showSMSSettings && (
        <ReminderSettings
          settings={reminderSettings || DEFAULT_REMINDER_SETTINGS}
          onUpdateSettings={(settings) => {
            if (onUpdateReminderSettings) {
              onUpdateReminderSettings(settings);
            }
            setShowSMSSettings(false);
          }}
          onClose={() => setShowSMSSettings(false)}
        />
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

        /* SMS Settings Button Styles */
        .sms-settings-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--gray-50);
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-md);
          color: var(--gray-700);
          text-align: left;
          cursor: pointer;
          transition: var(--transition-normal);
        }

        .sms-settings-button:hover {
          background: var(--gray-100);
          border-color: var(--primary);
          color: var(--gray-800);
        }

        .sms-settings-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .sms-settings-info {
          flex: 1;
        }

        .sms-settings-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--gray-800);
          margin-bottom: 0.125rem;
        }

        .sms-settings-desc {
          font-size: 0.75rem;
          color: var(--gray-500);
          line-height: 1.3;
        }

        .sms-settings-arrow {
          font-size: 0.875rem;
          color: var(--gray-400);
          flex-shrink: 0;
        }

        .dark-mode .sms-settings-button {
          background: var(--gray-700);
          border-color: var(--gray-600);
          color: var(--gray-200);
        }

        .dark-mode .sms-settings-button:hover {
          background: var(--gray-600);
          border-color: var(--primary);
          color: var(--gray-100);
        }

        .dark-mode .sms-settings-title {
          color: var(--gray-100);
        }

        .dark-mode .sms-settings-desc {
          color: var(--gray-400);
        }

        .dark-mode .sms-settings-arrow {
          color: var(--gray-500);
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