// src/App.tsx
import * as React from "react";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import type { AppState, Outcome } from "./types";

// Step B: version-safe outcome updates
import { updateOutcomeByIndexAndVersion } from "./state/updateOutcome";

// Step C: stamped creation + safe backfill
import { createCompletion, upsertCompletion } from "./state/createCompletion";
import { backfillCompletionSnapshotsOnce } from "./migrations/backfillCompletionSnapshots";

// Step D: centralised stats
import { computeCurrentStats } from "./state/selectors";

// Keep your existing state hook
import { useAppState } from "./state/useAppState";

export default function App() {
  const { state, setState } = useAppState();
  const [filterText, setFilterText] = React.useState("");

  // Step C: one-time safe backfill for legacy completions missing snapshots
  React.useEffect(() => {
    setState((s: AppState) => backfillCompletionSnapshotsOnce(s));
  }, [setState]);

  // Basic handlers (keep your own if you have them)
  const setActive = React.useCallback(
    (index: number) => {
      setState((s: AppState) => ({ ...s, activeIndex: index }));
    },
    [setState]
  );

  const cancelActive = React.useCallback(() => {
    setState((s: AppState) => ({ ...s, activeIndex: undefined }));
  }, [setState]);

  const ensureDayStarted = React.useCallback(() => {
    setState((s: AppState) => {
      if (s?.day?.startTime) return s;
      return { ...s, day: { ...(s.day ?? {}), startTime: new Date().toISOString() } };
    });
  }, [setState]);

  const onCreateArrangement = React.useCallback((addressIndex: number) => {
    // open arrangement form, etc. Keep your existing logic here.
    console.debug("Create arrangement for index", addressIndex);
  }, []);

  // Step C: new completion write path (stamped + upserted)
  const onComplete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s: AppState) => {
        const comp = createCompletion(s, index, outcome, amount);
        return upsertCompletion(s, comp);
      });
    },
    [setState]
  );

  // Step B: version-safe outcome updates used by Completed.tsx
  const handleChangeOutcome = React.useCallback(
    (index: number, o: Outcome, amount?: string, listVersion?: number) => {
      setState((s: AppState) => updateOutcomeByIndexAndVersion(s, index, o, amount, listVersion));
    },
    [setState]
  );

  // Step D: compute stats for current list
  const stats = React.useMemo(() => computeCurrentStats(state), [state]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-3 border-b flex items-center gap-3">
        <h1 className="text-lg font-semibold">Address Navigator</h1>

        <div className="ml-6 text-sm">
          <span className="mr-3">List v{state.currentListVersion}</span>
          <span className="mr-2">Total: {stats.total}</span>
          <span className="mr-2">PIF: {stats.pifCount}</span>
          <span className="mr-2">DA: {stats.daCount}</span>
          <span className="mr-2">Done: {stats.doneCount}</span>
          <span className="mr-2">ARR: {stats.arrCount}</span>
        </div>

        <div className="ml-auto">
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search address or postcode…"
            className="border rounded px-3 py-1 text-sm"
          />
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
            // If you support deletions, wire your delete handler here:
            // onDeleteCompletion={(index, ver) => setState((s) => deleteCompletionByIndexAndVersion(s, index, ver))}
          />
        </section>
      </main>
    </div>
  );
}
