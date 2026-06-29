-- Banner Library — per-sheet banner selection
-- =============================================================================
-- The `sponsors` table already persists banners club-wide (it has a stable `id`
-- and an `active` flag), so it IS the library. This migration adds the only
-- missing piece: a per-sheet selection so each line-up chooses WHICH library
-- banners rotate, instead of every sheet rotating the whole set.
--
-- Run this in the Supabase SQL Editor (do NOT use db push). Safe to re-run.
--
-- Behaviour:
--   • banner_ids = ordered list of sponsors.id that rotate on THIS sheet.
--   • NULL (the default, and any sheet saved before this migration) = rotate
--     every active club banner — exactly the old behaviour, so nothing breaks.
--   • An explicit empty array {} = rotate nothing on this sheet.
--
-- Pair with the app build that stops the destructive sponsor save (banners are
-- now updated/added in place and only removed via the explicit "remove from
-- library" action), so saving a sheet can never wipe the club's other banners.

alter table public.lineups
  add column if not exists banner_ids uuid[];

comment on column public.lineups.banner_ids is
  'Library sponsor ids (sponsors.id) rotated on THIS sheet, in order. NULL = rotate all active club banners (legacy/default).';
