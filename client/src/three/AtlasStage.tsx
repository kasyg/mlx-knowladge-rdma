import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { LayerId, SystemId } from '@shared/types';
import { LAYER_IDS } from '@shared/types';
import { useAtlas, models, layerDissolve, type IsoOpts } from '../state/store.ts';
import type { AnimalModel } from './animal.ts';
import { updateSoftTissue } from './animal.ts';
import { PhysiologyDriver } from './physiology.ts';
import { strideAngles, applyPose, resetMotion, demoPlan, demoState, strideWeights, type DemoPlan, type DemoStage } from './motion.ts';
import type { JointName, LimbKey } from './segments.ts';
import { prepareMuscles, updateMuscles, updateTendons, updateCords, clearHistory, connectionsOf, type MuscleSystem, type MotionDrive } from './muscles.ts';
import { JOINTS, HOOFED_SPECIES } from '@shared/anatomy/mechanics';
import { smooth } from './biomech.ts';
import { haptic } from '../utils/haptics.ts';

export type IsoRole = 'focus' | 'solid' | 'ghost';

export const atlasRuntime = {
  model: null as AnimalModel | null,
  displayDepth: 0,
  /** per-instance current dissolve for smooth transitions */
  cur: new Map<string, { dissolve: number; dim: number; hi: number; ghost: number }>(),
  motionLimb: null as LimbKey | null,
  /** smoothed dissolve of the muscle layer (drives what the muscles cover) */
  musclesCur: 0,
  frame: 0,
  /** smoothed CPU time of the stage update (ms), for diagnostics */
  stageMs: 0,
  /** limb currently posed by the gait or a demonstration */
  poseLimb: null as LimbKey | null,
  prevAngles: null as Partial<Record<JointName, number>> | null,
  angles: null as Partial<Record<JointName, number>> | null,
  /** demonstration of a muscle's function */
  demo: { key: null as string | null, t0: 0, plan: null as DemoPlan | null, stage: 'rest' as DemoStage, phase: 0, pulse: false },
  /** isolation view: members and their role */
  iso: { sig: '', key: null as string | null, members: new Map<string, IsoRole>() },
};
if (typeof window !== 'undefined') (window as unknown as { __vetatlasRuntime?: unknown }).__vetatlasRuntime = atlasRuntime;

export function limbOfRegion(region: string | null): LimbKey | null {
  if (!region) return null;
  const m = /^(forelimb|hindlimb)_(left|right)$/.exec(region);
  if (!m) return null;
  return `${m[1] === 'forelimb' ? 'fl' : 'hl'}_${m[2] === 'left' ? 'L' : 'R'}` as LimbKey;
}

/** structures shown in the isolation view of `key`, with their role */
export function isolationMembers(sys: MuscleSystem, model: AnimalModel, key: string, opts: IsoOpts): Map<string, IsoRole> {
  const out = new Map<string, IsoRole>([[key, 'focus']]);
  for (const c of connectionsOf(sys, model, key)) {
    let role: IsoRole | null = null;
    switch (c.role) {
      case 'origin':
      case 'insertion':
      case 'tendon':
      case 'bone':
      case 'muscle':
      case 'articulates':
      case 'attached':
        role = 'solid';
        break;
      case 'synergist':
        role = opts.synergists ? 'ghost' : null;
        break;
      case 'antagonist':
        role = opts.antagonists ? 'ghost' : null;
        break;
      case 'nerve':
      case 'artery':
        role = opts.supply ? 'solid' : null;
        break;
      case 'originHere':
      case 'insertsHere':
      case 'innervates':
      case 'supplies':
        role = opts.synergists ? 'ghost' : null;
        break;
    }
    if (role && !out.has(c.key)) out.set(c.key, role);
  }
  // the skeleton the structure lies on: bones of the joints a muscle crosses and bones its body touches
  const inst = model.byKey.get(key);
  if (inst && inst.group !== 'bones') {
    for (const j of sys.graph.joints.get(inst.def.id) ?? []) {
      const jd = JOINTS.find((x) => x.id === j.id);
      for (const b of jd?.bones ?? []) for (const k of sys.keysOf(b, inst.side)) if (!out.has(k)) out.set(k, 'solid');
    }
    const box = inst.box.clone().expandByScalar(0.015 * model.rig.H);
    for (const other of model.instances) {
      if (other.group !== 'bones' || out.has(other.key) || other.box.isEmpty()) continue;
      if (inst.side && other.side && other.side !== inst.side) continue;
      if (!box.intersectsBox(other.box)) continue;
      // large bones only count when they overlap a good part of the structure (a rib cage behind a neck muscle does not)
      const ov = box.clone().intersect(other.box);
      const sz = new THREE.Vector3();
      ov.getSize(sz);
      const own = new THREE.Vector3();
      inst.box.getSize(own);
      if (sz.x * sz.y * sz.z > 0.08 * own.x * own.y * own.z || other.box.containsBox(inst.box)) out.set(other.key, 'solid');
    }
  }
  return out;
}

const PULSE_PLAN: DemoPlan = { limb: null, moves: [], period: 2.6 };

export function AtlasStage() {
  const speciesId = useAtlas((s) => s.speciesId);
  const modelVersion = useAtlas((s) => s.modelVersion);
  const model = speciesId ? models.full.get(speciesId) ?? null : null;
  const physio = useRef<PhysiologyDriver | null>(null);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    const g = group.current;
    if (!g || !model) return;
    model.root.position.set(0, 0, 0);
    model.root.rotation.set(0, 0, 0);
    g.add(model.root);
    atlasRuntime.model = model;
    atlasRuntime.cur.clear();
    atlasRuntime.displayDepth = 0;
    atlasRuntime.poseLimb = null;
    atlasRuntime.prevAngles = null;
    atlasRuntime.demo.key = null;
    atlasRuntime.iso.sig = '';
    resetMotion(model);
    // attachments are snapped to the bones in the rest pose (after imported meshes replaced the procedural ones)
    if (!model.muscles) model.muscles = prepareMuscles(model);
    physio.current = new PhysiologyDriver(model, model.payload.meta.physiology);
    g.add(physio.current.group);
    return () => {
      g.remove(model.root);
      if (physio.current) {
        g.remove(physio.current.group);
        physio.current.dispose();
        physio.current = null;
      }
      atlasRuntime.model = null;
      resetMotion(model);
    };
  }, [model, modelVersion]);

  // only a sheet-based musculature (one that tiles the body) is allowed to hide the bones beneath it
  const sheetMuscles = useMemo(() => !!model && model.instances.some((inst) => (Array.isArray(inst.def.geometry) ? inst.def.geometry : [inst.def.geometry]).some((g) => g.type === 'sheet')), [model]);

  useFrame((state, dt) => {
    const m = atlasRuntime.model;
    if (!m) return;
    const tStart = performance.now();
    atlasRuntime.frame++;
    const s = useAtlas.getState();
    const t = state.clock.elapsedTime;
    const sys = (m.muscles ??= prepareMuscles(m));
    // smooth peel depth
    atlasRuntime.displayDepth += (s.depth - atlasRuntime.displayDepth) * Math.min(1, dt * 6);
    const d = atlasRuntime.displayDepth;
    const anySystem = (Object.keys(s.systems) as SystemId[]).some((k) => s.systems[k]);

    // ------------------------------------------------------------ what moves: a demonstration, the walk, or nothing
    const speed = s.settings.animationSpeed * (s.settings.reduceMotion ? 0.5 : 1);
    let limb: LimbKey | null = null;
    let angles: Partial<Record<JointName, number>> | null = null;
    let stanceK = 0, swingK = 0;
    let demoDrive: MotionDrive['demo'] = null;
    let pulseK = 0;
    const demoRt = s.demo ? sys.muscles.get(s.demo) ?? null : null;
    const dm = atlasRuntime.demo;
    if (demoRt) {
      if (dm.key !== demoRt.key) {
        dm.key = demoRt.key;
        dm.t0 = t;
        dm.plan = demoRt.limb && demoRt.roles.length ? demoPlan(demoRt.roles, demoRt.limb, { reciprocal: HOOFED_SPECIES.includes(m.payload.meta.id) }) : null;
        dm.pulse = !dm.plan;
        clearHistory(demoRt);
      }
      const dtt = (t - dm.t0) * speed;
      const blend = smooth(dtt / 0.6);
      const ds = demoState(dm.plan ?? PULSE_PLAN, dtt);
      dm.stage = ds.stage;
      dm.phase = ds.phase;
      if (dm.plan) {
        limb = dm.plan.limb;
        angles = {};
        for (const [j, a] of Object.entries(ds.angles)) angles[j as JointName] = (a ?? 0) * blend;
        demoDrive = { key: demoRt.key, drive: ds.drive * blend, pulse: false };
      } else {
        demoDrive = { key: demoRt.key, drive: ds.drive * blend, pulse: true };
        pulseK = ds.k * blend;
      }
    } else {
      dm.key = null;
      const gaitLimb = s.motionOn ? limbOfRegion(s.region) : null;
      if (gaitLimb) {
        const phase = ((t * speed) / 1.9) % 1;
        const ms = strideAngles(gaitLimb, phase);
        limb = gaitLimb;
        angles = ms.angles;
        ({ stanceK, swingK } = strideWeights(phase));
        s.setMotionInfo(phase, ms.stance);
      }
    }
    atlasRuntime.motionLimb = limb;
    if (atlasRuntime.poseLimb && atlasRuntime.poseLimb !== limb) {
      const prev = atlasRuntime.poseLimb;
      applyPose(m, prev, null);
      updateSoftTissue(m, prev);
    }
    atlasRuntime.poseLimb = limb;
    let rates: Partial<Record<JointName, number>> | null = null;
    if (limb && angles) {
      applyPose(m, limb, angles);
      const prev = atlasRuntime.prevAngles;
      rates = {};
      for (const [j, a] of Object.entries(angles)) rates[j as JointName] = prev ? ((a ?? 0) - (prev[j as JointName] ?? 0)) / Math.max(1e-3, dt) : 0;
      atlasRuntime.prevAngles = { ...angles };
    } else atlasRuntime.prevAngles = null;
    atlasRuntime.angles = angles;

    // ------------------------------------------------------------ muscle physics, then soft tissue with the new belly thickness
    updateMuscles(m, sys, { dt: dt * speed, t, limb, angles, rates, stanceK, swingK, demo: demoDrive });
    if (limb) updateSoftTissue(m, limb);
    updateTendons(sys, { limb });

    // ------------------------------------------------------------ isolation members
    const iso = atlasRuntime.iso;
    const isoSig = s.isolated ? `${s.isolated}|${s.isoOpts.synergists}|${s.isoOpts.antagonists}|${s.isoOpts.supply}` : '';
    if (isoSig !== iso.sig) {
      const wasIsolated = !!iso.key;
      iso.sig = isoSig;
      iso.key = s.isolated;
      iso.members = s.isolated ? isolationMembers(sys, m, s.isolated, s.isoOpts) : new Map();
      if (s.isolated && (!wasIsolated || iso.members.size)) {
        const keys = [...iso.members.entries()].filter(([, r]) => r !== 'ghost').map(([k]) => k);
        s.camera({ type: 'fitKeys', keys, focus: s.isolated });
      }
    }
    const isoMembers = iso.key ? iso.members : null;

    // ------------------------------------------------------------ visibility, ghosting, highlight, tissue state
    const k = Math.min(1, dt * 5);
    const skinTarget = limb ? 1 : layerDissolve('skin', d, s.layerMode.skin);
    const skinCur = atlasRuntime.cur.get('cutis')?.dissolve ?? skinTarget;
    const skinGhost = s.ghostSkin && anySystem;
    // an intact, opaque skin covers everything beneath it (and saves a lot of fill rate)
    const skinCovers = skinTarget === 0 && skinCur < 0.03;
    const musclesTarget = layerDissolve('muscles', d, s.layerMode.muscles);
    atlasRuntime.musclesCur += (musclesTarget - atlasRuntime.musclesCur) * k;
    if (Math.abs(musclesTarget - atlasRuntime.musclesCur) < 0.004) atlasRuntime.musclesCur = musclesTarget;
    // intact muscles hide the bones and cartilage that lie beneath them (axial skeleton, girdles, joints)
    const musclesCover = sheetMuscles && musclesTarget === 0 && atlasRuntime.musclesCur < 0.03;
    const cordFocus = new Set([s.isolated, s.selected, s.demo].filter((x): x is string => !!x));
    for (const inst of m.instances) {
      const g = inst.group;
      let target: number;
      let ghostTarget = 0;
      if (LAYER_IDS.includes(g as LayerId)) target = layerDissolve(g as LayerId, d, s.layerMode[g as LayerId]);
      else target = s.systems[g as SystemId] ? 0 : 1;
      if (inst.def.systems?.some((sys2) => s.systems[sys2])) target = 0;
      if (limb && g === 'skin') target = 1; // skin cannot deform during limb motion
      if (skinCovers && g !== 'skin') {
        const pinned = LAYER_IDS.includes(g as LayerId) && s.layerMode[g as LayerId] === 'on';
        const isSystem = !LAYER_IDS.includes(g as LayerId) || !!inst.def.systems?.some((sys2) => s.systems[sys2]);
        if (!pinned && !(isSystem && skinGhost)) target = 1;
      }
      if (musclesCover && inst.def.covered && (g === 'bones' || g === 'cartilage')) {
        const pinned = s.layerMode[g as LayerId] === 'on';
        const isSystem = !!inst.def.systems?.some((sys2) => s.systems[sys2]);
        if (!pinned && !isSystem) target = 1;
      }
      if (isoMembers) {
        const role = isoMembers.get(inst.key);
        if (role === 'focus' || role === 'solid') target = 0;
        else if (role === 'ghost') {
          target = 0;
          ghostTarget = 0.16;
        } else if (s.isoOpts.context && target < 0.5 && g !== 'skin') ghostTarget = 0.07;
        else target = 1;
      }
      let cur = atlasRuntime.cur.get(inst.key);
      if (!cur) {
        cur = { dissolve: target, dim: 0, hi: 0, ghost: ghostTarget };
        atlasRuntime.cur.set(inst.key, cur);
      }
      cur.dissolve += (target - cur.dissolve) * k;
      if (Math.abs(target - cur.dissolve) < 0.004) cur.dissolve = target;
      cur.ghost += (ghostTarget - cur.ghost) * k;
      if (Math.abs(ghostTarget - cur.ghost) < 0.004) cur.ghost = ghostTarget;
      const inRegion = isoMembers ? true : !s.region || inst.regions.includes(s.region);
      const dimTarget = inRegion ? 0 : g === 'skin' ? 0.35 : 0.65;
      cur.dim += (dimTarget - cur.dim) * k;
      let hiTarget = 0;
      if ((s.selected === inst.key && s.isolated !== inst.key) || s.quizHighlight === inst.key) hiTarget = 1;
      else if (s.hovered === inst.key) hiTarget = 0.55;
      cur.hi += (hiTarget - cur.hi) * Math.min(1, dt * 9);
      const visible = cur.dissolve < 0.999;
      inst.node.visible = visible;
      const cords = visible && cordFocus.has(inst.key);
      for (const mesh of inst.meshes) mesh.visible = mesh.userData.cord ? cords : visible;
      // muscle and tendon state from the physics
      const rt = sys.muscles.get(inst.key);
      const tr = rt ? null : sys.tendons.get(inst.key);
      if (rt && cords) updateCords(rt);
      const skinGhostHere = g === 'skin' && s.ghostSkin && anySystem;
      const ghostOpacity = skinGhostHere ? 0.14 : cur.ghost;
      const wantGhost = skinGhostHere || cur.ghost > 0.01;
      for (let i = 0; i < inst.uniforms.length; i++) {
        const u = inst.uniforms[i];
        u.uDissolve.value = cur.dissolve;
        u.uDim.value = cur.dim;
        u.uHighlight.value = cur.hi;
        u.uTime.value = t;
        if (rt) {
          u.uAct.value = rt.live ? rt.st.a : 0;
          u.uStretch.value = rt.live ? rt.st.l : 1;
          u.uStrain.value = rt.live ? rt.st.eps : 0;
          if (dm.pulse && demoRt === rt) {
            u.uPulse.value = pulseK;
            const o = rt.sites.find((x) => x.kind === 'origin');
            const ins = [...rt.sites].reverse().find((x) => x.kind === 'insertion');
            if (o && ins) {
              u.uPulseO.value.copy(o.rest);
              u.uPulseI.value.copy(ins.rest);
            }
          } else u.uPulse.value = 0;
        } else if (tr) u.uStrain.value = tr.strain;
        const mat = inst.materials[i];
        if (mat.transparent !== wantGhost) {
          mat.transparent = wantGhost;
          mat.depthWrite = !wantGhost;
          mat.needsUpdate = true; // the OPAQUE define must be recompiled
        }
        mat.opacity = wantGhost ? Math.max(0.04, ghostOpacity) : 1;
      }
      const order = wantGhost ? 10 : 0;
      for (const mesh of inst.meshes) {
        mesh.renderOrder = order;
        // a ghost is a see-through reference: it must not darken what it surrounds
        mesh.castShadow = !wantGhost;
      }
    }
    if (physio.current) {
      physio.current.setVisible(s.systems.respiratory && !isoMembers, s.systems.digestive && !isoMembers);
      physio.current.update(t, s.settings.animationSpeed * (s.settings.reduceMotion ? 0.5 : 1), s.physioPlaying && !s.settings.reduceMotion, s.systems.vascular);
    }
    atlasRuntime.stageMs += (performance.now() - tStart - atlasRuntime.stageMs) * 0.1;
  });

  useEffect(() => {
    if (model) haptic('arrive');
  }, [model]);

  return <group ref={group} />;
}
