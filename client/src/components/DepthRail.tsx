import { useRef } from 'react';
import { useAtlas } from '../state/store.ts';
import { haptic } from '../utils/haptics.ts';
import { useCompact } from './hooks.ts';

const STOPS = [
  { d: 0.0, key: 'layer_skin' },
  { d: 0.4, key: 'layer_muscles' },
  { d: 0.72, key: 'layer_tendons' },
  { d: 1.0, key: 'layer_bones' },
] as const;

/** Vertical depth rail: drag (touch/mouse) or tap a stop to peel layers. */
export function DepthRail() {
  const depth = useAtlas((s) => s.depth);
  const setDepth = useAtlas((s) => s.setDepth);
  const t = useAtlas((s) => s.t);
  const track = useRef<HTMLDivElement>(null);
  const compact = useCompact();
  const lastBand = useRef(-1);

  const fromEvent = (clientY: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    setDepth(v);
    const band = v < 0.34 ? 0 : v < 0.68 ? 1 : v < 0.95 ? 2 : 3;
    if (band !== lastBand.current) {
      if (lastBand.current !== -1) haptic('toggle');
      lastBand.current = band;
    }
  };

  return (
    <div className={`depth-rail${compact ? ' compact' : ''}`} aria-label={t('depth')}>
      <div className="rail-title">{t('depth')}</div>
      <div
        ref={track}
        className="rail-track"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          fromEvent(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') fromEvent(e.clientY);
        }}
        onTouchMove={(e) => fromEvent(e.touches[0].clientY)}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(depth * 100)}
      >
        <div className="rail-fill" style={{ height: `${depth * 100}%` }} />
        <div className="rail-knob" style={{ top: `${depth * 100}%` }} />
        {STOPS.map((s) => (
          <button
            key={s.key}
            className={`rail-stop${Math.abs(depth - s.d) < 0.12 ? ' on' : ''}`}
            style={{ top: `${s.d * 100}%` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              haptic('toggle');
              setDepth(s.d);
            }}
          >
            <span className="rail-tick" />
            <span className="rail-label">{t(s.key)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
