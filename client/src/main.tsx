import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import { useAtlas, models } from './state/store.ts';
import { SPECIES_IDS, type RegionId, type SpeciesId } from '@shared/types';
import './styles/global.css';

function routeFromLocation() {
  const m = /^\/atlas\/([a-z]+)/.exec(location.pathname);
  if (m && SPECIES_IDS.includes(m[1] as SpeciesId)) {
    const region = new URLSearchParams(location.search).get('region') as RegionId | null;
    return { species: m[1] as SpeciesId, region };
  }
  return null;
}

const initial = routeFromLocation();
if (initial) void useAtlas.getState().openAtlas(initial.species, initial.region);

window.addEventListener('popstate', () => {
  const r = routeFromLocation();
  const s = useAtlas.getState();
  if (!r) {
    if (s.view !== 'home') useAtlas.setState({ view: 'home', region: null, selected: null, motionOn: false, panel: 'none' });
  } else if (s.speciesId !== r.species || s.view !== 'atlas') void s.openAtlas(r.species, r.region);
  else if (s.region !== r.region) s.setRegion(r.region);
});

// expose a tiny debug/test hook
declare global {
  interface Window {
    __vetatlas?: { store: typeof useAtlas; exportGroup: (group: string) => Promise<string> };
  }
}
window.__vetatlas = {
  store: useAtlas,
  /** export one layer of the current model as a GLB (base64) – for tests, 3D printing or editing in Blender */
  exportGroup: async (group) => {
    const id = useAtlas.getState().speciesId;
    const model = id ? models.full.get(id) : null;
    if (!model) throw new Error('no model loaded');
    const { exportGroupGLB, toBase64 } = await import('./three/exporter.ts');
    return toBase64(await exportGroupGLB(model, group));
  },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
