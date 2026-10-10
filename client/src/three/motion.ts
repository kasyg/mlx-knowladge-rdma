import type { AnimalModel } from './animal.ts';
import { updateSoftTissue } from './animal.ts';
import type { JointName, LimbKey } from './segments.ts';
import type { MotionJoint } from '@shared/types';

/** sign that turns a positive "flexion" angle into a rotation about +z for the left side */
const FLEX_SIGN: Record<JointName, number> = { shoulder: -1, elbow: -1, carpus: 1, fetlock: 1, pastern: 1, hip: -1, stifle: -1, hock: -1 };

export interface MotionState {
  phase: number; // 0..1 of the stride cycle
  stance: boolean;
  angles: Record<JointName, number>; // degrees of flexion (+) / extension (-)
}

const deg = Math.PI / 180;

/** Simple walk-like stride: stance = first half of the cycle, swing = second half. */
export function strideAngles(limb: LimbKey, phase: number): MotionState {
  const w = phase * Math.PI * 2;
  const swing = Math.max(0, Math.sin(w));       // >0 during the swing phase
  const stanceK = Math.max(0, -Math.sin(w));    // >0 during the stance phase
  const stance = stanceK > 0.01 && swing < 0.01;
  const fore = limb.startsWith('fl');
  const angles = { shoulder: 0, elbow: 0, carpus: 0, fetlock: 0, pastern: 0, hip: 0, stifle: 0, hock: 0 } as Record<JointName, number>;
  if (fore) {
    angles.shoulder = -10 * Math.cos(w);            // protraction then retraction
    angles.elbow = 32 * Math.pow(swing, 1.2) - 4 * stanceK; // flexes in swing, extends under load
    angles.carpus = 60 * Math.pow(Math.max(0, Math.sin(w + 0.5)), 1.4) * (swing > 0 ? 1 : 0) - 2 * stanceK;
    angles.fetlock = 22 * swing - 24 * stanceK;     // flexes in swing, hyper-extends under load
    angles.pastern = 8 * swing - 6 * stanceK;
  } else {
    angles.hip = -14 * Math.cos(w);
    angles.stifle = 36 * Math.pow(swing, 1.1) - 5 * stanceK; // flexes in swing, extends at push-off
    angles.hock = 40 * Math.pow(Math.max(0, Math.sin(w + 0.3)), 1.3) * (swing > 0 ? 1 : 0) - 6 * stanceK;
    angles.fetlock = 20 * swing - 24 * stanceK;
    angles.pastern = 8 * swing - 6 * stanceK;
  }
  return { phase, stance, angles };
}

export function applyMotion(model: AnimalModel, limb: LimbKey, state: MotionState | null) {
  const piv = model.limbs.get(limb);
  if (!piv) return;
  const sgn = limb.endsWith('L') ? 1 : 1; // rotation about world z is identical for both sides
  for (const j of piv.chain) {
    const a = state ? state.angles[j] : 0;
    piv.joints[j].rotation.z = a * deg * FLEX_SIGN[j] * sgn;
  }
  model.root.updateMatrixWorld(true);
  updateSoftTissue(model, limb);
}

export function resetMotion(model: AnimalModel) {
  for (const piv of model.limbs.values()) {
    for (const j of piv.chain) piv.joints[j].rotation.set(0, 0, 0);
  }
  model.root.updateMatrixWorld(true);
  for (const limb of model.limbs.keys()) updateSoftTissue(model, limb);
}

/** Which structures are "active" in the current phase: flexors during swing, extensors in stance. */
export function activeRoles(limb: LimbKey, state: MotionState): { joints: MotionJoint[]; action: 'flexion' | 'extension' } {
  const fore = limb.startsWith('fl');
  const action = state.stance ? 'extension' : 'flexion';
  const joints: MotionJoint[] = fore ? ['shoulder', 'elbow', 'carpus', 'fetlock_fl'] : ['hip', 'stifle', 'hock', 'fetlock_hl'];
  return { joints, action };
}
