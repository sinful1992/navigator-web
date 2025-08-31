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

const STORAGE_KEY = "navigator_state_v4"; // bump key because structure changed

const initial: AppState = {
  currentListVersion: 1,
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
};

export function useAppState() {
  const [state, setState] = React.useState<AppState>(initial);
  const [loading, setLoading] = React.useState(true);

  // ---- load from IndexedDB ----
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await get(STORAGE_KEY)) as AppState | undefined;

        if (alive && saved) {
          // Migrate older snapshots that didn't have versions
          const migrated: AppState = {
            currentListVersion:
              typeof (saved as any).currentListVersion === "number"
                ? (saved as any).currentListVersion
                : 1,
            addresses: Array.isArray(saved.addresses) ? saved.addresses : [],
            activeIndex:
              typeof saved.activeIndex === "number" || saved.activeIndex === null
                ? saved.activeIndex
                : null,
            completions: Array.isArray(saved.completions)
              ? saved.completions.map((c: any) => ({
                  ...c,
                  listVersion:
                    typeof c?.listVersion === "number" ? c.listVersion : 1,
                }))
              : [],
            daySessions: Array.isArray(saved.daySessions) ? saved.daySessions : [],
            arrangements: Array.isArray((saved as any).arrangements)
              ? (saved as any).arrangements
              : [],
          };
          setState(migrated);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- persist to IndexedDB (debounced) ----
  React.useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      set(STORAGE_KEY, state).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [state, loading]);

  // ---------------- actions ----------------

  /**
   * Import a new file:
   * - Increments the list version.
   * - Replaces the addresses with the new set.
   * - Keeps history (completions retain their prior listVersion).
   * - Does NOT relink old completions to this new version.
   */
  const setAddresses = React.useCallback((rows: AddressRow[]) => {
    setState((s) => ({
      ...s,
      currentListVersion: (s.currentListVersion ?? 1) + 1,
      addresses: Array.isArray(rows) ? rows : [],
      activeIndex: null,
      // Keep completions/daySessions/arrangements as history.
    }));
  }, []);

  /**
   * Add a single address interactively (used by Arrangements).
   */
  const addAddress = React.useCallback((addressRow: AddressRow) => {
    return new Promise<number>((resolve) => {
      setState((s) => {
        const newAddresses = [...s.addresses, addressRow];
        const newIndex = newAddresses.length - 1;
        const next = { ...s, addresses: newAddresses };
        set(STORAGE_KEY, next).catch(() => {});
        setTimeout(() => resolve(newIndex), 0);
        return next;
      });
    });
  }, []);

  const setActive = React.useCallback((idx: number) => {
    setState((s) => ({ ...s, activeIndex: idx }));
  }, []);

  const cancelActive = React.useCallback(() => {
    setState((s) => ({ ...s, activeIndex: null }));
  }, []);

  /**
   * Record a completion for the current list version.
   */
  const complete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
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
          listVersion: s.currentListVersion ?? 1, // tag with active version
        };

        const next: AppState = {
          ...s,
          completions: [c, ...s.completions],
        };
        if (s.activeIndex === index) next.activeIndex = null;
        return next;
      });
    },
    []
  );

  /**
   * Undo the most recent completion for the given index in the **current** version.
   */
  const undo = React.useCallback((index: number) => {
    setState((s) => {
      const v = s.currentListVersion ?? 1;
      const arr = s.completions.slice();
      const pos = arr.findIndex(
        (c) => Number(c.index) === Number(index) && c.listVersion === v
      );
      if (pos >= 0) arr.splice(pos, 1);
      return { ...s, completions: arr };
    });
  }, []);

  // ---- day tracking ----

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
      } catch {
        /* ignore */
      }
      arr[i] = act;
      return { ...s, daySessions: arr };
    });
  }, []);

  // ---- arrangements ----

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

        return {
          ...s,
          arrangements: [...s.arrangements, newArrangement],
        };
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

  // ---- backup / restore ----

  function isValidState(obj: any): obj is AppState {
    return (
      obj &&
      typeof obj === "object" &&
      typeof obj.currentListVersion === "number" &&
      Array.isArray(obj.addresses) &&
      Array.isArray(obj.completions) &&
      "activeIndex" in obj &&
      Array.isArray(obj.daySessions) &&
      Array.isArray(obj.arrangements)
    );
  }

  const backupState = React.useCallback(() => {
    const snap: AppState = {
      currentListVersion: state.currentListVersion,
      addresses: state.addresses,
      completions: state.completions,
      activeIndex: state.activeIndex,
      daySessions: state.daySessions,
      arrangements: state.arrangements,
    };
    return snap;
  }, [state]);

  const restoreState = React.useCallback((obj: unknown) => {
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    const snapshot: AppState = {
      currentListVersion: obj.currentListVersion,
      addresses: obj.addresses,
      completions: obj.completions,
      activeIndex: obj.activeIndex ?? null,
      daySessions: obj.daySessions ?? [],
      arrangements: obj.arrangements ?? [],
    };
    setState(snapshot);
    set(STORAGE_KEY, snapshot).catch(() => {});
  }, []);

  return {
    state,
    loading,
    setState, // for cloud sync
    // addresses
    setAddresses, // increments version (fresh run)
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
    // arrangements
    addArrangement,
    updateArrangement,
    deleteArrangement,
    // backup/restore
    backupState,
    restoreState,
  };
}