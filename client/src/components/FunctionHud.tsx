/**
 * Live readout of a muscle at work: its contraction state, the stage of the
 * demonstration, the joint angles, and four stat tiles (fibre length,
 * activation, force, tendon strain) each with its own sparkline of the last
 * seconds – four scales, so four small charts, never a shared axis.
 */
import { useEffect, useRef, useState } from 'react';
import { useAtlas } from '../state/store.ts';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import type { MuscleRt, History } from '../three/muscles.ts';
import { jointName } from '../three/muscles.ts';
import type { DemoStage } from '../three/motion.ts';
import type { ContractionState } from '../three/biomech.ts';
import { haptic } from '../utils/haptics.ts';

const WINDOW_S = 6;

/** re-render at a modest rate while mounted (the 3D loop runs at 60 Hz, text does not need to) */
function useTicker(hz: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => (n + 1) % 1e6), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
}

interface Measure {
  id: 'fibre' | 'activation' | 'force' | 'tendon';
  key: keyof Pick<History, 'l' | 'a' | 'F' | 'eps'>;
  domain: [number, number];
  baseline: number;
  fmt: (v: number) => string;
}

const MEASURES: Measure[] = [
  { id: 'fibre', key: 'l', domain: [0.6, 1.4], baseline: 1, fmt: (v) => `${Math.round(v * 100)} %` },
  { id: 'activation', key: 'a', domain: [0, 1], baseline: 0, fmt: (v) => `${Math.round(v * 100)} %` },
  { id: 'force', key: 'F', domain: [0, 1.5], baseline: 0, fmt: (v) => `${Math.round(v * 100)} %` },
  { id: 'tendon', key: 'eps', domain: [0, 0.08], baseline: 0, fmt: (v) => `${(v * 100).toFixed(1)} %` },
];

/** samples of the last WINDOW_S seconds, oldest first */
function samples(h: History, field: Measure['key']): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  const N = h.t.length;
  for (let k = h.n - 1; k >= 0; k--) {
    const i = (h.i - 1 - k + N * 2) % N;
    out.push({ t: h.t[i], v: h[field][i] });
  }
  if (!out.length) return out;
  const tEnd = out[out.length - 1].t;
  return out.filter((p) => p.t >= tEnd - WINDOW_S);
}

const STATE_ICON: Record<ContractionState, string> = { concentric: '↘', eccentric: '↗', isometric: '■', stretched: '⇔', relaxed: '·' };

function Sparkline({ m, pts, hoverT, onHover }: { m: Measure; pts: { t: number; v: number }[]; hoverT: number | null; onHover: (t: number | null) => void }) {
  const W = 148, H = 36, pad = 5;
  if (pts.length < 2) return <svg className="spark" width={W} height={H} aria-hidden="true" />;
  const t1 = pts[pts.length - 1].t, t0 = t1 - WINDOW_S;
  const x = (t: number) => pad + ((t - t0) / WINDOW_S) * (W - 2 * pad);
  const y = (v: number) => {
    const [a, b] = m.domain;
    const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return H - pad - k * (H - 2 * pad);
  };
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  let hover: { t: number; v: number } | null = null;
  if (hoverT !== null) {
    let best = Infinity;
    for (const p of pts) {
      const dd = Math.abs(p.t - hoverT);
      if (dd < best) {
        best = dd;
        hover = p;
      }
    }
  }
  return (
    <svg
      className="spark"
      width={W}
      height={H}
      onPointerMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (e.clientX - r.left - pad) / (r.width - 2 * pad)));
        onHover(t0 + f * WINDOW_S);
      }}
      onPointerLeave={() => onHover(null)}
      aria-hidden="true"
    >
      <line className="spark-base" x1={pad} x2={W - pad} y1={y(m.baseline)} y2={y(m.baseline)} />
      <path className="spark-line" d={d} />
      {hover && <line className="spark-cross" x1={x(hover.t)} x2={x(hover.t)} y1={2} y2={H - 2} />}
      {hover && <circle className="spark-dot" cx={x(hover.t)} cy={y(hover.v)} r={4} />}
      {!hover && <circle className="spark-dot" cx={x(last.t)} cy={y(last.v)} r={4} />}
    </svg>
  );
}

/** the muscle the readout follows: the demonstrated one, else an isolated or selected muscle that is moving */
export function hudTarget(): MuscleRt | null {
  const s = useAtlas.getState();
  const sys = atlasRuntime.model?.muscles;
  if (!sys) return null;
  if (s.demo) return sys.muscles.get(s.demo) ?? null;
  for (const k of [s.isolated, s.selected]) {
    const rt = k ? sys.muscles.get(k) : null;
    if (rt && rt.live) return rt;
  }
  return null;
}

export function FunctionHud() {
  useTicker(12);
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  const lang = useAtlas((s) => s.settings.uiLang);
  const demo = useAtlas((s) => s.demo);
  const setDemo = useAtlas((s) => s.setDemo);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const lastKey = useRef<string | null>(null);
  const rt = hudTarget();
  if (!rt) {
    lastKey.current = null;
    return null;
  }
  if (lastKey.current !== rt.key) lastKey.current = rt.key;
  const st = rt.st;
  const series = MEASURES.map((m) => ({ m, pts: samples(rt.hist, m.key) }));
  const valueAt = (pts: { t: number; v: number }[], fallback: number) => {
    if (hoverT === null || !pts.length) return fallback;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT)) best = p;
    return best.v;
  };
  const current: Record<Measure['id'], number> = { fibre: st.l, activation: st.a, force: st.F, tendon: st.eps };
  const tEnd = series[0].pts.length ? series[0].pts[series[0].pts.length - 1].t : 0;
  const isDemo = demo === rt.key;
  const stage = atlasRuntime.demo.stage as DemoStage;
  const angles = atlasRuntime.angles ?? {};
  const jointsShown = rt.roles
    .map((r) => jointName(r.joint))
    .filter((j, i, a) => a.indexOf(j) === i)
    .map((j) => {
      const deg = angles[j] ?? 0;
      const jn = rt.inst.def.motion?.find((r) => jointName(r.joint) === j);
      const names: Record<string, [string, string]> = {
        shoulder: ['rameno', 'shoulder'],
        elbow: ['loket', 'elbow'],
        carpus: ['zápěstí', 'carpus'],
        fetlock: ['spěnka', 'fetlock'],
        pastern: ['korunka', 'pastern'],
        hip: ['kyčel', 'hip'],
        stifle: ['koleno', 'stifle'],
        hock: ['hlezno', 'hock'],
      };
      const n = names[j]?.[lang === 'cs' ? 0 : 1] ?? j;
      return { j, text: `${n}: ${deg >= 0 ? t('joint_flexion') : t('joint_extension')} ${Math.abs(Math.round(deg))}°`, role: jn };
    });
  // table view: one row every half second of the last three seconds
  const rows: { dt: number; vals: number[] }[] = [];
  if (table && series[0].pts.length) {
    for (let k = 0; k <= 6; k++) {
      const target = tEnd - k * 0.5;
      rows.push({ dt: -k * 0.5, vals: series.map(({ pts }) => pts.reduce((b, p) => (Math.abs(p.t - target) < Math.abs(b.t - target) ? p : b), pts[0]).v) });
    }
  }
  return (
    <section className="function-hud" aria-label={t('hud_cycle')}>
      <header className="fh-head">
        <div>
          <h3 className="fh-title">{label(rt.inst.def.names)}</h3>
          <p className="fh-sub">{isDemo ? t('showFunction') : t('gaitReadout')}</p>
        </div>
        {isDemo && (
          <button className="btn small ghost" onClick={() => { haptic('toggle'); setDemo(null); }}>
            {t('stopFunction')}
          </button>
        )}
      </header>
      <p className={`fh-state state-${st.state}`}>
        <span className="fh-icon" aria-hidden="true">{STATE_ICON[st.state]}</span> {t(`state_${st.state}` as never)}
      </p>
      {isDemo && atlasRuntime.demo.plan && (
        <ol className="fh-stages">
          {(['contract', 'hold', 'return', 'rest'] as DemoStage[]).map((sg) => (
            <li key={sg} className={sg === stage ? 'on' : ''}>{t(`stage_${sg}` as never)}</li>
          ))}
        </ol>
      )}
      {jointsShown.length > 0 && <p className="fh-joints">{jointsShown.map((x) => x.text).join(' · ')}</p>}
      {isDemo && <p className="fh-hint">{atlasRuntime.demo.pulse ? t('pulseHint') : t('functionHint')}</p>}
      <div className="fh-tiles">
        {series.map(({ m, pts }) => {
          const v = valueAt(pts, current[m.id]);
          return (
            <div key={m.id} className="fh-tile" aria-label={`${t(`hud_${m.id}` as never)} ${m.fmt(current[m.id])}`}>
              <span className="fh-label">{t(`hud_${m.id}` as never)}</span>
              <span className="fh-value">
                {m.fmt(v)}
                <small>{m.id === 'fibre' ? ` ${t('ofRest')}` : m.id === 'force' ? ` ${t('ofMax')}` : ''}{hoverT !== null ? ` · ${(Math.min(0, hoverT - tEnd)).toFixed(1)} s` : ''}</small>
              </span>
              <Sparkline m={m} pts={pts} hoverT={hoverT} onHover={setHoverT} />
            </div>
          );
        })}
      </div>
      <button className="link fh-table-toggle" onClick={() => setTable(!table)} aria-expanded={table}>
        {table ? '−' : '+'} {lang === 'cs' ? 'Tabulka hodnot' : 'Table of values'}
      </button>
      {table && (
        <table className="fh-table">
          <thead>
            <tr>
              <th>s</th>
              {MEASURES.map((m) => <th key={m.id}>{t(`hud_${m.id}` as never)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dt}>
                <td>{r.dt.toFixed(1)}</td>
                {r.vals.map((v, i) => <td key={i}>{MEASURES[i].fmt(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
