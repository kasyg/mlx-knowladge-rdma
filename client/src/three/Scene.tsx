import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas } from '../state/store.ts';
import { HomeStage } from './HomeStage.tsx';
import { AtlasStage } from './AtlasStage.tsx';
import { CameraRig, cameraRuntime } from './CameraRig.tsx';
import { PostFX } from './PostFX.tsx';
import { detectQuality, effectiveQuality, type EffectiveQuality } from './quality.ts';

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // image-based light: soft ambient and the wet speculars of fascia and cartilage
    scene.environmentIntensity = 0.42;
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/** direction from the azimuth (around y, 0 = +z) and the elevation */
function dirOf(az: number, el: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

const LIGHT_DIST = 12;
const tmpTarget = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/**
 * Studio light rig that turns with the viewer: a warm key light from the upper
 * left of the camera (casts the shadows), a cool low fill from the right and a
 * rim light from behind that separates the silhouette. Whatever side of the
 * animal the student looks at, it is lit and shaded the same way.
 * The shadow frustum is fitted to what is in view, so a zoomed-in joint gets
 * sharp contact shadows and the whole animal still casts one on the ground.
 */
function Lights({ quality }: { quality: EffectiveQuality }) {
  const view = useAtlas((s) => s.view);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const state = useRef({ az: Number.NaN, half: 0 });
  const mapSize = quality === 'high' ? 2048 : 1024;

  useEffect(() => {
    const l = key.current;
    if (!l) return;
    if (l.shadow.mapSize.x !== mapSize) {
      l.shadow.mapSize.set(mapSize, mapSize);
      l.shadow.map?.dispose();
      (l.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    // softer penumbra on the larger map (radius in shadow-map texels)
    l.shadow.radius = quality === 'high' ? 5 : 3;
    l.shadow.needsUpdate = true;
    // the normal offset depends on the texel size: refit the frustum on the next frame
    state.current.half = 0;
  }, [mapSize, quality]);

  useFrame((_, dt) => {
    const k = key.current;
    const f = fill.current;
    const r = rim.current;
    if (!k || !f || !r) return;
    const c = cameraRuntime.controls;
    if (c) c.getTarget(tmpTarget);
    else tmpTarget.set(0, 1, 0);
    // camera azimuth around its target, followed with a little lag
    const camAz = Math.atan2(camera.position.x - tmpTarget.x, camera.position.z - tmpTarget.z);
    const s = state.current;
    if (Number.isNaN(s.az)) s.az = camAz;
    let d = camAz - s.az;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.az += d * Math.min(1, dt * 5);
    // shadow frustum fitted to the view, in steps so it does not shimmer while zooming
    const dist = camera.position.distanceTo(tmpTarget);
    const want = view === 'home' ? 7 : THREE.MathUtils.clamp(dist * 0.8, 0.5, 2.8);
    const half = 0.5 * Math.pow(1.25, Math.ceil(Math.log(want / 0.5) / Math.log(1.25)));
    if (half !== s.half) {
      s.half = half;
      const cam = k.shadow.camera as THREE.OrthographicCamera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 0.5;
      cam.far = LIGHT_DIST * 2;
      cam.updateProjectionMatrix();
      // world-space normal offset of the shadow lookup, about a texel and a half
      k.shadow.normalBias = ((2 * half) / mapSize) * 1.5;
    }
    const place = (l: THREE.DirectionalLight, az: number, el: number) => {
      dirOf(az, el, tmpDir);
      l.position.copy(tmpTarget).addScaledVector(tmpDir, LIGHT_DIST);
      l.target.position.copy(tmpTarget);
      l.target.updateMatrixWorld();
    };
    place(k, s.az - 0.62, 0.9);
    place(f, s.az + 1.25, 0.22);
    place(r, s.az + Math.PI + 0.55, 0.62);
    // the studio environment turns with the rig, so its reflections match the lights from every side
    scene.environmentRotation.set(0, s.az, 0);
  });

  return (
    <>
      <hemisphereLight args={['#fbf6ee', '#8f8272', 0.26]} />
      <directionalLight ref={key} color="#fff1df" intensity={2.6} castShadow shadow-bias={-0.00025} />
      <directionalLight ref={fill} color="#dfe8ff" intensity={0.7} />
      <directionalLight ref={rim} color="#ffffff" intensity={0.9} />
    </>
  );
}

function Ground() {
  const view = useAtlas((s) => s.view);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(60,55,48,0.16)');
    g.addColorStop(0.6, 'rgba(60,55,48,0.05)');
    g.addColorStop(1, 'rgba(60,55,48,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const r = view === 'home' ? 9 : 3.2;
  return (
    <group>
      {/* the shadow catcher stays in the AO depth pass: hooves standing on it get contact occlusion */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]} receiveShadow userData={{ aoKeep: true }}>
        <circleGeometry args={[view === 'home' ? 14 : 6, 48]} />
        <shadowMaterial transparent opacity={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0002, 0]}>
        <planeGeometry args={[r * 2, r * 2]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** keeps the perspective FOV sensible for portrait phones */
function FovAdapter() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    cam.fov = aspect < 0.8 ? 62 : aspect < 1.2 ? 50 : 40;
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function TimeTicker() {
  useFrame(() => {
    /* keeps the loop alive for animations; actual work happens in stages */
  });
  return null;
}

export function Scene() {
  const view = useAtlas((s) => s.view);
  const setting = useAtlas((s) => s.settings.quality);
  const [detected, setDetected] = useState<EffectiveQuality | null>(null);
  const quality = effectiveQuality(setting, detected);
  return (
    <Canvas
      className="atlas-canvas"
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ fov: 40, near: 0.02, far: 200, position: [0, 2.4, 9] }}
      onCreated={({ gl }) => {
        // Khronos PBR Neutral keeps the tissue colours true (no hue shift, no extra contrast)
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 0.96;
        gl.shadowMap.type = THREE.PCFShadowMap;
        setDetected(detectQuality(gl));
      }}
      data-quality={quality}
    >
      <StudioEnvironment />
      <Lights quality={quality} />
      <Ground />
      <FovAdapter />
      <TimeTicker />
      {view === 'home' ? <HomeStage /> : <AtlasStage />}
      <CameraRig />
      {quality === 'high' && <PostFX />}
    </Canvas>
  );
}
