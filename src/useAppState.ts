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

const STORAGE_KEY = "navigator_state_v4"; // Bumped version for new features

type StateUpdate = {
  id: string;
  timestamp: string;
  type: 'optimistic' | 'confirmed' | 'reverted';
  operation: 'create' | 'update' | 'delete';
  entity: 'completion' | 'arrangement' | 'address' | 'session';
  data: any;
};

type OptimisticState = {
  updates: Map<string, StateUpdate>;
  pendingOperations: Set<string>;
};

const initial: AppState = {
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1,
};

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

// Generate a deterministic ID for operations
function generateOperationId(type: string, entity: string, data: any): string {
  const key = `${type}_${entity}_${JSON.stringify(data).slice(0, 50)}_${Date.now()}`;
  return btoa(key).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

// Apply optimistic updates to state
function applyOptimisticUpdates(baseState: AppState, updates: Map<string, StateUpdate>): AppState {
  let result = { ...baseState };
  
  // Sort updates by timestamp to apply in order
  const sortedUpdates = Array.from(updates.values()).sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const update of sortedUpdates) {
    if (update.type === 'reverted') continue;
    
    switch (update.entity) {
      case 'completion':
        if (update.operation === 'create') {
          result.completions = [update.data, ...result.completions];
        } else if (update.operation === 'update') {
          result.completions = result.completions.map(c => 
            c.timestamp === update.data.originalTimestamp ? { ...c, ...update.data } : c
          );
        } else if (update.operation === 'delete') {
          result.completions = result.completions.filter(c => c.timestamp !== update.data.timestamp);
        }
        break;
        
      case 'arrangement':
        if (update.operation === 'create') {
          result.arrangements = [...result.arrangements, update.data];
        } else if (update.operation === 'update') {
          result.arrangements = result.arrangements.map(arr => 
            arr.id === update.data.id ? { ...arr, ...update.data, updatedAt: update.timestamp } : arr
          );
        } else if (update.operation === 'delete') {
          result.arrangements = result.arrangements.filter(arr => arr.id !== update.data.id);
        }
        break;
        
      case 'address':
        if (update.operation === 'create') {
          result.addresses = [...result.addresses, update.data];
        }
        break;
        
      case 'session':
        if (update.operation === 'create') {
          result.daySessions = [...result.daySessions, update.data];
        } else if (update.operation === 'update') {
          result.daySessions = result.daySessions.map(session => 
            session.date === update.data.date ? { ...session, ...update.data } : session
          );
        }
        break;
    }
  }
  
  return result;
}

export function useAppState() {
  const [baseState, setBaseState] = React.useState<AppState>(initial);
  const [optimisticState, setOptimisticState] = React.useState<OptimisticState>({
    updates: new Map(),
    pendingOperations: new Set()
  });
  const [loading, setLoading] = React.useState(true);

  // Computed state with optimistic updates applied
  const state = React.useMemo(() => {
    return applyOptimisticUpdates(baseState, optimisticState.updates);
  }, [baseState, optimisticState.updates]);

  // Track conflicts and resolve them
  const [conflicts, setConflicts] = React.useState<Map<string, any>>(new Map());

  // ---- load from IndexedDB (with migration) ----
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
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
        console.warn('Failed to load state from IndexedDB:', error);
        // Continue with initial state
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
    const t = setTimeout(() => set(STORAGE_KEY, baseState).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [baseState, loading]);

  // ---- optimistic update helpers ----

  const addOptimisticUpdate = React.useCallback((
    operation: 'create' | 'update' | 'delete',
    entity: 'completion' | 'arrangement' | 'address' | 'session',
    data: any,
    operationId?: string
  ): string => {
    const id = operationId || generateOperationId(operation, entity, data);
    const timestamp = new Date().toISOString();
    
    const update: StateUpdate = {
      id,
      timestamp,
      type: 'optimistic',
      operation,
      entity,
      data
    };

    setOptimisticState(prev => {
      const updates = new Map(prev.updates);
      updates.set(id, update);
      return {
        updates,
        pendingOperations: new Set([...prev.pendingOperations, id])
      };
    });

    return id;
  }, []);

  const confirmOptimisticUpdate = React.useCallback((operationId: string, confirmedData?: any) => {
    setOptimisticState(prev => {
      const updates = new Map(prev.updates);
      const pendingOperations = new Set(prev.pendingOperations);
      
      const existing = updates.get(operationId);
      if (existing) {
        updates.set(operationId, {
          ...existing,
          type: 'confirmed',
          data: confirmedData || existing.data
        });
      }
      
      pendingOperations.delete(operationId);
      
      return { updates, pendingOperations };
    });

    // Clean up confirmed updates after a delay
    setTimeout(() => {
      setOptimisticState(prev => {
        const updates = new Map(prev.updates);
        updates.delete(operationId);
        return { ...prev, updates };
      });
    }, 5000);
  }, []);

  const revertOptimisticUpdate = React.useCallback((operationId: string, reason?: string) => {
    console.warn(`Reverting optimistic update ${operationId}:`, reason);
    
    setOptimisticState(prev => {
      const updates = new Map(prev.updates);
      const pendingOperations = new Set(prev.pendingOperations);
      
      const existing = updates.get(operationId);
      if (existing) {
        updates.set(operationId, {
          ...existing,
          type: 'reverted'
        });
      }
      
      pendingOperations.delete(operationId);
      
      return { updates, pendingOperations };
    });

    // Clean up reverted updates after a short delay
    setTimeout(() => {
      setOptimisticState(prev => {
        const updates = new Map(prev.updates);
        updates.delete(operationId);
        return { ...prev, updates };
      });
    }, 1000);
  }, []);

  const clearOptimisticUpdates = React.useCallback(() => {
    setOptimisticState({
      updates: new Map(),
      pendingOperations: new Set()
    });
  }, []);

  // ---------------- enhanced actions ----------------

  /** Import a new Excel list: bump list version so previous completions don't hide new list items. */
  const setAddresses = React.useCallback((rows: AddressRow[]) => {
    const operationId = generateOperationId('update', 'address', { type: 'bulk_import', count: rows.length });
    
    // Apply optimistically
    addOptimisticUpdate('update', 'address', { addresses: rows, bumpVersion: true }, operationId);
    
    // Apply to base state
    setBaseState((s) => ({
      ...s,
      addresses: Array.isArray(rows) ? rows : [],
      activeIndex: null,
      currentListVersion: (s.currentListVersion || 1) + 1,
    }));

    // Confirm immediately for local operations
    confirmOptimisticUpdate(operationId);
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  /** Add a single address (used by Arrangements "manual address"). Returns new index. */
  const addAddress = React.useCallback((addressRow: AddressRow): Promise<number> => {
    return new Promise<number>((resolve) => {
      const operationId = generateOperationId('create', 'address', addressRow);
      
      // Apply optimistically
      addOptimisticUpdate('create', 'address', addressRow, operationId);
      
      // Apply to base state
      setBaseState(s => {
        const newAddresses = [...s.addresses, addressRow];
        const newIndex = newAddresses.length - 1;
        
        setTimeout(() => {
          confirmOptimisticUpdate(operationId);
          resolve(newIndex);
        }, 0);
        
        return { ...s, addresses: newAddresses };
      });
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  const setActive = React.useCallback((idx: number) => {
    setBaseState((s) => ({ ...s, activeIndex: idx }));
  }, []);

  const cancelActive = React.useCallback(() => {
    setBaseState((s) => ({ ...s, activeIndex: null }));
  }, []);

  /**
   * Enhanced completion with optimistic updates and conflict detection
   */
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

          const operationId = generateOperationId('create', 'completion', completion);
          
          // Add optimistic update
          addOptimisticUpdate('create', 'completion', completion, operationId);

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

  /** Enhanced undo with optimistic updates */
  const undo = React.useCallback((index: number) => {
    setBaseState((s) => {
      const arr = s.completions.slice();
      const pos = arr.findIndex(
        (c) => Number(c.index) === Number(index) && c.listVersion === s.currentListVersion
      );
      
      if (pos >= 0) {
        const completion = arr[pos];
        const operationId = generateOperationId('delete', 'completion', completion);
        
        // Add optimistic update for deletion
        addOptimisticUpdate('delete', 'completion', completion, operationId);
        
        arr.splice(pos, 1);
        
        // Confirm immediately for local operations
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);
      }
      
      return { ...s, completions: arr };
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  // ---- enhanced day tracking ----

  const startDay = React.useCallback(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    
    setBaseState((s) => {
      if (s.daySessions.some((d) => !d.end)) return s; // already active
      
      const sess: DaySession = {
        date: today,
        start: now.toISOString(),
      };
      
      const operationId = generateOperationId('create', 'session', sess);
      addOptimisticUpdate('create', 'session', sess, operationId);
      
      setTimeout(() => confirmOptimisticUpdate(operationId), 0);
      
      return { ...s, daySessions: [...s.daySessions, sess] };
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  const endDay = React.useCallback(() => {
    const now = new Date();
    
    setBaseState((s) => {
      const i = s.daySessions.findIndex((d) => !d.end);
      if (i === -1) return s;
      
      const arr = s.daySessions.slice();
      const act = { ...arr[i] };
      act.end = now.toISOString();
      
      try {
        const start = new Date(act.start).getTime();
        const end = now.getTime();
        if (end > start) act.durationSeconds = Math.floor((end - start) / 1000);
      } catch {}
      
      const operationId = generateOperationId('update', 'session', act);
      addOptimisticUpdate('update', 'session', act, operationId);
      
      arr[i] = act;
      
      setTimeout(() => confirmOptimisticUpdate(operationId), 0);
      
      return { ...s, daySessions: arr };
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  // ---- enhanced arrangements ----

  const addArrangement = React.useCallback(
    (arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">): Promise<string> => {
      return new Promise((resolve) => {
        const now = new Date().toISOString();
        const id = `arr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const newArrangement: Arrangement = {
          ...arrangementData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        
        const operationId = generateOperationId('create', 'arrangement', newArrangement);
        addOptimisticUpdate('create', 'arrangement', newArrangement, operationId);
        
        setBaseState(s => {
          setTimeout(() => {
            confirmOptimisticUpdate(operationId);
            resolve(id);
          }, 0);
          return { ...s, arrangements: [...s.arrangements, newArrangement] };
        });
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const updateArrangement = React.useCallback((id: string, updates: Partial<Arrangement>): Promise<void> => {
    return new Promise((resolve) => {
      const operationId = generateOperationId('update', 'arrangement', { id, ...updates });
      
      setBaseState(s => {
        const updatedArrangement = { ...updates, id, updatedAt: new Date().toISOString() };
        addOptimisticUpdate('update', 'arrangement', updatedArrangement, operationId);
        
        const arrangements = s.arrangements.map((arr) =>
          arr.id === id ? { ...arr, ...updates, updatedAt: new Date().toISOString() } : arr
        );
        
        setTimeout(() => {
          confirmOptimisticUpdate(operationId);
          resolve();
        }, 0);
        
        return { ...s, arrangements };
      });
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  const deleteArrangement = React.useCallback((id: string): Promise<void> => {
    return new Promise((resolve) => {
      setBaseState(s => {
        const arrangement = s.arrangements.find(arr => arr.id === id);
        if (!arrangement) {
          resolve();
          return s;
        }
        
        const operationId = generateOperationId('delete', 'arrangement', arrangement);
        addOptimisticUpdate('delete', 'arrangement', { id }, operationId);
        
        const arrangements = s.arrangements.filter((arr) => arr.id !== id);
        
        setTimeout(() => {
          confirmOptimisticUpdate(operationId);
          resolve();
        }, 0);
        
        return { ...s, arrangements };
      });
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  // ---- enhanced backup / restore with conflict detection ----

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

  const restoreState = React.useCallback((obj: unknown, mergeStrategy: 'replace' | 'merge' = 'replace') => {
    if (!isValidState(obj)) throw new Error("Invalid backup file format");
    
    const version =
      typeof (obj as any).currentListVersion === "number" ? (obj as any).currentListVersion : 1;

    const restoredState: AppState = {
      addresses: obj.addresses,
      completions: stampCompletionsWithVersion(obj.completions, version),
      activeIndex: obj.activeIndex ?? null,
      daySessions: obj.daySessions ?? [],
      arrangements: obj.arrangements ?? [],
      currentListVersion: version,
    };

    if (mergeStrategy === 'merge') {
      // Merge with existing state
      setBaseState(currentState => {
        const merged: AppState = {
          // Prefer restored addresses if more recent list version
          addresses: restoredState.currentListVersion >= currentState.currentListVersion 
            ? restoredState.addresses 
            : currentState.addresses,
          currentListVersion: Math.max(restoredState.currentListVersion, currentState.currentListVersion),
          
          // Merge completions, avoiding duplicates
          completions: [
            ...currentState.completions,
            ...restoredState.completions.filter(restored => 
              !currentState.completions.some(existing => 
                existing.timestamp === restored.timestamp && 
                existing.index === restored.index &&
                existing.outcome === restored.outcome
              )
            )
          ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          
          // Merge arrangements, preferring newer versions
          arrangements: Array.from(
            new Map([
              ...currentState.arrangements.map(arr => [arr.id, arr] as [string, Arrangement]),
              ...restoredState.arrangements.map(arr => [arr.id, arr] as [string, Arrangement])
            ].sort(([,a], [,b]) => 
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )).values()
          ),
          
          // Merge day sessions, keeping unique dates
          daySessions: Array.from(
            new Map([
              ...currentState.daySessions.map(session => [session.date, session] as [string, DaySession]),
              ...restoredState.daySessions.map(session => [session.date, session] as [string, DaySession])
            ]).values()
          ),
          
          activeIndex: restoredState.activeIndex ?? currentState.activeIndex,
        };
        
        return merged;
      });
    } else {
      // Complete replacement
      setBaseState(restoredState);
    }

    // Clear optimistic updates after restore
    clearOptimisticUpdates();
    
    // Persist immediately
    set(STORAGE_KEY, restoredState).catch(() => {});
  }, [clearOptimisticUpdates]);

  // Enhanced setState for cloud sync with conflict detection
  const setState = React.useCallback((newState: AppState | ((prev: AppState) => AppState)) => {
    setBaseState(currentState => {
      const nextState = typeof newState === 'function' ? newState(currentState) : newState;
      
      // Detect potential conflicts by checking timestamps
      const conflicts = new Map();
      
      // Check for completion conflicts
      nextState.completions.forEach(incoming => {
        const existing = currentState.completions.find(c => 
          c.index === incoming.index && 
          c.outcome === incoming.outcome &&
          Math.abs(new Date(c.timestamp).getTime() - new Date(incoming.timestamp).getTime()) < 5000
        );
        
        if (existing && existing.timestamp !== incoming.timestamp) {
          conflicts.set(`completion_${incoming.timestamp}`, {
            type: 'completion',
            incoming,
            existing,
            resolution: 'prefer_incoming' // Default strategy
          });
        }
      });
      
      // Check for arrangement conflicts
      nextState.arrangements.forEach(incoming => {
        const existing = currentState.arrangements.find(a => a.id === incoming.id);
        if (existing && existing.updatedAt !== incoming.updatedAt) {
          const incomingTime = new Date(incoming.updatedAt).getTime();
          const existingTime = new Date(existing.updatedAt).getTime();
          
          conflicts.set(`arrangement_${incoming.id}`, {
            type: 'arrangement',
            incoming,
            existing,
            resolution: incomingTime > existingTime ? 'prefer_incoming' : 'prefer_existing'
          });
        }
      });
      
      if (conflicts.size > 0) {
        console.log('Detected state conflicts:', conflicts.size);
        setConflicts(conflicts);
      }
      
      return nextState;
    });
    
    // Clear optimistic updates when state is set from external source
    clearOptimisticUpdates();
  }, [clearOptimisticUpdates]);

  return {
    state, // computed state with optimistic updates
    baseState, // raw state without optimistic updates
    loading,
    setState,
    
    // Optimistic update management
    optimisticUpdates: optimisticState.updates,
    pendingOperations: optimisticState.pendingOperations,
    confirmOptimisticUpdate,
    revertOptimisticUpdate,
    clearOptimisticUpdates,
    
    // Conflicts
    conflicts,
    resolveConflict: (conflictId: string, _resolution: 'prefer_incoming' | 'prefer_existing') => {
      setConflicts(prev => {
        const updated = new Map(prev);
        updated.delete(conflictId);
        return updated;
      });
    },
    
    // Enhanced actions that return promises for better async handling
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
