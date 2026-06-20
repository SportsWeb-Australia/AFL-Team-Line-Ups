-- ============================================================================
--  Enable saving from the editor (DEV setup).
--  Run this once in the Supabase SQL editor. It does three things:
--    1. adds a write policy so the anon key can save (DEV ONLY — see warning)
--    2. adds a text column for the free-text match date the editor uses
--    3. adds a unique key so players upsert cleanly by guernsey number
--
--  ⚠️  The write policy lets anyone holding the public anon key write to these
--  tables. That is fine for a private project in development / with trusted
--  colleagues, but BEFORE production replace it with club-admin policies tied
--  to Supabase Auth (see the example at the bottom of schema.sql).
-- ============================================================================

-- 1. dev write policy on every table -----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clubs','venues','teams','players','sponsors',
                           'fixtures','lineups','lineup_positions']
  loop
    execute format('drop policy if exists "dev anon write" on %I;', t);
    execute format('create policy "dev anon write" on %I for all to anon
                    using (true) with check (true);', t);
  end loop;
end $$;

-- 2. free-text display date (e.g. "Saturday 20 July") ------------------------
alter table fixtures add column if not exists match_date_text text;

-- 3. upsert players by (club_id, number) -------------------------------------
create unique index if not exists players_club_number_uniq
  on players(club_id, number);
