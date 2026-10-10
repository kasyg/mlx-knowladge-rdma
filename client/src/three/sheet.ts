/**
 * Muscle sheets: a Coons patch defined in the (u, v) space of a body-surface
 * part, extruded inward with a dome-shaped thickness. The outer face follows
 * the skin exactly (slightly inset), so superficial muscles tile the body like
 * an anatomical plate; edges dip to form the grooves between muscles.
 */
import * as THREE from 'three';
import type { SurfacePart } from './surface.ts';

export type UV = [number, number];

export interface SheetSpec {
  corners: [UV, UV, UV, UV];
  /** optional quadratic control points for the 4 edges (c0→c1, c1→c2, c3→c2, c0→c3) */
  mids?: (UV | null)[];
  /** max inward thickness (m) */
  bulge: number;
  /** groove depth at the edges (m) */
  dip: number;
  /** inset below the skin (m) */
  skinOffset: number;
  ns?: number;
  nt?: number;
  /** texture repeat scale (metres per fibre-texture tile) */
  tile?: number;
}

const bez = (a: UV, m: UV | null | undefined, b: UV, x: number): UV => {
  if (!m) return [a[0] + (b[0] - a[0]) * x, a[1] + (b[1] - a[1]) * x];
  const u = 1 - x;
  return [u * u * a[0] + 2 * u * x * m[0] + x * x * b[0], u * u * a[1] + 2 * u * x * m[1] + x * x * b[1]];
};

export function coons(spec: SheetSpec, s: number, t: number): UV {
  const [c0, c1, c2, c3] = spec.corners;
  const m = spec.mids ?? [];
  const e0 = bez(c0, m[0], c1, s); // bottom (t = 0)
  const e2 = bez(c3, m[2], c2, s); // top (t = 1)
  const e3 = bez(c0, m[3], c3, t); // left (s = 0)
  const e1 = bez(c1, m[1], c2, t); // right (s = 1)
  const u = (1 - t) * e0[0] + t * e2[0] + (1 - s) * e3[0] + s * e1[0] - ((1 - s) * (1 - t) * c0[0] + s * (1 - t) * c1[0] + s * t * c2[0] + (1 - s) * t * c3[0]);
  const v = (1 - t) * e0[1] + t * e2[1] + (1 - s) * e3[1] + s * e1[1] - ((1 - s) * (1 - t) * c0[1] + s * (1 - t) * c1[1] + s * t * c2[1] + (1 - s) * t * c3[1]);
  return [u, v];
}

export class SheetGeometry extends THREE.BufferGeometry {
  readonly ns: number;
  readonly nt: number;
  constructor(part: SurfacePart, readonly spec: SheetSpec) {
    super();
    this.ns = spec.ns ?? 14;
    this.nt = spec.nt ?? 20;
    const n = (this.ns + 1) * (this.nt + 1);
    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2));
    this.buildIndex();
    this.update(part);
  }
  private buildIndex() {
    const { ns, nt } = this;
    const W = ns + 1;
    const n = W * (nt + 1);
    const idx: number[] = [];
    for (let i = 0; i < nt; i++) {
      for (let j = 0; j < ns; j++) {
        const a = i * W + j, b = a + W;
        // outer (facing out)
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        // inner (reversed)
        idx.push(n + a, n + a + 1, n + b, n + a + 1, n + b + 1, n + b);
      }
    }
    // rim strips
    const rim = (a: number, b: number) => idx.push(a, n + a, b, b, n + a, n + b);
    for (let j = 0; j < ns; j++) {
      rim(j + 1, j); // t = 0 edge
      rim(nt * W + j, nt * W + j + 1); // t = 1 edge
    }
    for (let i = 0; i < nt; i++) {
      rim(i * W, (i + 1) * W); // s = 0 edge
      rim((i + 1) * W + ns, i * W + ns); // s = 1 edge
    }
    this.setIndex(idx);
  }
  update(part: SurfacePart) {
    const { ns, nt, spec } = this;
    const pos = this.attributes.position as THREE.BufferAttribute;
    const uv = this.attributes.uv as THREE.BufferAttribute;
    const W = ns + 1;
    const n = W * (nt + 1);
    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const tile = spec.tile ?? 0.06;
    // metric extents for texture tiling
    const [su, sv] = part.scale(coons(spec, 0.5, 0.5)[0], coons(spec, 0.5, 0.5)[1]);
    const c0 = spec.corners[0], c1 = spec.corners[1], c3 = spec.corners[3];
    const widthM = Math.hypot((c1[0] - c0[0]) * su, (c1[1] - c0[1]) * sv);
    const lengthM = Math.hypot((c3[0] - c0[0]) * su, (c3[1] - c0[1]) * sv);
    for (let i = 0; i <= nt; i++) {
      const t = i / nt;
      for (let j = 0; j <= ns; j++) {
        const s = j / ns;
        const [u, v] = coons(spec, s, t);
        part.sample(u, v, p);
        part.normal(u, v, nrm);
        const dome = Math.pow(Math.sin(Math.PI * s), 0.8) * Math.pow(Math.sin(Math.PI * t), 0.7);
        const edge = 1 - Math.pow(dome, 0.45); // 1 at the rim, 0 in the belly
        const outerDepth = spec.skinOffset + spec.dip * edge;
        // the inner face always lies behind the outer one: a thin rim, a thick belly
        const innerDepth = outerDepth + 0.0008 + spec.bulge * dome;
        const k = i * W + j;
        pos.setXYZ(k, p.x - nrm.x * outerDepth, p.y - nrm.y * outerDepth, p.z - nrm.z * outerDepth);
        pos.setXYZ(n + k, p.x - nrm.x * innerDepth, p.y - nrm.y * innerDepth, p.z - nrm.z * innerDepth);
        uv.setXY(k, (s * widthM) / tile, (t * lengthM) / tile);
        uv.setXY(n + k, (s * widthM) / tile, (t * lengthM) / tile);
      }
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    this.computeVertexNormals();
    this.computeBoundingBox();
    this.computeBoundingSphere();
  }
}
