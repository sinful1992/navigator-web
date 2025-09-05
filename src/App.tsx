// src/App.tsx
import * as React from "react";
import "./App.css";
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";
import { Auth } from "./Auth";
import { AddressList } from "./AddressList";
import Completed from "./Completed";
import { DayPanel } from "./DayPanel";
import { Arrangements } from "./Arrangements";
import { readJsonFile } from "./backup";
import {
  type AddressRow,
  type Outcome,
  type AppState,
  type DaySession,
  type Completion,
  type Arrangement,
} from "./types";
import { supabase } from "./lib/supabaseClient";
import ManualAddressFAB from "./ManualAddressFAB";

type Tab = "list" | "completed" | "arrangements";

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
  const userId = authResp?.data?.user?.id;
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
    (import.meta as any).env?.VITE_SUPABASE_BUCKET ?? "navigator-backups";
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
    console.warn("Backups table insert failed:", (e as any)?.message || e);
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
      <AuthedApp />
    </ErrorBoundary>
  );
}

function AuthedApp() {
  const {
    state,
    loading,
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
  } = useAppState();

  const cloudSync = useCloudSync();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] =
    React.useState<number | null>(null);

  const [hydrated, setHydrated] = React.useState(false);

  // === Refs used to avoid stale closures & to suppress outdated cloud echoes ===
  const lastFromCloudRef = React.useRef<string | null>(null);
  const currentListVersionRef = React.useRef<number>(state.currentListVersion);
  const suppressCloudUntilRef = React.useRef<number>(0);

  React.useEffect(() => {
    currentListVersionRef.current = state.currentListVersion;
  }, [state.currentListVersion]);

  // Optimistic update tracking (UI only)
  const [optimisticUpdates, setOptimisticUpdates] = React.useState<
    Map<string, any>
  >(new Map());

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

  // ---------- Cloud bootstrap + subscription ----------
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
            currentListVersionRef.current = normalized.currentListVersion ?? 1;
            setHydrated(true);
            console.log("Restored from cloud, version:", row?.version);
          }
        } else if (localHasData) {
          console.log("Pushing local data to cloud...");
          await cloudSync.syncData(safeState);
          if (!cancelled) {
            lastFromCloudRef.current = JSON.stringify(safeState);
            currentListVersionRef.current = safeState.currentListVersion ?? 1;
            setHydrated(true);
          }
        } else {
          if (!cancelled) setHydrated(true);
        }

        // SUBSCRIPTION with guards
        cleanup = cloudSync.subscribeToData((incomingState) => {
          if (!incomingState) return;
          const normalized = normalizeState(incomingState);
          const incomingVer =
            typeof normalized.currentListVersion === "number"
              ? normalized.currentListVersion
              : 1;

          // 1) Reject any cloud payload older than our current local version
          if (incomingVer < (currentListVersionRef.current ?? 1)) {
            return;
          }

          const fromCloudStr = JSON.stringify(normalized);

          // 2) During "quarantine" after a local import, only accept exact echo
          if (Date.now() < suppressCloudUntilRef.current) {
            if (fromCloudStr !== lastFromCloudRef.current) {
              return; // ignore outdated/non-matching cloud frames
            }
          }

          // 3) Ignore exact duplicates
          if (fromCloudStr === lastFromCloudRef.current) return;

          console.log("Received cloud update");
          setState(normalized);
          lastFromCloudRef.current = fromCloudStr;
          currentListVersionRef.current = incomingVer;
          setHydrated(true);
        });
      } catch (err) {
        console.error("Bootstrap sync (cloud-first) failed:", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSync.user, loading]);

  // ---- Debounced local -> cloud sync ----
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;

    const currentStr = JSON.stringify(safeState);
    if (currentStr === lastFromCloudRef.current) return;

    const t = setTimeout(async () => {
      try {
        await cloudSync.syncData(safeState);
        lastFromCloudRef.current = currentStr;
        currentListVersionRef.current = safeState.currentListVersion ?? 1;
      } catch (err) {
        console.error("Sync failed:", err);
      }
    }, 150);

    return () => clearTimeout(t);
  }, [safeState, cloudSync, hydrated, loading]);

  // ---- Flush pending on exit/background ----
  React.useEffect(() => {
    if (!cloudSync.user || !hydrated) return;

    const flush = async () => {
      try {
        const currentStr = JSON.stringify(safeState);
        if (currentStr !== lastFromCloudRef.current) {
          await cloudSync.syncData(safeState);
          lastFromCloudRef.current = currentStr;
          currentListVersionRef.current = safeState.currentListVersion ?? 1;
        }
      } catch (err) {
        console.warn("Failed to flush changes:", err);
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

  // ===== KEY FIX: Import handler — update locally first, suppress cloud, then sync EXACT object =====
  const handleImportExcel = React.useCallback(
    async (rows: AddressRow[]) => {
      const next: AppState = {
        ...state,
        addresses: Array.isArray(rows) ? rows : [],
        activeIndex: null,
        // Reset counters for the new list version
        completions: [] as Completion[],
        arrangements: state.arrangements as Arrangement[],
        daySessions: state.daySessions as DaySession[],
        currentListVersion: (state.currentListVersion || 1) + 1,
      };

      // 0) Enter a short "quarantine" window to ignore stale cloud snapshots
      suppressCloudUntilRef.current = Date.now() + 5000;

      // 1) Apply locally immediately (UI updates now)
      setState(next);

      // 2) Pre-seed refs so we ignore cloud echoes that don't match this snapshot
      const nextStr = JSON.stringify(next);
      lastFromCloudRef.current = nextStr;
      currentListVersionRef.current = next.currentListVersion ?? 1;

      // 3) Push same object to cloud (avoid race with React state)
      try {
        await cloudSync.syncData(next);
        // keep lastFromCloudRef as nextStr so the incoming echo is ignored as duplicate
      } catch (e) {
        console.warn("Import sync failed; debounce will retry.", e);
      }

      setSearch("");
    },
    [state, setState, cloudSync]
  );

  // Enhanced completion with optimistic updates
  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string) => {
      const optimisticId = `completion_${Date.now()}_${Math.random()}`;

      try {
        setOptimisticUpdates((prev) => {
          const updated = new Map(prev);
          updated.set(optimisticId, { type: "completion", index, outcome, amount });
          return updated;
        });

        complete(index, outcome, amount);

        if (cloudSync.queueOperation) {
          await cloudSync.queueOperation({
            type: "create",
            entity: "completion",
            entityId: optimisticId,
            data: {
              index,
              outcome,
              amount,
              address: addresses[index]?.address,
              listVersion: safeState.currentListVersion,
            },
          });
        }
      } catch (error) {
        console.error("Failed to complete address:", error);
        setOptimisticUpdates((prev) => {
          const updated = new Map(prev);
          updated.delete(optimisticId);
          return updated;
        });
      } finally {
        setTimeout(() => {
          setOptimisticUpdates((prev) => {
            const updated = new Map(prev);
            updated.delete(optimisticId);
            return updated;
          });
        }, 1000);
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

  // ----- Edit START time -----
  const handleEditStart = React.useCallback(
    (newStartISO: string | Date) => {
      const parsed =
        typeof newStartISO === "string" ? new Date(newStartISO) : newStartISO;
      if (Number.isNaN(parsed.getTime())) return;

      const newISO = parsed.toISOString();
      setState((s) => {
        const today = newISO.slice(0, 10);
        const idx = s.daySessions.findIndex((d) => d.date === today && !d.end);
        if (idx >= 0) {
          const arr = s.daySessions.slice();
          const sess: DaySession = { ...arr[idx], start: newISO };
          if (sess.end) {
            try {
              const start = new Date(sess.start).getTime();
              const end = new Date(sess.end).getTime();
              if (end > start)
                (sess as any).durationSeconds = Math.floor((end - start) / 1000);
            } catch {}
          }
          arr[idx] = sess;
          return { ...s, daySessions: arr };
        }
        return {
          ...s,
          daySessions: [...s.daySessions, { date: today, start: newISO }],
        };
      });
    },
    [setState]
  );

  // ----- Edit FINISH time -----
  const handleEditEnd = React.useCallback(
    (newEndISO: string | Date) => {
      const parsed =
        typeof newEndISO === "string" ? new Date(newEndISO) : newEndISO;
      if (Number.isNaN(parsed.getTime())) return;

      const endISO = parsed.toISOString();

      setState((s) => {
        const dayKey = endISO.slice(0, 10);
        const idx = s.daySessions.findIndex((d) => d.date === dayKey);
        const arr = s.daySessions.slice();

        if (idx >= 0) {
          const sess: DaySession = { ...arr[idx], end: endISO };
          if (sess.start) {
            try {
              const start = new Date(sess.start).getTime();
              const end = new Date(endISO).getTime();
              if (end > start) (sess as any).durationSeconds = Math.floor((end - start) / 1000);
            } catch {}
          }
          arr[idx] = sess;
        } else {
          arr.push({ date: dayKey, start: endISO, end: endISO, durationSeconds: 0 });
        }

        return { ...s, daySessions: arr };
      });
    },
    [setState]
  );

  // Finish Day with cloud snapshot
  const endDayWithBackup = React.useCallback(() => {
    const snap = backupState();
    uploadBackupToStorage(snap, "finish").catch((e: any) => {
      console.warn("Supabase storage backup (finish) failed:", e?.message || e);
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
      currentListVersionRef.current = data.currentListVersion ?? 1;
      setHydrated(true);
      alert("Restore completed successfully!");
    } catch (err: any) {
      console.error(err);
      alert("Restore failed: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  };

  // Stats for header pills (per current listVersion)
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
    const completed = completedIdx.size;
    return { total, pending, completed, pifCount, doneCount, daCount };
  }, [addresses, completions, state.currentListVersion]);

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

  // ----- Swipe handling -----
  const tabsOrder: Tab[] = ["list", "completed", "arrangements"];
  const tabIndex = tabsOrder.indexOf(tab);
  const goToNextTab = React.useCallback(() => {
    const i = tabsOrder.indexOf(tab);
    setTab(tabsOrder[(i + 1) % tabsOrder.length]);
  }, [tab]);
  const goToPrevTab = React.useCallback(() => {
    const i = tabsOrder.indexOf(tab);
    setTab(tabsOrder[(i - 1 + tabsOrder.length) % tabsOrder.length]);
  }, [tab]);

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const swipe = React.useRef({ x: 0, y: 0, t: 0, w: 1, active: false });

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const t = e.changedTouches[0];
    const w = viewportRef.current
      ? viewportRef.current.clientWidth
      : typeof window !== "undefined"
      ? window.innerWidth
      : 1;
    swipe.current = { x: t.clientX, y: t.clientY, t: Date.now(), w, active: true };
    setDragX(0);
    setDragging(true);
  };

  const getTransform = React.useCallback(() => {
    const tabCount = 3;
    const basePercent = (-tabIndex / tabCount) * 100;

    if (!dragging || !viewportRef.current) {
      return `translateX(${basePercent}%)`;
    }

    const viewportWidth = viewportRef.current.clientWidth;
    if (viewportWidth <= 0) {
      return `translateX(${basePercent}%)`;
    }

    const dragPercent = (dragX / viewportWidth) * 100;

    const atFirstTab = tabIndex === 0 && dragX > 0;
    const atLastTab = tabIndex === tabCount - 1 && dragX < 0;
    const dampening = atFirstTab || atLastTab ? 0.3 : 1;

    const finalPercent = basePercent + dragPercent * dampening;

    const minPercent = -100 * (tabCount - 1);
    const maxPercent = 10;
    const clampedPercent = Math.max(minPercent - 10, Math.min(maxPercent, finalPercent));

    return `translateX(${clampedPercent}%)`;
  }, [tabIndex, dragging, dragX]);

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (!swipe.current.active) return;
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipe.current.x;
    const dy = touch.clientY - swipe.current.y;

    if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;

    e.preventDefault();

    const viewportWidth = swipe.current.w;
    const maxDrag = viewportWidth * 0.5;
    const clampedDx = Math.max(-maxDrag, Math.min(maxDrag, dx));

    const atFirst = tabIndex === 0 && clampedDx > 0;
    const atLast = tabIndex === tabsOrder.length - 1 && clampedDx < 0;
    const dampening = atFirst || atLast ? 0.35 : 1;

    setDragX(clampedDx * dampening);
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (!swipe.current.active) return;
    swipe.current.active = false;

    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setDragX(0);
      setDragging(false);
      return;
    }

    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.current.x;
    const dy = t.clientY - swipe.current.y;
    const dt = Date.now() - swipe.current.t;
    const w = swipe.current.w;

    const quick = dt <= 600;
    const farPx = Math.abs(dx) >= 60;
    const farFrac = Math.abs(dx) / Math.max(1, w) >= 0.18;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;

    if (horizontal && (farPx || farFrac || quick)) {
      if (dx < 0 && tabIndex < tabsOrder.length - 1) goToNextTab();
      else if (dx > 0 && tabIndex > 0) goToPrevTab();
    }

    setDragX(0);
    setDragging(false);
  };

  // Manual sync
  const handleManualSync = React.useCallback(async () => {
    try {
      await cloudSync.syncData(safeState);
      lastFromCloudRef.current = JSON.stringify(safeState);
      currentListVersionRef.current = safeState.currentListVersion ?? 1;
    } catch (err) {
      console.error("Manual sync failed:", err);
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
              Arrangements ({arrangements.length})
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
              {/* Import with the fixed & guarded handler */}
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
            </div>
          </div>
        </div>
      )}

      {/* Tabs content with swipe */}
      <div
        ref={viewportRef}
        className="tabs-viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          overflowX: "hidden",
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          touchAction: "pan-y",
        }}
      >
        <div
          className="tabs-track"
          style={{
            display: "flex",
            width: "300%",
            maxWidth: "300%",
            willChange: "transform",
            transition: dragging ? "none" : "transform 280ms ease",
            transform: getTransform(),
            backfaceVisibility: "hidden",
            perspective: "1000px",
          }}
        >
          {/* Panel 1: List */}
          <section
            className="tab-panel"
            style={{
              flex: "0 0 33.333333%",
              minWidth: "33.333333%",
              maxWidth: "33.333333%",
              boxSizing: "border-box",
              overflowX: "hidden",
              padding: "0",
            }}
          >
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
              {cloudSync.lastSyncTime && (
                <span className="muted">
                  Last sync {cloudSync.lastSyncTime.toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Floating + Address button */}
            <ManualAddressFAB onAdd={addAddress} />
          </section>

          {/* Panel 2: Completed */}
          <section
            className="tab-panel"
            style={{
              flex: "0 0 33.333333%",
              minWidth: "33.333333%",
              maxWidth: "33.333333%",
              boxSizing: "border-box",
              overflowX: "hidden",
              padding: "0",
            }}
          >
            <Completed state={safeState} onChangeOutcome={handleChangeOutcome} />
          </section>

          {/* Panel 3: Arrangements */}
          <section
            className="tab-panel"
            style={{
              flex: "0 0 33.333333%",
              minWidth: "33.333333%",
              maxWidth: "33.333333%",
              boxSizing: "border-box",
              overflowX: "hidden",
              padding: "0",
            }}
          >
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
          </section>
        </div>
      </div>
    </div>
  );
}
