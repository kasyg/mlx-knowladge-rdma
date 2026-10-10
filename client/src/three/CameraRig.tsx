import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import type { RegionId, RegionDef } from '@shared/types';
import { useAtlas, models, type CameraCommand } from '../state/store.ts';
import { homeState } from './HomeStage.tsx';
import { atlasRuntime } from './AtlasStage.tsx';
import type { AnimalModel } from './animal.ts';
import { haptic } from '../utils/haptics.ts';
import { resolvePoint } from '@shared/rig';

export const cameraRuntime = {
  controls: null as CameraControlsImpl | null,
  camera: null as THREE.Camera | null,
  size: { width: 1, height: 1 },
  tick: null as null | (() => void),
  focusCenter: new THREE.Vector3(),
};

function regionBox(model: AnimalModel, region: RegionId, def: RegionDef | undefined): THREE.Box3 {
  const kinds = def?.boxKinds ?? null;
  const box = new THREE.Box3();
  for (const inst of model.instances) {
    if (!inst.regions.includes(region)) continue;
    if (kinds && !kinds.includes(inst.def.kind)) continue;
    box.union(inst.box);
  }
  if (box.isEmpty()) for (const inst of model.instances) if (inst.regions.includes(region)) box.union(inst.box);
  if (box.isEmpty()) box.copy(model.bounds);
  return box;
}

export function regionBase(region: RegionId): { base: string; side: 'L' | 'R' | null } {
  const m = /^(forelimb|hindlimb)_(left|right)$/.exec(region);
  if (m) return { base: m[1], side: m[2] === 'left' ? 'L' : 'R' };
  return { base: region, side: null };
}

export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const { gl, camera, size } = useThree();
  const view = useAtlas((s) => s.view);
  const speciesId = useAtlas((s) => s.speciesId);
  const cameraCmd = useAtlas((s) => s.cameraCmd);
  const lastRegion = useRef<{ box: THREE.Box3; az: number; polar: number; region: RegionId } | null>(null);
  const prevView = useRef<'home' | 'atlas' | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  cameraRuntime.camera = camera;
  cameraRuntime.size = size;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    cameraRuntime.controls = c;
    (window as unknown as { __vetatlasControls?: unknown }).__vetatlasControls = c;
    const A = CameraControlsImpl.ACTION;
    c.mouseButtons.wheel = A.NONE;
    c.mouseButtons.left = A.ROTATE;
    c.mouseButtons.right = A.TRUCK;
    c.mouseButtons.middle = A.DOLLY;
    c.touches.one = A.TOUCH_ROTATE;
    c.touches.two = A.TOUCH_DOLLY_TRUCK;
    c.touches.three = A.TOUCH_TRUCK;
    c.smoothTime = 0.45;
    c.draggingSmoothTime = 0.08;
    c.dollyToCursor = false;
    c.minDistance = 0.08;
    c.maxDistance = 60;
    c.minPolarAngle = 0.04;
    c.maxPolarAngle = Math.PI * 0.6;
    c.truckSpeed = 1.6;
    return () => {
      cameraRuntime.controls = null;
    };
  }, []);

  const padFor = (box: THREE.Box3) => {
    const sz = new THREE.Vector3();
    box.getSize(sz);
    const p = Math.max(sz.x, sz.y, sz.z) * 0.1 + 0.03;
    return { paddingTop: p, paddingBottom: p, paddingLeft: p, paddingRight: p };
  };

  const overview = (transition: boolean) => {
    const c = ref.current;
    const m = speciesId ? models.full.get(speciesId) : null;
    if (!c || !m) return;
    const box = m.bounds.clone();
    c.fitToBox(box, transition, padFor(box));
    c.rotateTo(0.0, 1.42, transition);
    lastRegion.current = null;
    box.getCenter(cameraRuntime.focusCenter);
  };

  const focusRegion = (region: RegionId, transition = true) => {
    const c = ref.current;
    const m = speciesId ? models.full.get(speciesId) : null;
    if (!c || !m) return;
    const { base, side } = regionBase(region);
    const def = m.payload.regions.find((r) => r.id === base);
    const box = regionBox(m, region, def);
    const az = side === 'R' ? Math.PI - (def?.view.azimuth ?? 0) : def?.view.azimuth ?? 0;
    const polar = def?.view.polar ?? 1.45;
    lastRegion.current = { box, az, polar, region };
    box.getCenter(cameraRuntime.focusCenter);
    c.fitToBox(box, transition, padFor(box));
    c.rotateTo(az, polar, transition);
  };

  const refit = (reset: boolean) => {
    const c = ref.current;
    if (!c) return;
    const lr = lastRegion.current;
    const az = c.azimuthAngle, polar = c.polarAngle;
    if (lr) {
      c.fitToBox(lr.box, true, padFor(lr.box));
      c.rotateTo(reset ? lr.az : az, reset ? lr.polar : polar, true);
    } else {
      const m = speciesId ? models.full.get(speciesId) : null;
      if (!m) return;
      c.fitToBox(m.bounds, true, padFor(m.bounds));
      c.rotateTo(reset ? 0 : az, reset ? 1.42 : polar, true);
    }
  };

  // view transitions (home ↔ atlas)
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const aspect = size.width / Math.max(1, size.height);
    if (view === 'home') {
      const compact = aspect < 0.9;
      c.setLookAt(0.2, compact ? 3.4 : 2.6, compact ? 9.2 : 10.2, 0, compact ? 0.55 : 0.8, 0, prevView.current === 'atlas');
      lastRegion.current = null;
    } else if (view === 'atlas') {
      const slot = homeState.slots.find((s) => s.id === speciesId);
      if (slot && prevView.current === 'home') {
        const p = new THREE.Vector3(), t = new THREE.Vector3();
        c.getPosition(p);
        c.getTarget(t);
        c.setLookAt(p.x - slot.position.x, p.y, p.z - slot.position.z, t.x - slot.position.x, t.y, t.z - slot.position.z, false);
      }
      const region = useAtlas.getState().region;
      if (region) focusRegion(region, true);
      else overview(true);
    }
    prevView.current = view;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, speciesId]);

  // spinning animal: dolly in while it turns
  const spinning = useAtlas((s) => s.spinning);
  useEffect(() => {
    const c = ref.current;
    if (!c || !spinning) return;
    const slot = homeState.slots.find((s) => s.id === spinning);
    const m = models.skin.get(spinning);
    if (!slot || !m) return;
    const box = m.bounds.clone().translate(slot.position);
    c.fitToBox(box, true, padFor(box));
  }, [spinning]);

  // camera commands from the UI
  useEffect(() => {
    if (!cameraCmd) return;
    const c = ref.current;
    if (!c) return;
    const cmd: CameraCommand = cameraCmd.cmd;
    switch (cmd.type) {
      case 'focusRegion':
        focusRegion(cmd.region);
        break;
      case 'refit':
        refit(false);
        break;
      case 'refitReset':
        refit(true);
        break;
      case 'overview':
        overview(true);
        break;
      case 'view': {
        const map = { left: [0, 1.45], right: [Math.PI, 1.45], front: [-Math.PI / 2, 1.4], back: [Math.PI / 2, 1.4], top: [0.0001, 0.06], bottom: [0.0001, Math.PI - 0.08] } as const;
        const [az, po] = map[cmd.view];
        c.rotateTo(az, po, true);
        break;
      }
      case 'zoom':
        c.dolly(cmd.delta * c.distance, true);
        break;
      case 'fitStructure': {
        const m = atlasRuntime.model;
        const inst = m?.byKey.get(cmd.key);
        if (inst) {
          const box = inst.box.clone();
          const sz = new THREE.Vector3();
          box.getSize(sz);
          const p = Math.max(sz.x, sz.y, sz.z) * 0.6 + 0.03;
          c.fitToBox(box, true, { paddingTop: p, paddingBottom: p, paddingLeft: p, paddingRight: p });
        }
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCmd]);

  // wheel = peel depth, ctrl/⌘+wheel = zoom
  useEffect(() => {
    const el = gl.domElement;
    let lastBand = -1;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = ref.current;
      if (!c) return;
      if (useAtlas.getState().view !== 'atlas') {
        c.dolly(-e.deltaY * 0.0012 * c.distance, true);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        c.dolly(-e.deltaY * 0.002 * c.distance, true);
        return;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 200 : e.deltaY;
      const s = useAtlas.getState();
      s.setDepth(s.depth + dy * 0.0011);
      const band = s.depth < 0.34 ? 0 : s.depth < 0.68 ? 1 : s.depth < 0.95 ? 2 : 3;
      if (band !== lastBand) {
        if (lastBand !== -1) haptic('toggle');
        lastBand = band;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl]);

  // tap / double tap / triple tap + hover picking on structures
  useEffect(() => {
    const el = gl.domElement;
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null;
    let taps = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let hoverT = 0;
    const pick = (x: number, y: number): string | null => {
      const m = atlasRuntime.model;
      if (!m || useAtlas.getState().view !== 'atlas') return null;
      const rect = el.getBoundingClientRect();
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const meshes: THREE.Mesh[] = [];
      for (const inst of m.instances) if (inst.node.visible) for (const mesh of inst.meshes) if (mesh.visible) meshes.push(mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      return (hits[0]?.object.userData.key as string | undefined) ?? null;
    };
    const resetTaps = () => {
      taps = 0;
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = null;
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 8 || dt > 600) return;
      if (useAtlas.getState().view !== 'atlas') return;
      taps++;
      if (tapTimer) clearTimeout(tapTimer);
      if (taps === 1) {
        const key = pick(e.clientX, e.clientY);
        const s = useAtlas.getState();
        if (key) {
          haptic('select');
          s.select(key);
        } else if (s.selected) s.select(null);
        tapTimer = setTimeout(resetTaps, 400);
      } else if (taps === 2) {
        haptic('double');
        refit(false);
        tapTimer = setTimeout(resetTaps, 400);
      } else {
        haptic('triple');
        refit(true);
        resetTaps();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const now = performance.now();
      if (now - hoverT < 70) return;
      hoverT = now;
      const key = pick(e.clientX, e.clientY);
      useAtlas.getState().setHovered(key);
      el.style.cursor = key ? 'pointer' : '';
    };
    const onLeave = () => useAtlas.getState().setHovered(null);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, raycaster, speciesId]);

  useFrame(() => {
    cameraRuntime.tick?.();
  });

  return <CameraControls ref={ref} makeDefault />;
}

/** world-space anchor of a region hotspot */
export function regionAnchor(model: AnimalModel, region: RegionId): THREE.Vector3 | null {
  const { base, side } = regionBase(region);
  const def = model.payload.regions.find((r) => r.id === base);
  if (!def) return null;
  const p = resolvePoint(def.anchor, model.rig, side);
  return new THREE.Vector3(p[0], p[1], p[2]);
}
