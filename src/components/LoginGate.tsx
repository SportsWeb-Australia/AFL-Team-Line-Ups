import { useEffect, useState } from 'react';
import { signInWithPassword, sendPasswordReset, updatePassword, onPasswordRecovery } from '../lib/auth';
import appIcon from '../assets/app-icon.png';

type View = 'signin' | 'forgot' | 'reset';

/**
 * Shown in place of the editor when login is required (REQUIRE_AUTH) and nobody
 * is signed in. On success, App's auth listener swaps this for the editor.
 *
 * Three views in one card: sign in, request a reset link, and set a new password
 * after following that link. The reset view takes over automatically on a
 * PASSWORD_RECOVERY event — arriving from a reset email creates a session, so
 * without that the user would be dropped into the editor with their old password
 * still set and no way to change it.
 */
export default function LoginGate() {
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => onPasswordRecovery(() => {
    setView('reset');
    setErr('');
    setOk('');
    setPw('');
  }), []);

  function fail(e: unknown, fallback: string) {
    setErr((e as { message?: string })?.message ?? fallback);
    setBusy(false);
  }

  async function submit() {
    if (busy) return;
    setErr('');
    setOk('');

    if (view === 'signin') {
      if (!email.trim() || !pw) return setErr('Enter your email and password.');
      setBusy(true);
      try {
        await signInWithPassword(email, pw);
        // App's onAuthChange listener handles the transition into the editor.
      } catch (e) {
        fail(e, 'Could not sign in — check your email and password.');
      }
      return;
    }

    if (view === 'forgot') {
      if (!email.trim()) return setErr('Enter your email address.');
      setBusy(true);
      try {
        await sendPasswordReset(email);
        setBusy(false);
        // Deliberately the same message whether or not the address exists, so
        // this can't be used to find out who has an account.
        setOk('If that address has an account, a reset link is on its way. Check your inbox.');
      } catch (e) {
        fail(e, "Couldn't send the reset email.");
      }
      return;
    }

    // view === 'reset'
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    setBusy(true);
    try {
      await updatePassword(pw);
      setBusy(false);
      setOk('Password updated. Signing you in…');
    } catch (e) {
      fail(e, "Couldn't update your password. The link may have expired — request a new one.");
    }
  }

  const title = view === 'reset' ? 'Choose a new password' : 'Team Line Ups';
  const sub =
    view === 'signin' ? "Sign in to manage your club's teams."
    : view === 'forgot' ? "We'll email you a link to reset it."
    : 'Enter the password you’d like to use from now on.';

  return (
    <div className="sw1-login">
      <form
        className="sw1-login__card"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <img className="sw1-login__logo" src={appIcon} alt="Footy Team Line Ups" />
        <h1 className="sw1-login__title">{title}</h1>
        <p className="sw1-login__sub">{sub}</p>

        {view !== 'reset' && (
          <label className="sw1-login__field">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}

        {view !== 'forgot' && (
          <label className="sw1-login__field">
            {view === 'reset' ? 'New password' : 'Password'}
            <span className="sw1-login__pw">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete={view === 'reset' ? 'new-password' : 'current-password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <button
                type="button"
                className="sw1-login__peek"
                onClick={() => setShowPw((v) => !v)}
                aria-pressed={showPw}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
        )}

        {err && <p className="sw1-login__err">{err}</p>}
        {ok && <p className="sw1-login__ok">{ok}</p>}

        <button type="submit" className="sw1-btn sw1-btn--brand sw1-login__btn" disabled={busy}>
          {busy
            ? 'Working…'
            : view === 'signin' ? 'Sign in'
            : view === 'forgot' ? 'Email me a reset link'
            : 'Save new password'}
        </button>

        {view === 'signin' && (
          <button
            type="button"
            className="sw1-login__link"
            onClick={() => { setView('forgot'); setErr(''); setOk(''); }}
          >
            Forgot your password?
          </button>
        )}
        {view === 'forgot' && (
          <button
            type="button"
            className="sw1-login__link"
            onClick={() => { setView('signin'); setErr(''); setOk(''); }}
          >
            ← Back to sign in
          </button>
        )}

        <p className="sw1-login__note">Access is managed by your administrator.</p>
      </form>
    </div>
  );
}
