import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

// Replace 'any' with your concrete State type if available.
type AppState = any;

function useOnline() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function useCloudSync() {
  const isOnline = useOnline();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!supabase);
  const [error, setError] = useState<string | null>(null);

  const lastPushedAt = useRef<string>("");
  const lastPulledAt = useRef<string>("");

  // ---- Session bootstrap
  useEffect(() => {
    const client = supabase; // capture locally for narrowing in closures
    if (!client) {
      setIsLoading(false);
      return;
    }

    (async () => {
      const { data: { session }, error } = await client.auth.getSession();
      if (error) console.error(error);
      setUser(session?.user ?? null);
      setIsLoading(false);
    })();

    const { data: sub } = client.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    // ✅ fix: guard both levels with optional chaining
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ---- Auth API
  const signIn = useCallback(async (email: string, password: string) => {
    const client = supabase;
    if (!client) throw new Error("Cloud disabled: missing env vars");
    setError(null);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user! };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = supabase;
    if (!client) throw new Error("Cloud disabled: missing env vars");
    setError(null);
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return { user: data.user! };
  }, []);

  const signOut = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    await client.auth.signOut();
  }, []);

  const signInDemo = useCallback(async () => {
    const client = supabase;
    if (!client) throw new Error("Cloud disabled");
    const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
    const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
    if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("Demo credentials not configured");
    const { data, error } = await client.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) throw error;
    return { user: data.user! };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // ---- Push local -> cloud
  const syncData = useCallback(async (state: AppState) => {
    const client = supabase;
    if (!client || !user) return;
    const now = new Date().toISOString();
    const { error } = await client
      .from("navigator_state")
      .upsert({ user_id: user.id, data: state, updated_at: now }, { onConflict: "user_id" });
    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }
    lastPushedAt.current = now;
  }, [user]);

  // ---- Subscribe cloud -> local
  const subscribeToData = useCallback((onChange: (s: AppState) => void) => {
    const client = supabase; // captured non-null locally
    if (!client || !user) return () => {};

    // Initial fetch
    let cancelled = false;
    (async () => {
      const { data, error } = await client
        .from("navigator_state")
        .select("data, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data && !error) {
        lastPulledAt.current = data.updated_at ?? new Date().toISOString();
        onChange(data.data);
      }
    })();

    // Realtime
    const channel = client
      .channel(`realtime:navigator_state:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "navigator_state", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          const updatedAt = row?.updated_at as string | undefined;
          if (!updatedAt) return;
          if (updatedAt <= lastPushedAt.current) return; // ignore our own push echo
          if (updatedAt <= lastPulledAt.current) return; // ignore older snapshot
          lastPulledAt.current = updatedAt;
          if (row?.data) onChange(row.data);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
      cancelled = true;
    };
  }, [user]);

  return {
    user,
    isLoading,
    isOnline: isOnline && !!supabase,
    error,
    clearError,
    signIn,
    signUp,
    signOut,
    signInDemo,
    syncData,
    subscribeToData,
  };
}
