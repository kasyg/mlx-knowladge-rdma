/**
 * Export one layer of the current model as a binary glTF (GLB).
 * Used by the end-to-end tests to exercise the external-model pipeline with a
 * known skeleton, and handy for 3D printing or editing the procedural meshes
 * in Blender. The exporter is loaded on demand so it never ships in the
 * normal bundle.
 */
import * as THREE from 'three';
import type { AnimalModel } from './animal.ts';

/** plain BufferGeometry copy of any geometry (subclasses such as SweepGeometry cannot be clone()d without their options) */
export function plainCopy(src: THREE.BufferGeometry, keep: string[] = ['position', 'normal', 'uv', 'color']): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const k of keep) {
    const a = src.getAttribute(k);
    if (a) g.setAttribute(k, (a as THREE.BufferAttribute).clone());
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

export async function exportGroupGLB(model: AnimalModel, group: string): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  model.root.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ color: '#e9e2d3', roughness: 0.6 });
  let n = 0;
  for (const inst of model.instances) {
    if (inst.group !== group) continue;
    for (const mesh of inst.meshes) {
      const g = plainCopy(mesh.geometry, ['position', 'normal', 'uv']);
      g.applyMatrix4(mesh.matrixWorld);
      const m = new THREE.Mesh(g, material);
      m.name = `Object_${n++}`; // anonymous node names, like a downloaded model
      scene.add(m);
    }
  }
  if (!n) throw new Error(`no meshes in layer ${group}`);
  const exporter = new GLTFExporter();
  const out = await exporter.parseAsync(scene, { binary: true, onlyVisible: false });
  if (!(out instanceof ArrayBuffer)) throw new Error('expected a binary glTF');
  return out;
}

/** base64 of a (possibly large) buffer, chunked to stay off the call-stack limit */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}
