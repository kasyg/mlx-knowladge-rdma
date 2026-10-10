import { useAtlas, layerDissolve, layerVisible, type Panel } from '../state/store.ts';
import { LAYER_IDS, SYSTEM_IDS, type RegionId, type LayerId, type SystemId } from '@shared/types';
import { haptic } from '../utils/haptics.ts';
import { atlasRuntime, limbOfRegion } from '../three/AtlasStage.tsx';
import { useCompact } from './hooks.ts';
import { Quiz } from './Quiz.tsx';
import { useState } from 'react';

function Switch({ checked, onChange, label, hint, tone }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; tone?: string }) {
  return (
    <label className="row switch-row">
      <span className="row-label">
        {tone && <span className="tone" style={{ background: tone }} />}
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <span className={`switch${checked ? ' on' : ''}`} role="switch" aria-checked={checked}>
        <input type="checkbox" checked={checked} onChange={(e) => { haptic('toggle'); onChange(e.target.checked); }} />
        <span className="knob" />
      </span>
    </label>
  );
}

const LAYER_TONES: Record<LayerId, string> = { skin: '#c9b8a3', muscles: '#a84a4c', tendons: '#efe8da', cartilage: '#a6c6d6', bones: '#e9e2d3' };
const SYSTEM_TONES: Record<SystemId, string> = { vascular: '#c8413c', respiratory: '#9fbfd0', digestive: '#d7a77a', nervous: '#e9d26a', urinary: '#c39ac4' };

export function RegionsSection() {
  const t = useAtlas((s) => s.t);
  const payload = useAtlas((s) => s.payload);
  const region = useAtlas((s) => s.region);
  const setRegion = useAtlas((s) => s.setRegion);
  const lang = useAtlas((s) => s.settings.uiLang);
  if (!payload) return null;
  const chips: { id: RegionId | null; name: string }[] = [{ id: null, name: t('wholeAnimal') }];
  for (const r of payload.regions) {
    if (r.sided) {
      chips.push({ id: `${r.id}_left` as RegionId, name: `${r.names[lang]} ${lang === 'cs' ? '(L)' : '(L)'}` });
      chips.push({ id: `${r.id}_right` as RegionId, name: `${r.names[lang]} ${lang === 'cs' ? '(P)' : '(R)'}` });
    } else chips.push({ id: r.id as RegionId, name: r.names[lang] });
  }
  return (
    <section className="panel-section">
      <h3>{t('regions')}</h3>
      <div className="chips">
        {chips.map((c) => (
          <button key={c.id ?? 'all'} className={`chip${region === c.id ? ' on' : ''}`} onClick={() => { haptic('select'); setRegion(c.id); }}>
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}

export function LayersSection() {
  const t = useAtlas((s) => s.t);
  const depth = useAtlas((s) => s.depth);
  const layerMode = useAtlas((s) => s.layerMode);
  const toggleLayer = useAtlas((s) => s.toggleLayer);
  const resetLayers = useAtlas((s) => s.resetLayers);
  const ghostSkin = useAtlas((s) => s.ghostSkin);
  const setGhostSkin = useAtlas((s) => s.setGhostSkin);
  const systems = useAtlas((s) => s.systems);
  const labelsOn = useAtlas((s) => s.labelsOn);
  const setLabelsOn = useAtlas((s) => s.setLabelsOn);
  const showAll = useAtlas((s) => s.settings.showAllLabels);
  const updateSettings = useAtlas((s) => s.updateSettings);
  const anyManual = LAYER_IDS.some((l) => layerMode[l] !== 'auto');
  const anySystem = SYSTEM_IDS.some((k) => systems[k]);
  return (
    <section className="panel-section">
      <h3>
        {t('layers')}
        {anyManual && (
          <button className="link" onClick={resetLayers}>{t('autoLayers')}</button>
        )}
      </h3>
      {LAYER_IDS.map((l) => {
        const d = layerDissolve(l, depth, layerMode[l]);
        return <Switch key={l} label={t(`layer_${l}` as never)} tone={LAYER_TONES[l]} checked={layerVisible(l, depth, layerMode[l])} onChange={() => toggleLayer(l)} hint={layerMode[l] === 'auto' ? (d > 0 && d < 1 ? `${Math.round((1 - d) * 100)} %` : undefined) : layerMode[l] === 'on' ? '●' : '○'} />;
      })}
      <p className="muted small">{t('depthHint')}</p>
      {anySystem && <Switch label={t('ghostSkin')} checked={ghostSkin} onChange={setGhostSkin} />}
      <Switch label={t('labels')} checked={labelsOn} onChange={setLabelsOn} />
      {labelsOn && <Switch label={t('allLabels')} checked={showAll} onChange={(v) => updateSettings({ showAllLabels: v })} />}
    </section>
  );
}

export function SystemsSection() {
  const t = useAtlas((s) => s.t);
  const systems = useAtlas((s) => s.systems);
  const toggleSystem = useAtlas((s) => s.toggleSystem);
  const playing = useAtlas((s) => s.physioPlaying);
  const setPlaying = useAtlas((s) => s.setPhysioPlaying);
  const speed = useAtlas((s) => s.settings.animationSpeed);
  const updateSettings = useAtlas((s) => s.updateSettings);
  const payload = useAtlas((s) => s.payload);
  const anySystem = SYSTEM_IDS.some((k) => systems[k]);
  return (
    <section className="panel-section">
      <h3>{t('systems')}</h3>
      {SYSTEM_IDS.map((k) => (
        <Switch key={k} label={t(`system_${k}` as never)} tone={SYSTEM_TONES[k]} checked={systems[k]} onChange={() => toggleSystem(k)} />
      ))}
      {anySystem && payload && (
        <div className="physio">
          <div className="row">
            <button className="btn small" onClick={() => { haptic('toggle'); setPlaying(!playing); }}>{playing ? t('pauseAnimations') : t('playAnimations')}</button>
            <select value={speed} onChange={(e) => updateSettings({ animationSpeed: Number(e.target.value) })} aria-label={t('animationSpeed')}>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </div>
          <p className="muted small">
            {systems.vascular && `${t('heartRate')}: ${payload.meta.physiology.heartRate}${t('perMin')} · ${t('bloodFlow')}. `}
            {systems.respiratory && `${t('respRate')}: ${payload.meta.physiology.respRate}${t('perMin')} · ${t('oxygen')}. `}
            {systems.digestive && `${t('digestion')}.`}
          </p>
        </div>
      )}
    </section>
  );
}

export function MotionSection() {
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  const region = useAtlas((s) => s.region);
  const motionOn = useAtlas((s) => s.motionOn);
  const setMotionOn = useAtlas((s) => s.setMotionOn);
  const stance = useAtlas((s) => s.motionStance);
  const phase = useAtlas((s) => s.motionPhase);
  const limb = limbOfRegion(region);
  if (!limb) return null;
  // from the muscle model: the most active muscles and the most strained tendons of the limb right now
  const sys = atlasRuntime.model?.muscles;
  const active = sys
    ? [...sys.muscles.values()].filter((rt) => rt.live && rt.limb === limb && rt.st.a > 0.3).sort((a, b) => b.st.a - a.st.a).map((rt) => label(rt.inst.def.names))
    : [];
  const loaded = sys
    ? [...sys.tendons.values()].filter((tr) => tr.inst.limbs.has(limb) && tr.strain > 0.012).sort((a, b) => b.strain - a.strain).map((tr) => `${label(tr.inst.def.names)} (${(tr.strain * 100).toFixed(1)} %)`)
    : [];
  return (
    <section className="panel-section">
      <h3>{t('motion')}</h3>
      <Switch label={motionOn ? t('motionOff') : t('motionOn')} checked={motionOn} onChange={setMotionOn} />
      <p className="muted small">{t('motionHint')}</p>
      {motionOn && (
        <div className="motion-info">
          <div className="phase-bar"><span style={{ width: `${phase * 100}%` }} /></div>
          <p><strong>{t('phase')}:</strong> {stance ? t('phaseStance') : t('phaseSwing')}</p>
          <p><strong>{t('activeMuscles')}:</strong> {active.slice(0, 8).join(', ') || '–'}</p>
          {loaded.length > 0 && <p><strong>{t('loadedTendons')}:</strong> {loaded.slice(0, 6).join(', ')}</p>}
        </div>
      )}
    </section>
  );
}

export function QuizSection() {
  const t = useAtlas((s) => s.t);
  const [open, setOpen] = useState(false);
  return (
    <section className="panel-section">
      <h3>{t('quiz')}</h3>
      {open ? <Quiz onClose={() => setOpen(false)} /> : <button className="btn small" onClick={() => { haptic('select'); setOpen(true); }}>{t('quizTitle')}</button>}
    </section>
  );
}

export function LeftPanel({ section }: { section?: Panel }) {
  const leftOpen = useAtlas((s) => s.leftOpen);
  const setLeftOpen = useAtlas((s) => s.setLeftOpen);
  const compact = useCompact();
  const region = useAtlas((s) => s.region);
  if (compact) {
    return (
      <div className="sheet-body">
        {section === 'regions' && <RegionsSection />}
        {section === 'layers' && <LayersSection />}
        {section === 'systems' && (
          <>
            <SystemsSection />
            {limbOfRegion(region) && <MotionSection />}
            <QuizSection />
          </>
        )}
      </div>
    );
  }
  return (
    <aside className={`left-panel${leftOpen ? '' : ' collapsed'}`}>
      <button className="panel-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-label="toggle panel">
        {leftOpen ? '‹' : '›'}
      </button>
      {leftOpen && (
        <div className="panel-scroll">
          <RegionsSection />
          <MotionSection />
          <LayersSection />
          <SystemsSection />
          <QuizSection />
        </div>
      )}
    </aside>
  );
}
