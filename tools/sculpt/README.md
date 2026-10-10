# Sculpted skeletons (Blender + signed-distance modelling)

`tools/sculpt` builds the detailed bone meshes shipped in `client/public/models/<species>/`.
Every bone is described as a small program of anatomical primitives (capsules, lofted
tubes with elliptic sections, flat plates, tori, ellipsoids) joined with smooth unions and
carved with smooth subtractions (fossae, grooves, foramina, articular surfaces). The
signed-distance field is sampled on a fine grid (1–3 mm voxels), meshed with marching
cubes, smoothed and decimated in Blender and exported as a Draco-compressed GLB together
with the manifest the atlas uses to swap the procedural geometry for the sculpted one.

The bones are placed on the landmarks of the species rig, so joints, tendons, muscles and
vessels of the procedural animal stay attached to them. Left and right bones come from one
definition in a mirrored frame (`-x` cranial, `+y` proximal, `+z` lateral of the bone's side).

## Files

| file | content |
| --- | --- |
| `sdf.py` | primitives, smooth operators, block-wise grid sampling, marching cubes |
| `frames.py` | rig JSON access and the local frames of the bones |
| `bones_forelimb.py` | scapula, humerus, radius, ulna, 7 carpal bones, cannon and splint bones, sesamoids, phalanges, navicular |
| `bones_hindlimb.py` | os coxae, femur, patella, tibia, fibula, 6 tarsal bones, cannon and splint bones, sesamoids, phalanges |
| `bones_axial.py` | atlas, axis, C3–C7, T1–T18, L1–L6, sacrum, Cd1–Cd18, intervertebral discs, 18 rib pairs, costal cartilages, sternum, xiphoid cartilage |
| `bones_skull.py` | cranium (neuro- and viscerocranium), mandible, hyoid apparatus, incisors, canines, premolars, molars |
| `build.py` | runs everything in Blender and writes `skeleton.glb`, `cartilage.glb` and `manifest.json` |

## Running

```
# Blender as a Python module needs Python 3.11
uv python install 3.11
uv venv --python 3.11 .venv-sculpt
VIRTUAL_ENV=$PWD/.venv-sculpt uv pip install bpy numpy scikit-image

node tools/dump-rig.mjs horse /tmp/horse-rig.json
.venv-sculpt/bin/python tools/sculpt/build.py --rig /tmp/horse-rig.json --out client/public/models/horse
```

`--only femur,tibia` rebuilds a subset (object-name prefixes), `--no-draco` writes an
uncompressed file, `--smooth N` changes the Laplacian smoothing passes. The build prints the
triangle count of every bone; the per-bone budgets live next to the bone definitions.

## Checking a bone

Each definition returns `(shape, frame, voxel size, triangle budget)`. Build the bone alone
and look at it from several sides before placing it in the atlas; a cut that is larger than
the surrounding solid splits the mesh, a feature that does not overlap the body floats.
