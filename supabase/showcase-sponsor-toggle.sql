-- Showcase teams (no opponent, e.g. Team of the Century) + a full sponsor-banner
-- on/off toggle. Two display flags on the lineup, alongside vs_style etc.
-- Run in the AFL Line-Ups SQL Editor. Additive + idempotent.
alter table public.lineups add column if not exists showcase      boolean not null default false;
alter table public.lineups add column if not exists hide_sponsors boolean not null default false;
