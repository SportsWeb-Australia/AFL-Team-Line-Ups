# SportsWeb One — AFL Team Line Up

A reusable, club-branded AFL team line-up widget. Renders a weekly selection on a
portrait oval as a polished, screenshot-ready sports graphic. Built as a module
that can be embedded in a club website today and grown into a standalone app later.

- **React + TypeScript**, no runtime dependencies beyond React.
- **Bundled oval artwork** — the field PNG ships inside the build, so it can't 404 and exports cleanly with the graphic. Swap one file to re-skin the ground.
- **Club colours are data** — fed in as `primaryColor` / `secondaryColor` and applied via CSS variables.
- **Two modes** from one component: `public` (read-only graphic) and `admin` (tap/drag to select).
- **One data object** drives everything (`TeamSheetData`), so swapping in a live data source later changes nothing in the UI.

---

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. Use the **Public view / Admin** toggle at the top to see both modes.

```bash
npm run build    # type-check + production build
npm run preview  # preview the build
```

---

## Files — what to replace vs create

If you're dropping this into your existing Vite repo, this is the mapping from your
current files. Your previous `app.ts` / boilerplate `index.css` / `app.css` should go.

| Action | File | Notes |
| --- | --- | --- |
| **Replace** | `src/main.tsx` | Same entry, correct imports |
| **Replace** | `src/index.css` | Old one was the Vite starter template and fought the layout |
| **Replace** | `src/App.tsx` | (was `app.ts` — wrong extension; also fixes the import casing) |
| **Delete** | `src/app.css` | Vite starter boilerplate, unused |
| **Delete** | old `teamsheet.tsx` | Superseded by `src/components/TeamSheet.tsx` |
| **Create** | `src/types.ts` | The data contract |
| **Create** | `src/lib/field.ts` | AFL slot coordinates + line labels |
| **Create** | `src/data/sampleTeam.ts` | **The file a club admin edits** |
| **Create** | `src/components/*` | `TeamSheet`, `MatchHeader`, `Oval`, `PlayerPlate`, `BenchZone`, `AdminPanel` |
| **Create** | `src/styles/teamsheet.css` | All widget styling, `sw1-` prefixed |

> File-name casing matters on Vercel/Linux. The old project imported `./App` and
> `./TeamSheet` while the files were lower-case — that builds on a Mac but breaks in
> CI. This version is consistent.

---

## Embedding in a club site

The widget is one self-contained component. All of its CSS is scoped under `.sw1-root`
and prefixed `sw1-`, so it won't collide with a host page.

```tsx
import TeamSheet from './components/TeamSheet';
import { sampleTeam } from './data/sampleTeam';

<TeamSheet data={sampleTeam} mode="public" />
```

`mode="admin"` adds the selection panel, tap-to-assign and drag-and-drop.

---

## Editing a line-up

Open `src/data/sampleTeam.ts`. Everything is in one object: club name + colours,
opponent, round/grade/date/time/venue, sponsors, the player roster, and the `lineup`
that maps positions and bench groups to players by id. Change values there — no
component edits needed.

---

## Wiring up live data later

`sampleTeam` is just a `TeamSheetData` object. To go live, replace the static import
with a loader that returns the same shape — the components don't care where it comes
from. Suggested seams (marked with `// FUTURE` comments in `data/sampleTeam.ts`):

- **Zoho Creator** — REST report fetch keyed by match id
- **Supabase** — `lineups` table join on `players`
- **SportsWeb One** — `/api/clubs/:clubId/lineups/:matchId`

---

## Deliberate scope choices (v1)

- **Fixed slot positions** instead of free drag-anywhere placement. A published graphic
  benefits from predictable, consistent layout, and the old free-drag positions
  couldn't be saved anyway. The model still supports per-slot coordinates if you want
  to reintroduce nudging later.
- **`visualMode` defaults to `none`** (clean name plates). Switch to `jumper`/`headshot`
  in admin; both fall back to a club-coloured token when no artwork is supplied, so it
  never shows broken images.

## Sharing the graphic

In public view a small toolbar sits above the card:

- **Download graphic** — exports the line-up as a PNG (2× resolution, good for socials). Uses `html-to-image`, which freezes the rendered styles, so the oval, plates and club colours export exactly as shown.
- **Print** — opens the browser print dialog (toolbar and admin controls are hidden in print).

Hide the toolbar for a bare embed with `<TeamSheet data={...} showToolbar={false} />`.

## Not done yet (next candidates)

- Persisting selections (localStorage or the live data source)
- Reassigning an already-placed player by tapping it (currently: clear, then reassign)
- Optional fixed export size (e.g. 1080×1350 Instagram portrait) regardless of screen width
