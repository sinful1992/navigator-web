// src/useAppState.ts - FIXED VERSION - Prevent state corruption
import * as React from "react";
import { storageManager } from "./utils/storageManager";
import { logger } from "./utils/logger";
import { showWarning, showInfo } from "./utils/toast";
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

const STORAGE_KEY = "navigator_state_v5";
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
  activeStartTime: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1,
  subscription: null,
  reminderSettings: DEFAULT_REMINDER_SETTINGS,
  reminderNotifications: [],
  lastReminderProcessed: undefined,
};

// 🔧 CRITICAL FIX: Safer deep copy that preserves data integrity
function safeDeepCopy<T>(obj: T): T {
  try {
    // Use structured cloning if available (modern browsers)
    if (typeof structuredClone !== 'undefined') {
      return structuredClone(obj);
    }
    
    // Fallback to JSON-based deep copy with validation
    const stringified = JSON.stringify(obj);
    const parsed = JSON.parse(stringified);
    
    // Validate critical fields after parsing
    if (typeof obj === 'object' && obj !== null && 'addresses' in obj) {
      const appState = obj as any;
      const parsedState = parsed as any;
      
      // Ensure addresses array is preserved
      if (Array.isArray(appState.addresses) && !Array.isArray(parsedState.addresses)) {
        logger.error('Deep copy corrupted addresses array, falling back to original');
        parsedState.addresses = appState.addresses;
      }
      
      // Ensure completions array is preserved
      if (Array.isArray(appState.completions) && !Array.isArray(parsedState.completions)) {
        logger.error('Deep copy corrupted completions array, falling back to original');
        parsedState.completions = appState.completions;
      }
    }
    
    return parsed;
  } catch (error) {
    logger.error('Deep copy failed, returning original object:', error);
    return obj;
  }
}

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
    typeof state.currentListVersion === 'number';
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

// Generate a deterministic ID for operations
function generateOperationId(type: string, entity: string, data: any): string {
  const key = `${type}_${entity}_${JSON.stringify(data).slice(0, 50)}_${Date.now()}`;
  // Use encodeURIComponent to handle Unicode characters before base64 encoding
  const unicodeSafeKey = encodeURIComponent(key);
  return btoa(unicodeSafeKey).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

function closeSession(session: DaySession, endTime: Date): DaySession {
  const closed: DaySession = {
    ...session,
    end: endTime.toISOString(),
  };

  const startMs = Date.parse(session.start);
  const endMs = endTime.getTime();

  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    const diff = endMs - startMs;
    closed.durationSeconds = diff >= 0 ? Math.floor(diff / 1000) : undefined;
  } else {
    closed.durationSeconds = undefined;
  }

  return closed;
}

function autoCloseStaleSession(session: DaySession, now: Date): DaySession {
  const nowMs = now.getTime();
  const startMs = Date.parse(session.start);
  let endMs = Date.parse(`${session.date}T23:59:59.999Z`);

  if (Number.isNaN(endMs)) {
    endMs = nowMs;
  }

  if (!Number.isNaN(startMs) && endMs < startMs) {
    endMs = startMs;
  }

  if (endMs > nowMs) {
    endMs = nowMs;
  }

  if (Number.isNaN(endMs)) {
    endMs = Number.isNaN(startMs) ? nowMs : startMs;
  }

  return closeSession(session, new Date(endMs));
}

function sanitizeSessionsForDate(
  sessions: DaySession[],
  today: string,
  now: Date
): { sanitizedSessions: DaySession[]; closedSessions: DaySession[] } {
  const sanitizedSessions: DaySession[] = [];
  const closedSessions: DaySession[] = [];

  for (const session of sessions) {
    if (!session.end && session.date < today) {
      const closed = autoCloseStaleSession(session, now);
      sanitizedSessions.push(closed);
      closedSessions.push(closed);
    } else {
      sanitizedSessions.push(session);
    }
  }

  return { sanitizedSessions, closedSessions };
}

function findLatestOpenSessionIndex(
  sessions: DaySession[],
  today: string
): number {
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const session = sessions[i];
    if (session.date === today && !session.end) {
      return i;
    }
  }
  return -1;
}

export function prepareStartDaySessions(
  sessions: DaySession[],
  today: string,
  now: Date
): {
  updatedSessions: DaySession[];
  newSession?: DaySession;
  closedSessions: DaySession[];
  alreadyActive: boolean;
} {
  const { sanitizedSessions, closedSessions } = sanitizeSessionsForDate(
    sessions,
    today,
    now
  );

  const hasActiveToday = sanitizedSessions.some(
    (session) => session.date === today && !session.end
  );

  if (hasActiveToday) {
    return {
      updatedSessions: sanitizedSessions,
      closedSessions,
      alreadyActive: true,
    };
  }

  const newSession: DaySession = {
    date: today,
    start: now.toISOString(),
  };

  return {
    updatedSessions: [...sanitizedSessions, newSession],
    newSession,
    closedSessions,
    alreadyActive: false,
  };
}

export function prepareEndDaySessions(
  sessions: DaySession[],
  today: string,
  now: Date
): {
  updatedSessions: DaySession[];
  closedSessions: DaySession[];
  endedSession?: DaySession;
} {
  const { sanitizedSessions, closedSessions } = sanitizeSessionsForDate(
    sessions,
    today,
    now
  );

  const activeIndex = findLatestOpenSessionIndex(sanitizedSessions, today);
  if (activeIndex === -1) {
    return {
      updatedSessions: sanitizedSessions,
      closedSessions,
    };
  }

  const updatedSessions = sanitizedSessions.slice();
  const endedSession = closeSession(updatedSessions[activeIndex], now);
  updatedSessions[activeIndex] = endedSession;

  return {
    updatedSessions,
    closedSessions,
    endedSession,
  };
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

// 🔧 CRITICAL FIX: Apply optimistic updates with better error handling and validation
function applyOptimisticUpdates(
  baseState: AppState,
  updates: Map<string, StateUpdate>
): AppState {
  // Return base state immediately if no updates
  if (updates.size === 0) {
    return baseState;
  }

  try {
    // Start with a safer copy
    let result: AppState = safeDeepCopy(baseState);
    
    // Validate the copy worked correctly
    if (!result.addresses || !Array.isArray(result.addresses)) {
      logger.error('State copy failed - addresses corrupted, using base state');
      return baseState;
    }

    // Sort updates by timestamp to apply in order
    const sortedUpdates = Array.from(updates.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Track if any critical state changes occur
    let hasAddressChanges = false;
    let hasCompletionChanges = false;

    for (const update of sortedUpdates) {
      if (update.type === "reverted") continue;

      try {
        switch (update.entity) {
          case "completion":
            hasCompletionChanges = true;
            if (update.operation === "create") {
              // Validate completion data
              if (!update.data || typeof update.data.index !== 'number' || !update.data.outcome) {
                logger.warn('Invalid completion data in optimistic update:', update.data);
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
            hasAddressChanges = true;
            if (update.operation === "create") {
              result.addresses = [...result.addresses, update.data];
            } else if (update.operation === "update") {
              // bulk import path: update carries { addresses, bumpVersion, preserveCompletions }
              if (update.data?.addresses) {
                result.addresses = Array.isArray(update.data.addresses)
                  ? update.data.addresses
                  : result.addresses; // 🔧 FIX: Preserve existing if invalid
                  
                if (update.data.bumpVersion) {
                  const currentVersion =
                    typeof result.currentListVersion === "number"
                      ? result.currentListVersion
                      : 1;
                  result.currentListVersion = currentVersion + 1;
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
              // 🔧 FIX: Validate session data
              if (update.data && update.data.date && update.data.start) {
                result.daySessions = [...result.daySessions, update.data];
              } else {
                logger.warn('Invalid session data in optimistic update:', update.data);
              }
            } else if (update.operation === "update") {
              result.daySessions = result.daySessions.map((session) =>
                session.date === update.data.date
                  ? { ...session, ...update.data }
                  : session
              );
            }
            break;
            
          default:
            logger.warn(`Unknown entity type in optimistic update: ${update.entity}`, update);
            break;
        }
      } catch (updateError) {
        logger.error(`Failed to apply optimistic update for ${update.entity}:`, updateError);
        // Continue with other updates rather than failing completely
      }
    }

    // 🔧 CRITICAL FIX: Validate result state before returning
    if (hasAddressChanges && (!result.addresses || !Array.isArray(result.addresses))) {
      logger.error('Optimistic updates corrupted addresses, reverting to base state');
      return baseState;
    }
    
    if (hasCompletionChanges && (!result.completions || !Array.isArray(result.completions))) {
      logger.error('Optimistic updates corrupted completions, reverting to base state');
      return baseState;
    }

    return result;
    
  } catch (error) {
    logger.error('Failed to apply optimistic updates, returning base state:', error);
    return baseState;
  }
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
        const saved = (await storageManager.queuedGet(STORAGE_KEY)) as any;
        if (!alive) return;

        if (saved) {
          // Validate loaded data
          if (!validateAppState(saved)) {
            logger.warn('Loaded data failed validation, using initial state');
            setBaseState({ ...initial, _schemaVersion: CURRENT_SCHEMA_VERSION });
            return;
          }

          const version =
            typeof saved.currentListVersion === "number"
              ? saved.currentListVersion
              : 1;
          const next: AppState = {
            addresses: saved.addresses.filter(validateAddressRow),
            activeIndex: (typeof saved.activeIndex === "number") ? saved.activeIndex : null,
            completions: stampCompletionsWithVersion(saved.completions, version),
            daySessions: Array.isArray(saved.daySessions) ? saved.daySessions : [],
            arrangements: Array.isArray(saved.arrangements) ? saved.arrangements : [],
            currentListVersion: version,
            subscription: saved.subscription || null,
            _schemaVersion: CURRENT_SCHEMA_VERSION,
          };

          setBaseState(next);
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

  // ---- persist to IndexedDB (debounced with error handling) ----
  React.useEffect(() => {
    if (loading) return;
    
    const t = setTimeout(async () => {
      try {
        // Add schema version before saving
        const stateToSave = { ...baseState, _schemaVersion: CURRENT_SCHEMA_VERSION };
        await storageManager.queuedSet(STORAGE_KEY, stateToSave);
        
      } catch (error: any) {
        logger.error('Failed to persist state to IndexedDB:', error);
      }
    }, 150);
    
    return () => clearTimeout(t);
  }, [baseState, loading]);

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
      logger.info(`🔄 IMPORT START: Importing ${rows.length} addresses, preserveCompletions=${preserveCompletions}`);

      // 🔧 CRITICAL FIX: Set import protection flag to prevent cloud sync override
      const importTime = Date.now();
      localStorage.setItem('navigator_import_in_progress', importTime.toString());
      logger.info('🛡️ IMPORT PROTECTION ACTIVATED:', new Date(importTime).toISOString());

      const operationId = generateOperationId("update", "address", {
        type: "bulk_import",
        count: rows.length,
        preserve: preserveCompletions,
      });

      // 🔧 FIX: Validate rows before applying
      const validRows = Array.isArray(rows) ? rows.filter(validateAddressRow) : [];

      logger.info(`🔄 IMPORT VALIDATION: ${validRows.length} valid out of ${rows.length} total`);

      if (validRows.length === 0) {
        logger.warn('No valid addresses to import');
        return;
      }

      // Apply optimistically
      addOptimisticUpdate(
        "update",
        "address",
        { addresses: validRows, bumpVersion: true, preserveCompletions },
        operationId
      );

      // Apply to base state
      setBaseState((s) => {
        const newListVersion = (typeof s.currentListVersion === "number" ? s.currentListVersion : 1) + 1;
        logger.info(`🔄 IMPORT BASE STATE UPDATE: addresses=${validRows.length}, preserveCompletions=${preserveCompletions}, oldCompletions=${s.completions.length}, newListVersion=${newListVersion}`);

        const newState = {
          ...s,
          addresses: validRows,
          activeIndex: null,
          currentListVersion: newListVersion,
          completions: preserveCompletions ? s.completions : [],
        };

        logger.info(`🔄 IMPORT RESULT STATE: addresses=${newState.addresses.length}, completions=${newState.completions.length}, listVersion=${newState.currentListVersion}`);
        return newState;
      });

      // Confirm immediately for local operations
      confirmOptimisticUpdate(operationId);

      // 🔧 CRITICAL FIX: Clear import protection flag after a delay to allow state to settle
      setTimeout(() => {
        localStorage.removeItem('navigator_import_in_progress');
        logger.info('🛡️ IMPORT PROTECTION CLEARED after import completion');
      }, 2000); // 2 second protection window
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /** Add a single address (used by Arrangements "manual address"). Returns new index. */
  const addAddress = React.useCallback(
    (addressRow: AddressRow): Promise<number> => {
      return new Promise<number>((resolve) => {
        // 🔧 FIX: Validate address before adding
        if (!validateAddressRow(addressRow)) {
          resolve(-1);
          return;
        }
        
        const operationId = generateOperationId("create", "address", addressRow);

        // Apply optimistically
        addOptimisticUpdate("create", "address", addressRow, operationId);

        // Apply to base state
        setBaseState((s) => {
          const newAddresses = [...s.addresses, addressRow];
          const newIndex = newAddresses.length - 1;

          // Resolve immediately with the new index
          confirmOptimisticUpdate(operationId);
          resolve(newIndex);

          return { ...s, addresses: newAddresses };
        });
      });
    },
    [addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const setActive = React.useCallback((idx: number) => {
    // 🔧 CRITICAL FIX: Set protection flag (no timeout - cleared on Complete/Cancel)
    localStorage.setItem('navigator_active_protection', 'true');

    setBaseState((s) => {
      const address = s.addresses[idx];

      // Check if there's already an active address
      if (s.activeIndex !== null && s.activeIndex !== idx) {
        const currentActiveAddress = s.addresses[s.activeIndex];
        logger.warn(`Cannot start address #${idx} - address #${s.activeIndex} "${currentActiveAddress?.address}" is already active`);
        showWarning(`Please complete or cancel the current active address first`);
        localStorage.removeItem('navigator_active_protection');
        return s; // Don't change state
      }

      // Check if this address is already completed (cross-device protection)
      if (address) {
        const isCompleted = s.completions.some(c =>
          c.index === idx &&
          (c.listVersion || s.currentListVersion) === s.currentListVersion
        );

        if (isCompleted) {
          logger.warn(`Cannot set active - address at index ${idx} is already completed`);
          showWarning(`This address is already completed`);
          localStorage.removeItem('navigator_active_protection');
          return s; // Don't change state
        }
      }

      const now = new Date().toISOString();
      logger.info(`📍 STARTING CASE: Address #${idx} "${address?.address}" at ${now} - SYNC BLOCKED until Complete/Cancel`);
      return { ...s, activeIndex: idx, activeStartTime: now };
    });
  }, []);

  const cancelActive = React.useCallback(() => {
    // 🔧 FIX: Clear protection to resume cloud sync
    localStorage.removeItem('navigator_active_protection');

    setBaseState((s) => {
      logger.info(`📍 CANCELING ACTIVE: Clearing active state - SYNC RESUMED`);
      return { ...s, activeIndex: null, activeStartTime: null };
    });
  }, []);

  // Track pending completions to prevent double submissions
  const [, setPendingCompletions] = React.useState<Set<number>>(new Set());
  const pendingCompletionsRef = React.useRef<Set<number>>(new Set());
  
  /** ATOMIC: Enhanced completion with proper transaction handling */
  // Track recent completions to protect against cloud sync rollbacks
  const recentCompletionsRef = React.useRef<Map<string, { timestamp: number; completion: Completion }>>(new Map());

  const complete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string): Promise<string> => {
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

      // Check if already completed (timestamp-based check)
      const existingCompletion = currentState.completions.find(
        (c) => c.address === address.address && c.listVersion === currentState.currentListVersion
      );

      if (existingCompletion) {
        // If there's an existing completion, check if it's recent (within last 30 seconds)
        // This prevents rapid duplicate submissions but allows legitimate re-completion
        const existingTime = new Date(existingCompletion.timestamp).getTime();
        const now = Date.now();
        const timeDiff = now - existingTime;

        if (timeDiff < 30000) { // 30 seconds
          showWarning(`Address "${address.address}" was already completed ${Math.round(timeDiff/1000)} seconds ago`);
          return Promise.reject(); // Exit early but maintain function signature
        }

        console.log(`🔄 RE-COMPLETING: Address "${address.address}" was previously completed ${new Date(existingCompletion.timestamp).toLocaleString()}, allowing new completion`);
      }

      const nowISO = new Date().toISOString();

      // Calculate time spent on this case if it was the active one
      let timeSpentSeconds: number | undefined;
      if (currentState.activeIndex === index && currentState.activeStartTime) {
        const startTime = new Date(currentState.activeStartTime).getTime();
        const endTime = new Date(nowISO).getTime();
        timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
        logger.info(`⏱️ CASE TIME TRACKED: ${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s on "${address.address}"`);
      }

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
        caseReference,
        timeSpentSeconds,
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

        // Apply all changes synchronously to avoid race conditions
        const completionKey = `${index}_${outcome}_${currentState.currentListVersion}`;

        // Track recent completion (cleanup happens in setState handler)
        recentCompletionsRef.current.set(completionKey, {
          timestamp: Date.now(),
          completion
        });

        // Apply both optimistic and base state updates in single transaction
        addOptimisticUpdate("create", "completion", completion, operationId);

        setBaseState((s) => {
          if (s.activeIndex === index) {
            // 🔧 FIX: Clear protection when completing active address
            localStorage.removeItem('navigator_active_protection');
            logger.info(`📍 COMPLETED ACTIVE ADDRESS: Clearing active state - SYNC RESUMED`);
          }

          return {
            ...s,
            completions: [completion, ...s.completions],
            activeIndex: s.activeIndex === index ? null : s.activeIndex,
            activeStartTime: s.activeIndex === index ? null : s.activeStartTime,
          };
        });

        return operationId;
      } finally {
        // Always clear pending state, even if above operations fail
        pendingCompletionsRef.current.delete(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));
      }
    },
    [baseState, addOptimisticUpdate]
  );

  /** Enhanced undo with optimistic updates */
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

  // ---- 🔧 FIXED: Enhanced day tracking with better validation ----

  const startDay = React.useCallback(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    setBaseState((s) => {
      // 🔧 IMPROVED: More specific check - only block if there's an active session TODAY
      const activeTodaySession = s.daySessions.find((d) => d.date === today && !d.end);

      if (activeTodaySession) {
        logger.info('Day already active for today, skipping start');
        return s;
      }

      // 🔧 IMPROVED: Auto-close any stale sessions from previous days
      const updatedSessions = s.daySessions.map((session) => {
        if (session.date < today && !session.end) {
          logger.info('Auto-closing stale session from previous day:', session);
          return {
            ...session,
            end: new Date(session.date + 'T23:59:59.999Z').toISOString(),
            durationSeconds: Math.floor((new Date(session.date + 'T23:59:59.999Z').getTime() - new Date(session.start).getTime()) / 1000)
          };
        }
        return session;
      });

      const sess: DaySession = {
        date: today,
        start: now.toISOString(),
      };

      logger.info('Starting new day session:', sess);
      return {
        ...s,
        daySessions: [...updatedSessions, sess]
      };
    });
  }, []);


  const endDay = React.useCallback(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    setBaseState((s) => {
      const {
        updatedSessions,
        closedSessions,
        endedSession,
      } = prepareEndDaySessions(s.daySessions, today, now);

      closedSessions.forEach((session) =>
        logger.info("Auto-closing stale day session before ending today", session)
      );

      if (!endedSession) {
        logger.info("No active session to end for today");
        if (closedSessions.length > 0) {
          return { ...s, daySessions: updatedSessions };
        }
        return s;
      }

      logger.info("Ending day session:", endedSession);
      return { ...s, daySessions: updatedSessions };
    });
  }, []);

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
      if (!isValidState(obj)) {
        console.error('🚨 RESTORE VALIDATION FAILED:', {
          hasObj: !!obj,
          type: typeof obj,
          hasAddresses: obj && Array.isArray((obj as any).addresses),
          hasCompletions: obj && Array.isArray((obj as any).completions),
          hasActiveIndex: obj && "activeIndex" in (obj as any),
          hasDaySessions: obj && Array.isArray((obj as any).daySessions),
          objKeys: obj ? Object.keys(obj as any) : null
        });
        throw new Error("Invalid backup file format");
      }

      const version =
        typeof (obj as any).currentListVersion === "number"
          ? (obj as any).currentListVersion
          : 1;

      // Mobile browser detection
      const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      console.log('📁 RESTORE DATA ANALYSIS:', {
        addressCount: obj.addresses.length,
        completionCount: obj.completions.length,
        arrangementCount: obj.arrangements?.length || 0,
        daySessionCount: obj.daySessions?.length || 0,
        activeIndex: obj.activeIndex,
        listVersion: version,
        mergeStrategy,
        isMobile,
        isTouch,
        userAgent: navigator.userAgent.substring(0, 50)
      });

      const restoredState: AppState = {
        addresses: obj.addresses,
        completions: stampCompletionsWithVersion(obj.completions, version),
        activeIndex: obj.activeIndex ?? null,
        daySessions: obj.daySessions ?? [],
        arrangements: obj.arrangements ?? [],
        currentListVersion: version,
      };

      console.log('📁 RESTORED STATE PREPARED:', {
        addressCount: restoredState.addresses.length,
        completionCount: restoredState.completions.length,
        arrangementCount: restoredState.arrangements.length,
        daySessionCount: restoredState.daySessions.length,
        activeIndex: restoredState.activeIndex,
        listVersion: restoredState.currentListVersion
      });

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

        console.log('💾 PERSISTING RESTORED STATE:', {
          addressCount: stateToSave.addresses.length,
          completionCount: stateToSave.completions.length,
          arrangementCount: stateToSave.arrangements.length,
          daySessionCount: stateToSave.daySessions.length,
          activeIndex: stateToSave.activeIndex,
          listVersion: stateToSave.currentListVersion,
          schemaVersion: stateToSave._schemaVersion
        });

        // 🔧 MOBILE FIX: Request persistent storage on mobile browsers
        if ('storage' in navigator && 'persist' in navigator.storage) {
          try {
            const isPersistent = await navigator.storage.persist();
            console.log('📱 PERSISTENT STORAGE:', isPersistent ? 'GRANTED' : 'DENIED');
          } catch (error) {
            console.warn('📱 PERSISTENT STORAGE REQUEST FAILED:', error);
          }
        }

        await storageManager.queuedSet(STORAGE_KEY, stateToSave);
        console.log('✅ RESTORED STATE PERSISTED TO INDEXEDDB');

        // Check storage quota (mobile issue detection)
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            const percentUsed = estimate.usage && estimate.quota
              ? Math.round((estimate.usage / estimate.quota) * 100)
              : 'unknown';
            console.log('📊 STORAGE QUOTA:', {
              used: estimate.usage ? `${Math.round(estimate.usage / 1024 / 1024)}MB` : 'unknown',
              total: estimate.quota ? `${Math.round(estimate.quota / 1024 / 1024)}MB` : 'unknown',
              percentUsed: `${percentUsed}%`
            });
          } catch (error) {
            console.warn('📊 STORAGE QUOTA CHECK FAILED:', error);
          }
        }

        // Verify the state was actually saved
        const verifyState = await storageManager.queuedGet(STORAGE_KEY);
        console.log('🔍 VERIFICATION READ FROM INDEXEDDB:', {
          success: !!verifyState,
          addressCount: verifyState?.addresses?.length || 0,
          completionCount: verifyState?.completions?.length || 0,
          arrangementCount: verifyState?.arrangements?.length || 0
        });

        // 🔧 CRITICAL FIX: Set restore flag to prevent cloud sync override
        // Use 30 second protection window for testing
        const restoreTime = Date.now();
        localStorage.setItem('navigator_restore_in_progress', restoreTime.toString());
        console.log('🛡️ RESTORE PROTECTION ACTIVATED:', new Date(restoreTime).toISOString());

        // Also set a backup protection flag that lasts longer
        localStorage.setItem('navigator_last_restore', restoreTime.toString());

      } catch (persistError: any) {
        logger.error('Failed to persist restored state:', persistError);
        throw new Error('Restore failed: Could not save data');
      }
    },
    [clearOptimisticUpdates]
  );

  // Enhanced setState for cloud sync with conflict detection and completion protection
  const setState = React.useCallback(
    (newState: AppState | ((prev: AppState) => AppState)) => {
      // Check if we recently restored data and log any state changes
      const lastRestore = localStorage.getItem('navigator_last_restore');
      if (lastRestore) {
        const timeSinceRestore = Date.now() - parseInt(lastRestore);
        if (timeSinceRestore < 3600000) { // Log for 1 hour after restore
          console.log('⚠️ STATE CHANGE AFTER RESTORE:', {
            timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
            newStateType: typeof newState,
            isFunction: typeof newState === 'function',
            timestamp: new Date().toISOString()
          });
        }
      }

      setBaseState((currentState) => {
        const nextState =
          typeof newState === "function"
            ? (newState as (prev: AppState) => AppState)(currentState)
            : newState;

        // 🔧 CRITICAL FIX: Protect recent completions from being overwritten by cloud sync
        const protectedCompletions = [...nextState.completions];
        let hasProtectedCompletions = false;

        // Clean up old recent completions first to avoid memory leaks
        const cutoffTime = Date.now() - 30000;
        for (const [key, value] of recentCompletionsRef.current.entries()) {
          if (value.timestamp < cutoffTime) {
            recentCompletionsRef.current.delete(key);
          }
        }

        // Add any recent completions that might be missing from cloud data
        for (const [_key, value] of recentCompletionsRef.current.entries()) {
          const { completion, timestamp } = value;

          // Only protect completions from the last 30 seconds (double check after cleanup)
          if (Date.now() - timestamp < 30000) {
            const existsInIncoming = protectedCompletions.some(c =>
              c.index === completion.index &&
              c.outcome === completion.outcome &&
              c.listVersion === completion.listVersion &&
              Math.abs(new Date(c.timestamp).getTime() - new Date(completion.timestamp).getTime()) < 1000
            );

            if (!existsInIncoming) {
              logger.info(`🛡️ PROTECTING RECENT COMPLETION: index=${completion.index}, outcome=${completion.outcome}`);
              protectedCompletions.unshift(completion);
              hasProtectedCompletions = true;
            }
          }
        }

        let finalState = hasProtectedCompletions
          ? { ...nextState, completions: protectedCompletions.sort((a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )}
          : nextState;

        // 🔧 CRITICAL FIX: Clear activeIndex if invalid or address was completed
        if (finalState.activeIndex !== null && typeof finalState.activeIndex === 'number') {
          const activeAddress = finalState.addresses[finalState.activeIndex];

          // Clear if activeIndex is out of bounds
          if (!activeAddress) {
            logger.warn(`🔄 CLEARING INVALID activeIndex: Index ${finalState.activeIndex} is out of bounds (max: ${finalState.addresses.length - 1})`);
            finalState = { ...finalState, activeIndex: null, activeStartTime: null };
          } else {
            // Clear if active address was completed on another device
            const activeAddressCompleted = finalState.completions.some(c =>
              c.address === activeAddress.address &&
              (c.listVersion || finalState.currentListVersion) === finalState.currentListVersion
            );

            if (activeAddressCompleted) {
              logger.info(`🔄 CLEARING ACTIVE INDEX: Address "${activeAddress.address}" was completed on another device`);
              showInfo(`Address "${activeAddress.address}" was completed on another device`);
              finalState = { ...finalState, activeIndex: null, activeStartTime: null };
            }
          }
        }

        const conflicts = new Map();

        // Check for completion conflicts
        finalState.completions.forEach((incoming) => {
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
        finalState.arrangements.forEach((incoming) => {
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

        return finalState;
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