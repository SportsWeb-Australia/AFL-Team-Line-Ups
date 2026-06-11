import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Club, MatchInfo, Player, PlayerStatus, Sponsor, VisualMode } from '../types';
import SquadList from './SquadList';
import sportswebLogo from '../assets/sportsweb-logo.svg';

type LogoTarget = 'home' | 'away';

interface Props {
  players: Player[];
  squadLocation: Map<string, string>;
  visualMode: VisualMode;
  selectedPlayerId: string | null;
  onVisualMode: (m: VisualMode) => void;
  onSelect: (id: string) => void;
  onAddPlayer: (number: string, name: string) => void;
  onImport: (rows: { number: string; name: string }[]) => void;
  onSetAvailability: (id: string, reason: PlayerStatus | null) => void;
  onRemovePlayer: (id: string) => void;
  onUpdatePlayer: (id: string, fields: { number?: string; name?: string }) => void;
  onLoadBlank: () => void;
  onLoadDemo: () => void;
  // branding
  club: Club;
  match: MatchInfo;
  sponsors?: { rotating?: Sponsor[] };
  onClub: (patch: Partial<Club>) => void;
  onMatch: (patch: Partial<MatchInfo>) => void;
  onLogo: (target: LogoTarget, dataUrl: string) => void;
  onSponsorLogo: (index: number, dataUrl: string) => void;
  onAddSponsor: () => void;
  onRemoveSponsor: (index: number) => void;
  onRotationMs: (ms: number) => void;
  rotationMs?: number;
  // database (SportsWeb One / Supabase)
  dbConfigured: boolean;
  dbState: 'idle' | 'loading' | 'saving' | 'ok' | 'error';
  dbMsg: string;
  onLoadFromDb: () => void;
  onSaveToDb: () => void;
  // background watermark
  wmSource: 'clubName' | 'clubLogo' | 'sponsorName' | 'sponsorLogo';
  onWmSource: (s: 'clubName' | 'clubLogo' | 'sponsorName' | 'sponsorLogo') => void;
  wmSponsorName: string;
  onWmSponsorName: (v: string) => void;
  onWmSponsorLogo: (dataUrl: string) => void;
  wmHasSponsorLogo: boolean;
  playingList: ReactNode;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Controls shown only in admin mode. Pure UI — all state lives in TeamSheet. */
export default function AdminPanel({
  players,
  squadLocation,
  visualMode,
  selectedPlayerId,
  onVisualMode,
  onSelect,
  onAddPlayer,
  onImport,
  onSetAvailability,
  onRemovePlayer,
  onUpdatePlayer,
  onLoadBlank,
  onLoadDemo,
  club,
  match,
  sponsors,
  onClub,
  onMatch,
  onLogo,
  onSponsorLogo,
  onAddSponsor,
  onRemoveSponsor,
  onRotationMs,
  rotationMs = 3800,
  dbConfigured,
  dbState,
  dbMsg,
  onLoadFromDb,
  onSaveToDb,
  wmSource,
  onWmSource,
  wmSponsorName,
  onWmSponsorName,
  onWmSponsorLogo,
  wmHasSponsorLogo,
  playingList,
}: Props) {
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = () => {
    const n = num.trim();
    const nm = name.trim();
    if (!nm) {
      setAddMsg({ ok: false, text: 'Enter a player name.' });
      return;
    }
    if (n) {
      const clash = players.find((p) => p.number.trim() === n);
      if (clash) {
        setAddMsg({ ok: false, text: `Number ${n} is already used by ${clash.name}.` });
        return;
      }
    }
    onAddPlayer(n, nm); // number may be blank — fill it in later
    setAddMsg({
      ok: true,
      text: n ? `Added #${n} ${nm} to the squad.` : `Added ${nm} — add a number any time.`,
    });
    setNum('');
    setName('');
  };

  const importRows = () => {
    const rows = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [number, ...rest] = l.split(',');
        return { number: (number || '').trim(), name: rest.join(',').trim() };
      })
      .filter((r) => r.number && r.name);
    if (rows.length) {
      onImport(rows);
      setBulk('');
    }
  };

  const uploadLogo = (target: LogoTarget) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLogo(target, await readAsDataUrl(file));
  };
  const uploadSponsor = (index: number) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSponsorLogo(index, await readAsDataUrl(file));
  };

  const rotating = sponsors?.rotating ?? [];

  return (
    <aside className="sw1-admin">
      {/* SportsWeb One branding (placeholder logo — swap for the real asset) */}
      <div className="sw1-admin-brand">
        <img src={sportswebLogo} alt="SportsWeb One" />
        <span className="sw1-admin-brand__tag">Club admin</span>
      </div>

      {/* SportsWeb One database */}
      <div className={`sw1-db sw1-db--${dbState}`}>
        <div className="sw1-db__row">
          <span className={`sw1-db__dot ${dbConfigured ? 'is-on' : 'is-off'}`} />
          <strong>SportsWeb One database</strong>
          <span className="sw1-db__btns">
            <button
              type="button"
              className="sw1-btn"
              onClick={onLoadFromDb}
              disabled={!dbConfigured || dbState === 'loading' || dbState === 'saving'}
            >
              {dbState === 'loading' ? 'Loading…' : 'Load'}
            </button>
            <button
              type="button"
              className="sw1-btn sw1-btn--primary"
              onClick={onSaveToDb}
              disabled={!dbConfigured || dbState === 'loading' || dbState === 'saving'}
            >
              {dbState === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
        {!dbConfigured && (
          <p className="sw1-db__msg">
            Not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env, then restart.
          </p>
        )}
        {dbConfigured && dbMsg && <p className="sw1-db__msg">{dbMsg}</p>}
        {dbConfigured && (
          <p className="sw1-db__hint">
            Load pulls the latest fixture. Save writes the whole sheet back (needs the one-time
            enable-writes.sql).
          </p>
        )}
      </div>

      {/* Match & branding */}
      <details className="sw1-brand sw1-section" open>
        <summary>Match &amp; branding</summary>

        <div className="sw1-brand__grid">
          <label>Club<input value={club.name} onChange={(e) => onClub({ name: e.target.value })} /></label>
          <label>Opponent<input value={match.opponent} onChange={(e) => onMatch({ opponent: e.target.value })} /></label>
          <label>Round<input value={match.round} onChange={(e) => onMatch({ round: e.target.value })} /></label>
          <label>Grade<input value={match.grade} onChange={(e) => onMatch({ grade: e.target.value })} /></label>
          <label>Date<input value={match.date} onChange={(e) => onMatch({ date: e.target.value })} /></label>
          <label>Time<input value={match.time} onChange={(e) => onMatch({ time: e.target.value })} /></label>
          <label className="sw1-brand__full">Venue<input value={match.venue} onChange={(e) => onMatch({ venue: e.target.value })} /></label>
          <label className="sw1-brand__color">Primary<input type="color" value={club.primaryColor} onChange={(e) => onClub({ primaryColor: e.target.value })} /></label>
          <label className="sw1-brand__color">Secondary<input type="color" value={club.secondaryColor} onChange={(e) => onClub({ secondaryColor: e.target.value })} /></label>
        </div>

        <div className="sw1-brand__logos">
          <label>Home logo<input type="file" accept="image/*" onChange={uploadLogo('home')} /></label>
          <label>Away logo<input type="file" accept="image/*" onChange={uploadLogo('away')} /></label>
        </div>

        {/* Sponsor banner rotation — a SportsWeb One revenue surface */}
        <div className="sw1-sponsorpanel">
          <div className="sw1-sponsorpanel__head">
            <div>
              <strong>Sponsor banner rotation</strong>
              <span>Powered by SportsWeb One — upload sold banner ads (728×90 style)</span>
            </div>
            <a href="https://www.sportswebone.com.au" target="_blank" rel="noopener noreferrer">
              Manage sponsors →
            </a>
          </div>

          <div className="sw1-brand__logos">
            {rotating.map((s, i) => (
              <label key={i}>
                Banner {i + 1}
                <span className="sw1-sponsorpanel__row">
                  <input type="file" accept="image/*" onChange={uploadSponsor(i)} />
                  {rotating.length > 1 && (
                    <button type="button" className="sw1-sponsorpanel__x" onClick={() => onRemoveSponsor(i)}>
                      ✕
                    </button>
                  )}
                </span>
                {s.bannerUrl ? (
                  <img className="sw1-sponsorpanel__preview" src={s.bannerUrl} alt={`Banner ${i + 1} preview`} />
                ) : (
                  <span className="sw1-sponsorpanel__preview sw1-sponsorpanel__preview--empty">No banner yet</span>
                )}
              </label>
            ))}
          </div>

          <div className="sw1-sponsorpanel__controls">
            <button type="button" className="sw1-btn" onClick={onAddSponsor} disabled={rotating.length >= 5}>
              + Add banner slot {rotating.length >= 5 ? '(max 5)' : ''}
            </button>
            <label className="sw1-sponsorpanel__speed">
              Rotate every
              <select value={rotationMs} onChange={(e) => onRotationMs(Number(e.target.value))}>
                <option value={2500}>2.5s</option>
                <option value={3800}>3.8s</option>
                <option value={5000}>5s</option>
                <option value={8000}>8s</option>
              </select>
            </label>
          </div>
        </div>

        {/* Background watermark behind the oval */}
        <div className="sw1-watermarkpanel">
          <strong>Background behind the oval</strong>
          <div className="sw1-brand__grid">
            <label>
              Show
              <select
                value={wmSource}
                onChange={(e) => onWmSource(e.target.value as Props['wmSource'])}
              >
                <option value="clubName">Club name</option>
                <option value="clubLogo">Club logo</option>
                <option value="sponsorName">Sponsor name</option>
                <option value="sponsorLogo">Sponsor logo</option>
              </select>
            </label>
            {(wmSource === 'sponsorName' || wmSource === 'sponsorLogo') && (
              <label>
                Sponsor name
                <input
                  type="text"
                  value={wmSponsorName}
                  onChange={(e) => onWmSponsorName(e.target.value)}
                  placeholder="e.g. Riverton Motors"
                />
              </label>
            )}
          </div>
          {wmSource === 'sponsorLogo' && (
            <label className="sw1-watermarkpanel__file">
              Sponsor logo {wmHasSponsorLogo ? '✓ uploaded' : ''}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) onWmSponsorLogo(await readAsDataUrl(f));
                }}
              />
            </label>
          )}
          <p className="sw1-admin__hint">Stays subtle/opaque behind the players.</p>
        </div>

        <p className="sw1-admin__hint">Uploaded logos &amp; banners are embedded, so they appear in the downloaded PNG too.</p>
      </details>

      {/* Playing list — read-only summary of the on-field selections */}
      <details className="sw1-section" open>
        <summary>Playing list</summary>
        {playingList}
      </details>

      {/* Team list */}
      <details className="sw1-section" open>
        <summary>Team list</summary>

      <div className="sw1-admin__modes">
        {(['jumper', 'headshot', 'none'] as VisualMode[]).map((m) => (
          <button key={m} className={`sw1-chip ${visualMode === m ? 'is-active' : ''}`} onClick={() => onVisualMode(m)}>
            {m === 'jumper' ? 'Jumper' : m === 'headshot' ? 'Headshot' : 'No image'}
          </button>
        ))}
      </div>

      <p className="sw1-admin__hint">
        Your full squad. Tap a player to pick them up, then tap a field position or bench group (drag works on a computer). Set availability to move someone straight to Unavailable.
      </p>

      <div className="sw1-admin__buttons">
        <button className="sw1-btn" onClick={onLoadDemo}>Load saved demo</button>
        <button className="sw1-btn" onClick={onLoadBlank}>Clear selections</button>
      </div>

      <div className="sw1-admin__add">
        <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="No. (optional)" inputMode="numeric" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" />
        <button className="sw1-btn sw1-btn--primary" onClick={add}>Add</button>
      </div>
      {addMsg && (
        <p className={`sw1-addmsg ${addMsg.ok ? 'is-ok' : 'is-err'}`}>{addMsg.text}</p>
      )}

      <details className="sw1-admin__bulk">
        <summary>Bulk import</summary>
        <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'17, Jack Reardon\n10, Tom Wallis'} />
        <button className="sw1-btn" onClick={importRows}>Import players</button>
      </details>

      <SquadList
        players={players}
        location={squadLocation}
        selectedPlayerId={selectedPlayerId}
        onSelect={onSelect}
        onSetAvailability={onSetAvailability}
        onRemovePlayer={onRemovePlayer}
        onUpdatePlayer={onUpdatePlayer}
      />
      </details>
    </aside>
  );
}
