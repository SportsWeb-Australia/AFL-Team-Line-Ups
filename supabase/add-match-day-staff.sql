-- Match-day staff (the coaches' box): coach, assistant coach, team manager, runner.
--
-- Run this on an existing project that predates the feature. The app degrades
-- gracefully without it — source.ts falls back column-by-column — so an
-- un-migrated project simply never shows the band.
--
-- Supabase dashboard → SQL editor → paste → Run.

alter table public.lineups
  add column if not exists officials text,
  add column if not exists polo_image_url text,
  add column if not exists runner_image_url text;

comment on column public.lineups.officials is
  'JSON array of {role, name, headshotUrl?} for match-day staff. role is one of coach | assistant-coach | team-manager | runner.';
comment on column public.lineups.polo_image_url is
  'Club polo shown for coaching staff. Falls back to a polo drawn in the club colours when null.';
comment on column public.lineups.runner_image_url is
  'The runner''s hi-vis top. Falls back to a drawn fluro shirt when null.';
