/**
 * Fit the procedural rig to an imported skeleton.
 *
 * After an external skeleton has replaced the procedural bones, the bounding
 * boxes of the mapped bones tell where the real joints are. The rig parameters
 * (joint positions, spine landmarks, skull axis) are moved there so that the
 * procedural skin, muscles, tendons and vessels are rebuilt around the real
 * bones instead of floating next to them. Every fitted value is sanity-checked
 * against the procedural one and ignored when it is implausibly far away.
 */
import * as THREE from 'three';
import type { RigParams, XY } from '@shared/types';
import type { AnimalModel } from './animal.ts';

type Box = { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3; center: THREE.Vector3 };

export interface RigFitReport {
  changed: string[];
  rejected: string[];
}

function boxOf(model: AnimalModel, key: string): Box | null {
  const inst = model.byKey.get(`${key}_L`) ?? model.byKey.get(key);
  if (!inst || !inst.external || inst.box.isEmpty()) return null;
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  inst.box.getSize(size);
  inst.box.getCenter(center);
  return { min: inst.box.min.clone(), max: inst.box.max.clone(), size, center };
}

/** Rig parameters fitted to the imported bones, or null when there is nothing to fit. */
export function fitRigToSkeleton(model: AnimalModel): { rig: RigParams; report: RigFitReport } | null {
  const P = structuredClone(model.payload.rig) as RigParams;
  const H = P.H;
  const report: RigFitReport = { changed: [], rejected: [] };
  const b = (key: string) => boxOf(model, key);

  /** accept a fitted point only when it stays within reach of the procedural one */
  const put = (target: XY, name: string, x: number | null, y: number | null, tolerance = 0.3) => {
    if (x === null && y === null) return;
    const nx = x ?? target.x, ny = y ?? target.y;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    if (Math.hypot(nx - target.x, ny - target.y) > tolerance * H) {
      report.rejected.push(name);
      return;
    }
    if (Math.abs(nx - target.x) > 1e-4 || Math.abs(ny - target.y) > 1e-4) report.changed.push(name);
    target.x = nx;
    target.y = ny;
  };
  const avg = (...v: (number | null)[]) => {
    const a = v.filter((x): x is number => x !== null);
    return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  };

  // ------------------------------------------------------------ forelimb
  {
    const scap = b('scapula'), hum = b('humerus'), rad = b('radius'), mc = b('ossa_metacarpalia'), p1 = b('os_compedale_fl'), p3 = b('os_ungulare_fl');
    const F = P.forelimb;
    if (scap) put(F.scapulaTop, 'forelimb.scapulaTop', scap.center.x + scap.size.x * 0.2, scap.max.y - 0.02);
    if (hum) {
      put(F.shoulder, 'forelimb.shoulder', hum.min.x + hum.size.x * 0.2, hum.max.y - hum.size.y * 0.08);
      put(F.elbow, 'forelimb.elbow', avg(hum.max.x - hum.size.x * 0.15, rad ? rad.center.x : null), avg(hum.min.y + hum.size.y * 0.1, rad ? rad.max.y : null));
      if (Math.abs(hum.center.z) > 0.02) F.z = Math.abs(hum.center.z);
    }
    if (rad || mc) put(F.carpus, 'forelimb.carpus', avg(rad ? rad.center.x : null, mc ? mc.center.x : null), avg(rad ? rad.min.y : null, mc ? mc.max.y : null));
    if (mc || p1) put(F.fetlock, 'forelimb.fetlock', avg(mc ? mc.center.x : null, p1 ? p1.center.x : null), avg(mc ? mc.min.y : null, p1 ? p1.max.y : null));
    if (p1) put(F.pastern, 'forelimb.pastern', p1.center.x, p1.min.y);
    if (p3) put(F.hoof, 'forelimb.hoof', p3.center.x, 0);
  }
  // ------------------------------------------------------------ hindlimb
  {
    const cox = b('os_coxae'), fem = b('femur'), tib = b('tibia'), mt = b('ossa_metatarsalia'), p1 = b('os_compedale_hl'), p3 = b('os_ungulare_hl');
    const Hd = P.hindlimb;
    if (cox) {
      put(Hd.tuberCoxae, 'hindlimb.tuberCoxae', cox.min.x + cox.size.x * 0.08, cox.max.y - 0.03);
      put(Hd.tuberIschii, 'hindlimb.tuberIschii', cox.max.x - cox.size.x * 0.05, cox.min.y + cox.size.y * 0.3);
      if (cox.max.z > 0.05) {
        Hd.tuberCoxae.z = cox.max.z * 0.9;
        Hd.tuberIschii.z = cox.max.z * 0.5;
      }
    }
    if (fem) {
      put(Hd.hip, 'hindlimb.hip', fem.max.x - fem.size.x * 0.15, fem.max.y - fem.size.y * 0.08);
      put(Hd.stifle, 'hindlimb.stifle', avg(fem.min.x + fem.size.x * 0.12, tib ? tib.min.x + tib.size.x * 0.3 : null), avg(fem.min.y + fem.size.y * 0.1, tib ? tib.max.y : null));
      if (Math.abs(fem.center.z) > 0.02) Hd.z = Math.abs(fem.center.z);
    }
    if (tib || mt) put(Hd.hock, 'hindlimb.hock', avg(tib ? tib.max.x - tib.size.x * 0.15 : null, mt ? mt.center.x : null), avg(tib ? tib.min.y : null, mt ? mt.max.y : null));
    if (mt || p1) put(Hd.fetlock, 'hindlimb.fetlock', avg(mt ? mt.center.x : null, p1 ? p1.center.x : null), avg(mt ? mt.min.y : null, p1 ? p1.max.y : null));
    if (p1) put(Hd.pastern, 'hindlimb.pastern', p1.center.x, p1.min.y);
    if (p3) put(Hd.hoof, 'hindlimb.hoof', p3.center.x, 0);
  }
  // ------------------------------------------------------------ spine, pelvis, skull
  {
    const th = b('vertebrae_thoracicae'), lu = b('vertebrae_lumbales'), sac = b('os_sacrum'), cox = b('os_coxae'), skull = b('cranium'), atlas = b('atlas');
    const S = P.spine;
    const oldT1 = S.t1.x, oldEnd = S.sacrumEnd.x;
    if (th) {
      put(S.t1, 'spine.t1', th.min.x + 0.02, null);
      put(S.tLast, 'spine.tLast', th.max.x - 0.02, null);
      if (Math.abs(th.max.y - S.withersTop) < 0.3 * H) S.withersTop = th.max.y;
    }
    if (lu) put(S.lLast, 'spine.lLast', lu.max.x - 0.01, null);
    if (sac) put(S.sacrumEnd, 'spine.sacrumEnd', sac.max.x, null);
    const croup = Math.max(sac ? sac.max.y : -1, cox ? cox.max.y : -1);
    if (croup > 0 && Math.abs(croup - S.croupTop) < 0.3 * H) S.croupTop = croup;
    // the trunk sections (skin) follow the new spine length
    const newT1 = S.t1.x, newEnd = S.sacrumEnd.x;
    if (Math.abs(newT1 - oldT1) > 1e-4 || Math.abs(newEnd - oldEnd) > 1e-4) {
      const k = (newEnd - newT1) / (oldEnd - oldT1);
      for (const sec of P.trunk.sections) sec.x = newT1 + (sec.x - oldT1) * k;
      P.trunk.sternum.front.x = newT1 + (P.trunk.sternum.front.x - oldT1) * k;
      P.trunk.sternum.back.x = newT1 + (P.trunk.sternum.back.x - oldT1) * k;
      if (P.trunk.udder) P.trunk.udder.x = newT1 + (P.trunk.udder.x - oldT1) * k;
      P.tail.base.x = newEnd;
      report.changed.push('trunk.sections');
    }
    if (skull) {
      put(P.head.occiput, 'head.occiput', skull.max.x - 0.02, skull.min.y + skull.size.y * 0.75);
      put(P.head.nose, 'head.nose', skull.min.x + 0.02, skull.min.y + skull.size.y * 0.25);
    }
    if (atlas) put(P.neck.atlas, 'neck.atlas', atlas.center.x, atlas.center.y);
  }
  // ------------------------------------------------------------ plausibility: joints must keep their order down the limb
  const original = model.payload.rig;
  const ordered = (names: string[], get: (r: RigParams) => XY[], tag: string) => {
    const pts = get(P);
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < pts[i - 1].y - 0.01) continue; // next joint lies lower: fine
      // a joint above the one before it: restore the pair from the procedural rig
      const src = get(original);
      pts[i - 1].x = src[i - 1].x; pts[i - 1].y = src[i - 1].y;
      pts[i].x = src[i].x; pts[i].y = src[i].y;
      report.rejected.push(`${tag}.${names[i - 1]}/${names[i]}`);
      report.changed = report.changed.filter((c) => c !== `${tag}.${names[i - 1]}` && c !== `${tag}.${names[i]}`);
    }
  };
  ordered(['scapulaTop', 'shoulder', 'elbow', 'carpus', 'fetlock', 'pastern', 'hoof'], (r) => [r.forelimb.scapulaTop, r.forelimb.shoulder, r.forelimb.elbow, r.forelimb.carpus, r.forelimb.fetlock, r.forelimb.pastern, r.forelimb.hoof], 'forelimb');
  ordered(['tuberCoxae', 'hip', 'stifle', 'hock', 'fetlock', 'pastern', 'hoof'], (r) => [r.hindlimb.tuberCoxae, r.hindlimb.hip, r.hindlimb.stifle, r.hindlimb.hock, r.hindlimb.fetlock, r.hindlimb.pastern, r.hindlimb.hoof], 'hindlimb');
  if (!report.changed.length) return null;
  return { rig: P, report };
}
