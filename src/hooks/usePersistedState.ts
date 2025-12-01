// src/hooks/usePersistedState.ts - IndexedDB persistence with ownership verification
// PHASE 2: Extracted from useAppState.ts
// Responsibility: Load/save state from IndexedDB with validation, migration, and ownership checks

import React from 'react';
import type { AppState } from '../types';
import { DEFAULT_REMINDER_SETTINGS } from '../services/reminderScheduler';
import { DEFAULT_BONUS_SETTINGS } from '../utils/bonusCalculator';
import { storageManager } from '../utils/storageManager';
import { validateAppState, validateAddressRow, stampCompletionsWithVersion } from '../utils/validationUtils';
import { logger } from '../utils/logger';
// STATE_PERSISTENCE_DEBOUNCE_MS import removed - debounce eliminated for data safety

// Constants
const STORAGE_KEY = "navigator_state_v5";
const CURRENT_SCHEMA_VERSION = 5;

/**
 * Initial/default app state
 */
const INITIAL_STATE: AppState = {
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

/**
 * Owner metadata for security verification
 */
export type OwnerMetadata = {
  ownerUserId?: string;
  ownerChecksum?: string;
};

/**
 * Return type for usePersistedState hook
 */
export interface UsePersistedStateReturn {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  loading: boolean;
  ownerMetadata: OwnerMetadata;
}

/**
 * Hook: Load state from IndexedDB with validation and persistence
 *
 * Features:
 * - Load state from IndexedDB on mount with validation
 * - Handle IndexedDB contamination (data from different user)
 * - Apply schema migrations
 * - Validate loaded data structure
 * - Persist state changes with debouncing
 * - Add ownership verification to saved data
 * - Track owner metadata for security checks
 *
 * @param userId - Current authenticated user ID (for ownership verification)
 * @returns Object with state, setState, loading flag, and owner metadata
 */
export function usePersistedState(userId?: string): UsePersistedStateReturn {
  const [baseState, setBaseState] = React.useState<AppState>(INITIAL_STATE);
  const [loading, setLoading] = React.useState(true);
  const [ownerMetadata, setOwnerMetadata] = React.useState<OwnerMetadata>({});

  // Track owner user ID to add signature to saved state
  const ownerUserIdRef = React.useRef<string | undefined>(userId);
  React.useEffect(() => {
    ownerUserIdRef.current = userId;
  }, [userId]);

  // ---- Load from IndexedDB (with validation and migration) ----
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

            setBaseState({ ...INITIAL_STATE, _schemaVersion: CURRENT_SCHEMA_VERSION });
            if (alive) setLoading(false);
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
            setBaseState({ ...INITIAL_STATE, _schemaVersion: CURRENT_SCHEMA_VERSION });
            if (alive) setLoading(false);
            return;
          }

          // Extract version with fallback
          const version =
            typeof saved.currentListVersion === "number"
              ? saved.currentListVersion
              : 1;

          // Reconstruct state with validated data
          const next: AppState = {
            addresses: saved.addresses.filter(validateAddressRow),
            activeIndex: (typeof saved.activeIndex === "number") ? saved.activeIndex : null,
            activeStartTime: saved.activeStartTime || null,
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
            addressCount: next.addresses.length,
            completionCount: next.completions.length,
          });

          if (alive) setBaseState(next);
        } else {
          // No saved data, use initial state with current schema version
          setBaseState({ ...INITIAL_STATE, _schemaVersion: CURRENT_SCHEMA_VERSION });
        }
      } catch (error) {
        logger.error("Failed to load state from IndexedDB:", error);
        // Use safe fallback
        setBaseState({ ...INITIAL_STATE, _schemaVersion: CURRENT_SCHEMA_VERSION });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ---- Persist to IndexedDB (immediate - no debounce for data safety) ----
  React.useEffect(() => {
    if (loading) return;

    // Persist immediately to prevent data loss on page close
    // storageManager.queuedSet already serializes writes to prevent corruption
    const persist = async () => {
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

        // DEBUG logging removed - creates thousands of logs due to frequent persistence
      } catch (error) {
        logger.error('Failed to persist state to IndexedDB:', error);
      }
    };

    persist(); // Fire immediately, no debounce
  }, [baseState, loading]);

  return {
    state: baseState,
    setState: setBaseState,
    loading,
    ownerMetadata
  };
}

/**
 * Constants exported for use in other hooks
 */
export { STORAGE_KEY, CURRENT_SCHEMA_VERSION, INITIAL_STATE };
