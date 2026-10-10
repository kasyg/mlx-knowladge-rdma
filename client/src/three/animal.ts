import * as THREE from 'three';
import type { PointRef, RegionId, Side, SpeciesPayload, StructureDef, GroupId } from '@shared/types';
import { buildRig, resolvePoint, pointRefNames, type Rig } from '@shared/rig';
import { recipesOf } from '@shared/anatomy/index';
import { buildRecipe, makeCtx, mergeParts, type MaterialKey, type Part } from './builders.ts';
import { makeMaterial, uniformsOf, KIND_COLORS, ID_COLORS, type VetUniforms } from './materials.ts';
import { furTexture } from './fur.ts';
import { SweepGeometry, type V3 } from './sweep.ts';
import { segmentOfLandmark, limbOfLandmark, FORELIMB_CHAIN, HINDLIMB_CHAIN, type LimbKey, type SegmentId, type JointName } from './segments.ts';

export interface DynamicPart {
  sweep: SweepGeometry;
  path: PointRef[];
}

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
  isSoftOf: (limb: LimbKey) => boolean;
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
  dispose: () => void;
}

const MAT_COLORS: Record<Exclude<MaterialKey, 'default' | 'fur'>, { color: string; roughness: number; metalness?: number }> = {
  dark: { color: '#1c1511', roughness: 0.75 },
  eye: { color: '#120d0a', roughness: 0.12, metalness: 0.1 },
  hoof: { color: '#4a4039', roughness: 0.55 },
  horn: { color: '#d4c8b2', roughness: 0.5 },
  cartilage: { color: '#a6c6d6', roughness: 0.55 },
  pad: { color: '#2a2320', roughness: 0.8 },
  tooth: { color: '#f3efe4', roughness: 0.35 },
  pink: { color: '#d9a9a1', roughness: 0.7 },
  tendonCap: { color: '#efe8da', roughness: 0.6 },
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
    const ctx = makeCtx(rig, payload, side);
    const parts: Part[] = [];
    const dynamics: DynamicPart[] = [];
    const limbSet = new Set<LimbKey>();
    const soft = def.kind !== 'skin' && def.kind !== 'bone' && def.kind !== 'cartilage' ? true : def.kind === 'bone' || def.kind === 'cartilage';
    for (const recipe of recipesOf(def)) {
      const built = buildRecipe(recipe, ctx, soft);
      for (const p of built) {
        if (p.dynamic) {
          const names = p.dynamic.path.flatMap((pr) => pointRefNames(pr)).map((n) => n.replace('{S}', side ?? 'L'));
          const limbNames = names.map(limbOfLandmark).filter((x): x is LimbKey => !!x);
          if (limbNames.length) {
            limbNames.forEach((l) => limbSet.add(l));
            dynamics.push(p.dynamic);
          } else delete p.dynamic;
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
        else if (mk === 'default') mat = makeMaterial({ color: colorFor(def), highlight: def.kind === 'muscle' ? '#ff5a3c' : def.kind === 'tendon' || def.kind === 'ligament' ? '#ffb347' : '#ffd24d', roughness: def.kind === 'bone' ? 0.62 : def.kind === 'tendon' || def.kind === 'ligament' ? 0.55 : def.kind === 'muscle' ? 0.5 : 0.55, H, side: def.id.startsWith('m_obliquus') || def.id === 'm_transversus_abdominis' || def.id === 'mm_intercostales' || def.id === 'diaphragma' ? THREE.DoubleSide : THREE.FrontSide });
        else {
          const c = MAT_COLORS[mk];
          mat = makeMaterial({ color: c.color, roughness: c.roughness, metalness: c.metalness, H });
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
      mesh.castShadow = true;
      mesh.receiveShadow = false;
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
    resolve: (ref: PointRef): V3 => resolveNow(ref, rig, side, model.landmarkNow),
  };
  for (const inst of model.instances) {
    if (!inst.isSoftOf(limb)) continue;
    if (inst.side && inst.side !== side) continue;
    for (const d of inst.dynamics) {
      const pts = d.path.map((p) => ctx.resolve(p));
      d.sweep.update(pts);
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

function resolveNow(ref: PointRef, rig: Rig, side: Side, now: (n: string) => V3): V3 {
  const H = rig.H;
  const sgn = side === 'L' ? 1 : -1;
  const name = (n: string) => n.replace('{S}', side);
  if (typeof ref === 'string') return now(name(ref));
  if (Array.isArray(ref)) return resolvePoint(ref, rig, side);
  let base: V3;
  if (ref.between) {
    const a = now(name(ref.between[0])), b = now(name(ref.between[1]));
    const t = ref.t ?? 0.5;
    base = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  } else if (ref.at) base = now(name(ref.at));
  else base = [0, 0, 0];
  return [base[0] + (ref.dx ?? 0) * H, base[1] + (ref.dy ?? 0) * H, base[2] + (ref.dz ?? 0) * H + (ref.lat ?? 0) * H * sgn];
}
