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

/** How tall a player's head should be, as a fraction of the framed height.
 *  This is the number that decides how big everyone looks. Raise it and heads
 *  grow; lower it and they shrink. */
const TARGET_HEAD_FRACTION = 0.46;

/** Widest a stored cut-out ever needs to be.
 *
 *  The plate's art box is 112 CSS px. 720 covers a 3x phone and leaves plenty
 *  of headroom for the downloaded graphic, which renders larger. Anything past
 *  that is bytes nobody ever sees. */
const MAX_STORED_WIDTH = 720;

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
    // Opaque width of every row, which is what lets us find the shoulders.
    const rowWidth = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      let lo = -1, hi = -1;
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > THRESHOLD) {
          if (lo < 0) lo = x;
          hi = x;
        }
      }
      if (lo >= 0) {
        rowWidth[y] = hi - lo + 1;
        if (lo < minX) minX = lo;
        if (hi > maxX) maxX = hi;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return dataUrl; // nothing opaque; leave alone

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    // WHERE THE SHOULDERS START.
    //
    // Scaling so the SHOULDERS fill the frame was the mistake: a broad-built
    // player then gets shrunk to fit and his head comes out smaller than a
    // narrow player's. The eye judges "same size" by HEAD, not shoulder width.
    //
    // Finding the shoulder line by "first row half as wide again as the head"
    // fails on slight builds, whose shoulders are barely wider than their head.
    // Instead take the row where the width GROWS FASTEST. Every build has that
    // moment where the neck gives way to shoulders, whatever the ratio.
    const headTop = minY;
    const searchTo = Math.min(maxY, headTop + Math.round(bh * 0.6));
    // Smooth over a few rows so a single ragged edge cannot masquerade as a jump.
    const span = Math.max(2, Math.round(bh * 0.015));
    let bestDelta = 0;
    let shoulderY = -1;
    for (let y = headTop + span; y <= searchTo - span; y++) {
      const before = rowWidth[y - span];
      const after = rowWidth[y + span];
      if (!before || !after) continue;
      const delta = after - before;
      if (delta > bestDelta) { bestDelta = delta; shoulderY = y; }
    }
    // Require the growth to be real, not noise on an even-width silhouette.
    if (shoulderY > 0 && bestDelta < Math.max(4, bw * 0.06)) shoulderY = -1;
    const headHeight = shoulderY > headTop ? shoulderY - headTop : Math.round(bh * 0.32);

    // Scale so every player's head is the same fraction of the frame.
    let outH = Math.round(headHeight / TARGET_HEAD_FRACTION);
    let outW = Math.round(outH * TARGET_ASPECT);
    if (!isFinite(outW) || outW < 8 || outH < 8) return dataUrl;
    // Cap the stored size. Headshots were being kept as multi-megabyte base64
    // PNGs on the player row -- 23 MB across eleven players, one of them 3.2 MB
    // -- and every team load dragged the lot down the wire before anything
    // could render. This is the single biggest reason teams were slow.
    if (outW > MAX_STORED_WIDTH) {
      const k = MAX_STORED_WIDTH / outW;
      outW = MAX_STORED_WIDTH;
      outH = Math.round(outH * k);
    }

    // Ratio of the final frame to the un-capped one, so the subject scales with it.
    const scale = outH / (headHeight / TARGET_HEAD_FRACTION);
    const drawW = Math.round(bw * scale);
    const drawH = Math.round(bh * scale);

    const dst = document.createElement('canvas');
    dst.width = outW;
    dst.height = outH;
    const dctx = dst.getContext('2d');
    if (!dctx) return dataUrl;
    dctx.imageSmoothingQuality = 'high';
    // Centred on the head, not the body: a player carrying a bag or with one
    // arm out should still have his face in the middle of the plate.
    let headCx = minX + bw / 2;
    if (shoulderY > headTop) {
      let hlo = w, hhi = -1;
      for (let y = headTop; y < shoulderY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (data[(y * w + x) * 4 + 3] > THRESHOLD) { if (x < hlo) hlo = x; if (x > hhi) hhi = x; }
        }
      }
      if (hhi > hlo) headCx = (hlo + hhi) / 2;
    }
    const dx = Math.round(outW / 2 - (headCx - minX) * scale);
    // A little air above the crown so no one is cropped at the hairline.
    const dy = Math.round(outH * 0.04);
    dctx.drawImage(img, minX, minY, bw, bh, dx, dy, drawW, drawH);
    // WebP keeps the alpha channel and is a fraction of PNG's size at a quality
    // no one can pick apart at plate size. Falls back to PNG if the browser
    // will not encode it (toDataURL silently returns a PNG in that case).
    const webp = dst.toDataURL('image/webp', 0.92);
    return webp.startsWith('data:image/webp') ? webp : dst.toDataURL('image/png');
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
