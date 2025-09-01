import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const key =
  (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

if (!url || !key) {
  console.warn("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY; cloud sync disabled.");
}

export const supabase = url && key
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
