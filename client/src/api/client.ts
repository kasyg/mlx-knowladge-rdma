import type { Note, SpeciesId, SpeciesMeta, SpeciesPayload, UserSettings } from '@shared/types';
import { getSpeciesPayload } from '@shared/anatomy/index';
import { SPECIES_LIST } from '@shared/species';

const BASE = '/api';
let online = true;
const listeners = new Set<(v: boolean) => void>();
export const onOnlineChange = (fn: (v: boolean) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function setOnline(v: boolean) {
  if (online !== v) {
    online = v;
    listeners.forEach((l) => l(v));
  }
}
export const isOnline = () => online;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  setOnline(true);
  return (await res.json()) as T;
}

/** Species payload from the API, with a bundled fallback so the atlas keeps working offline. */
export async function fetchSpecies(id: SpeciesId): Promise<SpeciesPayload> {
  try {
    return await req<SpeciesPayload>(`/species/${id}`);
  } catch (e) {
    console.warn('[vetatlas] API unavailable, using bundled data', e);
    setOnline(false);
    return getSpeciesPayload(id);
  }
}

export async function fetchSpeciesList(): Promise<SpeciesMeta[]> {
  try {
    return await req<SpeciesMeta[]>('/species');
  } catch {
    setOnline(false);
    return SPECIES_LIST.map((s) => s.meta);
  }
}

export async function listNotes(deviceId: string, species: SpeciesId): Promise<Note[]> {
  try {
    return await req<Note[]>(`/notes?deviceId=${encodeURIComponent(deviceId)}&species=${species}`);
  } catch {
    setOnline(false);
    return [];
  }
}
export async function createNote(deviceId: string, species: SpeciesId, structureId: string, text: string): Promise<Note> {
  return req<Note>('/notes', { method: 'POST', body: JSON.stringify({ deviceId, species, structureId, text }) });
}
export async function updateNote(id: number, deviceId: string, text: string): Promise<Note> {
  return req<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify({ deviceId, text }) });
}
export async function deleteNote(id: number, deviceId: string): Promise<void> {
  await req(`/notes/${id}?deviceId=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}

export async function fetchSettings(deviceId: string): Promise<Partial<UserSettings> | null> {
  try {
    const r = await req<{ settings: Partial<UserSettings> | null }>(`/settings/${encodeURIComponent(deviceId)}`);
    return r.settings;
  } catch {
    setOnline(false);
    return null;
  }
}
export async function saveSettings(deviceId: string, settings: UserSettings): Promise<void> {
  try {
    await req(`/settings/${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(settings) });
  } catch {
    setOnline(false);
  }
}

export async function fetchProgress(deviceId: string, species: SpeciesId): Promise<string[]> {
  try {
    const r = await req<{ known: string[] }>(`/progress/${encodeURIComponent(deviceId)}?species=${species}`);
    return r.known;
  } catch {
    setOnline(false);
    return [];
  }
}
export async function setProgress(deviceId: string, species: SpeciesId, structureId: string, known: boolean): Promise<void> {
  try {
    await req('/progress', { method: 'POST', body: JSON.stringify({ deviceId, species, structureId, known }) });
  } catch {
    setOnline(false);
  }
}
