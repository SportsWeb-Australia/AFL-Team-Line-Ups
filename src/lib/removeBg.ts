/**
 * Client-side background removal for player headshots.
 *
 * QUALITY NOTE — this in-browser remover is a convenience, not a replacement for
 * a clean source image. For the best result, headshots should be cut out at the
 * point of production (a transparent PNG straight from the photographer, or a
 * high-quality background-removal tool). When Click Sports Media runs a media day
 * for a club, professionally cut-out headshots are included.
 *
 * The model is heavy (a few MB), so it is loaded ON DEMAND via dynamic import —
 * it only downloads the first time someone removes a background, and never adds
 * to the initial app bundle. Runs entirely on the user's device: no server, no
 * per-image cost.
 */

/** Every cut-out is normalised to this shape before it is stored.
 *  Deliberately the same aspect as the plate's art box, so the stored image IS
 *  the final framing -- the layout then has nothing left to crop or guess at. */
const TARGET_ASPECT = 112 / 84; // 1.333, matching .sw1-plate--headshot .sw1-plate__art

export async function removeHeadshotBackground(file: Blob): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal');
  const out = await removeBackground(file, {
    // ARMS. The library ships three models and defaults to the quantised one,
    // which is the smallest download and much the worst at thin structures —
    // it eats forearms and leaves soft, haloed hairlines. 'isnet' is the
    // full-precision model and holds those edges. Bigger first download,
    // fetched on demand and then cached, so a squad pays it once.
    model: 'isnet',
    // PNG at full quality: anything lossy chews the alpha edge and re-introduces
    // the halo the cut-out exists to remove.
    output: { format: 'image/png', quality: 1 },
  });
  return normaliseCutout(await blobToDataUrl(out));
}

/**
 * Trim the transparent margin and re-frame to a fixed shape.
 *
 * THE PROBLEM THIS SOLVES: how big a player looks on the ground depended
 * entirely on how much of their photo they happened to fill. A tightly shot
 * player rendered large, one with air around them rendered small, and their
 * heads sat at different heights — across a team, and across every club.
 * Nothing in CSS can correct that, because the layout cannot know where in the
 * frame the person is.
 *
 * After a cut-out it CAN be known: the alpha channel is the person. So find
 * their bounding box, crop to it, then pad back out to a fixed square with the
 * subject centred and the top of their head on the top edge. Every stored
 * headshot then has the same shape and the same anchor, so one crop rule frames
 * every player in every club identically.
 *
 * Falls back to the untouched image if anything goes wrong — a normalisation
 * failure must never cost someone their upload.
 */
export async function normaliseCutout(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return dataUrl;

    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    if (!sctx) return dataUrl;
    sctx.drawImage(img, 0, 0);
    const { data } = sctx.getImageData(0, 0, w, h);

    // Alpha 24 rather than 0: cut-outs carry a haze of near-transparent pixels
    // well outside the subject, and honouring those would make the "bounding
    // box" the whole frame again.
    const THRESHOLD = 24;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > THRESHOLD) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return dataUrl; // nothing opaque; leave alone

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    // A hair of breathing room so the crop never shaves the outermost pixel.
    const pad = Math.round(bw * 0.02);

    // Width is the subject, edge to edge, plus that hair -- never any more, so
    // the player always fills the frame side to side and therefore always
    // renders the same size. Height follows from the target aspect, measured
    // DOWN FROM THE CROWN, so everyone is cut at the same point on their body.
    const outW = bw + pad * 2;
    const outH = Math.round(outW / TARGET_ASPECT);

    const dst = document.createElement('canvas');
    dst.width = outW;
    dst.height = outH;
    const dctx = dst.getContext('2d');
    if (!dctx) return dataUrl;
    // Source rect starts at the crown; anything past the target height simply is
    // not copied. If the subject is shorter than the window, the remainder stays
    // transparent rather than being stretched.
    const copyH = Math.min(bh, outH - pad);
    dctx.drawImage(img, minX, minY, bw, copyH, pad, pad, bw, copyH);
    return dst.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load cut-out'));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
