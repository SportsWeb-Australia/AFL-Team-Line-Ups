#!/usr/bin/env node
/**
 * Re-frame the stored headshot cut-outs with the CURRENT normaliseCutout and
 * replace them in Storage.
 *
 * normaliseCutout is browser code (canvas), so this drives a headless Chrome at
 * the running dev server, runs the real function on each stored cut-out, and
 * takes the result straight out of the page -- the bytes never leave the machine.
 * Each new image is uploaded to a NEW content-addressed path and every
 * players.headshot_url that pointed at the old file is repointed. Old files are
 * left in place, so this is reversible by pointing the rows back.
 *
 * Needs: the dev server up (npm run dev, port 4332) and SUPABASE_SERVICE_ROLE_KEY
 * in .env.local (gitignored) or the environment.
 *   node scripts/replace-headshots.mjs --dry-run   # re-frame + report, write nothing
 *   node scripts/replace-headshots.mjs             # do it
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function fromEnvFile(name) {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && m[1] === name) return m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return undefined;
}
const DRY = process.argv.includes('--dry-run');
const DEV = process.env.DEV_URL || 'http://localhost:4332';
const URL_ = process.env.SUPABASE_URL || fromEnvFile('SUPABASE_URL') || fromEnvFile('VITE_SUPABASE_URL');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fromEnvFile('SUPABASE_SERVICE_ROLE_KEY');
if (!URL_) { console.error('Missing Supabase URL.'); process.exit(1); }
if (!KEY && !DRY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY (put it in .env.local). Use --dry-run to preview without it.'); process.exit(1); }

// puppeteer from the npx cache (memory: it lives there on this Mac), else local
async function loadPuppeteer() {
  try { return await import('puppeteer'); } catch {}
  const base = join(homedir(), '.npm', '_npx');
  if (existsSync(base)) for (const d of readdirSync(base)) {
    const dir = join(base, d, 'node_modules', 'puppeteer');
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    // resolve the ESM entry from the package's own manifest rather than guessing
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const exp = pkg.exports?.['.'];
    const entry = (typeof exp === 'string' ? exp : exp?.import?.default ?? exp?.import ?? exp?.default) ?? pkg.module ?? pkg.main;
    if (entry) return await import(pathToFileURL(join(dir, entry)).href);
  }
  throw new Error('puppeteer not found: run  npx puppeteer --version  once, or npm i -D puppeteer');
}

const anon = createClient(URL_, fromEnvFile('VITE_SUPABASE_ANON_KEY') || KEY, { auth: { persistSession: false } });
// only the real transparent cut-outs (the demo players are opaque stock photos)
const { data: rows, error } = await anon.from('players').select('id, display_name, headshot_url').like('headshot_url', '%/images/headshots/%');
if (error) { console.error(error.message); process.exit(1); }
const byFile = new Map();
for (const r of rows ?? []) { const f = r.headshot_url.replace(/^.*\/images\//, ''); if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(r); }
const SKIP = /arjun-singh|cody-barlow|blake-sorrento|finn-o-connor/;
const files = [...byFile.keys()].filter(f => !SKIP.test(f));
console.log(`${files.length} stored cut-outs to re-frame (${[...byFile.keys()].length - files.length} demo photos skipped)`);

const { default: puppeteer } = await loadPuppeteer();
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(DEV + '/', { waitUntil: 'domcontentloaded' });
  const base = URL_ + '/storage/v1/object/public/images/';
  const sb = KEY ? createClient(URL_, KEY, { auth: { persistSession: false } }) : null;
  let done = 0, failed = 0;
  for (const f of files) {
    const who = byFile.get(f).map(r => r.display_name).join(', ');
    const out = await page.evaluate(async (src) => {
      const m = await import('/src/lib/removeBg.ts');
      const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('load failed')); i.src = src; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const url = await m.normaliseCutout(c.toDataURL('image/png'));
      const o = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode failed')); i.src = url; });
      return { url, inW: img.naturalWidth, inH: img.naturalHeight, w: o.naturalWidth, h: o.naturalHeight };
    }, base + f + '?cb=' + Date.now());
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(out.url);
    const mime = m[1] || 'image/webp'; const bytes = Buffer.from(m[3], 'base64');
    const ext = (mime.split('/')[1] || 'webp').replace('jpeg', 'jpg');
    const stem = f.replace(/^headshots\//, '').replace(/-[0-9a-f]{16}\.\w+$/, '');
    const path = `headshots/${stem}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`;
    const kb = Math.round(bytes.length / 1024);
    if (DRY) { console.log(`would replace ${f}  ${out.inW}x${out.inH} -> ${out.w}x${out.h} ${kb}KB  as ${path}  for: ${who}`); done++; continue; }
    const { error: ue } = await sb.storage.from('images').upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '31536000' });
    if (ue) { console.error(`  ! ${f}: upload failed - ${ue.message}`); failed++; continue; }
    const { data: pub } = sb.storage.from('images').getPublicUrl(path);
    let n = 0;
    for (const r of byFile.get(f)) { const { error: pe } = await sb.from('players').update({ headshot_url: pub.publicUrl }).eq('id', r.id); if (pe) { console.error(`  ! ${r.display_name}: ${pe.message}`); failed++; } else n++; }
    console.log(`replaced ${f} -> ${path}  ${out.w}x${out.h} ${kb}KB  repointed ${n}: ${who}`);
    done++;
  }
  console.log(`\n${DRY ? '[dry run] ' : ''}${done} re-framed${failed ? `, ${failed} failed` : ''}. Old files kept in Storage (reversible).`);
  process.exitCode = failed ? 1 : 0;
} finally { await browser.close(); }
