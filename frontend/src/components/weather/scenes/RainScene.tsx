import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cloudVertexShader, cloudFragmentShader } from "../cloudShaders";
import type { WeatherConfig } from "../../WeatherCanvas";

// ── Overcast Cloud Layer (Shader) ──
function RainClouds({ config }: { config: WeatherConfig }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color() },
    uColor2: { value: new THREE.Color() },
    uScale: { value: 3.0 },
    uDensity: { value: 0.6 },
    uSpeed: { value: 0.3 },
  }), []);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const m = matRef.current;
    m.uniforms.uTime.value += delta;
    const h = config.hue / 360;
    // Deep charcoal-teal overcast
    m.uniforms.uColor1.value.setHSL((h + 0.5) % 1, 0.15, 0.04);
    m.uniforms.uColor2.value.setHSL((h + 0.55) % 1, 0.25, 0.12);
    m.uniforms.uScale.value = 2.5 + config.size * 3.0;
    m.uniforms.uDensity.value = 0.5 + config.density * 0.4;
    m.uniforms.uSpeed.value = 0.1 + config.speed * 0.4;
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

// ── Shinkai-style rain via GPU Points ──
const rainVertexShader = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uWind;
uniform float uSize;
uniform vec2 uBounds; // half-width, half-height

attribute float aOffset;  // random phase offset per particle
attribute float aSpeed;   // individual speed multiplier

varying float vAlpha;
varying float vLen;

void main() {
  float t = uTime * (3.0 + uSpeed * 8.0);

  // Each particle loops vertically
  float cycle = mod(aOffset + t * aSpeed, uBounds.y * 2.0);
  float y = uBounds.y - cycle;

  // Horizontal position with wind drift
  float x = (aOffset * 17.37 - floor(aOffset * 17.37)) * uBounds.x * 2.0 - uBounds.x;
  x += uWind * t * aSpeed * 0.3;
  x = mod(x + uBounds.x, uBounds.x * 2.0) - uBounds.x;

  float z = fract(aOffset * 7.13) * -4.0;

  vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);

  // Elongated point size for rain streak look
  float len = 4.0 + uSize * 12.0;
  gl_PointSize = len * (1.0 + fract(aOffset * 3.7) * 0.6) * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;

  // Depth-based fade
  vAlpha = 0.15 + 0.5 * smoothstep(-4.0, 0.0, z);
  vLen = len;
}
`;

const rainFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord;
  // Vertical streak shape: narrow horizontally, full vertically
  float streak = smoothstep(0.45, 0.5, abs(uv.x - 0.5));
  // Top-to-bottom fade for motion blur feel
  float vertFade = smoothstep(0.0, 0.3, uv.y) * smoothstep(1.0, 0.5, uv.y);

  float alpha = (1.0 - streak) * vertFade * vAlpha;
  // Slight highlight at center for translucent Shinkai feel
  vec3 col = uColor + vec3(0.15) * (1.0 - abs(uv.x - 0.5) * 2.0);

  gl_FragColor = vec4(col, alpha * 0.7);
}
`;

const RAIN_COUNT = 3000;

function RainParticles({ config }: { config: WeatherConfig }) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { offsets, speeds } = useMemo(() => {
    const offsets = new Float32Array(RAIN_COUNT);
    const speeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      offsets[i] = Math.random() * 100;
      speeds[i] = 0.5 + Math.random() * 0.7;
    }
    return { offsets, speeds };
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // Dummy positions — vertex shader overrides them
    const pos = new Float32Array(RAIN_COUNT * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    return geo;
  }, [offsets, speeds]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSpeed: { value: 0.5 },
    uWind: { value: 0 },
    uSize: { value: 0.5 },
    uBounds: { value: new THREE.Vector2(14, 11) },
    uColor: { value: new THREE.Color() },
  }), []);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value += delta;
    u.uSpeed.value = config.speed;
    u.uWind.value = config.wind;
    u.uSize.value = config.size;

    const h = config.hue / 360;
    u.uColor.value.setHSL((h + 0.55) % 1, 0.3, 0.55);
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={rainVertexShader}
        fragmentShader={rainFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── Composition ──
function RainContent({ config }: { config: WeatherConfig }) {
  return (
    <>
      <RainClouds config={config} />
      <RainParticles config={config} />
    </>
  );
}

export function RainScene({ config }: { config: WeatherConfig }) {
  return (
    <div className="absolute inset-0">
      <Canvas
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 10], fov: 50 }}
        style={{ background: "transparent" }}
        dpr={0.75}
        frameloop="always"
        performance={{ min: 0.5 }}
      >
        <RainContent config={config} />
      </Canvas>
    </div>
  );
}
