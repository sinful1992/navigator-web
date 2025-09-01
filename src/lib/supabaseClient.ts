// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_KEY; // ← supports your current secret name

if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL or anon key (VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_KEY).");
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
