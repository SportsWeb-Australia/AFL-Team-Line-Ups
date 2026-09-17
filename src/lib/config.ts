/**
 * Client type — ONE codebase, two behaviours.
 *
 *  • 'sportsweb' — embedded in a SportsWeb One club website. Embed codes are
 *    available, published teams appear on the club's own site, and (later)
 *    player names can deep-link to player profile pages on that site.
 *
 *  • 'app'       — the standalone Footy Team Line Ups app on a SportsWeb One
 *    subdomain. No embed codes (the app IS the destination); published teams
 *    appear on the team's page in the app; player names are plain text.
 *
 * Set per deployment with VITE_CLIENT_TYPE=app|sportsweb (Vercel env var).
 * Append ?client=app or ?client=sportsweb to any URL to preview the other mode.
 */
export type ClientType = 'app' | 'sportsweb';

function resolveClientType(): ClientType {
  const fromUrl = new URLSearchParams(window.location.search).get('client');
  if (fromUrl === 'app' || fromUrl === 'sportsweb') return fromUrl;
  const fromEnv = import.meta.env.VITE_CLIENT_TYPE as string | undefined;
  if (fromEnv === 'app' || fromEnv === 'sportsweb') return fromEnv;
  return 'sportsweb'; // default: embeddable SportsWeb One mode
}

export const CLIENT_TYPE: ClientType = resolveClientType();
export const isAppClient = CLIENT_TYPE === 'app';
export const isSportsWebClient = CLIENT_TYPE === 'sportsweb';

/** Embed codes are a SportsWeb-site feature only. */
export const SHOW_EMBED = isSportsWebClient;

/**
 * The "3 · Playing list" section of the editor: a read-only list of the picked
 * side. HIDDEN 2026-09-17 while its role on the platform is rethought — it
 * repeated what the ground already shows and had no action or tick of its own.
 *
 * Nothing was deleted: PlayingList.tsx, its data and its wiring are all intact,
 * so bringing it back is a switch, not a rebuild.
 *   - Everyone:        set VITE_SHOW_PLAYING_LIST=true (Vercel env var) and redeploy.
 *   - Just a preview:  add ?playinglist=1 to the editor URL.
 *
 * The progress bar's "3 Side" and the Quick Start's "3 · Pick the side" still
 * hold without it: step 3 is picking the side, which happens on the ground.
 */
export const SHOW_PLAYING_LIST =
  new URLSearchParams(window.location.search).get('playinglist') === '1' ||
  (import.meta.env.VITE_SHOW_PLAYING_LIST as string | undefined) === 'true';

/** Where a published team goes live — used in publish confirmation copy. */
export const PUBLISH_TARGET_LABEL = isAppClient
  ? 'your team page in the app'
  : 'your club website';

/**
 * Login gate. When true, the editor (?admin) requires a signed-in user before it
 * will show the controls or save/publish. Pair with supabase/enable-auth.sql,
 * which makes the database itself reject writes from anyone not logged in.
 * Default OFF so the demo/dev flow is unchanged until you opt in.
 * Set per deployment with VITE_REQUIRE_AUTH=true (Vercel env var).
 */
export const REQUIRE_AUTH = (import.meta.env.VITE_REQUIRE_AUTH as string | undefined) === 'true';
