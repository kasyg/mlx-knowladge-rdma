import { useAtlas } from '../state/store.ts';
import { haptic } from '../utils/haptics.ts';
import { useCompact } from './hooks.ts';

export function ViewToolbar() {
  const t = useAtlas((s) => s.t);
  const camera = useAtlas((s) => s.camera);
  const labelsOn = useAtlas((s) => s.labelsOn);
  const setLabelsOn = useAtlas((s) => s.setLabelsOn);
  const compact = useCompact();
  const B = ({ title, onClick, children, on }: { title: string; onClick: () => void; children: React.ReactNode; on?: boolean }) => (
    <button className={`tool${on ? ' on' : ''}`} title={title} aria-label={title} onClick={() => { haptic('tap'); onClick(); }}>
      {children}
    </button>
  );
  return (
    <div className={`view-toolbar${compact ? ' compact' : ''}`}>
      <B title={t('resetView')} onClick={() => camera({ type: 'overview' })}>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12a8 8 0 1 0 2.3-5.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </B>
      <span className="tool-sep" />
      <B title={t('viewLeft')} onClick={() => camera({ type: 'view', view: 'left' })}>L</B>
      <B title={t('viewRight')} onClick={() => camera({ type: 'view', view: 'right' })}>R</B>
      <B title={t('viewFront')} onClick={() => camera({ type: 'view', view: 'front' })}>F</B>
      <B title={t('viewBack')} onClick={() => camera({ type: 'view', view: 'back' })}>B</B>
      <B title={t('viewTop')} onClick={() => camera({ type: 'view', view: 'top' })}>T</B>
      <span className="tool-sep" />
      <B title={t('zoomIn')} onClick={() => camera({ type: 'zoom', delta: 0.25 })}>+</B>
      <B title={t('zoomOut')} onClick={() => camera({ type: 'zoom', delta: -0.3 })}>−</B>
      <span className="tool-sep" />
      <B title={t('labels')} on={labelsOn} onClick={() => setLabelsOn(!labelsOn)}>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 7h9M4 12h6M4 17h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="18" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </B>
      {!compact && (
        <B title={t('fullscreen')} onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </B>
      )}
    </div>
  );
}
