// src/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const url =
  (import.meta as any)?.env?.VITE_SUPABASE_URL ||
  (globalThis as any)?.VITE_SUPABASE_URL;

const anonKey =
  (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ||
  (globalThis as any)?.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY envs."
  );
}

export const supabase = createClient(url || "", anonKey || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
