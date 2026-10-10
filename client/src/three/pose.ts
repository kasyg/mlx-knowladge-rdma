/**
 * Pure joint-pose math shared by the runtime (three.js pivots), the muscle
 * physics and the unit tests. A limb is a chain of hinges about the world z
 * axis through the rest positions of the joint landmarks; positive angles are
 * anatomical flexion (degrees), negative ones extension.
 */
import type { PointRef, Side } from '@shared/types';
import { resolvePoint, type Rig, type V3 } from '@shared/rig';
import { segmentOfLandmark, FORELIMB_CHAIN, HINDLIMB_CHAIN, type JointName, type LimbKey, type SegmentId } from './segments.ts';

/**
 * Rotation sign about +z for a positive flexion angle. Derived from the joint
 * geometry (cranial = -x, dorsal = +y): the shoulder flexes when the humerus
 * turns towards the scapula (counter-clockwise seen from the left), the elbow
 * when the forearm swings forwards (clockwise), carpus / fetlock / pastern when
 * the distal part swings palmarly; hip and hock flex clockwise, the stifle
 * counter-clockwise.
 */
export const FLEX_SIGN: Record<JointName, number> = { shoulder: 1, elbow: -1, carpus: 1, fetlock: 1, pastern: 1, hip: -1, stifle: 1, hock: -1 };

export type JointAngles = Partial<Record<JointName, number>>;

export const chainOf = (limb: LimbKey): JointName[] => (limb.startsWith('fl') ? FORELIMB_CHAIN : HINDLIMB_CHAIN);

/** Posed position of a rest point that moves with segment `seg` for the given joint angles. */
export function posePoint(rig: Rig, rest: V3, seg: SegmentId | null, angles: JointAngles): V3 {
  if (!seg) return rest;
  const m = /^(fl|hl)_([LR])_(\w+)$/.exec(seg);
  if (!m) return rest;
  const limb = `${m[1]}_${m[2]}` as LimbKey;
  const chain = chainOf(limb);
  const k = chain.indexOf(m[3] as JointName);
  let x = rest[0], y = rest[1];
  // nested hinges: the innermost joint first, every rotation about its rest centre
  for (let i = k; i >= 0; i--) {
    const j = chain[i];
    const a = (((angles[j] ?? 0) * FLEX_SIGN[j]) * Math.PI) / 180;
    if (!a) continue;
    const c = rig.landmarks[`${limb}_${j}`];
    const dx = x - c[0], dy = y - c[1];
    const ca = Math.cos(a), sa = Math.sin(a);
    x = c[0] + dx * ca - dy * sa;
    y = c[1] + dx * sa + dy * ca;
  }
  return [x, y, rest[2]];
}

/** The limb segment a point reference moves with (from its base landmark). */
export function segmentOfRef(ref: PointRef, side: Side | null): SegmentId | null {
  const S = side ?? 'L';
  if (typeof ref === 'string') return segmentOfLandmark(ref.replace('{S}', S));
  if (Array.isArray(ref)) return null;
  const base = ref.at ?? ref.between?.[0];
  return base ? segmentOfLandmark(base.replace('{S}', S)) : null;
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Posed position of a path point (tendon, ligament, vessel, nerve). The offset
 * from its landmark is part of that landmark's bone and turns with it; a point
 * between two landmarks on either side of a joint follows both posed ends and
 * turns its offset with the nearer one. Same rule as the runtime (animal.ts).
 */
export function posePathPoint(rig: Rig, ref: PointRef, side: Side, angles: JointAngles): V3 {
  const name = (n: string) => n.replace('{S}', side);
  if (typeof ref === 'string') return posePoint(rig, rig.landmarks[name(ref)], segmentOfLandmark(name(ref)), angles);
  if (Array.isArray(ref)) return resolvePoint(ref, rig, side);
  const rest = resolvePoint(ref, rig, side);
  if (ref.at && !ref.between) return posePoint(rig, rest, segmentOfLandmark(name(ref.at)), angles);
  if (!ref.between) return rest;
  const a = name(ref.between[0]);
  const b = name(ref.between[1]);
  const sa = segmentOfLandmark(a);
  const sb = segmentOfLandmark(b);
  if (sa === sb) return posePoint(rig, rest, sa, angles);
  const t = ref.t ?? 0.5;
  const restBase = lerp3(rig.landmarks[a], rig.landmarks[b], t);
  const base = lerp3(posePoint(rig, rig.landmarks[a], sa, angles), posePoint(rig, rig.landmarks[b], sb, angles), t);
  const seg = t < 0.5 ? sa : sb;
  const o0 = posePoint(rig, restBase, seg, angles);
  const o1 = posePoint(rig, rest, seg, angles);
  return [base[0] + o1[0] - o0[0], base[1] + o1[1] - o0[1], base[2] + o1[2] - o0[2]];
}

export const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** length of a polyline */
export function polyLength(points: V3[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist3(points[i - 1], points[i]);
  return l;
}
