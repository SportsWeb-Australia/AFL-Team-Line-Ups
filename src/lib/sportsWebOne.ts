import { createClient } from '@supabase/supabase-js';

/**
 * Read-only bridge to the SportsWeb One "Fixtures & Ladder" module — a separate
 * product in a separate Supabase project. Lets a club that ALSO uses Fixtures &
 * Ladder import a fixture's round/opponent/date/venue instead of retyping it here,
 * without touching this app's own database or write paths at all. Matched by club
 * NAME — the only identifier the two projects share, since there's no unified club
 * id across them. If the lookup fails or finds nothing, this app behaves exactly
 * as it always has (the import picker just doesn't appear).
 */
// Production SportsWeb One unless the deployment says otherwise: a preview built for SW1's training site sets
// VITE_SW1_URL / VITE_SW1_KEY to SW1's develop project, so training never reads (or shows) live clubs' players.
const SW1_URL = (import.meta.env.VITE_SW1_URL as string | undefined) || 'https://uzibfawcwoapfbigpzum.supabase.co';
const SW1_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SW1_KEY as string | undefined) || 'sb_publishable_bxaxVOhm9-9wyRrsvJG7Sw_MxAZ-egN';

const sw1 = createClient(SW1_URL, SW1_PUBLISHABLE_KEY);

export interface SW1Fixture {
  id: string;
  round: string;
  competition: string;
  venue: string;
  matchDate: string | null; // ISO yyyy-mm-dd
  homeName: string;
  homeLogo: string | null;
  awayName: string;
  awayLogo: string | null;
}

export async function findSW1ClubIdByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await sw1.from('clubs').select('id').ilike('name', trimmed).limit(1).maybeSingle();
  if (error) {
    console.error('Fixtures & Ladder club lookup failed', error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

export async function listSW1Fixtures(clubId: string, sport: string): Promise<SW1Fixture[]> {
  const { data, error } = await sw1
    .from('fx_fixtures')
    .select('id, round, competition, venue, match_date, home_name, home_logo, away_name, away_logo')
    .eq('club_id', clubId)
    .eq('sport', sport)
    .eq('status', 'scheduled')
    .order('match_date', { ascending: true, nullsFirst: false });
  if (error) {
    console.error('Fixtures & Ladder fixtures fetch failed', error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    round: r.round ?? '',
    competition: r.competition ?? '',
    venue: r.venue ?? '',
    matchDate: r.match_date,
    homeName: r.home_name ?? '',
    homeLogo: r.home_logo,
    awayName: r.away_name ?? '',
    awayLogo: r.away_logo,
  }));
}

/** "2026-08-15" -> "Saturday 15 August" (this app stores date as a pre-formatted
 *  display string, not ISO — see MatchInfo.date in types.ts). */
export function formatSW1Date(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** A player as SportsWeb One hands them over (Website > Players). Names of under-18s already shortened by SW1. */
export interface SW1Player {
  id: string;
  name: string;
  number: string | null;
  team: string | null;
  position: string | null;
  photo: string | null;
  /** Every team they play in, with their number in that team (SW1, 27 Oct 2026). Older SW1 builds leave it out. */
  teams?: { team: string; number: string | null }[];
}

/**
 * The club's players from SportsWeb One, by its SW1 club id (the `?sw1club` SW1 opens this app with) - no name
 * matching. SW1 only hands over players the club has ticked OK to be shown, and only while Team Line-Ups is switched
 * on for the club; anything else (or SW1 being unreachable) is an empty list and the editor carries on as before.
 */
export async function listSW1Players(sw1ClubId: string): Promise<SW1Player[]> {
  const { data, error } = await sw1.rpc('lineups_squad', { p_club: sw1ClubId });
  if (error) {
    console.error('SportsWeb One players fetch failed', error);
    return [];
  }
  return Array.isArray(data) ? (data as SW1Player[]) : [];
}
