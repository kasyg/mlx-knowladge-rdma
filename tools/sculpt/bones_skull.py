"""Skull of the horse: cranium (neuro- and viscerocranium in one mesh), mandible, hyoid apparatus and teeth.
Frame: origin at the occiput landmark, -x toward the nose (cranial), +y dorsal, +z left."""
from __future__ import annotations

import numpy as np

from frames import Frame, Rig
from sdf import Box, Capsule, Ellipsoid, HalfSpace, Loft, Plate, Shape, Sphere, Torus, rot_xyz, rot_y_to, tube, v3

AXIS_X = rot_y_to([1.0, 0.0, 0.0])


def head_frame(rig: Rig) -> tuple[Frame, float]:
    o = v3(rig.head["origin"])
    d = v3(rig.head["dir"])
    up = v3(rig.head["up"])
    x = -d
    z = np.cross(x, up)
    return Frame(o, np.column_stack([x, up, z])), float(rig.head["length"])


def head_section(rig: Rig, t: float):
    secs = rig.head["sections"]
    ts = [h["t"] for h in secs]
    return {k: float(np.interp(t, ts, [h.get(k, 0.0) for h in secs])) for k in ("w", "h", "yOff")}


def cranium(rig: Rig):
    fr, L = head_frame(rig)
    s = rig.H / 1.6
    lm = lambda n: fr.to_local(rig.L(n))  # noqa: E731
    orbit = lm("skull_orbit_L")
    eye = lm("skull_eye_L")
    tmj = lm("skull_tmj_L")
    zyg = lm("skull_zygoma_L")
    nose = lm("skull_nose")
    sh = Shape()
    X = lambda t: -t * L  # noqa: E731  (position along the head axis)

    # --- neurocranium: braincase, nuchal crest, occipital condyles, paracondylar processes
    sh.add(Ellipsoid([X(0.15), 0.010 * s, 0.0], [0.080 * s, 0.056 * s, 0.056 * s]), 0.012 * s)
    sh.add(Ellipsoid([X(0.03), 0.040 * s, 0.0], [0.014 * s, 0.024 * s, 0.050 * s]), 0.010 * s)  # nuchal crest
    sh.add(Box([X(0.27), 0.052 * s, 0.0], [0.050 * s, 0.008 * s, 0.075 * s], round=0.006 * s), 0.014 * s)  # frontal bone: broad flat forehead between the orbits
    sh.add(Ellipsoid([X(0.05), -0.010 * s, 0.0], [0.040 * s, 0.040 * s, 0.050 * s]), 0.010 * s)  # skull base
    for sgn in (-1.0, 1.0):
        sh.add(Ellipsoid([X(0.0) + 0.006 * s, -0.026 * s, sgn * 0.022 * s], [0.016 * s, 0.020 * s, 0.015 * s]), 0.006 * s)  # occipital condyle
        sh.add(Capsule([X(0.03), -0.020 * s, sgn * 0.046 * s], [X(0.04), -0.080 * s, sgn * 0.050 * s], 0.010 * s, 0.007 * s), 0.008 * s)  # paracondylar process
        sh.add(Ellipsoid([X(0.12), -0.040 * s, sgn * 0.050 * s], [0.030 * s, 0.020 * s, 0.016 * s]), 0.010 * s)  # tympanic bulla / petrous part
    sh.cut(Capsule([X(-0.05), -0.020 * s, 0.0], [X(0.12), -0.020 * s, 0.0], 0.017 * s), 0.004 * s)  # foramen magnum / cranial cavity entrance
    sh.cut(Ellipsoid([X(0.16), 0.010 * s, 0.0], [0.062 * s, 0.040 * s, 0.042 * s]), 0.0)  # cranial cavity

    # --- orbits: complete bony ring; supraorbital process above, zygomatic arch to the TMJ
    for sgn in (-1.0, 1.0):
        c = v3([orbit[0], orbit[1], sgn * orbit[2]])
        R = rot_y_to([-0.35, 0.25, sgn * 1.0])  # ring opens latero-rostro-dorsally
        sh.add(Torus(c - v3([0.0, 0.0, sgn * 0.012 * s]), 0.031 * s, 0.008 * s, R), 0.010 * s)
        sh.cut(Sphere(c, 0.029 * s), 0.003 * s)
        sh.add(Ellipsoid([orbit[0] + 0.006 * s, orbit[1] + 0.030 * s, sgn * (orbit[2] - 0.024 * s)], [0.030 * s, 0.007 * s, 0.026 * s]), 0.012 * s)  # supraorbital process
        arch = [
            [orbit[0] + 0.012 * s, orbit[1] - 0.040 * s, sgn * (orbit[2] - 0.012 * s)],
            [orbit[0] + 0.040 * s, orbit[1] - 0.034 * s, sgn * (orbit[2] - 0.010 * s)],
            [tmj[0] - 0.010 * s, tmj[1] - 0.030 * s, sgn * tmj[2]],
            [tmj[0] + 0.020 * s, tmj[1] - 0.020 * s, sgn * (tmj[2] - 0.004 * s)],
        ]
        tube(sh, arch, [0.014 * s, 0.012 * s, 0.012 * s, 0.014 * s], [0.008 * s, 0.007 * s, 0.008 * s, 0.010 * s], width_dir=(0.0, 1.0, 0.0), k=0.008 * s)
        sh.add(Ellipsoid([tmj[0], tmj[1] - 0.024 * s, sgn * tmj[2]], [0.018 * s, 0.010 * s, 0.020 * s]), 0.008 * s)  # articular tubercle of the TMJ
        # facial crest running rostrally from below the orbit
        sh.add(Capsule([orbit[0] - 0.010 * s, orbit[1] - 0.055 * s, sgn * (orbit[2] - 0.014 * s)], [orbit[0] - 0.130 * s, orbit[1] - 0.080 * s, sgn * (orbit[2] - 0.028 * s)], 0.010 * s, 0.007 * s), 0.010 * s)
        # temporal fossa hollow behind the orbit
        sh.cut(Ellipsoid([orbit[0] + 0.060 * s, orbit[1] + 0.010 * s, sgn * (orbit[2] - 0.010 * s)], [0.040 * s, 0.030 * s, 0.022 * s]), 0.010 * s)

    # --- face: a narrow nasal roof over a wide alveolar block (maxillae) that carries the cheek teeth
    pal = -0.080 * s
    roof = []
    for t, top, wid in ((0.22, 0.050, 0.070), (0.36, 0.048, 0.062), (0.52, 0.036, 0.052), (0.68, 0.016, 0.044), (0.80, -0.004, 0.038), (0.90, -0.024, 0.032)):
        roof.append([X(t), (top - 0.030) * s, 0.0, 0.030 * s, wid * s])
    sh.add(Loft(sorted(roof, key=lambda k: k[0]), R=AXIS_X), 0.016 * s)
    alv = []
    for t, wid, hgt in ((0.26, 0.086, 0.034), (0.42, 0.084, 0.034), (0.58, 0.080, 0.033), (0.72, 0.070, 0.030), (0.80, 0.056, 0.026), (0.90, 0.044, 0.022), (0.985, 0.038, 0.018)):
        alv.append([X(t), pal + hgt * s, 0.0, hgt * s, wid * s])
    sh.add(Loft(sorted(alv, key=lambda k: k[0]), R=AXIS_X), 0.016 * s)
    for sgn in (-1.0, 1.0):
        # maxillary bulge over the reserve crowns of the cheek teeth, facial crest on top of it
        sh.add(Capsule([X(0.40), pal + 0.040 * s, sgn * 0.058 * s], [X(0.74), pal + 0.034 * s, sgn * 0.050 * s], 0.024 * s, 0.020 * s), 0.014 * s)
        sh.add(Capsule([X(0.34), pal + 0.052 * s, sgn * 0.080 * s], [X(0.62), pal + 0.046 * s, sgn * 0.070 * s], 0.009 * s, 0.006 * s), 0.010 * s)  # facial crest
        sh.cut(Sphere([X(0.66), pal + 0.060 * s, sgn * 0.058 * s], 0.006 * s), 0.002 * s)  # infraorbital foramen
        # interalveolar margin (bars) and the incisive bone
        sh.add(Capsule([X(0.74), pal + 0.016 * s, sgn * 0.042 * s], [X(0.95), pal + 0.020 * s, sgn * 0.028 * s], 0.014 * s, 0.013 * s), 0.012 * s)
    sh.add(Ellipsoid([X(0.975), pal + 0.026 * s, 0.0], [0.026 * s, 0.016 * s, 0.040 * s]), 0.012 * s)  # incisive arcade
    # nasal aperture and the nasal cavity; flat hard palate
    sh.cut(Ellipsoid([X(1.01), pal + 0.082 * s, 0.0], [0.100 * s, 0.040 * s, 0.024 * s]), 0.008 * s)
    sh.cut(Capsule([X(0.40), -0.016 * s, 0.0], [X(0.90), -0.052 * s, 0.0], 0.026 * s, 0.010 * s), 0.0)  # nasal cavity, kept inside the bone
    sh.cut(HalfSpace([X(0.6), pal - 0.002 * s, 0.0], [0.0, -1.0, 0.0]), 0.004 * s)
    return [("cranium", "cranium", sh, fr, 0.0028 * s, 26000)]


def mandible(rig: Rig):
    fr, L = head_frame(rig)
    s = rig.H / 1.6
    lm = lambda n: fr.to_local(rig.L(n))  # noqa: E731
    chin = lm("mandible_chin")
    angle = lm("mandible_angle_L")
    tmj = lm("skull_tmj_L")
    X = lambda t: -t * L  # noqa: E731
    pal = -0.080 * s
    sh = Shape()
    for sgn in (-1.0, 1.0):
        # body: deep under the cheek teeth, slimmer along the bars, rounded ventral border
        path = [
            [X(0.95), pal - 0.028 * s, sgn * 0.020 * s],
            [X(0.86), pal - 0.034 * s, sgn * 0.030 * s],
            [X(0.74), pal - 0.048 * s, sgn * 0.040 * s],
            [X(0.58), pal - 0.058 * s, sgn * 0.046 * s],
            [X(0.44), pal - 0.060 * s, sgn * 0.052 * s],
            [angle[0] - 0.030 * s, angle[1] + 0.010 * s, sgn * (angle[2] + 0.004 * s)],
        ]
        tube(sh, path, [0.018 * s, 0.022 * s, 0.036 * s, 0.044 * s, 0.046 * s, 0.044 * s], [0.011 * s, 0.012 * s, 0.014 * s, 0.015 * s, 0.015 * s, 0.014 * s], width_dir=(0.0, 1.0, 0.0), k=0.012 * s)
        # alveolar margin holding the lower cheek teeth
        sh.add(Capsule([X(0.74), pal - 0.026 * s, sgn * 0.038 * s], [X(0.44), pal - 0.026 * s, sgn * 0.044 * s], 0.014 * s, 0.014 * s), 0.012 * s)
        # ramus: broad plate from the rounded angle up to the condyle (caudal) and the coronoid process (rostral, higher)
        Rr = np.eye(3)
        pts = [
            (angle[0] + 0.030 * s, angle[1] + 0.005 * s), (angle[0] + 0.052 * s, angle[1] + 0.050 * s), (tmj[0] + 0.014 * s, tmj[1] - 0.040 * s),
            (tmj[0] - 0.026 * s, tmj[1] - 0.046 * s), (tmj[0] - 0.056 * s, tmj[1] - 0.010 * s), (tmj[0] - 0.082 * s, tmj[1] - 0.034 * s),
            (X(0.40), pal - 0.020 * s), (X(0.40), pal - 0.060 * s), (angle[0] - 0.050 * s, angle[1] - 0.004 * s),
        ]
        thick = [0.013 * s, 0.009 * s, 0.009 * s, 0.006 * s, 0.006 * s, 0.006 * s, 0.010 * s, 0.014 * s, 0.014 * s]
        sh.add(Plate(pts, thick, c=[0.0, 0.0, sgn * angle[2]], R=Rr, round=0.006 * s), 0.012 * s)
        sh.add(Ellipsoid([tmj[0], tmj[1] - 0.040 * s, sgn * tmj[2]], [0.012 * s, 0.009 * s, 0.022 * s]), 0.008 * s)  # condylar process
        sh.cut(Ellipsoid([angle[0] - 0.020 * s, angle[1] + 0.034 * s, sgn * (angle[2] + 0.012 * s)], [0.042 * s, 0.030 * s, 0.009 * s]), 0.008 * s)  # masseteric fossa
        sh.cut(Ellipsoid([angle[0] - 0.020 * s, angle[1] + 0.034 * s, sgn * (angle[2] - 0.012 * s)], [0.040 * s, 0.028 * s, 0.009 * s]), 0.008 * s)  # pterygoid fossa
    # symphysis with the incisive part
    sh.add(Ellipsoid([X(0.965), pal - 0.030 * s, 0.0], [0.030 * s, 0.018 * s, 0.034 * s]), 0.012 * s)
    return [("mandibula", "mandibula", sh, fr, 0.0026 * s, 14000)]


def hyoid(rig: Rig):
    fr, L = head_frame(rig)
    s = rig.H / 1.6
    hy = fr.to_local(rig.L("hyoid"))
    sh = Shape()
    # basihyoid with the lingual process; thyrohyoids caudally; ceratohyoid, epihyoid, stylohyoid up to the skull base
    sh.add(Capsule([hy[0], hy[1], -0.025 * s], [hy[0], hy[1], 0.025 * s], 0.006 * s), 0.004 * s)
    sh.add(Capsule([hy[0], hy[1], 0.0], [hy[0] - 0.040 * s, hy[1] + 0.004 * s, 0.0], 0.006 * s, 0.004 * s), 0.004 * s)
    for sgn in (-1.0, 1.0):
        sh.add(Capsule([hy[0], hy[1], sgn * 0.025 * s], [hy[0] + 0.060 * s, hy[1] - 0.012 * s, sgn * 0.030 * s], 0.005 * s, 0.004 * s), 0.004 * s)  # thyrohyoid
        a = v3([hy[0] - 0.004 * s, hy[1] + 0.004 * s, sgn * 0.028 * s])
        b = v3([hy[0] - 0.012 * s, hy[1] + 0.030 * s, sgn * 0.034 * s])
        c = v3([hy[0] - 0.004 * s, hy[1] + 0.050 * s, sgn * 0.038 * s])
        d = v3([hy[0] + 0.090 * s, hy[1] + 0.190 * s, sgn * 0.050 * s])
        sh.add(Capsule(a, b, 0.0045 * s, 0.004 * s), 0.004 * s)  # ceratohyoid
        sh.add(Capsule(b, c, 0.004 * s, 0.004 * s), 0.004 * s)  # epihyoid
        sh.add(Capsule(c, d, 0.0055 * s, 0.006 * s), 0.004 * s)  # stylohyoid
    return [("os_hyoideum", "os_hyoideum", sh, fr, 0.0014 * s, 5000)]


def teeth(rig: Rig):
    fr, L = head_frame(rig)
    s = rig.H / 1.6
    X = lambda t: -t * L  # noqa: E731
    lm = lambda n: fr.to_local(rig.L(n))  # noqa: E731
    chin = lm("mandible_chin")
    pal = -0.080 * s  # occlusal level of the upper arcade (palate)
    inc, can, pre, mol = Shape(), Shape(), Shape(), Shape()
    # cheek teeth: hypsodont, long reserve crowns inside the jaws; upper row wider than the lower
    cheek = [("P2", 0.72, 0.030), ("P3", 0.655, 0.027), ("P4", 0.60, 0.026), ("M1", 0.548, 0.025), ("M2", 0.497, 0.026), ("M3", 0.445, 0.030)]
    for name, t, ln in cheek:
        target = pre if name.startswith("P") else mol
        for sgn in (-1.0, 1.0):
            target.add(Box([X(t), pal + 0.030 * s, sgn * 0.050 * s], [ln * 0.5 * s, 0.040 * s, 0.013 * s], rot_xyz(0, 0, 0), round=0.003 * s), 0.0)  # upper
            target.add(Box([X(t) + 0.006 * s, pal - 0.046 * s, sgn * 0.040 * s], [ln * 0.5 * s, 0.040 * s, 0.010 * s], round=0.003 * s), 0.0)  # lower
    # incisors: upper arcade at the incisive bone, lower at the chin; canines in the interdental space
    for i, ang in enumerate((-50.0, -30.0, -10.0, 10.0, 30.0, 50.0)):
        a = np.radians(ang)
        r = 0.034 * s
        cx, cz = X(0.975) - r * (1 - np.cos(a)), r * np.sin(a)
        inc.add(Box([cx, pal + 0.016 * s, cz], [0.006 * s, 0.028 * s, 0.006 * s], rot_xyz(0, ang, -20), round=0.003 * s), 0.0)
        inc.add(Box([chin[0] + 0.018 * s - r * (1 - np.cos(a)) * 0.9, pal - 0.022 * s, cz * 0.92], [0.0055 * s, 0.026 * s, 0.0055 * s], rot_xyz(0, ang, 15), round=0.003 * s), 0.0)
    for sgn in (-1.0, 1.0):
        can.add(Box([X(0.905), pal + 0.010 * s, sgn * 0.028 * s], [0.006 * s, 0.022 * s, 0.006 * s], round=0.003 * s), 0.0)
        can.add(Box([X(0.89), pal - 0.030 * s, sgn * 0.026 * s], [0.006 * s, 0.022 * s, 0.006 * s], round=0.003 * s), 0.0)
    return [
        ("dentes_incisivi", "dentes_incisivi", inc, fr, 0.0012 * s, 4000),
        ("dentes_canini", "dentes_canini", can, fr, 0.0012 * s, 2000),
        ("dentes_premolares", "dentes_premolares", pre, fr, 0.0016 * s, 5000),
        ("dentes_molares", "dentes_molares", mol, fr, 0.0016 * s, 5000),
    ]


def bones(rig: Rig):
    return cranium(rig) + mandible(rig) + hyoid(rig) + teeth(rig)
