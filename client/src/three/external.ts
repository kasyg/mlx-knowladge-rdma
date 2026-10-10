/**
 * External (scanned / modelled) meshes for a species: glTF / GLB files dropped
 * into client/public/models/<species>/ together with a manifest.json.
 *
 * Each manifest entry is aligned to the procedural model (up axis, facing
 * direction, fit to the bounding box of the same layer), its meshes are mapped
 * to atlas structures (nearest procedural structure, or a manual node map) and
 * then take the place of the procedural geometry of those structures: labels,
 * regions, peeling, highlighting and limb motion keep working, the imported
 * mesh is what the student sees.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GroupId, RegionId, SpeciesId, StructureDef } from '@shared/types';
import { makeMaterial, uniformsOf, enableShadows, KIND_COLORS, tissueOf } from './materials.ts';
import type { AnimalModel, StructureInstance } from './animal.ts';
import { plainCopy } from './exporter.ts';
import { pointRefNames } from '@shared/rig';
import { segmentOfLandmark, FORELIMB_CHAIN, HINDLIMB_CHAIN, type SegmentId } from './segments.ts';

/**
 * The limb segment a rigid bone rides on, from the landmarks of its procedural
 * (deformable) path. Joint landmarks belong to the segment above the joint, so
 * the deepest segment the path touches is the bone's own: P1 drawn from the
 * fetlock to the pastern joint rides on the segment that pivots at the fetlock.
 */
function rigidSegment(inst: StructureInstance): SegmentId | null {
  let best: SegmentId | null = null;
  let depth = -1;
  for (const d of inst.dynamics) {
    if (d.kind !== 'sweep') continue;
    for (const ref of d.path) {
      for (const n of pointRefNames(ref)) {
        const seg = segmentOfLandmark(n.replace('{S}', inst.side ?? 'L'));
        if (!seg) continue;
        const m = /^(fl|hl)_[LR]_(\w+)$/.exec(seg)!;
        const k = (m[1] === 'fl' ? FORELIMB_CHAIN : HINDLIMB_CHAIN).indexOf(m[2] as never);
        if (k > depth) {
          depth = k;
          best = seg;
        }
      }
    }
  }
  return best;
}

export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface ExternalAttribution {
  title: string;
  author?: string;
  license?: string;
  url?: string;
}

export interface ExternalEntry {
  /** short id of the entry (e.g. "skeleton") */
  id: string;
  /** file relative to the species model folder (glTF, GLB) */
  file: string;
  /** atlas layer the meshes belong to */
  group?: GroupId;
  attribution?: ExternalAttribution;
  /** up axis in the file – glTF files are +y by convention */
  up?: Axis;
  /** direction the animal faces in the file (atlas: -x) */
  forward?: Axis;
  /** auto-fit to the procedural structures of the layer: by height, by length or not at all */
  fit?: 'height' | 'length' | 'none';
  /** manual corrections applied after the automatic fit */
  scale?: number;
  /** metres, after scaling */
  offset?: [number, number, number];
  /** degrees, X/Y/Z, after scaling */
  rotation?: [number, number, number];
  /** node name (or "#<mesh index>") → structure key ("scapula_L", "cranium", …) */
  map?: Record<string, string>;
  /** map unlisted meshes to the nearest procedural structure (default true) */
  autoMap?: boolean;
  /** hide the procedural geometry of mapped structures (default true) */
  replace?: boolean;
  /** keep the textures of the file (default true) */
  textures?: boolean;
  /** move the rig's joints to the imported bones so skin, muscles and vessels are rebuilt around them (bones layer, default true) */
  fitRig?: boolean;
}

export interface ExternalManifest {
  version?: number;
  models: ExternalEntry[];
}

export interface ExternalResult {
  entry: ExternalEntry;
  meshes: number;
  mapped: number;
  unmapped: number;
  /** structure key → number of meshes */
  byStructure: Record<string, number>;
  /** model bounding box after alignment (metres) */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export const EXTERNAL_BASE = '/models';

/** Draco-compressed meshes (the sculpted skeletons) are decoded with the decoder shipped in client/public/draco. */
let draco: DRACOLoader | null = null;
function dracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader();
    // WebAssembly decoding is the default whenever the browser supports it
    draco.setDecoderPath('/draco/');
  }
  return draco;
}

/** Load the manifest of a species; null when there is none (404). */
export async function loadManifest(species: SpeciesId): Promise<ExternalManifest | null> {
  try {
    const res = await fetch(`${EXTERNAL_BASE}/${species}/manifest.json`, { cache: 'no-cache' });
    // a missing manifest comes back as the SPA page (200, text/html) from both dev and production servers
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const json = (await res.json()) as ExternalManifest;
    if (!json || !Array.isArray(json.models)) return null;
    return json;
  } catch {
    return null;
  }
}

const AXES: Record<Axis, THREE.Vector3> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
};

/** Rotation that takes the file's (up, forward) frame to the atlas frame (up +y, forward -x). */
export function orientationMatrix(up: Axis = '+y', forward: Axis = '-x'): THREE.Matrix4 {
  const u = AXES[up].clone();
  let f = AXES[forward].clone();
  if (Math.abs(u.dot(f)) > 0.5) f = AXES['-x'].clone(); // degenerate input: ignore the forward hint
  f.addScaledVector(u, -u.dot(f)).normalize();
  const s = new THREE.Vector3().crossVectors(u, f); // left side of the animal in file space
  // atlas basis: forward -x, up +y, left +z  →  columns of the target frame
  const src = new THREE.Matrix4().makeBasis(f, u, s); // file frame expressed in file coordinates
  const dst = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  return dst.multiply(src.invert());
}

interface Collected {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  name: string;
  index: number;
  box: THREE.Box3;
}

function collectMeshes(scene: THREE.Object3D): Collected[] {
  scene.updateWorldMatrix(true, true);
  const out: Collected[] = [];
  let index = 0;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = plainCopy(mesh.geometry as THREE.BufferGeometry);
    geometry.applyMatrix4(mesh.matrixWorld);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    let name = mesh.name;
    let p: THREE.Object3D | null = mesh.parent;
    while (!name && p && p !== scene) {
      name = p.name;
      p = p.parent;
    }
    out.push({ mesh, geometry, name: name || `#${index}`, index, box: geometry.boundingBox!.clone() });
    index++;
  });
  return out;
}

function unionBox(items: { box: THREE.Box3 }[]): THREE.Box3 {
  const b = new THREE.Box3();
  for (const it of items) b.union(it.box);
  return b;
}

/** Nearest procedural structure of the same layer for a mesh: distance of the centres, normalised by the structure's size. */
function nearestStructure(center: THREE.Vector3, size: number, candidates: StructureInstance[]): { inst: StructureInstance; score: number } | null {
  let best: { inst: StructureInstance; score: number } | null = null;
  const c = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const inst of candidates) {
    if (inst.box.isEmpty()) continue;
    inst.box.getCenter(c);
    inst.box.getSize(s);
    const radius = Math.max(0.02, s.length() * 0.5);
    const d = c.distanceTo(center) / radius;
    // a structure much smaller than the mesh cannot be the match (e.g. a sesamoid for a whole leg)
    const sizePenalty = size > radius * 3 ? (size / radius) * 0.5 : 0;
    const score = d + sizePenalty;
    if (!best || score < best.score) best = { inst, score };
  }
  return best;
}

function structureKey(inst: StructureInstance) {
  return inst.key;
}

/**
 * Load one manifest entry and merge it into the model. Returns a summary.
 * Throws when the file cannot be loaded; the caller decides whether to continue.
 */
export async function applyExternalEntry(model: AnimalModel, species: SpeciesId, entry: ExternalEntry): Promise<ExternalResult> {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader());
  const url = `${EXTERNAL_BASE}/${species}/${entry.file}`;
  const gltf = await loader.loadAsync(url);
  const group: GroupId = entry.group ?? 'bones';
  const items = collectMeshes(gltf.scene);
  if (!items.length) throw new Error(`${url}: no meshes`);

  // ---------------------------------------------------------------- alignment
  const orient = orientationMatrix(entry.up ?? '+y', entry.forward ?? '-x');
  for (const it of items) {
    it.geometry.applyMatrix4(orient);
    it.geometry.computeBoundingBox();
    it.box.copy(it.geometry.boundingBox!);
  }
  const candidates = model.instances.filter((i) => i.group === group && !i.box.isEmpty());
  const target = unionBox(candidates.length ? candidates : model.instances);
  const srcBox = unionBox(items);
  const fit = entry.fit ?? 'height';
  const srcSize = new THREE.Vector3(), dstSize = new THREE.Vector3();
  srcBox.getSize(srcSize);
  target.getSize(dstSize);
  let scale = 1;
  if (fit === 'height' && srcSize.y > 1e-6) scale = dstSize.y / srcSize.y;
  else if (fit === 'length' && srcSize.x > 1e-6) scale = dstSize.x / srcSize.x;
  scale *= entry.scale ?? 1;
  const m = new THREE.Matrix4().makeScale(scale, scale, scale);
  if (entry.rotation) {
    const [rx, ry, rz] = entry.rotation.map((d) => (d * Math.PI) / 180);
    m.premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')));
  }
  for (const it of items) {
    it.geometry.applyMatrix4(m);
    it.geometry.computeBoundingBox();
    it.box.copy(it.geometry.boundingBox!);
  }
  const scaled = unionBox(items);
  const shift = new THREE.Vector3();
  if (fit !== 'none') {
    const sc = new THREE.Vector3(), tc = new THREE.Vector3();
    scaled.getCenter(sc);
    target.getCenter(tc);
    shift.set(tc.x - sc.x, target.min.y - scaled.min.y, tc.z - sc.z);
  }
  if (entry.offset) shift.add(new THREE.Vector3(...entry.offset));
  if (shift.lengthSq() > 0) {
    const t = new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z);
    for (const it of items) {
      it.geometry.applyMatrix4(t);
      it.geometry.computeBoundingBox();
      it.box.copy(it.geometry.boundingBox!);
    }
  }
  const bounds = unionBox(items);
  const modelDiag = new THREE.Vector3();
  bounds.getSize(modelDiag);

  // ---------------------------------------------------------------- mapping
  const manual = entry.map ?? {};
  const autoMap = entry.autoMap ?? true;
  const assignments = new Map<StructureInstance, Collected[]>();
  const loose: Collected[] = [];
  const byKey = model.byKey;
  const resolveKey = (k: string): StructureInstance | undefined => byKey.get(k) ?? byKey.get(`${k}_L`) ?? byKey.get(`${k}_R`);
  for (const it of items) {
    const manualKey = manual[it.name] ?? manual[`#${it.index}`];
    let inst: StructureInstance | undefined;
    if (manualKey) inst = resolveKey(manualKey);
    else if (autoMap) {
      const size = new THREE.Vector3();
      it.box.getSize(size);
      const c = new THREE.Vector3();
      it.box.getCenter(c);
      const whole = size.length() > modelDiag.length() * 0.6; // one mesh for (almost) the whole model
      if (!whole) {
        const best = nearestStructure(c, size.length(), candidates);
        if (best && best.score < 2.5) inst = best.inst;
      }
    }
    if (inst) {
      const arr = assignments.get(inst) ?? [];
      arr.push(it);
      assignments.set(inst, arr);
    } else loose.push(it);
  }

  // ---------------------------------------------------------------- materials & swap
  const H = model.rig.H;
  const withersTop = model.rig.params.spine.withersTop;
  const keepTextures = entry.textures ?? true;
  const makeMat = (def: StructureDef, src: THREE.Material | THREE.Material[] | undefined) => {
    const base = (Array.isArray(src) ? src[0] : src) as (THREE.MeshStandardMaterial & { map?: THREE.Texture | null }) | undefined;
    const tex = keepTextures && base && 'map' in base ? base.map ?? null : null;
    const mat = makeMaterial({
      color: tex ? '#ffffff' : def.color ?? KIND_COLORS[def.kind],
      map: tex,
      roughness: def.kind === 'bone' ? 0.6 : 0.55,
      highlight: def.kind === 'muscle' ? '#ff5a3c' : def.kind === 'tendon' || def.kind === 'ligament' ? '#ffb347' : '#ffd24d',
      H,
      side: THREE.DoubleSide,
      tissue: tissueOf(def.kind),
    });
    if (keepTextures && base && 'normalMap' in base && base.normalMap) {
      mat.normalMap = base.normalMap;
      mat.normalScale.copy(base.normalScale);
    }
    if (base && 'vertexColors' in base && base.vertexColors) mat.vertexColors = true;
    const u = uniformsOf(mat);
    u.uDissolveY.value.set(0, withersTop * 1.15);
    u.uBodyY.value.set(0, withersTop);
    return { mat, u };
  };
  const replace = entry.replace ?? true;
  const byStructure: Record<string, number> = {};
  let mapped = 0;
  for (const [inst, arr] of assignments) {
    // the imported meshes join the structure: same parent (segment pivot or node), same offsets
    let parent: THREE.Object3D = inst.meshes[0]?.parent ?? inst.node;
    let offset = inst.meshes[0]?.position.clone() ?? new THREE.Vector3();
    const rigid = inst.def.kind === 'bone' || inst.def.kind === 'cartilage';
    if (replace && rigid && inst.dynamics.length) {
      // a bone the procedural model bent along its path is rigid once sculpted: it rides on its limb segment
      const seg = rigidSegment(inst);
      if (seg) {
        parent = model.segmentNode(seg);
        const base = model.segmentRest(seg);
        offset = new THREE.Vector3(-base.x, -base.y, -base.z);
      }
      inst.dynamics.length = 0;
    }
    if (replace) {
      for (const mesh of inst.meshes) {
        mesh.parent?.remove(mesh);
        mesh.geometry.dispose();
      }
      inst.meshes.length = 0;
      inst.materials.forEach((mm) => mm.dispose());
      inst.materials.length = 0;
      inst.uniforms.length = 0;
      inst.box.makeEmpty();
    }
    const { mat, u } = makeMat(inst.def, arr[0].mesh.material);
    inst.materials.push(mat);
    inst.uniforms.push(u);
    for (const it of arr) {
      const mesh = new THREE.Mesh(it.geometry, mat);
      enableShadows(mesh);
      mesh.userData.key = inst.key;
      mesh.userData.external = entry.id;
      mesh.position.copy(offset);
      parent.add(mesh);
      inst.meshes.push(mesh);
      inst.box.union(it.box);
      mapped++;
    }
    inst.box.getCenter(inst.anchor);
    inst.external = entry.id;
    byStructure[structureKey(inst)] = arr.length;
  }

  // meshes that matched nothing: shown as one "imported" structure of the layer
  if (loose.length) {
    const title = entry.attribution?.title ?? entry.id;
    const def: StructureDef = {
      id: `external_${entry.id}`,
      kind: group === 'muscles' ? 'muscle' : group === 'tendons' ? 'tendon' : group === 'cartilage' ? 'cartilage' : group === 'skin' ? 'skin' : 'bone',
      group,
      regions: ['head', 'neck', 'thorax', 'abdomen', 'back', 'pelvis', 'forelimb', 'hindlimb', 'tail'],
      names: { la: title, cs: title, en: title },
      description: {
        cs: `Importovaný model${entry.attribution?.author ? ` (${entry.attribution.author})` : ''}; části, které se nepodařilo přiřadit k jednotlivým strukturám.`,
        en: `Imported model${entry.attribution?.author ? ` (${entry.attribution.author})` : ''}; parts that could not be assigned to individual structures.`,
      },
      geometry: { type: 'special', name: 'external' },
      priority: 1,
    };
    const node = new THREE.Group();
    node.name = def.id;
    const { mat, u } = makeMat(def, loose[0].mesh.material);
    const meshes: THREE.Mesh[] = [];
    const box = new THREE.Box3();
    for (const it of loose) {
      const mesh = new THREE.Mesh(it.geometry, mat);
      enableShadows(mesh);
      mesh.userData.key = node.name;
      mesh.userData.external = entry.id;
      node.add(mesh);
      meshes.push(mesh);
      box.union(it.box);
    }
    model.root.add(node);
    const regions: RegionId[] = ['head', 'neck', 'thorax', 'abdomen', 'back', 'pelvis', 'forelimb_left', 'forelimb_right', 'hindlimb_left', 'hindlimb_right', 'tail'];
    const inst: StructureInstance = {
      key: node.name,
      def,
      side: null,
      regions,
      group,
      node,
      meshes,
      materials: [mat],
      uniforms: [u],
      anchor: box.getCenter(new THREE.Vector3()),
      box,
      dynamics: [],
      limbs: new Set(),
      pathLength: 0,
      shapes: [],
      isSoftOf: () => false,
      external: entry.id,
    };
    model.instances.push(inst);
    model.byKey.set(inst.key, inst);
  }

  model.bounds.union(bounds);
  return {
    entry,
    meshes: items.length,
    mapped,
    unmapped: loose.length,
    byStructure,
    bounds: { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] },
  };
}

/** Apply every entry of the species manifest; entries that fail are reported and skipped. */
export async function applyExternalModels(model: AnimalModel, species: SpeciesId, manifest: ExternalManifest): Promise<ExternalResult[]> {
  const out: ExternalResult[] = [];
  for (const entry of manifest.models) {
    try {
      const r = await applyExternalEntry(model, species, entry);
      console.info(`[vetatlas] external model "${entry.id}" (${species}): ${r.meshes} meshes, ${r.mapped} mapped, ${r.unmapped} loose`, r.byStructure);
      out.push(r);
    } catch (e) {
      console.warn(`[vetatlas] external model "${entry.id}" (${species}) skipped:`, e);
    }
  }
  model.external = out;
  return out;
}
