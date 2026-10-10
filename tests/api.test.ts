import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = 8791;
const BASE = `http://localhost:${PORT}/api`;
let proc: ChildProcess;

async function waitForServer(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

beforeAll(async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(root, 'server/src/index.ts')], {
    env: { ...process.env, PORT: String(PORT), VETATLAS_DB: ':memory:', CLIENT_DIST: '/nonexistent' },
    stdio: 'ignore',
  });
  await waitForServer();
}, 30000);

afterAll(() => {
  proc?.kill();
});

const json = async (path: string, init?: RequestInit) => {
  const r = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  return { status: r.status, body: await r.json() };
};

describe('API', () => {
  it('lists species and serves full payloads', async () => {
    const list = await json('/species');
    expect(list.status).toBe(200);
    expect(list.body.map((s: { id: string }) => s.id)).toEqual(['horse', 'cow', 'goat', 'dog', 'cat']);
    const horse = await json('/species/horse');
    expect(horse.status).toBe(200);
    expect(horse.body.structures.length).toBeGreaterThan(150);
    expect(horse.body.regions.length).toBe(10);
    expect(horse.body.rig.H).toBe(1.6);
    const missing = await json('/species/dragon');
    expect(missing.status).toBe(404);
  });
  it('returns a single structure and searches names', async () => {
    const s = await json('/species/horse/structures/humerus');
    expect(s.body.names.la).toBe('Humerus');
    const r = await json('/search?species=horse&q=srdce');
    expect(r.body.some((x: { id: string }) => x.id === 'cor')).toBe(true);
    const r2 = await json('/search?species=cow&q=bachor');
    expect(r2.body[0].id).toBe('rumen');
  });
  it('creates, updates, lists and deletes notes', async () => {
    const dev = 'test-device';
    const created = await json('/notes', { method: 'POST', body: JSON.stringify({ deviceId: dev, species: 'horse', structureId: 'humerus', text: 'Pamatovat si deltovou drsnatinu' }) });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const updated = await json(`/notes/${id}`, { method: 'PUT', body: JSON.stringify({ deviceId: dev, text: 'Upraveno' }) });
    expect(updated.body.text).toBe('Upraveno');
    const list = await json(`/notes?deviceId=${dev}&species=horse`);
    expect(list.body.length).toBe(1);
    const other = await json(`/notes?deviceId=someone-else&species=horse`);
    expect(other.body.length).toBe(0);
    const bad = await json('/notes', { method: 'POST', body: JSON.stringify({ deviceId: dev, species: 'horse', structureId: 'nope', text: 'x' }) });
    expect(bad.status).toBe(404);
    const del = await json(`/notes/${id}?deviceId=${dev}`, { method: 'DELETE' });
    expect(del.body.ok).toBe(true);
    const list2 = await json(`/notes?deviceId=${dev}&species=horse`);
    expect(list2.body.length).toBe(0);
  });
  it('stores settings and progress per device', async () => {
    await json('/settings/dev-1', { method: 'PUT', body: JSON.stringify({ labelLang: 'cs', haptics: false, hacker: true }) });
    const s = await json('/settings/dev-1');
    expect(s.body.settings).toEqual({ labelLang: 'cs', haptics: false });
    await json('/progress', { method: 'POST', body: JSON.stringify({ deviceId: 'dev-1', species: 'cat', structureId: 'femur', known: true }) });
    const p = await json('/progress/dev-1?species=cat');
    expect(p.body.known).toEqual(['femur']);
    await json('/progress', { method: 'POST', body: JSON.stringify({ deviceId: 'dev-1', species: 'cat', structureId: 'femur', known: false }) });
    const p2 = await json('/progress/dev-1?species=cat');
    expect(p2.body.known).toEqual([]);
  });
  it('builds quiz questions', async () => {
    const q = await json('/quiz?species=dog&n=5&group=muscles');
    expect(q.body.length).toBe(5);
    for (const item of q.body) {
      expect(item.options).toContain(item.answer);
      expect(item.options.length).toBe(4);
    }
  });
});
