// src/components/SettingsDropdown.tsx - Modern Redesign
import React, { useState, useRef, useEffect } from 'react';
import { useSettings, isSupabaseConfigured } from '../hooks/useSettings';
import { ReminderSettings } from './ReminderSettings';
import { BonusSettingsModal } from './BonusSettingsModal';
import { SyncDebugModal } from './SyncDebugModal';
import { AddressAutocomplete } from './AddressAutocomplete';
import type { ReminderSettings as ReminderSettingsType, BonusSettings } from '../types';
import { DEFAULT_REMINDER_SETTINGS } from '../services/reminderScheduler';
import type { AppState } from '../types';
import {
  exportDataAsJSON,
  getStorageInfo,
  clearLocalCaches
} from '../utils/dataExport';
import { isHybridRoutingAvailable } from '../services/hybridRouting';
import { SETTINGS_STYLES } from './SettingsStyles';
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
  onResolveDataOwnership?: () => void;
  hasOwnershipIssue?: boolean;
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

// CRITICAL FIX: Define components OUTSIDE to prevent remounting on every render
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
  isExpanded: boolean;
  onToggle: (key: string) => void;
}> = ({ title, icon, sectionKey, children, isExpanded, onToggle }) => {
  return (
    <div className="modern-settings-section-container">
      <button
        type="button"
        className="modern-section-header"
        onClick={() => onToggle(sectionKey)}
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

const SettingsDropdownComponent: React.FC<SettingsDropdownProps> = ({
  trigger,
  reminderSettings,
  onUpdateReminderSettings,
  bonusSettings,
  onUpdateBonusSettings,
  onChangePassword,
  onChangeEmail,
  onDeleteAccount,
  onResolveDataOwnership,
  hasOwnershipIssue,
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
  const [showSyncDebug, setShowSyncDebug] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usedMB: string; quotaMB: string; percentage: number } | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('general');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const {
    settings,
    toggleBackup,
    toggleDarkMode,
    togglePushNotifications,
    toggleAutoSync,
    toggleConfirmBeforeDelete,
    toggleAvoidTolls,
    updateKeepDataForMonths,
    updateHomeAddress,
    clearHomeAddress,
  } = useSettings();

  // Home address editing state
  const [isEditingHomeAddress, setIsEditingHomeAddress] = useState(false);
  const [tempHomeAddress, setTempHomeAddress] = useState("");

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
    setExpandedSection(prev => prev === section ? null : section);
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
        type="button"
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
              type="button"
              className="modern-close-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <div className="modern-panel-body" ref={panelBodyRef}>
            {/* General Settings */}
            <CollapsibleSection
              title="General"
              icon="📱"
              sectionKey="general"
              isExpanded={expandedSection === 'general'}
              onToggle={toggleSection}
            >
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
            <CollapsibleSection
              title="Data & Backup"
              icon="💾"
              sectionKey="data"
              isExpanded={expandedSection === 'data'}
              onToggle={toggleSection}
            >
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

                  <button
                    className="modern-action-button"
                    onClick={() => {
                      setShowSyncDebug(true);
                      setIsOpen(false);
                    }}
                    style={{ marginTop: '0.5rem' }}
                  >
                    <span className="modern-button-icon">🛠️</span>
                    <span className="modern-button-text">Sync Diagnostics</span>
                  </button>
                </div>
              )}
            </CollapsibleSection>

            {/* Route Planning */}
            <CollapsibleSection
              title="Route Planning"
              icon="🗺️"
              sectionKey="routing"
              isExpanded={expandedSection === 'routing'}
              onToggle={toggleSection}
            >
              <div className="modern-setting-row">
                <div className="modern-setting-info">
                  <div className="modern-setting-label">Avoid Tolls</div>
                  <div className="modern-setting-desc">Route optimization will avoid toll roads when possible</div>
                </div>
                <ToggleSwitch
                  id="avoid-tolls"
                  checked={settings.avoidTolls}
                  onChange={toggleAvoidTolls}
                />
              </div>

              {/* Home Address Setting */}
              <div className="modern-setting-column" style={{ marginTop: '1rem' }}>
                <div className="modern-setting-label" style={{ marginBottom: '0.5rem' }}>
                  🏠 Home Address
                </div>

                {!isEditingHomeAddress && !settings.homeAddress && (
                  <div style={{
                    padding: '0.875rem',
                    background: 'rgba(99, 102, 241, 0.05)',
                    borderRadius: '10px',
                    border: '1.5px dashed rgba(99, 102, 241, 0.2)',
                    textAlign: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <p style={{ margin: '0 0 0.75rem 0', color: '#6b7280', fontSize: '0.8125rem' }}>
                      Set your home address to optimize routes that end near home
                    </p>
                    <button
                      className="modern-action-button primary small"
                      onClick={() => setIsEditingHomeAddress(true)}
                      style={{ margin: '0 auto', maxWidth: '200px' }}
                    >
                      <span className="modern-button-icon">+</span>
                      <span className="modern-button-text">Set Home Address</span>
                    </button>
                  </div>
                )}

                {!isEditingHomeAddress && settings.homeAddress && (
                  <div style={{
                    padding: '0.875rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '10px',
                    border: '1.5px solid rgba(16, 185, 129, 0.3)',
                    marginBottom: '0.5rem'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '0.75rem'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: '600',
                          color: '#059669',
                          marginBottom: '0.25rem',
                          fontSize: '0.8125rem'
                        }}>
                          ✓ Routes will end near home
                        </div>
                        <div style={{ color: '#374151', fontSize: '0.8125rem' }}>
                          {settings.homeAddress}
                        </div>
                      </div>
                      <div className="modern-inline-button-group">
                        <button
                          className="modern-inline-button primary"
                          onClick={() => {
                            setTempHomeAddress(settings.homeAddress);
                            setIsEditingHomeAddress(true);
                          }}
                        >
                          Change
                        </button>
                        <button
                          className="modern-inline-button danger"
                          onClick={() => {
                            if (confirm("Clear your home address? You can set it again anytime.")) {
                              clearHomeAddress();
                            }
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isEditingHomeAddress && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <AddressAutocomplete
                      id="settings-home-address-input"
                      value={tempHomeAddress}
                      onChange={setTempHomeAddress}
                      onSelect={(address, lat, lng) => {
                        updateHomeAddress(address, lat, lng);
                        setIsEditingHomeAddress(false);
                        setTempHomeAddress("");
                      }}
                      placeholder="Type your home address..."
                      disabled={!isHybridRoutingAvailable()}
                    />
                    <button
                      className="modern-action-button small"
                      onClick={() => {
                        setIsEditingHomeAddress(false);
                        setTempHomeAddress("");
                      }}
                      style={{ marginTop: '0.5rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="modern-setting-desc">
                  When set, route optimization will create routes that end near your home address
                </div>
              </div>
            </CollapsibleSection>

            {/* Reminders & SMS */}
            <CollapsibleSection
              title="Reminders & SMS"
              icon="🔔"
              sectionKey="reminders"
              isExpanded={expandedSection === 'reminders'}
              onToggle={toggleSection}
            >
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
            <CollapsibleSection
              title="Earnings & Bonus"
              icon="💰"
              sectionKey="earnings"
              isExpanded={expandedSection === 'earnings'}
              onToggle={toggleSection}
            >
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
            <CollapsibleSection
              title="Privacy & Safety"
              icon="🔒"
              sectionKey="privacy"
              isExpanded={expandedSection === 'privacy'}
              onToggle={toggleSection}
            >
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
            <CollapsibleSection
              title="Account"
              icon="👤"
              sectionKey="account"
              isExpanded={expandedSection === 'account'}
              onToggle={toggleSection}
            >
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

                {onResolveDataOwnership && hasOwnershipIssue && (
                  <button
                    className="modern-action-button"
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      borderColor: 'rgba(245, 158, 11, 0.3)',
                      color: '#b45309'
                    }}
                    onClick={() => {
                      onResolveDataOwnership();
                      setIsOpen(false);
                    }}
                  >
                    <span className="modern-button-icon">⚠️</span>
                    <span className="modern-button-text">Resolve Data Ownership</span>
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

      {/* Sync Debug Modal */}
      {showSyncDebug && (
        <SyncDebugModal
          onClose={() => setShowSyncDebug(false)}
        />
      )}

      <style>{SETTINGS_STYLES}</style>
    </div>
  );
};

// Custom comparison function that prevents re-renders from inline functions
const arePropsEqual = (prevProps: SettingsDropdownProps, nextProps: SettingsDropdownProps) => {
  return (
    prevProps.isSyncing === nextProps.isSyncing &&
    prevProps.hasSupabase === nextProps.hasSupabase &&
    prevProps.userEmail === nextProps.userEmail &&
    prevProps.reminderSettings === nextProps.reminderSettings &&
    prevProps.bonusSettings === nextProps.bonusSettings
  );
};

// Memoize with custom comparison to prevent re-renders from parent app state changes
export const SettingsDropdown = React.memo(SettingsDropdownComponent, arePropsEqual);
