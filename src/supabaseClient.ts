// src/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL;

const anon =
  // Prefer the canonical name, but fall back to your existing secret name.
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_KEY;

if (!url || !anon) {
  console.warn("[supabaseClient] Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY");
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
