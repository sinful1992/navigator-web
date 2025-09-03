// src/App.tsx
import * as React from "react";
import "./App.css";

import { useAppState } from "./useAppState";
import { useCloudSync } from "./useCloudSync";

import { ImportExcel } from "./ImportExcel";
import { DayPanel } from "./DayPanel";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import { Arrangements } from "./Arrangements";

import type { Completion, Outcome, AddressRow } from "./types";
import { downloadJson, readJsonFile } from "./backup";
import ManualAddressFAB from "./ManualAddressFAB";

type Tab = "list" | "completed" | "arrangements";

export default function App() {
  // Keep cloud sync listeners alive; do not assign to avoid "unused" TS errors.
  try { useCloudSync(); } catch {}

  const {
    state,
    setState,

    // addresses
    setAddresses,
    addAddress,
    setActive,
    cancelActive,

    // day sessions
    startDay,
    endDay,
    backupState,
    restoreState,

    // completions
    complete,
    undo,

    // arrangements
    arrangements,
    addArrangement,
    updateArrangement,
    deleteArrangement,
  } = useAppState();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");

  // Convenience alias (your other files sometimes expect `safeState`)
  const safeState = state;
  const { daySessions, completions } = state;

  // Ensure a session exists today when the app opens
  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Edit start time ---
  const handleEditStart = React.useCallback(
    (newStartISO: string | Date) => {
      const parsed =
        typeof newStartISO === "string" ? new Date(newStartISO) : newStartISO;
      if (Number.isNaN(parsed.getTime())) return;

      const iso = parsed.toISOString();
      setState((s) => {
        const dayKey = iso.slice(0, 10);
        const idx = s.daySessions.findIndex((d) => d.date === dayKey && !d.end);
        if (idx >= 0) {
          const arr = s.daySessions.slice();
          const sess: any = { ...arr[idx], start: iso };
          if (sess.end) {
            try {
              const start = new Date(sess.start).getTime();
              const end = new Date(sess.end).getTime();
              if (end > start)
                sess.durationSeconds = Math.floor((end - start) / 1000);
            } catch {}
          }
          arr[idx] = sess;
          return { ...s, daySessions: arr };
        }
        // If no active session, create one
        return {
          ...s,
          daySessions: [...s.daySessions, { date: dayKey, start: iso }],
        };
      });
    },
    [setState]
  );

  // --- Edit finish time (same UX as start) ---
  const handleEditEnd = React.useCallback(
    (newEndISO: string | Date) => {
      const parsed =
        typeof newEndISO === "string" ? new Date(newEndISO) : newEndISO;
      if (Number.isNaN(parsed.getTime())) return;

      const iso = parsed.toISOString();
      setState((s) => {
        const dayKey = iso.slice(0, 10);
        const idx = s.daySessions.findIndex((d) => d.date === dayKey);
        if (idx >= 0) {
          const arr = s.daySessions.slice();
          const sess: any = { ...arr[idx], end: iso };
          if (sess.start) {
            try {
              const start = new Date(sess.start).getTime();
              const end = new Date(sess.end).getTime();
              if (end > start)
                sess.durationSeconds = Math.floor((end - start) / 1000);
            } catch {}
          }
          arr[idx] = sess;
          return { ...s, daySessions: arr };
        }
        // If there's no session yet for that day, create one with only end
        return {
          ...s,
          daySessions: [...s.daySessions, { date: dayKey, end: iso }],
        };
      });
    },
    [setState]
  );

  // Finish day + quick local JSON backup (optional)
  const endDayWithBackup = React.useCallback(() => {
    try {
      const snap = backupState();
      downloadJson(
        snap,
        `navigator-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
    } catch {}
    endDay();
  }, [backupState, endDay]);

  // --- Completions ---
  const ensureDayStarted = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = state.daySessions.some((d) => d.date === today);
    if (!hasToday) startDay();
  }, [state.daySessions, startDay]);

  const handleComplete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string) => {
      ensureDayStarted();
      try {
        await complete(index, outcome, amount);
      } catch (e) {
        console.warn("complete() failed:", e);
      }
    },
    [ensureDayStarted, complete]
  );

  // Completed list helpers
  const removeCompletion = React.useCallback(
    (timestamp: string) => {
      setState((s) => ({
        ...s,
        completions: s.completions.filter((c) => c.timestamp !== timestamp),
      }));
    },
    [setState]
  );

  const restoreCompletion = React.useCallback(
    (c: Completion) => {
      setState((s) => ({
        ...s,
        completions: [c, ...s.completions],
      }));
    },
    [setState]
  );

  // Backup / Restore UI
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const onClickRestore = () => fileRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const obj = await readJsonFile(f);
      (restoreState as any)?.(obj, "merge"); // merge to avoid losing current work
    } catch (err) {
      console.warn("Restore failed:", err);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">📍 Address Navigator</h1>

        <div
          className="header-actions"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <ImportExcel
            onLoaded={(rows) => {
              if (!Array.isArray(rows)) return;
              setAddresses(rows as AddressRow[]);
            }}
          />

          <button
            className="btn btn-ghost"
            onClick={() => {
              try {
                const snap = backupState();
                downloadJson(
                  snap,
                  `navigator-backup-${new Date()
                    .toISOString()
                    .slice(0, 10)}.json`
                );
              } catch {}
            }}
            title="Download backup JSON"
          >
            ⬇️ Backup
          </button>

          <input
            type="file"
            ref={fileRef}
            accept="application/json"
            onChange={onFileChosen}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-ghost"
            onClick={onClickRestore}
            title="Restore from JSON"
          >
            ⬆️ Restore
          </button>
        </div>
      </header>

      <nav className="tabs-nav">
        <button
          className={`tab-btn ${tab === "list" ? "active" : ""}`}
          onClick={() => setTab("list")}
        >
          Addresses
        </button>
        <button
          className={`tab-btn ${tab === "completed" ? "active" : ""}`}
          onClick={() => setTab("completed")}
        >
          Completed
        </button>
        <button
          className={`tab-btn ${tab === "arrangements" ? "active" : ""}`}
          onClick={() => setTab("arrangements")}
        >
          Arrangements
        </button>
      </nav>

      <main className="tabs">
        {/* Panel: Addresses */}
        {tab === "list" && (
          <section className="tab-panel">
            {/* Day panel */}
            <DayPanel
              sessions={daySessions}
              completions={completions}
              startDay={startDay}
              endDay={endDayWithBackup}
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
            />

            {/* SEARCH BAR UNDER DAY PANEL */}
            <div className="search-container">
              <input
                type="search"
                value={search}
                placeholder="Search addresses..."
                onChange={(e) => setSearch(e.target.value)}
                className="input search-input"
              />
            </div>

            {/* Address list */}
            <AddressList
              state={safeState}
              setActive={setActive}
              cancelActive={cancelActive}
              onComplete={handleComplete}
              onUndo={undo}
              filterText={search}
              ensureDayStarted={ensureDayStarted}
            />

            {/* Floating +Address button */}
            <ManualAddressFAB />
          </section>
        )}

        {/* Panel: Completed */}
        {tab === "completed" && (
          <section className="tab-panel">
            <Completed
              completions={completions}
              removeCompletion={removeCompletion}
              restoreCompletion={restoreCompletion}
            />
          </section>
        )}

        {/* Panel: Arrangements */}
        {tab === "arrangements" && (
          <section className="tab-panel">
            <Arrangements
              state={safeState}
              onAddArrangement={addArrangement}
              onUpdateArrangement={updateArrangement}
              onDeleteArrangement={deleteArrangement}
              onAddAddress={async (addr: AddressRow) => addAddress(addr)}
              onComplete={complete}
            />
          </section>
        )}
      </main>
    </div>
  );
}
    <div className="tabs">
      {/* Panel 1: Addresses */}
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
        {/* Day panel first */}
        <DayPanel
          sessions={daySessions}
          completions={completions}
          startDay={startDay}
          endDay={endDayWithBackup}
          onEditStart={handleEditStart}
          onEditEnd={handleEditEnd} {/* <-- NEW */}
        />

        {/* Search bar moved UNDER the Day panel */}
        <div className="search-container">
          <input
            type="search"
            value={search}
            placeholder="Search addresses..."
            onChange={(e) => setSearch(e.target.value)}
            className="input search-input"
          />
        </div>

        {/* Address list (unchanged) */}
        <AddressList
          state={safeState}
          setActive={setActive}
          cancelActive={cancelActive}
          onComplete={handleComplete}
          onUndo={undo}
          filterText={search}
          ensureDayStarted={ensureDayStarted}
        />

        {/* Actions + stats footer (unchanged) */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            margin: "1.25rem 0 3rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* … your existing buttons and stats … */}
        </div>
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
        <Completed
          completions={completions}
          removeCompletion={removeCompletion}
          restoreCompletion={restoreCompletion}
        />
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
          arrangements={arrangements}
          addArrangement={addArrangement}
          updateArrangement={updateArrangement}
          deleteArrangement={deleteArrangement}
        />
      </section>

      {/* Floating +Address button across the app */}
      <ManualAddressFAB /> {/* <-- NEW */}
    </div>
  </div>
);
}

// (…helpers below unchanged…)
