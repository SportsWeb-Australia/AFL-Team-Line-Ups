-- Final score in the match header (editor: Match & branding -> Final score).
--
-- A score is a fact about the match, so it lives on the fixture. AFL scoring:
-- total = goals x 6 + behinds, so only goals and behinds are stored and the
-- total is always derived. "club" is the club that owns the sheet.
-- When the sheet's Occasion is Grand Final and the club won, the header plate
-- reads "<year> Premiers".
--
-- The app falls back without these columns, so an un-migrated project simply
-- has no score option. Supabase dashboard -> SQL editor -> paste -> Run.
alter table public.fixtures
  add column if not exists show_score boolean not null default false,
  add column if not exists club_goals smallint,
  add column if not exists club_behinds smallint,
  add column if not exists opponent_goals smallint,
  add column if not exists opponent_behinds smallint;

alter table public.fixtures drop constraint if exists fixtures_score_range_chk;
alter table public.fixtures add constraint fixtures_score_range_chk check (
  coalesce(club_goals, 0) between 0 and 99 and coalesce(club_behinds, 0) between 0 and 99 and
  coalesce(opponent_goals, 0) between 0 and 99 and coalesce(opponent_behinds, 0) between 0 and 99
);
