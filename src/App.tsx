import * as React from "react";
import "./App.css";
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import { DayPanel } from "./DayPanel";
import { downloadJson, readJsonFile } from "./backup";

type {tab === "list" ? (
        <>
          {/* Search Bar */}
          <div className="search-container">
            <input
              type="search"
              value={search}
              placeholder="🔍 Search addresses..."
              onChange={(e) => setSearch(eimport * as React from "react";
import "./App.css";
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import { DayPanel } from "./DayPanel";
import { Arrangements } from "./Arrangements";
import { downloadJson, readJsonFile } from "./backup";

type Tab = "list" | "completed" | "arrangements";

export default function App() {
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
  } = useAppState();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");

  // ----- helpers shared by UI & hotkeys -----
  const completedIdx = React.useMemo(
    () => new Set(state.completions.map((c) => c.index)),
    [state.completions]
  );

  const lowerQ = search.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      state.addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !lowerQ || a.address.toLowerCase().includes(lowerQ))
        .filter(({ i }) => !completedIdx.has(i)),
    [state.addresses, lowerQ, completedIdx]
  );

  const hasActiveSession = state.daySessions.some((d) => !d.end);

  const doQuickComplete = React.useCallback(
    (i: number) => {
      const input = window.prompt(
        "Quick Complete:\n\n• Leave empty → Done\n• Type 'DA' → Mark as DA\n• Type a number (e.g. 50) → PIF £amount"
      );
      if (input === null) return;
      const text = input.trim();
      if (!text) {
        complete(i, "Done");
      } else if (text.toUpperCase() === "DA") {
        complete(i, "DA");
      } else {
        const n = Number(text);
        if (Number.isFinite(n) && n > 0) {
          complete(i, "PIF", n.toFixed(2));
        } else {
          alert(
            "Invalid amount. Use a number (e.g., 50) or type 'DA', or leave blank for Done."
          );
        }
      }
    },
    [complete]
  );

  // ----- keyboard shortcuts (List tab only) -----
  React.useEffect(() => {
    if (tab !== "list") return;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!el || !(el as HTMLElement)) return false;
      const t = el as HTMLElement;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (t as HTMLElement).isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      // Ignore while typing in inputs
      if (isTypingTarget(e.target)) return;

      // Navigation among visible rows
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (visible.length === 0) return;

        const pos =
          state.activeIndex != null
            ? visible.findIndex(({ i }) => i === state.activeIndex)
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

      // Complete current
      if (e.key === "Enter") {
        if (state.activeIndex != null) {
          e.preventDefault();
          doQuickComplete(state.activeIndex);
        }
        return;
      }

      // Undo latest completion
      if (e.key === "u" || e.key === "U") {
        const latest = state.completions[0];
        if (latest) {
          e.preventDefault();
          undo(latest.index);
        }
        return;
      }

      // Start / End day
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
    state.activeIndex,
    state.completions,
    hasActiveSession,
    setActive,
    undo,
    doQuickComplete,
    startDay,
    endDay,
  ]);

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
      const data = await readJsonFile(file);
      restoreState(data);
      alert("✅ Restore completed successfully!");
    } catch (err: any) {
      console.error(err);
      alert(`❌ Restore failed: ${err?.message || err}`);
    } finally {
      e.target.value = ""; // allow selecting the same file again later
    }
  };

  // ----- Stats calculations -----
  const stats = React.useMemo(() => {
    const total = state.addresses.length;
    const completed = state.completions.length;
    const pending = total - completed;
    const pifCount = state.completions.filter(c => c.outcome === "PIF").length;
    const doneCount = state.completions.filter(c => c.outcome === "Done").length;
    const daCount = state.completions.filter(c => c.outcome === "DA").length;
    
    return { total, completed, pending, pifCount, doneCount, daCount };
  }, [state.addresses.length, state.completions]);

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Loading your address data...
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">📍 Address Navigator</h1>
        
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
            📅 Arrangements ({state.arrangements.length})
          </button>
        </div>
      </header>

      {/* Import & Tools Section */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ 
          background: "var(--surface)", 
          padding: "1.5rem", 
          borderRadius: "var(--radius-lg)", 
          border: "1px solid var(--border-light)",
          boxShadow: "var(--shadow-sm)",
          marginBottom: "1rem"
        }}>
          <div style={{ 
            fontSize: "0.875rem", 
            color: "var(--text-secondary)", 
            marginBottom: "1rem",
            lineHeight: "1.5"
          }}>
            📁 Load an Excel file with <strong>address</strong>, optional <strong>lat</strong>, <strong>lng</strong> columns to get started.
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

      {tab === "list" ? (
        <>
          {/* Search Bar */}
          <div className="search-container">
            <input
              type="search"
              value={search}
              placeholder="🔍 Search addresses..."
              onChange={(e) => setSearch(e.target.value)}
              className="input search-input"
            />
          </div>

          {/* Day Panel */}
          <DayPanel
            sessions={state.daySessions}
            completions={state.completions}
            startDay={startDay}
            endDay={endDay}
          />

          {/* Stats Overview */}
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
              <div className="stat-value" style={{ color: "var(--success)" }}>{stats.pifCount}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Done</div>
              <div className="stat-value" style={{ color: "var(--primary)" }}>{stats.doneCount}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">DA</div>
              <div className="stat-value" style={{ color: "var(--danger)" }}>{stats.daCount}</div>
            </div>
            
            {state.activeIndex !== null && (
              <div className="stat-item">
                <div className="stat-label">Active</div>
                <div className="stat-value" style={{ color: "var(--primary)" }}>
                  #{state.activeIndex + 1}
                </div>
              </div>
            )}
          </div>

          {/* Address List */}
          <AddressList
            state={state}
            setActive={setActive}
            cancelActive={cancelActive}
            complete={complete}
            filterText={search}
          />

          {/* Keyboard Shortcuts Help */}
          <div style={{ 
            marginTop: "2rem", 
            padding: "1rem",
            background: "var(--bg-tertiary)", 
            borderRadius: "var(--radius)",
            fontSize: "0.8125rem", 
            color: "var(--text-muted)",
            textAlign: "center"
          }}>
            ⌨️ <strong>Shortcuts:</strong> ↑↓ Navigate • Enter Complete • U Undo • S Start Day • E End Day
          </div>
        </>
      ) : (
        <Completed state={state} />
      )}
    </div>
  );
}
    </div>
  );
}
