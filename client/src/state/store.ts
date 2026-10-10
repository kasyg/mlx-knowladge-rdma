import { create } from 'zustand';
import type { LayerId, Note, RegionId, SpeciesId, SpeciesPayload, SystemId, UserSettings, LabelLang } from '@shared/types';
import { DEFAULT_SETTINGS, LAYER_IDS, SYSTEM_IDS } from '@shared/types';
import { UI, type UiKey } from '@shared/i18n';
import type { AnimalModel } from '../three/animal.ts';
import { buildAnimal } from '../three/animal.ts';
import { loadManifest, applyExternalModels, type ExternalEntry } from '../three/external.ts';
import { fitRigToSkeleton } from '../three/rigfit.ts';
import { fetchSpecies, fetchSettings, saveSettings, listNotes, fetchProgress, setProgress as apiSetProgress } from '../api/client.ts';
import { deviceId } from '../utils/device.ts';
import { setHapticsEnabled } from '../utils/haptics.ts';

export type LayerMode = 'auto' | 'on' | 'off';
export type Panel = 'none' | 'layers' | 'systems' | 'regions' | 'detail' | 'search' | 'settings' | 'help';

export type CameraCommand =
  | { type: 'focusRegion'; region: RegionId }
  | { type: 'refit' }
  | { type: 'refitReset' }
  | { type: 'overview' }
  | { type: 'view'; view: 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom' }
  | { type: 'zoom'; delta: number }
  | { type: 'fitStructure'; key: string }
  | { type: 'fitKeys'; keys: string[]; focus: string };

/** Non-reactive registry of built 3D models (kept out of the store on purpose). */
export const models = {
  full: new Map<SpeciesId, AnimalModel>(),
  skin: new Map<SpeciesId, AnimalModel>(),
};

export interface AtlasState {
  view: 'home' | 'atlas';
  speciesId: SpeciesId | null;
  payload: SpeciesPayload | null;
  payloads: Partial<Record<SpeciesId, SpeciesPayload>>;
  spinning: SpeciesId | null;
  loading: { active: boolean; label: string; progress: number };
  region: RegionId | null;
  selected: string | null;
  hovered: string | null;
  depth: number;
  layerMode: Record<LayerId, LayerMode>;
  systems: Record<SystemId, boolean>;
  ghostSkin: boolean;
  labelsOn: boolean;
  physioPlaying: boolean;
  motionOn: boolean;
  motionPhase: number;
  motionStance: boolean;
  settings: UserSettings;
  panel: Panel;
  leftOpen: boolean;
  welcomeOpen: boolean;
  toast: string | null;
  cameraCmd: { id: number; cmd: CameraCommand } | null;
  online: boolean;
  notes: Note[];
  known: Set<string>;
  deviceId: string;
  modelVersion: number;
  quizHighlight: string | null;
  /** manifest entries of the imported 3D models of the current species (for credits) */
  external: ExternalEntry[];
  /** instance key of the structure shown alone (with what it is connected to) */
  isolated: string | null;
  isoOpts: IsoOpts;
  /** instance key of the muscle whose function is being demonstrated */
  demo: string | null;

  t: (k: UiKey) => string;
  label: (names: { la: string; cs: string; en: string }) => string;

  init: () => Promise<void>;
  goHome: () => void;
  selectSpecies: (id: SpeciesId) => Promise<void>;
  openAtlas: (id: SpeciesId, region?: RegionId | null, viaSpin?: boolean) => Promise<void>;
  setRegion: (r: RegionId | null) => void;
  select: (key: string | null) => void;
  setHovered: (key: string | null) => void;
  setDepth: (d: number) => void;
  setLayerMode: (l: LayerId, m: LayerMode) => void;
  toggleLayer: (l: LayerId) => void;
  resetLayers: () => void;
  toggleSystem: (s: SystemId) => void;
  setGhostSkin: (v: boolean) => void;
  setLabelsOn: (v: boolean) => void;
  setPhysioPlaying: (v: boolean) => void;
  setMotionOn: (v: boolean) => void;
  setMotionInfo: (phase: number, stance: boolean) => void;
  updateSettings: (p: Partial<UserSettings>) => void;
  setPanel: (p: Panel) => void;
  setLeftOpen: (v: boolean) => void;
  setWelcomeOpen: (v: boolean) => void;
  showToast: (msg: string | null) => void;
  camera: (cmd: CameraCommand) => void;
  setOnline: (v: boolean) => void;
  setNotes: (n: Note[]) => void;
  setKnown: (structureId: string, known: boolean) => void;
  reloadNotes: () => Promise<void>;
  setQuizHighlight: (key: string | null) => void;
  isolate: (key: string | null) => void;
  setIsoOpt: (k: keyof IsoOpts, v: boolean) => void;
  setDemo: (key: string | null) => void;
}

export interface IsoOpts {
  /** muscles acting with it (ghosted) */
  synergists: boolean;
  /** muscles acting against it (ghosted) */
  antagonists: boolean;
  /** its nerve and artery */
  supply: boolean;
  /** the rest of the animal as a faint ghost */
  context: boolean;
}

const autoMode = () => ({ skin: 'auto', muscles: 'auto', tendons: 'auto', cartilage: 'auto', bones: 'auto' }) as Record<LayerId, LayerMode>;
const noSystems = () => ({ vascular: false, respiratory: false, digestive: false, nervous: false, urinary: false }) as Record<SystemId, boolean>;

function loadLocalSettings(): UserSettings {
  try {
    const raw = localStorage.getItem('vetatlas.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'cs';
  return { ...DEFAULT_SETTINGS, uiLang: nav.startsWith('cs') || nav.startsWith('sk') ? 'cs' : 'en' };
}

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

let cmdId = 0;
let spinStart = 0;
export const SPIN_MS = 1500;

export const useAtlas = create<AtlasState>((set, get) => ({
  view: 'home',
  speciesId: null,
  payload: null,
  payloads: {},
  spinning: null,
  loading: { active: false, label: '', progress: 0 },
  region: null,
  selected: null,
  hovered: null,
  depth: 0,
  layerMode: autoMode(),
  systems: noSystems(),
  ghostSkin: false,
  labelsOn: true,
  physioPlaying: true,
  motionOn: false,
  motionPhase: 0,
  motionStance: true,
  settings: loadLocalSettings(),
  panel: 'none',
  leftOpen: true,
  welcomeOpen: (() => {
    try {
      return !localStorage.getItem('vetatlas.welcomeSeen');
    } catch {
      return true;
    }
  })(),
  toast: null,
  cameraCmd: null,
  online: true,
  notes: [],
  known: new Set(),
  deviceId: deviceId(),
  modelVersion: 0,
  external: [],
  quizHighlight: null,
  isolated: null,
  isoOpts: { synergists: true, antagonists: true, supply: false, context: false },
  demo: null,

  t: (k) => UI[get().settings.uiLang][k] ?? k,
  label: (names) => {
    const l: LabelLang = get().settings.labelLang;
    return names[l] || names.la;
  },

  init: async () => {
    const s = get().settings;
    applyTheme(s.theme);
    setHapticsEnabled(s.haptics);
    const remote = await fetchSettings(get().deviceId);
    if (remote) {
      const merged = { ...s, ...remote };
      set({ settings: merged });
      applyTheme(merged.theme);
      setHapticsEnabled(merged.haptics);
      try {
        localStorage.setItem('vetatlas.settings', JSON.stringify(merged));
      } catch {
        /* ignore */
      }
    }
  },

  goHome: () => {
    set({ view: 'home', region: null, selected: null, hovered: null, motionOn: false, isolated: null, demo: null, panel: 'none', spinning: null, loading: { active: false, label: '', progress: 0 } });
    if (typeof history !== 'undefined') history.pushState({}, '', '/');
  },

  selectSpecies: async (id) => {
    if (get().spinning) return;
    spinStart = performance.now();
    set({ spinning: id, loading: { active: true, label: get().t('loadingData'), progress: 0 } });
    await get().openAtlas(id, null, true);
  },

  openAtlas: async (id, region = null, viaSpin = false) => {
    let payload = get().payloads[id];
    if (!payload) {
      payload = await fetchSpecies(id);
      set((s) => ({ payloads: { ...s.payloads, [id]: payload! } }));
    }
    if (!models.full.has(id)) {
      set({ loading: { active: true, label: get().t('loading'), progress: 0 } });
      const t0 = performance.now();
      const build = (p: SpeciesPayload) =>
        buildAnimal(p, {
          chunk: 24,
          onProgress: (done, total) => set({ loading: { active: true, label: get().t('loading'), progress: done / total } }),
        });
      let model = await build(payload);
      console.info(`[vetatlas] built ${id}: ${model.instances.length} structures in ${Math.round(performance.now() - t0)} ms`);
      // scanned / modelled meshes dropped into client/public/models/<species>/ take the place of the procedural ones
      const manifest = await loadManifest(id);
      if (manifest && manifest.models.length) {
        set({ loading: { active: true, label: get().t('loadingModels'), progress: 1 } });
        await applyExternalModels(model, id, manifest);
        // an imported skeleton moves the rig's joints: rebuild the soft tissue around the real bones
        const wantsFit = manifest.models.some((e) => (e.group ?? 'bones') === 'bones' && e.fitRig !== false);
        const fit = wantsFit ? fitRigToSkeleton(model) : null;
        if (fit) {
          console.info(`[vetatlas] rig fitted to the imported skeleton: ${fit.report.changed.join(', ')}${fit.report.rejected.length ? ` (rejected: ${fit.report.rejected.join(', ')})` : ''}`);
          payload = { ...payload, rig: fit.rig };
          set((s) => ({ payloads: { ...s.payloads, [id]: payload! } }));
          model.dispose();
          model = await build(payload);
          await applyExternalModels(model, id, manifest);
        }
      }
      models.full.set(id, model);
    }
    // keep the spin visible for at least its duration
    if (viaSpin) {
      const wait = Math.max(0, SPIN_MS - (performance.now() - spinStart));
      await new Promise((r) => setTimeout(r, wait));
    }
    set({
      view: 'atlas',
      speciesId: id,
      payload,
      region,
      selected: null,
      hovered: null,
      depth: 0,
      layerMode: autoMode(),
      systems: noSystems(),
      ghostSkin: false,
      motionOn: false,
      isolated: null,
      demo: null,
      spinning: null,
      loading: { active: false, label: '', progress: 1 },
      panel: 'none',
      modelVersion: get().modelVersion + 1,
      external: (models.full.get(id)?.external ?? []).map((r) => r.entry),
      notes: [],
      known: new Set(),
    });
    if (typeof history !== 'undefined') history.pushState({ species: id, region }, '', `/atlas/${id}${region ? `?region=${region}` : ''}`);
    void get().reloadNotes();
    const known = await fetchProgress(get().deviceId, id);
    set({ known: new Set(known) });
    if (region) get().camera({ type: 'focusRegion', region });
  },

  setRegion: (r) => {
    const prev = get().region;
    set({ region: r, motionOn: r && get().motionOn && r === prev ? get().motionOn : false });
    if (r) get().camera({ type: 'focusRegion', region: r });
    else get().camera({ type: 'overview' });
    const id = get().speciesId;
    if (typeof history !== 'undefined' && id) history.replaceState({ species: id, region: r }, '', `/atlas/${id}${r ? `?region=${r}` : ''}`);
  },
  select: (key) => set({ selected: key, panel: key ? 'detail' : get().panel === 'detail' ? 'none' : get().panel }),
  setHovered: (key) => {
    if (get().hovered !== key) set({ hovered: key });
  },
  setDepth: (d) => set({ depth: Math.min(1, Math.max(0, d)) }),
  setLayerMode: (l, m) => set((s) => ({ layerMode: { ...s.layerMode, [l]: m } })),
  toggleLayer: (l) => {
    const s = get();
    const visibleNow = layerVisible(l, s.depth, s.layerMode[l]);
    set({ layerMode: { ...s.layerMode, [l]: visibleNow ? 'off' : 'on' } });
  },
  resetLayers: () => set({ layerMode: autoMode() }),
  toggleSystem: (sys) => {
    const s = get();
    const on = !s.systems[sys];
    const systems = { ...s.systems, [sys]: on };
    const anyOn = SYSTEM_IDS.some((k) => systems[k]);
    const skinVisible = layerVisible('skin', s.depth, s.layerMode.skin);
    set({ systems, ghostSkin: anyOn && skinVisible ? true : anyOn ? s.ghostSkin : false });
  },
  setGhostSkin: (v) => set({ ghostSkin: v }),
  setLabelsOn: (v) => set({ labelsOn: v }),
  setPhysioPlaying: (v) => set({ physioPlaying: v }),
  setMotionOn: (v) => set({ motionOn: v }),
  setMotionInfo: (phase, stance) => {
    const s = get();
    if (s.motionStance !== stance || Math.abs(s.motionPhase - phase) > 0.02) set({ motionPhase: phase, motionStance: stance });
  },
  updateSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    applyTheme(settings.theme);
    setHapticsEnabled(settings.haptics);
    try {
      localStorage.setItem('vetatlas.settings', JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    void saveSettings(get().deviceId, settings);
  },
  setPanel: (p) => set({ panel: p }),
  setLeftOpen: (v) => set({ leftOpen: v }),
  setWelcomeOpen: (v) => {
    set({ welcomeOpen: v });
    if (!v) {
      try {
        localStorage.setItem('vetatlas.welcomeSeen', '1');
      } catch {
        /* ignore */
      }
    }
  },
  showToast: (msg) => {
    set({ toast: msg });
    if (msg) setTimeout(() => get().toast === msg && set({ toast: null }), 2600);
  },
  camera: (cmd) => set({ cameraCmd: { id: ++cmdId, cmd } }),
  setOnline: (v) => set({ online: v }),
  setNotes: (n) => set({ notes: n }),
  setKnown: (structureId, known) => {
    const next = new Set(get().known);
    if (known) next.add(structureId);
    else next.delete(structureId);
    set({ known: next });
    const id = get().speciesId;
    if (id) void apiSetProgress(get().deviceId, id, structureId, known);
  },
  setQuizHighlight: (key) => set({ quizHighlight: key }),
  isolate: (key) => {
    const prev = get().isolated;
    if (key) {
      set({ isolated: key, selected: key, panel: 'detail' });
      // the camera is fitted by the stage once the members of the isolation are known
    } else {
      set({ isolated: null, demo: get().demo && get().demo === prev ? null : get().demo });
      const r = get().region;
      if (prev) get().camera(r ? { type: 'focusRegion', region: r } : { type: 'overview' });
    }
  },
  setIsoOpt: (k, v) => set((s) => ({ isoOpts: { ...s.isoOpts, [k]: v } })),
  setDemo: (key) => set({ demo: key, motionOn: key ? false : get().motionOn }),
  reloadNotes: async () => {
    const id = get().speciesId;
    if (!id) return;
    const notes = await listNotes(get().deviceId, id);
    set({ notes });
  },
}));

/** Dissolve amount (0 = fully visible, 1 = gone) for a layer at a given peel depth. */
export function layerDissolve(layer: LayerId, depth: number, mode: LayerMode): number {
  if (mode === 'on') return 0;
  if (mode === 'off') return 1;
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (depth - a) / (b - a)));
  switch (layer) {
    case 'skin':
      return ramp(0.0, 0.34);
    case 'muscles':
      return ramp(0.36, 0.68);
    case 'tendons':
      return ramp(0.72, 0.95);
    case 'cartilage':
    case 'bones':
      return 0;
  }
}
export function layerVisible(layer: LayerId, depth: number, mode: LayerMode) {
  return layerDissolve(layer, depth, mode) < 1;
}
export { LAYER_IDS, SYSTEM_IDS };
