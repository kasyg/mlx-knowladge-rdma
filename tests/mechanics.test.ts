import { describe, it, expect } from 'vitest';
import { SPECIES } from '@shared/species';
import { buildRig, resolvePoint, pointRefNames } from '@shared/rig';
import { structuresForSpecies, CATALOG } from '@shared/anatomy/index';
import { MECHANICS, TENDON_BONES, JOINTS } from '@shared/anatomy/mechanics';
import { buildConnections } from '@shared/anatomy/connections';
import type { PointRef, SpeciesId, MotionRole } from '@shared/types';
import { posePoint, segmentOfRef, polyLength, type JointAngles } from '../client/src/three/pose';
import type { JointName } from '../client/src/three/segments';

const SPECIES_IDS: SpeciesId[] = ['horse', 'cow', 'goat', 'dog', 'cat'];
const catalogIds = new Set(CATALOG.map((s) => s.id));

const refsOf = (id: string): PointRef[] => {
  const m = MECHANICS[id];
  return [...m.origin.map((s) => s.at), ...(m.via ?? []), ...m.insertion.map((s) => s.at)];
};

/** main line of action: first origin → via points → last insertion */
export function mtuPath(id: string): PointRef[] {
  const m = MECHANICS[id];
  return [m.origin[0].at, ...(m.via ?? []), m.insertion[m.insertion.length - 1].at];
}

const jointOf = (j: MotionRole['joint']): JointName => (j === 'fetlock_fl' || j === 'fetlock_hl' ? 'fetlock' : j);

describe('muscle mechanics data', () => {
  it('covers every muscle of the catalogue', () => {
    const missing = CATALOG.filter((s) => s.kind === 'muscle' && !MECHANICS[s.id]).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('references existing structures (bones, tendons, nerves, arteries)', () => {
    const bad: string[] = [];
    for (const [id, m] of Object.entries(MECHANICS)) {
      if (!catalogIds.has(id)) bad.push(`${id}: not in the catalogue`);
      for (const s of [...m.origin, ...m.insertion]) for (const b of s.bone) if (!catalogIds.has(b)) bad.push(`${id}: bone ${b}`);
      for (const t of m.tendons ?? []) if (!catalogIds.has(t)) bad.push(`${id}: tendon ${t}`);
      for (const n of m.nerve ?? []) if (!catalogIds.has(n)) bad.push(`${id}: nerve ${n}`);
      for (const a of m.artery ?? []) if (!catalogIds.has(a)) bad.push(`${id}: artery ${a}`);
    }
    for (const [t, bones] of Object.entries(TENDON_BONES)) {
      if (!catalogIds.has(t)) bad.push(`tendon map: ${t}`);
      for (const b of bones) if (!catalogIds.has(b)) bad.push(`tendon map ${t}: bone ${b}`);
    }
    for (const j of JOINTS) for (const b of j.bones) if (!catalogIds.has(b)) bad.push(`joint ${j.id}: ${b}`);
    expect(bad).toEqual([]);
  });

  it('every attachment resolves to a bone of the horse when bones are given', () => {
    const present = new Set(structuresForSpecies('horse').map((s) => s.id));
    const bad: string[] = [];
    for (const s of structuresForSpecies('horse')) {
      const m = MECHANICS[s.id];
      if (!m) continue;
      for (const site of [...m.origin, ...m.insertion]) if (site.bone.length && !site.bone.some((b) => present.has(b))) bad.push(`${s.id}: ${site.bone.join('|')}`);
    }
    expect(bad).toEqual([]);
  });

  it('uses landmarks that exist in every species rig', () => {
    const bad: string[] = [];
    for (const sp of SPECIES_IDS) {
      const rig = buildRig(SPECIES[sp].rig);
      for (const s of structuresForSpecies(sp)) {
        if (!MECHANICS[s.id]) continue;
        for (const ref of refsOf(s.id)) {
          for (const n of pointRefNames(ref)) {
            for (const side of ['L', 'R']) if (!rig.landmarks[n.replace('{S}', side)]) bad.push(`${sp} ${s.id}: ${n}`);
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe('lines of action', () => {
  for (const sp of ['horse', 'dog'] as SpeciesId[]) {
    it(`flexors shorten and extensors lengthen when their joint flexes (${sp})`, () => {
      const rig = buildRig(SPECIES[sp].rig);
      const wrong: string[] = [];
      const arms: string[] = [];
      for (const s of structuresForSpecies(sp)) {
        if (!s.motion?.length || !MECHANICS[s.id]) continue;
        const path = mtuPath(s.id);
        const length = (angles: JointAngles) => polyLength(path.map((ref) => posePoint(rig, resolvePoint(ref, rig, 'L'), segmentOfRef(ref, 'L'), angles)));
        const L0 = length({});
        for (const role of s.motion) {
          const j = jointOf(role.joint);
          const d = 6;
          const dL = length({ [j]: d }) - length({ [j]: -d });
          // moment arm (m) = -dL/dθ for flexion
          const arm = -dL / ((2 * d * Math.PI) / 180);
          arms.push(`${s.id} ${role.joint}:${role.action[0]} r=${(arm * 100).toFixed(1)} cm (L0 ${(L0 * 100).toFixed(0)} cm)`);
          const ok = role.action === 'flexion' ? arm > 0.002 : arm < -0.002;
          if (!ok) wrong.push(`${s.id} ${role.joint} ${role.action}: moment arm ${(arm * 100).toFixed(2)} cm`);
        }
      }
      if (process.env.ARMS) console.log(arms.join('\n'));
      expect(wrong).toEqual([]);
    });
  }
});

describe('connection graph', () => {
  it('links muscles to bones, tendons, nerves and to each other', () => {
    const g = buildConnections(structuresForSpecies('horse'));
    const roles = (id: string, role: string) => (g.links.get(id) ?? []).filter((c) => c.role === role).map((c) => c.id);
    expect(roles('m_biceps_brachii', 'origin')).toContain('scapula');
    expect(roles('m_biceps_brachii', 'insertion')).toContain('radius');
    expect(roles('m_biceps_brachii', 'tendon')).toContain('lacertus_fibrosus');
    expect(roles('m_biceps_brachii', 'nerve')).toContain('n_musculocutaneus');
    expect(roles('m_biceps_brachii', 'antagonist')).toContain('m_triceps_brachii');
    expect(roles('m_biceps_brachii', 'synergist')).toContain('m_brachialis');
    expect(roles('m_flexor_digitorum_superficialis_fl', 'tendon')).toContain('tendo_fds_fl');
    expect(roles('tendo_fds_fl', 'muscle')).toContain('m_flexor_digitorum_superficialis_fl');
    expect(roles('humerus', 'insertsHere')).toContain('m_deltoideus');
    expect(roles('humerus', 'articulates')).toEqual(expect.arrayContaining(['scapula', 'radius', 'ulna']));
    expect(roles('n_radialis', 'innervates')).toContain('m_triceps_brachii');
  });
});
