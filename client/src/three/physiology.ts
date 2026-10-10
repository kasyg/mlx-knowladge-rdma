import * as THREE from 'three';
import type { AnimalModel, StructureInstance } from './animal.ts';
import type { Physiology } from '@shared/types';

/**
 * Drives heartbeat, breathing, blood flow dashes, air particles and food
 * transit. Everything is derived from the structures the model already has.
 */
export class PhysiologyDriver {
  private heart: StructureInstance | null;
  private lungs: StructureInstance[];
  private diaphragm: StructureInstance | null;
  private vessels: StructureInstance[];
  private airPath: THREE.CatmullRomCurve3 | null = null;
  private foodPath: THREE.CatmullRomCurve3 | null = null;
  private airParticles: THREE.InstancedMesh | null = null;
  private foodParticles: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  group = new THREE.Group();
  private heartBase = new THREE.Vector3();
  private lungCenters: THREE.Vector3[] = [];
  private diaphragmBase = new THREE.Vector3();

  constructor(private model: AnimalModel, private phys: Physiology) {
    const H = model.rig.H;
    this.heart = model.byKey.get('cor') ?? null;
    this.lungs = ['pulmo_L', 'pulmo_R'].map((k) => model.byKey.get(k)).filter((x): x is StructureInstance => !!x);
    this.diaphragm = model.byKey.get('diaphragma') ?? null;
    this.vessels = model.instances.filter((i) => i.def.kind === 'artery' || i.def.kind === 'vein');
    if (this.heart) this.heart.box.getCenter(this.heartBase);
    for (const l of this.lungs) {
      const c = new THREE.Vector3();
      l.box.getCenter(c);
      this.lungCenters.push(c);
    }
    if (this.diaphragm) this.diaphragm.box.getCenter(this.diaphragmBase);

    const L = model.rig.landmarks;
    const v = (p: number[]) => new THREE.Vector3(p[0], p[1], p[2]);
    // air: nostril → nasal cavity → pharynx → larynx → trachea → bifurcation → lung
    const airPts = [v(L.nostril_L).add(new THREE.Vector3(0, 0.01 * H, -0.01 * H)), v(L.nasal_cavity), v(L.pharynx), v(L.larynx), v(L.throat), v(L.neck_base_ventral).add(new THREE.Vector3(0, 0.04 * H, 0)), v(L.thoracic_inlet).add(new THREE.Vector3(0, -0.012 * H, 0)), v(L.trachea_bifurcation), v(L.lung_L)];
    this.airPath = new THREE.CatmullRomCurve3(airPts, false, 'centripetal');
    // food: mouth → pharynx → oesophagus → stomach → intestine → rectum
    const stomachEnd = model.payload.meta.stomach === 'ruminant' ? v(L.abdomen_center).add(new THREE.Vector3(0.02 * H, 0, 0.1 * H)) : v(L.stomach);
    const foodPts = [v(L.mouth), v(L.tongue), v(L.pharynx).add(new THREE.Vector3(0.02 * H, 0, 0)), v(L.throat).add(new THREE.Vector3(0, 0.032 * H, 0.02 * H)), v(L.neck_base_ventral).add(new THREE.Vector3(0, 0.065 * H, 0.022 * H)), v(L.thoracic_inlet).add(new THREE.Vector3(0, 0.02 * H, 0.016 * H)), v(L.trachea_bifurcation).add(new THREE.Vector3(0, 0.04 * H, 0.012 * H)), v(L.diaphragm_center).add(new THREE.Vector3(0, 0.08 * H, 0.02 * H)), stomachEnd, v(L.intestine_center), v(L.colon).add(new THREE.Vector3(0, 0.05 * H, 0)), v(L.rectum), v(L.anus)];
    this.foodPath = new THREE.CatmullRomCurve3(foodPts, false, 'centripetal');

    const airGeo = new THREE.SphereGeometry(0.007 * H, 8, 6);
    const airMat = new THREE.MeshStandardMaterial({ color: '#7fb6d8', emissive: '#3b7fb0', emissiveIntensity: 0.35, roughness: 0.4 });
    this.airParticles = new THREE.InstancedMesh(airGeo, airMat, 36);
    this.airParticles.name = 'air-particles';
    const foodGeo = new THREE.SphereGeometry(0.014 * H, 10, 8);
    const foodMat = new THREE.MeshStandardMaterial({ color: '#8c6a3f', roughness: 0.8 });
    this.foodParticles = new THREE.InstancedMesh(foodGeo, foodMat, 5);
    this.foodParticles.name = 'food-particles';
    this.group.add(this.airParticles, this.foodParticles);
  }

  setVisible(air: boolean, food: boolean) {
    if (this.airParticles) this.airParticles.visible = air;
    if (this.foodParticles) this.foodParticles.visible = food;
  }

  update(time: number, speed: number, playing: boolean, flowOn: boolean) {
    const t = time * speed;
    const hr = this.phys.heartRate / 60;
    const beat = playing ? heartWave((t * hr) % 1) : 0;
    if (this.heart) {
      const s = 1 + 0.07 * beat;
      for (const m of this.heart.meshes) {
        m.position.copy(this.heartBase).multiplyScalar(1 - s);
        m.scale.setScalar(s);
      }
    }
    const rr = this.phys.respRate / 60;
    const breath = playing ? 0.5 - 0.5 * Math.cos(t * rr * Math.PI * 2) : 0;
    this.lungs.forEach((l, i) => {
      const s = 1 + 0.06 * breath;
      for (const m of l.meshes) {
        m.position.copy(this.lungCenters[i]).multiplyScalar(1 - s);
        m.scale.setScalar(s);
      }
    });
    if (this.diaphragm) {
      const dx = 0.03 * this.model.rig.H * breath; // flattens caudally on inspiration
      for (const m of this.diaphragm.meshes) m.position.x = dx;
    }
    for (const vInst of this.vessels) for (const u of vInst.uniforms) {
      u.uFlow.value = flowOn && playing ? 1 : 0;
      u.uTime.value = t;
    }
    if (this.airParticles && this.airPath) {
      const n = this.airParticles.count;
      const dir = Math.sin(t * rr * Math.PI * 2) >= 0 ? 1 : -1; // in during inspiration, out during expiration
      for (let i = 0; i < n; i++) {
        const u = ((i / n) + (playing ? dir * t * 0.12 : 0) + 10) % 1;
        const p = this.airPath.getPointAt(u);
        this.dummy.position.copy(p).add(new THREE.Vector3(Math.sin(i * 12.9) * 0.004, Math.cos(i * 7.3) * 0.004, Math.sin(i * 3.1) * 0.004).multiplyScalar(this.model.rig.H));
        this.dummy.updateMatrix();
        this.airParticles.setMatrixAt(i, this.dummy.matrix);
      }
      this.airParticles.instanceMatrix.needsUpdate = true;
    }
    if (this.foodParticles && this.foodPath) {
      const n = this.foodParticles.count;
      for (let i = 0; i < n; i++) {
        const u = ((i / n) * 0.9 + (playing ? t * 0.02 : 0) + 10) % 1;
        const p = this.foodPath.getPointAt(u);
        this.dummy.position.copy(p);
        const s = u < 0.3 ? 1 : 1.35;
        this.dummy.scale.setScalar(s);
        this.dummy.updateMatrix();
        this.foodParticles.setMatrixAt(i, this.dummy.matrix);
      }
      this.foodParticles.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.airParticles?.geometry.dispose();
    (this.airParticles?.material as THREE.Material)?.dispose();
    this.foodParticles?.geometry.dispose();
    (this.foodParticles?.material as THREE.Material)?.dispose();
  }
}

/** two-bump heartbeat: atrial then ventricular contraction */
function heartWave(p: number) {
  const bump = (c: number, w: number) => Math.exp(-((p - c) * (p - c)) / (2 * w * w));
  return Math.min(1, bump(0.12, 0.05) * 0.5 + bump(0.3, 0.07));
}
