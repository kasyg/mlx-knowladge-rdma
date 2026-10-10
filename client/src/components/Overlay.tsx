import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RegionId } from '@shared/types';
import { useAtlas, models } from '../state/store.ts';
import { cameraRuntime, regionAnchor } from '../three/CameraRig.tsx';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import { homeState } from '../three/HomeStage.tsx';
import { haptic } from '../utils/haptics.ts';
import { useCompact } from './hooks.ts';

interface Item {
  key: string;
  text: string;
  sub?: string;
  kind: 'label' | 'hotspot' | 'species';
  anchor: THREE.Vector3;
  priority: number;
  side: 'L' | 'R' | null;
  region?: RegionId;
  active?: boolean;
}

const tmp = new THREE.Vector3();

/**
 * DOM overlay for structure labels (two-column atlas layout with leader lines),
 * region hotspots and species names. Positions are updated every frame
 * imperatively; React only re-renders when the set of items changes.
 */
export function Overlay() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const keysRef = useRef('');
  const nodes = useRef(new Map<string, HTMLElement>());
  const lines = useRef(new Map<string, SVGLineElement>());
  const dots = useRef(new Map<string, SVGCircleElement>());
  const compact = useCompact();
  const setRegion = useAtlas((s) => s.setRegion);
  const select = useAtlas((s) => s.select);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelSize = useAtlas((s) => s.settings.labelSize);
  const bindNode = (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };
  const bindLine = (key: string) => (el: SVGLineElement | null) => {
    if (el) lines.current.set(key, el);
    else lines.current.delete(key);
  };
  const bindDot = (key: string) => (el: SVGCircleElement | null) => {
    if (el) dots.current.set(key, el);
    else dots.current.delete(key);
  };

  useEffect(() => {
    const collect = (): Item[] => {
      const s = useAtlas.getState();
      const out: Item[] = [];
      if (s.view === 'home') {
        for (const slot of homeState.slots) {
          const m = models.skin.get(slot.id);
          const payload = s.payloads[slot.id];
          if (!m || !m.root.parent || !payload) continue;
          const w = m.rig.landmarks.withers;
          out.push({ key: `species:${slot.id}`, text: payload.meta.names[s.settings.uiLang], sub: payload.meta.names.la, kind: 'species', anchor: new THREE.Vector3(w[0] + slot.position.x, w[1] + 0.12 * m.rig.H + slot.position.y, w[2] + slot.position.z), priority: 1, side: null, active: s.hovered === `species:${slot.id}` });
        }
        return out;
      }
      const m = atlasRuntime.model;
      if (!m) return out;
      const cam = cameraRuntime.camera;
      const fc = cameraRuntime.focusCenter;
      const camZ = cam ? cam.position.z - fc.z : 1;
      const camX = cam ? cam.position.x - fc.x : 0;
      const sideView = Math.abs(camX) < Math.abs(camZ) * 1.3;
      const farSide: 'L' | 'R' | null = sideView ? (camZ >= 0 ? 'R' : 'L') : null;
      const lang = s.settings.uiLang;
      for (const r of m.payload.regions) {
        const ids: RegionId[] = r.sided ? ([`${r.id}_left`, `${r.id}_right`] as RegionId[]) : [r.id as RegionId];
        for (const id of ids) {
          const a = regionAnchor(m, id);
          if (!a) continue;
          const side = id.endsWith('_left') ? 'L' : id.endsWith('_right') ? 'R' : null;
          const name = r.names[lang] + (side ? (lang === 'cs' ? (side === 'L' ? ' (L)' : ' (P)') : side === 'L' ? ' (L)' : ' (R)') : '');
          out.push({ key: `region:${id}`, text: name, kind: 'hotspot', anchor: a, priority: farSide && side === farSide ? -1 : 0, side, region: id, active: s.region === id });
        }
      }
      if (!s.labelsOn || s.quizHighlight) return out;
      const max = s.settings.showAllLabels ? 48 : compact ? 8 : 15;
      const cands: { inst: (typeof m.instances)[number]; dist: number }[] = [];
      for (const inst of m.instances) {
        const forced = inst.key === s.selected || inst.key === s.hovered;
        if (!forced) {
          if (!s.region) continue;
          if (!inst.node.visible) continue;
          if (!inst.regions.includes(s.region)) continue;
          if (inst.def.id === 'cutis') continue;
          const cur = atlasRuntime.cur.get(inst.key);
          if (cur && cur.dissolve > 0.5) continue;
          if (farSide && inst.side === farSide) continue;
        }
        const dist = cam ? inst.anchor.distanceTo(cam.position) : 0;
        cands.push({ inst, dist });
      }
      cands.sort((a, b) => {
        const fa = a.inst.key === s.selected || a.inst.key === s.hovered ? 1 : 0;
        const fb = b.inst.key === s.selected || b.inst.key === s.hovered ? 1 : 0;
        if (fa !== fb) return fb - fa;
        const pa = a.inst.def.priority ?? 1, pb = b.inst.def.priority ?? 1;
        if (pa !== pb) return pb - pa;
        return a.dist - b.dist;
      });
      for (const c of cands.slice(0, max)) {
        const names = c.inst.def.names;
        const text = s.label(names);
        const sub = s.settings.labelLang === 'la' ? names[lang] : names.la;
        out.push({ key: c.inst.key, text, sub, kind: 'label', anchor: c.inst.anchor, priority: c.inst.def.priority ?? 1, side: c.inst.side, active: c.inst.key === s.selected || c.inst.key === s.hovered });
      }
      return out;
    };

    let frame = 0;
    cameraRuntime.tick = () => {
      frame++;
      if (frame % 3 === 0) {
        const next = collect();
        const keys = next.map((i) => `${i.key}:${i.text}:${i.active ? 1 : 0}`).join('|');
        if (keys !== keysRef.current) {
          keysRef.current = keys;
          itemsRef.current = next;
          setItems(next);
        } else {
          // keep anchors fresh (motion) without re-render
          for (let i = 0; i < next.length; i++) itemsRef.current[i].anchor = next[i].anchor;
        }
      }
      layout();
    };
    return () => {
      cameraRuntime.tick = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  const layout = () => {
    const cam = cameraRuntime.camera;
    const { width, height } = cameraRuntime.size;
    if (!cam) return;
    const list = itemsRef.current;
    const placed: { item: Item; sx: number; sy: number; vis: boolean; lx: number; ly: number }[] = [];
    for (const it of list) {
      tmp.copy(it.anchor).project(cam);
      const vis = tmp.z < 1 && tmp.z > -1;
      const sx = (tmp.x * 0.5 + 0.5) * width;
      const sy = (-tmp.y * 0.5 + 0.5) * height;
      placed.push({ item: it, sx, sy, vis, lx: sx, ly: sy });
    }
    // column layout for labels: left column sits right of the left panel, right column left of the rail / detail panel
    const labels = placed.filter((p) => p.item.kind === 'label' && p.vis);
    const leftPanel = document.querySelector('.left-panel:not(.collapsed)') as HTMLElement | null;
    const detail = document.querySelector('.detail-panel:not(.empty)') as HTMLElement | null;
    const colL = compact ? 8 : (leftPanel ? leftPanel.getBoundingClientRect().right : 0) + 16;
    const colR = compact ? width - 44 : (detail ? detail.getBoundingClientRect().left : width - 132) - 16;
    tmp.copy(cameraRuntime.focusCenter).project(cam);
    const centerX = (tmp.x * 0.5 + 0.5) * width;
    const sides = { L: labels.filter((p) => p.sx < centerX), R: labels.filter((p) => p.sx >= centerX) };
    const top = compact ? 70 : 76;
    const bottom = height - (compact ? 160 : 90);
    for (const key of ['L', 'R'] as const) {
      const col = sides[key].sort((a, b) => a.sy - b.sy);
      let y = top;
      const hs = col.map((p) => (nodes.current.get(p.item.key)?.offsetHeight || 30) + 6);
      col.forEach((p, i) => {
        const h = hs[i];
        p.ly = Math.max(y + h / 2, p.sy);
        y = p.ly + h / 2;
      });
      const overflow = y - bottom;
      if (overflow > 0 && col.length) {
        // shift the whole column up (keeping spacing) as far as the top allows
        const room = col[0].ly - hs[0] / 2 - top;
        const shift = Math.min(overflow, Math.max(0, room));
        for (const p of col) p.ly -= shift;
      }
      for (const p of col) p.lx = key === 'L' ? colL : colR;
    }
    for (const p of placed) {
      const el = nodes.current.get(p.item.key);
      if (!el) continue;
      if (!p.vis) {
        el.style.display = 'none';
        const ln = lines.current.get(p.item.key);
        if (ln) ln.style.display = 'none';
        const dt = dots.current.get(p.item.key);
        if (dt) dt.style.display = 'none';
        continue;
      }
      el.style.display = '';
      if (p.item.kind === 'label') {
        const isLeft = p.lx <= centerX;
        const w = el.offsetWidth || 120;
        // left column: label starts at the column and extends right; right column: label ends at the column
        el.style.transform = `translate(${isLeft ? p.lx : p.lx - w}px, ${p.ly}px) translate(0, -50%)`;
        const ln = lines.current.get(p.item.key);
        if (ln) {
          ln.style.display = '';
          ln.setAttribute('x1', String(isLeft ? p.lx + w + 3 : p.lx - w - 3));
          ln.setAttribute('y1', String(p.ly));
          ln.setAttribute('x2', String(p.sx));
          ln.setAttribute('y2', String(p.sy));
        }
        const dt = dots.current.get(p.item.key);
        if (dt) {
          dt.style.display = '';
          dt.setAttribute('cx', String(p.sx));
          dt.setAttribute('cy', String(p.sy));
        }
      } else {
        el.style.transform = `translate(${p.sx}px, ${p.sy}px)`;
      }
    }
  };

  return (
    <div className="overlay" aria-hidden={false}>
      <svg ref={svgRef} className="overlay-svg">
        {items
          .filter((i) => i.kind === 'label')
          .map((i) => (
            <g key={i.key}>
              <line ref={bindLine(i.key)} className={`leader${i.active ? ' active' : ''}`} />
              <circle ref={bindDot(i.key)} r={i.active ? 3.5 : 2.5} className={`anchor-dot${i.active ? ' active' : ''}`} />
            </g>
          ))}
      </svg>
      {items.map((i) => {
        if (i.kind === 'label') {
          return (
            <button
              key={i.key}
              ref={bindNode(i.key)}
              className={`lbl size-${labelSize}${i.active ? ' active' : ''}`}
              onClick={() => {
                haptic('select');
                select(i.key);
              }}
            >
              <span className="lbl-main">{i.text}</span>
              {i.sub && i.sub !== i.text && <span className="lbl-sub">{i.sub}</span>}
            </button>
          );
        }
        if (i.kind === 'hotspot') {
          return (
            <button
              key={i.key}
              ref={bindNode(i.key)}
              className={`hotspot${i.active ? ' active' : ''}${compact ? ' compact' : ''}${i.priority < 0 ? ' far' : ''}`}
              data-region={i.region}
              onClick={(e) => {
                e.stopPropagation();
                haptic('select');
                setRegion(i.region!);
              }}
              title={i.text}
            >
              <span className="hotspot-dot" />
              <span className="hotspot-name">{i.text}</span>
            </button>
          );
        }
        return (
          <div key={i.key} ref={bindNode(i.key)} className={`species-tag${i.active ? ' active' : ''}`}>
            <span className="species-tag-name">{i.text}</span>
            <span className="species-tag-la">{i.sub}</span>
          </div>
        );
      })}
    </div>
  );
}
