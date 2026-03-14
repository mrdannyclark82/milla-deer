import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Stars, Torus } from '@react-three/drei';
import * as THREE from 'three';

interface Avatar3DProps {
  isSpeaking: boolean;
  mood: 'neutral' | 'happy' | 'thinking' | 'concerned';
}

const AvatarMesh: React.FC<Avatar3DProps> = ({ isSpeaking, mood }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Dynamic colors based on mood
  const colors = useMemo(() => {
    switch (mood) {
      case 'happy': return { main: '#C04000', glow: '#50C878' }; // Auburn + Emerald
      case 'thinking': return { main: '#8a2be2', glow: '#00BFFF' };
      case 'concerned': return { main: '#FF4500', glow: '#FFA500' };
      default: return { main: '#C04000', glow: '#50C878' };
    }
  }, [mood]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    
    if (meshRef.current) {
      // Breathing/Floating
      meshRef.current.position.y = Math.sin(t / 1.5) * 0.1;
      
      // Speaking animation (distort more when speaking)
      const speakingIntensity = isSpeaking ? Math.sin(t * 15) * 0.15 : 0;
      meshRef.current.scale.setScalar(1 + speakingIntensity);
    }

    if (glowRef.current) {
      glowRef.current.rotation.z = t * 0.2;
      glowRef.current.rotation.x = t * 0.1;
    }

    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t) * 0.2;
      ringRef.current.rotation.y = t * 0.5;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Core "Soul" Sphere - Representing the head/hair abstractly */}
      <Sphere args={[1, 64, 64]} ref={meshRef}>
        <MeshDistortMaterial
          color={colors.main}
          attach="material"
          distort={isSpeaking ? 0.6 : 0.3} // More movement when speaking
          speed={isSpeaking ? 5 : 2}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>

      {/* Emerald Eyes / Glow Aura */}
      <Sphere args={[1.4, 32, 32]} ref={glowRef}>
        <meshStandardMaterial
          color={colors.glow}
          transparent
          opacity={0.15}
          wireframe
        />
      </Sphere>

      {/* Halo Ring */}
      <Torus args={[1.8, 0.02, 16, 100]} ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
      </Torus>
      
      {/* Dynamic Lighting */}
      <pointLight position={[2, 2, 2]} intensity={2} color="#ffffff" />
      <pointLight position={[-2, -2, 2]} intensity={1.5} color={colors.glow} />
    </group>
  );
};

const Avatar3D: React.FC<Avatar3DProps> = (props) => {
  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <AvatarMesh {...props} />
        <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
      </Canvas>
      <div className="absolute bottom-4 w-full text-center pointer-events-none">
        <p className="text-emerald-400 text-xs tracking-[0.3em] uppercase opacity-70 animate-pulse">
          {props.isSpeaking ? 'Vocalizing' : 'Listening'}
        </p>
      </div>
    </div>
  );
};

export default Avatar3D;