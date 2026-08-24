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
export async function removeHeadshotBackground(file: Blob): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal');
  const out = await removeBackground(file, {
    // ARMS. The library ships three models and defaults to the quantised one,
    // which is the smallest download and much the worst at thin structures --
    // it eats forearms, bat handles and anything narrow against a busy
    // background, which is exactly why cut-out players looked like their arms
    // had been lopped off. 'isnet' is the full-precision model and holds those
    // edges. It is a bigger first download, but it is fetched on demand and
    // then cached, so a club cutting out a whole squad pays it once.
    model: 'isnet',
    // PNG at full quality: anything lossy chews the alpha edge and re-introduces
    // the halo the cut-out exists to remove.
    output: { format: 'image/png', quality: 1 },
  });
  return blobToDataUrl(out);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
