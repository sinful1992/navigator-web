// src/components/SettingsDropdown.tsx - Modern Redesign
// PHASE 2 Task 2: Refactored to use extracted components and state hook
import React from 'react';
import { useSettings, isSupabaseConfigured } from '../hooks/useSettings';
import { useSettingsDropdown } from '../hooks/useSettingsDropdown';
import { ReminderSettings } from './ReminderSettings';
import { BonusSettingsModal } from './BonusSettingsModal';
import { SyncDebugModal } from './SyncDebugModal';
import { SyncRepairPanel } from './SyncRepairPanel';
import { SyncStatusPanel } from './SyncStatusPanel';
import type { ReminderSettings as ReminderSettingsType, BonusSettings } from '../types';
import { DEFAULT_REMINDER_SETTINGS } from '../services/reminderScheduler';
import {
  getSessionTimeoutPreference,
  setSessionTimeoutPreference,
  type SessionTimeoutOption,
} from '../hooks/useInactivityTimeout';
import type { AppState } from '../types';
import {
  exportDataAsJSON,
  clearLocalCaches
} from '../utils/dataExport';
import { SETTINGS_STYLES } from './SettingsStyles';
import {
  SettingsSection,
  SettingsToggle,
  SettingsActionButton,
  StorageInfo,
  HomeAddressEditor,
  SubsectionTitle,
} from './SettingsComponents';
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
  userId?: string;
  deviceId?: string;

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
  onSessionTimeoutChange?: () => void;
}


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
  userId,
  deviceId,
  onImportExcel,
  onRestoreBackup,
  onManualSync,
  isSyncing,
  onShowBackupManager,
  onShowCloudBackups,
  onShowSubscription,
  onShowSupabaseSetup,
  onSignOut,
  hasSupabase,
  onSessionTimeoutChange,
}) => {
  // Extract state and actions from hook
  const { state, actions, refs } = useSettingsDropdown();

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

  // File input handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportExcel) {
      onImportExcel(file);
      actions.closeDropdown();
    }
  };

  return (
    <div className="modern-settings-dropdown" ref={refs.dropdownRef}>
      <button
        type="button"
        className="modern-settings-trigger"
        onClick={actions.toggleDropdown}
        aria-expanded={state.isOpen}
        aria-haspopup="true"
      >
        {trigger || (
          <>
            <span className="modern-trigger-icon">⚙️</span>
            <span className="modern-trigger-text">Settings</span>
          </>
        )}
      </button>

      {state.isOpen && (
        <div className="modern-settings-panel">
          <div className="modern-panel-header">
            <div className="modern-header-content">
              <h2 className="modern-panel-title">Settings</h2>
              <p className="modern-panel-subtitle">Manage your app preferences</p>
            </div>
            <button
              type="button"
              className="modern-close-button"
              onClick={actions.closeDropdown}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <div className="modern-panel-body" ref={refs.panelBodyRef}>
            {/* General Settings */}
            <SettingsSection
              title="General"
              icon="📱"
              sectionKey="general"
              isExpanded={state.expandedSection === 'general'}
              onToggle={actions.toggleSection}
            >
              <SettingsToggle
                id="dark-mode"
                checked={settings.darkMode}
                onChange={toggleDarkMode}
                label="Dark Mode"
                description="Switch between light and dark theme"
              />

              <SettingsToggle
                id="push-notifs"
                checked={settings.pushNotifications}
                onChange={togglePushNotifications}
                label="Push Notifications"
                description="Receive arrangement reminders"
              />

              <SettingsToggle
                id="auto-sync"
                checked={settings.autoSyncOnStart}
                onChange={toggleAutoSync}
                label="Auto-sync on startup"
                description="Automatically sync when app opens"
              />
            </SettingsSection>

            {/* Data & Backup */}
            <SettingsSection
              title="Data & Backup"
              icon="💾"
              sectionKey="data"
              isExpanded={state.expandedSection === 'data'}
              onToggle={actions.toggleSection}
            >
              {/* Import/Export */}
              <div className="modern-subsection">
                <SubsectionTitle>Import & Export</SubsectionTitle>

                <input
                  type="file"
                  ref={refs.fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />

                <SettingsActionButton
                  icon="📊"
                  text="Import Excel/CSV"
                  onClick={() => refs.fileInputRef.current?.click()}
                />

                {appState && (
                  <SettingsActionButton
                    icon="💾"
                    text="Backup All Data"
                    variant="primary"
                    onClick={() => {
                      exportDataAsJSON(appState, userEmail);
                      actions.closeDropdown();
                    }}
                  />
                )}
              </div>

              {/* Backup Management */}
              <div className="modern-subsection">
                <SubsectionTitle>Backup Management</SubsectionTitle>

                <input
                  type="file"
                  ref={refs.restoreInputRef}
                  accept="application/json"
                  onChange={(e) => {
                    if (onRestoreBackup) {
                      onRestoreBackup(e);
                      actions.closeDropdown();
                    }
                  }}
                  style={{ display: 'none' }}
                />

                <SettingsActionButton
                  icon="📂"
                  text="Restore from Backup"
                  onClick={() => refs.restoreInputRef.current?.click()}
                />

                {onShowBackupManager && (
                  <SettingsActionButton
                    icon="💾"
                    text="Local Backup Manager"
                    onClick={() => {
                      onShowBackupManager();
                      actions.closeDropdown();
                    }}
                  />
                )}

                {hasSupabase && onShowCloudBackups && (
                  <SettingsActionButton
                    icon="☁️"
                    text="Cloud Backups (Last 7 Days)"
                    onClick={() => {
                      onShowCloudBackups();
                      actions.closeDropdown();
                    }}
                  />
                )}

                {!hasSupabase && onShowSupabaseSetup && (
                  <SettingsActionButton
                    icon="🔗"
                    text="Connect Cloud Storage"
                    onClick={() => {
                      onShowSupabaseSetup();
                      actions.closeDropdown();
                    }}
                  />
                )}

                <SettingsToggle
                  id="backup-toggle"
                  checked={settings.backupOnEndOfDay}
                  onChange={toggleBackup}
                  label="Auto-backup on end of day"
                  description={
                    isSupabaseConfigured()
                      ? "Automatic backup when finishing your day"
                      : "Local backup only (cloud not configured)"
                  }
                />
              </div>

              {/* Sync */}
              {onManualSync && (
                <div className="modern-subsection">
                  <SubsectionTitle>Cloud Sync</SubsectionTitle>

                  {/* Sync Repair Panel - Sequence Collision Diagnostics */}
                  {userId && deviceId && (
                    <div style={{ marginBottom: '1rem' }}>
                      <SyncRepairPanel userId={userId} deviceId={deviceId} />
                    </div>
                  )}

                  <SettingsActionButton
                    icon={isSyncing ? "⟳" : "🔄"}
                    text={isSyncing ? "Syncing..." : "Sync Now"}
                    onClick={() => {
                      onManualSync();
                      actions.closeDropdown();
                    }}
                    disabled={isSyncing}
                  />

                  <SettingsActionButton
                    icon="🛠️"
                    text="Sync Diagnostics"
                    onClick={() => {
                      actions.showSyncDebugModal();
                    }}
                    style={{ marginTop: '0.5rem' }}
                  />

                  {/* 🔄 PHASE 1: Retry Queue Status Panel */}
                  <SyncStatusPanel
                    onForceRetry={onManualSync ? async () => { onManualSync(); } : undefined}
                    isSyncing={isSyncing}
                  />
                </div>
              )}
            </SettingsSection>

            {/* Route Planning */}
            <SettingsSection
              title="Route Planning"
              icon="🗺️"
              sectionKey="routing"
              isExpanded={state.expandedSection === 'routing'}
              onToggle={actions.toggleSection}
            >
              <SettingsToggle
                id="avoid-tolls"
                checked={settings.avoidTolls}
                onChange={toggleAvoidTolls}
                label="Avoid Tolls"
                description="Route optimization will avoid toll roads when possible"
              />

              <HomeAddressEditor
                homeAddress={settings.homeAddress}
                onUpdateAddress={updateHomeAddress}
                onClearAddress={clearHomeAddress}
              />
            </SettingsSection>

            {/* Reminders & SMS */}
            <SettingsSection
              title="Reminders & SMS"
              icon="🔔"
              sectionKey="reminders"
              isExpanded={state.expandedSection === 'reminders'}
              onToggle={actions.toggleSection}
            >
              <button
                className="modern-feature-button"
                onClick={() => {
                  actions.showSMSModal();
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
            </SettingsSection>

            {/* Earnings & Bonus */}
            <SettingsSection
              title="Earnings & Bonus"
              icon="💰"
              sectionKey="earnings"
              isExpanded={state.expandedSection === 'earnings'}
              onToggle={actions.toggleSection}
            >
              <button
                className="modern-feature-button"
                onClick={() => {
                  actions.showBonusModal();
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
            </SettingsSection>

            {/* Privacy & Safety */}
            <SettingsSection
              title="Privacy & Safety"
              icon="🔒"
              sectionKey="privacy"
              isExpanded={state.expandedSection === 'privacy'}
              onToggle={actions.toggleSection}
            >
              <SettingsToggle
                id="confirm-delete"
                checked={settings.confirmBeforeDelete}
                onChange={toggleConfirmBeforeDelete}
                label="Confirm before deleting"
                description="Ask for confirmation on deletions"
              />

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
              {state.storageInfo && (
                <StorageInfo
                  usedMB={state.storageInfo.usedMB}
                  quotaMB={state.storageInfo.quotaMB}
                  percentage={state.storageInfo.percentage}
                />
              )}

              <SettingsActionButton
                icon="🗑️"
                text="Clear Cache & Temporary Data"
                onClick={async () => {
                  await clearLocalCaches();
                  actions.refreshStorageInfo();
                }}
              />

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
            </SettingsSection>

            {/* Security */}
            <SettingsSection
              title="Security"
              icon="🛡️"
              sectionKey="security"
              isExpanded={state.expandedSection === 'security'}
              onToggle={actions.toggleSection}
            >
              <div className="modern-setting-column">
                <label htmlFor="session-timeout" className="modern-setting-label">
                  Session Timeout
                </label>
                <select
                  id="session-timeout"
                  className="modern-select"
                  value={getSessionTimeoutPreference()}
                  onChange={(e) => {
                    setSessionTimeoutPreference(e.target.value as SessionTimeoutOption);
                    onSessionTimeoutChange?.();
                  }}
                >
                  <option value="15min">15 minutes</option>
                  <option value="30min">30 minutes</option>
                  <option value="1hr">1 hour</option>
                  <option value="4hr">4 hours</option>
                  <option value="never">Never (stay signed in)</option>
                </select>
                <p className="modern-setting-desc">
                  Automatically sign out after this period of inactivity
                </p>
              </div>
            </SettingsSection>

            {/* Account */}
            <SettingsSection
              title="Account"
              icon="👤"
              sectionKey="account"
              isExpanded={state.expandedSection === 'account'}
              onToggle={actions.toggleSection}
            >
              <div className="modern-subsection">
                <SubsectionTitle>Account Settings</SubsectionTitle>

                {onShowSubscription && (
                  <SettingsActionButton
                    icon="⭐"
                    text="Subscription"
                    variant="accent"
                    onClick={() => {
                      onShowSubscription();
                      actions.closeDropdown();
                    }}
                  />
                )}

                {onChangePassword && (
                  <SettingsActionButton
                    icon="🔑"
                    text="Change Password"
                    onClick={() => {
                      onChangePassword();
                      actions.closeDropdown();
                    }}
                  />
                )}

                {onChangeEmail && (
                  <SettingsActionButton
                    icon="📧"
                    text="Change Email"
                    onClick={() => {
                      onChangeEmail();
                      actions.closeDropdown();
                    }}
                  />
                )}

                {onSignOut && (
                  <SettingsActionButton
                    icon="🚪"
                    text="Sign Out"
                    onClick={() => {
                      onSignOut();
                      actions.closeDropdown();
                    }}
                  />
                )}

                {onResolveDataOwnership && hasOwnershipIssue && (
                  <SettingsActionButton
                    icon="⚠️"
                    text="Resolve Data Ownership"
                    variant="accent"
                    onClick={() => {
                      onResolveDataOwnership();
                      actions.closeDropdown();
                    }}
                  />
                )}
              </div>

              {/* Danger Zone */}
              {onDeleteAccount && (
                <div className="modern-subsection modern-danger-zone">
                  <div className="modern-danger-zone-header">
                    <span className="modern-danger-icon">⚠️</span>
                    <div>
                      <SubsectionTitle isDanger>Danger Zone</SubsectionTitle>
                      <div className="modern-danger-desc">Irreversible actions</div>
                    </div>
                  </div>
                  <SettingsActionButton
                    icon="🗑️"
                    text="Delete Account Permanently"
                    variant="danger"
                    onClick={() => {
                      onDeleteAccount();
                      actions.closeDropdown();
                    }}
                  />
                </div>
              )}
            </SettingsSection>
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
      {state.showSMSSettings && (
        <ReminderSettings
          settings={reminderSettings || DEFAULT_REMINDER_SETTINGS}
          onUpdateSettings={(settings) => {
            if (onUpdateReminderSettings) {
              onUpdateReminderSettings(settings);
            }
            actions.hideSMSModal();
          }}
          onClose={() => actions.hideSMSModal()}
        />
      )}

      {/* Bonus Settings Modal */}
      {state.showBonusSettings && bonusSettings && onUpdateBonusSettings && (
        <BonusSettingsModal
          settings={bonusSettings}
          onUpdateSettings={(settings) => {
            onUpdateBonusSettings(settings);
            actions.hideBonusModal();
          }}
          onClose={() => actions.hideBonusModal()}
        />
      )}

      {/* Sync Debug Modal */}
      {state.showSyncDebug && (
        <SyncDebugModal
          onClose={() => actions.hideSyncDebugModal()}
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
