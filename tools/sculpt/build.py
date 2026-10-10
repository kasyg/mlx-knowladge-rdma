"""
Build the sculpted skeleton of a species with Blender (bpy) and export it as a
Draco-compressed GLB plus the manifest used by the atlas model-import pipeline.

usage (inside a venv with bpy, numpy and scikit-image):
  python tools/sculpt/build.py --rig horse-rig.json --out client/public/models/horse [--only femur,tibia] [--preview out.glb]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from frames import Rig  # noqa: E402
from sdf import mesh_area, mesh_shape, transform_mesh  # noqa: E402

TRI_DENSITY = 220_000  # triangles per m² of surface before the per-bone cap
TRI_MIN = 500


def build_meshes(rig: Rig, only: set[str] | None):
    """Yield (object name, structure key, verts, faces) for every sculpted bone."""
    import bones_forelimb
    import bones_hindlimb
    import bones_axial
    import bones_skull

    for module in (bones_forelimb, bones_hindlimb, bones_axial, bones_skull):
        for item in module.bones(rig):
            name, key, shape, frame, voxel, cap = item[:6]
            group = item[6] if len(item) > 6 else "bones"
            if only and not any(name.startswith(o) for o in only):
                continue
            t0 = time.time()
            verts, faces = mesh_shape(shape, voxel)
            verts, faces = transform_mesh(verts, faces, frame.R, frame.origin)
            area = mesh_area(verts, faces)
            target = int(min(cap, max(TRI_MIN, area * TRI_DENSITY)))
            yield name, key, group, verts, faces, target, time.time() - t0


def to_blender(name: str, verts: np.ndarray, faces: np.ndarray, target_tris: int, smooth_iter: int, collection=None):
    import bpy

    # atlas (x, y up, z left) → Blender (x, -z, y): the glTF exporter turns Blender's z-up back into y-up
    bl_verts = np.column_stack([verts[:, 0], -verts[:, 2], verts[:, 1]])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(bl_verts.tolist(), [], faces.tolist())
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if smooth_iter > 0:
        m = obj.modifiers.new("smooth", "SMOOTH")
        m.factor = 0.5
        m.iterations = smooth_iter
        bpy.ops.object.modifier_apply(modifier=m.name)
    tris = len(mesh.polygons)
    if tris > target_tris:
        d = obj.modifiers.new("decimate", "DECIMATE")
        d.decimate_type = "COLLAPSE"
        d.ratio = max(0.01, target_tris / tris)
        d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return len(mesh.polygons)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rig", required=True)
    ap.add_argument("--out", required=True, help="species model folder (client/public/models/<species>)")
    ap.add_argument("--only", default="", help="comma separated object-name prefixes")
    ap.add_argument("--file", default="skeleton.glb")
    ap.add_argument("--no-draco", action="store_true")
    ap.add_argument("--smooth", type=int, default=2)
    args = ap.parse_args()

    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig = Rig(args.rig)
    only = {o for o in args.only.split(",") if o} or None
    mappings: dict[str, dict[str, str]] = {}
    collections: dict[str, object] = {}
    totals: dict[str, int] = {}
    t_all = time.time()
    for name, key, group, verts, faces, target, dt in build_meshes(rig, only):
        if group not in collections:
            col = bpy.data.collections.new(group)
            bpy.context.scene.collection.children.link(col)
            collections[group] = col
        n = to_blender(name, verts, faces, target, args.smooth, collections[group])
        mappings.setdefault(group, {})[name] = key
        totals[group] = totals.get(group, 0) + n
        print(f"  {name:36s} → {key:32s} {len(faces):7d} → {n:6d} tris  ({dt:.2f}s)")
    if not mappings:
        print("nothing built")
        return
    os.makedirs(args.out, exist_ok=True)
    manifest_path = os.path.join(args.out, "manifest.json")
    manifest = {"version": 1, "models": []}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
    species = rig.data["species"]
    for group, mapping in mappings.items():
        file = args.file if group == "bones" else f"{group}.glb"
        path = os.path.join(args.out, file)
        # export only this group's collection
        for g, col in collections.items():
            for obj in col.objects:
                obj.select_set(g == group)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_normals=True,
            export_materials="NONE",
            export_draco_mesh_compression_enable=not args.no_draco,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            use_selection=True,
        )
        entry = {
            "id": "skeleton" if group == "bones" else f"skeleton-{group}",
            "file": file,
            "group": group,
            "up": "+y",
            "forward": "-x",
            "fit": "none",
            "fitRig": False,
            "autoMap": False,
            "replace": True,
            "textures": False,
            "map": mapping,
            "attribution": {
                "title": f"{species.capitalize()} skeleton sculpted for VetAtlas 3D (Blender, signed-distance modelling)",
                "author": "VetAtlas 3D",
                "license": "CC0",
            },
        }
        manifest["models"] = [m for m in manifest["models"] if m.get("id") != entry["id"]] + [entry]
        size = os.path.getsize(path)
        print(f"{group}: {len(mapping)} objects, {totals[group]} triangles, {size / 1024:.0f} kB → {path}")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"done in {time.time() - t_all:.1f}s")


if __name__ == "__main__":
    main()
