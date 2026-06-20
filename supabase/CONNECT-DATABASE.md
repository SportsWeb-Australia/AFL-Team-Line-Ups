# Connect the database (turn on save, recall & embeds)

The widget runs happily on its built-in demo with no setup. But the three things
you actually want — **saving a team, reloading it next week to edit, and getting
an embed code per team** — all need a shared database behind it. That's because
an embed renders on a *different* page (your club site), so the team has to live
somewhere both your editor and the embedded iframe can reach. That somewhere is
Supabase (free tier is plenty).

This is a one-off, ~5 minutes. Do it once and every team you make from then on
saves, reloads and embeds.

---

## 1. Create a free Supabase project

1. Go to **supabase.com** → sign in → **New project**.
2. Give it a name (e.g. `sportsweb-afl-lineups`), set a database password, pick a
   region close to you (Sydney). Wait for it to finish provisioning.

## 2. Run the SQL (three files, in order)

In Supabase: left sidebar → **SQL Editor** → **New query**. Open each file from
this project's `supabase/` folder, paste its contents in, and click **Run**.

1. **`supabase/schema.sql`** — creates the tables.
2. **`supabase/enable-writes.sql`** — lets the editor save (dev write policy +
   the free-text date column + the player upsert key).
3. **`supabase/add-status.sql`** — persists the captain / VC / debut / milestone
   badges and injury flags per team.
4. **`supabase/add-visual-mode.sql`** — persists per-team display settings (jumper /
   headshot / no-image, and the watermark behind the oval) so the auto-embedded
   graphic matches exactly what you published.

Each is safe to run more than once. (Optional: `supabase/seed.sql` loads a sample
team so you can see a recall straight away. Also optional and future-facing:
`supabase/add-source-type.sql` — tags player ownership for when you start linking
SportsWeb One clubs; not needed for the standalone app.)

> Heads-up on `enable-writes.sql`: it lets anyone holding the public anon key
> write to the tables. That's fine for you and trusted club admins while you're
> getting going. Before you hand this to lots of clubs, swap it for the
> auth-based club-admin policies sketched at the bottom of `schema.sql`.

## 3. Grab your two keys

In Supabase: **Project Settings (gear, bottom-left) → API Keys**. You need:

- **Project URL** — `https://<your-ref>.supabase.co`. It's shown on that page (and
  in the green **Connect** button at the top of the dashboard). The `<your-ref>`
  part is also right there in your browser's address bar.
- **The client key** — Supabase is mid-way through renaming these, so you'll see
  one of two things:
  - a **Publishable key** that starts `sb_publishable_…` → use that, **or**
  - a classic **anon public** key (a long `eyJ…` string, under a "Legacy API
    Keys" tab) → use that.
  Either works as the client key. **Never** use the **secret** / **service_role**
  key in a website — that one stays server-side only.

(The env var below is named `VITE_SUPABASE_ANON_KEY` for continuity; the value can
be either the publishable or the anon key.)

## 4. Add them to Vercel

In your Vercel project: **Settings → Environment Variables**. Add both:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | your Project URL from step 3 |
| `VITE_SUPABASE_ANON_KEY` | your anon public key from step 3 |

Add them to **Production** (and Preview if you use it), then **redeploy** so the
new build picks them up. (Locally, put the same two lines in a `.env` file at the
project root and restart `npm run dev`.)

## 5. You're live

Open your site with `?admin` (e.g. `https://afl-team-line-ups.vercel.app/?admin`).
In the admin panel the **SportsWeb One database** card at the top should now show
a green dot and an active **Save** button.

---

## The workflow you asked for

1. **Build a team** — set the match details, pick your 22, set captain/VC/etc.
2. **Save** — hit **Save** in the database card. That team is now stored as its
   own saved team, keyed by its round + date.
3. **Build the next team** — change the round (or use **Clone to new round** to
   start from the current one), adjust, and **Save** again. Each round/date is a
   separate saved team, so they don't overwrite each other.
4. **Get its embed code** — with a team loaded, hit **Copy embed code for this
   team** and paste it into a **Custom HTML** block on the club site. (It copies a
   full `<iframe>` now, not a bare link — a bare link just shows as text, which is
   why the embed looked broken before.)
5. **Next week** — open `?admin`, pick the team from **Saved teams**, edit it for
   the new round, and Save. The embed updates automatically — same embed code, new
   line-up.

## Troubleshooting

- **"Save blocked by row-level security"** → you skipped `enable-writes.sql`. Run it.
- **Database card still grey after deploy** → the env var names must be exactly
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and you must redeploy after
  adding them (Vite bakes env vars in at build time).
- **Embed shows as text on the club site** → make sure you pasted into a *Custom
  HTML* / embed block, not a plain text block, and that you used **Copy embed
  code** (the `<iframe>` snippet), not a hand-typed URL.
- **Embed is blank** → the `fixture=` id in the code must be a team you actually
  saved. The demo id (`5555…`) only resolves if you ran `seed.sql`.
