/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  // Canonical name used by the app:
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // Fallback name (your existing secret name):
  readonly VITE_SUPABASE_KEY?: string;

  // Optional extras if you use them elsewhere:
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
