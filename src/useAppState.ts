// src/useAppState.ts
import * as React from "react";
import { get, set } from "idb-keyval";
import type {
  AddressRow,
  AppState,
  Completion,
  Outcome,
  DaySession,
  Arrangement,
} from "./types";

const STORAGE_KEY = "navigator_state_v3";

const initial: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1, // make sure this exists
};

export function useAppState() {
  const [state, setState] = React.useState<AppState>(initial);
  const [loading, setLoading] = React.useState(true);

  // load
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await get(STORAGE_KEY)) as AppState | undefined;
        if (alive && saved) {
          setState({
            addresses: Array.isArray(saved.addresses) ? saved.addresses : [],
            activeIndex: saved.activeIndex ?? null,
            completions: Array.isArray(saved.completions) ? saved.completions : [],
            daySessions: Array.isArray(saved.daySessions) ? saved.daySessions : [],
            arrangements: Array.isArray(saved.arrangements) ? saved.arrangements : [],
            currentListVersion:
              typeof (saved as any).currentListVersion === "number"
                ? (saved as any).currentListVersion
                : 1,
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // persist (debounced)
  React.useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => set(STORAGE_KEY, state).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [state, loading]);

  // ── actions ────────────────────────────────────────────────────────────────

  const setAddresses = React.useCallback((rows: AddressRow[]) => {
    setState((s) => ({
      ...s,
      addresses: Array.isArray(rows) ? rows : [],
      activeIndex: null,
      // keep history/sessions/arrangements
      currentListVersion: (s.currentListVersion ?? 1) + 1, // bump on each import
    }));
  }, []);

  const addAddress = React.useCallback((addressRow: AddressRow) => {
    return new Promise<number>((resolve) => {
      setState((s) => {
        const newAddresses = [...s.addresses, addressRow];
        const newIndex = newAddresses.length - 1;
        setTimeout(() => resolve(newIndex), 0);
        return { ...s, addresses: newAddresses };
      });
    });
  }, []);

  const setActive = React.useCallback((idx: number) => {
    setState((s) => ({ ...s, activeIndex: idx }));
  }, []);

  const cancelActive = React.useCallback(() => {
    setState((s) => ({ ...s, activeIndex: null }));
  }, []);

  const complete = React.useCallback((index: number, outcome: Outcome, amount?: string) => {
    setState((s) => {
      const a = s.addresses[index];
      if (!a) return s;
      const nowISO = new Date().toISOString();
      const c: Completion = {
        index,
        address: a.address,
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        outcome,
        amount,
        timestamp: nowISO,
        listVersion: s.currentListVersion ?? 1,
      };
      const next: AppState = { ...s, completions: [c, ...s.completions] };
      if (s.activeIndex === index) next.activeIndex = null;
      return next;
    });
  }, []);

  const undo = React.useCallback((index: number) => {
    setState((s) => {
      const arr = s.completions.slice();
      const pos = arr.findIndex((c) => Number(c.index) === Number(index));
      if (pos >= 0) arr.splice(pos, 1);
      return { ...s, completions: arr };
    });
  }, []);

  // day sessions

  const startDay = React.useCallback(() => {
    setState((s) => {
      if (s.daySessions.some((d) => !d.end)) return s; // already active
      const now = new Date();
      const sess: DaySession = {
        date: now.toISOString().slice(0, 10),
        start: now.toISOString(),
      };
      return { ...s, daySessions: [...s.daySessions, sess] };
    });
  }, []);

  const endDay = React.useCallback(() => {
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
      } catch {}
      arr[i] = act;
      return { ...s, daySessions: arr };
    });
  }, []);

  /** Edit the start time for a given YYYY-MM-DD session (latest one for that date). */
  const editStartForDate = React.useCallback((dateStr: string, newISO: string) => {
    setState((s) => {
      const idx = (() => {
        let last = -1;
        for (let i = 0; i < s.daySessions.length; i++) {
          if (s.daySessions[i].date === dateStr) last = i;
        }
        return last;
      })();
      if (idx === -1) return s;
      const arr = s.daySessions.slice();
      const sess = { ...arr[idx], start: newISO };
      if (sess.end) {
        const startMs = Date.parse(sess.start);
        const endMs = Date.parse(sess.end);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
          sess.durationSeconds = Math.floor((endMs - startMs) / 1000);
        } else {
          delete sess.durationSeconds;
        }
      }
      arr[idx] = sess;
      return { ...s, daySessions: arr };
    });
  }, []);

  // arrangements

  const addArrangement = React.useCallback(
    (arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">) => {
      setState((s) => {
        const now = new Date().toISOString();
        const newArrangement: Arrangement = {
          ...arrangementData,
          id: `arr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          createdAt: now,
          updatedAt: now,
        };
        return { ...s, arrangements: [...s.arrangements, newArrangement] };
      });
    },
    []
  );

  const updateArrangement = React.useCallback((id: string, updates: Partial<Arrangement>) => {
    setState((s) => ({
      ...s,
      arrangements: s.arrangements.map((arr) =>
        arr.id === id ? { ...arr, ...updates, updatedAt: new Date().toISOString() } : arr
      ),
    }));
  }, []);

  const deleteArrangement = React.useCallback((id: string) => {
    setState((s) => ({
      ...s,
      arrangements: s.arrangements.filter((arr) => arr.id !== id),
    }));
  }, []);

  // backup / restore

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

  const backupState = React.useCallback(() => {
    const snap: AppState = {
      addresses: state.addresses,
      completions: state.completions,
      activeIndex: state.activeIndex,
      daySessions: state.daySessions,
      arrangements: state.arrangements,
      currentListVersion: state.currentListVersion ?? 1,
    };
    return snap;
  }, [state]);

  const restoreState = React.useCallback((obj: unknown) => {
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    const snapshot: AppState = {
      addresses: obj.addresses,
      completions: obj.completions,
      activeIndex: obj.activeIndex ?? null,
      daySessions: obj.daySessions ?? [],
      arrangements: obj.arrangements ?? [],
      currentListVersion: (obj as any).currentListVersion ?? 1,
    };
    setState(snapshot);
    set(STORAGE_KEY, snapshot).catch(() => {});
  }, []);

  return {
    state,
    loading,
    setState,
    // addresses
    setAddresses,
    addAddress,
    // active
    setActive,
    cancelActive,
    // completions
    complete,
    undo,
    // day sessions
    startDay,
    endDay,
    editStartForDate, // ✅ new
    // arrangements
    addArrangement,
    updateArrangement,
    deleteArrangement,
    // backup/restore
    backupState,
    restoreState,
  };
}