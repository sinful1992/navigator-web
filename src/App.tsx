// src/App.tsx - Complete Modern Design with Right Sidebar
import * as React from "react";
import "./App.css"; // Use the updated modern CSS
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { normalizeState, normalizeBackupData } from "./utils/normalizeState";
import { SmartUserDetection } from "./utils/userDetection";
import { useCloudSync } from "./useCloudSync";
import { ModalProvider, useModalContext } from "./components/ModalProvider";
import { logger } from "./utils/logger";
import { Auth } from "./Auth";
import { AddressList } from "./AddressList";
import Completed from "./Completed";
import { DayPanel } from "./DayPanel";
import { Arrangements } from "./Arrangements";
import { readJsonFile } from "./backup";
import type { AddressRow, Outcome } from "./types";
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

type Tab = "list" | "completed" | "arrangements" | "earnings" | "planning";


// ARCHITECTURAL FIX: Post-restore session reconciliation
async function reconcileSessionState(cloudSync: any, setState: any, supabase: any) {
  if (!cloudSync.user || !supabase) return;

  // 🔧 CRITICAL FIX: Check if restore is in progress before reconciling
  const restoreInProgress = localStorage.getItem('navigator_restore_in_progress');
  if (restoreInProgress) {
    const restoreTime = parseInt(restoreInProgress);
    const timeSinceRestore = Date.now() - restoreTime;

    // If restore was within the last 10 minutes, skip reconciliation
    if (timeSinceRestore < 600000) {
      logger.info('🛡️ RESTORE PROTECTION: Skipping session reconciliation to prevent data loss', {
        timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
        restoreTime: new Date(restoreTime).toISOString()
      });
      return;
    } else {
      // Clear the flag after timeout
      logger.info('🛡️ RESTORE PROTECTION: Session reconciliation timeout reached, clearing flag');
      localStorage.removeItem('navigator_restore_in_progress');
    }
  }

  try {
    logger.info('Post-restore: Reconciling session state with cloud...');

    // Fetch latest state from cloud to get current session info
    const { data: cloudState, error } = await supabase
      .from("navigator_state")
      .select("data")
      .eq("user_id", cloudSync.user.id)
      .maybeSingle();

    if (error || !cloudState?.data) {
      logger.warn('No cloud state found for session reconciliation');
      return;
    }

    const normalized = normalizeState(cloudState.data);
    const cloudSessions = normalized.daySessions || [];

    // Update local state with cloud session data only
    setState((currentState: any) => ({
      ...currentState,
      daySessions: cloudSessions
    }));

    logger.info('Session state reconciled with cloud successfully');
  } catch (error) {
    logger.error('Failed to reconcile session state:', error);
    // Don't throw - this is a nice-to-have, not critical
  }
}
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

// Enhanced Upload JSON snapshot to Supabase Storage with retry mechanism
async function uploadBackupToStorage(
  data: unknown,
  label: "finish" | "manual" | "periodic" = "manual",
  retryCount = 0
) {
  if (!supabase) {
    logger.error("Supabase not configured for backup");
    throw new Error("Supabase not configured");
  }

  const authResp = await supabase.auth.getUser();
  const userId =
    authResp && authResp.data && authResp.data.user
      ? authResp.data.user.id
      : undefined;
  if (!userId) {
    logger.error("User not authenticated for backup");
    throw new Error("User not authenticated");
  }

  const tz = "Europe/London";
  const now = new Date();
  const yyyy = now.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  const mm = now.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
  const dd = now.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
  const dayKey = `${yyyy}-${mm}-${dd}`;
  const time = now
    .toLocaleTimeString("en-GB", { timeZone: tz, hour12: false })
    .replace(/:/g, "");

  const bucket = import.meta.env.VITE_SUPABASE_BUCKET || "navigator-backups";
  const name = `backup_${dayKey}_${time}_${label}_retry${retryCount}.json`;
  const objectPath = `${userId}/${dayKey}/${name}`;

  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    logger.info(`Uploading backup to ${objectPath}, size: ${blob.size} bytes`);

    const uploadRes = await supabase
      .storage
      .from(bucket)
      .upload(objectPath, blob, { upsert: true, contentType: "application/json" }); // Changed to upsert: true for reliability

    if (uploadRes.error) {
      logger.error("Backup upload failed:", uploadRes.error);
      throw new Error(uploadRes.error.message);
    }

    logger.info("Backup upload successful:", objectPath);

    // Record backup in database - non-critical, don't fail the backup if this fails
    try {
      await supabase.from("backups").insert({
        user_id: userId,
        day_key: dayKey,
        object_path: objectPath,
        size_bytes: blob.size,
      });
      logger.info("Backup database record created");
    } catch (dbError) {
      logger.warn("Backups table insert failed (non-critical):", dbError instanceof Error ? dbError.message : dbError);
    }

    return { objectPath, size: blob.size };

  } catch (error: any) {
    logger.error(`Backup attempt ${retryCount + 1} failed:`, error);

    // Retry up to 3 times with exponential backoff
    if (retryCount < 2) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      logger.info(`Retrying backup in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadBackupToStorage(data, label, retryCount + 1);
    }

    // All retries failed
    throw new Error(`Backup failed after ${retryCount + 1} attempts: ${error.message}`);
  }
}

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
  const cloudSync = useCloudSync();

  if (cloudSync.isLoading) {
    return (
      <div className="app-wrapper">
        <div className="main-area">
          <div className="content-area">
            <div className="loading">
              <div className="spinner" />
              Restoring session...
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
          onForceSignOut={async () => {
            await cloudSync.signOut();
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
  const {
    state,
    loading,
    setAddresses,
    addAddress,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
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
  } = useAppState();

  const cloudSync = useCloudSync();
  const { confirm, alert } = useModalContext();
  
  const { hasAccess } = useSubscription(cloudSync.user);
  const { isAdmin, isOwner } = useAdmin(cloudSync.user);
  const [showSubscription, setShowSubscription] = React.useState(false);
  const [showAdmin, setShowAdmin] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [showSupabaseSetup, setShowSupabaseSetup] = React.useState(false);
  const [showBackupManager, setShowBackupManager] = React.useState(false);

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] = 
    React.useState<number | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

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

  // Format date key
  function formatKey(d: Date, tz = "Europe/London") {
    const y = d.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
    const m = d.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
    const dd = d.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
    return `${y}-${m}-${dd}`;
  }

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

      const fromKey = formatKey(start);
      const toKey = formatKey(end);

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
        }, 31000); // Wait 31 seconds (after protection window expires)

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


  // Cloud sync initialization
  React.useEffect(() => {
    if (!cloudSync.user || loading) return;
    if (!supabase) {
      setHydrated(true);
      return;
    }

    let cancelled = false;
    let cleanup: undefined | (() => void);

    (async () => {
      try {
        const sel = await supabase
          .from("navigator_state")
          .select("data, updated_at, version")
          .eq("user_id", cloudSync.user!.id)
          .maybeSingle();

        const row = sel.data;

        if (row && row.data) {
          const normalized = normalizeState(row.data);
          if (!cancelled) {
            setState(normalized);
            lastFromCloudRef.current = JSON.stringify(normalized);
            setHydrated(true);
            logger.sync("Restored from cloud, version:", row?.version);
          }
        } else {
          const localHasData =
            addresses.length > 0 ||
            completions.length > 0 ||
            arrangements.length > 0 ||
            daySessions.length > 0;
            
          if (localHasData) {
            // SMART USER DETECTION: Cloud-based analysis instead of localStorage comparison
            logger.info("Analyzing data ownership for current user...");

            try {
              // Get cloud data to help with ownership analysis
              let cloudData: any = null;
              try {
                const { data: cloudStateData } = await supabase!
                  .from("navigator_state")
                  .select("data")
                  .eq("user_id", cloudSync.user!.id)
                  .maybeSingle();
                cloudData = cloudStateData?.data;
              } catch (cloudError) {
                logger.warn("Could not fetch cloud data for analysis:", cloudError);
              }

              // Analyze ownership using multiple signals
              const ownership = SmartUserDetection.analyzeDataOwnership(
                safeState,
                cloudSync.user!,
                cloudData
              );

              logger.info("Data ownership analysis:", ownership);

              switch (ownership.action) {
                case 'sync':
                  logger.sync("Syncing local data to cloud (ownership confirmed)");
                  await cloudSync.syncData(safeState);
                  SmartUserDetection.storeDeviceContext(cloudSync.user!);
                  if (!cancelled) {
                    lastFromCloudRef.current = JSON.stringify(safeState);
                    setHydrated(true);
                  }
                  break;

                case 'backup_and_clear':
                  logger.warn("Creating safety backup before clearing (different user detected)");

                  try {
                    const backupKey = `navigator_safety_backup_${Date.now()}_user_switch`;
                    const backupData = {
                      ...safeState,
                      _backup_timestamp: new Date().toISOString(),
                      _backup_reason: 'user_switch',
                      _ownership_analysis: ownership
                    };
                    localStorage.setItem(backupKey, JSON.stringify(backupData));
                    logger.info(`Safety backup created: ${backupKey}`);

                    setState({
                      addresses: [],
                      completions: [],
                      arrangements: [],
                      daySessions: [],
                      activeIndex: null,
                      currentListVersion: 1
                    });
                    SmartUserDetection.storeDeviceContext(cloudSync.user!);
                    if (!cancelled) setHydrated(true);
                  } catch (backupError) {
                    logger.error("Backup failed - preserving data for safety:", backupError);
                    await cloudSync.syncData(safeState);
                    SmartUserDetection.storeDeviceContext(cloudSync.user!);
                    if (!cancelled) {
                      lastFromCloudRef.current = JSON.stringify(safeState);
                      setHydrated(true);
                    }
                  }
                  break;

                case 'preserve_and_ask':
                default:
                  logger.info("Preserving local data (uncertain ownership) - user can decide later");
                  await cloudSync.syncData(safeState);
                  SmartUserDetection.storeDeviceContext(cloudSync.user!);
                  if (!cancelled) {
                    lastFromCloudRef.current = JSON.stringify(safeState);
                    setHydrated(true);
                  }
                  break;
              }
            } catch (analysisError) {
              logger.error("User detection analysis failed - preserving data for safety:", analysisError);
              await cloudSync.syncData(safeState);
              SmartUserDetection.storeDeviceContext(cloudSync.user!);
              if (!cancelled) {
                lastFromCloudRef.current = JSON.stringify(safeState);
                setHydrated(true);
              }
            }
          } else {
            // No local data - store device context for future use
            SmartUserDetection.storeDeviceContext(cloudSync.user!);
            if (!cancelled) setHydrated(true);
          }
        }

        cleanup = cloudSync.subscribeToData((updaterOrState) => {
          // CRITICAL FIX: Handle both React updater functions and direct state objects
          if (!updaterOrState) return;

          // 🔧 CRITICAL FIX: Check if restore is in progress before applying any cloud updates
          const restoreInProgress = localStorage.getItem('navigator_restore_in_progress');
          if (restoreInProgress) {
            const restoreTime = parseInt(restoreInProgress);
            const timeSinceRestore = Date.now() - restoreTime;

            // If restore was within the last 10 minutes, skip ALL cloud updates
            if (timeSinceRestore < 600000) {
              logger.sync('🛡️ RESTORE PROTECTION: App.tsx subscription skipping cloud state update to prevent data loss', {
                timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
                restoreTime: new Date(restoreTime).toISOString()
              });
              return;
            } else {
              // Clear the flag after timeout
              logger.sync('🛡️ RESTORE PROTECTION: App.tsx subscription timeout reached, clearing flag');
              localStorage.removeItem('navigator_restore_in_progress');
            }
          }

          if (typeof updaterOrState === 'function') {
            // This is a React state updater function - call setState directly
            logger.sync("Received cloud update (React updater)");
            setState(prevState => {
              const newState = updaterOrState(prevState);
              const normalized = normalizeState(newState);
              const normalizedStr = JSON.stringify(normalized);

              // Update tracking reference (safe to do in updater)
              lastFromCloudRef.current = normalizedStr;

              return normalized;
            });

            // CRITICAL FIX: Move side effects outside setState updater to prevent React warnings
            setHydrated(true);
          } else {
            // This is direct state data - handle normally
            const fromCloudStr = JSON.stringify(updaterOrState);
            if (fromCloudStr === lastFromCloudRef.current) return;

            const normalized = normalizeState(updaterOrState);
            logger.sync("Received cloud update (direct state)");
            setState(normalized);
            lastFromCloudRef.current = fromCloudStr;
            setHydrated(true);
          }
        });
      } catch (err) {
        logger.error("Bootstrap sync failed:", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [cloudSync.user, loading]);

  // REMOVED: Visibility change handler - was over-engineering after fixing React subscription bug

  // Debounced local to cloud sync (simplified - no visibility blocking)
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;
    const currentStr = JSON.stringify(safeState);
    if (currentStr === lastFromCloudRef.current) return;

    const t = setTimeout(async () => {
      try {
        // 🔧 CRITICAL FIX: Check if restore is in progress before syncing
        const restoreInProgress = localStorage.getItem('navigator_restore_in_progress');
        if (restoreInProgress) {
          const restoreTime = parseInt(restoreInProgress);
          const timeSinceRestore = Date.now() - restoreTime;

          // If restore was within the last 10 minutes, skip sync to prevent override
          if (timeSinceRestore < 600000) {
            logger.sync('🛡️ RESTORE PROTECTION: Debounced sync skipping to prevent data loss', {
              timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
              restoreTime: new Date(restoreTime).toISOString()
            });
            return;
          } else {
            // Clear the flag after timeout
            logger.sync('🛡️ RESTORE PROTECTION: Debounced sync timeout reached, clearing flag');
            localStorage.removeItem('navigator_restore_in_progress');
          }
        }

        logger.sync("Syncing changes to cloud...");

        // CRITICAL FIX: Update lastFromCloudRef BEFORE syncing to prevent race condition
        // This prevents subscribeToData from overwriting our local changes
        lastFromCloudRef.current = currentStr;

        await cloudSync.syncData(safeState);

        // Success - lastFromCloudRef is already set above
        logger.sync("Sync completed successfully");
      } catch (err) {
        logger.error("Sync failed:", err);

        // CRITICAL FIX: On failure, don't update lastFromCloudRef so we can retry
        // Reset it to trigger retry on next state change
        lastFromCloudRef.current = '';
      }
    }, 150);

    return () => clearTimeout(t);
  }, [safeState, cloudSync, hydrated, loading]);

  // CRITICAL FIX: Periodic backup to prevent data loss (every 5 minutes when data changes)
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;

    let lastBackupState = JSON.stringify(safeState);

    const periodicBackup = async () => {
      const currentState = JSON.stringify(safeState);

      // Only backup if state has changed and we have meaningful data
      if (currentState !== lastBackupState &&
          (safeState.completions.length > 0 || safeState.addresses.length > 0)) {
        try {
          logger.info("Performing periodic safety backup...");
          await uploadBackupToStorage(safeState, "manual");
          lastBackupState = currentState;
          logger.info("Periodic backup successful");
        } catch (error) {
          logger.error("Periodic backup failed:", error);
        }
      }
    };

    // Run backup every 1 hour
    const interval = setInterval(periodicBackup, 60 * 60 * 1000);

    // Run immediate backup if we have data but no recent backup
    const lastBackup = localStorage.getItem('last_backup_time');
    const now = Date.now();
    if (!lastBackup || (now - parseInt(lastBackup)) > 60 * 60 * 1000) { // 1 hour
      setTimeout(async () => {
        await periodicBackup();
        localStorage.setItem('last_backup_time', now.toString());
      }, 5000); // After 5 seconds to allow app to stabilize
    }

    return () => clearInterval(interval);
  }, [safeState, cloudSync.user, hydrated, loading]);

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

  // Stats calculation
  const stats = React.useMemo(() => {
    const currentVer = state.currentListVersion;
    const completedIdx = new Set(
      completions
        .filter((c) => c.listVersion === currentVer)
        .map((c) => c.index)
    );
    const total = addresses.length;
    const pending = total - completedIdx.size;
    const pifCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "PIF"
    ).length;
    const doneCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "Done"
    ).length;
    const daCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "DA"
    ).length;
    const arrCount = completions.filter(
      (c) => c.listVersion === currentVer && c.outcome === "ARR"
    ).length;
    const completed = completedIdx.size;
    
    const pendingArrangements = arrangements.filter(arr => 
      arr.status !== "Completed" && arr.status !== "Cancelled"
    ).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaysPIF = completions
      .filter((c) => 
        c.outcome === "PIF" && 
        (c.timestamp || "").slice(0, 10) === todayStr
      )
      .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
    
    return { 
      total, pending, completed, pifCount, doneCount, 
      daCount, arrCount, pendingArrangements, todaysPIF 
    };
  }, [addresses, completions, arrangements, state.currentListVersion]);

  // Handlers
  const handleImportExcel = React.useCallback((rows: AddressRow[]) => {
    logger.info(`Importing ${rows.length} addresses...`);
    setAddresses(rows, true); // Preserve completions
  }, [setAddresses]);

  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => {
      try {
        await complete(index, outcome, amount, arrangementId);

        // FIXED: Reduced backup - only cloud backup + local storage (no file downloads)
        try {
          const snap = backupState();

          // Cloud backup if available
          if (supabase) {
            await uploadBackupToStorage(snap, "manual");
            logger.info("Cloud backup after completion successful");
          }

          // Local storage backup only (no file download to prevent data loss)
          LocalBackupManager.storeLocalBackup(snap);
          logger.info("Local storage backup after completion successful");
        } catch (backupError) {
          logger.error("Backup failed after completion:", backupError);
          // Don't throw - completion should still succeed even if backup fails
        }
      } catch (error) {
        logger.error("Failed to complete address:", error);
      }
    },
    [complete, backupState]
  );

  const ensureDayStarted = React.useCallback(() => {
    // CRITICAL FIX: Add safety guard to prevent aggressive auto-start after cloud operations
    if (cloudSync.isSyncing) {
      logger.info('Skipping auto day start - sync in progress');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) {
      logger.info('Auto-starting day session for today');
      startDay();
    }
  }, [daySessions, startDay, cloudSync.isSyncing]);


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
      
      setBaseState((s) => {
        const arr = s.daySessions.slice();
        let sessionIndex = arr.findIndex((d) => d.date === dayKey);
        let targetSession: any;

        if (sessionIndex >= 0) {
          targetSession = { ...arr[sessionIndex], start: newISO };
        } else {
          targetSession = { date: dayKey, start: newISO };
        }

        if (targetSession.end) {
          try {
            const start = new Date(newISO).getTime();
            const end = new Date(targetSession.end).getTime();
            if (end >= start) {
              targetSession.durationSeconds = Math.floor((end - start) / 1000);
            } else {
              delete targetSession.end;
              delete targetSession.durationSeconds;
            }
          } catch (error) {
            logger.error('Error calculating duration:', error);
          }
        }

        const now = new Date().toISOString();
        targetSession.updatedAt = now;
        targetSession.updatedBy = deviceId;

        const operationId = `edit_start_${dayKey}_${Date.now()}`;
        const forServer = {
          ...targetSession,
          id: dayKey,
          updatedAt: now,
          updatedBy: deviceId,
        };

        enqueueOp("session", sessionIndex >= 0 ? "update" : "create", forServer, operationId);

        if (sessionIndex >= 0) {
          arr[sessionIndex] = targetSession;
        } else {
          arr.push(targetSession);
        }

        return { ...s, daySessions: arr };
      });
    },
    [setBaseState, deviceId, enqueueOp]
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

      setBaseState((s) => {
        const arr = s.daySessions.slice();
        let sessionIndex = arr.findIndex((d) => d.date === dayKey);
        let targetSession: any;

        if (sessionIndex >= 0) {
          targetSession = { ...arr[sessionIndex] };
        } else {
          targetSession = { date: dayKey, start: endISO };
        }

        targetSession.end = endISO;

        if (targetSession.start) {
          try {
            const startTime = new Date(targetSession.start).getTime();
            const endTime = new Date(endISO).getTime();
            
            if (endTime >= startTime) {
              targetSession.durationSeconds = Math.floor((endTime - startTime) / 1000);
            } else {
              targetSession.start = endISO;
              targetSession.durationSeconds = 0;
            }
          } catch (error) {
            logger.error('Error calculating duration:', error);
            targetSession.durationSeconds = 0;
          }
        }

        const now = new Date().toISOString();
        targetSession.updatedAt = now;
        targetSession.updatedBy = deviceId;

        const operationId = `edit_end_${dayKey}_${Date.now()}`;
        const forServer = {
          ...targetSession,
          id: dayKey,
          updatedAt: now,
          updatedBy: deviceId,
        };

        enqueueOp("session", sessionIndex >= 0 ? "update" : "create", forServer, operationId);

        if (sessionIndex >= 0) {
          arr[sessionIndex] = targetSession;
        } else {
          arr.push(targetSession);
        }

        return { ...s, daySessions: arr };
      });
    },
    [setBaseState, deviceId, enqueueOp]
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
      }, 31000); // Wait 31 seconds (after protection window expires)

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
    async (targetCompletionIndex: number, outcome: Outcome, amount?: string) => {
      setState((s) => {
        if (
          !Number.isInteger(targetCompletionIndex) ||
          targetCompletionIndex < 0 ||
          targetCompletionIndex >= s.completions.length
        ) {
          return s;
        }
        const comps = s.completions.slice();
        comps[targetCompletionIndex] = {
          ...comps[targetCompletionIndex],
          outcome,
          amount,
        };
        return { ...s, completions: comps };
      });

      // FIXED: Reduced backup - only cloud backup + local storage (no file downloads)
      try {
        // Small delay to ensure state has updated
        await new Promise(resolve => setTimeout(resolve, 100));
        const snap = backupState();

        // Cloud backup if available
        if (supabase) {
          await uploadBackupToStorage(snap, "manual");
          logger.info("Cloud backup after outcome change successful");
        }

        // Local storage backup only (no file download)
        LocalBackupManager.storeLocalBackup(snap);
        logger.info("Local storage backup after outcome change successful");
      } catch (backupError) {
        logger.error("Backup failed after outcome change:", backupError);
      }
    },
    [setState, backupState]
  );

  const handleManualSync = React.useCallback(async () => {
    try {
      logger.sync("Manual sync initiated...");
      const stateStr = JSON.stringify(safeState);

      // 🔧 CRITICAL FIX: Check if restore is in progress before manual sync
      const restoreInProgress = localStorage.getItem('navigator_restore_in_progress');
      if (restoreInProgress) {
        const restoreTime = parseInt(restoreInProgress);
        const timeSinceRestore = Date.now() - restoreTime;

        // If restore was within the last 10 minutes, warn and skip
        if (timeSinceRestore < 600000) {
          logger.sync('🛡️ RESTORE PROTECTION: Manual sync blocked to prevent data loss', {
            timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
            restoreTime: new Date(restoreTime).toISOString()
          });
          alert('Restore in progress - please wait 10 minutes before manual sync');
          return;
        } else {
          // Clear the flag after timeout
          localStorage.removeItem('navigator_restore_in_progress');
        }
      }

      // CRITICAL FIX: Update lastFromCloudRef BEFORE syncing to prevent race condition
      lastFromCloudRef.current = stateStr;

      await cloudSync.syncData(safeState);

      logger.sync("Manual sync completed successfully");

      // Also create a safety backup after manual sync
      try {
        await uploadBackupToStorage(safeState, "manual");
        logger.info("Safety backup after manual sync completed");
      } catch (backupErr) {
        logger.warn("Safety backup after sync failed:", backupErr);
      }
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
          logger.info("Performing periodic safety backup...");

          // Cloud backup if available
          if (cloudSync.user && supabase) {
            await uploadBackupToStorage(safeState, "periodic");
          }

          // Always store local backup
          LocalBackupManager.storeLocalBackup(safeState);

          lastBackupState = currentState;
          logger.info("Periodic backup successful");
        } catch (error) {
          logger.error("Periodic backup failed:", error);
        }
      }
    };

    // Run backup every 1 hour
    const interval = setInterval(periodicBackup, 60 * 60 * 1000);

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

  const getUserInitials = () => {
    const email = cloudSync.user?.email || "";
    const parts = email.split("@")[0].split(".");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getSyncStatus = () => {
    if (cloudSync.isSyncing) {
      return { text: "Syncing", color: "var(--warning)" };
    }
    if (!cloudSync.isOnline) {
      return { text: "Offline", color: "var(--danger)" };
    }
    if (cloudSync.error) {
      return { text: "Sync Error", color: "var(--danger)" };
    }
    return { text: "Online", color: "var(--success)" };
  };

  const syncStatus = getSyncStatus();

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
            <div className="sync-status">
              <div className="sync-indicator" style={{ background: syncStatus.color }} />
              <span>{syncStatus.text}</span>
              {cloudSync.lastSyncTime && (
                <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                  {cloudSync.lastSyncTime.toLocaleTimeString()}
                </span>
              )}
            </div>
            <SettingsDropdown
              reminderSettings={state.reminderSettings}
              onUpdateReminderSettings={updateReminderSettings}
            />
          </div>

          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
        </header>

        {/* Content Area */}
        <div className="content-area">
          {/* Tools Panel (collapsible) */}
          {toolsOpen && tab === "list" && (
            <div style={{
              background: "white",
              padding: "1rem",
              borderRadius: "var(--radius-lg)",
              marginBottom: "1.5rem",
              border: "1px solid var(--gray-200)",
              boxShadow: "var(--shadow-sm)"
            }}>
              <div className="btn-row">
                <ImportExcel onImported={handleImportExcel} />
                
                <input
                  type="file"
                  accept="application/json"
                  onChange={onRestore}
                  className="file-input"
                  id="restore-input"
                />
                <label htmlFor="restore-input" className="file-input-label">
                  📂 Restore (file)
                </label>

                <button
                  className="btn btn-ghost"
                  onClick={handleManualSync}
                  disabled={cloudSync.isSyncing}
                >
                  {cloudSync.isSyncing ? "⟳ Syncing..." : "🔄 Sync Now"}
                </button>
              </div>
            </div>
          )}

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
                    // Cloud backup with 30 second timeout
                    if (supabase) {
                      await Promise.race([
                        uploadBackupToStorage(snap, "finish"),
                        timeoutPromise(30000)
                      ]);
                      logger.info("Cloud backup at day end successful");
                    }

                    // Local backup with 15 second timeout
                    await Promise.race([
                      LocalBackupManager.performCriticalBackup(snap, "day-end"),
                      timeoutPromise(15000)
                    ]);
                    logger.info("Local backup at day end successful");
                  } catch (error) {
                    logger.error("Backup failed or timed out:", error);
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
                ensureDayStarted={ensureDayStarted}
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
            <Completed state={safeState} onChangeOutcome={handleChangeOutcome} />
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
                setAddresses(newAddresses, false);
              }}
            />
          )}
        </div>

        {/* Floating Action Button */}
        <ManualAddressFAB onAdd={addAddress} />
      </main>

      {/* Right Sidebar */}
      <aside className={`sidebar-right ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="user-profile-section">
            <div className="user-avatar">{getUserInitials()}</div>
            <div className="user-info">
              <div className="user-name">{cloudSync.user?.email?.split("@")[0]}</div>
              <div className="user-plan">
                {isOwner ? "Owner Access" : hasAccess ? "Premium Plan" : "Free Trial"}
              </div>
            </div>
          </div>
        </div>

        <nav className="nav-menu">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <div 
              className={`nav-item ${tab === 'list' ? 'active' : ''}`}
              onClick={() => { setTab('list'); setSidebarOpen(false); }}
            >
              <span className="nav-icon">📋</span>
              <span>Address List</span>
              <span className="nav-badge">{stats.pending}</span>
            </div>
            <div 
              className={`nav-item ${tab === 'completed' ? 'active' : ''}`}
              onClick={() => { setTab('completed'); setSidebarOpen(false); }}
            >
              <span className="nav-icon">✅</span>
              <span>Completed</span>
              <span className="nav-badge">{stats.completed}</span>
            </div>
            <div 
              className={`nav-item ${tab === 'arrangements' ? 'active' : ''}`}
              onClick={() => { setTab('arrangements'); setSidebarOpen(false); }}
            >
              <span className="nav-icon">📅</span>
              <span>Arrangements</span>
              <span className="nav-badge">{stats.pendingArrangements}</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Analytics</div>
            <div 
              className={`nav-item ${tab === 'earnings' ? 'active' : ''}`}
              onClick={() => { setTab('earnings'); setSidebarOpen(false); }}
            >
              <span className="nav-icon">💰</span>
              <span>Earnings</span>
            </div>
            <div 
              className={`nav-item ${tab === 'planning' ? 'active' : ''}`}
              onClick={() => { setTab('planning'); setSidebarOpen(false); }}
            >
              <span className="nav-icon">🗺️</span>
              <span>Route Planning</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Tools</div>
            <div className="nav-item" onClick={() => { setToolsOpen(!toolsOpen); setSidebarOpen(false); }}>
              <span className="nav-icon">🛠️</span>
              <span>Import/Export</span>
            </div>
            <div className="nav-item" onClick={() => { setShowBackupManager(true); setSidebarOpen(false); }}>
              <span className="nav-icon">💾</span>
              <span>Backup Manager</span>
            </div>
            {supabase && (
              <div className="nav-item" onClick={async () => {
                setCloudMenuOpen(true);
                await loadRecentCloudBackups();
                setSidebarOpen(false);
              }}>
                <span className="nav-icon">☁️</span>
                <span>Cloud Backups</span>
              </div>
            )}
            {!supabase && (
              <div className="nav-item" onClick={() => { setShowSupabaseSetup(true); setSidebarOpen(false); }}>
                <span className="nav-icon">🔗</span>
                <span>Connect Cloud Storage</span>
              </div>
            )}
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <div className="nav-item" onClick={() => { setShowSubscription(true); setSidebarOpen(false); }}>
              <span className="nav-icon">⭐</span>
              <span>Subscription</span>
            </div>
            {isAdmin && (
              <div className="nav-item" onClick={() => { setShowAdmin(true); setSidebarOpen(false); }}>
                <span className="nav-icon">👑</span>
                <span>Admin Panel</span>
              </div>
            )}
            <div className="nav-item" onClick={cloudSync.signOut}>
              <span className="nav-icon">🚪</span>
              <span>Sign Out</span>
            </div>
          </div>
        </nav>
      </aside>

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
      {cloudSync.error && (
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
    </div>
  );
}