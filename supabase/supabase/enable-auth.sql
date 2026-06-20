-- ============================================================================
--  Turn ON login-gated writes (production auth step).
--  Run this ONCE in the Supabase SQL editor, AFTER schema.sql + enable-writes.sql.
--  Safe to run more than once.
--
--  What it does:
--    1. Removes the DEV "anon write" policy (anyone with the public key could
--       write). After this, the anon/publishable key can only READ.
--    2. Adds an "authenticated write" policy so only a signed-in user (a club
--       admin who has logged in) can create / edit / publish teams.
--    3. Public read stays exactly as-is, so embeds and the public graphic keep
--       working with the anon key.
--
--  Pair this with VITE_REQUIRE_AUTH=true in the app (see AUTH-SETUP.md). With the
--  flag off, the editor still loads but writes will now fail until you log in —
--  so flip the flag and create your first user at the same time as running this.
--
--  NOTE on scope: this is the "any signed-in user is a trusted admin" model — the
--  right first step for a single operator. To scope each admin to specific clubs
--  later, add a club_members(user_id, club_id) table and swap the using/with-check
--  expressions for the club-membership form sketched at the bottom of schema.sql.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['clubs','venues','teams','players','sponsors',
                           'fixtures','lineups','lineup_positions']
  loop
    -- 1. drop the dev open-write policy
    execute format('drop policy if exists "dev anon write" on %I;', t);

    -- 2. authenticated users may read + write
    execute format('drop policy if exists "authenticated write" on %I;', t);
    execute format('create policy "authenticated write" on %I for all to authenticated
                    using (true) with check (true);', t);

    -- 3. make sure public read is present (idempotent with schema.sql)
    execute format('drop policy if exists "public read" on %I;', t);
    execute format('create policy "public read" on %I for select using (true);', t);
  end loop;
end $$;

-- To roll back to the dev (no-login) setup, re-run supabase/enable-writes.sql.
