import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

function HologramCore({ isSpeaking }) {
  const outerRef = useRef();
  const innerRef = useRef();
  const ringRef = useRef();

  const colors = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const primary = css.getPropertyValue('--primary').trim() || '#F7E7CE';
    const secondary = css.getPropertyValue('--secondary').trim() || '#064E3B';
    return { wire: primary, core: secondary };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.15;
      outerRef.current.rotation.z = Math.sin(t * 0.4) * 0.08;
      const s = 1 + Math.sin(t * 1.5) * 0.04 + (isSpeaking ? Math.sin(t * 12) * 0.08 : 0);
      outerRef.current.scale.setScalar(s);
    }
    if (innerRef.current) {
      innerRef.current.rotation.x = -t * 0.35;
      innerRef.current.rotation.y = t * 0.25;
      const s = 0.5 + (isSpeaking ? Math.sin(t * 16) * 0.15 : 0);
      innerRef.current.scale.setScalar(s);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.08;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <group position={[0, 0.3, 0]}>
        {/* Outer shell */}
        <mesh ref={outerRef}>
          <icosahedronGeometry args={[1.2, 1]} />
          <meshBasicMaterial color={colors.wire} wireframe transparent opacity={0.25} />
        </mesh>

        {/* Inner core */}
        <mesh ref={innerRef}>
          <octahedronGeometry args={[0.8, 0]} />
          <meshBasicMaterial color={colors.core} wireframe transparent opacity={0.7} blending={THREE.AdditiveBlending} />
        </mesh>

        {/* Center glow */}
        <mesh>
          <octahedronGeometry args={[0.35, 0]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} blending={THREE.AdditiveBlending} />
        </mesh>

        {/* Base ring */}
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} position={[0, -1.4, 0]}>
          <ringGeometry args={[1.4, 1.55, 64]} />
          <meshBasicMaterial color={colors.wire} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>

        {/* Light cone */}
        <mesh position={[0, -1.2, 0]}>
          <cylinderGeometry args={[0.9, 0.08, 0.8, 32, 1, true]} />
          <meshBasicMaterial color={colors.wire} transparent opacity={0.04} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>

        <Sparkles count={40} scale={3} size={1.5} speed={0.3} opacity={0.4} color={colors.wire} />
      </group>
    </Float>
  );
}

export default function Avatar3D({ isSpeaking }) {
  return (
    <div data-testid="avatar-3d" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 38 }} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={0.6} />
        <HologramCore isSpeaking={isSpeaking} />
      </Canvas>

      {/* HUD badge */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 16px', borderRadius: 6,
        background: 'var(--glass)', backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: isSpeaking ? 'var(--primary)' : 'var(--text-muted)',
          boxShadow: isSpeaking ? '0 0 8px var(--glow)' : 'none',
          transition: 'all 0.3s',
        }} />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          {isSpeaking ? 'Processing' : 'Standby'}
        </span>
        <div style={{ width: 36, height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--primary)', borderRadius: 2,
            width: isSpeaking ? '75%' : '10%', transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
    </div>
  );
}
