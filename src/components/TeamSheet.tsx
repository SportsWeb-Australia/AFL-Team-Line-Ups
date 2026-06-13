import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type {
  BenchArea,
  Player,
  PlayerStatus,
  PositionKey,
  RenderMode,
  TeamSheetData,
  VisualMode,
} from '../types';
import { FIELD_SLOTS, FIELD_SLOTS_MOBILE, LINE_LABELS, BENCH_TITLES, FOLLOWER_LABELS } from '../lib/field';
import MatchHeader from './MatchHeader';
import RotatingBanner from './RotatingBanner';
import Oval from './Oval';
import PlayerPlate from './PlayerPlate';
import BenchZone from './BenchZone';
import StatusLegend from './StatusLegend';
import PlayingList from './PlayingList';
import AdminPanel from './AdminPanel';
import { ModuleMarquee } from './SportsWebModules';
import sportswebOneLogo from '../assets/sportsweb-one-logo.png';

/** Availability reasons (as opposed to role badges like captain/debut). */
const AVAIL_STATUSES: PlayerStatus[] = ['injured', 'concussion', 'personal', 'suspended'];
import {
  loadLatestTeamSheet,
  loadLatestForClubGrade,
  loadTeamSheet,
  listSavedSheets,
  saveTeamSheet,
  deleteTeamSheet,
  loadPreviousSelections,
  EMPTY_REFS,
  type DbRefs,
  type SavedSheet,
  type PrevLineup,
  type PrevSelection,
} from '../lib/source';
import { isSupabaseConfigured } from '../lib/supabase';
import { SHOW_EMBED, PUBLISH_TARGET_LABEL } from '../lib/config';
import '../styles/teamsheet.css';

export interface TeamSheetProps {
  data: TeamSheetData;
  /** 'public' = read-only published graphic (default, no buttons — embed-ready). 'admin' = editable. */
  mode?: RenderMode;
  /** Embedded in an iframe — strips outer page chrome so it sits flush. */
  embed?: boolean;
  /** Pull the latest published team sheet from the database on first load. */
  autoLoad?: boolean;
}

let nextId = 1000;
const uid = () => `p${nextId++}`;

/** Increment a trailing number in a round label: "Round 7" → "Round 8". */
function bumpRound(r: string): string {
  const m = /(\d+)\s*$/.exec(r);
  if (!m) return r;
  return r.slice(0, m.index) + String(parseInt(m[1], 10) + 1);
}

/**
 * Pick black or white text for a given fill colour, by WCAG relative luminance.
 * Keeps labels readable on any club primary — including dark inks on dark fills.
 */
function readableOn(hex?: string | null): string {
  if (!hex) return '#ffffff';
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return '#ffffff';
  const ch = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  return L > 0.45 ? '#0b1220' : '#ffffff';
}

/** Level lines on desktop/tablet, staggered on phones. */
function useIsNarrow(bp = 760) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= bp,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return narrow;
}

export default function TeamSheet({ data, mode = 'public', embed = false, autoLoad = false }: TeamSheetProps) {
  const admin = mode === 'admin';
  const isNarrow = useIsNarrow();
  const slots = isNarrow ? FIELD_SLOTS_MOBILE : FIELD_SLOTS;

  // The roster is stable; selection (the lineup) is the editable state.
  const [players, setPlayers] = useState<Player[]>(data.players);
  const [positions, setPositions] = useState<Partial<Record<PositionKey, string>>>(
    data.lineup.positions,
  );
  const [followers, setFollowers] = useState<string[]>(data.lineup.followers);
  const [interchange, setInterchange] = useState<string[]>(data.lineup.interchange);
  const [emergencies, setEmergencies] = useState<string[]>(data.lineup.emergencies);
  const [unavailable, setUnavailable] = useState<string[]>(data.lineup.unavailable);

  const [visualMode, setVisualMode] = useState<VisualMode>('none');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Branding/match details are editable in admin so a club can be set up live.
  const [club, setClub] = useState(data.club);
  const [match, setMatch] = useState(data.match);
  const [sponsors, setSponsors] = useState(data.sponsors);
  const [jumperImageUrl, setJumperImageUrl] = useState<string | undefined>(data.jumperImageUrl);
  const [vsStyle, setVsStyle] = useState<'chrome' | 'split'>(data.vsStyle ?? 'chrome');
  const [printImage, setPrintImage] = useState<string | null>(null);

  // Background watermark behind the oval (club/sponsor name or logo).
  type WmSource = 'clubName' | 'clubLogo' | 'sponsorName' | 'sponsorLogo';
  const [wmSource, setWmSource] = useState<WmSource>('clubName');
  const [wmSponsorName, setWmSponsorName] = useState('');
  const [wmSponsorLogo, setWmSponsorLogo] = useState<string | null>(null);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p] as const)), [players]);

  const benchByArea: Record<BenchArea, string[]> = {
    followers,
    interchange,
    emergencies,
    unavailable,
  };

  const presentStatuses = useMemo(() => {
    const s = new Set<PlayerStatus>();
    // In public view the Unavailable group is hidden, so don't leak those
    // players' statuses (injured/suspended/…) through the legend either.
    const hidden = admin ? new Set<string>() : new Set(unavailable);
    players.forEach((p) => {
      if (hidden.has(p.id)) return;
      p.status?.forEach((st) => s.add(st));
    });
    return s;
  }, [players, unavailable, admin]);

  // ── selection mutations (admin only) ──────────────────────────────────────
  const setterFor: Record<BenchArea, React.Dispatch<React.SetStateAction<string[]>>> = {
    followers: setFollowers,
    interchange: setInterchange,
    emergencies: setEmergencies,
    unavailable: setUnavailable,
  };

  function clearEverywhere(id: string) {
    setPositions((prev) => {
      const next = { ...prev };
      (Object.keys(next) as PositionKey[]).forEach((k) => {
        if (next[k] === id) delete next[k];
      });
      return next;
    });
    (Object.keys(setterFor) as BenchArea[]).forEach((area) =>
      setterFor[area]((prev) => prev.filter((x) => x !== id)),
    );
  }

  type Loc =
    | { kind: 'field'; slot: PositionKey }
    | { kind: 'bench'; area: BenchArea }
    | { kind: 'none' };

  function locate(id: string): Loc {
    for (const k of Object.keys(positions) as PositionKey[]) {
      if (positions[k] === id) return { kind: 'field', slot: k };
    }
    for (const area of Object.keys(setterFor) as BenchArea[]) {
      const arr = { followers, interchange, emergencies, unavailable }[area];
      if (arr.includes(id)) return { kind: 'bench', area };
    }
    return { kind: 'none' };
  }

  /** Strip any availability tag (injured/etc.) without touching placement. */
  function clearAvailTag(id: string) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const roles = (p.status ?? []).filter((s) => !AVAIL_STATUSES.includes(s));
        return { ...p, status: roles.length ? roles : undefined };
      }),
    );
  }

  /**
   * When a flagged player is pulled out of Unavailable into the line-up, ask
   * first, then clear their availability tag. Returns false to cancel the move.
   */
  function confirmLeaveUnavailable(id: string): boolean {
    if (!unavailable.includes(id)) return true;
    const p = players.find((x) => x.id === id);
    const reason = (p?.status ?? []).find((s) => AVAIL_STATUSES.includes(s));
    const label = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : 'unavailable';
    const ok = window.confirm(
      `${p?.name ?? 'This player'} is marked ${label}. Move them into the line-up and clear that status?`,
    );
    if (ok) clearAvailTag(id);
    return ok;
  }

  /**
   * Move a player into a field slot. If the slot is occupied, the two players
   * SWAP (the occupant moves to the dragged player's old slot) when the dragged
   * player came from another field slot — otherwise the occupant is freed back
   * to the team list. This is the behaviour the index.html prototype used.
   */
  function placeIntoSlot(slot: PositionKey, id: string) {
    if (!confirmLeaveUnavailable(id)) return;
    const from = locate(id);
    // Duplicate barrier: if this player is already on the ground elsewhere, make
    // sure the user means to move them (rather than thinking they're adding anew).
    if (from.kind === 'field' && from.slot !== slot) {
      const nm = players.find((p) => p.id === id)?.name ?? 'That player';
      if (!window.confirm(`${nm} is already on the ground. Move them to this position?`)) return;
    }
    setPositions((prev) => {
      const next = { ...prev };
      const occupant = next[slot] ?? null;
      (Object.keys(next) as PositionKey[]).forEach((k) => {
        if (next[k] === id) delete next[k];
      });
      next[slot] = id;
      if (occupant && occupant !== id && from.kind === 'field' && from.slot !== slot) {
        next[from.slot] = occupant; // swap
      }
      return next;
    });
    if (from.kind === 'bench') setterFor[from.area]((prev) => prev.filter((x) => x !== id));
    setSelectedPlayerId(null);
  }

  function assignToArea(area: BenchArea, id: string) {
    // Pulling someone out of Unavailable into a playing group: confirm + clear tag.
    if (area !== 'unavailable' && !confirmLeaveUnavailable(id)) return;
    clearEverywhere(id);
    setterFor[area]((prev) => [...prev, id]);
    setSelectedPlayerId(null);
  }

  /** Quick-place from the squad list dropdown: a field position or a bench group. */
  function quickPlace(id: string, target: PositionKey | 'interchange' | 'emergencies' | 'followers') {
    if (target === 'interchange' || target === 'emergencies' || target === 'followers') {
      assignToArea(target, id);
    } else {
      placeIntoSlot(target, id);
    }
  }

  function loadBlank() {
    if (
      lineupFilledCount() > 0 &&
      !window.confirm('Clear all on-field and bench selections? Your squad list stays intact.')
    )
      return;
    setPositions({});
    setFollowers([]);
    setInterchange([]);
    setEmergencies([]);
    setUnavailable([]);
  }

  /**
   * Start a fresh team for a new round: clear the selections and the match round /
   * opponent / date, keep the squad and club branding, and reset the DB refs so the
   * next Save creates a new saved team instead of overwriting the last one.
   */
  function startNewTeam() {
    if (
      lineupFilledCount() > 0 &&
      !window.confirm('Start a new team? This clears the current selections and the match round so you can build the next one — your squad and club branding stay.')
    )
      return;
    setPositions({});
    setFollowers([]);
    setInterchange([]);
    setEmergencies([]);
    setUnavailable([]);
    setMatch((m) => ({ ...m, round: '', opponent: '', date: '' }));
    setSelectedPlayerId(null);
    setDbRefs(EMPTY_REFS);
    setDbState('idle');
    setDbMsg('');
  }

  function lineupFilledCount() {
    return (
      Object.values(positions).filter(Boolean).length +
      followers.length +
      interchange.length +
      emergencies.length +
      unavailable.length
    );
  }

  function loadDemo() {
    if (
      lineupFilledCount() > 0 &&
      !window.confirm(
        'Load the built-in example team? This replaces the current squad, match details and selections with the demo — it does NOT touch your saved teams in the database.',
      )
    )
      return;
    // Load the whole bundled example (players, club, match, sponsors, line-up) so
    // it's self-consistent — and treat it as a fresh, unsaved team so a later Save
    // creates a new record rather than overwriting whatever was last loaded.
    applyData(data);
    setDbRefs(EMPTY_REFS);
    setDbState('idle');
    setDbMsg('');
  }

  // ── SportsWeb One database (Supabase) ─────────────────────────────────────
  const [dbState, setDbState] = useState<'idle' | 'loading' | 'saving' | 'ok' | 'error'>('idle');
  // Public/embed views shouldn't flash the bundled sample before the real team
  // loads — hold rendering until the first DB load settles.
  const gateRender = autoLoad && mode !== 'admin';
  const [booted, setBooted] = useState(!gateRender);
  const [dbMsg, setDbMsg] = useState('');
  const [dbRefs, setDbRefs] = useState<DbRefs>(EMPTY_REFS);
  const [savedSheets, setSavedSheets] = useState<SavedSheet[]>([]);
  const [copyMsg, setCopyMsg] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  // "Ins & Outs vs last week" — a snapshot of the previous round's named side.
  // The live diff against the current selections is computed in a useMemo below.
  const [prevWeek, setPrevWeek] = useState<PrevLineup | null>(null);

  function refreshPrevWeek(clubId: string | null, grade: string, fixtureId: string | null) {
    if (!clubId) {
      setPrevWeek(null);
      return;
    }
    loadPreviousSelections(clubId, grade, fixtureId)
      .then(setPrevWeek)
      .catch(() => {
        /* best-effort; comparison panel simply stays empty */
      });
  }

  function refreshSavedSheets(clubId: string | null) {
    if (!clubId) {
      setSavedSheets([]);
      return;
    }
    listSavedSheets(clubId)
      .then(setSavedSheets)
      .catch(() => {
        /* best-effort; recall list stays as-is */
      });
  }

  function applyData(d: TeamSheetData) {
    setPlayers(d.players);
    setPositions(d.lineup.positions);
    setFollowers(d.lineup.followers);
    setInterchange(d.lineup.interchange);
    setEmergencies(d.lineup.emergencies);
    setUnavailable(d.lineup.unavailable);
    setClub(d.club);
    setMatch(d.match);
    setSponsors(d.sponsors);
    if (d.visualMode) setVisualMode(d.visualMode);
    if (d.watermarkSource) setWmSource(d.watermarkSource);
    setWmSponsorName(d.watermarkText ?? '');
    setWmSponsorLogo(d.watermarkLogoUrl ?? null);
    setJumperImageUrl(d.jumperImageUrl);
    if (d.vsStyle) setVsStyle(d.vsStyle);
    setSelectedPlayerId(null);
  }

  function currentData(): TeamSheetData {
    return {
      club,
      match,
      sponsors,
      players,
      lineup: { positions, followers, interchange, emergencies, unavailable },
      watermark: data.watermark,
      visualMode,
      watermarkSource: wmSource,
      watermarkText: wmSponsorName || undefined,
      watermarkLogoUrl: wmSponsorLogo || undefined,
      jumperImageUrl,
      vsStyle,
    };
  }

  async function loadFromDatabase() {
    setDbState('loading');
    setDbMsg('');
    try {
      // Public + embed views only ever show a published team; the editor sees drafts.
      const publishedOnly = mode !== 'admin';
      const qp = new URLSearchParams(window.location.search);
      const fixtureParam = qp.get('fixture');
      const clubParam = qp.get('club');
      const gradeParam = qp.get('grade');
      // Embed-by-club+grade auto-updates each round; ?fixture pins one team; else latest.
      const res = clubParam
        ? await loadLatestForClubGrade(clubParam, gradeParam, { publishedOnly })
        : fixtureParam
        ? await loadTeamSheet(fixtureParam, { publishedOnly })
        : await loadLatestTeamSheet({ publishedOnly });
      if (!res) {
        setDbState('error');
        setDbMsg('Connected, but no fixtures found yet. Run seed.sql or save one.');
        return;
      }
      applyData(res.data);
      setDbRefs(res.refs);
      refreshSavedSheets(res.refs.clubId);
      refreshPrevWeek(res.refs.clubId, res.data.match.grade, res.refs.fixtureId);
      setDbState('ok');
      setDbMsg(`Loaded ${res.data.club.name} vs ${res.data.match.opponent} from the database.`);
    } catch (err: any) {
      console.error('Database load failed', err);
      setDbState('error');
      setDbMsg(err?.message ?? 'Could not reach the database.');
    } finally {
      setBooted(true);
    }
  }

  // Recall a specific saved team (round/date) from the picker.
  async function loadSheet(fixtureId: string) {
    if (
      lineupFilledCount() > 0 &&
      !window.confirm('Load this saved team? It replaces your current on-field and bench selections.')
    )
      return;
    setDbState('loading');
    setDbMsg('');
    try {
      const res = await loadTeamSheet(fixtureId);
      applyData(res.data);
      setDbRefs(res.refs);
      refreshSavedSheets(res.refs.clubId);
      refreshPrevWeek(res.refs.clubId, res.data.match.grade, res.refs.fixtureId);
      setDbState('ok');
      setDbMsg(`Loaded ${res.data.match.round || 'team'} · ${res.data.match.grade}.`);
    } catch (err: any) {
      console.error('Database load failed', err);
      setDbState('error');
      setDbMsg(err?.message ?? 'Could not load that team.');
    }
  }

  // Copy a ready-to-paste embed snippet for the currently loaded/saved team.
  // A "Custom HTML" block needs real markup, not a bare URL (a bare URL just
  // shows as text — which is exactly what was happening). So we hand over a full
  // <iframe> plus a tiny listener that resizes it to the line-up's height, with
  // a sensible fallback height in case the host strips the script.
  function copyEmbedCode() {
    const clubId = dbRefs.clubId;
    if (!clubId) {
      setDbMsg('Save this team first — then you can copy its embed code.');
      return;
    }
    // Embed by club + grade so the page auto-updates each round: it always shows
    // whatever is currently PUBLISHED for this grade, with no code change weekly.
    const grade = match.grade?.trim();
    const params = new URLSearchParams({ embed: '1', client: 'sportsweb', club: clubId });
    if (grade) params.set('grade', grade);
    const src = `${window.location.origin}/?${params.toString()}`;
    const frameId = `sw1-lineup-${clubId.slice(0, 8)}${grade ? '-' + grade.toLowerCase().replace(/\s+/g, '') : ''}`;
    const code =
      `<iframe id="${frameId}" src="${src}" title="Team line-up" loading="lazy" ` +
      `scrolling="no" height="900" style="width:100%;border:0;display:block;overflow:hidden"></iframe>\n` +
      `<script>(function(){var id="${frameId}";window.addEventListener("message",function(e){` +
      `if(e&&e.data&&e.data.type==="sw1-embed-height"){var f=document.getElementById(id);` +
      `if(f){f.style.height=e.data.height+"px";}}});})();</script>`;
    navigator.clipboard?.writeText(code).then(
      () => setDbMsg('Embed code copied — it auto-updates each round when you Publish. Paste it into a Custom HTML block.'),
      () => setDbMsg(code),
    );
  }

  // Per-team embed: pinned to THIS fixture, so each published team gets its own
  // code (what you want when embedding specific teams on a sample site tonight).
  function copyTeamEmbedCode() {
    const id = dbRefs.fixtureId;
    if (!id) {
      setDbMsg('Save this team first — then you can copy its embed code.');
      return;
    }
    const src = `${window.location.origin}/?embed=1&client=sportsweb&fixture=${id}`;
    const frameId = `sw1-lineup-${id.slice(0, 8)}`;
    const code =
      `<iframe id="${frameId}" src="${src}" title="Team line-up" loading="lazy" ` +
      `scrolling="no" height="900" style="width:100%;border:0;display:block;overflow:hidden"></iframe>\n` +
      `<script>(function(){var id="${frameId}";window.addEventListener("message",function(e){` +
      `if(e&&e.data&&e.data.type==="sw1-embed-height"){var f=document.getElementById(id);` +
      `if(f){f.style.height=e.data.height+"px";}}});})();</script>`;
    navigator.clipboard?.writeText(code).then(
      () => setDbMsg('This team\u2019s embed code copied — it shows THIS published team only. Publish first, then paste into a Custom HTML block.'),
      () => setDbMsg(code),
    );
  }

  // Permanently delete a saved team (fixture) after confirming. The squad, club
  // and your other saved rounds are untouched.
  async function deleteSheet(fixtureId: string) {
    const target = savedSheets.find((s) => s.fixtureId === fixtureId);
    const label = target ? `${target.round ?? 'this team'} · ${target.grade ?? ''}`.trim() : 'this saved team';
    if (!window.confirm(`Delete ${label}? This removes the saved team and its line-up for good. Your squad and other rounds stay put.`)) {
      return;
    }
    setDbState('saving');
    setDbMsg('');
    try {
      await deleteTeamSheet(fixtureId);
      setSavedSheets((prev) => prev.filter((s) => s.fixtureId !== fixtureId));
      // If we just deleted the team that's open, drop the fixture ref so the next
      // Save creates a fresh record rather than trying to update a deleted row.
      if (dbRefs.fixtureId === fixtureId) {
        setDbRefs((cur) => ({ ...cur, fixtureId: null, lineupId: null }));
      }
      setDbState('ok');
      setDbMsg('Saved team deleted.');
    } catch (err: any) {
      console.error('Delete failed', err);
      setDbState('error');
      setDbMsg(err?.message ?? 'Could not delete that team.');
    }
  }

  // Clone the loaded team into a new round: keep players + line-up, but retarget
  // the fixture so the next Save creates a fresh record instead of overwriting
  // the source round.
  function cloneToNewRound() {
    const next = window.prompt(
      'Clone this team into a new round. Enter the new round:',
      bumpRound(match.round || 'Round 1'),
    );
    if (next === null) return;
    const r = next.trim();
    setMatch((m) => ({ ...m, round: r }));
    setDbRefs((cur) => ({ ...cur, fixtureId: null, lineupId: null }));
    setDbState('idle');
    setDbMsg(`Cloned to ${r || 'a new round'} — update the date/opponent, then Save to create it.`);
  }

  // Build a shareable plain-text team list grouped by line (for socials/chat).
  function buildTeamListText(): string {
    const byId = new Map(players.map((p) => [p.id, p]));
    const nm = (id?: string) => {
      const p = id ? byId.get(id) : undefined;
      if (!p) return null;
      return p.number?.trim() ? `${p.number} ${p.name}` : p.name;
    };
    const groups: [string, PositionKey[]][] = [
      ['Backs', ['BPL', 'FB', 'BPR']],
      ['Half-backs', ['HBL', 'CHB', 'HBR']],
      ['Centre', ['WL', 'C', 'WR']],
      ['Half-forwards', ['HFL', 'CHF', 'HFR']],
      ['Forwards', ['FPL', 'FF', 'FPR']],
    ];
    const out: string[] = [];
    const head = [club.name, match.grade, match.round].filter(Boolean).join(' — ');
    if (head) out.push(head);
    const sub = [match.opponent ? `vs ${match.opponent}` : null, match.date, match.venue]
      .filter(Boolean)
      .join(' · ');
    if (sub) out.push(sub);
    out.push('');
    for (const [label, keys] of groups) {
      const names = keys.map((k) => nm(positions[k])).filter(Boolean);
      if (names.length) out.push(`${label}: ${names.join(', ')}`);
    }
    const foll = followers
      .map((id, idx) => {
        const n = nm(id);
        return n ? `${FOLLOWER_LABELS[idx] ?? 'Follower'} ${n}` : null;
      })
      .filter(Boolean);
    if (foll.length) out.push(`Followers: ${foll.join(', ')}`);
    const ic = interchange.map((id) => nm(id)).filter(Boolean);
    if (ic.length) out.push(`Interchange: ${ic.join(', ')}`);
    const em = emergencies.map((id) => nm(id)).filter(Boolean);
    if (em.length) out.push(`Emergencies: ${em.join(', ')}`);
    return out.join('\n');
  }

  function copyTeamList() {
    const text = buildTeamListText();
    const done = () => {
      setCopyMsg('Team list copied!');
      window.setTimeout(() => setCopyMsg(''), 2500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy your team list:', text));
    } else {
      window.prompt('Copy your team list:', text);
    }
  }

  /**
   * Share to socials. On mobile this opens the native share sheet (Facebook,
   * Instagram, Messenger, WhatsApp, etc.) with the team list and, if the team has
   * been saved, a link to its live embed. On desktop browsers without the Web
   * Share API it falls back to copying the team list.
   */
  async function shareTeam() {
    const text = buildTeamListText();
    const url = dbRefs.fixtureId
      ? `${window.location.origin}/?embed=1&fixture=${dbRefs.fixtureId}`
      : undefined;
    const title = [club.name, match.round].filter(Boolean).join(' — ') || 'Team line-up';
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text, url });
      } catch {
        /* user cancelled or share failed — no fallback so we don't surprise-copy */
      }
      return;
    }
    copyTeamList(); // desktop without Web Share → copy the list instead
  }

  /** The public, shareable URL for this team (once it's been saved/published). */
  function shareUrl(): string | null {
    return dbRefs.fixtureId ? `${window.location.origin}/?fixture=${dbRefs.fixtureId}` : null;
  }
  function shareTitle(): string {
    return [club.name, match.opponent && `v ${match.opponent}`, match.round]
      .filter(Boolean)
      .join(' ') || 'Team line-up';
  }
  function openShare(target: 'facebook' | 'x' | 'whatsapp' | 'email') {
    const url = shareUrl();
    const title = shareTitle();
    if (!url) {
      setDbMsg('Publish this team first to get a shareable link for socials.');
      setShareOpen(false);
      return;
    }
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(title);
    let href = '';
    if (target === 'facebook') href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    else if (target === 'x') href = `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
    else if (target === 'whatsapp') href = `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`;
    else if (target === 'email')
      href = `mailto:?subject=${t}&body=${encodeURIComponent(buildTeamListText() + '\n\n' + url)}`;
    if (target === 'email') window.location.href = href;
    else window.open(href, '_blank', 'noopener,noreferrer,width=620,height=640');
    setShareOpen(false);
  }
  function copyShareLink() {
    const url = shareUrl();
    if (!url) {
      setDbMsg('Publish this team first to get a shareable link.');
      setShareOpen(false);
      return;
    }
    navigator.clipboard?.writeText(url).then(
      () => setDbMsg('Public link copied — paste it anywhere.'),
      () => window.prompt('Copy this link:', url),
    );
    setShareOpen(false);
  }

  // Embeds / deep links pull the published sheet from the DB on first paint.
  useEffect(() => {
    if (autoLoad) loadFromDatabase();
    // The recall picker is populated by loadFromDatabase once the club is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(publish: boolean) {
    setDbState('saving');
    setDbMsg('');
    try {
      const { refs, playerIds } = await saveTeamSheet(currentData(), dbRefs, { publish });
      setDbRefs(refs);
      // Write DB ids back onto players so the next save updates them (rather than
      // duplicating) — this is what keeps numberless players stable across saves.
      if (playerIds.size) {
        setPlayers((prev) =>
          prev.map((p) => {
            const db = playerIds.get(p.id);
            return db ? { ...p, dbId: db } : p;
          }),
        );
      }
      setDbState('ok');
      setDbMsg(
        publish
          ? `Published — your team is now live on ${PUBLISH_TARGET_LABEL}.`
          : 'Draft saved. It won\u2019t go live until you hit Publish.',
      );
      refreshSavedSheets(refs.clubId);
      refreshPrevWeek(refs.clubId, match.grade, refs.fixtureId);
    } catch (err: any) {
      console.error('Database save failed', err);
      setDbState('error');
      setDbMsg(
        err?.message?.includes('row-level security') || err?.code === '42501'
          ? 'Save blocked by row-level security — run supabase/enable-writes.sql first.'
          : err?.message ?? 'Could not save to the database.',
      );
    }
  }

  const saveDraft = () => persist(false);
  const publishLive = () => {
    if (!window.confirm(`Publish this team live to ${PUBLISH_TARGET_LABEL}?`)) return;
    persist(true);
  };

  function addPlayer(number: string, name: string) {
    // Manual add = a record this app owns. Reusable across future line-ups.
    setPlayers((prev) => [...prev, { id: uid(), number, name, sourceType: 'standalone' }]);
  }

  function importPlayers(rows: { number: string; name: string; headshotUrl?: string }[]) {
    setPlayers((prev) => [
      ...prev,
      ...rows.map((r) => ({
        id: uid(),
        sourceType: 'standalone' as const,
        number: r.number,
        name: r.name,
        headshotUrl: r.headshotUrl || undefined,
      })),
    ]);
  }

  function removePlayer(id: string) {
    clearEverywhere(id);
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setSelectedPlayerId((cur) => (cur === id ? null : cur));
  }

  function updatePlayer(id: string, fields: { number?: string; name?: string }) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    );
  }

  /** Set or clear a player's headshot / jumper image (data URL, or null to clear). */
  function setPlayerImage(id: string, kind: 'headshot' | 'jumper', dataUrl: string | null) {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, [kind === 'headshot' ? 'headshotUrl' : 'jumperImageUrl']: dataUrl }
          : p,
      ),
    );
  }

  /**
   * Set (or clear) a player's availability. Choosing an unavailable reason
   * tags the player and shifts them straight into the Unavailable group;
   * choosing "available" clears the tag and frees them from that group.
   * Role badges (captain, debut, …) are preserved either way.
   */
  function setAvailability(id: string, reason: PlayerStatus | null) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const roles = (p.status ?? []).filter((s) => !AVAIL_STATUSES.includes(s));
        const next = reason ? [...roles, reason] : roles;
        return { ...p, status: next.length ? next : undefined };
      }),
    );
    if (reason) {
      assignToArea('unavailable', id); // clears them elsewhere, drops into Unavailable
    } else {
      setUnavailable((prev) => prev.filter((x) => x !== id));
    }
  }

  /**
   * Toggle a role badge (captain / vice-captain / debut / milestone) on a player.
   * Captain and vice-captain are one-per-team, so turning one on for a player
   * strips it from everyone else, and a single player can't hold both at once.
   * Debut and milestone are free to apply to as many players as needed.
   * Availability tags (injured/etc.) are left untouched.
   */
  function setRole(id: string, role: PlayerStatus, on: boolean) {
    const isUnique = role === 'captain' || role === 'vice-captain';
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          let next = (p.status ?? []).filter((s) => s !== role);
          if (on) {
            // C and VC are mutually exclusive on the same player.
            if (role === 'captain') next = next.filter((s) => s !== 'vice-captain');
            if (role === 'vice-captain') next = next.filter((s) => s !== 'captain');
            next = [...next, role];
          }
          return { ...p, status: next.length ? next : undefined };
        }
        // Hand a unique role to one player → take it off whoever held it before.
        if (on && isUnique && (p.status ?? []).includes(role)) {
          const next = (p.status ?? []).filter((s) => s !== role);
          return { ...p, status: next.length ? next : undefined };
        }
        return p;
      }),
    );
  }

  /** Where each player currently sits, for the squad list chips. */
  const playerLocation = useMemo(() => {
    const m = new Map<string, string>();
    (Object.keys(positions) as PositionKey[]).forEach((k) => {
      const id = positions[k];
      if (id) m.set(id, k);
    });
    followers.forEach((id) => m.set(id, 'Ruck/Rov'));
    interchange.forEach((id) => m.set(id, 'Interch'));
    emergencies.forEach((id) => m.set(id, 'Emerg'));
    unavailable.forEach((id) => m.set(id, 'Unavail'));
    return m;
  }, [positions, followers, interchange, emergencies, unavailable]);

  /**
   * Ins & Outs vs last week (admin reference). Compares the side named THIS round
   * (field + bench, excluding Unavailable) against the previous saved round's
   * named side, matching on guernsey number when present and on name otherwise.
   * Recomputes live as you change the selections. Null until there's a prior
   * round to compare against.
   */
  const insOuts = useMemo(() => {
    if (!prevWeek) return null;
    const byId = new Map(players.map((p) => [p.id, p]));
    const thisSide: PrevLineup['players'] = [
      ...(Object.values(positions).filter(Boolean) as string[]),
      ...followers,
      ...interchange,
      ...emergencies,
    ]
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ number: p.number, name: p.name }));

    const keyOf = (number: string, name: string) =>
      number && number.trim() ? `#${number.trim()}` : name.trim().toLowerCase();
    const thisKeys = new Map(thisSide.map((p) => [keyOf(p.number, p.name), p]));
    const prevKeys = new Map(prevWeek.players.map((p) => [keyOf(p.number, p.name), p]));

    const ins = [...thisKeys].filter(([k]) => !prevKeys.has(k)).map(([, p]) => p);
    const outs = [...prevKeys].filter(([k]) => !thisKeys.has(k)).map(([, p]) => p);
    const byNo = (a: PrevSelection, b: PrevSelection) =>
      (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999);
    return { round: prevWeek.round, ins: ins.sort(byNo), outs: outs.sort(byNo) };
  }, [prevWeek, players, positions, followers, interchange, emergencies]);

  // Club colours flow into the stylesheet as custom properties.
  const themeVars = {
    '--club-primary': club.primaryColor,
    '--club-secondary': club.secondaryColor,
    '--club-ink': club.inkColor ?? '#ffffff',
    // Guaranteed-readable text colour for anything filled with --club-primary
    // (buttons, number tabs, follower pills). Derived from the fill's luminance
    // so it works even when a club's ink colour matches its primary (e.g. navy).
    '--club-on-primary': readableOn(club.primaryColor),
  } as React.CSSProperties;

  const fieldName = club.shortName ?? club.name;

  // Resolve what the background watermark shows.
  const wmIsLogo = wmSource === 'clubLogo' || wmSource === 'sponsorLogo';
  const wmLogo =
    wmSource === 'clubLogo' ? club.logoUrl : wmSource === 'sponsorLogo' ? wmSponsorLogo : null;
  const wmText =
    wmSource === 'sponsorName' || wmSource === 'sponsorLogo'
      ? wmSponsorName || 'Sponsor'
      : fieldName;

  const renderBench = (area: BenchArea) => {
    const ids = benchByArea[area];
    if (!admin && ids.length === 0) return null;
    return (
      <BenchZone
        title={BENCH_TITLES[area]}
        area={area}
        players={ids.map((id) => playerMap.get(id)).filter(Boolean) as Player[]}
        visualMode={visualMode}
        teamJumperUrl={jumperImageUrl}
        enabled={admin}
        selectedPlayerId={selectedPlayerId}
        onAssign={assignToArea}
        onSelect={(id) => setSelectedPlayerId((cur) => (cur === id ? null : id))}
        rowLayout={area === 'unavailable'}
      />
    );
  };

  const updateClub = (patch: Partial<typeof club>) =>
    setClub((c) => {
      const next = { ...c, ...patch };
      // Renaming the club shouldn't leave a stale short name (e.g. the demo's
      // "HAWKS") driving the watermark — let it follow the new name.
      if (patch.name !== undefined && patch.shortName === undefined) next.shortName = undefined;
      return next;
    });
  const updateMatch = (patch: Partial<typeof match>) => setMatch((m) => ({ ...m, ...patch }));

  type LogoTarget = 'home' | 'away';
  function setLogo(target: LogoTarget, dataUrl: string) {
    if (target === 'home') updateClub({ logoUrl: dataUrl });
    else updateMatch({ opponentLogoUrl: dataUrl });
  }

  function setTeamJumper(url: string) {
    setJumperImageUrl(url || undefined);
  }

  function setSponsorLogo(index: number, dataUrl: string) {
    setSponsors((s) => {
      const rotating = [...(s?.rotating ?? [])];
      if (!rotating[index]) rotating[index] = { name: `Banner ${index + 1}` };
      // an uploaded image is the full banner for that slot
      rotating[index] = { ...rotating[index], bannerUrl: dataUrl };
      return { ...s, rotating };
    });
  }

  function setSponsorHref(index: number, href: string) {
    setSponsors((s) => {
      const rotating = [...(s?.rotating ?? [])];
      if (!rotating[index]) rotating[index] = { name: `Banner ${index + 1}` };
      rotating[index] = { ...rotating[index], href: href.trim() || undefined };
      return { ...s, rotating };
    });
  }

  function addSponsorSlot() {
    setSponsors((s) => {
      const rotating = [...(s?.rotating ?? [])];
      if (rotating.length >= 5) return s; // cap at 5
      rotating.push({ name: `Banner ${rotating.length + 1}` });
      return { ...s, rotating };
    });
  }

  function removeSponsorSlot(index: number) {
    setSponsors((s) => {
      const rotating = (s?.rotating ?? []).filter((_, i) => i !== index);
      return { ...s, rotating };
    });
  }

  function setRotationMs(ms: number) {
    setSponsors((s) => ({ ...s, rotationMs: ms }));
  }

  // ── Print poster (A3, club-room) ────────────────────────────────────────────
  // Prints the PUBLIC graphic (captured as an image) so the editor chrome never
  // shows, and the whole team sheet fits on a single A3 page with a scannable QR.
  const printUrl = dbRefs.fixtureId
    ? `${window.location.origin}/?fixture=${dbRefs.fixtureId}`
    : window.location.href;
  const qrSrc = (url: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=0&data=${encodeURIComponent(url)}`;

  async function printPoster() {
    setDownloading(true);
    try {
      const shot = await captureGraphicPng();
      if (!shot) return;
      // Preload the QR so it's painted before the print dialog opens.
      await new Promise<void>((resolve) => {
        const q = new Image();
        q.onload = q.onerror = () => resolve();
        q.src = qrSrc(printUrl);
      });
      setPrintImage(shot);
      // Let React paint the print sheet, then open the dialog.
      window.setTimeout(() => window.print(), 80);
    } catch (err) {
      console.error('Print failed', err);
      alert('Could not prepare the print here. As a fallback, take a screenshot of the graphic.');
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    const done = () => setPrintImage(null);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  // ── PNG export ─────────────────────────────────────────────────────────────
  // Captures the graphic region only (the toolbar sits outside it). html-to-image
  // freezes computed styles, so clip-paths, container units and color-mix all
  // export exactly as rendered.
  const captureRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  // Mobile editing: let the coach collapse the big preview to reach the editor.
  const [previewOpen, setPreviewOpen] = useState(true);

  function slugify(s: string) {
    return s.trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function downloadDataUrl(dataUrl: string, filename: string) {
    const a = document.createElement('a');
    a.download = filename;
    a.href = dataUrl;
    a.click();
  }

  // Capture the public graphic region to a PNG data URL at a fixed, generous
  // width (so it's consistent regardless of the on-screen editor width).
  async function captureGraphicPng(): Promise<string | null> {
    const node = captureRef.current;
    if (!node) return null;
    node.classList.add('sw1-exporting');
    const wrap = previewWrapRef.current;
    const wasCollapsed = !!wrap?.classList.contains('is-collapsed');
    if (wasCollapsed) wrap!.classList.add('is-capturing');
    const EXPORT_WIDTH = 1080;
    const prevWidth = node.style.width;
    const prevMax = node.style.maxWidth;
    node.style.width = `${EXPORT_WIDTH}px`;
    node.style.maxWidth = 'none';
    node.getBoundingClientRect(); // force a synchronous reflow at the export width
    try {
      return await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#eef2f6',
        cacheBust: true,
        width: EXPORT_WIDTH,
        height: Math.ceil(node.scrollHeight),
        style: { margin: '0', transform: 'none' },
      });
    } finally {
      node.style.width = prevWidth;
      node.style.maxWidth = prevMax;
      node.classList.remove('sw1-exporting');
      if (wasCollapsed) wrap?.classList.remove('is-capturing');
    }
  }

  // Fit a captured graphic onto a fixed-ratio canvas — 'contain' letterboxes the
  // whole graphic; 'cover' fills the frame and crops the overflow (top/bottom).
  function composeToRatio(
    src: string,
    targetW: number,
    targetH: number,
    bg: string,
    mode: 'contain' | 'cover' = 'contain',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no 2d context'));
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, targetW, targetH);
        const scale =
          mode === 'cover'
            ? Math.max(targetW / im.width, targetH / im.height)
            : Math.min(targetW / im.width, targetH / im.height);
        const w = im.width * scale;
        const h = im.height * scale;
        // Cover: anchor to the top so the header/crests are always kept; trims the
        // bottom of a tall sheet rather than slicing the match graphic.
        const y = mode === 'cover' ? 0 : (targetH - h) / 2;
        ctx.drawImage(im, (targetW - w) / 2, y, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      im.onerror = () => reject(new Error('image load failed'));
      im.src = src;
    });
  }

  async function downloadPng() {
    setDownloading(true);
    try {
      const dataUrl = await captureGraphicPng();
      if (!dataUrl) return;
      downloadDataUrl(
        dataUrl,
        `${slugify(club.name)}-v-${slugify(match.opponent)}-${slugify(match.round)}.png`,
      );
    } catch (err) {
      console.error('PNG export failed', err);
      alert('Could not export the image here. As a fallback, take a screenshot of the graphic.');
    } finally {
      setDownloading(false);
    }
  }

  // Instagram feed-ready: the whole graphic fitted onto a 1080×1350 (4:5) canvas
  // — Instagram's tallest feed ratio — so nothing is cropped when posted.
  async function downloadInstagram() {
    setShareOpen(false);
    setDownloading(true);
    try {
      const shot = await captureGraphicPng();
      if (!shot) return;
      const ig = await composeToRatio(shot, 1080, 1350, '#eef2f6', 'cover');
      downloadDataUrl(
        ig,
        `${slugify(club.name)}-v-${slugify(match.opponent)}-${slugify(match.round)}-instagram.png`,
      );
      // On phones, also offer the native share sheet so they can post straight to IG.
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
        share?: (d: ShareData) => Promise<void>;
      };
      try {
        const blob = await (await fetch(ig)).blob();
        const file = new File([blob], 'team-instagram.png', { type: 'image/png' });
        if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
          await nav.share({ files: [file], title: shareTitle() });
        }
      } catch {
        /* share sheet unavailable or cancelled — the download already happened */
      }
    } catch (err) {
      console.error('Instagram export failed', err);
      alert('Could not export the image here. As a fallback, take a screenshot of the graphic.');
    } finally {
      setDownloading(false);
    }
  }

  // Hold the public/embed render until the first DB load settles (no sample flash).
  if (!booted) {
    return <div className={`sw1-root ${embed ? 'sw1-root--embed' : ''}`} style={themeVars} aria-busy="true" />;
  }

  return (
    <div className={`sw1-root ${admin ? 'sw1-root--admin' : ''} ${embed ? 'sw1-root--embed' : ''}`} style={themeVars}>
      {admin && (
        <div className="sw1-swhead">
          <a
            className="sw1-swhead__brand"
            href="https://sportsweb.com.au"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="SportsWeb One"
          >
            <img className="sw1-swhead__logo" src={sportswebOneLogo} alt="SportsWeb One" />
            <span className="sw1-swhead__tag">
              The One Operating System for grassroots sport — one platform, every club function.
            </span>
          </a>
          <a
            className="sw1-swhead__marquee"
            href="https://sportsweb.com.au"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Explore the SportsWeb One platform"
          >
            <ModuleMarquee />
          </a>
        </div>
      )}
      {admin && (
        <div className="sw1-toolbar">
          <button className="sw1-btn" onClick={printPoster}>
            Print
          </button>
          <button className="sw1-btn" onClick={copyTeamList}>
            {copyMsg || 'Copy team list to text'}
          </button>
          <div className="sw1-share">
            <button className="sw1-btn" onClick={() => setShareOpen((o) => !o)} aria-haspopup="true" aria-expanded={shareOpen}>
              Share ▾
            </button>
            {shareOpen && (
              <>
                <div className="sw1-share__backdrop" onClick={() => setShareOpen(false)} />
                <div className="sw1-share__menu" role="menu">
                  <button role="menuitem" onClick={() => openShare('facebook')}>Facebook</button>
                  <button role="menuitem" onClick={() => openShare('x')}>X / Twitter</button>
                  <button role="menuitem" onClick={() => openShare('whatsapp')}>WhatsApp</button>
                  <button role="menuitem" onClick={() => openShare('email')}>Email</button>
                  <button role="menuitem" onClick={copyShareLink}>Copy public link</button>
                  <div className="sw1-share__sep" />
                  <button role="menuitem" onClick={() => { setShareOpen(false); copyTeamList(); }}>Copy team list (text)</button>
                  <button role="menuitem" onClick={downloadInstagram}>Instagram (1080×1350 image)</button>
                  <button role="menuitem" onClick={() => { setShareOpen(false); downloadPng(); }}>Download full graphic (PNG)</button>
                  <button role="menuitem" onClick={() => { setShareOpen(false); shareTeam(); }}>More / device share…</button>
                  <p className="sw1-share__tip">Tip: <strong>Print</strong> an A3 for the club rooms &amp; change rooms, or cast the public link to club TV screens — more eyes on your sponsors.</p>
                </div>
              </>
            )}
          </div>
          {isSupabaseConfigured && (
            <>
              <button
                className="sw1-btn"
                onClick={saveDraft}
                disabled={dbState === 'saving' || dbState === 'loading'}
                title="Save your work without going live"
              >
                {dbState === 'saving' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                className="sw1-btn sw1-btn--publish"
                onClick={publishLive}
                disabled={dbState === 'saving' || dbState === 'loading'}
                title={`Make this team live on ${PUBLISH_TARGET_LABEL}`}
              >
                Publish
              </button>
            </>
          )}
          <button className="sw1-btn sw1-btn--primary" onClick={downloadPng} disabled={downloading}>
            {downloading ? 'Preparing…' : 'Download graphic'}
          </button>
        </div>
      )}

      <div className={admin ? 'sw1-workspace' : undefined}>
        {admin && (
          <div className="sw1-adminbar">
          <AdminPanel
            players={players}
            squadLocation={playerLocation}
            fieldSlots={slots}
            positions={positions}
            onQuickPlace={quickPlace}
            visualMode={visualMode}
            selectedPlayerId={selectedPlayerId}
            onVisualMode={setVisualMode}
            teamJumperUrl={jumperImageUrl}
            onTeamJumper={setTeamJumper}
            vsStyle={vsStyle}
            onVsStyle={setVsStyle}
            onSelect={(id) => setSelectedPlayerId((cur) => (cur === id ? null : id))}
            onAddPlayer={addPlayer}
            onImport={importPlayers}
            onSetAvailability={setAvailability}
            onSetRole={setRole}
            onRemovePlayer={removePlayer}
            onSetPlayerImage={setPlayerImage}
            onUpdatePlayer={updatePlayer}
            onLoadBlank={loadBlank}
            onLoadDemo={loadDemo}
            club={club}
            match={match}
            sponsors={sponsors}
            onClub={updateClub}
            onMatch={updateMatch}
            onLogo={setLogo}
            onSponsorLogo={setSponsorLogo}
            onSponsorHref={setSponsorHref}
            onAddSponsor={addSponsorSlot}
            onRemoveSponsor={removeSponsorSlot}
            onRotationMs={setRotationMs}
            rotationMs={sponsors?.rotationMs ?? 3800}
            dbConfigured={isSupabaseConfigured}
            dbState={dbState}
            dbMsg={dbMsg}
            onLoadFromDb={loadFromDatabase}
            onNewTeam={startNewTeam}
            savedSheets={savedSheets}
            currentFixtureId={dbRefs.fixtureId}
            onLoadSheet={loadSheet}
            onDeleteSheet={deleteSheet}
            onCopyEmbed={copyEmbedCode}
            onCopyTeamEmbed={copyTeamEmbedCode}
            onClone={cloneToNewRound}
            insOuts={insOuts}
            onRefreshInsOuts={() => refreshPrevWeek(dbRefs.clubId, match.grade, dbRefs.fixtureId)}
            wmSource={wmSource}
            onWmSource={setWmSource}
            wmSponsorName={wmSponsorName}
            onWmSponsorName={setWmSponsorName}
            onWmSponsorLogo={setWmSponsorLogo}
            wmHasSponsorLogo={!!wmSponsorLogo}
            playingList={
              <PlayingList
                positions={positions}
                playerMap={playerMap}
                followers={followers}
                interchange={interchange}
                unavailable={players.filter((p) =>
                  (p.status ?? []).some((s) => AVAIL_STATUSES.includes(s)),
                )}
              />
            }
          />
        </div>
      )}

      <div
        className={`sw1-previewwrap ${admin && !previewOpen ? 'is-collapsed' : ''}`}
        ref={previewWrapRef}
      >
        {admin && (
          <button
            type="button"
            className="sw1-previewtoggle"
            onClick={() => setPreviewOpen((o) => !o)}
            aria-expanded={previewOpen}
          >
            <span>{previewOpen ? 'Hide preview' : 'Show preview'}</span>
            <span className="sw1-previewtoggle__chev" aria-hidden>{previewOpen ? '▲' : '▼'}</span>
          </button>
        )}

      <div className="sw1-frame" ref={captureRef}>
        <MatchHeader club={club} match={match} vsStyle={vsStyle} />

        <RotatingBanner
          sponsors={sponsors?.rotating}
          interval={sponsors?.rotationMs ?? 3800}
          showAdvertise={!admin}
        />

        <div className="sw1-stage">
          {data.watermark && (
            <div className={`sw1-stage-watermark ${wmIsLogo && wmLogo ? 'is-logo' : ''}`} aria-hidden>
              {Array.from({ length: 16 }).map((_, r) => (
                <div key={r} className="sw1-watermark__row">
                  {Array.from({ length: 10 }).map((__, c) =>
                    wmIsLogo && wmLogo ? (
                      <img key={c} src={wmLogo} alt="" />
                    ) : (
                      <span key={c}>{wmText}</span>
                    ),
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="sw1-pitchwrap">
            <div className="sw1-pitch">
              <Oval />

              {/* line labels hang off the left edge, over the field */}
              <div className="sw1-lines" aria-hidden>
                {LINE_LABELS.map((l) => (
                  <div key={l.text} className="sw1-lines__label" style={{ top: `${l.top}%` }}>
                    <span className="sw1-lines__full">{l.text}</span>
                    <span className="sw1-lines__abbr">{l.abbr}</span>
                  </div>
                ))}
              </div>

              {slots.map((slot) => {
                const id = positions[slot.key];
                const player = id ? playerMap.get(id) : null;
                const picked = !!id && selectedPlayerId === id;
                return (
                  <div
                    key={slot.key}
                    className={`sw1-slot ${picked ? 'is-picked' : ''}`}
                    style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    data-slot={slot.key}
                    onClick={() => {
                      if (!admin) return;
                      if (selectedPlayerId) placeIntoSlot(slot.key, selectedPlayerId);
                      else if (id) setSelectedPlayerId(id); // pick up a placed player
                    }}
                    onDragOver={(e) => admin && e.preventDefault()}
                    onDrop={(e) => {
                      if (!admin) return;
                      e.preventDefault();
                      const dropped = e.dataTransfer.getData('text/plain') || selectedPlayerId;
                      if (dropped) placeIntoSlot(slot.key, dropped);
                    }}
                  >
                    {player ? (
                      <div
                        draggable={admin}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', player.id)}
                      >
                        <PlayerPlate player={player} visualMode={visualMode} teamJumperUrl={jumperImageUrl} compact />
                      </div>
                    ) : admin ? (
                      <div className="sw1-slot__empty">{slot.label}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Followers (ruck division) sit centred directly under the oval */}
          {(admin || benchByArea.followers.length > 0) && (
            <div className="sw1-followers-wrap">
              <div className="sw1-grouplabel">Followers</div>
              <div className="sw1-followers">
              {[0, 1, 2].map((idx) => {
                const id = benchByArea.followers[idx];
                const player = id ? playerMap.get(id) : null;
                const picked = !!id && selectedPlayerId === id;
                return (
                  <div key={idx} className="sw1-follower">
                    <div
                      className={`sw1-follower__slot ${picked ? 'is-picked' : ''} ${
                        player ? 'is-filled' : ''
                      }`}
                      onClick={() => {
                        if (!admin) return;
                        if (selectedPlayerId) assignToArea('followers', selectedPlayerId);
                        else if (id) setSelectedPlayerId(id);
                      }}
                      onDragOver={(e) => admin && e.preventDefault()}
                      onDrop={(e) => {
                        if (!admin) return;
                        e.preventDefault();
                        const dropped = e.dataTransfer.getData('text/plain') || selectedPlayerId;
                        if (dropped) assignToArea('followers', dropped);
                      }}
                    >
                      {player ? (
                        <div
                          draggable={admin}
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', player.id)}
                        >
                          <PlayerPlate player={player} visualMode={visualMode} teamJumperUrl={jumperImageUrl} compact />
                        </div>
                      ) : (
                        <div className="sw1-follower__empty">{FOLLOWER_LABELS[idx]}</div>
                      )}
                    </div>
                    <div className="sw1-follower__label">{FOLLOWER_LABELS[idx]}</div>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* Interchange — corner-floats on a wide graphic, but stacks under the
              followers when it's heavy (>6) so it never rides up over the oval. */}
          {renderBench('interchange') && (
            <div className={`sw1-interchange ${benchByArea.interchange.length === 0 ? 'sw1-zone--empty' : ''} ${benchByArea.interchange.length > 6 ? 'sw1-zone--stack' : ''}`}>
              {renderBench('interchange')}
            </div>
          )}

          {/* Emergencies last in the bench order */}
          {renderBench('emergencies') && (
            <div className={`sw1-emergencies ${benchByArea.emergencies.length === 0 ? 'sw1-zone--empty' : ''} ${benchByArea.emergencies.length > 6 ? 'sw1-zone--stack' : ''}`}>
              {renderBench('emergencies')}
            </div>
          )}
        </div>

        {/* Unavailable: admin-only — never shown on the public/embedded graphic */}
        {admin && renderBench('unavailable') && (
          <div className="sw1-unavailable-wrap">{renderBench('unavailable')}</div>
        )}

        <StatusLegend present={presentStatuses} />

        <footer className="sw1-footer">
          Powered by{' '}
          <a href="https://sportsweb.com.au" target="_blank" rel="noopener noreferrer">
            <strong>SportsWeb One</strong>
          </a>
        </footer>
      </div>
      </div>
      </div>

      {/* Print sheet — the captured PUBLIC graphic on a single A3 page, plus a QR
          and a note about screens / posters. Only visible while printing. */}
      {printImage && (
        <div className="sw1-printsheet" aria-hidden="true">
          <img className="sw1-printsheet__img" src={printImage} alt="" />
          <div className="sw1-printsheet__foot">
            <img className="sw1-printsheet__qr" src={qrSrc(printUrl)} alt="" />
            <div className="sw1-printsheet__cap">
              <strong>See the live team online</strong>
              <span>Scan to view selections, ins &amp; outs and fixtures. Print A3 for the club rooms &amp; change rooms, or cast the link to club screens — great exposure for your sponsors.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
