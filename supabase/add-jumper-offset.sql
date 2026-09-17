-- Team jumper position: set by dragging the jumper in the editor (Team Squad step).
--
-- Percent of the jumper image's own rendered size, so one setting holds on every
-- plate size and in the PNG export. Null = not moved, so existing sheets draw
-- exactly as before. The app falls back column-by-column without this, so an
-- un-migrated project just ignores the setting.
--
-- Supabase dashboard -> SQL editor -> paste -> Run.
alter table public.lineups
  add column if not exists jumper_offset_x real,
  add column if not exists jumper_offset_y real;
