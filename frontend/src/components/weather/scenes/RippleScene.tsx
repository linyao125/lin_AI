import { useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { WeatherConfig } from "../../WeatherCanvas";

// ── Shader-based feathered alpha ripples ──
const MAX_RIPPLES = 40;

const rippleVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const rippleFrag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uRipples[${MAX_RIPPLES}];   // xy position in NDC
uniform float uAges[${MAX_RIPPLES}];     // 0..1 normalized age
uniform int uCount;

varying vec2 vUv;

void main() {
  float alpha = 0.0;

  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= uCount) break;
    float age = uAges[i];
    if (age >= 1.0) continue;

    vec2 diff = vUv - uRipples[i];
    float dist = length(diff);

    // Expanding ring radius
    float radius = age * 0.35;
    float ringWidth = 0.02 * (1.0 - age * 0.6);

    // Feathered ring — smooth alpha gradient, NOT solid line
    float ring = smoothstep(radius - ringWidth * 2.0, radius - ringWidth * 0.5, dist)
               - smoothstep(radius + ringWidth * 0.5, radius + ringWidth * 2.0, dist);

    // Second harmonic for realism
    float radius2 = age * 0.22;
    float ring2 = smoothstep(radius2 - ringWidth * 1.5, radius2 - ringWidth * 0.3, dist)
                - smoothstep(radius2 + ringWidth * 0.3, radius2 + ringWidth * 1.5, dist);

    float fade = (1.0 - age) * (1.0 - age); // quadratic fade
    alpha += (ring * 0.6 + ring2 * 0.3) * fade;
  }

  alpha = min(alpha, 0.8);
  gl_FragColor = vec4(uColor, alpha * 0.5);
}
`;

interface RippleData {
  x: number;
  y: number;
  birth: number;
  duration: number;
}

function RippleLayer({ config }: { config: WeatherConfig }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  const ripplesRef = useRef<RippleData[]>([]);
  const timerRef = useRef(0);
  const clockRef = useRef(0);

  // Add ripple at UV coordinates
  const addRipple = useCallback((uvX: number, uvY: number, duration = 2.5) => {
    ripplesRef.current.push({ x: uvX, y: uvY, birth: clockRef.current, duration });
  }, []);

  // Auto-spawn rain-like ripples
  useFrame((_, delta) => {
    if (!matRef.current) return;
    clockRef.current += delta;
    const u = matRef.current.uniforms;
    u.uTime.value = clockRef.current;

    const h = config.hue / 360;
    u.uColor.value.setHSL((h + 0.55) % 1, 0.25, 0.5);

    // Auto spawn
    timerRef.current += delta;
    const interval = 0.12 / (0.3 + config.density * 0.7);
    while (timerRef.current > interval) {
      timerRef.current -= interval;
      addRipple(Math.random(), Math.random(), 2.0 + Math.random() * 1.5);
    }

    // Update uniforms
    const alive = ripplesRef.current.filter(r => (clockRef.current - r.birth) / r.duration < 1.0);
    ripplesRef.current = alive;

    const positions = u.uRipples.value as number[];
    const ages = u.uAges.value as number[];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (i < alive.length) {
        positions[i * 2] = alive[i].x;
        positions[i * 2 + 1] = alive[i].y;
        ages[i] = (clockRef.current - alive[i].birth) / alive[i].duration;
      } else {
        ages[i] = 1.0;
      }
    }
    u.uCount.value = Math.min(alive.length, MAX_RIPPLES);
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uRipples: { value: new Float32Array(MAX_RIPPLES * 2) },
    uAges: { value: new Float32Array(MAX_RIPPLES).fill(1.0) },
    uCount: { value: 0 },
  }), []);

  // Click handler
  const handleClick = useCallback((e: THREE.Event) => {
    const ev = e as unknown as { uv?: THREE.Vector2 };
    if (ev.uv) {
      addRipple(ev.uv.x, ev.uv.y, 3.5);
    }
  }, [addRipple]);

  return (
    <mesh position={[0, 0, 0]} onClick={handleClick}>
      <planeGeometry args={[viewport.width * 2, viewport.height * 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={rippleVert}
        fragmentShader={rippleFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function RippleScene({ config }: { config: WeatherConfig }) {
  const h = config.hue;
  const bg = `linear-gradient(180deg, hsl(${(h + 200) % 360}, 25%, 6%) 0%, hsl(${(h + 210) % 360}, 30%, 10%) 100%)`;

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
        <RippleLayer config={config} />
      </Canvas>
    </div>
  );
}
