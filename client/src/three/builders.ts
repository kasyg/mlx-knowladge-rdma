/**
 * Procedural geometry builders. Generic recipes (sweep / ellipsoid / loft) are
 * interpreted directly; "special" recipes use the species rig to build
 * complex parts (skin, skull, ribs, vertebrae, pelvis, digits, organs...).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GeometryRecipe, PointRef, Side, SpeciesPayload, SweepRecipe, LoftRecipe, EllipsoidRecipe, SpecialRecipe, SheetRecipe, CornerRef, Outward } from '@shared/types';
import { BodySurface, skinTrunkLoft, skinNeckLoft, skinHeadLoft, skinLimbSweep, type PartId, type LimbPartId } from './surface.ts';
import { SheetGeometry, type UV } from './sheet.ts';
import type { Rig } from '@shared/rig';
import { resolvePoint } from '@shared/rig';
import { SweepGeometry, profileFn, type V3 } from './sweep.ts';
import { loftGeometry, gridGeometry, ellipsoidGeometry } from './loft.ts';

export type MaterialKey = 'default' | 'dark' | 'eye' | 'hoof' | 'horn' | 'fur' | 'cartilage' | 'pad' | 'tooth' | 'pink' | 'tendonCap' | 'muscleSheet';

export type DynamicPart = { kind: 'sweep'; sweep: SweepGeometry; path: PointRef[] } | { kind: 'sheet'; sheet: SheetGeometry; partId: LimbPartId };

export interface Part {
  geometry: THREE.BufferGeometry;
  material: MaterialKey;
  /** present for soft tissue that follows limb motion */
  dynamic?: DynamicPart;
  pathLength?: number;
  /** rigid attachment to a limb segment (e.g. "fl_L_carpus") for motion */
  segment?: string;
}

export interface BuildCtx {
  rig: Rig;
  H: number;
  payload: SpeciesPayload;
  side: Side | null;
  sgn: number;
  surface: BodySurface;
  resolve: (ref: PointRef) => V3;
  lm: (name: string) => V3;
}

export function makeCtx(rig: Rig, payload: SpeciesPayload, side: Side | null, surface: BodySurface): BuildCtx {
  const S = side ?? 'L';
  return {
    rig,
    H: rig.H,
    payload,
    side,
    sgn: S === 'L' ? 1 : -1,
    surface,
    resolve: (ref) => resolvePoint(ref, rig, side),
    lm: (name) => {
      const p = rig.landmarks[name.replace('{S}', S)];
      if (!p) throw new Error(`Unknown landmark ${name}`);
      return p;
    },
  };
}

// ----------------------------------------------------------------- helpers
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

function outwardVec(o: Outward | undefined, sgn: number): V3 | null {
  if (!o) return null;
  if (Array.isArray(o)) return [o[0], o[1], o[2] * sgn];
  switch (o) {
    case 'lateral':
      return [0, 0, sgn];
    case 'medial':
      return [0, 0, -sgn];
    case 'dorsal':
      return [0, 1, 0];
    case 'ventral':
      return [0, -1, 0];
    case 'cranial':
      return [-1, 0, 0];
    case 'caudal':
      return [1, 0, 0];
  }
  return null;
}

export function sweepPart(points: V3[], radius: (t: number) => number, o: { aspect?: number | ((t: number) => number); outward?: V3 | ((t: number) => V3) | null; closed?: boolean; radial?: number; segments?: number; material?: MaterialKey; caps?: boolean; tension?: number } = {}): Part {
  const g = new SweepGeometry({ points, radius, aspect: o.aspect ?? 1, outward: o.outward ?? null, closed: o.closed, radial: o.radial ?? 12, segments: o.segments ?? 20, caps: o.caps, tension: o.tension });
  return { geometry: g, material: o.material ?? 'default', pathLength: g.length };
}

export function ellPart(at: V3, size: V3, o: { rot?: V3; material?: MaterialKey; detail?: number; n?: number } = {}): Part {
  const g = ellipsoidGeometry(size, o.detail ?? 20, o.n ?? 2);
  if (o.rot) g.rotateX(o.rot[0]), g.rotateY(o.rot[1]), g.rotateZ(o.rot[2]);
  g.translate(at[0], at[1], at[2]);
  return { geometry: g, material: o.material ?? 'default' };
}

function segmentsFor(points: V3[], H: number, min = 8, max = 96) {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += len(sub(points[i], points[i - 1]));
  return Math.max(min, Math.min(max, Math.round(l / (0.012 * H))));
}

function constRadius(r: number) {
  return () => r;
}

// ----------------------------------------------------------- generic recipes
function buildSweep(r: SweepRecipe, ctx: BuildCtx, soft: boolean): Part {
  const H = ctx.H;
  const points = r.path.map((p) => ctx.resolve(p));
  const rr = Array.isArray(r.r) ? r.r.map((v) => v * H) : r.r * H;
  const radius = profileFn(r.profile ?? 'tube', rr, r.rEnds);
  const maxR = Array.isArray(rr) ? Math.max(...rr) : rr;
  const radial = r.radial ?? (maxR > 0.035 * H ? 20 : maxR > 0.015 * H ? 16 : 12);
  const segments = r.segments ?? segmentsFor(points, H, r.closed ? 16 : 8, 96);
  const part = sweepPart(points, radius, { aspect: r.aspect, outward: outwardVec(r.outward, ctx.sgn), closed: r.closed, radial, segments, tension: r.tension });
  if (soft) part.dynamic = { kind: 'sweep', sweep: part.geometry as SweepGeometry, path: r.path };
  return part;
}

const LIMB_DEPTH: Record<number, number> = { 1: 0.4, 2: 0.58, 3: 0.72 };

function buildSheet(r: SheetRecipe, ctx: BuildCtx): Part {
  const H = ctx.H;
  const isLimb = r.part === 'fl' || r.part === 'hl';
  const partId = (isLimb ? `${r.part}_${ctx.side ?? 'L'}` : r.part) as PartId;
  const part = ctx.surface.part(partId);
  const mirror = ctx.side === 'R' && !isLimb;
  const corner = (c: CornerRef | null | undefined): UV | null => {
    if (!c) return null;
    if (Array.isArray(c)) return mirror ? [1 - c[0], c[1]] : [c[0], c[1]];
    const [u, v] = part.uvOf(ctx.lm(c.at));
    const du = mirror ? -(c.du ?? 0) : c.du ?? 0;
    return [u + du, v + (c.dv ?? 0)];
  };
  const corners = r.corners.map((c) => corner(c)!) as [UV, UV, UV, UV];
  const mids = (r.mids ?? []).map((c) => corner(c));
  const layer = r.layer ?? 1;
  const g = new SheetGeometry(part, {
    corners,
    mids,
    bulge: r.bulge * H,
    dip: (r.dip ?? 0.0035) * H,
    skinOffset: 0.0035 * H + (layer - 1) * 0.006 * H,
    tile: 0.05 * H,
    // limb muscles are thick bellies packed around the bones, deeper layers reach closer to them
    depth: r.depth ?? (isLimb ? LIMB_DEPTH[Math.min(3, Math.max(1, layer))] : 0),
  });
  const out: Part = { geometry: g, material: 'muscleSheet' };
  if (isLimb) out.dynamic = { kind: 'sheet', sheet: g, partId: partId as LimbPartId };
  return out;
}

function buildEllipsoid(r: EllipsoidRecipe, ctx: BuildCtx): Part {
  const H = ctx.H;
  const at = ctx.resolve(r.at);
  const size: V3 = [r.size[0] * H, r.size[1] * H, r.size[2] * H];
  return ellPart(at, size, { rot: r.rot ? [r.rot[0], r.rot[1], r.rot[2] * ctx.sgn] : undefined, detail: r.detail, n: r.n });
}

function buildLoft(r: LoftRecipe, ctx: BuildCtx): Part {
  const H = ctx.H;
  const axis = r.axis.map((p) => ctx.resolve(p));
  const secs = r.sections;
  const section = (t: number) => {
    let i = 0;
    while (i < secs.length - 2 && t > secs[i + 1].t) i++;
    const a = secs[i], b = secs[Math.min(i + 1, secs.length - 1)];
    const u = a === b ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    return { w: lerp(a.w, b.w, u) * H, h: lerp(a.h, b.h, u) * H, yOff: lerp(a.yOff ?? 0, b.yOff ?? 0, u) * H, zOff: lerp(a.zOff ?? 0, b.zOff ?? 0, u) * H * ctx.sgn, n: lerp(a.n ?? 2, b.n ?? 2, u), pear: lerp(a.pear ?? 0, b.pear ?? 0, u) };
  };
  const up = outwardVec(r.outward, ctx.sgn) ?? [0, 1, 0];
  const g = loftGeometry({ axis, section, radial: r.radial ?? 24, segments: 24, up, capStart: r.closeEnds ?? true, capEnd: r.closeEnds ?? true });
  return { geometry: g, material: 'default' };
}

export function buildRecipe(recipe: GeometryRecipe, ctx: BuildCtx, soft: boolean): Part[] {
  switch (recipe.type) {
    case 'sweep':
      return [buildSweep(recipe, ctx, soft)];
    case 'ellipsoid':
      return [buildEllipsoid(recipe, ctx)];
    case 'loft':
      return [buildLoft(recipe, ctx)];
    case 'special':
      return buildSpecial(recipe, ctx);
    case 'sheet':
      return [buildSheet(recipe, ctx)];
  }
}

// ------------------------------------------------------------------ section
interface TrunkSec {
  cy: number;
  hh: number;
  hw: number;
  n: number;
  pear: number;
}
function trunkSec(ctx: BuildCtx, x: number, scale = 1): TrunkSec {
  const s = ctx.rig.trunkSection(x);
  return { cy: (s.top + s.bottom) / 2, hh: ((s.top - s.bottom) / 2) * scale, hw: s.w * scale, n: s.n ?? 2.2, pear: s.pear ?? 0.1 };
}
/** point on the trunk section, φ=0 dorsal midline → π ventral midline, on side sgn */
function secPoint(sec: TrunkSec, x: number, phi: number, sgn: number): V3 {
  const e = 2 / sec.n;
  const c = sgnPow(Math.cos(phi), e);
  const s = sgnPow(Math.sin(phi), e);
  return [x, sec.cy + c * sec.hh, sgn * s * sec.hw * (1 - sec.pear * c)];
}

// ------------------------------------------------------------------ specials
const specials: Record<string, (r: SpecialRecipe, ctx: BuildCtx) => Part[]> = {
  skin: buildSkin,
  hooves: buildHooves,
  horns: buildHorns,
  ears: (r, ctx) => buildEars(ctx, r.part === 'cartilage' ? 'cartilage' : 'fur', r.part === 'cartilage' ? 0.9 : 1),
  skull: buildSkull,
  vertebrae: buildVertebrae,
  ribs: buildRibs,
  sternum: buildSternum,
  scapula: buildScapula,
  pelvis: buildPelvis,
  digits: buildDigits,
  ribcage_shell: buildRibcageShell,
  abdominal_wall: buildAbdominalWall,
  diaphragm: buildDiaphragm,
  heart: buildHeart,
  lung: buildLung,
  intestine: buildIntestine,
  brain: buildBrain,
  eyes: buildEyes,
};

function buildSpecial(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const fn = specials[r.name];
  if (!fn) throw new Error(`Unknown special builder ${r.name}`);
  return fn(r, ctx);
}

// ------------------------------------------------------------------ skin
function buildSkin(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const P = rig.params;
  const parts: Part[] = [];
  // trunk, neck and head lofts come from the shared body-surface definitions so muscle sheets coincide with the skin
  parts.push({ geometry: loftGeometry(skinTrunkLoft(rig)), material: 'fur' });
  parts.push({ geometry: loftGeometry(skinNeckLoft(rig)), material: 'fur' });
  parts.push({ geometry: loftGeometry(skinHeadLoft(rig)), material: 'fur' });
  const hd = rig.head;
  for (const S of ['L', 'R'] as Side[]) {
    for (const limb of ['fl', 'hl'] as const) {
      const d = skinLimbSweep(rig, (n) => rig.landmarks[n], limb, S);
      parts.push(sweepPart(d.points, profileFn('taper', d.radii), { radial: 28, segments: limb === 'fl' ? 56 : 60, material: 'fur', aspect: d.aspect, outward: d.outward }));
    }
  }
  parts.push(...buildEars(ctx, 'fur', 1));
  parts.push(...buildTail(ctx));
  // eyes & nose
  for (const S of ['L', 'R'] as Side[]) {
    parts.push(ellPart(rig.landmarks[`skull_eye_${S}`], [P.head.eye.r, P.head.eye.r, P.head.eye.r], { material: 'eye', detail: 16 }));
    const nr = P.head.nostril.r;
    parts.push(ellPart(rig.landmarks[`nostril_${S}`], [nr * 0.9, nr, nr * 0.6], { material: 'dark', detail: 10 }));
  }
  if (P.head.noseLeather) {
    const sec = rig.head.section(0.98);
    parts.push(ellPart(add(rig.landmarks.skull_nose, mul(hd.up, sec.h * 0.25)), [sec.w * 0.45, sec.h * 0.4, sec.w * 0.8], { material: 'dark', detail: 12 }));
  }
  if (P.mane) {
    const neck = ctx.surface.part('neck');
    const nStrands = 15;
    const sc = H / 1.6;
    const out = (u: number, v: number, off: number): V3 => {
      const q = neck.sample(u, v);
      const n = neck.normal(u, v);
      return [q.x + n.x * off, q.y + n.y * off, q.z + n.z * off];
    };
    for (let i = 0; i < nStrands; i++) {
      const v = lerp(0.1, 0.92, i / (nStrands - 1));
      const len = P.mane.length * (0.7 + 0.3 * Math.sin(Math.PI * (i + 0.5) / nStrands));
      const spread = len / 0.12; // fraction of the circumference the strand hangs over
      const pts: V3[] = [out(0.0, v, 0.012 * sc), out(0.985, v, 0.016 * sc), out(0.95 - 0.04 * spread, v + 0.01, 0.018 * sc), out(0.92 - 0.08 * spread, v + 0.02, 0.012 * sc), out(0.9 - 0.11 * spread, v + 0.03, 0.006 * sc)];
      parts.push(sweepPart(pts, profileFn('taper', [0.012 * sc, 0.02 * sc, 0.02 * sc, 0.014 * sc, 0.003 * sc]), { aspect: 0.45, outward: [0, 0, -1], radial: 8, segments: 14, material: 'dark' }));
    }
    if (P.mane.forelock) {
      const poll = rig.landmarks.skull_poll;
      for (const k of [-1, 0, 1]) {
        const a: V3 = add(poll, [0.01 * H, 0.005 * H, k * 0.02 * H]);
        parts.push(sweepPart([a, add(a, [-0.07 * H, -0.01 * H, k * 0.01 * H]), add(a, [-0.14 * H, -0.06 * H, k * 0.025 * H])], profileFn('taper', [0.012 * sc, 0.016 * sc, 0.004 * sc]), { aspect: 0.5, outward: [0, 1, 0], radial: 8, segments: 10, material: 'dark' }));
      }
    }
  }
  if (P.trunk.udder) {
    const u = P.trunk.udder;
    parts.push(ellPart([u.x, u.y, 0], [u.size, u.size * 0.75, u.size * 0.85], { material: 'pink', detail: 18 }));
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.4, 0.4]) parts.push(sweepPart([[u.x + dx * u.size, u.y - u.size * 0.5, dz * u.size], [u.x + dx * u.size, u.y - u.size * 0.95, dz * u.size]], constRadius(u.size * 0.1), { radial: 8, segments: 4, material: 'pink' }));
  }
  if (P.trunk.dewlap) {
    const d = P.trunk.dewlap;
    const a = rig.landmarks.neck_base_ventral, b = rig.landmarks.throat_mid, c = rig.landmarks.neck_top_ventral;
    parts.push(sweepPart([add(a, [0, -0.01, 0]), add(b, [0, -d * 0.5, 0]), add(c, [0, -d * 0.2, 0])], profileFn('taper', [0.03 * H, 0.08 * H, 0.03 * H]), { aspect: 0.3, outward: [0, 0, 1], radial: 12, segments: 14, material: 'fur' }));
  }
  if (P.head.beard) {
    const chin = rig.landmarks.mandible_chin;
    parts.push(sweepPart([add(chin, [0.03 * H, 0, 0]), add(chin, [0.06 * H, -P.head.beard.length, 0])], profileFn('taper', [0.028 * H, 0.004 * H]), { radial: 10, segments: 6, material: 'fur' }));
  }
  return parts;
}

function buildEars(ctx: BuildCtx, material: MaterialKey, scale: number): Part[] {
  const { rig, H } = ctx;
  const ear = rig.params.head.ear;
  const parts: Part[] = [];
  const sides: Side[] = ctx.side ? [ctx.side] : ['L', 'R'];
  for (const S of sides) {
    const sgn = S === 'L' ? 1 : -1;
    const base = rig.landmarks[`skull_ear_${S}`];
    const tip = rig.landmarks[`ear_tip_${S}`];
    const mid = add(lerp3(base, tip, 0.5), [0, 0, sgn * ear.width * 0.25]);
    const w = ear.width * scale;
    const style = ear.style;
    const prof = style === 'cat' || style === 'dog' ? [w * 0.55, w * 0.42, 0.004 * H] : style === 'horse' ? [w * 0.5, w * 0.5, 0.004 * H] : [w * 0.45, w * 0.55, w * 0.2];
    parts.push(sweepPart([base, mid, tip], profileFn('taper', prof), { aspect: 0.28, outward: [0.6, 0, sgn * 0.8], radial: 12, segments: 10, material }));
  }
  return parts;
}

function buildTail(ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const T = rig.params.tail;
  const pts: V3[] = [];
  for (let i = 0; i <= 10; i++) pts.push(rig.tail.point(i / 10));
  const parts: Part[] = [];
  const style = T.style;
  const rEnd = style === 'dog' ? T.r0 * 0.6 : style === 'cat' ? T.r0 * 0.75 : T.r0 * 0.3;
  const prof = [T.r0 * 1.1, T.r0, T.r0 * 0.8, rEnd];
  parts.push(sweepPart(pts, profileFn('taper', prof), { radial: 12, segments: 24, material: style === 'horse' ? 'dark' : 'fur' }));
  if (style === 'horse') {
    const L = T.hairLength ?? 0.4;
    const n = 11;
    for (let i = 0; i < n; i++) {
      const t0 = 0.08 + 0.55 * (i / (n - 1));
      const a = (i / n) * Math.PI * 2 + 0.4;
      const c = rig.tail.point(t0);
      const r0 = T.r0 * (1 - 0.6 * t0);
      const off: V3 = [Math.cos(a) * r0 * 0.9, 0, Math.sin(a) * r0 * 0.9];
      const p0 = add(c, off);
      const sway = Math.sin(i * 1.7) * 0.03 * H;
      const hair: V3[] = [p0, add(p0, [0.01 * H, -L * 0.25, off[2] * 0.6 + sway * 0.3]), add(p0, [0.025 * H, -L * 0.6, off[2] * 0.9 + sway]), add(p0, [0.03 * H, -L * (0.85 + 0.15 * Math.sin(i * 2.3)), off[2] * 1.1 + sway * 1.2])];
      parts.push(sweepPart(hair, profileFn('taper', [0.012 * H, 0.016 * H, 0.014 * H, 0.003 * H]), { aspect: 0.6, outward: [1, 0, 0], radial: 8, segments: 16, material: 'dark' }));
    }
  } else if (style === 'cow') {
    const tip = rig.tail.point(1);
    parts.push(sweepPart([rig.tail.point(0.9), add(tip, [0, -(T.hairLength ?? 0.1) * 0.5, 0]), add(tip, [0.01, -(T.hairLength ?? 0.1), 0])], profileFn('taper', [T.r0 * 0.4, T.r0 * 1.3, T.r0 * 0.4]), { radial: 10, segments: 10, material: 'dark' }));
  }
  return parts;
}

// ----------------------------------------------------------------- hooves
function buildHooves(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const P = rig.params;
  const parts: Part[] = [];
  const S = ctx.side ?? 'L';
  const sgn = ctx.sgn;
  for (const limb of ['fl', 'hl'] as const) {
    const l = (n: string) => rig.landmarks[`${limb}_${S}_${n}`];
    const r = limb === 'fl' ? P.forelimb.r : P.hindlimb.r;
    const coffin = l('coffin');
    const ground = l('hoof');
    const start = parts.length;
    const tagged = () => parts.slice(start).forEach((p) => (p.segment = `${limb}_${S}_pastern`));
    if (P.digits === 'hoof') {
      const top: V3 = [coffin[0], coffin[1] + 0.012 * H, coffin[2]];
      const bot: V3 = [ground[0] - 0.018 * H, 0.002, ground[2]];
      parts.push(sweepPart([top, lerp3(top, bot, 0.5), bot], profileFn('taper', [r.pastern * 1.0, r.pastern * 1.15, r.hoof * 0.98]), { radial: 24, segments: 6, material: 'hoof', aspect: 0.92, outward: [-1, 0, 0] }));
      // bulbs of the heel
      for (const k of [-1, 1]) parts.push(ellPart([top[0] + 0.022 * H, top[1] - 0.004 * H, top[2] + k * r.pastern * 0.42], [0.013 * H, 0.011 * H, 0.011 * H], { material: 'hoof', detail: 10 }));
    } else if (P.digits === 'cloven') {
      for (const k of [-1, 1]) {
        const top: V3 = [coffin[0], coffin[1] + 0.012 * H, coffin[2] + k * r.hoof * 0.42];
        const bot: V3 = [ground[0] - 0.01 * H, 0.002, ground[2] + k * r.hoof * 0.5];
        parts.push(sweepPart([top, bot], profileFn('taper', [r.pastern * 0.62, r.hoof * 0.6]), { radial: 14, segments: 4, material: 'hoof', aspect: 0.9, outward: [-1, 0, 0] }));
      }
      const ses = l('sesamoid');
      for (const k of [-1, 1]) {
        const a: V3 = [ses[0] + 0.02 * H, ses[1] - 0.01 * H, ses[2] + k * 0.028 * H];
        parts.push(sweepPart([a, add(a, [0.012 * H, -0.03 * H, 0])], profileFn('cone', [0.011 * H, 0]), { radial: 8, segments: 4, material: 'hoof' }));
      }
    } else {
      // paw: pads + toes + claws
      const padC: V3 = [ground[0] + 0.012 * H, 0.012 * H, ground[2]];
      parts.push(ellPart(padC, [0.045 * H, 0.016 * H, 0.038 * H], { material: 'pad', detail: 14 }));
      const nToes = 4;
      for (let k = 0; k < nToes; k++) {
        const off = (k - (nToes - 1) / 2) * 0.02 * H;
        const toe: V3 = [ground[0] - 0.045 * H + Math.abs(off) * 0.4, 0.014 * H, ground[2] + off * sgn];
        parts.push(ellPart(toe, [0.018 * H, 0.014 * H, 0.011 * H], { material: 'fur', detail: 10 }));
        parts.push(ellPart(add(toe, [0, -0.008 * H, 0]), [0.012 * H, 0.006 * H, 0.009 * H], { material: 'pad', detail: 8 }));
        const claw: V3 = add(toe, [-0.016 * H, -0.003 * H, 0]);
        parts.push(sweepPart([claw, add(claw, [-0.014 * H, -0.008 * H, 0])], profileFn('cone', [0.004 * H, 0]), { radial: 8, segments: 4, material: 'hoof' }));
      }
    }
    tagged();
  }
  return parts;
}

function buildHorns(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig } = ctx;
  const h = rig.params.head.horns;
  if (!h) return [];
  const S = ctx.side ?? 'L';
  const base = rig.landmarks[`horn_base_${S}`], mid = rig.landmarks[`horn_mid_${S}`], tip = rig.landmarks[`horn_tip_${S}`];
  return [sweepPart([base, mid, tip], profileFn('taper', [h.r, h.r * 0.75, h.r * 0.18]), { radial: 14, segments: 16, material: 'horn' })];
}

// ------------------------------------------------------------------ skull
function buildSkull(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const hd = rig.head;
  const P = rig.params.head;
  const k = P.skullScale;
  const parts: Part[] = [];
  if (r.part === 'cranium') {
    const axis: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = lerp(-0.02, 0.985, i / 10);
      const sec = rig.head.section(Math.max(0, t));
      const lift = t > 0.3 ? sec.h * 0.16 : sec.h * 0.16 * (t / 0.3);
      axis.push(add(add(hd.origin, mul(hd.dir, t * hd.length)), mul(hd.up, (sec.yOff ?? 0) + lift)));
    }
    parts.push({
      geometry: loftGeometry({
        axis,
        section: (t) => {
          const tt = lerp(-0.02, 0.985, t);
          const sec = rig.head.section(Math.max(0, tt));
          const hk = tt < 0.3 ? 0.95 : 0.72 + 0.23 * Math.max(0, 1 - (tt - 0.3) / 0.15);
          // cranium is rounded, the facial part is prismatic (flat nasal dorsum, flat palate)
          const n = tt < 0.3 ? 2.1 : 2.1 + 0.8 * Math.min(1, (tt - 0.3) / 0.2);
          return { w: sec.w * k * (tt > 0.3 ? 0.9 : 1), h: sec.h * k * hk, n, pear: tt > 0.35 ? 0.12 : 0 };
        },
        up: hd.up,
        segments: 30,
        radial: 32,
      }),
      material: 'default',
    });
    for (const S of ['L', 'R'] as Side[]) {
      const sgn = S === 'L' ? 1 : -1;
      const orbit = rig.landmarks[`skull_orbit_${S}`];
      const er = P.eye.r * 1.35;
      const torus = new THREE.TorusGeometry(er, 0.004 * H, 8, 24);
      torus.translate(orbit[0], orbit[1], orbit[2]);
      parts.push({ geometry: torus, material: 'default' });
      const zy = rig.landmarks[`skull_zygoma_${S}`];
      const tmj = rig.landmarks[`skull_tmj_${S}`];
      parts.push(sweepPart([add(orbit, [0.012 * H, -er * 0.9, sgn * 0.004 * H]), add(zy, [0, 0.005 * H, 0]), add(tmj, [0, 0.012 * H, 0])], constRadius(0.008 * H), { radial: 8, segments: 10, aspect: 0.6, outward: [0, 0, sgn] }));
      parts.push(ellPart(add(rig.landmarks[`skull_mastoid_${S}`], [0, 0, -sgn * 0.006 * H]), [0.01 * H, 0.01 * H, 0.007 * H], { detail: 10 }));
      if (ctx.payload.meta.id === 'horse' || ctx.payload.meta.id === 'cow') {
        // facial crest: a sharp ridge running rostrally from below the orbit along the maxilla
        const s6 = rig.head.section(0.62), s5 = rig.head.section(0.5);
        const crestEnd = add(add(hd.origin, mul(hd.dir, 0.64 * hd.length)), add(mul(hd.up, (s6.yOff ?? 0) - s6.h * k * 0.3), [0, 0, sgn * s6.w * k * 0.98]));
        const crestMid = add(add(hd.origin, mul(hd.dir, 0.52 * hd.length)), add(mul(hd.up, (s5.yOff ?? 0) - s5.h * k * 0.22), [0, 0, sgn * s5.w * k * 1.0]));
        parts.push(sweepPart([add(zy, [0, -0.002 * H, sgn * 0.004 * H]), crestMid, crestEnd], profileFn('taper', [0.007 * H, 0.006 * H, 0.003 * H]), { radial: 8, segments: 10, aspect: 0.55, outward: [0, 0, sgn] }));
      }
      // dark recess suggesting the orbit cavity
      parts.push(ellPart(add(orbit, [0, 0, -sgn * er * 0.25]), [er * 0.8, er * 0.8, er * 0.6], { material: 'pad', detail: 14 }));
    }
    // nasal aperture (dark) and the nuchal/sagittal crest
    {
      const secN = rig.head.section(0.9);
      const tipN = add(add(hd.origin, mul(hd.dir, 0.93 * hd.length)), mul(hd.up, (secN.yOff ?? 0) + secN.h * k * 0.35));
      parts.push(ellPart(tipN, [secN.w * k * 0.5, secN.h * k * 0.3, secN.w * k * 0.55], { material: 'pad', detail: 12 }));
      const c0 = add(add(hd.origin, mul(hd.dir, 0.02 * hd.length)), mul(hd.up, rig.head.section(0.02).h * k * 1.05));
      const c1 = add(add(hd.origin, mul(hd.dir, 0.3 * hd.length)), mul(hd.up, rig.head.section(0.3).h * k * 1.05 + rig.head.section(0.3).h * 0.16));
      parts.push(sweepPart([c0, c1], profileFn('taper', [0.006 * H, 0.004 * H]), { radial: 6, segments: 6, aspect: 1.4, outward: [0, 0, 1] }));
    }
    // occipital condyles
    parts.push(ellPart(add(hd.origin, [0.01 * H, -0.01 * H, 0]), [0.015 * H, 0.014 * H, 0.03 * H], { detail: 12 }));
  } else if (r.part === 'mandible') {
    const L = rig.landmarks;
    const pts: V3[] = [L.skull_tmj_L, L.mandible_angle_L, L.mandible_body_L, add(L.mandible_symphysis, [0, 0, 0.02 * H]), L.mandible_chin, add(L.mandible_symphysis, [0, 0, -0.02 * H]), L.mandible_body_R, L.mandible_angle_R, L.skull_tmj_R];
    const th = P.jaw.thickness;
    const prof = [0.03 * H, 0.045 * H, 0.03 * H, 0.022 * H, 0.016 * H, 0.022 * H, 0.03 * H, 0.045 * H, 0.03 * H];
    const g = new SweepGeometry({ points: pts, radius: profileFn('taper', prof), aspect: th / (0.035 * H), outward: (t) => [0, 0, t < 0.5 ? 1 : -1], radial: 12, segments: 40, tension: 0.4 });
    parts.push({ geometry: g, material: 'default' });
    for (const S of ['L', 'R'] as Side[]) {
      const sgn = S === 'L' ? 1 : -1;
      const tmj = rig.landmarks[`skull_tmj_${S}`];
      parts.push(ellPart(add(tmj, [0, 0, -sgn * 0.004 * H]), [0.012 * H, 0.009 * H, 0.011 * H], { detail: 10 }));
      parts.push(sweepPart([add(tmj, [-0.035 * H, -0.01 * H, sgn * -0.002 * H]), add(tmj, [-0.045 * H, 0.035 * H, 0])], profileFn('taper', [0.014 * H, 0.004 * H]), { radial: 8, segments: 4, aspect: 0.4, outward: [0, 0, sgn] }));
      // ramus: a broad, thin vertical plate from the angle of the jaw up to the joint
      const angle = rig.landmarks[`mandible_angle_${S}`];
      const ramusAxis: V3[] = [add(angle, [0.005 * H, 0.0, sgn * 0.002 * H]), lerp3(angle, tmj, 0.5), add(tmj, [-0.01 * H, -0.008 * H, 0])];
      const ramusW = len(sub(tmj, angle)) * 0.42;
      parts.push({
        geometry: loftGeometry({
          axis: ramusAxis,
          section: (t) => ({ w: ramusW * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + (t < 0.15 ? 0.3 * (0.15 - t) / 0.15 : 0)), h: 0.005 * H + th * 0.25 * (1 - t), n: 2.8 }),
          up: [0, 0, sgn],
          segments: 12,
          radial: 20,
        }),
        material: 'default',
      });
    }
  } else if (r.part === 'teeth' || r.part === 'incisors' || r.part === 'canines' || r.part === 'premolars' || r.part === 'molars') {
    const secTop = (t: number) => rig.head.section(t);
    const put = (t: number, upOff: number, z: number, size: V3) => {
      // a tooth is a rounded block; the hypsodont (high-crowned) cheek teeth are tall, most of the crown buried in the jaw
      const p = add(add(hd.origin, mul(hd.dir, t * hd.length)), mul(hd.up, upOff));
      const g = ellipsoidGeometry([size[0] / 2, size[1] / 2, size[2] / 2], 10, 3.2);
      g.translate(p[0], p[1], p[2] + z);
      parts.push({ geometry: g, material: 'tooth' });
    };
    const sp = ctx.payload.meta.id;
    const want = r.part;
    const hypsodont = sp === 'horse' || sp === 'cow' || sp === 'goat';
    const counts = sp === 'cat' ? { p: 3, m: 1 } : sp === 'dog' ? { p: 4, m: 2 } : { p: 3, m: 3 };
    const cheekN = counts.p + counts.m;
    if (want === 'teeth' || want === 'premolars' || want === 'molars') {
      for (let i = 0; i < cheekN; i++) {
        const isMolar = i >= counts.p;
        if (want === 'premolars' && isMolar) continue;
        if (want === 'molars' && !isMolar) continue;
        const t = lerp(0.5, 0.78, i / Math.max(1, cheekN - 1));
        const sec = secTop(t);
        const z = sec.w * k * 0.72;
        const upperY = (sec.yOff ?? 0) - sec.h * k * 0.58;
        const lowerY = upperY - 0.022 * H;
        const tw = hypsodont ? 0.017 * H : 0.014 * H, td = hypsodont ? 0.013 * H : 0.01 * H;
        const crown = hypsodont ? 0.034 * H : 0.018 * H; // the hypsodont cheek tooth is ~8 cm long, most of it reserve crown
        put(t, upperY + (hypsodont ? 0.006 * H : 0), z, [tw, crown, td]);
        put(t, upperY + (hypsodont ? 0.006 * H : 0), -z, [tw, crown, td]);
        put(t, lowerY - (hypsodont ? 0.006 * H : 0), z * 0.9, [tw, crown, td]);
        put(t, lowerY - (hypsodont ? 0.006 * H : 0), -z * 0.9, [tw, crown, td]);
      }
    }
    if (want === 'teeth' || want === 'incisors') {
      const secN = secTop(0.92);
      const incUpper = sp === 'cow' || sp === 'goat' ? 0 : 3;
      const lowerN = sp === 'cow' || sp === 'goat' ? 4 : 3; // ruminants: 3 incisors + the incisiform canine
      for (let i = -lowerN + 1; i <= lowerN - 1; i += 1) {
        const z = (i / 2) * secN.w * k * 0.28;
        const yU = (secN.yOff ?? 0) - secN.h * k * 0.45;
        if (incUpper && Math.abs(i) <= 2) put(0.92, yU, z, [0.008 * H, hypsodont ? 0.024 * H : 0.013 * H, 0.007 * H]);
        put(0.91, yU - 0.015 * H, z * 0.95, [0.008 * H, hypsodont ? 0.024 * H : 0.013 * H, 0.007 * H]);
      }
    }
    if ((want === 'teeth' || want === 'canines') && (sp === 'dog' || sp === 'cat' || sp === 'horse')) {
      const secC = secTop(sp === 'horse' ? 0.86 : 0.9);
      const z = secC.w * k * 0.62;
      const y = (secC.yOff ?? 0) - secC.h * k * 0.55;
      const t = sp === 'horse' ? 0.86 : 0.9;
      put(t, y, z, [0.009 * H, 0.026 * H, 0.009 * H]);
      put(t, y, -z, [0.009 * H, 0.026 * H, 0.009 * H]);
      put(t + 0.005, y - 0.01 * H, z * 0.9, [0.009 * H, 0.024 * H, 0.009 * H]);
      put(t + 0.005, y - 0.01 * H, -z * 0.9, [0.009 * H, 0.024 * H, 0.009 * H]);
    }
  }
  return parts;
}

// -------------------------------------------------------------- vertebrae
function buildVertebrae(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const sp = rig.spine;
  const chain = [...sp.cervical, ...sp.thoracic, ...sp.lumbar, ...sp.sacral, ...sp.caudal];
  const nC = sp.cervical.length, nT = sp.thoracic.length, nL = sp.lumbar.length, nS = sp.sacral.length;
  const segOf = (i: number) => (i < nC ? 'cervical' : i < nC + nT ? 'thoracic' : i < nC + nT + nL ? 'lumbar' : i < nC + nT + nL + nS ? 'sacral' : 'caudal');
  const parts: Part[] = [];
  const tangent = (i: number): V3 => norm(sub(chain[Math.min(chain.length - 1, i + 1)].p, chain[Math.max(0, i - 1)].p));
  const spacing = (i: number) => (len(sub(chain[Math.min(chain.length - 1, i + 1)].p, chain[Math.max(0, i - 1)].p)) / (i === 0 || i === chain.length - 1 ? 1 : 2)) || 0.02 * H;
  const want = r.part;
  for (let i = 0; i < chain.length; i++) {
    const seg = segOf(i);
    const v = chain[i];
    const T = tangent(i);
    let up: V3 = [-T[1], T[0], 0];
    if (up[1] < 0) up = mul(up, -1);
    if (Math.abs(T[0]) < 1e-3 && Math.abs(T[1]) < 1e-3) up = [0, 1, 0];
    const gap = spacing(i);
    const isAtlas = i === 0, isAxis = i === 1;
    if (want === 'discs') {
      if (i === 0) continue;
      const prev = chain[i - 1];
      const mid = lerp3(prev.p, v.p, 0.5);
      const d = norm(sub(v.p, prev.p));
      const rr = Math.min(prev.r, v.r) * 1.05;
      parts.push(sweepPart([add(mid, mul(d, -gap * 0.12)), add(mid, mul(d, gap * 0.12))], constRadius(rr), { radial: 12, segments: 2, aspect: 0.9, outward: [0, 1, 0], material: 'cartilage' }));
      continue;
    }
    const match = (want === 'atlas' && isAtlas) || (want === 'axis' && isAxis) || (want === 'cervical' && seg === 'cervical' && !isAtlas && !isAxis) || (want === seg && seg !== 'cervical');
    if (!match) continue;
    const bodyR = v.r;
    const bl = gap * 0.36;
    if (!isAtlas) parts.push(sweepPart([add(v.p, mul(T, -bl)), add(v.p, mul(T, bl))], profileFn('bone', [bodyR, bodyR * 0.86, bodyR]), { radial: 12, segments: 6, aspect: 0.9, outward: up }));
    if (isAtlas) {
      const ring = new THREE.TorusGeometry(bodyR * 1.1, bodyR * 0.45, 8, 20);
      // orient ring around the tangent
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(T[0], T[1], T[2]));
      ring.applyQuaternion(q);
      ring.translate(v.p[0], v.p[1], v.p[2]);
      parts.push({ geometry: ring, material: 'default' });
      for (const s of [-1, 1]) parts.push(ellPart(add(v.p, [0, -0.005 * H, s * (v.trans * 0.7)]), [0.03 * H, 0.008 * H, v.trans * 0.6], { detail: 12 }));
      continue;
    }
    // spinous process
    if (v.spine > 0.004 * H) {
      const tilt = seg === 'thoracic' ? 0.25 : seg === 'lumbar' ? -0.12 : 0;
      const base = add(v.p, mul(up, bodyR * 0.7));
      const tip = add(add(base, mul(up, v.spine)), mul(T, tilt * v.spine));
      const w = isAxis ? 0.03 * H : seg === 'thoracic' ? 0.014 * H : 0.012 * H;
      parts.push(sweepPart([base, tip], profileFn('taper', [w, w * 0.75]), { radial: 8, segments: 4, aspect: isAxis ? 0.25 : 0.4, outward: [0, 0, 1] }));
    }
    // transverse processes
    if (v.trans > 0.01 * H && seg !== 'sacral') {
      for (const s of [-1, 1]) {
        const base = add(v.p, [0, 0, s * bodyR * 0.5]);
        const tip: V3 = add(base, [seg === 'lumbar' ? -0.01 * H : 0.005 * H, seg === 'thoracic' ? 0.01 * H : 0, s * v.trans]);
        const w = seg === 'lumbar' ? 0.016 * H : 0.008 * H;
        parts.push(sweepPart([base, tip], profileFn('taper', [w, w * 0.8]), { radial: 8, segments: 3, aspect: seg === 'lumbar' ? 0.3 : 0.5, outward: [0, 1, 0] }));
      }
    }
    if (seg === 'sacral' && i === nC + nT + nL) {
      for (const s of [-1, 1]) parts.push(ellPart(add(v.p, [0.01 * H, 0.01 * H, s * 0.05 * H]), [0.035 * H, 0.012 * H, 0.04 * H], { detail: 12 }));
    }
    if (isAxis) {
      parts.push(sweepPart([add(v.p, mul(T, -bl)), add(v.p, mul(T, -bl - 0.02 * H))], profileFn('cone', [bodyR * 0.45, 0]), { radial: 8, segments: 3 }));
    }
  }
  return parts;
}

// -------------------------------------------------------------------- ribs
function ribPhiEnd(i: number, nT: number, sternal: number) {
  if (i < sternal) return Math.PI - 0.22;
  return Math.PI - 0.22 - 0.85 * ((i - sternal + 1) / (nT - sternal + 1));
}
function buildRibs(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const th = rig.spine.thoracic;
  const nT = th.length;
  const st = rig.params.trunk.sternum;
  const sternal = rig.params.trunk.ribcage.sternalRibs;
  const scale = rig.params.trunk.ribcage.scale;
  const parts: Part[] = [];
  for (let i = 0; i < nT; i++) {
    const p = th[i].p;
    const x0 = p[0];
    const sec = trunkSec(ctx, x0, scale * (i === 0 ? 0.8 : i === 1 ? 0.92 : 1));
    const phi0 = 0.2;
    const phiEnd = ribPhiEnd(i, nT, sternal);
    const phiSplit = phi0 + (phiEnd - phi0) * 0.72;
    const slant = 0.06 * H;
    const pt = (phi: number): V3 => {
      const q = secPoint(sec, x0 + slant * Math.sin(phi) * (0.3 + 0.7 * (i / nT)), phi, sgn);
      return q;
    };
    const center: V3 = [x0, sec.cy, 0];
    if (r.part === 'bone') {
      const pts: V3[] = [];
      const N = 7;
      for (let k = 0; k <= N; k++) pts.push(pt(lerp(phi0, phiSplit, k / N)));
      pts[0] = add(p, [0, -0.005 * H, sgn * th[i].r * 0.9]);
      const width = 0.011 * H * (i === 0 ? 0.8 : 1);
      parts.push(sweepPart(pts, profileFn('taper', [width * 0.9, width, width, width * 0.85]), { aspect: 0.55, outward: (t) => norm(sub(pt(lerp(phi0, phiSplit, t)), center)), radial: 8, segments: 22 }));
    } else {
      const pts: V3[] = [];
      const N = 4;
      for (let k = 0; k <= N; k++) pts.push(pt(lerp(phiSplit, phiEnd, k / N)));
      if (i < sternal) {
        const sx = lerp(st.front.x, st.back.x, sternal === 1 ? 0 : i / (sternal - 1));
        const sy = lerp(st.front.y, st.back.y, sternal === 1 ? 0 : i / (sternal - 1));
        pts.push([sx, sy + 0.012 * H, sgn * 0.014 * H]);
      } else {
        const last = pts[pts.length - 1];
        pts.push(add(last, [-0.06 * H * ((i - sternal + 1) / (nT - sternal + 1)), -0.02 * H, -sgn * 0.01 * H]));
      }
      parts.push(sweepPart(pts, constRadius(0.008 * H), { aspect: 0.6, outward: (t) => norm(sub(pt(lerp(phiSplit, phiEnd, Math.min(1, t * 1.2))), center)), radial: 8, segments: 14, material: 'cartilage' }));
    }
  }
  return parts;
}

function buildSternum(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const st = rig.params.trunk.sternum;
  const horse = ctx.payload.meta.id === 'horse';
  const a: V3 = [st.front.x - 0.025 * H, st.front.y + 0.012 * H, 0];
  const m: V3 = [lerp(st.front.x, st.back.x, 0.5), lerp(st.front.y, st.back.y, 0.5) - 0.004 * H, 0];
  const b: V3 = [st.back.x, st.back.y, 0];
  return [sweepPart([a, m, b], profileFn('taper', [0.014 * H, 0.02 * H, 0.012 * H]), { aspect: horse ? 1.5 : 0.8, outward: [0, -1, 0], radial: 12, segments: 16 })];
}

// ----------------------------------------------------------------- scapula
function buildScapula(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const S = ctx.side ?? 'L';
  const f = (n: string) => rig.landmarks[`fl_${S}_${n}`];
  const top = f('scapula_top'), sh = f('shoulder'), cr = f('scapula_cranial'), cd = f('scapula_caudal');
  const parts: Part[] = [];
  const width = len(sub(cd, cr)) * 0.5;
  if (r.part === 'blade') {
    const axis: V3[] = [add(top, [0, 0.0, 0]), lerp3(top, sh, 0.5), add(sh, [0, 0.01 * H, 0])];
    parts.push({
      geometry: loftGeometry({
        axis,
        section: (t) => ({ w: width * (t < 0.1 ? 0.85 + 1.5 * t : t < 0.55 ? 1 - (t - 0.1) * 0.45 : t < 0.85 ? 0.8 - (t - 0.55) * 1.4 : 0.38 + (t - 0.85) * 0.6), h: 0.0055 * H + (t > 0.85 ? (t - 0.85) * 0.08 * H : 0), n: 2.6 }),
        up: [0, 0, sgn],
        segments: 20,
        radial: 24,
      }),
      material: 'default',
    });
    // spine of the scapula (ridge)
    const a = add(lerp3(cr, cd, 0.45), [0, -0.01 * H, sgn * 0.006 * H]);
    const b = add(lerp3(top, sh, 0.78), [-0.01 * H, 0.0, sgn * 0.008 * H]);
    parts.push(sweepPart([a, lerp3(a, b, 0.5), b], profileFn('taper', [0.005 * H, 0.012 * H, 0.008 * H]), { aspect: 1.7, outward: [0, 0, sgn], radial: 8, segments: 10 }));
    if (ctx.payload.meta.id === 'dog' || ctx.payload.meta.id === 'cat') parts.push(ellPart(f('acromion'), [0.012 * H, 0.012 * H, 0.01 * H], { detail: 10 }));
    parts.push(ellPart(sh, [0.026 * H, 0.02 * H, 0.026 * H], { detail: 14 }));
  } else {
    const a = add(cr, [0, 0.004 * H, 0]), m = add(top, [0, 0.02 * H, 0]), b = add(cd, [0.01 * H, 0.008 * H, 0]);
    parts.push(sweepPart([a, m, b], profileFn('taper', [0.01 * H, 0.03 * H, 0.012 * H]), { aspect: 0.14, outward: [0, 0, sgn], radial: 10, segments: 14, material: 'cartilage' }));
  }
  return parts;
}

// ------------------------------------------------------------------ pelvis
function buildPelvis(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const S = ctx.side ?? 'L';
  const h = (n: string) => rig.landmarks[`hl_${S}_${n}`];
  const tc = h('tuber_coxae'), hip = h('hip'), ti = h('tuber_ischii');
  const sac = rig.landmarks.sacrum;
  const parts: Part[] = [];
  const ts: V3 = [sac[0] - 0.02 * H, sac[1] + 0.02 * H, sgn * 0.045 * H];
  // ilium wing: sweep from tuber sacrale across tuber coxae down to the acetabulum
  parts.push(sweepPart([ts, lerp3(ts, tc, 0.5), tc, lerp3(tc, hip, 0.5), add(hip, [0, 0.015 * H, 0])], profileFn('taper', [0.03 * H, 0.04 * H, 0.045 * H, 0.035 * H, 0.03 * H]), { aspect: 0.25, outward: [0, 0.4, sgn * 0.9], radial: 10, segments: 18 }));
  parts.push(sweepPart([add(hip, [0.01 * H, -0.01 * H, 0]), lerp3(hip, ti, 0.5), ti], profileFn('taper', [0.028 * H, 0.025 * H, 0.03 * H]), { aspect: 0.45, outward: [0, 0, sgn], radial: 10, segments: 10 }));
  parts.push(sweepPart([add(hip, [0, -0.03 * H, 0]), [rig.landmarks.pubis[0], rig.landmarks.pubis[1], sgn * 0.01 * H]], profileFn('taper', [0.016 * H, 0.014 * H]), { aspect: 0.5, outward: [0, -1, 0], radial: 8, segments: 6 }));
  parts.push(sweepPart([add(ti, [0, -0.015 * H, 0]), [rig.landmarks.pubis[0] + 0.1 * H, rig.landmarks.pubis[1] + 0.01 * H, sgn * 0.01 * H]], profileFn('taper', [0.016 * H, 0.014 * H]), { aspect: 0.5, outward: [0, -1, 0], radial: 8, segments: 6 }));
  parts.push(ellPart(hip, [0.03 * H, 0.03 * H, 0.025 * H], { detail: 14 }));
  parts.push(ellPart(tc, [0.02 * H, 0.016 * H, 0.014 * H], { detail: 12 }));
  parts.push(ellPart(ti, [0.02 * H, 0.016 * H, 0.016 * H], { detail: 12 }));
  return parts;
}

// ------------------------------------------------------------------ digits
function buildDigits(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const S = ctx.side ?? 'L';
  const limb = r.limb ?? 'fl';
  const l = (n: string) => rig.landmarks[`${limb}_${S}_${n}`];
  const digits = rig.params.digits;
  const parts: Part[] = [];
  const joint2 = limb === 'fl' ? l('carpus') : l('hock');
  if (r.part === 'carpus') {
    for (const row of [0.012, -0.012]) for (const off of [-0.02, 0, 0.02]) parts.push(ellPart(add(joint2, [0, row * H, sgn * off * H]), [0.014 * H, 0.011 * H, 0.012 * H], { detail: 10 }));
    parts.push(ellPart(l('accessory_carpal'), [0.011 * H, 0.016 * H, 0.011 * H], { detail: 10 }));
  } else if (r.part === 'tarsus') {
    parts.push(ellPart(add(joint2, [-0.008 * H, 0.012 * H, 0]), [0.02 * H, 0.018 * H, 0.022 * H], { detail: 12 }));
    for (const off of [-0.018, 0, 0.018]) parts.push(ellPart(add(joint2, [-0.004 * H, -0.016 * H, sgn * off * H]), [0.014 * H, 0.01 * H, 0.012 * H], { detail: 10 }));
  } else if (r.part === 'metacarpus') {
    const top = add(joint2, [0, -0.022 * H, 0]);
    const bot = add(l('fetlock'), [0, 0.014 * H, 0]);
    if (digits === 'hoof') {
      parts.push(sweepPart([top, lerp3(top, bot, 0.5), bot], profileFn('bone', [0.022 * H, 0.014 * H, 0.02 * H]), { radial: 12, segments: 12 }));
      // proximal articular surface (flat, broad) and the distal condyle with its sagittal ridge
      parts.push(ellPart(add(top, [0.002 * H, 0.003 * H, 0]), [0.024 * H, 0.011 * H, 0.026 * H], { detail: 14, n: 2.6 }));
      parts.push(ellPart(add(bot, [0, -0.004 * H, 0]), [0.02 * H, 0.017 * H, 0.024 * H], { detail: 14, n: 2.2 }));
      parts.push(ellPart(add(bot, [0.002 * H, -0.006 * H, 0]), [0.021 * H, 0.019 * H, 0.0045 * H], { detail: 12, n: 2.2 }));
      // the splint bones (MC/MT II and IV) of the horse are structures of their own (skeleton.ts)
    } else if (digits === 'cloven') {
      parts.push(sweepPart([top, lerp3(top, bot, 0.5), bot], profileFn('bone', [0.023 * H, 0.016 * H, 0.024 * H]), { radial: 12, segments: 12, aspect: 0.8, outward: [-1, 0, 0] }));
      for (const off of [-0.012, 0.012]) parts.push(ellPart(add(bot, [0, -0.004 * H, sgn * off * H]), [0.012 * H, 0.012 * H, 0.01 * H], { detail: 10 }));
    } else {
      const n = limb === 'fl' ? 5 : 4;
      for (let k = 0; k < n; k++) {
        const idx = limb === 'fl' ? k : k + 1;
        const spread = (idx - 2) * 0.012 * H;
        const a = add(top, [0, 0, -sgn * spread]);
        const isDew = limb === 'fl' && k === 0;
        const b = add(l('fetlock'), [isDew ? 0.01 * H : 0, isDew ? 0.04 * H : 0.012 * H, -sgn * spread * 1.5]);
        parts.push(sweepPart([a, b], profileFn('bone', [0.007 * H, 0.005 * H, 0.006 * H]), { radial: 8, segments: 8 }));
      }
    }
  } else if (r.part === 'sesamoids') {
    for (const off of [-0.012, 0.012]) parts.push(ellPart(add(l('sesamoid'), [0, 0, sgn * off * H]), [0.008 * H, 0.013 * H, 0.0075 * H], { detail: 12, n: 2.6, rot: [0, 0, 0.35] }));
  } else if (r.part === 'phalanges') {
    const fet = l('fetlock'), past = l('pastern'), cof = l('coffin'), toe = l('toe');
    if (digits === 'cloven') {
      for (const off of [-0.014, 0.014]) {
        const o: V3 = [0, 0, sgn * off * H];
        parts.push(sweepPart([add(fet, o), add(past, o)], profileFn('bone', [0.013 * H, 0.009 * H, 0.011 * H]), { radial: 8, segments: 6 }));
        parts.push(sweepPart([add(past, o), add(cof, o)], profileFn('bone', [0.011 * H, 0.009 * H, 0.01 * H]), { radial: 8, segments: 4 }));
        parts.push(ellPart(add(cof, add(o, [-0.01 * H, -0.014 * H, 0])), [0.018 * H, 0.011 * H, 0.009 * H], { detail: 10, rot: [0, 0, 0.3] }));
      }
      for (const off of [-0.03, 0.03]) parts.push(ellPart(add(l('sesamoid'), [0.015 * H, -0.012 * H, sgn * off * H]), [0.007 * H, 0.012 * H, 0.006 * H], { detail: 8 }));
    } else {
      const n = limb === 'fl' ? 5 : 4;
      for (let k = 0; k < n; k++) {
        const idx = limb === 'fl' ? k : k + 1;
        const spread = (idx - 2) * 0.018 * H;
        const isDew = limb === 'fl' && k === 0;
        if (isDew) {
          const a = add(fet, [0.01 * H, 0.04 * H, -sgn * spread]);
          parts.push(sweepPart([a, add(a, [-0.012 * H, -0.02 * H, 0])], profileFn('bone', [0.005 * H, 0.004 * H, 0.004 * H]), { radial: 6, segments: 4 }));
          continue;
        }
        const o: V3 = [0, 0, -sgn * spread];
        const p1a = add(fet, add(o, [0, 0.012 * H, 0]));
        const p1b = add(past, o);
        const p2b = add(toe, add(o, [0.01 * H, 0.01 * H, 0]));
        parts.push(sweepPart([p1a, p1b], profileFn('bone', [0.006 * H, 0.0045 * H, 0.0055 * H]), { radial: 8, segments: 6 }));
        parts.push(sweepPart([p1b, p2b], profileFn('bone', [0.0055 * H, 0.004 * H, 0.005 * H]), { radial: 8, segments: 6 }));
        parts.push(sweepPart([p2b, add(p2b, [-0.016 * H, -0.006 * H, 0])], profileFn('cone', [0.0045 * H, 0]), { radial: 6, segments: 4 }));
      }
    }
  } else if (r.part === 'p3') {
    const cof = l('coffin');
    parts.push(ellPart(add(cof, [-0.008 * H, -0.02 * H, 0]), [0.03 * H, 0.014 * H, 0.03 * H], { detail: 16, rot: [0, 0, 0.35] }));
  }
  const segByPart: Record<string, string> = { carpus: 'carpus', tarsus: 'hock', metacarpus: limb === 'fl' ? 'carpus' : 'hock', sesamoids: 'fetlock', phalanges: 'fetlock', p3: 'pastern' };
  const seg = segByPart[r.part ?? ''];
  if (seg) parts.forEach((p) => (p.segment = `${limb}_${S}_${seg}`));
  return parts;
}

// -------------------------------------------------------- shells and walls
function buildRibcageShell(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const th = rig.spine.thoracic;
  const nT = th.length;
  const sternal = rig.params.trunk.ribcage.sternalRibs;
  const scale = rig.params.trunk.ribcage.scale * 0.93;
  const x0 = th[0].p[0], x1 = th[nT - 1].p[0];
  const g = gridGeometry(24, 18, (u, v) => {
    const x = lerp(x0, x1, u);
    const i = u * (nT - 1);
    const sec = trunkSec(ctx, x, scale * (u < 0.1 ? 0.85 + 1.5 * u : 1));
    const phiEnd = ribPhiEnd(Math.round(i), nT, sternal) - 0.1;
    const phi = lerp(0.3, phiEnd, v);
    return secPoint(sec, x + 0.04 * H * Math.sin(phi), phi, sgn);
  });
  return [{ geometry: g, material: 'default' }];
}

function buildAbdominalWall(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const depth = r.part === 'external' ? 0.9 : r.part === 'internal' ? 0.85 : 0.8;
  const xA = rig.landmarks.t_last[0] - (r.part === 'internal' ? -0.05 * H : 0.08 * H);
  const xB = rig.landmarks.pubis[0] - (r.part === 'internal' ? 0.02 * H : 0.06 * H);
  const g = gridGeometry(16, 16, (u, v) => {
    const x = lerp(xA, xB, u);
    const sec = trunkSec(ctx, x, depth);
    const phi = lerp(r.part === 'internal' ? 0.6 : 0.38, Math.PI - 0.04, v);
    return secPoint(sec, x, phi, sgn);
  });
  return [{ geometry: g, material: 'default' }];
}

function buildDiaphragm(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const L = rig.landmarks;
  const apex = L.diaphragm_apex;
  const xD = L.diaphragm_dorsal[0], xV = L.diaphragm_ventral[0];
  const scale = rig.params.trunk.ribcage.scale * 0.9;
  const g = gridGeometry(14, 40, (s, v) => {
    const phi = v * Math.PI * 2;
    // rim: φ from the dorsal midline around the left side to the ventral midline and back on the right
    const half = phi <= Math.PI ? phi : Math.PI * 2 - phi;
    const sgn = phi <= Math.PI ? 1 : -1;
    const xr = lerp(xD, xV, (1 - Math.cos(half)) / 2);
    const sec = trunkSec(ctx, xr, scale);
    const rim = secPoint(sec, xr, half, sgn);
    const p = lerp3(rim, apex, s);
    p[0] -= Math.sin(Math.PI * s) * 0.05 * H;
    return p;
  });
  return [{ geometry: g, material: 'default' }];
}

// ------------------------------------------------------------------ organs
function buildHeart(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const base = rig.landmarks.heart_base, apex = rig.landmarks.heart_apex;
  const top = add(base, [0, 0.02 * H, 0]);
  const parts: Part[] = [];
  parts.push(sweepPart([top, base, lerp3(base, apex, 0.5), apex, add(apex, [0.005 * H, -0.012 * H, 0])], profileFn('taper', [0.05 * H, 0.068 * H, 0.062 * H, 0.03 * H, 0.004 * H]), { radial: 20, segments: 20, aspect: 0.85, outward: [1, 0, 0] }));
  parts.push(ellPart(add(top, [-0.02 * H, 0.012 * H, 0.035 * H]), [0.03 * H, 0.028 * H, 0.03 * H], { detail: 14 }));
  parts.push(ellPart(add(top, [-0.01 * H, 0.014 * H, -0.035 * H]), [0.032 * H, 0.028 * H, 0.03 * H], { detail: 14 }));
  return parts;
}

function buildLung(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H, sgn } = ctx;
  const th = rig.spine.thoracic;
  const x0 = rig.landmarks.thoracic_inlet[0] + 0.02 * H;
  const x1 = th[th.length - 1].p[0] - 0.02 * H;
  const axis: V3[] = [];
  for (let i = 0; i <= 6; i++) {
    const x = lerp(x0, x1, i / 6);
    const sec = trunkSec(ctx, x, 0.78);
    axis.push([x, sec.cy + sec.hh * 0.12, sgn * sec.hw * 0.5]);
  }
  const g = loftGeometry({
    axis,
    section: (t) => {
      const x = lerp(x0, x1, t);
      const sec = trunkSec(ctx, x, 0.78);
      const taper = t < 0.15 ? 0.2 + 0.8 * (t / 0.15) : t > 0.6 ? Math.max(0.05, 1 - ((t - 0.6) / 0.4) ** 1.2) : 1;
      const ventralCut = t > 0.55 ? 0.5 + 0.5 * Math.max(0, 1 - (t - 0.55) / 0.3) : 1;
      return { w: sec.hw * 0.36 * taper, h: sec.hh * 0.78 * taper * ventralCut, yOff: (1 - ventralCut) * sec.hh * 0.35, n: 2.3, pear: 0.15 };
    },
    segments: 24,
    radial: 28,
  });
  return [{ geometry: g, material: 'default' }];
}

/** pull a point inside the abdominal/thoracic cavity (scaled skin section) */
function clampToCavity(ctx: BuildCtx, p: V3, scale = 0.8): V3 {
  const sec = trunkSec(ctx, p[0], scale);
  const dy = (p[1] - sec.cy) / Math.max(1e-6, sec.hh);
  const dz = p[2] / Math.max(1e-6, sec.hw);
  const r = Math.hypot(dy, dz);
  if (r <= 1) return p;
  return [p[0], sec.cy + (dy / r) * sec.hh, (dz / r) * sec.hw];
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildIntestine(r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig, H } = ctx;
  const L = rig.landmarks;
  const sp = ctx.payload.meta.id;
  const c = L.intestine_center;
  const ab = rig.trunkSection(c[0]);
  const A = (L.l_last[0] - L.t_last[0]) * 0.55 + 0.1 * H;
  const Wd = ab.w * 0.55;
  const Hh = (ab.top - ab.bottom) * 0.3;
  const parts: Part[] = [];
  const ruminant = sp === 'cow' || sp === 'goat';
  const carnivore = sp === 'dog' || sp === 'cat';
  if (r.part === 'small') {
    const rnd = seeded(sp === 'horse' ? 3 : sp === 'cow' ? 5 : sp === 'goat' ? 7 : sp === 'dog' ? 11 : 13);
    const pts: V3[] = [];
    const n = carnivore ? 9 : 14;
    const zBias = ruminant ? -0.45 : 0;
    let prev: V3 = [c[0] - A * 0.6, c[1] + Hh * 0.6, c[2] + Wd * (zBias - 0.3)];
    pts.push(prev);
    for (let i = 0; i < n; i++) {
      let q: V3 = prev;
      for (let tries = 0; tries < 8; tries++) {
        const cand: V3 = [c[0] + (rnd() * 2 - 1) * A * (ruminant ? 0.7 : 0.9), c[1] + (rnd() * 2 - 1) * Hh - Hh * 0.2, c[2] + ((rnd() * 2 - 1) * 0.9 + zBias) * Wd];
        if (len(sub(cand, prev)) > 0.1 * H) {
          q = cand;
          break;
        }
        q = cand;
      }
      pts.push(q);
      prev = q;
    }
    pts.push([c[0] + A * 0.5, c[1] + Hh * 0.3, c[2] - Wd * 0.4]);
    const rr = carnivore ? 0.016 * H : 0.02 * H;
    parts.push(sweepPart(pts.map((q) => clampToCavity(ctx, q, 0.72)), constRadius(rr), { radial: 12, segments: 150, tension: 0.5 }));
  } else if (r.part === 'cecum') {
    const cc = L.cecum;
    if (sp === 'horse') {
      const base = add(cc, [0.08 * H, 0.14 * H, 0]);
      parts.push(sweepPart([base, add(cc, [0.02 * H, 0.04 * H, -0.02 * H]), cc, add(cc, [-0.16 * H, -0.05 * H, 0.03 * H]), add(cc, [-0.28 * H, -0.02 * H, 0.06 * H])].map((q) => clampToCavity(ctx, q, 0.7)), profileFn('taper', [0.045 * H, 0.06 * H, 0.062 * H, 0.05 * H, 0.02 * H]), { radial: 16, segments: 24 }));
    } else if (ruminant) {
      parts.push(sweepPart([add(cc, [-0.03 * H, 0.1 * H, 0]), add(cc, [0.2 * H, 0.12 * H, 0.01 * H])], profileFn('taper', [0.03 * H, 0.028 * H]), { radial: 12, segments: 10 }));
    } else {
      parts.push(sweepPart([add(cc, [0.02 * H, 0.05 * H, 0]), add(cc, [0.04 * H, 0.02 * H, 0.02 * H]), add(cc, [0.0, 0.0, -0.01 * H]), add(cc, [0.03 * H, -0.02 * H, 0.01 * H])], constRadius(0.012 * H), { radial: 10, segments: 16 }));
    }
  } else if (r.part === 'colon') {
    const k = L.colon;
    const rect = L.rectum;
    if (sp === 'horse') {
      const P = (dx: number, dy: number, dz: number): V3 => [k[0] + dx * H, k[1] + dy * H, k[2] + dz * H];
      const pts: V3[] = [P(0.22, 0.05, -0.14), P(0.2, -0.06, -0.14), P(-0.22, -0.09, -0.12), P(-0.32, -0.07, -0.02), P(-0.22, -0.09, 0.12), P(0.26, -0.06, 0.13), P(0.34, 0.01, 0.1), P(0.26, 0.05, 0.12), P(-0.22, 0.05, 0.12), P(-0.33, 0.07, 0.0), P(-0.2, 0.1, -0.1), P(0.08, 0.12, -0.08), P(0.14, 0.15, 0.04), P(0.22, 0.12, 0.1), P(0.3, 0.16, 0.03), add(rect, [-0.08 * H, 0, 0.03 * H]), rect];
      const rr = [0.03, 0.045, 0.05, 0.045, 0.05, 0.045, 0.026, 0.04, 0.05, 0.05, 0.05, 0.04, 0.028, 0.02, 0.02, 0.018, 0.016].map((v) => v * H);
      parts.push(sweepPart(pts.map((q) => clampToCavity(ctx, q, 0.66)), profileFn('taper', rr), { radial: 16, segments: 160, tension: 0.5 }));
    } else if (ruminant) {
      const pts: V3[] = [];
      const cx = k[0] + 0.05 * H, cy = k[1] + 0.04 * H, cz = k[2] - 0.12 * H;
      const R0 = 0.11 * H;
      const turns = 2.5;
      const n = 60;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const ang = t * turns * Math.PI * 2;
        const rad = R0 * (1 - t * 0.9);
        pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, cz]);
      }
      for (let i = n; i >= 0; i--) {
        const t = i / n;
        const ang = t * turns * Math.PI * 2 + Math.PI / turns;
        const rad = R0 * (1 - t * 0.9) * 0.93;
        pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, cz - 0.03 * H]);
      }
      pts.push([k[0] + 0.2 * H, k[1] + 0.12 * H, k[2] + 0.02 * H], add(rect, [-0.06 * H, 0, 0.02 * H]), rect);
      parts.push(sweepPart(pts.map((q) => clampToCavity(ctx, q, 0.72)), constRadius(0.014 * H), { radial: 10, segments: 220, tension: 0.5 }));
    } else {
      const P = (dx: number, dy: number, dz: number): V3 => [k[0] + dx * H, k[1] + dy * H, k[2] + dz * H];
      parts.push(sweepPart([P(0.05, 0.05, -0.1), P(-0.15, 0.08, -0.08), P(-0.2, 0.1, 0.02), P(-0.05, 0.1, 0.1), P(0.15, 0.08, 0.08), add(rect, [-0.05 * H, 0, 0.02 * H]), rect].map((q) => clampToCavity(ctx, q, 0.72)), constRadius(0.016 * H), { radial: 10, segments: 40 }));
    }
  }
  return parts;
}

function buildBrain(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig } = ctx;
  const sec = rig.head.section(0.2);
  const b = rig.landmarks.brain;
  const d = rig.head.dir, up = rig.head.up;
  const hl = sec.w * 0.55, hh = sec.h * 0.4, hw = sec.w * 0.42;
  const parts: Part[] = [];
  for (const s of [-1, 1]) parts.push(ellPart(add(b, [0, 0, s * hw * 0.5]), [hl, hh, hw * 0.52], { detail: 16 }));
  const cb = add(add(b, mul(d, -hl * 0.9)), mul(up, -hh * 0.25));
  parts.push(ellPart(cb, [hl * 0.45, hh * 0.55, hw * 0.75], { detail: 14 }));
  const stem = add(add(b, mul(d, -hl * 0.5)), mul(up, -hh * 0.8));
  parts.push(sweepPart([stem, add(rig.landmarks.atlas, [0, 0.034 * rig.H, 0])], profileFn('taper', [hh * 0.45, hh * 0.3]), { radial: 10, segments: 6 }));
  return parts;
}

function buildEyes(_r: SpecialRecipe, ctx: BuildCtx): Part[] {
  const { rig } = ctx;
  const S = ctx.side ?? 'L';
  const r = rig.params.head.eye.r;
  return [ellPart(rig.landmarks[`skull_eye_${S}`], [r, r, r], { material: 'eye', detail: 16 })];
}

/** merge static parts that share a material key; dynamic parts stay separate */
export function mergeParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  const buckets = new Map<string, { mat: MaterialKey; segment?: string; geos: THREE.BufferGeometry[] }>();
  for (const p of parts) {
    if (p.dynamic) {
      out.push(p);
      continue;
    }
    const bk = `${p.material}|${p.segment ?? ''}`;
    const b = buckets.get(bk) ?? { mat: p.material, segment: p.segment, geos: [] };
    b.geos.push(p.geometry);
    buckets.set(bk, b);
  }
  for (const { mat, segment, geos } of buckets.values()) {
    if (geos.length === 1) out.push({ geometry: geos[0], material: mat, segment });
    else {
      const cleaned = geos.map((g) => {
        const c = g.index ? g.toNonIndexed() : g;
        for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name);
        if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((c.attributes.position.count) * 2), 2));
        return c;
      });
      const merged = mergeGeometries(cleaned, false);
      if (merged) {
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        out.push({ geometry: merged, material: mat, segment });
      } else geos.forEach((g) => out.push({ geometry: g, material: mat, segment }));
    }
  }
  return out;
}
