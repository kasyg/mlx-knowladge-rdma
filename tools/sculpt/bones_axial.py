"""Axial skeleton of the horse: vertebral column (C1–Cd18), ribs, sternum, intervertebral discs,
costal and xiphoid cartilages. Frames: +x caudal along the column, +y dorsal, +z left."""
from __future__ import annotations

import math

import numpy as np

from frames import Frame, Rig, axial_frame
from sdf import Box, Capsule, Ellipsoid, HalfSpace, Loft, Plate, Scaled, Shape, Sphere, Torus, rot_xyz, rot_y_to, tube, v3

AXIS_X = rot_y_to([1.0, 0.0, 0.0])  # Loft / Torus axis (local y) → x


def _frame(points, i, up=(0.0, 1.0, 0.0)) -> Frame:
    p = v3(points[i])
    nxt = v3(points[i + 1]) if i + 1 < len(points) else p + (p - v3(points[i - 1]))
    prv = v3(points[i - 1]) if i > 0 else p - (nxt - p)
    return axial_frame(p, nxt - prv, up)


def generic_vertebra(
    s: float,
    body_len: float,
    body_ry: float,
    body_rz: float,
    rc: float,
    ta: float,
    spine_h: float,
    spine_tilt: float = 0.0,
    spine_base: float = 0.03,
    spine_tip: float = 0.018,
    spine_t: float = 0.006,
    trans_len: float = 0.05,
    trans_kind: str = "rod",
    trans_drop: float = 0.0,
    ventral_crest: bool = False,
    convex_head: bool = False,
    costal_facets: bool = False,
) -> tuple[Shape, float]:
    """Vertebra in its local frame (origin at the body centre). Returns (shape, y of the canal centre)."""
    sh = Shape()
    yc = body_ry + rc  # canal centre
    # body (slightly waisted) and the end plates
    sh.add(Loft([
        [-body_len / 2, 0.0, 0.0, body_ry, body_rz],
        [-body_len * 0.2, 0.0, -0.002 * s, body_ry * 0.9, body_rz * 0.88],
        [body_len * 0.2, 0.0, -0.002 * s, body_ry * 0.9, body_rz * 0.88],
        [body_len / 2, 0.0, 0.0, body_ry, body_rz],
    ], R=AXIS_X), 0.006 * s)
    if convex_head:
        sh.add(Ellipsoid([-body_len / 2 - 0.004 * s, 0.0, 0.0], [0.016 * s, body_ry * 0.85, body_rz * 0.85]), 0.006 * s)
        sh.cut(Ellipsoid([body_len / 2 + 0.014 * s, 0.0, 0.0], [0.018 * s, body_ry * 0.8, body_rz * 0.8]), 0.004 * s)
    if ventral_crest:
        sh.add(Capsule([-body_len * 0.4, -body_ry + 0.002 * s, 0.0], [body_len * 0.4, -body_ry - 0.005 * s, 0.0], 0.007 * s, 0.006 * s), 0.006 * s)
    # arch: a torus around the canal, stretched to the arch length
    arch_len = body_len * 0.8
    sh.add(Scaled(Torus([0.0, yc, 0.0], rc + ta / 2, ta / 2, R=AXIS_X), [arch_len / ta, 1.0, 1.0], c=[0.0, yc, 0.0]), 0.005 * s)
    # spinous process: sagittal plate, tilted
    yb = yc + rc + ta * 0.6
    off = spine_h * math.tan(math.radians(spine_tilt))
    outline = [(-spine_base / 2, yb - 0.01 * s), (spine_base / 2, yb - 0.01 * s), (spine_tip / 2 + off, yb + spine_h), (-spine_tip / 2 + off, yb + spine_h)]
    sh.add(Plate(outline, [spine_t, spine_t, spine_t * 1.25, spine_t * 1.25], round=0.003 * s), 0.006 * s)
    # transverse processes
    z0 = rc + ta * 0.7
    for sgn in (-1.0, 1.0):
        if trans_kind == "rod":
            sh.add(Capsule([0.0, yc - 0.004 * s, sgn * z0], [-0.006 * s, yc - trans_drop, sgn * trans_len], 0.011 * s, 0.008 * s), 0.006 * s)
            if costal_facets:
                sh.add(Ellipsoid([-0.004 * s, yc - trans_drop - 0.004 * s, sgn * (trans_len - 0.004 * s)], [0.012 * s, 0.009 * s, 0.012 * s]), 0.005 * s)
        elif trans_kind == "cervical":
            sh.add(Capsule([0.0, yc - 0.006 * s, sgn * z0], [-0.012 * s, yc - 0.030 * s, sgn * trans_len], 0.011 * s, 0.009 * s), 0.006 * s)
            sh.add(Capsule([0.004 * s, yc - 0.010 * s, sgn * z0], [0.018 * s, yc - 0.045 * s, sgn * trans_len * 0.8], 0.010 * s, 0.008 * s), 0.006 * s)
        elif trans_kind == "plate":
            Rp = np.column_stack([v3([1.0, 0.0, 0.0]), v3([0.0, 0.0, sgn]), v3([0.0, sgn, 0.0])])  # outline x/z, thickness along y
            pts = [(-0.018 * s, z0 - 0.004 * s), (0.020 * s, z0 - 0.004 * s), (0.014 * s, trans_len), (-0.010 * s, trans_len)]
            sh.add(Plate(pts, [0.008 * s, 0.008 * s, 0.005 * s, 0.005 * s], c=[0.0, yc - 0.004 * s, 0.0], R=Rp, round=0.003 * s), 0.006 * s)
    # articular processes (cranial: facets up, caudal: facets down)
    for sgn in (-1.0, 1.0):
        sh.add(Ellipsoid([-body_len / 2 - 0.002 * s, yc + rc * 0.7, sgn * (rc + ta * 0.6)], [0.011 * s, 0.009 * s, 0.011 * s]), 0.005 * s)
        sh.add(Ellipsoid([body_len / 2 + 0.002 * s, yc + rc * 0.9, sgn * (rc + ta * 0.3)], [0.011 * s, 0.009 * s, 0.010 * s]), 0.005 * s)
    return sh, yc


# ----------------------------------------------------------------------------- cervical
def atlas(rig: Rig):
    pts = [p["p"] for p in rig.spine["cervical"]]
    fr = _frame(pts, 0)
    s = rig.H / 1.6
    sh = Shape()
    rc = 0.024 * s
    sh.add(Scaled(Torus([0.0, 0.0, 0.0], rc + 0.008 * s, 0.008 * s, R=AXIS_X), [3.2, 1.0, 1.0]), 0.004 * s)  # ring
    sh.add(Ellipsoid([0.004 * s, -rc - 0.004 * s, 0.0], [0.020 * s, 0.010 * s, 0.014 * s]), 0.006 * s)  # ventral tubercle
    sh.add(Ellipsoid([0.000, rc + 0.006 * s, 0.0], [0.016 * s, 0.008 * s, 0.012 * s]), 0.006 * s)  # dorsal tubercle
    for sgn in (-1.0, 1.0):
        Rw = rot_xyz(-22.0 * sgn, 0, 0)  # wing slopes ventro-laterally
        Rw = Rw @ np.column_stack([v3([1.0, 0.0, 0.0]), v3([0.0, 0.0, sgn]), v3([0.0, sgn, 0.0])])
        pts2 = [(-0.028 * s, rc + 0.002 * s), (-0.020 * s, 0.070 * s), (0.016 * s, 0.078 * s), (0.040 * s, 0.056 * s), (0.030 * s, rc + 0.002 * s)]
        sh.add(Plate(pts2, [0.009 * s, 0.006 * s, 0.006 * s, 0.007 * s, 0.009 * s], c=[0.0, -0.004 * s, 0.0], R=Rw, round=0.004 * s), 0.008 * s)
        sh.add(Ellipsoid([-0.026 * s, 0.006 * s, sgn * (rc + 0.010 * s)], [0.012 * s, 0.014 * s, 0.010 * s]), 0.006 * s)  # cranial articular surface (cup for the occipital condyle)
        sh.cut(Sphere([-0.040 * s, 0.004 * s, sgn * (rc + 0.004 * s)], 0.016 * s), 0.003 * s)
    return [("atlas", "atlas", sh, fr, 0.0016 * s, 4000)]


def axis_vertebra(rig: Rig):
    pts = [p["p"] for p in rig.spine["cervical"]]
    fr = _frame(pts, 1)
    s = rig.H / 1.6
    sh, yc = generic_vertebra(s, 0.10 * s, 0.021 * s, 0.028 * s, 0.015 * s, 0.007 * s, 0.0, trans_len=0.040 * s, trans_kind="cervical", ventral_crest=True, convex_head=False)
    sh.add(Capsule([-0.050 * s, 0.004 * s, 0.0], [-0.090 * s, 0.006 * s, 0.0], 0.013 * s, 0.009 * s), 0.006 * s)  # dens
    yb = yc + 0.015 * s + 0.004 * s
    sh.add(Plate([(-0.040 * s, yb - 0.01 * s), (0.055 * s, yb - 0.008 * s), (0.060 * s, yb + 0.040 * s), (0.000, yb + 0.052 * s), (-0.030 * s, yb + 0.030 * s)],
                 [0.007 * s, 0.007 * s, 0.009 * s, 0.009 * s, 0.007 * s], round=0.003 * s), 0.006 * s)  # spinous crest
    return [("axis", "axis", sh, fr, 0.0016 * s, 5000)]


def cervicals(rig: Rig):
    pts = [p["p"] for p in rig.spine["cervical"]]
    s = rig.H / 1.6
    out = []
    spines = {2: 0.006, 3: 0.008, 4: 0.012, 5: 0.022, 6: 0.048}
    for i in range(2, 7):
        fr = _frame(pts, i)
        sh, yc = generic_vertebra(s, (0.090 if i < 6 else 0.060) * s, 0.022 * s, 0.030 * s, 0.015 * s, 0.007 * s, spines[i] * s, spine_tilt=-5.0,
                                  spine_base=0.035 * s, spine_tip=0.014 * s, trans_len=0.050 * s, trans_kind="cervical", ventral_crest=i < 6, convex_head=True)
        if i == 5:  # C6: ventral lamina of the transverse process
            for sgn in (-1.0, 1.0):
                Rl = np.column_stack([v3([1.0, 0.0, 0.0]), v3([0.0, 1.0, 0.0]), v3([0.0, 0.0, 1.0])])
                sh.add(Plate([(-0.030 * s, yc - 0.045 * s), (0.030 * s, yc - 0.045 * s), (0.034 * s, yc - 0.080 * s), (-0.034 * s, yc - 0.080 * s)], 0.004 * s,
                             c=[0.0, 0.0, sgn * 0.030 * s], R=Rl, round=0.003 * s), 0.006 * s)
        out.append((f"vertebrae_cervicales__C{i + 1}", "vertebrae_cervicales", sh, fr, 0.0017 * s, 4000))
    return out


# ----------------------------------------------------------------------------- thoracic, lumbar, sacral, caudal
def thoracics(rig: Rig):
    sp = rig.spine["thoracic"]
    pts = [p["p"] for p in sp]
    s = rig.H / 1.6
    out = []
    n = len(sp)
    for i in range(n):
        fr = _frame(pts, i)
        total = sp[i]["spine"]
        body_ry, rc, ta = 0.020 * s, 0.013 * s, 0.006 * s
        spine_h = max(0.03 * s, total - (body_ry + 2 * rc + ta))
        anticlinal = n - 4
        tilt = 28.0 * (1 - i / anticlinal) if i < anticlinal else -12.0 * (i - anticlinal) / max(1, n - 1 - anticlinal)
        tip = (0.026 if 1 <= i <= 6 else 0.018) * s
        sh, yc = generic_vertebra(s, 0.042 * s, body_ry, 0.026 * s, rc, ta, spine_h, spine_tilt=tilt, spine_base=0.030 * s, spine_tip=tip, spine_t=0.0055 * s,
                                  trans_len=sp[i]["trans"] * 0.65, trans_kind="rod", trans_drop=-0.004 * s, costal_facets=True)
        out.append((f"vertebrae_thoracicae__T{i + 1}", "vertebrae_thoracicae", sh, fr, 0.0019 * s, 3600))
    return out


def lumbars(rig: Rig):
    sp = rig.spine["lumbar"]
    pts = [p["p"] for p in sp]
    s = rig.H / 1.6
    out = []
    for i in range(len(sp)):
        fr = _frame(pts, i)
        sh, yc = generic_vertebra(s, 0.036 * s, 0.022 * s, 0.028 * s, 0.012 * s, 0.006 * s, 0.050 * s, spine_tilt=-10.0, spine_base=0.032 * s, spine_tip=0.022 * s,
                                  spine_t=0.006 * s, trans_len=min(0.11 * s, sp[i]["trans"] * 0.7), trans_kind="plate")
        out.append((f"vertebrae_lumbales__L{i + 1}", "vertebrae_lumbales", sh, fr, 0.0019 * s, 3600))
    return out


def sacrum(rig: Rig):
    sp = rig.spine["sacral"]
    pts = [v3(p["p"]) for p in sp]
    s = rig.H / 1.6
    c = pts[0] * 0.5 + pts[-1] * 0.5
    fr = axial_frame(c, pts[-1] - pts[0])
    sh = Shape()
    n = len(sp)
    loc = [fr.to_local(p) for p in pts]
    L = float(np.linalg.norm(pts[-1] - pts[0]))
    seg = L / max(1, n - 1)
    # fused bodies tapering caudally
    sh.add(Loft([[loc[0][0] - seg * 0.5, 0.0, 0.0, 0.022 * s, 0.030 * s], [loc[-1][0] + seg * 0.5, 0.0, 0.0, 0.012 * s, 0.016 * s]], R=AXIS_X), 0.008 * s)
    rc = 0.011 * s
    yc = 0.022 * s + rc
    sh.add(Scaled(Torus([0.0, yc * 0.9, 0.0], rc + 0.004 * s, 0.004 * s, R=AXIS_X), [(L + seg) / 0.008 / s, 1.0, 1.0], c=[0.0, yc * 0.9, 0.0]), 0.005 * s)
    # wings articulating with the ilium
    for sgn in (-1.0, 1.0):
        sh.add(Ellipsoid([loc[0][0] + 0.010 * s, 0.010 * s, sgn * 0.052 * s], [0.030 * s, 0.018 * s, 0.040 * s], rot_xyz(sgn * 25.0, 0, 0)), 0.012 * s)
    # spinous processes, leaning caudally, decreasing
    for i in range(n):
        h = max(0.02 * s, sp[i]["spine"] - 0.045 * s)
        x = loc[i][0]
        off = h * math.tan(math.radians(12.0))
        yb = yc + rc + 0.004 * s
        sh.add(Plate([(x - 0.013 * s, yb - 0.01 * s), (x + 0.013 * s, yb - 0.01 * s), (x + 0.008 * s + off, yb + h), (x - 0.006 * s + off, yb + h)],
                     [0.006 * s, 0.006 * s, 0.007 * s, 0.007 * s], round=0.003 * s), 0.006 * s)
        for sgn in (-1.0, 1.0):
            sh.add(Capsule([x, 0.006 * s, sgn * 0.022 * s], [x + 0.004 * s, 0.0, sgn * (0.040 * s - i * 0.004 * s)], 0.008 * s, 0.006 * s), 0.006 * s)
    return [("os_sacrum", "os_sacrum", sh, fr, 0.0021 * s, 7000)]


def caudals(rig: Rig):
    sp = rig.spine["caudal"]
    pts = [p["p"] for p in sp]
    s = rig.H / 1.6
    out = []
    for i in range(len(sp)):
        fr = _frame(pts, i)
        r = sp[i]["r"] * 0.55
        ln = 0.028 * s if i < 10 else 0.022 * s
        sh = Shape()
        sh.add(Loft([[-ln / 2, 0.0, 0.0, r, r], [0.0, 0.0, 0.0, r * 0.8, r * 0.8], [ln / 2, 0.0, 0.0, r, r]], R=AXIS_X), 0.004 * s)
        if i < 4:
            sh.add(Scaled(Torus([0.0, r + 0.006 * s, 0.0], 0.008 * s, 0.003 * s, R=AXIS_X), [ln * 0.5 / (0.006 * s), 1.0, 1.0], c=[0.0, r + 0.006 * s, 0.0]), 0.003 * s)
            for sgn in (-1.0, 1.0):
                sh.add(Capsule([0.0, 0.0, sgn * r], [0.004 * s, -0.002 * s, sgn * (r + 0.018 * s - i * 0.003 * s)], 0.005 * s, 0.004 * s), 0.004 * s)
        out.append((f"vertebrae_caudales__Cd{i + 1}", "vertebrae_caudales", sh, fr, 0.0017 * s, 900))
    return out


def discs(rig: Rig):
    s = rig.H / 1.6
    out = []
    series = [("C", [p["p"] for p in rig.spine["cervical"]][1:], 0.019, 0.027), ("T", [p["p"] for p in rig.spine["thoracic"]], 0.018, 0.024), ("L", [p["p"] for p in rig.spine["lumbar"]], 0.020, 0.026)]
    for tag, pts, ry, rz in series:
        for i in range(len(pts) - 1):
            a, b = v3(pts[i]), v3(pts[i + 1])
            c = (a + b) / 2
            fr = axial_frame(c, b - a)
            sh = Shape()
            th = 0.006 * s if tag != "C" else 0.008 * s
            sh.add(Loft([[-th, 0.0, 0.0, ry * s, rz * s], [th, 0.0, 0.0, ry * s, rz * s]], R=AXIS_X), 0.0)
            out.append((f"disci_intervertebrales__{tag}{i + 1}", "disci_intervertebrales", sh, fr, 0.0025 * s, 400, "cartilage"))
    return out


# ----------------------------------------------------------------------------- ribs and sternum
def trunk_section(rig: Rig, x: float):
    tr = rig.data["trunk"]
    xs = [t["x"] for t in tr]
    out = {}
    for k in ("top", "bottom", "w", "n", "pear"):
        out[k] = float(np.interp(x, xs, [t.get(k, 2.2 if k == "n" else 0.1) for t in tr]))
    return out


def ribs_and_cartilages(rig: Rig):
    sp = rig.spine["thoracic"]
    s = rig.H / 1.6
    n = len(sp)
    sternal = rig.params["trunk"]["ribcage"]["sternalRibs"]
    st_a = rig.L("sternum_cranial")
    st_b = rig.L("sternum_caudal")
    out = []
    for side in ("L", "R"):
        sgn = 1.0 if side == "L" else -1.0
        ribs = Shape()
        carts = Shape()
        for i in range(n):
            p = v3(sp[i]["p"])
            frac = i / (n - 1)
            inset = (0.095 - 0.055 * min(1.0, i / 6.0)) * s  # the shoulder sits on the first ribs
            sec = trunk_section(rig, p[0] + 0.08 * s)
            W = max(0.10 * s, sec["w"] - inset)
            depth = p[1] - sec["bottom"]
            # caudal shift of the ventral end
            slope = (-0.06 + 0.36 * math.sin(math.pi * min(1.0, frac * 1.15))) * s
            if i < sternal:
                t = i / max(1, sternal - 1)
                st = st_a * (1 - t) + st_b * t
                y_end = st[1] + (0.05 + 0.012 * i) * s
                z_end = (0.075 + 0.009 * i) * s
                x_end = p[0] + (st[0] - p[0]) * 0.55
            else:
                j = i - sternal
                y_end = sec["bottom"] + (0.11 + 0.028 * j) * s
                z_end = W * 0.55
                x_end = p[0] + slope
            y_low = min(p[1] - 0.28 * s, y_end + 0.06 * s)
            width = (0.020 if i == 0 else 0.017 - 0.0035 * frac) * s
            thick = (0.009 if i == 0 else 0.0065) * s
            path = [
                [p[0] - 0.010 * s, p[1] - 0.006 * s, sgn * 0.030 * s],  # head
                [p[0] + 0.002 * s, p[1] + 0.010 * s, sgn * 0.052 * s],  # tubercle
                [p[0] + 0.015 * s + slope * 0.08, p[1] - 0.010 * s, sgn * (0.5 * W)],  # angle
                [p[0] + 0.030 * s + slope * 0.30, p[1] - 0.12 * s, sgn * (0.92 * W)],
                [p[0] + 0.040 * s + slope * 0.55, y_low, sgn * (0.95 * W)],
                [p[0] + 0.040 * s + slope * 0.80, (y_low + y_end) / 2, sgn * (0.78 * W)],
                [x_end, y_end, sgn * z_end],
            ]
            widths = [width * 0.9, width, width * 1.05, width, width * 0.95, width * 0.85, width * 0.75]
            thicks = [thick * 1.3, thick * 1.2, thick, thick, thick, thick * 0.95, thick * 0.9]
            tube(ribs, path, widths, thicks, width_dir=(1.0, 0.0, 0.0), k=0.006 * s)
            ribs.add(Ellipsoid(path[0], [0.011 * s, 0.009 * s, 0.009 * s]), 0.005 * s)  # head
            ribs.add(Ellipsoid(path[1], [0.010 * s, 0.009 * s, 0.009 * s]), 0.005 * s)  # tubercle
            # costal cartilage
            if i < sternal:
                t = i / max(1, sternal - 1)
                st = st_a * (1 - t) + st_b * t
                end = [st[0], st[1] + 0.022 * s, sgn * 0.018 * s]
                mid = [(path[-1][0] + end[0]) / 2, (path[-1][1] + end[1]) / 2 - 0.02 * s, sgn * (z_end + 0.018 * s) * 0.8]
                tube(carts, [path[-1], mid, end], [0.009 * s, 0.010 * s, 0.010 * s], [0.006 * s, 0.006 * s, 0.006 * s], k=0.004 * s)
            else:
                j = i - sternal
                ln = (0.16 - 0.010 * j) * s
                d = v3([-0.75, -0.55, 0.0])
                d = d / np.linalg.norm(d)
                end = v3(path[-1]) + d * ln
                tube(carts, [path[-1], end], [0.008 * s, 0.006 * s], [0.0055 * s, 0.0045 * s], k=0.004 * s)
        fr = Frame(v3([0.0, 0.0, 0.0]), np.eye(3))
        out.append((f"costae_{side}", f"costae_{side}", ribs, fr, 0.0030 * s, 26000))
        out.append((f"cartilagines_costales_{side}", f"cartilagines_costales_{side}", carts, fr, 0.0034 * s, 9000, "cartilage"))
    return out


def sternum(rig: Rig):
    a = rig.L("sternum_cranial")
    b = rig.L("sternum_caudal")
    s = rig.H / 1.6
    fr = axial_frame((a + b) / 2, b - a)
    L = float(np.linalg.norm(b - a))
    sh = Shape()
    n = 7
    seg = L / n
    for i in range(n):
        x = -L / 2 + seg * (i + 0.5)
        k = 1.0 - 0.25 * (i / (n - 1))
        sh.add(Ellipsoid([x, 0.0, 0.0], [seg * 0.62, 0.030 * s * k, 0.018 * s * (0.8 + 0.3 * i / (n - 1))]), 0.012 * s)
    # ventral keel (cranial two thirds) and the manubrium
    sh.add(Plate([(-L / 2, -0.018 * s), (L * 0.2, -0.018 * s), (L * 0.1, -0.052 * s), (-L / 2 + 0.03 * s, -0.060 * s)], 0.004 * s, round=0.003 * s), 0.010 * s)
    sh.add(Ellipsoid([-L / 2 - 0.010 * s, 0.004 * s, 0.0], [0.030 * s, 0.028 * s, 0.014 * s]), 0.012 * s)
    xiph = Shape()
    Rx = np.column_stack([v3([1.0, 0.0, 0.0]), v3([0.0, 0.0, 1.0]), v3([0.0, 1.0, 0.0])])
    xiph.add(Plate([(L / 2 - 0.01 * s, -0.02 * s), (L / 2 - 0.01 * s, 0.02 * s), (L / 2 + 0.12 * s, 0.045 * s), (L / 2 + 0.16 * s, 0.0), (L / 2 + 0.12 * s, -0.045 * s)], 0.004 * s, c=[0.0, -0.004 * s, 0.0], R=Rx, round=0.003 * s), 0.0)
    return [("sternum", "sternum", sh, fr, 0.0024 * s, 5000), ("cartilago_xiphoidea", "cartilago_xiphoidea", xiph, fr, 0.0025 * s, 2000, "cartilage")]


def bones(rig: Rig):
    out = []
    out += atlas(rig)
    out += axis_vertebra(rig)
    out += cervicals(rig)
    out += thoracics(rig)
    out += lumbars(rig)
    out += sacrum(rig)
    out += caudals(rig)
    out += discs(rig)
    out += ribs_and_cartilages(rig)
    out += sternum(rig)
    return out
