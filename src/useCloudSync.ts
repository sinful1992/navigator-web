// src/useCloudSync.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";

type UseCloudSync = {
  user: User | null;
  isLoading: boolean;
  isOnline: boolean;
  error: string | null;
  clearError: () => void;

  signIn: (email: string, password: string) => Promise<{ user: User }>;
  signUp: (email: string, password: string) => Promise<{ user: User }>;
  signOut: () => Promise<void>;

  syncData: (state: any) => Promise<void>;
  subscribeToData: (onChange: (s: any) => void) => () => void;
};

export function useCloudSync(): UseCloudSync {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [error, setError] = useState<string | null>(null);

  // Track last server timestamps and last payload we pushed
  const lastPulledAt = useRef<string>("");   // server updated_at for last accepted pull
  const lastPushedAt = useRef<string>("");   // server updated_at returned after our push
  const lastPushedHash = useRef<string>(""); // JSON string of the last state we successfully pushed

  const clearError = useCallback(() => setError(null), []);

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

  // ---- Online/offline tracking ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

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
    if (!supabase) return;
    const { error: err } = await supabase.auth.signOut();
    if (err) {
      setError(err.message);
      throw err;
    }
    setUser(null);
  }, [clearError]);

  // ---- Cloud upsert (push) ----
  const syncData = useCallback(
    async (state: any) => {
      if (!user) return;
      if (!supabase) {
        setError("Supabase not configured");
        return;
      }

      try {
        clearError();
        const now = new Date().toISOString();

        const { data, error: err } = await supabase
          .from("navigator_state")
          .upsert({ user_id: user.id, data: state, updated_at: now }, { onConflict: "user_id" })
          .select("updated_at")
          .single();

        if (err) throw err;

        lastPushedHash.current = JSON.stringify(state);
        lastPushedAt.current = (data?.updated_at as string | undefined) ?? now;
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [user, clearError]
  );

  // ---- Cloud subscribe (pull) ----
  const subscribeToData = useCallback(
    (onChange: (s: any) => void) => {
      // Runtime guard
      if (!user || !supabase) return () => {};

      // NON-NULL alias for TypeScript (prevents TS18047 in cleanup)
      const sb = supabase as NonNullable<typeof supabase>;

      // Clear prior error
      clearError();

      // Open channel
      const channel = sb.channel("navigator_state_" + user.id);

      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "navigator_state", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          try {
            const row = payload?.new ?? payload?.old ?? null;
            if (!row) return;

            const updatedAt: string | undefined = row.updated_at;
            const dataObj: any = row.data;

            // Ignore our own echo
            if (dataObj) {
              const json = JSON.stringify(dataObj);
              if (json === lastPushedHash.current) return;
            }

            // Basic timestamp guard; allow differing content even if timestamp <= lastPulledAt
            if (updatedAt && lastPulledAt.current) {
              if (updatedAt <= lastPulledAt.current && dataObj) {
                const json = JSON.stringify(dataObj);
                if (json === lastPushedHash.current) return;
              }
            }

            if (updatedAt) lastPulledAt.current = updatedAt;
            if (typeof onChange === "function") onChange(dataObj);
          } catch (e: any) {
            console.warn("subscribeToData handler error:", e?.message || e);
          }
        }
      );

      channel.subscribe(); // activate

      // Cleanup uses the non-null alias 'sb' so TS knows it's safe
      return () => {
        try {
          sb.removeChannel(channel);
        } catch {
          // ignore
        }
      };
    },
    [user, clearError]
  );

  return useMemo<UseCloudSync>(
    () => ({
      user,
      isLoading,
      isOnline,
      error,
      clearError,
      signIn,
      signUp,
      signOut,
      syncData,
      subscribeToData,
    }),
    [user, isLoading, isOnline, error, clearError, signIn, signUp, signOut, syncData, subscribeToData]
  );
}

export default useCloudSync;