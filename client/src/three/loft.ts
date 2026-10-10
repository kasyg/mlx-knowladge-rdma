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

export interface LoftFrame {
  P: THREE.Vector3;
  T: THREE.Vector3;
  U: THREE.Vector3;
  S: THREE.Vector3;
}

/**
 * A super-elliptical loft as a continuous parametric surface: theta (angle in
 * the section plane, 0 = +S side axis, π/2 = +U up axis) × t (0..1 along the axis).
 * Shared by the mesh generator and the muscle-sheet system so both coincide.
 */
export class LoftSurface {
  readonly curve: THREE.CatmullRomCurve3 | null;
  readonly pts: THREE.Vector3[];
  readonly upRef: THREE.Vector3;
  readonly section: (t: number) => LoftSectionSample;
  constructor(opts: LoftOptions) {
    this.pts = opts.axis.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = this.pts.length > 1 ? new THREE.CatmullRomCurve3(this.pts, false, 'centripetal', opts.tension ?? 0.5) : null;
    this.upRef = new THREE.Vector3(...(opts.up ?? [0, 1, 0]));
    this.section = opts.section;
  }
  frame(t: number, out: LoftFrame): LoftFrame {
    if (this.curve) {
      this.curve.getPointAt(t, out.P);
      this.curve.getTangentAt(Math.min(Math.max(t, 0.0001), 0.9999), out.T).normalize();
    } else {
      out.P.copy(this.pts[0]);
      out.T.set(-1, 0, 0);
    }
    out.U.copy(this.upRef).addScaledVector(out.T, -out.T.dot(this.upRef));
    if (out.U.lengthSq() < 1e-6) out.U.set(0, 0, 1);
    out.U.normalize();
    out.S.crossVectors(out.T, out.U).normalize();
    return out;
  }
  /** position for a loft angle theta at parameter t, given a precomputed frame */
  sampleWithFrame(theta: number, t: number, f: LoftFrame, target: THREE.Vector3): THREE.Vector3 {
    const sec = this.section(t);
    const e = 2 / (sec.n ?? 2);
    const cs = sgnPow(Math.cos(theta), e);
    const sn = sgnPow(Math.sin(theta), e);
    const wx = sec.w * (1 - (sec.pear ?? 0) * sn);
    const sx = cs * wx + (sec.zOff ?? 0);
    const sy = sn * sec.h + (sec.yOff ?? 0);
    return target.copy(f.P).addScaledVector(f.S, sx).addScaledVector(f.U, sy);
  }
  sample(theta: number, t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const f = { P: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), S: new THREE.Vector3() };
    this.frame(t, f);
    return this.sampleWithFrame(theta, t, f, target);
  }
}

export function loftGeometry(opts: LoftOptions): THREE.BufferGeometry {
  const segments = opts.segments ?? 32;
  const radial = opts.radial ?? 32;
  const surf = new LoftSurface(opts);
  const positions: number[] = [];
  const uvs: number[] = [];
  const f: LoftFrame = { P: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), S: new THREE.Vector3() };
  const q = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    surf.frame(t, f);
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      surf.sampleWithFrame(th, t, f, q);
      positions.push(q.x, q.y, q.z);
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
    const sec = surf.section(0);
    const c = positions.length / 3;
    surf.frame(0, f);
    q.copy(f.P).addScaledVector(f.U, sec.yOff ?? 0).addScaledVector(f.S, sec.zOff ?? 0);
    positions.push(q.x, q.y, q.z);
    uvs.push(0.5, 0);
    for (let j = 0; j < radial; j++) index.push(c, (j + 1) % radial, j);
  }
  if (capEnd) {
    const sec = surf.section(1);
    const c = positions.length / 3;
    surf.frame(1, f);
    q.copy(f.P).addScaledVector(f.U, sec.yOff ?? 0).addScaledVector(f.S, sec.zOff ?? 0);
    positions.push(q.x, q.y, q.z);
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

/** ellipsoid, or for n > 2 a superellipsoid (rounded block) – the shape of short bones such as the carpal bones */
export function ellipsoidGeometry(size: V3, detail = 24, n = 2): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, detail, Math.max(8, Math.round(detail * 0.7)));
  if (n !== 2) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const e = 2 / n;
    const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, f(pos.getX(i)), f(pos.getY(i)), f(pos.getZ(i)));
  }
  g.scale(size[0], size[1], size[2]);
  if (n !== 2) g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}
