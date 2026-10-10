import { useEffect, useState } from 'react';
import { useAtlas } from '../state/store.ts';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import { createNote, deleteNote, updateNote } from '../api/client.ts';
import { haptic } from '../utils/haptics.ts';
import { useCompact } from './hooks.ts';
import type { SpeciesId } from '@shared/types';

export function DetailPanel() {
  const selected = useAtlas((s) => s.selected);
  const select = useAtlas((s) => s.select);
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  const lang = useAtlas((s) => s.settings.uiLang);
  const payload = useAtlas((s) => s.payload);
  const external = useAtlas((s) => s.external);
  const camera = useAtlas((s) => s.camera);
  const notes = useAtlas((s) => s.notes);
  const reloadNotes = useAtlas((s) => s.reloadNotes);
  const known = useAtlas((s) => s.known);
  const setKnown = useAtlas((s) => s.setKnown);
  const devId = useAtlas((s) => s.deviceId);
  const online = useAtlas((s) => s.online);
  const showToast = useAtlas((s) => s.showToast);
  const compact = useCompact();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    setDraft('');
    setEditing(null);
  }, [selected]);

  const m = atlasRuntime.model;
  const inst = selected ? m?.byKey.get(selected) : null;
  if (!inst || !payload) return compact ? null : <aside className="detail-panel empty" />;
  const def = inst.def;
  const sideTxt = inst.side ? (lang === 'cs' ? (inst.side === 'L' ? 'levá strana' : 'pravá strana') : inst.side === 'L' ? 'left side' : 'right side') : null;
  const regionNames = inst.regions
    .map((r) => {
      const base = r.replace(/_(left|right)$/, '');
      const d = payload.regions.find((x) => x.id === base);
      return d ? d.names[lang] : r;
    })
    .filter((v, i, a) => a.indexOf(v) === i);
  const related = m!.instances.filter((i) => i.key !== inst.key && i.group === inst.group && i.regions.some((r) => inst.regions.includes(r)) && (!inst.side || i.side === inst.side || !i.side)).slice(0, 8);
  const myNotes = notes.filter((n) => n.structureId === def.id);
  const speciesNote = def.speciesNotes?.[payload.meta.id as SpeciesId];
  const credit = inst.external ? external.find((e) => e.id === inst.external)?.attribution : undefined;
  const isKnown = known.has(def.id);

  const saveDraft = async () => {
    if (!draft.trim()) return;
    try {
      await createNote(devId, payload.meta.id, def.id, draft.trim());
      setDraft('');
      await reloadNotes();
      showToast(t('noteSaved'));
      haptic('arrive');
    } catch {
      showToast(t('apiError'));
      haptic('error');
    }
  };

  return (
    <aside className="detail-panel">
      <div className="detail-head">
        <div>
          <h2 className="detail-title">{label(def.names)}</h2>
          <p className="detail-alt">
            {(['la', 'cs', 'en'] as const).filter((l) => def.names[l] !== label(def.names)).map((l) => def.names[l]).join(' · ')}
          </p>
        </div>
        <button className="icon-btn" onClick={() => select(null)} aria-label={t('close')}>×</button>
      </div>
      <div className="chips small-chips">
        <span className={`chip tag kind-${def.kind}`}>{t(`kind_${def.kind}` as never)}</span>
        {regionNames.map((r) => (
          <span key={r} className="chip tag">{r}</span>
        ))}
        {sideTxt && <span className="chip tag">{sideTxt}</span>}
      </div>
      <div className="detail-scroll">
        <p className="desc">{def.description[lang]}</p>
        {def.origin && (
          <dl className="facts">
            <dt>{t('origin')}</dt>
            <dd>{def.origin[lang]}</dd>
            {def.insertion && (
              <>
                <dt>{t('insertion')}</dt>
                <dd>{def.insertion[lang]}</dd>
              </>
            )}
            {def.function && (
              <>
                <dt>{t('function')}</dt>
                <dd>{def.function[lang]}</dd>
              </>
            )}
          </dl>
        )}
        {!def.origin && def.function && (
          <dl className="facts">
            <dt>{t('function')}</dt>
            <dd>{def.function[lang]}</dd>
          </dl>
        )}
        {speciesNote && (
          <div className="species-note">
            <strong>{t('speciesNote')} ({payload.meta.names[lang]}):</strong> {speciesNote[lang]}
          </div>
        )}
        {credit && (
          <div className="species-note">
            <strong>{t('importedModel')}:</strong> {credit.title}
            {credit.author ? `, ${credit.author}` : ''}
            {credit.license ? ` (${credit.license})` : ''}
          </div>
        )}
        <div className="row gap">
          <button className="btn small" onClick={() => { haptic('tap'); camera({ type: 'fitStructure', key: inst.key }); }}>{t('showInModel')}</button>
          <label className="check">
            <input type="checkbox" checked={isKnown} onChange={(e) => { haptic('toggle'); setKnown(def.id, e.target.checked); }} /> {t('known')}
          </label>
        </div>
        {related.length > 0 && (
          <div className="related">
            <h4>{t('related')}</h4>
            <div className="chips">
              {related.map((r) => (
                <button key={r.key} className="chip" onClick={() => { haptic('select'); select(r.key); }}>{label(r.def.names)}</button>
              ))}
            </div>
          </div>
        )}
        <div className="notes">
          <h4>{t('notes')}</h4>
          {!online && <p className="muted small">{t('offline')}</p>}
          {myNotes.map((n) => (
            <div key={n.id} className="note">
              {editing === n.id ? (
                <>
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                  <div className="row gap">
                    <button className="btn small" onClick={async () => { try { await updateNote(n.id, devId, editText.trim()); setEditing(null); await reloadNotes(); showToast(t('noteSaved')); } catch { showToast(t('apiError')); } }}>{t('save')}</button>
                    <button className="btn small ghost" onClick={() => setEditing(null)}>{t('cancel')}</button>
                  </div>
                </>
              ) : (
                <>
                  <p>{n.text}</p>
                  <div className="row gap note-meta">
                    <span className="muted small">{new Date(n.updatedAt).toLocaleDateString()}</span>
                    <button className="link" onClick={() => { setEditing(n.id); setEditText(n.text); }}>{t('edit')}</button>
                    <button className="link danger" onClick={async () => { try { await deleteNote(n.id, devId); await reloadNotes(); } catch { showToast(t('apiError')); } }}>{t('delete')}</button>
                  </div>
                </>
              )}
            </div>
          ))}
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('notePlaceholder')} rows={3} />
          <button className="btn small" disabled={!draft.trim() || !online} onClick={saveDraft}>{t('addNote')}</button>
        </div>
      </div>
    </aside>
  );
}
