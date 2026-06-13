/**
 * SportsWeb One — AFL Team Line Up
 * Core data contract.
 *
 * Everything in the widget is driven by a single `TeamSheetData` object.
 * Whether that object is hand-written sample data (today), pulled from
 * Zoho Creator, or fetched from Supabase (later), the components never change.
 */

/** The 15 on-field positions of an AFL team, by structural line. */
export type PositionKey =
  | 'BPL' | 'FB' | 'BPR' // Backs
  | 'HBL' | 'CHB' | 'HBR' // Half Backs
  | 'WL' | 'C' | 'WR' // Centre
  | 'HFL' | 'CHF' | 'HFR' // Half Forwards
  | 'FPL' | 'FF' | 'FPR'; // Forwards

/** The off-field groupings shown beneath the oval. */
export type BenchArea = 'followers' | 'interchange' | 'emergencies' | 'unavailable';

/** Optional badges shown on a player's plate. */
export type PlayerStatus =
  | 'captain'
  | 'vice-captain'
  | 'debut'
  | 'milestone'
  | 'injured'
  | 'concussion'
  | 'personal'
  | 'suspended';

/** How players are drawn on the field/bench. */
export type VisualMode = 'jumper' | 'headshot' | 'none';

/**
 * Where a player record comes from / who owns it. Future-safe for three modes:
 *  - 'standalone'   : created inside AFL Team Line Ups; this app owns the record.
 *  - 'sportsweb_one': synced from a SportsWeb One club/team DB; SW1 is the source
 *                     of truth and we must NOT duplicate these records.
 *  - 'fantasy_afl'  : read-only public AFL player (future fantasy stream only).
 */
export type PlayerSourceType = 'standalone' | 'sportsweb_one' | 'fantasy_afl';

/** Public = read-only published graphic. Admin = selectable / editable. */
export type RenderMode = 'public' | 'admin';

export interface Player {
  id: string;
  number: string;
  name: string;
  /** Optional artwork. If absent, the plate falls back to a club-coloured token. */
  jumperImageUrl?: string | null;
  headshotUrl?: string | null;
  /** Optional individual player sponsor (e.g. milestone round). */
  sponsor?: string | null;
  status?: PlayerStatus[];
  /** Ownership / origin of this record. Defaults to 'standalone' when omitted. */
  sourceType?: PlayerSourceType;
  /** For linked players, the id in the source system (e.g. SportsWeb One player id). */
  externalId?: string | null;
  /** The database row id once saved. Lets numberless players persist & dedupe. */
  dbId?: string;
}

export interface Club {
  name: string;
  /** Short form for tight spaces, e.g. "DEVILS". Defaults to `name`. */
  shortName?: string;
  logoUrl?: string | null;
  /** Drives header, banners and number tabs via CSS custom properties. */
  primaryColor: string;
  secondaryColor: string;
  /** Text colour that sits on top of `primaryColor`. Defaults to white. */
  inkColor?: string;
}

export interface Sponsor {
  name: string;
  logoUrl?: string | null;
  /** A full pre-made banner image for the rotating strip (takes priority over name/logo). */
  bannerUrl?: string | null;
  /** Optional click-through link (opens in a new tab). */
  href?: string;
  /** Display label, e.g. "Major Sponsor", "Club Partner". */
  tier?: string;
}

export interface MatchInfo {
  opponent: string;
  opponentLogoUrl?: string | null;
  /** e.g. "Eastern Football Netball League". */
  competition?: string;
  /** e.g. "Seniors", "Reserves", "Under 19s". */
  grade: string;
  /** e.g. "Round 7". */
  round: string;
  /** Pre-formatted for display, e.g. "Saturday 20 July". */
  date: string;
  /** e.g. "2:10 PM". */
  time: string;
  venue: string;
}

/** Maps each slot/area to player ids. This is the selection itself. */
export interface Lineup {
  positions: Partial<Record<PositionKey, string>>;
  followers: string[];
  interchange: string[];
  emergencies: string[];
  unavailable: string[];
}

export interface TeamSheetData {
  club: Club;
  match: MatchInfo;
  sponsors?: {
    /** Sponsors that rotate through the banner strip above the ground. */
    rotating?: Sponsor[];
    /** Milliseconds each banner is shown before rotating. */
    rotationMs?: number;
  };
  players: Player[];
  lineup: Lineup;
  /** Repeating club-name watermark behind the oval. */
  watermark?: boolean;
  /** How players render on the ground: 'jumper' | 'headshot' | 'none'. Persisted so embeds match the editor. */
  visualMode?: VisualMode;
  /** What shows in the faint background behind the oval. Persisted so embeds match the editor. */
  watermarkSource?: 'clubName' | 'clubLogo' | 'sponsorName' | 'sponsorLogo';
  /** ONE jumper image used for the whole team when visualMode === 'jumper'. */
  jumperImageUrl?: string;
}
