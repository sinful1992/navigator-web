// src/App.tsx
import * as React from "react";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import type { AppState, Outcome } from "./types";

// STEP B: version-safe outcome update helper
import { updateOutcomeByIndexAndVersion } from "./state/updateOutcome";

// If you already have a custom hook for state, keep it.
// This assumes your hook exposes { state, setState }.
import { useAppState } from "./state/useAppState";

export default function App() {
  const { state, setState } = useAppState(); // keep your existing source of truth
  const [filterText, setFilterText] = React.useState("");

  // --- Utility handlers you likely already have; keep your versions if present ---
  const setActive = React.useCallback(
    (index: number) => {
      setState((s: AppState) => ({
        ...s,
        activeIndex: index,
      }));
    },
    [setState]
  );

  const cancelActive = React.useCallback(() => {
    setState((s: AppState) => ({
      ...s,
      activeIndex: undefined,
    }));
  }, [setState]);

  // If you have your own implementation, keep it.
  const ensureDayStarted = React.useCallback(() => {
    setState((s: AppState) => {
      if (s?.day?.startTime) return s;
      const startTime = new Date().toISOString();
      return {
        ...s,
        day: { ...(s.day ?? {}), startTime },
      };
    });
  }, [setState]);

  // Placeholder — keep your real arrangement creator if you already have one.
  const onCreateArrangement = React.useCallback((addressIndex: number) => {
    // open arrangement form for addressIndex, etc.
    // keep your existing logic here
    console.debug("Create arrangement for index", addressIndex);
  }, []);

  // NOTE (Step C will refine this): this creates a new completion when an item is
  // completed from the active list. For Step B, it can remain as-is.
  const onComplete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s: AppState) => {
        const completions = (s.completions ?? []).slice();
        // If your app prevents duplicate completions for the same item+version,
        // you can early-return here. Otherwise, append a new completion.
        completions.push({
          index,
          outcome,
          amount: outcome === "PIF" ? amount : undefined,
          completedAt: new Date().toISOString(),
          // In Step C we’ll ensure listVersion and addressSnapshot are stamped here.
          // listVersion: s.currentListVersion,
          // addressSnapshot: s.addresses?.[index]?.address ?? `#${index + 1}`,
        });
        return { ...s, completions };
      });
    },
    [setState]
  );

  // STEP B: version-safe outcome updates (used by Completed.tsx)
  const handleChangeOutcome = React.useCallback(
    (index: number, o: Outcome, amount?: string, listVersion?: number) => {
      setState((s: AppState) => updateOutcomeByIndexAndVersion(s, index, o, amount, listVersion));
    },
    [setState]
  );

  // Simple layout — keep your real shell/navigation if you already have it
  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-3 border-b flex items-center gap-3">
        <h1 className="text-lg font-semibold">Address Navigator</h1>
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
            // STEP B: pass the version-safe updater
            onChangeOutcome={handleChangeOutcome}
            // (Optional) If you support deletions, wire your delete handler here:
            // onDeleteCompletion={(index, ver) => setState((s) => deleteCompletionByIndexAndVersion(s, index, ver))}
          />
        </section>
      </main>
    </div>
  );
}
