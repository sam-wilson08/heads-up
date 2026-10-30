/// <reference types="vite/client" />

// Set in .env.local, or the host's build settings: see .env.example.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SITE_URL?: string;
}
