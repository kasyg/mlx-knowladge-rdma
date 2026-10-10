#!/usr/bin/env node
/**
 * Download a Sketchfab model (glTF / GLB) into client/public/models/<species>/<name>/
 * and register it in that species' manifest.json so the atlas uses it.
 *
 *   SKETCHFAB_TOKEN=xxxxxxxx node scripts/fetch-sketchfab.mjs <model url or uid> <species> [name] \
 *       [--group bones] [--up +y] [--forward -x] [--id skeleton]
 *
 * The token is your Sketchfab API token (sketchfab.com/settings/password).
 * Only models their authors made downloadable (Creative Commons licences) can
 * be fetched; the licence, author and link are written to the manifest so the
 * atlas shows the attribution the licence requires.
 *
 * --forward is the direction the animal faces in the file (the atlas uses -x),
 * --up its up axis (glTF is +y). Adjust them in the manifest if the model
 * comes in sideways; the atlas fits the size automatically.
 */
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opts = { group: 'bones', up: '+y', forward: '-x', id: '' };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opts[a.slice(2)] = args[++i];
  else positional.push(a);
}
const [ref, species, nameArg] = positional;
if (!ref || !species) {
  console.error('usage: SKETCHFAB_TOKEN=... node scripts/fetch-sketchfab.mjs <model url or uid> <species> [name] [--group bones] [--up +y] [--forward -x]');
  process.exit(2);
}
const token = process.env.SKETCHFAB_TOKEN;
if (!token) {
  console.error('SKETCHFAB_TOKEN is not set (sketchfab.com/settings/password → API token)');
  process.exit(2);
}
const uid = (ref.match(/([0-9a-f]{32})/) || [])[1];
if (!uid) {
  console.error(`cannot find a 32-character model uid in "${ref}"`);
  process.exit(2);
}

const api = (path) => fetch(`https://api.sketchfab.com/v3${path}`, { headers: { Authorization: `Token ${token}` } });

const metaRes = await api(`/models/${uid}`);
if (!metaRes.ok) throw new Error(`model lookup failed: HTTP ${metaRes.status}`);
const meta = await metaRes.json();
const licence = meta.license?.label ?? meta.license?.slug ?? 'unknown licence';
if (!meta.isDownloadable) throw new Error(`"${meta.name}" is not downloadable (${licence}); only CC-licensed models with downloads enabled can be used`);
console.log(`model: ${meta.name} by ${meta.user?.displayName ?? meta.user?.username} (${licence}), ${meta.faceCount ?? '?'} faces`);

const dlRes = await api(`/models/${uid}/download`);
if (!dlRes.ok) throw new Error(`download request failed: HTTP ${dlRes.status} ${await dlRes.text()}`);
const dl = await dlRes.json();
const pick = dl.glb ?? dl.gltf;
if (!pick?.url) throw new Error('Sketchfab offered no glTF archive for this model');

const name = (nameArg ?? meta.slug ?? uid).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
const speciesDir = join(root, 'client', 'public', 'models', species);
const dir = join(speciesDir, name);
await mkdir(dir, { recursive: true });
console.log(`downloading ${Math.round((pick.size ?? 0) / 1e6)} MB …`);
const archive = await fetch(pick.url);
if (!archive.ok) throw new Error(`archive download failed: HTTP ${archive.status}`);
const buf = Buffer.from(await archive.arrayBuffer());

let file;
if (buf[0] === 0x50 && buf[1] === 0x4b) {
  const zipPath = join(dir, 'model.zip');
  await writeFile(zipPath, buf);
  let r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
  if (r.status !== 0) r = spawnSync('python3', ['-m', 'zipfile', '-e', zipPath, dir]);
  if (r.status !== 0) throw new Error('could not extract the archive: install unzip or python3');
  await rm(zipPath);
  const found = await findScene(dir);
  if (!found) throw new Error('no .glb / .gltf file in the archive');
  file = relative(speciesDir, found).split('\\').join('/');
} else {
  await writeFile(join(dir, 'scene.glb'), buf);
  file = `${name}/scene.glb`;
}

const manifestPath = join(speciesDir, 'manifest.json');
let manifest = { version: 1, models: [] };
if (existsSync(manifestPath)) manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = {
  id: opts.id || (opts.group === 'bones' ? 'skeleton' : name),
  file,
  group: opts.group,
  up: opts.up,
  forward: opts.forward,
  fit: 'height',
  autoMap: true,
  replace: true,
  attribution: {
    title: meta.name,
    author: meta.user?.displayName ?? meta.user?.username,
    license: licence,
    url: meta.viewerUrl ?? `https://sketchfab.com/3d-models/${uid}`,
  },
};
manifest.models = (manifest.models ?? []).filter((m) => m.id !== entry.id).concat(entry);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`saved ${file}\nmanifest: ${relative(root, manifestPath)} (entry "${entry.id}")\nreload the atlas; if the model comes in sideways, change "up" / "forward" in the manifest, "offset" / "scale" / "rotation" fine-tune the fit.`);

async function findScene(d) {
  const entries = await readdir(d, { withFileTypes: true });
  let best = null;
  for (const e of entries) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      const sub = await findScene(p);
      if (sub && (!best || sub.endsWith('.glb'))) best = sub;
    } else if (/\.(glb|gltf)$/i.test(e.name) && (!best || e.name.endsWith('.glb'))) best = p;
  }
  return best;
}
