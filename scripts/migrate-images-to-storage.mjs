#!/usr/bin/env node
/**
 * One-off backfill: move every base64 data URL still sitting in a table row into
 * the public `images` Storage bucket, and replace the column with the https link.
 *
 * Why: sponsor banners were 2.3MB each, opponent logos 2.1MB, headshots ~1MB —
 * all stored as text inside the row. Any query touching those columns moved tens
 * of megabytes off disk, which drained the project's Disk IO budget and stopped
 * the database answering on 2026-08-29. New saves already write to Storage (see
 * src/lib/imageStore.ts); this fixes the rows that predate that.
 *
 * Safe to re-run: rows that already hold a link are skipped. Nothing is deleted —
 * a row is only updated after its upload succeeds.
 *
 * Usage: put the service role key in .env.local (gitignored, same file the dev
 * server already reads), then:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...      # Settings > API Keys, secret key
 *
 *   node scripts/migrate-images-to-storage.mjs --dry-run
 *   node scripts/migrate-images-to-storage.mjs
 *
 * Reading it from .env.local rather than `export` keeps the key out of your shell
 * history. Environment variables still win if you'd rather set them that way.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Minimal .env.local reader — enough for KEY=value lines, no dependency needed. */
function fromEnvFile(name) {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && m[1] === name) return m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* no .env.local — environment variables only */
  }
  return undefined;
}

const URL_ = process.env.SUPABASE_URL || fromEnvFile('SUPABASE_URL') || fromEnvFile('VITE_SUPABASE_URL');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fromEnvFile('SUPABASE_SERVICE_ROLE_KEY');
const DRY = process.argv.includes('--dry-run');
const BUCKET = 'images';

if (!URL_ || !KEY) {
  console.error(
    'Missing the Supabase URL or service role key.\n\n' +
      'Add this line to .env.local (it is gitignored):\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=sb_secret_...\n\n' +
      'Find it in the dashboard under Settings > API Keys, as the secret/service_role\n' +
      'key. It bypasses row-level security, so never commit it or paste it into chat.',
  );
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

/** table, column, and the Storage folder its images belong in. */
const TARGETS = [
  { table: 'players', col: 'headshot_url', folder: 'headshots', label: 'display_name' },
  { table: 'players', col: 'jumper_image_url', folder: 'jumpers', label: 'display_name' },
  { table: 'sponsors', col: 'logo_url', folder: 'sponsors', label: 'name' },
  { table: 'sponsors', col: 'banner_url', folder: 'sponsors', label: 'name' },
  { table: 'clubs', col: 'logo_url', folder: 'clubs', label: 'name' },
  { table: 'opponent_clubs', col: 'logo_url', folder: 'opponents', label: 'name' },
  { table: 'fixtures', col: 'opponent_logo_url', folder: 'opponents', label: 'opponent_name' },
  { table: 'lineups', col: 'jumper_image_url', folder: 'jumpers', label: null },
  { table: 'lineups', col: 'watermark_logo_url', folder: 'watermarks', label: null },
];

const slug = (v, fallback) =>
  ((v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || fallback);

function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const bytes = m[2]
    ? Buffer.from(m[3], 'base64')
    : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  const ext = (mime.split('/')[1] || 'png').replace('+xml', '').replace('jpeg', 'jpg');
  return { bytes, mime, ext };
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

let movedCount = 0;
let movedBytes = 0;
let failed = 0;

for (const { table, col, folder, label } of TARGETS) {
  // Ids only first, so we never pull every big value into memory at once.
  const { data: rows, error } = await sb.from(table).select('id').like(col, 'data:%');
  if (error) {
    console.error(`  ! ${table}.${col}: ${error.message}`);
    failed++;
    continue;
  }
  if (!rows?.length) {
    console.log(`- ${table}.${col}: nothing to move`);
    continue;
  }

  console.log(`\n${table}.${col}: ${rows.length} to move`);
  for (const { id } of rows) {
    // Fetch one value at a time — some of these are multiple megabytes.
    const cols = label ? `${col}, ${label}` : col;
    const { data: row, error: readErr } = await sb.from(table).select(cols).eq('id', id).single();
    if (readErr || !row?.[col]) {
      console.error(`  ! ${id}: ${readErr?.message ?? 'no value'}`);
      failed++;
      continue;
    }

    const decoded = decodeDataUrl(row[col]);
    if (!decoded) {
      console.error(`  ! ${id}: could not decode`);
      failed++;
      continue;
    }

    const hash = createHash('sha256').update(decoded.bytes).digest('hex').slice(0, 16);
    const name = slug(label ? row[label] : null, id.slice(0, 8));
    const path = `${folder}/${name}-${hash}.${decoded.ext}`;

    if (DRY) {
      console.log(`  would move ${mb(decoded.bytes.length)} -> ${path}`);
      movedCount++;
      movedBytes += decoded.bytes.length;
      continue;
    }

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, decoded.bytes, {
      contentType: decoded.mime,
      upsert: true,
      cacheControl: '31536000',
    });
    if (upErr) {
      console.error(`  ! ${id}: upload failed — ${upErr.message}`);
      failed++;
      continue;
    }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    // Only now is the row rewritten, so a failed upload leaves the image intact.
    const { error: updErr } = await sb.from(table).update({ [col]: pub.publicUrl }).eq('id', id);
    if (updErr) {
      console.error(`  ! ${id}: row update failed — ${updErr.message}`);
      failed++;
      continue;
    }

    console.log(`  moved ${mb(decoded.bytes.length)} -> ${path}`);
    movedCount++;
    movedBytes += decoded.bytes.length;
  }
}

// Columns holding a JSON ARRAY of image URLs rather than a single one. Same idea,
// but each element is moved and the array is written back.
const ARRAY_TARGETS = [{ table: 'lineups', col: 'competition_logos', folder: 'competitions' }];

for (const { table, col, folder } of ARRAY_TARGETS) {
  const { data: rows, error } = await sb.from(table).select('id').like(col, '%data:%');
  if (error) {
    console.error(`  ! ${table}.${col}: ${error.message}`);
    failed++;
    continue;
  }
  if (!rows?.length) {
    console.log(`- ${table}.${col}: nothing to move`);
    continue;
  }

  console.log(`\n${table}.${col}: ${rows.length} rows to check`);
  for (const { id } of rows) {
    const { data: row, error: readErr } = await sb.from(table).select(col).eq('id', id).single();
    if (readErr || !row?.[col]) {
      console.error(`  ! ${id}: ${readErr?.message ?? 'no value'}`);
      failed++;
      continue;
    }

    // Stored as a JSON array, but be lenient — it may already be parsed.
    let list = row[col];
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch {
        console.error(`  ! ${id}: competition_logos is not valid JSON`);
        failed++;
        continue;
      }
    }
    if (!Array.isArray(list)) {
      console.error(`  ! ${id}: expected an array`);
      failed++;
      continue;
    }

    let changed = false;
    const out = [];
    for (const [i, entry] of list.entries()) {
      if (typeof entry !== 'string' || !entry.startsWith('data:')) {
        out.push(entry);
        continue;
      }
      const decoded = decodeDataUrl(entry);
      if (!decoded) {
        out.push(entry);
        continue;
      }
      const hash = createHash('sha256').update(decoded.bytes).digest('hex').slice(0, 16);
      const path = `${folder}/logo-${hash}.${decoded.ext}`;

      if (DRY) {
        console.log(`  would move ${mb(decoded.bytes.length)} -> ${path}`);
        movedCount++;
        movedBytes += decoded.bytes.length;
        out.push(entry);
        continue;
      }

      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, decoded.bytes, {
        contentType: decoded.mime,
        upsert: true,
        cacheControl: '31536000',
      });
      if (upErr) {
        console.error(`  ! ${id}[${i}]: upload failed — ${upErr.message}`);
        failed++;
        out.push(entry);
        continue;
      }
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      console.log(`  moved ${mb(decoded.bytes.length)} -> ${path}`);
      movedCount++;
      movedBytes += decoded.bytes.length;
      changed = true;
      out.push(pub.publicUrl);
    }

    // Only rewrite once every element in this row uploaded cleanly.
    if (changed && !DRY) {
      const { error: updErr } = await sb
        .from(table)
        .update({ [col]: JSON.stringify(out) })
        .eq('id', id);
      if (updErr) {
        console.error(`  ! ${id}: row update failed — ${updErr.message}`);
        failed++;
      }
    }
  }
}

console.log(
  `\n${DRY ? '[dry run] would move' : 'Moved'} ${movedCount} images, ${mb(movedBytes)} out of the database.` +
    (failed ? ` ${failed} failed — re-run to retry those.` : ''),
);
if (!DRY && movedCount) {
  console.log(
    'Now run VACUUM FULL on the affected tables to actually reclaim the disk space:\n' +
      '  vacuum full players, sponsors, clubs, opponent_clubs, fixtures, lineups;',
  );
}
process.exit(failed ? 1 : 0);
