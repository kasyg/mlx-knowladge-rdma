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
  /** tissue shading model, see TISSUE */
  uTissue: { value: number };
  /** fascicle frequency across the muscle (per uv unit) */
  uFasc: { value: number };
  /** muscle activation 0..1 */
  uAct: { value: number };
  /** normalised fibre length (1 = rest) */
  uStretch: { value: number };
  /** tendon / ligament strain (0.04 = 4 %) */
  uStrain: { value: number };
  /** in-place contraction of a muscle without a joint (0..1) and its axis */
  uPulse: { value: number };
  uPulseO: { value: THREE.Vector3 };
  uPulseI: { value: THREE.Vector3 };
}

/** tissue shading models of the vet shader */
export const TISSUE = { none: 0, muscle: 1, tendon: 2, bone: 3, cartilage: 4, nerve: 5, vessel: 6 } as const;

export function tissueOf(kind: StructureKind): number {
  switch (kind) {
    case 'muscle':
    case 'heart':
      return TISSUE.muscle;
    case 'tendon':
    case 'ligament':
      return TISSUE.tendon;
    case 'bone':
      return TISSUE.bone;
    case 'cartilage':
      return TISSUE.cartilage;
    case 'nerve':
      return TISSUE.nerve;
    case 'artery':
    case 'vein':
      return TISSUE.vessel;
    default:
      return TISSUE.none;
  }
}

export const KIND_COLORS: Record<StructureKind, string> = {
  skin: '#c9b8a3',
  bone: '#e6dcc8',
  cartilage: '#bcd3dc',
  muscle: '#9c3a36',
  tendon: '#eeeae2',
  ligament: '#e6dfcf',
  artery: '#c23a33',
  vein: '#36508f',
  heart: '#b23a3f',
  respiratory: '#9fbfd0',
  digestive: '#d7a77a',
  nerve: '#efdf9a',
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
uniform float uPulse;
uniform vec3 uPulseO;
uniform vec3 uPulseI;
`;
const vertexPulse = /* glsl */ `
if (uPulse > 0.0) {
  // in-place contraction: shorten towards the origin, bulge the belly (volume is kept)
  vec3 pax = uPulseI - uPulseO;
  float pL = max(length(pax), 1e-4);
  vec3 pd = pax / pL;
  vec3 prel = transformed - uPulseO;
  float ps = dot(prel, pd);
  vec3 prad = prel - pd * ps;
  float pk = clamp(ps / pL, 0.0, 1.0);
  transformed = uPulseO + pd * (ps * (1.0 - 0.16 * uPulse)) + prad * (1.0 + 0.24 * uPulse * sin(3.14159 * pk));
}
`;
const vertexBody = /* glsl */ `
vVetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vVetUv = uv;
`;
const noiseGlsl = /* glsl */ `
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
/** the peeling cut, shared by the colour and the shadow pass so a dissolving layer casts the shadow it shows */
const dissolveCut = /* glsl */ `
  if (uDissolve > 0.0) {
    float n = vetNoise(vVetWorld * uNoiseScale) * 0.75 + vetNoise(vVetWorld * uNoiseScale * 2.3) * 0.25;
    float h = clamp((vVetWorld.y - uDissolveY.x) / max(0.001, uDissolveY.y - uDissolveY.x), 0.0, 1.0);
    float thr = (1.0 - h) * 0.7 + n * 0.3;
    float d = uDissolve * 1.06;
    if (d > thr) discard;
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
uniform float uTissue;
uniform float uFasc;
uniform float uAct;
uniform float uStretch;
uniform float uStrain;
${noiseGlsl}`;
const fragBody = /* glsl */ `
{
${dissolveCut}
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
  if (uTissue > 0.5 && uTissue < 1.5) {
    // skeletal muscle: fascicles run along v; perimysium septa between them; stretch lengthens the pattern
    float across = vVetUv.x * uFasc;
    float along = vVetUv.y / max(0.6, uStretch);
    float wob = vetNoise(vec3(across * 0.25, along * 2.0, 3.0));
    float fas = vetNoise(vec3(across + wob * 0.8, along * 0.6, 7.0));
    float septa = smoothstep(0.86, 0.99, fract(across + wob * 0.9));
    vec3 m = diffuseColor.rgb * (0.86 + 0.24 * fas);
    m = mix(m, m * 0.58, septa * 0.5);
    m = mix(m, vec3(0.62, 0.09, 0.07), clamp(uAct, 0.0, 1.0) * 0.42);
    m = mix(m, vec3(0.86, 0.6, 0.56), smoothstep(1.03, 1.3, uStretch) * 0.4);
    diffuseColor.rgb = m;
  } else if (uTissue > 1.5 && uTissue < 2.5) {
    // tendon / ligament: collagen crimp bands that straighten under load
    float crimp = 0.5 + 0.5 * sin(vVetUv.y * 140.0 + vetNoise(vec3(vVetUv.x * 9.0, vVetUv.y * 30.0, 1.0)) * 2.5);
    float relaxed = 1.0 - smoothstep(0.004, 0.03, uStrain);
    vec3 t = diffuseColor.rgb * (0.93 + 0.07 * vetNoise(vec3(vVetUv.x * 30.0, vVetUv.y * 6.0, 5.0)));
    t *= 1.0 - 0.09 * crimp * relaxed;
    diffuseColor.rgb = t;
  } else if (uTissue > 2.5 && uTissue < 3.5) {
    // bone: ivory with fine porosity and a warmer cortex
    float pore = vetNoise(vVetWorld * 260.0);
    float mott = vetNoise(vVetWorld * 18.0);
    diffuseColor.rgb *= vec3(1.0, 0.985, 0.95) * (0.9 + 0.1 * mott) * (0.96 + 0.06 * pore);
  } else if (uTissue > 3.5 && uTissue < 4.5) {
    float g = vetNoise(vVetWorld * 120.0);
    diffuseColor.rgb *= 0.95 + 0.06 * g;
  } else if (uTissue > 4.5 && uTissue < 5.5) {
    // nerve: bundles of fascicles along the trunk
    float b = 0.5 + 0.5 * sin(vVetUv.x * 6.2832 * 7.0 + vetNoise(vec3(vVetUv.y * 40.0, vVetUv.x * 4.0, 2.0)) * 2.0);
    diffuseColor.rgb *= 0.9 + 0.12 * b;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.9), uDim * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHiColor, uHighlight * 0.35);
}
`;
const roughBody = /* glsl */ `
if (uTissue > 0.5 && uTissue < 1.5) roughnessFactor = mix(roughnessFactor, 0.42, 0.6);
else if (uTissue > 1.5 && uTissue < 2.5) roughnessFactor = mix(0.42, 0.24, smoothstep(0.0, 0.04, uStrain));
else if (uTissue > 3.5 && uTissue < 4.5) roughnessFactor = 0.22;
`;
const emissiveBody = /* glsl */ `
totalEmissiveRadiance += uHighlight * uHiColor * 0.22;
if (uTissue > 0.5) {
  float vetNV = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  float vetRim = pow(1.0 - vetNV, 2.5);
  if (uTissue < 1.5) {
    // light scattered in the muscle shows at the silhouette; activity warms it
    totalEmissiveRadiance += vec3(0.42, 0.06, 0.04) * vetRim * (0.12 + 0.18 * uAct);
  } else if (uTissue < 2.5) {
    // pearly sheen of the collagen, brighter under load
    totalEmissiveRadiance += vec3(0.7, 0.76, 0.84) * vetRim * 0.16 + vec3(1.0, 0.78, 0.45) * smoothstep(0.01, 0.07, uStrain) * 0.12;
  } else if (uTissue > 3.5 && uTissue < 4.5) {
    totalEmissiveRadiance += vec3(0.55, 0.68, 0.78) * vetRim * 0.2;
  }
}
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
  /** tissue shading model (TISSUE) */
  tissue?: number;
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
    uTissue: { value: o.tissue ?? 0 },
    uFasc: { value: 34 },
    uAct: { value: 0 },
    uStretch: { value: 1 },
    uStrain: { value: 0 },
    uPulse: { value: 0 },
    uPulseO: { value: new THREE.Vector3() },
    uPulseI: { value: new THREE.Vector3(0, 1, 0) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexPulse}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${vertexBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fragBody}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${roughBody}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissiveBody}`);
  };
  m.customProgramCacheKey = () => 'vetatlas-std-2';
  return m;
}

/**
 * Depth material for the shadow map: applies the same peeling cut and the same
 * in-place contraction as the colour pass, so shadows follow what is visible.
 */
function makeDepthMaterial(u: VetUniforms): THREE.MeshDepthMaterial {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = u.uDissolve;
    shader.uniforms.uDissolveY = u.uDissolveY;
    shader.uniforms.uNoiseScale = u.uNoiseScale;
    shader.uniforms.uPulse = u.uPulse;
    shader.uniforms.uPulseO = u.uPulseO;
    shader.uniforms.uPulseI = u.uPulseI;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexPulse}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvVetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVetUv = vec2(0.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vVetWorld;\nvarying vec2 vVetUv;\nuniform float uDissolve;\nuniform vec2 uDissolveY;\nuniform float uNoiseScale;\n${noiseGlsl}`,
      )
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${dissolveCut}\n  }`);
  };
  d.customProgramCacheKey = () => 'vetatlas-depth-1';
  return d;
}

/** the shadow-pass material of a vet material (created on first use) */
export function depthMaterialOf(m: THREE.Material): THREE.MeshDepthMaterial | undefined {
  const u = m.userData.u as VetUniforms | undefined;
  if (!u) return undefined;
  if (!m.userData.depth) m.userData.depth = makeDepthMaterial(u);
  return m.userData.depth as THREE.MeshDepthMaterial;
}

/** marks a mesh as a shadow caster and receiver with the matching depth material */
export function enableShadows(mesh: THREE.Mesh): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const d = depthMaterialOf(mat);
  if (d) mesh.customDepthMaterial = d;
}

export function uniformsOf(m: THREE.Material): VetUniforms {
  return m.userData.u as VetUniforms;
}
