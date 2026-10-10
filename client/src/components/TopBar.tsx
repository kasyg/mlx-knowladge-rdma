import { useAtlas } from '../state/store.ts';
import { SPECIES_IDS, type LabelLang, type SpeciesId } from '@shared/types';
import { SPECIES } from '@shared/species';
import { SearchBox } from './SearchBox.tsx';
import { useCompact } from './hooks.ts';
import { haptic } from '../utils/haptics.ts';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import { regionBase } from '../three/CameraRig.tsx';

export function TopBar() {
  const view = useAtlas((s) => s.view);
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  const payload = useAtlas((s) => s.payload);
  const region = useAtlas((s) => s.region);
  const selected = useAtlas((s) => s.selected);
  const settings = useAtlas((s) => s.settings);
  const updateSettings = useAtlas((s) => s.updateSettings);
  const setPanel = useAtlas((s) => s.setPanel);
  const panel = useAtlas((s) => s.panel);
  const goHome = useAtlas((s) => s.goHome);
  const openAtlas = useAtlas((s) => s.openAtlas);
  const setRegion = useAtlas((s) => s.setRegion);
  const compact = useCompact();
  const lang = settings.uiLang;

  const regionName = (() => {
    if (!region || !payload) return null;
    const { base, side } = regionBase(region);
    const def = payload.regions.find((r) => r.id === base);
    if (!def) return region;
    const sideTxt = side ? (lang === 'cs' ? (side === 'L' ? ' – levá' : ' – pravá') : side === 'L' ? ' – left' : ' – right') : '';
    return def.names[lang] + sideTxt;
  })();
  const selectedName = selected ? atlasRuntime.model?.byKey.get(selected)?.def.names : null;

  return (
    <header className="topbar">
      <div className="topbar-left">
        {view === 'atlas' && (
          <button className="icon-btn" onClick={() => { haptic('tap'); goHome(); }} title={t('backToAnimals')} aria-label={t('backToAnimals')}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        {(!compact || view === 'home') && (
          <div className="brand" onClick={goHome} role="button">
            <span className="brand-mark" />
            <span className="brand-name">{t('appName')}</span>
          </div>
        )}
        {view === 'atlas' && payload && (
          <nav className="crumbs" aria-label="breadcrumb">
            <select className="crumb crumb-species" value={payload.meta.id} onChange={(e) => void openAtlas(e.target.value as SpeciesId, null)} aria-label={t('species')}>
              {SPECIES_IDS.map((id) => (
                <option key={id} value={id}>{SPECIES[id].meta.names[lang]}</option>
              ))}
            </select>
            <span className="crumb-sep">›</span>
            <button className={`crumb${region ? '' : ' current'}`} onClick={() => region && setRegion(null)}>
              {regionName ?? t('wholeAnimal')}
            </button>
            {selectedName && !compact && (
              <>
                <span className="crumb-sep">›</span>
                <span className="crumb current">{label(selectedName)}</span>
              </>
            )}
          </nav>
        )}
      </div>
      <div className="topbar-right">
        {view === 'atlas' && !compact && <SearchBox />}
        {view === 'atlas' && compact && (
          <button className={`icon-btn${panel === 'search' ? ' active' : ''}`} onClick={() => setPanel(panel === 'search' ? 'none' : 'search')} title={t('search')} aria-label={t('search')}>
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
        {view === 'atlas' && (
          <div className="seg" role="group" aria-label={t('labelLang')}>
            {(['la', 'cs', 'en'] as LabelLang[]).map((l) => (
              <button key={l} className={settings.labelLang === l ? 'on' : ''} onClick={() => { haptic('toggle'); updateSettings({ labelLang: l }); }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <button className="icon-btn" onClick={() => setPanel(panel === 'help' ? 'none' : 'help')} title={t('help')} aria-label={t('help')}>
          <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="17" r="1" fill="currentColor" /></svg>
        </button>
        <button className="icon-btn" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} title={t('settings')} aria-label={t('settings')}>
          <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {view === 'atlas' && compact && panel === 'search' && (
        <div className="search-sheet">
          <SearchBox autoFocus onDone={() => setPanel('none')} />
        </div>
      )}
    </header>
  );
}
