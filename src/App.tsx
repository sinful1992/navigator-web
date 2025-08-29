// ===== src/App.tsx =====
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
          // Wraps return type to Promise<void> as expected by Auth
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
  const [disableCloudSync, setDisableCloudSync] = React.useState(false);

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

  // Auto-sync to cloud (debounced) - only when cloud sync is enabled
  React.useEffect(() => {
    if (!cloudSync.user || loading || disableCloudSync) return;
    const t = setTimeout(() => {
      console.log('Auto-syncing to cloud...');
      cloudSync
        .syncData(safeState)
        .then(() => {
          console.log('Cloud sync successful');
          setLastSyncTime(new Date());
        })
        .catch((err: unknown) => console.error("Sync failed:", err));
    }, 800);
    return () => clearTimeout(t);
  }, [cloudSync.user, loading, safeState, cloudSync, disableCloudSync]);

  // FIXED: Subscribe to cloud changes - with conflict prevention
  React.useEffect(() => {
    if (!cloudSync.user || disableCloudSync) return;
    
    let isInitialLoad = true;
    let lastLocalUpdate = Date.now();
    
    const unsub = cloudSync.subscribeToData((newState) => {
      if (newState) {
        const now = Date.now();
        
        // Only apply cloud state on initial load, or if it's been a while since local changes
        if (isInitialLoad) {
          console.log('Applying initial cloud state');
          setState(snapshot);
    console.log('State restored:', snapshot);
    // Optional: persist immediately (in addition to the debounced effect)
    set(STORAGE_KEY, snapshot).catch((error) => {
      console.error('Failed to persist restored state:', error);
    });
  }, []);

  // Debug state changes
  React.useEffect(() => {
    console.log('Current state:', state);
  }, [state]);

  return {
    state,
    loading,
    setState, // Expose setState for cloud sync
    setAddresses,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
    // arrangement functions
    addArrangement,
    updateArrangement,
    deleteArrangement,
    // backup/restore
    backupState,
    restoreState,
  };
}

// ===== src/AddressList.tsx =====
// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (i: number) => void;
  cancelActive: () => void;
  complete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  onCreateArrangement,
  filterText = "",
}: Props) {
  const [openCompleteFor, setOpenCompleteFor] = React.useState<number | null>(
    null
  );
  const [pifAmount, setPifAmount] = React.useState<Record<number, string>>({});

  const completedIdx = React.useMemo(() => {
    const s = new Set<number>();
    for (const c of state.completions) s.add(c.index);
    return s;
  }, [state.completions]);

  const needle = filterText.trim().toLowerCase();

  // Build visible rows = not completed + matches search
  const rows = React.useMemo(() => {
    const out: Array<{ i: number; address: string; lat?: number; lng?: number }> = [];
    state.addresses.forEach((row, i) => {
      if (completedIdx.has(i)) return; // hide completed from this list
      const addr = row.address || "";
      if (needle && !addr.toLowerCase().includes(needle)) return;
      out.push({
        i,
        address: addr,
        lat: row.lat ?? undefined,
        lng: row.lng ?? undefined,
      });
    });
    return out;
  }, [state.addresses, completedIdx, needle]);

  const openMaps = (addr: string, lat?: number, lng?: number) => {
    let url: string;
    if (typeof lat === "number" && typeof lng === "number") {
      url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        addr
      )}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onConfirmPIF = (index: number) => {
    const amt = (pifAmount[index] || "").trim();
    if (!amt) {
      alert("Please enter an amount for PIF.");
      return;
    }
    complete(index, "PIF", amt);
    setOpenCompleteFor(null);
  };

  // Clear completion form when active index changes
  React.useEffect(() => {
    setOpenCompleteFor(null);
  }, [state.activeIndex]);

  if (rows.length === 0) {
    return (
      <div className="empty-box">
        <div style={{ fontSize: "1rem", marginBottom: "0.5rem", fontWeight: 600 }}>
          {state.addresses.length === 0 ? "📍 No addresses loaded" : "🔍 No matching addresses"}
        </div>
        <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
          {state.addresses.length === 0
            ? "Import an Excel file to get started with address navigation"
            : "Try adjusting your search terms or check if all addresses are completed"}
        </div>
      </div>
    );
  }

  return (
    <div className="list-col">
      {rows.map(({ i, address, lat, lng }) => {
        const active = state.activeIndex === i;
        const open = openCompleteFor === i && active; // Only show completion if BOTH active AND openCompleteFor match

        return (
          <div 
            className={`card address-card fade-in-up ${active ? "card-active" : ""}`} 
            key={i}
          >
            {/* Card Header */}
            <div className="card-header">
              <div className="addr-title">
                <span className="addr-index">{i + 1}</span>
                {address}
              </div>
              {active && (
                <span className="pill pill-active">
                  🎯 Active
                </span>
              )}
            </div>

            {/* Card Body - Reserved for future content */}
            <div className="card-body" style={{ padding: 0 }} />

            {/* Card Footer */}
            <div className="card-footer">
              {!open ? (
                // Normal action row
                <div className="btn-row btn-row-end">
                  <button
                    className="btn btn-ghost"
                    onClick={() => openMaps(address, lat, lng)}
                    title="Open in Google Maps"
                  >
                    🗺️ Navigate
                  </button>

                  <div className="btn-spacer" />

                  {active ? (
                    <div className="btn-group">
                      <button
                        className="btn btn-primary"
                        onClick={() => setOpenCompleteFor(i)}
                      >
                        ✅ Complete
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        onClick={() => {
                          cancelActive();
                          setOpenCompleteFor(null); // Also clear completion form
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="btn-group">
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          console.log('Set Active clicked for index:', i);
                          setActive(i);
                        }}
                      >
                        Set Active
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => onCreateArrangement(i)}
                        title="Create payment arrangement"
                      >
                        📅 Arrange
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Completion choices open
                <div className="complete-bar">
                  <div className="complete-btns">
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        complete(i, "Done");
                        setOpenCompleteFor(null);
                      }}
                    >
                      ✅ Done
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        complete(i, "DA");
                        setOpenCompleteFor(null);
                      }}
                    >
                      ❌ DA
                    </button>
                  </div>

                  <div className="pif-group">
                    <input
                      className="input amount-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount (£)"
                      value={pifAmount[i] || ""}
                      onChange={(e) =>
                        setPifAmount((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    />
                    <button 
                      className="btn btn-success" 
                      onClick={() => onConfirmPIF(i)}
                    >
                      💰 PIF
                    </button>
                  </div>

                  <button
                    className="btn btn-ghost"
                    onClick={() => onCreateArrangement(i)}
                    title="Create payment arrangement instead"
                  >
                    📅 Arrange
                  </button>

                  <div className="btn-spacer" />

                  <button
                    className="btn btn-ghost"
                    onClick={() => setOpenCompleteFor(null)}
                    title="Close options"
                  >
                    ← Back
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== src/DayPanel.tsx =====
// src/DayPanel.tsx
import * as React from "react";
import { format, isSameDay, parseISO } from "date-fns";
import type { Completion, DaySession } from "./types";

function activeSession(sessions: DaySession[]) {
  return sessions.find((s) => !s.end);
}

function countToday(comps: Completion[]) {
  const today = new Date();
  return comps.filter((c) => isSameDay(parseISO(c.timestamp), today)).length;
}

function getTodayOutcomes(comps: Completion[]) {
  const today = new Date();
  const todayComps = comps.filter((c) => isSameDay(parseISO(c.timestamp), today));
  
  const outcomes = { PIF: 0, Done: 0, DA: 0 };
  todayComps.forEach(c => {
    outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
  });
  
  return outcomes;
}

function formatDuration(start: string) {
  const startTime = new Date(start);
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
};

export const DayPanel: React.FC<Props> = ({ sessions, completions, startDay, endDay }) => {
  const active = activeSession(sessions);
  const todayCount = countToday(completions);
  const todayOutcomes = getTodayOutcomes(completions);

  return (
    <div className={`day-panel ${active ? 'day-panel-active' : ''}`}>
      <div className="day-panel-content">
        {active ? (
          <>
            <div className="day-panel-info">
              <div className="stat-item">
                <div className="stat-label">🕐 Started</div>
                <div className="stat-value" style={{ fontSize: "1.125rem" }}>
                  {format(parseISO(active.start), "HH:mm")}
                </div>
              </div>
              
              <div className="stat-item">
                <div className="stat-label">⏱️ Duration</div>
                <div className="stat-value" style={{ fontSize: "1.125rem" }}>
                  {formatDuration(active.start)}
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-label">📍 Completed Today</div>
                <div className="stat-value" style={{ fontSize: "1.125rem" }}>
                  {todayCount}
                </div>
              </div>

              {todayCount > 0 && (
                <div className="stat-item">
                  <div className="stat-label">📊 Today's Mix</div>
                  <div style={{ 
                    display: "flex", 
                    gap: "0.5rem", 
                    fontSize: "0.875rem",
                    fontWeight: 600
                  }}>
                    {todayOutcomes.PIF > 0 && (
                      <span className="pill pill-pif" style={{ fontSize: "0.75rem" }}>
                        💰 {todayOutcomes.PIF}
                      </span>
                    )}
                    {todayOutcomes.Done > 0 && (
                      <span className="pill pill-done" style={{ fontSize: "0.75rem" }}>
                        ✅ {todayOutcomes.Done}
                      </span>
                    )}
                    {todayOutcomes.DA > 0 && (
                      <span className="pill pill-da" style={{ fontSize: "0.75rem" }}>
                        ❌ {todayOutcomes.DA}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="day-panel-actions">
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  console.log('End Day clicked');
                  endDay();
                }}
              >
                🛑 End Day
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "0.75rem",
              flex: 1
            }}>
              <div style={{ 
                width: "3rem", 
                height: "3rem",
                borderRadius: "50%",
                background: "var(--bg-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem"
              }}>
                ⏰
              </div>
              <div>
                <div style={{ 
                  fontWeight: 700, 
                  fontSize: "1.125rem",
                  color: "var(--text-primary)",
                  marginBottom: "0.25rem"
                }}>
                  Ready to start your day?
                </div>
                <div style={{ 
                  color: "var(--text-secondary)", 
                  fontSize: "0.875rem" 
                }}>
                  Track your time and progress with day sessions
                </div>
              </div>
            </div>

            <div className="day-panel-actions">
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  console.log('Start Day clicked');
                  startDay();
                }}
              >
                🚀 Start Day
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};normalizeState(newState));
          setLastSyncTime(new Date());
          isInitialLoad = false;
        } else if (now - lastLocalUpdate > 10000) {
          // Only apply if no local changes in last 10 seconds
          console.log('Applying cloud state (no recent local changes)');
          setState(normalizeState(newState));
          setLastSyncTime(new Date());
        } else {
          console.log('Ignoring cloud update - recent local changes detected');
          // Just update sync time to show we're connected
          setLastSyncTime(new Date());
        }
      }
    });

    // Track local changes by monitoring state updates
    const stateChangeHandler = () => {
      lastLocalUpdate = Date.now();
    };
    
    // We'll update this timestamp whenever functions are called
    const originalSetActive = setActive;
    const originalStartDay = startDay;
    const originalComplete = complete;
    
    return unsub;
  }, [cloudSync.user, cloudSync, setState, disableCloudSync]);

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

      // Toggle cloud sync debugging
      if (e.key === "c" || e.key === "C") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setDisableCloudSync(prev => {
            const newVal = !prev;
            console.log(`Cloud sync ${newVal ? 'DISABLED' : 'ENABLED'}`);
            alert(`Cloud sync ${newVal ? 'DISABLED' : 'ENABLED'} - Check console for details`);
            return newVal;
          });
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

  // Push restored data to cloud immediately (authoritative)
  const onRestore: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await readJsonFile(file);
      const data = normalizeState(raw);
      restoreState(data);             // local
      if (!disableCloudSync) {
        await cloudSync.syncData(data); // cloud
      }
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
        <div className="left">
          <h1 className="app-title">📍 Address Navigator</h1>

          {/* Sync Status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            {cloudSync.isOnline && !disableCloudSync ? (
              <>
                <span style={{ color: "var(--success)" }}>🟢</span>
                Online
                {lastSyncTime && <span>• Last sync {lastSyncTime.toLocaleTimeString()}</span>}
              </>
            ) : disableCloudSync ? (
              <>
                <span style={{ color: "var(--warning)" }}>⚫</span>
                Cloud Disabled
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
          {/* Email + Sign out pill */}
          <div className="user-chip" role="group" aria-label="Account">
            <span className="avatar" aria-hidden>👤</span>
            <span
              className="email"
              title={cloudSync.user?.email ?? ""}
            >
              {cloudSync.user?.email ?? "Signed in"}
            </span>
            <button
              className="signout-btn"
              onClick={cloudSync.signOut}
              title="Sign out"
            >
              Sign Out
            </button>
          </div>

          {/* Tabs */}
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
              <label htmlFor="restore-input" className="file-input-label">
                📤 Restore
              </label>
            </div>

            <button 
              className="btn btn-ghost" 
              onClick={() => setDisableCloudSync(prev => !prev)}
              title="Toggle cloud sync for debugging"
            >
              {disableCloudSync ? "🔄 Enable Sync" : "⏸️ Disable Sync"}
            </button>
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
            complete={complete}
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
            ⌨️ <strong>Shortcuts:</strong> ↑↓ Navigate • Enter Complete (or type 'ARR') • U Undo •
            S Start Day • E End Day • Ctrl+C Toggle Cloud Sync
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

// ===== src/useAppState.ts =====
// src/useAppState.ts
import * as React from "react";
import { get, set } from "idb-keyval";
import type { AddressRow, AppState, Completion, Outcome, DaySession, Arrangement } from "./types";

const STORAGE_KEY = "navigator_state_v3"; // Updated version for arrangements

const initial: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
};

export function useAppState() {
  const [state, setState] = React.useState<AppState>(initial);
  const [loading, setLoading] = React.useState(true);

  // Load persisted state
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        console.log('Loading state from IndexedDB...');
        const saved = (await get(STORAGE_KEY)) as AppState | undefined;
        if (alive && saved) {
          console.log('Loaded state:', saved);
          // Handle migration from older versions
          setState({
            ...saved,
            arrangements: saved.arrangements || [],
          });
        } else {
          console.log('No saved state found, using initial state');
        }
      } catch (error) {
        console.error('Failed to load state:', error);
        // Continue with initial state
      } finally {
        if (alive) {
          console.log('Setting loading to false');
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist on every change (debounced) - only when not loading
  React.useEffect(() => {
    if (loading) return;
    console.log('Persisting state to IndexedDB:', state);
    const t = setTimeout(() => {
      set(STORAGE_KEY, state).catch((error) => {
        console.error('Failed to persist state:', error);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [state, loading]);

  // ---- existing actions ----

  const setAddresses = React.useCallback((rows: AddressRow[]) => {
    console.log('Setting addresses:', rows);
    setState((s) => {
      const newState = {
        ...s,
        addresses: rows,
        activeIndex: null,
        // keep existing completions/sessions/arrangements
      };
      console.log('New state after setAddresses:', newState);
      return newState;
    });
  }, []);

  const setActive = React.useCallback((idx: number) => {
    console.log('Setting active index:', idx);
    setState((s) => {
      const newState = { ...s, activeIndex: idx };
      console.log('New state after setActive:', newState);
      return newState;
    });
  }, []);

  const cancelActive = React.useCallback(() => {
    console.log('Canceling active');
    setState((s) => {
      const newState = { ...s, activeIndex: null };
      console.log('New state after cancelActive:', newState);
      return newState;
    });
  }, []);

  const complete = React.useCallback((index: number, outcome: Outcome, amount?: string) => {
    console.log('Completing address:', { index, outcome, amount });
    setState((s) => {
      const a = s.addresses[index];
      if (!a) {
        console.warn('Address not found at index:', index);
        return s;
      }
      const now = new Date().toISOString();
      const c: Completion = {
        index,
        address: a.address,
        lat: a.lat ?? undefined,
        lng: a.lng ?? undefined,
        outcome,
        amount,
        timestamp: now,
      };
      const next: AppState = {
        ...s,
        completions: [c, ...s.completions],
      };
      // Clear active if it's the one just completed
      if (s.activeIndex === index) {
        next.activeIndex = null;
      }
      console.log('New state after complete:', next);
      return next;
    });
  }, []);

  const undo = React.useCallback((index: number) => {
    console.log('Undoing completion for index:', index);
    setState((s) => {
      const newState = {
        ...s,
        completions: s.completions.filter((c) => c.index !== index),
      };
      console.log('New state after undo:', newState);
      return newState;
    });
  }, []);

  // Day tracking
  const startDay = React.useCallback(() => {
    console.log('Starting day session');
    setState((s) => {
      // if already active, no-op
      const hasActive = s.daySessions.some((d) => !d.end);
      if (hasActive) {
        console.log('Day session already active');
        return s;
      }
      const today = new Date();
      const sess: DaySession = {
        date: today.toISOString().slice(0, 10),
        start: today.toISOString(),
      };
      const newState = { 
        ...s, 
        daySessions: [...s.daySessions, sess] 
      };
      console.log('New state after startDay:', newState);
      return newState;
    });
  }, []);

  const endDay = React.useCallback(() => {
    console.log('Ending day session');
    setState((s) => {
      const i = s.daySessions.findIndex((d) => !d.end);
      if (i === -1) {
        console.log('No active day session found');
        return s;
      }
      const now = new Date();
      const arr = s.daySessions.slice();
      const act = { ...arr[i] };
      act.end = now.toISOString();
      try {
        const start = new Date(act.start).getTime();
        const end = now.getTime();
        if (end > start) act.durationSeconds = Math.floor((end - start) / 1000);
      } catch {
        console.warn('Failed to calculate duration');
      }
      arr[i] = act;
      const newState = { ...s, daySessions: arr };
      console.log('New state after endDay:', newState);
      return newState;
    });
  }, []);

  // ---- arrangement actions ----

  const addArrangement = React.useCallback((arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => {
    console.log('Adding arrangement:', arrangementData);
    setState((s) => {
      const now = new Date().toISOString();
      const newArrangement: Arrangement = {
        ...arrangementData,
        id: `arr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: now,
        updatedAt: now,
      };
      
      const newState = {
        ...s,
        arrangements: [...s.arrangements, newArrangement],
      };
      console.log('New state after addArrangement:', newState);
      return newState;
    });
  }, []);

  const updateArrangement = React.useCallback((id: string, updates: Partial<Arrangement>) => {
    console.log('Updating arrangement:', { id, updates });
    setState((s) => {
      const newState = {
        ...s,
        arrangements: s.arrangements.map(arr => 
          arr.id === id 
            ? { ...arr, ...updates, updatedAt: new Date().toISOString() }
            : arr
        ),
      };
      console.log('New state after updateArrangement:', newState);
      return newState;
    });
  }, []);

  const deleteArrangement = React.useCallback((id: string) => {
    console.log('Deleting arrangement:', id);
    setState((s) => {
      const newState = {
        ...s,
        arrangements: s.arrangements.filter(arr => arr.id !== id),
      };
      console.log('New state after deleteArrangement:', newState);
      return newState;
    });
  }, []);

  // ---- backup/restore ----

  function isValidState(obj: any): obj is AppState {
    return (
      obj &&
      typeof obj === "object" &&
      Array.isArray(obj.addresses) &&
      Array.isArray(obj.completions) &&
      "activeIndex" in obj &&
      Array.isArray(obj.daySessions)
      // arrangements is optional for backward compatibility
    );
  }

  const backupState = React.useCallback(() => {
    // Return a snapshot; caller can download it as JSON
    return {
      addresses: state.addresses,
      completions: state.completions,
      activeIndex: state.activeIndex,
      daySessions: state.daySessions,
      arrangements: state.arrangements,
    } as AppState;
  }, [state]);

  const restoreState = React.useCallback((obj: unknown) => {
    console.log('Restoring state:', obj);
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    const snapshot: AppState = {
      addresses: obj.addresses,
      completions: obj.completions,
      activeIndex: obj.activeIndex ?? null,
      daySessions: obj.daySessions ?? [],
      arrangements: obj.arrangements ?? [],
    };
    setState(