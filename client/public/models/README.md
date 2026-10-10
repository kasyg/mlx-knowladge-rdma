# Imported 3D models

Drop scanned or modelled meshes (glTF `.gltf` + `.bin` + textures, or a single `.glb`)
into `models/<species>/<name>/` and describe them in `models/<species>/manifest.json`.
The atlas loads the manifest when the species opens, aligns every model to the
procedural animal, maps its meshes to the atlas structures and uses them instead of
the procedural geometry. Labels, regions, peeling, highlighting, search, notes and
the limb animation keep working on the imported meshes.

```
client/public/models/
  horse/
    manifest.json
    horse-skeleton/
      scene.gltf
      scene.bin
      textures/…
```

## manifest.json

```json
{
  "version": 1,
  "models": [
    {
      "id": "skeleton",
      "file": "horse-skeleton/scene.gltf",
      "group": "bones",
      "up": "+y",
      "forward": "-x",
      "fit": "height",
      "autoMap": true,
      "replace": true,
      "map": { "Object_12": "cranium", "Object_13": "mandibula" },
      "attribution": {
        "title": "Horse Skeleton",
        "author": "Jane Doe",
        "license": "CC Attribution",
        "url": "https://sketchfab.com/3d-models/…"
      }
    }
  ]
}
```

| field | meaning |
| --- | --- |
| `id` | short name of the entry; also the credit shown in the detail panel |
| `file` | path relative to the species folder |
| `group` | atlas layer: `bones`, `cartilage`, `muscles`, `tendons`, `skin` (default `bones`) |
| `up`, `forward` | axes of the file: up axis (glTF: `+y`) and the direction the animal faces; the atlas uses up `+y`, forward `-x`, left `+z` |
| `fit` | `height` (default), `length` or `none`: scales and centres the model on the procedural structures of the same layer |
| `scale`, `offset`, `rotation` | manual corrections after the fit (factor, metres, degrees X/Y/Z) |
| `autoMap` | assign every mesh to the nearest procedural structure of the layer (default `true`) |
| `map` | manual node → structure overrides: node name or `#<mesh index>` → structure id (`scapula_L`, `humerus_R`, `cranium`, …) |
| `replace` | hide the procedural geometry of mapped structures (default `true`) |
| `textures` | keep the file's textures (default `true`) |
| `fitRig` | bones layer only (default `true`): move the rig's joints, spine and skull to the imported bones and rebuild skin, muscles, tendons and vessels around them |
| `attribution` | shown in Help → "3D models used" and in the detail panel; required by CC licences |

Meshes that match nothing (or one mesh for the whole model) stay visible as one
"imported" structure of the layer. Open the browser console to see the mapping
summary (`[vetatlas] external model …`) and add `map` entries for anything that landed
on the wrong bone. The structure ids are those of `shared/src/anatomy/*.ts`
(bilateral ones get a `_L` / `_R` suffix).

## Downloading from Sketchfab

```
SKETCHFAB_TOKEN=… node scripts/fetch-sketchfab.mjs https://sketchfab.com/3d-models/<slug>-<uid> horse
```

Only models whose authors enabled downloads (Creative Commons licences) can be
fetched; the script records author and licence in the manifest. Commercial models
(TurboSquid, CGTrader, 3dmodels.org, …) must not be copied into the atlas.

## Procedural export

`window.__vetatlas.exportGroup('bones')` in the browser console returns the procedural
skeleton of the opened species as a base64 GLB, handy for 3D printing or as a template
to edit in Blender and re-import through this folder.
