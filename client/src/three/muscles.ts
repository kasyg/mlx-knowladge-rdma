/**
 * Muscle runtime: attachment sites on the (sculpted) bones, tendinous cords from
 * the belly to the bone, the length of every muscle-tendon unit in the current
 * pose, the Hill-type state (activation, fibre length, force, tendon strain),
 * the belly thickness that follows from volume conservation, the strain of the
 * tendons and ligaments, and the connection graph used by the isolation view.
 */
import * as THREE from 'three';
import type { MotionRole, Side, Text2 } from '@shared/types';
import { resolvePoint } from '@shared/rig';
import type { MuscleMech } from '@shared/anatomy/mechanics';
import { buildConnections, pickPresent, type ConnectionGraph, type ConnectionRole } from '@shared/anatomy/connections';
import type { AnimalModel, StructureInstance } from './animal.ts';
import { segmentOfRef, polyLength } from './pose.ts';
import type { JointName, LimbKey, SegmentId } from './segments.ts';
import { SweepGeometry, profileFn } from './sweep.ts';
import { SheetGeometry } from './sheet.ts';
import { stepMtu, initialState, bellyThickness, clamp, FIBRE_RATIO, type MtuParams, type MtuState } from './biomech.ts';
import { makeMaterial, uniformsOf, enableShadows, TISSUE } from './materials.ts';

export interface SiteRt {
  kind: 'origin' | 'insertion';
  rest: THREE.Vector3;
  now: THREE.Vector3;
  seg: SegmentId | null;
  boneId: string | null;
  boneKey: string | null;
  head?: Text2;
}

interface LinePoint {
  rest: THREE.Vector3;
  now: THREE.Vector3;
  seg: SegmentId | null;
}

export interface CordRt {
  geo: SweepGeometry;
  mesh: THREE.Mesh;
  site: SiteRt;
  /** position along the belly edge (0..1) */
  s: number;
}

export interface History {
  n: number;
  i: number;
  t: Float32Array;
  l: Float32Array;
  a: Float32Array;
  F: Float32Array;
  eps: Float32Array;
}

export interface MuscleRt {
  key: string;
  inst: StructureInstance;
  mech: MuscleMech;
  limb: LimbKey | null;
  roles: MotionRole[];
  sites: SiteRt[];
  line: LinePoint[];
  params: MtuParams;
  st: MtuState;
  thick: number;
  cords: CordRt[];
  hist: History;
  /** set while the muscle is being animated, so it can be relaxed afterwards */
  live: boolean;
}

export interface TendonRt {
  key: string;
  inst: StructureInstance;
  /** rest length of every dynamic sweep */
  rest: number[];
  strain: number;
  /** keys of the muscles that pull on it */
  muscles: string[];
}

export interface MuscleSystem {
  muscles: Map<string, MuscleRt>;
  tendons: Map<string, TendonRt>;
  graph: ConnectionGraph;
  /** structure id → instance keys (one side, or both for a midline source) */
  keysOf: (id: string, side: Side | null) => string[];
}

const HIST = 240;
const newHistory = (): History => ({ n: 0, i: 0, t: new Float32Array(HIST), l: new Float32Array(HIST), a: new Float32Array(HIST), F: new Float32Array(HIST), eps: new Float32Array(HIST) });

const FORE: MotionRole['joint'][] = ['shoulder', 'elbow', 'carpus', 'fetlock_fl'];
export const jointName = (j: MotionRole['joint']): JointName => (j === 'fetlock_fl' || j === 'fetlock_hl' ? 'fetlock' : j);

function snapToBone(p: THREE.Vector3, inst: StructureInstance | undefined, maxDist: number): THREE.Vector3 {
  if (!inst) return p;
  let best = maxDist * maxDist;
  const out = p.clone();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  for (const mesh of inst.meshes) {
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox!).applyMatrix4(mesh.matrixWorld);
    if (box.distanceToPoint(p) > maxDist) continue;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const stride = pos.count > 20000 ? 3 : 1;
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const d = v.distanceToSquared(p);
      if (d < best) {
        best = d;
        out.copy(v);
      }
    }
  }
  return out;
}

/** current world position of a rest point that moves with a limb segment */
function posed(model: AnimalModel, rest: THREE.Vector3, seg: SegmentId | null, out: THREE.Vector3): THREE.Vector3 {
  if (!seg) return out.copy(rest);
  const base = model.segmentRest(seg);
  out.copy(rest).sub(base);
  return model.segmentNode(seg).localToWorld(out);
}

/** the middle of the belly at its origin (t = 0) or insertion (t = 1) end */
function bellyEnd(rt: { inst: StructureInstance }, end: 0 | 1, s: number, out: THREE.Vector3): THREE.Vector3 | null {
  const shapes = rt.inst.shapes;
  if (!shapes.length) return null;
  const g = end === 0 ? shapes[0] : shapes[shapes.length - 1];
  if (g instanceof SheetGeometry) return g.edgePoint(0.2 + 0.6 * s, end, out);
  if (g.curve) return g.curve.getPointAt(end, out);
  return null;
}

export function prepareMuscles(model: AnimalModel): MuscleSystem {
  const structures = model.payload.structures;
  const graph = buildConnections(structures, model.payload.meta.id);
  const present = new Set(structures.map((s) => s.id));
  const defs = new Map(structures.map((s) => [s.id, s]));
  const rig = model.rig;
  const H = rig.H;
  const keysOf = (id: string, side: Side | null): string[] => {
    const def = defs.get(id);
    if (!def) return [];
    const keys = def.bilateral ? (side ? [`${id}_${side}`] : [`${id}_L`, `${id}_R`]) : [id];
    return keys.filter((k) => model.byKey.has(k));
  };
  model.root.updateMatrixWorld(true);

  // tendons and ligaments: rest lengths of their (dynamic) sweeps
  const tendons = new Map<string, TendonRt>();
  for (const inst of model.instances) {
    if (inst.def.kind !== 'tendon' && inst.def.kind !== 'ligament') continue;
    const rest = inst.dynamics.map((d) => (d.kind === 'sweep' ? d.sweep.length : 0));
    const muscles = (graph.links.get(inst.def.id) ?? []).filter((c) => c.role === 'muscle').flatMap((c) => keysOf(c.id, inst.side));
    tendons.set(inst.key, { key: inst.key, inst, rest, strain: 0, muscles });
  }

  const muscles = new Map<string, MuscleRt>();
  for (const inst of model.instances) {
    if (inst.def.kind !== 'muscle') continue;
    const mech = graph.mech.get(inst.def.id);
    if (!mech) continue;
    const side = inst.side;
    const sites: SiteRt[] = [];
    const mkSite = (kind: 'origin' | 'insertion', s: MuscleMech['origin'][number]) => {
      const boneId = pickPresent(s.bone, present);
      const boneKey = boneId ? keysOf(boneId, side)[0] ?? null : null;
      const p = resolvePoint(s.at, rig, side);
      const rest = snapToBone(new THREE.Vector3(p[0], p[1], p[2]), boneKey ? model.byKey.get(boneKey) : undefined, 0.035 * H);
      sites.push({ kind, rest, now: rest.clone(), seg: segmentOfRef(s.at, side), boneId, boneKey, head: s.head });
    };
    mech.origin.forEach((s) => mkSite('origin', s));
    mech.insertion.forEach((s) => mkSite('insertion', s));
    const o0 = sites.find((s) => s.kind === 'origin')!;
    const iN = [...sites].reverse().find((s) => s.kind === 'insertion')!;
    const via: LinePoint[] = (mech.via ?? []).map((ref) => {
      const p = resolvePoint(ref, rig, side);
      const rest = new THREE.Vector3(p[0], p[1], p[2]);
      return { rest, now: rest.clone(), seg: segmentOfRef(ref, side) };
    });
    const line: LinePoint[] = [{ rest: o0.rest, now: o0.now, seg: o0.seg }, ...via, { rest: iN.rest, now: iN.now, seg: iN.seg }];
    const L0 = polyLength(line.map((p) => [p.rest.x, p.rest.y, p.rest.z]));
    const roles = inst.def.motion ?? [];
    const segLimb = line.map((p) => p.seg).find((s) => !!s);
    const limb: LimbKey | null = roles.length && side ? (`${FORE.includes(roles[0].joint) ? 'fl' : 'hl'}_${side}` as LimbKey) : segLimb ? (segLimb.slice(0, 4) as LimbKey) : null;
    const params: MtuParams = { L0: Math.max(1e-3, L0), tendonFraction: mech.tendonFraction ?? 0.2, fibreRatio: FIBRE_RATIO[mech.fibres ?? 'fusiform'] ?? 0.8 };
    const rt: MuscleRt = { key: inst.key, inst, mech, limb, roles, sites, line, params, st: initialState(params), thick: 1, cords: [], hist: newHistory(), live: false };
    buildCords(model, rt, tendons);
    muscles.set(inst.key, rt);
  }
  return { muscles, tendons, graph, keysOf };
}

/** tendinous origins and insertions: cords from the end of the belly to the bone */
function buildCords(model: AnimalModel, rt: MuscleRt, tendons: Map<string, TendonRt>) {
  const H = model.rig.H;
  const inst = rt.inst;
  if (!inst.shapes.length) return;
  // an own tendon that already ends at a site makes the cord redundant
  const tendonEnds: THREE.Vector3[] = [];
  for (const t of rt.mech.tendons ?? []) {
    const tr = tendons.get(`${t}${inst.side ? '_' + inst.side : ''}`) ?? tendons.get(t);
    if (!tr || tr.inst.def.kind !== 'tendon') continue;
    for (const d of tr.inst.dynamics) if (d.kind === 'sweep') tendonEnds.push(d.sweep.curve.getPointAt(0), d.sweep.curve.getPointAt(1));
  }
  const r = (0.0022 + 0.00045 * (rt.mech.pcsa ?? 2)) * H;
  const mat = makeMaterial({ color: '#ece6da', roughness: 0.32, H, highlight: '#ffb347' });
  const u = uniformsOf(mat);
  u.uTissue.value = TISSUE.tendon;
  u.uDissolveY.value.set(0, model.rig.params.spine.withersTop * 1.15);
  let made = 0;
  for (const kind of ['origin', 'insertion'] as const) {
    const list = rt.sites.filter((s) => s.kind === kind);
    list.forEach((site, k) => {
      if (kind === 'insertion' && tendonEnds.some((e) => e.distanceTo(site.rest) < 0.04 * H)) return;
      const s = list.length === 1 ? 0.5 : k / (list.length - 1);
      const a = bellyEnd(rt, kind === 'origin' ? 0 : 1, s, new THREE.Vector3());
      if (!a || a.distanceTo(site.rest) < 0.006 * H) return;
      const geo = new SweepGeometry({ points: cordPoints(a, site.rest), radius: profileFn('tube', [r * 1.35, r * 0.85, r, r * 1.5]), radial: 8, segments: 10, caps: true });
      const mesh = new THREE.Mesh(geo, mat);
      enableShadows(mesh);
      mesh.visible = false;
      mesh.userData.key = inst.key;
      mesh.userData.cord = true;
      inst.node.add(mesh);
      inst.meshes.push(mesh);
      rt.cords.push({ geo, mesh, site, s });
      made++;
    });
  }
  if (made) {
    inst.materials.push(mat);
    inst.uniforms.push(u);
  } else mat.dispose();
}

const tmpA = new THREE.Vector3();
function cordPoints(a: THREE.Vector3, b: THREE.Vector3): [number, number, number][] {
  const m1 = tmpA.copy(a).lerp(b, 0.4);
  const m2 = a.clone().lerp(b, 0.75);
  return [
    [a.x, a.y, a.z],
    [m1.x, m1.y, m1.z],
    [m2.x, m2.y, m2.z],
    [b.x, b.y, b.z],
  ];
}

/** re-shape the cords of a muscle after its belly or the bones moved */
export function updateCords(rt: MuscleRt) {
  const a = new THREE.Vector3();
  for (const c of rt.cords) {
    if (!bellyEnd(rt, c.site.kind === 'origin' ? 0 : 1, c.s, a)) continue;
    c.geo.update(cordPoints(a, c.site.now));
  }
}

export interface MotionDrive {
  dt: number;
  t: number;
  /** limb whose joints are being animated (gait or demo) */
  limb: LimbKey | null;
  angles: Partial<Record<JointName, number>> | null;
  rates: Partial<Record<JointName, number>> | null;
  stanceK: number;
  swingK: number;
  /** demonstration of one muscle: its key and the excitation of the agonist */
  demo: { key: string; drive: number; pulse: boolean } | null;
}

/** neural excitation of a muscle during the walk: concentric drive, anti-gravity support in stance, braking of the swing */
export function gaitExcitation(roles: MotionRole[], rates: Partial<Record<JointName, number>>, stanceK: number, swingK: number): number {
  let u = 0;
  for (const r of roles) {
    const w = rates[jointName(r.joint)] ?? 0; // deg/s, + = flexing
    const dir = r.action === 'flexion' ? 1 : -1;
    const drive = clamp((dir * w) / 110, 0, 1);
    const brake = r.action === 'extension' ? 0.5 * stanceK : 0.3 * clamp(-w / 140, 0, 1) * swingK;
    u = Math.max(u, 0.85 * drive + brake);
  }
  return clamp(u, 0.02, 1);
}

/** advance the muscles of the animated limb (or the demonstrated muscle) */
export function updateMuscles(model: AnimalModel, sys: MuscleSystem, drive: MotionDrive) {
  const demoRt = drive.demo ? sys.muscles.get(drive.demo.key) ?? null : null;
  const synergists = new Set<string>();
  if (demoRt) for (const c of sys.graph.links.get(demoRt.inst.def.id) ?? []) if (c.role === 'synergist') sys.keysOf(c.id, demoRt.inst.side).forEach((k) => synergists.add(k));
  const dt = Math.min(0.05, Math.max(1e-3, drive.dt));
  for (const rt of sys.muscles.values()) {
    const onLimb = !!drive.limb && rt.limb === drive.limb;
    const pulsed = !!drive.demo?.pulse && rt === demoRt;
    if (!onLimb && !pulsed) {
      if (rt.live) relax(rt);
      continue;
    }
    rt.live = true;
    let L: number;
    if (pulsed) {
      // a muscle without a joint in the model: let it shorten in place
      L = rt.params.L0 * (1 - 0.16 * drive.demo!.drive * (1 - rt.params.tendonFraction));
    } else {
      for (const p of rt.line) posed(model, p.rest, p.seg, p.now);
      L = polyLength(rt.line.map((p) => [p.now.x, p.now.y, p.now.z]));
    }
    for (const s of rt.sites) posed(model, s.rest, s.seg, s.now);
    let u: number;
    if (demoRt) u = rt === demoRt ? drive.demo!.drive : synergists.has(rt.key) ? 0.5 * drive.demo!.drive : 0.03;
    else u = drive.rates ? gaitExcitation(rt.roles, drive.rates, drive.stanceK, drive.swingK) : 0.02;
    rt.st = stepMtu(rt.params, rt.st, L, u, dt);
    rt.thick = bellyThickness(rt.st.l, rt.st.a);
    for (const g of rt.inst.shapes) {
      if (g instanceof SheetGeometry) g.thickness = rt.thick;
      else g.radiusScale = rt.thick;
    }
    pushHistory(rt, drive.t);
  }
}

/**
 * Strain of the tendons and ligaments of the animated limb: tendons from the pull
 * of their muscles, ligaments from their stretch. Call after the soft tissue of
 * the limb has been re-shaped for the current pose.
 */
export function updateTendons(sys: MuscleSystem, drive: Pick<MotionDrive, 'limb'>) {
  for (const tr of sys.tendons.values()) {
    if (!drive.limb || !tr.inst.limbs.has(drive.limb)) {
      tr.strain = 0;
      continue;
    }
    let geo = 0;
    tr.inst.dynamics.forEach((d, i) => {
      if (d.kind === 'sweep' && tr.rest[i] > 0) geo = Math.max(geo, d.sweep.length / tr.rest[i] - 1);
    });
    let pull = 0;
    for (const k of tr.muscles) pull = Math.max(pull, sys.muscles.get(k)?.st.eps ?? 0);
    // A tendon in series with a muscle is loaded by the muscle force: the change of
    // its path length is taken up by the sliding muscle fibres, not by the collagen.
    // A ligament runs bone to bone, so its strain is its change of length; so do the
    // flexor tendons of the stay apparatus below their check ligament, which ties
    // them to the skeleton (the fetlock then hangs in them without muscle work).
    const checked = tr.muscles.some((k) => {
      const m = sys.muscles.get(k)?.mech;
      return !!m?.stay && !!m.tendons?.some((t) => t.startsWith('lig_accessorium'));
    });
    tr.strain = Math.max(0, tr.muscles.length ? (checked ? Math.max(pull, geo) : pull) : geo);
  }
}

function relax(rt: MuscleRt) {
  rt.live = false;
  rt.st = initialState(rt.params);
  rt.thick = 1;
  for (const g of rt.inst.shapes) {
    if (g instanceof SheetGeometry) g.thickness = 1;
    else g.radiusScale = 1;
  }
  for (const s of rt.sites) s.now.copy(s.rest);
  for (const p of rt.line) p.now.copy(p.rest);
}

function pushHistory(rt: MuscleRt, t: number) {
  const h = rt.hist;
  const last = h.n ? h.t[(h.i - 1 + HIST) % HIST] : -1;
  if (t - last < 1 / 30) return;
  h.t[h.i] = t;
  h.l[h.i] = rt.st.l;
  h.a[h.i] = rt.st.a;
  h.F[h.i] = rt.st.F;
  h.eps[h.i] = rt.st.eps;
  h.i = (h.i + 1) % HIST;
  h.n = Math.min(HIST, h.n + 1);
}

export function clearHistory(rt: MuscleRt) {
  rt.hist.n = 0;
  rt.hist.i = 0;
}

/** connected structures of an instance, grouped by role (instance keys) */
export function connectionsOf(sys: MuscleSystem, model: AnimalModel, key: string): { role: ConnectionRole; key: string; joint?: string }[] {
  const inst = model.byKey.get(key);
  if (!inst) return [];
  const out: { role: ConnectionRole; key: string; joint?: string }[] = [];
  const seen = new Set<string>();
  for (const c of sys.graph.links.get(inst.def.id) ?? []) {
    for (const k of sys.keysOf(c.id, inst.side)) {
      const tag = `${c.role}|${k}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push({ role: c.role, key: k, joint: c.joint });
    }
  }
  return out;
}
