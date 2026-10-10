import * as THREE from 'three';
import type { StructureKind } from '@shared/types';

export interface VetUniforms {
  uDissolve: { value: number };
  uDissolveY: { value: THREE.Vector2 };
  uNoiseScale: { value: number };
  uDim: { value: number };
  uHighlight: { value: number };
  uTime: { value: number };
  uFlow: { value: number };
  uFlowSpeed: { value: number };
  uDashes: { value: number };
  uEdgeColor: { value: THREE.Color };
  uPointsY: { value: number };
  uPointsColor: { value: THREE.Color };
  uPointsOn: { value: number };
  uNose: { value: THREE.Vector4 };
  uBellyLight: { value: number };
  uBodyY: { value: THREE.Vector2 };
  uHiColor: { value: THREE.Color };
}

export const KIND_COLORS: Record<StructureKind, string> = {
  skin: '#c9b8a3',
  bone: '#e9e2d3',
  cartilage: '#a6c6d6',
  muscle: '#a84a4c',
  tendon: '#efe8da',
  ligament: '#e2d9c2',
  artery: '#c8413c',
  vein: '#3f5fae',
  heart: '#b23a3f',
  respiratory: '#9fbfd0',
  digestive: '#d7a77a',
  nerve: '#e9d26a',
  sensory: '#2a211c',
  urinary: '#c39ac4',
};

export const ID_COLORS: Record<string, string> = {
  pulmo: '#d9a0a8',
  trachea: '#a9c5d3',
  larynx: '#9fb8c8',
  hepar: '#8a3b3b',
  lien: '#6e2f3f',
  ventriculus: '#d9b48f',
  rumen: '#cfa985',
  reticulum: '#c99f7d',
  omasum: '#c99f7d',
  abomasum: '#d9b48f',
  intestinum_tenue: '#e5b997',
  caecum: '#d9aa84',
  colon: '#d4a37c',
  rectum: '#c89a78',
  pancreas: '#e2c39a',
  vesica_fellea: '#6f8f3a',
  lingua: '#c96b73',
  glandulae_salivariae: '#dcb9a1',
  encephalon: '#d8c0b6',
  medulla_spinalis: '#e4d8c6',
  ren: '#9b4e5a',
  vesica_urinaria: '#d8c0d6',
  cor: '#b23a3f',
  diaphragma: '#b45a5c',
  mm_intercostales: '#b8585a',
  dentes: '#f4f0e6',
};

const vertexHead = /* glsl */ `
varying vec3 vVetWorld;
varying vec2 vVetUv;
`;
const vertexBody = /* glsl */ `
vVetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vVetUv = uv;
`;
const fragHead = /* glsl */ `
varying vec3 vVetWorld;
varying vec2 vVetUv;
uniform float uDissolve;
uniform vec2 uDissolveY;
uniform float uNoiseScale;
uniform float uDim;
uniform float uHighlight;
uniform float uTime;
uniform float uFlow;
uniform float uFlowSpeed;
uniform float uDashes;
uniform vec3 uEdgeColor;
uniform float uPointsY;
uniform vec3 uPointsColor;
uniform float uPointsOn;
uniform vec4 uNose;
uniform float uBellyLight;
uniform vec2 uBodyY;
uniform vec3 uHiColor;
float vetHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vetNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(vetHash(i + vec3(0,0,0)), vetHash(i + vec3(1,0,0)), f.x), mix(vetHash(i + vec3(0,1,0)), vetHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(vetHash(i + vec3(0,0,1)), vetHash(i + vec3(1,0,1)), f.x), mix(vetHash(i + vec3(0,1,1)), vetHash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
`;
const fragBody = /* glsl */ `
{
  if (uDissolve > 0.0) {
    float n = vetNoise(vVetWorld * uNoiseScale) * 0.75 + vetNoise(vVetWorld * uNoiseScale * 2.3) * 0.25;
    float h = clamp((vVetWorld.y - uDissolveY.x) / max(0.001, uDissolveY.y - uDissolveY.x), 0.0, 1.0);
    float thr = (1.0 - h) * 0.7 + n * 0.3;
    float d = uDissolve * 1.06;
    if (d > thr) discard;
    float edge = 1.0 - smoothstep(0.0, 0.035, thr - d);
    diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeColor, edge * 0.6);
  }
  if (uPointsOn > 0.5) {
    float k = 1.0 - smoothstep(uPointsY - 0.06, uPointsY + 0.06, vVetWorld.y);
    float dn = distance(vVetWorld, uNose.xyz);
    k = max(k, 1.0 - smoothstep(uNose.w * 0.6, uNose.w, dn));
    diffuseColor.rgb = mix(diffuseColor.rgb, uPointsColor, k);
  }
  if (uBellyLight > 0.0) {
    float hb = clamp((vVetWorld.y - uBodyY.x) / max(0.001, uBodyY.y - uBodyY.x), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.94, 0.9), uBellyLight * (1.0 - smoothstep(0.1, 0.45, hb)));
  }
  if (uFlow > 0.5) {
    float s = fract(vVetUv.y * uDashes - uTime * uFlowSpeed);
    float dash = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.3, 0.45, s));
    diffuseColor.rgb += dash * 0.3;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.9), uDim * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHiColor, uHighlight * 0.35);
}
`;
const emissiveBody = /* glsl */ `
totalEmissiveRadiance += uHighlight * uHiColor * 0.22;
`;

export interface MakeMaterialOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  H?: number;
  clearcoat?: number;
  emissive?: THREE.ColorRepresentation;
  highlight?: THREE.ColorRepresentation;
}

export function makeMaterial(o: MakeMaterialOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? '#cccccc',
    roughness: o.roughness ?? 0.6,
    metalness: o.metalness ?? 0.0,
    map: o.map ?? null,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    emissive: o.emissive ?? '#000000',
  });
  const H = o.H ?? 1;
  const u: VetUniforms = {
    uDissolve: { value: 0 },
    uDissolveY: { value: new THREE.Vector2(0, H) },
    uNoiseScale: { value: 5.5 / H },
    uDim: { value: 0 },
    uHighlight: { value: 0 },
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uFlowSpeed: { value: 1 },
    uDashes: { value: 10 },
    uEdgeColor: { value: new THREE.Color('#f4efe6') },
    uPointsY: { value: -1 },
    uPointsColor: { value: new THREE.Color('#1d1410') },
    uPointsOn: { value: 0 },
    uNose: { value: new THREE.Vector4(0, 0, 0, 0) },
    uBellyLight: { value: 0 },
    uBodyY: { value: new THREE.Vector2(0, H) },
    uHiColor: { value: new THREE.Color(o.highlight ?? '#ffd24d') },
  };
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${vertexHead}`).replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${vertexBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fragBody}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissiveBody}`);
  };
  m.customProgramCacheKey = () => 'vetatlas-std-1';
  return m;
}

export function uniformsOf(m: THREE.Material): VetUniforms {
  return m.userData.u as VetUniforms;
}
