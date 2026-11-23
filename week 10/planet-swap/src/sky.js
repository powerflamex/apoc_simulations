// The sky over the beach, set per place: a gradient from overhead (uTop) to the horizon (uLow) with haze along it
// (uHaze); the bright aureole round the Sun (uAur); the Sun itself, low over the sea in front of you: a limb-darkened
// disc with boiling granules (radius uSunR, drawn 7x life size, see timeline.js), or, once it is too small to show a
// disc (Pluto), a blazing point with four short spikes (uPoint); a thin cloud deck drifting with the wind; stars once
// the sky goes dark (uNight).
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
uniform vec3 uSunD; uniform vec3 uSunCol; uniform float uSunR; uniform float uSunI; uniform float uAur; uniform vec3 uAurCol; uniform float uGlare;
uniform float uPoint; uniform float uPx;
uniform float uCloud; uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform vec2 uDrift; uniform vec2 uWindD; uniform float uStreak; uniform float uCloudH; uniform float uCloudScale;
uniform float uNight; uniform float uT;
uniform float uDeck; uniform vec3 uDeckLit; uniform vec3 uDeckDark; uniform float uDeckSun;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float h = v.y, hh = max(h, 0.0);
  vec3 c = mix(uLow, uTop, pow(smoothstep(0.0, 0.6, hh), 0.7));
  c = mix(c, uHaze, exp(-hh * 9.0) * uHazeK);
  if (h < 0.0) c = uHaze;
  // stars (once the air is gone the sky is black even with the Sun up)
  if (uNight > 0.0 && h > 0.0) {
    vec3 q = v * 300.0;
    vec3 cell = floor(q);
    float st = hash13(cell);
    vec3 pp = fract(q) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5) * 0.6;
    float star = step(0.982, st) * exp(-dot(pp, pp) * 70.0) * (0.35 + 2.2 * (st - 0.982) / 0.018);
    vec3 sc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(cell + 9.1));
    c += sc * star * uNight * 0.16 * smoothstep(0.0, 0.08, h);
  }
  // the Sun: where this pixel is relative to it (q: 1 at the rim), precise for tiny angles
  float cs = dot(v, uSunD);
  float sn = length(cross(v, uSunD));
  float ang = cs > 0.9999 ? asin(clamp(sn, 0.0, 1.0)) : acos(clamp(cs, -1.0, 1.0));
  vec3 e1 = normalize(cross(uSunD, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(e1, uSunD);
  vec2 q2 = vec2(dot(v, e1), dot(v, e2));
  float off = max(ang - uSunR, 0.0);
  // the aureole: the air lit up round the Sun (wide and soft; kept low so the bloom doesn't make it a white disc)
  c += uAurCol * uAur * (exp(-off / 0.05) * 0.5 + exp(-off / 0.2) * 0.25 + exp(-off / 0.6) * 0.1) * smoothstep(-0.05, 0.02, h);
  // a tight glare just outside the rim
  c += uSunCol * uGlare * (exp(-off / max(0.0015, uSunR * 0.08)) * 0.9 + exp(-off / max(0.006, uSunR * 0.35)) * 0.25);
  // the disc
  if (uPoint < 1.0) {
    float Rs = max(uSunR, uPx * 1.2);
    float rq = ang / Rs;
    float edgeW = max(uPx * 1.2 / Rs, 0.004);
    float inside = 1.0 - smoothstep(1.0 - edgeW, 1.0 + edgeW, rq);
    if (inside > 0.0) {
      float r = min(rq, 1.0);
      float mu = sqrt(max(0.0, 1.0 - r * r));
      float limb = 0.3 + 0.7 * pow(mu, 0.5);
      vec2 qd = q2 / Rs;
      float cells = fbm(vec3(qd * 9.0 / (0.45 + 0.55 * mu), uT * 0.15));
      float fine = noise3(vec3(qd * 30.0 + 3.0, uT * 0.4));
      float pat = clamp((cells - 0.4) * 1.3 + (fine - 0.5) * 0.35 + 0.5, 0.0, 1.0);
      vec3 dc = uSunCol * limb * (0.9 + 0.2 * pat);
      dc = mix(dc, dc * vec3(1.0, 0.7, 0.42), pow(1.0 - mu, 1.5) * 0.85);   // redder toward the limb
      c = mix(c, dc * uSunI, inside * (1.0 - uPoint));
    }
  }
  // the point (Pluto): a blazing star with four short spikes
  if (uPoint > 0.0) {
    float px = uPx;
    float core = exp(-pow(ang / (px * 1.4), 2.0));
    float halo = exp(-ang / (px * 3.0)) * 0.3 + exp(-ang / (px * 12.0)) * 0.04;
    float spk = exp(-abs(q2.x) / (px * 0.7)) * exp(-abs(q2.y) / (px * 26.0)) + exp(-abs(q2.y) / (px * 0.7)) * exp(-abs(q2.x) / (px * 26.0));
    c += uSunCol * uSunI * uPoint * (core * 6.0 + halo * 2.0 + spk * 0.5);
  }
  // a thin cloud deck drifting with the wind (lit from behind by the low Sun near it)
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
    cov *= 1.0 - 0.85 * exp(-off / 0.03);                                   // (a gap round the Sun: it never hides)
    vec3 cc = mix(uCloudDark, uCloudLit, smoothstep(0.35, 0.85, n2 + 0.25 * (n - 0.5)));
    cc += uAurCol * uAur * 0.6 * exp(-off / 0.25);
    c = mix(c, cc, clamp(cov, 0.0, 1.0));
  }
  // a thick cloud deck closing over the whole sky from the horizon up (uDeck 0 .. 1 overhead), heaped and billowing,
  // the Sun a bright smear through it (uDeckSun)
  if (uDeck > 0.0) {
    vec3 dq = v * vec3(4.0, 9.0, 4.0) + vec3(uDrift.x, 0.0, uDrift.y) * 0.002;
    float b = fbm(dq + vec3(0.0, uT * 0.05, 0.0));
    float b2 = fbm(dq * 3.1 + 4.0 + vec3(uT * 0.08));
    float edge = uDeck * 1.25 - 0.08;
    float cov = smoothstep(edge + 0.04, edge - 0.06, h + 0.18 * (b - 0.5) + 0.06 * (b2 - 0.5));
    vec3 dc = mix(uDeckDark, uDeckLit, smoothstep(0.3, 0.62, b * 0.8 + b2 * 0.45 - 0.4 + 0.14 * smoothstep(0.0, 0.5, h)));
    dc += uSunCol * uDeckSun * (exp(-off / 0.06) * 1.2 + exp(-off / 0.25) * 0.35);
    c = mix(c, dc, cov);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 60.0), 1.0);
}`;

export function makeSky() {
  const V = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const C = (r, g, b) => ({ value: new THREE.Color(r, g, b) });
  const uniforms = {
    uTop: C(0.2, 0.4, 0.8), uLow: C(0.6, 0.75, 0.9), uHaze: C(0.8, 0.85, 0.9), uHazeK: { value: 0.6 },
    uSunD: V(-1, 0.1, 0), uSunCol: C(1, 0.95, 0.85), uSunR: { value: 0.03 }, uSunI: { value: 2 }, uAur: { value: 0.4 }, uAurCol: C(1, 0.9, 0.7), uGlare: { value: 1 },
    uPoint: { value: 0 }, uPx: { value: 0.0006 },
    uCloud: { value: 0.3 }, uCloudLit: C(1, 1, 1), uCloudDark: C(0.6, 0.65, 0.7), uDrift: { value: new THREE.Vector2() }, uWindD: { value: new THREE.Vector2(1, 0) },
    uStreak: { value: 0 }, uCloudH: { value: 2000 }, uCloudScale: { value: 1 },
    uNight: { value: 0 }, uT: { value: 0 },
    uDeck: { value: 0 }, uDeckLit: C(1, 0.97, 0.9), uDeckDark: C(0.6, 0.6, 0.6), uDeckSun: { value: 0 },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, u: uniforms };
}
