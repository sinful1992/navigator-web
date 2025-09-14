// src/useAppState.ts - FIXED VERSION
import * as React from "react";
import { get, set } from "idb-keyval";
import { logger } from "./utils/logger";
import type {
  AddressRow,
  AppState,
  Completion,
  Outcome,
  DaySession,
  Arrangement,
  UserSubscription,
  ReminderSettings,
  ReminderNotification,
} from "./types";
import {
  processArrangementReminders,
  updateReminderStatus,
  cleanupOldNotifications,
  DEFAULT_REMINDER_SETTINGS,
} from "./services/reminderScheduler";

const STORAGE_KEY = "navigator_state_v5"; // Bumped for data integrity improvements
const CURRENT_SCHEMA_VERSION = 5;

type StateUpdate = {
  id: string;
  timestamp: string;
  type: "optimistic" | "confirmed" | "reverted";
  operation: "create" | "update" | "delete";
  entity: "completion" | "arrangement" | "address" | "session";
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
  subscription: null,
  reminderSettings: DEFAULT_REMINDER_SETTINGS,
  reminderNotifications: [],
  lastReminderProcessed: undefined,
};

// Data validation functions
function validateCompletion(c: any): c is Completion {
  return c &&
    typeof c.index === 'number' &&
    typeof c.address === 'string' &&
    typeof c.outcome === 'string' &&
    ['PIF', 'DA', 'Done', 'ARR'].includes(c.outcome) &&
    typeof c.timestamp === 'string' &&
    !isNaN(new Date(c.timestamp).getTime());
}

function validateAddressRow(a: any): a is AddressRow {
  return a &&
    typeof a.address === 'string' &&
    a.address.trim().length > 0;
}

function validateAppState(state: any): state is AppState {
  return state &&
    Array.isArray(state.addresses) &&
    Array.isArray(state.completions) &&
    Array.isArray(state.daySessions) &&
    Array.isArray(state.arrangements) &&
    (state.activeIndex === null || typeof state.activeIndex === 'number') &&
    typeof state.currentListVersion === 'number' &&
    (state.subscription === null || state.subscription === undefined || typeof state.subscription === 'object');
}

function stampCompletionsWithVersion(
  completions: any[] | undefined,
  version: number
): Completion[] {
  const src = Array.isArray(completions) ? completions : [];
  return src
    .filter(validateCompletion)
    .map((c: any) => ({
      ...c,
      listVersion: typeof c?.listVersion === "number" ? c.listVersion : version,
    }));
}

// Schema migration function
function migrateSchema(data: any, fromVersion: number): AppState {
  let migrated = { ...data };
  
  // Migrate from v4 to v5 (add data validation)
  if (fromVersion < 5) {
    console.log('Migrating schema from version', fromVersion, 'to 5');
    
    // Clean up invalid addresses
    if (Array.isArray(migrated.addresses)) {
      migrated.addresses = migrated.addresses.filter(validateAddressRow);
    } else {
      migrated.addresses = [];
    }
    
    // Clean up invalid completions
    if (Array.isArray(migrated.completions)) {
      migrated.completions = migrated.completions.filter(validateCompletion);
    } else {
      migrated.completions = [];
    }
    
    // Ensure required fields exist
    migrated.currentListVersion = migrated.currentListVersion || 1;
    migrated.daySessions = Array.isArray(migrated.daySessions) ? migrated.daySessions : [];
    migrated.arrangements = Array.isArray(migrated.arrangements) ? migrated.arrangements : [];
    migrated.activeIndex = (typeof migrated.activeIndex === 'number') ? migrated.activeIndex : null;
    migrated.subscription = migrated.subscription || null;
  }
  
  // Add schema version
  migrated._schemaVersion = CURRENT_SCHEMA_VERSION;
  
  return migrated;
}

// Generate a deterministic ID for operations
function generateOperationId(type: string, entity: string, data: any): string {
  const key = `${type}_${entity}_${JSON.stringify(data).slice(0, 50)}_${Date.now()}`;
  return btoa(key).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

// ---- device id helper ----
const DEVICE_ID_KEY = "navigator_device_id";
function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : "dev_" + Math.random().toString(36).slice(2);
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return "dev_" + Math.random().toString(36).slice(2);
  }
}

// Apply optimistic updates to state with atomic transaction handling
function applyOptimisticUpdates(
  baseState: AppState,
  updates: Map<string, StateUpdate>
): AppState {
  // Start with a deep copy to ensure immutability
  let result: AppState = JSON.parse(JSON.stringify(baseState));
  
  // Track which entities are being modified to detect conflicts
  const entityLocks = new Set<string>();

  // Sort updates by timestamp to apply in order
  const sortedUpdates = Array.from(updates.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  try {
    for (const update of sortedUpdates) {
      if (update.type === "reverted") continue;

      // Create entity lock key for conflict detection
      const lockKey = `${update.entity}_${update.operation}`;
      if (entityLocks.has(lockKey)) {
        console.warn(`Concurrent ${update.operation} operation detected on ${update.entity}`, update);
      }
      entityLocks.add(lockKey);

      switch (update.entity) {
        case "completion":
          if (update.operation === "create") {
            // Validate completion data
            if (!update.data || typeof update.data.index !== 'number' || !update.data.outcome) {
              console.error('Invalid completion data:', update.data);
              continue;
            }
            
            // Check for duplicates before adding
            const isDuplicate = result.completions.some(c => 
              c.index === update.data.index && 
              c.outcome === update.data.outcome &&
              Math.abs(new Date(c.timestamp).getTime() - new Date(update.data.timestamp).getTime()) < 1000
            );
            
            if (!isDuplicate) {
              result.completions = [update.data, ...result.completions];
            }
          } else if (update.operation === "update") {
            result.completions = result.completions.map((c) =>
              c.timestamp === update.data.originalTimestamp
                ? { ...c, ...update.data }
                : c
            );
          } else if (update.operation === "delete") {
            result.completions = result.completions.filter(
              (c) => c.timestamp !== update.data.timestamp
            );
          }
          break;

      case "arrangement":
        if (update.operation === "create") {
          result.arrangements = [...result.arrangements, update.data];
        } else if (update.operation === "update") {
          result.arrangements = result.arrangements.map((arr) =>
            arr.id === update.data.id
              ? { ...arr, ...update.data, updatedAt: update.timestamp }
              : arr
          );
        } else if (update.operation === "delete") {
          result.arrangements = result.arrangements.filter(
            (arr) => arr.id !== update.data.id
          );
        }
        break;

      case "address":
        if (update.operation === "create") {
          result.addresses = [...result.addresses, update.data];
        } else if (update.operation === "update") {
          // bulk import path: update carries { addresses, bumpVersion, preserveCompletions }
          if (update.data?.addresses) {
            result.addresses = Array.isArray(update.data.addresses)
              ? update.data.addresses
              : [];
            if (update.data.bumpVersion) {
              result.currentListVersion =
                (result.currentListVersion || 1) + 1;
              // Only reset completions if not preserving them
              if (!update.data.preserveCompletions) {
                result.completions = [];
              }
              result.activeIndex = null;
            }
          }
        }
        break;

      case "session":
        if (update.operation === "create") {
          result.daySessions = [...result.daySessions, update.data];
        } else if (update.operation === "update") {
          result.daySessions = result.daySessions.map((session) =>
            session.date === update.data.date
              ? { ...session, ...update.data }
              : session
          );
        }
        break;
        
      default:
        console.warn(`Unknown entity type in optimistic update: ${update.entity}`, update);
        break;
    }
    }
  } catch (error) {
    console.error('Failed to apply optimistic updates, returning base state:', error);
    return baseState; // Return base state if optimistic updates fail
  }

  return result;
}

export function useAppState() {
  const [baseState, setBaseState] = React.useState<AppState>(initial);
  const [optimisticState, setOptimisticState] =
    React.useState<OptimisticState>({
      updates: new Map(),
      pendingOperations: new Set(),
    });
  const [loading, setLoading] = React.useState(true);

  // stable device id
  const deviceId = React.useMemo(() => getOrCreateDeviceId(), []);

  // Computed state with optimistic updates applied
  const state = React.useMemo(() => {
    return applyOptimisticUpdates(baseState, optimisticState.updates);
  }, [baseState, optimisticState.updates]);

  // Track conflicts
  const [conflicts, setConflicts] = React.useState<Map<string, any>>(
    new Map()
  );

  // ---- load from IndexedDB (with validation and migration) ----
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await get(STORAGE_KEY)) as any;
        if (!alive) return;

        if (saved) {
          // Detect schema version
          const savedSchemaVersion = saved._schemaVersion || 4;
          
          // Migrate if necessary
          let migrated = saved;
          if (savedSchemaVersion < CURRENT_SCHEMA_VERSION) {
            try {
              migrated = migrateSchema(saved, savedSchemaVersion);
              console.log('Schema migration successful');
            } catch (migrationError) {
              logger.error('Schema migration failed:', migrationError);
              // Fall back to minimal safe state
              migrated = { 
                ...initial, 
                _schemaVersion: CURRENT_SCHEMA_VERSION 
              };
            }
          }
          
          // Validate migrated data
          if (!validateAppState(migrated)) {
            logger.warn('Loaded data failed validation, using initial state');
            setBaseState({ ...initial, _schemaVersion: CURRENT_SCHEMA_VERSION });
            return;
          }

          const version = migrated.currentListVersion || 1;
          const next: AppState = {
            addresses: migrated.addresses.filter(validateAddressRow),
            activeIndex: (typeof migrated.activeIndex === "number") ? migrated.activeIndex : null,
            completions: stampCompletionsWithVersion(migrated.completions, version),
            daySessions: Array.isArray(migrated.daySessions) ? migrated.daySessions : [],
            arrangements: Array.isArray(migrated.arrangements) ? migrated.arrangements : [],
            currentListVersion: version,
            subscription: migrated.subscription || null,
            _schemaVersion: CURRENT_SCHEMA_VERSION,
          };

          setBaseState(next);
          
          // Save migrated data back if migration occurred
          if (savedSchemaVersion < CURRENT_SCHEMA_VERSION) {
            try {
              await set(STORAGE_KEY, next);
              console.log('Migrated data saved successfully');
            } catch (saveError) {
              logger.warn('Failed to save migrated data:', saveError);
            }
          }
        } else {
          // No saved data, use initial state with current schema version
          setBaseState({ ...initial, _schemaVersion: CURRENT_SCHEMA_VERSION });
        }
      } catch (error) {
        logger.error("Failed to load state from IndexedDB:", error);
        // Use safe fallback
        setBaseState({ ...initial, _schemaVersion: CURRENT_SCHEMA_VERSION });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Error notification state
  const [persistError, setPersistError] = React.useState<string | null>(null);
  
  // ---- persist to IndexedDB (debounced with error handling) ----
  React.useEffect(() => {
    if (loading) return;
    
    const t = setTimeout(async () => {
      try {
        // Add schema version before saving
        const stateToSave = { ...baseState, _schemaVersion: CURRENT_SCHEMA_VERSION };
        await set(STORAGE_KEY, stateToSave);
        
        // Clear any previous persist errors
        if (persistError) {
          setPersistError(null);
        }
        
      } catch (error: any) {
        const errorMsg = error?.message || 'Unknown storage error';
        logger.error('Failed to persist state to IndexedDB:', error);
        setPersistError(errorMsg);
        
        // Try to clear corrupted storage and retry once
        if (errorMsg.includes('quota') || errorMsg.includes('storage')) {
          try {
            console.warn('Storage quota exceeded, attempting cleanup');
            // Could implement storage cleanup here if needed
            // For now, just notify the user
          } catch (cleanupError) {
            logger.error('Storage cleanup failed:', cleanupError);
          }
        }
      }
    }, 150);
    
    return () => clearTimeout(t);
  }, [baseState, loading, persistError]);

  // ---- optimistic update helpers ----
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
      logger.debug(`Reverting optimistic update ${operationId}:`, reason);

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

      // Clean up reverted updates after a short delay
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

  // ---------------- enhanced actions ----------------

  /** Import a new Excel list: bump list version with option to preserve completions. */
  const setAddresses = React.useCallback(
    (rows: AddressRow[], preserveCompletions = true) => {
      const operationId = generateOperationId("update", "address", {
        type: "bulk_import",
        count: rows.length,
        preserve: preserveCompletions,
      });

      // Apply optimistically
      addOptimisticUpdate(
        "update",
        "address",
        { addresses: rows, bumpVersion: true, preserveCompletions },
        operationId
      );

      // Apply to base state
      setBaseState((s) => ({
        ...s,
        addresses: Array.isArray(rows) ? rows : [],
        activeIndex: null,
        currentListVersion: (s.currentListVersion || 1) + 1,
        completions: preserveCompletions ? s.completions : [], // preserve or clear based on option
      }));

      // Confirm immediately for local operations
      confirmOptimisticUpdate(operationId);
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /** Add a single address (used by Arrangements "manual address"). Returns new index. */
  const addAddress = React.useCallback(
    (addressRow: AddressRow): Promise<number> => {
      return new Promise<number>((resolve) => {
        const operationId = generateOperationId("create", "address", addressRow);

        // Apply optimistically
        addOptimisticUpdate("create", "address", addressRow, operationId);

        // Apply to base state
        setBaseState((s) => {
          const newAddresses = [...s.addresses, addressRow];
          const newIndex = newAddresses.length - 1;

          // Resolve immediately with the new index - no race condition
          confirmOptimisticUpdate(operationId);
          resolve(newIndex);

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

  // Track pending completions to prevent double submissions
  const [, setPendingCompletions] = React.useState<Set<number>>(new Set());
  const pendingCompletionsRef = React.useRef<Set<number>>(new Set());
  
  /** ATOMIC: Enhanced completion with proper transaction handling */
  const complete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string): Promise<string> => {
      // Check if completion is already pending for this index
      if (pendingCompletionsRef.current.has(index)) {
        throw new Error(`Completion already pending for index ${index}`);
      }
      
      // Check if address exists
      const currentState = baseState;
      const address = currentState.addresses[index];
      if (!address) {
        throw new Error(`Address at index ${index} not found`);
      }
      
      // Check if already completed
      const existingCompletion = currentState.completions.find(
        (c) => c.index === index && c.listVersion === currentState.currentListVersion
      );
      if (existingCompletion) {
        throw new Error(`Address at index ${index} is already completed`);
      }
      
      const nowISO = new Date().toISOString();
      const completion: Completion = {
        index,
        address: address.address,
        lat: address.lat ?? null,
        lng: address.lng ?? null,
        outcome,
        amount,
        timestamp: nowISO,
        listVersion: currentState.currentListVersion,
        arrangementId,
      };
      
      const operationId = generateOperationId(
        "create",
        "completion",
        completion
      );
      
      try {
        // Mark as pending
        pendingCompletionsRef.current.add(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));
        
        // Apply optimistic update first
        addOptimisticUpdate("create", "completion", completion, operationId);
        
        // Then update base state atomically
        await new Promise<void>((resolve) => {
          setBaseState((s) => {
            const next: AppState = {
              ...s,
              completions: [completion, ...s.completions],
              activeIndex: s.activeIndex === index ? null : s.activeIndex,
            };
            resolve();
            return next;
          });
        });
        
        return operationId;
      } finally {
        // Always clear pending state
        pendingCompletionsRef.current.delete(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));
      }
    },
    [baseState, addOptimisticUpdate]
  );

  /** Enhanced undo with optimistic updates - finds the most recent completion for the given index */
  const undo = React.useCallback(
    (index: number) => {
      setBaseState((s) => {
        const arr = s.completions.slice();
        
        // Find the most recent completion for this index and list version
        let mostRecentPos = -1;
        let mostRecentTime = 0;
        
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (Number(c.index) === Number(index) && 
              c.listVersion === s.currentListVersion) {
            const completionTime = new Date(c.timestamp).getTime();
            if (completionTime > mostRecentTime) {
              mostRecentTime = completionTime;
              mostRecentPos = i;
            }
          }
        }

        if (mostRecentPos >= 0) {
          const completion = arr[mostRecentPos];
          const operationId = generateOperationId(
            "delete",
            "completion",
            completion
          );

          // Add optimistic update for deletion
          addOptimisticUpdate("delete", "completion", completion, operationId);

          arr.splice(mostRecentPos, 1);

          // Confirm immediately for local operations
          setTimeout(() => confirmOptimisticUpdate(operationId), 0);
        }

        return { ...s, completions: arr };
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

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

      const operationId = generateOperationId("create", "session", sess);
      addOptimisticUpdate("create", "session", sess, operationId);

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

      const operationId = generateOperationId("update", "session", act);
      addOptimisticUpdate("update", "session", act, operationId);

      arr[i] = act;

      setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      return { ...s, daySessions: arr };
    });
  }, [addOptimisticUpdate, confirmOptimisticUpdate]);

  // ---- enhanced arrangements ----

  const addArrangement = React.useCallback(
    (
      arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">
    ): Promise<string> => {
      return new Promise((resolve) => {
        const now = new Date().toISOString();
        const id = `arr_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`;
        const newArrangement: Arrangement = {
          ...arrangementData,
          id,
          createdAt: now,
          updatedAt: now,
        };

        const operationId = generateOperationId(
          "create",
          "arrangement",
          newArrangement
        );
        addOptimisticUpdate(
          "create",
          "arrangement",
          newArrangement,
          operationId
        );

        setBaseState((s) => {
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

  const updateArrangement = React.useCallback(
    (id: string, updates: Partial<Arrangement>): Promise<void> => {
      return new Promise((resolve) => {
        const operationId = generateOperationId("update", "arrangement", {
          id,
          ...updates,
        });

        setBaseState((s) => {
          const updatedArrangement = {
            ...updates,
            id,
            updatedAt: new Date().toISOString(),
          };
          addOptimisticUpdate(
            "update",
            "arrangement",
            updatedArrangement,
            operationId
          );

          const arrangements = s.arrangements.map((arr) =>
            arr.id === id
              ? { ...arr, ...updates, updatedAt: new Date().toISOString() }
              : arr
          );

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

  const deleteArrangement = React.useCallback(
    (id: string): Promise<void> => {
      return new Promise((resolve) => {
        setBaseState((s) => {
          const arrangement = s.arrangements.find((arr) => arr.id === id);
          if (!arrangement) {
            resolve();
            return s;
          }

          const operationId = generateOperationId(
            "delete",
            "arrangement",
            arrangement
          );
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

  // ---- subscription management ----

  const setSubscription = React.useCallback((subscription: UserSubscription | null) => {
    setBaseState((s) => ({ ...s, subscription }));
  }, []);

  // ---- reminder system management ----

  const updateReminderSettings = React.useCallback((settings: ReminderSettings) => {
    setBaseState((s) => ({ ...s, reminderSettings: settings }));
  }, []);

  const updateReminderNotification = React.useCallback(
    (notificationId: string, status: ReminderNotification['status'], message?: string) => {
      setBaseState((s) => ({
        ...s,
        reminderNotifications: updateReminderStatus(
          s.reminderNotifications || [],
          notificationId,
          status,
          message
        ),
      }));
    },
    []
  );

  const processReminders = React.useCallback(() => {
    setBaseState((s) => {
      const newNotifications = processArrangementReminders(s);
      const cleanedNotifications = cleanupOldNotifications(newNotifications, s.arrangements);
      
      return {
        ...s,
        reminderNotifications: cleanedNotifications,
        lastReminderProcessed: new Date().toISOString(),
      };
    });
  }, []);

  // Process reminders periodically
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (!loading) {
        processReminders();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [loading, processReminders]);

  // Process reminders when arrangements change
  React.useEffect(() => {
    if (!loading) {
      const timeoutId = setTimeout(() => {
        processReminders();
      }, 500); // Small delay to batch arrangement changes

      return () => clearTimeout(timeoutId);
    }
  }, [baseState.arrangements, loading, processReminders]);

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

  const backupState = React.useCallback((): AppState => {
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
    async (obj: unknown, mergeStrategy: "replace" | "merge" = "replace") => {
      if (!isValidState(obj)) throw new Error("Invalid backup file format");

      const version =
        typeof (obj as any).currentListVersion === "number"
          ? (obj as any).currentListVersion
          : 1;

      const restoredState: AppState = {
        addresses: obj.addresses,
        completions: stampCompletionsWithVersion(obj.completions, version),
        activeIndex: obj.activeIndex ?? null,
        daySessions: obj.daySessions ?? [],
        arrangements: obj.arrangements ?? [],
        currentListVersion: version,
      };

      if (mergeStrategy === "merge") {
        // Merge with existing state
        setBaseState((currentState) => {
          const merged: AppState = {
            addresses:
              restoredState.currentListVersion >=
              currentState.currentListVersion
                ? restoredState.addresses
                : currentState.addresses,
            currentListVersion: Math.max(
              restoredState.currentListVersion,
              currentState.currentListVersion
            ),

            // Merge completions, avoiding duplicates
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
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            ),

            // Merge arrangements, preferring newer versions
            arrangements: Array.from(
              new Map(
                [
                  ...currentState.arrangements.map(
                    (arr) => [arr.id, arr] as [string, Arrangement]
                  ),
                  ...restoredState.arrangements.map(
                    (arr) => [arr.id, arr] as [string, Arrangement]
                  ),
                ].sort(
                  ([, a], [, b]) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                )
              ).values()
            ),

            // Merge day sessions, keeping unique dates
            daySessions: Array.from(
              new Map(
                [
                  ...currentState.daySessions.map(
                    (session) => [session.date, session] as [string, DaySession]
                  ),
                  ...restoredState.daySessions.map(
                    (session) => [session.date, session] as [string, DaySession]
                  ),
                ]
              ).values()
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

      // Persist immediately with proper error handling
      try {
        const stateToSave = { ...restoredState, _schemaVersion: CURRENT_SCHEMA_VERSION };
        await set(STORAGE_KEY, stateToSave);
      } catch (persistError: any) {
        logger.error('Failed to persist restored state:', persistError);
        setPersistError('Failed to save restored data: ' + (persistError?.message || 'Unknown error'));
        throw new Error('Restore failed: Could not save data');
      }
    },
    [clearOptimisticUpdates, setPersistError]
  );

  // Enhanced setState for cloud sync with conflict detection
  const setState = React.useCallback(
    (newState: AppState | ((prev: AppState) => AppState)) => {
      setBaseState((currentState) => {
        const nextState =
          typeof newState === "function"
            ? (newState as (prev: AppState) => AppState)(currentState)
            : newState;

        const conflicts = new Map();

        // Check for completion conflicts
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
            conflicts.set(`completion_${incoming.timestamp}`, {
              type: "completion",
              incoming,
              existing,
              resolution: "prefer_incoming", // Default strategy
            });
          }
        });

        // Check for arrangement conflicts
        nextState.arrangements.forEach((incoming) => {
          const existing = currentState.arrangements.find(
            (a) => a.id === incoming.id
          );
          if (existing && existing.updatedAt !== incoming.updatedAt) {
            const incomingTime = new Date(incoming.updatedAt).getTime();
            const existingTime = new Date(existing.updatedAt).getTime();

            conflicts.set(`arrangement_${incoming.id}`, {
              type: "arrangement",
              incoming,
              existing,
              resolution:
                incomingTime > existingTime
                  ? "prefer_incoming"
                  : "prefer_existing",
            });
          }
        });

        if (conflicts.size > 0) {
          logger.debug("Detected state conflicts:", conflicts.size);
          setConflicts(conflicts);
        }

        return nextState;
      });

      // Clear optimistic updates when state is set from external source
      clearOptimisticUpdates();
    },
    [clearOptimisticUpdates]
  );

  // ---- enqueueOp wrapper (requested) ----
  const enqueueOp = React.useCallback(
    (
      entity: "completion" | "arrangement" | "address" | "session",
      operation: "create" | "update" | "delete",
      data: any,
      operationId?: string
    ): string => {
      const id = addOptimisticUpdate(operation, entity, data, operationId);
      return id;
    },
    [addOptimisticUpdate]
  );

  return {
    state, // computed state with optimistic updates
    baseState, // raw state without optimistic updates
    loading,
    setState,

    // expose base setter & helpers as requested
    setBaseState,
    deviceId,
    enqueueOp,

    // Optimistic update management
    optimisticUpdates: optimisticState.updates,
    pendingOperations: optimisticState.pendingOperations,
    confirmOptimisticUpdate,
    revertOptimisticUpdate,
    clearOptimisticUpdates,

    // Conflicts
    conflicts,
    resolveConflict: (
      conflictId: string,
      _resolution: "prefer_incoming" | "prefer_existing"
    ) => {
      setConflicts((prev) => {
        const updated = new Map(prev);
        updated.delete(conflictId);
        return updated;
      });
    },

    // Error handling
    persistError,
    clearPersistError: () => setPersistError(null),

    // Enhanced actions
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
    setSubscription,
    backupState,
    restoreState,
    // Reminder system
    updateReminderSettings,
    updateReminderNotification,
    processReminders,
  };
}