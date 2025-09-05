// src/useCloudSync.ts
import * as React from "react";
import { supabase } from "./lib/supabaseClient";

// ---- Types for the external API your App already uses ----
type CloudState = {
  user: { id: string; email?: string | null } | null;
  isLoading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  error: string | null;
  lastSyncTime: Date | null;
};

type SubscribeFn = (cloudData: unknown | null) => void;

type UseCloudSyncApi = CloudState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;

  /** Upload the entire app state (replace on the server; no merge). */
  syncData: (data: unknown) => Promise<void>;

  /** Subscribe to changes for this user. Returns unsubscribe function. */
  subscribeToData: (fn: SubscribeFn) => () => void;

  /** Force re-upload of the current state (same as syncData from UI flow). */
  forceFullSync: () => Promise<void>;

  /** Optional granular op queue — safe no-op if you don’t use it. */
  queueOperation?: (op: {
    type: "create" | "update" | "delete";
    entity: "completion" | "arrangement" | "address" | "session";
    entityId?: string;
    data?: any;
  }) => Promise<void>;
};

type NavRow = {
  user_id: string;
  data: unknown;
  version?: number | null;
  updated_at?: string | null;
};

const TABLE = "navigator_state";

// ---- Newer-wins guards shared across hook instances ----
const lastPushedUpdatedAtRef: { current: string | null } = { current: null };
const lastPushedVersionRef: { current: number } = { current: 1 };
const lastPushedJSONRef: { current: string | null } = { current: null };

export function useCloudSync(): UseCloudSyncApi {
  const [state, setState] = React.useState<CloudState>({
    user: null,
    isLoading: true,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    error: null,
    lastSyncTime: null,
  });

  // ---- auth bootstrap (null-safe) ----
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const sb = supabase;
      if (!sb) {
        // No Supabase configured; mark as loaded, keep user null.
        if (!cancelled) setState((s) => ({ ...s, isLoading: false }));
        return;
      }
      try {
        const { data } = await sb.auth.getUser();
        if (!cancelled) {
          const u = data?.user ? { id: data.user.id, email: data.user.email } : null;
          setState((s) => ({ ...s, user: u, isLoading: false }));
        }
      } catch (e: any) {
        if (!cancelled) {
          setState((s) => ({ ...s, error: e?.message || String(e), isLoading: false }));
        }
      }
    })();

    // realtime auth changes
    const sb = supabase;
    if (!sb) return () => {}; // nothing to unsubscribe
    const { data: sub } = sb.auth.onAuthStateChange((_ev, sess) => {
      const u = sess?.user ? { id: sess.user.id, email: sess.user.email } : null;
      setState((s) => ({ ...s, user: u }));
    });

    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // ---- online/offline ----
  React.useEffect(() => {
    const onUp = () => setState((s) => ({ ...s, isOnline: true }));
    const onDown = () => setState((s) => ({ ...s, isOnline: false }));
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  const clearError = React.useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const sb = supabase;
    if (!sb) {
      setState((s) => ({ ...s, error: "Supabase not configured" }));
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setState((s) => ({ ...s, isLoading: false, error: error.message }));
      return;
    }
    const { data } = await sb.auth.getUser();
    const u = data?.user ? { id: data.user.id, email: data.user.email } : null;
    setState((s) => ({ ...s, user: u, isLoading: false, error: null }));
  }, []);

  const signUp = React.useCallback(async (email: string, password: string) => {
    const sb = supabase;
    if (!sb) {
      setState((s) => ({ ...s, error: "Supabase not configured" }));
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const { error } = await sb.auth.signUp({ email, password });
    if (error) {
      setState((s) => ({ ...s, isLoading: false, error: error.message }));
      return;
    }
    const { data } = await sb.auth.getUser();
    const u = data?.user ? { id: data.user.id, email: data.user.email } : null;
    setState((s) => ({ ...s, user: u, isLoading: false, error: null }));
  }, []);

  const signOut = React.useCallback(async () => {
    const sb = supabase;
    if (!sb) return;
    await sb.auth.signOut();
    setState((s) => ({ ...s, user: null }));
  }, []);

  // ---- core sync: REPLACE remote with full local snapshot (null-safe) ----
  const syncData = React.useCallback(
    async (data: unknown) => {
      if (!state.user) return;
      const sb = supabase;
      if (!sb) {
        setState((s) => ({ ...s, error: "Supabase not configured" }));
        return;
      }
      try {
        setState((s) => ({ ...s, isSyncing: true, error: null }));

        // Extract version if present
        let version = 1;
        try {
          const sv: any = data;
          if (sv && typeof sv === "object" && typeof sv.currentListVersion === "number") {
            version = sv.currentListVersion as number;
          }
        } catch {
          // ignore
        }

        const { data: up, error } = await sb
          .from(TABLE)
          .upsert(
            {
              user_id: state.user.id,
              data,
              version,
            } as NavRow,
            { onConflict: "user_id" }
          )
          .select("updated_at,version,data")
          .single();

        if (error) throw error;

        const updatedAt = (up as any)?.updated_at ?? null;
        if (updatedAt) {
          lastPushedUpdatedAtRef.current = updatedAt;
        }
        lastPushedVersionRef.current =
          typeof up?.version === "number" ? (up!.version as number) : version;
        lastPushedJSONRef.current = JSON.stringify(up?.data ?? data);

        setState((s) => ({ ...s, isSyncing: false, lastSyncTime: new Date() }));
      } catch (e: any) {
        setState((s) => ({ ...s, isSyncing: false, error: e?.message || String(e) }));
      }
    },
    [state.user]
  );

  // ---- subscribe with newer-wins guards (null-safe) ----
  const subscribeToData = React.useCallback(
    (fn: SubscribeFn) => {
      if (!state.user) return () => {};
      const sb = supabase;
      if (!sb) return () => {};

      let disposed = false;

      const fetchRow = async (): Promise<NavRow | null> => {
        const { data, error } = await sb
          .from(TABLE)
          .select("data,version,updated_at")
          .eq("user_id", state.user!.id)
          .maybeSingle<NavRow>();
        if (error) {
          setState((s) => ({ ...s, error: error.message }));
          return null;
        }
        return (data as any) || null;
      };

      const channel = sb
        .channel(`realtime:${TABLE}:${state.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: TABLE,
            filter: `user_id=eq.${state.user.id}`,
          },
          async () => {
            if (disposed) return;
            const row = await fetchRow();
            if (!row) return;

            const incomingJSON = JSON.stringify(row.data ?? null);
            const incomingVer = typeof row.version === "number" ? row.version : 1;
            const incomingUpdatedAt = row.updated_at ?? null;

            // Guard 1: version must be >= our last pushed version
            if (incomingVer < (lastPushedVersionRef.current || 1)) {
              return;
            }

            // Guard 2: updated_at must be >= our last write
            if (
              lastPushedUpdatedAtRef.current &&
              incomingUpdatedAt &&
              new Date(incomingUpdatedAt).getTime() <
                new Date(lastPushedUpdatedAtRef.current).getTime()
            ) {
              return;
            }

            // Guard 3: exact echo? ignore
            if (incomingJSON === lastPushedJSONRef.current) {
              return;
            }

            fn(row.data ?? null);
          }
        )
        .subscribe(() => {
          // no-op; avoid unused var warning
        });

      return () => {
        disposed = true;
        channel.unsubscribe();
      };
    },
    [state.user]
  );

  const forceFullSync = React.useCallback(async () => {
    // UI calls syncData with current snapshot; nothing extra needed here.
  }, []);

  const queueOperation = React.useCallback(async (_op: any) => {
    // No-op placeholder; keeps API stable if you enable granular ops later.
  }, []);

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    clearError,
    syncData,
    subscribeToData,
    forceFullSync,
    queueOperation,
  };
}