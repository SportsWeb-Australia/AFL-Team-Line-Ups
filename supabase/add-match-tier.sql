-- Team Line-Ups: occasion tier per team sheet.
--
-- Drives the struck plate in the header and the accent metal across the whole
-- graphic. Nullable and additive: the app already reads and writes this column
-- behind the same missing-column fallback the other display settings use, so
-- it keeps working unchanged until this is applied.
--
-- Values: 'home' | 'finals' | 'grand-final'. NULL is treated as 'home'.

alter table public.lineups
  add column if not exists match_tier text;

alter table public.lineups
  drop constraint if exists lineups_match_tier_check;

alter table public.lineups
  add constraint lineups_match_tier_check
  check (match_tier is null or match_tier in ('home', 'finals', 'grand-final'));
