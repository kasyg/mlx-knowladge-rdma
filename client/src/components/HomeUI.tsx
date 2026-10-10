import { useAtlas } from '../state/store.ts';
import { SPECIES_LIST } from '@shared/species';
import { haptic } from '../utils/haptics.ts';

export function HomeUI() {
  const t = useAtlas((s) => s.t);
  const lang = useAtlas((s) => s.settings.uiLang);
  const selectSpecies = useAtlas((s) => s.selectSpecies);
  const spinning = useAtlas((s) => s.spinning);
  const loading = useAtlas((s) => s.loading);
  const setHovered = useAtlas((s) => s.setHovered);
  return (
    <>
      <div className="home-title">
        <h1>{t('chooseAnimal')}</h1>
        <p>{t('chooseAnimalHint')}</p>
      </div>
      <div className="species-cards">
        {SPECIES_LIST.map((sp) => (
          <button
            key={sp.meta.id}
            className={`species-card${spinning === sp.meta.id ? ' spinning' : ''}`}
            disabled={!!spinning}
            onMouseEnter={() => setHovered(`species:${sp.meta.id}`)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => {
              haptic('select');
              void selectSpecies(sp.meta.id);
            }}
          >
            <span className="sc-name">{sp.meta.names[lang]}</span>
            <span className="sc-la">{sp.meta.names.la}</span>
            {spinning === sp.meta.id && (
              <span className="sc-progress"><span style={{ width: `${Math.round(loading.progress * 100)}%` }} /></span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
