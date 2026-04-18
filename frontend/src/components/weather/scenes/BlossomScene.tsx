import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WeatherConfig } from "../../WeatherCanvas";

// ── Instanced 3D Petal System ──
const PETAL_COUNT = 120;

// Create an asymmetric petal shape geometry
function createPetalGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.15, 0.2, 0.25, 0.5, 0.1, 0.7);
  shape.bezierCurveTo(0.0, 0.8, -0.1, 0.75, -0.12, 0.6);
  shape.bezierCurveTo(-0.2, 0.4, -0.15, 0.15, 0, 0);

  const geo = new THREE.ShapeGeometry(shape, 8);
  geo.center();
  geo.scale(0.3, 0.3, 0.3);
  return geo;
}

function Petals({ config }: { config: WeatherConfig }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-petal state
  const state = useMemo(() => {
    const data = [];
    for (let i = 0; i < PETAL_COUNT; i++) {
      data.push({
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 16 - 4,
        z: Math.random() * -3,
        phase: Math.random() * Math.PI * 2,
        freqX: 0.3 + Math.random() * 0.5,
        freqY: 0.2 + Math.random() * 0.3,
        speed: 0.3 + Math.random() * 0.5,
        rotSpeed: (Math.random() - 0.5) * 2,
        scale: 0.6 + Math.random() * 0.8,
      });
    }
    return data;
  }, []);

  const petalGeo = useMemo(() => createPetalGeometry(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const fallSpeed = (0.5 + config.speed * 2.0) * delta;
    const wind = config.wind * 2.0 * delta;
    const halfH = 10;

    for (let i = 0; i < PETAL_COUNT; i++) {
      const p = state[i];
      p.y -= fallSpeed * p.speed;
      // S-curve horizontal drift
      p.x += (Math.sin(p.phase + p.y * p.freqX) * 0.02 + wind) * p.speed;

      if (p.y < -halfH) {
        p.y = halfH + Math.random() * 4;
        p.x = (Math.random() - 0.5) * 20;
      }

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(
        Math.sin(p.phase + p.y * p.freqY) * 1.2,
        p.phase + p.y * p.rotSpeed * 0.3,
        Math.cos(p.phase + p.y * p.freqX * 0.7) * 0.8
      );
      dummy.scale.setScalar(p.scale * (0.8 + config.size * 0.6));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const color = useMemo(() => {
    return new THREE.Color().setHSL(config.hue / 360, 0.45, 0.75);
  }, [config.hue]);

  return (
    <instancedMesh ref={meshRef} args={[petalGeo, undefined, PETAL_COUNT]}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function BlossomScene({ config }: { config: WeatherConfig }) {
  const h = config.hue;
  const bg = `linear-gradient(135deg, hsl(${h}, 50%, 90%) 0%, hsl(${(h + 30) % 360}, 40%, 85%) 50%, hsl(${(h + 60) % 360}, 35%, 88%) 100%)`;

  return (
    <div className="absolute inset-0" style={{ background: bg }}>
      <Canvas
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 10], fov: 50 }}
        style={{ background: "transparent" }}
        dpr={0.75}
        frameloop="always"
        performance={{ min: 0.5 }}
      >
        <ambientLight intensity={0.6} />
        <Petals config={config} />
      </Canvas>
    </div>
  );
}
