/**
 * Did this page load come from a password-reset link?
 *
 * Read at module load, deliberately with NO supabase import, and imported first
 * in main.tsx so it evaluates before the client is created. supabase-js consumes
 * the `#access_token=…&type=recovery` fragment and clears it during init, so by
 * the time React mounts, the URL no longer says how we got here.
 *
 * The PASSWORD_RECOVERY event alone is not enough: it fires during that same
 * init, before any component has mounted a listener. Worse, the recovery token
 * creates a real session, so App would otherwise treat the user as signed in and
 * drop them into the editor with their OLD password still set — which is exactly
 * what happened before this existed.
 */
const initialHash = typeof window !== 'undefined' ? window.location.hash : '';

export const arrivedFromRecoveryLink = /(^|[#&])type=recovery(&|$)/.test(initialHash);
