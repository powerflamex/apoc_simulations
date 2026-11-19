// The sky over the beach, set per world: a gradient from overhead (uTop) to the horizon (uLow) with haze along it
// (uHaze); the Sun (dimmed or hidden by each world's air); a cloud deck that drifts with the wind (uDrift) and is
// drawn out into long streaks when the wind is fierce (uStreak: Saturn, Neptune); lightning lights it from inside
// (uFlash, toward uFlashD). Saturn's rings (uRingK): the view from its cloud tops, found by sending each pixel's ray
// down to Saturn's equatorial plane from a point at latitude uRingG on the oblate planet and reading off the ring at the
// radius it hits (real radii, in 1000 km: C 74.7-92, B 92-117.6, the Cassini Division to 122.2, A to 136.8 with the
// Encke gap, the thin F ring at 140.2). From ~55 deg north they stand as an arch ~100 deg wide and ~12 deg high; the
// azimuth is squeezed by uRingSq so both its ends meet the horizon inside the phone-shaped view.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uHaze; uniform float uHazeK;
uniform vec3 uSunD; uniform vec3 uSunCol; uniform float uSunR; uniform float uSunI; uniform float uSunGlow;
uniform float uCloud; uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform vec2 uDrift; uniform vec2 uWindD; uniform float uStreak; uniform float uCloudH; uniform float uCloudScale;
uniform float uFlash; uniform vec3 uFlashD; uniform vec3 uFlashCol; uniform float uT;
uniform float uRingK; uniform vec2 uRingO; uniform float uRingG; uniform float uRingSq; uniform vec2 uRingFwd; uniform float uRingI;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float rn1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fract(sin(i * 127.1) * 43758.5453), fract(sin((i + 1.0) * 127.1) * 43758.5453), f); }
// a ring edge, softened over a pixel
float band(float r, float a, float b, float dr) { return smoothstep(a - dr, a + dr, r) * (1.0 - smoothstep(b - dr, b + dr, r)); }
// fine ringlets: noise in radius at several scales, each faded out once it would be finer than ~2 pixels
float ringlets(float r, float dr) {
  float s = 0.0, w = 0.0;
  for (int i = 0; i < 5; i++) {
    float L = 3.2 * pow(0.42, float(i));                    // 3200 km down to ~100 km
    float k = 1.0 - smoothstep(0.2 * L, 0.5 * L, dr);
    s += k * (rn1(r / L + float(i) * 17.3) - 0.5) * 0.5; w += 0.5;
  }
  return clamp(0.5 + s * 2.4 / w * 2.0, 0.0, 1.0);
}
// the rings along view direction v: rgb, opacity
vec4 saturnRings(vec3 v) {
  vec2 hz = normalize(v.xz + vec2(1e-6, 0.0));
  float az = atan(hz.x * uRingFwd.y - hz.y * uRingFwd.x, dot(hz, uRingFwd));
  float alt = asin(clamp(v.y, -1.0, 1.0));
  float a2 = az * uRingSq;
  float cg = cos(uRingG), sg = sin(uRingG);
  vec3 U = vec3(cg, sg, 0.0), S = vec3(sg, -cg, 0.0), E = vec3(0.0, 0.0, 1.0);
  vec3 d = cos(alt) * (cos(a2) * S + sin(a2) * E) + sin(alt) * U;
  float t = uRingO.y / max(-d.y, 1e-4);
  vec3 P = vec3(uRingO, 0.0) + t * d;
  float r = length(P.xz);
  float dr = max(fwidth(r), 1e-4);
  if (d.y > -1e-4 || abs(az) > 1.25 || alt < -0.01 || r > 146.0 || r < 70.0) return vec4(0.0);
  float sharp = 1.0 - smoothstep(4.0, 12.0, dr);          // (where the ray barely grazes the plane: nothing to see)
  float f = ringlets(r, dr);
  float op = 0.0, br = 0.0;
  // C ring: faint, grey, see-through
  float c = band(r, 74.66, 92.0, dr);
  op += c * (0.1 + 0.12 * f); br += c * 0.55;
  // B ring: the brightest and densest, its middle nearly solid
  float b = band(r, 92.0, 117.58, dr);
  float bIn = smoothstep(92.0, 100.0, r);
  op += b * mix(0.5, 0.97, bIn) * (0.75 + 0.4 * f); br += b * (0.72 + 0.5 * f);
  // the Cassini Division: dark, a couple of faint ringlets
  float cd = band(r, 117.58, 122.17, dr);
  op += cd * (0.06 + 0.12 * exp(-pow((r - 117.85) / max(0.12, dr), 2.0)) + 0.08 * f); br += cd * 0.5;
  // A ring: less dense than B, the Encke gap near its outer edge, the Keeler gap right at it
  float a = band(r, 122.17, 136.78, dr);
  float gaps = 1.0 - 0.9 * band(r, 133.42, 133.74, dr) - 0.7 * band(r, 136.48, 136.53, dr);
  op += a * (0.55 + 0.3 * f) * gaps; br += a * (0.7 + 0.4 * f);
  // F ring: one thin bright strand
  float ff = exp(-pow((r - 140.18) / max(0.25, dr * 1.5), 2.0)) * min(1.0, 0.25 / dr + 0.3);
  op += ff * 0.55; br += ff * 0.9;
  vec3 col = mix(vec3(0.72, 0.68, 0.64), vec3(1.0, 0.91, 0.76), smoothstep(85.0, 95.0, r));
  col = mix(col, vec3(0.93, 0.87, 0.77), smoothstep(121.0, 123.0, r));
  return vec4(col * br * uRingI, clamp(op, 0.0, 1.0) * sharp);
}
void main() {
  vec3 v = normalize(vDir);
  float h = v.y, hh = max(h, 0.0);
  vec3 c = mix(uLow, uTop, pow(smoothstep(0.0, 0.65, hh), 0.75));
  c = mix(c, uHaze, exp(-hh * 9.0) * uHazeK);
  if (h < 0.0) c = uHaze;
  // Saturn's rings (behind the clouds; the air thickens them into the haze near the horizon)
  if (uRingK > 0.0) {
    vec4 rg = saturnRings(v);
    vec3 rc = mix(rg.rgb, uHaze * 1.2, 0.75 * exp(-hh * 16.0));
    c = mix(c, rc, rg.a * uRingK);
  }
  // the Sun (through whatever air this world has)
  float ca = dot(v, uSunD), ang = acos(clamp(ca, -1.0, 1.0));
  c += uSunCol * uSunI * (1.0 - smoothstep(uSunR * 0.85, uSunR * 1.1, ang));
  c += uSunCol * uSunGlow * (exp(-ang / 0.04) * 0.5 + exp(-ang / 0.25) * 0.22);
  // the cloud deck: a plane uCloudH up, drifting with the wind, stretched along it when the wind is fierce
  if (h > 0.0 && uCloud > 0.0) {
    float dist = uCloudH / max(h, 0.025);
    vec2 p = v.xz * dist + uDrift;
    vec2 w = normalize(uWindD + 1e-5);
    vec2 q = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
    q.x /= 1.0 + uStreak;
    q /= uCloudScale;
    float n = fbm(vec3(q / 1500.0, 1.3 + uT * 0.02));
    float n2 = fbm(vec3(q / 380.0, 4.1 + uT * 0.05));
    float d = n * 0.72 + n2 * 0.38;
    float cov = smoothstep(1.02 - uCloud * 0.62, 1.1 - uCloud * 0.45, d);
    cov *= 1.0 - smoothstep(25000.0, 90000.0, dist);
    vec3 cc = mix(uCloudDark, uCloudLit, smoothstep(0.35, 0.85, n2 + 0.25 * (n - 0.5) + 0.2 * max(ca, 0.0)));
    float fl = exp(-acos(clamp(dot(v, uFlashD), -1.0, 1.0)) / 0.3);
    cc += uFlashCol * uFlash * (0.25 + 1.6 * fl) * (0.4 + 0.8 * n2);
    c = mix(c, cc, clamp(cov, 0.0, 1.0));
  }
  c += uFlashCol * uFlash * 0.12;
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const C = (r, g, b) => ({ value: new THREE.Color(r, g, b) });
  const uniforms = {
    uTop: C(0.2, 0.4, 0.8), uLow: C(0.6, 0.75, 0.9), uHaze: C(0.8, 0.85, 0.9), uHazeK: { value: 0.6 },
    uSunD: V(0.4, 0.7, 0.5), uSunCol: C(1, 0.95, 0.85), uSunR: { value: 0.0047 }, uSunI: { value: 20 }, uSunGlow: { value: 0.4 },
    uCloud: { value: 0.3 }, uCloudLit: C(1, 1, 1), uCloudDark: C(0.6, 0.65, 0.7), uDrift: { value: new THREE.Vector2() }, uWindD: { value: new THREE.Vector2(1, 0) },
    uStreak: { value: 0 }, uCloudH: { value: 2000 }, uCloudScale: { value: 1 },
    uFlash: { value: 0 }, uFlashD: V(0, 0.3, -1), uFlashCol: C(0.75, 0.82, 1.0), uT: { value: 0 },
    uRingK: { value: 0 }, uRingO: { value: new THREE.Vector2(36, 45) }, uRingG: { value: 0.96 }, uRingSq: { value: 2.8 }, uRingFwd: { value: new THREE.Vector2(-1, 0) }, uRingI: { value: 1.6 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, u: uniforms };
}
