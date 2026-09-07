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
// WIDTH over HEIGHT. This was 112/84 and used as `outW = outH * TARGET_ASPECT`,
// which makes the frame WIDER than it is tall. The art box
// (.sw1-plate--headshot .sw1-plate__art) is 72x88 -- portrait -- so every
// normalised cut-out came out landscape and was letterboxed into a portrait box,
// leaving players at different apparent sizes and heights.
const TARGET_ASPECT = 72 / 88; // 0.818, width/height of the headshot art box

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

/** The model options, shared by the upload path and the warm-up so both fetch the
 *  SAME model — warming one and then using another would download twice. */
const MODEL_CONFIG = {
  // ARMS. The library ships three models and defaults to the quantised one,
  // which is the smallest download and much the worst at thin structures —
  // it eats forearms and leaves soft, haloed hairlines. 'isnet' is the
  // full-precision model and holds those edges.
  model: 'isnet',
  // Measured: 'gpu' finished in 9.96s against 10.4s on cpu, i.e. no real gain
  // for this model, so there is nothing to buy by asking for a device that some
  // browsers do not have.
  device: 'cpu',
} as const;

/**
 * Fetch the background-removal model ahead of time.
 *
 * Measured on a cold cache, the first cut-out took 47 SECONDS: about 35 of those
 * are the model itself, arriving as ~50 separate requests from the vendor CDN,
 * and only ~10 is the actual work. A coach uploading their first headshot sat in
 * front of a button that looked frozen for the better part of a minute.
 *
 * The library caches the model for the life of the page but nothing persists it
 * (no Cache Storage, no IndexedDB — checked), so it leans on the HTTP cache: a
 * reload cost 13.9s rather than 47s.
 *
 * Calling this when the editor opens moves that download off the critical path,
 * so the model is usually in hand before anyone picks a file. Safe to call more
 * than once — the library de-duplicates, and a failure is swallowed because a
 * warm-up must never break the editor.
 */
export async function preloadBackgroundRemoval(): Promise<void> {
  try {
    const { preload } = await import('@imgly/background-removal');
    await preload(MODEL_CONFIG as unknown as Record<string, unknown>);
  } catch {
    /* best effort: the upload path fetches it on demand anyway */
  }
}

/**
 * @param onProgress optional (fraction 0..1) — the model download is long enough
 *        that a static "Removing background…" reads as a hang. Reporting real
 *        progress is the difference between waiting and giving up.
 */
export async function removeHeadshotBackground(
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal');
  const out = await removeBackground(file, {
    ...MODEL_CONFIG,
    // PNG at full quality: anything lossy chews the alpha edge and re-introduces
    // the halo the cut-out exists to remove.
    output: { format: 'image/png', quality: 1 },
    progress: (_key: string, current: number, total: number) => {
      if (onProgress && total > 0) onProgress(Math.min(1, current / total));
    },
  } as unknown as Record<string, unknown>);
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

    // WHERE THE SHOULDERS START.
    //
    // Scaling so the SHOULDERS fill the frame was the first mistake: a broad
    // player got shrunk to fit and his head came out smaller than a narrow
    // player's. The eye judges "same size" by HEAD, not shoulder width.
    //
    // "The row where width grows fastest" was the second: a head is round, so
    // its own crown widens faster than anything below it.
    //
    // "The widest row in the top 45%" was the third, and it is what shipped in
    // between: on the club's own photos the head is only ~25% of a chest crop,
    // so a 45% zone sweeps into the shoulders and reads crown-to-chest as the
    // head. Crop-dependent, so heads came out at different sizes and one crown
    // was cut off.
    //
    // What a real silhouette actually does, measured row by row on those photos
    // (width as % of image): 5 at the crown, 37 at the cheekbones (22% down),
    // 26 at the NECK (36% down), then 92 across the shoulders. Head widens, neck
    // narrows, shoulders widen far past the head. The neck is the landmark: the
    // first REAL narrowing after the crown, and it is there on every build.
    //
    // Two guards, both learned on the same photos: smooth over a few rows so a
    // single hair strand at the crown cannot read as a narrowing (it did -- one
    // player's head came out 1px tall), and refuse to call a narrowing until the
    // head is a credible width, for the same reason.
    const smooth = Math.max(2, Math.round(bh * 0.01));
    const widthAt = (y: number) => {
      let sum = 0;
      let n = 0;
      for (let k = -smooth; k <= smooth; k++) {
        const yy = y + k;
        if (yy >= minY && yy <= maxY) { sum += rowWidth[yy]; n++; }
      }
      return n ? sum / n : 0;
    };
    const searchEnd = Math.min(maxY, headTop + Math.round(bh * 0.6));
    const credible = w * 0.1; // a head is never this thin
    let headMaxW = 0;
    let neckY = -1;
    for (let y = headTop; y <= searchEnd; y++) {
      const wy = widthAt(y);
      if (wy > headMaxW) headMaxW = wy;
      else if (headMaxW >= credible && wy < headMaxW * 0.9) { neckY = y; break; }
    }
    // Narrowest point of the neck, then the first row past it clearly wider
    // than the head: that is where the shoulders start.
    let shoulderY = -1;
    if (neckY > 0) {
      let neckMinW = widthAt(neckY);
      let neckMinY = neckY;
      for (let y = neckY; y <= searchEnd; y++) {
        const wy = widthAt(y);
        if (wy < neckMinW) { neckMinW = wy; neckMinY = y; }
        if (wy > headMaxW * 1.05) { shoulderY = y; break; }
      }
      // Shoulders can sit below the window on a long neck; the neck itself still
      // gives the head size. Head ~ crown-to-neck plus a little.
      if (shoulderY < 0) shoulderY = neckMinY + Math.round((neckMinY - headTop) * 0.15);
    }

    // Sanity-check the reading before trusting it. A head is somewhere between a
    // seventh and two thirds of a head-and-shoulders crop; outside that is a
    // misread, and acting on one is what collapsed the frame before. Fall back
    // to a proportion of the subject: never brilliant, never wrong by an order
    // of magnitude.
    let headHeight = shoulderY > headTop ? shoulderY - headTop : -1;
    if (headHeight < bh * 0.15 || headHeight > bh * 0.66) headHeight = Math.round(bh * 0.32);

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

    // NOTHING IS CUT OFF. Sizing on the head is what keeps every player the same
    // size, but the rule from the club is that shoulders and arms stay whole -- a
    // crossed arm or a broad frame must never be squared off at the canvas edge.
    // So the head-based scale is a ceiling, not a law: if it would push any part
    // of the subject past the sides or the bottom, the scale drops until the whole
    // silhouette fits, keeping the same air above the crown. A wide pose comes
    // out a touch smaller than its neighbours; nothing comes out clipped.
    const headScale = outH / (headHeight / TARGET_HEAD_FRACTION);
    const air = Math.round(outH * 0.04);
    const fitScale = Math.min(outW / bw, (outH - air) / bh);
    const scale = Math.min(headScale, fitScale);
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
    // Centre on the head, but never let that centring push an edge outside.
    const dx = Math.max(0, Math.min(outW - drawW, Math.round(outW / 2 - (headCx - minX) * scale)));
    // Bottom-anchored so the body meets the name plate. When the head scale
    // governs, the crown lands at the 4% air line; when the fit does, it sits
    // lower, and the whole player is in frame.
    const dy = outH - drawH;
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
