-- Lock down linking a club to SportsWeb One (SW1 security worklist #20; Carson, 27 Oct 2026: "yes fix the
-- line-ups linking too").
--
-- Found 27 Oct: link_sportsweb_club() and adopt_lineups_club_for_sportsweb() could be run by anyone holding this
-- app's public key (it is in every page of the app). Neither checked the caller, so anyone could link or rename
-- any club, switch its SportsWeb entitlement on or off, or delete its complimentary subscription.
--
-- After this file:
--   1. Neither function can be run with the public key any more (service role only). adopt_... is a by-hand SQL
--      editor job anyway (see entitlement.sql).
--   2. link_sportsweb_club_signed(p_key, ...) is the one way in from outside: it runs link_sportsweb_club() only
--      when p_key matches a key whose SHA-256 is stored in sw1_link_keys. Only SW1's server holds the key (its
--      team-lineups-link function, which first checks the person is SportsWeb staff). The key itself is never
--      stored here - only its hash - and sw1_link_keys can't be read with the public key.
--   3. The hash goes in with the separate one-line insert at the bottom, once the key has been made.
-- Safe to run twice. Pure ASCII.

begin;

revoke all on function public.link_sportsweb_club(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.adopt_lineups_club_for_sportsweb(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.link_sportsweb_club(uuid, text, boolean) to service_role;
grant execute on function public.adopt_lineups_club_for_sportsweb(uuid, uuid, boolean) to service_role;

create table if not exists public.sw1_link_keys (
  key_hash   text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.sw1_link_keys enable row level security;
revoke all on public.sw1_link_keys from public, anon, authenticated;

create or replace function public.link_sportsweb_club_signed(p_key text, p_sw1_club_id uuid, p_name text, p_entitled boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_key is null or char_length(p_key) < 32
     or not exists (select 1 from public.sw1_link_keys k where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return public.link_sportsweb_club(p_sw1_club_id, p_name, p_entitled);
end $$;
revoke all on function public.link_sportsweb_club_signed(text, uuid, text, boolean) from public;
grant execute on function public.link_sportsweb_club_signed(text, uuid, text, boolean) to anon, authenticated, service_role;

commit;

-- CHECK (read only): every row should say anon = false, except link_sportsweb_club_signed (true).
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('link_sportsweb_club', 'adopt_lineups_club_for_sportsweb', 'link_sportsweb_club_signed');

-- STEP 2, after the key is made (the command prints a 64-character hash - the hash is not secret):
-- insert into public.sw1_link_keys (key_hash, note) values ('<paste the hash>', 'SW1 develop / training, 27 Oct 2026')
--   on conflict do nothing;
