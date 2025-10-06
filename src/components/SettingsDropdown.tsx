// src/components/SettingsDropdown.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useSettings, isSupabaseConfigured } from '../hooks/useSettings';
import { ReminderSettings } from './ReminderSettings';
import type { ReminderSettings as ReminderSettingsType } from '../types';
import { DEFAULT_REMINDER_SETTINGS } from '../services/reminderScheduler';
import type { AppState } from '../types';
import {
  exportDataAsJSON,
  exportCompletionsAsCSV,
  exportArrangementsAsCSV,
  getStorageInfo,
  clearLocalCaches
} from '../utils/dataExport';
// @ts-ignore
import packageJson from '../../package.json';

interface SettingsDropdownProps {
  trigger?: React.ReactNode;
  reminderSettings?: ReminderSettingsType;
  onUpdateReminderSettings?: (settings: ReminderSettingsType) => void;
  onChangePassword?: () => void;
  onChangeEmail?: () => void;
  onDeleteAccount?: () => void;
  appState?: AppState; // For data export
  userEmail?: string; // For data export
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  trigger,
  reminderSettings,
  onUpdateReminderSettings,
  onChangePassword,
  onChangeEmail,
  onDeleteAccount,
  appState,
  userEmail
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSMSSettings, setShowSMSSettings] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usedMB: string; quotaMB: string; percentage: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    settings,
    toggleBackup,
    toggleDarkMode,
    togglePushNotifications,
    toggleAutoSync,
    toggleConfirmBeforeDelete,
    updateKeepDataForMonths,
  } = useSettings();

  // Load storage info when dropdown opens
  useEffect(() => {
    if (isOpen && !storageInfo) {
      getStorageInfo().then(setStorageInfo);
    }
  }, [isOpen, storageInfo]);


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

          <div className="settings-separator" />

          {/* Safety & Data Management */}
          <div className="settings-section">
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="confirm-delete" className="setting-label">
                  Ask before deleting
                </label>
                <p className="setting-description">
                  Confirm before deleting completions, addresses, or arrangements
                </p>
              </div>
              <ToggleSwitch
                id="confirm-delete"
                checked={settings.confirmBeforeDelete}
                onChange={toggleConfirmBeforeDelete}
              />
            </div>

            <div className="setting-item-column">
              <label htmlFor="data-retention" className="setting-label">
                Keep data for
              </label>
              <select
                id="data-retention"
                className="settings-select"
                value={settings.keepDataForMonths}
                onChange={(e) => updateKeepDataForMonths(Number(e.target.value) as 0 | 3 | 6 | 12)}
              >
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>1 year</option>
                <option value={0}>Forever</option>
              </select>
              <p className="setting-description">
                Automatically removes old completions and arrangements once per day
              </p>
            </div>
          </div>

          {/* Account Management */}
          {(onChangePassword || onChangeEmail || onDeleteAccount) && (
            <>
              <div className="settings-separator" />
              <div className="settings-section">
                <h4 className="settings-section-title">Account Management</h4>

                {onChangePassword && (
                  <button
                    className="settings-action-button"
                    onClick={() => {
                      onChangePassword();
                      setIsOpen(false);
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
                  >
                    <span>📧</span>
                    <span>Change Email</span>
                  </button>
                )}

                {onDeleteAccount && (
                  <button
                    className="settings-action-button danger"
                    onClick={() => {
                      onDeleteAccount();
                      setIsOpen(false);
                    }}
                  >
                    <span>🗑️</span>
                    <span>Delete Account</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Privacy & Data (GDPR Compliance) */}
          <div className="settings-separator" />
          <div className="settings-section">
            <h4 className="settings-section-title">Privacy & Data (GDPR)</h4>

            {/* Storage Usage */}
            {storageInfo && (
              <div className="storage-card">
                <div className="storage-label">Storage Usage</div>
                <div className="storage-value">
                  {storageInfo.usedMB} MB / {storageInfo.quotaMB} MB ({storageInfo.percentage}%)
                </div>
                <div className="storage-bar">
                  <div
                    className={`storage-bar-fill ${storageInfo.percentage > 80 ? 'warning' : ''}`}
                    style={{ width: `${storageInfo.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Data Export (GDPR Article 20) */}
            {appState && (
              <>
                <button
                  onClick={() => {
                    exportDataAsJSON(appState, userEmail);
                    setIsOpen(false);
                  }}
                  className="settings-action-button primary"
                >
                  <span>📥</span>
                  <span>Export All Data (JSON)</span>
                </button>

                <div className="button-group">
                  <button
                    onClick={() => {
                      exportCompletionsAsCSV(appState);
                      setIsOpen(false);
                    }}
                    className="settings-action-button small"
                  >
                    Export Completions (CSV)
                  </button>
                  <button
                    onClick={() => {
                      exportArrangementsAsCSV(appState);
                      setIsOpen(false);
                    }}
                    className="settings-action-button small"
                  >
                    Export Arrangements (CSV)
                  </button>
                </div>
              </>
            )}

            {/* Clear Cache */}
            <button
              onClick={async () => {
                await clearLocalCaches();
                setStorageInfo(null);
                setTimeout(() => getStorageInfo().then(setStorageInfo), 500);
              }}
              className="settings-action-button"
            >
              <span>🗑️</span>
              <span>Clear Cache & Temporary Data</span>
            </button>

            {/* Privacy Links */}
            <div className="button-group">
              <a
                href="/PRIVACY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-link-button"
              >
                <span>🔒</span>
                <span>Privacy Policy</span>
              </a>

              <a
                href="/TERMS_OF_USE.md"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-link-button"
              >
                <span>📄</span>
                <span>Terms</span>
              </a>
            </div>
          </div>

          {/* Footer note */}
          <div className="settings-footer">
            <div className="footer-text">
              Settings are saved locally and synced to cloud if configured.
            </div>
            <a href="/PRIVACY.md" target="_blank" rel="noopener noreferrer" className="footer-link">
              Your privacy rights
            </a>
            <div className="footer-version">
              Version {packageJson.version}
            </div>
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
        /* Base Dropdown */
        .settings-dropdown {
          position: relative;
          display: inline-block;
        }

        .settings-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.125rem;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          color: #374151;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .settings-trigger:hover {
          background: white;
          border-color: rgba(99, 102, 241, 0.3);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }

        .settings-icon {
          font-size: 1.125rem;
        }

        /* Dropdown Content - Modern Glassmorphism */
        .settings-dropdown-content {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 10000;
          min-width: 340px;
          max-width: 420px;
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.06);
          padding: 1.5rem;
          animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Header */
        .settings-header {
          margin-bottom: 1.5rem;
        }

        .settings-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.375rem 0;
          letter-spacing: -0.02em;
        }

        .settings-subtitle {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        /* Sections */
        .settings-section {
          margin-bottom: 1rem;
        }

        .settings-section-title {
          font-size: 0.8125rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #9ca3af;
          margin: 0 0 0.875rem 0;
        }

        .settings-separator {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent);
          margin: 1.25rem 0;
        }

        /* Setting Items */
        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.25rem;
          padding: 0.625rem 0;
          margin-bottom: 0.75rem;
        }

        .setting-item:last-child {
          margin-bottom: 0;
        }

        .setting-item-column {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          margin-bottom: 0.75rem;
        }

        .setting-info {
          flex: 1;
        }

        .setting-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.25rem;
          cursor: pointer;
        }

        .setting-description {
          font-size: 0.75rem;
          color: #9ca3af;
          margin: 0.25rem 0 0 0;
          line-height: 1.5;
        }

        /* Form Elements */
        .settings-select {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 1.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          font-size: 0.875rem;
          background: white;
          color: #374151;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .settings-select:hover {
          border-color: rgba(99, 102, 241, 0.3);
        }

        .settings-select:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        /* Toggle Switch - Modern Design */
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .toggle-input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          inset: 0;
          background: #d1d5db;
          border-radius: 26px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .toggle-slider.checked {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
        }

        .toggle-thumb {
          position: absolute;
          height: 22px;
          width: 22px;
          left: 2px;
          bottom: 2px;
          background: white;
          border-radius: 50%;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .toggle-slider.checked .toggle-thumb {
          transform: translateX(22px);
          box-shadow: 0 3px 8px rgba(99, 102, 241, 0.3);
        }

        /* Storage Card */
        .storage-card {
          padding: 1rem;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 12px;
          margin-bottom: 0.875rem;
        }

        .storage-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6366f1;
          margin-bottom: 0.5rem;
        }

        .storage-value {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.625rem;
        }

        .storage-bar {
          height: 8px;
          background: rgba(0, 0, 0, 0.06);
          border-radius: 8px;
          overflow: hidden;
        }

        .storage-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
          border-radius: 8px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .storage-bar-fill.warning {
          background: linear-gradient(90deg, #ef4444, #dc2626);
        }

        /* Action Buttons */
        .settings-action-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: white;
          border: 1.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          margin-bottom: 0.625rem;
        }

        .settings-action-button:hover {
          background: #f9fafb;
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .settings-action-button:active {
          transform: translateY(0);
        }

        .settings-action-button.primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-color: transparent;
          color: white;
          font-weight: 600;
        }

        .settings-action-button.primary:hover {
          box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
        }

        .settings-action-button.danger {
          background: rgba(239, 68, 68, 0.05);
          border-color: rgba(239, 68, 68, 0.2);
          color: #dc2626;
        }

        .settings-action-button.danger:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.4);
        }

        .settings-action-button.small {
          padding: 0.75rem 0.875rem;
          font-size: 0.8125rem;
        }

        /* Button Groups */
        .button-group {
          display: flex;
          gap: 0.625rem;
          margin-bottom: 0.625rem;
        }

        .button-group .settings-action-button,
        .button-group .settings-link-button {
          flex: 1;
        }

        /* Link Buttons */
        .settings-link-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 0.875rem;
          background: white;
          border: 1.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .settings-link-button:hover {
          background: #f9fafb;
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        /* SMS Settings Button */
        .sms-settings-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 1rem;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
          border: 1.5px solid rgba(99, 102, 241, 0.15);
          border-radius: 12px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sms-settings-button:hover {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
        }

        .sms-settings-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .sms-settings-info {
          flex: 1;
        }

        .sms-settings-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .sms-settings-desc {
          font-size: 0.75rem;
          color: #6b7280;
          line-height: 1.4;
        }

        .sms-settings-arrow {
          font-size: 1rem;
          color: #9ca3af;
          flex-shrink: 0;
          transition: transform 0.2s;
        }

        .sms-settings-button:hover .sms-settings-arrow {
          transform: translateX(3px);
        }

        /* Footer */
        .settings-footer {
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          text-align: center;
        }

        .footer-text {
          font-size: 0.75rem;
          color: #9ca3af;
          line-height: 1.5;
          margin-bottom: 0.5rem;
        }

        .footer-link {
          display: inline-block;
          font-size: 0.75rem;
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
          margin-bottom: 0.75rem;
          transition: color 0.2s;
        }

        .footer-link:hover {
          color: #8b5cf6;
          text-decoration: underline;
        }

        .footer-version {
          font-size: 0.6875rem;
          color: #d1d5db;
          font-weight: 500;
          margin-top: 0.75rem;
        }

        /* Dark Mode */
        .dark-mode .settings-trigger {
          background: rgba(31, 41, 55, 0.95);
          border-color: rgba(255, 255, 255, 0.1);
          color: #e5e7eb;
        }

        .dark-mode .settings-trigger:hover {
          background: rgba(31, 41, 55, 1);
          border-color: rgba(139, 92, 246, 0.3);
        }

        .dark-mode .settings-dropdown-content {
          background: rgba(31, 41, 55, 0.98);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .dark-mode .settings-title {
          color: #f9fafb;
        }

        .dark-mode .settings-subtitle,
        .dark-mode .setting-description,
        .dark-mode .footer-text {
          color: #9ca3af;
        }

        .dark-mode .setting-label,
        .dark-mode .sms-settings-title,
        .dark-mode .storage-value {
          color: #e5e7eb;
        }

        .dark-mode .settings-section-title,
        .dark-mode .footer-version {
          color: #6b7280;
        }

        .dark-mode .settings-separator {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
        }

        .dark-mode .settings-select {
          background: rgba(17, 24, 39, 0.6);
          border-color: rgba(255, 255, 255, 0.15);
          color: #e5e7eb;
        }

        .dark-mode .settings-select:hover {
          border-color: rgba(139, 92, 246, 0.4);
        }

        .dark-mode .storage-card {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
          border-color: rgba(99, 102, 241, 0.25);
        }

        .dark-mode .storage-bar {
          background: rgba(0, 0, 0, 0.3);
        }

        .dark-mode .settings-action-button,
        .dark-mode .settings-link-button {
          background: rgba(17, 24, 39, 0.6);
          border-color: rgba(255, 255, 255, 0.15);
          color: #e5e7eb;
        }

        .dark-mode .settings-action-button:hover,
        .dark-mode .settings-link-button:hover {
          background: rgba(17, 24, 39, 0.8);
          border-color: rgba(139, 92, 246, 0.4);
        }

        .dark-mode .settings-action-button.primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-color: transparent;
          color: white;
        }

        .dark-mode .settings-action-button.danger {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
          color: #f87171;
        }

        .dark-mode .sms-settings-button {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
          border-color: rgba(99, 102, 241, 0.25);
        }

        .dark-mode .sms-settings-button:hover {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
          border-color: rgba(99, 102, 241, 0.4);
        }

        .dark-mode .sms-settings-desc {
          color: #9ca3af;
        }

        .dark-mode .sms-settings-arrow {
          color: #6b7280;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .settings-dropdown-content {
            position: fixed;
            top: 50%;
            left: 50%;
            right: auto;
            transform: translate(-50%, -50%);
            min-width: 300px;
            max-width: 92vw;
            max-height: 88vh;
            overflow-y: auto;
          }

          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
        }
      `}</style>
    </div>
  );
};