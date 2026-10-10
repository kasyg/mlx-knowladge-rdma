import { useAtlas, type IsoOpts } from '../state/store.ts';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import { haptic } from '../utils/haptics.ts';

/** Floating bar of the isolation view: what is isolated, what else to show, exit. */
export function IsolationBar() {
  const isolated = useAtlas((s) => s.isolated);
  const isoOpts = useAtlas((s) => s.isoOpts);
  const setIsoOpt = useAtlas((s) => s.setIsoOpt);
  const isolate = useAtlas((s) => s.isolate);
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  if (!isolated) return null;
  const inst = atlasRuntime.model?.byKey.get(isolated);
  if (!inst) return null;
  const isMuscle = inst.def.kind === 'muscle';
  const toggle = (k: keyof IsoOpts, text: string) => (
    <button
      className={`chip${isoOpts[k] ? ' on' : ''}`}
      aria-pressed={isoOpts[k]}
      onClick={() => {
        haptic('toggle');
        if (k === 'synergists') {
          setIsoOpt('synergists', !isoOpts.synergists);
          setIsoOpt('antagonists', !isoOpts.synergists);
        } else setIsoOpt(k, !isoOpts[k]);
      }}
    >
      {text}
    </button>
  );
  return (
    <div className="isolation-bar" role="toolbar" aria-label={t('isolation')}>
      <span className="iso-title">
        <span className="iso-kicker">{t('isolation')}</span>
        <strong>{label(inst.def.names)}</strong>
      </span>
      <span className="iso-chips">
        {toggle('synergists', isMuscle ? t('isoSynergists') : t('role_originHere'))}
        {isMuscle && toggle('supply', t('isoSupply'))}
        {toggle('context', t('isoContext'))}
      </span>
      <button className="icon-btn" aria-label={t('exitIsolation')} title={t('exitIsolation')} onClick={() => { haptic('toggle'); isolate(null); }}>
        ×
      </button>
    </div>
  );
}
