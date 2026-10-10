import { describe, it, expect } from 'vitest';
import { SPECIES_IDS, type SpeciesId } from '@shared/types';
import { validateSpecies, structuresForSpecies, getSpeciesPayload, recipesOf } from '@shared/anatomy/index';
import { buildRig } from '@shared/rig';
import { SPECIES } from '@shared/species';

describe('anatomy dataset', () => {
  for (const id of SPECIES_IDS) {
    it(`${id}: every recipe references existing landmarks and ids are unique`, () => {
      expect(validateSpecies(id)).toEqual([]);
    });
    it(`${id}: all structures have Latin, Czech and English names and descriptions`, () => {
      for (const s of structuresForSpecies(id)) {
        expect(s.names.la.length, s.id).toBeGreaterThan(1);
        expect(s.names.cs.length, s.id).toBeGreaterThan(1);
        expect(s.names.en.length, s.id).toBeGreaterThan(1);
        expect(s.description.cs.length, s.id).toBeGreaterThan(10);
        expect(s.description.en.length, s.id).toBeGreaterThan(10);
        expect(s.regions.length, s.id).toBeGreaterThan(0);
        expect(recipesOf(s).length, s.id).toBeGreaterThan(0);
      }
    });
    it(`${id}: rig produces limb landmarks on both sides and a standing pose`, () => {
      const rig = buildRig(SPECIES[id as SpeciesId].rig);
      for (const side of ['L', 'R']) {
        expect(rig.landmarks[`fl_${side}_hoof`][1]).toBeCloseTo(0, 2);
        expect(rig.landmarks[`hl_${side}_hoof`][1]).toBeCloseTo(0, 2);
        expect(rig.landmarks[`fl_${side}_shoulder`][1]).toBeGreaterThan(rig.landmarks[`fl_${side}_elbow`][1]);
        expect(rig.landmarks[`hl_${side}_hip`][1]).toBeGreaterThan(rig.landmarks[`hl_${side}_stifle`][1]);
      }
      expect(rig.landmarks.withers[1]).toBeCloseTo(rig.H, 1);
      expect(rig.landmarks.fl_L_shoulder[2]).toBeGreaterThan(0);
      expect(rig.landmarks.fl_R_shoulder[2]).toBeLessThan(0);
    });
  }
  it('species payload contains muscles with origin/insertion/function', () => {
    const p = getSpeciesPayload('horse');
    const m = p.structures.filter((s) => s.kind === 'muscle');
    expect(m.length).toBeGreaterThan(50);
    for (const s of m) {
      expect(s.origin, s.id).toBeDefined();
      expect(s.insertion, s.id).toBeDefined();
      expect(s.function, s.id).toBeDefined();
    }
  });
  it('species-specific structures are filtered correctly', () => {
    const horse = structuresForSpecies('horse').map((s) => s.id);
    const cow = structuresForSpecies('cow').map((s) => s.id);
    const cat = structuresForSpecies('cat').map((s) => s.id);
    expect(horse).not.toContain('vesica_fellea');
    expect(cow).toContain('vesica_fellea');
    expect(cow).toContain('rumen');
    expect(horse).not.toContain('rumen');
    expect(horse).toContain('ventriculus');
    expect(cat).not.toContain('lig_nuchae');
    expect(horse).toContain('lig_nuchae');
    expect(horse).toContain('diverticulum_tubae_auditivae');
    expect(cow).not.toContain('diverticulum_tubae_auditivae');
  });
});
