// src/App.tsx
import * as React from "react";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import type { AppState, Outcome } from "./types";
import { BackupsPanel } from "./components/BackupsPanel";

// Version-safe outcome updates (Step B)
import { updateOutcomeByIndexAndVersion } from "./state/updateOutcome";

// Creation path you already added (listVersion+snapshot)
import { createCompletion, upsertCompletion } from "./state/createCompletion";

// Optional stats header
import { computeCurrentStats } from "./state/selectors";

// ✅ Backup helpers
import { localDateKey, makeDaySnapshot, performBackup } from "./backup/backup";

import { useAppState } from "./state/useAppState";

export default function App() {
  const { state, setState } = useAppState();
  const [filterText, setFilterText] = React.useState("");
  const [isBackingUp, setIsBackingUp] = React.useState(false);

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

  // Stamped creation + upsert (you already use this)
  const onComplete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s: AppState) => {
        const comp = createCompletion(s, index, outcome, amount);
        return upsertCompletion(s, comp);
      });
    },
    [setState]
  );

  // Version-safe outcome updates (used by Completed)
  const handleChangeOutcome = React.useCallback(
    (index: number, o: Outcome, amount?: string, listVersion?: number) => {
      setState((s: AppState) => updateOutcomeByIndexAndVersion(s, index, o, amount, listVersion));
    },
    [setState]
  );

  // ✅ Manual "Backup now"
  const handleBackupNow = React.useCallback(async () => {
    try {
      setIsBackingUp(true);
      const dayKey = localDateKey(new Date(), "Europe/London");
      const snapshot = makeDaySnapshot(state, dayKey);
      await performBackup(dayKey, snapshot);
      alert("Backup completed.");
      setState((s) => ({ ...s, lastBackupAt: new Date().toISOString() } as AppState));
    } catch (e) {
      console.error(e);
      alert("Backup failed. Please try again.");
    } finally {
      setIsBackingUp(false);
    }
  }, [state, setState]);

  // ✅ Finish Day → set endTime and back up the final snapshot
  const handleFinishDay = React.useCallback(async () => {
    try {
      setIsBackingUp(true);
      const nowIso = new Date().toISOString();
      const dayKey = localDateKey(new Date(), "Europe/London");
      const snapshot = makeDaySnapshot(state, dayKey, { endTime: nowIso });

      // Update endTime locally for UX consistency
      setState((s: AppState) => ({
        ...s,
        day: { ...(s.day ?? {}), endTime: nowIso },
      }));

      await performBackup(dayKey, snapshot);
      alert(`Day ${dayKey} finished and backed up.`);
      setState((s) => ({ ...s, lastBackupAt: nowIso } as AppState));
    } catch (e) {
      console.error(e);
      alert("Finish Day backup failed. Your data is still on this device.");
    } finally {
      setIsBackingUp(false);
    }
  }, [state, setState]);

  const stats = React.useMemo(() => computeCurrentStats(state), [state]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-3 border-b flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Address Navigator</h1>

        <div className="ml-2 text-sm">
          <span className="mr-3">List v{state.currentListVersion}</span>
          <span className="mr-2">Total: {stats.total}</span>
          <span className="mr-2">PIF: {stats.pifCount}</span>
          <span className="mr-2">DA: {stats.daCount}</span>
          <span className="mr-2">Done: {stats.doneCount}</span>
          <span className="mr-2">ARR: {stats.arrCount}</span>
          {state?.lastBackupAt && (
            <span className="ml-2 opacity-70">Last backup: {new Date(state.lastBackupAt).toLocaleString()}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search address or postcode…"
            className="border rounded px-3 py-1 text-sm"
          />
          <button
            onClick={handleBackupNow}
            disabled={isBackingUp}
            className="border rounded px-3 py-1 text-sm"
            title="Backup current data to Supabase"
          >
            {isBackingUp ? "Backing up…" : "Backup now"}
          </button>
          <button
            onClick={handleFinishDay}
            disabled={isBackingUp}
            className="border rounded px-3 py-1 text-sm"
            title="Set end time and back up today’s data"
          >
            {isBackingUp ? "Finishing…" : "Finish Day"}
          </button>
        </div>
      </header>

      <main className="grid md:grid-cols-2 gap-4 p-3">
        <section className="min-w-0">
          <h2 className="text-sm font-medium mb-2">Active List (v{state.currentListVersion})</h2>
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

        <section className="min-w-0">
          <h2 className="text-sm font-medium mb-2">Completed</h2>
          <Completed
            addresses={state.addresses ?? []}
            completions={state.completions ?? []}
            currentListVersion={state.currentListVersion}
            onChangeOutcome={handleChangeOutcome}
          />
        </section>
      </main>
    </div>
  );
}
