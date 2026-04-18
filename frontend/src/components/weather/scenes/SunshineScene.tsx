import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cloudVertexShader } from "../cloudShaders";
import { godRaysFragmentShader } from "../cloudShaders";
import type { WeatherConfig } from "../../WeatherCanvas";

// ── God Rays (Tyndall Effect) ──
function GodRays({ config }: { config: WeatherConfig }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uRayColor: { value: new THREE.Color() },
    uIntensity: { value: 0.8 },
  }), []);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value += delta;
    const h = config.hue / 360;
    u.uRayColor.value.setHSL(h, 0.5, 0.7);
    u.uIntensity.value = 0.4 + config.density * 0.8;
  });

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[viewport.width * 2, viewport.height * 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={cloudVertexShader}
        fragmentShader={godRaysFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── Floating dust motes ──
const DUST_COUNT = 80;

function DustParticles({ config }: { config: WeatherConfig }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = Math.random() * -5;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < DUST_COUNT; i++) {
      const ix = i * 3, iy = i * 3 + 1;
      positions[ix] += Math.sin(t * 0.1 + i) * 0.003 + config.wind * 0.01;
      positions[iy] += Math.cos(t * 0.15 + i * 0.7) * 0.002;
      if (positions[ix] > 12) positions[ix] = -12;
      if (positions[ix] < -12) positions[ix] = 12;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={new THREE.Color().setHSL(config.hue / 360, 0.3, 0.8)}
        size={0.06}
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function SunshineContent({ config }: { config: WeatherConfig }) {
  return (
    <>
      <GodRays config={config} />
      <DustParticles config={config} />
    </>
  );
}

export function SunshineScene({ config }: { config: WeatherConfig }) {
  const h = config.hue;
  const bg = `linear-gradient(135deg, hsl(${h}, 55%, 82%) 0%, hsl(${(h + 20) % 360}, 60%, 88%) 50%, hsl(${(h + 40) % 360}, 45%, 90%) 100%)`;

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
        <SunshineContent config={config} />
      </Canvas>
    </div>
  );
}
