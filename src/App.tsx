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

type Tab = "list" | "completed" | "arrangements";

// --- helper: make sure arrays exist so .length never crashes ---
function normalizeState(raw: any) {
  const r = raw ?? {};
  return {
    ...r,
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions: Array.isArray(r.completions) ? r.completions : [],
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    daySessions: Array.isArray(r.daySessions) ? r.daySessions : [],
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
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
          // ✅ Wrap to satisfy Auth prop type: Promise<void>
          onSignIn={async (email, password) => {
            await cloudSync.signIn(email, password);
          }}
          onSignUp={async (email, password) => {
            await cloudSync.signUp(email, password);
          }}
          // If you added a demo button in Auth, use:
          // onDemoSignIn={async () => { await cloudSync.signInDemo(); }}
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

  // --- derive safe arrays (never undefined) ---
  const addresses = Array.isArray(state?.addresses) ? state!.addresses : [];
  const completions = Array.isArray(state?.completions) ? state!.completions : [];
  const arrangements = Array.isArray(state?.arrangements) ? state!.arrangements : [];
  const daySessions = Array.isArray(state?.daySessions) ? state!.daySessions : [];

  // A safe state object to pass to children
  const safeState = React.useMemo(
    () => ({
      ...(state ?? {}),
      addresses,
      completions,
      arrangements,
      daySessions,
    }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // Auto-sync to cloud (debounced)
  React.useEffect(() => {
    if (!cloudSync.user || loading) return;
    const t = setTimeout(() => {
      cloudSync
        .syncData(safeState)
        .then(() => setLastSyncTime(new Date()))
        .catch((err: unknown) => console.error("Sync failed:", err));
    }, 800);
    return () => clearTimeout(t);
  }, [cloudSync.user, loading, safeState, cloudSync]);

  // Subscribe to cloud changes
  React.useEffect(() => {
    if (!cloudSync.user) return;
    const unsub = cloudSync.subscribeToData((newState) => {
      if (newState) {
        setState(normalizeState(newState));
        setLastSyncTime(new Date());
      }
    });
    return unsub;
  }, [cloudSync.user, cloudSync, setState]);

  // Handle arrangement creation from address list
  const handleCreateArrangement = React.useCallback((addressIndex: number) => {
    setAutoCreateArrangementFor(addressIndex);
    setTab("arrangements");
  }, []);

  // Visible rows + helpers
  const completedIdx = React.useMemo(
    () => new Set(completions.map((c: any) => c.index)),
    [completions]
  );
  const lowerQ = (search ?? "").trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      addresses
        .map((a: any, i: number) => ({ a, i }))
        .filter(({ a }) => !lowerQ || (a.address ?? "").toLowerCase().includes(lowerQ))
        .filter(({ i }) => !completedIdx.has(i)),
    [addresses, lowerQ, completedIdx]
  );
  const hasActiveSession = daySessions.some((d: any) => !d.end);

  const doQuickComplete = React.useCallback(
    (i: number) => {
      const input = window.prompt(
        "Quick Complete:\n\n• Leave empty → Done\n• Type 'DA' → Mark as DA\n• Type a number (e.g. 50) → PIF £amount\n• Type 'ARR' → Create Arrangement"
      );
      if (input === null) return;
      const text = input.trim();
      if (!text) {
        complete(i, "Done");
      } else if (text.toUpperCase() === "DA") {
        complete(i, "DA");
      } else if (text.toUpperCase() === "ARR") {
        setTab("arrangements");
        setTimeout(() => {
          const event = new CustomEvent("auto-create-arrangement", {
            detail: { addressIndex: i },
          });
          window.dispatchEvent(event);
        }, 100);
      } else {
        const n = Number(text);
        if (Number.isFinite(n) && n > 0) {
          complete(i, "PIF", n.toFixed(2));
        } else {
          alert(
            "Invalid amount. Use a number (e.g., 50) or type 'DA', type 'ARR' for arrangement, or leave blank for Done."
          );
        }
      }
    },
    [complete]
  );

  // Keyboard shortcuts (List tab only)
  React.useEffect(() => {
    if (tab !== "list") return;
    const isTypingTarget = (el: EventTarget | null) => {
      if (!el || !(el as HTMLElement)) return false;
      const t = el as HTMLElement;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
    };
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (visible.length === 0) return;

        const pos =
          safeState.activeIndex != null
            ? visible.findIndex(({ i }) => i === safeState.activeIndex)
            : -1;

        if (e.key === "ArrowDown") {
          const nextPos = pos >= 0 ? (pos + 1) % visible.length : 0;
          setActive(visible[nextPos].i);
        } else {
          const prevPos =
            pos >= 0 ? (pos - 1 + visible.length) % visible.length : visible.length - 1;
          setActive(visible[prevPos].i);
        }
        return;
      }

      if (e.key === "Enter") {
        if (safeState.activeIndex != null) {
          e.preventDefault();
          doQuickComplete(safeState.activeIndex);
        }
        return;
      }

      if (e.key === "u" || e.key === "U") {
        const latest = completions[0];
        if (latest) {
          e.preventDefault();
          undo(latest.index);
        }
        return;
      }

      if (e.key === "s" || e.key === "S") {
        if (!hasActiveSession) {
          e.preventDefault();
          startDay();
        }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        if (hasActiveSession) {
          e.preventDefault();
          endDay();
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, visible, safeState.activeIndex, completions, hasActiveSession, setActive, undo, doQuickComplete, startDay, endDay]);

  // Backup / Restore
  const onBackup = () => {
    const snap = backupState();
    const stamp = new Date();
    const y = String(stamp.getFullYear());
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    downloadJson(`navigator-backup-${y}${m}${d}.json`, snap);
  };

  // Push restored data to cloud immediately
  const onRestore: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await readJsonFile(file);
      const data = normalizeState(raw);
      restoreState(data);             // local
      await cloudSync.syncData(data); // cloud (authoritative)
      alert("✅ Restore completed successfully!");
    } catch (err: any) {
      console.error(err);
      alert(`❌ Restore failed: ${err?.message || err}`);
    } finally {
      e.target.value = "";
    }
  };

  // Stats (use safe arrays)
  const stats = React.useMemo(() => {
    const total = addresses.length;
    const completedCount = completions.length;
    const pending = total - completedCount;
    const pifCount = completions.filter((c: any) => c.outcome === "PIF").length;
    const doneCount = completions.filter((c: any) => c.outcome === "Done").length;
    const daCount = completions.filter((c: any) => c.outcome === "DA").length;
    return { total, completed: completedCount, pending, pifCount, doneCount, daCount };
  }, [addresses, completions]);

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
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 className="app-title">📍 Address Navigator</h1>

          {/* Sync Status */}
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

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* User Info */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            <span>👤 {cloudSync.user?.email ?? "Signed in"}</span>
            <button className="btn btn-ghost btn-sm" onClick={cloudSync.signOut} title="Sign out">
              🚪 Sign Out
            </button>
          </div>

          <div className="tabs">
            <button className="tab-btn" aria-selected={tab === "list"} onClick={() => setTab("list")}>
              📋 List ({stats.pending})
            </button>
            <button className="tab-btn" aria-selected={tab === "completed"} onClick={() => setTab("completed")}>
              ✅ Completed ({stats.completed})
            </button>
            <button className="tab-btn" aria-selected={tab === "arrangements"} onClick={() => setTab("arrangements")}>
              📅 Arrangements ({arrangements.length})
            </button>
          </div>
        </div>
      </header>

      {/* Import & Tools */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--surface)", padding: "1.5rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: "1.5" }}>
            📁 Load an Excel file with <strong>address</strong>, optional <strong>lat</strong>, <strong>lng</strong> columns to get started.
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
            <div className="stat-item"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
            <div className="stat-item"><div className="stat-label">Pending</div><div className="stat-value">{stats.pending}</div></div>
            <div className="stat-item"><div className="stat-label">PIF</div><div className="stat-value" style={{ color: "var(--success)" }}>{stats.pifCount}</div></div>
            <div className="stat-item"><div className="stat-label">Done</div><div className="stat-value" style={{ color: "var(--primary)" }}>{stats.doneCount}</div></div>
            <div className="stat-item"><div className="stat-label">DA</div><div className="stat-value" style={{ color: "var(--danger)" }}>{stats.daCount}</div></div>

            {safeState.activeIndex != null && (
              <div className="stat-item">
                <div className="stat-label">Active</div>
                <div className="stat-value" style={{ color: "var(--primary)" }}>#{(safeState.activeIndex as number) + 1}</div>
              </div>
            )}
          </div>

          <AddressList
            state={safeState}
            setActive={setActive}
            cancelActive={cancelActive}
            complete={complete}
            onCreateArrangement={handleCreateArrangement}
            filterText={search}
          />

          <div style={{ marginTop: "2rem", padding: "1rem", background: "var(--bg-tertiary)", borderRadius: "var(--radius)", fontSize: "0.8125rem", color: "var(--text-muted)", textAlign: "center" }}>
            ⌨️ <strong>Shortcuts:</strong> ↑↓ Navigate • Enter Complete (or type 'ARR') • U Undo • S Start Day • E End Day
          </div>
        </>
      ) : tab === "completed" ? (
        <Completed state={safeState} />
      ) : (
        <Arrangements
          state={safeState}
          onAddArrangement={addArrangement}
          onUpdateArrangement={updateArrangement}
          onDeleteArrangement={deleteArrangement}
          autoCreateForAddress={autoCreateArrangementFor}
          onAutoCreateHandled={() => setAutoCreateArrangementFor(null)}
        />
      )}
    </div>
  );
}
