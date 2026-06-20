-- ─────────────────────────────────────────────────────────────────────────
-- AFL Team Line Ups — player ownership / source type (future-ready)
-- ─────────────────────────────────────────────────────────────────────────
-- This is OPTIONAL for the current standalone fix (the app already treats
-- every player as 'standalone' by default and the line-up app owns them).
--
-- Run this when you're ready to start linking SportsWeb One clubs, so each
-- player record carries who owns it:
--   • standalone     → created in AFL Team Line Ups; this app owns the record
--   • sportsweb_one  → synced from SportsWeb One; SW1 is the source of truth
--   • fantasy_afl    → read-only public AFL player (future fantasy stream)
--
-- Safe to run more than once.

alter table players
  add column if not exists player_source_type text not null default 'standalone';

-- Where a linked player lives in the source system (e.g. SportsWeb One player id).
-- Lets us sync/update without ever creating duplicates.
alter table players
  add column if not exists external_id text;

-- Fast lookups + a guard against duplicate linked records per club.
create index if not exists players_source_idx on players (club_id, player_source_type);
create unique index if not exists players_external_uniq
  on players (player_source_type, external_id)
  where external_id is not null;

-- Optional sanity constraint on the allowed values.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_source_type_chk') then
    alter table players
      add constraint players_source_type_chk
      check (player_source_type in ('standalone','sportsweb_one','fantasy_afl'));
  end if;
end $$;
