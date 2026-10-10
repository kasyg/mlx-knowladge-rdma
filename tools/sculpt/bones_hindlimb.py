"""Hindlimb bones of the horse: os coxae, femur, patella, tibia, fibula, tarsus, metatarsus, digit.

Local frames: -x cranial, +y proximal, +z lateral (see frames.py). Lengths in metres; `s`
scales the reference measurements of a 1.6 m (withers) warmblood to the rig's bone length.
"""
from __future__ import annotations

import numpy as np

from frames import Frame, Rig, limb_frame, side_frame
from sdf import Box, Capsule, Ellipsoid, HalfSpace, Loft, Plate, Shape, Sphere, Torus, rot_xyz, tube, v3

SIDES = ("L", "R")


# ----------------------------------------------------------------------------- femur
def femur(rig: Rig, side: str):
    hip = rig.L("hl_{S}_hip", side)
    stifle = rig.L("hl_{S}_stifle", side)
    fr = limb_frame(hip, stifle, side)
    L = float(np.linalg.norm(hip - stifle))
    s = L / 0.38
    sh = Shape()
    # shaft: robust, nearly straight; the axis runs from the condyles up and laterally to the neck
    sh.add(Loft([
        [0.12 * L, 0.004 * s, 0.008 * s, 0.034 * s, 0.040 * s],
        [0.30 * L, 0.000, 0.016 * s, 0.029 * s, 0.031 * s],
        [0.55 * L, 0.000, 0.028 * s, 0.028 * s, 0.030 * s],
        [0.78 * L, 0.002 * s, 0.038 * s, 0.030 * s, 0.034 * s],
        [0.88 * L, 0.004 * s, 0.040 * s, 0.034 * s, 0.040 * s],
    ]), 0.012 * s)
    # neck and head (the head is centred on the hip joint landmark)
    sh.add(Capsule([0.0, 0.89 * L, 0.034 * s], [0.0, 0.975 * L, 0.004 * s], 0.028 * s, 0.026 * s), 0.012 * s)
    sh.add(Sphere([0.0, L, 0.0], 0.034 * s), 0.008 * s)
    sh.cut(Sphere([0.006 * s, 0.985 * L, -0.034 * s], 0.010 * s), 0.003 * s)  # fovea capitis
    # greater trochanter: high caudal part and lower cranial part, notch between them
    sh.add(Ellipsoid([0.014 * s, 1.0 * L, 0.076 * s], [0.028 * s, 0.042 * s, 0.021 * s], rot_xyz(0, 0, -10)), 0.014 * s)
    sh.add(Ellipsoid([-0.030 * s, 0.95 * L, 0.070 * s], [0.028 * s, 0.030 * s, 0.020 * s]), 0.016 * s)
    sh.cut(Ellipsoid([-0.010 * s, 1.035 * L, 0.090 * s], [0.014 * s, 0.022 * s, 0.034 * s]), 0.008 * s)
    sh.cut(Ellipsoid([0.026 * s, 0.965 * L, 0.050 * s], [0.016 * s, 0.028 * s, 0.014 * s]), 0.006 * s)  # trochanteric fossa
    # lesser trochanter (medial crest below the neck) and third trochanter (flat lateral plate)
    sh.add(Ellipsoid([0.016 * s, 0.80 * L, 0.000], [0.014 * s, 0.036 * s, 0.014 * s], rot_xyz(0, 0, 12)), 0.010 * s)
    sh.add(Box([-0.008 * s, 0.70 * L, 0.070 * s], [0.007 * s, 0.024 * s, 0.016 * s], rot_xyz(0, 15, -6), round=0.004 * s), 0.014 * s)
    # supracondylar fossa (caudal, above the lateral condyle)
    sh.cut(Ellipsoid([0.042 * s, 0.22 * L, 0.018 * s], [0.024 * s, 0.042 * s, 0.022 * s]), 0.010 * s)
    # condyles with the intercondylar fossa
    sh.add(Ellipsoid([0.018 * s, 0.042 * s, -0.030 * s], [0.046 * s, 0.040 * s, 0.028 * s]), 0.008 * s)
    sh.add(Ellipsoid([0.016 * s, 0.040 * s, 0.031 * s], [0.043 * s, 0.038 * s, 0.026 * s]), 0.008 * s)
    sh.cut(Ellipsoid([0.055 * s, 0.028 * s, 0.0], [0.034 * s, 0.032 * s, 0.013 * s]), 0.006 * s)
    # trochlea: large medial ridge with its proximal tubercle, smaller lateral ridge, wide groove
    sh.add(Capsule([-0.036 * s, 0.025 * s, -0.024 * s], [-0.034 * s, 0.115 * s, -0.030 * s], 0.021 * s, 0.018 * s), 0.008 * s)
    sh.add(Sphere([-0.030 * s, 0.125 * s, -0.030 * s], 0.019 * s), 0.008 * s)
    sh.add(Capsule([-0.032 * s, 0.025 * s, 0.024 * s], [-0.028 * s, 0.105 * s, 0.024 * s], 0.017 * s, 0.014 * s), 0.008 * s)
    sh.cut(Capsule([-0.070 * s, 0.010 * s, 0.000], [-0.064 * s, 0.125 * s, -0.003 * s], 0.022 * s, 0.020 * s), 0.006 * s)
    # epicondyles
    sh.add(Ellipsoid([0.012 * s, 0.062 * s, -0.052 * s], [0.018 * s, 0.020 * s, 0.010 * s]), 0.010 * s)
    sh.add(Ellipsoid([0.010 * s, 0.062 * s, 0.052 * s], [0.018 * s, 0.020 * s, 0.009 * s]), 0.010 * s)
    return sh, fr, 0.0022 * s, 10000


def patella(rig: Rig, side: str):
    hip = rig.L("hl_{S}_hip", side)
    stifle = rig.L("hl_{S}_stifle", side)
    fr = limb_frame(hip, stifle, side)  # sits on the femoral trochlea, in the femur frame
    L = float(np.linalg.norm(hip - stifle))
    s = L / 0.38
    c = v3([-0.080 * s, 0.085 * s, -0.004 * s])
    sh = Shape()
    sh.add(Ellipsoid(c, [0.016 * s, 0.036 * s, 0.030 * s]), 0.006 * s)
    sh.add(Ellipsoid(c + v3([0.0, -0.030 * s, 0.004 * s]), [0.013 * s, 0.020 * s, 0.018 * s]), 0.010 * s)  # apex
    sh.add(Ellipsoid(c + v3([-0.004 * s, 0.028 * s, 0.0]), [0.013 * s, 0.016 * s, 0.024 * s]), 0.010 * s)  # base
    # articular surface: concave over the medial ridge of the trochlea
    sh.cut(Capsule(c + v3([0.034 * s, -0.05 * s, -0.012 * s]), c + v3([0.034 * s, 0.05 * s, -0.012 * s]), 0.028 * s), 0.006 * s)
    return sh, fr, 0.0016 * s, 4000


# ----------------------------------------------------------------------------- tibia & fibula
def tibia(rig: Rig, side: str):
    stifle = rig.L("hl_{S}_stifle", side)
    hock = rig.L("hl_{S}_hock", side)
    fr = limb_frame(stifle, hock, side)
    L = float(np.linalg.norm(stifle - hock))
    s = L / 0.38
    top = L - 0.012 * s  # plateau; the menisci fill the gap to the femoral condyles
    sh = Shape()
    # shaft: triangular near the top (cranial crest), oval below; the distal end is wide for the cochlea
    sh.add(Loft([
        [0.030 * s, 0.000, 0.000, 0.034 * s, 0.038 * s],
        [0.10 * L, 0.002 * s, 0.000, 0.030 * s, 0.030 * s],
        [0.40 * L, 0.004 * s, 0.002 * s, 0.025 * s, 0.025 * s],
        [0.70 * L, -0.004 * s, 0.000, 0.030 * s, 0.028 * s],
        [0.86 * L, -0.008 * s, 0.000, 0.040 * s, 0.040 * s],
        [top - 0.010 * s, -0.002 * s, 0.000, 0.046 * s, 0.054 * s],
        [top, 0.000, 0.000, 0.044 * s, 0.052 * s],
    ]), 0.012 * s)
    # condyles (flat plateau) and the intercondylar eminence
    sh.add(Ellipsoid([0.004 * s, top - 0.006 * s, -0.028 * s], [0.042 * s, 0.014 * s, 0.030 * s]), 0.006 * s)
    sh.add(Ellipsoid([0.006 * s, top - 0.006 * s, 0.028 * s], [0.040 * s, 0.014 * s, 0.028 * s]), 0.006 * s)
    sh.add(Ellipsoid([-0.004 * s, top + 0.006 * s, -0.008 * s], [0.012 * s, 0.014 * s, 0.008 * s]), 0.004 * s)
    sh.add(Ellipsoid([-0.004 * s, top + 0.005 * s, 0.008 * s], [0.012 * s, 0.013 * s, 0.008 * s]), 0.004 * s)
    sh.cut(Ellipsoid([0.046 * s, top + 0.004 * s, 0.0], [0.020 * s, 0.014 * s, 0.014 * s]), 0.004 * s)  # popliteal notch
    # tibial tuberosity and the cranial crest; extensor groove lateral to the tuberosity
    sh.add(Ellipsoid([-0.050 * s, 0.90 * L, -0.004 * s], [0.026 * s, 0.034 * s, 0.024 * s]), 0.014 * s)
    sh.add(Capsule([-0.052 * s, 0.88 * L, -0.002 * s], [-0.024 * s, 0.58 * L, 0.002 * s], 0.014 * s, 0.007 * s), 0.014 * s)
    sh.cut(Capsule([-0.062 * s, 0.97 * L, 0.030 * s], [-0.050 * s, 0.86 * L, 0.030 * s], 0.009 * s), 0.004 * s)
    # muscular (lateral) surface slightly hollowed below the crest
    sh.cut(Ellipsoid([-0.034 * s, 0.76 * L, 0.040 * s], [0.030 * s, 0.070 * s, 0.014 * s]), 0.008 * s)
    # distal end: cochlea (two oblique grooves, central ridge), medial malleolus
    sh.add(Ellipsoid([0.0, 0.028 * s, 0.0], [0.036 * s, 0.028 * s, 0.040 * s]), 0.008 * s)
    for z in (-0.017 * s, 0.017 * s):
        a = v3([-0.045 * s, 0.000, z - 0.010 * s])
        b = v3([0.045 * s, 0.000, z + 0.010 * s])
        sh.cut(Capsule(a, b, 0.013 * s), 0.004 * s)
    sh.add(Ellipsoid([0.0, 0.020 * s, -0.040 * s], [0.016 * s, 0.022 * s, 0.010 * s]), 0.008 * s)
    return sh, fr, 0.0022 * s, 9000


def fibula(rig: Rig, side: str):
    stifle = rig.L("hl_{S}_stifle", side)
    hock = rig.L("hl_{S}_hock", side)
    fr = limb_frame(stifle, hock, side)
    L = float(np.linalg.norm(stifle - hock))
    s = L / 0.38
    sh = Shape()
    sh.add(Ellipsoid([0.018 * s, 0.90 * L, 0.054 * s], [0.012 * s, 0.022 * s, 0.009 * s]), 0.006 * s)  # head
    sh.add(Capsule([0.014 * s, 0.87 * L, 0.052 * s], [0.004 * s, 0.34 * L, 0.040 * s], 0.0065 * s, 0.0030 * s), 0.006 * s)
    return sh, fr, 0.0014 * s, 2500


# ----------------------------------------------------------------------------- tarsus
def hock_frame(rig: Rig, side: str) -> tuple[Frame, float]:
    hock = rig.L("hl_{S}_hock", side)
    fetlock = rig.L("hl_{S}_fetlock", side)
    fr = limb_frame(hock, fetlock, side)
    fr.origin = hock.copy()  # origin at the talus; y down the cannon
    return fr, rig.H / 1.6


def talus(rig: Rig, side: str):
    fr, s = hock_frame(rig, side)
    sh = Shape()
    # body; the trochlea is a pulley: two oblique ridges wrapping dorso-proximally, lateral ridge larger
    sh.add(Ellipsoid([0.004 * s, -0.012 * s, 0.0], [0.028 * s, 0.024 * s, 0.032 * s]), 0.006 * s)
    Rt = rot_xyz(90, 0, 0) @ rot_xyz(0, 0, 0)  # torus axis (local y) → z (lateral)
    for z, rt in ((-0.017 * s, 0.013 * s), (0.017 * s, 0.015 * s)):
        R = rot_xyz(0, -14, 0) @ Rt
        sh.add(Torus([0.000, -0.010 * s, z], 0.020 * s, rt, R), 0.006 * s)
    sh.cut(Torus([0.000, -0.010 * s, 0.0], 0.030 * s, 0.009 * s, rot_xyz(0, -14, 0) @ Rt), 0.004 * s)  # groove
    sh.cut(HalfSpace([0.0, -0.034 * s, 0.0], [0.0, -1.0, 0.0]), 0.004 * s)  # flat distal face on the central tarsal
    sh.cut(HalfSpace([0.034 * s, 0.0, 0.0], [1.0, 0.0, 0.0]), 0.006 * s)  # plantar face against the calcaneus
    return sh, fr, 0.0015 * s, 5000


def calcaneus(rig: Rig, side: str):
    fr, s = hock_frame(rig, side)
    sh = Shape()
    # body plantar to the talus, the tuber rising high above it, sustentaculum tali medially
    sh.add(Loft([
        [-0.040 * s, 0.040 * s, 0.006 * s, 0.018 * s, 0.014 * s],
        [-0.005 * s, 0.040 * s, 0.006 * s, 0.020 * s, 0.016 * s],
        [0.040 * s, 0.038 * s, 0.006 * s, 0.016 * s, 0.013 * s],
        [0.075 * s, 0.040 * s, 0.006 * s, 0.018 * s, 0.015 * s],
    ]), 0.008 * s)
    sh.add(Ellipsoid([0.044 * s, 0.084 * s, 0.006 * s], [0.022 * s, 0.018 * s, 0.020 * s]), 0.008 * s)  # tuber calcanei
    sh.add(Ellipsoid([0.020 * s, -0.004 * s, -0.026 * s], [0.016 * s, 0.012 * s, 0.014 * s]), 0.008 * s)  # sustentaculum
    sh.cut(Capsule([0.020 * s, 0.010 * s, -0.040 * s], [0.020 * s, -0.030 * s, -0.040 * s], 0.010 * s), 0.004 * s)  # groove for the DDFT
    sh.cut(HalfSpace([0.0, -0.030 * s, 0.0], [0.0, -1.0, 0.0]), 0.004 * s)
    return sh, fr, 0.0015 * s, 5000


def tarsal_disc(rig: Rig, side: str, c, half, name_cap=2500):
    fr, s = hock_frame(rig, side)
    sh = Shape()
    sh.add(Box(v3(c) * s, v3(half) * s, round=0.004 * s), 0.0)
    return sh, fr, 0.0012 * s, name_cap


def os_tarsi_centrale(rig: Rig, side: str):
    return tarsal_disc(rig, side, [0.000, -0.044, 0.000], [0.026, 0.008, 0.026])


def os_tarsale_III(rig: Rig, side: str):
    return tarsal_disc(rig, side, [-0.004, -0.062, -0.006], [0.024, 0.008, 0.022])


def os_tarsale_IV(rig: Rig, side: str):
    return tarsal_disc(rig, side, [0.012, -0.052, 0.030], [0.016, 0.018, 0.012])


def os_tarsale_I_II(rig: Rig, side: str):
    return tarsal_disc(rig, side, [0.016, -0.062, -0.028], [0.012, 0.007, 0.010], 1500)


# ----------------------------------------------------------------------------- cannon, sesamoids, digit
def cannon(rig: Rig, side: str, hind: bool):
    pre = "hl" if hind else "fl"
    prox = rig.L(f"{pre}_{{S}}_hock" if hind else "fl_{S}_carpus", side)
    dist = rig.L(f"{pre}_{{S}}_fetlock", side)
    fr = limb_frame(prox, dist, side)
    L = float(np.linalg.norm(prox - dist))
    s = rig.H / 1.6
    y0 = L - (0.072 if hind else 0.030) * s  # proximal end below the tarsus / carpus
    sh = Shape()
    rx, rz = (0.018, 0.019) if hind else (0.016, 0.020)
    sh.add(Loft([
        [0.028 * s, 0.000, 0.000, 0.022 * s, 0.026 * s],
        [0.10 * L, 0.002 * s, 0.000, (rx + 0.002) * s, (rz + 0.002) * s],
        [0.50 * L, 0.004 * s, 0.000, rx * s, rz * s],
        [y0 - 0.030 * s, 0.002 * s, 0.000, (rx + 0.004) * s, (rz + 0.005) * s],
        [y0, 0.000, 0.000, (rx + 0.008) * s, (rz + 0.009) * s],
    ]), 0.010 * s)
    sh.cut(HalfSpace([0.0, y0, 0.0], [0.0, 1.0, 0.0]), 0.003 * s)
    # distal condyle with the sagittal ridge, centred on the fetlock landmark
    sh.add(Ellipsoid([0.0, 0.0, 0.0], [0.024 * s, 0.023 * s, 0.030 * s]), 0.006 * s)
    sh.add(Capsule([-0.022 * s, 0.000, 0.000], [0.024 * s, -0.004 * s, 0.000], 0.008 * s, 0.009 * s), 0.004 * s)
    sh.cut(Ellipsoid([0.022 * s, 0.028 * s, 0.000], [0.018 * s, 0.012 * s, 0.018 * s]), 0.004 * s)  # supracondylar fossa (palmar)
    return sh, fr, 0.0018 * s, 5000


def splint(rig: Rig, side: str, hind: bool, medial: bool):
    pre = "hl" if hind else "fl"
    prox = rig.L(f"{pre}_{{S}}_hock" if hind else "fl_{S}_carpus", side)
    dist = rig.L(f"{pre}_{{S}}_fetlock", side)
    fr = limb_frame(prox, dist, side)
    L = float(np.linalg.norm(prox - dist))
    s = rig.H / 1.6
    y0 = L - (0.072 if hind else 0.030) * s
    z = (-1 if medial else 1) * (0.021 if hind else 0.022) * s
    sh = Shape()
    sh.add(Ellipsoid([0.012 * s, y0 - 0.008 * s, z], [0.010 * s, 0.012 * s, 0.007 * s]), 0.004 * s)  # head
    sh.add(Capsule([0.013 * s, y0 - 0.014 * s, z], [0.014 * s, y0 - 0.66 * L, z * 0.9], 0.006 * s, 0.0035 * s), 0.004 * s)
    sh.add(Sphere([0.014 * s, y0 - 0.68 * L, z * 0.9], 0.005 * s), 0.004 * s)  # button
    return sh, fr, 0.0012 * s, 2000


def proximal_sesamoids(rig: Rig, side: str, hind: bool):
    pre = "hl" if hind else "fl"
    prox = rig.L(f"{pre}_{{S}}_hock" if hind else "fl_{S}_carpus", side)
    dist = rig.L(f"{pre}_{{S}}_fetlock", side)
    fr = limb_frame(prox, dist, side)
    s = rig.H / 1.6
    sh = Shape()
    for z in (-0.014 * s, 0.014 * s):
        c = v3([0.028 * s, 0.000, z])
        sh.add(Box(c, [0.008 * s, 0.016 * s, 0.010 * s], rot_xyz(0, 0, 15 * (-1 if z > 0 else 1)) @ rot_xyz(0, 0, 0), round=0.005 * s), 0.0)
    return sh, fr, 0.0012 * s, 3000


def digit_frames(rig: Rig, side: str, hind: bool):
    pre = "hl" if hind else "fl"
    fet = rig.L(f"{pre}_{{S}}_fetlock", side)
    pas = rig.L(f"{pre}_{{S}}_pastern", side)
    hoof = rig.L(f"{pre}_{{S}}_hoof", side)
    coffin = (pas + hoof) * 0.5
    return (limb_frame(fet, pas, side), float(np.linalg.norm(fet - pas))), (limb_frame(pas, coffin, side), float(np.linalg.norm(pas - coffin))), (limb_frame(coffin, hoof, side), float(np.linalg.norm(coffin - hoof)))


def phalanx1(rig: Rig, side: str, hind: bool):
    (fr, L), _, _ = digit_frames(rig, side, hind)
    s = rig.H / 1.6
    sh = Shape()
    y1 = L - 0.022 * s  # below the cannon condyle
    sh.add(Loft([
        [0.004 * s, 0.000, 0.000, 0.019 * s, 0.026 * s],
        [0.25 * L, 0.002 * s, 0.000, 0.017 * s, 0.022 * s],
        [0.70 * L, 0.004 * s, 0.000, 0.019 * s, 0.025 * s],
        [y1, 0.004 * s, 0.000, 0.024 * s, 0.031 * s],
    ]), 0.008 * s)
    sh.cut(Sphere([0.0, L, 0.0], 0.0245 * s), 0.003 * s)  # proximal socket around the cannon condyle
    sh.cut(Capsule([-0.03 * s, y1 - 0.004 * s, 0.0], [0.03 * s, y1 - 0.004 * s, 0.0], 0.007 * s), 0.002 * s)  # sagittal groove
    # distal trochlea: two condyles with a shallow groove
    for z in (-0.012 * s, 0.012 * s):
        sh.add(Ellipsoid([0.002 * s, 0.004 * s, z], [0.017 * s, 0.014 * s, 0.014 * s]), 0.006 * s)
    sh.cut(HalfSpace([0.0, -0.010 * s, 0.0], [0.0, -1.0, 0.0]), 0.004 * s)
    return sh, fr, 0.0014 * s, 5000


def phalanx2(rig: Rig, side: str, hind: bool):
    _, (fr, L), _ = digit_frames(rig, side, hind)
    s = rig.H / 1.6
    sh = Shape()
    sh.add(Loft([
        [0.004 * s, 0.000, 0.000, 0.021 * s, 0.027 * s],
        [0.5 * L, 0.003 * s, 0.000, 0.019 * s, 0.025 * s],
        [L - 0.004 * s, 0.004 * s, 0.000, 0.022 * s, 0.030 * s],
    ]), 0.006 * s)
    sh.cut(Sphere([0.0, L + 0.006 * s, 0.0], 0.018 * s), 0.003 * s)  # proximal concavity
    for z in (-0.012 * s, 0.012 * s):
        sh.add(Ellipsoid([0.002 * s, 0.004 * s, z], [0.018 * s, 0.013 * s, 0.015 * s]), 0.006 * s)
    sh.cut(HalfSpace([0.0, -0.009 * s, 0.0], [0.0, -1.0, 0.0]), 0.004 * s)
    return sh, fr, 0.0014 * s, 4000


def phalanx3(rig: Rig, side: str, hind: bool):
    pre = "hl" if hind else "fl"
    hoof = rig.L(f"{pre}_{{S}}_hoof", side)
    pas = rig.L(f"{pre}_{{S}}_pastern", side)
    fr = side_frame(hoof, side)
    s = rig.H / 1.6
    j = fr.to_local((pas + hoof) * 0.5)  # coffin joint centre
    ang = 50.0 if not hind else 54.0  # parietal surface angle to the ground
    sh = Shape()
    sole = 0.012 * s
    sh.add(Ellipsoid([j[0] + 0.004 * s, sole + 0.020 * s, 0.0], [0.054 * s, 0.034 * s, 0.046 * s]), 0.008 * s)
    for z in (-0.036 * s, 0.036 * s):
        sh.add(Capsule([j[0] + 0.024 * s, sole + 0.012 * s, z], [j[0] + 0.052 * s, sole + 0.020 * s, z * 0.9], 0.011 * s, 0.007 * s), 0.008 * s)  # palmar processes
    sh.add(Ellipsoid([j[0] - 0.010 * s, j[1] + 0.004 * s, 0.0], [0.012 * s, 0.014 * s, 0.013 * s]), 0.006 * s)  # extensor process
    sh.cut(Sphere([j[0], j[1] + 0.006 * s, 0.0], 0.021 * s), 0.004 * s)  # articular concavity for P2
    sh.cut(HalfSpace([0.0, sole, 0.0], [0.0, -1.0, 0.0]), 0.003 * s)  # solar surface
    a = np.radians(ang)
    toe = v3([j[0] - 0.058 * s, sole, 0.0])
    sh.cut(HalfSpace(toe, [-np.sin(a), np.cos(a), 0.0]), 0.004 * s)  # straight parietal (dorsal) surface
    sh.cut(Ellipsoid([j[0] + 0.010 * s, sole - 0.016 * s, 0.0], [0.034 * s, 0.022 * s, 0.030 * s]), 0.006 * s)  # concave sole
    sh.cut(Ellipsoid([j[0] + 0.040 * s, j[1] - 0.004 * s, 0.0], [0.018 * s, 0.016 * s, 0.024 * s]), 0.006 * s)  # flexor surface
    return sh, fr, 0.0014 * s, 4500


def navicular(rig: Rig, side: str, hind: bool):
    pre = "hl" if hind else "fl"
    hoof = rig.L(f"{pre}_{{S}}_hoof", side)
    pas = rig.L(f"{pre}_{{S}}_pastern", side)
    fr = side_frame(hoof, side)
    s = rig.H / 1.6
    j = fr.to_local((pas + hoof) * 0.5)
    sh = Shape()
    sh.add(Box([j[0] + 0.030 * s, j[1] - 0.004 * s, 0.0], [0.006 * s, 0.010 * s, 0.026 * s], rot_xyz(0, 0, 30), round=0.004 * s), 0.0)
    return sh, fr, 0.0012 * s, 1500


# ----------------------------------------------------------------------------- pelvis
def os_coxae(rig: Rig, side: str):
    hip = rig.L("hl_{S}_hip", side)
    fr = side_frame(hip, side)
    s = rig.H / 1.6
    tc = fr.to_local(rig.L("hl_{S}_tuber_coxae", side))
    ti = fr.to_local(rig.L("hl_{S}_tuber_ischii", side))
    sac = rig.L("sacrum")
    lat = 1.0 if side == "L" else -1.0
    ts = fr.to_local(v3([sac[0] - 0.02 * s, rig.params["spine"]["croupTop"] - 0.035 * s, 0.05 * s * lat]))  # tuber sacrale
    zm = fr.to_local(v3([hip[0], hip[1], 0.0]))[2]  # midline in local z (negative = medial)
    sh = Shape()
    # wing of the ilium: thick triangular plate between tuber coxae, tuber sacrale and the body
    corner = v3([-0.03 * s, 0.09 * s, 0.02 * s])
    u = (ts - tc) / np.linalg.norm(ts - tc)
    n = np.cross(u, corner - tc)
    n = n / np.linalg.norm(n)
    R = np.column_stack([u, np.cross(n, u), n])
    pts2 = [(R.T @ (p - tc))[:2] for p in (tc, ts, corner + v3([0.04 * s, 0.02 * s, 0.0]), corner)]
    sh.add(Plate(pts2, [0.012 * s, 0.010 * s, 0.014 * s, 0.016 * s], c=tc, R=R, round=0.014 * s), 0.018 * s)
    sh.cut(Sphere(tc * 0.4 + ts * 0.4 + corner * 0.2 + n * 0.11 * s, 0.10 * s), 0.012 * s)  # concave gluteal surface
    sh.add(Capsule(tc, ts, 0.016 * s, 0.013 * s), 0.012 * s)  # iliac crest
    sh.add(Ellipsoid(tc, [0.034 * s, 0.024 * s, 0.022 * s]), 0.012 * s)  # tuber coxae
    sh.add(Ellipsoid(ts, [0.022 * s, 0.022 * s, 0.016 * s]), 0.012 * s)  # tuber sacrale
    # body of the ilium to the acetabulum; ischiatic spine along the dorsal border
    sh.add(Capsule(corner, [0.0, 0.03 * s, 0.0], 0.028 * s, 0.036 * s), 0.016 * s)
    sh.add(Capsule([0.0, 0.040 * s, -0.012 * s], [0.08 * s, 0.050 * s, -0.016 * s], 0.014 * s, 0.011 * s), 0.012 * s)
    # acetabulum: socket open latero-ventrally
    sh.add(Sphere([0.0, 0.0, 0.0], 0.048 * s), 0.010 * s)
    sh.cut(Sphere([0.004 * s, -0.006 * s, 0.024 * s], 0.037 * s), 0.004 * s)
    # pelvic floor: ischium and pubis as one horizontal plate with the obturator foramen
    yf = -0.055 * s
    outline = [
        (-0.010 * s, zm), (-0.015 * s, -0.010 * s), (0.010 * s, 0.040 * s), (ti[0] - 0.02 * s, ti[2] + 0.015 * s),
        (ti[0] + 0.030 * s, ti[2] - 0.010 * s), (ti[0] + 0.010 * s, ti[2] - 0.060 * s), (ti[0] - 0.030 * s, zm),
    ]
    Rf = np.column_stack([v3([1.0, 0.0, 0.0]), v3([0.0, 0.0, 1.0]), v3([0.0, 1.0, 0.0])])  # plate x/y → local x/z, thickness along y
    sh.add(Plate(outline, 0.009 * s, c=v3([0.0, yf, 0.0]), R=Rf, round=0.010 * s), 0.014 * s)
    sh.cut(Capsule([0.075 * s, yf - 0.05 * s, zm * 0.45], [0.075 * s, yf + 0.05 * s, zm * 0.45], 0.028 * s), 0.004 * s)  # obturator foramen
    sh.add(Ellipsoid(ti, [0.036 * s, 0.026 * s, 0.022 * s], rot_xyz(0, 0, -15)), 0.014 * s)  # tuber ischii
    sh.add(Capsule([0.02 * s, 0.0, 0.010 * s], ti, 0.022 * s, 0.018 * s), 0.014 * s)  # body of the ischium
    sh.add(Capsule([-0.004 * s, -0.040 * s, -0.012 * s], [-0.004 * s, yf, zm], 0.016 * s, 0.013 * s), 0.012 * s)  # pubis
    sh.add(Capsule([-0.004 * s, yf, zm], [ti[0] - 0.03 * s, yf + 0.01 * s, zm], 0.011 * s, 0.011 * s), 0.010 * s)  # symphysis
    return sh, fr, 0.0028 * s, 11000


# ----------------------------------------------------------------------------- registry
def bones(rig: Rig):
    out = []
    for side in SIDES:
        items = [
            ("os_coxae", os_coxae(rig, side)),
            ("femur", femur(rig, side)),
            ("patella", patella(rig, side)),
            ("tibia", tibia(rig, side)),
            ("fibula", fibula(rig, side)),
            ("talus", talus(rig, side)),
            ("calcaneus", calcaneus(rig, side)),
            ("os_tarsi_centrale", os_tarsi_centrale(rig, side)),
            ("os_tarsale_III", os_tarsale_III(rig, side)),
            ("os_tarsale_IV", os_tarsale_IV(rig, side)),
            ("os_tarsale_I_II", os_tarsale_I_II(rig, side)),
            ("ossa_metatarsalia", cannon(rig, side, True)),
            ("os_metatarsale_II", splint(rig, side, True, True)),
            ("os_metatarsale_IV", splint(rig, side, True, False)),
            ("ossa_sesamoidea_proximalia_hl", proximal_sesamoids(rig, side, True)),
            ("os_compedale_hl", phalanx1(rig, side, True)),
            ("os_coronale_hl", phalanx2(rig, side, True)),
            ("os_ungulare_hl", phalanx3(rig, side, True)),
            ("os_sesamoideum_distale_hl", navicular(rig, side, True)),
        ]
        for key, (sh, fr, voxel, cap) in items:
            out.append((f"{key}_{side}", f"{key}_{side}", sh, fr, voxel, cap))
    return out
