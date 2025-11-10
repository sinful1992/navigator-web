// src/useAppState.ts - REFACTORED VERSION - Composed from 7 focused hooks
import * as React from "react";
import { storageManager } from "./utils/storageManager";
import { logger } from "./utils/logger";
import type {
  AppState,
  Completion,
  DaySession,
  Arrangement,
} from "./types";
import type { SubmitOperationCallback } from "./types/operations";
import {
  processArrangementReminders,
  cleanupOldNotifications,
} from "./services/reminderScheduler";
import { DEFAULT_BONUS_SETTINGS } from "./utils/bonusCalculator";
import {
  setProtectionFlag,
  clearProtectionFlag,
} from "./utils/protectionFlags";
// Extracted hooks
import { usePersistedState } from "./hooks/usePersistedState";
import { useSyncState } from "./hooks/useSyncState";
import { useCompletionState } from "./hooks/useCompletionState";
import { useAddressState } from "./hooks/useAddressState";
import { useArrangementState } from "./hooks/useArrangementState";
import { useSettingsState } from "./hooks/useSettingsState";
import { useTimeTracking } from "./hooks/useTimeTracking";
// Utility functions
import { stampCompletionsWithVersion } from "./utils/validationUtils";
import { applyOptimisticUpdates } from "./utils/optimisticUpdatesUtils";

// Clean Architecture - Services and Repositories
import { AddressRepository } from './repositories/AddressRepository';
import { CompletionRepository } from './repositories/CompletionRepository';
import { SessionRepository } from './repositories/SessionRepository';
import { ArrangementRepository } from './repositories/ArrangementRepository';
import { SettingsRepository } from './repositories/SettingsRepository';
import { AddressService } from './services/AddressService';
import { CompletionService } from './services/CompletionService';
import { SessionService } from './services/SessionService';
import { ArrangementService } from './services/ArrangementService';
import { SettingsService } from './services/SettingsService';
import { BackupService } from './services/BackupService';
import { SyncService } from './services/SyncService';

const STORAGE_KEY = "navigator_state_v5";
const CURRENT_SCHEMA_VERSION = 5;
const DUPLICATE_COMPLETION_TOLERANCE_MS = 5000;
const COMPLETION_MEMORY_CLEANUP_INTERVAL_MS = 60000;

function closeSession(session: DaySession, endTime: Date): DaySession {
  const closed: DaySession = {
    ...session,
    end: endTime.toISOString(),
  };

  const startMs = Date.parse(session.start || '');
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
  const startMs = Date.parse(session.start || '');
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

function prepareEndDaySessions(
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

export function useAppState(userId?: string, submitOperation?: SubmitOperationCallback) {
  // ---- Composed hooks ----
  // 1. Persistence hook (loads/saves state)
  const { state: baseState, setState: setBaseState, loading, ownerMetadata } = usePersistedState(userId);

  // 2. Sync hook (optimistic updates, conflicts, device ID)
  const {
    optimisticUpdates,
    pendingOperations,
    conflicts,
    deviceId,
    confirmOptimisticUpdate,
    revertOptimisticUpdate,
    clearOptimisticUpdates,
    enqueueOp,
    resolveConflict,
    setConflicts,
  } = useSyncState();

  // Helper function to wrap enqueueOp for extracted hooks
  const addOptimisticUpdate = React.useCallback(
    (operation: string, entity: string, data: unknown, operationId?: string): string => {
      const id = operationId || `${operation}_${entity}_${Date.now()}`;
      // enqueueOp expects: (entity, operation, data, operationId)
      enqueueOp(entity as 'completion' | 'arrangement' | 'address' | 'session', operation as 'create' | 'update' | 'delete', data, id);
      return id;
    },
    [enqueueOp]
  );

  // Computed state with optimistic updates applied
  const state = React.useMemo(() => {
    // 🔧 FIX: Ensure bonusSettings exists (migration for existing users)
    let patchedBaseState = baseState;
    if (!baseState.bonusSettings) {
      logger.warn('Missing bonusSettings in baseState, applying default');
      patchedBaseState = { ...baseState, bonusSettings: DEFAULT_BONUS_SETTINGS };
      // Update baseState immediately
      setTimeout(() => setBaseState((s: AppState) => ({ ...s, bonusSettings: DEFAULT_BONUS_SETTINGS })), 0);
    }
    return applyOptimisticUpdates(patchedBaseState, optimisticUpdates);
  }, [baseState, optimisticUpdates, setBaseState]);

  // ---- Initialize domain services and repositories ----
  // Clean Architecture: Repositories (data access) + Services (business logic)
  const servicesAndRepos = React.useMemo(() => {
    if (!submitOperation) return null;

    // Cast submitOperation to SubmitOperationFn for BaseRepository compatibility
    // SubmitOperationCallback (SubmitOperation) is compatible with SubmitOperationFn (Partial<Operation>)
    const submitOpFn = submitOperation as any;

    // Initialize repositories (data access layer)
    const addressRepo = new AddressRepository(submitOpFn, deviceId);
    const completionRepo = new CompletionRepository(submitOpFn, deviceId);
    const sessionRepo = new SessionRepository(submitOpFn, deviceId);
    const arrangementRepo = new ArrangementRepository(submitOpFn, deviceId);
    const settingsRepo = new SettingsRepository(submitOpFn, deviceId);

    // Initialize services (business logic layer - pure, no data access)
    const addressService = new AddressService();
    const completionService = new CompletionService();
    const sessionService = new SessionService();
    const arrangementService = new ArrangementService();
    const settingsService = new SettingsService();
    const backupService = new BackupService();
    const syncService = new SyncService(submitOpFn);

    return {
      // Repositories (data access)
      repositories: {
        address: addressRepo,
        completion: completionRepo,
        session: sessionRepo,
        arrangement: arrangementRepo,
        settings: settingsRepo,
      },
      // Services (business logic)
      services: {
        address: addressService,
        completion: completionService,
        session: sessionService,
        arrangement: arrangementService,
        settings: settingsService,
        backup: backupService,
        sync: syncService,
      },
    };
  }, [submitOperation, deviceId]);

  // ---- Call extracted hooks ----

  // 3. Completion state (create, update, delete completions)
  const completionState = useCompletionState({
    baseState,
    addOptimisticUpdate,
    confirmOptimisticUpdate,
    submitOperation,
    setBaseState,
    services: servicesAndRepos?.services,
    repositories: servicesAndRepos?.repositories,
  });

  // 4. Address state (bulk import, add addresses)
  const addressState = useAddressState({
    baseState,
    addOptimisticUpdate,
    confirmOptimisticUpdate,
    submitOperation,
    setBaseState,
    services: servicesAndRepos?.services,
    repositories: servicesAndRepos?.repositories,
  });

  // 5. Arrangement state (create, update, delete arrangements)
  const arrangementState = useArrangementState({
    baseState,
    addOptimisticUpdate,
    confirmOptimisticUpdate,
    submitOperation,
    setBaseState,
    services: servicesAndRepos?.services,
    repositories: servicesAndRepos?.repositories,
  });

  // 6. Settings state (subscription, reminder, bonus settings)
  const settingsState = useSettingsState({
    submitOperation,
    setBaseState,
    services: servicesAndRepos?.services,
    repositories: servicesAndRepos?.repositories,
  });

  // 7. Time tracking (active address, start/cancel time tracking)
  const timeTrackingState = useTimeTracking({
    baseState,
    setBaseState,
    submitOperation,
    services: servicesAndRepos?.services,
    repositories: servicesAndRepos?.repositories,
  });

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
    }, COMPLETION_MEMORY_CLEANUP_INTERVAL_MS); // Run cleanup at regular interval

    return () => clearInterval(cleanupInterval);
  }, []);

  // ---- 🔧 FIXED: Enhanced day tracking with better validation ----

  const startDay = React.useCallback(async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const sess: DaySession = {
      date: today,
      start: now.toISOString(),
    };

    let shouldSubmit = false;

    setBaseState((s: AppState) => {
      // 🔧 IMPROVED: More specific check - only block if there's an active session TODAY
      const activeTodaySession = s.daySessions.find((d: DaySession) => d.date === today && !d.end);

      if (activeTodaySession) {
        logger.info('Day already active for today, skipping start');
        return s;
      }

      // 🔧 IMPROVED: Auto-close any stale sessions from previous days
      const updatedSessions = s.daySessions.map((session: DaySession) => {
        if (session.date < today && !session.end) {
          logger.info('Auto-closing stale session from previous day:', session);
          return {
            ...session,
            end: new Date(session.date + 'T23:59:59.999Z').toISOString(),
            durationSeconds: Math.floor((new Date(session.date + 'T23:59:59.999Z').getTime() - new Date(session.start || new Date()).getTime()) / 1000)
          };
        }
        return session;
      });

      logger.info('Starting new day session:', sess);
      shouldSubmit = true;

      return {
        ...s,
        daySessions: [...updatedSessions, sess]
      };
    });

    // 🔥 CRITICAL FIX: AWAIT operation submission to ensure persistence before returning
    // This prevents operation loss if page refreshes quickly after starting day
    if (shouldSubmit && servicesAndRepos?.repositories.session) {
      try {
        await servicesAndRepos.repositories.session.saveSessionStart(sess);
        logger.info('✅ Session start operation persisted successfully');
      } catch (err) {
        logger.error('❌ Failed to persist session start operation:', err);
      }
    }
  }, [servicesAndRepos]);


  const endDay = React.useCallback(async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    let endedSession: DaySession | undefined;

    setBaseState((s: AppState) => {
      const {
        updatedSessions,
        closedSessions,
        endedSession: session,
      } = prepareEndDaySessions(s.daySessions, today, now);

      endedSession = session;

      closedSessions.forEach((session: DaySession) =>
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

    // 🔥 CRITICAL FIX: AWAIT operation submission to ensure persistence before returning
    // This prevents operation loss if page refreshes quickly after ending day
    if (servicesAndRepos?.repositories.session && endedSession && endedSession.end) {
      try {
        await servicesAndRepos.repositories.session.saveSessionEnd(endedSession.date, endedSession.end);
        logger.info('✅ Session end operation persisted successfully');
      } catch (err) {
        logger.error('❌ Failed to persist session end operation:', err);
      }
    }
  }, [servicesAndRepos]);

  const updateSession = React.useCallback((date: string, updates: Partial<DaySession>, createIfMissing: boolean = false) => {
    // 🔧 CRITICAL FIX: Set protection flag BEFORE state mutation to prevent race condition
    setProtectionFlag('navigator_session_protection');

    setBaseState((s: AppState) => {
      const sessionIndex = s.daySessions.findIndex((session: DaySession) => session.date === date);

      if (sessionIndex >= 0) {
        // Update existing session
        const updatedSessions = s.daySessions.map((session: DaySession, idx: number) => {
          if (idx === sessionIndex) {
            const updatedSession = { ...session, ...updates };

            // Recalculate duration if both start and end are present
            if (updatedSession.start && updatedSession.end) {
              try {
                const startTime = new Date(updatedSession.start).getTime();
                const endTime = new Date(updatedSession.end).getTime();
                if (endTime >= startTime) {
                  updatedSession.durationSeconds = Math.floor((endTime - startTime) / 1000);
                } else {
                  delete updatedSession.end;
                  delete updatedSession.durationSeconds;
                }
              } catch (error) {
                logger.error('Duration calculation failed:', error);
              }
            }

            return updatedSession;
          }
          return session;
        });

        logger.info('Updated session for date:', date, 'with updates:', updates);
        return { ...s, daySessions: updatedSessions };
      } else if (createIfMissing) {
        // Create new session if it doesn't exist
        const newSession: DaySession = { date, ...updates };
        logger.info('Created new session for date:', date, 'with data:', updates);
        return { ...s, daySessions: [...s.daySessions, newSession] };
      } else {
        logger.warn('Session not found for date:', date, 'and createIfMissing is false');
        return s;
      }
    });

    // Submit operation to cloud
    if (submitOperation) {
      submitOperation({
        type: 'SESSION_UPDATE',
        payload: { date, updates }
      })
        .then(() => {
          // Clear protection flag after successful submission
          clearProtectionFlag('navigator_session_protection');
        })
        .catch(err => {
          logger.error('Failed to submit session update operation:', err);
          // Clear protection flag even on error
          clearProtectionFlag('navigator_session_protection');
        });
    }
  }, [submitOperation]);

  const processReminders = React.useCallback(() => {
    setBaseState((s: AppState) => {
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
      console.log('✅ restoreState called with:', typeof obj, obj && typeof obj === 'object' ? Object.keys(obj as any).join(', ') : '');
      console.log('✅ restoreState - completions count:', (obj as any)?.completions?.length || 0, 'daySessions count:', (obj as any)?.daySessions?.length || 0);

      if (!isValidState(obj)) {
        logger.error('🚨 RESTORE VALIDATION FAILED:', {
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

      logger.info('📁 RESTORE DATA ANALYSIS:', {
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

      logger.info('📁 RESTORED STATE PREPARED:', {
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
        const restoreTime = setProtectionFlag('navigator_restore_in_progress');
        logger.info('🛡️ RESTORE PROTECTION ACTIVATED:', new Date(restoreTime).toISOString());

      } catch (persistError: unknown) {
        logger.error('Failed to persist restored state:', persistError);
        throw new Error('Restore failed: Could not save data');
      }
    },
    [clearOptimisticUpdates]
  );

  // Enhanced setState for cloud sync with conflict detection and completion protection
  const setState = React.useCallback(
    (updaterOrState: AppState | ((state: AppState) => AppState)) => {
      const updater = typeof updaterOrState === 'function' ? updaterOrState : () => updaterOrState;
      // Check if we recently restored data and log any state changes
      const lastRestore = localStorage.getItem('navigator_last_restore');
      if (lastRestore) {
        const timeSinceRestore = Date.now() - parseInt(lastRestore);
        if (timeSinceRestore < 3600000) { // Log for 1 hour after restore
          logger.info('⚠️ STATE CHANGE AFTER RESTORE:', {
            timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
            timestamp: new Date().toISOString()
          });
        }
      }

      setBaseState((currentState) => {
        const nextState = updater(currentState);

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
              ) < DUPLICATE_COMPLETION_TOLERANCE_MS
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
    [clearOptimisticUpdates, setConflicts]
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
    optimisticUpdates,
    pendingOperations,
    confirmOptimisticUpdate,
    revertOptimisticUpdate,
    clearOptimisticUpdates,

    // Conflicts
    conflicts,
    resolveConflict,

    // Day tracking
    startDay,
    endDay,
    updateSession,

    // Backup/restore
    backupState,
    restoreState,

    // ---- Composed hook exports ----

    // Completion management
    complete: completionState.complete,
    completeHistorical: completionState.completeHistorical,
    updateCompletion: completionState.updateCompletion,
    undo: completionState.undo,
    pendingCompletions: completionState.pendingCompletions,

    // Address management
    setAddresses: addressState.setAddresses,
    addAddress: addressState.addAddress,

    // Arrangement management
    addArrangement: arrangementState.addArrangement,
    updateArrangement: arrangementState.updateArrangement,
    deleteArrangement: arrangementState.deleteArrangement,

    // Settings management
    setSubscription: settingsState.setSubscription,
    updateReminderSettings: settingsState.updateReminderSettings,
    updateBonusSettings: settingsState.updateBonusSettings,

    // Time tracking
    setActive: timeTrackingState.setActive,
    cancelActive: timeTrackingState.cancelActive,
    activeIndex: timeTrackingState.activeIndex,
    activeStartTime: timeTrackingState.activeStartTime,
    getTimeSpent: timeTrackingState.getTimeSpent,
  };
}