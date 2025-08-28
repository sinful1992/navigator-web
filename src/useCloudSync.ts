import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import type { User } from "@supabase/supabase-js"; // <- only User

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

    return () => sub?.subscription.unsubscribe();
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
    const { data, error } =
