import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import { useAtlas } from './state/store.ts';
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
    __vetatlas?: { store: typeof useAtlas };
  }
}
window.__vetatlas = { store: useAtlas };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
