// src/App.tsx
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
import type { Outcome, Completion, AddressRow } from "./types";

type Tab = "list" | "completed" | "arrangements";

// normalize helper
function normalizeState(raw: any) {
  const r = raw ?? {};
  return {
    ...r,
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions: Array.isArray(r.completions) ? r.completions : [],
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    daySessions: Array.isArray(r.daySessions) ? r.daySessions : [],
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
    currentListVersion: typeof r.currentListVersion === "number" ? r.currentListVersion : 1,
  };
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; msg?: string }> {
  constructor(p: any) {
    super(p);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: String(err) };
  }
  componentDidCatch(err: unknown, info: unknown) {
    console.error("Render error:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
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
          onSignIn={async (email, password) => { await cloudSync.signIn(email, password); }}
          onSignUp={async (email, password) => { await cloudSync.signUp(email, password); }}
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
    setState,
    setAddresses,
    addAddress,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
    editStartForDate, // ✅
    backupState,
    restoreState,
    addArrangement,
    updateArrangement,
    deleteArrangement,
  } = useAppState();

  const cloudSync = useCloudSync();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] = React.useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const lastFromCloudRef = React.useRef<string | null>(null);

  const addresses = Array.isArray(state?.addresses) ? state.addresses : [];
  const completions = Array.isArray(state?.completions) ? state.completions : [];
  const arrangements = Array.isArray(state?.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state?.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...(state ?? {}), addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // cloud bootstrap
  React.useEffect(() => {
    if (!cloudSync.user || loading) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const localHasData =
        addresses.length > 0 || completions.length > 0 || arrangements.length > 0 || daySessions.length > 0;

      try {
        if (localHasData) {
          await cloudSync.syncData(safeState);
          if (cancelled) return;
          lastFromCloudRef.current = JSON.stringify(safeState);
          setHydrated(true);
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

  // debounced push
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
  }, [cloudSync.user, loading, hydrated, safeState, cloudSync]);

  // stats
  const stats = React.useMemo(() => {
    const total = addresses.length;
    const completedCount = completions.length;
    const pending = total - completedCount;
    const pifCount = completions.filter((c) => c.outcome === "PIF").length;
    const doneCount = completions.filter((c) => c.outcome === "Done").length;
    const daCount = completions.filter((c) => c.outcome === "DA").length;
    return { total, completed: completedCount, pending, pifCount, doneCount, daCount };
  }, [addresses, completions]);

  // import / backup / restore
  const onBackup = () => {
    const snap = backupState();
    const stamp = new Date();
    const y = String(stamp.getFullYear());
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    downloadJson(`navigator-backup-${y}${m}${d}.json`, snap);
  };

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

  // ensure day starts on first navigate of the calendar day
  const ensureDayStarted = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
  }, [daySessions, startDay]);

  // Finish day + auto-backup (give React a tick to write end time)
  const finishDayWithBackup = React.useCallback(() => {
    endDay();
    setTimeout(() => {
      const snap = backupState();
      const t = new Date();
      const fmt = (n: number) => String(n).padStart(2, "0");
      const fname = `navigator-backup-${t.getFullYear()}${fmt(t.getMonth() + 1)}${fmt(t.getDate())}-${fmt(
        t.getHours()
      )}${fmt(t.getMinutes())}.json`;
      downloadJson(fname, snap);
    }, 200);
  }, [endDay, backupState]);

  // arrangement from list
  const handleCreateArrangement = React.useCallback((addressIndex: number) => {
    setAutoCreateArrangementFor(addressIndex);
    setTab("arrangements");
  }, []);

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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {cloudSync.isOnline ? (
              <>
                <span style={{ color: "var(--success)" }}>🟢</span>
                Online
                {lastSyncTime && <span>• Last sync {lastSyncTime.toLocaleTimeString()}</span>}
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
            <span className="avatar" aria-hidden>👤</span>
            <span className="email" title={cloudSync.user?.email ?? ""}>{cloudSync.user?.email ?? "Signed in"}</span>
            <button className="signout-btn" onClick={cloudSync.signOut} title="Sign out">Sign Out</button>
          </div>

          <nav className="tabs" aria-label="Primary">
            <button className="tab-btn" aria-selected={tab === "list"} onClick={() => setTab("list")}>📋 List ({stats.pending})</button>
            <button className="tab-btn" aria-selected={tab === "completed"} onClick={() => setTab("completed")}>✅ Completed ({stats.completed})</button>
            <button className="tab-btn" aria-selected={tab === "arrangements"} onClick={() => setTab("arrangements")}>📅 Arrangements ({arrangements.length})</button>
          </nav>
        </div>
      </header>

      {/* Tools */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--surface)", padding: "1.5rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: "1.5" }}>
            📁 Load an Excel file with <strong>address</strong>, optional <strong>lat</strong>, <strong>lng</strong>.
          </div>
          <div className="btn-row">
            <ImportExcel onImported={setAddresses} />
            <div className="btn-spacer" />
            <button className="btn btn-ghost" onClick={onBackup}>💾 Backup</button>
            <div className="file-input-wrapper">
              <input type="file" accept="application/json" onChange={onRestore} className="file-input" id="restore-input" />
              <label htmlFor="restore-input" className="file-input-label">📤 Restore</label>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      {tab === "list" ? (
        <>
          <div className="search-container">
            <input type="search" value={search} placeholder="🔍 Search addresses..." onChange={(e) => setSearch(e.target.value)} className="input search-input" />
          </div>

          <DayPanel
            sessions={daySessions}
            completions={completions}
            startDay={startDay}
            endDay={finishDayWithBackup}          // ✅ backup when finishing
            onEditStart={editStartForDate}        // ✅ allow editing start time
          />

          {/* (your stats & list) */}
          <AddressList
            state={safeState}
            setActive={setActive}
            cancelActive={cancelActive}
            complete={complete}
            onCreateArrangement={handleCreateArrangement}
            filterText={search}
            ensureDayStarted={ensureDayStarted}   // ✅ auto-start on first navigate
          />
        </>
      ) : tab === "completed" ? (
        <Completed state={safeState} onChangeOutcome={(index, o, amount) => {
          setState((s) => {
            const arr = s.completions.slice();
            const pos = arr.findIndex((c) => Number(c.index) === Number(index));
            if (pos === -1) return s;
            const old = arr[pos];
            arr[pos] = { ...old, outcome: o, amount: o === "PIF" ? amount : undefined };
            return { ...s, completions: arr };
          });
        }} onUndo={undo} />
      ) : (
        <Arrangements
          state={safeState}
          onAddArrangement={addArrangement}
          onUpdateArrangement={updateArrangement}
          onDeleteArrangement={deleteArrangement}
          onAddAddress={async (addr: AddressRow) => addAddress(addr)}
          autoCreateForAddress={autoCreateArrangementFor}
          onAutoCreateHandled={() => setAutoCreateArrangementFor(null)}
        />
      )}
    </div>
  );
}