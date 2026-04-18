import { useRef, useMemo, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cloudVertexShader, cloudFragmentShader } from "../cloudShaders";
import type { WeatherConfig } from "../../WeatherCanvas";

// ── Volumetric Cloud Layer ──
function CloudLayer({ config }: { config: WeatherConfig }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color() },
    uColor2: { value: new THREE.Color() },
    uScale: { value: 3.0 },
    uDensity: { value: 0.5 },
    uSpeed: { value: 0.5 },
  }), []);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const m = matRef.current;
    m.uniforms.uTime.value += delta;

    const h = config.hue / 360;
    m.uniforms.uColor1.value.setHSL((h + 0.65) % 1, 0.3, 0.08);
    m.uniforms.uColor2.value.setHSL((h + 0.7) % 1, 0.5, 0.18);
    m.uniforms.uScale.value = 2.0 + config.size * 4.0;
    m.uniforms.uDensity.value = 0.3 + config.density * 0.7;
    m.uniforms.uSpeed.value = 0.2 + config.speed * 1.5;
  });

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[viewport.width * 2.5, viewport.height * 2.5]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Cold-light Breathing Glow ──
function ColdGlow({ config }: { config: WeatherConfig }) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (!lightRef.current) return;
    const t = state.clock.elapsedTime;
    const breath = Math.sin(t * 0.4) * 0.3 + 0.7;
    lightRef.current.intensity = breath * (0.5 + config.density * 1.5);
    lightRef.current.position.x = Math.sin(t * 0.15) * 3;
    lightRef.current.position.y = Math.cos(t * 0.2) * 2;
  });

  const glowColor = useMemo(() => {
    return new THREE.Color().setHSL((config.hue / 360 + 0.7) % 1, 0.5, 0.5);
  }, [config.hue]);

  return <pointLight ref={lightRef} color={glowColor} intensity={1} distance={15} position={[0, 0, -3]} />;
}

// ── Mouse Interaction: Glow Disturbance ──
function InteractionGlow({ config }: { config: WeatherConfig }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const { viewport } = useThree();

  useFrame((state) => {
    if (!lightRef.current) return;
    const mx = state.pointer.x * viewport.width * 0.5;
    const my = state.pointer.y * viewport.height * 0.5;
    lightRef.current.position.x = mx;
    lightRef.current.position.y = my;
    lightRef.current.position.z = -2;

    // Pulse on movement
    const speed = Math.sqrt(
      Math.pow(state.pointer.x - (lightRef.current.userData.px || 0), 2) +
      Math.pow(state.pointer.y - (lightRef.current.userData.py || 0), 2)
    );
    lightRef.current.userData.px = state.pointer.x;
    lightRef.current.userData.py = state.pointer.y;
    lightRef.current.intensity = Math.min(speed * 30, 3) * (0.5 + config.density * 0.5);
  });

  const color = useMemo(() => {
    return new THREE.Color().setHSL((config.hue / 360 + 0.75) % 1, 0.6, 0.6);
  }, [config.hue]);

  return <pointLight ref={lightRef} color={color} intensity={0} distance={10} position={[0, 0, -2]} />;
}

function NebulaContent({ config }: { config: WeatherConfig }) {
  return (
    <>
      <CloudLayer config={config} />
      <ColdGlow config={config} />
      <InteractionGlow config={config} />
    </>
  );
}

export function NebulaScene({ config }: { config: WeatherConfig }) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "auto" }}>
      <Canvas
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 10], fov: 50 }}
        style={{ background: "transparent" }}
        dpr={0.75}
        frameloop="always"
        performance={{ min: 0.5 }}
      >
        <NebulaContent config={config} />
      </Canvas>
    </div>
  );
}
