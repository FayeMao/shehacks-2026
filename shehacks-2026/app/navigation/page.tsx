'use client';

import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ArrowConfig {
  order: number;
  icon: string;
  rotation: number;
  position: {
    x: number;
    y: number;
  };
  duration: number;
}

export default function NavigationPage() {
  const webcamRef = useRef<Webcam>(null);
  const [currentArrowIndex, setCurrentArrowIndex] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [arrows, setArrows] = useState<ArrowConfig[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load arrows data
  useEffect(() => {
    fetch('/arrows.json')
      .then((res) => res.json())
      .then((data) => {
        const sortedArrows = data.arrows.sort((a: ArrowConfig, b: ArrowConfig) => a.order - b.order);
        setArrows(sortedArrows);
      })
      .catch((err) => {
        console.error('Error loading arrows data:', err);
      });
  }, []);

  useEffect(() => {
    // Request camera access
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' } })
      .then(() => {
        setIsCameraActive(true);
      })
      .catch((err) => {
        console.error('Error accessing camera:', err);
        alert('Camera access denied. Please allow camera access to use navigation.');
      });
  }, []);

  useEffect(() => {
    if (arrows.length === 0) return;

    const currentArrow = arrows[currentArrowIndex];
    if (!currentArrow) return;

    const timer = setTimeout(() => {
      setCurrentArrowIndex((prev) => {
        const nextIndex = prev + 1;
        return nextIndex >= arrows.length ? 0 : nextIndex; // Loop back to start
      });
    }, currentArrow.duration);

    return () => clearTimeout(timer);
  }, [currentArrowIndex, arrows]);

  const currentArrow = arrows[currentArrowIndex];

  // Camera controller component to look down at ground
  const GroundCamera = () => {
    const { camera } = useThree();
    
    useEffect(() => {
      // Position camera above and looking down at ground at an angle
      camera.position.set(0, 2.5, 1.5);
      camera.lookAt(0, -0.8, 0);
      camera.updateProjectionMatrix();
    }, [camera]);

    return null;
  };

  // Ground-based Arrow component for path following
  const GroundArrow = ({ rotation, position }: { rotation: number; position: { x: number; y: number } }) => {
    const arrowRef = useRef<THREE.Group>(null);

    return (
      <group
        ref={arrowRef}
        position={[0, -0.8, 0]}
        rotation={[-Math.PI / 2, 0, THREE.MathUtils.degToRad(rotation)]}
      >
        {/* Arrow head - pointing in the direction (flat on ground) */}
        <mesh position={[0, 0.01, 0.3]}>
          <coneGeometry args={[0.15, 0.4, 8]} />
          <meshStandardMaterial 
            color="#ff4444" 
            emissive="#ff0000" 
            emissiveIntensity={0.8}
            metalness={0.3}
            roughness={0.2}
          />
        </mesh>
        {/* Arrow shaft - flat on ground */}
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.08, 0.02, 0.6]} />
          <meshStandardMaterial 
            color="#ff4444" 
            emissive="#ff0000" 
            emissiveIntensity={0.8}
            metalness={0.3}
            roughness={0.2}
          />
        </mesh>
        {/* Shadow plane underneath arrow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[0.5, 32]} />
          <meshStandardMaterial 
            color="#000000" 
            transparent 
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Glow effect around arrow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshStandardMaterial 
            color="#ff0000" 
            emissive="#ff0000" 
            emissiveIntensity={0.3}
            transparent 
            opacity={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-black">
      {/* Camera Video Background */}
      <div className="absolute inset-0 w-full h-full">
        <Webcam
          ref={webcamRef}
          audio={false}
          className="w-full h-full object-cover"
          videoConstraints={{
            width: 1280,
            height: 720,
            facingMode: 'user'
          }}
          screenshotFormat="image/jpeg"
        />
      </div>

      {/* Three.js Full-Screen Canvas Overlay for Ground Arrows */}
      {currentArrow && (
        <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
          <Canvas
            camera={{ 
              position: [0, 2.5, 1.5], 
              fov: 60,
              up: [0, 1, 0]
            }}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
            gl={{ 
              alpha: true, 
              antialias: true,
              preserveDrawingBuffer: true
            }}
          >
            <GroundCamera />
            
            {/* Lighting for ground-based AR effect */}
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 10, 5]} intensity={0.9} />
            <pointLight position={[0, 2, 0]} intensity={0.6} color="#ffffff" />
            
            {/* Ground plane reference (semi-transparent grid) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]}>
              <planeGeometry args={[10, 10, 20, 20]} />
              <meshStandardMaterial 
                color="#444444" 
                transparent 
                opacity={0.15}
                side={THREE.DoubleSide}
                wireframe={true}
              />
            </mesh>

            {/* Position arrow based on JSON position (convert percentage to 3D coordinates) */}
            <group position={[
              ((currentArrow.position.x - 50) / 50) * 2.5, // Convert 0-100% to -2.5 to 2.5
              0,
              ((100 - currentArrow.position.y - 50) / 50) * 2.5  // Invert Y for proper positioning
            ]}>
              <GroundArrow rotation={currentArrow.rotation} position={currentArrow.position} />
            </group>
          </Canvas>
        </div>
      )}

      {/* Debug info */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-4 rounded-lg z-20">
        <p className="font-bold mb-2">Navigation Arrow</p>
        <p>Arrow {currentArrowIndex + 1} of {arrows.length}</p>
        {currentArrow && (
          <>
            <p>Direction: {currentArrow.rotation}°</p>
            <p>Position: ({currentArrow.position.x}%, {currentArrow.position.y}%)</p>
            <p>Duration: {currentArrow.duration / 1000}s</p>
            <p className="mt-2 text-sm text-gray-300">
              Next arrow in: {Math.ceil((currentArrow.duration) / 1000)}s
            </p>
          </>
        )}
      </div>
    </div>
  );
}
