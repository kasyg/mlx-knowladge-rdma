import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useEffect, useMemo, useRef } from 'react';
import { useAtlas } from '../state/store.ts';
import { HomeStage } from './HomeStage.tsx';
import { AtlasStage } from './AtlasStage.tsx';
import { CameraRig } from './CameraRig.tsx';

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

function Lights() {
  const view = useAtlas((s) => s.view);
  const key = useRef<THREE.DirectionalLight>(null);
  const size = view === 'home' ? 7 : 2.4;
  useEffect(() => {
    const l = key.current;
    if (!l) return;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -size;
    cam.right = size;
    cam.top = size;
    cam.bottom = -size;
    cam.near = 0.5;
    cam.far = 40;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [size]);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc9bd', 0.85]} />
      <directionalLight ref={key} position={[4, 9, 6]} intensity={2.1} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={4} />
      <directionalLight position={[-6, 4, -4]} intensity={0.55} />
      <directionalLight position={[0, 3, -8]} intensity={0.35} />
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]} receiveShadow>
        <circleGeometry args={[view === 'home' ? 14 : 6, 48]} />
        <shadowMaterial transparent opacity={0.16} />
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
  return (
    <Canvas
      className="atlas-canvas"
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ fov: 40, near: 0.02, far: 200, position: [0, 2.4, 9] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <StudioEnvironment />
      <Lights />
      <Ground />
      <FovAdapter />
      <TimeTicker />
      {view === 'home' ? <HomeStage /> : <AtlasStage />}
      <CameraRig />
    </Canvas>
  );
}
