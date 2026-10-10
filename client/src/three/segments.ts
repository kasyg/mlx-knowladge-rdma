import type { Side } from '@shared/types';

export type JointName = 'shoulder' | 'elbow' | 'carpus' | 'fetlock' | 'pastern' | 'hip' | 'stifle' | 'hock';
export type LimbKey = `fl_${Side}` | `hl_${Side}`;
export type SegmentId = `${LimbKey}_${JointName}`;

const FL: Record<string, JointName | null> = {
  scapula_top: null, scapula_mid: null, scapula_spine: null, scapula_caudal: null, scapula_cranial: null, acromion: null, axilla: null, limb_center: null, shoulder: null,
  humerus_mid: 'shoulder', deltoid_tuberosity: 'shoulder', elbow: 'shoulder',
  olecranon: 'elbow', elbow_cranial: 'elbow', radius_mid: 'elbow', radius_prox: 'elbow', radius_dist: 'elbow', carpus: 'elbow',
  accessory_carpal: 'carpus', cannon_mid: 'carpus', cannon_prox: 'carpus', cannon_dist: 'carpus', fetlock: 'carpus',
  sesamoid: 'fetlock', pastern: 'fetlock',
  coffin: 'pastern', toe: 'pastern', heel: 'pastern', hoof: 'pastern',
};
const HL: Record<string, JointName | null> = {
  tuber_coxae: null, tuber_ischii: null, hip: null, ischiatic_notch: null, groin: null, limb_center: null,
  trochanter: 'hip', femur_mid: 'hip', femur_prox: 'hip', femur_dist: 'hip', third_trochanter: 'hip', thigh_medial: 'hip', stifle: 'hip', patella: 'hip',
  tibial_tuberosity: 'stifle', tibia_mid: 'stifle', tibia_prox: 'stifle', tibia_dist: 'stifle', hock: 'stifle',
  hock_cranial: 'hock', calcaneus: 'hock', cannon_mid: 'hock', cannon_prox: 'hock', cannon_dist: 'hock', fetlock: 'hock',
  sesamoid: 'fetlock', pastern: 'fetlock',
  coffin: 'pastern', toe: 'pastern', heel: 'pastern', hoof: 'pastern',
};

/** Which limb segment a landmark moves with (null = static). */
export function segmentOfLandmark(name: string): SegmentId | null {
  const m = /^(fl|hl)_([LR])_(.+)$/.exec(name);
  if (!m) return null;
  const table = m[1] === 'fl' ? FL : HL;
  const j = table[m[3]];
  if (!j) return null;
  return `${m[1]}_${m[2] as Side}_${j}` as SegmentId;
}

export function limbOfLandmark(name: string): LimbKey | null {
  const m = /^(fl|hl)_([LR])_/.exec(name);
  return m ? (`${m[1]}_${m[2]}` as LimbKey) : null;
}

export const FORELIMB_CHAIN: JointName[] = ['shoulder', 'elbow', 'carpus', 'fetlock', 'pastern'];
export const HINDLIMB_CHAIN: JointName[] = ['hip', 'stifle', 'hock', 'fetlock', 'pastern'];
