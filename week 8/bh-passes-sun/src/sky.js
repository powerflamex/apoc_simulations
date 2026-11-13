// The sky: a clear blue midday, a few fair-weather clouds, and the Sun with the black hole beside it.
// Everything round the Sun is drawn in a flat patch of sky centred on the hole (uB, with right/up axes uE1/uE2), in Sun
// radii (uRang radians each: about 10x the real Sun, see timeline.js). The hole bends light as a point lens: each pixel at
// theta (from the hole) shows what is at beta = theta - thetaE^2 theta/|theta|^2 behind it, so the Sun is bent into arcs
// round an empty spot, with a small second image inside. What is behind the lens (the "source plane"):
//   - the Sun (uSun: its centre from the hole), stretched into an egg pointing at the hole (uE), limb-darkened, mottled;
//   - the stream (uStream, uRiver): glowing gas pouring off the Sun's tip and winding round the hole;
//   - the ring of fire (uRing): gas circling the hole; inside the lens's ring the black disc then shows (only once the
//     ring of fire is there to outline it);
//   - after the pass (uTear): an inner arm wrapping into the hole and an outer arm flung far out (uArmOut, Sun radii);
//   - the flare (uFlare 0..1): the ring of fire burning white, then the whole sky.
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
uniform float uTime; uniform vec3 uB; uniform vec3 uE1; uniform vec3 uE2; uniform float uRang;
uniform vec2 uSun; uniform float uE; uniform float uRs; uniform float uThE; uniform float uSunI;
uniform float uStream; uniform float uRiver; uniform float uRing; uniform float uTear; uniform float uArmOut;
uniform float uFlare; uniform float uSkyI; uniform vec3 uSunDir; uniform float uFlick;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
const float PI = 3.14159265;

// a glowing arm winding round the hole: from radius r0 at angle a0, turning da radians, to radius r1; visible up to len (0..1)
float arm(vec2 b, float a0, float da, float r0, float r1, float w0, float w1, float len, float seed) {
  float r = length(b), ang = atan(b.y, b.x);
  float acc = 0.0;
  for (int k = -2; k <= 2; k++) {
    float s = (ang + float(k) * 2.0 * PI - a0) / da;
    if (s < 0.0 || s > len) continue;
    float rs = mix(r0, r1, s), w = mix(w0, w1, s);
    float d = (r - rs) / w;
    float lump = 0.35 + 1.3 * fbm(vec2(s * 16.0 + seed, d * 1.5 + uTime * 0.25));
    float tip = smoothstep(len, len - 0.12, s) * smoothstep(0.0, 0.03, s);
    acc += exp(-d * d) * lump * tip;
  }
  return acc;
}

// what lies behind the lens at b (Sun radii from the hole), as light (HDR)
float gCov;
vec3 source(vec2 b) {
  vec3 c = vec3(0.0);
  gCov = 0.0;
  // ---- the Sun: an egg pointing at the hole ----
  vec2 q = b - uSun;
  vec2 n = -normalize(uSun);                     // from the Sun toward the hole
  vec2 m = vec2(-n.y, n.x);
  float a = dot(q, n), p = dot(q, m);
  a /= 1.0 + uE * (a > 0.0 ? 1.0 : 0.35);
  p /= 1.0 - 0.22 * uE / (1.0 + uE);
  float rr = length(vec2(a, p)) / uRs;
  if (rr < 1.03) {
    float mu = sqrt(max(1.0 - rr * rr, 0.0));
    float gran = 0.88 + 0.24 * fbm(q * 7.0 + vec2(uTime * 0.03, 0.0));
    float spots = 1.0 - 0.3 * smoothstep(0.74, 0.8, fbm(q * 2.3 + 11.0)) * smoothstep(0.95, 0.6, rr);
    vec3 col = mix(vec3(1.0, 0.3, 0.03), vec3(1.0, 0.74, 0.32), pow(mu, 0.5));
    // where it is torn the surface glows hotter and redder
    col = mix(col, vec3(1.0, 0.45, 0.15), uTear * 0.35 * smoothstep(0.3, 1.0, rr));
    float m = smoothstep(1.03, 0.99, rr);
    c += col * uSunI * (0.42 + 0.58 * mu) * gran * spots * m;
    gCov = m;
  }
  // the thin glow of the Sun's edge (its corona): what the lens wraps into a ring first
  float rq = length(vec2(a, p)) / uRs;
  c += vec3(1.0, 0.85, 0.65) * 0.7 * uSunI / 4.0 * exp(-max(rq - 1.0, 0.0) * 5.0) * step(1.0, rq);
  // ---- the stream from the Sun's tip, winding round the hole ----
  float sa = atan(-n.y, -n.x);                     // the angle of the Sun's tip, seen from the hole
  float sep = length(uSun);
  float tipR = max(sep - uRs * (1.0 + uE), 0.35);
  if (uStream > 0.0) {
    float len = uStream * mix(0.35, 1.0, uRiver);
    float w = mix(0.05, 0.13, uRiver);
    float s1 = arm(b, sa, 4.2, tipR + 0.05, 0.16, w, w * 0.5, len, 3.0);
    c += vec3(1.0, 0.32, 0.05) * s1 * mix(2.0, 4.0, uRiver) * uStream;
    gCov = max(gCov, clamp(s1 * uStream * 0.7, 0.0, 0.85));
  }
  // ---- after the pass: the inner arm wrapping in, the outer arm flung away (trailing) ----
  if (uTear > 0.0) {
    float s2 = arm(b, sa, 5.0, tipR + 0.1, 0.16, 0.22, 0.05, uTear, 7.0);
    float s3 = arm(b, sa - 0.05, -2.6, sep + uRs * 0.7, sep + uArmOut, 0.3, 0.55, 1.0, 13.0);
    c += vec3(1.0, 0.3, 0.04) * s2 * 3.5 * uTear;
    c += vec3(1.0, 0.3, 0.05) * s3 * 3.0 * uTear;
    gCov = max(gCov, clamp(max(s2, s3) * uTear * 0.7, 0.0, 0.85));
  }
  // ---- the ring of fire: gas circling the hole ----
  float r = length(b);
  if (uRing > 0.0) {
    float ang = atan(b.y, b.x);
    float sw = 0.6 + 0.8 * fbm(vec2(ang * 3.0 - uTime * 1.6, r * 8.0));
    float ring = exp(-pow((r - 0.15) / 0.05, 2.0)) * sw;
    c += mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.95, 0.88), uFlare) * ring * (2.6 + 80.0 * uFlare) * uRing;
  }
  // ---- the flare's core ----
  c += vec3(1.0, 0.95, 0.9) * 40.0 * uFlare * uFlare * exp(-r * r / 0.02);
  return c;
}

void main() {
  vec3 v = normalize(vDir);
  float h = v.y;
  float hh = clamp(h, 0.0, 1.0);
  // ---------- the day sky ----------
  vec3 top = vec3(0.05, 0.2, 0.68), low = vec3(0.48, 0.66, 0.92);
  vec3 c = mix(low, top, pow(smoothstep(0.0, 0.9, hh), 0.55)) * uSkyI;
  // the air glows round the Sun (not bent: the lens is far beyond the air)
  float cs = max(dot(v, uSunDir), 0.0);
  float as = acos(min(cs, 1.0)) / uRang;            // angle from the Sun's centre, in Sun radii
  c += vec3(1.0, 0.8, 0.5) * (0.22 * exp(-max(as - 1.0, 0.0) * 2.2) + 0.04 * exp(-as * 0.2)) * uSunI / 1.4;
  float cb = max(dot(v, uB), 0.0);
  float ab = acos(min(cb, 1.0)) / uRang;
  c += mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.97, 0.92), uFlare) * (0.08 * uRing * exp(-ab * 0.8) + uFlare * uFlare * (3.0 * exp(-ab * 0.25) + 3.0 * pow(cb, 2.0)));
  // ---------- the patch round the hole, seen through its lens ----------
  float z = dot(v, uB);
  if (z > 0.8) {
    vec2 th = vec2(dot(v, uE1), dot(v, uE2)) / z / uRang;
    float t2 = max(dot(th, th), 1e-6);
    vec2 beta = th - uThE * uThE * th / t2;
    vec3 src = source(beta);
    // the black disc inside the ring of fire (none until the ring outlines it)
    float tr = sqrt(t2);
    float dark = uRing * smoothstep(0.8 * uThE, 0.74 * uThE, tr);
    src *= 1.0 - dark;
    c = mix(c * (1.0 - 0.9 * gCov * (1.0 - dark)), vec3(0.0), dark * 0.985);
    c += src;
    // the fire's glow round the black disc (drawn here, not by the bloom, so the disc stays black)
    float rout = max(tr - 0.78 * uThE, 0.0);
    c += mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.9, 0.8), uFlare) * uRing * (0.5 * exp(-rout / (0.18 * uThE)) + 0.12 * exp(-rout / uThE)) * step(0.76 * uThE, tr);
  }
  // ---------- fair-weather clouds, low over the city ----------
  if (h > 0.0) {
    vec2 p = v.xz / (h + 0.06) * 1.4 + vec2(uTime * 0.02, 0.0);
    float cov = smoothstep(0.56, 0.8, fbm(p * 1.3)) * smoothstep(0.02, 0.08, h) * smoothstep(0.24, 0.12, h);
    vec3 cc = vec3(1.0, 0.98, 0.96) * (0.78 + 0.25 * fbm(p * 3.0 + 4.0)) * uSkyI * 1.05;
    cc += vec3(1.0, 0.75, 0.5) * 0.3 * pow(cs, 6.0) * uSunI / 4.0;
    c = mix(c, cc, cov * 0.85);
  }
  c = mix(c, vec3(0.5, 0.5, 0.52) * uSkyI, smoothstep(0.0, -0.2, h));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSky() {
  const uniforms = {
    uTime: { value: 0 }, uB: { value: new THREE.Vector3(0, 0.45, -0.9).normalize() }, uE1: { value: new THREE.Vector3(1, 0, 0) },
    uE2: { value: new THREE.Vector3(0, 1, 0) }, uRang: { value: 0.056 }, uSun: { value: new THREE.Vector2(2, -1) }, uE: { value: 0 },
    uRs: { value: 1 }, uThE: { value: 1.5 }, uSunI: { value: 9 }, uStream: { value: 0 }, uRiver: { value: 0 }, uRing: { value: 0 },
    uTear: { value: 0 }, uArmOut: { value: 0 }, uFlare: { value: 0 }, uSkyI: { value: 1 }, uSunDir: { value: new THREE.Vector3(0, 0.5, -0.86) },
    uFlick: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
