# Save / Publish + Client Type — spec

This documents the model that's now wired into the app, plus the backend pieces
still to build so a published team actually lands on a club's website or app page.

---

## 1. One codebase, two client types

Rather than maintain two apps, there's **one codebase** with a `clientType` flag
that changes behaviour. Set it per deployment with a Vercel env var:

```
VITE_CLIENT_TYPE=sportsweb   # default — embedded in a SportsWeb One club website
VITE_CLIENT_TYPE=app         # the standalone app on a SportsWeb One subdomain
```

You can also append `?client=app` or `?client=sportsweb` to any URL to preview the
other mode without redeploying. Config lives in `src/lib/config.ts`.

| Behaviour              | `sportsweb`                              | `app`                                   |
| ---------------------- | ---------------------------------------- | --------------------------------------- |
| Embed codes            | **Shown** (drop the live sheet on a page)| Hidden (the app *is* the destination)   |
| Published team lands on| the club's own website                   | the team's page on the app subdomain    |
| Player names           | (later) deep-link to player profiles     | plain text                              |
| Publish confirmation   | "live on your club website"              | "live on your team page in the app"     |

Derived helpers exported from config: `isAppClient`, `isSportsWebClient`,
`SHOW_EMBED`, `PUBLISH_TARGET_LABEL`.

---

## 2. Save vs Publish

Two distinct actions in the top toolbar:

- **Save draft** — stores the current sheet but does **not** make it live. Safe to
  do mid-build. A draft save never changes the live/offline status of a team that's
  already published, so re-editing a live team never blanks the public page.
- **Publish** — marks the team live (asks to confirm first), then it appears on the
  destination for the client type.

### Data model (already in place)
- `lineups.published` (boolean) is the live flag.
- `saveTeamSheet(data, refs, { publish })` — `publish:false` saves draft data only;
  `publish:true` flips `published` to true.
- Public + embed views load with `publishedOnly: true`; the editor sees drafts too.
  So a draft is invisible to the public until Published — exactly the intent.

### Status that's DONE (frontend)
- `clientType` flag + URL override + config helpers.
- Save draft / Publish split in the toolbar, with distinct confirmation copy.
- Embed button gated to `sportsweb` only.
- Draft-vs-live load semantics (`publishedOnly`).

---

## 3. What's still TODO (backend / data)

The frontend writes `published=true`; these pieces make that *visible* on a site/app.

### 3a. Published feed the site/app reads
A page on the club site (sportsweb) or the team page in the app needs to render the
**latest published** team for a club + grade. Two options:

1. **Embed iframe (sportsweb, available now).** The Copy-embed code already points at
   `/?embed=1&fixture=<id>` and the embed loads `publishedOnly`. If the club page
   embeds by **club+grade** rather than a fixed fixture id, it auto-shows whatever is
   currently published for that grade — i.e. it updates itself each week with no code
   change. *Action:* add an embed mode that resolves "latest published for club+grade"
   (e.g. `/?embed=1&club=<id>&grade=Seniors`) instead of a pinned fixture.
2. **JSON feed (app + sportsweb).** A small read endpoint
   `GET /published?club=<id>&grade=<grade>` returning the latest published sheet, which
   the app subdomain page renders natively. Cleaner for the app client.

### 3b. Subdomain routing (app client)
Each club/team page on the app lives at a SportsWeb One subdomain. Needs: a route that
maps `team.<club>.sportsweb.com.au` (or a path) → club + grade → the published feed
above. This is hosting/routing config, not app code.

### 3c. Archive by round
Published teams should list by round on the site/app (history, not just "latest").
The data is already there (one fixture per round). *Action:* a feed/endpoint that
returns published fixtures for a club+grade ordered by round/date, and a simple list UI.

---

## 4. Opponent store (near-term, separate piece)

Today the opponent is a free-text field. Target: store opponents (name + logo) against
the `clubs` table so Match & branding offers a **dropdown** that preloads the opponent
logo. Later, rounds + opponents can be pulled automatically via a fixtures API; the
opponent store is the stepping stone.

---

## 5. Player profile deep-links (sportsweb only)

When `clientType === 'sportsweb'`, player names on the published graphic can link to
that player's profile page on the club site. On the app client they stay plain text.
The `clientType` flag already exists to gate this — the work is (a) a profile URL
pattern, and (b) making names anchors when a profile URL is present.

---

## 6. Suggested order

1. **Embed-by-club+grade** (3a-1) — unlocks the auto-updating sportsweb page with the
   least work, on top of what's already built.
2. **Published JSON feed** (3a-2) — needed for the app client's native pages.
3. **Opponent store + dropdown** (§4) — visible coach-facing win.
4. **Archive by round** (3c).
5. **Player profile links** (§5).
6. **Subdomain routing** (3b) — hosting config, can run in parallel.
