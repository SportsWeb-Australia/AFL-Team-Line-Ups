import type { ArtPosition } from '../types';

/** Beyond this a picture leaves its plate entirely — not a useful position. */
export const POSITION_LIMIT = 40;
export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;

export const CENTRED: ArtPosition = { x: 0, y: 0, scale: 1 };

export const clampXY = (n: number) => Math.max(-POSITION_LIMIT, Math.min(POSITION_LIMIT, Math.round(n * 2) / 2));
export const clampScale = (n: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(n * 100) / 100));

export function isCentred(p: ArtPosition | null | undefined): boolean {
  return !p || (!p.x && !p.y && (p.scale ?? 1) === 1);
}

/** Reads a stored position defensively (JSON text or object). Anything
 *  unusable, or a position that is simply centred, comes back undefined so an
 *  untouched sheet stays exactly as it was. */
export function parsePosition(raw: unknown): ArtPosition | undefined {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  const scale = Number(r.scale);
  const pos: ArtPosition = {
    x: Number.isFinite(x) ? clampXY(x) : 0,
    y: Number.isFinite(y) ? clampXY(y) : 0,
    scale: Number.isFinite(scale) && scale > 0 ? clampScale(scale) : 1,
  };
  return isCentred(pos) ? undefined : pos;
}
