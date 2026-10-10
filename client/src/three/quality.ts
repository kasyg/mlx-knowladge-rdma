import type * as THREE from 'three';
import type { RenderQuality } from '@shared/types';

export type EffectiveQuality = 'high' | 'low';

/** what the renderer found out about the device (read by the settings dialog) */
export const renderInfo = {
  /** quality the auto mode picks on this device, null until the canvas exists */
  detected: null as EffectiveQuality | null,
  /** unmasked GPU name when the browser reveals it */
  gpu: '',
};

/** software rasterisers (CI, remote desktops, blocked GPUs) */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

/**
 * Auto quality: desktops and tablets with a hardware GPU get soft shadows and
 * ambient occlusion; phones, low-memory devices and software renderers do not.
 */
export function detectQuality(gl: THREE.WebGLRenderer): EffectiveQuality {
  let gpu = '';
  try {
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER) ?? '');
  } catch {
    /* the name is optional */
  }
  renderInfo.gpu = gpu;
  let q: EffectiveQuality = 'high';
  if (SOFTWARE_GPU.test(gpu)) q = 'low';
  else if (typeof window !== 'undefined') {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const shortSide = Math.min(window.screen?.width ?? 1024, window.screen?.height ?? 768);
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    if ((coarse && shortSide < 600) || memory < 4) q = 'low';
  }
  renderInfo.detected = q;
  return q;
}

export function effectiveQuality(setting: RenderQuality | undefined, detected: EffectiveQuality | null): EffectiveQuality {
  if (setting === 'high' || setting === 'low') return setting;
  return detected ?? 'low';
}
