/**
 * Shared type definitions for VetAtlas 3D.
 * Used by the client (3D builders, UI), the server (API, seed) and tests.
 */

export type UiLang = 'cs' | 'en';
export type LabelLang = 'la' | 'cs' | 'en';
export type SpeciesId = 'horse' | 'dog' | 'cat' | 'cow' | 'goat';
export const SPECIES_IDS: SpeciesId[] = ['horse', 'cow', 'goat', 'dog', 'cat'];

export type Side = 'L' | 'R';

/** Peelable tissue layers (ordered from superficial to deep). */
export type LayerId = 'skin' | 'muscles' | 'tendons' | 'cartilage' | 'bones';
export const LAYER_IDS: LayerId[] = ['skin', 'muscles', 'tendons', 'cartilage', 'bones'];

/** Organ systems that can be overlaid independently of the peel depth. */
export type SystemId = 'vascular' | 'respiratory' | 'digestive' | 'nervous' | 'urinary';
export const SYSTEM_IDS: SystemId[] = ['vascular', 'respiratory', 'digestive', 'nervous', 'urinary'];

export type GroupId = LayerId | SystemId;

export type RegionBase =
  | 'head'
  | 'mouth'
  | 'neck'
  | 'thorax'
  | 'abdomen'
  | 'back'
  | 'pelvis'
  | 'forelimb'
  | 'hindlimb'
  | 'tail';

/** Concrete clickable regions (limbs are split by side). */
export type RegionId =
  | 'head'
  | 'mouth'
  | 'neck'
  | 'thorax'
  | 'abdomen'
  | 'back'
  | 'pelvis'
  | 'forelimb_left'
  | 'forelimb_right'
  | 'hindlimb_left'
  | 'hindlimb_right'
  | 'tail';

export type StructureKind =
  | 'skin'
  | 'bone'
  | 'cartilage'
  | 'muscle'
  | 'tendon'
  | 'ligament'
  | 'artery'
  | 'vein'
  | 'heart'
  | 'respiratory'
  | 'digestive'
  | 'nerve'
  | 'sensory'
  | 'urinary';

export interface Names {
  la: string;
  cs: string;
  en: string;
}

export interface Text2 {
  cs: string;
  en: string;
}

/** A point reference resolved against the species rig. Offsets are in units of withers height (H). */
export type PointRef =
  | string
  | [number, number, number]
  | {
      at?: string;
      between?: [string, string];
      t?: number;
      /** caudal (+) / cranial (-) offset */
      dx?: number;
      /** dorsal (+) / ventral (-) offset */
      dy?: number;
      /** absolute left (+) / right (-) offset */
      dz?: number;
      /** lateral offset: outward for the instance side (left +z, right -z) */
      lat?: number;
    };

export type Outward = 'lateral' | 'medial' | 'dorsal' | 'ventral' | 'cranial' | 'caudal' | [number, number, number];

export interface SweepRecipe {
  type: 'sweep';
  path: PointRef[];
  /** radius in H units; an array gives a per-point profile (interpolated) */
  r: number | number[];
  profile?: 'fusiform' | 'tube' | 'bone' | 'taper' | 'cone' | 'flat';
  /** thickness / width ratio of the cross-section (1 = round) */
  aspect?: number;
  outward?: Outward;
  /** radius at the ends for the fusiform profile, as a fraction of r */
  rEnds?: number;
  radial?: number;
  segments?: number;
  closed?: boolean;
  /** CatmullRom tension (0 = straight-ish) */
  tension?: number;
}

export interface EllipsoidRecipe {
  type: 'ellipsoid';
  at: PointRef;
  /** half axes [x, y, z] in H units */
  size: [number, number, number];
  rot?: [number, number, number];
  detail?: number;
}

export interface LoftSection {
  t: number;
  w: number;
  h: number;
  yOff?: number;
  zOff?: number;
  /** superellipse exponent (2 = ellipse, >2 = squarer) */
  n?: number;
  /** pear factor: narrows the dorsal part, widens the ventral part */
  pear?: number;
}

export interface LoftRecipe {
  type: 'loft';
  axis: PointRef[];
  sections: LoftSection[];
  outward?: Outward;
  radial?: number;
  closeEnds?: boolean;
}

/** Species-aware builders that need the whole rig (ribs, skull, pelvis, skin...). */
export interface SpecialRecipe {
  type: 'special';
  name: string;
  part?: string;
  limb?: 'fl' | 'hl';
}

/** corner of a muscle sheet in body-surface (u, v) space; landmark-based corners are projected onto the surface */
export type CornerRef = [number, number] | { at: string; du?: number; dv?: number };

/**
 * Superficial muscle as a Coons patch on a body-surface part. u: 0 dorsal,
 * 0.25 left (limbs: 0 cranial, 0.25 lateral), v: 0..1 along the part. Numeric
 * corners describe the LEFT side and are mirrored for the right side.
 * Corner order: origin edge (c0 → c1), insertion edge (c3 → c2); fibres run c0→c3.
 */
export interface SheetRecipe {
  type: 'sheet';
  part: 'trunk' | 'neck' | 'head' | 'fl' | 'hl';
  corners: [CornerRef, CornerRef, CornerRef, CornerRef];
  mids?: (CornerRef | null)[];
  /** max thickness in H units */
  bulge: number;
  /** groove depth at the edges in H units */
  dip?: number;
  /** 1 = directly under the skin, 2/3 = deeper (avoids z-fighting with overlying sheets) */
  layer?: number;
}

export type GeometryRecipe = SweepRecipe | EllipsoidRecipe | LoftRecipe | SpecialRecipe | SheetRecipe;

export type MotionJoint = 'shoulder' | 'elbow' | 'carpus' | 'fetlock_fl' | 'hip' | 'stifle' | 'hock' | 'fetlock_hl';
export type MotionAction = 'flexion' | 'extension';

export interface MotionRole {
  joint: MotionJoint;
  action: MotionAction;
}

export interface StructureDef {
  id: string;
  kind: StructureKind;
  group: GroupId;
  /** additional systems in which the structure should also be shown */
  systems?: SystemId[];
  regions: RegionBase[];
  bilateral?: boolean;
  names: Names;
  description: Text2;
  origin?: Text2;
  insertion?: Text2;
  function?: Text2;
  speciesNotes?: Partial<Record<SpeciesId, Text2>>;
  /** present only in these species */
  species?: SpeciesId[];
  excludeSpecies?: SpeciesId[];
  geometry: GeometryRecipe | GeometryRecipe[];
  motion?: MotionRole[];
  /** colour override (CSS hex) */
  color?: string;
  /** flow direction for vessels: +1 along the path, -1 against it */
  flow?: 1 | -1;
  /** label priority (higher = shown first when decluttering) */
  priority?: number;
}

export interface RegionDef {
  id: RegionBase;
  names: Names;
  description: Text2;
  /** landmark for the hotspot */
  anchor: PointRef;
  sided?: boolean;
  /** canonical camera orientation (radians) – azimuth 0 = left lateral view */
  view: { azimuth: number; polar: number };
  /** kinds used to compute the focus box */
  boxKinds?: StructureKind[];
  motion?: 'forelimb' | 'hindlimb';
}

export interface XY {
  x: number;
  y: number;
}
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface HeadSection {
  t: number;
  w: number;
  h: number;
  yOff?: number;
  n?: number;
}

export interface LimbRadii {
  upper: number;
  joint1: number;
  mid: number;
  joint2: number;
  cannon: number;
  fetlock: number;
  pastern: number;
  hoof: number;
}

export interface ForelimbParams {
  z: number;
  scapulaTop: XY;
  shoulder: XY;
  elbow: XY;
  carpus: XY;
  fetlock: XY;
  pastern: XY;
  hoof: XY;
  r: LimbRadii;
}

export interface HindlimbParams {
  z: number;
  tuberCoxae: XYZ;
  tuberIschii: XYZ;
  hip: XY;
  stifle: XY;
  hock: XY;
  fetlock: XY;
  pastern: XY;
  hoof: XY;
  r: LimbRadii;
}

export interface TrunkSection {
  x: number;
  top: number;
  bottom: number;
  w: number;
  n?: number;
  pear?: number;
}

export type EarStyle = 'horse' | 'cow' | 'goat' | 'dog' | 'cat';
export type TailStyle = 'horse' | 'cow' | 'goat' | 'dog' | 'cat';
export type Digits = 'hoof' | 'cloven' | 'paw';

export interface FurParams {
  base: string;
  secondary: string;
  pattern: 'solid' | 'patches' | 'tabby' | 'spots';
  /** y (fraction of H) below which the coat darkens (e.g. bay horse black points) */
  pointsY?: number;
  pointsColor?: string;
  bellyLight?: number;
  seed: number;
  scale: number;
  roughness?: number;
}

export interface RigParams {
  H: number;
  spine: {
    t1: XY;
    tLast: XY;
    lLast: XY;
    sacrumEnd: XY;
    bow: number;
    withersTop: number;
    croupTop: number;
    spineHeights: { thoracic: number; lumbar: number; sacral: number };
  };
  counts: { cervical: number; thoracic: number; lumbar: number; sacral: number; caudal: number };
  neck: { base: XY; ctrl: XY; atlas: XY; sections: HeadSection[] };
  head: {
    occiput: XY;
    nose: XY;
    sections: HeadSection[];
    skullScale: number;
    eye: { t: number; yOff: number; z: number; r: number };
    ear: { t: number; yOff: number; z: number; length: number; width: number; style: EarStyle; tilt: number };
    jaw: { tmjT: number; tmjY: number; z: number; angleT: number; angleY: number; chinT: number; chinY: number; thickness: number };
    nostril: { t: number; yOff: number; z: number; r: number };
    mouthCorner: { t: number; yOff: number; z: number };
    horns?: { t: number; yOff: number; z: number; length: number; r: number; dir: [number, number, number]; curve: [number, number, number] };
    beard?: { length: number };
    noseLeather?: boolean;
  };
  trunk: {
    sections: TrunkSection[];
    sternum: { front: XY; back: XY };
    ribcage: { sternalRibs: number; scale: number };
    udder?: { x: number; y: number; size: number };
    dewlap?: number;
  };
  forelimb: ForelimbParams;
  hindlimb: HindlimbParams;
  tail: { base: XY; ctrl: XY[]; tip: XY; r0: number; style: TailStyle; hairLength?: number };
  mane?: { length: number; forelock?: boolean };
  digits: Digits;
  fur: FurParams;
}

export interface Physiology {
  /** beats per minute */
  heartRate: number;
  /** breaths per minute */
  respRate: number;
  /** body temperature in °C */
  temperature: number;
}

export interface SpeciesMeta {
  id: SpeciesId;
  names: Names;
  breedNote: Text2;
  description: Text2;
  facts: { label: Text2; value: Text2 }[];
  physiology: Physiology;
  stomach: 'simple' | 'ruminant';
  /** silhouette dimension for layout on the species selection scene */
  footprint: { length: number; height: number };
}

export interface SpeciesDef {
  meta: SpeciesMeta;
  rig: RigParams;
  structureOverrides?: Record<string, Partial<Pick<StructureDef, 'names' | 'description' | 'geometry' | 'color'>> & { speciesNote?: Text2 }>;
}

/** Payload returned by GET /api/species/:id */
export interface SpeciesPayload {
  meta: SpeciesMeta;
  rig: RigParams;
  regions: RegionDef[];
  structures: StructureDef[];
}

export interface Note {
  id: number;
  deviceId: string;
  species: SpeciesId;
  structureId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  uiLang: UiLang;
  labelLang: LabelLang;
  haptics: boolean;
  reduceMotion: boolean;
  labelSize: 'S' | 'M' | 'L';
  theme: 'light' | 'dark';
  animationSpeed: number;
  showAllLabels: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  uiLang: 'cs',
  labelLang: 'la',
  haptics: true,
  reduceMotion: false,
  labelSize: 'M',
  theme: 'light',
  animationSpeed: 1,
  showAllLabels: false,
};
