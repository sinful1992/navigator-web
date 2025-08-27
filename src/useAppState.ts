// src/useAppState.ts
import * as React from "react";
import { get, set } from "idb-keyval";
import type { AddressRow, AppState, Completion, Outcome, DaySession } from "./types";

const STORAGE_KEY = "navigator_state_v2";

const initial: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
};

export function useAppState() {
  const [state, setState] = React.useState<AppState>(initial);
  const [loading, setLoading] = React.useState(true);

  // Load persisted state
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await get(STORAGE_KEY)) as AppState | undefined;
        if (alive && saved) setState(saved);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist on every change (debounced)
  React.useEffect(() => {
    const t = setTimeout(() => set(STORAGE_KEY, state).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [state]);

  // ---- actions ----

  const setAddresses = (rows: AddressRow[]) => {
    setState((s) => ({
      ...s,
      addresses: rows,
      activeIndex: null,
      // keep existing completions/sessions
    }));
  };

  const setActive = (idx: number) => {
    setState((s) => ({ ...s, activeIndex: idx }));
  };

  const cancelActive = () => {
    setState((s) => ({ ...s, activeIndex: null }));
  };

  const complete = (index: number, outcome: Outcome, amount?: string) => {
    setState((s) => {
      const a = s.addresses[index];
      if (!a) return s;
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
      // Clear active if it’s the one just completed
      if (s.activeIndex === index) next.activeIndex = null;
      return next;
    });
  };

  const undo = (index: number) => {
    setState((s) => ({
      ...s,
      completions: s.completions.filter((c) => c.index !== index),
    }));
  };

  // Day tracking
  const startDay = () => {
    setState((s) => {
      // if already active, no-op
      const hasActive = s.daySessions.some((d) => !d.end);
      if (hasActive) return s;
      const today = new Date();
      const sess: DaySession = {
        date: today.toISOString().slice(0, 10),
        start: today.toISOString(),
      };
      return { ...s, daySessions: [...s.daySessions, sess] };
    });
  };

  const endDay = () => {
    setState((s) => {
      const i = s.daySessions.findIndex((d) => !d.end);
      if (i === -1) return s;
      const now = new Date();
      const arr = s.daySessions.slice();
      const act = { ...arr[i] };
      act.end = now.toISOString();
      try {
        const start = new Date(act.start).getTime();
        const end = now.getTime();
        if (end > start) act.durationSeconds = Math.floor((end - start) / 1000);
      } catch {
        /* ignore */
      }
      arr[i] = act;
      return { ...s, daySessions: arr };
    });
  };

  // ---- backup/restore ----

  function isValidState(obj: any): obj is AppState {
    return (
      obj &&
      typeof obj === "object" &&
      Array.isArray(obj.addresses) &&
      Array.isArray(obj.completions) &&
      "activeIndex" in obj &&
      Array.isArray(obj.daySessions)
    );
  }

  const backupState = () => {
    // Return a snapshot; caller can download it as JSON
    return {
      addresses: state.addresses,
      completions: state.completions,
      activeIndex: state.activeIndex,
      daySessions: state.daySessions,
    } as AppState;
  };

  const restoreState = (obj: unknown) => {
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    const snapshot: AppState = {
      addresses: obj.addresses,
      completions: obj.completions,
      activeIndex: obj.activeIndex ?? null,
      daySessions: obj.daySessions ?? [],
    };
    setState(snapshot);
    // Optional: persist immediately (in addition to the debounced effect)
    set(STORAGE_KEY, snapshot).catch(() => {});
  };

  return {
    state,
    loading,
    setAddresses,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
    // backup/restore
    backupState,
    restoreState,
  };
}
