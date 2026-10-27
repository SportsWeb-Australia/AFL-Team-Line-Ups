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

-- STEP 1 of 3.
begin;

alter table public.opponent_clubs add column if not exists club_id uuid references public.clubs(id) on delete cascade;
alter table public.venues add column if not exists club_id uuid references public.clubs(id) on delete cascade;
create index if not exists opponent_clubs_club_idx on public.opponent_clubs (club_id, lower(name));
create index if not exists venues_club_idx on public.venues (club_id, lower(name));

-- 1a. Opposition: the first club (by id) that used each row keeps it ...
update public.opponent_clubs o
   set club_id = u.club_id
  from (select o2.id, (array_agg(t.club_id order by t.club_id))[1] as club_id
          from public.opponent_clubs o2
          join public.fixtures f on lower(btrim(f.opponent_name)) = lower(btrim(o2.name))
          join public.teams t on t.id = f.team_id
         where o2.club_id is null
         group by o2.id) u
 where o.id = u.id;

-- 1b. ... and every other club that used it gets its own copy.
insert into public.opponent_clubs (name, logo_url, club_id, created_at)
select distinct on (t.club_id, lower(btrim(o.name))) o.name, o.logo_url, t.club_id, o.created_at
  from public.opponent_clubs o
  join public.fixtures f on lower(btrim(f.opponent_name)) = lower(btrim(o.name))
  join public.teams t on t.id = f.team_id
 where o.club_id is not null
   and t.club_id <> o.club_id
   and not exists (select 1 from public.opponent_clubs x
                    where x.club_id = t.club_id and lower(btrim(x.name)) = lower(btrim(o.name)))
 order by t.club_id, lower(btrim(o.name)), o.created_at;

-- 1c. Berrigan FNC was added on 27 Oct for Dookie's test sheet.
update public.opponent_clubs
   set club_id = (select id from public.clubs where sportsweb_club_id = '7a841f7f-c6ac-4181-aec2-e91c53103512')
 where club_id is null and lower(btrim(name)) = 'berrigan fnc';

-- 1d. Grounds: the first club that used each keeps it ...
update public.venues v
   set club_id = u.club_id
  from (select v2.id, (array_agg(t.club_id order by t.club_id))[1] as club_id
          from public.venues v2
          join public.fixtures f on f.venue_id = v2.id
          join public.teams t on t.id = f.team_id
         where v2.club_id is null
         group by v2.id) u
 where v.id = u.id;

-- 1e. ... every other club that used it gets its own copy ...
insert into public.venues (name, address, club_id, created_at)
select distinct on (t.club_id, v.id) v.name, v.address, t.club_id, v.created_at
  from public.venues v
  join public.fixtures f on f.venue_id = v.id
  join public.teams t on t.id = f.team_id
 where v.club_id is not null
   and t.club_id <> v.club_id
   and not exists (select 1 from public.venues x
                    where x.club_id = t.club_id and lower(btrim(x.name)) = lower(btrim(v.name)))
 order by t.club_id, v.id;

-- 1f. ... and its saved teams point at that copy.
update public.fixtures f
   set venue_id = (select x.id from public.venues x
                    where x.club_id = t.club_id and lower(btrim(x.name)) = lower(btrim(v.name))
                    order by x.created_at, x.id limit 1)
  from public.teams t, public.venues v
 where t.id = f.team_id and v.id = f.venue_id and v.club_id is distinct from t.club_id;

commit;

-- CHECK (read only).
select 'opposition' as list, count(*) filter (where club_id is not null) as owned, count(*) filter (where club_id is null) as parked from public.opponent_clubs
union all
select 'grounds', count(*) filter (where club_id is not null), count(*) filter (where club_id is null) from public.venues
union all
select 'fixtures on another club''s ground (want 0)', count(*), 0 from public.fixtures f join public.teams t on t.id = f.team_id join public.venues v on v.id = f.venue_id where v.club_id is distinct from t.club_id;
