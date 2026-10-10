/**
 * Haptic feedback: Vibration API where available (Android/Chrome); on iOS
 * Safari (no vibration API) we fall back to the system haptic that is emitted
 * when a native <input type="checkbox" switch> is toggled inside a user gesture.
 */
let enabled = true;
let iosLabel: HTMLLabelElement | null = null;
let interacted = false;
if (typeof window !== 'undefined') {
  const mark = () => {
    interacted = true;
  };
  window.addEventListener('pointerdown', mark, { passive: true });
  window.addEventListener('keydown', mark, { passive: true });
}

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

function ensureIosSwitch() {
  if (iosLabel || typeof document === 'undefined') return;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.body.appendChild(label);
  iosLabel = label;
}

export type HapticKind = 'tap' | 'select' | 'double' | 'triple' | 'toggle' | 'arrive' | 'error';

const PATTERNS: Record<HapticKind, number[]> = {
  tap: [8],
  select: [14],
  double: [10, 40, 10],
  triple: [10, 40, 10, 40, 18],
  toggle: [6],
  arrive: [20],
  error: [30, 60, 30],
};

export function haptic(kind: HapticKind = 'tap') {
  if (!enabled || !interacted || typeof navigator === 'undefined') return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind]);
      return;
    }
    const isApple = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isApple) {
      ensureIosSwitch();
      const times = kind === 'triple' ? 3 : kind === 'double' ? 2 : 1;
      for (let i = 0; i < times; i++) setTimeout(() => iosLabel?.click(), i * 70);
    }
  } catch {
    /* ignore */
  }
}
