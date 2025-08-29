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
type Outcome = "Done" | "DA" | "PIF";

// ---- helpers ---------------------------------------------------------------

function normalizeState(raw: any) {
  const r = raw ?? {};
  return {
    ...r,
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions: Array.isArray(r.completions) ? r.completions : [],
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    daySessions: Array.isArray(r.daySessions) ? r.daySessions : [],
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null, // per-device
  };
}

/** Build the object we actually send to the cloud (exclude per-device fields). */
function toCloudPayload(state: any) {
  const s = normalizeState(state);
  const { activeIndex, ...rest } = s;
  return rest;
}

/** Merge local → remote without losing work made on another device. */
function mergeStates(remote: any, local: any) {
  const R = normalizeState(remote);
  const L = normalizeState(local);

  // Addresses: prefer any non-empty remote list, otherwise local
  const addresses =
    (R.addresses?.length ?? 0) >= (L.addresses?.length ?? 0) ? R.addresses : L.addresses;

  // Completions: union by index, prefer newer timestamp if present
  const byIndex = new Map<number, any>();
  const put = (c: any) => {
    const idx = Number(c?.index);
    if (!Number.isFinite(idx)) return;
    const prev = byIndex.get(idx);
    if (!prev) {
      byIndex.set(idx, c);
    } else {
      const pt = Number(new Date(prev.ts || prev.time || 0));
      const nt = Number(new Date(c.ts || c.time || 0));
      if (nt > pt) byIndex.set(idx, c);
    }
  };
  (R.completions || []).forEach(put);
  (L.completions || []).forEach(put);
  const completions = Array.from(byIndex.values()).sort(
    (a, b) => Number(new Date(b.ts || b.time || 0)) - Number(new Date(a.ts || a.time || 0))
  );

  // Day sessions: merge by (id || start)
  const dsKey = (d: any) => String(d?.id ?? d?.start ?? JSON.stringify(d ?? {}));
  const dsMap = new Map<string, any>();
  for (const d of R.daySessions || []) dsMap.set(dsKey(d), d);
  for (const d of L.daySessions || []) {
    const k = dsKey(d);
    const r = dsMap.get(k);
    if (!r) dsMap.set(k, d);
    else {
      if (r.end && !d.end) continue;
      if (!r.end && d.end) dsMap.set(k, d);
      else {
        const rt = Number(new Date(r.start || 0));
        const lt = Number(new Date(d.start || 0));
        if (lt >= rt) dsMap.set(k, d);
      }
    }
  }
  const daySessions = Array.from(dsMap.values()).sort(
    (a, b) => Number(new Date(a.start || 0)) - Number(new Date(b.start || 0))
  );

  // Arrangements: merge by (id || address+date), prefer newer updatedAt/ts
  const arrKey = (x: any) => String(x?.id ?? `${x?.address ?? ""}#${x?.date ?? ""}`);
  const am = new Map<string, any>();
  for (const a of R.arrangements || []) am.set(arrKey(a), a);
  for (const a of L.arrangements || []) {
    const k = arrKey(a);
    const r = am.get(k);
    if (!r) am.set(k, a);
    else {
      const rt = Number(new Date(r.updatedAt || r.ts || 0));
      const lt = Number(new Date(a.updatedAt || a.ts || 0));
      if (lt >= rt) am.set(k, a);
    }
  }
  const arrangements = Array.from(am.values());

  return { ...R, addresses, completions, daySessions, arrangements };
}

// Simple error boundary (avoid blank screen)
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

// ---- App -------------------------------------------------------------------

export default function App() {
  const cloud = useCloudSync();

  if (cloud.isLoading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Restoring session…
        </div>
      </div>
    );
  }

  if (!cloud.user) {
    return (
      <ErrorBoundary>
        <Auth
          onSignIn={async (email, password) => {
            await cloud.signIn(email, password);
          }}
          onSignUp={async (email, password) => {
            await cloud.signUp(email, password);
          }}
          isLoading={cloud.isLoading}
          error={cloud.error}
          onClearError={cloud.clearError}
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

  const cloud = useCloudSync();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] =
    React.useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | null>(null);

  // hydration & baseline
  const [hydrated, setHydrated] = React.useState(false);
  const lastRemoteRef = React.useRef<any | null>(null); // parsed remote snapshot

  // Safe slices
  const addresses = Array.isArray(state?.addresses) ? state.addresses : [];
  const completions = Array.isArray(state?.completions) ? state.completions : [];
  const arrangements = Array.isArray(state?.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state?.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...(state ?? {}), addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // ---- Subscribe first; do not push on mount --------------------------------
  React.useEffect(() => {
    if (!cloud.user) return;
    let unsub: (() => void) | undefined;

    const onRemote = (remote: any) => {
      const normalized = normalizeState(remote);
      lastRemoteRef.current = toCloudPayload(normalized); // baseline
      setState((prev: any) => ({ ...normalized, activeIndex: prev?.activeIndex ?? null }));
      setLastSyncTime(new Date());
      setHydrated(true);
    };

    try {
      unsub = cloud.subscribeToData(onRemote);
    } catch (e) {
      console.error("subscribe failed:", e);
    }

    const t = setTimeout(() => {
      if (!hydrated) {
        lastRemoteRef.current = null;
        setHydrated(true);
      }
    }, 2000);

    return () => {
      clearTimeout(t);
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.user]);

  // ---- Debounced push with MERGE against latest remote ----------------------
  React.useEffect(() => {
    if (!cloud.user || loading || !hydrated) return;

    const payloadLocal = toCloudPayload(safeState);
    const payloadMerged = mergeStates(lastRemoteRef.current ?? {}, payloadLocal);

    const localStr = JSON.stringify(payloadMerged);
    const remoteStr = JSON.stringify(lastRemoteRef.current ?? {});
    if (localStr === remoteStr) return;

    const t = setTimeout(async () => {
      try {
        await cloud.syncData(payloadMerged);
        lastRemoteRef.current = payloadMerged; // advance baseline
        setLastSyncTime(new Date());
      } catch (err) {
        console.error("sync failed:", err);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [cloud.user, loading, hydrated, safeState, cloud]);

  // ----- UI helpers ----------------------------------------------------------
  const handleCreateArrangement = React.useCallback((addressIndex: number) => {
    setAutoCreateArrangementFor(addressIndex);
    setTab("arrangements");
  }, []);

  const completedIdx = React.useMemo(
    () => new Set(completions.map((c: any) => Number(c.index))),
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
  }, [
    tab,
    visible,
    safeState.activeIndex,
    completions,
    hasActiveSession,
    setActive,
    undo,
    startDay,
    endDay,
  ]);

  // ----- Backup / Restore ----------------------------------------------------
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
      const merged = mergeStates(lastRemoteRef.current ?? {}, toCloudPayload(data));
      await cloud.syncData(merged);
      lastRemoteRef.current = merged;
      setHydrated(true);
      alert("✅ Restore completed successfully!");
    } catch (err: any) {
      console.error(err);
      alert(`❌ Restore failed: ${err?.message || err}`);
    } finally {
      e.target.value = "";
    }
  };

  // ----- Stats ---------------------------------------------------------------
  const stats = React.useMemo(() => {
    const total = addresses.length;
    const completedCount = completions.length;
    const pending = total - completedCount;
    const pifCount = completions.filter((c: any) => c.outcome === "PIF").length;
    const doneCount = completions.filter((c: any) => c.outcome === "Done").length;
    const daCount = completions.filter((c: any) => c.outcome === "DA").length;
    return { total, completed: completedCount, pending, pifCount, doneCount, daCount };
  }, [addresses, completions]);

  const waitingForInitialData = !!cloud.user && !Array.isArray(state?.addresses);

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

  // ---- UI -------------------------------------------------------------------
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
            {cloud.isOnline ? (
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
            <span className="email" title={cloud.user?.email ?? ""}>
              {cloud.user?.email ?? "Signed in"}
            </span>
            <button className="signout-btn" onClick={cloud.signOut} title="Sign out">
              Sign Out
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
            <button className="btn btn-ghost" onClick={onBackup}>💾 Backup</button>

            <div className="file-input-wrapper">
              <input
                type="file"
                accept="application/json"
                onChange={onRestore}
                className="file-input"
                id="restore-input"
              />
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

          <DayPanel sessions={daySessions} completions={completions} startDay={startDay} endDay={endDay} />

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
                <div className="stat-value" style={{ color: "var(--primary)" }}>
                  #{(safeState.activeIndex as number) + 1}
                </div>
              </div>
            )}
          </div>

          <AddressList
            state={safeState}
            setActive={setActive}
            cancelActive={cancelActive}
            complete={(i: number, outcome: Outcome, amount?: string) => {
              // call the state action; it should record timestamp internally
              complete(i, outcome, amount);
            }}
            onCreateArrangement={handleCreateArrangement}
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
            ⌨️ <strong>Shortcuts:</strong> ↑↓ Navigate • U Undo • S Start Day • E End Day
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