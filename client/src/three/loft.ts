import * as THREE from 'three';
import type { V3 } from './sweep.ts';

export interface LoftSectionSample {
  w: number;
  h: number;
  yOff?: number;
  zOff?: number;
  n?: number;
  pear?: number;
}

export interface LoftOptions {
  axis: V3[];
  section: (t: number) => LoftSectionSample;
  segments?: number;
  radial?: number;
  /** reference "up" of the section plane (default world up) */
  up?: V3;
  capStart?: boolean;
  capEnd?: boolean;
  tension?: number;
}

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * Lofts super-elliptical cross-sections along a curve: body, neck, head,
 * skull, lungs, scapula. Sections are oriented with the given up vector.
 */
export function loftGeometry(opts: LoftOptions): THREE.BufferGeometry {
  const segments = opts.segments ?? 32;
  const radial = opts.radial ?? 32;
  const pts = opts.axis.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = pts.length > 1 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal', opts.tension ?? 0.5) : null;
  const upRef = new THREE.Vector3(...(opts.up ?? [0, 1, 0]));
  const positions: number[] = [];
  const uvs: number[] = [];
  const T = new THREE.Vector3();
  const U = new THREE.Vector3();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    if (curve) {
      curve.getPointAt(t, P);
      curve.getTangentAt(Math.min(t, 0.9999), T).normalize();
    } else {
      P.copy(pts[0]);
      T.set(-1, 0, 0);
    }
    U.copy(upRef).addScaledVector(T, -T.dot(upRef));
    if (U.lengthSq() < 1e-6) U.set(0, 0, 1);
    U.normalize();
    S.crossVectors(T, U).normalize();
    const sec = opts.section(t);
    const n = sec.n ?? 2;
    const e = 2 / n;
    const pear = sec.pear ?? 0;
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const cs = sgnPow(Math.cos(th), e);
      const sn = sgnPow(Math.sin(th), e);
      const wx = sec.w * (1 - pear * sn);
      const sx = cs * wx;
      const sy = sn * sec.h + (sec.yOff ?? 0);
      const sz = sec.zOff ?? 0;
      positions.push(P.x + S.x * (sx + sz) + U.x * sy, P.y + S.y * (sx + sz) + U.y * sy, P.z + S.z * (sx + sz) + U.z * sy);
      uvs.push(j / radial, t);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const j2 = (j + 1) % radial;
      const a2 = i * radial + j2;
      const b2 = (i + 1) * radial + j2;
      index.push(a, b, a2, a2, b, b2);
    }
  }
  const capStart = opts.capStart ?? true;
  const capEnd = opts.capEnd ?? true;
  if (capStart) {
    const sec = opts.section(0);
    const c = positions.length / 3;
    const p0 = curve ? curve.getPointAt(0) : pts[0];
    const cu = upRef.clone();
    positions.push(p0.x + cu.x * (sec.yOff ?? 0), p0.y + cu.y * (sec.yOff ?? 0), p0.z + cu.z * (sec.yOff ?? 0));
    uvs.push(0.5, 0);
    for (let j = 0; j < radial; j++) index.push(c, (j + 1) % radial, j);
  }
  if (capEnd) {
    const sec = opts.section(1);
    const c = positions.length / 3;
    const p1 = curve ? curve.getPointAt(1) : pts[0];
    const cu = upRef.clone();
    positions.push(p1.x + cu.x * (sec.yOff ?? 0), p1.y + cu.y * (sec.yOff ?? 0), p1.z + cu.z * (sec.yOff ?? 0));
    uvs.push(0.5, 1);
    const last = segments * radial;
    for (let j = 0; j < radial; j++) index.push(c, last + j, last + ((j + 1) % radial));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A parametric surface patch (rows × cols), double sided normals computed from the grid. */
export function gridGeometry(rows: number, cols: number, fn: (u: number, v: number) => V3): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const p = fn(i / rows, j / cols);
      positions.push(p[0], p[1], p[2]);
      uvs.push(j / cols, i / rows);
    }
  }
  const index: number[] = [];
  const W = cols + 1;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * W + j;
      const b = a + W;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function ellipsoidGeometry(size: V3, detail = 24): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, detail, Math.max(8, Math.round(detail * 0.7)));
  g.scale(size[0], size[1], size[2]);
  g.computeBoundingBox();
  return g;
}
