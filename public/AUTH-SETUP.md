# Turn on login (publish/edit gate)

By default the editor is open (anyone who knows the `?admin` URL can edit, and the
dev SQL lets the public key write). This guide switches to **login-required**: only
signed-in club admins can create, edit or publish a team, while the public page and
embeds keep working unchanged.

It's a one-off, ~5 minutes. Two halves — the database, then the app.

## 1. Enable email auth in Supabase

1. Supabase dashboard → **Authentication → Providers → Email** → make sure it's on.
2. For the quickest start, **Authentication → Sign In / Providers → Email**: turn
   **"Confirm email" OFF** while you're setting up (you can turn it back on later).
   With it on, a new user must click a confirmation link before they can sign in.
3. **Authentication → URL Configuration → Site URL**: set it to your live URL
   (e.g. `https://afl-team-line-ups.vercel.app`).

## 2. Create your admin user

**Authentication → Users → Add user → Create new user.** Enter an email + password
and (if confirmation is off) tick "Auto Confirm User". This is the account you'll
log in with. Repeat for each club admin who needs access.

## 3. Lock down the database

In the **SQL Editor**, run **`supabase/enable-auth.sql`**. This removes the dev
open-write policy and replaces it with "only signed-in users can write" — public
read stays, so embeds and the public graphic are unaffected.

> To undo and go back to the open dev setup, re-run `supabase/enable-writes.sql`.

## 4. Flip the app flag

In Vercel → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `VITE_REQUIRE_AUTH` | `true` |

Add it to **Production** (and Preview), then **redeploy**. Locally, put
`VITE_REQUIRE_AUTH=true` in your `.env` and restart `npm run dev`.

## 5. Use it

Open the editor (`/?admin`). You'll now get a sign-in screen. Log in with the user
from step 2 — the editor appears, and Save/Publish work because your requests now
carry your login. There's a **Sign out** button at the top of the editor.

The public page (`/`), the embeds, and `?fixture=`/`?club=` links need no login —
they only read published teams.

---

## What "logged in" means right now

This first version is the simple, correct model for a single operator: **any
signed-in user is a trusted admin** and can manage every club. That's the right
starting point while it's just you (and people you create accounts for).

### Scoping admins to specific clubs (later)

When you start handing accounts to individual clubs and want each one limited to
*their* teams only, add a membership table and tighten the policies:

```sql
create table if not exists club_members (
  user_id uuid references auth.users(id) on delete cascade,
  club_id uuid references clubs(id) on delete cascade,
  role    text default 'admin',
  primary key (user_id, club_id)
);
alter table club_members enable row level security;
create policy "members read own" on club_members for select using (user_id = auth.uid());
```

Then swap the `using (true)` / `with check (true)` in `enable-auth.sql` for the
club-membership form sketched at the bottom of `supabase/schema.sql`, e.g. on
`players`:

```sql
create policy "club admins write" on players for all to authenticated
  using  (club_id in (select club_id from club_members where user_id = auth.uid()))
  with check (club_id in (select club_id from club_members where user_id = auth.uid()));
```

and add a row to `club_members` for each admin/club pairing. That's the next step
whenever you're ready — say the word and I'll wire it up end to end.
