import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LayerId, SystemId } from '@shared/types';
import { LAYER_IDS } from '@shared/types';
import { useAtlas, models, layerDissolve } from '../state/store.ts';
import type { AnimalModel } from './animal.ts';
import { PhysiologyDriver } from './physiology.ts';
import { strideAngles, applyMotion, resetMotion, activeRoles } from './motion.ts';
import type { LimbKey } from './segments.ts';
import { haptic } from '../utils/haptics.ts';

export const atlasRuntime = {
  model: null as AnimalModel | null,
  displayDepth: 0,
  /** per-instance current dissolve for smooth transitions */
  cur: new Map<string, { dissolve: number; dim: number; hi: number }>(),
  motionLimb: null as LimbKey | null,
  frame: 0,
};
if (typeof window !== 'undefined') (window as unknown as { __vetatlasRuntime?: unknown }).__vetatlasRuntime = atlasRuntime;

export function limbOfRegion(region: string | null): LimbKey | null {
  if (!region) return null;
  const m = /^(forelimb|hindlimb)_(left|right)$/.exec(region);
  if (!m) return null;
  return `${m[1] === 'forelimb' ? 'fl' : 'hl'}_${m[2] === 'left' ? 'L' : 'R'}` as LimbKey;
}

export function AtlasStage() {
  const speciesId = useAtlas((s) => s.speciesId);
  const modelVersion = useAtlas((s) => s.modelVersion);
  const { scene, camera, gl } = useThree();
  const model = speciesId ? models.full.get(speciesId) ?? null : null;
  const physio = useRef<PhysiologyDriver | null>(null);
  const group = useRef<THREE.Group>(null);
  const motionWas = useRef(false);

  useEffect(() => {
    const g = group.current;
    if (!g || !model) return;
    model.root.position.set(0, 0, 0);
    model.root.rotation.set(0, 0, 0);
    g.add(model.root);
    atlasRuntime.model = model;
    atlasRuntime.cur.clear();
    atlasRuntime.displayDepth = 0;
    resetMotion(model);
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

  // structure picking (hover + tap) is handled in CameraRig; here we only run per-frame updates
  const ray = useMemo(() => new THREE.Raycaster(), []);
  void ray;
  void camera;
  void gl;
  void scene;

  useFrame((state, dt) => {
    const m = atlasRuntime.model;
    if (!m) return;
    atlasRuntime.frame++;
    const s = useAtlas.getState();
    const t = state.clock.elapsedTime;
    // smooth peel depth
    atlasRuntime.displayDepth += (s.depth - atlasRuntime.displayDepth) * Math.min(1, dt * 6);
    const d = atlasRuntime.displayDepth;
    const anySystem = (Object.keys(s.systems) as SystemId[]).some((k) => s.systems[k]);
    const limb = s.motionOn ? limbOfRegion(s.region) : null;
    atlasRuntime.motionLimb = limb;
    let motionState = null;
    if (limb) {
      const phase = (t / 1.9) % 1;
      motionState = strideAngles(limb, phase);
      applyMotion(m, limb, motionState);
      s.setMotionInfo(phase, motionState.stance);
      motionWas.current = true;
    } else if (motionWas.current) {
      resetMotion(m);
      motionWas.current = false;
    }
    const roles = limb && motionState ? activeRoles(limb, motionState) : null;
    const k = Math.min(1, dt * 5);
    const skinTarget = limb ? 1 : layerDissolve('skin', d, s.layerMode.skin);
    const skinCur = atlasRuntime.cur.get('cutis')?.dissolve ?? skinTarget;
    const skinGhost = s.ghostSkin && anySystem;
    // an intact, opaque skin covers everything beneath it (and saves a lot of fill rate)
    const skinCovers = skinTarget === 0 && skinCur < 0.03;
    for (const inst of m.instances) {
      const g = inst.group;
      let target: number;
      if (LAYER_IDS.includes(g as LayerId)) target = layerDissolve(g as LayerId, d, s.layerMode[g as LayerId]);
      else target = s.systems[g as SystemId] ? 0 : 1;
      if (inst.def.systems?.some((sys) => s.systems[sys])) target = 0;
      if (limb && g === 'skin') target = 1; // skin cannot deform during limb motion
      if (skinCovers && g !== 'skin') {
        const pinned = LAYER_IDS.includes(g as LayerId) && s.layerMode[g as LayerId] === 'on';
        const isSystem = !LAYER_IDS.includes(g as LayerId) || !!inst.def.systems?.some((sys) => s.systems[sys]);
        if (!pinned && !(isSystem && skinGhost)) target = 1;
      }
      let cur = atlasRuntime.cur.get(inst.key);
      if (!cur) {
        cur = { dissolve: target, dim: 0, hi: 0 };
        atlasRuntime.cur.set(inst.key, cur);
      }
      cur.dissolve += (target - cur.dissolve) * k;
      if (Math.abs(target - cur.dissolve) < 0.004) cur.dissolve = target;
      const inRegion = !s.region || inst.regions.includes(s.region);
      const dimTarget = inRegion ? 0 : g === 'skin' ? 0.35 : 0.65;
      cur.dim += (dimTarget - cur.dim) * k;
      let hiTarget = 0;
      if (s.selected === inst.key || s.quizHighlight === inst.key) hiTarget = 1;
      else if (s.hovered === inst.key) hiTarget = 0.55;
      else if (roles && limb && inst.limbs.has(limb)) {
        if (inst.def.motion?.some((r) => roles.joints.includes(r.joint) && r.action === roles.action)) hiTarget = 0.6;
        else if ((inst.def.kind === 'tendon' || inst.def.kind === 'ligament') && motionState?.stance) hiTarget = 0.45;
      }
      cur.hi += (hiTarget - cur.hi) * Math.min(1, dt * 9);
      const visible = cur.dissolve < 0.999;
      inst.node.visible = visible;
      for (const mesh of inst.meshes) mesh.visible = visible;
      const ghost = g === 'skin' && s.ghostSkin && anySystem;
      for (let i = 0; i < inst.uniforms.length; i++) {
        const u = inst.uniforms[i];
        u.uDissolve.value = cur.dissolve;
        u.uDim.value = cur.dim;
        u.uHighlight.value = cur.hi;
        u.uTime.value = t;
        const mat = inst.materials[i];
        const wantGhost = ghost;
        if (mat.transparent !== wantGhost) {
          mat.transparent = wantGhost;
          mat.depthWrite = !wantGhost;
          mat.needsUpdate = true; // the OPAQUE define must be recompiled
        }
        mat.opacity = wantGhost ? 0.14 : 1;
      }
      if (ghost) for (const mesh of inst.meshes) mesh.renderOrder = 10;
      else for (const mesh of inst.meshes) mesh.renderOrder = 0;
    }
    if (physio.current) {
      physio.current.setVisible(s.systems.respiratory, s.systems.digestive);
      physio.current.update(t, s.settings.animationSpeed * (s.settings.reduceMotion ? 0.5 : 1), s.physioPlaying && !s.settings.reduceMotion, s.systems.vascular);
    }
  });

  useEffect(() => {
    if (model) haptic('arrive');
  }, [model]);

  return <group ref={group} />;
}
