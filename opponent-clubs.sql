-- Opposition clubs directory for AFL Team Line-Ups.
--
-- A lightweight name + logo store the media officer / team manager fills in once.
-- The line-up tool's Opponent picker reads this alongside the real `clubs` table,
-- so adding a club here makes it pickable for every round.
--
-- Kept SEPARATE from `clubs` on purpose: a name-only opposition entry should never
-- trip that table's NOT NULL columns (colours, etc.) or the
-- fixtures.opponent_club_id foreign key. Directory picks fill opponent name + logo
-- only; they do not create a clubs FK link.
--
-- Run this in the Supabase SQL Editor for the project the tool points at.

create table if not exists public.opponent_clubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  created_at timestamptz not null default now()
);

alter table public.opponent_clubs enable row level security;

-- Matches the tool's current anon-key access model (the standalone app has no
-- login; the public anon key reads/writes under RLS). When we wire this into the
-- SportsWeb One / Dookie database we tighten these to club_id + club_users scoping
-- so each club only manages its own opposition list.
drop policy if exists "opponent_clubs read"   on public.opponent_clubs;
drop policy if exists "opponent_clubs insert" on public.opponent_clubs;
drop policy if exists "opponent_clubs delete" on public.opponent_clubs;
create policy "opponent_clubs read"   on public.opponent_clubs for select using (true);
create policy "opponent_clubs insert" on public.opponent_clubs for insert with check (true);
create policy "opponent_clubs delete" on public.opponent_clubs for delete using (true);
