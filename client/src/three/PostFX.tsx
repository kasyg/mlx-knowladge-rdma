import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutputShader } from 'three/examples/jsm/shaders/OutputShader.js';
import { cameraRuntime } from './CameraRig.tsx';

/**
 * Ground-truth ambient occlusion (GTAO) for the anatomy: the narrow gaps
 * between muscles, under tendons and around joints receive less ambient light,
 * which is what gives a dissection its depth.
 *
 * Ghosted (see-through) structures, lines and points are left out of the AO
 * depth pass, so a ghost never darkens the structure it surrounds.
 */
class TissueAOPass extends GTAOPass {
  _overrideVisibility(): void {
    const cache = (this as unknown as { _visibilityCache: THREE.Object3D[] })._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const any = o as THREE.Object3D & { isPoints?: boolean; isLine?: boolean; isLine2?: boolean; isMesh?: boolean };
      let hide = !!(any.isPoints || any.isLine || any.isLine2);
      if (!hide && any.isMesh && !o.userData.aoKeep) {
        const mesh = o as THREE.Mesh;
        const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        hide = !m.visible || !m.depthWrite || (m.transparent && m.opacity < 0.75);
      }
      if (hide) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

/**
 * Output pass for a transparent canvas: the composer blends in linear,
 * premultiplied colour, so tone mapping and the sRGB transfer are applied to
 * the un-premultiplied colour and the result is premultiplied again. Without
 * this a see-through ghost over the page background turns milky.
 */
class PremultipliedOutputPass extends OutputPass {
  constructor() {
    super();
    this.material.fragmentShader = OutputShader.fragmentShader
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv );\n\t\t\tfloat vetAlpha = gl_FragColor.a;\n\t\t\tif ( vetAlpha > 0.0001 ) gl_FragColor.rgb /= vetAlpha;')
      .replace(/\}\s*$/, '\tgl_FragColor.rgb *= vetAlpha;\n\t\t}\n');
    this.material.needsUpdate = true;
  }
}

const target = new THREE.Vector3();

interface Fx {
  composer: EffectComposer;
  ao: TissueAOPass;
  output: PremultipliedOutputPass;
}

function createFx(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Fx {
  // multisampled colour target: the composer would otherwise lose the canvas antialiasing
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(gl, rt);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new TissueAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.06, distanceExponent: 1.5, thickness: 0.1, distanceFallOff: 1, scale: 1.9, samples: 16, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 16 });
  ao.blendIntensity = 1;
  composer.addPass(ao);
  const output = new PremultipliedOutputPass();
  composer.addPass(output);
  return { composer, ao, output };
}

export function PostFX() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const fxRef = useRef<Fx | null>(null);

  useEffect(() => {
    const fx = createFx(gl, scene, camera);
    fxRef.current = fx;
    if (import.meta.env.DEV) (window as unknown as { __vetatlasFx?: Fx }).__vetatlasFx = fx;
    return () => {
      fxRef.current = null;
      fx.composer.dispose();
      fx.ao.dispose();
      fx.output.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;
    fx.composer.setPixelRatio(dpr);
    fx.composer.setSize(size.width, size.height);
    // AO at no more than ~1.25 samples per CSS pixel: it is smooth, the colour pass keeps full resolution
    const k = Math.min(1, 1.25 / Math.max(1, dpr));
    fx.ao.setSize(Math.max(1, Math.round(size.width * dpr * k)), Math.max(1, Math.round(size.height * dpr * k)));
  }, [gl, scene, camera, size.width, size.height, dpr]);

  useFrame(() => {
    const fx = fxRef.current;
    if (!fx) {
      gl.render(scene, camera);
      return;
    }
    // the occlusion radius follows the viewing distance: crevices between muscles
    // in an overview, the joint gaps when zoomed in on a few bones
    const c = cameraRuntime.controls;
    if (c) c.getTarget(target);
    else target.set(0, 1, 0);
    const dist = camera.position.distanceTo(target);
    const r = THREE.MathUtils.clamp(dist * 0.022, 0.01, 0.13);
    const u = fx.ao.gtaoMaterial.uniforms;
    u.radius.value = r;
    u.thickness.value = r * 1.6;
    fx.composer.render();
  }, 1);

  return null;
}
