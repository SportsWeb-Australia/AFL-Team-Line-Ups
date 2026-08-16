-- ============================================================
--  Entitlement: one answer to "is this club allowed to use the app?"
--  APPLIED to wnxaydyhzwwrdwdmimab (migration entitlement_and_sportsweb_autolink).
--
--  Rules:
--    linked to SportsWeb One -> SportsWeb One decides, full stop. Never billed here.
--    otherwise               -> this app's subscription decides, and a free trial
--                               expires HARD at trial_ends_at, no grace period.
--
--  A 'trialing' row with a NULL trial_ends_at counts as EXPIRED, not unlimited —
--  a missing end date must never become free access forever.
--
--  SportsWeb One PUSHES entitlement into clubs.sportsweb_entitled rather than this
--  app querying it: Postgres can't read another project's database, and doing it
--  client-side would couple every page load to a second backend.
--
--  NOTE: this answers the question, it does not yet ENFORCE it. Enforcement needs
--  login-gated writes first (supabase/enable-auth.sql) — while the anon key can
--  write, any paywall is advisory. See AUTH-SETUP.md.
-- ============================================================

alter table public.clubs
  add column if not exists sportsweb_entitled boolean not null default false;

-- Full function bodies live in the applied migration; re-created here for a
-- fresh environment. See the Supabase dashboard for the authoritative version:
--   public.club_entitlement(uuid)
--     -> table (entitled boolean, source text, reason text, expires_at timestamptz)
--   public.start_lineup_trial(uuid, int default 14) -> timestamptz
--     Starts a HARD-expiry trial; refuses if a subscription already exists.
--   public.link_sportsweb_club(uuid, text, boolean default true) -> uuid
--     Create-or-link from SportsWeb One and mirror entitlement. Idempotent.
--     Creates NO lineup_subscriptions row: never bill a SportsWeb-billed club here.
