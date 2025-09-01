// src/App.tsx
import * as React from "react";
import "./App.css"; // ⬅️ bring back the original design system
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import type { AppState, Outcome } from "./types";
import { BackupsPanel } from "./components/BackupsPanel";

// Version-safe outcome updates
import { updateOutcomeByIndexAndVersion } from "./state/updateOutcome";
// Creation path (listVersion + snapshot)
import { createCompletion, upsertCompletion } from "./state/createCompletion";
// Version-scoped stats
import { computeCurrentStats } from "./state/selectors";
// Backup helpers
import { localDateKey, makeDaySnapshot, performBackup } from "./backup/backup";
// App state
import { useAppState } from "./useAppState";

export default function App() {
  const { state, setState } = useAppState();
  const [filterText, setFilterText] = React.useState("");
  const [isBackingUp, setIsBackingUp] = React.useState(false);
  const [showBackups, setShowBackups] = React.useState(false);

  const setActive = React.useCallback(
    (index: number) => setState((s: AppState) => ({ ...s, activeIndex: index })),
    [setState]
  );
  const cancelActive = React.useCallback(
    () => setState((s: AppState) => ({ ...s, activeIndex: undefined })),
    [setState]
  );

  const ensureDayStarted = React.useCallback(() => {
    setState((s: AppState) => {
      if (s?.day?.startTime) return s;
      return { ...s, day: { ...(s.day ?? {}), startTime: new Date().toISOString() } };
    });
  }, [setState]);

  const onCreateArrangement = React.useCallback((addressIndex: number) => {
    console.debug("Create arrangement for index", addressIndex);
  }, []);

  const onComplete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s: AppState) => {
        const comp = createCompletion(s, index, outcome, amount);
        return upsertCompletion(s, comp);
      });
    },
    [setState]
  );

  const handleChangeOutcome = React.useCallback(
    (index: number, o: Outcome, amount?: string, listVersion?: number) => {
      setState((s: AppState) => updateOutcomeByIndexAndVersion(s, index, o, amount, listVersion));
    },
    [setState]
  );

  // Backups (Supabase)
  const handleBackupNow = React.useCallback(async () => {
    try {
      setIsBackingUp(true);
      const dayKey = localDateKey(new Date(), "Europe/London");
      const snapshot = makeDaySnapshot(state, dayKey);
      await performBackup(dayKey, snapshot);
      alert("Backup completed.");
      setState((s: AppState) => ({ ...s, lastBackupAt: new Date().toISOString() }));
    } catch (e) {
      console.error(e);
      alert("Backup failed. Please try again.");
    } finally {
      setIsBackingUp(false);
    }
  }, [state, setState]);

  const handleFinishDay = React.useCallback(async () => {
    try {
      setIsBackingUp(true);
      const nowIso = new Date().toISOString();
      const dayKey = localDateKey(new Date(), "Europe/London");
      const snapshot = makeDaySnapshot(state, dayKey, { endTime: nowIso });

      setState((s: AppState) => ({
        ...s,
        day: { ...(s.day ?? {}), endTime: nowIso },
      }));

      await performBackup(dayKey, snapshot);
      alert(`Day ${dayKey} finished and backed up.`);
      setState((s: AppState) => ({ ...s, lastBackupAt: nowIso }));
    } catch (e) {
      console.error(e);
      alert("Finish Day backup failed. Your data is still on this device.");
    } finally {
      setIsBackingUp(false);
    }
  }, [state, setState]);

  const stats = React.useMemo(() => computeCurrentStats(state), [state]);

  return (
    <div className="container">
      {/* Header restored to original style */}
      <header className="app-header">
        <div className="left">
          <h1 className="app-title">📍 Address Navigator</h1>
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            <strong>List v{state.currentListVersion}</strong>
            <span className="ml-6">Total: {stats.total}</span>
            <span className="ml-6">PIF: {stats.pifCount}</span>
            <span className="ml-6">DA: {stats.daCount}</span>
            <span className="ml-6">Done: {stats.doneCount}</span>
            <span className="ml-6">ARR: {stats.arrCount}</span>
            {state?.lastBackupAt && (
              <span className="ml-6">Last backup: {new Date(state.lastBackupAt).toLocaleString()}</span>
            )}
          </div>

          <div className="btn-row" style={{ marginTop: "0.5rem" }}>
            <button
              onClick={() => setShowBackups(true)}
              className="btn btn-ghost"
              title="View/restore previous backups"
            >
              📦 Backups
            </button>
            <button
              onClick={handleBackupNow}
              disabled={isBackingUp}
              className="btn btn-primary"
              title="Backup current data to Supabase"
            >
              {isBackingUp ? "Backing up…" : "💾 Backup now"}
            </button>
            <button
              onClick={handleFinishDay}
              disabled={isBackingUp}
              className="btn btn-outline"
              title="Set end time and back up today’s data"
            >
              {isBackingUp ? "Finishing…" : "✅ Finish Day"}
            </button>
          </div>
        </div>

        <div className="right">
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search address or postcode…"
            className="input"
            style={{ minWidth: 260 }}
          />
        </div>
      </header>

      {/* Two-column content (kept simple; styled by cards/rows CSS) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <section>
          <h2 className="section-title" style={{ marginBottom: 8 }}>Active List</h2>
          <AddressList
            state={state}
            setActive={setActive}
            cancelActive={cancelActive}
            onComplete={onComplete}
            onCreateArrangement={onCreateArrangement}
            filterText={filterText}
            ensureDayStarted={ensureDayStarted}
          />
        </section>

        <section style={{ marginTop: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 8 }}>Completed</h2>
          <Completed
            addresses={state.addresses ?? []}
            completions={state.completions ?? []}
            currentListVersion={state.currentListVersion}
            onChangeOutcome={handleChangeOutcome}
          />
        </section>
      </div>

      <BackupsPanel open={showBackups} onClose={() => setShowBackups(false)} setState={setState} />
    </div>
  );
}
