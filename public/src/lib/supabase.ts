import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for the SportsWeb One database.
 *
 * The URL + anon key come from the environment (.env locally, project env vars
 * on Vercel). The anon key is the *public* client-side key — it is safe to ship
 * in the bundle because the database is protected by row-level security.
 *
 * If the env vars are missing the client is `null`, and the widget simply runs
 * on its built-in sample data — so a missing config never breaks the app.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
