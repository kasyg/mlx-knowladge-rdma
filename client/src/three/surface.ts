/**
 * Body surface: the skin of the animal as a set of parametric parts
 * (trunk, neck, head, four limbs). Each part maps (u, v) → world position:
 *   u ∈ [0,1) around the body – 0 dorsal midline, 0.25 left side, 0.5 ventral, 0.75 right
 *   (limbs: 0 cranial, 0.25 lateral, 0.5 caudal, 0.75 medial), v ∈ [0,1] along the part.
 * The skin mesh and the muscle sheets are both generated from these parts.
 */
import * as THREE from 'three';
import type { Rig } from '@shared/rig';
import type { Side } from '@shared/types';
import { LoftSurface, type LoftOptions, type LoftFrame } from './loft.ts';
import { SweepSurface, profileFn, type V3, type SweepFrame } from './sweep.ts';

export type PartId = 'trunk' | 'neck' | 'head' | 'fl_L' | 'fl_R' | 'hl_L' | 'hl_R';
export type LimbPartId = 'fl_L' | 'fl_R' | 'hl_L' | 'hl_R';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export interface SurfacePart {
  id: PartId;
  sample(u: number, v: number, target?: THREE.Vector3): THREE.Vector3;
  /** outward unit normal (numerical) */
  normal(u: number, v: number, target?: THREE.Vector3): THREE.Vector3;
  /** point on the part's axis (spine of the trunk, bone line of a limb) at v */
  axisPoint?(v: number, target?: THREE.Vector3): THREE.Vector3;
  /** nearest (u, v) of a world point */
  uvOf(p: V3): [number, number];
  /** approximate metric scale: metres per unit u (circumference) and per unit v (length) at (u, v) */
  scale(u: number, v: number): [number, number];
}

// ------------------------------------------------------------------ skin definitions (shared with the skin builder)
export function skinTrunkLoft(rig: Rig): LoftOptions {
  const secs = rig.params.trunk.sections;
  const axis: V3[] = secs.map((s) => [s.x, (s.top + s.bottom) / 2, 0]);
  const xMin = secs[0].x, xMax = secs[secs.length - 1].x;
  return {
    axis,
    section: (t) => {
      const s = rig.trunkSection(lerp(xMin, xMax, t));
      return { w: s.w, h: (s.top - s.bottom) / 2, n: s.n, pear: s.pear };
    },
    segments: 72,
    radial: 64,
    tension: 0.3,
  };
}

export function skinNeckLoft(rig: Rig): LoftOptions {
  const neckAxis: V3[] = [];
  const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  for (let i = 0; i <= 8; i++) {
    const t = lerp(-0.08, 1.04, i / 8);
    const tc = Math.min(1, Math.max(0, t));
    const p = rig.neck.point(tc);
    const tan = rig.neck.tangent(tc);
    const ext = t < 0 ? -t : t > 1 ? t - 1 : 0;
    const q: V3 = t < 0 ? sub(p, mul(tan, ext * rig.neck.length)) : t > 1 ? add(p, mul(tan, ext * rig.neck.length)) : p;
    const sec = rig.neck.section(tc);
    neckAxis.push([q[0], q[1] + (sec.yOff ?? 0), q[2]]);
  }
  return {
    axis: neckAxis,
    section: (t) => {
      const tt = lerp(-0.08, 1.04, t);
      const sec = rig.neck.section(Math.min(1, Math.max(0, tt)));
      const k = tt < 0 ? 1 + tt * 1.2 : 1;
      return { w: sec.w * k, h: sec.h * k, n: sec.n ?? 2.2, pear: -0.08 };
    },
    segments: 36,
    radial: 48,
  };
}

export function skinHeadLoft(rig: Rig): LoftOptions {
  const hd = rig.head;
  const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
  const headAxis: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = lerp(-0.06, 1.0, i / 10);
    const sec = rig.head.section(Math.max(0, t));
    headAxis.push(add(add(hd.origin, mul(hd.dir, t * hd.length)), mul(hd.up, sec.yOff ?? 0)));
  }
  return {
    axis: headAxis,
    section: (t) => {
      const tt = lerp(-0.06, 1.0, t);
      const sec = rig.head.section(Math.max(0, tt));
      const k = tt < 0 ? 0.92 : 1;
      return { w: sec.w * k, h: sec.h * k, n: sec.n ?? 2.1 };
    },
    up: hd.up,
    segments: 40,
    radial: 48,
  };
}

export interface LimbSweepDef {
  points: V3[];
  radii: number[];
  aspect: number | ((t: number) => number);
  outward: V3;
}

/**
 * Cross-section depth/width ratio (cranio-caudal / lateral) along a limb.
 * Quadruped limbs are deeper than wide everywhere: the thigh and arm carry their
 * muscle mass in front of and behind the bone, the cannon is a flattened oval.
 */
const aspectCurve = (keys: [number, number][]) => (t: number) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const x = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
      const k = x * x * (3 - 2 * x);
      return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * k;
    }
  }
  return keys[keys.length - 1][1];
};
const FL_ASPECT = aspectCurve([[0, 1.3], [0.22, 1.35], [0.4, 1.4], [0.52, 1.32], [0.62, 1.18], [0.72, 1.12], [1, 1.08]]);
const HL_ASPECT = aspectCurve([[0, 1.6], [0.2, 1.75], [0.4, 1.45], [0.52, 1.3], [0.64, 1.25], [0.74, 1.12], [1, 1.08]]);

/** Skin sweep definition of a limb from (possibly animated) landmark positions. */
export function skinLimbSweep(rig: Rig, lm: (name: string) => V3, limb: 'fl' | 'hl', side: Side): LimbSweepDef {
  const H = rig.H;
  const P = rig.params;
  const k = 1.12;
  if (limb === 'fl') {
    const f = (n: string) => lm(`fl_${side}_${n}`);
    const fr = P.forelimb.r;
    return {
      points: [add(f('shoulder'), [0.05 * H, 0.15 * H, -0.035 * H * (side === 'L' ? 1 : -1)]), add(f('shoulder'), [0.015 * H, 0.06 * H, -0.014 * H * (side === 'L' ? 1 : -1)]), f('shoulder'), f('elbow'), f('radius_mid'), f('carpus'), f('cannon_mid'), f('fetlock'), f('pastern'), f('coffin')],
      radii: [fr.upper * 0.92, fr.upper * 0.98, fr.upper * 0.95, fr.joint1 * 0.95, fr.mid * 0.95, fr.joint2 * 1.02, fr.cannon * k, fr.fetlock * k, fr.pastern * k, fr.pastern * k * 0.95],
      aspect: FL_ASPECT,
      outward: [-1, 0, 0],
    };
  }
  const h = (n: string) => lm(`hl_${side}_${n}`);
  const hr = P.hindlimb.r;
  return {
    points: [add(h('hip'), [-0.06 * H, 0.16 * H, -0.045 * H * (side === 'L' ? 1 : -1)]), add(h('hip'), [-0.03 * H, 0.08 * H, -0.02 * H * (side === 'L' ? 1 : -1)]), h('hip'), h('femur_mid'), h('stifle'), h('tibia_mid'), h('hock'), h('cannon_mid'), h('fetlock'), h('pastern'), h('coffin')],
    radii: [hr.upper * 0.78, hr.upper * 0.84, hr.upper * 0.8, hr.upper * 0.64, hr.joint1 * 0.85, hr.mid * 0.9, hr.joint2 * k, hr.cannon * k, hr.fetlock * k, hr.pastern * k, hr.pastern * k * 0.95],
    aspect: HL_ASPECT,
    outward: [-1, 0, 0],
  };
}

// ------------------------------------------------------------------ parts
class LoftPart implements SurfacePart {
  private f: LoftFrame = { P: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), S: new THREE.Vector3() };
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private axisSamples: THREE.Vector3[] = [];
  constructor(readonly id: PartId, readonly surf: LoftSurface) {
    for (let i = 0; i <= 120; i++) this.axisSamples.push(surf.sample(0, i / 120).set(0, 0, 0).copy(surf.curve ? surf.curve.getPointAt(i / 120) : surf.pts[0]));
  }
  private theta(u: number, sz: number) {
    // u = 0 dorsal (U axis), increasing towards the animal's left (+z)
    return Math.PI / 2 - Math.sign(sz || 1) * u * Math.PI * 2;
  }
  sample(u: number, v: number, target = new THREE.Vector3()): THREE.Vector3 {
    const vv = Math.min(1, Math.max(0, v));
    this.surf.frame(vv, this.f);
    return this.surf.sampleWithFrame(this.theta(u, this.f.S.z), vv, this.f, target);
  }
  normal(u: number, v: number, target = new THREE.Vector3()): THREE.Vector3 {
    const du = 0.004, dv = 0.004;
    this.sample(u + du, v, this.tmpA).sub(this.sample(u - du, v, this.tmpB));
    const a = this.tmpA.clone();
    this.sample(u, Math.min(1, v + dv), this.tmpB).sub(this.sample(u, Math.max(0, v - dv), this.tmpC));
    target.crossVectors(a, this.tmpB).normalize();
    // orient outward: away from the axis point
    this.surf.frame(Math.min(1, Math.max(0, v)), this.f);
    this.sample(u, v, this.tmpC).sub(this.f.P);
    if (target.dot(this.tmpC) < 0) target.negate();
    return target;
  }
  axisPoint(v: number, target = new THREE.Vector3()): THREE.Vector3 {
    this.surf.frame(Math.min(1, Math.max(0, v)), this.f);
    return target.copy(this.f.P);
  }
  uvOf(p: V3): [number, number] {
    const q = new THREE.Vector3(p[0], p[1], p[2]);
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.axisSamples.length; i++) {
      const d = this.axisSamples[i].distanceToSquared(q);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const v = best / (this.axisSamples.length - 1);
    this.surf.frame(v, this.f);
    const d = q.clone().sub(this.f.P);
    const sec = this.surf.section(v);
    const su = (d.dot(this.f.U) - (sec.yOff ?? 0)) / Math.max(1e-6, sec.h);
    const ss = (d.dot(this.f.S) - (sec.zOff ?? 0)) / Math.max(1e-6, sec.w);
    const theta = Math.atan2(su, ss);
    let u = (Math.PI / 2 - theta) / (Math.sign(this.f.S.z || 1) * Math.PI * 2);
    u = ((u % 1) + 1) % 1;
    return [u, v];
  }
  scale(u: number, v: number): [number, number] {
    const a = this.sample(u + 0.01, v).distanceTo(this.sample(u - 0.01, v)) / 0.02;
    const b = this.sample(u, Math.min(1, v + 0.01)).distanceTo(this.sample(u, Math.max(0, v - 0.01))) / 0.02;
    return [a, b];
  }
}

class LimbPart implements SurfacePart {
  private f: SweepFrame = { P: new THREE.Vector3(), T: new THREE.Vector3(), N: new THREE.Vector3(), B: new THREE.Vector3() };
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  surf: SweepSurface;
  private axisSamples: THREE.Vector3[] = [];
  constructor(readonly id: LimbPartId, def: LimbSweepDef, readonly side: Side) {
    this.surf = new SweepSurface(def.points, profileFn('taper', def.radii), def.aspect, def.outward);
    this.resample();
  }
  private resample() {
    this.axisSamples = [];
    for (let i = 0; i <= 120; i++) this.axisSamples.push(this.surf.curve.getPointAt(i / 120));
  }
  refresh(def: LimbSweepDef) {
    this.surf = new SweepSurface(def.points, profileFn('taper', def.radii), def.aspect, def.outward);
    this.resample();
  }
  private theta(u: number) {
    // u = 0 cranial (N), 0.25 lateral; B points to -z for both sides (T×N with N = -x)
    const sgn = this.side === 'L' ? -1 : 1;
    return sgn * u * Math.PI * 2;
  }
  sample(u: number, v: number, target = new THREE.Vector3()): THREE.Vector3 {
    const vv = Math.min(1, Math.max(0, v));
    this.surf.frame(vv, this.f);
    return this.surf.sampleWithFrame(this.theta(u), vv, this.f, target);
  }
  normal(u: number, v: number, target = new THREE.Vector3()): THREE.Vector3 {
    const du = 0.004, dv = 0.004;
    this.sample(u + du, v, this.tmpA).sub(this.sample(u - du, v, this.tmpB));
    const a = this.tmpA.clone();
    this.sample(u, Math.min(1, v + dv), this.tmpB).sub(this.sample(u, Math.max(0, v - dv), this.tmpC));
    target.crossVectors(a, this.tmpB).normalize();
    this.surf.frame(Math.min(1, Math.max(0, v)), this.f);
    this.sample(u, v, this.tmpC).sub(this.f.P);
    if (target.dot(this.tmpC) < 0) target.negate();
    return target;
  }
  axisPoint(v: number, target = new THREE.Vector3()): THREE.Vector3 {
    this.surf.frame(Math.min(1, Math.max(0, v)), this.f);
    return target.copy(this.f.P);
  }
  uvOf(p: V3): [number, number] {
    const q = new THREE.Vector3(p[0], p[1], p[2]);
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.axisSamples.length; i++) {
      const d = this.axisSamples[i].distanceToSquared(q);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const v = best / (this.axisSamples.length - 1);
    this.surf.frame(v, this.f);
    const d = q.clone().sub(this.f.P);
    const theta = Math.atan2(d.dot(this.f.B), d.dot(this.f.N) / this.surf.aspectAt(v));
    const sgn = this.side === 'L' ? -1 : 1;
    let u = theta / (sgn * Math.PI * 2);
    u = ((u % 1) + 1) % 1;
    return [u, v];
  }
  scale(u: number, v: number): [number, number] {
    const a = this.sample(u + 0.01, v).distanceTo(this.sample(u - 0.01, v)) / 0.02;
    const b = this.sample(u, Math.min(1, v + 0.01)).distanceTo(this.sample(u, Math.max(0, v - 0.01))) / 0.02;
    return [a, b];
  }
}

export class BodySurface {
  readonly parts = new Map<PartId, SurfacePart>();
  constructor(readonly rig: Rig, lm: (name: string) => V3) {
    this.parts.set('trunk', new LoftPart('trunk', new LoftSurface(skinTrunkLoft(rig))));
    this.parts.set('neck', new LoftPart('neck', new LoftSurface(skinNeckLoft(rig))));
    this.parts.set('head', new LoftPart('head', new LoftSurface(skinHeadLoft(rig))));
    for (const side of ['L', 'R'] as Side[]) {
      this.parts.set(`fl_${side}`, new LimbPart(`fl_${side}`, skinLimbSweep(rig, lm, 'fl', side), side));
      this.parts.set(`hl_${side}`, new LimbPart(`hl_${side}`, skinLimbSweep(rig, lm, 'hl', side), side));
    }
  }
  part(id: PartId): SurfacePart {
    const p = this.parts.get(id);
    if (!p) throw new Error(`unknown surface part ${id}`);
    return p;
  }
  /** re-shape a limb part from animated landmarks */
  refreshLimb(id: LimbPartId, lm: (name: string) => V3) {
    const p = this.parts.get(id) as LimbPart;
    const limb = id.startsWith('fl') ? 'fl' : 'hl';
    const side = id.endsWith('L') ? 'L' : 'R';
    p.refresh(skinLimbSweep(this.rig, lm, limb, side));
  }
}
