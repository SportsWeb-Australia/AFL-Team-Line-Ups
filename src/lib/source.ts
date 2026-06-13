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
 * True when an error is "the lineup_positions.status column isn't there yet" —
 * i.e. add-status.sql hasn't been run. Lets load + save fall back gracefully so
 * the app works before the migration (without status persistence) and lights it
 * up automatically once the column exists. Covers the Postgres undefined-column
 * code, the PostgREST schema-cache code, and the human-readable message.
 */
function isMissingStatusColumn(err: any): boolean {
  const code = err?.code;
  const msg = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('status') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

/** True when an error looks like a not-yet-migrated column (so we can fall back). */
function isMissingColumn(err: any): boolean {
  return err?.code === '42703' || err?.code === 'PGRST204';
}

/** Result of a save: the refs plus app-id -> db-id for every persisted player. */
export interface SaveResult {
  refs: DbRefs;
  playerIds: Map<string, string>;
}

/**
 * Loads a team sheet from the SportsWeb One database and maps it to the app's
 * `TeamSheetData` shape, plus the DB ids so a later save updates the same rows.
 */
export async function loadTeamSheet(
  fixtureId: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<LoadedSheet> {
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

  // Public/embed views only ever show a PUBLISHED line-up; the admin editor
  // loads the latest line-up whether it's a draft or live.
  const lineupQuery = (cols: string) => {
    let q = sb.from('lineups').select(cols).eq('fixture_id', fixtureId);
    if (opts.publishedOnly) q = q.eq('published', true);
    return q.order('published', { ascending: false }).limit(1).maybeSingle();
  };

  const fxPromise = fetchFixture();
  // Try to read saved display settings; fall back column-by-column if not migrated.
  let lnRes = await lineupQuery('id, visual_mode, watermark_source, jumper_image_url, vs_style, watermark_text, watermark_logo_url');
  if (lnRes.error && isMissingColumn(lnRes.error)) lnRes = await lineupQuery('id, visual_mode, watermark_source, jumper_image_url, vs_style');
  if (lnRes.error && isMissingColumn(lnRes.error)) lnRes = await lineupQuery('id, visual_mode, watermark_source, jumper_image_url');
  if (lnRes.error && isMissingColumn(lnRes.error)) lnRes = await lineupQuery('id, visual_mode, watermark_source');
  if (lnRes.error && isMissingColumn(lnRes.error)) lnRes = await lineupQuery('id, visual_mode');
  if (lnRes.error && isMissingColumn(lnRes.error)) lnRes = await lineupQuery('id');
  const { data: fx, error: fxErr } = await fxPromise;
  const { data: lineup, error: lnErr } = lnRes as { data: any; error: any };

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
    const selectWith = (withStatus: boolean) =>
      supabase!
        .from('lineup_positions')
        .select(
          `position_key, bench_area, sort_order${withStatus ? ', status' : ''},
           player:players ( id, number, first_name, last_name, display_name,
                            headshot_url, jumper_image_url )`,
        )
        .eq('lineup_id', (lineup as any).id)
        .order('sort_order');

    let { data: rows, error: rowsErr } = await selectWith(true);
    if (rowsErr && isMissingStatusColumn(rowsErr)) {
      // add-status.sql not run yet — load everything else and skip status.
      ({ data: rows, error: rowsErr } = await selectWith(false));
    }
    if (rowsErr) throw rowsErr;

    for (const r of (rows as any[]) ?? []) {
      const p = r.player;
      const status = Array.isArray(r.status) && r.status.length ? (r.status as Player['status']) : undefined;
      players.push({
        id: p.id,
        dbId: p.id,
        number: p.number ?? '',
        name: p.display_name ?? `${p.first_name} ${p.last_name}`,
        headshotUrl: p.headshot_url ?? undefined,
        jumperImageUrl: p.jumper_image_url ?? undefined,
        sourceType: 'standalone',
        status,
      });
      if (r.position_key) positions[r.position_key as PositionKey] = p.id;
      else if (r.bench_area) bench[r.bench_area].push(p.id);
    }
  }

  // Squad for THIS team (grade) — every player who has appeared in any of this
  // team's line-ups stays selectable across rounds, but players from OTHER teams
  // at the same club are NOT merged in. (When all teams share one club, a club-wide
  // merge polluted each team's squad with everyone — the "squad doesn't match the
  // field / adds to the previous team" bug.)
  //
  // [FUTURE — SportsWeb One linked clubs] When a club is SW1-linked, this is
  // where we'd merge players synced from the SportsWeb One club/team database
  // (sourceType 'sportsweb_one'), keyed by their SW1 external id so we never
  // create duplicates. SW1 remains the source of truth for those records.
  try {
    const { data: roster } = await supabase
      .from('lineup_positions')
      .select(
        `player:players ( id, number, first_name, last_name, display_name, headshot_url, jumper_image_url ),
         lineup:lineups!inner ( fixture:fixtures!inner ( team_id ) )`,
      )
      .eq('lineup.fixture.team_id', team.id);
    const have = new Set(players.map((p) => p.id));
    for (const row of (roster as any[]) ?? []) {
      const p = row.player;
      if (!p || have.has(p.id)) continue;
      have.add(p.id);
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
    visualMode: (lineup && (lineup as any).visual_mode) || undefined,
    watermarkSource: (lineup && (lineup as any).watermark_source) || undefined,
    jumperImageUrl: (lineup && (lineup as any).jumper_image_url) || undefined,
    vsStyle: (lineup && (lineup as any).vs_style) || undefined,
    watermarkText: (lineup && (lineup as any).watermark_text) || undefined,
    watermarkLogoUrl: (lineup && (lineup as any).watermark_logo_url) || undefined,
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
export async function loadLatestTeamSheet(
  opts: { publishedOnly?: boolean } = {},
): Promise<LoadedSheet | null> {
  if (!supabase) throw new Error('Database is not configured.');
  const { data, error } = await supabase
    .from('fixtures')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return loadTeamSheet((data[0] as any).id, opts);
}

/**
 * Latest team sheet for a club (optionally a single grade), newest first. This
 * powers the auto-updating embed: a club page embeds by club+grade rather than a
 * pinned fixture, so it always shows whatever is currently published for that
 * grade — no code change needed each round. Walks newest→oldest and returns the
 * first fixture that resolves under the given options (so with publishedOnly it
 * skips drafts and lands on the most recent LIVE team).
 */
export async function loadLatestForClubGrade(
  clubId: string,
  grade: string | null,
  opts: { publishedOnly?: boolean } = {},
): Promise<LoadedSheet | null> {
  if (!supabase) throw new Error('Database is not configured.');
  let q = supabase
    .from('fixtures')
    .select('id, created_at, team:teams!inner ( name, club_id )')
    .eq('team.club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (grade) q = q.eq('team.name', grade);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || data.length === 0) return null;
  let firstLoaded: LoadedSheet | null = null;
  for (const row of data as any[]) {
    const sheet = await loadTeamSheet(row.id, opts);
    if (!sheet) continue;
    if (!firstLoaded) firstLoaded = sheet;
    // Prefer the newest fixture that genuinely has a published line-up with
    // players on it — otherwise the embed falls back to an empty/default graphic
    // (no jumpers, club-name watermark) for a fixture that was never published.
    const hasTeam =
      !!sheet.refs.lineupId &&
      (Object.keys(sheet.data.lineup.positions).length > 0 ||
        sheet.data.lineup.followers.length > 0 ||
        sheet.data.lineup.interchange.length > 0);
    if (hasTeam) return sheet;
  }
  // Nothing fully published yet — show the newest we could load rather than nothing.
  return firstLoaded;
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
export async function saveTeamSheet(
  d: TeamSheetData,
  refs: DbRefs,
  opts: { publish?: boolean } = {},
): Promise<SaveResult> {
  const publish = opts.publish ?? true;
  if (!supabase) throw new Error('Database is not configured.');

  // 1. club — find-or-create by NAME so a club's saved teams always live under
  //    the one club row (across sessions too). Without this, every fresh save
  //    created a brand-new club, so the recall list only ever showed the last one.
  const clubFields = {
    name: d.club.name || 'My Club',
    short_name: d.club.shortName ?? null,
    primary_color: d.club.primaryColor,
    secondary_color: d.club.secondaryColor,
    ink_color: d.club.inkColor ?? '#0c2340',
    logo_url: d.club.logoUrl ?? null,
  };
  let clubId: string;
  {
    let existingId = refs.clubId ?? null;
    if (!existingId) {
      const { data: found } = await supabase
        .from('clubs')
        .select('id')
        .eq('name', clubFields.name)
        .limit(1);
      if (found && found.length) existingId = (found[0] as any).id;
    }
    if (existingId) {
      const { error: ue } = await supabase.from('clubs').update(clubFields).eq('id', existingId);
      if (ue) throw ue;
      clubId = existingId;
    } else {
      const { data: c, error: e1 } = await supabase
        .from('clubs')
        .insert(clubFields)
        .select('id')
        .single();
      if (e1) throw e1;
      clubId = (c as any).id as string;
    }
  }

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

    const vmode = d.visualMode ?? 'none';
    const wmsrc = d.watermarkSource ?? null;
    const jumper = d.jumperImageUrl ?? null;
    const vstyle = d.vsStyle ?? null;
    const wmtext = d.watermarkText ?? null;
    const wmlogo = d.watermarkLogoUrl ?? null;
    if (existing && existing.length) {
      lineupId = (existing[0] as any).id;
      // Publish marks it live. A draft save updates the data + display settings and
      // leaves the live/offline status untouched (re-editing a live team never blanks it).
      const live = publish ? { published: true } : {};
      // Progressive fallback: keep the CORE display settings (visual mode + jumper)
      // as long as possible, only shedding the newest optional columns if a column
      // is genuinely missing. A real failure (RLS, payload) is thrown, not swallowed —
      // otherwise a failed publish silently leaves the old, jumper-less row live.
      const patches: Record<string, any>[] = [
        { visual_mode: vmode, watermark_source: wmsrc, jumper_image_url: jumper, vs_style: vstyle, watermark_text: wmtext, watermark_logo_url: wmlogo, ...live },
        { visual_mode: vmode, watermark_source: wmsrc, jumper_image_url: jumper, vs_style: vstyle, ...live },
        { visual_mode: vmode, watermark_source: wmsrc, jumper_image_url: jumper, ...live },
        { visual_mode: vmode, watermark_source: wmsrc, ...live },
        { visual_mode: vmode, ...live },
        ...(publish ? [{ published: true }] : []),
      ];
      let ue: any = null;
      for (const p of patches) {
        const r = await supabase.from('lineups').update(p).eq('id', lineupId);
        ue = r.error;
        if (!ue) break;
        if (!isMissingColumn(ue)) break; // real error — stop and surface it below
      }
      if (ue) throw ue;
    } else {
      const live = { published: publish };
      const inserts: Record<string, any>[] = [
        { fixture_id: fixtureId, ...live, visual_mode: vmode, watermark_source: wmsrc, jumper_image_url: jumper, vs_style: vstyle, watermark_text: wmtext, watermark_logo_url: wmlogo },
        { fixture_id: fixtureId, ...live, visual_mode: vmode, watermark_source: wmsrc, jumper_image_url: jumper, vs_style: vstyle },
        { fixture_id: fixtureId, ...live, visual_mode: vmode, watermark_source: wmsrc, jumper_image_url: jumper },
        { fixture_id: fixtureId, ...live, visual_mode: vmode, watermark_source: wmsrc },
        { fixture_id: fixtureId, ...live, visual_mode: vmode },
        { fixture_id: fixtureId, ...live },
      ];
      let ins: any = null;
      for (const payload of inserts) {
        ins = await supabase.from('lineups').insert(payload).select('id').single();
        if (!ins.error) break;
        if (!isMissingColumn(ins.error)) break;
      }
      if (ins.error) throw ins.error;
      lineupId = (ins.data as any).id;
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
  // Role badges (captain/VC/debut/milestone) and availability tags (injured/etc.)
  // live on the player but belong to THIS line-up — a captain one week may not be
  // the next — so they're stored per selection row, keyed by app player id.
  const statusByApp = new Map<string, string[]>();
  for (const p of d.players) {
    if (p.status && p.status.length) statusByApp.set(p.id, p.status as string[]);
  }
  const statusFor = (appId: string) => {
    const s = statusByApp.get(appId);
    return s && s.length ? s : null;
  };
  const posRows: Record<string, unknown>[] = [];
  let fieldOrder = 0;
  for (const [pos, appId] of Object.entries(d.lineup.positions)) {
    const dbId = appId ? idMap.get(appId) : undefined;
    if (dbId)
      posRows.push({
        lineup_id: lineupId,
        player_id: dbId,
        position_key: pos,
        sort_order: fieldOrder++,
        status: statusFor(appId!),
      });
  }
  (['followers', 'interchange', 'emergencies', 'unavailable'] as BenchArea[]).forEach((area) => {
    d.lineup[area].forEach((appId, i) => {
      const dbId = idMap.get(appId);
      if (dbId) posRows.push({ lineup_id: lineupId, player_id: dbId, bench_area: area, sort_order: i, status: statusFor(appId) });
    });
  });
  if (posRows.length) {
    let { error: e7 } = await supabase.from('lineup_positions').insert(posRows);
    if (e7 && isMissingStatusColumn(e7)) {
      // add-status.sql not run yet — save the placements without status so the
      // team still saves (run the migration later to start persisting badges).
      const stripped = posRows.map(({ status, ...rest }) => rest);
      ({ error: e7 } = await supabase.from('lineup_positions').insert(stripped));
    }
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

/**
 * Permanently delete one saved team (fixture) and its line-up.
 *
 * Fixtures cascade to lineups → lineup_positions, so removing the fixture row
 * clears the whole saved team. Players, the club and sponsors are shared club
 * assets and are deliberately left untouched, so deleting Round 7 never wipes
 * your squad or your other rounds.
 */
export async function deleteTeamSheet(fixtureId: string): Promise<void> {
  if (!supabase) throw new Error('Database is not configured.');
  const { error } = await supabase.from('fixtures').delete().eq('id', fixtureId);
  if (error) throw error;
}

/** A player named in a saved round, for "Ins & Outs" comparison. */
export interface PrevSelection {
  number: string;
  name: string;
}
export interface PrevLineup {
  fixtureId: string;
  round: string | null;
  players: PrevSelection[];
}

/**
 * Find the round BEFORE the one in the editor (same club + grade) and return who
 * was named in it — field + bench, excluding Unavailable. Used by the admin-only
 * "Ins & Outs vs last week" panel.
 *
 * "Previous" = the fixture created just before the current one (newest-first by
 * created_at). When building a brand-new/unsaved round, it's simply the most
 * recent saved round for that grade. Returns null when there's nothing to compare
 * against yet (no DB, no club, or only one saved round).
 */
export async function loadPreviousSelections(
  clubId: string | null,
  gradeName: string,
  currentFixtureId: string | null,
): Promise<PrevLineup | null> {
  if (!supabase || !clubId) return null;

  const { data: teamRows } = await supabase
    .from('teams')
    .select('id')
    .eq('club_id', clubId)
    .eq('name', gradeName || 'Seniors')
    .limit(1);
  const teamId = (teamRows as any[])?.[0]?.id;
  if (!teamId) return null;

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, round, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  const list = (fixtures as any[]) ?? [];
  if (!list.length) return null;

  let prev: any = null;
  if (currentFixtureId) {
    const idx = list.findIndex((f) => f.id === currentFixtureId);
    prev = idx >= 0 ? list[idx + 1] : list[0]; // the round older than the current one
  } else {
    prev = list[0]; // unsaved/new round → compare to the latest saved one
  }
  if (!prev) return null;

  const { data: lu } = await supabase.from('lineups').select('id').eq('fixture_id', prev.id).limit(1);
  const lineupId = (lu as any[])?.[0]?.id;
  if (!lineupId) return { fixtureId: prev.id, round: prev.round ?? null, players: [] };

  const { data: rows } = await supabase
    .from('lineup_positions')
    .select('bench_area, player:players ( number, display_name, first_name, last_name )')
    .eq('lineup_id', lineupId);

  const players: PrevSelection[] = ((rows as any[]) ?? [])
    .filter((r) => r.bench_area !== 'unavailable')
    .map((r) => ({
      number: r.player?.number ?? '',
      name: r.player?.display_name ?? `${r.player?.first_name ?? ''} ${r.player?.last_name ?? ''}`.trim(),
    }))
    .filter((p) => p.name);

  return { fixtureId: prev.id, round: prev.round ?? null, players };
}
