"""
Rig access and local frames for the sculpted bones.

The rig JSON comes from `node tools/dump-rig.mjs <species> <file>` and holds the
landmarks of the procedural animal (world metres; cranial = -x, dorsal = +y,
left = +z). Every bone is sculpted in a local frame that follows the world convention:
  -x = cranial (+x caudal), y = proximal (along the bone), z = lateral of the
  bone's own side (world +z for the left side, -z for the right).
The right-side frame is a mirror image of the left one, so one definition
gives both bones with the correct chirality.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from sdf import norm, v3


class Rig:
    def __init__(self, path: str):
        with open(path) as f:
            self.data = json.load(f)
        self.H: float = self.data["H"]
        self.landmarks: dict[str, list[float]] = self.data["landmarks"]
        self.spine = self.data["spine"]
        self.head = self.data["head"]
        self.params = self.data["params"]
        self.bones = self.data["bones"]

    def L(self, name: str, side: str | None = None) -> np.ndarray:
        if side:
            name = name.replace("{S}", side)
        if name not in self.landmarks:
            raise KeyError(f"unknown landmark {name}")
        return v3(self.landmarks[name])

    def between(self, a: str, b: str, t: float, side: str | None = None) -> np.ndarray:
        return self.L(a, side) * (1 - t) + self.L(b, side) * t


@dataclass
class Frame:
    origin: np.ndarray
    R: np.ndarray  # columns: local x, y, z in world coordinates

    def to_world(self, p) -> np.ndarray:
        return self.R @ v3(p) + self.origin

    def to_local(self, p) -> np.ndarray:
        return self.R.T @ (v3(p) - self.origin)

    @property
    def mirrored(self) -> bool:
        return bool(np.linalg.det(self.R) < 0)


def lateral_sign(side: str) -> float:
    return 1.0 if side == "L" else -1.0


def limb_frame(prox: np.ndarray, dist: np.ndarray, side: str, caudal=(1.0, 0.0, 0.0)) -> Frame:
    """Frame with y from the distal to the proximal point, +x caudal, z lateral; origin at the distal point."""
    y = norm(prox - dist)
    x = v3(caudal) - np.dot(v3(caudal), y) * y
    x = norm(x)
    z = np.cross(x, y)
    lat = v3([0.0, 0.0, lateral_sign(side)])
    if np.dot(z, lat) < 0:
        z = -z
    return Frame(dist.copy(), np.column_stack([x, y, z]))


def axial_frame(center: np.ndarray, tangent_caudal: np.ndarray, up=(0.0, 1.0, 0.0)) -> Frame:
    """Frame for a vertebra / skull part: +x caudal along the spine, y dorsal, z left (right-handed)."""
    x = norm(tangent_caudal)
    yv = v3(up) - np.dot(v3(up), x) * x
    y = norm(yv)
    z = np.cross(x, y)
    return Frame(center.copy(), np.column_stack([x, y, z]))


def mirror_frame(fr: Frame) -> Frame:
    """The same frame for the other side of the body (z → -z in world)."""
    M = np.diag([1.0, 1.0, -1.0])
    return Frame(M @ fr.origin, M @ fr.R)


def side_frame(origin: np.ndarray, side: str) -> Frame:
    """World-aligned frame (x caudal, y up) with z pointing to the given side of the body."""
    return Frame(origin.copy(), np.diag([1.0, 1.0, lateral_sign(side)]))
