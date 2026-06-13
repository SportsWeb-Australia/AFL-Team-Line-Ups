-- ───────────────────────────────────────────────────────────────────────────
-- add-visual-mode.sql
-- Run this ONCE in the Supabase SQL editor if your database was created before
-- the "image mode persists to embeds" change.
--
-- It stores whether each saved line-up shows Jumpers / Headshots / No image, so
-- the auto-embedded graphic on your website matches what you published (instead
-- of falling back to names only).
-- Safe to run more than once.
-- ───────────────────────────────────────────────────────────────────────────

alter table lineups
  add column if not exists visual_mode text not null default 'none';
