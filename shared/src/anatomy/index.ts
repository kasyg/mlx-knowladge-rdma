import type { RegionDef, SpeciesId, SpeciesPayload, StructureDef, Side, GeometryRecipe } from '../types.ts';
import { SPECIES } from '../species.ts';
import { buildRig, pointRefNames } from '../rig.ts';
import { skeleton } from './skeleton.ts';
import { muscles } from './muscles.ts';
import { tendons } from './tendons.ts';
import { vascular, respiratory, digestive, nervous, urinary } from './systems.ts';
import { skin } from './skin.ts';
import { regions } from './regions.ts';

export const CATALOG: StructureDef[] = [...skin, ...skeleton, ...muscles, ...tendons, ...vascular, ...respiratory, ...digestive, ...nervous, ...urinary];

export function structuresForSpecies(id: SpeciesId): StructureDef[] {
  const def = SPECIES[id];
  const out: StructureDef[] = [];
  for (const s of CATALOG) {
    if (s.species && !s.species.includes(id)) continue;
    if (s.excludeSpecies && s.excludeSpecies.includes(id)) continue;
    const override = def.structureOverrides?.[s.id];
    out.push(override ? { ...s, ...override } : s);
  }
  return out;
}

export function regionsForSpecies(_id: SpeciesId): RegionDef[] {
  return regions;
}

export function getSpeciesPayload(id: SpeciesId): SpeciesPayload {
  const def = SPECIES[id];
  return { meta: def.meta, rig: def.rig, regions: regionsForSpecies(id), structures: structuresForSpecies(id) };
}

export function recipesOf(s: StructureDef): GeometryRecipe[] {
  return Array.isArray(s.geometry) ? s.geometry : [s.geometry];
}

/** Validate that every landmark referenced by the catalog exists for the species rig. */
export function validateSpecies(id: SpeciesId): string[] {
  const rig = buildRig(SPECIES[id].rig);
  const errors: string[] = [];
  const check = (name: string, where: string) => {
    for (const side of ['L', 'R'] as Side[]) {
      const n = name.replace('{S}', side);
      if (!rig.landmarks[n]) errors.push(`${id}: ${where} references unknown landmark "${n}"`);
      if (!name.includes('{S}')) break;
    }
  };
  for (const s of structuresForSpecies(id)) {
    for (const r of recipesOf(s)) {
      if (r.type === 'sweep') r.path.forEach((p) => pointRefNames(p).forEach((n) => check(n, s.id)));
      else if (r.type === 'ellipsoid') pointRefNames(r.at).forEach((n) => check(n, s.id));
      else if (r.type === 'loft') r.axis.forEach((p) => pointRefNames(p).forEach((n) => check(n, s.id)));
    }
  }
  for (const reg of regions) pointRefNames(reg.anchor).forEach((n) => check(n, `region ${reg.id}`));
  const ids = new Set<string>();
  for (const s of structuresForSpecies(id)) {
    if (ids.has(s.id)) errors.push(`${id}: duplicate structure id ${s.id}`);
    ids.add(s.id);
  }
  return errors;
}
