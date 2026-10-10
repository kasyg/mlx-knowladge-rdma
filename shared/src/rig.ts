/**
 * Species rig: converts the compact per-species parameters into a dense set of
 * named anatomical landmarks (world coordinates, metres).
 *
 * Coordinate system: the animal stands on y = 0, faces -x (cranial = -x,
 * caudal = +x), +y is dorsal, +z is the animal's LEFT side.
 */
import type { PointRef, RigParams, Side, TrunkSection, HeadSection, XY } from './types.ts';

export type V3 = [number, number, number];

export interface SpinePoint {
  p: V3;
  /** height of the spinous process (m) */
  spine: number;
  /** half width of the transverse processes (m) */
  trans: number;
  /** body radius (m) */
  r: number;
}

export interface Rig {
  H: number;
  params: RigParams;
  landmarks: Record<string, V3>;
  spine: {
    cervical: SpinePoint[];
    thoracic: SpinePoint[];
    lumbar: SpinePoint[];
    sacral: SpinePoint[];
    caudal: SpinePoint[];
  };
  /** interpolated skin cross-section of the trunk at x */
  trunkSection: (x: number) => TrunkSection;
  trunkRange: { xMin: number; xMax: number };
  head: { origin: V3; dir: V3; up: V3; length: number; section: (t: number) => HeadSection };
  neck: { point: (t: number) => V3; tangent: (t: number) => V3; section: (t: number) => HeadSection; length: number };
  tail: { point: (t: number) => V3; tangent: (t: number) => V3 };
}

const v = (x: number, y: number, z = 0): V3 => [x, y, z];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function bezier2(p0: XY, p1: XY, p2: XY, t: number): V3 {
  const u = 1 - t;
  return [u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y, 0];
}
function bezier2Tangent(p0: XY, p1: XY, p2: XY, t: number): V3 {
  return norm([2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x), 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y), 0]);
}
function bezier3(p0: XY, p1: XY, p2: XY, p3: XY, t: number): V3 {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return [a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y, 0];
}

/** Catmull-Rom style interpolation of section parameters along x. */
function interpSections(sections: TrunkSection[], x: number): TrunkSection {
  const s = sections;
  if (x <= s[0].x) return { ...s[0], x };
  if (x >= s[s.length - 1].x) return { ...s[s.length - 1], x };
  let i = 0;
  while (i < s.length - 2 && x > s[i + 1].x) i++;
  const a = s[i],
    b = s[i + 1];
  const t = (x - a.x) / (b.x - a.x);
  // smooth (Hermite) blend with neighbour-aware tangents for a rounder body
  const tt = t * t * (3 - 2 * t);
  const pick = (k: keyof TrunkSection, def = 0) => lerp((a[k] as number) ?? def, (b[k] as number) ?? def, tt);
  return {
    x,
    top: pick('top'),
    bottom: pick('bottom'),
    w: pick('w'),
    n: lerp(a.n ?? 2.2, b.n ?? 2.2, tt),
    pear: lerp(a.pear ?? 0.1, b.pear ?? 0.1, tt),
  };
}

function interpHead(sections: HeadSection[], t: number): HeadSection {
  const s = sections;
  if (t <= s[0].t) return { ...s[0], t };
  if (t >= s[s.length - 1].t) return { ...s[s.length - 1], t };
  let i = 0;
  while (i < s.length - 2 && t > s[i + 1].t) i++;
  const a = s[i],
    b = s[i + 1];
  const u = (t - a.t) / (b.t - a.t);
  const uu = u * u * (3 - 2 * u);
  return {
    t,
    w: lerp(a.w, b.w, uu),
    h: lerp(a.h, b.h, uu),
    yOff: lerp(a.yOff ?? 0, b.yOff ?? 0, uu),
    n: lerp(a.n ?? 2, b.n ?? 2, uu),
  };
}

export function buildRig(params: RigParams): Rig {
  const H = params.H;
  const L: Record<string, V3> = {};
  const P = params;

  // ---------------------------------------------------------------- spine
  const { t1, tLast, lLast, sacrumEnd, bow } = P.spine;
  const nT = P.counts.thoracic;
  const nL = P.counts.lumbar;
  const thoracic: SpinePoint[] = [];
  for (let i = 0; i < nT; i++) {
    const s = nT === 1 ? 0 : i / (nT - 1);
    const y = lerp(t1.y, tLast.y, s) + bow * 4 * s * (1 - s);
    const x = lerp(t1.x, tLast.x, s);
    const withersProfile = Math.max(0, 1 - Math.abs(i - 2) / 9);
    const spineH = P.spine.spineHeights.thoracic * (0.45 + 0.55 * withersProfile);
    thoracic.push({ p: v(x, y), spine: spineH, trans: 0.045 * H, r: 0.03 * H });
    L[`t${i + 1}`] = v(x, y);
  }
  const lumbar: SpinePoint[] = [];
  for (let i = 0; i < nL; i++) {
    const s = (i + 1) / (nL + 1);
    const x = lerp(tLast.x, lLast.x, s);
    const y = lerp(tLast.y, lLast.y, s);
    lumbar.push({ p: v(x, y), spine: P.spine.spineHeights.lumbar, trans: 0.1 * H, r: 0.033 * H });
    L[`l${i + 1}`] = v(x, y);
  }
  const sacral: SpinePoint[] = [];
  const nS = P.counts.sacral;
  for (let i = 0; i < nS; i++) {
    const s = (i + 0.5) / nS;
    const x = lerp(lLast.x, sacrumEnd.x, s);
    const y = lerp(lLast.y, sacrumEnd.y, s);
    sacral.push({ p: v(x, y), spine: P.spine.spineHeights.sacral * (1 - 0.5 * s), trans: 0.08 * H * (1 - 0.6 * s), r: 0.028 * H });
  }
  L.l_last = v(lLast.x, lLast.y);
  const thAt = (f: number) => thoracic[Math.min(nT - 1, Math.round(f * (nT - 1)))].p;
  L.thoracic_q1 = thAt(0.25);
  L.thoracic_mid = thAt(0.5);
  L.thoracic_q3 = thAt(0.75);
  const luAt = (f: number) => lumbar[Math.min(nL - 1, Math.round(f * (nL - 1)))].p;
  L.lumbar_q1 = luAt(0.2);
  L.lumbar_mid = luAt(0.5);
  L.lumbar_q3 = luAt(0.8);
  L.t_last = v(tLast.x, tLast.y);
  L.sacrum = v(lerp(lLast.x, sacrumEnd.x, 0.5), lerp(lLast.y, sacrumEnd.y, 0.5));
  L.sacrum_end = v(sacrumEnd.x, sacrumEnd.y);
  L.tail_base = v(sacrumEnd.x, sacrumEnd.y);

  // tail: cubic bezier
  const tailPt = (t: number): V3 => bezier3(P.tail.base, P.tail.ctrl[0], P.tail.ctrl[1] ?? P.tail.ctrl[0], P.tail.tip, t);
  const tailTan = (t: number): V3 => {
    const e = 0.01;
    return norm(sub(tailPt(Math.min(1, t + e)), tailPt(Math.max(0, t - e))));
  };
  const caudal: SpinePoint[] = [];
  const nC = P.counts.caudal;
  for (let i = 0; i < nC; i++) {
    const t = (i + 0.5) / nC;
    caudal.push({ p: tailPt(t), spine: 0.012 * H * (1 - t), trans: 0.02 * H * (1 - t), r: P.tail.r0 * (1 - 0.75 * t) });
    L[`tail_${i + 1}`] = tailPt(t);
  }
  L.tail_mid = tailPt(0.5);
  L.tail_tip = tailPt(1);
  L.tail_quarter = tailPt(0.25);

  // withers / croup
  L.withers = v(thoracic[Math.min(2, nT - 1)].p[0], P.spine.withersTop);
  thoracic.forEach((sp, i) => (L[`t${i + 1}_tip`] = v(sp.p[0], sp.p[1] + sp.spine)));
  lumbar.forEach((sp, i) => (L[`l${i + 1}_tip`] = v(sp.p[0], sp.p[1] + sp.spine)));
  L.withers_tip = L[`t${Math.min(3, nT)}_tip`];
  L.thoracic_mid_tip = L[`t${Math.max(1, Math.round(nT / 2))}_tip`];
  L.t_last_tip = L[`t${nT}_tip`];
  L.lumbar_mid_tip = L[`l${Math.max(1, Math.round(nL / 2))}_tip`];
  L.l_last_tip = L[`l${nL}_tip`];
  L.sacrum_tip = v(L.sacrum[0], L.sacrum[1] + sacral[0].spine);
  L.croup = v(L.sacrum[0], P.spine.croupTop);
  L.back_mid = v(lerp(t1.x, lLast.x, 0.55), lerp(P.spine.withersTop, P.spine.croupTop, 0.5) - 0.03 * H);

  // ----------------------------------------------------------------- neck
  const nb = P.neck.base,
    nc = P.neck.ctrl,
    na = P.neck.atlas;
  const neckPoint = (t: number) => bezier2(nb, nc, na, t);
  const neckTangent = (t: number) => bezier2Tangent(nb, nc, na, t);
  let neckLen = 0;
  for (let i = 0; i < 20; i++) neckLen += len(sub(neckPoint((i + 1) / 20), neckPoint(i / 20)));
  const cervical: SpinePoint[] = [];
  for (let i = 0; i < 7; i++) {
    // c7 at t=0 ... c1 at t=1
    const t = i / 6;
    const p = neckPoint(t);
    const idx = 7 - i;
    cervical.push({ p, spine: idx === 2 ? 0.05 * H : 0.02 * H, trans: idx === 1 ? 0.07 * H : 0.04 * H, r: 0.03 * H });
    L[`c${idx}`] = p;
  }
  cervical.reverse();
  L.atlas = L.c1;
  L.axis = L.c2;
  L.neck_mid = add(neckPoint(0.5), mul(v(0, 1), (P.neck.sections[1]?.yOff ?? 0)));
  const nsMid = interpHead(P.neck.sections, 0.5);
  L.neck_crest_mid = add(neckPoint(0.5), v(0, (nsMid.yOff ?? 0) + nsMid.h));
  L.throat_mid = add(neckPoint(0.5), v(0, (nsMid.yOff ?? 0) - nsMid.h));
  const nsBase = interpHead(P.neck.sections, 0.05);
  L.neck_base_ventral = add(neckPoint(0.05), v(0, (nsBase.yOff ?? 0) - nsBase.h));
  L.neck_base_dorsal = add(neckPoint(0.05), v(0, (nsBase.yOff ?? 0) + nsBase.h));
  const nsTop = interpHead(P.neck.sections, 0.95);
  L.neck_top_ventral = add(neckPoint(0.95), v(0, (nsTop.yOff ?? 0) - nsTop.h));

  // ----------------------------------------------------------------- head
  const hd = P.head;
  const origin: V3 = v(hd.occiput.x, hd.occiput.y);
  const noseV: V3 = v(hd.nose.x, hd.nose.y);
  const headDir = norm(sub(noseV, origin));
  const headLen = len(sub(noseV, origin));
  const headUp: V3 = norm([headDir[1], -headDir[0], 0]);
  const HP = (t: number, up = 0, z = 0): V3 => add(add(add(origin, mul(headDir, t * headLen)), mul(headUp, up)), v(0, 0, z));
  const hs = (t: number) => interpHead(hd.sections, t);
  const sec = (t: number) => hs(t);
  L.skull_occiput = origin;
  L.skull_poll = HP(0.06, sec(0.06).h * 0.9 + (sec(0.06).yOff ?? 0));
  L.skull_nose = noseV;
  L.skull_center = HP(0.45, (sec(0.45).yOff ?? 0));
  L.skull_forehead = HP(0.3, sec(0.3).h * 0.7 + (sec(0.3).yOff ?? 0));
  L.skull_face = HP(0.7, sec(0.7).h * 0.55 + (sec(0.7).yOff ?? 0));
  L.skull_base = HP(0.15, -sec(0.15).h * 0.6 + (sec(0.15).yOff ?? 0));
  L.brain = HP(0.2, sec(0.2).h * 0.25 + (sec(0.2).yOff ?? 0));
  for (const S of ['L', 'R'] as Side[]) {
    const sgn = S === 'L' ? 1 : -1;
    L[`skull_eye_${S}`] = HP(hd.eye.t, hd.eye.yOff, sgn * hd.eye.z);
    L[`skull_orbit_${S}`] = HP(hd.eye.t, hd.eye.yOff, sgn * hd.eye.z * 0.92);
    L[`skull_zygoma_${S}`] = HP(0.45, -sec(0.45).h * 0.15 + (sec(0.45).yOff ?? 0), sgn * sec(0.45).w * 0.9);
    L[`skull_temporal_${S}`] = HP(0.17, sec(0.17).h * 0.35 + (sec(0.17).yOff ?? 0), sgn * sec(0.17).w * 0.75);
    L[`skull_mastoid_${S}`] = HP(0.1, -sec(0.1).h * 0.2 + (sec(0.1).yOff ?? 0), sgn * sec(0.1).w * 0.85);
    L[`skull_ear_${S}`] = HP(hd.ear.t, hd.ear.yOff, sgn * hd.ear.z);
    const earDir = norm(add(mul(headUp, Math.cos(hd.ear.tilt)), mul([-headDir[0], -headDir[1], 0], Math.sin(hd.ear.tilt))));
    L[`ear_tip_${S}`] = add(L[`skull_ear_${S}`], add(mul(earDir, hd.ear.length), v(0, 0, sgn * hd.ear.width * 0.4)));
    L[`skull_tmj_${S}`] = HP(hd.jaw.tmjT, hd.jaw.tmjY, sgn * hd.jaw.z);
    L[`mandible_angle_${S}`] = HP(hd.jaw.angleT, hd.jaw.angleY, sgn * hd.jaw.z * 0.9);
    L[`mandible_body_${S}`] = HP(lerp(hd.jaw.angleT, hd.jaw.chinT, 0.55), lerp(hd.jaw.angleY, hd.jaw.chinY, 0.55), sgn * hd.jaw.z * 0.55);
    L[`mouth_corner_${S}`] = HP(hd.mouthCorner.t, hd.mouthCorner.yOff, sgn * hd.mouthCorner.z);
    L[`nostril_${S}`] = HP(hd.nostril.t, hd.nostril.yOff, sgn * hd.nostril.z);
    L[`cheek_${S}`] = HP(0.6, -sec(0.6).h * 0.1 + (sec(0.6).yOff ?? 0), sgn * sec(0.6).w * 0.95);
    L[`parotid_${S}`] = add(HP(hd.jaw.angleT - 0.03, hd.jaw.angleY + 0.03 * H, sgn * hd.jaw.z * 1.05), v(0.02 * H, 0, 0));
    if (hd.horns) {
      L[`horn_base_${S}`] = HP(hd.horns.t, hd.horns.yOff, sgn * hd.horns.z);
      const d = hd.horns.dir;
      const c = hd.horns.curve;
      const dir3: V3 = norm([d[0], d[1], sgn * d[2]]);
      L[`horn_mid_${S}`] = add(L[`horn_base_${S}`], add(mul(dir3, hd.horns.length * 0.5), [c[0] * 0.5, c[1] * 0.5, sgn * c[2] * 0.5]));
      L[`horn_tip_${S}`] = add(L[`horn_base_${S}`], add(mul(dir3, hd.horns.length), [c[0], c[1], sgn * c[2]]));
    }
  }
  L.mandible_chin = HP(hd.jaw.chinT, hd.jaw.chinY);
  L.mandible_symphysis = HP(hd.jaw.chinT - 0.08, hd.jaw.chinY + 0.01 * H);
  L.mouth = HP(0.88, (sec(0.88).yOff ?? 0) - sec(0.88).h * 0.35);
  L.tongue = HP(0.7, (sec(0.7).yOff ?? 0) - sec(0.7).h * 0.45);
  L.palate = HP(0.7, (sec(0.7).yOff ?? 0) - sec(0.7).h * 0.15);
  L.nasal_cavity = HP(0.62, (sec(0.62).yOff ?? 0) + sec(0.62).h * 0.15);
  L.pharynx = HP(0.22, -sec(0.22).h * 0.75 + (sec(0.22).yOff ?? 0));
  const angleMid = lerp3(L.mandible_angle_L, L.mandible_angle_R, 0.5);
  L.larynx = add(angleMid, v(0.035 * H, -0.045 * H, 0));
  L.throat = add(angleMid, v(0.06 * H, -0.07 * H, 0));
  L.hyoid = add(angleMid, v(0.01 * H, -0.02 * H, 0));
  L.nose_top = HP(0.97, sec(0.97).h * 0.6 + (sec(0.97).yOff ?? 0));
  L.chin = L.mandible_chin;

  // ---------------------------------------------------------------- trunk
  const secs = P.trunk.sections;
  const trunkSection = (x: number) => interpSections(secs, x);
  const xMin = secs[0].x,
    xMax = secs[secs.length - 1].x;
  const st = P.trunk.sternum;
  L.sternum_cranial = v(st.front.x, st.front.y);
  L.sternum_caudal = v(st.back.x, st.back.y);
  L.sternum_mid = v(lerp(st.front.x, st.back.x, 0.5), lerp(st.front.y, st.back.y, 0.5));
  L.thoracic_inlet = v(lerp(t1.x, st.front.x, 0.5), lerp(t1.y, st.front.y, 0.55));
  const tx = (f: number) => lerp(t1.x, tLast.x, f);
  const spineY = (x: number) => {
    const s = clamp01((x - t1.x) / (tLast.x - t1.x));
    return lerp(t1.y, tLast.y, s) + bow * 4 * s * (1 - s);
  };
  const sternY = (x: number) => lerp(st.front.y, st.back.y, clamp01((x - st.front.x) / (st.back.x - st.front.x)));
  const heartX = tx(4.2 / nT);
  L.heart = v(heartX, lerp(sternY(heartX), spineY(heartX), 0.34), 0.02 * H);
  L.heart_base = v(heartX, lerp(sternY(heartX), spineY(heartX), 0.5), 0.02 * H);
  L.heart_apex = v(heartX + 0.03 * H, lerp(sternY(heartX), spineY(heartX), 0.12), 0.03 * H);
  L.thorax_center = v(tx(0.4), lerp(sternY(tx(0.4)), spineY(tx(0.4)), 0.5));
  L.trachea_bifurcation = v(tx(4.5 / nT), lerp(sternY(tx(4.5 / nT)), spineY(tx(4.5 / nT)), 0.62));
  const lungX = tx(0.42);
  L.lung_L = v(lungX, lerp(sternY(lungX), spineY(lungX), 0.58), 0.1 * H);
  L.lung_R = v(lungX, lerp(sternY(lungX), spineY(lungX), 0.58), -0.1 * H);
  const diaX = tx(0.6);
  L.diaphragm_center = v(diaX, lerp(sternY(diaX), spineY(diaX), 0.5));
  L.diaphragm_apex = v(tx(0.42), lerp(sternY(diaX), spineY(diaX), 0.45));
  L.diaphragm_dorsal = v(tx(0.95), spineY(tx(0.95)) - 0.05 * H);
  L.diaphragm_ventral = v(tx(0.5), sternY(tx(0.5)) + 0.02 * H);
  const abX = lerp(tLast.x, lLast.x, 0.45);
  const abSec = trunkSection(abX);
  const abMid = lerp(abSec.bottom, abSec.top, 0.45);
  L.abdomen_center = v(abX, abMid);
  L.stomach = v(lerp(tLast.x, lLast.x, -0.12), abMid + 0.02 * H, 0.09 * H);
  L.liver = v(lerp(tLast.x, lLast.x, -0.2), abMid, -0.05 * H);
  L.spleen = v(lerp(tLast.x, lLast.x, 0.0), abMid + 0.12 * H, 0.16 * H);
  L.pancreas = v(lerp(tLast.x, lLast.x, 0.15), abMid + 0.08 * H, -0.04 * H);
  L.kidney_L = v(lumbar[Math.min(1, nL - 1)].p[0], lumbar[0].p[1] - 0.075 * H, 0.075 * H);
  L.kidney_R = v(lerp(tLast.x, lumbar[0].p[0], 0.4), tLast.y - 0.07 * H, -0.075 * H);
  const hip = P.hindlimb.hip;
  L.pubis = v(hip.x + 0.02 * H, hip.y - 0.12 * H);
  L.pelvic_inlet = v(lLast.x + 0.06 * H, lerp(lLast.y, hip.y - 0.12 * H, 0.5));
  L.bladder = v(hip.x - 0.04 * H, hip.y - 0.07 * H);
  L.anus = v(sacrumEnd.x + 0.02 * H, sacrumEnd.y - 0.09 * H);
  L.rectum = v(lerp(lLast.x, sacrumEnd.x, 0.6), lerp(lLast.y, sacrumEnd.y, 0.6) - 0.1 * H);
  L.umbilicus = v(abX, abSec.bottom + 0.01 * H);
  L.belly_bottom = v(abX, abSec.bottom);
  L.belly_center = v(abX, lerp(abSec.bottom, abSec.top, 0.3));
  const flankX = lLast.x - 0.05 * H;
  const flankSec = trunkSection(flankX);
  L.flank_L = v(flankX, lerp(flankSec.bottom, flankSec.top, 0.5), flankSec.w);
  L.flank_R = v(flankX, lerp(flankSec.bottom, flankSec.top, 0.5), -flankSec.w);
  const chestSec = trunkSection(heartX);
  L.chest_wall_L = v(heartX, L.heart[1], chestSec.w);
  L.chest_wall_R = v(heartX, L.heart[1], -chestSec.w);
  L.chest_front = v(xMin, lerp(st.front.y, t1.y, 0.4));
  L.linea_alba = v(lerp(st.back.x, L.pubis[0], 0.5), lerp(st.back.y, L.pubis[1], 0.5) - 0.0 * H);
  L.xiphoid = L.sternum_caudal;
  L.intestine_center = v(lerp(tLast.x, lLast.x, 0.55), abMid - 0.05 * H, 0.02 * H);
  L.cecum = v(lerp(tLast.x, lLast.x, 0.7), abMid - 0.08 * H, -0.09 * H);
  L.colon = v(lerp(tLast.x, lLast.x, 0.5), abMid - 0.1 * H, 0.03 * H);
  L.mesentery_root = v(lerp(tLast.x, lLast.x, 0.3), abMid + 0.1 * H, 0);
  if (P.trunk.udder) L.udder = v(P.trunk.udder.x, P.trunk.udder.y);

  // ---------------------------------------------------------------- limbs
  const fl = P.forelimb;
  const hl = P.hindlimb;
  const XYv = (p: XY, z: number): V3 => [p.x, p.y, z];
  for (const S of ['L', 'R'] as Side[]) {
    const sgn = S === 'L' ? 1 : -1;
    const z = sgn * fl.z;
    const k = (n: string, p: V3) => (L[`fl_${S}_${n}`] = p);
    k('scapula_top', XYv(fl.scapulaTop, z * 0.85));
    k('shoulder', XYv(fl.shoulder, z));
    k('elbow', XYv(fl.elbow, z));
    k('carpus', XYv(fl.carpus, z));
    k('fetlock', XYv(fl.fetlock, z));
    k('pastern', XYv(fl.pastern, z));
    k('hoof', XYv(fl.hoof, z));
    k('coffin', lerp3(XYv(fl.pastern, z), XYv(fl.hoof, z), 0.5));
    k('scapula_mid', add(lerp3(XYv(fl.scapulaTop, z), XYv(fl.shoulder, z), 0.5), v(0, 0, sgn * 0.02 * H)));
    k('scapula_spine', add(lerp3(XYv(fl.scapulaTop, z), XYv(fl.shoulder, z), 0.45), v(-0.01 * H, 0, sgn * 0.035 * H)));
    k('scapula_caudal', add(XYv(fl.scapulaTop, z * 0.9), v(0.09 * H, -0.05 * H, 0)));
    k('scapula_cranial', add(XYv(fl.scapulaTop, z * 0.9), v(-0.07 * H, -0.05 * H, 0)));
    k('acromion', add(XYv(fl.shoulder, z), v(0.0, 0.04 * H, sgn * 0.03 * H)));
    k('humerus_mid', add(lerp3(XYv(fl.shoulder, z), XYv(fl.elbow, z), 0.5), v(0, 0, sgn * 0.01 * H)));
    k('deltoid_tuberosity', add(lerp3(XYv(fl.shoulder, z), XYv(fl.elbow, z), 0.42), v(-0.01 * H, 0, sgn * 0.045 * H)));
    k('olecranon', add(XYv(fl.elbow, z), v(0.06 * H, 0.045 * H, 0)));
    k('elbow_cranial', add(XYv(fl.elbow, z), v(-0.03 * H, 0.01 * H, 0)));
    k('radius_mid', lerp3(XYv(fl.elbow, z), XYv(fl.carpus, z), 0.5));
    k('radius_prox', lerp3(XYv(fl.elbow, z), XYv(fl.carpus, z), 0.12));
    k('radius_dist', lerp3(XYv(fl.elbow, z), XYv(fl.carpus, z), 0.9));
    k('accessory_carpal', add(XYv(fl.carpus, z), v(0.035 * H, 0.0, 0)));
    k('cannon_mid', lerp3(XYv(fl.carpus, z), XYv(fl.fetlock, z), 0.5));
    k('cannon_prox', lerp3(XYv(fl.carpus, z), XYv(fl.fetlock, z), 0.1));
    k('cannon_dist', lerp3(XYv(fl.carpus, z), XYv(fl.fetlock, z), 0.9));
    k('sesamoid', add(XYv(fl.fetlock, z), v(0.025 * H, 0.005 * H, 0)));
    k('toe', add(XYv(fl.hoof, z), v(-0.03 * H, 0.0, 0)));
    k('heel', add(XYv(fl.hoof, z), v(0.03 * H, 0.01 * H, 0)));
    k('axilla', add(XYv(fl.shoulder, z), v(0.06 * H, -0.06 * H, -sgn * 0.03 * H)));
    k('limb_center', lerp3(XYv(fl.elbow, z), XYv(fl.fetlock, z), 0.5));

    const hz = sgn * hl.z;
    const h = (n: string, p: V3) => (L[`hl_${S}_${n}`] = p);
    h('tuber_coxae', [hl.tuberCoxae.x, hl.tuberCoxae.y, sgn * hl.tuberCoxae.z]);
    h('tuber_ischii', [hl.tuberIschii.x, hl.tuberIschii.y, sgn * hl.tuberIschii.z]);
    h('hip', XYv(hl.hip, hz));
    h('stifle', XYv(hl.stifle, hz));
    h('hock', XYv(hl.hock, hz));
    h('fetlock', XYv(hl.fetlock, hz));
    h('pastern', XYv(hl.pastern, hz));
    h('hoof', XYv(hl.hoof, hz));
    h('coffin', lerp3(XYv(hl.pastern, hz), XYv(hl.hoof, hz), 0.5));
    h('trochanter', add(XYv(hl.hip, hz), v(0.0, 0.035 * H, sgn * 0.035 * H)));
    h('femur_mid', lerp3(XYv(hl.hip, hz), XYv(hl.stifle, hz), 0.5));
    h('femur_prox', lerp3(XYv(hl.hip, hz), XYv(hl.stifle, hz), 0.15));
    h('femur_dist', lerp3(XYv(hl.hip, hz), XYv(hl.stifle, hz), 0.85));
    h('third_trochanter', add(lerp3(XYv(hl.hip, hz), XYv(hl.stifle, hz), 0.35), v(0.0, 0, sgn * 0.035 * H)));
    h('patella', add(XYv(hl.stifle, hz), v(-0.045 * H, 0.025 * H, 0)));
    h('tibial_tuberosity', add(XYv(hl.stifle, hz), v(-0.03 * H, -0.05 * H, 0)));
    h('tibia_mid', lerp3(XYv(hl.stifle, hz), XYv(hl.hock, hz), 0.5));
    h('tibia_prox', lerp3(XYv(hl.stifle, hz), XYv(hl.hock, hz), 0.15));
    h('tibia_dist', lerp3(XYv(hl.stifle, hz), XYv(hl.hock, hz), 0.88));
    h('calcaneus', add(XYv(hl.hock, hz), v(0.055 * H, 0.05 * H, 0)));
    h('hock_cranial', add(XYv(hl.hock, hz), v(-0.03 * H, 0.0, 0)));
    h('cannon_mid', lerp3(XYv(hl.hock, hz), XYv(hl.fetlock, hz), 0.5));
    h('cannon_prox', lerp3(XYv(hl.hock, hz), XYv(hl.fetlock, hz), 0.12));
    h('cannon_dist', lerp3(XYv(hl.hock, hz), XYv(hl.fetlock, hz), 0.9));
    h('sesamoid', add(XYv(hl.fetlock, hz), v(0.025 * H, 0.005 * H, 0)));
    h('toe', add(XYv(hl.hoof, hz), v(-0.03 * H, 0.0, 0)));
    h('heel', add(XYv(hl.hoof, hz), v(0.03 * H, 0.01 * H, 0)));
    h('thigh_medial', add(lerp3(XYv(hl.hip, hz), XYv(hl.stifle, hz), 0.5), v(0, 0, -sgn * 0.07 * H)));
    h('groin', add(XYv(hl.hip, hz), v(-0.02 * H, -0.1 * H, -sgn * 0.05 * H)));
    h('limb_center', lerp3(XYv(hl.stifle, hz), XYv(hl.fetlock, hz), 0.5));
    h('ischiatic_notch', add(lerp3([hl.tuberCoxae.x, hl.tuberCoxae.y, sgn * hl.tuberCoxae.z], [hl.tuberIschii.x, hl.tuberIschii.y, sgn * hl.tuberIschii.z], 0.55), v(0, 0.02 * H, 0)));
  }

  return {
    H,
    params,
    landmarks: L,
    spine: { cervical, thoracic, lumbar, sacral, caudal },
    trunkSection,
    trunkRange: { xMin, xMax },
    head: { origin, dir: headDir, up: headUp, length: headLen, section: hs },
    neck: { point: neckPoint, tangent: neckTangent, section: (t) => interpHead(P.neck.sections, t), length: neckLen },
    tail: { point: tailPt, tangent: tailTan },
  };
}

/** Resolve a point reference for a given instance side. */
export function resolvePoint(ref: PointRef, rig: Rig, side: Side | null): V3 {
  const H = rig.H;
  const S = side ?? 'L';
  const sgn = S === 'L' ? 1 : -1;
  const name = (n: string) => n.replace('{S}', S);
  const look = (n: string): V3 => {
    const p = rig.landmarks[name(n)];
    if (!p) throw new Error(`Unknown landmark "${name(n)}"`);
    return p;
  };
  if (typeof ref === 'string') return look(ref);
  if (Array.isArray(ref)) return [ref[0] * H, ref[1] * H, ref[2] * H * sgn];
  let base: V3;
  if (ref.between) base = lerp3(look(ref.between[0]), look(ref.between[1]), ref.t ?? 0.5);
  else if (ref.at) base = look(ref.at);
  else base = [0, 0, 0];
  return [base[0] + (ref.dx ?? 0) * H, base[1] + (ref.dy ?? 0) * H, base[2] + (ref.dz ?? 0) * H + (ref.lat ?? 0) * H * sgn];
}

/** Collect every landmark name a recipe refers to (for validation). */
export function pointRefNames(ref: PointRef): string[] {
  if (typeof ref === 'string') return [ref];
  if (Array.isArray(ref)) return [];
  const out: string[] = [];
  if (ref.at) out.push(ref.at);
  if (ref.between) out.push(...ref.between);
  return out;
}
