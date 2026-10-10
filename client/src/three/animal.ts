import * as THREE from 'three';
import type { PointRef, RegionId, Side, SpeciesPayload, StructureDef, GroupId } from '@shared/types';
import { buildRig, resolvePoint, pointRefNames, type Rig } from '@shared/rig';
import { recipesOf } from '@shared/anatomy/index';
import { buildRecipe, makeCtx, mergeParts, type MaterialKey, type Part, type DynamicPart } from './builders.ts';
import { BodySurface, type LimbPartId } from './surface.ts';
import { makeMaterial, uniformsOf, enableShadows, KIND_COLORS, ID_COLORS, TISSUE, tissueOf, type VetUniforms } from './materials.ts';
import { furTexture } from './fur.ts';
import { SweepGeometry, type V3 } from './sweep.ts';
import { SheetGeometry } from './sheet.ts';
import { segmentOfLandmark, limbOfLandmark, FORELIMB_CHAIN, HINDLIMB_CHAIN, type LimbKey, type SegmentId, type JointName } from './segments.ts';
import type { ExternalResult } from './external.ts';

export type { DynamicPart };

export interface StructureInstance {
  key: string;
  def: StructureDef;
  side: Side | null;
  regions: RegionId[];
  group: GroupId;
  node: THREE.Group;
  meshes: THREE.Mesh[];
  materials: THREE.MeshStandardMaterial[];
  uniforms: VetUniforms[];
  anchor: THREE.Vector3;
  box: THREE.Box3;
  dynamics: DynamicPart[];
  limbs: Set<LimbKey>;
  pathLength: number;
  /** the muscle's shape geometries in recipe order (sheets / sweeps; first = origin side) */
  shapes: (SheetGeometry | SweepGeometry)[];
  isSoftOf: (limb: LimbKey) => boolean;
  /** id of the external model entry whose meshes replaced the procedural geometry */
  external?: string;
}

export interface LimbPivots {
  key: LimbKey;
  joints: Record<JointName, THREE.Object3D>;
  rest: Record<JointName, THREE.Vector3>;
  chain: JointName[];
}

export interface AnimalModel {
  root: THREE.Group;
  rig: Rig;
  payload: SpeciesPayload;
  instances: StructureInstance[];
  byKey: Map<string, StructureInstance>;
  limbs: Map<LimbKey, LimbPivots>;
  skinOnly: boolean;
  bounds: THREE.Box3;
  /** current (possibly animated) landmark position */
  landmarkNow: (name: string) => V3;
  /** a rest-pose point carried rigidly by a limb segment into the current pose (null = trunk, static) */
  pointNow: (seg: SegmentId | null, rest: V3) => V3;
  surface: BodySurface;
  /** imported (scanned / modelled) meshes merged into the model, see external.ts */
  external?: ExternalResult[];
  /** pivot node of a limb segment and its rest position */
  segmentNode: (seg: SegmentId) => THREE.Object3D;
  segmentRest: (seg: SegmentId) => THREE.Vector3;
  /** muscle physics, attachments and the connection graph (muscles.ts), prepared when the atlas opens */
  muscles?: import('./muscles.ts').MuscleSystem;
  dispose: () => void;
}

const MAT_COLORS: Record<Exclude<MaterialKey, 'default' | 'fur' | 'muscleSheet'>, { color: string; roughness: number; metalness?: number }> = {
  dark: { color: '#1c1511', roughness: 0.75 },
  eye: { color: '#120d0a', roughness: 0.12, metalness: 0.1 },
  hoof: { color: '#4a4039', roughness: 0.55 },
  horn: { color: '#d4c8b2', roughness: 0.5 },
  cartilage: { color: '#bcd3dc', roughness: 0.3 },
  pad: { color: '#2a2320', roughness: 0.8 },
  tooth: { color: '#f3efe4', roughness: 0.35 },
  pink: { color: '#d9a9a1', roughness: 0.7 },
  tendonCap: { color: '#eeeae2', roughness: 0.4 },
};

function colorFor(def: StructureDef): string {
  return def.color ?? ID_COLORS[def.id] ?? KIND_COLORS[def.kind];
}

export function regionsOfInstance(def: StructureDef, side: Side | null): RegionId[] {
  const out: RegionId[] = [];
  for (const r of def.regions) {
    if (r === 'forelimb' || r === 'hindlimb') {
      if (side) out.push(`${r}_${side === 'L' ? 'left' : 'right'}` as RegionId);
      else out.push(`${r}_left` as RegionId, `${r}_right` as RegionId);
    } else out.push(r as RegionId);
  }
  return out;
}

export interface BuildOptions {
  skinOnly?: boolean;
  onProgress?: (done: number, total: number) => void;
  /** yield to the event loop every N structures (0 = synchronous) */
  chunk?: number;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function buildAnimal(payload: SpeciesPayload, opts: BuildOptions = {}): Promise<AnimalModel> {
  const rig = buildRig(payload.rig);
  const H = rig.H;
  const root = new THREE.Group();
  root.name = `animal-${payload.meta.id}`;
  const instances: StructureInstance[] = [];
  const byKey = new Map<string, StructureInstance>();
  const fur = furTexture(payload.rig.fur, payload.meta.id);
  const limbs = new Map<LimbKey, LimbPivots>();
  const surface = new BodySurface(rig, (n) => {
    const p = rig.landmarks[n];
    if (!p) throw new Error(`Unknown landmark ${n}`);
    return p;
  });

  // limb pivot hierarchies
  for (const side of ['L', 'R'] as Side[]) {
    for (const limb of ['fl', 'hl'] as const) {
      const chain = limb === 'fl' ? FORELIMB_CHAIN : HINDLIMB_CHAIN;
      const key = `${limb}_${side}` as LimbKey;
      const joints = {} as Record<JointName, THREE.Object3D>;
      const rest = {} as Record<JointName, THREE.Vector3>;
      let parent: THREE.Object3D = root;
      let prevPos = new THREE.Vector3();
      for (const j of chain) {
        const lm = rig.landmarks[`${limb}_${side}_${j}`];
        const pos = new THREE.Vector3(lm[0], lm[1], lm[2]);
        const o = new THREE.Object3D();
        o.name = `${key}_${j}`;
        o.position.copy(pos).sub(prevPos);
        parent.add(o);
        joints[j] = o;
        rest[j] = pos.clone();
        parent = o;
        prevPos = pos;
      }
      limbs.set(key, { key, joints, rest, chain });
    }
  }
  root.updateMatrixWorld(true);

  const segmentRestPos = (seg: SegmentId): THREE.Vector3 => {
    const m = /^(fl|hl)_([LR])_(\w+)$/.exec(seg)!;
    return limbs.get(`${m[1]}_${m[2]}` as LimbKey)!.rest[m[3] as JointName];
  };
  const segmentNode = (seg: SegmentId): THREE.Object3D => {
    const m = /^(fl|hl)_([LR])_(\w+)$/.exec(seg)!;
    return limbs.get(`${m[1]}_${m[2]}` as LimbKey)!.joints[m[3] as JointName];
  };

  const tmpV = new THREE.Vector3();
  const pointNow = (seg: SegmentId | null, rest: V3): V3 => {
    if (!seg) return rest;
    const base = segmentRestPos(seg);
    tmpV.set(rest[0] - base.x, rest[1] - base.y, rest[2] - base.z);
    segmentNode(seg).localToWorld(tmpV);
    return [tmpV.x, tmpV.y, tmpV.z];
  };
  const landmarkNow = (name: string): V3 => {
    const rest = rig.landmarks[name];
    if (!rest) throw new Error(`Unknown landmark ${name}`);
    const seg = segmentOfLandmark(name);
    if (!seg) return rest;
    const node = segmentNode(seg);
    const base = segmentRestPos(seg);
    tmpV.set(rest[0] - base.x, rest[1] - base.y, rest[2] - base.z);
    node.localToWorld(tmpV);
    return [tmpV.x, tmpV.y, tmpV.z];
  };

  const defs = opts.skinOnly ? payload.structures.filter((s) => s.group === 'skin') : payload.structures;
  const jobs: { def: StructureDef; side: Side | null }[] = [];
  for (const def of defs) {
    if (def.bilateral) jobs.push({ def, side: 'L' }, { def, side: 'R' });
    else jobs.push({ def, side: null });
  }
  const chunk = opts.chunk ?? 14;
  let done = 0;
  for (const job of jobs) {
    try {
      const inst = buildInstance(job.def, job.side);
      instances.push(inst);
      byKey.set(inst.key, inst);
    } catch (e) {
      console.warn(`[vetatlas] failed to build ${job.def.id} ${job.side ?? ''}:`, e);
    }
    done++;
    opts.onProgress?.(done, jobs.length);
    if (chunk > 0 && done % chunk === 0) await nextFrame();
  }

  function buildInstance(def: StructureDef, side: Side | null): StructureInstance {
    const ctx = makeCtx(rig, payload, side, surface);
    const parts: Part[] = [];
    const dynamics: DynamicPart[] = [];
    const shapes: (SheetGeometry | SweepGeometry)[] = [];
    const limbSet = new Set<LimbKey>();
    const soft = def.kind !== 'skin' && def.kind !== 'bone' && def.kind !== 'cartilage' ? true : def.kind === 'bone' || def.kind === 'cartilage';
    for (const recipe of recipesOf(def)) {
      const built = buildRecipe(recipe, ctx, soft);
      for (const p of built) {
        if (def.kind === 'muscle' && (p.geometry instanceof SheetGeometry || p.geometry instanceof SweepGeometry)) shapes.push(p.geometry);
        if (p.dynamic && p.dynamic.kind === 'sweep') {
          const names = p.dynamic.path.flatMap((pr) => pointRefNames(pr)).map((n) => n.replace('{S}', side ?? 'L'));
          const limbNames = names.map(limbOfLandmark).filter((x): x is LimbKey => !!x);
          if (limbNames.length) {
            limbNames.forEach((l) => limbSet.add(l));
            dynamics.push(p.dynamic);
          } else delete p.dynamic;
        } else if (p.dynamic && p.dynamic.kind === 'sheet') {
          limbSet.add(p.dynamic.partId as LimbKey);
          dynamics.push(p.dynamic);
        }
        if (recipe.type === 'ellipsoid' && !p.segment) {
          const names = pointRefNames(recipe.at).map((n) => n.replace('{S}', side ?? 'L'));
          const seg = names.map(segmentOfLandmark).find((s) => !!s);
          if (seg) p.segment = seg;
        }
        parts.push(p);
      }
    }
    const merged = mergeParts(parts);
    const node = new THREE.Group();
    node.name = `${def.id}${side ? '_' + side : ''}`;
    const meshes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const uniforms: VetUniforms[] = [];
    const matCache = new Map<string, THREE.MeshStandardMaterial>();
    const box = new THREE.Box3();
    let pathLength = 0;
    for (const p of merged) {
      const mk = p.material;
      let mat = matCache.get(mk);
      if (!mat) {
        if (mk === 'fur') mat = makeMaterial({ color: '#ffffff', map: fur, roughness: payload.rig.fur.roughness ?? 0.8, H });
        else if (mk === 'muscleSheet') {
          // deterministic per-muscle tint so neighbouring sheets read as separate muscles
          let hsh = 0;
          for (let i = 0; i < def.id.length; i++) hsh = (hsh * 31 + def.id.charCodeAt(i)) >>> 0;
          const c = new THREE.Color(colorFor(def));
          const hsl = { h: 0, s: 0, l: 0 };
          c.getHSL(hsl);
          c.setHSL(hsl.h + (((hsh % 13) / 13) - 0.5) * 0.02, Math.min(1, hsl.s + (((hsh >> 4) % 11) / 11 - 0.5) * 0.08), Math.min(1, hsl.l + (((hsh >> 8) % 17) / 17 - 0.5) * 0.07));
          mat = makeMaterial({ color: c, roughness: 0.46, highlight: '#ff5a3c', H, tissue: TISSUE.muscle });
          uniformsOf(mat).uFasc.value = 22;
        }
        else if (mk === 'default') mat = makeMaterial({ tissue: tissueOf(def.kind), color: colorFor(def), highlight: def.kind === 'muscle' ? '#ff5a3c' : def.kind === 'tendon' || def.kind === 'ligament' ? '#ffb347' : '#ffd24d', roughness: def.kind === 'bone' ? 0.62 : def.kind === 'tendon' || def.kind === 'ligament' ? 0.55 : def.kind === 'muscle' ? 0.5 : 0.55, H, side: def.id.startsWith('m_obliquus') || def.id === 'm_transversus_abdominis' || def.id === 'mm_intercostales' || def.id === 'diaphragma' ? THREE.DoubleSide : THREE.FrontSide });
        else {
          const c = MAT_COLORS[mk];
          mat = makeMaterial({ color: c.color, roughness: c.roughness, metalness: c.metalness, H, tissue: mk === 'cartilage' ? TISSUE.cartilage : mk === 'tendonCap' ? TISSUE.tendon : TISSUE.none });
        }
        const u = uniformsOf(mat);
        u.uDissolveY.value.set(0, rig.params.spine.withersTop * 1.15);
        u.uBodyY.value.set(0, rig.params.spine.withersTop);
        if (mk === 'fur') {
          const f = payload.rig.fur;
          if (f.pointsY !== undefined) {
            u.uPointsOn.value = 1;
            u.uPointsY.value = f.pointsY * H;
            u.uPointsColor.value.set(f.pointsColor ?? '#1d1410');
            const nose = rig.landmarks.skull_nose;
            u.uNose.value.set(nose[0], nose[1], nose[2], 0.09 * H);
          }
          if (f.bellyLight) u.uBellyLight.value = f.bellyLight;
        }
        if (def.kind === 'artery' || def.kind === 'vein') {
          u.uFlowSpeed.value = def.kind === 'artery' ? 1.6 : 1.0;
        }
        matCache.set(mk, mat);
        materials.push(mat);
        uniforms.push(u);
      }
      const mesh = new THREE.Mesh(p.geometry, mat);
      enableShadows(mesh);
      mesh.userData.key = node.name;
      if (p.segment) {
        const segNode = segmentNode(p.segment as SegmentId);
        const base = segmentRestPos(p.segment as SegmentId);
        mesh.position.set(-base.x, -base.y, -base.z);
        segNode.add(mesh);
        const m = /^(fl|hl)_([LR])_/.exec(p.segment)!;
        limbSet.add(`${m[1]}_${m[2]}` as LimbKey);
      } else node.add(mesh);
      meshes.push(mesh);
      p.geometry.computeBoundingBox();
      if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
      if (p.pathLength) pathLength = Math.max(pathLength, p.pathLength);
    }
    if (def.kind === 'artery' || def.kind === 'vein') {
      for (const u of uniforms) u.uDashes.value = Math.max(2, pathLength / (0.05 * H));
    }
    root.add(node);
    const anchor = new THREE.Vector3();
    box.getCenter(anchor);
    // anchors on the surface for skin / large organs look better slightly outward
    if (def.id === 'cutis') anchor.set(rig.landmarks.back_mid[0], rig.landmarks.back_mid[1], rig.landmarks.back_mid[2]);
    const inst: StructureInstance = {
      key: node.name,
      def,
      side,
      regions: regionsOfInstance(def, side),
      group: def.group,
      node,
      meshes,
      materials,
      uniforms,
      anchor,
      box,
      dynamics,
      limbs: limbSet,
      pathLength,
      shapes,
      isSoftOf: (limb) => dynamics.length > 0 && limbSet.has(limb),
    };
    return inst;
  }

  const bounds = new THREE.Box3();
  for (const inst of instances) bounds.union(inst.box);

  const model: AnimalModel = {
    root,
    rig,
    payload,
    instances,
    byKey,
    limbs,
    skinOnly: !!opts.skinOnly,
    bounds,
    landmarkNow,
    pointNow,
    surface,
    segmentNode,
    segmentRest: segmentRestPos,
    dispose: () => {
      for (const inst of instances) {
        inst.meshes.forEach((m) => m.geometry.dispose());
        inst.materials.forEach((m) => m.dispose());
      }
    },
  };
  return model;
}

/** Re-shape all soft structures of a limb from the current pivot pose. */
export function updateSoftTissue(model: AnimalModel, limb: LimbKey) {
  const { rig } = model;
  const side = limb.endsWith('L') ? 'L' : 'R';
  const ctx = {
    resolve: (ref: PointRef): V3 => resolveNow(ref, rig, side, model),
  };
  model.surface.refreshLimb(limb as LimbPartId, model.landmarkNow);
  const part = model.surface.part(limb as LimbPartId);
  for (const inst of model.instances) {
    if (!inst.isSoftOf(limb)) continue;
    if (inst.side && inst.side !== side) continue;
    for (const d of inst.dynamics) {
      if (d.kind === 'sweep') d.sweep.update(d.path.map((p) => ctx.resolve(p)));
      else if (d.partId === limb) d.sheet.update(part);
    }
    const box = new THREE.Box3();
    for (const m of inst.meshes) {
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) box.union(m.geometry.boundingBox);
    }
    inst.box.copy(box);
    box.getCenter(inst.anchor);
  }
}

/**
 * Current position of a path point. An offset from a landmark is part of the
 * bone it belongs to, so it turns with that bone: a palmar tendon stays behind
 * the cannon however far the limb is flexed, and short ligaments keep their
 * length unless the joint they cross really stretches them.
 */
function resolveNow(ref: PointRef, rig: Rig, side: Side, model: AnimalModel): V3 {
  const name = (n: string) => n.replace('{S}', side);
  if (typeof ref === 'string') return model.landmarkNow(name(ref));
  if (Array.isArray(ref)) return resolvePoint(ref, rig, side);
  const rest = resolvePoint(ref, rig, side);
  if (ref.at && !ref.between) return model.pointNow(segmentOfLandmark(name(ref.at)), rest);
  if (!ref.between) return rest;
  const a = name(ref.between[0]);
  const b = name(ref.between[1]);
  const sa = segmentOfLandmark(a);
  const sb = segmentOfLandmark(b);
  if (sa === sb) return model.pointNow(sa, rest);
  // spanning a joint: follow both posed ends, the offset turns with the nearer bone
  const t = ref.t ?? 0.5;
  const ra = rig.landmarks[a];
  const rb = rig.landmarks[b];
  const restBase: V3 = [ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t];
  const pa = model.landmarkNow(a);
  const pb = model.landmarkNow(b);
  const seg = t < 0.5 ? sa : sb;
  const o0 = model.pointNow(seg, restBase);
  const o1 = model.pointNow(seg, rest);
  return [pa[0] + (pb[0] - pa[0]) * t + o1[0] - o0[0], pa[1] + (pb[1] - pa[1]) * t + o1[1] - o0[1], pa[2] + (pb[2] - pa[2]) * t + o1[2] - o0[2]];
}
