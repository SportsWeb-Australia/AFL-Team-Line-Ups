-- ───────────────────────────────────────────────────────────────────────────
-- add-visual-mode.sql
-- Run this ONCE in the Supabase SQL editor (paste the CONTENTS below, not the
-- file name) if your database was created before the display-settings change.
--
-- Stores per-line-up display settings so the auto-embedded graphic matches what
-- you published:
--   • visual_mode      → Jumpers / Headshots / No image
--   • watermark_source → what shows faintly behind the oval (club name/logo, etc.)
-- Safe to run more than once.
-- ───────────────────────────────────────────────────────────────────────────

alter table lineups
  add column if not exists visual_mode text not null default 'none';

alter table lineups
  add column if not exists watermark_source text;

alter table lineups
  add column if not exists jumper_image_url text;

alter table lineups
  add column if not exists vs_style text;

alter table lineups
  add column if not exists watermark_text text;

alter table lineups
  add column if not exists watermark_logo_url text;
