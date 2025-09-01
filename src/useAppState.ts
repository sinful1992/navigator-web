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

const STORAGE_KEY = "navigator_state_v3"; // versioned for arrangements + listVersion

const initial: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1, // ✅ required by AppState
};

export function useAppState() {
  const [state, setState] = React.useState<AppState>(initial);
  const [loading, setLoading] = React.useState(true);

  // ---- load from IndexedDB ----
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await get(STORAGE_KEY)) as Partial<AppState> | undefined;
        if (alive && saved) {
          setState({
            addresses: Array.isArray(saved.addresses) ? saved.addresses : [],
            activeIndex:
              typeof saved.activeIndex === "number" ? saved.activeIndex : null,
            completions: Array.isArray(saved.completions) ? saved.completions : [],
            daySessions: Array.isArray(saved.daySessions) ? saved.daySessions : [],
            arrangements: Array.isArray(saved.arrangements) ? saved.arrangements : [],
            currentListVersion:
              typeof saved.currentListVersion === "number"
                ? saved.currentListVersion
                : 1, // ✅ default if missing in older snapshots
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

  // ---- persist to IndexedDB (debounced) ----
  React.useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      set(STORAGE_KEY, state).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [state, loading]);

  // ---------------- actions ----------------

  /** Replace the address list (e.g. after importing a new Excel file).
   *  We bump `currentListVersion` so future completions can record which list they belong to.
   *  (No dedupe: duplicate addresses remain separate rows.)
   */
  const setAddresses = React.useCallback((rows: AddressRow[]) => {
    setState((s) => ({
      ...s,
      addresses: Array.isArray(rows) ? rows : [],
      activeIndex: null,
      currentListVersion: (s.currentListVersion ?? 1) + 1, // ✅ bump version on new list
      // keep completions/daySessions/arrangements
    }));
  }, []);

  /** Append a single address row and return its index. */
  const addAddress = React.useCallback((addressRow: AddressRow) => {
    return new Promise<number>((resolve) => {
      setState((s) => {
        const newAddresses = [...s.addresses, addressRow];
        const newIndex = newAddresses.length - 1;
        // resolve on next tick so state is applied
        setTimeout(() => resolve(newIndex), 0);
        return {
          ...s,
          addresses: newAddresses,
        };
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
   * Record a completion for an address index.
   * Also stamps the current listVersion so history remains clear across imports.
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
          listVersion: s.currentListVersion, // ✅ track which list this belonged to
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

  /** Undo the most recent completion for the given address index (first match removal). */
  const undo = React.useCallback((index: number) => {
    setState((s) => {
      const arr = s.completions.slice();
      const pos = arr.findIndex((c) => Number(c.index) === Number(index));
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

  const updateArrangement = React.useCallback(
    (id: string, updates: Partial<Arrangement>) => {
      setState((s) => ({
        ...s,
        arrangements: s.arrangements.map((arr) =>
          arr.id === id
            ? { ...arr, ...updates, updatedAt: new Date().toISOString() }
            : arr
        ),
      }));
    },
    []
  );

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
      currentListVersion: state.currentListVersion, // ✅ include in backup
    };
    return snap;
  }, [state]);

  const restoreState = React.useCallback((obj: unknown) => {
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    const src = obj as AppState;
    const snapshot: AppState = {
      addresses: Array.isArray(src.addresses) ? src.addresses : [],
      completions: Array.isArray(src.completions) ? src.completions : [],
      activeIndex:
        typeof src.activeIndex === "number" ? src.activeIndex : null,
      daySessions: Array.isArray(src.daySessions) ? src.daySessions : [],
      arrangements: Array.isArray(src.arrangements) ? src.arrangements : [],
      currentListVersion:
        typeof src.currentListVersion === "number" ? src.currentListVersion : 1, // ✅ default if missing
    };
    setState(snapshot);
    set(STORAGE_KEY, snapshot).catch(() => {});
  }, []);

  return {
    state,
    loading,
    setState, // for cloud sync integrations
    // addresses
    setAddresses,
    addAddress, // add single address and get its index
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