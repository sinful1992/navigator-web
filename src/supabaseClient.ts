// src/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_KEY;

if (!url || !anon) {
  console.warn(
    "[supabaseClient] Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY"
  );
}

declare global {
  // Ensure a single client per page context
  // eslint-disable-next-line no-var
  var __NAVIGATOR_WEB_SUPABASE__: ReturnType<typeof createClient> | undefined;
}

export const supabase =
  globalThis.__NAVIGATOR_WEB_SUPABASE__ ??
  (globalThis.__NAVIGATOR_WEB_SUPABASE__ = createClient(url ?? "", anon ?? "", {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: "navigator-web",
    },
  }));
