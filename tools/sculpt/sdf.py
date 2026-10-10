"""
Signed-distance sculpting toolkit (numpy).

A Shape is a list of primitives joined with smooth unions and carved with smooth
subtractions. The field is sampled on a regular grid (each primitive only inside
its own bounding block), meshed with marching cubes and handed to Blender for
smoothing, decimation and glTF export. All lengths are metres.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

FAR = 1.0  # field value far away from every primitive (m)
Vec = Sequence[float]


# --------------------------------------------------------------------------- linear algebra
def v3(x, y=None, z=None) -> np.ndarray:
    if y is None:
        return np.asarray(x, dtype=np.float64)
    return np.array([x, y, z], dtype=np.float64)


def norm(v) -> np.ndarray:
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def rot_axis(axis, deg: float) -> np.ndarray:
    """Rodrigues rotation matrix (columns = rotated basis)."""
    a = norm(axis)
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    x, y, z = a
    return np.array(
        [
            [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
            [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
            [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)],
        ]
    )


def rot_xyz(rx=0.0, ry=0.0, rz=0.0) -> np.ndarray:
    """Euler rotation (degrees), applied x then y then z."""
    return rot_axis([0, 0, 1], rz) @ rot_axis([0, 1, 0], ry) @ rot_axis([1, 0, 0], rx)


def rot_y_to(direction, roll_ref=(1.0, 0.0, 0.0)) -> np.ndarray:
    """Rotation whose local +y axis points along `direction`; local x stays as close as possible to roll_ref."""
    y = norm(direction)
    x = np.asarray(roll_ref, dtype=np.float64)
    x = x - np.dot(x, y) * y
    if np.linalg.norm(x) < 1e-6:
        x = np.cross(y, [0, 0, 1.0])
    x = norm(x)
    z = np.cross(x, y)
    return np.column_stack([x, y, z])


def lerp(a, b, t):
    return np.asarray(a, dtype=np.float64) * (1 - t) + np.asarray(b, dtype=np.float64) * t


# --------------------------------------------------------------------------- primitives
class Prim:
    def bounds(self) -> tuple[np.ndarray, np.ndarray]:
        raise NotImplementedError

    def dist(self, P: np.ndarray) -> np.ndarray:
        raise NotImplementedError


def _rotated_extent(R: np.ndarray, half: np.ndarray) -> np.ndarray:
    return np.sqrt(((R * half[None, :]) ** 2).sum(axis=1))


@dataclass
class Sphere(Prim):
    c: Vec
    r: float

    def bounds(self):
        c = v3(self.c)
        return c - self.r, c + self.r

    def dist(self, P):
        return np.linalg.norm(P - v3(self.c)[None, :], axis=1) - self.r


@dataclass
class Ellipsoid(Prim):
    c: Vec
    r: Vec
    R: np.ndarray = field(default_factory=lambda: np.eye(3))

    def bounds(self):
        c, r = v3(self.c), v3(self.r)
        e = _rotated_extent(self.R, r)
        return c - e, c + e

    def dist(self, P):
        r = v3(self.r)
        q = (P - v3(self.c)[None, :]) @ self.R  # world → local (R orthonormal)
        k0 = np.linalg.norm(q / r[None, :], axis=1)
        k1 = np.linalg.norm(q / (r * r)[None, :], axis=1)
        k1 = np.where(k1 < 1e-9, 1e-9, k1)
        return k0 * (k0 - 1.0) / k1


@dataclass
class Capsule(Prim):
    """Round cone: segment a→b with radii ra at a and rb at b (exact distance)."""

    a: Vec
    b: Vec
    ra: float
    rb: float | None = None

    def bounds(self):
        a, b = v3(self.a), v3(self.b)
        r = max(self.ra, self.rb if self.rb is not None else self.ra)
        return np.minimum(a, b) - r, np.maximum(a, b) + r

    def dist(self, P):
        a, b = v3(self.a), v3(self.b)
        r1, r2 = self.ra, (self.rb if self.rb is not None else self.ra)
        ba = b - a
        l2 = float(ba @ ba)
        if l2 < 1e-12:
            return np.linalg.norm(P - a[None, :], axis=1) - max(r1, r2)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = P - a[None, :]
        y = pa @ ba
        z = y - l2
        xv = pa * l2 - ba[None, :] * y[:, None]
        x2 = (xv * xv).sum(axis=1)
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d_b = np.sqrt(x2 + z2) * il2 - r2
        d_a = np.sqrt(x2 + y2) * il2 - r1
        d_m = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - r1
        cond_b = np.sign(z) * a2 * z2 > k
        cond_a = np.sign(y) * a2 * y2 < k
        return np.where(cond_b, d_b, np.where(cond_a, d_a, d_m))


@dataclass
class Box(Prim):
    """Rounded box: half extents `h`, corner radius `round`, orientation R (columns = local axes)."""

    c: Vec
    h: Vec
    R: np.ndarray = field(default_factory=lambda: np.eye(3))
    round: float = 0.0

    def bounds(self):
        c, h = v3(self.c), v3(self.h) + self.round
        e = _rotated_extent(self.R, h)
        return c - e, c + e

    def dist(self, P):
        q = np.abs((P - v3(self.c)[None, :]) @ self.R) - v3(self.h)[None, :]
        outside = np.linalg.norm(np.maximum(q, 0.0), axis=1)
        inside = np.minimum(q.max(axis=1), 0.0)
        return outside + inside - self.round


@dataclass
class Torus(Prim):
    """Torus around the local y axis: major radius Rm, tube radius rt."""

    c: Vec
    Rm: float
    rt: float
    R: np.ndarray = field(default_factory=lambda: np.eye(3))

    def bounds(self):
        c = v3(self.c)
        e = _rotated_extent(self.R, v3([self.Rm + self.rt, self.rt, self.Rm + self.rt]))
        return c - e, c + e

    def dist(self, P):
        q = (P - v3(self.c)[None, :]) @ self.R
        ring = np.hypot(q[:, 0], q[:, 2]) - self.Rm
        return np.hypot(ring, q[:, 1]) - self.rt


@dataclass
class Scaled(Prim):
    """Non-uniform scaling of another primitive about `c` (distance is a conservative bound)."""

    inner: Prim
    s: Vec
    c: Vec = (0.0, 0.0, 0.0)
    R: np.ndarray = field(default_factory=lambda: np.eye(3))

    def bounds(self):
        lo, hi = self.inner.bounds()
        s, c = v3(self.s), v3(self.c)
        corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        w = (self.R @ ((corners - c) * s).T).T + c
        return w.min(axis=0), w.max(axis=0)

    def dist(self, P):
        s, c = v3(self.s), v3(self.c)
        q = ((P - c[None, :]) @ self.R) / s[None, :] + c[None, :]
        return self.inner.dist(q) * float(s.min())


@dataclass
class HalfSpace(Prim):
    """Everything beyond the plane through `p` with outward normal `n` (use as a cut)."""

    p: Vec
    n: Vec

    def bounds(self):
        big = 10.0
        return v3([-big, -big, -big]), v3([big, big, big])

    def dist(self, P):
        n = norm(self.n)
        return -((P - v3(self.p)[None, :]) @ n)


# --------------------------------------------------------------------------- operators
def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


@dataclass
class Shape:
    adds: list = field(default_factory=list)  # (prim, k)
    cuts: list = field(default_factory=list)  # (prim, k)

    def add(self, prim: Prim, k: float = 0.0):
        self.adds.append((prim, k))
        return self

    def cut(self, prim: Prim, k: float = 0.0):
        self.cuts.append((prim, k))
        return self

    def poly(self, pts, radii, k=0.004):
        """Chain of round cones through `pts` with per-point radii."""
        pts = [v3(p) for p in pts]
        radii = [radii] * len(pts) if isinstance(radii, (int, float)) else list(radii)
        for i in range(len(pts) - 1):
            self.add(Capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]), k)
        return self

    def bounds(self):
        lo = np.full(3, np.inf)
        hi = np.full(3, -np.inf)
        for prim, k in self.adds:
            a, b = prim.bounds()
            lo = np.minimum(lo, a - k)
            hi = np.maximum(hi, b + k)
        return lo, hi

    # -- field on a grid, block by block --------------------------------------------------
    def field(self, origin: np.ndarray, h: float, dims: tuple[int, int, int]) -> np.ndarray:
        nx, ny, nz = dims
        xs = origin[0] + h * np.arange(nx)
        ys = origin[1] + h * np.arange(ny)
        zs = origin[2] + h * np.arange(nz)
        F = np.full(dims, FAR, dtype=np.float64)

        def block(prim, margin):
            lo, hi = prim.bounds()
            lo = lo - margin
            hi = hi + margin
            i0 = max(0, int(math.floor((lo[0] - origin[0]) / h)))
            j0 = max(0, int(math.floor((lo[1] - origin[1]) / h)))
            k0 = max(0, int(math.floor((lo[2] - origin[2]) / h)))
            i1 = min(nx, int(math.ceil((hi[0] - origin[0]) / h)) + 1)
            j1 = min(ny, int(math.ceil((hi[1] - origin[1]) / h)) + 1)
            k1 = min(nz, int(math.ceil((hi[2] - origin[2]) / h)) + 1)
            if i1 <= i0 or j1 <= j0 or k1 <= k0:
                return None
            X, Y, Z = np.meshgrid(xs[i0:i1], ys[j0:j1], zs[k0:k1], indexing="ij")
            P = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()])
            return (slice(i0, i1), slice(j0, j1), slice(k0, k1)), P, (i1 - i0, j1 - j0, k1 - k0)

        for prim, k in self.adds:
            b = block(prim, k + 2 * h)
            if b is None:
                continue
            sl, P, shp = b
            d = prim.dist(P).reshape(shp)
            F[sl] = smin(F[sl], d, k)
        for prim, k in self.cuts:
            if isinstance(prim, HalfSpace):
                X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
                P = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()])
                F = smax(F, -prim.dist(P).reshape(dims), k)
                continue
            b = block(prim, k + 2 * h)
            if b is None:
                continue
            sl, P, shp = b
            d = prim.dist(P).reshape(shp)
            F[sl] = smax(F[sl], -d, k)
        return F


def mesh_shape(shape: Shape, voxel: float, pad: float = 0.004):
    """Marching-cubes mesh of the shape's zero level set: (verts (n,3), faces (m,3))."""
    from skimage import measure

    lo, hi = shape.bounds()
    lo = lo - pad - 2 * voxel
    hi = hi + pad + 2 * voxel
    dims = tuple(int(math.ceil((hi[i] - lo[i]) / voxel)) + 1 for i in range(3))
    F = shape.field(lo, voxel, dims)
    if F.min() >= 0:
        raise ValueError("shape has no interior at this resolution")
    verts, faces, _normals, _values = measure.marching_cubes(F, level=0.0, spacing=(voxel, voxel, voxel), allow_degenerate=False)
    verts = verts + lo[None, :]
    return verts.astype(np.float64), faces.astype(np.int64)


def transform_mesh(verts: np.ndarray, faces: np.ndarray, R: np.ndarray, t) -> tuple[np.ndarray, np.ndarray]:
    """Local → world. A mirroring frame (det < 0) flips the face winding so normals stay outward."""
    w = (R @ verts.T).T + v3(t)[None, :]
    if np.linalg.det(R) < 0:
        faces = faces[:, ::-1]
    return w, faces


def mesh_area(verts: np.ndarray, faces: np.ndarray) -> float:
    a = verts[faces[:, 0]]
    b = verts[faces[:, 1]]
    c = verts[faces[:, 2]]
    return float(0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum())


# --------------------------------------------------------------------------- swept / flat primitives
def _extrude(d2: np.ndarray, dy_inside: np.ndarray) -> np.ndarray:
    """Combine a 2D section distance with the signed distance along the extrusion axis."""
    return np.minimum(np.maximum(d2, dy_inside), 0.0) + np.sqrt(np.maximum(d2, 0.0) ** 2 + np.maximum(dy_inside, 0.0) ** 2)


@dataclass
class Loft(Prim):
    """
    Tube along local +y with elliptic cross-sections.
    keys: rows (y, cx, cz, rx, rz) sorted by y; the centre and the radii are interpolated linearly in y.
    """

    keys: Sequence[Sequence[float]]
    c: Vec = (0.0, 0.0, 0.0)
    R: np.ndarray = field(default_factory=lambda: np.eye(3))

    def _arr(self):
        return np.asarray(self.keys, dtype=np.float64)

    def bounds(self):
        k = self._arr()
        lo = v3([(k[:, 1] - k[:, 3]).min(), k[:, 0].min(), (k[:, 2] - k[:, 4]).min()])
        hi = v3([(k[:, 1] + k[:, 3]).max(), k[:, 0].max(), (k[:, 2] + k[:, 4]).max()])
        corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        w = (self.R @ corners.T).T + v3(self.c)[None, :]
        return w.min(axis=0), w.max(axis=0)

    def dist(self, P):
        k = self._arr()
        q = (P - v3(self.c)[None, :]) @ self.R
        y = q[:, 1]
        cx = np.interp(y, k[:, 0], k[:, 1])
        cz = np.interp(y, k[:, 0], k[:, 2])
        rx = np.interp(y, k[:, 0], k[:, 3])
        rz = np.interp(y, k[:, 0], k[:, 4])
        ex = (q[:, 0] - cx) / rx
        ez = (q[:, 2] - cz) / rz
        d2 = (np.hypot(ex, ez) - 1.0) * np.minimum(rx, rz)
        dy = np.maximum(k[0, 0] - y, y - k[-1, 0])
        return _extrude(d2, dy)


def polygon_sdf(poly: np.ndarray, X: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """Signed distance from points (X, Y) to a closed 2D polygon (negative inside)."""
    n = len(poly)
    d = np.full(X.shape, np.inf)
    inside = np.zeros(X.shape, dtype=bool)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        wx, wy = X - ax, Y - ay
        t = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey + 1e-18), 0.0, 1.0)
        dx, dy = wx - ex * t, wy - ey * t
        d = np.minimum(d, dx * dx + dy * dy)
        cond = ((Y >= ay) != (Y >= by)) & (X < ax + (Y - ay) * ex / (ey if ey != 0 else 1e-18))
        inside ^= cond
    return np.where(inside, -1.0, 1.0) * np.sqrt(d)


@dataclass
class Plate(Prim):
    """
    Flat bone: a 2D outline (local x/y polygon) extruded along local z with half thickness `t`
    (constant, or per-vertex thickness interpolated by nearest outline vertex) and rounded edges.
    """

    poly: Sequence[Sequence[float]]
    t: float | Sequence[float]
    c: Vec = (0.0, 0.0, 0.0)
    R: np.ndarray = field(default_factory=lambda: np.eye(3))
    round: float = 0.003

    def bounds(self):
        p = np.asarray(self.poly, dtype=np.float64)
        tmax = float(np.max(self.t)) if not isinstance(self.t, (int, float)) else float(self.t)
        lo = v3([p[:, 0].min(), p[:, 1].min(), -tmax]) - self.round
        hi = v3([p[:, 0].max(), p[:, 1].max(), tmax]) + self.round
        corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        w = (self.R @ corners.T).T + v3(self.c)[None, :]
        return w.min(axis=0), w.max(axis=0)

    def dist(self, P):
        p = np.asarray(self.poly, dtype=np.float64)
        q = (P - v3(self.c)[None, :]) @ self.R
        d2 = polygon_sdf(p, q[:, 0], q[:, 1]) + self.round
        if isinstance(self.t, (int, float)):
            t = float(self.t)
        else:
            tv = np.asarray(self.t, dtype=np.float64)
            # inverse-distance weighting of the outline vertices' thickness
            w = 1.0 / ((q[:, 0:1] - p[None, :, 0]) ** 2 + (q[:, 1:2] - p[None, :, 1]) ** 2 + 1e-6)
            t = (w * tv[None, :]).sum(axis=1) / w.sum(axis=1)
        dz = np.abs(q[:, 2]) - t + self.round
        return _extrude(d2, dz) - self.round


def tube(shape: "Shape", path, rx, rz, width_dir=(1.0, 0.0, 0.0), k=0.006):
    """Sweep an ellipse (half axes rx along `width_dir`, rz across) along a polyline; radii may be lists."""
    pts = [v3(p) for p in path]
    n = len(pts)
    rx = [rx] * n if isinstance(rx, (int, float)) else list(rx)
    rz = [rz] * n if isinstance(rz, (int, float)) else list(rz)
    for i in range(n - 1):
        a, b = pts[i], pts[i + 1]
        R = rot_y_to(b - a, width_dir)
        L = float(np.linalg.norm(b - a))
        shape.add(Loft([[0.0, 0.0, 0.0, rx[i], rz[i]], [L, 0.0, 0.0, rx[i + 1], rz[i + 1]]], c=a, R=R), k)
    return shape
