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
import type { AddressRow } from "./types";
import { supabase } from "./lib/supabaseClient"; // ✅ added

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

/** Simple error boundary to avoid blank screen */
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

/** ✅ Minimal helper: upload a JSON snapshot to Supabase Storage */
async function uploadBackupToStorage(
  data: unknown,
  label: "finish" | "manual" = "manual"
) {
  const bucket = (import.meta as any).env?.VITE_SUPABASE_BUCKET ?? "navigator-backups";
  if (!supabase) throw new Error("Supabase client not configured");

  const tz = "Europe/London";
  const now = new Date();
  const yyyy = now.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  const mm = now.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
  const dd = now.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
  const time = now
    .toLocaleTimeString("en-GB", { timeZone: tz, hour12: false })
    .replace(/:/g, "");
  const name = `backup_${yyyy}-${mm}-${dd}_${time}_${label}.json`;

  const file = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const { error } = await supabase.storage.from(bucket).upload(name, file, {
    upsert: false,
    contentType: "application/json",
  });
  if (error) throw new Error(error.message);
  return name;
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
          onSignOut={async () => {
            await cloudSync.signOut();
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <InnerApp />
    </ErrorBoundary>
  );
}

function InnerApp() {
  const {
    state,
    loading,
    hydrated,
    setHydrated,
    setAddresses,
    addAddress,
    setActive,
    cancelActive,
    complete,
    createSessionIfMissing,
    // day sessions
    addSession,
    endDay,
    setStartTime,
    setEndTime,
    ensureDayStarted,
    // arrangements
    addArrangement,
    updateArrangement,
    deleteArrangement,
  } = useAppState();

  const cloudSync = useCloudSync();
  const [tab, setTab] = React.useState<Tab>("list");
  const [filter, setFilter] = React.useState("");
  const [autoCreateArrangementFor, setAutoCreateArrangementFor] =
    React.useState<number | null>(null);
  const lastFromCloudRef = React.useRef<string | null>(null);

  const addresses = Array.isArray(state?.addresses) ? state.addresses : [];
  const completions = Array.isArray(state?.completions) ? state.completions : [];
  const arrangements = Array.isArray(state?.arrangements) ? state.arrangements : [];
  const daySessions = Array.isArray(state?.daySessions) ? state.daySessions : [];

  const safeState = React.useMemo(
    () => ({ ...(state ?? {}), addresses, completions, arrangements, daySessions }),
    [state, addresses, completions, arrangements, daySessions]
  );

  // ---- Cloud sync bootstrap ----
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
          await cloudSync.syncData(safeState);
          if (cancelled) return;
          lastFromCloudRef.current = JSON.stringify(safeState);
          setHydrated(true);
        } else {
          const fromCloud = await cloudSync.getLatest();
          if (cancelled) return;
          if (fromCloud) {
            await cloudSync.applyCloudState(fromCloud);
            lastFromCloudRef.current = JSON.stringify(fromCloud);
            setHydrated(true);
          } else {
            // first time ever for this user
            setHydrated(true);
          }
        }
      } catch (e) {
        console.warn("Initial sync failed", e);
        setHydrated(true);
      }

      cleanup = cloudSync.subscribeToChanges(async (incoming) => {
        try {
          const last = lastFromCloudRef.current;
          const incomingStr = JSON.stringify(incoming);
        if (last !== incomingStr) {
            await cloudSync.applyCloudState(incoming);
            lastFromCloudRef.current = incomingStr;
          }
        } catch (e) {
          console.warn("applyCloudState failed", e);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSync.user, loading]);

  // ---- Push local changes to cloud ----
  React.useEffect(() => {
    if (!cloudSync.user || loading || !hydrated) return;
    const current = JSON.stringify(safeState);
    if (current === lastFromCloudRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        await cloudSync.syncData(safeState);
        if (!cancelled) {
          lastFromCloudRef.current = current;
        }
      } catch (e) {
        console.warn("syncData failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [safeState, cloudSync, hydrated, loading]);

  // backup/restore helpers
  const backupState = React.useCallback(() => {
    const snap = normalizeState(state);
    return snap;
  }, [state]);

  const onBackup = React.useCallback(async () => {
    const snap = backupState();
    // Local download (existing behaviour)
    const stamp = new Date();
    const y = String(stamp.getFullYear());
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    const hh = String(stamp.getHours()).padStart(2, "0");
    const mm = String(stamp.getMinutes()).padStart(2, "0");
    downloadJson(`navigator-backup-${y}${m}${d}-${hh}${mm}.json`, snap);

    // ✅ New: Supabase Storage upload (manual)
    try {
      await uploadBackupToStorage(snap, "manual");
      // optional: alert("✅ Backed up to Supabase");
    } catch (e: any) {
      console.warn("Supabase storage backup failed:", e?.message || e);
      // optional: alert("⚠️ Cloud backup failed: " + (e?.message || e));
    }
  }, [backupState]);

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

  // Stats — based on current list version (unique indices)
  const stats = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of completions) {
      if (c.listVersion === state?.currentListVersion) {
        set.add(c.addressIndex);
      }
    }
    const done = set.size;
    const pif = completions.filter(
      (c) => c.listVersion === state?.currentListVersion && c.outcome === "PIF"
    ).length;
    const da = completions.filter(
      (c) => c.listVersion === state?.currentListVersion && c.outcome === "DA"
    ).length;
    const arr = completions.filter(
      (c) => c.listVersion === state?.currentListVersion && c.outcome === "ARR"
    ).length;
    return { done, pif, da, arr };
  }, [completions, state?.currentListVersion]);

  const restoreState = (data: any) => {
    // naive full reload: let cloud apply happen via applyCloudState
    cloudSync.applyCloudState(data);
  };

  // derived session info
  const todaySession = daySessions.find((s) => s.dateKey === state?.todayKey);
  const sessionStarted = !!todaySession?.start;
  const sessionEnded = !!todaySession?.end;

  return (
    <div className="container">
      {/* Top bar */}
      <div className="topbar">
        <div className="brand">
          <span className="pin">📍</span> Address Navigator
        </div>
        <div className="spacer" />
        <div className="status">
          <span className="dot online" /> Online
          <span className="muted"> · </span>
          <span className="muted">
            Last sync {cloudSync.lastSyncedAt ? cloudSync.lastSyncedAt : "—"}
          </span>
        </div>
        <div className="spacer" />
        <div className="user">
          <span>{cloudSync.user?.email}</span>
          <button className="btn btn-ghost" onClick={() => cloudSync.signOut()}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${tab === "list" ? "active" : ""}`}
          onClick={() => setTab("list")}
        >
          List ({addresses.length})
        </button>
        <button
          className={`tab ${tab === "completed" ? "active" : ""}`}
          onClick={() => setTab("completed")}
        >
          Completed ({completions.length})
        </button>
        <button
          className={`tab ${tab === "arrangements" ? "active" : ""}`}
          onClick={() => setTab("arrangements")}
        >
          Arrangements ({arrangements.length})
        </button>
      </div>

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
            <button className="btn btn-ghost" onClick={onBackup}>
              💾 Backup
            </button>
            <label className="btn btn-ghost">
              ♻️ Restore
              <input type="file" accept="application/json" hidden onChange={onRestore} />
            </label>
          </div>
        </div>

        <div className="search-row">
          <input
            type="text"
            placeholder="Search addresses…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Day / session panel */}
      <DayPanel
        state={safeState}
        onStartDay={() => {
          createSessionIfMissing();
        }}
        onEditStart={(date) => setStartTime(date)}
        onEditEnd={(date) => setEndTime(date)}
        onEndDay={async () => {
          // ✅ New: Upload a finish-of-day snapshot before ending the day
          const snapshot = backupState();
          try {
            await uploadBackupToStorage(snapshot, "finish");
          } catch (e: any) {
            console.warn("Supabase storage backup (finish) failed:", e?.message || e);
          }
          endDay();
        }}
      />

      {/* Quick stats */}
      <div className="stats">
        <span className="pill">
          PIF <strong>{stats.pif}</strong>
        </span>
        <span className="pill">
          Done <strong>{stats.done}</strong>
        </span>
        <span className="pill red">
          DA <strong>{stats.da}</strong>
        </span>
        <span className="pill">
          ARR <strong>{stats.arr}</strong>
        </span>
      </div>

      {/* Start day button (if not started) */}
      {!sessionStarted && !sessionEnded && (
        <div className="session-row">
          <button className="btn btn-primary" onClick={() => createSessionIfMissing()}>
            ▶️ Start Day
          </button>
          <button
            className="btn"
            onClick={() => {
              const raw = prompt("Set start time (HH:MM, 24h)", "08:30");
              if (!raw) return;
              const [hh, mm] = raw.split(":").map((x) => parseInt(x.trim(), 10));
              if (Number.isFinite(hh) && Number.isFinite(mm)) {
                const d = new Date();
                d.setHours(hh, mm, 0, 0);
                setStartTime(d);
              }
            }}
          >
            ✏️ Edit start
          </button>
        </div>
      )}

      {/* Address list / Completed / Arrangements */}
      {tab === "list" ? (
        <AddressList
          state={safeState}
          filterText={filter}
          setActive={setActive}
          cancelActive={cancelActive}
          onComplete={complete}
          onCreateArrangement={(addressIndex) =>
            setAutoCreateArrangementFor(addressIndex)
          }
          ensureDayStarted={() => ensureDayStarted()}
        />
      ) : tab === "completed" ? (
        <Completed
          state={safeState}
          onRestoreAddress={(index: number, addr: AddressRow) => addAddress(addr)}
        />
      ) : (
        <Arrangements
          state={safeState}
          onAddArrangement={addArrangement}
          onUpdateArrangement={updateArrangement}
          onDeleteArrangement={deleteArrangement}
          onAddAddress={async (addr: AddressRow) => addAddress(addr)}
          onComplete={complete} // in case Arrangements marks an address as completed
          autoCreateForAddress={autoCreateArrangementFor}
          onAutoCreateHandled={() => setAutoCreateArrangementFor(null)}
        />
      )}
    </div>
  );
}
