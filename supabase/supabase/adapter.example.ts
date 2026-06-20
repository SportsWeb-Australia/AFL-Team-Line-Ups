// ============================================================================
//  REFERENCE ONLY — not imported by the app yet (lives outside /src so it is
//  not type-checked or bundled). When you're ready to go live:
//    1. npm i @supabase/supabase-js
//    2. add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a .env file
//    3. move this to src/data/source.ts and import loadTeamSheet() in App.tsx
//       (replacing the static `sampleTeam` import).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import type { TeamSheetData, Player, PositionKey } from '../src/types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** Load a published team sheet for a fixture and map it to the app's shape. */
export async function loadTeamSheet(fixtureId: string): Promise<TeamSheetData> {
  // one round-trip per concern; small payloads, so this is fine
  const [{ data: fx }, { data: lineup }] = await Promise.all([
    supabase
      .from('fixtures')
      .select(
        `round, match_date, match_time,
         team:teams ( name, competition, club:clubs (*) ),
         venue:venues ( name ),
         opponent:clubs!fixtures_opponent_club_id_fkey ( name, logo_url ),
         opponent_name, opponent_logo_url`,
      )
      .eq('id', fixtureId)
      .single(),
    supabase
      .from('lineups')
      .select('id')
      .eq('fixture_id', fixtureId)
      .eq('published', true)
      .single(),
  ]);

  const club = (fx as any).team.club;

  const { data: rows } = await supabase
    .from('lineup_positions')
    .select(
      `position_key, bench_area, sort_order,
       player:players ( id, number, first_name, last_name, display_name,
                        headshot_url, jumper_image_url, profile_url )`,
    )
    .eq('lineup_id', (lineup as any).id)
    .order('sort_order');

  const { data: sponsorRows } = await supabase
    .from('sponsors')
    .select('name, tier, logo_url, banner_url, href')
    .eq('club_id', club.id)
    .eq('active', true)
    .order('sort_order');

  // ── map rows -> app model ──────────────────────────────────────────────
  const players: Player[] = [];
  const positions: Partial<Record<PositionKey, string>> = {};
  const bench: Record<string, string[]> = {
    followers: [], interchange: [], emergencies: [], unavailable: [],
  };

  for (const r of (rows as any[]) ?? []) {
    const p = r.player;
    players.push({
      id: p.id,
      number: p.number ?? '',
      name: p.display_name ?? `${p.first_name} ${p.last_name}`,
      headshotUrl: p.headshot_url ?? undefined,
      jumperImageUrl: p.jumper_image_url ?? undefined,
      profileUrl: p.profile_url ?? undefined,
    });
    if (r.position_key) positions[r.position_key as PositionKey] = p.id;
    else if (r.bench_area) bench[r.bench_area].push(p.id);
  }

  return {
    club: {
      name: club.name,
      primaryColor: club.primary_color,
      secondaryColor: club.secondary_color,
      inkColor: club.ink_color,
      logoUrl: club.logo_url ?? undefined,
    },
    match: {
      opponent: (fx as any).opponent?.name ?? (fx as any).opponent_name ?? 'TBC',
      opponentLogoUrl:
        (fx as any).opponent?.logo_url ?? (fx as any).opponent_logo_url ?? undefined,
      round: (fx as any).round ?? '',
      grade: (fx as any).team.name,
      competition: (fx as any).team.competition ?? undefined,
      date: (fx as any).match_date ?? '',
      time: (fx as any).match_time ?? '',
      venue: (fx as any).venue?.name ?? '',
    },
    players,
    lineup: {
      positions,
      followers: bench.followers,
      interchange: bench.interchange,
      emergencies: bench.emergencies,
      unavailable: bench.unavailable,
    },
    sponsors: {
      rotating: (sponsorRows as any[] ?? []).map((s) => ({
        name: s.name,
        tier: s.tier ?? undefined,
        logoUrl: s.logo_url ?? undefined,
        bannerUrl: s.banner_url ?? undefined,
        href: s.href ?? undefined,
      })),
    },
    watermark: true,
  };
}
