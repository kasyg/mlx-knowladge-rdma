import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SPECIES_IDS, type SpeciesId } from '@shared/types';
import { useAtlas, models, SPIN_MS } from '../state/store.ts';
import { fetchSpecies } from '../api/client.ts';
import { buildAnimal, type AnimalModel } from './animal.ts';
import { haptic } from '../utils/haptics.ts';

export interface HomeSlot {
  id: SpeciesId;
  position: THREE.Vector3;
}

/** Layout of the species row; compact (portrait) screens use a two-row arrangement. */
export function homeLayout(aspect: number): HomeSlot[] {
  if (aspect < 0.9) {
    return [
      { id: 'horse', position: new THREE.Vector3(-1.5, 0, -2.4) },
      { id: 'cow', position: new THREE.Vector3(1.7, 0, -2.4) },
      { id: 'goat', position: new THREE.Vector3(-1.6, 0, 1.0) },
      { id: 'dog', position: new THREE.Vector3(0.2, 0, 1.3) },
      { id: 'cat', position: new THREE.Vector3(1.7, 0, 1.7) },
    ];
  }
  return [
    { id: 'horse', position: new THREE.Vector3(-3.9, 0, 0) },
    { id: 'cow', position: new THREE.Vector3(-1.0, 0, 0.1) },
    { id: 'goat', position: new THREE.Vector3(1.25, 0, 0.4) },
    { id: 'dog', position: new THREE.Vector3(2.75, 0, 0.6) },
    { id: 'cat', position: new THREE.Vector3(4.05, 0, 0.9) },
  ];
}

export const homeState = {
  slots: [] as HomeSlot[],
  spinRotation: 0,
  spinningId: null as SpeciesId | null,
  spinStart: 0,
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function HomeStage() {
  const { size, scene, camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const [ready, setReady] = useState<Record<string, AnimalModel>>({});
  const hovered = useRef<SpeciesId | null>(null);
  const selectSpecies = useAtlas((s) => s.selectSpecies);
  const spinning = useAtlas((s) => s.spinning);
  const setHovered = useAtlas((s) => s.setHovered);
  const setLoading = useRef(useAtlas.getState());

  const aspect = size.width / Math.max(1, size.height);
  const slots = homeLayout(aspect);
  homeState.slots = slots;

  // build skin-only models once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const id of SPECIES_IDS) {
        if (cancelled) return;
        if (!models.skin.has(id)) {
          let payload = useAtlas.getState().payloads[id];
          if (!payload) {
            payload = await fetchSpecies(id);
            useAtlas.setState((s) => ({ payloads: { ...s.payloads, [id]: payload! } }));
          }
          const m = await buildAnimal(payload, { skinOnly: true, chunk: 2 });
          models.skin.set(id, m);
        }
        setReady((r) => ({ ...r, [id]: models.skin.get(id)! }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // mount models into the group
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (const slot of slots) {
      const m = ready[slot.id];
      if (!m) continue;
      if (m.root.parent !== g) g.add(m.root);
      m.root.position.copy(slot.position);
      m.root.rotation.set(0, 0, 0);
      m.root.visible = true;
    }
    return () => {
      for (const m of Object.values(ready)) m.root.parent?.remove(m.root);
    };
  }, [ready, slots.map((s) => s.position.toArray().join(',')).join('|')]);

  // picking on the home stage
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downPos: [number, number] | null = null;
    const pick = (x: number, y: number): SpeciesId | null => {
      const rect = el.getBoundingClientRect();
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const slot of homeState.slots) {
        const m = models.skin.get(slot.id);
        if (!m || !m.root.parent) continue;
        const hits = ray.intersectObjects(m.instances.flatMap((i) => i.meshes), false);
        if (hits.length) return slot.id;
      }
      return null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const id = pick(e.clientX, e.clientY);
      hovered.current = id;
      el.style.cursor = id ? 'pointer' : '';
      setHovered(id ? `species:${id}` : null);
    };
    const onDown = (e: PointerEvent) => {
      downPos = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
      downPos = null;
      if (moved > 8) return;
      const id = pick(e.clientX, e.clientY);
      if (id && !useAtlas.getState().spinning) {
        haptic('select');
        void selectSpecies(id);
      }
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.style.cursor = '';
    };
  }, [gl, camera, selectSpecies, setHovered]);

  useEffect(() => {
    if (spinning) {
      homeState.spinningId = spinning;
      homeState.spinStart = performance.now();
    } else homeState.spinningId = null;
  }, [spinning]);

  useFrame((_, dt) => {
    const now = performance.now();
    const hov = useAtlas.getState().hovered;
    for (const slot of slots) {
      const m = models.skin.get(slot.id);
      if (!m || !m.root.parent) continue;
      const isHover = hov === `species:${slot.id}`;
      const isSpin = homeState.spinningId === slot.id;
      for (const inst of m.instances) for (const u of inst.uniforms) {
        u.uHighlight.value += ((isHover && !homeState.spinningId ? 0.35 : 0) - u.uHighlight.value) * Math.min(1, dt * 8);
        u.uDim.value += ((homeState.spinningId && !isSpin ? 0.85 : 0) - u.uDim.value) * Math.min(1, dt * 4);
      }
      if (isSpin) {
        const t = Math.min(1, (now - homeState.spinStart) / SPIN_MS);
        m.root.rotation.y = easeInOut(t) * Math.PI * 2;
        homeState.spinRotation = m.root.rotation.y;
      } else {
        m.root.rotation.y = 0;
      }
    }
    void scene;
    void setLoading;
  });

  return <group ref={group} />;
}
