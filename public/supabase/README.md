# SportsWeb One — Team Sheet database

Designed from scratch for this widget, but normalised so it drops into the
larger **SportsWeb One** platform without rework. Every record is club-scoped
through `club_id`, which is how the platform multi-tenants clubs.

## Tables

| Table | Purpose |
|---|---|
| `clubs` | Home **and** opponent clubs. Name, colours, logo → drive the graphic. |
| `venues` | Grounds. |
| `teams` | A club's grades/sides (Seniors, Reserves, Women's…). Shown as *Grade*. |
| `players` | Squad. Headshot, jumper image, **profile_url** (club site / PlayHQ). |
| `sponsors` | Rotating banner sponsors — logo, banner image, click-through `href`. |
| `fixtures` | One match for a team. Opponent by FK **or** name+logo fallback. |
| `lineups` | A published selection for a fixture (supports draft vs published). |
| `lineup_positions` | One row per player: a field `position_key` **or** a `bench_area`. |

`position_key` is an enum of the 15 on-field slots (BPL…FPR) — identical to
`PositionKey` in `src/types.ts`. `bench_area` = followers / interchange /
emergencies / unavailable. A check constraint guarantees each row is exactly one
of field-or-bench, and a unique index stops two players sharing a field slot.

## Apply it

Supabase dashboard → **SQL editor**, then run in order:

1. `schema.sql` — tables, enums, triggers, RLS (public read; writes left to the
   SportsWeb One auth model).
2. `seed.sql` — the Riverton Hawks demo, so there's data to render immediately.

Or with the CLI: `supabase db push` after dropping these in `supabase/migrations`.

## Wire the app to it (when ready)

The app currently renders from `src/data/sampleTeam.ts` (no regression — it
still works offline). To switch to live data:

1. `npm i @supabase/supabase-js`
2. Create `.env`:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
3. Move `supabase/adapter.example.ts` → `src/data/source.ts`.
4. In `App.tsx`, replace the static import with a load:
   ```ts
   const [data, setData] = useState<TeamSheetData | null>(null);
   useEffect(() => { loadTeamSheet(FIXTURE_ID).then(setData); }, []);
   if (!data) return null;            // or a spinner
   return <TeamSheet data={data} mode={mode} />;
   ```
5. One tiny type addition: add `profileUrl?: string` to `Player` in `types.ts`
   (used later for the click-through to a player's profile card).

The embed picks the fixture by id (e.g. a `data-fixture` attribute on the
mount node), so a club page just drops in `<div data-fixture="…">`.

## How it plugs into SportsWeb One

These tables are a **strict subset** of the platform model, same names and
`club_id` scoping, so when the central database exists this schema becomes a few
of its tables rather than a separate thing. Admin writes (uploading sponsors,
headshots, logos, colours, fixtures) happen through the club's SportsWeb One
login; the example RLS write policy in `schema.sql` shows the intended shape
(`club_members` → `auth.uid()`), ready to enable once auth lands.
