// src/App.tsx - Complete Modern Design with Right Sidebar
import * as React from "react";
import "./App.css"; // Use the updated modern CSS
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
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

type Tab = "list" | "completed" | "arrangements" | "earnings" | "planning";

function normalizeState(raw: any) {
  const r = raw ?? {};
  return {
    ...r,
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions: Array.isArray(r.completions) ? r.completions : [],
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    daySessions: Array.isArray(r.daySessions) ? r.daySessions : [],
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
    currentListVersion:
      typeof r.currentListVersion === "number" ? r.currentListVersion : 1,
  };
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

// Upload JSON snapshot to Supabase Storage
async function uploadBackupToStorage(
  data: unknown,
  label: "finish" | "manual" = "manual"
) {
  if (!supabase) return;

  const authResp = await supabase.auth.getUser();
  const userId =
    authResp && authResp.data && authResp.data.user
      ? authResp.data.user.id
      : undefined;
  if (!userId) return;

  const tz = "Europe/London";
  const now = new Date();
  const yyyy = now.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  const mm = now.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
  const dd = now.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
  const dayKey = `${yyyy}-${mm}-${dd}`;
  const time = now
    .toLocaleTimeString("en-GB", { timeZone: tz, hour12: false })
    .replace(/:/g, "");

  const bucket =
    (import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_BUCKET
      ? (import.meta as any).env.VITE_SUPABASE_BUCKET
      : "navigator-backups";
  const name = `backup_${dayKey}_${time}_${label}.json`;
  const objectPath = `${userId}/${dayKey}/${name}`;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const uploadRes = await supabase
    .storage
    .from(bucket)
    .upload(objectPath, blob, { upsert: false, contentType: "application/json" });
  if ((uploadRes as any).error) throw new Error((uploadRes as any).error.message);

  try {
    await supabase.from("backups").insert({
      user_id: userId,
      day_key: dayKey,
      object_path: objectPath,
      size_bytes: blob.size,
    });
  } catch (e) {
    logger.warn("Backups table insert failed:", (e as any)?.message || e);
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
    updateReminderNotification,
  } = useAppState();

  const cloudSync = useCloudSync();
  const { confirm, alert } = useModalContext();
  
  const { hasAccess } = useSubscription(cloudSync.user);
  const { isAdmin, isOwner } = useAdmin(cloudSync.user);
  const [showSubscription, setShowSubscription] = React.useState(false);
  const [showAdmin, setShowAdmin] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] = 
    React.useState<number | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

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

      if ((q as any).error) throw (q as any).error;

      const data = ((q as any).data ?? []) as CloudBackupRow[];
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
        const bucket = (import.meta as any).env?.VITE_SUPABASE_BUCKET || "navigator-backups";
        const dl = await supabase.storage.from(bucket).download(objectPath);
        if ((dl as any).error) throw (dl as any).error;
        const blob: Blob = (dl as any).data as Blob;
        const text = await blob.text();
        const raw = JSON.parse(text);
        const data = normalizeState(raw);
        restoreState(data);
        await cloudSync.syncData(data);
        lastFromCloudRef.current = JSON.stringify(data);
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

        const row: any = (sel as any)?.data ?? null;

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
            logger.sync("Pushing local data to cloud...");
            await cloudSync.syncData(safeState);
            if (!cancelled) {
              lastFromCloudRef.current = JSON.stringify(safeState);
              setHydrated(true);
            }
          } else {
            if (!cancelled) setHydrated(true);
          }
        }

        cleanup = cloudSync.subscribeToData((newState) => {
          if (!newState) return;
          const fromCloudStr = JSON.stringify(newState);
          if (fromCloudStr === lastFromCloudRef.current) return;
          const normalized = normalizeState(newState);
          logger.sync("Received cloud update");
          setState(normalized);
          lastFromCloudRef.current = fromCloudStr;
          setHydrated(true);
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

  // Debounced local to cloud sync
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;
    const currentStr = JSON.stringify(safeState);
    if (currentStr === lastFromCloudRef.current) return;

    const t = setTimeout(async () => {
      try {
        logger.sync("Syncing changes to cloud...");
        await cloudSync.syncData(safeState);
        lastFromCloudRef.current = currentStr;
      } catch (err) {
        logger.error("Sync failed:", err);
      }
    }, 150);

    return () => clearTimeout(t);
  }, [safeState, cloudSync, hydrated, loading]);

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
      } catch (error) {
        logger.error("Failed to complete address:", error);
      }
    },
    [complete]
  );

  const ensureDayStarted = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
  }, [daySessions, startDay]);

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

  const endDayWithBackup = React.useCallback(() => {
    const snap = backupState();
    uploadBackupToStorage(snap, "finish").catch((e: any) => {
      logger.warn("Backup failed:", e?.message || e);
    });
    endDay();
  }, [backupState, endDay]);

  const onRestore: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await readJsonFile(file);
      const data = normalizeState(raw);
      restoreState(data);
      await cloudSync.syncData(data);
      lastFromCloudRef.current = JSON.stringify(data);
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
    (targetCompletionIndex: number, outcome: Outcome, amount?: string) => {
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
    },
    [setState]
  );

  const handleManualSync = React.useCallback(async () => {
    try {
      logger.sync("Manual sync initiated...");
      await cloudSync.syncData(safeState);
      lastFromCloudRef.current = JSON.stringify(safeState);
    } catch (err) {
      logger.error("Manual sync failed:", err);
    }
  }, [cloudSync, safeState]);

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
                endDay={endDayWithBackup}
                onEditStart={handleEditStart}
                onEditEnd={handleEditEnd}
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
              onUpdateReminderSettings={updateReminderSettings}
              onUpdateReminderNotification={updateReminderNotification}
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
            <div className="nav-item" onClick={async () => {
              setCloudMenuOpen(true);
              await loadRecentCloudBackups();
              setSidebarOpen(false);
            }}>
              <span className="nav-icon">☁️</span>
              <span>Cloud Backups</span>
            </div>
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