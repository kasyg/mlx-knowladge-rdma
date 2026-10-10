import { useEffect } from 'react';
import { useAtlas } from '../state/store.ts';
import { Scene } from '../three/Scene.tsx';
import { Overlay } from './Overlay.tsx';
import { TopBar } from './TopBar.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import { DepthRail } from './DepthRail.tsx';
import { ViewToolbar } from './ViewToolbar.tsx';
import { DetailPanel } from './DetailPanel.tsx';
import { SettingsDialog, HelpDialog, Welcome } from './Dialogs.tsx';
import { HomeUI } from './HomeUI.tsx';
import { MobileTabs, Sheet, Toast, LoadingBar, OfflineBanner } from './Chrome.tsx';
import { useCompact } from './hooks.ts';
import { onOnlineChange } from '../api/client.ts';
import { LAYER_IDS, SYSTEM_IDS } from '@shared/types';

export function App() {
  const view = useAtlas((s) => s.view);
  const compact = useCompact();
  const panel = useAtlas((s) => s.panel);

  useEffect(() => {
    void useAtlas.getState().init();
    const off = onOnlineChange((v) => useAtlas.getState().setOnline(v));
    return () => {
      off();
    };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAtlas.getState();
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        if (s.welcomeOpen) s.setWelcomeOpen(false);
        else if (s.panel !== 'none' && s.panel !== 'detail') s.setPanel('none');
        else if (s.selected) s.select(null);
        else if (s.region) s.setRegion(null);
        return;
      }
      if (s.view !== 'atlas') return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) s.toggleLayer(LAYER_IDS[n - 1]);
      const sysKeys = ['q', 'w', 'e', 'r', 't'];
      const si = sysKeys.indexOf(e.key.toLowerCase());
      if (si >= 0) s.toggleSystem(SYSTEM_IDS[si]);
      if (e.key === 'ArrowUp') s.setDepth(s.depth - 0.08);
      if (e.key === 'ArrowDown') s.setDepth(s.depth + 0.08);
      if (e.key === ' ') {
        e.preventDefault();
        s.setPhysioPlaying(!s.physioPlaying);
      }
      if (e.key.toLowerCase() === 'l') s.setLabelsOn(!s.labelsOn);
      if (e.key.toLowerCase() === 'h') s.camera({ type: 'overview' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app view-${view}${compact ? ' compact' : ''}`}>
      <Scene />
      <Overlay />
      <TopBar />
      {view === 'home' && <HomeUI />}
      {view === 'atlas' && !compact && (
        <>
          <LeftPanel />
          <DetailPanel />
          <ViewToolbar />
        </>
      )}
      {view === 'atlas' && compact && (
        <>
          <ViewToolbar />
          <MobileTabs />
          {panel !== 'none' && panel !== 'settings' && panel !== 'help' && (
            <Sheet>
              {panel === 'detail' ? <DetailPanel /> : panel === 'search' ? null : <LeftPanel section={panel} />}
            </Sheet>
          )}
        </>
      )}
      {view === 'atlas' && <DepthRail />}
      <SettingsDialog />
      <HelpDialog />
      <Welcome />
      <Toast />
      <LoadingBar />
      <OfflineBanner />
    </div>
  );
}
