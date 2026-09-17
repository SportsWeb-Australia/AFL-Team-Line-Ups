import type { Player, PlayerStatus, PositionKey } from '../types';

/**
 * Turns spoken (or typed) selection talk into squad actions.
 *
 *   "23 Jack Reardon full forward"      add #23 Jack Reardon, put him at FF
 *   "Reardon centre half back"          move an existing player
 *   "number 7 ruck rover"               find by guernsey number
 *   "Sam Okafor captain"                role
 *   "Tom Wallis injured"                availability
 *   "Eli Brooks interchange"            bench groups
 *
 * One clause per pause. Speech engines return each pause as its own result, and
 * typed text splits on new lines, commas and full stops, so a whole side can be
 * read out in one go. Nothing here touches the sheet: it returns actions for the
 * club to check and apply, because a misheard name should never land silently.
 */

export type VoiceTarget = PositionKey | 'interchange' | 'emergencies' | 'follower0' | 'follower1' | 'follower2';

/** Who an action is about: a player already in the squad, or one added earlier in the same batch. */
export type PlayerRef = { id: string } | { pending: number };

export type VoiceAction =
  | { kind: 'add'; pending: number; number: string; name: string; target?: VoiceTarget; heard: string }
  | { kind: 'place'; who: PlayerRef; name: string; target: VoiceTarget; heard: string }
  | { kind: 'role'; who: PlayerRef; name: string; role: PlayerStatus; heard: string }
  | { kind: 'status'; who: PlayerRef; name: string; reason: PlayerStatus; heard: string }
  | { kind: 'unknown'; heard: string; why: string };

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

/** Longest phrases first, so "centre half forward" wins over "centre". */
const TARGETS: [string, VoiceTarget][] = (
  [
    ['left back pocket', 'BPL'], ['back pocket left', 'BPL'], ['right back pocket', 'BPR'], ['back pocket right', 'BPR'],
    ['back pocket', 'BPL'], ['full back', 'FB'], ['fullback', 'FB'],
    ['left half back flank', 'HBL'], ['left half back', 'HBL'], ['half back flank left', 'HBL'],
    ['right half back flank', 'HBR'], ['right half back', 'HBR'], ['half back flank right', 'HBR'],
    ['half back flank', 'HBL'], ['centre half back', 'CHB'], ['center half back', 'CHB'],
    ['left wing', 'WL'], ['wing left', 'WL'], ['right wing', 'WR'], ['wing right', 'WR'], ['wing', 'WL'],
    ['left half forward flank', 'HFL'], ['left half forward', 'HFL'], ['half forward flank left', 'HFL'],
    ['right half forward flank', 'HFR'], ['right half forward', 'HFR'], ['half forward flank right', 'HFR'],
    ['half forward flank', 'HFL'], ['centre half forward', 'CHF'], ['center half forward', 'CHF'],
    ['left forward pocket', 'FPL'], ['forward pocket left', 'FPL'], ['right forward pocket', 'FPR'], ['forward pocket right', 'FPR'],
    ['forward pocket', 'FPL'], ['full forward', 'FF'], ['fullforward', 'FF'],
    ['ruck rover', 'follower1'], ['rover', 'follower2'], ['ruckman', 'follower0'], ['ruck', 'follower0'],
    ['centre', 'C'], ['center', 'C'],
    ['interchange', 'interchange'], ['on the bench', 'interchange'], ['bench', 'interchange'],
    ['emergency', 'emergencies'], ['emergencies', 'emergencies'],
  ] as [string, VoiceTarget][]
).sort((a, b) => b[0].length - a[0].length);

const ROLES: [string, PlayerStatus][] = [
  ['vice captain', 'vice-captain'], ['vice-captain', 'vice-captain'], ['vc', 'vice-captain'],
  ['captain', 'captain'], ['skipper', 'captain'],
  ['debut', 'debut'], ['debutant', 'debut'], ['milestone', 'milestone'],
];

const STATUSES: [string, PlayerStatus][] = [
  ['concussion', 'concussion'], ['concussed', 'concussion'],
  ['injured', 'injured'], ['injury', 'injured'],
  ['suspended', 'suspended'], ['suspension', 'suspended'],
  ['personal', 'personal'], ['unavailable', 'personal'], ['not available', 'personal'],
];

export const TARGET_LABEL: Record<VoiceTarget, string> = {
  BPL: 'Back pocket (L)', FB: 'Full back', BPR: 'Back pocket (R)',
  HBL: 'Half back flank (L)', CHB: 'Centre half back', HBR: 'Half back flank (R)',
  WL: 'Wing (L)', C: 'Centre', WR: 'Wing (R)',
  HFL: 'Half forward flank (L)', CHF: 'Centre half forward', HFR: 'Half forward flank (R)',
  FPL: 'Forward pocket (L)', FF: 'Full forward', FPR: 'Forward pocket (R)',
  follower0: 'Ruck', follower1: 'Ruck rover', follower2: 'Rover',
  interchange: 'Interchange', emergencies: 'Emergency',
};

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/* ── Helpers ────────────────────────────────────────────────────────────── */

const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

/** "twenty three" → "23" (up to 99), so a spoken number reads like a typed one. */
function wordsToDigits(text: string): string {
  const words = text.split(' ');
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const t = TENS.indexOf(w);
    if (t >= 2) {
      const next = words[i + 1] ? UNITS.indexOf(words[i + 1].replace(/-/g, '')) : -1;
      if (next >= 1 && next <= 9) {
        out.push(String(t * 10 + next));
        i++;
      } else out.push(String(t * 10));
      continue;
    }
    const hy = w.match(/^([a-z]+)-([a-z]+)$/);
    if (hy && TENS.indexOf(hy[1]) >= 2 && UNITS.indexOf(hy[2]) >= 1 && UNITS.indexOf(hy[2]) <= 9) {
      out.push(String(TENS.indexOf(hy[1]) * 10 + UNITS.indexOf(hy[2])));
      continue;
    }
    const u = UNITS.indexOf(w);
    // Only after "number"/at the start: "one" inside a name is left alone.
    if (u >= 0 && (i === 0 || words[i - 1] === 'number' || words[i - 1] === 'no')) {
      out.push(String(u));
      continue;
    }
    out.push(w);
  }
  return out.join(' ');
}

/** Pull a trailing phrase from a vocabulary off the end of a clause. */
function takeTail<T>(text: string, vocab: [string, T][]): { rest: string; value: T } | null {
  for (const [phrase, value] of vocab) {
    const re = new RegExp(`(?:^|\\s)(?:to|at|in|on|is|as|the|a|plays|playing|goes)?\\s*(?:the\\s)?${phrase.replace(/\s/g, '\\s')}$`);
    const m = text.match(re);
    if (m) return { rest: text.slice(0, m.index).trim(), value };
  }
  return null;
}

type Known = { ref: PlayerRef; name: string; number: string };

/** Find who a phrase means: full name, a unique surname or first name, or a guernsey number. */
function findPlayer(phrase: string, known: Known[]): Known | null | 'ambiguous' {
  const p = norm(phrase).replace(/^(number|no)\s+/, '');
  if (!p) return null;
  if (/^\d{1,3}$/.test(p)) return known.find((k) => k.number === p) ?? null;
  const exact = known.filter((k) => norm(k.name) === p);
  if (exact.length === 1) return exact[0];
  const tokens = p.split(' ');
  const hits = known.filter((k) => {
    const parts = norm(k.name).split(' ');
    return tokens.every((t) => parts.includes(t));
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return 'ambiguous';
  return null;
}

const titleCase = (s: string) =>
  s.replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b);

/** Split a transcript or typed block into one clause per player. */
export function splitClauses(text: string): string[] {
  return text
    .split(/[\n,.;]+|\s+(?:next|then|and then|followed by)\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/* ── Parser ─────────────────────────────────────────────────────────────── */

export function parseSelection(text: string, players: Player[]): VoiceAction[] {
  const known: Known[] = players
    .filter((p) => p.name.trim())
    .map((p) => ({ ref: { id: p.id }, name: p.name, number: (p.number || '').trim() }));
  const actions: VoiceAction[] = [];
  let pending = 0;

  for (const heard of splitClauses(text)) {
    let c = wordsToDigits(norm(heard)).replace(/^(add|new player|new)\s+/, '');
    const isAdd = /^(add|new)\b/.test(norm(heard));

    const role = takeTail(c, ROLES);
    if (role) {
      const who = findPlayer(role.rest, known);
      if (who && who !== 'ambiguous') actions.push({ kind: 'role', who: who.ref, name: who.name, role: role.value, heard });
      else actions.push({ kind: 'unknown', heard, why: who === 'ambiguous' ? 'More than one player matches that name.' : `No player called "${role.rest}".` });
      continue;
    }
    const status = takeTail(c, STATUSES);
    if (status) {
      const who = findPlayer(status.rest, known);
      if (who && who !== 'ambiguous') actions.push({ kind: 'status', who: who.ref, name: who.name, reason: status.value, heard });
      else actions.push({ kind: 'unknown', heard, why: who === 'ambiguous' ? 'More than one player matches that name.' : `No player called "${status.rest}".` });
      continue;
    }

    const place = takeTail(c, TARGETS);
    const subject = place ? place.rest : c;
    // "23 Jack Reardon" → number + name.
    const numbered = subject.match(/^(?:number\s+|no\s+)?(\d{1,3})\s+(.+)$/);
    const nameOnly = numbered ? numbered[2] : subject;
    // "23 Jack Reardon" is about Jack Reardon; a bare "number 23" is about #23.
    const existing = findPlayer(numbered ? nameOnly : subject, known);

    if (!isAdd && existing && existing !== 'ambiguous') {
      if (place) actions.push({ kind: 'place', who: existing.ref, name: existing.name, target: place.value, heard });
      else actions.push({ kind: 'unknown', heard, why: `${existing.name} is already in the squad. Say where they play.` });
      continue;
    }
    if (existing === 'ambiguous') {
      actions.push({ kind: 'unknown', heard, why: 'More than one player matches that name. Add the first name or number.' });
      continue;
    }
    // A new player needs a real name: at least two letters, not just a number.
    const newName = titleCase(nameOnly.replace(/^(number|no)\s+\d+\s*/, '').trim());
    if (!/[a-z]{2}/i.test(newName)) {
      actions.push({ kind: 'unknown', heard, why: 'Couldn’t tell who that was.' });
      continue;
    }
    const number = numbered ? numbered[1] : '';
    const clash = number && known.find((k) => k.number === number);
    if (clash) {
      actions.push({ kind: 'unknown', heard, why: `Number ${number} is already ${clash.name}.` });
      continue;
    }
    const idx = pending++;
    actions.push({ kind: 'add', pending: idx, number, name: newName, target: place?.value, heard });
    known.push({ ref: { pending: idx }, name: newName, number });
  }
  return actions;
}
