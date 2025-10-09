// src/components/SettingsDropdown.tsx - Modern Redesign
import React, { useState, useRef, useEffect } from 'react';
import { useSettings, isSupabaseConfigured } from '../hooks/useSettings';
import { ReminderSettings } from './ReminderSettings';
import { BonusSettingsModal } from './BonusSettingsModal';
import type { ReminderSettings as ReminderSettingsType, BonusSettings } from '../types';
import { DEFAULT_REMINDER_SETTINGS } from '../services/reminderScheduler';
import type { AppState } from '../types';
import {
  exportDataAsJSON,
  getStorageInfo,
  clearLocalCaches
} from '../utils/dataExport';
// @ts-ignore
import packageJson from '../../package.json';

interface SettingsDropdownProps {
  trigger?: React.ReactNode;
  reminderSettings?: ReminderSettingsType;
  onUpdateReminderSettings?: (settings: ReminderSettingsType) => void;
  bonusSettings?: BonusSettings;
  onUpdateBonusSettings?: (settings: BonusSettings) => void;
  onChangePassword?: () => void;
  onChangeEmail?: () => void;
  onDeleteAccount?: () => void;
  appState?: AppState;
  userEmail?: string;

  // New props for consolidated functionality
  onImportExcel?: (file: File) => void;
  onRestoreBackup?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onManualSync?: () => void;
  isSyncing?: boolean;
  onShowBackupManager?: () => void;
  onShowCloudBackups?: () => void;
  onShowSubscription?: () => void;
  onShowSupabaseSetup?: () => void;
  onSignOut?: () => void;
  hasSupabase?: boolean;
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  trigger,
  reminderSettings,
  onUpdateReminderSettings,
  bonusSettings,
  onUpdateBonusSettings,
  onChangePassword,
  onChangeEmail,
  onDeleteAccount,
  appState,
  userEmail,
  onImportExcel,
  onRestoreBackup,
  onManualSync,
  isSyncing,
  onShowBackupManager,
  onShowCloudBackups,
  onShowSubscription,
  onShowSupabaseSetup,
  onSignOut,
  hasSupabase
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSMSSettings, setShowSMSSettings] = useState(false);
  const [showBonusSettings, setShowBonusSettings] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usedMB: string; quotaMB: string; percentage: number } | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('general');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

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
        setExpandedSection(null);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: () => void;
    id: string;
  }> = ({ checked, onChange, id }) => (
    <div className="modern-toggle-switch" onClick={onChange}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="modern-toggle-input"
      />
      <div className={`modern-toggle-slider ${checked ? 'checked' : ''}`}>
        <div className="modern-toggle-thumb"></div>
      </div>
    </div>
  );

  const CollapsibleSection: React.FC<{
    title: string;
    icon: string;
    sectionKey: string;
    children: React.ReactNode;
  }> = ({ title, icon, sectionKey, children }) => {
    const isExpanded = expandedSection === sectionKey;

    return (
      <div className="modern-settings-section-container">
        <button
          className="modern-section-header"
          onClick={() => toggleSection(sectionKey)}
        >
          <div className="modern-section-title-area">
            <span className="modern-section-icon">{icon}</span>
            <span className="modern-section-title">{title}</span>
          </div>
          <span className={`modern-section-chevron ${isExpanded ? 'expanded' : ''}`}>
            ›
          </span>
        </button>

        <div className={`modern-section-content ${isExpanded ? 'expanded' : ''}`}>
          <div className="modern-section-inner">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportExcel) {
      onImportExcel(file);
      setIsOpen(false);
    }
  };

  return (
    <div className="modern-settings-dropdown" ref={dropdownRef}>
      <button
        className="modern-settings-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {trigger || (
          <>
            <span className="modern-trigger-icon">⚙️</span>
            <span className="modern-trigger-text">Settings</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="modern-settings-panel">
          <div className="modern-panel-header">
            <div className="modern-header-content">
              <h2 className="modern-panel-title">Settings</h2>
              <p className="modern-panel-subtitle">Manage your app preferences</p>
            </div>
            <button
              className="modern-close-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <div className="modern-panel-body">
            {/* General Settings */}
            <CollapsibleSection title="General" icon="📱" sectionKey="general">
              <div className="modern-setting-row">
                <div className="modern-setting-info">
                  <div className="modern-setting-label">Dark Mode</div>
                  <div className="modern-setting-desc">Switch between light and dark theme</div>
                </div>
                <ToggleSwitch
                  id="dark-mode"
                  checked={settings.darkMode}
                  onChange={toggleDarkMode}
                />
              </div>

              <div className="modern-setting-row">
                <div className="modern-setting-info">
                  <div className="modern-setting-label">Push Notifications</div>
                  <div className="modern-setting-desc">Receive arrangement reminders</div>
                </div>
                <ToggleSwitch
                  id="push-notifs"
                  checked={settings.pushNotifications}
                  onChange={togglePushNotifications}
                />
              </div>

              <div className="modern-setting-row">
                <div className="modern-setting-info">
                  <div className="modern-setting-label">Auto-sync on startup</div>
                  <div className="modern-setting-desc">Automatically sync when app opens</div>
                </div>
                <ToggleSwitch
                  id="auto-sync"
                  checked={settings.autoSyncOnStart}
                  onChange={toggleAutoSync}
                />
              </div>
            </CollapsibleSection>

            {/* Data & Backup */}
            <CollapsibleSection title="Data & Backup" icon="💾" sectionKey="data">
              {/* Import/Export */}
              <div className="modern-subsection">
                <div className="modern-subsection-title">Import & Export</div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />

                <button
                  className="modern-action-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="modern-button-icon">📊</span>
                  <span className="modern-button-text">Import Excel/CSV</span>
                </button>

                {appState && (
                  <button
                    onClick={() => {
                      exportDataAsJSON(appState, userEmail);
                      setIsOpen(false);
                    }}
                    className="modern-action-button primary"
                  >
                    <span className="modern-button-icon">💾</span>
                    <span className="modern-button-text">Backup All Data</span>
                  </button>
                )}
              </div>

              {/* Backup Management */}
              <div className="modern-subsection">
                <div className="modern-subsection-title">Backup Management</div>

                <input
                  type="file"
                  ref={restoreInputRef}
                  accept="application/json"
                  onChange={(e) => {
                    if (onRestoreBackup) {
                      onRestoreBackup(e);
                      setIsOpen(false);
                    }
                  }}
                  style={{ display: 'none' }}
                />

                <button
                  className="modern-action-button"
                  onClick={() => restoreInputRef.current?.click()}
                >
                  <span className="modern-button-icon">📂</span>
                  <span className="modern-button-text">Restore from Backup</span>
                </button>

                {onShowBackupManager && (
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onShowBackupManager();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">💾</span>
                    <span className="modern-button-text">Local Backup Manager</span>
                  </button>
                )}

                {hasSupabase && onShowCloudBackups && (
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onShowCloudBackups();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">☁️</span>
                    <span className="modern-button-text">Cloud Backups (Last 7 Days)</span>
                  </button>
                )}

                {!hasSupabase && onShowSupabaseSetup && (
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onShowSupabaseSetup();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">🔗</span>
                    <span className="modern-button-text">Connect Cloud Storage</span>
                  </button>
                )}

                <div className="modern-setting-row">
                  <div className="modern-setting-info">
                    <div className="modern-setting-label">Auto-backup on end of day</div>
                    <div className="modern-setting-desc">
                      {isSupabaseConfigured()
                        ? "Automatic backup when finishing your day"
                        : "Local backup only (cloud not configured)"}
                    </div>
                  </div>
                  <ToggleSwitch
                    id="backup-toggle"
                    checked={settings.backupOnEndOfDay}
                    onChange={toggleBackup}
                  />
                </div>
              </div>

              {/* Sync */}
              {onManualSync && (
                <div className="modern-subsection">
                  <div className="modern-subsection-title">Cloud Sync</div>
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onManualSync();
                      setIsOpen(false);
                    }}
                    disabled={isSyncing}
                  >
                    <span className="modern-button-icon">
                      {isSyncing ? "⟳" : "🔄"}
                    </span>
                    <span className="modern-button-text">
                      {isSyncing ? "Syncing..." : "Sync Now"}
                    </span>
                  </button>
                </div>
              )}
            </CollapsibleSection>

            {/* Reminders & SMS */}
            <CollapsibleSection title="Reminders & SMS" icon="🔔" sectionKey="reminders">
              <button
                className="modern-feature-button"
                onClick={() => {
                  setShowSMSSettings(true);
                  setIsOpen(false);
                }}
              >
                <div className="modern-feature-content">
                  <div className="modern-feature-title">Reminder Settings</div>
                  <div className="modern-feature-desc">
                    Configure message templates, scheduling, and reminder preferences
                  </div>
                </div>
                <span className="modern-feature-arrow">→</span>
              </button>
            </CollapsibleSection>

            {/* Earnings & Bonus */}
            <CollapsibleSection title="Earnings & Bonus" icon="💰" sectionKey="earnings">
              <button
                className="modern-feature-button"
                onClick={() => {
                  setShowBonusSettings(true);
                  setIsOpen(false);
                }}
              >
                <div className="modern-feature-content">
                  <div className="modern-feature-title">Bonus Calculation Settings</div>
                  <div className="modern-feature-desc">
                    Configure your bonus calculation formula, thresholds, and case counting
                  </div>
                </div>
                <span className="modern-feature-arrow">→</span>
              </button>
            </CollapsibleSection>

            {/* Privacy & Safety */}
            <CollapsibleSection title="Privacy & Safety" icon="🔒" sectionKey="privacy">
              <div className="modern-setting-row">
                <div className="modern-setting-info">
                  <div className="modern-setting-label">Confirm before deleting</div>
                  <div className="modern-setting-desc">Ask for confirmation on deletions</div>
                </div>
                <ToggleSwitch
                  id="confirm-delete"
                  checked={settings.confirmBeforeDelete}
                  onChange={toggleConfirmBeforeDelete}
                />
              </div>

              <div className="modern-setting-column">
                <label htmlFor="data-retention" className="modern-setting-label">
                  Data Retention Period
                </label>
                <select
                  id="data-retention"
                  className="modern-select"
                  value={settings.keepDataForMonths}
                  onChange={(e) => updateKeepDataForMonths(Number(e.target.value) as 0 | 3 | 6 | 12)}
                >
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>1 year</option>
                  <option value={0}>Forever</option>
                </select>
                <p className="modern-setting-desc">
                  Automatically removes old data once per day
                </p>
              </div>

              {/* Storage Usage */}
              {storageInfo && (
                <div className="modern-storage-card">
                  <div className="modern-storage-header">
                    <span className="modern-storage-label">Storage Usage</span>
                    <span className="modern-storage-value">
                      {storageInfo.usedMB} / {storageInfo.quotaMB} MB
                    </span>
                  </div>
                  <div className="modern-storage-bar">
                    <div
                      className={`modern-storage-fill ${storageInfo.percentage > 80 ? 'warning' : ''}`}
                      style={{ width: `${storageInfo.percentage}%` }}
                    />
                  </div>
                  <div className="modern-storage-percent">{storageInfo.percentage}% used</div>
                </div>
              )}

              <button
                onClick={async () => {
                  await clearLocalCaches();
                  setStorageInfo(null);
                  setTimeout(() => getStorageInfo().then(setStorageInfo), 500);
                }}
                className="modern-action-button"
              >
                <span className="modern-button-icon">🗑️</span>
                <span className="modern-button-text">Clear Cache & Temporary Data</span>
              </button>

              <div className="modern-link-group">
                <a
                  href="/PRIVACY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modern-link-button"
                >
                  <span className="modern-button-icon">🔒</span>
                  <span className="modern-button-text">Privacy Policy</span>
                </a>
                <a
                  href="/TERMS_OF_USE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modern-link-button"
                >
                  <span className="modern-button-icon">📄</span>
                  <span className="modern-button-text">Terms of Use</span>
                </a>
              </div>
            </CollapsibleSection>

            {/* Account */}
            <CollapsibleSection title="Account" icon="👤" sectionKey="account">
              <div className="modern-subsection">
                <div className="modern-subsection-title">Account Settings</div>

                {onShowSubscription && (
                  <button
                    className="modern-action-button accent"
                    onClick={() => {
                      onShowSubscription();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">⭐</span>
                    <span className="modern-button-text">Subscription</span>
                  </button>
                )}

                {onChangePassword && (
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onChangePassword();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">🔑</span>
                    <span className="modern-button-text">Change Password</span>
                  </button>
                )}

                {onChangeEmail && (
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onChangeEmail();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">📧</span>
                    <span className="modern-button-text">Change Email</span>
                  </button>
                )}

                {onSignOut && (
                  <button
                    className="modern-action-button"
                    onClick={() => {
                      onSignOut();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">🚪</span>
                    <span className="modern-button-text">Sign Out</span>
                  </button>
                )}
              </div>

              {/* Danger Zone */}
              {onDeleteAccount && (
                <div className="modern-subsection modern-danger-zone">
                  <div className="modern-danger-zone-header">
                    <span className="modern-danger-icon">⚠️</span>
                    <div>
                      <div className="modern-subsection-title danger">Danger Zone</div>
                      <div className="modern-danger-desc">Irreversible actions</div>
                    </div>
                  </div>
                  <button
                    className="modern-action-button danger-full"
                    onClick={() => {
                      onDeleteAccount();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">🗑️</span>
                    <span className="modern-button-text">Delete Account Permanently</span>
                  </button>
                </div>
              )}
            </CollapsibleSection>
          </div>

          {/* Footer */}
          <div className="modern-panel-footer">
            <div className="modern-footer-text">
              Settings sync across devices • Version {packageJson.version}
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

      {/* Bonus Settings Modal */}
      {showBonusSettings && bonusSettings && onUpdateBonusSettings && (
        <BonusSettingsModal
          settings={bonusSettings}
          onUpdateSettings={(settings) => {
            onUpdateBonusSettings(settings);
            setShowBonusSettings(false);
          }}
          onClose={() => setShowBonusSettings(false)}
        />
      )}

      <style>{`
        /* Modern Settings Dropdown - Complete Redesign */
        .modern-settings-dropdown {
          position: relative;
          display: inline-block;
        }

        /* Trigger Button */
        .modern-settings-trigger {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
          border: 1.5px solid rgba(99, 102, 241, 0.12);
          border-radius: 12px;
          color: #1f2937;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .modern-settings-trigger:hover {
          background: linear-gradient(135deg, #ffffff 0%, #f0f1ff 100%);
          border-color: rgba(99, 102, 241, 0.3);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);
          transform: translateY(-1px);
        }

        .modern-trigger-icon {
          font-size: 1.25rem;
        }

        /* Main Panel */
        .modern-settings-panel {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          z-index: 999999;
          width: 440px;
          max-height: 85vh;
          background: linear-gradient(135deg, #ffffff 0%, #fafbff 100%);
          border: 1px solid rgba(99, 102, 241, 0.08);
          border-radius: 20px;
          box-shadow:
            0 24px 64px rgba(0, 0, 0, 0.12),
            0 12px 32px rgba(99, 102, 241, 0.08),
            0 0 0 1px rgba(99, 102, 241, 0.05);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: modernSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(8px);
        }

        @keyframes modernSlideIn {
          from {
            opacity: 0;
            transform: translateY(-16px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Panel Header */
        .modern-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 1.75rem 1.75rem 1.25rem;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
          border-bottom: 1px solid rgba(99, 102, 241, 0.08);
        }

        .modern-header-content {
          flex: 1;
        }

        .modern-panel-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.375rem 0;
          letter-spacing: -0.03em;
        }

        .modern-panel-subtitle {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .modern-close-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 8px;
          color: #6b7280;
          font-size: 1.125rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modern-close-button:hover {
          background: #f9fafb;
          border-color: #ef4444;
          color: #ef4444;
          transform: scale(1.05);
        }

        /* Panel Body */
        .modern-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 0.75rem 1rem;
        }

        .modern-panel-body::-webkit-scrollbar {
          width: 6px;
        }

        .modern-panel-body::-webkit-scrollbar-track {
          background: transparent;
        }

        .modern-panel-body::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.2);
          border-radius: 3px;
        }

        .modern-panel-body::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.3);
        }

        /* Collapsible Sections */
        .modern-settings-section-container {
          margin: 0.5rem 0.5rem;
          background: white;
          border: 1.5px solid rgba(99, 102, 241, 0.08);
          border-radius: 14px;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-settings-section-container:hover {
          border-color: rgba(99, 102, 241, 0.15);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.06);
        }

        .modern-section-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modern-section-header:hover {
          background: rgba(99, 102, 241, 0.03);
        }

        .modern-section-title-area {
          display: flex;
          align-items: center;
          gap: 0.875rem;
        }

        .modern-section-icon {
          font-size: 1.375rem;
        }

        .modern-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.01em;
        }

        .modern-section-chevron {
          font-size: 1.5rem;
          color: #9ca3af;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-section-chevron.expanded {
          transform: rotate(90deg);
          color: #6366f1;
        }

        .modern-section-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-section-content.expanded {
          max-height: 2000px;
        }

        .modern-section-inner {
          padding: 0 1.25rem 1.25rem;
        }

        /* Subsections */
        .modern-subsection {
          margin-bottom: 1.5rem;
        }

        .modern-subsection:last-child {
          margin-bottom: 0;
        }

        .modern-subsection-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.075em;
          color: #6366f1;
          margin-bottom: 0.75rem;
        }

        .modern-subsection-title.danger {
          color: #dc2626;
        }

        /* Danger Zone Styles */
        .modern-danger-zone {
          margin-top: 1.5rem;
          padding: 1.25rem;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.08) 100%);
          border: 2px solid rgba(239, 68, 68, 0.25);
          border-radius: 12px;
        }

        .modern-danger-zone-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .modern-danger-icon {
          font-size: 1.75rem;
          flex-shrink: 0;
        }

        .modern-danger-desc {
          font-size: 0.8125rem;
          color: #dc2626;
          margin-top: 0.25rem;
          font-weight: 500;
        }

        /* Setting Rows */
        .modern-setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.875rem 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        }

        .modern-setting-row:last-child {
          border-bottom: none;
        }

        .modern-setting-column {
          padding: 0.875rem 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        }

        .modern-setting-column:last-child {
          border-bottom: none;
        }

        .modern-setting-info {
          flex: 1;
        }

        .modern-setting-label {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.25rem;
          display: block;
        }

        .modern-setting-desc {
          font-size: 0.8125rem;
          color: #9ca3af;
          line-height: 1.4;
          margin-top: 0.25rem;
        }

        /* Toggle Switch */
        .modern-toggle-switch {
          position: relative;
          width: 52px;
          height: 28px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .modern-toggle-input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .modern-toggle-slider {
          position: absolute;
          inset: 0;
          background: #e5e7eb;
          border-radius: 28px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-toggle-slider.checked {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        }

        .modern-toggle-thumb {
          position: absolute;
          height: 24px;
          width: 24px;
          left: 2px;
          bottom: 2px;
          background: white;
          border-radius: 50%;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .modern-toggle-slider.checked .modern-toggle-thumb {
          transform: translateX(24px);
          box-shadow: 0 3px 12px rgba(99, 102, 241, 0.4);
        }

        /* Select Dropdown */
        .modern-select {
          width: 100%;
          padding: 0.75rem 1rem;
          margin-top: 0.5rem;
          background: white;
          border: 1.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          font-size: 0.9375rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modern-select:hover {
          border-color: rgba(99, 102, 241, 0.3);
        }

        .modern-select:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        /* Action Buttons */
        .modern-action-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 0.875rem 1rem;
          margin-bottom: 0.625rem;
          background: white;
          border: 1.5px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          font-size: 0.9375rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-action-button:last-child {
          margin-bottom: 0;
        }

        .modern-action-button:hover {
          background: #f9fafb;
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateX(2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }

        .modern-action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .modern-action-button.primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-color: transparent;
          color: white;
          font-weight: 600;
        }

        .modern-action-button.primary:hover {
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
          transform: translateY(-1px);
        }

        .modern-action-button.accent {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.1) 100%);
          border-color: rgba(245, 158, 11, 0.3);
          color: #b45309;
        }

        .modern-action-button.accent:hover {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%);
          border-color: rgba(245, 158, 11, 0.5);
        }

        .modern-action-button.danger {
          background: rgba(239, 68, 68, 0.06);
          border-color: rgba(239, 68, 68, 0.2);
          color: #dc2626;
        }

        .modern-action-button.danger:hover {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.4);
        }

        .modern-action-button.danger-full {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          border: 2px solid #991b1b;
          color: white;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
        }

        .modern-action-button.danger-full:hover {
          background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
          border-color: #7f1d1d;
          box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
          transform: translateY(-1px);
        }

        .modern-action-button.small {
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
        }

        .modern-button-icon {
          font-size: 1.125rem;
          flex-shrink: 0;
        }

        .modern-button-text {
          flex: 1;
          text-align: left;
        }

        /* Button Groups */
        .modern-button-group {
          display: flex;
          gap: 0.625rem;
        }

        .modern-button-group .modern-action-button {
          flex: 1;
        }

        /* Link Buttons */
        .modern-link-group {
          display: flex;
          gap: 0.625rem;
          margin-top: 0.625rem;
        }

        .modern-link-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 0.875rem;
          background: white;
          border: 1.5px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modern-link-button:hover {
          background: #f9fafb;
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }

        /* Storage Card */
        .modern-storage-card {
          padding: 1rem;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
          border: 1.5px solid rgba(99, 102, 241, 0.15);
          border-radius: 12px;
          margin: 0.875rem 0;
        }

        .modern-storage-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.625rem;
        }

        .modern-storage-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6366f1;
        }

        .modern-storage-value {
          font-size: 0.875rem;
          font-weight: 600;
          color: #111827;
        }

        .modern-storage-bar {
          height: 8px;
          background: rgba(0, 0, 0, 0.06);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .modern-storage-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 8px;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-storage-fill.warning {
          background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
        }

        .modern-storage-percent {
          font-size: 0.8125rem;
          color: #6b7280;
          text-align: right;
        }

        /* Feature Button (for SMS Settings) */
        .modern-feature-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.125rem 1.25rem;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
          border: 1.5px solid rgba(99, 102, 241, 0.15);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .modern-feature-button:hover {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateX(2px);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.12);
        }

        .modern-feature-content {
          flex: 1;
        }

        .modern-feature-title {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .modern-feature-desc {
          font-size: 0.8125rem;
          color: #6b7280;
          line-height: 1.4;
        }

        .modern-feature-arrow {
          font-size: 1.25rem;
          color: #9ca3af;
          transition: transform 0.2s;
        }

        .modern-feature-button:hover .modern-feature-arrow {
          transform: translateX(4px);
          color: #6366f1;
        }

        /* Panel Footer */
        .modern-panel-footer {
          padding: 1rem 1.75rem;
          background: rgba(99, 102, 241, 0.02);
          border-top: 1px solid rgba(99, 102, 241, 0.08);
        }

        .modern-footer-text {
          font-size: 0.75rem;
          color: #9ca3af;
          text-align: center;
          line-height: 1.5;
        }

        /* Dark Mode Support */
        .dark-mode .modern-settings-trigger {
          background: linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 1) 100%);
          border-color: rgba(139, 92, 246, 0.2);
          color: #e5e7eb;
        }

        .dark-mode .modern-settings-trigger:hover {
          background: linear-gradient(135deg, rgba(31, 41, 55, 1) 0%, rgba(17, 24, 39, 1) 100%);
          border-color: rgba(139, 92, 246, 0.4);
        }

        .dark-mode .modern-settings-panel {
          background: linear-gradient(135deg, rgba(17, 24, 39, 0.98) 0%, rgba(31, 41, 55, 0.98) 100%);
          border-color: rgba(139, 92, 246, 0.15);
        }

        .dark-mode .modern-panel-header {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
          border-bottom-color: rgba(139, 92, 246, 0.15);
        }

        .dark-mode .modern-panel-title,
        .dark-mode .modern-section-title,
        .dark-mode .modern-setting-label,
        .dark-mode .modern-feature-title,
        .dark-mode .modern-storage-value {
          color: #f9fafb;
        }

        .dark-mode .modern-panel-subtitle,
        .dark-mode .modern-setting-desc,
        .dark-mode .modern-feature-desc,
        .dark-mode .modern-footer-text {
          color: #9ca3af;
        }

        .dark-mode .modern-settings-section-container {
          background: rgba(17, 24, 39, 0.6);
          border-color: rgba(139, 92, 246, 0.15);
        }

        .dark-mode .modern-section-header:hover {
          background: rgba(99, 102, 241, 0.05);
        }

        .dark-mode .modern-setting-row,
        .dark-mode .modern-setting-column {
          border-bottom-color: rgba(255, 255, 255, 0.06);
        }

        .dark-mode .modern-action-button,
        .dark-mode .modern-link-button {
          background: rgba(17, 24, 39, 0.8);
          border-color: rgba(255, 255, 255, 0.1);
          color: #e5e7eb;
        }

        .dark-mode .modern-action-button:hover,
        .dark-mode .modern-link-button:hover {
          background: rgba(17, 24, 39, 0.95);
          border-color: rgba(139, 92, 246, 0.4);
        }

        .dark-mode .modern-select {
          background: rgba(17, 24, 39, 0.8);
          border-color: rgba(255, 255, 255, 0.1);
          color: #e5e7eb;
        }

        .dark-mode .modern-storage-card {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
          border-color: rgba(99, 102, 241, 0.25);
        }

        .dark-mode .modern-storage-bar {
          background: rgba(0, 0, 0, 0.3);
        }

        .dark-mode .modern-feature-button {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
          border-color: rgba(99, 102, 241, 0.25);
        }

        .dark-mode .modern-feature-button:hover {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.12) 100%);
          border-color: rgba(99, 102, 241, 0.4);
        }

        .dark-mode .modern-close-button {
          background: rgba(17, 24, 39, 0.8);
          border-color: rgba(255, 255, 255, 0.1);
          color: #9ca3af;
        }

        .dark-mode .modern-close-button:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: #ef4444;
          color: #ef4444;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .modern-settings-dropdown {
            position: static;
          }

          .modern-settings-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            right: auto;
            bottom: auto;
            transform: translate(-50%, -50%);
            width: calc(100vw - 2rem);
            max-width: 420px;
            max-height: 85vh;
            z-index: 999999;
          }

          @keyframes modernSlideIn {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.92);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }

          .modern-panel-header {
            padding: 1.5rem 1.25rem 1rem;
          }

          .modern-panel-title {
            font-size: 1.375rem;
          }

          .modern-section-inner {
            padding: 0 1rem 1rem;
          }

          .modern-settings-trigger {
            padding: 0.625rem 1rem;
            font-size: 0.875rem;
          }

          .modern-trigger-icon {
            font-size: 1.125rem;
          }
        }

        /* Mobile Overlay */
        @media (max-width: 768px) {
          .modern-settings-panel::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: -1;
            animation: fadeIn 0.3s ease-out;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
};
