// Dump the rig landmarks and the bone list of a species as JSON (input for the Blender sculpting scripts).
// usage: node tools/dump-rig.mjs horse out.json
import { writeFileSync } from 'node:fs';
import { SPECIES } from '../shared/src/species.ts';
import { buildRig } from '../shared/src/rig.ts';
import { structuresForSpecies } from '../shared/src/anatomy/index.ts';

const [species = 'horse', out = `${species}-rig.json`] = process.argv.slice(2);
const def = SPECIES[species];
if (!def) throw new Error(`unknown species ${species}`);
const rig = buildRig(def.rig);
const samples = (f, n) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const headSections = samples((t) => ({ t, ...rig.head.section(t) }), 20);
const neck = samples((t) => ({ t, p: rig.neck.point(t), tan: rig.neck.tangent(t), sec: rig.neck.section(t) }), 20);
const trunk = samples((t) => rig.trunkSection(rig.trunkRange.xMin + (rig.trunkRange.xMax - rig.trunkRange.xMin) * t), 30);
const bones = structuresForSpecies(species)
  .filter((s) => s.group === 'bones' || s.group === 'cartilage')
  .map((s) => ({ id: s.id, kind: s.kind, group: s.group, bilateral: !!s.bilateral, regions: s.regions, la: s.names.la, covered: !!s.covered, geometry: s.geometry }));
writeFileSync(out, JSON.stringify({ species, H: rig.H, params: def.rig, landmarks: rig.landmarks, spine: rig.spine, head: { origin: rig.head.origin, dir: rig.head.dir, up: rig.head.up, length: rig.head.length, sections: headSections }, neck, trunk, trunkRange: rig.trunkRange, bones }, null, 1));
console.log(`${species}: ${Object.keys(rig.landmarks).length} landmarks, ${bones.length} bone/cartilage structures → ${out}`);
