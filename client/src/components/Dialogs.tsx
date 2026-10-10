import { useAtlas } from '../state/store.ts';
import { haptic } from '../utils/haptics.ts';
import type { UiLang, LabelLang } from '@shared/types';

function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const panel = useAtlas((s) => s.panel);
  const setPanel = useAtlas((s) => s.setPanel);
  const t = useAtlas((s) => s.t);
  const settings = useAtlas((s) => s.settings);
  const update = useAtlas((s) => s.updateSettings);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="setting-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) => (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => { haptic('toggle'); onChange(o.v); }}>{o.l}</button>
      ))}
    </div>
  );
  return (
    <Modal open={panel === 'settings'} onClose={() => setPanel('none')} title={t('settings')}>
      <Row label={t('uiLang')}>
        <Seg<UiLang> value={settings.uiLang} options={[{ v: 'cs', l: 'Čeština' }, { v: 'en', l: 'English' }]} onChange={(v) => update({ uiLang: v })} />
      </Row>
      <Row label={t('labelLang')}>
        <Seg<LabelLang> value={settings.labelLang} options={[{ v: 'la', l: t('latin') }, { v: 'cs', l: t('czech') }, { v: 'en', l: t('english') }]} onChange={(v) => update({ labelLang: v })} />
      </Row>
      <Row label={t('labelSize')}>
        <Seg value={settings.labelSize} options={[{ v: 'S', l: 'S' }, { v: 'M', l: 'M' }, { v: 'L', l: 'L' }]} onChange={(v) => update({ labelSize: v })} />
      </Row>
      <Row label={t('theme')}>
        <Seg value={settings.theme} options={[{ v: 'light', l: t('light') }, { v: 'dark', l: t('dark') }]} onChange={(v) => update({ theme: v })} />
      </Row>
      <Row label={t('haptics')}>
        <label className={`switch${settings.haptics ? ' on' : ''}`}><input type="checkbox" checked={settings.haptics} onChange={(e) => update({ haptics: e.target.checked })} /><span className="knob" /></label>
      </Row>
      <Row label={t('reduceMotion')}>
        <label className={`switch${settings.reduceMotion ? ' on' : ''}`}><input type="checkbox" checked={settings.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} /><span className="knob" /></label>
      </Row>
      <Row label={t('animationSpeed')}>
        <Seg value={String(settings.animationSpeed)} options={[{ v: '0.5', l: '0.5×' }, { v: '1', l: '1×' }, { v: '2', l: '2×' }]} onChange={(v) => update({ animationSpeed: Number(v) })} />
      </Row>
    </Modal>
  );
}

export function HelpDialog() {
  const panel = useAtlas((s) => s.panel);
  const setPanel = useAtlas((s) => s.setPanel);
  const t = useAtlas((s) => s.t);
  return (
    <Modal open={panel === 'help'} onClose={() => setPanel('none')} title={t('help')} wide>
      <table className="help-table">
        <thead>
          <tr><th></th><th>{t('mouse')}</th><th>{t('touch')}</th></tr>
        </thead>
        <tbody>
          <tr><td>{t('rotate')}</td><td>{t('leftDrag')}</td><td>{t('oneFinger')}</td></tr>
          <tr><td>{t('pan')}</td><td>{t('rightDrag')}</td><td>{t('twoFingers')}</td></tr>
          <tr><td>{t('zoom')}</td><td>{t('ctrlWheel')}</td><td>{t('pinch')}</td></tr>
          <tr><td>{t('peel')}</td><td>{t('wheel')}</td><td>{t('depthRail')}</td></tr>
          <tr><td>{t('doubleClick')}</td><td colSpan={2}>{t('refocus')}</td></tr>
          <tr><td>{t('tripleClick')}</td><td colSpan={2}>{t('refocusReset')}</td></tr>
        </tbody>
      </table>
      <h4>{t('shortcut')}</h4>
      <ul className="help-list">
        <li>{t('keyEsc')}</li>
        <li>{t('keyNumbers')}</li>
        <li>{t('keyArrows')}</li>
        <li>{t('keySpace')}</li>
      </ul>
    </Modal>
  );
}

export function Welcome() {
  const open = useAtlas((s) => s.welcomeOpen);
  const setOpen = useAtlas((s) => s.setWelcomeOpen);
  const t = useAtlas((s) => s.t);
  const settings = useAtlas((s) => s.settings);
  const update = useAtlas((s) => s.updateSettings);
  if (!open) return null;
  return (
    <div className="modal-backdrop welcome">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="welcome-lang">
          <button className={settings.uiLang === 'cs' ? 'on' : ''} onClick={() => update({ uiLang: 'cs' })}>CS</button>
          <button className={settings.uiLang === 'en' ? 'on' : ''} onClick={() => update({ uiLang: 'en' })}>EN</button>
        </div>
        <h1 className="welcome-title">{t('welcomeTitle')}</h1>
        <p className="welcome-text">{t('welcomeText')}</p>
        <ol className="tips">
          <li>{t('tipRotate')}</li>
          <li>{t('tipRegion')}</li>
          <li>{t('tipPeel')}</li>
          <li>{t('tipClicks')}</li>
          <li>{t('tipStructure')}</li>
        </ol>
        <button className="btn primary" onClick={() => { haptic('select'); setOpen(false); }}>{t('start')}</button>
      </div>
    </div>
  );
}
