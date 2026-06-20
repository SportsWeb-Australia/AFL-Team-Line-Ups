import { useState, useEffect } from 'react';
import TeamSheet from './components/TeamSheet';
import Splash from './components/Splash';
import InstallPrompt from './components/InstallPrompt';
import LoginGate from './components/LoginGate';
import { sampleTeam } from './data/sampleTeam';
import { REQUIRE_AUTH } from './lib/config';
import { getSession, onAuthChange, signOut, sessionEmail } from './lib/auth';
import type { Session } from '@supabase/supabase-js';
import type { RenderMode } from './types';

/**
 * Standalone host page.
 *
 * PUBLIC (default) renders a clean, chrome-free graphic — what gets embedded in
 * a club's SportsWeb One site, so NO buttons at all.
 *
 * Add ?admin to the URL to open the editor (http://localhost:5173/?admin).
 * Inside the editor you can preview the public embed WITHOUT losing your edits,
 * because the toggle is in-app state (it never reloads the page).
 */
const params = new URLSearchParams(window.location.search);
const isAdminSession = params.has('admin');
const isEmbed = params.has('embed');
// Embeds, the admin editor, and ?fixture/?load deep links all pull the saved
// sheet from the DB on open. Admin auto-load = your work persists across
// reloads (falls back to the bundled demo when nothing has been saved yet).
const autoLoad = isEmbed || isAdminSession || params.has('fixture') || params.has('club') || params.has('load');

export default function App() {
  // The editor previews public via state so selections persist across the switch.
  const [mode, setMode] = useState<RenderMode>(isAdminSession ? 'admin' : 'public');

  // Login gate — only enforced for the ?admin editor when REQUIRE_AUTH is on.
  // `undefined` = still checking the session; `null` = not signed in.
  const [session, setSession] = useState<Session | null | undefined>(
    isAdminSession && REQUIRE_AUTH ? undefined : null,
  );
  useEffect(() => {
    if (!isAdminSession || !REQUIRE_AUTH) return;
    let active = true;
    getSession().then((s) => {
      if (active) setSession(s);
    });
    return onAuthChange((s) => setSession(s));
  }, []);

  // Embed background is transparent by default so it blends into any club page.
  // Optionally pin a solid colour with ?bg=ffffff (or ?bg=transparent).
  useEffect(() => {
    if (!isEmbed) return;
    const bg = params.get('bg');
    document.body.style.background =
      bg && bg.toLowerCase() !== 'transparent' ? `#${bg.replace(/^#/, '')}` : 'transparent';
  }, []);

  // Embed auto-height: report our content height to the host page so the iframe
  // can size itself to fit any device (no fixed height / inner scrollbar).
  useEffect(() => {
    if (!isEmbed) return;
    const post = () => {
      // The corner-floated Interchange/Emergencies are absolutely positioned, so
      // they can sit outside documentElement.scrollHeight. Measure the lowest point
      // of the actual content and add a small buffer so nothing is clipped.
      let maxBottom = 0;
      document
        .querySelectorAll('.sw1-frame, .sw1-interchange, .sw1-emergencies, .sw1-stage')
        .forEach((el) => {
          const b = el.getBoundingClientRect().bottom + window.scrollY;
          if (b > maxBottom) maxBottom = b;
        });
      const h =
        Math.ceil(
          Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, maxBottom),
        ) + 4;
      window.parent?.postMessage({ type: 'sw1-embed-height', height: h }, '*');
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    window.addEventListener('load', post);
    // Re-post after late layout settles (web-font swap, jumper images decoding).
    const timers = [setTimeout(post, 400), setTimeout(post, 1200)];
    return () => {
      ro.disconnect();
      window.removeEventListener('load', post);
      timers.forEach(clearTimeout);
    };
  }, []);

  // Gate the editor behind login when required.
  if (isAdminSession && REQUIRE_AUTH) {
    if (session === undefined) return null; // brief: checking the saved session
    if (!session) return <LoginGate />;
  }

  return (
    <>
      {!isEmbed && <Splash />}
      {isAdminSession && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px 0',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {REQUIRE_AUTH && session && (
            <button
              onClick={() => signOut()}
              title={sessionEmail(session) ?? undefined}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#0f172a',
              }}
            >
              Sign out
            </button>
          )}
          <button
            onClick={() => setMode((m) => (m === 'admin' ? 'public' : 'admin'))}
            style={{
              padding: '7px 16px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              border: '1px solid #cbd5e1',
              background: mode === 'admin' ? '#fff' : '#0c2340',
              color: mode === 'admin' ? '#0f172a' : '#fff',
            }}
          >
            {mode === 'admin' ? 'Preview public view live →' : '← Back to editor'}
          </button>
        </div>
      )}

      <TeamSheet data={sampleTeam} mode={mode} embed={isEmbed} autoLoad={autoLoad} />
      {!isEmbed && <InstallPrompt />}
    </>
  );
}
