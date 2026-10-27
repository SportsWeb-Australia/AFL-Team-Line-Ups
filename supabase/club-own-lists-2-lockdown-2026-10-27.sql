-- Each club keeps its own opposition list and grounds, and drafts stay private
-- (SW1 security worklist #21; Carson, 27 Oct 2026: "this list of opposition clubs ... have come in from a
-- previous club or demo, it should have been clean").
--
-- Found 27 Oct (read-only):
--   * opponent_clubs and venues had no club column: one list shared by every club. Anyone holding the
--     app's public key could add or delete opposition clubs; any signed-in user could change grounds.
--   * lineups and lineup_positions could be read by anyone with the public key, so a team saved as a
--     DRAFT could be read before it was announced.
--
-- After both files:
--   1. opponent_clubs.club_id and venues.club_id say whose they are. Existing rows go to the club(s)
--      whose saved teams used them (a row used by two clubs is copied, one per club, and venues'
--      fixtures re-pointed to their own club's copy). Berrigan FNC (added 27 Oct for Dookie's test)
--      goes to the SW1-linked Dookie club. Anything nobody used is PARKED (club_id stays empty): no
--      club sees it, nothing is deleted.
--   2. opponent_clubs: signed-in only, and only rows with a club. No public access at all - the
--      graphics never read it (a team copies the opponent's name and logo onto its fixture).
--   3. venues: still readable (published teams show the ground's name); writes need sign-in and a club.
--   4. lineups / lineup_positions: the public sees PUBLISHED teams only; drafts need sign-in.
--
-- Not covered here (bigger, separate job): Line-Ups has no record of which person belongs to which
-- club - any signed-in Line-Ups account can edit any club. Today the only account is SportsWeb's.
--
-- ORDER (so saving never breaks in between):
--   STEP 1  club-own-lists-1-columns-2026-10-27.sql   - adds the club columns and sorts existing rows. Harmless
--           to the app that is live now.
--   STEP 2  release the app (Line-Ups branch club-own-lists -> main). It needs the step-1 columns.
--   STEP 3  club-own-lists-2-lockdown-2026-10-27.sql  - the new rules. The old app can't add opposition
--           clubs or grounds under these, so this goes after the app.
--
-- Paste in the AFL Team Line-Ups project's SQL Editor (NOT SportsWeb One). Safe to run twice.
-- The CHECK at the bottom should show: every club_id filled except parked rows, and anon = false.
-- Pure ASCII.

-- STEP 3 of 3 - only after the app is released (step 2).
begin;

-- 2. opponent_clubs: signed-in only, rows with a club only.
drop policy if exists "opponent_clubs read" on public.opponent_clubs;
drop policy if exists "opponent_clubs insert" on public.opponent_clubs;
drop policy if exists "opponent_clubs delete" on public.opponent_clubs;
drop policy if exists "own club opposition" on public.opponent_clubs;
revoke all on public.opponent_clubs from public, anon;
grant select, insert, update, delete on public.opponent_clubs to authenticated;
create policy "own club opposition" on public.opponent_clubs for all to authenticated
  using (club_id is not null) with check (club_id is not null);

-- 3. venues: readable (published teams show the ground), writes need sign-in and a club.
drop policy if exists "authenticated write" on public.venues;
drop policy if exists "club venue write" on public.venues;
revoke insert, update, delete on public.venues from public, anon;
create policy "club venue write" on public.venues for all to authenticated
  using (club_id is not null) with check (club_id is not null);

-- 4. Drafts private: the public reads published teams only.
drop policy if exists "public read" on public.lineups;
drop policy if exists "published or signed in" on public.lineups;
create policy "published or signed in" on public.lineups for select
  using (published or (select auth.role()) = 'authenticated');

drop policy if exists "public read" on public.lineup_positions;
drop policy if exists "published or signed in" on public.lineup_positions;
create policy "published or signed in" on public.lineup_positions for select
  using ((select auth.role()) = 'authenticated'
         or exists (select 1 from public.lineups l where l.id = lineup_positions.lineup_id and l.published));

commit;

-- CHECK (read only): every row should be 0/false.
select 'anon can read opposition' as what, has_table_privilege('anon', 'public.opponent_clubs', 'select') as yes
union all select 'anon can add grounds', has_table_privilege('anon', 'public.venues', 'insert')
union all select 'lineups still public-read-all', exists (select 1 from pg_policy where polrelid = 'public.lineups'::regclass and polname = 'public read');
