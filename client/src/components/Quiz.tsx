import { useEffect, useState } from 'react';
import { useAtlas, layerVisible } from '../state/store.ts';
import { LAYER_IDS, SYSTEM_IDS, type GroupId, type Names } from '@shared/types';
import { atlasRuntime } from '../three/AtlasStage.tsx';
import { haptic } from '../utils/haptics.ts';

interface Question {
  answer: string;
  options: string[];
  names: Record<string, Names>;
}

/** Practice mode: a structure is highlighted in the model, the student picks its name. */
export function Quiz({ onClose }: { onClose: () => void }) {
  const t = useAtlas((s) => s.t);
  const label = useAtlas((s) => s.label);
  const speciesId = useAtlas((s) => s.speciesId);
  const [group, setGroup] = useState<GroupId | ''>('');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(false);

  const start = async () => {
    if (!speciesId) return;
    try {
      const r = await fetch(`/api/quiz?species=${speciesId}&n=10${group ? `&group=${group}` : ''}`);
      const qs = (await r.json()) as Question[];
      setQuestions(qs);
      setIdx(0);
      setScore(0);
      setPicked(null);
      setError(false);
    } catch {
      setError(true);
    }
  };

  // highlight + focus the current question's structure
  useEffect(() => {
    const s = useAtlas.getState();
    const m = atlasRuntime.model;
    if (!questions || !m) {
      s.setQuizHighlight(null);
      return;
    }
    const q = questions[idx];
    if (!q) {
      s.setQuizHighlight(null);
      return;
    }
    const def = m.payload.structures.find((d) => d.id === q.answer);
    const key = def?.bilateral ? `${q.answer}_L` : q.answer;
    const inst = m.byKey.get(key);
    if (!def || !inst) return;
    if (LAYER_IDS.includes(def.group as (typeof LAYER_IDS)[number])) {
      const g = def.group as (typeof LAYER_IDS)[number];
      if (!layerVisible(g, s.depth, s.layerMode[g])) s.setLayerMode(g, 'on');
    } else if (!s.systems[def.group as (typeof SYSTEM_IDS)[number]]) s.toggleSystem(def.group as (typeof SYSTEM_IDS)[number]);
    s.select(null);
    s.setQuizHighlight(key);
    s.camera({ type: 'fitStructure', key });
    return () => s.setQuizHighlight(null);
  }, [questions, idx]);

  const q = questions?.[idx];
  const finished = questions && idx >= questions.length;

  return (
    <div className="quiz">
      <div className="quiz-head">
        <h3>{t('quizTitle')}</h3>
        <button className="icon-btn" onClick={onClose} aria-label={t('close')}>×</button>
      </div>
      {!questions && (
        <div className="quiz-setup">
          <select value={group} onChange={(e) => setGroup(e.target.value as GroupId | '')} aria-label={t('layers')}>
            <option value="">{t('wholeAnimal')}</option>
            {LAYER_IDS.filter((l) => l !== 'skin').map((l) => (
              <option key={l} value={l}>{t(`layer_${l}` as never)}</option>
            ))}
            {SYSTEM_IDS.map((k) => (
              <option key={k} value={k}>{t(`system_${k}` as never)}</option>
            ))}
          </select>
          <button className="btn primary small" onClick={() => { haptic('select'); void start(); }}>{t('start')}</button>
          {error && <p className="muted small">{t('apiError')}</p>}
        </div>
      )}
      {q && !finished && (
        <div className="quiz-q">
          <p className="muted small">{idx + 1} / {questions!.length} · {t('quizScore')}: {score}</p>
          <p className="quiz-question">{t('quizQuestion')}</p>
          <div className="quiz-options">
            {q.options.map((id) => {
              const cls = picked ? (id === q.answer ? ' correct' : id === picked ? ' wrong' : '') : '';
              return (
                <button key={id} className={`btn small quiz-opt${cls}`} disabled={!!picked} onClick={() => {
                  setPicked(id);
                  const ok = id === q.answer;
                  if (ok) {
                    setScore((sc) => sc + 1);
                    haptic('arrive');
                    useAtlas.getState().setKnown(q.answer, true);
                  } else haptic('error');
                }}>
                  {label(q.names[id])}
                </button>
              );
            })}
          </div>
          {picked && (
            <p className={`quiz-result${picked === q.answer ? ' ok' : ''}`}>
              {picked === q.answer ? t('quizCorrect') : `${t('quizWrong')} ${label(q.names[q.answer])}`}
            </p>
          )}
          {picked && (
            <button className="btn primary small" onClick={() => { haptic('tap'); setPicked(null); setIdx((i) => i + 1); }}>{t('quizNext')}</button>
          )}
        </div>
      )}
      {finished && (
        <div className="quiz-q">
          <p className="quiz-question">{t('quizEnd')}</p>
          <p>{t('quizScore')}: <strong>{score} / {questions!.length}</strong></p>
          <div className="row gap">
            <button className="btn primary small" onClick={() => { setQuestions(null); }}>{t('quizNext')}</button>
            <button className="btn small ghost" onClick={onClose}>{t('close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
