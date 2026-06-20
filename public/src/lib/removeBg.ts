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
  const out = await removeBackground(file);
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
