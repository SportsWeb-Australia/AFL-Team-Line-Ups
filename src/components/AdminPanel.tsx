import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Club, MatchInfo, Player, PlayerStatus, Sponsor, VisualMode } from '../types';
import type { SavedSheet } from '../lib/source';
import SquadList from './SquadList';
import sportswebLogo from '../assets/sportsweb-logo.svg';

/** Outbound SportsWeb links (single place to update the domain). */
const SPORTSWEB_URL = 'https://sportsweb.com.au';
const SPORTSWEB_CONTACT = 'https://sportsweb.com.au/contact';
const SPORTSWEB_UPGRADE = 'https://sportsweb.com.au/premium-websites';

/** House banner ad — swap `src` for a supplied 728×90-style creative when ready. */
const HOUSE_AD: { src?: string; href: string; alt: string } = {
  src: undefined, // no creative yet → renders the on-brand placeholder below
  href: SPORTSWEB_URL,
  alt: 'SportsWeb One — websites & apps for grassroots sport',
};

/** Quick-start walkthrough video — drop in a real embed URL when available. */
const QUICKSTART_VIDEO_URL = '';

type LogoTarget = 'home' | 'away';

/** 8:00 AM → 7:45 PM in 15-minute steps, for the kick-off time dropdown. */
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 19; h++) {
    for (const m of [0, 15, 30, 45]) {
      const ap = h < 12 ? 'AM' : 'PM';
      const hr = h % 12 === 0 ? 12 : h % 12;
      out.push(`${hr}:${String(m).padStart(2, '0')} ${ap}`);
    }
  }
  return out;
})();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-20" → "20 Jul"; leaves free-text dates untouched. */
function shortDate(text: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim());
  if (!m) return text;
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1] ?? m[2]}`;
}

/** "Round 7 · 20 Jul · Seniors vs Hillcrest" */
function savedSheetLabel(s: SavedSheet): string {
  const head = [s.round, s.dateText ? shortDate(s.dateText) : null].filter(Boolean).join(' · ');
  const tail = [s.grade, s.opponent ? `vs ${s.opponent}` : null].filter(Boolean).join(' ');
  return [head, tail].filter(Boolean).join(' · ') || 'Untitled team';
}

interface Props {
  players: Player[];
  squadLocation: Map<string, string>;
  isNarrow?: boolean;
  visualMode: VisualMode;
  selectedPlayerId: string | null;
  onVisualMode: (m: VisualMode) => void;
  onSelect: (id: string) => void;
  onAddPlayer: (number: string, name: string) => void;
  onImport: (rows: { number: string; name: string }[]) => void;
  onSetAvailability: (id: string, reason: PlayerStatus | null) => void;
  onSetRole: (id: string, role: PlayerStatus, on: boolean) => void;
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
  onNewTeam?: () => void;
  savedSheets?: SavedSheet[];
  currentFixtureId?: string | null;
  onLoadSheet?: (fixtureId: string) => void;
  onDeleteSheet?: (fixtureId: string) => void;
  onCopyEmbed?: () => void;
  onClone?: () => void;
  /** Ins & Outs vs last week (admin reference only). Null until a prior round exists. */
  insOuts?: { round: string | null; ins: { number: string; name: string }[]; outs: { number: string; name: string }[] } | null;
  onRefreshInsOuts?: () => void;
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
  isNarrow,
  visualMode,
  selectedPlayerId,
  onVisualMode,
  onSelect,
  onAddPlayer,
  onImport,
  onSetAvailability,
  onSetRole,
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
  onNewTeam,
  savedSheets = [],
  currentFixtureId,
  onLoadSheet,
  onDeleteSheet,
  onCopyEmbed,
  onClone,
  insOuts,
  onRefreshInsOuts,
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
  const quickRef = useRef<HTMLDetailsElement>(null);

  const openQuickStart = () => {
    const el = quickRef.current;
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
      {/* App branding — AFL Team Line Ups, powered by SportsWeb One */}
      <header className="sw1-appbrand">
        <div className="sw1-appbrand__id">
          <strong className="sw1-appbrand__title">AFL Team Line Ups</strong>
          <a className="sw1-appbrand__by" href={SPORTSWEB_URL} target="_blank" rel="noopener noreferrer">
            Powered by <img src={sportswebLogo} alt="SportsWeb One" />
          </a>
        </div>
        <div className="sw1-appbrand__tools">
          <button type="button" className="sw1-pill" onClick={openQuickStart}>
            Help
          </button>
          <a className="sw1-pill sw1-pill--chat" href={SPORTSWEB_CONTACT} target="_blank" rel="noopener noreferrer">
            Chat
          </a>
        </div>
      </header>

      {/* House banner — fixed slot, creative supplied by SportsWeb */}
      <a className="sw1-housead" href={HOUSE_AD.href} target="_blank" rel="noopener noreferrer">
        {HOUSE_AD.src ? (
          <img src={HOUSE_AD.src} alt={HOUSE_AD.alt} />
        ) : (
          <span className="sw1-housead__ph">
            <strong>SportsWeb One</strong>
            <span>Websites &amp; apps for grassroots sport →</span>
          </span>
        )}
      </a>

      {/* Quick start — guide + walkthrough video (collapsed on mobile) */}
      <details className="sw1-section sw1-quick" ref={quickRef} open={!isNarrow}>
        <summary>Quick start</summary>
        <div className="sw1-quick__body">
          <div className="sw1-quick__video">
            {QUICKSTART_VIDEO_URL ? (
              <iframe
                src={QUICKSTART_VIDEO_URL}
                title="AFL Team Line Ups — quick start"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <span className="sw1-quick__videoph">▶ Walkthrough video coming soon</span>
            )}
          </div>
          <ol className="sw1-quick__steps">
            <li><strong>Set up the match</strong> — open <em>Match &amp; branding</em>, enter round, grade, opponent, date and your club colours.</li>
            <li><strong>Build your squad</strong> — in <em>Team list</em>, add players (or use Bulk import), then tap a player and tap a field position or bench group to place them.</li>
            <li><strong>Mark roles</strong> — use the C / VC / Debut / Milestone chips and the availability dropdown for ins, outs and injuries.</li>
            <li><strong>Save the team</strong> — hit <em>Save this team</em>. Each round/date saves on its own.</li>
            <li><strong>Publish</strong> — <em>Download graphic</em> for socials, or <em>Copy embed code</em> to drop the live line-up onto your club site.</li>
          </ol>
          <a className="sw1-quick__chat" href={SPORTSWEB_CONTACT} target="_blank" rel="noopener noreferrer">
            Need a hand? Chat with the SportsWeb team →
          </a>
        </div>
      </details>

      {/* SportsWeb One database */}
      <div className={`sw1-db sw1-db--${dbState}`}>
        <div className="sw1-db__row">
          <span className={`sw1-db__dot ${dbConfigured ? 'is-on' : 'is-off'}`} />
          <strong>SportsWeb One database</strong>
        </div>

        {dbConfigured && (
          <div className="sw1-db__actions">
            {onNewTeam && (
              <button type="button" className="sw1-btn" onClick={onNewTeam}>
                + New team
              </button>
            )}
            <button
              type="button"
              className="sw1-btn"
              onClick={onLoadFromDb}
              disabled={dbState === 'loading' || dbState === 'saving'}
            >
              {dbState === 'loading' ? 'Loading…' : 'Load last week & edit'}
            </button>
            <button
              type="button"
              className="sw1-btn sw1-btn--primary"
              onClick={onSaveToDb}
              disabled={dbState === 'loading' || dbState === 'saving'}
            >
              {dbState === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {!dbConfigured && (
          <p className="sw1-db__msg">
            Not connected yet. Saving teams, reloading them next week and the embed
            codes all run off the SportsWeb One database — so this is the bit to turn
            on first. It's a 5-minute one-off: see <strong>CONNECT-DATABASE.md</strong>{' '}
            in the project (add two keys to Vercel, run two SQL files). Until then the
            widget runs on the built-in demo only.
          </p>
        )}
        {dbConfigured && dbMsg && <p className="sw1-db__msg">{dbMsg}</p>}

        {dbConfigured && savedSheets.length > 0 && (
          <div className="sw1-db__saved">
            <label className="sw1-db__savedlabel">
              Recent teams
              <select
                className="sw1-db__select"
                value={currentFixtureId ?? ''}
                onChange={(e) => e.target.value && onLoadSheet?.(e.target.value)}
              >
                <option value="">Pick a recent team to load &amp; edit…</option>
                {savedSheets.map((s) => (
                  <option key={s.fixtureId} value={s.fixtureId}>
                    {savedSheetLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            {currentFixtureId && (
              <div className="sw1-db__savedactions">
                {onClone && (
                  <button type="button" className="sw1-btn" onClick={onClone}>
                    Clone to new round
                  </button>
                )}
                {onCopyEmbed && (
                  <button type="button" className="sw1-btn sw1-db__embedbtn" onClick={onCopyEmbed}>
                    Copy embed code for this team
                  </button>
                )}
                {onDeleteSheet && (
                  <button
                    type="button"
                    className="sw1-btn sw1-db__deletebtn"
                    onClick={() => onDeleteSheet(currentFixtureId)}
                  >
                    Delete this team
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {dbConfigured && (
          <p className="sw1-db__hint">
            Each round/date saves as its own team. Save writes the whole sheet back
            (needs the one-time enable-writes.sql); pick a saved team above to reload it.
          </p>
        )}
      </div>

      {/* Match & branding */}
      <details className="sw1-brand sw1-section" open={!isNarrow}>
        <summary>Match &amp; branding</summary>

        <div className="sw1-brand__grid">
          <label>Club<input value={club.name} onChange={(e) => onClub({ name: e.target.value })} /></label>
          <label>Opponent<input value={match.opponent} onChange={(e) => onMatch({ opponent: e.target.value })} /></label>
          <label>Round<input value={match.round} onChange={(e) => onMatch({ round: e.target.value })} /></label>
          <label>Grade<input value={match.grade} onChange={(e) => onMatch({ grade: e.target.value })} /></label>
          <label>Date<input
            type="date"
            value={match.date}
            onChange={(e) => onMatch({ date: e.target.value })}
            onClick={(e) => {
              // Open the calendar from a click anywhere on the field, not just the
              // little icon. showPicker() is a no-op/throw on older browsers, so guard it.
              try {
                (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {
                /* unsupported — the icon still works */
              }
            }}
          /></label>
          <label>
            Time
            <select value={match.time} onChange={(e) => onMatch({ time: e.target.value })}>
              {match.time && !TIME_OPTIONS.includes(match.time) && (
                <option value={match.time}>{match.time}</option>
              )}
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="sw1-brand__full">Venue<input value={match.venue} onChange={(e) => onMatch({ venue: e.target.value })} /></label>
          <label className="sw1-brand__full">Competition / league<input value={match.competition ?? ''} onChange={(e) => onMatch({ competition: e.target.value })} placeholder="e.g. Eastern Football Netball League" /></label>
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
            <a href={SPORTSWEB_URL} target="_blank" rel="noopener noreferrer">
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
      <details className="sw1-section" open={!isNarrow}>
        <summary>Playing list</summary>
        {playingList}
      </details>

      {/* Ins & Outs vs last week — admin reference only (never on the public graphic) */}
      <details className="sw1-section" open={!isNarrow}>
        <summary>Ins &amp; Outs vs last week</summary>
        {!dbConfigured ? (
          <p className="sw1-admin__hint">
            Connect the SportsWeb One database to compare rounds — this reads the previous
            saved round for this grade and shows who's changed.
          </p>
        ) : !insOuts ? (
          <div className="sw1-inouts">
            <p className="sw1-admin__hint">
              Save at least two rounds for this grade and the changes since the previous
              round will show here.
            </p>
            {onRefreshInsOuts && (
              <button type="button" className="sw1-btn" onClick={onRefreshInsOuts}>
                Check for last round
              </button>
            )}
          </div>
        ) : (
          <div className="sw1-inouts">
            <p className="sw1-inouts__vs">
              Compared with {insOuts.round ? <strong>{insOuts.round}</strong> : 'the previous round'}.
              Field + bench, excluding Unavailable.
            </p>
            <div className="sw1-inouts__cols">
              <div className="sw1-inouts__col">
                <span className="sw1-inouts__head sw1-inouts__head--in">
                  In <span className="sw1-inouts__count">{insOuts.ins.length}</span>
                </span>
                {insOuts.ins.length === 0 ? (
                  <span className="sw1-inouts__empty">No changes in</span>
                ) : (
                  insOuts.ins.map((p, i) => (
                    <span key={`in-${i}`} className="sw1-inouts__chip sw1-inouts__chip--in">
                      {p.number && <b>{p.number}</b>} {p.name}
                    </span>
                  ))
                )}
              </div>
              <div className="sw1-inouts__col">
                <span className="sw1-inouts__head sw1-inouts__head--out">
                  Out <span className="sw1-inouts__count">{insOuts.outs.length}</span>
                </span>
                {insOuts.outs.length === 0 ? (
                  <span className="sw1-inouts__empty">No changes out</span>
                ) : (
                  insOuts.outs.map((p, i) => (
                    <span key={`out-${i}`} className="sw1-inouts__chip sw1-inouts__chip--out">
                      {p.number && <b>{p.number}</b>} {p.name}
                    </span>
                  ))
                )}
              </div>
            </div>
            {onRefreshInsOuts && (
              <button type="button" className="sw1-btn sw1-inouts__refresh" onClick={onRefreshInsOuts}>
                Refresh
              </button>
            )}
          </div>
        )}
      </details>

      {/* Team list */}
      <details className="sw1-section" open={!isNarrow}>
        <summary>Team list</summary>

      {/* Save right where you build the team (mirrors the database card up top) */}
      <div className="sw1-teamsave">
        <button
          type="button"
          className="sw1-btn sw1-btn--primary sw1-teamsave__btn"
          onClick={onSaveToDb}
          disabled={!dbConfigured || dbState === 'loading' || dbState === 'saving'}
        >
          {dbState === 'saving' ? 'Saving…' : 'Save this team'}
        </button>
        {!dbConfigured ? (
          <span className="sw1-teamsave__hint">Connect the database (top of panel) to save.</span>
        ) : dbMsg ? (
          <span className={`sw1-teamsave__msg ${dbState === 'error' ? 'is-err' : ''}`}>{dbMsg}</span>
        ) : (
          <span className="sw1-teamsave__hint">Saves as its own team by round &amp; date — reload &amp; edit it any week.</span>
        )}
      </div>

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
        <button
          className="sw1-btn"
          onClick={onLoadDemo}
          title="Loads the built-in example team (Riverton Hawks) so you can see a full line-up. This is just a demo — it doesn't touch your saved teams in the database."
        >
          Load example team
        </button>
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
        onSetRole={onSetRole}
        onRemovePlayer={onRemovePlayer}
        onUpdatePlayer={onUpdatePlayer}
      />
      </details>

      {/* Footer — upgrade CTA + SportsWeb link */}
      <footer className="sw1-appfoot">
        <a className="sw1-upgrade" href={SPORTSWEB_UPGRADE} target="_blank" rel="noopener noreferrer">
          <strong>Upgrade to a premium SportsWeb One website</strong>
          <span>Match your team apps — and get this app free →</span>
        </a>
        <a className="sw1-appfoot__link" href={SPORTSWEB_URL} target="_blank" rel="noopener noreferrer">
          Powered by SportsWeb One · sportsweb.com.au
        </a>
      </footer>
    </aside>
  );
}
