// src/useCloudSync.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";
import type { AppState } from "./types";

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
  subscribeToData: (onChange: (s: AppState) => void) => () => void;
  
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

  // Queue an operation for sync with duplicate detection
  const queueOperation = useCallback(async (
    operation: Omit<SyncOperation, 'id' | 'timestamp' | 'localTimestamp' | 'retries'>
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check for duplicate operations based on entity and entityId
      const duplicateKey = `${operation.type}_${operation.entity}_${operation.entityId}`;
      const isDuplicate = syncQueue.current.some(entry => 
        `${entry.operation.type}_${entry.operation.entity}_${entry.operation.entityId}` === duplicateKey &&
        entry.operation.retries < 3 // Only consider active operations
      );
      
      if (isDuplicate) {
        console.log(`Skipping duplicate operation: ${duplicateKey}`);
        resolve(); // Resolve immediately for duplicates
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

    if (!supabase) return () => {};

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
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
      setUser(data.user);
      return { user: data.user! };
    },
    [clearError]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      clearError();
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
        throw err;
      }
      if (data.user) setUser(data.user);
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
        
        // Update server state
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

        if (err) throw err;

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

  // Basic conflict resolution strategy
  const resolveConflicts = useCallback(async (localState: AppState, serverState: AppState): Promise<AppState> => {
    const resolved: AppState = { ...localState };
    
    // Merge completions (keep both, dedupe by timestamp + index)
    const allCompletions = [...localState.completions, ...serverState.completions];
    const uniqueCompletions = allCompletions.filter((completion, index, arr) => {
      const key = `${completion.timestamp}_${completion.index}_${completion.outcome}`;
      return arr.findIndex(c => `${c.timestamp}_${c.index}_${c.outcome}` === key) === index;
    });
    resolved.completions = uniqueCompletions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

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
    (onChange: (s: AppState) => void) => {
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

            lastSyncedState.current = JSON.stringify(dataObj);
            setLastSyncTime(new Date(updatedAt));

            if (typeof onChange === "function") {
              onChange(dataObj);
            }
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
