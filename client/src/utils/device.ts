export function deviceId(): string {
  try {
    let id = localStorage.getItem('vetatlas.device');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('vetatlas.device', id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

export const isTouchDevice = () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
export const isCompact = () => typeof window !== 'undefined' && window.innerWidth < 900;
