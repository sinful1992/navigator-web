// src/App.tsx - Complete Modern Design with Right Sidebar
import * as React from "react";
import "./App.css"; // Use the updated modern CSS
import { useAppState } from "./useAppState";
import { normalizeState, normalizeBackupData } from "./utils/normalizeState";
import { useUnifiedSync } from "./sync/migrationAdapter";
import { ModalProvider, useModalContext } from "./components/ModalProvider";
import { logger } from "./utils/logger";
import { Auth } from "./Auth";
import { AddressList } from "./AddressList";
import Completed from "./Completed";
import { DayPanel } from "./DayPanel";
import { Arrangements } from "./Arrangements";
import { readJsonFile } from "./backup";
import type { AddressRow, Outcome, Completion, DaySession } from "./types";
import { supabase } from "./lib/supabaseClient";
import ManualAddressFAB from "./ManualAddressFAB";
import { SubscriptionManager } from "./SubscriptionManager";
import { AdminDashboard } from "./AdminDashboard";
import { useSubscription } from "./useSubscription";
import { useAdmin } from "./useAdmin";
import { EarningsCalendar } from "./EarningsCalendar";
import { RoutePlanning } from "./RoutePlanning";
import { SupabaseSetup } from "./components/SupabaseSetup";
import { BackupManager } from "./components/BackupManager";
import { LocalBackupManager } from "./utils/localBackup";
import { SettingsDropdown } from "./components/SettingsDropdown";
import { ToastContainer } from "./components/ToastContainer";
import { isProtectionActive } from "./utils/protectionFlags";
import { PrivacyConsent } from "./components/PrivacyConsent";
import { EnhancedOfflineIndicator } from "./components/EnhancedOfflineIndicator";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { useSettings } from "./hooks/useSettings";
import { ChangePasswordModal, ChangeEmailModal, DeleteAccountModal } from "./components/AccountSettings";
import { useTabNavigation } from "./hooks/useTabNavigation";
import { usePWAInit } from "./hooks/usePWAInit";
import { useDataCleanup } from "./hooks/useDataCleanup";
import { reconcileSessionState } from "./services/sessionReconciliation";
import { formatDateKey } from "./utils/dateFormatter";
import { useStats } from "./hooks/useStats";
import { OwnershipPrompt } from "./components/OwnershipPrompt";
import { Sidebar } from "./components/Sidebar";
import { SyncDiagnostic } from "./components/SyncDiagnostic";

export type Tab = "list" | "completed" | "arrangements" | "earnings" | "planning";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; msg?: string }
> {
  constructor(p: any) {
    super(p);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: String(err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ paddingTop: "4rem" }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// REMOVED: uploadBackupToStorage function - cloud backups redundant with delta sync
// All data is safely stored in navigator_operations database table

// Modern Stats Card Component
function StatsCard({ title, value, change, changeType, icon, iconType }: {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: string;
  iconType: 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <div className="stat-card-modern">
      <div className="stat-header">
        <div className="stat-title">{title}</div>
        <div className={`stat-icon ${iconType}`}>{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {change && (
        <div className={`stat-change ${changeType || 'neutral'}`}>
          {changeType === 'positive' && <span>↑</span>}
          {changeType === 'negative' && <span>↓</span>}
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const cloudSync = useUnifiedSync();

  // 🎯 UX IMPROVEMENT: Only show loading screen if actually taking time
  const [showLoading, setShowLoading] = React.useState(false);
  const [forceSkipLoading, setForceSkipLoading] = React.useState(false);

  React.useEffect(() => {
    if (cloudSync.isLoading) {
      // Delay showing loading screen by 500ms - most sessions restore instantly
      const timer = setTimeout(() => setShowLoading(true), 500);

      // 🔧 CRITICAL FIX: If offline, skip loading after 3 seconds and let user access local data
      const offlineTimer = setTimeout(() => {
        if (!navigator.onLine) {
          logger.warn('🔌 OFFLINE: Force skipping loading screen to allow local data access');
          setForceSkipLoading(true);
        }
      }, 3000);

      // 🔧 CRITICAL FIX: Absolute timeout - never block for more than 10 seconds
      const maxTimer = setTimeout(() => {
        logger.warn('⏱️ TIMEOUT: Force skipping loading screen after 10 seconds');
        setForceSkipLoading(true);
      }, 10000);

      return () => {
        clearTimeout(timer);
        clearTimeout(offlineTimer);
        clearTimeout(maxTimer);
      };
    } else {
      setShowLoading(false);
      setForceSkipLoading(false);
    }
  }, [cloudSync.isLoading]);

  // 🔧 CRITICAL FIX: If offline or timeout, show app with offline indicator instead of blocking
  if (cloudSync.isLoading && showLoading && !forceSkipLoading) {
    return (
      <div className="app-wrapper">
        <div className="main-area">
          <div className="content-area">
            <div className="loading">
              <div className="spinner" />
              <div>Restoring session...</div>
              {!cloudSync.isOnline && (
                <div style={{ marginTop: '1rem', color: 'var(--warning)', fontSize: '0.875rem' }}>
                  📡 You appear to be offline. Loading local data...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!cloudSync.user) {
    return (
      <ErrorBoundary>
        <Auth
          onSignIn={async (email, password) => {
            await cloudSync.signIn(email, password);
          }}
          onSignUp={async (email, password) => {
            await cloudSync.signUp(email, password);
          }}
          onResetPassword={async (email) => {
            await cloudSync.resetPassword(email);
          }}
          isLoading={cloudSync.isLoading}
          error={cloudSync.error}
          onClearError={cloudSync.clearError}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ModalProvider>
        <AuthedApp />
      </ModalProvider>
    </ErrorBoundary>
  );
}

function AuthedApp() {
  const cloudSync = useUnifiedSync();

  const {
    state,
    loading,
    setAddresses,
    addAddress,
    setActive,
    cancelActive,
    complete,
    undo,
    updateCompletion,
    startDay,
    endDay,
    updateSession,
    backupState,
    restoreState,
    addArrangement,
    updateArrangement,
    deleteArrangement,
    setState,
    setBaseState,
    deviceId,
    enqueueOp,
    updateReminderSettings,
    updateBonusSettings,
    ownerMetadata,
  } = useAppState(cloudSync.user?.id, cloudSync.submitOperation);

  const { confirm, alert } = useModalContext();
  const { settings } = useSettings();

  const { hasAccess } = useSubscription(cloudSync.user);
  const { isAdmin, isOwner } = useAdmin(cloudSync.user);
  const [showSubscription, setShowSubscription] = React.useState(false);
  const [showAdmin, setShowAdmin] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showSupabaseSetup, setShowSupabaseSetup] = React.useState(false);
  const [showBackupManager, setShowBackupManager] = React.useState(false);
  const [showChangePassword, setShowChangePassword] = React.useState(false);
  const [showChangeEmail, setShowChangeEmail] = React.useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = React.useState(false);
  const [showOwnershipPrompt, setShowOwnershipPrompt] = React.useState(false);

  // Tab navigation with URL hash sync and browser history support
  const { tab, navigateToTab, search, setSearch } = useTabNavigation();
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] =
    React.useState<number | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

  // Check for ownership uncertainty flag
  React.useEffect(() => {
    if (hydrated && localStorage.getItem('navigator_ownership_uncertain') === 'true') {
      setShowOwnershipPrompt(true);
    }
  }, [hydrated]);

  // PWA initialization - request persistent storage
  usePWAInit();

  // Data retention cleanup (runs once per day on app start)
  useDataCleanup(state, setState, settings);

  // REMOVED: Page visibility tracking - was over-engineering after fixing React subscription bug

  // Cloud restore state
  type CloudBackupRow = {
    object_path: string;
    size_bytes?: number;
    created_at?: string;
    day_key?: string;
  };

  const [cloudMenuOpen, setCloudMenuOpen] = React.useState(false);
  const [cloudBackups, setCloudBackups] = React.useState<CloudBackupRow[]>([]);
  const [cloudBusy, setCloudBusy] = React.useState(false);
  const [cloudErr, setCloudErr] = React.useState<string | null>(null);

  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const arrangements = Array.isArray(state.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...state, addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

  const safeStateRef = React.useRef(safeState);
  React.useEffect(() => {
    safeStateRef.current = safeState;
  }, [safeState]);

  const ownerMetadataRef = React.useRef(ownerMetadata);
  React.useEffect(() => {
    ownerMetadataRef.current = ownerMetadata;
  }, [ownerMetadata]);

  // Load recent cloud backups
  const loadRecentCloudBackups = React.useCallback(async () => {
    if (!supabase) {
      setCloudErr("Supabase not configured");
      return;
    }
    setCloudBusy(true);
    setCloudErr(null);
    try {
      const authResp = await supabase.auth.getUser();
      const userId = authResp?.data?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);

      const fromKey = formatDateKey(start);
      const toKey = formatDateKey(end);

      const q = await supabase
        .from("backups")
        .select("object_path,size_bytes,created_at,day_key")
        .eq("user_id", userId)
        .gte("day_key", fromKey)
        .lte("day_key", toKey)
        .order("day_key", { ascending: false })
        .order("created_at", { ascending: false });

      if (q.error) throw q.error;

      const data = (q.data ?? []) as CloudBackupRow[];
      setCloudBackups(data);
    } catch (e: any) {
      setCloudErr(e?.message || String(e));
    } finally {
      setCloudBusy(false);
    }
  }, []);

  // Restore from cloud
  const restoreFromCloud = React.useCallback(
    async (objectPath: string) => {
      if (!supabase) {
        await alert({
          title: "Configuration Error",
          message: "Supabase is not configured.",
          type: "error"
        });
        return;
      }
      const fileName = objectPath.split("/").pop() || objectPath;
      const confirmed = await confirm({
        title: "Restore from Cloud",
        message: `Restore "${fileName}" from cloud?\n\nThis will overwrite your current data.`,
        confirmText: "Restore",
        cancelText: "Cancel",
        type: "warning"
      });
      if (!confirmed) return;

      setCloudBusy(true);
      setCloudErr(null);
      try {
        const bucket = import.meta.env.VITE_SUPABASE_BUCKET || "navigator-backups";
        const dl = await supabase.storage.from(bucket).download(objectPath);
        if (dl.error) throw dl.error;
        const blob: Blob = dl.data as Blob;
        const text = await blob.text();
        const raw = JSON.parse(text);
        // ARCHITECTURAL FIX: Restore data but preserve current session state
        const backupData = normalizeBackupData(raw);
        const currentSessions = safeState.daySessions; // Preserve current session state

        const data = {
          ...backupData,
          daySessions: currentSessions // Keep current sessions, don't restore from backup
        };

        restoreState(data);

        // 🔧 CRITICAL FIX: Wait for restore protection window before syncing
        setTimeout(async () => {
          await cloudSync.syncData(data);
          lastFromCloudRef.current = JSON.stringify(data);
        }, 61000); // Wait 61 seconds (after 60s protection window expires)

        // ARCHITECTURAL FIX: Post-restore session reconciliation
        await reconcileSessionState(cloudSync, setState, supabase);

        setHydrated(true);
        await alert({
          title: "Success",
          message: "Successfully restored from cloud",
          type: "success"
        });
        setCloudMenuOpen(false);
      } catch (e: any) {
        setCloudErr(e?.message || String(e));
      } finally {
        setCloudBusy(false);
      }
    },
    [cloudSync, restoreState, alert, confirm]
  );


  // 🔒 SECURITY: Track expected user ID to prevent session poisoning
  const expectedUserIdRef = React.useRef<string | null>(null);

  // Store expected user ID when it changes
  React.useEffect(() => {
    if (cloudSync.user?.id) {
      const storedUserId = localStorage.getItem('navigator_expected_user_id');

      // First time or user changed
      if (!storedUserId || storedUserId !== cloudSync.user.id) {
        logger.info(`🔒 SECURITY: Setting expected user ID: ${cloudSync.user.id}`);
        localStorage.setItem('navigator_expected_user_id', cloudSync.user.id);
        expectedUserIdRef.current = cloudSync.user.id;
      } else {
        expectedUserIdRef.current = storedUserId;
      }
    }
  }, [cloudSync.user?.id]);

  // Delta sync subscription - Bootstrap handled by operationSync.ts
  React.useEffect(() => {
    const user = cloudSync.user;
    if (!user || loading) return;

    logger.info('🔄 DELTA SYNC: Setting up operation subscription for user:', user.id);

    let cleanup: undefined | (() => void);

    // Subscribe to operations (local + remote)
    cleanup = cloudSync.subscribeToData((updaterOrState) => {
      logger.info('📥 APP: subscribeToData callback fired', {
        isFunction: typeof updaterOrState === 'function',
        hasData: !!updaterOrState,
      });

      if (!updaterOrState) {
        logger.warn('⚠️ APP: No data in subscribeToData callback, ignoring');
        return;
      }

      // Protection flags
      if (isProtectionActive('navigator_restore_in_progress')) {
        logger.sync('🛡️ APP: RESTORE PROTECTION - Skipping cloud state update');
        return;
      }
      if (isProtectionActive('navigator_import_in_progress')) {
        logger.sync('🛡️ APP: IMPORT PROTECTION - Skipping cloud state update');
        return;
      }
      if (isProtectionActive('navigator_active_protection')) {
        logger.sync('🛡️ APP: ACTIVE PROTECTION - Skipping cloud state update');
        return;
      }
      if (isProtectionActive('navigator_day_session_protection')) {
        logger.sync('🛡️ APP: DAY SESSION PROTECTION - Skipping cloud state update');
        return;
      }

      logger.info('✅ APP: No protection flags active, applying state update');

      // Apply state update from operations
      if (typeof updaterOrState === 'function') {
        logger.info('🔄 APP: Applying function updater');
        setState(prevState => {
          logger.info('📊 APP: Previous state:', {
            addresses: prevState.addresses?.length || 0,
            completions: prevState.completions?.length || 0,
            arrangements: prevState.arrangements?.length || 0,
          });

          const newState = updaterOrState(prevState);
          logger.info('📊 APP: New state from updater:', {
            addresses: newState.addresses?.length || 0,
            completions: newState.completions?.length || 0,
            arrangements: newState.arrangements?.length || 0,
          });

          const normalized = normalizeState(newState);
          logger.info('📊 APP: Normalized state:', {
            addresses: normalized.addresses?.length || 0,
            completions: normalized.completions?.length || 0,
            arrangements: normalized.arrangements?.length || 0,
          });

          lastFromCloudRef.current = JSON.stringify(normalized);
          return normalized;
        });
      } else {
        logger.info('🔄 APP: Applying direct state', {
          addresses: updaterOrState.addresses?.length || 0,
          completions: updaterOrState.completions?.length || 0,
          arrangements: updaterOrState.arrangements?.length || 0,
        });

        const normalized = normalizeState(updaterOrState);
        logger.info('📊 APP: Normalized state:', {
          addresses: normalized.addresses?.length || 0,
          completions: normalized.completions?.length || 0,
          arrangements: normalized.arrangements?.length || 0,
        });

        setState(normalized);
        lastFromCloudRef.current = JSON.stringify(normalized);
        logger.info('✅ APP: setState called successfully');
      }
    });

    setHydrated(true);
    logger.info('✅ DELTA SYNC: Subscription active');



    return () => {
      if (cleanup) cleanup();
    };
  }, [cloudSync.user, loading]);

  // REMOVED: Visibility change handler - was over-engineering after fixing React subscription bug

  // 🔥 DELTA SYNC: Debounced sync REMOVED - now using immediate operation-based sync
  // Operations are submitted immediately via cloudSync.submitOperation() in useAppState
  // This eliminates the debounce problem that caused multi-device sync failures
  //
  // Legacy comment: This was the old debounced sync that had a fatal flaw:
  // - Timer reset on every state change (500ms debounce)
  // - If user worked faster than 500ms between actions, sync never fired
  // - Result: Data never synced to cloud, second device had no data
  //
  // New architecture:
  // - Each action (complete, addArrangement, etc.) calls submitOperation() immediately
  // - No debounce, no delays
  // - Operations sync to cloud in real-time
  // - 99.7% smaller payloads (0.3KB vs 103KB)
  //
  // Note: When sync mode is 'legacy', cloudSync.syncData() may still be used
  // for bootstrap and manual sync operations, but automatic sync is disabled.

  // REMOVED: Periodic cloud backups no longer needed with delta sync
  // All data is safely stored in navigator_operations table

  // CRITICAL FIX: Data integrity monitoring to detect potential data loss
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;

    const checkDataIntegrity = () => {
      const completionsCount = safeState.completions.length;
      const addressesCount = safeState.addresses.length;

      // Store current counts
      const lastCounts = localStorage.getItem('navigator_data_counts');
      if (lastCounts) {
        const { completions: lastCompletions, addresses: lastAddresses } = JSON.parse(lastCounts);

        // Skip check if cloud sync is currently active to avoid false positives
        if (cloudSync.isSyncing) {
          logger.info('Skipping data integrity check - cloud sync in progress');
          return;
        }

        // Be more tolerant if sync happened recently (within last 2 minutes)
        const recentSyncThreshold = 2 * 60 * 1000; // 2 minutes
        const timeSinceLastSync = cloudSync.lastSyncTime ? Date.now() - cloudSync.lastSyncTime.getTime() : Infinity;
        const isRecentSync = timeSinceLastSync < recentSyncThreshold;

        // Use more relaxed thresholds during/after sync operations
        const completionThreshold = isRecentSync ? 50 : 10; // Be more tolerant after recent sync
        const addressThreshold = isRecentSync ? 200 : 50;   // Be more tolerant after recent sync

        // Warn if we've lost significant data (but not during legitimate sync operations)
        if (completionsCount < lastCompletions - completionThreshold) {
          logger.error(`POTENTIAL DATA LOSS DETECTED: Completions dropped from ${lastCompletions} to ${completionsCount}`);

          // Only show alert if this wasn't due to recent sync activity
          if (!isRecentSync) {
            alert({
              title: "⚠️ POTENTIAL DATA LOSS",
              message: `Completions count dropped significantly (${lastCompletions} → ${completionsCount}). Check cloud backups immediately!`,
              type: "error"
            });
          } else {
            logger.warn(`Large completion count change during recent sync (${lastCompletions} → ${completionsCount}) - monitoring`);
          }
        }

        if (addressesCount < lastAddresses - addressThreshold) {
          logger.error(`POTENTIAL DATA LOSS DETECTED: Addresses dropped from ${lastAddresses} to ${addressesCount}`);

          // Only show alert if this wasn't due to recent sync activity
          if (!isRecentSync) {
            alert({
              title: "⚠️ POTENTIAL DATA LOSS",
              message: `Address count dropped significantly (${lastAddresses} → ${addressesCount}). Check cloud backups immediately!`,
              type: "error"
            });
          } else {
            logger.warn(`Large address count change during recent sync (${lastAddresses} → ${addressesCount}) - monitoring`);
          }
        }
      }

      // Update stored counts
      localStorage.setItem('navigator_data_counts', JSON.stringify({
        completions: completionsCount,
        addresses: addressesCount,
        timestamp: new Date().toISOString()
      }));
    };

    // Check integrity every 30 seconds
    const integrityInterval = setInterval(checkDataIntegrity, 30 * 1000);

    // Run initial check
    setTimeout(checkDataIntegrity, 3000);

    return () => clearInterval(integrityInterval);
  }, [safeState, cloudSync.user, cloudSync.isSyncing, cloudSync.lastSyncTime, hydrated, loading]);

  // Calculate application statistics
  const stats = useStats(addresses, completions, arrangements, state.currentListVersion);

  // Handlers
  const handleImportExcel = React.useCallback((rows: AddressRow[]) => {
    logger.info(`Importing ${rows.length} addresses...`);
    setAddresses(rows, true); // Preserve completions
  }, [setAddresses]);

  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string, numberOfCases?: number, enforcementFees?: number[]) => {
      try {
        await complete(index, outcome, amount, arrangementId, caseReference, numberOfCases, enforcementFees);

        // Local storage backup only (no cloud backup needed with delta sync)
        try {
          const snap = backupState();
          LocalBackupManager.storeLocalBackup(snap);
          logger.info("Local storage backup after completion successful");
        } catch (backupError) {
          logger.error("Local backup failed after completion:", backupError);
          // Don't throw - completion should still succeed even if backup fails
        }
      } catch (error) {
        logger.error("Failed to complete address:", error);
      }
    },
    [complete, backupState]
  );

  // REMOVED: Auto day start functionality to prevent random day starts
  // Users can manually start/edit day times as needed


  // Restore the missing edit functions for day sessions
  const handleEditStart = React.useCallback(
    (newStartISO: string | Date) => {
      const parsed = typeof newStartISO === "string" ? new Date(newStartISO) : newStartISO;
      if (Number.isNaN(parsed.getTime())) {
        logger.error('Invalid start date:', newStartISO);
        return;
      }
      const newISO = parsed.toISOString();
      const dayKey = newISO.slice(0, 10);

      // Find existing session to preserve end time if it exists
      const existingSession = state.daySessions.find((d) => d.date === dayKey);

      const updates: Partial<DaySession> = { start: newISO };

      // If end time would be before new start time, clear it
      if (existingSession?.end) {
        const start = new Date(newISO).getTime();
        const end = new Date(existingSession.end).getTime();
        if (end < start) {
          updates.end = undefined;
          updates.durationSeconds = undefined;
        }
      }

      // updateSession will create the session if it doesn't exist (createIfMissing=true)
      updateSession(dayKey, updates, true);
    },
    [state.daySessions, updateSession]
  );

  const handleEditEnd = React.useCallback(
    (newEndISO: string | Date) => {
      const parsed = typeof newEndISO === "string" ? new Date(newEndISO) : newEndISO;
      if (Number.isNaN(parsed.getTime())) {
        logger.error('Invalid end date:', newEndISO);
        return;
      }

      const endISO = parsed.toISOString();
      const dayKey = endISO.slice(0, 10);

      // Find existing session to determine if we need start time
      const existingSession = state.daySessions.find((d) => d.date === dayKey);

      const updates: Partial<DaySession> = { end: endISO };

      // If no start time exists and end is before it, adjust start time
      if (existingSession?.start) {
        const startTime = new Date(existingSession.start).getTime();
        const endTime = new Date(endISO).getTime();

        if (endTime < startTime) {
          // Set start time to same as end time
          updates.start = endISO;
          updates.durationSeconds = 0;
        }
      } else if (!existingSession) {
        // If creating new session, set start = end
        updates.start = endISO;
        updates.durationSeconds = 0;
      }

      // updateSession will create the session if it doesn't exist (createIfMissing=true)
      updateSession(dayKey, updates, true);
    },
    [state.daySessions, updateSession]
  );


  const onRestore: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await readJsonFile(file);
      // ARCHITECTURAL FIX: File restore also preserves current session state
      const backupData = normalizeBackupData(raw);
      const currentSessions = safeState.daySessions; // Preserve current session state

      const data = {
        ...backupData,
        daySessions: currentSessions // Keep current sessions, don't restore from backup
      };

      restoreState(data);

      // 🔧 CRITICAL FIX: Wait for restore protection window before syncing
      setTimeout(async () => {
        await cloudSync.syncData(data);
        lastFromCloudRef.current = JSON.stringify(data);
      }, 61000); // Wait 61 seconds (after 60s protection window expires)

      // ARCHITECTURAL FIX: Post-restore session reconciliation
      await reconcileSessionState(cloudSync, setState, supabase);

      setHydrated(true);
      await alert({
        title: "Success",
        message: "Restore completed successfully!",
        type: "success"
      });
    } catch (err: any) {
      logger.error('Restore failed:', err);
      await alert({
        title: "Error",
        message: "Restore failed: " + (err?.message || err),
        type: "error"
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleChangeOutcome = React.useCallback(
    async (
      targetCompletionIndex: number,
      outcome: Outcome,
      amount?: string,
      arrangementId?: string,
      caseReference?: string,
      numberOfCases?: number,
      enforcementFees?: number[]
    ) => {
      // 🔥 DELTA SYNC: Use updateCompletion to submit COMPLETION_UPDATE operation
      const updates: Partial<Completion> = { outcome };

      if (amount !== undefined) updates.amount = amount;
      if (arrangementId !== undefined) updates.arrangementId = arrangementId;
      if (caseReference !== undefined) updates.caseReference = caseReference;
      if (numberOfCases !== undefined) updates.numberOfCases = numberOfCases;
      if (enforcementFees !== undefined) updates.enforcementFees = enforcementFees;

      updateCompletion(targetCompletionIndex, updates);

      // FIXED: Reduced backup - only local storage (delta sync handles cloud persistence)
      try {
        // Small delay to ensure state has updated
        await new Promise(resolve => setTimeout(resolve, 100));
        const snap = backupState();

        // Local storage backup only (no cloud backup needed with delta sync)
        LocalBackupManager.storeLocalBackup(snap);
        logger.info("Local storage backup after outcome change successful");
      } catch (backupError) {
        logger.error("Local backup failed after outcome change:", backupError);
      }
    },
    [updateCompletion, backupState]
  );

  const handleManualSync = React.useCallback(async () => {
    try {
      logger.sync("Manual sync initiated...");
      const stateStr = JSON.stringify(safeState);

      // 🔧 CRITICAL FIX: Check if restore is in progress before manual sync
      if (isProtectionActive('navigator_restore_in_progress')) {
        logger.sync('🛡️ RESTORE PROTECTION: Manual sync blocked to prevent data loss');
        await alert({
          title: "Restore in Progress",
          message: "Please wait 30 seconds before manual sync to prevent data loss"
        });
        return;
      }

      // CRITICAL FIX: Update lastFromCloudRef BEFORE syncing to prevent race condition
      lastFromCloudRef.current = stateStr;

      await cloudSync.syncData(safeState);

      logger.sync("Manual sync completed successfully");
    } catch (err) {
      logger.error("Manual sync failed:", err);

      // CRITICAL FIX: On failure, reset lastFromCloudRef to allow retry
      lastFromCloudRef.current = '';
    }
  }, [cloudSync, safeState]);

  // Supabase setup handlers
  const handleSupabaseSetup = (url: string, key: string) => {
    // Store credentials locally
    localStorage.setItem('navigator_supabase_url', url);
    localStorage.setItem('navigator_supabase_key', key);

    // Reload page to reinitialize with new credentials
    window.location.reload();
  };

  const handleSkipSupabaseSetup = () => {
    localStorage.setItem('navigator_supabase_skipped', 'true');
    setShowSupabaseSetup(false);
  };

  // Check if user should see Supabase setup
  React.useEffect(() => {
    if (!cloudSync.user || loading) return;

    const hasSupabase = !!supabase;
    const hasSkipped = localStorage.getItem('navigator_supabase_skipped');

    // Show setup if no Supabase configured and hasn't been skipped
    if (!hasSupabase && !hasSkipped) {
      setShowSupabaseSetup(true);
    }
  }, [cloudSync.user, loading]);

  // Enhanced periodic backup with local storage
  React.useEffect(() => {
    if (!hydrated) return;

    let lastBackupState = JSON.stringify(safeState);

    const periodicBackup = async () => {
      const currentState = JSON.stringify(safeState);

      // Only backup if state has changed and we have meaningful data
      if (currentState !== lastBackupState &&
          (safeState.completions.length > 0 || safeState.addresses.length > 0)) {
        try {
          logger.info("Performing periodic local backup...");

          // Store local backup (no cloud backup needed with delta sync)
          LocalBackupManager.storeLocalBackup(safeState);

          lastBackupState = currentState;
          logger.info("Periodic local backup successful");
        } catch (error) {
          logger.error("Periodic local backup failed:", error);
        }
      }
    };

    // 🔧 OPTIMIZATION: Run backup every 3 hours (was 1h) to reduce egress while maintaining safety
    const interval = setInterval(periodicBackup, 3 * 60 * 60 * 1000);

    // Cleanup old backups weekly
    const cleanupInterval = setInterval(() => {
      LocalBackupManager.cleanupOldBackups();
    }, 7 * 24 * 60 * 60 * 1000); // 7 days

    // Run immediate backup if we have data but no recent local backup
    const stats = LocalBackupManager.getBackupStats();
    if (stats.count === 0 || (safeState.completions.length > 0 && stats.count < 3)) {
      setTimeout(async () => {
        await periodicBackup();
      }, 5000); // After 5 seconds to allow app to stabilize
    }

    return () => {
      clearInterval(interval);
      clearInterval(cleanupInterval);
    };
  }, [safeState, cloudSync.user, hydrated]);

  if (loading) {
    return (
      <div className="app-wrapper">
        <div className="main-area">
          <div className="content-area">
            <div className="loading">
              <div className="spinner" />
              Preparing your workspace...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      {/* Supabase Setup Modal */}
      <SupabaseSetup
        isOpen={showSupabaseSetup}
        onSetupComplete={handleSupabaseSetup}
        onSkip={handleSkipSupabaseSetup}
      />

      {/* Backup Manager Modal */}
      <BackupManager
        isOpen={showBackupManager}
        onClose={() => setShowBackupManager(false)}
        currentData={safeState}
        onRestore={(data) => {
          // ARCHITECTURAL FIX: BackupManager restore also preserves current session state
          const backupData = normalizeBackupData(data);
          const currentSessions = safeState.daySessions; // Preserve current session state

          const mergedData = {
            ...backupData,
            daySessions: currentSessions // Keep current sessions, don't restore from backup
          };

          restoreState(mergedData);
          if (cloudSync.user && supabase) {
            // 🔧 CRITICAL FIX: Wait for restore protection window before syncing
            setTimeout(async () => {
              await cloudSync.syncData(mergedData);
            }, 31000); // Wait 31 seconds (after protection window expires)

            // ARCHITECTURAL FIX: Post-restore session reconciliation
            reconcileSessionState(cloudSync, setState, supabase);
          }
        }}
      />

      {/* Admin Dashboard Modal */}
      {showAdmin && isAdmin && (
        <AdminDashboard
          user={cloudSync.user!}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {/* Subscription Modal */}
      {showSubscription && (
        <SubscriptionManager
          user={cloudSync.user!}
          onClose={() => setShowSubscription(false)}
        />
      )}

      {/* Main Content Area (Left Side) */}
      <main className="main-area">
        {/* 🔧 CRITICAL FIX: Offline/Offline Mode Banners */}
        {!cloudSync.isOnline && (
          <div style={{
            background: 'linear-gradient(135deg, #FFA500, #FF8C00)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(255, 140, 0, 0.3)',
            zIndex: 100
          }}>
            <span>📡</span>
            <span>Working Offline - Changes will sync when connection returns</span>
          </div>
        )}

        {/* 🔧 OFFLINE MODE: Show warning if using pseudo-session */}
        {localStorage.getItem('navigator_offline_mode') === 'true' && (
          <div style={{
            background: 'linear-gradient(135deg, #9C27B0, #7B1FA2)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(156, 39, 176, 0.3)',
            zIndex: 100
          }}>
            <span>⚡</span>
            <span>Offline Mode - Sign in when online to sync data</span>
          </div>
        )}

        {/* Modern Header */}
        <header className="app-header-modern">
          <div className="header-left">
            <div className="logo-section">
              <div className="logo-icon">📍</div>
              <div className="logo-text">
                <div className="logo-title">Navigator</div>
                <div className="logo-subtitle">Enforcement Pro</div>
              </div>
            </div>
            
            {tab === "list" && (
              <div className="search-container-modern">
                <span className="search-icon">🔍</span>
                <input
                  id="search-addresses"
                  name="searchAddresses"
                  type="search"
                  className="search-input-modern"
                  placeholder="Search addresses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="header-center">
            <EnhancedOfflineIndicator
              isOnline={cloudSync.isOnline}
              isSyncing={cloudSync.isSyncing}
              lastSyncTime={cloudSync.lastSyncTime}
              onForceSync={cloudSync.forceFullSync}
            />
            <SettingsDropdown
              reminderSettings={state.reminderSettings}
              onUpdateReminderSettings={updateReminderSettings}
              bonusSettings={state.bonusSettings}
              onUpdateBonusSettings={updateBonusSettings}
              onChangePassword={() => setShowChangePassword(true)}
              onChangeEmail={() => setShowChangeEmail(true)}
              onDeleteAccount={() => setShowDeleteAccount(true)}
              onResolveDataOwnership={() => {
                setShowOwnershipPrompt(true);
              }}
              hasOwnershipIssue={localStorage.getItem('navigator_ownership_uncertain') === 'true'}
              appState={state}
              userEmail={cloudSync.user?.email}
              onImportExcel={async (file) => {
                // Process Excel file inline using same logic as ImportExcel component
                try {
                  const XLSX = await import('xlsx');
                  const data = await file.arrayBuffer();
                  const wb = XLSX.read(data, { type: "array" });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                  if (!rows.length) {
                    alert({ message: "📄 File appears to be empty. Please check your Excel file." });
                    return;
                  }

                  const header = (rows[0] || []).map((x) => String(x ?? "").trim().toLowerCase());
                  let addrIdx = header.findIndex((h) => h.includes("address"));
                  if (addrIdx === -1) addrIdx = 0;

                  const latRaw = header.findIndex((h) => h === "lat" || h.includes("latitude"));
                  const lngRaw = header.findIndex((h) => h === "lng" || h === "lon" || h.includes("longitude"));
                  const latCol: number | undefined = latRaw === -1 ? undefined : latRaw;
                  const lngCol: number | undefined = lngRaw === -1 ? undefined : lngRaw;

                  const out: AddressRow[] = [];
                  for (let r = 1; r < rows.length; r++) {
                    const row = rows[r] || [];
                    const address = String(row[addrIdx] ?? "").trim();
                    if (!address) continue;

                    const lat = latCol !== undefined && row[latCol] != null && row[latCol] !== "" ? Number(row[latCol]) : undefined;
                    const lng = lngCol !== undefined && row[lngCol] != null && row[lngCol] !== "" ? Number(row[lngCol]) : undefined;

                    out.push({ address, lat, lng });
                  }

                  if (out.length === 0) {
                    alert({ message: "🚫 No valid addresses found in the file. Please check the format." });
                    return;
                  }

                  handleImportExcel(out);
                  logger.info(`✅ Successfully imported ${out.length} addresses!`);
                } catch (err) {
                  logger.error('Excel import failed:', err);
                  alert({ message: "❌ Failed to read Excel file. Please ensure it's a valid .xlsx or .xls file." });
                }
              }}
              onRestoreBackup={onRestore}
              onManualSync={handleManualSync}
              isSyncing={cloudSync.isSyncing}
              onShowBackupManager={() => setShowBackupManager(true)}
              onShowCloudBackups={async () => {
                setCloudMenuOpen(true);
                await loadRecentCloudBackups();
              }}
              onShowSubscription={() => setShowSubscription(true)}
              onShowSupabaseSetup={() => setShowSupabaseSetup(true)}
              onSignOut={cloudSync.signOut}
              hasSupabase={!!supabase}
            />
          </div>

          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
        </header>

        {/* Content Area */}
        <div className="content-area">
          {tab === "list" && (
            <>
              {/* Original Day Panel with Full Editing */}
              <DayPanel
                sessions={daySessions}
                completions={completions}
                startDay={startDay}
                endDay={endDay}
                onEditStart={handleEditStart}
                onEditEnd={handleEditEnd}
                onBackup={async () => {
                  const snap = backupState();

                  // CRITICAL FIX: Add timeouts to prevent indefinite hangs
                  const timeoutPromise = (ms: number) => new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Backup timeout')), ms)
                  );

                  try {
                    // Local backup with 15 second timeout (no cloud backup needed with delta sync)
                    await Promise.race([
                      LocalBackupManager.performCriticalBackup(snap, "day-end"),
                      timeoutPromise(15000)
                    ]);
                    logger.info("Local backup at day end successful");
                  } catch (error) {
                    logger.error("Local backup failed or timed out:", error);
                    // Re-throw to trigger error handling in useBackupLoading
                    throw error;
                  }
                }}
              />

              {/* Stats Grid */}
              <div className="stats-grid">
                <StatsCard
                  title="Pending Addresses"
                  value={stats.pending}
                  change={`${stats.completed} completed today`}
                  changeType="positive"
                  icon="📍"
                  iconType="info"
                />
                <StatsCard
                  title="Today's Earnings"
                  value={`£${stats.todaysPIF.toFixed(0)}`}
                  change={`${stats.pifCount} PIF today`}
                  changeType="positive"
                  icon="💰"
                  iconType="success"
                />
                <StatsCard
                  title="Arrangements Due"
                  value={stats.pendingArrangements}
                  change="Check arrangements tab"
                  changeType="neutral"
                  icon="📅"
                  iconType="warning"
                />
                <StatsCard
                  title="Completion Rate"
                  value={`${Math.round((stats.completed / Math.max(stats.total, 1)) * 100)}%`}
                  change="Good performance"
                  changeType="positive"
                  icon="📊"
                  iconType="success"
                />
              </div>

              {/* Address List */}
              <AddressList
                state={safeState}
                setActive={setActive}
                cancelActive={cancelActive}
                onComplete={handleComplete}
                onAddArrangement={addArrangement}
                filterText={search}
              />

              {/* Bottom Stats */}
              <div style={{
                display: "flex",
                gap: "0.5rem",
                margin: "1.25rem 0 3rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => undo(-1)}
                  title="Undo last completion"
                >
                  ↶ Undo Last
                </button>
                <span className="pill pill-pif">PIF {stats.pifCount}</span>
                <span className="pill pill-done">Done {stats.doneCount}</span>
                <span className="pill pill-da">DA {stats.daCount}</span>
                <span className="pill pill-active">ARR {stats.arrCount}</span>
              </div>
            </>
          )}

          {tab === "completed" && (
            <Completed
              state={safeState}
              onChangeOutcome={handleChangeOutcome}
              onAddArrangement={addArrangement}
              onComplete={handleComplete}
            />
          )}

          {tab === "arrangements" && (
            <Arrangements
              state={safeState}
              onAddArrangement={addArrangement}
              onUpdateArrangement={updateArrangement}
              onDeleteArrangement={deleteArrangement}
              onAddAddress={async (addr: AddressRow) => addAddress(addr)}
              onComplete={handleComplete}
              autoCreateForAddress={autoCreateArrangementFor}
              onAutoCreateHandled={() => setAutoCreateArrangementFor(null)}
            />
          )}

          {tab === "earnings" && (
            <EarningsCalendar state={safeState} user={cloudSync.user} />
          )}

          {tab === "planning" && (
            <RoutePlanning 
              user={cloudSync.user}
              onAddressesReady={(newAddresses) => {
                setAddresses(newAddresses);
              }}
            />
          )}
        </div>

        {/* Floating Action Button */}
        <ManualAddressFAB onAdd={addAddress} />
      </main>

      {/* Right Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={cloudSync.user}
        isOwner={isOwner}
        hasAccess={hasAccess}
        isAdmin={isAdmin}
        currentTab={tab}
        onTabChange={navigateToTab}
        stats={{
          pending: stats.pending,
          completed: stats.completed,
          pendingArrangements: stats.pendingArrangements
        }}
        onShowAdmin={() => setShowAdmin(true)}
      />

      {/* Sidebar Overlay for Mobile */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Cloud Restore Menu */}
      {cloudMenuOpen && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2000,
            minWidth: 320,
            maxWidth: 500,
            maxHeight: "70vh",
            background: "white",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-2xl)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{
            padding: "1.5rem",
            borderBottom: "1px solid var(--gray-200)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <h3 style={{ margin: 0 }}>Cloud Backups (Last 7 Days)</h3>
            <button
              className="btn btn-ghost"
              style={{ padding: "0.5rem" }}
              onClick={() => setCloudMenuOpen(false)}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
            {cloudBusy && (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <div className="spinner" />
                <p>Loading backups...</p>
              </div>
            )}

            {!cloudBusy && cloudErr && (
              <div style={{ padding: "1rem", color: "var(--danger)" }}>
                {cloudErr}
              </div>
            )}

            {!cloudBusy && !cloudErr && cloudBackups.length === 0 && (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--gray-500)" }}>
                No backups found
              </div>
            )}

            {!cloudBusy && !cloudErr && cloudBackups.map((row) => {
              const parts = row.object_path.split("/");
              const fname = parts[parts.length - 1] || row.object_path;
              const day = row.day_key || "";
              const sizeText = row.size_bytes
                ? Math.round(row.size_bytes / 1024) + " KB"
                : "";

              return (
                <button
                  key={row.object_path}
                  className="btn btn-ghost"
                  style={{
                    width: "100%",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                    padding: "1rem"
                  }}
                  onClick={() => restoreFromCloud(row.object_path)}
                >
                  <span style={{ fontWeight: 500 }}>{fname}</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--gray-500)" }}>
                    {day} · {sizeText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cloudMenuOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 1999
          }}
          onClick={() => setCloudMenuOpen(false)}
        />
      )}

      {/* Enhanced error display */}
      {cloudSync.error && cloudSync.error !== 'Auth session missing!' && !cloudSync.isLoading && (
        <div
          style={{
            position: "fixed",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--danger-light)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-lg)",
            padding: "0.75rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            boxShadow: "var(--shadow-lg)",
            zIndex: 1000
          }}
        >
          <span style={{ color: "var(--danger)" }}>
            ⚠️ {cloudSync.error}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={cloudSync.clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Account Settings Modals */}
      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onUpdatePassword={async (newPassword) => {
          await cloudSync.updatePassword(newPassword);
        }}
      />

      <ChangeEmailModal
        open={showChangeEmail}
        onClose={() => setShowChangeEmail(false)}
      />

      <DeleteAccountModal
        open={showDeleteAccount}
        onClose={() => setShowDeleteAccount(false)}
        onConfirm={async () => {
          await cloudSync.signOut();
        }}
      />


      {/* Toast Notifications */}
      <ToastContainer />

      {/* Ownership Uncertainty Prompt - Modern Design */}
      <OwnershipPrompt
        isOpen={showOwnershipPrompt}
        onClose={() => setShowOwnershipPrompt(false)}
        safeState={safeState}
        user={cloudSync.user}
        onKeepData={async (state) => {
          await cloudSync.syncData(state);
          lastFromCloudRef.current = JSON.stringify(state);
        }}
        onDiscardData={() => {
          setState({
            addresses: [],
            completions: [],
            arrangements: [],
            daySessions: [],
            activeIndex: null,
            currentListVersion: 1
          });
        }}
      />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* GDPR Compliance: Privacy & Cookie Consent */}
      <PrivacyConsent />

      {/* Sync Diagnostic Tool (Mobile-Friendly) */}
      {cloudSync.user && (
        <SyncDiagnostic
          userId={cloudSync.user.id}
          currentState={safeState}
        />
      )}
    </div>
  );
}