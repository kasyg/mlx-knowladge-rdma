import { useAtlas, type Panel } from '../state/store.ts';
import { haptic } from '../utils/haptics.ts';

export function MobileTabs() {
  const panel = useAtlas((s) => s.panel);
  const setPanel = useAtlas((s) => s.setPanel);
  const t = useAtlas((s) => s.t);
  const selected = useAtlas((s) => s.selected);
  const tabs: { id: Panel; label: string }[] = [
    { id: 'regions', label: t('regions') },
    { id: 'layers', label: t('layers') },
    { id: 'systems', label: t('systems') },
    { id: 'detail', label: t('kind') },
  ];
  return (
    <nav className="mobile-tabs">
      {tabs.map((tab) => (
        <button key={tab.id} className={panel === tab.id ? 'on' : ''} disabled={tab.id === 'detail' && !selected} onClick={() => { haptic('tap'); setPanel(panel === tab.id ? 'none' : tab.id); }}>
          {tab.id === 'detail' ? 'ℹ' : tab.label}
        </button>
      ))}
    </nav>
  );
}

export function Sheet({ children }: { children: React.ReactNode }) {
  const setPanel = useAtlas((s) => s.setPanel);
  return (
    <div className="sheet">
      <button className="sheet-handle" onClick={() => setPanel('none')} aria-label="close" />
      {children}
    </div>
  );
}

export function Toast() {
  const toast = useAtlas((s) => s.toast);
  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}

export function LoadingBar() {
  const loading = useAtlas((s) => s.loading);
  const view = useAtlas((s) => s.view);
  if (!loading.active) return null;
  return (
    <div className={`loading-bar${view === 'home' ? ' home' : ''}`}>
      <div className="loading-label">{loading.label}</div>
      <div className="loading-track"><span style={{ width: `${Math.round(loading.progress * 100)}%` }} /></div>
    </div>
  );
}

export function OfflineBanner() {
  const online = useAtlas((s) => s.online);
  const t = useAtlas((s) => s.t);
  if (online) return null;
  return <div className="offline">{t('offline')}</div>;
}
