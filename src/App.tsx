import { useState } from 'react';
import TeamSheet from './components/TeamSheet';
import Splash from './components/Splash';
import { sampleTeam } from './data/sampleTeam';
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
// Embeds (and ?fixture / ?load deep links) pull the published sheet from the DB.
const autoLoad = isEmbed || params.has('fixture') || params.has('load');

export default function App() {
  // The editor previews public via state so selections persist across the switch.
  const [mode, setMode] = useState<RenderMode>(isAdminSession ? 'admin' : 'public');

  return (
    <>
      {!isEmbed && <Splash />}
      {isAdminSession && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 16px 0',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
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
            {mode === 'admin' ? 'Preview public embed →' : '← Back to editor'}
          </button>
        </div>
      )}

      <TeamSheet data={sampleTeam} mode={mode} embed={isEmbed} autoLoad={autoLoad} />
    </>
  );
}
