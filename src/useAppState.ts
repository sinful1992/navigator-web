// src/useAppState.ts - FIXED VERSION - Prevent state corruption
import * as React from "react";
import { storageManager } from "./utils/storageManager";
import { logger } from "./utils/logger";
import { showWarning, showError } from "./utils/toast";
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
  BonusSettings,
} from "./types";
import {
  processArrangementReminders,
  updateReminderStatus,
  cleanupOldNotifications,
  DEFAULT_REMINDER_SETTINGS,
} from "./services/reminderScheduler";
import { DEFAULT_BONUS_SETTINGS } from "./utils/bonusCalculator";
import { setProtectionFlag, clearProtectionFlag } from "./utils/protectionFlags";

// Domain Services
import { AddressService } from "./services/AddressService";
import { CompletionService } from "./services/CompletionService";
import { ArrangementService } from "./services/ArrangementService";
import { SettingsService } from "./services/SettingsService";
import { BackupService } from "./services/BackupService";
import { SessionService } from "./services/SessionService";

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
  bonusSettings: DEFAULT_BONUS_SETTINGS,
};

// 🔧 CRITICAL FIX: Safer deep copy that preserves data integrity
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
    // Use immutable spread pattern instead of deep copy to avoid data corruption
    let result: AppState = {
      ...baseState,
      addresses: [...baseState.addresses],
      completions: [...baseState.completions],
      arrangements: [...baseState.arrangements],
      daySessions: [...baseState.daySessions]
    };

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
              // 🔧 FIX: Check for duplicate addresses before adding
              const isDuplicate = result.addresses.some(a =>
                a.address?.trim()?.toLowerCase() === update.data.address?.trim()?.toLowerCase()
              );

              if (!isDuplicate) {
                result.addresses = [...result.addresses, update.data];
              } else {
                logger.warn('Skipping duplicate address in optimistic update:', update.data.address);
              }
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

/**
 * Submit operation callback for delta sync
 * Called whenever a state-changing operation occurs
 */
type SubmitOperationCallback = (operation: {
  type: 'ADDRESS_BULK_IMPORT' | 'COMPLETION_CREATE' | 'ACTIVE_INDEX_SET' | 'ARRANGEMENT_CREATE' | 'ARRANGEMENT_UPDATE' | 'ARRANGEMENT_DELETE' | 'COMPLETION_UPDATE' | 'COMPLETION_DELETE' | 'ADDRESS_ADD' | 'SESSION_START' | 'SESSION_END' | 'SETTINGS_UPDATE_SUBSCRIPTION' | 'SETTINGS_UPDATE_REMINDER' | 'SETTINGS_UPDATE_BONUS';
  payload: any;
}) => Promise<void>;

export function useAppState(userId?: string, submitOperation?: SubmitOperationCallback) {
  const [baseState, setBaseState] = React.useState<AppState>(initial);
  const [optimisticState, setOptimisticState] =
    React.useState<OptimisticState>({
      updates: new Map(),
      pendingOperations: new Set(),
    });
  const [loading, setLoading] = React.useState(true);

  // stable device id
  const deviceId = React.useMemo(() => getOrCreateDeviceId(), []);

  // Initialize domain services
  const services = React.useMemo(() => {
    if (!submitOperation) {
      return null;
    }

    return {
      address: new AddressService({ submitOperation, deviceId }),
      completion: new CompletionService({ submitOperation, deviceId }),
      arrangement: new ArrangementService({ submitOperation, deviceId }),
      settings: new SettingsService({ submitOperation, deviceId }),
      backup: new BackupService({ userId }),
      session: new SessionService({ submitOperation, deviceId }),
    };
  }, [submitOperation, deviceId, userId]);

  // Store current user ID for ownership tracking
  const ownerUserIdRef = React.useRef<string | undefined>(userId);
  React.useEffect(() => {
    ownerUserIdRef.current = userId;
  }, [userId]);

  // Computed state with optimistic updates applied
  const state = React.useMemo(() => {
    // 🔧 FIX: Ensure bonusSettings exists (migration for existing users)
    let patchedBaseState = baseState;
    if (!baseState.bonusSettings) {
      logger.warn('Missing bonusSettings in baseState, applying default');
      patchedBaseState = { ...baseState, bonusSettings: DEFAULT_BONUS_SETTINGS };
      // Update baseState immediately
      setTimeout(() => setBaseState(patchedBaseState), 0);
    }
    return applyOptimisticUpdates(patchedBaseState, optimisticState.updates);
  }, [baseState, optimisticState.updates]);

  // Track conflicts
  const [conflicts, setConflicts] = React.useState<Map<string, any>>(
    new Map()
  );

  // Track loaded owner metadata for ownership verification
  const [ownerMetadata, setOwnerMetadata] = React.useState<{
    ownerUserId?: string;
    ownerChecksum?: string;
  }>({});

  // ---- load from IndexedDB (with validation and migration) ----
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = (await storageManager.queuedGet(STORAGE_KEY)) as any;
        if (!alive) return;

        if (saved) {
          // 🔒 SECURITY: Validate IndexedDB data ownership
          const loadedOwnerUserId = saved._ownerUserId;
          const loadedOwnerChecksum = saved._ownerChecksum;
          const expectedUserId = localStorage.getItem('navigator_expected_user_id');

          // Critical validation: Check if IndexedDB data belongs to current user
          if (expectedUserId && loadedOwnerUserId && loadedOwnerUserId !== expectedUserId) {
            logger.error(`🚨 INDEXEDDB CONTAMINATION: Data belongs to ${loadedOwnerUserId} but expected ${expectedUserId}`);

            // Create emergency backup
            const emergencyBackup = {
              timestamp: new Date().toISOString(),
              contaminatedData: saved,
              expectedUserId,
              actualUserId: loadedOwnerUserId,
              reason: 'indexeddb_contamination'
            };
            localStorage.setItem(`navigator_emergency_backup_${Date.now()}`, JSON.stringify(emergencyBackup));

            // Clear contaminated data and start fresh
            await storageManager.queuedSet(STORAGE_KEY, null);
            logger.warn('🔒 SECURITY: Cleared contaminated IndexedDB data');

            setBaseState({ ...initial, _schemaVersion: CURRENT_SCHEMA_VERSION });
            return;
          }

          // Store owner metadata for verification
          setOwnerMetadata({
            ownerUserId: loadedOwnerUserId,
            ownerChecksum: loadedOwnerChecksum
          });

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
            reminderSettings: saved.reminderSettings || DEFAULT_REMINDER_SETTINGS,
            reminderNotifications: Array.isArray(saved.reminderNotifications) ? saved.reminderNotifications : [],
            lastReminderProcessed: saved.lastReminderProcessed,
            bonusSettings: saved.bonusSettings || DEFAULT_BONUS_SETTINGS,
            _schemaVersion: CURRENT_SCHEMA_VERSION,
          };

          logger.info('State loaded from IndexedDB:', {
            hasBonusSettings: !!next.bonusSettings,
            bonusSettings: next.bonusSettings
          });

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
        // Add schema version and owner signature before saving
        const stateToSave: any = {
          ...baseState,
          _schemaVersion: CURRENT_SCHEMA_VERSION
        };

        // Add immutable owner signature if authenticated
        if (ownerUserIdRef.current) {
          stateToSave._ownerUserId = ownerUserIdRef.current;
          // Create tamper-detection hash: hash(userId + timestamp + data checksum)
          const dataChecksum = JSON.stringify({
            addressCount: baseState.addresses.length,
            completionCount: baseState.completions.length,
            listVersion: baseState.currentListVersion
          });
          const signatureInput = `${ownerUserIdRef.current}|${dataChecksum}`;
          stateToSave._ownerChecksum = btoa(signatureInput).slice(0, 32);
        }

        await storageManager.queuedSet(STORAGE_KEY, stateToSave);

      } catch (error: unknown) {
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
    async (rows: AddressRow[], preserveCompletions = true) => {
      if (!services) {
        logger.error('Services not initialized');
        return;
      }

      logger.info(`🔄 IMPORT START: Importing ${rows.length} addresses, preserveCompletions=${preserveCompletions}`);

      // Prevent import while address is active
      if (baseState.activeIndex !== null) {
        const activeAddress = baseState.addresses[baseState.activeIndex];
        logger.error(`❌ IMPORT BLOCKED: Cannot import while address is active: "${activeAddress?.address}"`);
        showError(`Please complete or cancel the active address before importing a new list.`);
        return;
      }

      try {
        // Delegate to AddressService (handles validation, protection, operation submission)
        const result = await services.address.importAddresses(
          rows,
          preserveCompletions,
          baseState.currentListVersion
        );

        const operationId = generateOperationId("update", "address", {
          type: "bulk_import",
          count: result.addresses.length,
          preserve: preserveCompletions,
        });

        // Apply optimistically
        addOptimisticUpdate(
          "update",
          "address",
          { addresses: result.addresses, bumpVersion: true, preserveCompletions },
          operationId
        );

        // Update local state
        setBaseState((s) => {
          const newState = {
            ...s,
            addresses: result.addresses,
            activeIndex: null,
            activeStartTime: null,
            currentListVersion: result.newListVersion,
            completions: preserveCompletions ? s.completions : [],
          };

          logger.info(`🔄 IMPORT RESULT: addresses=${newState.addresses.length}, completions=${newState.completions.length}, listVersion=${newState.currentListVersion}`);
          return newState;
        });

        // Confirm operation
        confirmOptimisticUpdate(operationId);

      } catch (error) {
        logger.error('Address import failed:', error);
        showError(`Failed to import addresses: ${(error as Error).message}`);
      }
    },
    [services, baseState.activeIndex, baseState.addresses, baseState.currentListVersion, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /** Add a single address (used by Arrangements "manual address"). Returns new index. */
  const addAddress = React.useCallback(
    async (addressRow: AddressRow): Promise<number> => {
      if (!services) {
        logger.error('Services not initialized');
        return -1;
      }

      try {
        // Delegate to AddressService (handles validation and operation submission)
        const newAddress = await services.address.addAddress(addressRow);

        const operationId = generateOperationId("create", "address", newAddress);

        // Apply optimistically
        addOptimisticUpdate("create", "address", newAddress, operationId);

        let newIndex = -1;

        // Update local state
        setBaseState((s) => {
          const newAddresses = [...s.addresses, newAddress];
          newIndex = newAddresses.length - 1;
          return { ...s, addresses: newAddresses };
        });

        // Confirm operation
        confirmOptimisticUpdate(operationId);

        return newIndex;

      } catch (error) {
        logger.error('Failed to add address:', error);
        return -1;
      }
    },
    [services, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const setActive = React.useCallback(async (idx: number) => {
    if (!services) {
      logger.error('Services not initialized');
      return;
    }

    const now = new Date().toISOString();

    // Check if there's already an active address
    if (baseState.activeIndex !== null && baseState.activeIndex !== idx) {
      const currentActiveAddress = baseState.addresses[baseState.activeIndex];
      logger.warn(`Cannot start address #${idx} - address #${baseState.activeIndex} "${currentActiveAddress?.address}" is already active`);
      showWarning(`Please complete or cancel the current active address first`);
      return;
    }

    // Check if this address is already completed
    const address = baseState.addresses[idx];
    if (address) {
      const isCompleted = baseState.completions.some(c =>
        c.index === idx &&
        (c.listVersion || baseState.currentListVersion) === baseState.currentListVersion
      );

      if (isCompleted) {
        logger.warn(`Cannot set active - address at index ${idx} is already completed`);
        showWarning(`This address is already completed`);
        return;
      }
    }

    try {
      // Delegate to AddressService (handles protection flag and operation submission)
      await services.address.setActiveAddress(idx, now);

      // Update local state
      setBaseState((s) => {
        logger.info(`📍 STARTING CASE: Address #${idx} "${address?.address}" at ${now} - SYNC BLOCKED until Complete/Cancel`);
        return { ...s, activeIndex: idx, activeStartTime: now };
      });

    } catch (error) {
      logger.error('Failed to set active address:', error);
      showError(`Failed to start timer: ${(error as Error).message}`);
    }
  }, [services, baseState]);

  const cancelActive = React.useCallback(async () => {
    if (!services) {
      logger.error('Services not initialized');
      return;
    }

    try {
      // Delegate to AddressService (handles protection flag clearing and operation submission)
      await services.address.cancelActiveAddress();

      // Update local state
      setBaseState((s) => {
        logger.info(`📍 CANCELING ACTIVE: Clearing active state - SYNC RESUMED`);
        return { ...s, activeIndex: null, activeStartTime: null };
      });

    } catch (error) {
      logger.error('Failed to cancel active address:', error);
      showError(`Failed to cancel timer: ${(error as Error).message}`);
    }
  }, [services]);

  // Track pending completions to prevent double submissions
  const [, setPendingCompletions] = React.useState<Set<number>>(new Set());
  const pendingCompletionsRef = React.useRef<Set<number>>(new Set());
  
  /** ATOMIC: Enhanced completion with proper transaction handling */
  // Track recent completions to protect against cloud sync rollbacks
  const recentCompletionsRef = React.useRef<Map<string, { timestamp: number; completion: Completion }>>(new Map());

  // Periodic cleanup of recent completions to prevent memory leak
  React.useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const cutoffTime = Date.now() - 30000; // 30 seconds
      let removedCount = 0;

      for (const [key, value] of recentCompletionsRef.current.entries()) {
        if (value.timestamp < cutoffTime) {
          recentCompletionsRef.current.delete(key);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        logger.debug(`🧹 Cleaned up ${removedCount} old completion entries from memory`);
      }
    }, 15000); // Run cleanup every 15 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  const complete = React.useCallback(
    async (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string, numberOfCases?: number, enforcementFees?: number[]): Promise<string> => {
      if (!services) {
        logger.error('Services not initialized');
        throw new Error('Services not initialized');
      }

      // Validate index
      if (!Number.isInteger(index) || index < 0 || index >= baseState.addresses.length) {
        showError('Invalid address index. Please refresh and try again.');
        throw new Error(`Invalid index: ${index}`);
      }

      // Check if completion is already pending
      if (pendingCompletionsRef.current.has(index)) {
        throw new Error(`Completion already pending for index ${index}`);
      }

      // Check if address exists
      const address = baseState.addresses[index];
      if (!address || !address.address) {
        showError('Invalid address data. Please refresh and try again.');
        throw new Error(`Address at index ${index} is invalid`);
      }

      // Check for recent duplicate completion
      const existingCompletion = baseState.completions.find(
        (c) => c.address === address.address && c.listVersion === baseState.currentListVersion
      );

      if (existingCompletion) {
        const timeDiff = Date.now() - new Date(existingCompletion.timestamp).getTime();
        if (timeDiff < 30000) {
          showWarning(`Address "${address.address}" was already completed ${Math.round(timeDiff/1000)} seconds ago`);
          return Promise.reject();
        }
      }

      try {
        // Mark as pending
        pendingCompletionsRef.current.add(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));

        // Delegate to CompletionService (handles validation, time tracking, operation submission)
        const completion = await services.completion.createCompletion({
          index,
          address: address.address,
          lat: address.lat ?? null,
          lng: address.lng ?? null,
          outcome,
          amount,
          listVersion: baseState.currentListVersion,
          arrangementId,
          caseReference,
          numberOfCases,
          enforcementFees,
        }, baseState.activeStartTime);

        const operationId = generateOperationId("create", "completion", completion);
        const completionKey = `${index}_${outcome}_${baseState.currentListVersion}`;

        // Track recent completion
        recentCompletionsRef.current.set(completionKey, {
          timestamp: Date.now(),
          completion
        });

        // Apply optimistic update
        addOptimisticUpdate("create", "completion", completion, operationId);

        // Update local state
        setBaseState((s) => {
          return {
            ...s,
            completions: [completion, ...s.completions],
            activeIndex: s.activeIndex === index ? null : s.activeIndex,
            activeStartTime: s.activeIndex === index ? null : s.activeStartTime,
          };
        });

        return operationId;

      } catch (error) {
        logger.error('Failed to create completion:', error);
        showError(`Failed to complete address: ${(error as Error).message}`);
        throw error;
      } finally {
        // Always clear pending state
        pendingCompletionsRef.current.delete(index);
        setPendingCompletions(new Set(pendingCompletionsRef.current));
      }
    },
    [services, baseState, addOptimisticUpdate]
  );

  /** Enhanced undo with optimistic updates */
  const undo = React.useCallback(
    async (index: number) => {
      if (!services) {
        logger.error('Services not initialized');
        return;
      }

      // Find the most recent completion for this index
      let completionToDelete: Completion | undefined;
      let mostRecentPos = -1;
      let mostRecentTime = 0;

      for (let i = 0; i < baseState.completions.length; i++) {
        const c = baseState.completions[i];
        if (Number(c.index) === Number(index) &&
            c.listVersion === baseState.currentListVersion) {
          const completionTime = new Date(c.timestamp).getTime();
          if (completionTime > mostRecentTime) {
            mostRecentTime = completionTime;
            mostRecentPos = i;
            completionToDelete = c;
          }
        }
      }

      if (!completionToDelete) {
        logger.warn('No completion found to undo');
        return;
      }

      try {
        // Delegate to CompletionService (handles operation submission)
        await services.completion.deleteCompletion(
          completionToDelete.timestamp,
          completionToDelete.index,
          completionToDelete.listVersion
        );

        const operationId = generateOperationId("delete", "completion", completionToDelete);

        // Add optimistic update
        addOptimisticUpdate("delete", "completion", completionToDelete, operationId);

        // Update local state
        setBaseState((s) => {
          const arr = s.completions.slice();
          arr.splice(mostRecentPos, 1);
          return { ...s, completions: arr };
        });

        // Confirm operation
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      } catch (error) {
        logger.error('Failed to undo completion:', error);
        showError(`Failed to undo: ${(error as Error).message}`);
      }
    },
    [services, baseState, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  /** Update an existing completion (e.g., change outcome or amount) */
  const updateCompletion = React.useCallback(
    async (completionArrayIndex: number, updates: Partial<Completion>) => {
      if (!services) {
        logger.error('Services not initialized');
        return;
      }

      // Validate index
      if (
        !Number.isInteger(completionArrayIndex) ||
        completionArrayIndex < 0 ||
        completionArrayIndex >= baseState.completions.length
      ) {
        logger.error('Invalid completion index:', completionArrayIndex);
        showError('Invalid completion index');
        return;
      }

      const originalCompletion = baseState.completions[completionArrayIndex];

      try {
        // Delegate to CompletionService (handles validation and operation submission)
        await services.completion.updateCompletion(originalCompletion.timestamp, updates);

        const updatedCompletion = { ...originalCompletion, ...updates };
        const operationId = generateOperationId(
          "update",
          "completion",
          { originalTimestamp: originalCompletion.timestamp, updates }
        );

        // Add optimistic update
        addOptimisticUpdate("update", "completion", updatedCompletion, operationId);

        // Update local state
        setBaseState((s) => {
          const newCompletions = s.completions.slice();
          newCompletions[completionArrayIndex] = updatedCompletion;
          return { ...s, completions: newCompletions };
        });

        // Confirm operation
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      } catch (error) {
        logger.error('Failed to update completion:', error);
        showError(`Failed to update completion: ${(error as Error).message}`);
      }
    },
    [services, baseState, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  // ---- 🔧 FIXED: Enhanced day tracking with better validation ----

  const startDay = React.useCallback(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const sess: DaySession = {
      date: today,
      start: now.toISOString(),
    };

    let shouldSubmit = false;

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

      logger.info('Starting new day session:', sess);
      setProtectionFlag('navigator_day_session_protection');
      shouldSubmit = true;

      return {
        ...s,
        daySessions: [...updatedSessions, sess]
      };
    });

    // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
    if (shouldSubmit && submitOperation) {
      submitOperation({
        type: 'SESSION_START',
        payload: { session: sess }
      }).catch(err => {
        logger.error('Failed to submit session start operation:', err);
      });
    }
  }, [submitOperation]);


  const endDay = React.useCallback(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    let endedSession: DaySession | undefined;

    setBaseState((s) => {
      const {
        updatedSessions,
        closedSessions,
        endedSession: session,
      } = prepareEndDaySessions(s.daySessions, today, now);

      endedSession = session;

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
      clearProtectionFlag('navigator_day_session_protection');
      return { ...s, daySessions: updatedSessions };
    });

    // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
    if (submitOperation && endedSession && endedSession.end) {
      submitOperation({
        type: 'SESSION_END',
        payload: {
          date: endedSession.date,
          endTime: endedSession.end,
        }
      }).catch(err => {
        logger.error('Failed to submit session end operation:', err);
      });
    }
  }, [submitOperation]);

  const updateSession = React.useCallback((date: string, updates: Partial<DaySession>, createIfMissing: boolean = false) => {
    let sessionCreated = false;

    setBaseState((s) => {
      const sessions = s.daySessions.slice();
      const sessionIndex = sessions.findIndex((session) => session.date === date);

      if (sessionIndex < 0) {
        if (!createIfMissing) {
          logger.warn('Session not found for date:', date);
          return s;
        }

        // Create new session with provided updates
        const now = new Date().toISOString();
        const newSession: DaySession = {
          date,
          start: updates.start || now,
          end: updates.end,
          durationSeconds: updates.durationSeconds,
          createdAt: now,
          updatedAt: now,
          updatedBy: deviceId,
        };

        // Calculate duration if both start and end present
        if (newSession.start && newSession.end) {
          try {
            const startTime = new Date(newSession.start).getTime();
            const endTime = new Date(newSession.end).getTime();
            newSession.durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
          } catch (error) {
            logger.error('Error calculating duration:', error);
          }
        }

        sessions.push(newSession);
        sessionCreated = true;
        logger.info('Creating new session:', newSession);

        return { ...s, daySessions: sessions };
      }

      const updatedSession = { ...sessions[sessionIndex], ...updates };

      // Recalculate duration if both start and end are present
      if (updatedSession.start && updatedSession.end) {
        try {
          const startTime = new Date(updatedSession.start).getTime();
          const endTime = new Date(updatedSession.end).getTime();

          if (endTime >= startTime) {
            updatedSession.durationSeconds = Math.floor((endTime - startTime) / 1000);
          } else {
            logger.warn('End time is before start time, setting duration to 0');
            updatedSession.durationSeconds = 0;
          }
        } catch (error) {
          logger.error('Error calculating duration:', error);
          updatedSession.durationSeconds = 0;
        }
      }

      const now = new Date().toISOString();
      updatedSession.updatedAt = now;
      updatedSession.updatedBy = deviceId;

      sessions[sessionIndex] = updatedSession;
      logger.info('Updating session:', updatedSession);

      return { ...s, daySessions: sessions };
    });

    // 🔥 DELTA SYNC: Submit operation to cloud immediately (AFTER state update)
    if (submitOperation) {
      const operationType = sessionCreated ? 'SESSION_START' : 'SESSION_UPDATE';
      const payload = sessionCreated
        ? {
            session: {
              date,
              start: updates.start || new Date().toISOString(),
              end: updates.end,
              durationSeconds: updates.durationSeconds,
              updatedAt: new Date().toISOString(),
              updatedBy: deviceId,
            }
          }
        : {
            date,
            updates: {
              ...updates,
              updatedAt: new Date().toISOString(),
              updatedBy: deviceId,
            }
          };

      submitOperation({
        type: operationType as any,
        payload
      }).catch(err => {
        logger.error(`Failed to submit ${operationType} operation:`, err);
      });
    }
  }, [submitOperation, deviceId, setBaseState]);

  // ---- enhanced arrangements ----

  const addArrangement = React.useCallback(
    async (arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">): Promise<string> => {
      if (!services) {
        logger.error('Services not initialized');
        return '';
      }

      try {
        // Delegate to ArrangementService (handles ID generation, validation, operation submission)
        const newArrangement = await services.arrangement.createArrangement(arrangementData);

        const operationId = generateOperationId("create", "arrangement", newArrangement);

        // Apply optimistic update
        addOptimisticUpdate("create", "arrangement", newArrangement, operationId);

        // Update local state
        setBaseState((s) => {
          return { ...s, arrangements: [...s.arrangements, newArrangement] };
        });

        // Confirm operation
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);

        return newArrangement.id;

      } catch (error) {
        logger.error('Failed to create arrangement:', error);
        showError(`Failed to create arrangement: ${(error as Error).message}`);
        return '';
      }
    },
    [services, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const updateArrangement = React.useCallback(
    async (id: string, updates: Partial<Arrangement>): Promise<void> => {
      if (!services) {
        logger.error('Services not initialized');
        return;
      }

      // Check if arrangement exists
      const arrangement = baseState.arrangements.find((arr) => arr.id === id);
      if (!arrangement) {
        logger.warn(`Cannot update arrangement ${id} - not found`);
        return;
      }

      try {
        // Delegate to ArrangementService (handles validation and operation submission)
        await services.arrangement.updateArrangement(id, updates);

        const operationId = generateOperationId("update", "arrangement", { id, ...updates });

        const updatedArrangement = {
          ...updates,
          id,
          updatedAt: new Date().toISOString(),
        };

        // Apply optimistic update
        addOptimisticUpdate("update", "arrangement", updatedArrangement, operationId);

        // Update local state
        setBaseState((s) => {
          const arrangements = s.arrangements.map((arr) =>
            arr.id === id
              ? { ...arr, ...updates, updatedAt: new Date().toISOString() }
              : arr
          );
          return { ...s, arrangements };
        });

        // Confirm operation
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      } catch (error) {
        logger.error('Failed to update arrangement:', error);
        showError(`Failed to update arrangement: ${(error as Error).message}`);
      }
    },
    [services, baseState, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  const deleteArrangement = React.useCallback(
    async (id: string): Promise<void> => {
      if (!services) {
        logger.error('Services not initialized');
        return;
      }

      // Check if arrangement exists
      const arrangement = baseState.arrangements.find((arr) => arr.id === id);
      if (!arrangement) {
        logger.warn(`Cannot delete arrangement ${id} - not found`);
        return;
      }

      try {
        // Delegate to ArrangementService (handles operation submission)
        await services.arrangement.deleteArrangement(id);

        const operationId = generateOperationId("delete", "arrangement", arrangement);

        // Apply optimistic update
        addOptimisticUpdate("delete", "arrangement", { id }, operationId);

        // Update local state
        setBaseState((s) => {
          const arrangements = s.arrangements.filter((arr) => arr.id !== id);
          return { ...s, arrangements };
        });

        // Confirm operation
        setTimeout(() => confirmOptimisticUpdate(operationId), 0);

      } catch (error) {
        logger.error('Failed to delete arrangement:', error);
        showError(`Failed to delete arrangement: ${(error as Error).message}`);
      }
    },
    [services, baseState, addOptimisticUpdate, confirmOptimisticUpdate]
  );

  // ---- subscription management ----

  const setSubscription = React.useCallback(async (subscription: UserSubscription | null) => {
    if (!services) {
      logger.error('Services not initialized');
      return;
    }

    try {
      // Delegate to SettingsService (handles validation and operation submission)
      await services.settings.updateSubscription(subscription);

      // Update local state
      setBaseState((s) => ({ ...s, subscription }));

    } catch (error) {
      logger.error('Failed to update subscription:', error);
      showError(`Failed to update subscription: ${(error as Error).message}`);
    }
  }, [services]);

  // ---- reminder system management ----

  const updateReminderSettings = React.useCallback(async (settings: ReminderSettings) => {
    if (!services) {
      logger.error('Services not initialized');
      return;
    }

    try {
      // Delegate to SettingsService (handles validation and operation submission)
      await services.settings.updateReminderSettings(settings);

      // Update local state
      setBaseState((s) => ({ ...s, reminderSettings: settings }));

    } catch (error) {
      logger.error('Failed to update reminder settings:', error);
      showError(`Failed to update reminder settings: ${(error as Error).message}`);
    }
  }, [services]);

  // ---- bonus settings management ----

  const updateBonusSettings = React.useCallback(async (settings: BonusSettings) => {
    if (!services) {
      logger.error('Services not initialized');
      return;
    }

    try {
      // Delegate to SettingsService (handles validation and operation submission)
      await services.settings.updateBonusSettings(settings);

      // Update local state
      setBaseState((s) => ({ ...s, bonusSettings: settings }));

    } catch (error) {
      logger.error('Failed to update bonus settings:', error);
      showError(`Failed to update bonus settings: ${(error as Error).message}`);
    }
  }, [services]);

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
    if (!services) {
      logger.error('Services not initialized');
      return baseState;
    }

    // Delegate to BackupService (creates clean snapshot)
    return services.backup.createBackup(baseState);
  }, [services, baseState]);

  const restoreState = React.useCallback(
    async (obj: unknown, mergeStrategy: "replace" | "merge" = "replace") => {
      if (!services) {
        logger.error('Services not initialized');
        throw new Error('Services not initialized');
      }

      // Validate backup using service
      const validation = services.backup.validateBackup(obj);
      if (!validation.valid) {
        logger.error('🚨 RESTORE VALIDATION FAILED:', validation.errors);
        showError('Invalid backup file format');
        throw new Error("Invalid backup file format");
      }

      const backup = obj as AppState;
      const version = backup.currentListVersion || 1;

      logger.info('📁 RESTORE DATA ANALYSIS:', {
        addressCount: backup.addresses.length,
        completionCount: backup.completions.length,
        arrangementCount: backup.arrangements?.length || 0,
        daySessionCount: backup.daySessions?.length || 0,
        listVersion: version,
        mergeStrategy,
      });

      // Stamp completions with version
      const restoredState: AppState = {
        addresses: backup.addresses,
        completions: stampCompletionsWithVersion(backup.completions, version),
        activeIndex: backup.activeIndex ?? null,
        daySessions: backup.daySessions ?? [],
        arrangements: backup.arrangements ?? [],
        currentListVersion: version,
        subscription: backup.subscription,
        reminderSettings: backup.reminderSettings,
        bonusSettings: backup.bonusSettings,
      };

      // Delegate merge logic to BackupService
      const finalState = services.backup.prepareRestore(restoredState, baseState, mergeStrategy);

      logger.info('📁 RESTORED STATE PREPARED:', {
        addressCount: finalState.addresses.length,
        completionCount: finalState.completions.length,
        arrangementCount: finalState.arrangements.length,
        daySessionCount: finalState.daySessions.length,
      });

      // Apply restored state
      setBaseState(finalState);

      // Clear optimistic updates after restore
      clearOptimisticUpdates();

      // Persist immediately with proper error handling
      try {
        const stateToSave = { ...restoredState, _schemaVersion: CURRENT_SCHEMA_VERSION };

        logger.info('💾 PERSISTING RESTORED STATE:', {
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
            logger.info('📱 PERSISTENT STORAGE:', isPersistent ? 'GRANTED' : 'DENIED');
          } catch (error) {
            logger.warn('📱 PERSISTENT STORAGE REQUEST FAILED:', error);
          }
        }

        await storageManager.queuedSet(STORAGE_KEY, stateToSave);
        logger.info('✅ RESTORED STATE PERSISTED TO INDEXEDDB');

        // Check storage quota (mobile issue detection)
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            const percentUsed = estimate.usage && estimate.quota
              ? Math.round((estimate.usage / estimate.quota) * 100)
              : 'unknown';
            logger.info('📊 STORAGE QUOTA:', {
              used: estimate.usage ? `${Math.round(estimate.usage / 1024 / 1024)}MB` : 'unknown',
              total: estimate.quota ? `${Math.round(estimate.quota / 1024 / 1024)}MB` : 'unknown',
              percentUsed: `${percentUsed}%`
            });
          } catch (error) {
            logger.warn('📊 STORAGE QUOTA CHECK FAILED:', error);
          }
        }

        // Verify the state was actually saved
        const verifyState = await storageManager.queuedGet(STORAGE_KEY);
        logger.info('🔍 VERIFICATION READ FROM INDEXEDDB:', {
          success: !!verifyState,
          addressCount: verifyState?.addresses?.length || 0,
          completionCount: verifyState?.completions?.length || 0,
          arrangementCount: verifyState?.arrangements?.length || 0
        });

        // 🔧 CRITICAL FIX: Set restore flag to prevent cloud sync override
        // Use 30 second protection window for testing
        const restoreTime = Date.now();
        localStorage.setItem('navigator_restore_in_progress', restoreTime.toString());
        logger.info('🛡️ RESTORE PROTECTION ACTIVATED:', new Date(restoreTime).toISOString());

        // Also set a backup protection flag that lasts longer
        localStorage.setItem('navigator_last_restore', restoreTime.toString());

      } catch (persistError: unknown) {
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
          logger.info('⚠️ STATE CHANGE AFTER RESTORE:', {
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
          const oldActiveIndex = finalState.activeIndex;
          const activeAddress = finalState.addresses[oldActiveIndex];

          // Clear if activeIndex is out of bounds
          if (!activeAddress) {
            // This shouldn't happen if active protection is working
            logger.error(`❌ INVALID activeIndex during cloud sync: Index ${oldActiveIndex} is out of bounds (max: ${finalState.addresses.length - 1}). Protection should have blocked this!`);
            finalState = { ...finalState, activeIndex: null, activeStartTime: null };
          } else {
            // Clear if active address was completed on another device
            const activeAddressCompleted = finalState.completions.some(c =>
              c.address === activeAddress.address &&
              (c.listVersion || finalState.currentListVersion) === finalState.currentListVersion
            );

            if (activeAddressCompleted) {
              logger.info(`🔄 Address "${activeAddress.address}" was completed on another device`);

              // 🔧 FIX: Save local time tracking before clearing active state
              if (finalState.activeStartTime) {
                const startTime = new Date(finalState.activeStartTime).getTime();
                const endTime = Date.now();
                const timeSpentSeconds = Math.floor((endTime - startTime) / 1000);

                // Find the completion from the other device
                const existingCompletion = finalState.completions.find(c =>
                  c.address === activeAddress.address &&
                  (c.listVersion || finalState.currentListVersion) === finalState.currentListVersion
                );

                if (existingCompletion && !existingCompletion.timeSpentSeconds) {
                  // Add our local time to the existing completion
                  logger.info(`⏱️ SAVING LOCAL TIME: Adding ${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s to completion from other device`);
                  existingCompletion.timeSpentSeconds = timeSpentSeconds;
                } else if (existingCompletion && existingCompletion.timeSpentSeconds) {
                  logger.info(`⏱️ Time already tracked on other device: ${Math.floor(existingCompletion.timeSpentSeconds / 60)}m ${existingCompletion.timeSpentSeconds % 60}s`);
                }
              }

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

    // Owner metadata for verification
    ownerMetadata,

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
    updateCompletion,
    startDay,
    endDay,
    updateSession,
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
    // Bonus settings
    updateBonusSettings,
  };
}