/**
 * Images used to be stored as base64 data URLs inside the table rows themselves —
 * sponsor banners up to 2.3MB each, headshots ~1MB. Every query that touched
 * those columns therefore moved tens of megabytes off disk, which is what drained
 * the project's Disk IO budget and stopped the database answering on 2026-08-29.
 *
 * They live in the public `images` Storage bucket now. The columns still hold a
 * URL — just an https one that the browser fetches straight from the CDN, never
 * touching Postgres. Nothing that renders an image had to change.
 */
import { supabase } from './supabase';

const BUCKET = 'images';

/** A base64/percent-encoded data URL, i.e. an image inlined into a table row. */
export function isDataUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } | null {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const body = m[3];
  let bytes: Uint8Array;
  try {
    if (m[2]) {
      const bin = atob(body);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(body));
    }
  } catch {
    return null;
  }
  const ext = (mime.split('/')[1] || 'png').replace('+xml', '').replace('jpeg', 'jpg');
  return { bytes, mime, ext };
}

/** Content hash, so identical bytes reuse one object and a changed image lands on
 *  a new path instead of hiding behind a cached old one. */
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Uploads a data URL to Storage and returns its public https URL.
 *
 * Anything that is already a link, empty, or unparseable passes straight through
 * unchanged, so callers can hand this whatever the field currently holds and just
 * save the result. Upload failures also fall back to the original value — losing
 * a sponsor's banner because Storage hiccuped would be far worse than leaving one
 * row on the old format.
 */
export async function putImage(
  value: string | null | undefined,
  folder: string,
  key: string,
): Promise<string | null | undefined> {
  if (!supabase || !isDataUrl(value)) return value;
  const decoded = decodeDataUrl(value as string);
  if (!decoded) return value;

  try {
    const path = `${folder}/${key}-${await hashBytes(decoded.bytes)}.${decoded.ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([decoded.bytes as unknown as BlobPart], { type: decoded.mime }), {
        contentType: decoded.mime,
        upsert: true,
        // These paths are content-addressed, so a given URL's bytes never change.
        cacheControl: '31536000',
      });
    if (error) return value;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || value;
  } catch {
    return value;
  }
}
