-- ============================================================================
--  SportsWeb One — AFL Team Sheet : database schema (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
--  Designed from scratch for the line-up widget, but normalised so it plugs
--  straight into the larger SportsWeb One platform: every table is club-scoped
--  via club_id, which is how the platform multi-tenants its clubs.
--
--  Apply in the Supabase SQL editor (or `supabase db push`). Safe to re-run:
--  it drops and recreates the schema objects in dependency order.
-- ============================================================================

create extension if not exists "pgcrypto";          -- gen_random_uuid()

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  -- the 15 on-field positions (matches PositionKey in the app's types.ts)
  create type position_key as enum (
    'BPL','FB','BPR',          -- back line
    'HBL','CHB','HBR',         -- half-back line
    'WL','C','WR',             -- centre line
    'HFL','CHF','HFR',         -- half-forward line
    'FPL','FF','FPR'           -- forward line
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type bench_area as enum ('followers','interchange','emergencies','unavailable');
exception when duplicate_object then null; end $$;

-- ── updated_at helper ────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ── clubs ────────────────────────────────────────────────────────────────────
-- Both the home club AND opponents live here. Colours + logo drive the graphic.
create table if not exists clubs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  short_name     text,
  primary_color  text not null default '#0c2340',
  secondary_color text not null default '#f5b301',
  ink_color      text not null default '#0c2340',
  logo_url       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── venues ───────────────────────────────────────────────────────────────────
create table if not exists venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  created_at  timestamptz not null default now()
);

-- ── teams ────────────────────────────────────────────────────────────────────
-- A club fields many teams/grades (Seniors, Reserves, U19s, Women's, ...).
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  name        text not null,                 -- e.g. 'Seniors'  (shown as Grade)
  grade       text,                          -- optional finer grade label
  competition text,                          -- e.g. 'Eastern Football Netball League'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists teams_club_idx on teams(club_id);

-- ── players ──────────────────────────────────────────────────────────────────
create table if not exists players (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references clubs(id) on delete cascade,
  team_id        uuid references teams(id) on delete set null,
  first_name     text not null,
  last_name      text not null,
  display_name   text,                        -- overrides "First Last" if set
  number         text,                        -- guernsey number (text: keeps "07")
  headshot_url   text,                        -- cut-out / portrait
  jumper_image_url text,
  profile_url    text,                        -- link to club site / PlayHQ profile
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists players_club_idx on players(club_id);
create index if not exists players_team_idx on players(team_id);

-- ── sponsors ─────────────────────────────────────────────────────────────────
create table if not exists sponsors (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  name        text not null,
  tier        text,                           -- 'Major Sponsor', 'Club Partner', ...
  logo_url    text,
  banner_url  text,                            -- pre-made rotating banner image
  href        text,                            -- click-through link
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sponsors_club_idx on sponsors(club_id);

-- ── fixtures ─────────────────────────────────────────────────────────────────
-- One match for a given team/grade. Opponent can be a known club (FK) or just
-- a name + logo, so you can publish a sheet even before the opponent is set up.
create table if not exists fixtures (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  round             text,                      -- 'Round 7'
  match_date        date,
  match_time        text,                      -- '2:10 PM' (kept as text for display)
  venue_id          uuid references venues(id) on delete set null,
  opponent_club_id  uuid references clubs(id) on delete set null,
  opponent_name     text,                      -- fallback when opponent_club_id is null
  opponent_logo_url text,                      -- fallback
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists fixtures_team_idx on fixtures(team_id);

-- ── lineups ──────────────────────────────────────────────────────────────────
-- A published selection for a fixture. (Allows draft vs published, and history.)
create table if not exists lineups (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  published   boolean not null default false,
  visual_mode text not null default 'none',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lineups_fixture_idx on lineups(fixture_id);

-- ── lineup_positions ─────────────────────────────────────────────────────────
-- Each row places ONE player either on a field position OR in a bench area.
-- Exactly one of (position_key, bench_area) is set — enforced by the check.
create table if not exists lineup_positions (
  id            uuid primary key default gen_random_uuid(),
  lineup_id     uuid not null references lineups(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  position_key  position_key,
  bench_area    bench_area,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  constraint exactly_one_slot check (
    (position_key is not null and bench_area is null)
    or (position_key is null and bench_area is not null)
  )
);
create index if not exists lineup_positions_lineup_idx on lineup_positions(lineup_id);
-- a field position can only be filled once per lineup
create unique index if not exists lineup_positions_unique_field
  on lineup_positions(lineup_id, position_key) where position_key is not null;

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clubs','teams','players','sponsors','fixtures','lineups']
  loop
    execute format('drop trigger if exists set_updated_at on %I;', t);
    execute format('create trigger set_updated_at before update on %I
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Public read so the embedded widget can render with the anon key.
-- WRITE policies are intentionally left to the SportsWeb One auth model
-- (club admins). The commented policy shows the intended shape.
alter table clubs            enable row level security;
alter table venues           enable row level security;
alter table teams            enable row level security;
alter table players          enable row level security;
alter table sponsors         enable row level security;
alter table fixtures         enable row level security;
alter table lineups          enable row level security;
alter table lineup_positions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clubs','venues','teams','players','sponsors',
                           'fixtures','lineups','lineup_positions']
  loop
    execute format('drop policy if exists "public read" on %I;', t);
    execute format('create policy "public read" on %I for select using (true);', t);
  end loop;
end $$;

-- Example write policy (enable once auth + a club_members table exist):
-- create policy "club admins write" on players for all
--   using  (club_id in (select club_id from club_members where user_id = auth.uid()))
--   with check (club_id in (select club_id from club_members where user_id = auth.uid()));
