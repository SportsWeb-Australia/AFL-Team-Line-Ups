import { useEffect, useState } from 'react';

/**
 * Product shots arrive with however much transparent space around them the
 * photographer left: the Vic Metro runner's top fills 89% of its canvas, the
 * polo 96%. Drawn into the same box, the runner came out visibly smaller. This
 * crops each image to its visible pixels, so shirts line up by what you can see
 * rather than by their file's padding.
 *
 * Render-time rather than upload-time so images already saved are fixed too.
 * Downscaled to 480px on the way (the band draws at most 140px, 280px in the
 * 2x export) and cached per URL. Any failure (no CORS, an opaque JPEG with no
 * alpha to trim) falls back to the original URL.
 */
const cache = new Map<string, Promise<string>>();
const MAX = 480;

function trim(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(url);
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);
        let top = h, left = w, right = -1, bottom = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 12) {
              if (x < left) left = x;
              if (x > right) right = x;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
            }
          }
        }
        if (right < 0) return resolve(url);
        const bw = right - left + 1;
        const bh = bottom - top + 1;
        // Nothing worth trimming (or no transparency at all): keep the original.
        if (bw > w * 0.98 && bh > h * 0.98) return resolve(url);
        const s = Math.min(1, MAX / Math.max(bw, bh));
        const out = document.createElement('canvas');
        out.width = Math.round(bw * s);
        out.height = Math.round(bh * s);
        const o = out.getContext('2d');
        if (!o) return resolve(url);
        o.imageSmoothingQuality = 'high';
        o.drawImage(c, left, top, bw, bh, 0, 0, out.width, out.height);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

/** The image cropped to its visible pixels; the original until that's ready. */
export function useTrimmedImage(url?: string | null): string | undefined {
  const [out, setOut] = useState<string | undefined>(url ?? undefined);
  useEffect(() => {
    if (!url) return setOut(undefined);
    let live = true;
    setOut(url);
    if (!cache.has(url)) cache.set(url, trim(url));
    cache.get(url)!.then((t) => live && setOut(t));
    return () => {
      live = false;
    };
  }, [url]);
  return out;
}
