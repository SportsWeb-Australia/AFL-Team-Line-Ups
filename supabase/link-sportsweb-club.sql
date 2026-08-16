-- Links a line-ups club to the SportsWeb One club that provisioned it.
-- APPLIED to project wnxaydyhzwwrdwdmimab (migration add_sportsweb_club_id_link).
--
-- Nullable on purpose: clubs that buy Team Line-Ups directly are not SportsWeb
-- One clubs and keep this null. It records a link, not ownership.
--
-- Replaces matching by club NAME (src/lib/sportsWebOne.ts), which cannot be
-- trusted for entitlement — this table already holds five rows named "Geelong".
--
-- Also the entitlement switch: null => this app's own Stripe subscription is the
-- entitlement; not null => SportsWeb One's club_modules row is, and this app
-- should not carry a lineup_subscriptions row for that club.

alter table public.clubs
  add column if not exists sportsweb_club_id uuid;

comment on column public.clubs.sportsweb_club_id is
  'SportsWeb One clubs.id (project uzibfawcwoapfbigpzum) when this club was provisioned from SportsWeb One; null for standalone customers. Unique — one line-ups club per SportsWeb club.';

-- Postgres treats NULLs as distinct, so many standalone clubs coexist while any
-- non-null link stays one-to-one.
create unique index if not exists clubs_sportsweb_club_id_uidx
  on public.clubs (sportsweb_club_id);

-- To link a club:
--   update public.clubs set sportsweb_club_id = '<sw1 uuid>' where id = '<local uuid>';
