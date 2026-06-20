import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Auth helpers for the editor login gate. These wrap supabase.auth so the rest
 * of the app never imports the client directly for sessions. Sign-in persists
 * the session in the browser, and supabase-js automatically attaches the JWT to
 * every subsequent request — so once logged in, saves/publishes are authenticated
 * and satisfy the "authenticated write" RLS policy (see supabase/enable-auth.sql).
 */

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Subscribe to login/logout. Returns an unsubscribe function. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) {
    cb(null);
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('The database is not connected yet — add your Supabase keys first.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** The signed-in user's email, for showing "signed in as …". */
export function sessionEmail(session: Session | null): string | null {
  return session?.user?.email ?? null;
}
