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
import type { AddressRow, Outcome } from "./types";
import { supabase } from "./lib/supabaseClient";
import ManualAddressFAB from "./ManualAddressFAB"; // <-- NEW

type Tab = "list" | "completed" | "arrangements";

// (… everything above unchanged …)

// --- inside your component body ---
// (keep all your current state and hooks here)

// Ensure day started when app opens
React.useEffect(() => {
  const today = new Date().toISOString().slice(0, 10);
  const hasToday = daySessions.some((d) => d.date === today);
  if (!hasToday) startDay();
}, [daySessions, startDay]);

// DayPanel - edit start time (unchanged)
const handleEditStart = React.useCallback(
  (newStartISO: string | Date) => {
    const parsed = typeof newStartISO === "string" ? new Date(newStartISO) : newStartISO;
    if (Number.isNaN(parsed.getTime())) return;

    const newISO = parsed.toISOString();
    setState((s) => {
      const today = newISO.slice(0, 10);
      const idx = s.daySessions.findIndex((d) => d.date === today && !d.end);
      if (idx >= 0) {
        const arr = s.daySessions.slice();
        const sess: any = { ...arr[idx], start: newISO };
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

// DayPanel - edit finish time (NEW)
const handleEditEnd = React.useCallback(
  (newEndISO: string | Date) => {
    const parsed = typeof newEndISO === "string" ? new Date(newEndISO) : newEndISO;
    if (Number.isNaN(parsed.getTime())) return;

    const newISO = parsed.toISOString();
    setState((s) => {
      const dayKey = newISO.slice(0, 10);
      const idx = s.daySessions.findIndex((d) => d.date === dayKey);
      if (idx >= 0) {
        const arr = s.daySessions.slice();
        const sess: any = { ...arr[idx], end: newISO };
        if (sess.start) {
          try {
            const start = new Date(sess.start).getTime();
            const end = new Date(sess.end).getTime();
            if (end > start) sess.durationSeconds = Math.floor((end - start) / 1000);
          } catch {}
        }
        arr[idx] = sess;
        return { ...s, daySessions: arr };
      }
      return { ...s, daySessions: [...s.daySessions, { date: dayKey, end: newISO }] };
    });
  },
  [setState]
);

// Finish Day with cloud snapshot (unchanged)
const endDayWithBackup = React.useCallback(() => {
  const snap = backupState();
  uploadBackupToStorage(snap, "finish").catch((e: any) => {
    console.warn("Supabase storage backup (finish) failed:", e?.message || e);
  });
  endDay();
}, [backupState, endDay]);

// (…rest of your handlers stay the same…)

// ------------- RENDER -------------
return (
  <div className="app-shell">
    {/* (… header, auth, tabs wrapper etc — unchanged …) */}

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