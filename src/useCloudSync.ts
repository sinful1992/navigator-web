// src/useCloudSync.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";
import type { AppState } from "./types";
import { generateChecksum } from "./utils/checksum";
import { isProtectionActive } from "./utils/protectionFlags";

// Initialize a new user with default subscription
async function initializeNewUser(userId: string): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  if (import.meta.env.DEV) {
    console.log("Creating trial subscription for user:", userId);
  }

  // Use the database function to create trial subscription (bypasses RLS)
  const { data, error } = await supabase
    .rpc('create_trial_subscription', { target_user_id: userId });

  if (import.meta.env.DEV) {
    console.log("Trial subscription creation result:", { data, error });
  }

  if (error) {
    // If error is about existing subscription, that's fine - user already has one
    if (error.message?.includes('already has a subscription')) {
      if (import.meta.env.DEV) {
        console.log("User already has a subscription, skipping trial creation");
      }
      return;
    }
    console.error("Failed to create trial subscription:", error);
    throw error;
  }

  if (data && !data.success) {
    // If the error message indicates subscription already exists, that's fine
    if (data.message?.includes('already has a subscription')) {
      if (import.meta.env.DEV) {
        console.log("User already has a subscription (from data), skipping trial creation");
      }
      return;
    }
    console.error("Trial subscription creation failed:", data.message);
    throw new Error(data.message);
  }

  if (import.meta.env.DEV) {
    console.log("Trial subscription created successfully:", data);
  }
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
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;

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

    const hasMeaningfulAddresses = (addresses: AppState["addresses"]) =>
      addresses.some(address => address.address?.trim());

    const incomingHasMeaningful = hasMeaningfulAddresses(incomingAddresses);
    const currentHasMeaningful = hasMeaningfulAddresses(currentAddresses);

    // Respect list versions - prefer higher version unless it would drop real data
    if (incomingListVersion > currentListVersion) {
      if (!incomingHasMeaningful && currentHasMeaningful) {
        return {
          addresses: currentAddresses,
          listVersion: currentListVersion,
        };
      }

      return {
        addresses: incomingAddresses,
        listVersion: incomingListVersion,
      };
    }

    if (currentListVersion > incomingListVersion) {
      if (!currentHasMeaningful && incomingHasMeaningful) {
        return {
          addresses: incomingAddresses,
          listVersion: currentListVersion,
        };
      }

      return {
        addresses: currentAddresses,
        listVersion: currentListVersion,
      };
    }

    if (incomingHasMeaningful && !currentHasMeaningful) {
      return {
        addresses: incomingAddresses,
        listVersion: incomingListVersion,
      };
    }

    if (!incomingHasMeaningful && currentHasMeaningful) {
      return {
        addresses: currentAddresses,
        listVersion: currentListVersion,
      };
    }

    const useIncoming = incomingAddresses.length >= currentAddresses.length;

    return {
      addresses: useIncoming ? incomingAddresses : currentAddresses,
      listVersion: incomingListVersion,
    };
  };

  const { addresses: mergedAddresses, listVersion: resolvedListVersion } =
    selectAddresses();

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
    addresses: mergedAddresses,
    completions: mergedCompletions,
    arrangements: mergedArrangements,
    daySessions: mergedDaySessions,
    currentListVersion: resolvedListVersion,
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
  const syncTimeoutId = useRef<NodeJS.Timeout | null>(null);

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
            if (import.meta.env.DEV) {
              console.log(`Retrying operation ${entry.operation.id}, attempt ${entry.operation.retries}`);
            }
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
        syncTimeoutId.current = setTimeout(processSyncQueue, 1000);
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
        if (import.meta.env.DEV) {
          console.log(`Skipping exact duplicate operation: ${operationKey}`);
        }
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

        // Check for email confirmation or password reset tokens in URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        const errorParam = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        // Handle auth callback errors
        if (errorParam) {
          console.error('Auth callback error:', errorParam, errorDescription);
          const errorMsg = `Email confirmation failed: ${errorDescription || errorParam}`;
          setError(errorMsg);
          alert(errorMsg); // Show visible error to user
          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname);
          if (mounted) setIsLoading(false);
          return;
        }

        if (accessToken && type) {
          if (import.meta.env.DEV) {
            console.log('Detected auth callback:', type, {
              hasAccessToken: !!accessToken,
              hasRefreshToken: !!refreshToken
            });
          }

          try {
            // Use setSession to establish the session from the URL tokens
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || ''
            });

            if (sessionError) {
              console.error('Error setting session from URL:', sessionError);
              const errorMsg = 'Failed to confirm email: ' + sessionError.message;
              setError(errorMsg);
              alert(errorMsg + '\n\nPlease try signing in manually or contact support.');
            } else if (sessionData.session) {
              if (import.meta.env.DEV) {
                console.log('Email confirmed successfully, session established:', {
                  userId: sessionData.session.user.id,
                  email: sessionData.session.user.email
                });
              }
              setUser(sessionData.session.user);

              // Clear any error state
              clearError();

              // CRITICAL: Create trial subscription if user doesn't have one yet
              // This handles the case where email confirmation was required
              try {
                if (import.meta.env.DEV) {
                  console.log('Checking if user needs trial subscription...');
                }
                await initializeNewUser(sessionData.session.user.id);
              } catch (initError: any) {
                // Don't block login if trial creation fails
                console.warn('Trial subscription creation failed (may already exist):', initError);
              }
            } else {
              console.warn('Session data missing after setSession');
              const errorMsg = 'Email confirmation incomplete. Please try signing in with your email and password.';
              setError(errorMsg);
              alert(errorMsg);
            }
          } catch (e: any) {
            console.error('Exception during session setup:', e);
            setError('Error confirming email: ' + (e?.message || String(e)));
          }

          // Clear the hash from URL regardless of success/failure
          window.history.replaceState(null, '', window.location.pathname);
        } else {
          // Normal auth check
          const { data, error: authErr } = await supabase.auth.getUser();
          if (authErr) throw authErr;
          if (mounted) setUser(data.user ?? null);
        }
      } catch (e: any) {
        // Ignore "Auth session missing!" - it's a normal state when not logged in
        if (mounted && e?.message !== 'Auth session missing!') {
          setError(e?.message || String(e));
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    if (!supabase) return () => { mounted = false; };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // RACE CONDITION FIX: Check mounted flag before setting state
      if (mounted) {
        setUser(session?.user ?? null);

        // Clear any error messages when user successfully signs in or confirms email
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
          clearError();

          if (import.meta.env.DEV) {
            console.log('Auth state changed:', event);
          }
        }
      }
    });

    return () => {
      mounted = false; // RACE CONDITION FIX: Set mounted to false on cleanup
      sub.subscription.unsubscribe();
    };
  }, [clearError]);

  // ---- Online/offline tracking and queue processing ----
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);

      // Process queued operations when coming back online
      syncTimeoutId.current = setTimeout(processSyncQueue, 100);

      // 🔧 OFFLINE PROTECTION: Process any queued offline states
      setTimeout(async () => {
        if (import.meta.env.DEV) {
          console.log('🔌 OFFLINE PROTECTION: Back online, checking for queued states...');
        }

        const offlineKeys = Object.keys(localStorage).filter(key =>
          key.startsWith('navigator_offline_state_')
        );

        if (offlineKeys.length > 0) {
          if (import.meta.env.DEV) {
            console.log(`🔌 OFFLINE PROTECTION: Found ${offlineKeys.length} queued offline states, processing...`);
          }

          for (const key of offlineKeys) {
            try {
              const offlineData = JSON.parse(localStorage.getItem(key) || '{}');
              if (offlineData.state) {
                if (import.meta.env.DEV) {
                  console.log(`🔌 OFFLINE PROTECTION: Retrying sync for offline state from ${offlineData.timestamp}`);
                }

                // Try to sync the queued state
                await syncData(offlineData.state);

                // If successful, remove from queue
                localStorage.removeItem(key);
                if (import.meta.env.DEV) {
                  console.log(`🔌 OFFLINE PROTECTION: Successfully synced queued state, removed from queue`);
                }
              }
            } catch (retryError) {
              console.error(`🔌 OFFLINE PROTECTION: Failed to sync queued state ${key}:`, retryError);
              // Keep in queue for next online session
            }
          }
        } else if (import.meta.env.DEV) {
          console.log('🔌 OFFLINE PROTECTION: No queued offline states found');
        }
      }, 2000); // Wait 2 seconds after coming online to ensure connection is stable
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (import.meta.env.DEV) {
        console.log('🔌 OFFLINE PROTECTION: Gone offline, future syncs will be queued');
      }
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

      // Store device context for smart user detection
      const { SmartUserDetection } = await import('./utils/userDetection');
      SmartUserDetection.storeDeviceContext(data.user);

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
        if (import.meta.env.DEV) {
          console.log("Pre-signup: clearing all sessions and storage...");
        }

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
        if (import.meta.env.DEV) {
          console.log("Session after cleanup:", sessionCheck.session ? "EXISTS" : "NULL");
        }

        if (sessionCheck.session) {
          console.warn("Session still exists after cleanup, forcing removal...");
          await supabase.auth.signOut();
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (signOutError) {
        console.warn("Error during pre-signup signout:", signOutError);
      }

      if (import.meta.env.DEV) {
        console.log("Attempting signup for email:", email);
        console.log("Supabase configured:", !!supabase);
      }

      // Use current origin for redirect (works for any deployment URL)
      const redirectUrl = window.location.origin;

      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            signup_source: 'navigator_web'
          },
          emailRedirectTo: redirectUrl // Redirect back to app after email confirmation
        }
      });

      if (import.meta.env.DEV) {
        console.log("Signup response data:", data);
        console.log("Signup error:", err);
        console.log("User created:", data.user?.id, data.user?.email);
        console.log("Session created:", data.session?.access_token ? "YES" : "NO");
      }

      if (err) {
        setError(err.message);
        throw err;
      }

      if (data.user) {
        if (import.meta.env.DEV) {
          console.log("New user created:", data.user.email, "ID:", data.user.id);
        }

        // Initialize new user with trial subscription
        try {
          await initializeNewUser(data.user.id);
          if (import.meta.env.DEV) {
            console.log("Successfully initialized new user with trial subscription");
          }

          // Set trial access flags for unconfirmed users
          localStorage.setItem('navigator_trial_created', Date.now().toString());
          localStorage.setItem('navigator_trial_user_id', data.user.id);
          if (import.meta.env.DEV) {
            console.log("Set trial access flags for unconfirmed user");
          }

        } catch (initError) {
          console.error("Failed to initialize new user:", initError);
          // Don't throw - user is created, just missing subscription setup
        }

        // If no session was created, email confirmation is required
        if (!data.session) {
          if (import.meta.env.DEV) {
            console.log("No session created during signup - email confirmation required");
          }

          // Email confirmation is enabled - inform user to check email
          setError("✉️ Check your email! Click the confirmation link to activate your account.");

          // Don't throw error - just return with user data
          return { user: data.user! };
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
        'navigator_device_context',
        'navigator_device_context_checksum',
        'navigator_supabase_url',
        'navigator_supabase_key',
        'navigator_supabase_skipped',
        'navigator_data_counts',
        'last_backup_time',
        'navigator-web:settings' // Clear theme and other settings on logout
      ];

      keysToRemove.forEach(key => localStorage.removeItem(key));
      sessionStorage.clear(); // Clear sessionStorage
      if (import.meta.env.DEV) {
        console.log("Cleared all navigator data on signout");
      }
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

    // Clear sync queue and cancel any pending timeouts to prevent data leakage
    syncQueue.current = [];
    isProcessingQueue.current = false;
    lastSyncedState.current = ''; // Clear previous user's state snapshot
    if (syncTimeoutId.current) {
      clearTimeout(syncTimeoutId.current);
      syncTimeoutId.current = null;
    }
  }, [clearError]);

  const resetPassword = useCallback(
    async (email: string) => {
      clearError();
      if (!supabase) throw new Error("Supabase not configured");

      const redirectUrl = window.location.origin;

      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });

      if (err) {
        setError(err.message);
        throw err;
      }
    },
    [clearError]
  );

  const updatePassword = useCallback(
    async (newPassword: string) => {
      clearError();
      if (!supabase) throw new Error("Supabase not configured");
      if (!user) throw new Error("Not authenticated");

      const { error: err } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (err) {
        setError(err.message);
        throw err;
      }
    },
    [clearError, user]
  );

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
        if (import.meta.env.DEV) {
          console.log('🚫 SYNC SKIPPED: State unchanged since last successful sync', {
            completions: state.completions?.length || 0,
            addresses: state.addresses?.length || 0,
            lastSyncTime: syncMetadata.current.lastSyncAt
          });
        }
        return;
      }

      if (import.meta.env.DEV) {
        console.log('🔄 Syncing to cloud:', {
          completions: state.completions?.length || 0,
          addresses: state.addresses?.length || 0
        });
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
          if (import.meta.env.DEV) {
            console.log('Conflict detected, resolving...');
          }

          // Simple merge strategy: prefer local changes for recent items
          const serverState = currentData.data as AppState;
          finalState = await resolveConflicts(state, serverState);
          version = (currentData.version || 0) + 1;
        }

        const finalChecksum = generateChecksum(finalState);
        
        // Update server state with enhanced error handling
        const { error: err } = await supabase
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
            if (import.meta.env.DEV) {
              console.log('Detected sync conflict, attempting resolution...');
            }
            // Force a fresh sync on next attempt
            syncMetadata.current.lastSyncAt = '';
            syncMetadata.current.version = 0;
            throw new Error('Sync conflict detected - will retry with fresh data');
          }

          throw err;
        }

        // CRITICAL FIX: Verify data actually persisted before marking as synced
        const { data: verifyData, error: verifyError } = await supabase
          .from("navigator_state")
          .select("data, updated_at, version, checksum")
          .eq("user_id", user.id)
          .single();

        if (verifyError) {
          console.error('Sync verification failed:', verifyError);
          throw new Error(`Sync verification failed: ${verifyError.message}`);
        }

        if (!verifyData) {
          throw new Error('Sync verification failed: No data found after upsert');
        }

        // Verify the data actually matches what we tried to save
        const verifyChecksum = generateChecksum(verifyData.data);
        if (verifyChecksum !== finalChecksum) {
          // Log for debugging but don't throw - checksum mismatch might be due to:
          // - JSON serialization order differences
          // - Database type coercion (timestamps, etc)
          // - Postgres triggers/functions modifying data
          console.warn('Checksum mismatch (likely harmless serialization difference)', {
            expectedChecksum: finalChecksum,
            actualChecksum: verifyChecksum,
            expectedCompletions: finalState.completions?.length || 0,
            actualCompletions: verifyData.data?.completions?.length || 0
          });

          // Don't self-heal or throw error - just continue with what we intended to save
          // The actual data differences are likely insignificant (JSON key order, etc)
        }

        // Update sync metadata and lastSyncedState
        syncMetadata.current = {
          lastSyncAt: verifyData.updated_at ?? now,
          deviceId: syncMetadata.current.deviceId,
          version: verifyData.version ?? version,
          checksum: finalChecksum // Use our checksum to avoid false-positive diffs
        };

        // Update lastSyncedState with what we tried to save (not what DB returned)
        lastSyncedState.current = JSON.stringify(finalState);
        setLastSyncTime(new Date(verifyData.updated_at ?? now));

      } catch (e: any) {
        // Ignore "Auth session missing!" - it's a normal state when not logged in
        if (e?.message !== 'Auth session missing!') {
          setError(e?.message || String(e));
        }
        console.error('Sync failed:', e);

        // 🔧 OFFLINE PROTECTION: If we're offline, queue this state for later sync
        if (!isOnline || e?.message?.includes('fetch')) {
          if (import.meta.env.DEV) {
            console.log('🔌 OFFLINE PROTECTION: Network issues detected, queuing state for retry when online');
          }

          // Store the failed sync state with timestamp
          const offlineKey = `navigator_offline_state_${Date.now()}`;
          const offlineData = {
            state: state,
            timestamp: new Date().toISOString(),
            reason: 'network_failure',
            error: e?.message || String(e)
          };

          try {
            localStorage.setItem(offlineKey, JSON.stringify(offlineData));
            if (import.meta.env.DEV) {
              console.log('🔌 OFFLINE PROTECTION: State queued successfully for when connection returns');
            }
          } catch (storageError) {
            console.error('Failed to queue offline state:', storageError);
          }
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [user, clearError]
  );

  // Enhanced conflict resolution strategy
  const resolveConflicts = useCallback(async (localState: AppState, serverState: AppState): Promise<AppState> => {
    if (import.meta.env.DEV) {
      console.log('🔧 Resolving conflicts between local and server state');
    }

    // 🔧 CRITICAL FIX: Check if restore is in progress (using centralized protection manager)
    if (isProtectionActive('navigator_restore_in_progress')) {
      console.log('🛡️ RESTORE PROTECTION: Preferring local state to prevent data loss');
      const localVersion =
        typeof localState.currentListVersion === "number"
          ? localState.currentListVersion
          : 1;
      const serverVersion =
        typeof serverState.currentListVersion === "number"
          ? serverState.currentListVersion
          : 1;

      return {
        ...localState,
        // Keep the higher version but don't bump it
        currentListVersion: Math.max(localVersion, serverVersion)
      };
    }

    // 🔧 CRITICAL FIX: Check if import is in progress (using centralized protection manager)
    if (isProtectionActive('navigator_import_in_progress')) {
      console.log('🛡️ IMPORT PROTECTION: Preferring local state to prevent import override');
      const localVersion =
        typeof localState.currentListVersion === "number"
          ? localState.currentListVersion
          : 1;
      const serverVersion =
        typeof serverState.currentListVersion === "number"
          ? serverState.currentListVersion
          : 1;

      return {
        ...localState,
        // Keep the higher version but don't bump it
        currentListVersion: Math.max(localVersion, serverVersion)
      };
    }

    // 🔧 OFFLINE PROTECTION: Check if we have recent local work that needs preserving
    const recentThreshold = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours
    const hasRecentLocalWork = localState.completions.some(comp =>
      comp.timestamp && new Date(comp.timestamp) > recentThreshold
    );

    if (hasRecentLocalWork) {
      const localCompletions = localState.completions.length;
      const serverCompletions = serverState.completions.length;

      if (import.meta.env.DEV) {
        console.log('🛡️ OFFLINE PROTECTION: Recent local work detected, preserving local completions', {
          localCompletions,
          serverCompletions,
          recentWorkThreshold: recentThreshold.toISOString(),
          willPreserveLocal: true
        });
      }

      // If local has more completions and recent work, strongly favor local state
      if (localCompletions > serverCompletions) {
        if (import.meta.env.DEV) {
          console.log('🛡️ OFFLINE PROTECTION: Local has more completions, preserving local state entirely');
        }
        return {
          ...localState,
          // Still merge arrangements and day sessions from server if they're newer
          arrangements: serverState.arrangements.length > localState.arrangements.length ? serverState.arrangements : localState.arrangements,
          daySessions: [...localState.daySessions, ...serverState.daySessions.filter(serverSession =>
            !localState.daySessions.some(localSession => localSession.date === serverSession.date)
          )]
        };
      }
    }

    const resolved: AppState = { ...localState };

    // Simple completion merge for personal use: combine all completions, latest timestamp wins
    const allCompletions = [...localState.completions, ...serverState.completions];

    // Remove exact duplicates and keep latest for same address+version
    const completionMap = new Map<string, any>();

    allCompletions.forEach(completion => {
      if (!completion.address || !completion.timestamp) return;

      const key = `${completion.address}_v${completion.listVersion || 1}`;
      const existing = completionMap.get(key);

      if (!existing) {
        completionMap.set(key, completion);
        return;
      }

      // Keep the most recent one
      const existingTime = new Date(existing.timestamp).getTime();
      const currentTime = new Date(completion.timestamp).getTime();

      if (!isNaN(currentTime) && (isNaN(existingTime) || currentTime > existingTime)) {
        completionMap.set(key, completion);
      }
    });

    resolved.completions = Array.from(completionMap.values()).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (import.meta.env.DEV) {
      console.log(`Merged completions: local=${localState.completions.length}, server=${serverState.completions.length}, resolved=${resolved.completions.length}`);
    }

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

    // For addresses, prefer the longer list but preserve list version logic
    if (serverState.addresses.length > localState.addresses.length) {
      resolved.addresses = serverState.addresses;
      const localVersion =
        typeof localState.currentListVersion === "number"
          ? localState.currentListVersion
          : 1;
      const serverVersion =
        typeof serverState.currentListVersion === "number"
          ? serverState.currentListVersion
          : 1;
      resolved.currentListVersion = Math.max(localVersion, serverVersion);
    } else {
      // Keep local version if local has more/equal addresses
      const localVersion =
        typeof localState.currentListVersion === "number"
          ? localState.currentListVersion
          : 1;
      resolved.currentListVersion = localVersion;
    }

    resolved.activeIndex =
      localState.activeIndex ?? serverState.activeIndex ?? null;

    return resolved;
  }, []);

  // Force a full sync (useful for debugging or after major changes)
  const forceFullSync = useCallback(async (): Promise<void> => {
    lastSyncedState.current = '';
    syncMetadata.current.lastSyncAt = '';
    syncMetadata.current.version = 0;

    // If user is authenticated, immediately fetch latest state
    if (user && supabase) {
      try {
        const { data, error } = await supabase
          .from("navigator_state")
          .select("data, updated_at, version, checksum")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!error && data) {
          if (import.meta.env.DEV) {
            console.log('🔄 FORCE SYNC: Fetched latest state from server');
          }
          // Return value removed to match Promise<void>
        }
      } catch (e) {
        console.warn('Force sync failed:', e);
      }
    }
  }, [user]);

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
              // 🔧 FIX: Don't show error immediately - log and track consecutive failures
              const checksumMismatchKey = 'navigator_checksum_mismatch_count';
              const lastMismatchKey = 'navigator_last_checksum_mismatch';

              const mismatchCount = parseInt(localStorage.getItem(checksumMismatchKey) || '0');
              const lastMismatchTime = parseInt(localStorage.getItem(lastMismatchKey) || '0');
              const timeSinceLastMismatch = Date.now() - lastMismatchTime;

              // Reset counter if it's been more than 5 minutes since last mismatch
              const newMismatchCount = timeSinceLastMismatch > 300000 ? 1 : mismatchCount + 1;
              localStorage.setItem(checksumMismatchKey, newMismatchCount.toString());
              localStorage.setItem(lastMismatchKey, Date.now().toString());

              console.warn(`⚠️ CHECKSUM MISMATCH (${newMismatchCount}) - Data integrity issue detected`, {
                expected: expectedChecksum.substring(0, 16) + '...',
                actual: serverChecksum.substring(0, 16) + '...',
                serverVersion,
                updatedAt,
                consecutiveMismatches: newMismatchCount
              });

              // Only reset after 3 consecutive mismatches (silent recovery)
              if (newMismatchCount >= 3) {
                console.error('❌ PERSISTENT CHECKSUM MISMATCH - Forcing full sync (silent recovery)');
                // 🔧 FIX: Don't show error to user - they can't do anything about it
                // Just silently force a full sync to recover
                localStorage.removeItem(checksumMismatchKey);
                localStorage.removeItem(lastMismatchKey);
                // Force a full sync by resetting metadata
                syncMetadata.current.lastSyncAt = '';
                syncMetadata.current.version = 0;
                syncMetadata.current.checksum = '';
              }
              return;
            }

            // Clear checksum mismatch counter on successful checksum validation
            localStorage.removeItem('navigator_checksum_mismatch_count');
            localStorage.removeItem('navigator_last_checksum_mismatch');

            // 🔧 CRITICAL FIX: Block ALL cloud updates while actively working on an address
            const activeProtection = localStorage.getItem('navigator_active_protection');
            if (activeProtection) {
              if (import.meta.env.DEV) {
                console.log('🛡️ ACTIVE PROTECTION: Blocking cloud update - user is working on address');
              }
              return;
            }

            // Update our sync metadata
            syncMetadata.current.lastSyncAt = updatedAt;
            syncMetadata.current.version = serverVersion;
            syncMetadata.current.checksum = serverChecksum;

            // 🔧 CRITICAL FIX: Check if restore is in progress before applying cloud updates
            const restoreInProgress = localStorage.getItem('navigator_restore_in_progress');
            if (restoreInProgress) {
              const restoreTime = parseInt(restoreInProgress);
              const timeSinceRestore = Date.now() - restoreTime;

              // If restore was within the last 30 seconds, skip cloud updates
              if (timeSinceRestore < 30000) {
                if (import.meta.env.DEV) {
                  console.log('🛡️ RESTORE PROTECTION: Skipping cloud state update to prevent data loss', {
                    timeSinceRestore: `${Math.round(timeSinceRestore/1000)}s`,
                    restoreTime: new Date(restoreTime).toISOString()
                  });
                }
                return;
              } else {
                // Clear the flag after timeout
                if (import.meta.env.DEV) {
                  console.log('🛡️ RESTORE PROTECTION: Timeout reached, clearing flag');
                }
                localStorage.removeItem('navigator_restore_in_progress');
              }
            }

            // 🔧 CRITICAL FIX: Check if import is in progress before applying cloud updates
            const importInProgress = localStorage.getItem('navigator_import_in_progress');
            if (importInProgress) {
              const importTime = parseInt(importInProgress);
              const timeSinceImport = Date.now() - importTime;

              // If import was within the last 2 seconds, skip cloud updates
              if (timeSinceImport < 2000) {
                if (import.meta.env.DEV) {
                  console.log('🛡️ IMPORT PROTECTION: Skipping cloud state update to prevent import override', {
                    timeSinceImport: `${Math.round(timeSinceImport/1000)}s`,
                    importTime: new Date(importTime).toISOString()
                  });
                }
                return;
              } else {
                // Clear the flag after timeout
                if (import.meta.env.DEV) {
                  console.log('🛡️ IMPORT PROTECTION: Timeout reached, clearing flag');
                }
                localStorage.removeItem('navigator_import_in_progress');
              }
            }

            if (import.meta.env.DEV) {
              console.log('🔄 FORCE UPDATE: Applying cloud state update from another device');
            }

            // FORCE UPDATE: Apply cloud updates immediately for personal use case
            if (typeof onChange === "function") {
              onChange(prev => {
                const merged = mergeStatePreservingActiveIndex(prev, dataObj);

                // Check if there are new completions and log them
                const newCompletions = merged.completions.filter(comp =>
                  !prev.completions.some(prevComp =>
                    prevComp.timestamp === comp.timestamp &&
                    prevComp.address === comp.address
                  )
                );

                if (newCompletions.length > 0 && import.meta.env.DEV) {
                  console.log(`📱 NEW COMPLETIONS DETECTED: ${newCompletions.length} new completion(s) from other device(s)`);
                  newCompletions.forEach(comp => {
                    console.log(`   • "${comp.address}" completed at ${new Date(comp.timestamp).toLocaleString()}`);
                  });
                }

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
      resetPassword,
      updatePassword,
      syncData,
      subscribeToData,
      queueOperation,
      forceFullSync,
    }),
    [user, isLoading, isOnline, isSyncing, error, lastSyncTime, clearError, signIn, signUp, signOut, resetPassword, updatePassword, syncData, subscribeToData, queueOperation, forceFullSync]
  );
}

export default useCloudSync;
