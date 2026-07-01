import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

function HoloElement({ data }) {
  const meshRef = useRef();
  const position = useMemo(() => data.position || [0, 0, 0], [data.position]);
  const rotation = useMemo(() => data.rotation || [0, 0, 0], [data.rotation]);
  const scale = useMemo(() => data.scale || [1, 1, 1], [data.scale]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    if (data.animation === 'spin') {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.x += 0.005;
    } else if (data.animation === 'float') {
      meshRef.current.position.y = (data.position?.[1] || 0) + Math.sin(t * 1.5) * 0.3;
    } else if (data.animation === 'pulse') {
      const s = 1 + Math.sin(t * 3) * 0.12;
      meshRef.current.scale.set(scale[0] * s, scale[1] * s, scale[2] * s);
    } else if (data.animation === 'wobble') {
      meshRef.current.rotation.z = Math.sin(t * 2) * 0.25;
    } else if (data.animation === 'scan') {
      meshRef.current.position.y = Math.sin(t * 2) * 2;
    }
  });

  const GeometryComponent = useMemo(() => {
    switch (data.type) {
      case 'box': return <boxGeometry args={[1, 1, 1]} />;
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'torus': return <torusGeometry args={[1, 0.3, 16, 32]} />;
      case 'icosahedron': return <icosahedronGeometry args={[1, 0]} />;
      case 'cone': return <coneGeometry args={[0.5, 1, 32]} />;
      case 'ring': return <ringGeometry args={[0.5, 1, 32]} />;
      case 'sphere': default: return <sphereGeometry args={[0.5, 32, 32]} />;
    }
  }, [data.type]);

  return (
    <group position={position} rotation={rotation}>
      <mesh ref={meshRef} scale={scale}>
        {GeometryComponent}
        <meshBasicMaterial
          color={data.color || '#00f3ff'}
          wireframe={data.wireframe !== false}
          transparent
          opacity={data.opacity || 0.7}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {data.label && (
        <Html position={[0, 1.5, 0]} center distanceFactor={10} zIndexRange={[100, 0]}>
          <div style={{
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--glass-border)',
            padding: '3px 10px', borderRadius: 4,
            fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--primary)',
            whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
          }}>
            {data.label}
          </div>
        </Html>
      )}
    </group>
  );
}

function SceneContent({ scene }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!scene?.elements?.length) return;
    const box = new THREE.Box3();
    scene.elements.forEach(el => {
      const pos = new THREE.Vector3(...(el.position || [0, 0, 0]));
      const sc = new THREE.Vector3(...(el.scale || [1, 1, 1]));
      box.expandByPoint(pos.clone().sub(sc.clone().multiplyScalar(0.5)));
      box.expandByPoint(pos.clone().add(sc.clone().multiplyScalar(0.5)));
    });
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2;
    camera.position.set(center.x + dist * 0.3, center.y + maxDim * 0.4, center.z + dist);
    camera.lookAt(center);
  }, [scene, camera]);

  return (
    <>
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} enableZoom enablePan={false} />
      <ambientLight intensity={0.4} />
      <pointLight position={[8, 8, 8]} intensity={0.7} color="#06b6d4" />
      <pointLight position={[-8, -5, -8]} intensity={0.4} color="#d946ef" />
      <group>
        {scene.elements.map((el, i) => (
          <HoloElement key={el.id || i} data={el} />
        ))}
      </group>
      <gridHelper args={[16, 16, 0x1e293b, 0x0f172a]} position={[0, -3, 0]} />
      <Sparkles count={30} scale={8} size={1} speed={0.2} opacity={0.3} color="#06b6d4" />
    </>
  );
}

export default function HologramProjector({ scene }) {
  if (!scene || !scene.elements || scene.elements.length === 0) {
    return (
      <div data-testid="hologram-empty" style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
      }}>
        <Box size={32} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
        <p style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Enter a prompt to generate a hologram
        </p>
      </div>
    );
  }

  return (
    <div data-testid="hologram-projector" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 12,
        background: 'radial-gradient(circle at center, rgba(6,182,212,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 1,
      }} />

      <Canvas camera={{ position: [0, 3, 8], fov: 45 }} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent', borderRadius: 12 }}>
        <SceneContent scene={scene} />
      </Canvas>

      {/* HUD overlay */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 2,
        padding: '8px 14px', borderRadius: 8,
        background: 'var(--glass)', backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
      }}>
        <p style={{ fontSize: 11, fontFamily: 'Outfit', fontWeight: 500, color: 'var(--primary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {scene.title || 'Hologram'}
        </p>
        <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, maxWidth: 200 }}>
          {scene.description || 'Interactive 3D projection'}
        </p>
      </div>

      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 2,
        padding: '4px 10px', borderRadius: 6,
        background: 'var(--glass)', backdropFilter: 'blur(8px)',
        border: '1px solid var(--glass-border)',
      }}>
        <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--primary)', letterSpacing: '0.2em' }}>
          {scene.elements.length} ELEMENTS
        </span>
      </div>
    </div>
  );
}
