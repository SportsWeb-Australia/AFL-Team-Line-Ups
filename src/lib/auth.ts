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

/**
 * Email a password-reset link. The link returns the user to `redirectTo` with a
 * recovery token, which supabase-js exchanges for a short-lived session and
 * reports as a PASSWORD_RECOVERY event — see onPasswordRecovery below.
 *
 * NOTE: the target must be allow-listed under Supabase → Authentication → URL
 * Configuration, or the emailed link falls back to the project's Site URL.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('The database is not connected yet — add your Supabase keys first.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/?admin`,
  });
  if (error) throw error;
}

/** Set a new password for the signed-in (or recovery) session. */
export async function updatePassword(password: string): Promise<void> {
  if (!supabase) throw new Error('The database is not connected yet — add your Supabase keys first.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Fires when the user arrives from a reset link. Without this the recovery
 * session would drop them straight into the editor with the OLD password still
 * set, and they'd never get to choose a new one.
 */
export function onPasswordRecovery(cb: () => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') cb();
  });
  return () => data.subscription.unsubscribe();
}
