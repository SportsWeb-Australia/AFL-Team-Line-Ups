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
const SW1_URL = 'https://uzibfawcwoapfbigpzum.supabase.co';
const SW1_PUBLISHABLE_KEY = 'sb_publishable_bxaxVOhm9-9wyRrsvJG7Sw_MxAZ-egN';

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
