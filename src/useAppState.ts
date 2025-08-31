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
};

/* ------------ normalize helpers (no dedupe) ------------ */

function normAddressString(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = String(raw).toUpperCase();

  // tidy commas & spaces
  s = s.replace(/,+/g, ",");
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/\s+/g, " ").trim();

  // fix common postcode typo S0## -> SO##
  s = s.replace(/\bS0(?=\d)/g, "SO");
  return s;
}

function normalizeRow(row: AddressRow): AddressRow {
  return {
    address: normAddressString(row.address),
    lat: typeof row.lat === "number" && isFinite(row.lat) ? row.lat : null,
    lng: typeof row.lng === "number" && isFinite(row.lng) ? row.lng : null,
  };
}

function sameCoords(a?: number | null, b?: number | null) {
  if (a == null && b == null) return true;
  if (typeof a !== "number" || typeof b !== "number") return false;
  // loose match (≈11m at 5 dp)
  return a.toFixed(5) === b.toFixed(5);
}

function tryFindIndexByAddress(
  rows: AddressRow[],
  address: string,
  lat?: number | null,
  lng?: number | null
): number | undefined {
  const target = normAddressString(address);
  // prefer exact address + near coords
  let hit = rows.findIndex(
    (r) =>
      r.address === target &&
      sameCoords(r.lat ?? null, lat ?? null) &&
      sameCoords(r.lng ?? null, lng ?? null)
  );
  if (hit >= 0) return hit;

  // fallback: exact address match only
  hit = rows.findIndex((r) => r.address === target);
  return hit >= 0 ? hit : undefined;
}

/* reindex completions without removing/merging rows */
function reindexCompletionsNoReorder(
  completions: Completion[],
  rows: AddressRow[]
) {
  const out: Completion[] = [];
  const rowsMut = rows.slice(); // we may append if needed

  completions.forEach((c) => {
    let idx = Number.isInteger(c.index) ? (c.index as number) : -1;

    if (idx < 0 || idx >= rowsMut.length) {
      const guess = tryFindIndexByAddress(rowsMut, c.address, c.lat, c.lng);
      if (guess !== undefined) {
        idx = guess;
      } else {
        // preserve history: append a synthetic row for this completion
        const appended: AddressRow = normalizeRow({
          address: c.address,
          lat: c.lat ?? null,
          lng: c.lng ?? null,
        });
        rowsMut.push(appended);
        idx = rowsMut.length - 1;
      }
    }

    out.push({
      ...c,
      index: idx,
      address: normAddressString(c.address),
    });
  });

  return { completions: out, rows: rowsMut };
}

/* overall cleanup on load/restore: normalize only */
function applyCleanup(snap: AppState): AppState {
  const rowsNorm = Array.isArray(snap.addresses)
    ? snap.addresses.map(normalizeRow)
    : [];

  const { completions, rows } = reindexCompletionsNoReorder(
    Array.isArray(snap.completions) ? snap.completions : [],
    rowsNorm
  );

  return {
    addresses: rows,
    completions,
    activeIndex: snap.activeIndex ?? null,
    daySessions: Array.isArray(snap.daySessions) ? snap.daySessions : [],
    arrangements: Array.isArray(snap.arrangements) ? snap.arrangements : [],
  };
}

/* ---------------------- hook ---------------------- */

export function useAppState() {
  const [state, setState] = React.useState<AppState>(initial);
  const [loading, setLoading] = React.useState(true);

  // load
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await get(STORAGE_KEY)) as AppState | undefined;
        if (alive && saved) setState(applyCleanup(saved));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // persist
  React.useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => set(STORAGE_KEY, state).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [state, loading]);

  /* actions */

  const setAddresses = React.useCallback((rows: AddressRow[]) => {
    setState((s) => ({
      ...s,
      addresses: (Array.isArray(rows) ? rows : []).map(normalizeRow),
      activeIndex: null,
    }));
  }, []);

  const addAddress = React.useCallback((row: AddressRow) => {
    return new Promise<number>((resolve) => {
      setState((s) => {
        const next = [...s.addresses, normalizeRow(row)];
        const newIdx = next.length - 1;
        setTimeout(() => resolve(newIdx), 0);
        return { ...s, addresses: next };
      });
    });
  }, []);

  const setActive = React.useCallback((idx: number) => {
    setState((s) => ({ ...s, activeIndex: idx }));
  }, []);

  const cancelActive = React.useCallback(() => {
    setState((s) => ({ ...s, activeIndex: null }));
  }, []);

  const complete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string) => {
      setState((s) => {
        const a = s.addresses[index];
        if (!a) return s;
        const now = new Date().toISOString();
        const c: Completion = {
          index,
          address: a.address,
          lat: a.lat ?? null,
          lng: a.lng ?? null,
          outcome,
          amount,
          timestamp: now,
        };
        const next: AppState = { ...s, completions: [c, ...s.completions] };
        if (s.activeIndex === index) next.activeIndex = null;
        return next;
      });
    },
    []
  );

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
      if (s.daySessions.some((d) => !d.end)) return s;
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

  // backup/restore
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
    };
    return snap;
  }, [state]);

  const restoreState = React.useCallback((obj: unknown) => {
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    const cleaned = applyCleanup(obj as AppState); // normalize only; keep duplicates
    setState(cleaned);
    set(STORAGE_KEY, cleaned).catch(() => {});
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
    // arrangements
    addArrangement,
    updateArrangement,
    deleteArrangement,
    // backup/restore
    backupState,
    restoreState,
  };
}