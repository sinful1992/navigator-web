// src/App.tsx - Complete Fixed Version
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

export default function App() {
  const cloudSync = useCloudSync();

  if (cloudSync.isLoading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Restoring session...
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
    // FIXED: Make sure to destructure these for the edit functionality
    setBaseState,
    deviceId,
    enqueueOp,
    // Reminder system functions
    updateReminderSettings,
    updateReminderNotification,
  } = useAppState();

  const cloudSync = useCloudSync();
  const { confirm, alert } = useModalContext();
  
  // Subscription management
  const { hasAccess } = useSubscription(cloudSync.user);
  const { isAdmin, isOwner } = useAdmin(cloudSync.user);
  const [showSubscription, setShowSubscription] = React.useState(false);
  const [showAdmin, setShowAdmin] = React.useState(false);


  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] =
    React.useState<number | null>(null);

  // Swipe navigation setup
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
      preventScroll: true
    }
  );

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

  // Optimistic update tracking
  const [optimisticUpdates] = React.useState<Map<string, any>>(new Map());

  // Collapsible Tools panel: closed on mobile, open on desktop
  const [toolsOpen, setToolsOpen] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") return window.innerWidth >= 768;
    return true;
  });

  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const arrangements = Array.isArray(state.arrangements)
    ? state.arrangements
    : [];
  const daySessions = Array.isArray(state.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...state, addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // ---------- Cloud Restore state & helpers ----------
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
      
      // If no backups found in database, try listing storage bucket directly
      if (data.length === 0) {
        try {
          console.log('No backups in database, checking storage bucket directly...');
          const bucket = (import.meta as any).env?.VITE_SUPABASE_BUCKET || "navigator-backups";
          
          const { data: files, error: listError } = await supabase.storage
            .from(bucket)
            .list(userId, {
              limit: 50,
              sortBy: { column: 'created_at', order: 'desc' }
            });
            
          if (listError) throw listError;
          
          if (files && files.length > 0) {
            const storageBackups = files
              .filter(file => file.name.includes('backup_') && file.name.endsWith('.json'))
              .map(file => ({
                object_path: `${userId}/${file.name}`,
                size_bytes: file.metadata?.size || 0,
                created_at: file.created_at || file.updated_at,
                day_key: file.name.match(/backup_(\d{4}-\d{2}-\d{2})/)?.[1] || '',
              }));
            
            setCloudBackups(storageBackups);
            console.log(`Found ${storageBackups.length} backups in storage bucket`);
            return;
          }
        } catch (storageError: any) {
          console.warn('Failed to list storage bucket:', storageError);
          // Continue with empty list
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
          type: "error"
        });
        return;
      }
      const fileName = objectPath.split("/").pop() || objectPath;
      const confirmed = await confirm({
        title: "Restore from Cloud",
        message: `Restore "${fileName}" from cloud?\n\nThis will overwrite your current addresses, completions, arrangements and sessions on this device.`,
        confirmText: "Restore",
        cancelText: "Cancel",
        type: "warning"
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

  React.useEffect(() => {
    if (!cloudMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest || !target.closest(".btn-row"))
        setCloudMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [cloudMenuOpen]);

  // ===================== Improved Cloud-first bootstrap =====================
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

  // ==== Improved debounced local -> cloud sync with optimistic updates ====
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

  // ==== Enhanced flush pending changes on exit/background ====
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

  // FIXED: Enhanced handleImportExcel with automatic completion preservation
  const handleImportExcel = React.useCallback(async (rows: AddressRow[]) => {
    try {
      logger.info(`Starting import of ${rows.length} addresses...`);
      
      // Always preserve completions so users can track their PIF and other results over time
      const preserveCompletions = true;
      
      // First, update the local state with preserve flag
      setAddresses(rows, preserveCompletions);
      
      // Create the new state that will be synced after React updates
      setTimeout(async () => {
        try {
          const newState = {
            ...safeState,
            addresses: rows,
            activeIndex: null,
            currentListVersion: (safeState.currentListVersion || 1) + 1,
            completions: safeState.completions, // Always preserve completion data
          };
          
          // Sync to cloud with the new state
          await cloudSync.syncData(newState);
          lastFromCloudRef.current = JSON.stringify(newState);
          
          logger.success(`Successfully imported ${rows.length} addresses and synced to cloud (completions preserved)`);
        } catch (syncError) {
          logger.error('Failed to sync imported data to cloud:', syncError);
        }
      }, 0);
      
    } catch (error) {
      logger.error('Failed to import Excel data:', error);
    }
  }, [safeState, setAddresses, cloudSync]);

  // FIXED: Enhanced completion with proper error handling (removed duplicate optimistic updates)
  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => {
      try {
        // FIXED: Removed the duplicate optimistic update logic from App.tsx
        // Only the useAppState complete function should handle optimistic updates
        const operationId = await complete(index, outcome, amount, arrangementId);

        // Queue for cloud sync if available
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
        // Could potentially show user feedback here
      }
    },
    [complete, addresses, safeState.currentListVersion, cloudSync]
  );

  const handleCreateArrangement = React.useCallback((addressIndex: number) => {
    setAutoCreateArrangementFor(addressIndex);
  }, []);

  const ensureDayStarted = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
  }, [daySessions, startDay]);

  // FIXED: Edit START time with proper sync integration
  const handleEditStart = React.useCallback(
    (newStartISO: string | Date) => {
      const parsed =
        typeof newStartISO === "string" ? new Date(newStartISO) : newStartISO;
      if (Number.isNaN(parsed.getTime())) {
        logger.error('Invalid start date provided:', newStartISO);
        return;
      }

      const newISO = parsed.toISOString();
      const dayKey = newISO.slice(0, 10);

      logger.debug('Editing start time:', { newISO, dayKey });

      setBaseState((s) => {
        const arr = s.daySessions.slice();
        let sessionIndex = arr.findIndex((d) => d.date === dayKey);
        let targetSession: any;

        if (sessionIndex >= 0) {
          // Update existing session
          targetSession = { ...arr[sessionIndex], start: newISO };
        } else {
          // Create new session
          targetSession = {
            date: dayKey,
            start: newISO,
          };
        }

        // Recalculate duration if we have both start and end
        if (targetSession.end) {
          try {
            const start = new Date(newISO).getTime();
            const end = new Date(targetSession.end).getTime();
            if (end >= start) {
              targetSession.durationSeconds = Math.floor((end - start) / 1000);
            } else {
              // If new start is after end, clear end time
              delete targetSession.end;
              delete targetSession.durationSeconds;
            }
          } catch (error) {
            logger.error('Error calculating duration:', error);
          }
        }

        // Add sync metadata
        const now = new Date().toISOString();
        targetSession.updatedAt = now;
        targetSession.updatedBy = deviceId;

        // Create operation for sync queue
        const operationId = `edit_start_${dayKey}_${Date.now()}`;
        const forServer = {
          ...targetSession,
          id: dayKey,
          updatedAt: now,
          updatedBy: deviceId,
        };

        // Enqueue the operation
        enqueueOp("session", sessionIndex >= 0 ? "update" : "create", forServer, operationId);

        // Update the sessions array
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

  // FIXED: Edit FINISH time with proper sync integration
  const handleEditEnd = React.useCallback(
    (newEndISO: string | Date) => {
      const parsed = typeof newEndISO === "string" ? new Date(newEndISO) : newEndISO;
      if (Number.isNaN(parsed.getTime())) {
        logger.error('Invalid end date provided:', newEndISO);
        return;
      }

      const endISO = parsed.toISOString();
      const dayKey = endISO.slice(0, 10);

      logger.debug('Editing end time:', { endISO, dayKey });

      setBaseState((s) => {
        const arr = s.daySessions.slice();
        let sessionIndex = arr.findIndex((d) => d.date === dayKey);
        let targetSession: any;

        logger.debug('Current sessions for day:', arr.filter(d => d.date === dayKey));

        if (sessionIndex >= 0) {
          // Update existing session
          targetSession = { ...arr[sessionIndex] };
          logger.debug('Updating existing session:', targetSession);
        } else {
          // Create new session for this day
          targetSession = {
            date: dayKey,
            start: endISO, // Default start to end time if no session exists
          };
          logger.debug('Creating new session:', targetSession);
        }

        // Set the end time
        targetSession.end = endISO;

        // Calculate duration if we have both start and end
        if (targetSession.start) {
          try {
            const startTime = new Date(targetSession.start).getTime();
            const endTime = new Date(endISO).getTime();
            
            if (endTime >= startTime) {
              targetSession.durationSeconds = Math.floor((endTime - startTime) / 1000);
            } else {
              // If end is before start, set start to end and duration to 0
              logger.warn('End time is before start time, adjusting start time');
              targetSession.start = endISO;
              targetSession.durationSeconds = 0;
            }
          } catch (error) {
            logger.error('Error calculating session duration:', error);
            targetSession.durationSeconds = 0;
          }
        }

        // Add sync metadata for cloud sync
        const now = new Date().toISOString();
        targetSession.updatedAt = now;
        targetSession.updatedBy = deviceId;

        // Create operation for sync queue
        const operationId = `edit_end_${dayKey}_${Date.now()}`;
        const forServer = {
          ...targetSession,
          id: dayKey,
          updatedAt: now,
          updatedBy: deviceId,
        };

        // Enqueue the operation
        enqueueOp("session", sessionIndex >= 0 ? "update" : "create", forServer, operationId);

        // Update the sessions array
        if (sessionIndex >= 0) {
          arr[sessionIndex] = targetSession;
        } else {
          arr.push(targetSession);
        }

        logger.debug('Updated sessions array:', arr);

        return { ...s, daySessions: arr };
      });
    },
    [setBaseState, deviceId, enqueueOp]
  );

  // Finish Day with cloud snapshot
  const endDayWithBackup = React.useCallback(() => {
    const snap = backupState();
    uploadBackupToStorage(snap, "finish").catch((e: any) => {
      logger.warn("Supabase storage backup (finish) failed:", e?.message || e);
    });
    endDay();
  }, [backupState, endDay]);

  // Restore from local file
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
      logger.error('Restore operation failed:', err);
      await alert({
        title: "Error",
        message: "Restore failed: " + (err?.message || err),
        type: "error"
      });
    } finally {
      e.target.value = "";
    }
  };

  // Stats for header pills
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
    
    // Calculate pending arrangements (exclude Completed and Cancelled)
    const pendingArrangements = arrangements.filter(arr => 
      arr.status !== "Completed" && arr.status !== "Cancelled"
    ).length;
    
    return { total, pending, completed, pifCount, doneCount, daCount, arrCount, pendingArrangements };
  }, [addresses, completions, arrangements, state.currentListVersion]);

  // Allow changing a completion outcome (by completion array index)
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

  // Enhanced manual sync with feedback
  const handleManualSync = React.useCallback(async () => {
    try {
      logger.sync("Manual sync initiated...");
      await cloudSync.syncData(safeState);
      lastFromCloudRef.current = JSON.stringify(safeState);
    } catch (err) {
      logger.error("Manual sync failed:", err);
    }
  }, [cloudSync, safeState]);


  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Preparing your workspace...
        </div>
      </div>
    );
  }

  const getSyncStatus = () => {
    if (cloudSync.isSyncing) {
      return { text: "SYNCING", color: "var(--warning)", icon: "⟳" };
    }
    if (!cloudSync.isOnline) {
      return { text: "OFFLINE", color: "var(--danger)", icon: "⚠" };
    }
    if (cloudSync.error) {
      return { text: "SYNC ERROR", color: "var(--danger)", icon: "⚠" };
    }
    return { text: "ONLINE", color: "var(--success)", icon: "✓" };
  };

  const syncStatus = getSyncStatus();

  return (
    <div className="container">
      {/* Admin Dashboard - only for owner */}
      {showAdmin && isAdmin && (
        <AdminDashboard 
          user={cloudSync.user!} 
          onClose={() => setShowAdmin(false)} 
        />
      )}

      {/* Subscription management modal/page */}
      {showSubscription && (
        <SubscriptionManager 
          user={cloudSync.user!} 
          onClose={() => setShowSubscription(false)} 
        />
      )}

      {/* Header */}
      <header className="app-header">
        <div className="left">
          <h1 className="app-title">Address Navigator</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            <span
              style={{
                color: syncStatus.color,
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <span>{syncStatus.icon}</span>
              {syncStatus.text}
            </span>
            {cloudSync.lastSyncTime && (
              <span title={`Last sync: ${cloudSync.lastSyncTime.toLocaleString()}`}>
                · {cloudSync.lastSyncTime.toLocaleTimeString()}
              </span>
            )}
            {optimisticUpdates.size > 0 && (
              <span style={{ color: "var(--primary)" }}>
                · {optimisticUpdates.size} pending
              </span>
            )}
          </div>
        </div>

        <div className="right">
          <div className="user-chip" role="group" aria-label="Account">
            <span className="avatar" aria-hidden>
              USER
            </span>
            <span className="email" title={cloudSync.user?.email ?? ""}>
              {cloudSync.user?.email ?? "Signed in"}
            </span>
            
            {/* Admin Dashboard button - only visible to admins */}
            {isAdmin && (
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={() => setShowAdmin(true)}
                title="Admin Dashboard"
                style={{ marginLeft: "0.5rem" }}
              >
                Admin
              </button>
            )}
            
            {/* Subscription button */}
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => setShowSubscription(true)}
              title="Manage subscription"
              style={{ marginLeft: "0.5rem" }}
            >
              {isOwner ? 'Owner Access' : hasAccess ? 'Subscription' : 'Start Trial'}
            </button>
            
            <button className="signout-btn" onClick={cloudSync.signOut} title="Sign out">
              Sign Out
            </button>
          </div>

          <div className="tabs">
            <button className="tab-btn" aria-selected={tab === "list"} onClick={() => setTab("list")}>
              List ({stats.pending})
            </button>
            <button
              className="tab-btn"
              aria-selected={tab === "completed"}
              onClick={() => setTab("completed")}
            >
              Completed ({stats.completed})
            </button>
            <button
              className="tab-btn"
              aria-selected={tab === "arrangements"}
              onClick={() => setTab("arrangements")}
            >
              Arrangements ({stats.pendingArrangements})
            </button>
            <button
              className="tab-btn"
              aria-selected={tab === "earnings"}
              onClick={() => setTab("earnings")}
            >
              Earnings
            </button>
            <button
              className="tab-btn"
              aria-selected={tab === "planning"}
              onClick={() => setTab("planning")}
            >
              Planning
            </button>
            <button
              className="tab-btn"
              onClick={handleManualSync}
              disabled={cloudSync.isSyncing}
              title={cloudSync.isSyncing ? "Syncing..." : "Force sync now"}
              style={{
                opacity: cloudSync.isSyncing ? 0.6 : 1,
                cursor: cloudSync.isSyncing ? "not-allowed" : "pointer",
              }}
            >
              {cloudSync.isSyncing ? "⟳ Syncing..." : "🔄 Sync"}
            </button>
          </div>
        </div>
      </header>

      {/* Enhanced error display */}
      {cloudSync.error && (
        <div
          style={{
            background: "var(--danger-light)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            padding: "0.75rem",
            marginBottom: "1rem",
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

      {/* Tools toggle */}
      <div
        style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "center" }}
      >
        <button
          className="btn btn-ghost"
          onClick={() => setToolsOpen((o) => !o)}
          title={toolsOpen ? "Hide tools" : "Show tools"}
        >
          {toolsOpen ? "Hide tools ^" : "Show tools v"}
        </button>
      </div>

      {toolsOpen && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              background: "var(--surface)",
              padding: "1.0rem",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-light)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginBottom: "0.75rem",
                lineHeight: "1.4",
              }}
            >
              Load an Excel file with columns: address, optional lat, lng.
            </div>

            <div className="btn-row" style={{ position: "relative" }}>
              {/* FIXED: Import using the new handler */}
              <ImportExcel onImported={handleImportExcel} />

              {/* Local file restore */}
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

              {/* Restore from Cloud (last 7 days) */}
              <CloudRestore
                cloudBusy={cloudBusy}
                cloudErr={cloudErr}
                cloudBackups={cloudBackups}
                cloudMenuOpen={cloudMenuOpen}
                setCloudMenuOpen={setCloudMenuOpen}
                loadRecentCloudBackups={loadRecentCloudBackups}
                restoreFromCloud={restoreFromCloud}
              />

              {/* Enhanced tools */}
              <button
                className="btn btn-ghost"
                onClick={cloudSync.forceFullSync}
                title="Reset sync state and force full sync"
              >
                Force Full Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content with swipe navigation */}
      <div className="tabs-viewport">
        <div 
          ref={containerRef}
          className={`tabs-track ${isSwipeActive ? 'swiping' : ''}`}
        >
          <div className="tab-panel" data-tab="list">
            {/* Day panel FIRST */}
            <DayPanel
              sessions={daySessions}
              completions={completions}
              startDay={startDay}
              endDay={endDayWithBackup}
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
            />

            {/* SEARCH BAR UNDER THE DAY PANEL */}
            <div className="search-container">
              <input
                type="search"
                value={search}
                placeholder="Search addresses..."
                onChange={(e) => setSearch(e.target.value)}
                className="input search-input"
              />
            </div>


            <AddressList
              state={safeState}
              setActive={setActive}
              cancelActive={cancelActive}
              onComplete={handleComplete}
              onCreateArrangement={handleCreateArrangement}
              onAddArrangement={addArrangement}
              onAddAddress={async (addr: AddressRow) => addAddress(addr)}
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
              {cloudSync.lastSyncTime && (
                <span className="muted">
                  Last sync {cloudSync.lastSyncTime.toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Floating + Address button */}
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
                setAddresses(newAddresses, false); // Don't preserve completions for new addresses
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small helper component to keep the App body clean */
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