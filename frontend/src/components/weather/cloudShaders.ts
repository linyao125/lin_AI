export const cloudVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uScale;
uniform float uDensity;
uniform float uSpeed;

varying vec2 vUv;

// Simplex 3D noise (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    val += amp * snoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed * 0.02;

  // Domain warping for organic shapes
  vec3 pos = vec3(uv * uScale, t);
  float warp = fbm(pos);
  float cloud = fbm(pos + vec3(warp * 0.4, warp * 0.2, t * 0.3));

  // Detail layer
  float detail = fbm(pos * 2.5 + vec3(t * 0.15, -t * 0.1, t * 0.2));

  // Cloud density with feathered edges
  float d = smoothstep(-0.15, 0.55, cloud) * uDensity;
  d *= (0.7 + 0.3 * (detail * 0.5 + 0.5));

  // Color with depth
  vec3 color = mix(uColor1, uColor2, cloud * 0.5 + 0.5);

  // Inner glow
  float glow = smoothstep(0.3, 0.8, cloud) * 0.25;
  color += uColor2 * glow;

  // Vignette fade
  vec2 center = uv - 0.5;
  float vignette = 1.0 - dot(center, center) * 0.4;

  gl_FragColor = vec4(color, d * vignette * 0.85);
}
`;

// God rays fragment shader for sunshine scene
export const godRaysFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uRayColor;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // Ray origin: top-right
  vec2 origin = vec2(1.0, 1.0);
  vec2 dir = uv - origin;
  float angle = atan(dir.y, dir.x);
  float dist = length(dir);

  // Multiple rays
  float rays = 0.0;
  float t = uTime * 0.3;
  rays += sin(angle * 3.0 + t) * 0.5 + 0.5;
  rays += sin(angle * 5.0 - t * 0.7) * 0.3 + 0.3;
  rays += sin(angle * 7.0 + t * 1.3) * 0.2 + 0.2;
  rays = rays / 3.0;

  // Breathing effect
  float breath = sin(uTime * 0.5) * 0.15 + 0.85;

  // Fade with distance from origin
  float fade = exp(-dist * 1.2) * breath;

  float alpha = rays * fade * uIntensity;

  gl_FragColor = vec4(uRayColor, alpha * 0.4);
}
`;
