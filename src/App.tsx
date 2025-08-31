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
import type { AppState, Completion, Outcome, AddressRow } from "./types";

type Tab = "list" | "completed" | "arrangements";

// --- helper: normalize state from cloud/restore ---
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

// Simple error boundary
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

  const addresses = Array.isArray(state?.addresses) ? state.addresses : [];
  const completions = Array.isArray(state?.completions) ? state.completions : [];
  const arrangements = Array.isArray(state?.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state?.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({
      ...(state ?? {}),
      addresses,
      completions,
      arrangements,
      daySessions,
      currentListVersion:
        typeof (state as any)?.currentListVersion === "number"
          ? (state as any).currentListVersion
          : 1,
    }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // ---- Bootstrap cloud sync (push if local has data; always subscribe) ----
  React.useEffect(() => {
    if (!cloudSync.user || loading) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const localHasData =
        addresses.length > 0 ||
        completions.length > 0 ||
        arrangements.length > 0 ||
        daySessions.length > 0;

      try {
        if (localHasData) {
          await cloudSync.syncData(safeState as AppState);
          if (cancelled) return;
          lastFromCloudRef.current = JSON.stringify(safeState);
          setHydrated(true);
        }

        cleanup = cloudSync.subscribeToData((newState) => {
          if (!newState) return;
          const normalized = normalizeState(newState);
          const str = JSON.stringify(normalized);
          setState(normalized);
          setLastSyncTime(new Date());
          lastFromCloudRef.current = str;
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

  // ---- Auto push local changes -> cloud (debounced) ----
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;
    const currentStr = JSON.stringify(safeState);
    if (currentStr === lastFromCloudRef.current) return;

    const t = setTimeout(() => {
      cloudSync
        .syncData(safeState as AppState)
        .then(() => {
          setLastSyncTime(new Date());
          lastFromCloudRef.current = currentStr;
        })
        .catch((err: unknown) => console.error("Sync failed:", err));
    }, 400);

    return () => clearTimeout(t);
  }, [cloudSync.user, loading, hydrated, safeState, cloudSync]);

  // ----- Backup / Restore -----
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
      restoreState(data); // local
      await cloudSync.syncData(data as AppState); // cloud
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

  // ----- Stats -----
  const stats = React.useMemo(() => {
    const total = addresses.length;
    const completedCount = completions.length;
    const pending = total - completedCount;
    const pifCount = completions.filter((c: any) => c.outcome === "PIF").length;
    const doneCount = completions.filter((c: any) => c.outcome === "Done").length;
    const daCount = completions.filter((c: any) => c.outcome === "DA").length;
    const arrCount = completions.filter((c: any) => c.outcome === "ARR").length;
    return {
      total,
      completed: completedCount,
      pending,
      pifCount,
      doneCount,
      daCount,
      arrCount,
    };
  }, [addresses, completions]);

  // ----- Completed screen handlers -----
  const onChangeOutcome = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s) => {
        const list = Array.isArray(s.completions) ? s.completions.slice() : [];
        const pos = list.findIndex((c) => Number(c.index) === Number(index));
        if (pos === -1) return s;

        const current = list[pos];
        const updated: Completion = {
          ...current,
          outcome,
          amount: outcome === "PIF" ? amount : undefined,
          // keep original timestamp
        };
        list[pos] = updated;
        return { ...s, completions: list };
      });
    },
    [setState]
  );

  const onAddAddress = React.useCallback(
    async (row: AddressRow) => {
      const idx = await addAddress(row);
      return idx;
    },
    [addAddress]
  );

  const waitingForInitialData = !!cloudSync.user && !Array.isArray(state?.addresses);

  if (loading || waitingForInitialData) {
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
            <button
              className="tab-btn"
              aria-selected={tab === "list"}
              onClick={() => setTab("list")}
            >
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

      {/* Import & Tools */}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            background: "var(--surface)",
            padding: "1.5rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid",
            borderColor: "var(--border-light)",
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

            <div className="file-input-wrapper">
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
      </div>

      {/* Tabs */}
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
            endDay={endDay}
          />

          {/* Stats */}
          <div className="top-row">
            <div className="stat-item">
              <div className="stat-label">Total</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Pending</div>
              <div className="stat-value">{stats.pending}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">PIF</div>
              <div className="stat-value" style={{ color: "var(--success)" }}>
                {stats.pifCount}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Done</div>
              <div className="stat-value" style={{ color: "var(--primary)" }}>
                {stats.doneCount}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">DA</div>
              <div className="stat-value" style={{ color: "var(--danger)" }}>
                {stats.daCount}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">ARR</div>
              <div className="stat-value">{stats.arrCount}</div>
            </div>

            {safeState.activeIndex != null && (
              <div className="stat-item">
                <div className="stat-label">Active</div>
                <div className="stat-value" style={{ color: "var(--primary)" }}>
                  #{(safeState.activeIndex as number) + 1}
                </div>
              </div>
            )}
          </div>

          <AddressList
            state={safeState as AppState}
            setActive={setActive}
            cancelActive={cancelActive}
            complete={complete}
            onCreateArrangement={(i) => {
              setAutoCreateArrangementFor(i);
              setTab("arrangements");
            }}
            filterText={search}
          />

          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              background: "var(--bg-tertiary)",
              borderRadius: "var(--radius)",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            ⌨️ <strong>Shortcuts:</strong> ↑↓ Navigate • Enter Complete (or type 'ARR') • U Undo •
            S Start Day • E End Day
          </div>
        </>
      ) : tab === "completed" ? (
        <Completed
          state={safeState as AppState}
          onChangeOutcome={onChangeOutcome}
          onUndo={(i) => undo(i)}
        />
      ) : (
        <Arrangements
          state={safeState as AppState}
          onAddArrangement={addArrangement}
          onUpdateArrangement={updateArrangement}
          onDeleteArrangement={deleteArrangement}
          onAddAddress={onAddAddress}
          onComplete={complete}            // ✅ mark ARR completion on create
          autoCreateForAddress={autoCreateArrangementFor}
          onAutoCreateHandled={() => setAutoCreateArrangementFor(null)}
        />
      )}
    </div>
  );
}