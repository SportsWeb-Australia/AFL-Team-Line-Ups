-- Picture positions and the match-day staff on/off switch.
--
-- lineups.art_settings  One JSON object per sheet, null when everything is at
--                       its default:
--                         { "headshot": {x,y,scale},   team headshot position
--                           "staff":    {x,y,scale},   staff polos / runner top
--                           "showStaff": false }       band hidden
--                       x/y are percent of the picture's own size, scale a
--                       multiplier. JSON so the next setting like these needs
--                       no migration.
--
-- players.headshot_position  One player's own headshot position ({x,y,scale}),
--                            null = follow the team's. On the player, not the
--                            sheet: it belongs to their photo, which they carry
--                            from week to week.
--
-- Additive and nullable: older app builds never select these columns, and the
-- app falls back if art_settings is missing.
alter table public.lineups add column if not exists art_settings jsonb;
alter table public.players add column if not exists headshot_position jsonb;
