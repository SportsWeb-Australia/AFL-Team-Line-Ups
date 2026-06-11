import { supabase } from './supabase';
import type { TeamSheetData, Player, PositionKey, BenchArea } from '../types';

/** The database identifiers behind a loaded sheet, so a save updates (not duplicates). */
export interface DbRefs {
  clubId: string | null;
  teamId: string | null;
  fixtureId: string | null;
  lineupId: string | null;
}

export interface LoadedSheet {
  data: TeamSheetData;
  refs: DbRefs;
}

export const EMPTY_REFS: DbRefs = { clubId: null, teamId: null, fixtureId: null, lineupId: null };

/**
 * Loads a team sheet from the SportsWeb One database and maps it to the app's
 * `TeamSheetData` shape, plus the DB ids so a later save updates the same rows.
 */
export async function loadTeamSheet(fixtureId: string): Promise<LoadedSheet> {
  if (!supabase) throw new Error('Database is not configured.');

  const sb = supabase;
  const fixtureSelect = (withDateText: boolean) =>
    `id, round, match_date,${withDateText ? ' match_date_text,' : ''} match_time,
     team:teams ( id, name, competition, club:clubs (*) ),
     venue:venues ( name ),
     opponent:clubs!fixtures_opponent_club_id_fkey ( name, logo_url ),
     opponent_name, opponent_logo_url`;

  async function fetchFixture() {
    let res = await sb.from('fixtures').select(fixtureSelect(true)).eq('id', fixtureId).single();
    // The display-date column only exists after enable-writes.sql — fall back.
    if (res.error && /match_date_text/i.test(res.error.message)) {
      res = await sb.from('fixtures').select(fixtureSelect(false)).eq('id', fixtureId).single();
    }
    return res;
  }

  const [{ data: fx, error: fxErr }, { data: lineup, error: lnErr }] = await Promise.all([
    fetchFixture(),
    sb
      .from('lineups')
      .select('id')
      .eq('fixture_id', fixtureId)
      .order('published', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (fxErr) throw fxErr;
  if (lnErr) throw lnErr;
  if (!fx) throw new Error('Fixture not found.');

  const team = (fx as any).team;
  const club = team.club;

  const positions: Partial<Record<PositionKey, string>> = {};
  const bench: Record<string, string[]> = {
    followers: [],
    interchange: [],
    emergencies: [],
    unavailable: [],
  };
  const players: Player[] = [];

  if (lineup) {
    const { data: rows, error: rowsErr } = await supabase
      .from('lineup_positions')
      .select(
        `position_key, bench_area, sort_order,
         player:players ( id, number, first_name, last_name, display_name,
                          headshot_url, jumper_image_url )`,
      )
      .eq('lineup_id', (lineup as any).id)
      .order('sort_order');
    if (rowsErr) throw rowsErr;

    for (const r of (rows as any[]) ?? []) {
      const p = r.player;
      players.push({
        id: p.id,
        number: p.number ?? '',
        name: p.display_name ?? `${p.first_name} ${p.last_name}`,
        headshotUrl: p.headshot_url ?? undefined,
        jumperImageUrl: p.jumper_image_url ?? undefined,
      });
      if (r.position_key) positions[r.position_key as PositionKey] = p.id;
      else if (r.bench_area) bench[r.bench_area].push(p.id);
    }
  }

  const { data: sponsorRows } = await supabase
    .from('sponsors')
    .select('name, tier, logo_url, banner_url, href')
    .eq('club_id', club.id)
    .eq('active', true)
    .order('sort_order');

  const data: TeamSheetData = {
    club: {
      name: club.name,
      shortName: club.short_name ?? undefined,
      primaryColor: club.primary_color,
      secondaryColor: club.secondary_color,
      inkColor: club.ink_color ?? undefined,
      logoUrl: club.logo_url ?? undefined,
    },
    match: {
      opponent: (fx as any).opponent?.name ?? (fx as any).opponent_name ?? 'TBC',
      opponentLogoUrl:
        (fx as any).opponent?.logo_url ?? (fx as any).opponent_logo_url ?? undefined,
      round: (fx as any).round ?? '',
      grade: team.name,
      competition: team.competition ?? undefined,
      date: (fx as any).match_date_text ?? (fx as any).match_date ?? '',
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
      rotating: ((sponsorRows as any[]) ?? []).map((s) => ({
        name: s.name,
        tier: s.tier ?? undefined,
        logoUrl: s.logo_url ?? undefined,
        bannerUrl: s.banner_url ?? undefined,
        href: s.href ?? undefined,
      })),
    },
    watermark: true,
  };

  return {
    data,
    refs: {
      clubId: club.id,
      teamId: team.id,
      fixtureId: (fx as any).id,
      lineupId: lineup ? (lineup as any).id : null,
    },
  };
}

/** Load the most recently created fixture's sheet — used by the "Load" button. */
export async function loadLatestTeamSheet(): Promise<LoadedSheet | null> {
  if (!supabase) throw new Error('Database is not configured.');
  const { data, error } = await supabase
    .from('fixtures')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return loadTeamSheet((data[0] as any).id);
}

/**
 * Saves the current sheet back to the database. Updates the rows in `refs` when
 * present, otherwise creates fresh ones. Returns the (possibly new) refs.
 *
 * Requires the dev write policy from supabase/enable-writes.sql. Writes are
 * sequential (not one transaction) — fine for the editor; production should
 * move this behind a transactional, auth-guarded function.
 */
export async function saveTeamSheet(d: TeamSheetData, refs: DbRefs): Promise<DbRefs> {
  if (!supabase) throw new Error('Database is not configured.');

  // 1. club -------------------------------------------------------------------
  const { data: club, error: e1 } = await supabase
    .from('clubs')
    .upsert({
      ...(refs.clubId ? { id: refs.clubId } : {}),
      name: d.club.name || 'My Club',
      short_name: d.club.shortName ?? null,
      primary_color: d.club.primaryColor,
      secondary_color: d.club.secondaryColor,
      ink_color: d.club.inkColor ?? '#0c2340',
      logo_url: d.club.logoUrl ?? null,
    })
    .select('id')
    .single();
  if (e1) throw e1;
  const clubId = (club as any).id as string;

  // 2. team -------------------------------------------------------------------
  const { data: team, error: e2 } = await supabase
    .from('teams')
    .upsert({
      ...(refs.teamId ? { id: refs.teamId } : {}),
      club_id: clubId,
      name: d.match.grade || 'Seniors',
      competition: d.match.competition ?? null,
    })
    .select('id')
    .single();
  if (e2) throw e2;
  const teamId = (team as any).id as string;

  // 3. venue (find by name, else create) --------------------------------------
  let venueId: string | null = null;
  const venueName = d.match.venue?.trim();
  if (venueName) {
    const { data: found } = await supabase.from('venues').select('id').eq('name', venueName).limit(1);
    if (found && found.length) {
      venueId = (found[0] as any).id;
    } else {
      const { data: v, error: ev } = await supabase
        .from('venues')
        .insert({ name: venueName })
        .select('id')
        .single();
      if (ev) throw ev;
      venueId = (v as any).id;
    }
  }

  // 4. fixture ----------------------------------------------------------------
  const { data: fixture, error: e4 } = await supabase
    .from('fixtures')
    .upsert({
      ...(refs.fixtureId ? { id: refs.fixtureId } : {}),
      team_id: teamId,
      round: d.match.round ?? null,
      match_date_text: d.match.date ?? null,
      match_time: d.match.time ?? null,
      venue_id: venueId,
      opponent_name: d.match.opponent ?? null,
      opponent_logo_url: d.match.opponentLogoUrl ?? null,
      opponent_club_id: null,
    })
    .select('id')
    .single();
  if (e4) throw e4;
  const fixtureId = (fixture as any).id as string;

  // 5. lineup -----------------------------------------------------------------
  const { data: lineup, error: e5 } = await supabase
    .from('lineups')
    .upsert({
      ...(refs.lineupId ? { id: refs.lineupId } : {}),
      fixture_id: fixtureId,
      published: true,
    })
    .select('id')
    .single();
  if (e5) throw e5;
  const lineupId = (lineup as any).id as string;

  // 6. players (upsert by club_id + number) -> map app id -> db id -------------
  const idMap = new Map<string, string>();
  const numbered = d.players.filter((p) => p.number && p.number.trim());
  if (numbered.length) {
    const rows = numbered.map((p) => {
      const parts = p.name.trim().split(/\s+/);
      const first = parts.shift() ?? p.name;
      return {
        club_id: clubId,
        number: p.number,
        first_name: first || p.name,
        last_name: parts.join(' '),
        display_name: p.name,
        headshot_url: p.headshotUrl ?? null,
        jumper_image_url: p.jumperImageUrl ?? null,
      };
    });
    const { data: saved, error: e6 } = await supabase
      .from('players')
      .upsert(rows, { onConflict: 'club_id,number' })
      .select('id, number');
    if (e6) throw e6;
    const byNumber = new Map(((saved as any[]) ?? []).map((r) => [String(r.number), r.id as string]));
    for (const p of numbered) {
      const dbId = byNumber.get(String(p.number));
      if (dbId) idMap.set(p.id, dbId);
    }
  }

  // 7. lineup_positions (wipe + reinsert) -------------------------------------
  await supabase.from('lineup_positions').delete().eq('lineup_id', lineupId);
  const posRows: Record<string, unknown>[] = [];
  for (const [pos, appId] of Object.entries(d.lineup.positions)) {
    const dbId = appId ? idMap.get(appId) : undefined;
    if (dbId) posRows.push({ lineup_id: lineupId, player_id: dbId, position_key: pos });
  }
  (['followers', 'interchange', 'emergencies', 'unavailable'] as BenchArea[]).forEach((area) => {
    d.lineup[area].forEach((appId, i) => {
      const dbId = idMap.get(appId);
      if (dbId) posRows.push({ lineup_id: lineupId, player_id: dbId, bench_area: area, sort_order: i });
    });
  });
  if (posRows.length) {
    const { error: e7 } = await supabase.from('lineup_positions').insert(posRows);
    if (e7) throw e7;
  }

  // 8. sponsors (replace for club) --------------------------------------------
  await supabase.from('sponsors').delete().eq('club_id', clubId);
  const sponsors = d.sponsors?.rotating ?? [];
  const sponsorRows = sponsors
    .filter((s) => s.name || s.bannerUrl || s.logoUrl)
    .map((s, i) => ({
      club_id: clubId,
      name: s.name || `Banner ${i + 1}`,
      tier: s.tier ?? null,
      logo_url: s.logoUrl ?? null,
      banner_url: s.bannerUrl ?? null,
      href: s.href ?? null,
      sort_order: i,
    }));
  if (sponsorRows.length) {
    const { error: e8 } = await supabase.from('sponsors').insert(sponsorRows);
    if (e8) throw e8;
  }

  return { clubId, teamId, fixtureId, lineupId };
}
