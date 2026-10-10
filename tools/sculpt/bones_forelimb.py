"""Forelimb bones of the horse: scapula, humerus, radius, ulna, carpus, metacarpus, digit."""
from __future__ import annotations

import numpy as np

from bones_hindlimb import cannon, navicular, phalanx1, phalanx2, phalanx3, proximal_sesamoids, splint
from frames import Frame, Rig, limb_frame
from sdf import Box, Capsule, Ellipsoid, HalfSpace, Loft, Plate, Shape, Sphere, rot_xyz, rot_y_to, v3

SIDES = ("L", "R")


def scapula(rig: Rig, side: str):
    top = rig.L("fl_{S}_scapula_top", side)
    shoulder = rig.L("fl_{S}_shoulder", side)
    fr = limb_frame(top, shoulder, side)
    L = float(np.linalg.norm(top - shoulder))
    s = rig.H / 1.6
    yb = 0.90 * L  # dorsal border of the bone; the scapular cartilage continues above it
    sh = Shape()
    # blade: thin in the fossae, thick along the borders and at the neck
    outline = [
        (-0.030 * s, 0.050 * s), (0.034 * s, 0.050 * s), (0.048 * s, 0.10 * s), (0.070 * s, 0.22 * L), (0.100 * s, 0.45 * L), (0.130 * s, 0.70 * L),
        (0.145 * s, yb - 0.035 * s), (0.130 * s, yb - 0.006 * s), (0.080 * s, yb + 0.006 * s), (0.000, yb + 0.010 * s), (-0.070 * s, yb + 0.002 * s),
        (-0.105 * s, yb - 0.025 * s), (-0.112 * s, 0.70 * L), (-0.095 * s, 0.45 * L), (-0.072 * s, 0.25 * L), (-0.050 * s, 0.12 * s),
    ]
    thick = [0.016 * s, 0.016 * s, 0.013 * s, 0.010 * s, 0.008 * s, 0.007 * s, 0.007 * s, 0.006 * s, 0.006 * s, 0.006 * s, 0.006 * s, 0.007 * s, 0.008 * s, 0.009 * s, 0.010 * s, 0.013 * s]
    sh.add(Plate(outline, thick, round=0.004 * s), 0.010 * s)
    # fossae: supraspinous (cranial third) and infraspinous (caudal two thirds) hollowed on the lateral face
    sh.cut(Ellipsoid([-0.060 * s, 0.56 * L, 0.030 * s], [0.040 * s, 0.22 * L, 0.024 * s]), 0.010 * s)
    sh.cut(Ellipsoid([0.050 * s, 0.56 * L, 0.034 * s], [0.070 * s, 0.24 * L, 0.028 * s]), 0.010 * s)
    sh.cut(Ellipsoid([0.000, 0.56 * L, -0.034 * s], [0.090 * s, 0.24 * L, 0.028 * s]), 0.010 * s)  # subscapular fossa
    # spine with the tuber spinae; no acromion in the horse
    sh.add(Capsule([-0.010 * s, 0.15 * s, 0.014 * s], [-0.032 * s, yb - 0.03 * s, 0.016 * s], 0.009 * s, 0.010 * s), 0.008 * s)
    sh.add(Ellipsoid([-0.016 * s, 0.50 * L, 0.030 * s], [0.030 * s, 0.050 * s, 0.014 * s]), 0.012 * s)
    # neck and glenoid cavity (shallow, over the humeral head), supraglenoid tubercle, coracoid process
    sh.add(Ellipsoid([0.000, 0.060 * s, 0.000], [0.038 * s, 0.030 * s, 0.034 * s]), 0.010 * s)
    sh.cut(Sphere([0.000, 0.000, 0.000], 0.047 * s), 0.004 * s)
    sh.add(Ellipsoid([-0.048 * s, 0.075 * s, 0.000], [0.024 * s, 0.022 * s, 0.020 * s]), 0.010 * s)
    sh.add(Ellipsoid([-0.040 * s, 0.085 * s, -0.024 * s], [0.012 * s, 0.012 * s, 0.010 * s]), 0.008 * s)
    return sh, fr, 0.0024 * s, 10000


def humerus(rig: Rig, side: str):
    shoulder = rig.L("fl_{S}_shoulder", side)
    elbow = rig.L("fl_{S}_elbow", side)
    fr = limb_frame(shoulder, elbow, side)
    L = float(np.linalg.norm(shoulder - elbow))
    s = L / 0.35
    sh = Shape()
    # shaft: twisted, oval; the proximal part broad
    sh.add(Loft([
        [0.024 * s, 0.000, 0.000, 0.036 * s, 0.050 * s],
        [0.075 * s, -0.004 * s, 0.000, 0.034 * s, 0.040 * s],
        [0.25 * L, -0.006 * s, 0.000, 0.028 * s, 0.030 * s],
        [0.50 * L, -0.004 * s, 0.002 * s, 0.025 * s, 0.028 * s],
        [0.72 * L, -0.008 * s, 0.004 * s, 0.032 * s, 0.034 * s],
        [0.86 * L, -0.014 * s, 0.004 * s, 0.040 * s, 0.040 * s],
        [0.93 * L, -0.012 * s, 0.000, 0.040 * s, 0.042 * s],
    ]), 0.012 * s)
    # head (caudo-dorsal hemisphere centred on the shoulder landmark) and neck
    sh.add(Ellipsoid([-0.022 * s, L - 0.030 * s, 0.000], [0.052 * s, 0.040 * s, 0.050 * s]), 0.014 * s)  # proximal block
    sh.add(Sphere([0.008 * s, L - 0.004 * s, 0.000], 0.044 * s), 0.010 * s)
    sh.cut(HalfSpace([-0.034 * s, L, 0.0], [-1.0, 0.45, 0.0]), 0.010 * s)  # the head faces caudo-dorsally
    # greater tubercle (lateral, cranial and caudal parts), lesser tubercle (medial), intermediate tubercle in the groove
    sh.add(Ellipsoid([-0.050 * s, L + 0.018 * s, 0.030 * s], [0.030 * s, 0.036 * s, 0.026 * s]), 0.014 * s)
    sh.add(Ellipsoid([-0.016 * s, L + 0.010 * s, 0.050 * s], [0.024 * s, 0.030 * s, 0.018 * s]), 0.014 * s)
    sh.add(Ellipsoid([-0.046 * s, L + 0.002 * s, -0.034 * s], [0.026 * s, 0.030 * s, 0.022 * s]), 0.014 * s)
    sh.add(Ellipsoid([-0.018 * s, L + 0.000 * s, -0.050 * s], [0.022 * s, 0.026 * s, 0.014 * s]), 0.014 * s)
    sh.cut(Capsule([-0.094 * s, L + 0.050 * s, -0.002 * s], [-0.080 * s, L - 0.070 * s, -0.002 * s], 0.017 * s), 0.006 * s)  # intertubercular groove
    sh.add(Sphere([-0.066 * s, L - 0.012 * s, -0.002 * s], 0.012 * s), 0.006 * s)  # intermediate tubercle
    # deltoid tuberosity with the humeral crest, teres major tuberosity, musculospiral groove
    sh.add(Ellipsoid([-0.012 * s, 0.60 * L, 0.040 * s], [0.022 * s, 0.034 * s, 0.014 * s], rot_xyz(0, 0, -20)), 0.014 * s)
    sh.add(Capsule([-0.016 * s, 0.62 * L, 0.036 * s], [-0.034 * s, 0.90 * L, 0.040 * s], 0.009 * s, 0.008 * s), 0.012 * s)
    sh.add(Ellipsoid([0.008 * s, 0.62 * L, -0.030 * s], [0.014 * s, 0.022 * s, 0.009 * s]), 0.010 * s)
    sh.cut(Capsule([-0.040 * s, 0.56 * L, 0.040 * s], [-0.048 * s, 0.30 * L, 0.004 * s], 0.016 * s, 0.014 * s), 0.008 * s)
    # distal end: condyle (trochlea medial, capitulum lateral) centred on the elbow landmark, epicondyles, fossae
    Rz = rot_y_to([0.0, 0.0, 1.0])
    sh.add(Loft([
        [-0.046 * s, 0.000, 0.000, 0.030 * s, 0.030 * s],
        [-0.014 * s, 0.000, 0.000, 0.028 * s, 0.028 * s],
        [0.000, 0.000, 0.000, 0.023 * s, 0.023 * s],
        [0.014 * s, 0.000, 0.000, 0.027 * s, 0.027 * s],
        [0.042 * s, 0.000, 0.000, 0.026 * s, 0.026 * s],
    ], R=Rz), 0.008 * s)
    sh.add(Ellipsoid([0.014 * s, 0.034 * s, -0.052 * s], [0.022 * s, 0.024 * s, 0.012 * s]), 0.010 * s)
    sh.add(Ellipsoid([0.012 * s, 0.032 * s, 0.050 * s], [0.018 * s, 0.020 * s, 0.010 * s]), 0.010 * s)
    sh.cut(Ellipsoid([0.038 * s, 0.040 * s, 0.000], [0.022 * s, 0.032 * s, 0.018 * s]), 0.006 * s)  # olecranon fossa
    sh.cut(Ellipsoid([-0.040 * s, 0.040 * s, -0.004 * s], [0.014 * s, 0.018 * s, 0.016 * s]), 0.006 * s)  # radial fossa
    return sh, fr, 0.0022 * s, 10000


def radius(rig: Rig, side: str):
    elbow = rig.L("fl_{S}_elbow", side)
    carpus = rig.L("fl_{S}_carpus", side)
    fr = limb_frame(elbow, carpus, side)
    L = float(np.linalg.norm(elbow - carpus))
    s = rig.H / 1.6
    top = L - 0.030 * s  # below the humeral condyle
    bottom = 0.028 * s  # above the proximal carpal row
    sh = Shape()
    sh.add(Loft([
        [bottom, 0.000, 0.000, 0.028 * s, 0.044 * s],
        [bottom + 0.030 * s, -0.002 * s, 0.000, 0.024 * s, 0.038 * s],
        [0.35 * L, -0.006 * s, 0.000, 0.019 * s, 0.032 * s],
        [0.60 * L, -0.008 * s, 0.000, 0.019 * s, 0.033 * s],
        [top - 0.045 * s, -0.004 * s, 0.000, 0.026 * s, 0.040 * s],
        [top - 0.012 * s, 0.000, 0.000, 0.030 * s, 0.046 * s],
        [top, 0.000, 0.000, 0.028 * s, 0.045 * s],
    ]), 0.010 * s)
    # proximal articular surface (fovea) wraps the humeral condyle; radial tuberosity medially
    sh.cut(Capsule([0.0, L, -0.06 * s], [0.0, L, 0.06 * s], 0.0325 * s), 0.004 * s)
    sh.add(Ellipsoid([-0.012 * s, top - 0.070 * s, -0.030 * s], [0.014 * s, 0.022 * s, 0.010 * s]), 0.010 * s)
    # distal end: styloid processes and the extensor grooves on the cranial face
    sh.add(Ellipsoid([0.000, bottom + 0.014 * s, -0.040 * s], [0.018 * s, 0.022 * s, 0.012 * s]), 0.008 * s)
    sh.add(Ellipsoid([0.004 * s, bottom + 0.014 * s, 0.042 * s], [0.016 * s, 0.020 * s, 0.010 * s]), 0.008 * s)
    for z in (-0.022 * s, -0.002 * s, 0.020 * s):
        sh.cut(Capsule([-0.034 * s, bottom + 0.060 * s, z], [-0.030 * s, bottom - 0.010 * s, z], 0.006 * s), 0.003 * s)
    sh.cut(HalfSpace([0.0, bottom - 0.002 * s, 0.0], [0.0, -1.0, 0.0]), 0.004 * s)
    return sh, fr, 0.0022 * s, 9000


def ulna(rig: Rig, side: str):
    elbow = rig.L("fl_{S}_elbow", side)
    carpus = rig.L("fl_{S}_carpus", side)
    fr = limb_frame(elbow, carpus, side)
    L = float(np.linalg.norm(elbow - carpus))
    s = rig.H / 1.6
    sh = Shape()
    # olecranon with the tuber, anconeal process, trochlear notch around the humeral condyle
    sh.add(Capsule([0.092 * s, L + 0.070 * s, 0.000], [0.050 * s, L - 0.030 * s, 0.000], 0.026 * s, 0.022 * s), 0.012 * s)
    sh.add(Ellipsoid([0.094 * s, L + 0.080 * s, 0.000], [0.028 * s, 0.030 * s, 0.022 * s]), 0.012 * s)
    sh.add(Ellipsoid([0.036 * s, L + 0.046 * s, 0.000], [0.030 * s, 0.018 * s, 0.022 * s]), 0.012 * s)
    sh.cut(Capsule([0.0, L, -0.06 * s], [0.0, L, 0.06 * s], 0.034 * s), 0.004 * s)
    # body: triangular, lying caudal to the radius, interosseous space proximally, fused to the radius below
    sh.add(Loft([
        [0.30 * L, 0.020 * s, 0.000, 0.006 * s, 0.009 * s],
        [0.55 * L, 0.024 * s, 0.000, 0.009 * s, 0.014 * s],
        [0.80 * L, 0.034 * s, 0.000, 0.014 * s, 0.020 * s],
        [L - 0.040 * s, 0.046 * s, 0.000, 0.020 * s, 0.022 * s],
    ]), 0.010 * s)
    sh.add(Capsule([0.028 * s, 0.32 * L, 0.004 * s], [0.004 * s, 0.040 * s, 0.040 * s], 0.005 * s, 0.006 * s), 0.006 * s)  # distal remnant to the lateral styloid
    return sh, fr, 0.0020 * s, 5000


def carpus_frame(rig: Rig, side: str) -> tuple[Frame, float]:
    carpus = rig.L("fl_{S}_carpus", side)
    fetlock = rig.L("fl_{S}_fetlock", side)
    fr = limb_frame(carpus, fetlock, side)
    fr.origin = carpus.copy()
    return fr, rig.H / 1.6


def carpal(rig: Rig, side: str, c, half, dome=0.0, cap=2500):
    fr, s = carpus_frame(rig, side)
    sh = Shape()
    sh.add(Box(v3(c) * s, v3(half) * s, round=0.004 * s), 0.0)
    if dome:
        sh.add(Ellipsoid((v3(c) + v3([0.0, half[1], 0.0])) * s, [half[0] * s, dome * s, half[2] * s]), 0.004 * s)
    return sh, fr, 0.0012 * s, cap


def os_carpi_radiale(rig, side):
    return carpal(rig, side, [0.000, 0.013, -0.022], [0.017, 0.012, 0.011], dome=0.006)


def os_carpi_intermedium(rig, side):
    return carpal(rig, side, [0.000, 0.013, 0.001], [0.016, 0.012, 0.010], dome=0.006)


def os_carpi_ulnare(rig, side):
    return carpal(rig, side, [0.002, 0.012, 0.022], [0.014, 0.011, 0.009], dome=0.005)


def os_carpi_accessorium(rig: Rig, side: str):
    fr, s = carpus_frame(rig, side)
    sh = Shape()
    sh.add(Box([0.040 * s, 0.012 * s, 0.014 * s], [0.012 * s, 0.021 * s, 0.009 * s], rot_xyz(0, 0, 10), round=0.005 * s), 0.0)
    sh.cut(Capsule([0.040 * s, 0.040 * s, 0.026 * s], [0.040 * s, -0.020 * s, 0.026 * s], 0.007 * s), 0.003 * s)  # groove for the lateral flexor tendon
    return sh, fr, 0.0012 * s, 2500


def os_carpale_secundum(rig, side):
    return carpal(rig, side, [0.004, -0.013, -0.030], [0.012, 0.009, 0.008], cap=1500)


def os_carpale_tertium(rig, side):
    return carpal(rig, side, [0.000, -0.013, -0.005], [0.019, 0.011, 0.024], cap=3000)


def os_carpale_quartum(rig, side):
    return carpal(rig, side, [0.004, -0.013, 0.027], [0.015, 0.011, 0.012], cap=2000)


def bones(rig: Rig):
    out = []
    for side in SIDES:
        items = [
            ("scapula", scapula(rig, side)),
            ("humerus", humerus(rig, side)),
            ("radius", radius(rig, side)),
            ("ulna", ulna(rig, side)),
            ("os_carpi_radiale", os_carpi_radiale(rig, side)),
            ("os_carpi_intermedium", os_carpi_intermedium(rig, side)),
            ("os_carpi_ulnare", os_carpi_ulnare(rig, side)),
            ("os_carpi_accessorium", os_carpi_accessorium(rig, side)),
            ("os_carpale_secundum", os_carpale_secundum(rig, side)),
            ("os_carpale_tertium", os_carpale_tertium(rig, side)),
            ("os_carpale_quartum", os_carpale_quartum(rig, side)),
            ("ossa_metacarpalia", cannon(rig, side, False)),
            ("os_metacarpale_II", splint(rig, side, False, True)),
            ("os_metacarpale_IV", splint(rig, side, False, False)),
            ("ossa_sesamoidea_proximalia_fl", proximal_sesamoids(rig, side, False)),
            ("os_compedale_fl", phalanx1(rig, side, False)),
            ("os_coronale_fl", phalanx2(rig, side, False)),
            ("os_ungulare_fl", phalanx3(rig, side, False)),
            ("os_sesamoideum_distale_fl", navicular(rig, side, False)),
        ]
        for key, (sh, fr, voxel, cap) in items:
            out.append((f"{key}_{side}", f"{key}_{side}", sh, fr, voxel, cap))
    return out
