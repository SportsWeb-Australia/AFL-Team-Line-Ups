import { useState } from 'react';
import { signInWithPassword } from '../lib/auth';
import appIcon from '../assets/app-icon.png';

/**
 * Shown in place of the editor when login is required (REQUIRE_AUTH) and nobody
 * is signed in. On success, App's auth listener swaps this for the editor — so
 * this component only needs to take the credentials and call sign-in.
 */
export default function LoginGate() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (busy) return;
    setErr('');
    if (!email.trim() || !pw) {
      setErr('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signInWithPassword(email, pw);
      // App's onAuthChange listener handles the transition into the editor.
    } catch (e: any) {
      setErr(e?.message ?? 'Could not sign in — check your email and password.');
      setBusy(false);
    }
  }

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
        <h1 className="sw1-login__title">Team Line Ups</h1>
        <p className="sw1-login__sub">Sign in to manage your club&rsquo;s teams.</p>

        <label className="sw1-login__field">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="sw1-login__field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </label>

        {err && <p className="sw1-login__err">{err}</p>}

        <button type="submit" className="sw1-btn sw1-btn--brand sw1-login__btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="sw1-login__note">Access is managed by your administrator.</p>
      </form>
    </div>
  );
}
