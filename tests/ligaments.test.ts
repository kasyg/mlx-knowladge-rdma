import { describe, it, expect } from 'vitest';
import { SPECIES } from '@shared/species';
import { buildRig, pointRefNames } from '@shared/rig';
import { structuresForSpecies, recipesOf } from '@shared/anatomy/index';
import { buildConnections } from '@shared/anatomy/connections';
import type { SpeciesId } from '@shared/types';
import { posePathPoint, polyLength, chainOf } from '../client/src/three/pose';
import { JOINT_RANGE } from '../client/src/three/motion';
import { limbOfLandmark } from '../client/src/three/segments';

const SPECIES_IDS: SpeciesId[] = ['horse', 'cow', 'goat', 'dog', 'cat'];

/**
 * Ligaments run bone to bone, so moving a joint through its range must not
 * stretch one beyond what collagen survives (~10 %). A path anchored to the
 * wrong side of a joint (e.g. to the joint centre instead of the bone below it)
 * shows up here as a ligament that tears in an ordinary stride.
 */
function scan(maxStrain: number) {
  const out: string[] = [];
  for (const sp of SPECIES_IDS) {
    const rig = buildRig(SPECIES[sp].rig);
    const structures = structuresForSpecies(sp);
    const graph = buildConnections(structures, sp);
    for (const s of structures) {
      if (s.kind !== 'ligament' && s.kind !== 'tendon') continue;
      const muscles = (graph.links.get(s.id) ?? []).filter((c) => c.role === 'muscle').map((c) => graph.mech.get(c.id));
      // a tendon in series with a muscle slides with it: only bone-to-bone paths are checked
      const checked = muscles.some((m) => !!m?.stay && !!m.tendons?.some((t) => t.startsWith('lig_accessorium')));
      if (muscles.length && !checked) continue;
      recipesOf(s).forEach((r, i) => {
        if (r.type !== 'sweep') return;
        const names = r.path.flatMap((p) => pointRefNames(p)).map((n) => n.replace('{S}', 'L'));
        const limb = names.map(limbOfLandmark).find((l) => !!l);
        if (!limb) return;
        const len = (angles: Record<string, number>) => polyLength(r.path.map((p) => posePathPoint(rig, p, 'L', angles)));
        const rest = len({});
        for (const j of chainOf(limb)) {
          for (const a of JOINT_RANGE[j]) {
            const strain = len({ [j]: a }) / rest - 1;
            if (strain > maxStrain) out.push(`${sp} ${s.id}[${i}] ${j} ${a}°: +${(strain * 100).toFixed(1)} %`);
          }
        }
      });
    }
  }
  return out;
}

describe('ligaments through the range of motion', () => {
  it('no ligament is torn by moving a joint within its range', () => {
    expect(scan(0.1)).toEqual([]);
  });
});
