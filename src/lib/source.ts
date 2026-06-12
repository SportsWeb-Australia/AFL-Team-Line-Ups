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

/** Result of a save: the refs plus app-id -> db-id for every persisted player. */
export interface SaveResult {
  refs: DbRefs;
  playerIds: Map<string, string>;
}

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
        dbId: p.id,
        number: p.number ?? '',
        name: p.display_name ?? `${p.first_name} ${p.last_name}`,
        headshotUrl: p.headshot_url ?? undefined,
        jumperImageUrl: p.jumper_image_url ?? undefined,
        sourceType: 'standalone',
      });
      if (r.position_key) positions[r.position_key as PositionKey] = p.id;
      else if (r.bench_area) bench[r.bench_area].push(p.id);
    }
  }

  // Full club roster — every saved player stays selectable after reload, not
  // just those already placed in this line-up. This is what makes manually
  // created (standalone) players reusable across future line-ups.
  //
  // [FUTURE — SportsWeb One linked clubs] When a club is SW1-linked, this is
  // where we'd merge players synced from the SportsWeb One club/team database
  // (sourceType 'sportsweb_one'), keyed by their SW1 external id so we never
  // create duplicates. SW1 remains the source of truth for those records.
  //
  // [FUTURE — Fantasy AFL] A separate read-only public AFL player DB would be
  // queried here for fantasy users (sourceType 'fantasy_afl'); never club data.
  try {
    const { data: roster } = await supabase
      .from('players')
      .select('id, number, first_name, last_name, display_name, headshot_url, jumper_image_url')
      .eq('club_id', club.id)
      .order('number');
    const have = new Set(players.map((p) => p.id));
    for (const p of (roster as any[]) ?? []) {
      if (have.has(p.id)) continue;
      players.push({
        id: p.id,
        dbId: p.id,
        number: p.number ?? '',
        name: p.display_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
        headshotUrl: p.headshot_url ?? undefined,
        jumperImageUrl: p.jumper_image_url ?? undefined,
        sourceType: 'standalone',
      });
    }
  } catch {
    /* roster fetch is best-effort; placed players above are already loaded */
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

/** A saved team in the recall list (one per fixture = round/date/grade). */
export interface SavedSheet {
  fixtureId: string;
  round: string | null;
  dateText: string | null;
  grade: string | null;
  opponent: string | null;
}

/**
 * Lists saved team sheets for ONE club (the recall picker), newest first. Each
 * row is one fixture (a round/date under a grade). Scoped by club so clubs never
 * see each other's teams — the first cut of multi-tenant isolation. Read-only.
 */
export async function listSavedSheets(clubId: string | null): Promise<SavedSheet[]> {
  if (!supabase || !clubId) return [];
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, round, match_date_text, opponent_name, created_at, team:teams!inner ( name, club_id )')
    .eq('team.club_id', clubId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return ((data as any[]) ?? []).map((f) => ({
    fixtureId: f.id as string,
    round: f.round ?? null,
    dateText: f.match_date_text ?? null,
    grade: f.team?.name ?? null,
    opponent: f.opponent_name ?? null,
  }));
}

/**
 * Saves the current sheet back to the database. Updates the rows in `refs` when
 * present, otherwise creates fresh ones. Returns the (possibly new) refs.
 *
 * Requires the dev write policy from supabase/enable-writes.sql. Writes are
 * sequential (not one transaction) — fine for the editor; production should
 * move this behind a transactional, auth-guarded function.
 */
export async function saveTeamSheet(d: TeamSheetData, refs: DbRefs): Promise<SaveResult> {
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

  // 2. team (find-or-create by club + grade name; the grade IS the identity, so
  //    switching grade targets a different team rather than renaming this one) --
  const gradeName = d.match.grade || 'Seniors';
  let teamId: string;
  {
    const { data: existing, error: te } = await supabase
      .from('teams')
      .select('id')
      .eq('club_id', clubId)
      .eq('name', gradeName)
      .limit(1);
    if (te) throw te;
    if (existing && existing.length) {
      teamId = (existing[0] as any).id;
      await supabase.from('teams').update({ competition: d.match.competition ?? null }).eq('id', teamId);
    } else {
      const { data: t, error: e2 } = await supabase
        .from('teams')
        .insert({ club_id: clubId, name: gradeName, competition: d.match.competition ?? null })
        .select('id')
        .single();
      if (e2) throw e2;
      teamId = (t as any).id;
    }
  }

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

  // 4. fixture (find-or-create by team + round + date → one saved team each) ---
  const roundVal = d.match.round?.trim() ? d.match.round.trim() : null;
  const dateVal = d.match.date?.trim() ? d.match.date.trim() : null;
  const fixtureFields = {
    team_id: teamId,
    round: roundVal,
    match_date_text: dateVal,
    match_time: d.match.time ?? null,
    venue_id: venueId,
    opponent_name: d.match.opponent ?? null,
    opponent_logo_url: d.match.opponentLogoUrl ?? null,
    opponent_club_id: null,
  };
  let fixtureId: string;
  {
    let q = supabase.from('fixtures').select('id').eq('team_id', teamId);
    q = roundVal === null ? q.is('round', null) : q.eq('round', roundVal);
    q = dateVal === null ? q.is('match_date_text', null) : q.eq('match_date_text', dateVal);
    const { data: existing, error: fe } = await q.limit(1);
    if (fe) throw fe;
    if (existing && existing.length) {
      fixtureId = (existing[0] as any).id;
      const { error: ue } = await supabase.from('fixtures').update(fixtureFields).eq('id', fixtureId);
      if (ue) throw ue;
    } else {
      const { data: fx, error: e4 } = await supabase
        .from('fixtures')
        .insert(fixtureFields)
        .select('id')
        .single();
      if (e4) throw e4;
      fixtureId = (fx as any).id;
    }
  }

  // 5. lineup (one per fixture) -----------------------------------------------
  let lineupId: string;
  {
    const { data: existing, error: le } = await supabase
      .from('lineups')
      .select('id')
      .eq('fixture_id', fixtureId)
      .limit(1);
    if (le) throw le;
    if (existing && existing.length) {
      lineupId = (existing[0] as any).id;
      await supabase.from('lineups').update({ published: true }).eq('id', lineupId);
    } else {
      const { data: ln, error: e5 } = await supabase
        .from('lineups')
        .insert({ fixture_id: fixtureId, published: true })
        .select('id')
        .single();
      if (e5) throw e5;
      lineupId = (ln as any).id;
    }
  }

  // 6. players -> map app id -> db id -----------------------------------------
  // [FUTURE — SW1] Once add-source-type.sql is run, include
  //   player_source_type: p.sourceType ?? 'standalone', external_id: p.externalId
  // here, and for sourceType 'sportsweb_one' upsert on (player_source_type,
  // external_id) instead so SW1-owned records are never duplicated.
  const idMap = new Map<string, string>(); // app id -> db id (for lineup_positions)
  const playerIds = new Map<string, string>(); // app id -> db id (returned for dedupe/write-back)

  const splitName = (full: string) => {
    const parts = full.trim().split(/\s+/);
    const first = parts.shift() ?? full;
    return { first: first || full, last: parts.join(' ') };
  };

  // 6a. Numbered players: upsert by (club_id, number) — dedupes by guernsey number.
  const numbered = d.players.filter((p) => p.number && p.number.trim());
  if (numbered.length) {
    const rows = numbered.map((p) => {
      const { first, last } = splitName(p.name);
      return {
        club_id: clubId,
        number: p.number,
        first_name: first,
        last_name: last,
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
      if (dbId) {
        idMap.set(p.id, dbId);
        playerIds.set(p.id, dbId);
      }
    }
  }

  // 6b. Numberless players: no guernsey number yet, so they can't key off number.
  // Persist by row id instead — update the row we already know, otherwise insert —
  // and report the id back so the app dedupes (rather than duplicates) on re-save.
  const numberless = d.players.filter((p) => !(p.number && p.number.trim()) && p.name.trim());
  for (const p of numberless) {
    const { first, last } = splitName(p.name);
    const row: Record<string, unknown> = {
      club_id: clubId,
      number: null,
      first_name: first,
      last_name: last,
      display_name: p.name,
      headshot_url: p.headshotUrl ?? null,
      jumper_image_url: p.jumperImageUrl ?? null,
    };
    if (p.dbId) row.id = p.dbId; // update the existing row instead of inserting a new one
    const { data: savedOne, error: eN } = await supabase
      .from('players')
      .upsert(row) // conflict target = primary key (id)
      .select('id')
      .single();
    if (eN) throw eN;
    const dbId = (savedOne as any).id as string;
    idMap.set(p.id, dbId);
    playerIds.set(p.id, dbId);
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

  return { refs: { clubId, teamId, fixtureId, lineupId }, playerIds };
}
