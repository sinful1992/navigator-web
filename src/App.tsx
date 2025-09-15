// src/App.tsx - Modern Layout with Preserved Functionality
import * as React from "react";
import "./App.css";
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";
import { useSwipeNavigation } from "./hooks/useSwipeNavigation";
import { ModalProvider, useModalContext } from "./components/ModalProvider";
import { logger } from "./utils/logger";
import { Auth } from "./Auth";
import { AddressList } from "./AddressList";
import Completed from "./Completed";
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

type Tab = "list" | "completed" | "arrangements" | "earnings" | "planning";

type StatsCardProps = {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: string;
  iconType: "success" | "warning" | "danger" | "info";
};

function StatsCard({ title, value, change, changeType = "neutral", icon, iconType }: StatsCardProps) {
  return (
    <div className="stat-card-modern">
      <div className="stat-header">
        <div className="stat-title">{title}</div>
        <div className={`stat-icon ${iconType}`}>{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {change && (
        <div className={`stat-change ${changeType}`}>
          {changeType === "positive" && <span>↑</span>}
          {changeType === "negative" && <span>↓</span>}
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}

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

/** Upload JSON snapshot to Supabase Storage and log in backups table */
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

function toISO(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  try {
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
    return dt.toISOString();
  } catch {
    return "";
  }
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London",
    });
  } catch {
    return "—";
  }
}

function isoToLocalTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

function isoToLocalDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

type ModernDayPanelProps = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
  onEditStart: (newStart: string | Date) => void;
  onEditEnd: (newEnd: string | Date) => void;
};

function ModernDayPanel({
  sessions,
  completions,
  startDay,
  endDay,
  onEditStart,
  onEditEnd,
}: ModernDayPanelProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => s.date === todayStr);
  const active = todaySessions.find((s) => !s.end) || null;
  const latestToday =
    active ||
    todaySessions.slice().sort((a, b) => {
      const ta = new Date(a.start || `${a.date}T00:00:00.000Z`).getTime();
      const tb = new Date(b.start || `${b.date}T00:00:00.000Z`).getTime();
      return tb - ta;
    })[0];
  const isActive = !!active;

  const todays = completions.filter((c) => (c.timestamp || "").slice(0, 10) === todayStr);
  const stats = {
    pif: todays.filter((c) => c.outcome === "PIF").length,
    done: todays.filter((c) => c.outcome === "Done").length,
    da: todays.filter((c) => c.outcome === "DA").length,
    arr: todays.filter((c) => c.outcome === "ARR").length,
    total: todays.length,
    pifAmount: todays
      .filter((c) => c.outcome === "PIF")
      .reduce((sum, c) => sum + (parseFloat(c.amount || "0") || 0), 0),
  };

  const [editingStart, setEditingStart] = React.useState(false);
  const [startDate, setStartDate] = React.useState<string>(todayStr);
  const [startTime, setStartTime] = React.useState<string>(() => {
    if (latestToday?.start) return isoToLocalTime(latestToday.start) || "";
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    if (latestToday?.start) {
      setStartDate(isoToLocalDate(latestToday.start) || latestToday.date);
      setStartTime(isoToLocalTime(latestToday.start));
    } else {
      setStartDate(todayStr);
      const now = new Date();
      setStartTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [latestToday?.start, latestToday?.date, todayStr]);

  const saveStart = React.useCallback(() => {
    const iso = toISO(startDate, startTime);
    if (iso) onEditStart(iso);
    setEditingStart(false);
  }, [startDate, startTime, onEditStart]);

  const [editingEnd, setEditingEnd] = React.useState(false);
  const [endDate, setEndDate] = React.useState<string>(todayStr);
  const [endTime, setEndTime] = React.useState<string>(() => {
    if (latestToday?.end) return isoToLocalTime(latestToday.end) || "";
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    if (latestToday?.end) {
      setEndDate(isoToLocalDate(latestToday.end) || latestToday.date);
      setEndTime(isoToLocalTime(latestToday.end));
    } else {
      setEndDate(todayStr);
      const now = new Date();
      setEndTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [latestToday?.end, latestToday?.date, todayStr]);

  const saveEnd = React.useCallback(() => {
    const iso = toISO(endDate, endTime);
    if (iso) onEditEnd(iso);
    setEditingEnd(false);
  }, [endDate, endTime, onEditEnd]);

  return (
    <div className={`day-panel-modern ${isActive ? "active" : ""}`}>
      <div className="day-panel-header">
        <div className="day-status-section">
          {isActive && <div className="day-indicator" />}
          <div className="day-time-info">
            <div className="day-status-label">
              {isActive ? "Day Active" : latestToday ? "Day Summary" : "Day Not Started"}
            </div>
            <div className="day-time">
              {latestToday?.start ? fmtTime(latestToday.start) : "—"}
              {isActive ? " - Running" : latestToday?.end ? ` - ${fmtTime(latestToday.end)}` : ""}
            </div>
          </div>
        </div>
        <div className="day-actions">
          {!isActive ? (
            <button className="day-action-btn" onClick={startDay} type="button">
              ▶️ Start Day
            </button>
          ) : (
            <button className="day-action-btn" onClick={endDay} type="button">
              ⏹️ End Day
            </button>
          )}
        </div>
      </div>

      <div className="day-time-editors">
        <div className="time-editor">
          <div className="editor-label">Start</div>
          {!editingStart ? (
            <div className="editor-display">
              <span>{latestToday?.start ? fmtTime(latestToday.start) : "—"}</span>
              <button className="editor-btn" type="button" onClick={() => setEditingStart(true)}>
                Edit
              </button>
            </div>
          ) : (
            <div className="editor-form">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <div className="editor-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingStart(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveStart}>
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="time-editor">
          <div className="editor-label">End</div>
          {!editingEnd ? (
            <div className="editor-display">
              <span>{latestToday?.end ? fmtTime(latestToday.end) : "—"}</span>
              <button className="editor-btn" type="button" onClick={() => setEditingEnd(true)}>
                Edit
              </button>
            </div>
          ) : (
            <div className="editor-form">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
              <div className="editor-actions">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingEnd(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveEnd}>
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="day-stats-grid">
        <div className="day-stat">
          <div className="day-stat-value">{stats.total}</div>
          <div className="day-stat-label">Completed</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">£{stats.pifAmount.toFixed(0)}</div>
          <div className="day-stat-label">PIF Total</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.pif}</div>
          <div className="day-stat-label">PIF</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.done}</div>
          <div className="day-stat-label">Done</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.arr}</div>
          <div className="day-stat-label">ARR</div>
        </div>
        <div className="day-stat">
          <div className="day-stat-value">{stats.da}</div>
          <div className="day-stat-label">DA</div>
        </div>
      </div>
    </div>
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

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] = React.useState<number | null>(null);

  const tabOrder: Tab[] = ["list", "completed", "arrangements", "earnings", "planning"];
  const currentTabIndex = tabOrder.indexOf(tab);
  const { containerRef, isSwipeActive } = useSwipeNavigation(
    tabOrder.length,
    currentTabIndex,
    (newIndex) => setTab(tabOrder[newIndex]),
    {
      threshold: 100,
      velocity: 0.3,
      resistance: 0.2,
      preventScroll: true,
    }
  );

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

  const [optimisticUpdates] = React.useState<Map<string, any>>(new Map());

  const [toolsOpen, setToolsOpen] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") return window.innerWidth >= 768;
    return true;
  });

  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const arrangements = Array.isArray(state.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...state, addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

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

  function formatKey(d: Date, tz = "Europe/London") {
    const y = d.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
    const m = d.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
    const dd = d.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
    return `${y}-${m}-${dd}`;
  }

  const loadRecentCloudBackups = React.useCallback(async () => {
    if (!supabase) {
      setCloudErr("Supabase not configured");
      return;
    }
    setCloudBusy(true);
    setCloudErr(null);
    try {
      const authResp = await supabase.auth.getUser();
      const userId =
        authResp && authResp.data && authResp.data.user
          ? authResp.data.user.id
          : undefined;
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

      if (data.length === 0) {
        try {
          const bucket = (import.meta as any).env?.VITE_SUPABASE_BUCKET || "navigator-backups";

          const { data: files, error: listError } = await supabase.storage
            .from(bucket)
            .list(userId, {
              limit: 50,
              sortBy: { column: "created_at", order: "desc" },
            });

          if (listError) throw listError;

          if (files && files.length > 0) {
            const storageBackups = files
              .filter((file) => file.name.includes("backup_") && file.name.endsWith(".json"))
              .map((file) => ({
                object_path: `${userId}/${file.name}`,
                size_bytes: file.metadata?.size || 0,
                created_at: file.created_at || file.updated_at,
                day_key: file.name.match(/backup_(\d{4}-\d{2}-\d{2})/)?.[1] || "",
              }));

            setCloudBackups(storageBackups);
            return;
          }
        } catch (storageError: any) {
          console.warn("Failed to list storage bucket:", storageError);
        }
      }

      const list = data.slice().sort((a, b) => {
        const aParts = a.object_path.split("_");
        const bParts = b.object_path.split("_");
        const ta = (aParts[1] || "") + (aParts[2] || "");
        const tb = (bParts[1] || "") + (bParts[2] || "");
        return tb.localeCompare(ta);
      });

      setCloudBackups(list);
    } catch (e: any) {
      setCloudErr(e?.message || String(e));
    } finally {
      setCloudBusy(false);
    }
  }, []);

  const restoreFromCloud = React.useCallback(
    async (objectPath: string) => {
      if (!supabase) {
        await alert({
          title: "Configuration Error",
          message: "Supabase is not configured. Please check your environment variables.",
          type: "error",
        });
        return;
      }
      const fileName = objectPath.split("/").pop() || objectPath;
      const confirmed = await confirm({
        title: "Restore from Cloud",
        message: `Restore "${fileName}" from cloud?\n\nThis will overwrite your current addresses, completions, arrangements and sessions on this device.`,
        confirmText: "Restore",
        cancelText: "Cancel",
        type: "warning",
      });
      if (!confirmed) return;

      setCloudBusy(true);
      setCloudErr(null);
      try {
        const bucket =
          (import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_BUCKET
            ? (import.meta as any).env.VITE_SUPABASE_BUCKET
            : "navigator-backups";
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
          type: "success",
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

  React.useEffect(() => {
    if (!cloudMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest || !target.closest(".btn-row")) setCloudMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [cloudMenuOpen]);

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

        const localHasData =
          addresses.length > 0 ||
          completions.length > 0 ||
          arrangements.length > 0 ||
          daySessions.length > 0;

        if (row && row.data) {
          const normalized = normalizeState(row.data);
          if (!cancelled) {
            setState(normalized);
            lastFromCloudRef.current = JSON.stringify(normalized);
            setHydrated(true);
            logger.sync("Restored from cloud, version:", row?.version);
          }
        } else if (localHasData) {
          logger.sync("Pushing local data to cloud...");
          await cloudSync.syncData(safeState);
          if (!cancelled) {
            lastFromCloudRef.current = JSON.stringify(safeState);
            setHydrated(true);
          }
        } else {
          if (!cancelled) setHydrated(true);
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
        logger.error("Bootstrap sync (cloud-first) failed:", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSync.user, loading]);

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

  React.useEffect(() => {
    if (!cloudSync.user || !hydrated) return;

    const flush = async () => {
      try {
        const currentStr = JSON.stringify(safeState);
        if (currentStr !== lastFromCloudRef.current) {
          logger.sync("Flushing changes before exit...");
          await cloudSync.syncData(safeState);
          lastFromCloudRef.current = currentStr;
        }
      } catch (err) {
        logger.warn("Failed to flush changes:", err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentStr = JSON.stringify(safeState);
      if (currentStr !== lastFromCloudRef.current && cloudSync.isOnline) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [safeState, cloudSync, hydrated]);

  const handleImportExcel = React.useCallback(
    async (rows: AddressRow[]) => {
      try {
        logger.info(`Starting import of ${rows.length} addresses...`);

        const preserveCompletions = true;
        setAddresses(rows, preserveCompletions);

        setTimeout(async () => {
          try {
            const newState = {
              ...safeState,
              addresses: rows,
              activeIndex: null,
              currentListVersion: (safeState.currentListVersion || 1) + 1,
              completions: safeState.completions,
            };

            await cloudSync.syncData(newState);
            lastFromCloudRef.current = JSON.stringify(newState);

            logger.success(
              `Successfully imported ${rows.length} addresses and synced to cloud (completions preserved)`
            );
          } catch (syncError) {
            logger.error("Failed to sync imported data to cloud:", syncError);
          }
        }, 0);
      } catch (error) {
        logger.error("Failed to import Excel data:", error);
      }
    },
    [safeState, setAddresses, cloudSync]
  );

  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => {
      try {
        const operationId = await complete(index, outcome, amount, arrangementId);

        if (cloudSync.queueOperation) {
          await cloudSync.queueOperation({
            type: "create",
            entity: "completion",
            entityId: operationId,
            data: {
              index,
              outcome,
              amount,
              address: addresses[index]?.address,
              listVersion: safeState.currentListVersion,
              arrangementId,
            },
          });
        }
      } catch (error) {
        logger.error("Failed to complete address:", error);
      }
    },
    [complete, addresses, safeState.currentListVersion, cloudSync]
  );

  const ensureDayStarted = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
  }, [daySessions, startDay]);

  const handleEditStart = React.useCallback(
    (newStartISO: string | Date) => {
      const parsed = typeof newStartISO === "string" ? new Date(newStartISO) : newStartISO;
      if (Number.isNaN(parsed.getTime())) {
        logger.error("Invalid start date provided:", newStartISO);
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
          targetSession = {
            date: dayKey,
            start: newISO,
          };
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
            logger.error("Error calculating duration:", error);
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
        logger.error("Invalid end date provided:", newEndISO);
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
          targetSession = {
            date: dayKey,
            start: endISO,
          };
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
            logger.error("Error calculating session duration:", error);
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
      logger.warn("Supabase storage backup (finish) failed:", e?.message || e);
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
        type: "success",
      });
    } catch (err: any) {
      logger.error("Restore operation failed:", err);
      await alert({
        title: "Error",
        message: "Restore failed: " + (err?.message || err),
        type: "error",
      });
    } finally {
      e.target.value = "";
    }
  };

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

    const pendingArrangements = arrangements.filter(
      (arr) => arr.status !== "Completed" && arr.status !== "Cancelled"
    ).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaysPIF = completions
      .filter(
        (c) =>
          c.outcome === "PIF" &&
          (c.timestamp || "").slice(0, 10) === todayStr
      )
      .reduce((sum, c) => sum + (parseFloat(c.amount || "0") || 0), 0);

    return {
      total,
      pending,
      completed,
      pifCount,
      doneCount,
      daCount,
      arrCount,
      pendingArrangements,
      todaysPIF,
    };
  }, [addresses, completions, arrangements, state.currentListVersion]);

  const activeAddressCount = React.useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    let count = 0;
    addresses.forEach((addr, idx) => {
      const isCompleted = completions.some(
        (c) => c.index === idx && c.listVersion === state.currentListVersion
      );
      if (isCompleted) {
        return;
      }

      if (
        lowerSearch &&
        !String(addr.address ?? "")
          .toLowerCase()
          .includes(lowerSearch)
      ) {
        return;
      }

      count += 1;
    });

    return count;
  }, [addresses, completions, search, state.currentListVersion]);

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

  const getSyncStatus = () => {
    if (cloudSync.isSyncing) {
      return { text: "Syncing", color: "var(--warning)", icon: "⟳" };
    }
    if (!cloudSync.isOnline) {
      return { text: "Offline", color: "var(--danger)", icon: "⚠" };
    }
    if (cloudSync.error) {
      return { text: "Sync Error", color: "var(--danger)", icon: "⚠" };
    }
    return { text: "Online", color: "var(--success)", icon: "✓" };
  };

  const syncStatus = getSyncStatus();

  const getUserInitials = () => {
    const email = cloudSync.user?.email || "";
    const parts = email.split("@")[0]?.split(".") ?? [];
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

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
      {showAdmin && isAdmin && (
        <AdminDashboard
          user={cloudSync.user!}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {showSubscription && (
        <SubscriptionManager
          user={cloudSync.user!}
          onClose={() => setShowSubscription(false)}
        />
      )}

      <main className="main-area">
        <header className="app-header-modern">
          <div className="header-left">
            <div className="logo-section">
              <div className="logo-icon">📍</div>
              <div className="logo-text">
                <div className="logo-title">Navigator</div>
                <div className="logo-subtitle">Enforcement Pro</div>
              </div>
            </div>

            <div className="search-container-modern">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                className="search-input-modern"
                placeholder="Search addresses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="header-center">
            <div className="sync-status">
              <div className="sync-indicator" style={{ background: syncStatus.color }} />
              <span>{syncStatus.text}</span>
              {cloudSync.lastSyncTime && (
                <span className="sync-meta" title={`Last sync: ${cloudSync.lastSyncTime.toLocaleString()}`}>
                  · {cloudSync.lastSyncTime.toLocaleTimeString()}
                </span>
              )}
              {optimisticUpdates.size > 0 && (
                <span className="sync-meta">· {optimisticUpdates.size} pending</span>
              )}
            </div>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleManualSync}
              disabled={cloudSync.isSyncing}
              title={cloudSync.isSyncing ? "Syncing..." : "Force sync now"}
            >
              {cloudSync.isSyncing ? "⟳" : "🔄"} Sync
            </button>
            <button className="menu-toggle" onClick={() => setSidebarOpen((o) => !o)}>
              ☰
            </button>
          </div>
        </header>

        {cloudSync.error && (
          <div
            style={{
              background: "var(--danger-light)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius)",
              padding: "0.75rem",
              margin: "0 1rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--danger)", fontSize: "0.875rem" }}>
              ⚠️ Sync error: {cloudSync.error}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleManualSync}
                disabled={cloudSync.isSyncing}
              >
                Retry
              </button>
              <button className="btn btn-ghost btn-sm" onClick={cloudSync.clearError}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="tab-bar-modern">
          <button className={`tab-btn ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
            List ({stats.pending})
          </button>
          <button className={`tab-btn ${tab === "completed" ? "active" : ""}`} onClick={() => setTab("completed")}>
            Completed ({stats.completed})
          </button>
          <button className={`tab-btn ${tab === "arrangements" ? "active" : ""}`} onClick={() => setTab("arrangements")}>
            Arrangements ({stats.pendingArrangements})
          </button>
          <button className={`tab-btn ${tab === "earnings" ? "active" : ""}`} onClick={() => setTab("earnings")}>
            Earnings
          </button>
          <button className={`tab-btn ${tab === "planning" ? "active" : ""}`} onClick={() => setTab("planning")}>
            Planning
          </button>
        </div>

        <div className="content-area">
          {toolsOpen ? null : (
            <div className="tools-toggle">
              <button className="btn btn-ghost" onClick={() => setToolsOpen(true)}>
                Show tools v
              </button>
            </div>
          )}

          {toolsOpen && (
            <div className="tools-panel">
              <div className="tools-header">
                <div className="tools-text">
                  Load an Excel file with columns: address, optional lat, lng.
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setToolsOpen(false)}>
                  Hide tools ^
                </button>
              </div>
              <div className="btn-row" style={{ position: "relative" }}>
                <ImportExcel onImported={handleImportExcel} />

                <input
                  type="file"
                  accept="application/json"
                  onChange={onRestore}
                  className="file-input"
                  id="restore-input"
                />
                <label htmlFor="restore-input" className="file-input-label">
                  Restore (file)
                </label>

                <CloudRestore
                  cloudBusy={cloudBusy}
                  cloudErr={cloudErr}
                  cloudBackups={cloudBackups}
                  cloudMenuOpen={cloudMenuOpen}
                  setCloudMenuOpen={setCloudMenuOpen}
                  loadRecentCloudBackups={loadRecentCloudBackups}
                  restoreFromCloud={restoreFromCloud}
                />

                <button
                  className="btn btn-ghost"
                  onClick={cloudSync.forceFullSync}
                  title="Reset sync state and force full sync"
                >
                  Force Full Sync
                </button>
              </div>
            </div>
          )}

          <div
            className={`tabs-viewport modern ${isSwipeActive ? "swiping" : ""}`}
          >
            <div ref={containerRef} className="tabs-track">
              <div className="tab-panel" data-tab="list">
                <ModernDayPanel
                  sessions={daySessions}
                  completions={completions}
                  startDay={startDay}
                  endDay={endDayWithBackup}
                  onEditStart={handleEditStart}
                  onEditEnd={handleEditEnd}
                />

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
                    change={`${stats.total} total addresses`}
                    changeType="positive"
                    icon="📊"
                    iconType="success"
                  />
                </div>

                <h2 style={{ margin: "2rem 0 1rem", color: "var(--gray-800)" }}>
                  Active Addresses ({activeAddressCount})
                </h2>

                <AddressList
                  state={safeState}
                  setActive={setActive}
                  cancelActive={cancelActive}
                  onComplete={handleComplete}
                  onAddArrangement={addArrangement}
                  filterText={search}
                  ensureDayStarted={ensureDayStarted}
                />

                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    margin: "1.25rem 0 3rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <button
                    className="btn btn-ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      undo(-1);
                    }}
                    title="Undo last completion for this list"
                  >
                    Undo Last
                  </button>
                  <span className="pill pill-pif">PIF {stats.pifCount}</span>
                  <span className="pill pill-done">Done {stats.doneCount}</span>
                  <span className="pill pill-da">DA {stats.daCount}</span>
                  <span className="pill pill-arr">ARR {stats.arrCount}</span>
                </div>

                <ManualAddressFAB onAdd={addAddress} />
              </div>

              <div className="tab-panel" data-tab="completed">
                <Completed state={safeState} onChangeOutcome={handleChangeOutcome} />
              </div>

              <div className="tab-panel" data-tab="arrangements">
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
              </div>

              <div className="tab-panel" data-tab="earnings">
                <EarningsCalendar
                  state={safeState}
                  user={cloudSync.user}
                />
              </div>

              <div className="tab-panel" data-tab="planning">
                <RoutePlanning
                  user={cloudSync.user}
                  onAddressesReady={(newAddresses) => {
                    setAddresses(newAddresses, false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <aside className={`sidebar-right ${sidebarOpen ? "open" : ""}`}>
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
              className={`nav-item ${tab === "list" ? "active" : ""}`}
              onClick={() => {
                setTab("list");
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">📋</span>
              <span>Address List</span>
              <span className="nav-badge">{stats.pending}</span>
            </div>
            <div
              className={`nav-item ${tab === "completed" ? "active" : ""}`}
              onClick={() => {
                setTab("completed");
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">✅</span>
              <span>Completed</span>
              <span className="nav-badge">{stats.completed}</span>
            </div>
            <div
              className={`nav-item ${tab === "arrangements" ? "active" : ""}`}
              onClick={() => {
                setTab("arrangements");
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">📅</span>
              <span>Arrangements</span>
              <span className="nav-badge">{stats.pendingArrangements}</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Analytics</div>
            <div
              className={`nav-item ${tab === "earnings" ? "active" : ""}`}
              onClick={() => {
                setTab("earnings");
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">💰</span>
              <span>Earnings</span>
            </div>
            <div
              className={`nav-item ${tab === "planning" ? "active" : ""}`}
              onClick={() => {
                setTab("planning");
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">🗺️</span>
              <span>Route Planning</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <div className="nav-item" onClick={() => setShowSubscription(true)}>
              <span className="nav-icon">⭐</span>
              <span>Subscription</span>
            </div>
            {isAdmin && (
              <div className="nav-item" onClick={() => setShowAdmin(true)}>
                <span className="nav-icon">👑</span>
                <span>Admin Panel</span>
              </div>
            )}
            <div className="nav-item" onClick={() => cloudSync.signOut()}>
              <span className="nav-icon">🚪</span>
              <span>Sign Out</span>
            </div>
          </div>
        </nav>
      </aside>

      <div
        className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  );
}

function CloudRestore(props: {
  cloudBusy: boolean;
  cloudErr: string | null;
  cloudBackups: {
    object_path: string;
    size_bytes?: number;
    created_at?: string;
    day_key?: string;
  }[];
  cloudMenuOpen: boolean;
  setCloudMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  loadRecentCloudBackups: () => Promise<void>;
  restoreFromCloud: (path: string) => Promise<void>;
}) {
  const {
    cloudBusy,
    cloudErr,
    cloudBackups,
    cloudMenuOpen,
    setCloudMenuOpen,
    loadRecentCloudBackups,
    restoreFromCloud,
  } = props;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn btn-ghost"
        onClick={async () => {
          setCloudMenuOpen((o) => !o);
          if (!cloudMenuOpen) await loadRecentCloudBackups();
        }}
        title="List recent cloud backups"
      >
        Restore from Cloud
      </button>

      {cloudMenuOpen && (
        <div
          style={{
            position: "absolute",
            zIndex: 100,
            top: "110%",
            left: 0,
            minWidth: 280,
            background: "var(--surface)",
            border: "1px solid var(--border-light)",
            borderRadius: 12,
            padding: "0.5rem",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>
            Recent backups (7 days)
          </div>

          {cloudBusy && (
            <div
              style={{
                padding: "0.5rem 0.5rem",
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              Loading...
            </div>
          )}

          {!cloudBusy && cloudErr && (
            <div
              style={{ padding: "0.5rem 0.5rem", fontSize: 12, color: "var(--danger)" }}
            >
              {cloudErr}
            </div>
          )}

          {!cloudBusy && !cloudErr && cloudBackups.length === 0 && (
            <div
              style={{
                padding: "0.5rem 0.5rem",
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              No backups found.
            </div>
          )}

          {!cloudBusy &&
            !cloudErr &&
            cloudBackups.map((row) => {
              const parts = row.object_path.split("/");
              const fname =
                parts.length > 0 ? parts[parts.length - 1] : row.object_path;
              const day = row.day_key || "";
              const sizeText = row.size_bytes
                ? Math.round(row.size_bytes / 1024) + " KB"
                : "";
              return (
                <button
                  key={row.object_path}
                  className="btn btn-ghost"
                  style={{ width: "100%", justifyContent: "space-between" }}
                  onClick={() => restoreFromCloud(row.object_path)}
                >
                  <span
                    style={{
                      maxWidth: 170,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={fname}
                  >
                    {fname}
                  </span>
                  <span style={{ opacity: 0.7, fontSize: 12 }}>
                    {(day ? day + " · " : "") + sizeText}
                  </span>
                </button>
              );
            })}
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
