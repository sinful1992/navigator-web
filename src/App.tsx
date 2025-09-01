import * as React from "react";
import "./App.css";
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";
import { Auth } from "./Auth";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import { DayPanel } from "./DayPanel";
import { Arrangements } from "./Arrangements";
import { downloadJson, readJsonFile } from "./backup";
import type { AddressRow, Outcome } from "./types";
import { supabase } from "./lib/supabaseClient";

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

/** Error boundary keeps the UI from going blank on runtime errors */
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

/** Upload a JSON snapshot to Supabase Storage; log a row in `backups` (quietly no-ops if not configured) */
async function uploadBackupToStorage(
  data: unknown,
  label: "finish" | "manual" = "manual"
) {
  if (!supabase) return;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
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

  const bucket = (import.meta as any).env?.VITE_SUPABASE_BUCKET ?? "navigator-backups";
  const name = `backup_${dayKey}_${time}_${label}.json`;
  const objectPath = `${userId}/${dayKey}/${name}`;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(objectPath, blob, { upsert: false, contentType: "application/json" });
  if (upErr) throw new Error(upErr.message);

  try {
    await supabase.from("backups").insert({
      user_id: userId,
      day_key: dayKey,
      object_path: objectPath,
      size_bytes: blob.size,
    });
  } catch (e) {
    console.warn("Backups table insert failed (non-fatal):", (e as any)?.message || e);
  }

  return objectPath;
}

export default function App() {
  const cloudSync = useCloudSync();

  if (cloudSync.isLoading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Restoring session…
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
  } = useAppState();

  const cloudSync = useCloudSync();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] =
    React.useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const arrangements = Array.isArray(state.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...state, addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // Bootstrap: prefer local if present; always subscribe to cloud updates
  React.useEffect(() => {
    if (!cloudSync.user || loading) return;
    let cleanup: undefined | (() => void);
    let cancelled = false;

    (async () => {
      try {
        const localHasData =
          addresses.length > 0 ||
          completions.length > 0 ||
          arrangements.length > 0 ||
          daySessions.length > 0;

        if (localHasData) {
          await cloudSync.syncData(safeState);
          if (!cancelled) {
            lastFromCloudRef.current = JSON.stringify(safeState);
            setHydrated(true);
          }
        }

        cleanup = cloudSync.subscribeToData((newState) => {
          if (!newState) return;
          const normalized = normalizeState(newState);
          setState(normalized);
          setLastSyncTime(new Date());
          lastFromCloudRef.current = JSON.stringify(normalized);
          setHydrated(true);
        });
      } catch (err) {
        console.error("Bootstrap sync failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSync.user, loading]);

  // Debounced push local -> cloud
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;

    const currentStr = JSON.stringify(safeState);
    if (currentStr === lastFromCloudRef.current) return;

    const t = setTimeout(() => {
      cloudSync
        .syncData(safeState)
        .then(() => {
          setLastSyncTime(new Date());
          lastFromCloudRef.current = currentStr;
        })
        .catch((err) => console.error("Sync failed:", err));
    }, 400);

    return () => clearTimeout(t);
  }, [safeState, cloudSync, hydrated, loading]);

  const handleCreateArrangement = React.useCallback((addressIndex: number) => {
    setAutoCreateArrangementFor(addressIndex);
  }, []);

  // Ensure a session exists when Navigation is used
  const ensureDayStarted = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
  }, [daySessions, startDay]);

  // DayPanel -> edit today's start time
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
          const sess = { ...arr[idx], start: newISO };
          if (sess.end) {
            try {
              const start = new Date(sess.start).getTime();
              const end = new Date(sess.end).getTime();
              if (end > start) sess.durationSeconds = Math.floor((end - start) / 1000);
            } catch {}
          }
          arr[idx] = sess;
          return { ...s, daySessions: arr };
        }
        return { ...s, daySessions: [...s.daySessions, { date: today, start: newISO }] };
      });
    },
    [setState]
  );

  // Finish Day with cloud backup (non-blocking)
  const endDayWithBackup = React.useCallback(() => {
    const snap = backupState();
    uploadBackupToStorage(snap, "finish").catch((e: any) => {
      console.warn("Supabase storage backup (finish) failed:", e?.message || e);
    });
    endDay();
  }, [backupState, endDay]);

  // Wrap undo for onClick type
  const handleUndoClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    undo(-1);
  };

  // Handle manual backup (local download + optional cloud upload)
  const onBackup = React.useCallback(async () => {
    const snap = backupState();
    const stamp = new Date();
    const y = String(stamp.getFullYear());
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    const hh = String(stamp.getHours()).padStart(2, "0");
    const mm = String(stamp.getMinutes()).padStart(2, "0");
    downloadJson(`navigator-backup-${y}${m}${d}-${hh}${mm}.json`, snap);
    try {
      await uploadBackupToStorage(snap, "manual");
    } catch (e: any) {
      console.warn("Supabase storage backup failed:", e?.message || e);
    }
  }, [backupState]);

  // Restore from file
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
      alert("✅ Restore completed successfully!");
    } catch (err: any) {
      console.error(err);
      alert(`❌ Restore failed: ${err?.message || err}`);
    } finally {
      e.target.value = "";
    }
  };

  // Stats
  const stats = React.useMemo(() => {
    const currentVer = state.currentListVersion;
    const completedIdx = new Set(
      completions.filter((c) => c.listVersion === currentVer).map((c) => c.index)
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

  // Required by Completed: allow changing a completion’s outcome (by completion index)
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
        comps[targetCompletionIndex] = { ...comps[targetCompletionIndex], outcome, amount };
        return { ...s, completions: comps };
      });
    },
    [setState]
  );

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Preparing your workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <div className="left">
          <h1 className="app-title">📍 Address Navigator</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            {cloudSync.isOnline ? (
              <>
                <span style={{ color: "var(--success)" }}>🟢</span>
                Online
              </>
            ) : (
              <>
                <span style={{ color: "var(--warning)" }}>🟡</span>
                Offline
              </>
            )}
          </div>
        </div>

        <div className="right">
          <div className="user-chip" role="group" aria-label="Account">
            <span className="avatar" aria-hidden>
              👤
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
              📋 List ({stats.pending})
            </button>
            <button
              className="tab-btn"
              aria-selected={tab === "completed"}
              onClick={() => setTab("completed")}
            >
              ✅ Completed ({stats.completed})
            </button>
            <button
              className="tab-btn"
              aria-selected={tab === "arrangements"}
              onClick={() => setTab("arrangements")}
            >
              📅 Arrangements ({arrangements.length})
            </button>
          </div>
        </div>
      </header>

      {/* Tools */}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            background: "var(--surface)",
            padding: "1.5rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-sm)",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              marginBottom: "1rem",
              lineHeight: "1.5",
            }}
          >
            📁 Load an Excel file with <strong>address</strong>, optional <strong>lat</strong>,{" "}
            <strong>lng</strong> columns to get started.
          </div>

          <div className="btn-row">
            <ImportExcel onImported={setAddresses} />
            <div className="btn-spacer" />
            <button className="btn btn-ghost" onClick={onBackup}>
              💾 Backup
            </button>

            <input
              type="file"
              accept="application/json"
              onChange={onRestore}
              className="file-input"
              id="restore-input"
            />
            <label htmlFor="restore-input" className="file-input-label">
              📤 Restore
            </label>
          </div>
        </div>
      </div>

      {/* Tabs content */}
      {tab === "list" ? (
        <>
          <div className="search-container">
            <input
              type="search"
              value={search}
              placeholder="🔍 Search addresses..."
              onChange={(e) => setSearch(e.target.value)}
              className="input search-input"
            />
          </div>

          <DayPanel
            sessions={daySessions}
            completions={completions}
            startDay={startDay}
            endDay={endDayWithBackup}
            onEditStart={handleEditStart}
          />

          <AddressList
            state={safeState}
            setActive={setActive}
            cancelActive={cancelActive}
            onComplete={complete}
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
            <button className="btn btn-ghost" onClick={handleUndoClick} title="Undo last completion for this list">
              ⎌ Undo Last
            </button>
            <span className="pill pill-pif">PIF {stats.pifCount}</span>
            <span className="pill pill-done">Done {stats.doneCount}</span>
            <span className="pill pill-da">DA {stats.daCount}</span>
            {lastSyncTime && <span>• Last sync {lastSyncTime.toLocaleTimeString()}</span>}
          </div>
        </>
      ) : tab === "completed" ? (
        <Completed state={safeState} onChangeOutcome={handleChangeOutcome} />
      ) : (
        <Arrangements
          state={safeState}
          onAddArrangement={addArrangement}
          onUpdateArrangement={updateArrangement}
          onDeleteArrangement={deleteArrangement}
          onAddAddress={async (addr: AddressRow) => addAddress(addr)}
          onComplete={complete}
          autoCreateForAddress={autoCreateArrangementFor}
          onAutoCreateHandled={() => setAutoCreateArrangementFor(null)}
        />
      )}
    </div>
  );
}