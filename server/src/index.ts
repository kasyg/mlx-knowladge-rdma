/**
 * VetAtlas 3D API server – Express 5 + SQLite (node:sqlite).
 * Serves the anatomy dataset, personal notes, settings and learning progress,
 * and (in production) the built client from client/dist.
 */
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, seed } from './db.ts';
import { SPECIES_IDS, type SpeciesId, type SpeciesPayload, type Note, type StructureDef } from '../../shared/src/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.VETATLAS_DB ?? join(__dirname, '..', 'data', 'vetatlas.sqlite');
const CLIENT_DIST = process.env.CLIENT_DIST ?? join(__dirname, '..', '..', 'client', 'dist');

const db = openDb(DB_FILE);
const seeded = seed(db);
console.log(`[vetatlas] database ${DB_FILE} – seeded ${seeded} structures for ${SPECIES_IDS.length} species`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const isSpecies = (v: unknown): v is SpeciesId => typeof v === 'string' && (SPECIES_IDS as string[]).includes(v);
const speciesRow = db.prepare('SELECT payload FROM species WHERE id = ?');
const structRow = db.prepare('SELECT payload FROM structures WHERE species = ? AND id = ?');
const structSearch = db.prepare(
  `SELECT payload FROM structures WHERE species = ? AND (lower(name_la) LIKE ? OR lower(name_cs) LIKE ? OR lower(name_en) LIKE ?) ORDER BY CASE WHEN lower(name_la) LIKE ? THEN 0 ELSE 1 END LIMIT 25`,
);

app.get('/api/health', (_req, res) => res.json({ ok: true, species: SPECIES_IDS, time: new Date().toISOString() }));

app.get('/api/species', (_req, res) => {
  const list = SPECIES_IDS.map((id) => {
    const row = speciesRow.get(id) as { payload: string } | undefined;
    if (!row) return null;
    const p = JSON.parse(row.payload) as SpeciesPayload;
    return { ...p.meta, structureCount: p.structures.length };
  }).filter(Boolean);
  res.json(list);
});

app.get('/api/species/:id', (req, res) => {
  const id = req.params.id;
  if (!isSpecies(id)) return res.status(404).json({ error: 'unknown species' });
  const row = speciesRow.get(id) as { payload: string } | undefined;
  if (!row) return res.status(404).json({ error: 'not seeded' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('json').send(row.payload);
});

app.get('/api/species/:id/structures/:sid', (req, res) => {
  const { id, sid } = req.params;
  if (!isSpecies(id)) return res.status(404).json({ error: 'unknown species' });
  const row = structRow.get(id, sid) as { payload: string } | undefined;
  if (!row) return res.status(404).json({ error: 'unknown structure' });
  res.type('json').send(row.payload);
});

app.get('/api/search', (req, res) => {
  const id = req.query.species;
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (!isSpecies(id)) return res.status(400).json({ error: 'species required' });
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const rows = structSearch.all(id, like, like, like, `${q}%`) as { payload: string }[];
  res.json(rows.map((r) => JSON.parse(r.payload) as StructureDef).map((s) => ({ id: s.id, kind: s.kind, group: s.group, names: s.names, regions: s.regions })));
});

// ------------------------------------------------------------------ notes
const mapNote = (r: Record<string, unknown>): Note => ({
  id: r.id as number,
  deviceId: r.device_id as string,
  species: r.species as SpeciesId,
  structureId: r.structure_id as string,
  text: r.text as string,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const notesList = db.prepare('SELECT * FROM notes WHERE device_id = ? AND species = ? ORDER BY updated_at DESC');
const noteGet = db.prepare('SELECT * FROM notes WHERE id = ? AND device_id = ?');
const noteIns = db.prepare('INSERT INTO notes (device_id, species, structure_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const noteUpd = db.prepare('UPDATE notes SET text = ?, updated_at = ? WHERE id = ? AND device_id = ?');
const noteDel = db.prepare('DELETE FROM notes WHERE id = ? AND device_id = ?');

app.get('/api/notes', (req, res) => {
  const deviceId = String(req.query.deviceId ?? '');
  const species = req.query.species;
  if (!deviceId || !isSpecies(species)) return res.status(400).json({ error: 'deviceId and species required' });
  res.json((notesList.all(deviceId, species) as Record<string, unknown>[]).map(mapNote));
});
app.post('/api/notes', (req, res) => {
  const { deviceId, species, structureId, text } = req.body ?? {};
  if (!deviceId || !isSpecies(species) || !structureId || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'invalid note' });
  if (!structRow.get(species, structureId)) return res.status(404).json({ error: 'unknown structure' });
  const now = new Date().toISOString();
  const r = noteIns.run(String(deviceId), species, String(structureId), text.trim().slice(0, 4000), now, now);
  const row = noteGet.get(Number(r.lastInsertRowid), String(deviceId)) as Record<string, unknown>;
  res.status(201).json(mapNote(row));
});
app.put('/api/notes/:id', (req, res) => {
  const { deviceId, text } = req.body ?? {};
  const id = Number(req.params.id);
  if (!deviceId || typeof text !== 'string' || !text.trim() || !Number.isFinite(id)) return res.status(400).json({ error: 'invalid note' });
  const r = noteUpd.run(text.trim().slice(0, 4000), new Date().toISOString(), id, String(deviceId));
  if (!r.changes) return res.status(404).json({ error: 'note not found' });
  res.json(mapNote(noteGet.get(id, String(deviceId)) as Record<string, unknown>));
});
app.delete('/api/notes/:id', (req, res) => {
  const deviceId = String(req.query.deviceId ?? (req.body ?? {}).deviceId ?? '');
  const id = Number(req.params.id);
  if (!deviceId || !Number.isFinite(id)) return res.status(400).json({ error: 'invalid request' });
  const r = noteDel.run(id, deviceId);
  if (!r.changes) return res.status(404).json({ error: 'note not found' });
  res.json({ ok: true });
});

// --------------------------------------------------------------- settings
const settingsGet = db.prepare('SELECT payload FROM settings WHERE device_id = ?');
const settingsPut = db.prepare('INSERT INTO settings (device_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at');
app.get('/api/settings/:deviceId', (req, res) => {
  const row = settingsGet.get(req.params.deviceId) as { payload: string } | undefined;
  res.json({ settings: row ? JSON.parse(row.payload) : null });
});
app.put('/api/settings/:deviceId', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid settings' });
  const allowed = ['uiLang', 'labelLang', 'haptics', 'reduceMotion', 'labelSize', 'theme', 'animationSpeed', 'showAllLabels'];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) clean[k] = body[k];
  settingsPut.run(req.params.deviceId, JSON.stringify(clean), new Date().toISOString());
  res.json({ ok: true });
});

// --------------------------------------------------------------- progress
const progList = db.prepare('SELECT structure_id FROM progress WHERE device_id = ? AND species = ? AND known = 1');
const progPut = db.prepare('INSERT INTO progress (device_id, species, structure_id, known, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id, species, structure_id) DO UPDATE SET known = excluded.known, updated_at = excluded.updated_at');
app.get('/api/progress/:deviceId', (req, res) => {
  const species = req.query.species;
  if (!isSpecies(species)) return res.status(400).json({ error: 'species required' });
  res.json({ known: (progList.all(req.params.deviceId, species) as { structure_id: string }[]).map((r) => r.structure_id) });
});
app.post('/api/progress', (req, res) => {
  const { deviceId, species, structureId, known } = req.body ?? {};
  if (!deviceId || !isSpecies(species) || !structureId) return res.status(400).json({ error: 'invalid request' });
  progPut.run(String(deviceId), species, String(structureId), known ? 1 : 0, new Date().toISOString());
  res.json({ ok: true });
});

// ------------------------------------------------------------ quiz
app.get('/api/quiz', (req, res) => {
  const species = req.query.species;
  if (!isSpecies(species)) return res.status(400).json({ error: 'species required' });
  const n = Math.min(20, Math.max(1, Number(req.query.n ?? 10)));
  const row = speciesRow.get(species) as { payload: string };
  const p = JSON.parse(row.payload) as SpeciesPayload;
  const group = typeof req.query.group === 'string' ? req.query.group : null;
  const pool = p.structures.filter((s) => s.id !== 'cutis' && (!group || s.group === group));
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const questions = [];
  for (let i = 0; i < n && pool.length >= 4; i++) {
    const answer = pick();
    const options = new Set<string>([answer.id]);
    while (options.size < 4) options.add(pick().id);
    questions.push({ answer: answer.id, options: [...options].sort(() => Math.random() - 0.5), names: Object.fromEntries([...options].map((id) => [id, pool.find((s) => s.id === id)!.names])) });
  }
  res.json(questions);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// ------------------------------------------------------------ static client
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: 'index.html', maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
  console.log(`[vetatlas] serving client from ${CLIENT_DIST}`);
} else {
  console.log('[vetatlas] client build not found – run "npm run build" (dev: use the Vite dev server on :5173)');
}

app.listen(PORT, () => console.log(`[vetatlas] API listening on http://localhost:${PORT}`));
