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

/** ================================
 *  Persistent storage keys
 *  ================================ */
const STORAGE_KEY = "navigator_state_v4"; // App state
const DEVICE_ID_KEY = "navigator_device_id_v1";
const OPSEQ_KEY = "navigator_opseq_v1";

/** ================================
 *  Optimistic update types
 *  ================================ */
type StateUpdate = {
  id: string;
  timestamp: string; // ISO
  type: "optimistic" | "confirmed" | "reverted";
  operation: "create" | "update" | "delete";
  entity: "completion" | "arrangement" | "address" | "session";
  data: any;
};

type OptimisticState = {
  updates: Map<string, StateUpdate>;
  pendingOperations: Set<string>;
};

/** ================================
 *  Initial state
 *  ================================ */
const initial: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1,
};

/** ================================
 *  Helpers
 *  ================================ */
function stampCompletionsWithVersion(
  completions: any[] | undefined,
  version: number
): Completion[] {
  const src = Array.isArray(completions) ? completions : [];
  return src.map((c: any) => ({
    ...c,
    // if missing, tag with the snapshot's version
    listVersion: typeof c?.listVersion === "number" ? c.listVersion : version,
  }));
}

// Deterministic ID for optimistic operations
function generateOperationId(type: string, entity: string, data: any): string {
  const payload = JSON.stringify(data);
  const key = `${type}_${entity}_${payload.slice(0, 50)}_${Date.now()}`;
  // base64 + sanitize + trim
  const b64 = typeof btoa === "function" ? btoa(key) : Buffer.from(key).toString("base64");
  return b64.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

// Apply optimistic updates (pure function across a base snapshot)
function applyOptimisticUpdates(
  baseState: AppState,
  updates: Map<string, StateUpdate>
): AppState {
  let result = { ...baseState };

  const sortedUpdates = Array.from(updates.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const update of sortedUpdates) {
    if (update.type === "reverted") continue;

    switch (update.entity) {
      case "completion":
        if (update.operation === "create") {
          result.completions = [update.data, ...result.completions];
        } else if (update.operation === "update") {
          result.completions = result.completions.map((c) =>
            c.timestamp === update.data.originalTimestamp ? { ...c, ...update.data } : c
          );
        } else if (update.operation === "delete") {
          result.completions = result.completions.filter(
            (c) => c.timestamp !== update.data.timestamp
          );
        }
        break;

      case "arrangement":
        if (update.operation === "create") {
          // Dedupe by id, then sort by updatedAt desc
          const map = new Map<string, Arrangement>([
            ...result.arrangements.map<[string, Arrangement]>((a) => [a.id, a]),
            [update.data.id, update.data as Arrangement],
          ]);
          result.arrangements = Array.from(map.values()).sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        } else if (update.operation === "update") {
          // Keep sorted after update as well
          result.arrangements = result.arrangements
            .map((a) => (a.id === update.data.id ? { ...a, ...update.data } : a))
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
        } else if (update.operation === "delete") {
          result.arrangements = result.arrangements.filter(
            (a) => a.id !== update.data.id
          );
        }
        break;

      case "address":
        if (update.operation === "create") {
          result.addresses = [...result.addresses, update.data];
        }
        break;

      case "session":
        if (update.operation === "create") {
          result.daySessions = [...result.daySessions, update.data];
        } else if (update.operation === "update") {
          result.daySessions = result.daySessions.map((session) =>
            session.date === update.data.date ? { ...session, ...update.data } : session
          );
        }
        break;
    }
  }
  return result;
}

/** ================================
 *  Hook
 *  ================================ */
export function useAppState() {
  const [baseState, setBaseState] = React.useState<AppState>(initial);
  const [optimisticState, setOptimisticState] = React.useState<OptimisticState>({
    updates: new Map(),
    pendingOperations: new Set(),
  });
  const [loading, setLoading] = React.useState(true);

  // Device identity + op sequence (for sync metadata)
  const [deviceId, setDeviceId] = React.useState<string>("");
  const [opSeq, setOpSeq] = React.useState<number>(0);

  // Conflicts (we’ll expand structure later)
  type Conflict =
    | {
        type: "completion";
        incoming: Completion;
        existing: Completion;
        resolution: "prefer_incoming" | "prefer_existing";
      }
    | {
        type: "arrangement";
        incoming: Arrangement;
        existing: Arrangement;
        resolution: "prefer_incoming" | "prefer_existing";
      };
  const [conflicts, setConflicts] = React.useState<Map<string, Conflict>>(
    new Map()
  );

  /** -------- Derived state (base + optimistic) -------- */
  const state = React.useMemo(() => {
    return applyOptimisticUpdates(baseState, optimisticState.updates);
  }, [baseState, optimisticState.updates]);

  /** -------- Boot: load device ID + opSeq + state -------- */
  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // Device ID
        let id = (await get(DEVICE_ID_KEY)) as string | undefined;
        if (!id) {
          const rnd =
            (globalThis as any).crypto?.randomUUID?.() ??
            `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          id = String(rnd);
          await set(DEVICE_ID_KEY, id);
        }
        if (!alive) return;
        setDeviceId(id);

        // opSeq
        const seq = (await get(OPSEQ_KEY)) as number | undefined;
        if (!alive) return;
        setOpSeq(typeof seq === "number" ? seq : 0);

        // App state
        const saved = (await get(STORAGE_KEY)) as Partial<AppState> | undefined;
        if (!alive) return;

        if (saved) {
          const version =
            typeof saved.currentListVersion === "number"
              ? saved.currentListVersion
              : 1;

          const next: AppState = {
            addresses: Array.isArray(saved.addresses) ? saved.addresses : [],
            activeIndex:
              typeof saved.activeIndex === "number" ? saved.activeIndex : null,
            completions: stampCompletionsWithVersion(saved.completions, version),
            daySessions: Array.isArray(saved.daySessions)
              ? saved.daySessions
              : [],
            arrangements: Array.isArray(saved.arrangements)
              ? saved.arrangements
              : [],
            currentListVersion: version,
          };

          setBaseState(next);
        }
      } catch (error) {
        console.warn("Failed to init device/state:", error);
        // Continue with initial
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /** -------- Persist state (debounced) -------- */
  React.useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => set(STORAGE_KEY, baseState).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [baseState, loading]);

  /** -------- opSeq increment (synchronous, persisted) -------- */
  const nextOpSeqSync = React.useCallback((): number => {
    const current = typeof opSeq === "number" ? opSeq : 0;
    const next = current + 1;
    setOpSeq(next);
    set(OPSEQ_KEY, next).catch(() => {});
    return next;
  }, [opSeq]);

  /** -------- Optimistic update helpers -------- */
  const addOptimisticUpdate = React.useCallback(
    (
      operation: "create" | "update" | "delete",
      entity: "completion" | "arrangement" | "address" | "session",
      data: any,
      operationId?: string
    ): string => {
      const id = operationId || generateOperationId(operation, entity, data);
      const timestamp = new Date().toISOString();

      const update: StateUpdate = {
        id,
        timestamp,
        type: "optimistic",
        operation,
        entity,
        data,
      };

      setOptimisticState((prev) => {
        const updates = new Map(prev.updates);
        updates.set(id, update);
        return {
          updates,
          pendingOperations: new Set([...prev.pendingOperations, id]),
        };
      });

      return id;
    },
    []
  );

  const confirmOptimisticUpdate = React.useCallback(
    (operationId: string, confirmedData?: any) => {
      setOptimisticState((prev) => {
        const updates = new Map(prev.updates);
        const pendingOperations = new Set(prev.pendingOperations);

        const existing = updates.get(operationId);
        if (existing) {
          updates.set(operationId, {
            ...existing,
            type: "confirmed",
            data: confirmedData || existing.data,
          });
        }

        pendingOperations.delete(operationId);
        return { updates, pendingOperations };
      });

      // Clean up confirmed updates after a delay
      setTimeout(() => {
        setOptimisticState((prev) => {
          const updates = new Map(prev.updates);
          updates.delete(operationId);
          return { ...prev, updates };
        });
      }, 5000);
    },
    []
  );

  const revertOptimisticUpdate = React.useCallback(
    (operationId: string, reason?: string) => {
      console.warn(`Reverting optimistic update ${operationId}:`, reason);

      setOptimisticState((prev) => {
        const updates = new Map(prev.updates);
        const pendingOperations = new Set(prev.pendingOperations);

        const existing = updates.get(operationId);
        if (existing) {
          updates.set(operationId, {
            ...existing,
            type: "reverted",
          });
        }

        pendingOperations.delete(operationId);
        return { updates, pendingOperations };
      });

      // Clean up reverted updates soon after
      setTimeout(() => {
        setOptimisticState((prev) => {
          const updates = new Map(prev.updates);
          updates.delete(operationId);
          return { ...prev, updates };
        });
      }, 1000);
    },
    []
  );

  const clearOptimisticUpdates = React.useCallback(() => {
    setOptimisticState({
      updates: new Map(),
      pendingOperations: new Set(),
    });
  }, []);

  /** ================================
   *  Enhanced actions (addresses)
   *  ================================ */
  const setAddresses = React.useCallback(
    (rows: AddressRow[]) => {
      const operationId = generateOperationId("update", "address", {
        type: "bulk_import",
        count: rows.length,
      });

      addOptimisticUpdate("update", "address", { addresses: rows, bumpVersion: true }, operationId);

      setBaseState((s) => ({
        ...s,
        addresses: Array.isArray(rows) ? rows : [],
        activeIndex: null,
        currentListVersion: (s.currentListVersion || 1) + 1,
      }));

      confirmOptimisticUpdate(operationId);
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const addAddress = React.useCallback(
    (addressRow: AddressRow): Promise<number> => {
      return new Promise<number>((resolve) => {
        const operationId = generateOperationId("create", "address", addressRow);
        addOptimisticUpdate("create", "address", addressRow, operationId);

        setBaseState((s) => {
          const newAddresses = [...s.addresses, addressRow];
          const newIndex = newAddresses.length - 1;

          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve(newIndex);
          }, 0);

          return { ...s, addresses: newAddresses };
        });
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const setActive = React.useCallback((idx: number) => {
    setBaseState((s) => ({ ...s, activeIndex: idx }));
  }, []);

  const cancelActive = React.useCallback(() => {
    setBaseState((s) => ({ ...s, activeIndex: null }));
  }, []);

  /** ================================
   *  Completions
   *  ================================ */
  const complete = React.useCallback(
    (index: number, outcome: Outcome, amount?: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        setBaseState((s) => {
          const a = s.addresses[index];
          if (!a) {
            reject(new Error(`Address at index ${index} not found`));
            return s;
          }

          const nowISO = new Date().toISOString();
          const completion: Completion = {
            index,
            address: a.address,
            lat: a.lat ?? null,
            lng: a.lng ?? null,
            outcome,
            amount,
            timestamp: nowISO,
            listVersion: s.currentListVersion,
          };

          const operationId = generateOperationId("create", "completion", completion);
          addOptimisticUpdate("create", "completion", completion, operationId);

          const next: AppState = {
            ...s,
            completions: [completion, ...s.completions],
          };
          if (s.activeIndex === index) next.activeIndex = null;

          setTimeout(() => resolve(operationId), 0);
          return next;
        });
      });
    },
    [addOptimisticUpdate]
  );

  const undo = React.useCallback(
    (index: number) => {
      setBaseState((s) => {
        const arr = s.completions.slice();
        const pos = arr.findIndex(
          (c) =>
            Number(c.index) === Number(index) &&
            c.listVersion === s.currentListVersion
        );

        if (pos >= 0) {
          const completion = arr[pos];
          const operationId = generateOperationId("delete", "completion", completion);
          addOptimisticUpdate("delete", "completion", completion, operationId);
          arr.splice(pos, 1);
          setTimeout(() => confirmOptimisticUpdate(operationId), 0);
        }

        return { ...s, completions: arr };
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /** ================================
   *  Day sessions (stamp sync meta)
   *  ================================ */
  const startDay = React.useCallback(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const seq = nextOpSeqSync();

    setBaseState((s) => {
      if (s.daySessions.some((d) => !d.end)) return s; // already active

      const sess: DaySession = {
        date: today,
        start: now.toISOString(),
      };
      // Attach sync metadata without changing the DaySession type
      (sess as any).updatedAt = now.toISOString();
      (sess as any).updatedBy = deviceId;
      (sess as any).opSeq = seq;

      const operationId = generateOperationId("create", "session", sess);
      addOptimisticUpdate("create", "session", sess, operationId);
      setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      return { ...s, daySessions: [...s.daySessions, sess] };
    });
  }, [deviceId, nextOpSeqSync, addOptimisticUpdate, confirmOptimisticUpdate]);

  const endDay = React.useCallback(() => {
    const now = new Date();
    const seq = nextOpSeqSync();

    setBaseState((s) => {
      const i = s.daySessions.findIndex((d) => !d.end);
      if (i === -1) return s;

      const arr = s.daySessions.slice();
      const act = { ...arr[i] };
      act.end = now.toISOString();

      try {
        const start = new Date(act.start).getTime();
        const end = now.getTime();
        if (end > start) (act as any).durationSeconds = Math.floor((end - start) / 1000);
      } catch {}

      // Stamp sync meta
      (act as any).updatedAt = now.toISOString();
      (act as any).updatedBy = deviceId;
      (act as any).opSeq = seq;

      const operationId = generateOperationId("update", "session", act);
      addOptimisticUpdate("update", "session", act, operationId);
      setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      arr[i] = act;
      return { ...s, daySessions: arr };
    });
  }, [deviceId, nextOpSeqSync, addOptimisticUpdate, confirmOptimisticUpdate]);

  /** ================================
   *  Arrangements (stamp sync meta)
   *  ================================ */
  const addArrangement = React.useCallback(
    (
      arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">
    ): Promise<string> => {
      return new Promise((resolve) => {
        const now = new Date().toISOString();
        const seq = nextOpSeqSync();
        const id = `arr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        // Create as Arrangement, then attach sync meta (to avoid extra-prop checks)
        const newArrangement: Arrangement = {
          ...arrangementData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        (newArrangement as any).updatedBy = deviceId;
        (newArrangement as any).opSeq = seq;

        const operationId = generateOperationId("create", "arrangement", newArrangement);
        addOptimisticUpdate("create", "arrangement", newArrangement, operationId);

        setBaseState((s) => {
          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve(id);
          }, 0);

          // Dedup & sort
          const map = new Map<string, Arrangement>([
            ...s.arrangements.map<[string, Arrangement]>((a) => [a.id, a]),
            [newArrangement.id, newArrangement],
          ]);
          return {
            ...s,
            arrangements: Array.from(map.values()).sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            ),
          };
        });
      });
    },
    [deviceId, nextOpSeqSync, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const updateArrangement = React.useCallback(
    (id: string, updates: Partial<Arrangement>): Promise<void> => {
      return new Promise((resolve) => {
        const now = new Date().toISOString();
        const seq = nextOpSeqSync();

        // Payload we will broadcast/optimistically apply
        const stamped = { ...updates, id, updatedAt: now } as Partial<Arrangement> & {
          id: string;
          updatedAt: string;
        };
        (stamped as any).updatedBy = deviceId;
        (stamped as any).opSeq = seq;

        const operationId = generateOperationId("update", "arrangement", stamped);
        addOptimisticUpdate("update", "arrangement", stamped, operationId);

        setBaseState((s) => {
          const arrangements = s.arrangements
            .map((arr) =>
              arr.id === id ? { ...arr, ...updates, updatedAt: now } : arr
            )
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );

          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve();
          }, 0);

          return { ...s, arrangements };
        });
      });
    },
    [deviceId, nextOpSeqSync, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const deleteArrangement = React.useCallback(
    (id: string): Promise<void> => {
      return new Promise((resolve) => {
        setBaseState((s) => {
          const arrangement = s.arrangements.find((arr) => arr.id === id);
          if (!arrangement) {
            resolve();
            return s;
          }

          // Note: We hard-delete for now; tombstones will arrive in a later step.
          const operationId = generateOperationId("delete", "arrangement", { id });
          addOptimisticUpdate("delete", "arrangement", { id }, operationId);

          const arrangements = s.arrangements.filter((arr) => arr.id !== id);

          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve();
          }, 0);

          return { ...s, arrangements };
        });
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /** ================================
   *  Backup / restore
   *  ================================ */
  function isValidState(obj: unknown): obj is AppState {
    if (!obj || typeof obj !== "object") return false;
    const o = obj as any;
    return (
      Array.isArray(o.addresses) &&
      Array.isArray(o.completions) &&
      "activeIndex" in o &&
      Array.isArray(o.daySessions) &&
      Array.isArray(o.arrangements) &&
      typeof o.currentListVersion === "number"
    );
  }

  const backupState = React.useCallback(() => {
    // Use base state for backups (no optimistic updates)
    const snap: AppState = {
      addresses: baseState.addresses,
      completions: baseState.completions,
      activeIndex: baseState.activeIndex,
      daySessions: baseState.daySessions,
      arrangements: baseState.arrangements,
      currentListVersion: baseState.currentListVersion,
    };
    return snap;
  }, [baseState]);

  const restoreState = React.useCallback(
    (obj: unknown, mergeStrategy: "replace" | "merge" = "replace") => {
      if (!isValidState(obj)) throw new Error("Invalid backup file format");

      const version =
        typeof (obj as any).currentListVersion === "number"
          ? (obj as any).currentListVersion
          : 1;

      const restoredState: AppState = {
        addresses: (obj as AppState).addresses,
        completions: stampCompletionsWithVersion(
          (obj as AppState).completions,
          version
        ),
        activeIndex: (obj as AppState).activeIndex ?? null,
        daySessions: (obj as AppState).daySessions ?? [],
        arrangements: (obj as AppState).arrangements ?? [],
        currentListVersion: version,
      };

      if (mergeStrategy === "merge") {
        setBaseState((currentState) => {
          const merged: AppState = {
            // Prefer restored addresses if more recent list version
            addresses:
              restoredState.currentListVersion >= currentState.currentListVersion
                ? restoredState.addresses
                : currentState.addresses,
            currentListVersion: Math.max(
              restoredState.currentListVersion,
              currentState.currentListVersion
            ),

            // Merge completions (avoid duplicates)
            completions: [
              ...currentState.completions,
              ...restoredState.completions.filter(
                (restored) =>
                  !currentState.completions.some(
                    (existing) =>
                      existing.timestamp === restored.timestamp &&
                      existing.index === restored.index &&
                      existing.outcome === restored.outcome
                  )
              ),
            ].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            ),

            // Merge arrangements, prefer most recent updatedAt
            arrangements: Array.from(
              new Map<string, Arrangement>(
                [
                  ...currentState.arrangements.map<[string, Arrangement]>(
                    (arr) => [arr.id, arr]
                  ),
                  ...restoredState.arrangements.map<[string, Arrangement]>(
                    (arr) => [arr.id, arr]
                  ),
                ].sort(
                  ([, a], [, b]) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                )
              ).values()
            ),

            // Merge day sessions by date key
            daySessions: Array.from(
              new Map<string, DaySession>([
                ...currentState.daySessions.map<[string, DaySession]>(
                  (session) => [session.date, session]
                ),
                ...restoredState.daySessions.map<[string, DaySession]>(
                  (session) => [session.date, session]
                ),
              ]).values()
            ),

            activeIndex: restoredState.activeIndex ?? currentState.activeIndex,
          };

          return merged;
        });
      } else {
        // replace
        setBaseState(restoredState);
      }

      clearOptimisticUpdates();
      set(STORAGE_KEY, restoredState).catch(() => {});
    },
    [clearOptimisticUpdates]
  );

  /** ================================
   *  External setState (with basic conflict scan)
   *  ================================ */
  const setState = React.useCallback(
    (newState: AppState | ((prev: AppState) => AppState)) => {
      setBaseState((currentState) => {
        const nextState =
          typeof newState === "function" ? (newState as any)(currentState) : newState;

        const localConflicts = new Map<string, Conflict>();

        // Completions: simple “same index + outcome within 5s” heuristic
        nextState.completions.forEach((incoming) => {
          const existing = currentState.completions.find(
            (c) =>
              c.index === incoming.index &&
              c.outcome === incoming.outcome &&
              Math.abs(
                new Date(c.timestamp).getTime() -
                  new Date(incoming.timestamp).getTime()
              ) < 5000
          );
          if (existing && existing.timestamp !== incoming.timestamp) {
            localConflicts.set(`completion_${incoming.timestamp}`, {
              type: "completion",
              incoming,
              existing,
              resolution: "prefer_incoming",
            });
          }
        });

        // Arrangements: prefer newer updatedAt
        nextState.arrangements.forEach((incoming) => {
          const existing = currentState.arrangements.find((a) => a.id === incoming.id);
          if (existing && existing.updatedAt !== incoming.updatedAt) {
            const incomingTime = new Date(incoming.updatedAt).getTime();
            const existingTime = new Date(existing.updatedAt).getTime();
            localConflicts.set(`arrangement_${incoming.id}`, {
              type: "arrangement",
              incoming,
              existing,
              resolution:
                incomingTime > existingTime ? "prefer_incoming" : "prefer_existing",
            });
          }
        });

        if (localConflicts.size > 0) setConflicts(localConflicts);
        return nextState;
      });

      // If an external state is applied, clear optimistic noise
      clearOptimisticUpdates();
    },
    [clearOptimisticUpdates]
  );

  /** ================================
   *  Return API
   *  ================================ */
  return {
    // State
    state, // computed (base + optimistic)
    baseState, // raw base
    loading,

    // Device + opSeq (read-only for now; used internally)
    deviceId,
    opSeq,

    // Public setters
    setState,

    // Optimistic update management
    optimisticUpdates: optimisticState.updates,
    pendingOperations: optimisticState.pendingOperations,
    confirmOptimisticUpdate,
    revertOptimisticUpdate,
    clearOptimisticUpdates,

    // Conflicts
    conflicts,
    resolveConflict: (conflictId: string, _resolution: "prefer_incoming" | "prefer_existing") => {
      setConflicts((prev) => {
        const updated = new Map(prev);
        updated.delete(conflictId);
        return updated;
      });
    },

    // Actions
    setAddresses,
    addAddress,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
    addArrangement,
    updateArrangement,
    deleteArrangement,
    backupState,
    restoreState,
  };
}
