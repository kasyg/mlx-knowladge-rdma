import type { AnimalModel } from './animal.ts';
import { updateSoftTissue } from './animal.ts';
import type { JointName, LimbKey } from './segments.ts';
import type { MotionJoint, MotionRole } from '@shared/types';
import { FLEX_SIGN } from './pose.ts';
import { jointName } from './muscles.ts';
import { smooth, clamp } from './biomech.ts';

export interface MotionState {
  phase: number; // 0..1 of the stride cycle
  stance: boolean;
  angles: Record<JointName, number>; // degrees of flexion (+) / extension (-)
}

const deg = Math.PI / 180;

/** hock flexion per degree of stifle flexion that keeps both bands of the reciprocal apparatus isometric */
export const RECIPROCAL = 0.62;

/** Simple walk-like stride: stance = first half of the cycle, swing = second half. */
export function strideAngles(limb: LimbKey, phase: number): MotionState {
  const w = phase * Math.PI * 2;
  const swing = Math.max(0, Math.sin(w));       // >0 during the swing phase
  const stanceK = Math.max(0, -Math.sin(w));    // >0 during the stance phase
  const stance = stanceK > 0.01 && swing < 0.01;
  const fore = limb.startsWith('fl');
  const angles = { shoulder: 0, elbow: 0, carpus: 0, fetlock: 0, pastern: 0, hip: 0, stifle: 0, hock: 0 } as Record<JointName, number>;
  if (fore) {
    angles.shoulder = 10 * Math.cos(w);             // flexed (retracted) at lift-off, extends to protract the limb in the swing
    angles.elbow = 32 * Math.pow(swing, 1.2) - 4 * stanceK; // flexes in swing, extends under load
    angles.carpus = 60 * Math.pow(Math.max(0, Math.sin(w + 0.5)), 1.4) * (swing > 0 ? 1 : 0) - 2 * stanceK;
    angles.fetlock = 22 * swing - 24 * stanceK;     // flexes in swing, hyper-extends under load
    angles.pastern = 8 * swing - 6 * stanceK;
  } else {
    angles.hip = -14 * Math.cos(w);
    angles.stifle = 36 * Math.pow(swing, 1.1) - 5 * stanceK; // flexes in swing, extends at push-off
    // reciprocal apparatus: the fibularis tertius (cranially) and the superficial digital flexor (caudally)
    // tie the hock to the stifle, so the two joints always flex and extend together; with the moment
    // arms of the two bands the hock turns by RECIPROCAL × the stifle angle and both stay isometric
    angles.hock = RECIPROCAL * angles.stifle;
    angles.fetlock = 20 * swing - 24 * stanceK;
    angles.pastern = 8 * swing - 6 * stanceK;
  }
  return { phase, stance, angles };
}

/** set the joint rotations of a limb (no soft-tissue update) */
export function applyPose(model: AnimalModel, limb: LimbKey, angles: Partial<Record<JointName, number>> | null) {
  const piv = model.limbs.get(limb);
  if (!piv) return;
  // rotation about world z is identical for both sides
  for (const j of piv.chain) piv.joints[j].rotation.z = (angles?.[j] ?? 0) * deg * FLEX_SIGN[j];
  model.root.updateMatrixWorld(true);
}

export function applyMotion(model: AnimalModel, limb: LimbKey, state: MotionState | null) {
  applyPose(model, limb, state ? state.angles : null);
  updateSoftTissue(model, limb);
}

/** comfortable range of every joint: [most extended, most flexed] in degrees of flexion */
export const JOINT_RANGE: Record<JointName, [number, number]> = {
  shoulder: [-22, 30],
  elbow: [-4, 75],
  carpus: [-3, 95],
  fetlock: [-30, 65],
  pastern: [-8, 25],
  hip: [-22, 38],
  stifle: [-6, 65],
  hock: [-6, 60],
};

export interface DemoPlan {
  limb: LimbKey | null;
  moves: { j: JointName; from: number; to: number }[];
  period: number;
}

export type DemoStage = 'contract' | 'hold' | 'return' | 'rest';

/**
 * What a muscle does when it contracts: its joints move from the opposite
 * position into its action. With `reciprocal` (horse, cattle, goat) the stifle
 * and the hock cannot move on their own: the first of the two the muscle acts
 * on drives, the other follows through the reciprocal apparatus.
 */
export function demoPlan(roles: MotionRole[], limb: LimbKey | null, opts: { reciprocal?: boolean } = {}): DemoPlan {
  const moves: DemoPlan['moves'] = [];
  for (const r of roles) {
    const j = jointName(r.joint);
    if (moves.some((m) => m.j === j)) continue;
    const [ext, flex] = JOINT_RANGE[j];
    if (r.action === 'flexion') moves.push({ j, from: ext * 0.3, to: flex * 0.8 });
    else moves.push({ j, from: flex * 0.65, to: ext * 0.7 });
  }
  if (opts.reciprocal && limb?.startsWith('hl')) {
    const driver = moves.find((m) => m.j === 'stifle' || m.j === 'hock');
    if (driver) {
      const other: JointName = driver.j === 'stifle' ? 'hock' : 'stifle';
      const ratio = driver.j === 'stifle' ? RECIPROCAL : 1 / RECIPROCAL;
      const [lo, hi] = JOINT_RANGE[other];
      // keep the follower inside its range, and the pair on the coupling line
      const fit = (v: number) => clamp(v * ratio, lo, hi) / ratio;
      driver.from = fit(driver.from);
      driver.to = fit(driver.to);
      const follow = { j: other, from: driver.from * ratio, to: driver.to * ratio };
      const k = moves.findIndex((m) => m.j === other);
      if (k >= 0) moves[k] = follow;
      else moves.push(follow);
    }
  }
  return { limb, moves, period: 3.4 };
}

/**
 * One demonstration cycle: concentric contraction (the joints move into the
 * muscle's action), an isometric hold, an eccentric return (the muscle stays
 * active while it lets the joints go back) and a short rest.
 */
export function demoState(plan: DemoPlan, t: number): { angles: Partial<Record<JointName, number>>; stage: DemoStage; phase: number; drive: number; k: number } {
  const ph = ((t / plan.period) % 1 + 1) % 1;
  let k: number, stage: DemoStage, drive: number;
  if (ph < 0.4) {
    k = smooth(ph / 0.4);
    stage = 'contract';
    drive = 0.9;
  } else if (ph < 0.55) {
    k = 1;
    stage = 'hold';
    drive = 0.62;
  } else if (ph < 0.9) {
    k = 1 - smooth((ph - 0.55) / 0.35);
    stage = 'return';
    drive = 0.24;
  } else {
    k = 0;
    stage = 'rest';
    drive = 0.04;
  }
  const angles: Partial<Record<JointName, number>> = {};
  for (const m of plan.moves) angles[m.j] = m.from + (m.to - m.from) * k;
  return { angles, stage, phase: ph, drive, k };
}

/** stance / swing weights of the stride phase */
export function strideWeights(phase: number): { stanceK: number; swingK: number } {
  const w = phase * Math.PI * 2;
  return { swingK: Math.max(0, Math.sin(w)), stanceK: Math.max(0, -Math.sin(w)) };
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
