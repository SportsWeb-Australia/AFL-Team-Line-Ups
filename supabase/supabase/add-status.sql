-- ─────────────────────────────────────────────────────────────────────────
-- AFL Team Line Ups — persist player status per saved team
-- ─────────────────────────────────────────────────────────────────────────
-- Run this ONCE in the Supabase SQL editor (after schema.sql + enable-writes.sql).
-- Safe to run more than once.
--
-- Why per line-up, not per player:
--   A player's role and availability belong to a specific round, not to the
--   player forever — captain this week may be a normal player next week, and an
--   injury clears once they're back. So status is stored on lineup_positions
--   (the row that places a player in THIS saved team), not on the player record.
--
-- What gets stored (a text array, e.g. {captain} or {injured} or {milestone}):
--   Role badges       → captain, vice-captain, debut, milestone
--   Availability tags  → injured, concussion, personal, suspended
--
-- Before this migration, saving a team kept who played and where, but dropped
-- the C/VC/milestone badges and injury flags on reload. After it, they persist.

alter table lineup_positions
  add column if not exists status text[];
