import { describe, it, expect } from 'vitest';
import { forceLength, passiveForce, forceVelocity, muscleForce, tendonStrain, stepMtu, initialState, classify, bellyThickness, HILL, type MtuParams } from '../client/src/three/biomech';
import { demoPlan, demoState, strideAngles, JOINT_RANGE, RECIPROCAL } from '../client/src/three/motion';
import { mechanicsFor, MECHANICS } from '@shared/anatomy/mechanics';
import { SPECIES } from '@shared/species';
import { buildRig } from '@shared/rig';
import type { PointRef } from '@shared/types';
import { posePathPoint, polyLength, type JointAngles } from '../client/src/three/pose';

describe('Hill-type muscle model', () => {
  it('has the classic force–length, passive and force–velocity shapes', () => {
    expect(forceLength(1)).toBeCloseTo(1, 6);
    expect(forceLength(0.6)).toBeLessThan(0.6);
    expect(forceLength(1.4)).toBeLessThan(0.6);
    expect(passiveForce(0.9)).toBe(0);
    expect(passiveForce(1.2)).toBeGreaterThan(0);
    expect(passiveForce(1.4)).toBeGreaterThan(passiveForce(1.2));
    expect(forceVelocity(0)).toBeCloseTo(1, 6);
    expect(forceVelocity(-1)).toBe(0); // no force at maximal shortening velocity
    expect(forceVelocity(-0.3)).toBeLessThan(0.5);
    expect(forceVelocity(0.3)).toBeGreaterThan(1.3); // eccentric force exceeds isometric
    expect(forceVelocity(10)).toBeLessThanOrEqual(HILL.fEcc);
  });

  it('develops force only when active or stretched', () => {
    expect(muscleForce(0, 1, 0)).toBe(0);
    expect(muscleForce(1, 1, 0)).toBeCloseTo(1, 6);
    expect(muscleForce(0, 1.4, 0)).toBeGreaterThan(0.1);
    expect(tendonStrain(0)).toBe(0);
    expect(tendonStrain(1)).toBeCloseTo(HILL.epsT0, 6);
  });

  it('classifies the contraction', () => {
    expect(classify(0.8, 1, -0.1)).toBe('concentric');
    expect(classify(0.8, 1, 0.1)).toBe('eccentric');
    expect(classify(0.8, 1, 0)).toBe('isometric');
    expect(classify(0.02, 1.2, 0)).toBe('stretched');
    expect(classify(0.02, 1, 0)).toBe('relaxed');
  });

  it('keeps the belly volume: shorter is thicker, longer is thinner', () => {
    expect(bellyThickness(0.8, 0)).toBeGreaterThan(1);
    expect(bellyThickness(1.2, 0)).toBeLessThan(1);
    expect(bellyThickness(1, 1)).toBeGreaterThan(bellyThickness(1, 0));
  });

  it('shortens actively when the unit shortens under excitation and stretches passively otherwise', () => {
    const p: MtuParams = { L0: 0.4, tendonFraction: 0.3, fibreRatio: 0.5 };
    let s = initialState(p);
    const dt = 1 / 60;
    // excite and let the unit shorten by 3 cm over half a second
    for (let i = 0; i <= 30; i++) s = stepMtu(p, s, 0.4 - (0.03 * i) / 30, 0.9, dt);
    expect(s.a).toBeGreaterThan(0.8);
    expect(s.l).toBeLessThan(1);
    expect(s.state).toBe('concentric');
    // relax and pull it 4 cm longer than rest
    for (let i = 0; i <= 60; i++) s = stepMtu(p, s, 0.37 + (0.07 * i) / 60, 0.02, dt);
    for (let i = 0; i < 30; i++) s = stepMtu(p, s, 0.44, 0.02, dt);
    expect(s.a).toBeLessThan(0.15);
    expect(s.l).toBeGreaterThan(1.05);
    expect(s.state).toBe('stretched');
    expect(s.F).toBeGreaterThan(0);
  });

  it('treats a purely tendinous unit as a passive strap', () => {
    const p: MtuParams = { L0: 0.5, tendonFraction: 1 };
    const s = stepMtu(p, initialState(p), 0.51, 1, 1 / 60);
    expect(s.a).toBe(0);
    expect(s.eps).toBeCloseTo(0.02, 6);
  });
});

describe('function demonstration', () => {
  it('moves a flexor from extension into flexion and back', () => {
    const plan = demoPlan([{ joint: 'elbow', action: 'flexion' }], 'fl_L');
    const start = demoState(plan, 0).angles.elbow!;
    const peak = demoState(plan, plan.period * 0.45).angles.elbow!;
    expect(peak).toBeGreaterThan(start);
    expect(peak).toBeLessThanOrEqual(JOINT_RANGE.elbow[1]);
    expect(demoState(plan, plan.period * 0.2).stage).toBe('contract');
    expect(demoState(plan, plan.period * 0.5).stage).toBe('hold');
    expect(demoState(plan, plan.period * 0.7).stage).toBe('return');
  });

  it('moves the stifle and the hock together in hoofed animals', () => {
    // m. gastrocnemius extends the hock; in the horse the stifle has to follow
    const plan = demoPlan([{ joint: 'hock', action: 'extension' }, { joint: 'stifle', action: 'flexion' }], 'hl_L', { reciprocal: true });
    const a0 = demoState(plan, 0).angles;
    const a1 = demoState(plan, plan.period * 0.45).angles;
    expect(a1.hock!).toBeLessThan(a0.hock!);
    expect(a1.stifle!).toBeLessThan(a0.stifle!);
    expect(a1.hock! / a1.stifle!).toBeCloseTo(RECIPROCAL, 6);
    for (const j of ['hock', 'stifle'] as const) {
      expect(a0[j]!).toBeLessThanOrEqual(JOINT_RANGE[j][1]);
      expect(a1[j]!).toBeGreaterThanOrEqual(JOINT_RANGE[j][0]);
    }
  });

  it('moves an extensor from flexion into extension', () => {
    const plan = demoPlan([{ joint: 'stifle', action: 'extension' }], 'hl_L');
    expect(demoState(plan, plan.period * 0.45).angles.stifle!).toBeLessThan(demoState(plan, 0).angles.stifle!);
  });
});

describe('walk', () => {
  it('keeps the hock and the stifle together (reciprocal apparatus)', () => {
    const rig = buildRig(SPECIES.horse.rig);
    const band = (id: string) => {
      const m = MECHANICS[id];
      return [m.origin[0].at, ...(m.via ?? []), m.insertion[m.insertion.length - 1].at];
    };
    const bands = ['m_flexor_digitorum_superficialis_hl', 'm_fibularis_tertius'].map(band);
    const len = (path: PointRef[], a: JointAngles) => polyLength(path.map((p) => posePathPoint(rig, p, 'L', a)));
    for (let i = 0; i < 40; i++) {
      const a = strideAngles('hl_L', i / 40).angles;
      // both joints flex in the swing and extend in the stance
      expect(Math.sign(a.hock)).toBe(Math.sign(a.stifle));
      // and the two tendinous bands that couple them neither tear nor go slack
      for (const path of bands) {
        const strain = len(path, { stifle: a.stifle, hock: a.hock }) / len(path, {}) - 1;
        expect(Math.abs(strain)).toBeLessThan(0.015);
      }
    }
  });

  it('stays inside the joint ranges', () => {
    for (const limb of ['fl_L', 'hl_L'] as const) {
      for (let i = 0; i < 40; i++) {
        const a = strideAngles(limb, i / 40).angles;
        for (const [j, v] of Object.entries(a)) {
          const [lo, hi] = JOINT_RANGE[j as keyof typeof JOINT_RANGE];
          expect(v).toBeGreaterThanOrEqual(lo);
          expect(v).toBeLessThanOrEqual(hi);
        }
      }
    }
  });
});

describe('species differences', () => {
  it('treats the equine interosseus as the tendinous suspensory ligament', () => {
    expect(mechanicsFor('mm_interossei', 'horse')!.tendonFraction).toBeGreaterThan(0.97);
    expect(mechanicsFor('mm_interossei', 'cow')!.tendonFraction).toBeGreaterThan(0.97);
    expect(mechanicsFor('mm_interossei', 'dog')!.tendonFraction).toBeLessThan(0.7);
  });
});
