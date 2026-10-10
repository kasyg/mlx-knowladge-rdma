import * as THREE from 'three';
import type { FurParams } from '@shared/types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on a canvas-sized grid. */
function makeNoise(size: number, cells: number, rnd: () => number) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  return (x: number, y: number) => {
    const gx = (x / size) * cells;
    const gy = (y / size) * cells;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (ix: number, iy: number) => grid[((iy % cells) + cells) % cells * cells + (((ix % cells) + cells) % cells)];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

const cache = new Map<string, THREE.CanvasTexture>();

export function furTexture(fur: FurParams, key: string): THREE.CanvasTexture {
  const ck = `${key}-${fur.seed}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry32(fur.seed * 7919 + 13);
  const base = new THREE.Color(fur.base);
  const second = new THREE.Color(fur.secondary);
  const img = ctx.createImageData(canvas.width, canvas.height);
  const n1 = makeNoise(size, Math.round(6 * fur.scale), rnd);
  const n2 = makeNoise(size, Math.round(13 * fur.scale), rnd);
  const n3 = makeNoise(size, 90, rnd);
  const grain = makeNoise(size, 260, rnd);
  const tmp = new THREE.Color();
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      let mix = 0;
      const fine = (grain(x, y) - 0.5) * 0.08 + (n3(x, y) - 0.5) * 0.06;
      if (fur.pattern === 'patches') {
        const v = n1(x, y) * 0.65 + n2(x, y) * 0.35;
        mix = v > 0.56 ? 1 : v > 0.52 ? (v - 0.52) / 0.04 : 0;
      } else if (fur.pattern === 'tabby') {
        const stripe = Math.sin((x / size) * Math.PI * 2 * 26 + (n2(x, y) - 0.5) * 9 + (y / size) * 3) * 0.5 + 0.5;
        const mod = n1(x, y);
        mix = Math.pow(stripe, 3) * (0.35 + 0.65 * mod);
      } else if (fur.pattern === 'spots') {
        const v = n2(x, y);
        mix = v > 0.62 ? 1 : 0;
      }
      tmp.copy(base).lerp(second, mix);
      const r = Math.min(1, Math.max(0, tmp.r + fine));
      const g = Math.min(1, Math.max(0, tmp.g + fine));
      const b = Math.min(1, Math.max(0, tmp.b + fine));
      const i = (y * canvas.width + x) * 4;
      img.data[i] = r * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = b * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(ck, tex);
  return tex;
}
