import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Club, MatchInfo, Player, PlayerStatus, PositionKey, Sponsor, VisualMode } from '../types';
import type { SavedSheet, OpponentClub, ClubPlayer } from '../lib/source';
import type { SlotDef } from '../lib/field';
import SquadList, { type QuickTarget } from './SquadList';
import { SHOW_EMBED } from '../lib/config';
import appLogo from '../assets/app-logo.png';

/** Outbound SportsWeb links (single place to update the domain). */
const SPORTSWEB_CONTACT = 'https://sportsweb.com.au/contact';

/** Click Sports Media — media days, sports photography & banner artwork. */
const CLICK_SPORTS_MEDIA_URL = 'https://clicksportsmedia.com/media-days';
const SPORTSWEB_BANNERS_URL = 'https://sportsweb.com.au/contact';
/** In-app how-to guides (update to the live URLs when published). */
const HEADSHOT_GUIDE_URL = 'https://clicksportsmedia.com/guides/headshots';
const BULK_IMPORT_GUIDE_URL = 'https://clicksportsmedia.com/guides/bulk-import';

/** Quick-start walkthrough video — drop in a real embed URL when available. */
const QUICKSTART_VIDEO_URL = '';

type LogoTarget = 'home' | 'away';

/** 8:00 AM → 7:45 PM in 15-minute steps, for the kick-off time dropdown. */
const ROUND_OPTIONS: string[] = [
  'Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Round 7', 'Round 8',
  'Round 9', 'Round 10', 'Round 11', 'Round 12', 'Round 13', 'Round 14', 'Round 15', 'Round 16',
  'Round 17', 'Round 18', 'Round 19', 'Round 20', 'Round 21', 'Round 22', 'Round 23',
  'Elimination Final', 'Qualifying Final', 'Semi Final', 'Preliminary Final', 'Grand Final',
  'Practice match',
];

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
  fieldSlots: SlotDef[];
  positions: Partial<Record<PositionKey, string>>;
  onQuickPlace: (id: string, target: QuickTarget) => void;
  visualMode: VisualMode;
  selectedPlayerId: string | null;
  onVisualMode: (m: VisualMode) => void;
  /** ONE jumper image for the whole team (used in Jumper mode). */
  teamJumperUrl?: string;
  onTeamJumper?: (dataUrl: string) => void;
  vsStyle?: 'chrome' | 'split';
  onVsStyle?: (s: 'chrome' | 'split') => void;
  /** Competition / extra logos shown top-right of the header (any number). */
  competitionLogos?: string[];
  onAddCompetitionLogo?: (dataUrl: string) => void;
  onRemoveCompetitionLogo?: (index: number) => void;
  onSelect: (id: string) => void;
  onAddPlayer: (number: string, name: string) => void;
  onImport: (rows: { number: string; name: string; headshotUrl?: string }[]) => void;
  onSetAvailability: (id: string, reason: PlayerStatus | null) => void;
  onSetRole: (id: string, role: PlayerStatus, on: boolean) => void;
  onRemovePlayer: (id: string) => void;
  onSetPlayerImage: (id: string, kind: 'headshot' | 'jumper', dataUrl: string | null) => void;
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
  onSponsorHref?: (index: number, href: string) => void;
  onAddSponsor: () => void;
  onRemoveSponsor: (index: number) => void;
  /** Saved banner library (all the club's banners) + actions for the picker. */
  bannerLibrary?: Sponsor[];
  onAddSavedBanner?: (b: Sponsor) => void;
  onRemoveLibraryBanner?: (id: string) => void;
  onRotationMs: (ms: number) => void;
  advertiseHref?: string;
  onAdvertiseHref?: (href: string) => void;
  advertiseEnabled?: boolean;
  onAdvertiseEnabled?: (on: boolean) => void;
  rotationMs?: number;
  // database (SportsWeb One / Supabase)
  dbConfigured: boolean;
  dbState: 'idle' | 'loading' | 'saving' | 'ok' | 'error';
  dbMsg: string;
  onNewTeam?: () => void;
  savedSheets?: SavedSheet[];
  currentFixtureId?: string | null;
  onLoadSheet?: (fixtureId: string) => void;
  onDeleteSheet?: (fixtureId: string) => void;
  onCopyEmbed?: () => void;
  onCopyTeamEmbed?: () => void;
  /** Every other club on file — picking one preloads the opponent name + logo. */
  opponentClubs?: OpponentClub[];
  /** Media-officer opposition directory management. */
  onAddOpponentClub?: (name: string, logoUrl: string | null) => void | Promise<void>;
  onDeleteOpponentClub?: (id: string) => void | Promise<void>;
  /** Players from OTHER teams at this club — opt-in cross-team search. */
  clubPlayers?: ClubPlayer[];
  onAddClubPlayer?: (p: ClubPlayer) => void;
  onClone?: () => void;
  /** Ins & Outs vs last week (admin reference only). Null until a prior round exists. */
  insOuts?: { round: string | null; ins: { number: string; name: string }[]; outs: { number: string; name: string }[] } | null;
  onRefreshInsOuts?: () => void;
  // background watermark
  wmSource: 'clubName' | 'clubLogo' | 'sponsorName' | 'sponsorLogo' | 'specialRound';
  onWmSource: (s: 'clubName' | 'clubLogo' | 'sponsorName' | 'sponsorLogo' | 'specialRound') => void;
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
  fieldSlots,
  positions,
  onQuickPlace,
  visualMode,
  selectedPlayerId,
  onVisualMode,
  teamJumperUrl,
  onTeamJumper,
  vsStyle,
  onVsStyle,
  competitionLogos = [],
  onAddCompetitionLogo,
  onRemoveCompetitionLogo,
  onSelect,
  onAddPlayer,
  onImport,
  onSetAvailability,
  onSetRole,
  onRemovePlayer,
  onSetPlayerImage,
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
  onSponsorHref,
  onAddSponsor,
  onRemoveSponsor,
  bannerLibrary = [],
  onAddSavedBanner,
  onRemoveLibraryBanner,
  onRotationMs,
  rotationMs = 3800,
  advertiseHref,
  onAdvertiseHref,
  advertiseEnabled = true,
  onAdvertiseEnabled,
  dbConfigured,
  dbState,
  dbMsg,
  onNewTeam,
  savedSheets = [],
  currentFixtureId,
  onLoadSheet,
  onDeleteSheet,
  onCopyEmbed,
  onCopyTeamEmbed,
  opponentClubs = [],
  onAddOpponentClub,
  onDeleteOpponentClub,
  clubPlayers = [],
  onAddClubPlayer,
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
  const [showBulk, setShowBulk] = useState(false);

  const [teamSearch, setTeamSearch] = useState('');
  const quickRef = useRef<HTMLDetailsElement>(null);
  // Opposition-clubs directory (media officer)
  const [oppName, setOppName] = useState('');
  const [oppLogo, setOppLogo] = useState<string | null>(null);
  const [oppBusy, setOppBusy] = useState(false);
  const [addLogo, setAddLogo] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [gradeNew, setGradeNew] = useState(false);
  const [oppNew, setOppNew] = useState(false);
  const [venueNew, setVenueNew] = useState(false);


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
        // Format: number, name[, headshot image URL]
        const parts = l.split(',').map((s) => s.trim());
        const number = parts[0] || '';
        let nameParts = parts.slice(1);
        let headshotUrl: string | undefined;
        const last = nameParts[nameParts.length - 1];
        if (last && /^https?:\/\//i.test(last)) {
          headshotUrl = last;
          nameParts = nameParts.slice(0, -1);
        }
        return { number, name: nameParts.join(', ').trim(), headshotUrl };
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
  const uploadTeamJumper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onTeamJumper) onTeamJumper(await readAsDataUrl(file));
  };
  const uploadSponsor = (index: number) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSponsorLogo(index, await readAsDataUrl(file));
  };
  const uploadCompetitionLogos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) onAddCompetitionLogo?.(await readAsDataUrl(file));
    e.target.value = ''; // allow re-selecting the same file
  };

  const rotating = sponsors?.rotating ?? [];

  // Suggestions derived from this club's saved sheets (grade, venue, opponents).
  const uniq = (xs: (string | null)[]) =>
    Array.from(new Set(xs.map((x) => (x ?? '').trim()).filter(Boolean)));
  const pastGrades = uniq(savedSheets.map((s) => s.grade));
  const pastVenues = uniq(savedSheets.map((s) => s.venue));

  // Opponent options for the dropdown: the saved opposition directory/clubs
  // (which carry a logo + can be FK-linked) MERGED with past opponents pulled
  // from saved sheets (which carry the logo that was used at the time). Keyed
  // by lower-cased name so a club that's both in the directory and a past
  // opponent only appears once — and a directory entry missing a logo can
  // borrow one from history.
  const oppByName = new Map<
    string,
    { name: string; logoUrl: string | null; clubId: string | null }
  >();
  for (const c of opponentClubs) {
    const key = c.name.trim().toLowerCase();
    if (key && !oppByName.has(key)) {
      oppByName.set(key, {
        name: c.name,
        logoUrl: c.logoUrl ?? null,
        clubId: c.source === 'club' ? c.id : null,
      });
    }
  }
  for (const s of savedSheets) {
    const nm = (s.opponent ?? '').trim();
    if (!nm) continue;
    const key = nm.toLowerCase();
    const ex = oppByName.get(key);
    if (!ex) oppByName.set(key, { name: nm, logoUrl: s.opponentLogo ?? null, clubId: null });
    else if (!ex.logoUrl && s.opponentLogo) ex.logoUrl = s.opponentLogo;
  }
  const oppOptions = Array.from(oppByName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const opponentSaved =
    !!match.opponent.trim() &&
    opponentClubs.some(
      (c) => c.name.trim().toLowerCase() === match.opponent.trim().toLowerCase(),
    );

  return (
    <aside className="sw1-admin">
      {/* App branding — Footy Team Line Ups, powered by SportsWeb One */}
      <header className="sw1-appbrand">
        <div className="sw1-appbrand__id">
          <img className="sw1-appbrand__logo" src={appLogo} alt="" />
          <div className="sw1-appbrand__idtext">
            <strong className="sw1-appbrand__title">Footy Team Line Ups</strong>
          </div>
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

      {/* Quick start — guide + walkthrough video (collapsed on mobile) */}
      <details name="sw1adm" className="sw1-section sw1-quick" ref={quickRef}>
        <summary>Quick Start Guide</summary>
        <div className="sw1-quick__body">
          <div className="sw1-quick__video">
            {QUICKSTART_VIDEO_URL ? (
              <iframe
                src={QUICKSTART_VIDEO_URL}
                title="Footy Team Line Ups — quick start"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <span className="sw1-quick__videoph">▶ Walkthrough video coming soon</span>
            )}
          </div>
          <ol className="sw1-quick__steps">
            <li><strong>Match &amp; branding</strong> — open that section and fill in the round, grade, opponent, date and venue. Set your club colours, upload your home &amp; away logos, and pick your <em>VS style</em> (Chrome or Two-tone).</li>
            <li><strong>Pick the team's look</strong> — in <em>Team Squad</em>, choose <em>Jumper</em>, <em>Headshot</em> or <em>No image</em>. For Jumper, upload one team jumper image. For Headshots, add them per player (<em>✎ Edit</em>) or in bulk — or book a Click Sports Media media day.</li>
            <li><strong>Add your squad</strong> — type players in, or use <em>Bulk import</em> (one per line: <em>number, name</em>, and an optional photo URL on the end).</li>
            <li><strong>Pick the side</strong> — tap a player, then tap a spot on the ground (or use <em>Add to position</em>). Fill the 15 field spots, the 3 Followers, then Interchange and Emergencies.</li>
            <li><strong>Roles &amp; availability</strong> — use the C / VC / Debut / Milestone chips, and the availability dropdown for ins, outs and injuries.</li>
            <li><strong>Sponsors (optional)</strong> — add rotating sponsor banners (design them at 4:1, around 1200×300 so they read on phones) and paste each sponsor's link. They rotate above the ground — real exposure you can sell.</li>
            <li><strong>Save or Publish</strong> — <em>Save draft</em> keeps it private; <em>Publish</em> makes it live on your website. Each round is saved on its own.</li>
            <li><strong>Share it everywhere</strong> — <em>Download graphic</em> or the <em>Instagram</em> image for socials, copy the <em>auto-updating</em> embed onto your club site, <em>Print</em> an A3 for the rooms (with a QR), or cast the public link to club TV screens.</li>
          </ol>
          <a className="sw1-quick__chat" href={SPORTSWEB_CONTACT} target="_blank" rel="noopener noreferrer">
            Need a hand? Chat with the SportsWeb team →
          </a>
        </div>
      </details>

      {/* Hosting & sharing options — where this can live */}
      <details name="sw1adm" className="sw1-section">
        <summary>Hosting &amp; sharing options</summary>
        <div className="sw1-hosting">
          <p>Three easy ways to get your line-ups in front of members:</p>
          <ul>
            <li><strong>Free hosted subdomain</strong> — complimentary with us. We host your teams on a club-branded link you can share anywhere and put on your club screens.</li>
            <li><strong>Embed on your own site</strong> — paste one auto-updating snippet into your existing website; publish each round and it refreshes itself.</li>
            <li><strong>Get a site with us</strong> — we'll build and set it all up for you. On the <strong>Premium Website plan the app is included free</strong>.</li>
          </ul>
          <p className="sw1-hosting__rooms"><strong>In the rooms:</strong> Print an A3 for the change rooms, or cast the public link to your club TV screens — more eyes on your sponsors.</p>
          <a className="sw1-quick__chat" href={SPORTSWEB_CONTACT} target="_blank" rel="noopener noreferrer">
            Set up hosting with SportsWeb →
          </a>
        </div>
      </details>

      {/* Saved teams — load & manage (collapsible). Saving/publishing lives in the top bar. */}
      <details name="sw1adm" className="sw1-section sw1-section--start">
        <summary><span className="sw1-starthere">Start here</span>New &amp; Saved teams — load, recall &amp; embed</summary>
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
              {savedSheets.length > 6 && (
                <input
                  type="search"
                  className="sw1-db__teamsearch"
                  value={teamSearch}
                  placeholder="Filter by round, grade, date or opponent…"
                  onChange={(e) => setTeamSearch(e.target.value)}
                />
              )}
              <select
                className="sw1-db__select"
                value={currentFixtureId ?? ''}
                onChange={(e) => e.target.value && onLoadSheet?.(e.target.value)}
              >
                <option value="">Pick a recent team to load &amp; edit…</option>
                {savedSheets
                  .filter((s) => {
                    const term = teamSearch.trim().toLowerCase();
                    return !term || savedSheetLabel(s).toLowerCase().includes(term);
                  })
                  .map((s) => (
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
                {SHOW_EMBED && onCopyTeamEmbed && (
                  <button type="button" className="sw1-btn sw1-db__embedbtn" onClick={onCopyTeamEmbed}>
                    Copy this team's embed code
                  </button>
                )}
                {SHOW_EMBED && onCopyEmbed && (
                  <button type="button" className="sw1-btn sw1-db__embedbtn" onClick={onCopyEmbed}>
                    Copy auto-updating embed (latest for this grade)
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
            Each round/date saves as its own team. Hit <strong>Save team</strong> in the top
            bar to store the current sheet; pick a recent team above to reload and edit it.
          </p>
        )}
      </div>
      </details>

      {/* Match & branding */}
      <details name="sw1adm" className="sw1-brand sw1-section">
        <summary>Match &amp; branding</summary>

        <div className="sw1-brand__grid">
          <label><span className="sw1-step">1</span>Club<input value={club.name} onChange={(e) => onClub({ name: e.target.value })} /></label>
          <label><span className="sw1-step">2</span>Opponent
            {/* A real dropdown (not a type-to-filter box): the whole opponent
                list is always visible. Each option carries its logo — directory
                clubs and past opponents alike — so picking one loads the right
                logo and clears any stale one. "Add a new opponent" switches to a
                text field where you can also save it (+ logo) below. */}
            {oppNew ? (
              <input
                value={match.opponent}
                placeholder="New opponent name"
                autoFocus
                onChange={(e) => onMatch({ opponent: e.target.value, opponentClubId: null })}
                onBlur={() => {
                  if (oppOptions.length > 0 && !match.opponent.trim()) setOppNew(false);
                }}
              />
            ) : (
              <select
                value={match.opponent}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__new__') {
                    onMatch({ opponent: '', opponentLogoUrl: null, opponentClubId: null });
                    setOppNew(true);
                    return;
                  }
                  const o = oppByName.get(v.trim().toLowerCase());
                  // Always set the logo to this opponent's (or null) so the
                  // previous opponent's logo never lingers.
                  onMatch({
                    opponent: v,
                    opponentLogoUrl: o?.logoUrl ?? null,
                    opponentClubId: o?.clubId ?? null,
                  });
                }}
              >
                <option value="">Select opponent…</option>
                {match.opponent.trim() &&
                  !oppByName.has(match.opponent.trim().toLowerCase()) && (
                    <option value={match.opponent}>{match.opponent}</option>
                  )}
                {oppOptions.map((o) => (
                  <option key={o.name} value={o.name}>{o.name}</option>
                ))}
                <option value="__new__">➕ Add a new opponent…</option>
              </select>
            )}
          </label>

          {/* Add a brand-new opponent inline (+ logo) when the typed name isn't saved */}
          {onAddOpponentClub && dbConfigured && match.opponent.trim() && !opponentSaved && (
            <div className="sw1-oppadd">
              <span className="sw1-oppadd__msg"><strong>{match.opponent.trim()}</strong> isn&rsquo;t saved yet — add it so its logo loads next time.</span>
              <label className="sw1-oppadd__logo">
                {addLogo ? <img src={addLogo} alt="" /> : 'Add logo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setAddLogo(await readAsDataUrl(f));
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="sw1-btn sw1-btn--primary"
                disabled={addBusy}
                onClick={async () => {
                  if (!onAddOpponentClub) return;
                  const name = match.opponent.trim();
                  setAddBusy(true);
                  try {
                    await onAddOpponentClub(name, addLogo);
                    if (addLogo) onMatch({ opponentLogoUrl: addLogo });
                    setAddLogo(null);
                    setOppNew(false);
                  } finally {
                    setAddBusy(false);
                  }
                }}
              >
                {addBusy ? 'Adding…' : `Add "${match.opponent.trim()}"`}
              </button>
            </div>
          )}

          {onAddOpponentClub && dbConfigured && (
            <details className="sw1-oppdir">
              <summary>Opposition clubs ({opponentClubs.filter((c) => c.source === 'directory').length})</summary>
              <p className="sw1-oppdir__hint">
                Add the clubs you play against and their logos once — they then appear in the Opponent
                picker above for every round. (For the media officer / team manager.)
              </p>
              <div className="sw1-oppdir__add">
                <input
                  className="sw1-oppdir__name"
                  value={oppName}
                  placeholder="Opposition club name"
                  onChange={(e) => setOppName(e.target.value)}
                />
                <label className="sw1-oppdir__logo">
                  {oppLogo ? <img src={oppLogo} alt="" /> : 'Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setOppLogo(await readAsDataUrl(f));
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="sw1-btn sw1-btn--primary"
                  disabled={!oppName.trim() || oppBusy}
                  onClick={async () => {
                    if (!oppName.trim() || !onAddOpponentClub) return;
                    setOppBusy(true);
                    try {
                      await onAddOpponentClub(oppName.trim(), oppLogo);
                      setOppName('');
                      setOppLogo(null);
                    } finally {
                      setOppBusy(false);
                    }
                  }}
                >
                  {oppBusy ? 'Adding…' : 'Add club'}
                </button>
              </div>
              <ul className="sw1-oppdir__list">
                {opponentClubs.filter((c) => c.source === 'directory').length === 0 && (
                  <li className="sw1-oppdir__empty">No opposition clubs added yet.</li>
                )}
                {opponentClubs
                  .filter((c) => c.source === 'directory')
                  .map((c) => (
                    <li key={c.id}>
                      <span className="sw1-oppdir__crest">
                        {c.logoUrl ? <img src={c.logoUrl} alt="" /> : <span className="sw1-oppdir__noLogo">—</span>}
                      </span>
                      <span className="sw1-oppdir__cname">{c.name}</span>
                      {onDeleteOpponentClub && (
                        <button
                          type="button"
                          className="sw1-oppdir__del"
                          aria-label={`Remove ${c.name}`}
                          onClick={() => onDeleteOpponentClub(c.id)}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <label><span className="sw1-step">3</span>Round
            <select value={match.round} onChange={(e) => onMatch({ round: e.target.value })}>
              <option value="">Select round…</option>
              {match.round && !ROUND_OPTIONS.includes(match.round) && (
                <option value={match.round}>{match.round}</option>
              )}
              {ROUND_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label><span className="sw1-step">4</span>Grade
            {gradeNew || (pastGrades.length === 0 && !match.grade.trim()) ? (
              <input
                value={match.grade}
                placeholder="e.g. Seniors, Reserves, U18"
                autoFocus={gradeNew}
                onChange={(e) => onMatch({ grade: e.target.value })}
                onBlur={() => {
                  if (pastGrades.length > 0 && !match.grade.trim()) setGradeNew(false);
                }}
              />
            ) : (
              <select
                value={match.grade}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    onMatch({ grade: '' });
                    setGradeNew(true);
                  } else {
                    onMatch({ grade: e.target.value });
                  }
                }}
              >
                <option value="">Select grade…</option>
                {match.grade && !pastGrades.includes(match.grade) && (
                  <option value={match.grade}>{match.grade}</option>
                )}
                {pastGrades.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
                <option value="__new__">➕ Add a new grade…</option>
              </select>
            )}
          </label>
          <label><span className="sw1-step">5</span>Date<input
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
            <span className="sw1-step">6</span>Time
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
          <label className="sw1-brand__full"><span className="sw1-step">7</span>Venue
            {venueNew || (pastVenues.length === 0 && !match.venue.trim()) ? (
              <input
                value={match.venue}
                placeholder="e.g. Kardinia Park — Oval 2"
                autoFocus={venueNew}
                onChange={(e) => onMatch({ venue: e.target.value })}
                onBlur={() => {
                  if (pastVenues.length > 0 && !match.venue.trim()) setVenueNew(false);
                }}
              />
            ) : (
              <select
                value={match.venue}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    onMatch({ venue: '' });
                    setVenueNew(true);
                  } else {
                    onMatch({ venue: e.target.value });
                  }
                }}
              >
                <option value="">Select venue…</option>
                {match.venue && !pastVenues.includes(match.venue) && (
                  <option value={match.venue}>{match.venue}</option>
                )}
                {pastVenues.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
                <option value="__new__">➕ Add a new venue…</option>
              </select>
            )}
          </label>
          <label className="sw1-brand__full">Competition / league<input value={match.competition ?? ''} onChange={(e) => onMatch({ competition: e.target.value })} placeholder="e.g. Eastern Football Netball League" /></label>
          <label className="sw1-brand__color">Primary<input type="color" value={club.primaryColor} onChange={(e) => onClub({ primaryColor: e.target.value })} /></label>
          <label className="sw1-brand__color">Secondary<input type="color" value={club.secondaryColor} onChange={(e) => onClub({ secondaryColor: e.target.value })} /></label>
        </div>

        {onVsStyle && (
          <div className="sw1-vsstyle">
            <span className="sw1-vsstyle__label">Centre "VS" style</span>
            <div className="sw1-admin__modes">
              <button
                type="button"
                className={`sw1-chip ${(vsStyle ?? 'chrome') === 'chrome' ? 'is-active' : ''}`}
                onClick={() => onVsStyle('chrome')}
              >
                Chrome ⚡
              </button>
              <button
                type="button"
                className={`sw1-chip ${vsStyle === 'split' ? 'is-active' : ''}`}
                onClick={() => onVsStyle('split')}
              >
                Two-tone split
              </button>
            </div>
          </div>
        )}

        <div className="sw1-brand__logos">
          <label>Home logo
            <input type="file" accept="image/*" onChange={uploadLogo('home')} />
            {club.logoUrl ? (
              <span className="sw1-logoset"><img src={club.logoUrl} alt="" /> ✓ Current logo set — choose a file to replace</span>
            ) : (
              <span className="sw1-logoset sw1-logoset--empty">No logo yet</span>
            )}
          </label>
          <label>Away logo
            <input type="file" accept="image/*" onChange={uploadLogo('away')} />
            {match.opponentLogoUrl ? (
              <span className="sw1-logoset"><img src={match.opponentLogoUrl} alt="" /> ✓ Current logo set — choose a file to replace</span>
            ) : (
              <span className="sw1-logoset sw1-logoset--empty">No logo yet</span>
            )}
          </label>
        </div>

        {/* Competition / extra logos — its own collapsible action, separated from
            the Home/Away uploads so it reads as a distinct step. */}
        <details className="sw1-complogos" open>
          <summary className="sw1-complogos__summary">
            Competition / extra logos (top-right){competitionLogos.length > 0 ? ` · ${competitionLogos.length}` : ''}
          </summary>
          <label className="sw1-complogos__add">
            <input type="file" accept="image/*" multiple onChange={uploadCompetitionLogos} />
            <span className="sw1-admin__hint">Add your league/competition logo — or pop another sponsor's logo up here. Add as many as you like; they sit top-right of the header.</span>
          </label>
          {competitionLogos.length > 0 && (
            <div className="sw1-complogos__list">
              {competitionLogos.map((src, i) => (
                <div key={i} className="sw1-complogos__item">
                  <img src={src} alt="" />
                  <button
                    type="button"
                    className="sw1-complogos__del"
                    onClick={() => onRemoveCompetitionLogo?.(i)}
                    aria-label="Remove logo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </details>

        <div className="sw1-sponsorpanel">
          <div className="sw1-sponsorpanel__head">
            <div>
              <strong>Sponsor banner rotation</strong>
              <span>Upload sold banner ads to rotate above the ground</span>
            </div>
          </div>

          <p className="sw1-admin__hint sw1-admin__hint--links">
            Design banners at a <strong>4:1 ratio</strong> — e.g. <strong>1200 × 300&nbsp;px</strong> in
            Canva — so they read clearly on phones <em>and</em> desktop above the ground.{' '}
            <a href={SPORTSWEB_BANNERS_URL} target="_blank" rel="noopener noreferrer">
              Want one done professionally? SportsWeb Australia banners from $25 →
            </a>
          </p>

          <div className="sw1-brand__logos">
            {rotating.map((s, i) => (
              <label key={i}>
                Banner {i + 1}
                <span className="sw1-sponsorpanel__row">
                  <input type="file" accept="image/*" onChange={uploadSponsor(i)} />
                  {s.bannerUrl && <span className="sw1-logoset__tag">✓ set</span>}
                  <button type="button" className="sw1-sponsorpanel__x" onClick={() => onRemoveSponsor(i)} title="Remove this banner slot">
                    ✕
                  </button>
                </span>
                {s.bannerUrl ? (
                  <img className="sw1-sponsorpanel__preview" src={s.bannerUrl} alt={`Banner ${i + 1} preview`} />
                ) : (
                  <span className="sw1-sponsorpanel__preview sw1-sponsorpanel__preview--empty">No banner yet</span>
                )}
                {onSponsorHref && (
                  <input
                    className="sw1-sponsorpanel__href"
                    type="url"
                    inputMode="url"
                    value={s.href ?? ''}
                    onChange={(e) => onSponsorHref(i, e.target.value)}
                    placeholder="Sponsor website (https://…) — banner links here"
                  />
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

          {onAddSavedBanner && bannerLibrary.length > 0 && (
            <div className="sw1-bannerlib">
              <label className="sw1-bannerlib__add">
                Re-use a saved banner
                <select
                  value=""
                  disabled={rotating.length >= 5}
                  onChange={(e) => {
                    const b = bannerLibrary.find((x) => x.id === e.target.value);
                    if (b) onAddSavedBanner(b);
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">
                    {rotating.length >= 5 ? 'Rotation full (max 5)' : 'Add a saved banner…'}
                  </option>
                  {bannerLibrary
                    .filter((b) => b.id && !rotating.some((r) => r.id === b.id))
                    .map((b) => (
                      <option key={b.id} value={b.id}>{b.name || 'Untitled banner'}</option>
                    ))}
                </select>
              </label>
              <details className="sw1-bannerlib__manage">
                <summary>Manage saved banners ({bannerLibrary.length})</summary>
                <p className="sw1-admin__hint">
                  Your banners are kept here so you can redeploy them on any round. Deleting one
                  removes it from the library and from any sheet using it.
                </p>
                <div className="sw1-bannerlib__list">
                  {bannerLibrary.map((b) => (
                    <div key={b.id} className="sw1-bannerlib__item">
                      {b.bannerUrl ? (
                        <img src={b.bannerUrl} alt="" />
                      ) : (
                        <span className="sw1-bannerlib__noimg">{b.name || '—'}</span>
                      )}
                      <span className="sw1-bannerlib__name">{b.name || 'Untitled'}</span>
                      <button
                        type="button"
                        className="sw1-bannerlib__del"
                        title="Delete from library"
                        onClick={() => {
                          if (
                            b.id &&
                            window.confirm(
                              `Delete "${b.name || 'this banner'}" from your saved banners? It will be removed from any sheet using it.`,
                            )
                          ) {
                            onRemoveLibraryBanner?.(b.id);
                          }
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="sw1-advertise">
            <label className="sw1-advertise__toggle">
              <input
                type="checkbox"
                checked={advertiseEnabled}
                onChange={(e) => onAdvertiseEnabled?.(e.target.checked)}
              />
              Show the &ldquo;Advertise with us&rdquo; tag on the banner
            </label>
            <label className="sw1-advertise__label">
              &ldquo;Advertise with us&rdquo; link
              <input
                className="sw1-sponsorpanel__href"
                type="text"
                inputMode="email"
                value={advertiseHref ?? ''}
                onChange={(e) => onAdvertiseHref?.(e.target.value)}
                placeholder="president@geelongaflmasters.com.au"
                disabled={!advertiseEnabled}
              />
            </label>
            <span className="sw1-admin__hint">
              When on, the small &ldquo;Advertise with us&nbsp;&rarr;&rdquo; tag shows on the banner
              (public &amp; embed views) and links here. Enter an email (we&rsquo;ll turn it into a
              mailto: link) or a full URL. Leave blank to use the default club enquiries email.
              Turn the toggle off to hide the tag entirely.
            </span>
          </div>
        </div>

        {/* Background watermark behind the oval */}
        <div className="sw1-watermarkpanel">
          <strong>Background behind the oval</strong>
          <p className="sw1-admin__hint">The faint graphic shown behind the players. Show your <strong>club name or logo</strong>, a <strong>sponsor&rsquo;s name or logo</strong> &mdash; or choose <strong>Special round</strong> to type a note like <strong>ANZAC DAY</strong> or <strong>FINAL</strong>.</p>
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
                <option value="specialRound">Special round (text)</option>
              </select>
            </label>
            {(wmSource === 'sponsorName' || wmSource === 'sponsorLogo' || wmSource === 'specialRound') && (
              <label>
                {wmSource === 'specialRound' ? 'Special round note' : 'Sponsor name'}
                <input
                  type="text"
                  value={wmSponsorName}
                  onChange={(e) => onWmSponsorName(e.target.value)}
                  placeholder={wmSource === 'specialRound' ? 'e.g. ANZAC DAY' : 'e.g. Riverton Motors'}
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
      <details name="sw1adm" className="sw1-section">
        <summary>Playing list</summary>
        {playingList}
      </details>

      {/* Ins & Outs vs last week — admin reference only (never on the public graphic) */}
      <details name="sw1adm" className="sw1-section">
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

      {/* Team Squad */}
      <details name="sw1adm" className="sw1-section">
        <summary>Team Squad</summary>

      <div className="sw1-admin__modes">
        {(['jumper', 'headshot', 'none'] as VisualMode[]).map((m) => (
          <button key={m} className={`sw1-chip ${visualMode === m ? 'is-active' : ''}`} onClick={() => onVisualMode(m)}>
            {m === 'jumper' ? 'Jumper' : m === 'headshot' ? 'Headshot' : 'No image'}
          </button>
        ))}
      </div>

      {/* Team jumper: ONE image for the whole side (used in Jumper mode). */}
      {onTeamJumper && (
        <div className="sw1-teamjumper">
          <div className="sw1-teamjumper__row">
            <label className="sw1-btn sw1-teamjumper__btn">
              {teamJumperUrl ? 'Replace team jumper' : 'Upload team jumper image'}
              <input type="file" accept="image/*" hidden onChange={uploadTeamJumper} />
            </label>
            {teamJumperUrl && (
              <>
                <img className="sw1-teamjumper__preview" src={teamJumperUrl} alt="Team jumper" />
                <button type="button" className="sw1-teamjumper__clear" onClick={() => onTeamJumper('')}>
                  Clear
                </button>
              </>
            )}
          </div>
          <p className="sw1-admin__hint sw1-teamjumper__help">
            <span className="sw1-helpdot" title="How to get a jumper image" aria-hidden="true">i</span>
            <strong>Where do I get a jumper image?</strong> Ask your jumper supplier for a product shot, or reach out to us at SportsWeb and for a small fee we&rsquo;ll generate it for you. Best result: a <strong>square PNG with a see-through (transparent) background, about 600&times;600&nbsp;px</strong>. More in the Quick Start &amp; Help guide.
          </p>
          <p className="sw1-admin__hint">
            <strong>One jumper for the whole team</strong> — shown on every player when the mode above is set to
            <strong> Jumper</strong>. <strong>Headshots are per player</strong> — add them with each player's
            <strong> ✎ Edit</strong> button below (or bulk import with a photo URL).
          </p>
        </div>
      )}

      {/* Player imagery: pro option + DIY guide. */}
      <a className="sw1-mediaday" href={CLICK_SPORTS_MEDIA_URL} target="_blank" rel="noopener noreferrer">
        <span className="sw1-mediaday__icon" aria-hidden="true">📸</span>
        <span className="sw1-mediaday__text">
          <strong>Get Click Sports Media to run a media day</strong>
          <span>High-quality headshots &amp; properly rendered jumper images — we operate Australia-wide →</span>
        </span>
      </a>
      <p className="sw1-admin__hint sw1-admin__hint--links">
        Doing your own?{' '}
        <a href={HEADSHOT_GUIDE_URL} target="_blank" rel="noopener noreferrer">See our headshot guide</a>{' '}
        for the right size, framing and background.
      </p>

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
        <button className="sw1-btn" onClick={() => setShowBulk((v) => !v)} aria-expanded={showBulk}>
          {showBulk ? 'Hide bulk import' : 'Bulk import'}
        </button>
      </div>

      {showBulk && (
        <div className="sw1-admin__bulk">
          <p className="sw1-admin__hint sw1-admin__hint--links">
            One player per line as <strong>number, name</strong> — and optionally a headshot image
            URL as a third column. Paste straight from a spreadsheet (CSV) saved as
            <em> number, name, headshot URL</em>.{' '}
            <a href={BULK_IMPORT_GUIDE_URL} target="_blank" rel="noopener noreferrer">See the bulk-import guide →</a>
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={'17, Jack Reardon, https://yourclub.com/photos/reardon.jpg\n10, Tom Wallis'}
          />
          <button className="sw1-btn" onClick={importRows}>Import players</button>
        </div>
      )}

      <div className="sw1-admin__add">
        <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="No. (optional)" inputMode="numeric" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" />
        <button className="sw1-btn sw1-btn--primary" onClick={add}>Add</button>
      </div>
      {addMsg && (
        <p className={`sw1-addmsg ${addMsg.ok ? 'is-ok' : 'is-err'}`}>{addMsg.text}</p>
      )}

      <SquadList
        players={players}
        location={squadLocation}
        fieldSlots={fieldSlots}
        positions={positions}
        selectedPlayerId={selectedPlayerId}
        onSelect={onSelect}
        onSetAvailability={onSetAvailability}
        onSetRole={onSetRole}
        onQuickPlace={onQuickPlace}
        onRemovePlayer={onRemovePlayer}
        onSetPlayerImage={onSetPlayerImage}
        onUpdatePlayer={onUpdatePlayer}
        clubPlayers={clubPlayers}
        onAddClubPlayer={onAddClubPlayer}
      />
      </details>

    </aside>
  );
}
