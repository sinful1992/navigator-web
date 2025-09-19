// src/useCloudSync.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";
import type { AppState } from "./types";

// Initialize a new user with default subscription
async function initializeNewUser(userId: string): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  // Create a trial subscription for the new user
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

  console.log("Creating trial subscription for user:", userId);

  // Use the database function to create trial subscription (bypasses RLS)
  const { data, error } = await supabase
    .rpc('create_trial_subscription', { target_user_id: userId });

  console.log("Trial subscription creation result:", { data, error });

  if (error) {
    console.error("Failed to create trial subscription:", error);
    throw error;
  }

  if (data && !data.success) {
    console.error("Trial subscription creation failed:", data.message);
    throw new Error(data.message);
  }

  console.log("Trial subscription created successfully:", data);
}

type SyncOperation = {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string; // 'completion', 'arrangement', 'address', etc.
  entityId: string;
  data: any;
  timestamp: string;
  localTimestamp: string;
  retries: number;
};

type SyncQueueEntry = {
  operation: SyncOperation;
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

type SyncMetadata = {
  lastSyncAt: string;
  deviceId: string;
  version: number;
  checksum: string;
};

type UseCloudSync = {
  user: User | null;
  isLoading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  clearError: () => void;

  signIn: (email: string, password: string) => Promise<{ user: User }>;
  signUp: (email: string, password: string) => Promise<{ user: User }>;
  signOut: () => Promise<void>;

  syncData: (state: AppState) => Promise<void>;
  subscribeToData: (onChange: Dispatch<SetStateAction<AppState>>) => () => void;
  
  // New methods for granular sync
  queueOperation: (operation: Omit<SyncOperation, 'id' | 'timestamp' | 'localTimestamp' | 'retries'>) => Promise<void>;
  forceFullSync: () => Promise<void>;
};

// Generate a consistent device ID for this browser/device
function getDeviceId(): string {
  let deviceId = localStorage.getItem('navigator_device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('navigator_device_id', deviceId);
  }
  return deviceId;
}

// Simple checksum for data integrity
function generateChecksum(data: any): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

export function mergeStatePreservingActiveIndex(
  current: AppState,
  incoming: AppState
): AppState {
  const currentListVersion =
    typeof current.currentListVersion === "number"
      ? current.currentListVersion
      : 1;
  const incomingListVersion =
    typeof incoming.currentListVersion === "number"
      ? incoming.currentListVersion
      : 1;

  const ensureListVersion = (listVersion?: number) =>
    typeof listVersion === "number"
      ? listVersion
      : Math.max(currentListVersion, incomingListVersion);

  const mergedCompletionMap = new Map<string, AppState["completions"][number]>();
  const pushCompletion = (
    completion: AppState["completions"][number] | undefined
  ) => {
    if (!completion) return;
    if (
      typeof completion.index !== "number" ||
      typeof completion.timestamp !== "string" ||
      !completion.outcome
    ) {
      return;
    }

    const normalized = {
      ...completion,
      listVersion: ensureListVersion(completion.listVersion),
    };

    const key = `${normalized.timestamp}_${normalized.index}_${normalized.outcome}`;
    const existing = mergedCompletionMap.get(key);

    if (!existing) {
      mergedCompletionMap.set(key, normalized);
      return;
    }

    // Merge extra fields (amount/arrangementId) while keeping most recent data
    const existingTime = new Date(existing.timestamp).getTime();
    const incomingTime = new Date(normalized.timestamp).getTime();

    if (incomingTime > existingTime) {
      mergedCompletionMap.set(key, {
        ...existing,
        ...normalized,
      });
      return;
    }

    mergedCompletionMap.set(key, {
      ...normalized,
      ...existing,
    });
  };

  incoming.completions?.forEach(pushCompletion);
  current.completions?.forEach(pushCompletion);

  const mergedCompletions = Array.from(mergedCompletionMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const selectAddresses = () => {
    const currentAddresses = Array.isArray(current.addresses)
      ? current.addresses
      : [];
    const incomingAddresses = Array.isArray(incoming.addresses)
      ? incoming.addresses
      : [];

    // Respect list versions - prefer higher version regardless of length
    if (incomingListVersion > currentListVersion) {
      return incomingAddresses;
    } else if (currentListVersion > incomingListVersion) {
      return currentAddresses;
    }

    // Same version - use length as tiebreaker
    return incomingAddresses.length >= currentAddresses.length
      ? incomingAddresses
      : currentAddresses;
  };

  const mergedArrangementsMap = new Map<string, AppState["arrangements"][number]>();
  const pushArrangement = (
    arrangement: AppState["arrangements"][number] | undefined
  ) => {
    if (!arrangement?.id) return;
    const existing = mergedArrangementsMap.get(arrangement.id);
    if (!existing) {
      mergedArrangementsMap.set(arrangement.id, arrangement);
      return;
    }

    const existingUpdated = new Date(existing.updatedAt).getTime();
    const candidateUpdated = new Date(arrangement.updatedAt).getTime();
    if (candidateUpdated > existingUpdated) {
      mergedArrangementsMap.set(arrangement.id, arrangement);
    }
  };

  current.arrangements?.forEach(pushArrangement);
  incoming.arrangements?.forEach(pushArrangement);

  const mergedDaySessionsMap = new Map<string, AppState["daySessions"][number]>();
  const pushDaySession = (
    session: AppState["daySessions"][number] | undefined
  ) => {
    if (!session?.date) return;
    const existing = mergedDaySessionsMap.get(session.date);
    if (!existing) {
      mergedDaySessionsMap.set(session.date, session);
      return;
    }

    const existingHasEnd = Boolean(existing.end);
    const candidateHasEnd = Boolean(session.end);

    if (!existingHasEnd && candidateHasEnd) {
      mergedDaySessionsMap.set(session.date, session);
      return;
    }

    if (existingHasEnd && candidateHasEnd) {
      const existingEnd = new Date(existing.end ?? existing.start).getTime();
      const candidateEnd = new Date(session.end ?? session.start).getTime();
      if (candidateEnd > existingEnd) {
        mergedDaySessionsMap.set(session.date, session);
      }
    }
  };

  current.daySessions?.forEach(pushDaySession);
  incoming.daySessions?.forEach(pushDaySession);

  const mergedDaySessions = Array.from(mergedDaySessionsMap.values());

  const mergedArrangements = Array.from(mergedArrangementsMap.values());

  return {
    ...incoming,
    addresses: selectAddresses(),
    completions: mergedCompletions,
    arrangements: mergedArrangements,
    daySessions: mergedDaySessions,
    currentListVersion: Math.max(currentListVersion, incomingListVersion),
    activeIndex: incoming.activeIndex ?? current.activeIndex ?? null,
  };
}

export function useCloudSync(): UseCloudSync {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Sync state tracking
  const syncMetadata = useRef<SyncMetadata>({
    lastSyncAt: '',
    deviceId: getDeviceId(),
    version: 0,
    checksum: ''
  });

  // Operation queue for offline/failed operations
  const syncQueue = useRef<SyncQueueEntry[]>([]);
  const isProcessingQueue = useRef<boolean>(false);

  // Track last successful state to avoid unnecessary syncs
  const lastSyncedState = useRef<string>('');
  
  // Subscription cleanup ref
  const subscriptionCleanup = useRef<(() => void) | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Process the sync queue
  const processSyncQueue = useCallback(async () => {
    if (!user || !supabase || !isOnline || isProcessingQueue.current || syncQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    setIsSyncing(true);

    // FIXED: Don't remove items until they're successfully processed
    const batch = syncQueue.current.slice(0, 10); // Copy first 10 items
    const processedIds = new Set<string>();
    
    try {
      for (const entry of batch) {
        try {
          const { operation } = entry;
          
          // Execute the operation on the server
          const { error: syncError } = await supabase
            .from('navigator_operations')
            .insert({
              user_id: user.id,
              operation_id: operation.id,
              type: operation.type,
              entity: operation.entity,
              entity_id: operation.entityId,
              data: operation.data,
              device_id: syncMetadata.current.deviceId,
              timestamp: operation.timestamp,
              local_timestamp: operation.localTimestamp
            });

          if (syncError) {
            // If it's a duplicate, consider it successful
            if (syncError.code !== '23505') { // unique constraint violation
              throw syncError;
            }
          }

          // Mark as successfully processed
          processedIds.add(entry.operation.id);
          entry.resolve(operation);
          
        } catch (opError: any) {
          // Increment retry count
          entry.operation.retries += 1;
          
          if (entry.operation.retries < 3) {
            // Keep in queue for retry (don't mark as processed)
            console.log(`Retrying operation ${entry.operation.id}, attempt ${entry.operation.retries}`);
          } else {
            // Max retries exceeded - remove from queue
            console.warn(`Operation ${entry.operation.id} failed after max retries:`, opError);
            processedIds.add(entry.operation.id); // Remove from queue
            entry.reject(opError);
          }
        }
      }
      
      // FIXED: Only remove successfully processed items from queue
      syncQueue.current = syncQueue.current.filter(
        entry => !processedIds.has(entry.operation.id)
      );
      
    } catch (batchError: any) {
      // Don't remove any items on batch error - they'll be retried
      console.error('Sync batch error:', batchError);
      setError(batchError?.message || 'Sync batch failed');
    } finally {
      isProcessingQueue.current = false;
      setIsSyncing(syncQueue.current.length > 0);
      
      // Continue processing if there are more items
      if (syncQueue.current.length > 0) {
        setTimeout(processSyncQueue, 1000);
      }
    }
  }, [user, isOnline]);

  // Queue an operation for sync
  const queueOperation = useCallback(async (
    operation: Omit<SyncOperation, 'id' | 'timestamp' | 'localTimestamp' | 'retries'>
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Generate a unique operation key that includes data hash to distinguish distinct operations
      const dataHash = JSON.stringify(operation.data);
      const operationKey = `${operation.type}_${operation.entity}_${operation.entityId}_${dataHash}`;

      // Only check for exact duplicate operations (same data), not just same entity
      const isDuplicate = syncQueue.current.some(entry => {
        const entryDataHash = JSON.stringify(entry.operation.data);
        const entryKey = `${entry.operation.type}_${entry.operation.entity}_${entry.operation.entityId}_${entryDataHash}`;
        return entryKey === operationKey && entry.operation.retries < 3;
      });

      if (isDuplicate) {
        console.log(`Skipping exact duplicate operation: ${operationKey}`);
        resolve(); // Resolve immediately for exact duplicates
        return;
      }
      
      const now = new Date().toISOString();
      const fullOperation: SyncOperation = {
        ...operation,
        id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        timestamp: now,
        localTimestamp: now,
        retries: 0
      };

      const entry = {
        operation: fullOperation,
        resolve,
        reject
      };

      syncQueue.current.push(entry);
      
      // Limit queue size to prevent memory issues
      if (syncQueue.current.length > 1000) {
        console.warn('Sync queue size limit reached, removing oldest entries');
        const removed = syncQueue.current.splice(0, 100);
        removed.forEach(oldEntry => {
          oldEntry.reject(new Error('Queue overflow - operation cancelled'));
        });
      }

      // Start processing if online
      if (isOnline) {
        processSyncQueue();
      }
    });
  }, [isOnline, processSyncQueue]);

  // ---- Auth bootstrap ----
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!supabase) {
          if (mounted) {
            setError("Supabase not configured");
            setIsLoading(false);
          }
          return;
        }
        const { data, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (mounted) setUser(data.user ?? null);
      } catch (e: any) {
        if (mounted) setError(e?.message || String(e));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    if (!supabase) return () => { mounted = false; };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // RACE CONDITION FIX: Check mounted flag before setting state
      if (mounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      mounted = false; // RACE CONDITION FIX: Set mounted to false on cleanup
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---- Online/offline tracking and queue processing ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleOnline = () => {
      setIsOnline(true);
      // Process queued operations when coming back online
      setTimeout(processSyncQueue, 100);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [processSyncQueue]);

  // ---- Auth helpers ----
  const signIn = useCallback(
    async (email: string, password: string) => {
      clearError();
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        throw err;
      }

      // Clear trial access flags when user properly signs in
      localStorage.removeItem('navigator_trial_created');
      localStorage.removeItem('navigator_trial_user_id');

      setUser(data.user);
      return { user: data.user! };
    },
    [clearError]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      clearError();
      if (!supabase) throw new Error("Supabase not configured");

      // First, ensure we're signed out completely to prevent session conflicts
      try {
        console.log("Pre-signup: clearing all sessions and storage...");

        // Clear all auth storage manually
        localStorage.removeItem('navigator-supabase-auth-token');
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.clear();

        // Sign out from Supabase
        await supabase.auth.signOut();

        // Clear any cached user state
        setUser(null);

        // Wait longer for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify we're signed out
        const { data: sessionCheck } = await supabase.auth.getSession();
        console.log("Session after cleanup:", sessionCheck.session);

        if (sessionCheck.session) {
          console.warn("Session still exists after cleanup, forcing removal...");
          await supabase.auth.signOut();
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (signOutError) {
        console.warn("Error during pre-signup signout:", signOutError);
      }

      console.log("Attempting signup for email:", email);
      console.log("Supabase configured:", !!supabase);

      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            signup_source: 'navigator_web'
          },
          emailRedirectTo: undefined // Disable email confirmation for immediate access
        }
      });

      console.log("Signup response data:", data);
      console.log("Signup error:", err);
      console.log("User created:", data.user?.id, data.user?.email);
      console.log("Session created:", data.session?.access_token ? "YES" : "NO");

      if (err) {
        setError(err.message);
        throw err;
      }

      if (data.user) {
        console.log("New user created:", data.user.email, "ID:", data.user.id);

        // Initialize new user with trial subscription
        try {
          await initializeNewUser(data.user.id);
          console.log("Successfully initialized new user with trial subscription");

          // Set trial access flags for unconfirmed users
          localStorage.setItem('navigator_trial_created', Date.now().toString());
          localStorage.setItem('navigator_trial_user_id', data.user.id);
          console.log("Set trial access flags for unconfirmed user");

        } catch (initError) {
          console.error("Failed to initialize new user:", initError);
          // Don't throw - user is created, just missing subscription setup
        }

        // If no session was created, try to sign in immediately to create one
        if (!data.session) {
          console.log("No session created during signup, attempting immediate signin...");
          try {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password
            });

            if (signInError) {
              console.warn("Immediate signin failed:", signInError);
            } else {
              console.log("Immediate signin successful, session created");
              setUser(signInData.user);
              return { user: signInData.user! };
            }
          } catch (signInErr) {
            console.warn("Immediate signin error:", signInErr);
          }
        }

        setUser(data.user);
      }

      return { user: data.user! };
    },
    [clearError]
  );

  const signOut = useCallback(async () => {
    clearError();
    if (subscriptionCleanup.current) {
      subscriptionCleanup.current();
      subscriptionCleanup.current = null;
    }
    if (!supabase) return;
    const { error: err } = await supabase.auth.signOut();
    if (err) {
      setError(err.message);
      throw err;
    }

    // CRITICAL: Clear all local data when signing out to prevent data leakage
    try {
      const { clear } = await import('idb-keyval');
      await clear(); // Clear IndexedDB

      // Clear specific navigator data while preserving other app localStorage
      const keysToRemove = [
        'navigator_trial_created',
        'navigator_trial_user_id',
        'navigator_last_user_id',
        'navigator_supabase_url',
        'navigator_supabase_key',
        'navigator_supabase_skipped',
        'navigator_data_counts',
        'last_backup_time'
      ];

      keysToRemove.forEach(key => localStorage.removeItem(key));
      sessionStorage.clear(); // Clear sessionStorage
      console.log("Cleared all navigator data on signout");
    } catch (clearError) {
      console.warn("Error clearing local data:", clearError);
    }

    setUser(null);
    setLastSyncTime(null);
    syncMetadata.current = {
      lastSyncAt: '',
      deviceId: getDeviceId(),
      version: 0,
      checksum: ''
    };
  }, [clearError]);

  // ---- Improved cloud sync with conflict resolution ----
  const syncData = useCallback(
    async (state: AppState) => {
      if (!user || !supabase) {
        if (!user) setError("Not authenticated");
        else setError("Supabase not configured");
        return;
      }

      const stateStr = JSON.stringify(state);
      
      // Skip if state hasn't changed
      if (stateStr === lastSyncedState.current) {
        return;
      }

      try {
        clearError();
        setIsSyncing(true);
        
        const now = new Date().toISOString();
        
        // First, get current server state for conflict resolution
        const { data: currentData, error: fetchError } = await supabase
          .from("navigator_state")
          .select("data, updated_at, version, checksum")
          .eq("user_id", user.id)
          .maybeSingle();

        if (fetchError) throw fetchError;

        let finalState = state;
        let version = syncMetadata.current.version + 1;

        // Conflict resolution if server has newer data
        if (currentData && currentData.updated_at > syncMetadata.current.lastSyncAt) {
          console.log('Conflict detected, resolving...');
          
          // Simple merge strategy: prefer local changes for recent items
          const serverState = currentData.data as AppState;
          finalState = await resolveConflicts(state, serverState);
          version = (currentData.version || 0) + 1;
        }

        const finalChecksum = generateChecksum(finalState);
        
        // Update server state with enhanced error handling
        const { data, error: err } = await supabase
          .from("navigator_state")
          .upsert({
            user_id: user.id,
            data: finalState,
            updated_at: now,
            version,
            checksum: finalChecksum,
            device_id: syncMetadata.current.deviceId
          }, { onConflict: "user_id" })
          .select("updated_at, version, checksum")
          .single();

        if (err) {
          console.error('Cloud sync database error:', err);

          // If this is a version conflict, try to refetch and resolve
          if (err.code === '23505' || err.message?.includes('conflict')) {
            console.log('Detected sync conflict, attempting resolution...');
            // Force a fresh sync on next attempt
            syncMetadata.current.lastSyncAt = '';
            syncMetadata.current.version = 0;
            throw new Error('Sync conflict detected - will retry with fresh data');
          }

          throw err;
        }

        // Update sync metadata
        syncMetadata.current = {
          lastSyncAt: data?.updated_at ?? now,
          deviceId: syncMetadata.current.deviceId,
          version: data?.version ?? version,
          checksum: data?.checksum ?? finalChecksum
        };

        lastSyncedState.current = JSON.stringify(finalState);
        setLastSyncTime(new Date(data?.updated_at ?? now));

      } catch (e: any) {
        setError(e?.message || String(e));
        console.error('Sync failed:', e);
      } finally {
        setIsSyncing(false);
      }
    },
    [user, clearError]
  );

  // Enhanced conflict resolution strategy
  const resolveConflicts = useCallback(async (localState: AppState, serverState: AppState): Promise<AppState> => {
    console.log('Resolving conflicts between local and server state');
    const resolved: AppState = { ...localState };

    // Merge completions (keep both, dedupe by timestamp + index + outcome)
    // This is the most critical data - completions represent work done
    const allCompletions = [...localState.completions, ...serverState.completions];
    const uniqueCompletions = allCompletions.filter((completion, index, arr) => {
      // More comprehensive deduplication key including list version
      const key = `${completion.timestamp}_${completion.index}_${completion.outcome}_${completion.listVersion || 1}`;
      return arr.findIndex(c =>
        `${c.timestamp}_${c.index}_${c.outcome}_${c.listVersion || 1}` === key
      ) === index;
    });
    resolved.completions = uniqueCompletions.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    console.log(`Merged completions: local=${localState.completions.length}, server=${serverState.completions.length}, resolved=${resolved.completions.length}`);

    // Merge arrangements (prefer local for recent changes, server for older)
    const allArrangements = [...localState.arrangements, ...serverState.arrangements];
    const arrangementsMap = new Map();
    
    allArrangements.forEach(arr => {
      const existing = arrangementsMap.get(arr.id);
      if (!existing || new Date(arr.updatedAt) > new Date(existing.updatedAt)) {
        arrangementsMap.set(arr.id, arr);
      }
    });
    resolved.arrangements = Array.from(arrangementsMap.values());

    // Merge day sessions (keep all unique dates)
    const allSessions = [...localState.daySessions, ...serverState.daySessions];
    const sessionsMap = new Map();
    
    allSessions.forEach(session => {
      const existing = sessionsMap.get(session.date);
      if (!existing || (session.end && !existing.end)) {
        sessionsMap.set(session.date, session);
      }
    });
    resolved.daySessions = Array.from(sessionsMap.values());

    // For addresses, prefer the longer list (assume it's more complete)
    if (serverState.addresses.length > localState.addresses.length) {
      resolved.addresses = serverState.addresses;
      resolved.currentListVersion = Math.max(localState.currentListVersion, serverState.currentListVersion);
    }

    resolved.activeIndex =
      localState.activeIndex ?? serverState.activeIndex ?? null;

    return resolved;
  }, []);

  // Force a full sync (useful for debugging or after major changes)
  const forceFullSync = useCallback(async () => {
    lastSyncedState.current = '';
    syncMetadata.current.lastSyncAt = '';
    syncMetadata.current.version = 0;
  }, []);

  // ---- Cloud subscribe (pull) with better change detection ----
  const subscribeToData = useCallback(
    (onChange: Dispatch<SetStateAction<AppState>>) => {
      if (!user || !supabase) return () => {};

      clearError();
      
      const sb = supabase as NonNullable<typeof supabase>;
      const channel = sb.channel("navigator_state_" + user.id);

      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "navigator_state", filter: `user_id=eq.${user.id}` },
        async (payload: any) => {
          try {
            const row = payload?.new ?? payload?.old ?? null;
            if (!row) return;

            const updatedAt: string = row.updated_at;
            const dataObj: AppState = row.data;
            const serverVersion: number = row.version || 0;
            const serverChecksum: string = row.checksum || '';

            // Skip our own changes
            if (row.device_id === syncMetadata.current.deviceId) {
              return;
            }

            // Skip if we've already processed this version
            if (serverVersion <= syncMetadata.current.version) {
              return;
            }

            // Verify data integrity
            const expectedChecksum = generateChecksum(dataObj);
            if (serverChecksum && serverChecksum !== expectedChecksum) {
              console.warn('Checksum mismatch, requesting full sync');
              return;
            }

            // Update our sync metadata
            syncMetadata.current.lastSyncAt = updatedAt;
            syncMetadata.current.version = serverVersion;
            syncMetadata.current.checksum = serverChecksum;

            if (typeof onChange === "function") {
              onChange(prev => {
                const merged = mergeStatePreservingActiveIndex(prev, dataObj);
                lastSyncedState.current = JSON.stringify(merged);
                return merged;
              });
            } else {
              lastSyncedState.current = JSON.stringify(dataObj);
            }
            setLastSyncTime(new Date(updatedAt));
          } catch (e: any) {
            console.warn("subscribeToData handler error:", e?.message || e);
            setError("Sync error: " + (e?.message || e));
          }
        }
      );

      channel.subscribe();

      const cleanup = () => {
        try {
          sb.removeChannel(channel);
        } catch {
          // ignore
        }
      };

      subscriptionCleanup.current = cleanup;
      return cleanup;
    },
    [user, clearError]
  );

  return useMemo<UseCloudSync>(
    () => ({
      user,
      isLoading,
      isOnline,
      isSyncing,
      error,
      lastSyncTime,
      clearError,
      signIn,
      signUp,
      signOut,
      syncData,
      subscribeToData,
      queueOperation,
      forceFullSync,
    }),
    [user, isLoading, isOnline, isSyncing, error, lastSyncTime, clearError, signIn, signUp, signOut, syncData, subscribeToData, queueOperation, forceFullSync]
  );
}

export default useCloudSync;
