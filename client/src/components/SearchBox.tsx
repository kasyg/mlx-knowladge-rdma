import { useEffect, useMemo, useRef, useState } from 'react';
import type { RegionId, StructureDef } from '@shared/types';
import { LAYER_IDS } from '@shared/types';
import { useAtlas, layerVisible } from '../state/store.ts';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import { haptic } from '../utils/haptics.ts';

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  const payload = useAtlas((s) => s.payload);
  const lang = useAtlas((s) => s.settings.uiLang);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!payload || q.trim().length < 2) return [] as StructureDef[];
    const nq = norm(q.trim());
    const scored = payload.structures
      .map((s) => {
        const names = [s.names.la, s.names.cs, s.names.en].map(norm);
        let score = 0;
        for (const n of names) {
          if (n === nq) score = Math.max(score, 100);
          else if (n.startsWith(nq)) score = Math.max(score, 80);
          else if (n.includes(nq)) score = Math.max(score, 50);
        }
        if (!score && norm(s.description[lang]).includes(nq)) score = 10;
        return { s, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (b.s.priority ?? 0) - (a.s.priority ?? 0));
    return scored.slice(0, 12).map((r) => r.s);
  }, [q, payload, lang]);

  useEffect(() => setIdx(0), [results]);

  const choose = (def: StructureDef) => {
    const s = useAtlas.getState();
    const m = atlasRuntime.model;
    if (!m) return;
    const key = def.bilateral ? `${def.id}_L` : def.id;
    const inst = m.byKey.get(key);
    if (!inst) return;
    // make the structure's layer/system visible
    if (LAYER_IDS.includes(def.group as (typeof LAYER_IDS)[number])) {
      const g = def.group as (typeof LAYER_IDS)[number];
      if (!layerVisible(g, s.depth, s.layerMode[g])) s.setLayerMode(g, 'on');
    } else if (!s.systems[def.group as keyof typeof s.systems]) s.toggleSystem(def.group as keyof typeof s.systems);
    const region = inst.regions[0] as RegionId;
    if (region && s.region !== region) s.setRegion(region);
    s.select(key);
    s.camera({ type: 'fitStructure', key });
    haptic('select');
    setQ('');
    setOpen(false);
    onDone?.();
  };

  return (
    <div className="search">
      <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={q}
        placeholder={t('searchPlaceholder')}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setIdx((i) => Math.min(results.length - 1, i + 1));
          if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1));
          if (e.key === 'Enter' && results[idx]) choose(results[idx]);
          if (e.key === 'Escape') {
            setQ('');
            setOpen(false);
            onDone?.();
          }
        }}
        aria-label={t('search')}
      />
      {open && q.trim().length >= 2 && (
        <ul className="search-results" role="listbox">
          {results.length === 0 && <li className="muted">{t('noResults')}</li>}
          {results.map((r, i) => (
            <li key={r.id} className={i === idx ? 'active' : ''} onMouseDown={() => choose(r)} role="option" aria-selected={i === idx}>
              <span className="sr-name">{label(r.names)}</span>
              <span className="sr-sub">
                {r.names.la !== label(r.names) ? r.names.la : r.names[lang]} · {t(`kind_${r.kind}` as never)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
