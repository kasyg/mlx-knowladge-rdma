import * as THREE from 'three';

export type V3 = [number, number, number];

export interface SweepOptions {
  points: V3[];
  /** radius at arc-length parameter t ∈ [0,1] (metres) */
  radius: (t: number) => number;
  radial?: number;
  segments?: number;
  /** thickness (along the outward normal) / width ratio */
  aspect?: number;
  /** reference direction for the section normal; may vary along the path */
  outward?: V3 | ((t: number) => V3) | null;
  closed?: boolean;
  caps?: boolean;
  tension?: number;
}

const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _o = new THREE.Vector3();
const _prevN = new THREE.Vector3();

/**
 * Sweeps an (elliptical) cross-section along a Catmull-Rom curve with a radius
 * profile. Topology is fixed, so `update(points)` can re-shape the geometry in
 * place every frame (used for muscles and tendons during limb motion).
 */
export class SweepGeometry extends THREE.BufferGeometry {
  readonly opts: Required<Pick<SweepOptions, 'radial' | 'segments' | 'aspect' | 'closed' | 'caps' | 'tension'>> & SweepOptions;
  curve!: THREE.CatmullRomCurve3;
  length = 0;
  private ringCount: number;

  constructor(opts: SweepOptions) {
    super();
    this.opts = { radial: 12, segments: 24, aspect: 1, closed: false, caps: true, tension: 0.5, outward: null, ...opts };
    if (this.opts.closed) this.opts.caps = false;
    this.ringCount = this.opts.segments + 1;
    const vertexCount = this.ringCount * this.opts.radial + (this.opts.caps ? 2 : 0);
    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
    this.buildIndex();
    this.fill();
  }

  private buildIndex() {
    const { radial, segments, caps, closed } = this.opts;
    const idx: number[] = [];
    const rings = closed ? segments : segments; // closed: last ring connects to first
    for (let i = 0; i < rings; i++) {
      const ia = i * radial;
      const ib = (closed && i === segments - 1 ? 0 : i + 1) * radial;
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        idx.push(ia + j, ib + j, ia + j2, ia + j2, ib + j, ib + j2);
      }
    }
    if (caps) {
      const c0 = this.ringCount * radial;
      const c1 = c0 + 1;
      const last = segments * radial;
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        idx.push(c0, j2, j);
        idx.push(c1, last + j, last + j2);
      }
    }
    this.setIndex(idx);
  }

  update(points: V3[]) {
    this.opts.points = points;
    this.fill();
  }

  private fill() {
    const { points, radial, segments, aspect, closed, caps, radius, outward } = this.opts;
    const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal', this.opts.tension);
    this.length = this.curve.getLength();
    const pos = this.attributes.position as THREE.BufferAttribute;
    const uv = this.attributes.uv as THREE.BufferAttribute;
    const spaced = this.curve.getSpacedPoints(segments);
    let hasPrev = false;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const tt = closed ? (i % segments) / segments : t;
      _p.copy(spaced[Math.min(i, spaced.length - 1)]);
      this.curve.getTangentAt(Math.min(tt, 0.9999), _t);
      if (_t.lengthSq() < 1e-10) _t.set(0, -1, 0);
      _t.normalize();
      let ok = false;
      if (outward) {
        const o = typeof outward === 'function' ? outward(t) : outward;
        _o.set(o[0], o[1], o[2]);
        _n.copy(_o).addScaledVector(_t, -_t.dot(_o));
        if (_n.lengthSq() > 1e-6) {
          _n.normalize();
          ok = true;
        }
      }
      if (!ok) {
        if (hasPrev) {
          _n.copy(_prevN).addScaledVector(_t, -_t.dot(_prevN));
          if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1).addScaledVector(_t, -_t.z);
        } else {
          // pick the axis least aligned with the tangent
          const ax = Math.abs(_t.x), ay = Math.abs(_t.y), az = Math.abs(_t.z);
          if (az <= ax && az <= ay) _n.set(0, 0, 1);
          else if (ay <= ax) _n.set(0, 1, 0);
          else _n.set(1, 0, 0);
          _n.addScaledVector(_t, -_t.dot(_n));
        }
        _n.normalize();
      }
      _prevN.copy(_n);
      hasPrev = true;
      _b.crossVectors(_t, _n).normalize();
      const r = Math.max(1e-5, radius(t));
      const rN = r * aspect;
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        const cx = Math.cos(th) * rN;
        const cy = Math.sin(th) * r;
        const k = i * radial + j;
        pos.setXYZ(k, _p.x + _n.x * cx + _b.x * cy, _p.y + _n.y * cx + _b.y * cy, _p.z + _n.z * cx + _b.z * cy);
        uv.setXY(k, j / radial, t);
      }
    }
    if (caps) {
      const c0 = this.ringCount * radial;
      const a = spaced[0];
      const b = spaced[spaced.length - 1];
      pos.setXYZ(c0, a.x, a.y, a.z);
      pos.setXYZ(c0 + 1, b.x, b.y, b.z);
      uv.setXY(c0, 0.5, 0);
      uv.setXY(c0 + 1, 0.5, 1);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    this.computeVertexNormals();
    this.computeBoundingSphere();
    this.computeBoundingBox();
  }
}

export type ProfileKind = 'fusiform' | 'tube' | 'bone' | 'taper' | 'cone' | 'flat';

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function interpArray(arr: number[], t: number) {
  if (arr.length === 1) return arr[0];
  const f = t * (arr.length - 1);
  const i = Math.min(arr.length - 2, Math.floor(f));
  const u = f - i;
  const uu = u * u * (3 - 2 * u);
  return arr[i] + (arr[i + 1] - arr[i]) * uu;
}

/** Build a radius function for a recipe profile (values already in metres). */
export function profileFn(kind: ProfileKind | undefined, r: number | number[], rEnds = 0.35): (t: number) => number {
  const arr = Array.isArray(r) ? r : [r];
  const base = (t: number) => interpArray(arr, t);
  switch (kind) {
    case 'fusiform':
      if (Array.isArray(r)) return (t) => base(t) * (0.4 + 0.6 * Math.pow(Math.sin(Math.PI * t), 0.5));
      return (t) => arr[0] * (rEnds + (1 - rEnds) * Math.pow(Math.sin(Math.PI * t), 0.75));
    case 'bone': {
      const rp = arr[0];
      const rs = arr.length > 1 ? arr[1] : arr[0] * 0.6;
      const rd = arr.length > 2 ? arr[2] : rp;
      return (t) => rs + (rp - rs) * (1 - ss(0.0, 0.2, t)) + (rd - rs) * ss(0.8, 1.0, t);
    }
    case 'cone':
      return (t) => arr[0] * (1 - t) + (arr[arr.length - 1] ?? 0) * t * 0.05;
    case 'taper':
    case 'tube':
    case 'flat':
    default:
      return base;
  }
}
