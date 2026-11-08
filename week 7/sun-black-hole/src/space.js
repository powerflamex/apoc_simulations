// The opening, from space (0:00-0:02.5): the Sun filling the frame, then falling in on itself into a black hole with a ring
// of bent light, one full-screen shader. The Sun's surface is a turning sphere of boiling cells with sunspots, its corona and
// prominences reach out past the limb; as it collapses (collapseAt in timeline.js) the rim tears, the surface heats from
// orange to blue-white and twists, plasma spirals in after it; when it's gone: a flash, a shock ring racing out, and the ring.
// Not to scale: a black hole with the Sun's mass would be 235,000 times narrower than the Sun, far too small to see.
import * as THREE from 'three';
import { collapseAt } from './timeline.js';
import { wobble } from './util.js';

const vert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uT; uniform float uR; uniform float uHeat; uniform float uRag; uniform float uIn; uniform float uHole; uniform float uPost;
uniform float uFlash; uniform float uRing; uniform vec2 uC;
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 stars(vec2 p, float cell, float dens, float br) {
  vec2 c = floor(p / cell);
  float h = h21(c + cell);
  if (h > dens) return vec3(0.0);
  vec2 pos = (c + 0.15 + 0.7 * vec2(h21(c + 3.1), h21(c + 9.7))) * cell;
  float m = h21(c + 17.3);
  float d = length(p - pos);
  return mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), h21(c + 5.9)) * br * (0.2 + 2.0 * m * m * m) * exp(-d * d / 7.0);
}
// the Sun's colour for a surface "temperature" 0..1
vec3 ramp(float t) {
  vec3 c = mix(vec3(0.55, 0.07, 0.0), vec3(1.15, 0.36, 0.03), smoothstep(0.0, 0.42, t));
  c = mix(c, vec3(1.45, 0.82, 0.18), smoothstep(0.38, 0.75, t));
  return mix(c, vec3(1.9, 1.5, 0.75), smoothstep(0.75, 1.0, t));
}
void main() {
  vec2 q = vUv * vec2(1080.0, 1920.0) - uC;
  float r = length(q), th = atan(q.y, q.x);
  vec2 ct = vec2(cos(th), sin(th));
  // the stars behind, bending round the hole as it forms
  float E = uRing * 1.3 * uHole;
  vec2 b = q - q * E * E / max(r * r, 1.0);
  vec3 col = vec3(0.004, 0.006, 0.016);
  float sq = uHole > 0.0 ? smoothstep(0.75, 1.25, r / max(E, 1.0)) : 1.0;
  col += (stars(b, 46.0, 0.5, 0.55) + stars(b + 311.0, 110.0, 0.55, 1.5)) * sq;
  // ---------- the Sun ----------
  float Rr = uR * (1.0 + uRag * (fbm(vec3(ct * 3.2, uT * 1.7)) - 0.5) * 0.3 + uRag * uRag * (fbm(vec3(ct * 11.0, uT * 3.0)) - 0.5) * 0.12);
  if (uR > 0.5) {
    float out_ = max(r - Rr, 0.0);
    // the corona: long streamers, a soft glow
    float fall = uR / 575.0;
    float streak = fbm(vec3(ct * 7.0, out_ / (240.0 * fall) - uT * 0.5));
    col += vec3(1.0, 0.42, 0.1) * (exp(-out_ / (46.0 * fall)) * 1.25 + exp(-out_ / (150.0 * fall)) * (0.2 + 0.85 * streak * streak));
    // prominences: bright loops leaning off the limb
    float pm = smoothstep(0.58, 0.76, fbm(vec3(ct * 6.0 + 3.0, out_ / (85.0 * fall) - uT * 0.4)));
    col += vec3(1.5, 0.45, 0.08) * pm * exp(-out_ / (68.0 * fall));
    // plasma torn off and spiralling in after it
    if (uIn > 0.0) {
      float a = th + 2.6 * exp(-out_ / 330.0) + uT * 2.0;
      float sp = fbm(vec3(cos(a) * 5.0, sin(a) * 5.0, log(r + 8.0) * 1.7 + uT * 5.0));
      col += mix(vec3(1.5, 0.42, 0.06), vec3(1.5, 1.2, 0.9), exp(-out_ / 90.0) * uHeat) * smoothstep(0.5, 0.74, sp) * exp(-out_ / 240.0) * uIn * 1.25;
    }
    vec2 d = q / Rr;
    float dd = dot(d, d);
    if (dd < 1.0) {
      float mu = sqrt(1.0 - dd);
      vec3 n = vec3(d, mu);
      // turning, and twisting faster toward the edge as it falls in
      float ang = uT * 0.16 + uHeat * 3.5 * (1.0 - mu);
      n = vec3(n.x * cos(ang) + n.z * sin(ang), n.y, -n.x * sin(ang) + n.z * cos(ang));
      float cell = fbm(n * 13.0 + vec3(0.0, uT * 0.35, 0.0));
      float fine = fbm(n * 42.0 - vec3(uT * 0.5));
      float act = smoothstep(0.5, 0.72, fbm(n * 3.1 + 8.0));
      float spot = smoothstep(0.66, 0.74, fbm(n * 5.3 + 21.0));
      float t = clamp(0.2 + (cell - 0.38) * 1.5 + (fine - 0.5) * 0.45 + act * 0.38 - spot * 0.72, 0.0, 1.0);
      vec3 sc = ramp(t) * (0.42 + 0.58 * pow(mu, 0.55));
      sc += vec3(1.3, 0.4, 0.05) * pow(1.0 - mu, 5.0) * 0.5;
      // heating as it falls in: to white, then blue-white
      sc = mix(sc, mix(vec3(2.2, 1.9, 1.5), vec3(2.0, 2.5, 3.6), uHeat) * (0.8 + 0.5 * fine), uHeat * uHeat);
      // cracks of light tearing across it
      float cr = 1.0 - smoothstep(0.0, 0.035, abs(fbm(n * 5.0 + uT * 1.2) - 0.5));
      sc += vec3(2.0, 1.1, 0.35) * cr * uRag * 0.55;
      col = mix(col, sc, smoothstep(1.0, 0.985, sqrt(dd)));
    }
  }
  // ---------- the black hole and its ring ----------
  if (uHole > 0.0) {
    float rr = r / uRing;
    col = mix(col, vec3(0.0), uHole * (1.0 - smoothstep(0.86, 0.99, rr)));
    float lop = 1.0 + 0.55 * cos(th - 0.7);
    float ring = exp(-pow((rr - 1.0) / 0.036, 2.0)) * 2.4 + exp(-max(rr - 1.0, 0.0) / 0.14) * smoothstep(0.95, 1.0, rr) * 0.3;
    float arcs = smoothstep(0.42, 0.68, fbm(vec3(ct * 3.0, uT * 0.5))) * exp(-pow((rr - 1.3) / 0.03, 2.0)) * 0.55;
    float k = 1.0 + 1.2 * exp(-uPost * 5.0);
    col += vec3(1.0, 0.9, 0.76) * ring * lop * uHole * k + vec3(0.8, 0.86, 1.0) * arcs * uHole;
  }
  // ---------- the blast: a shock ring racing out, a slower ragged shell ----------
  if (uPost > 0.0) {
    float rs = uPost * 3600.0, w = 24.0 + uPost * 110.0;
    col += vec3(1.6, 1.9, 2.8) * exp(-pow((r - rs) / w, 2.0)) * exp(-uPost * 2.4) * 2.6;
    float rs2 = uPost * 1250.0, w2 = 60.0 + uPost * 240.0;
    float rag = 0.3 + 1.3 * smoothstep(0.42, 0.72, fbm(vec3(ct * 6.0, r / 180.0 - uPost)));
    col += vec3(1.5, 0.55, 0.14) * exp(-pow((r - rs2) / w2, 2.0)) * exp(-uPost * 3.6) * rag * smoothstep(1.2, 2.2, r / uRing) * 1.5;
  }
  col += vec3(1.0, 0.98, 1.0) * uFlash * 4.0;
  gl_FragColor = vec4(clamp(col, 0.0, 30.0), 1.0);
}`;

export function makeSpace() {
  const uniforms = {
    uT: { value: 0 }, uR: { value: 575 }, uHeat: { value: 0 }, uRag: { value: 0 }, uIn: { value: 0 }, uHole: { value: 0 }, uPost: { value: 0 },
    uFlash: { value: 0 }, uRing: { value: 165 }, uC: { value: new THREE.Vector2(540, 1130) },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    scene, camera,
    // returns how hard the frame is shaking (for the lens effects)
    frame(v) {
      const c = collapseAt(v);
      uniforms.uT.value = v;
      uniforms.uR.value = c.R; uniforms.uHeat.value = c.heat; uniforms.uRag.value = c.rag; uniforms.uIn.value = c.inflow;
      uniforms.uHole.value = c.hole; uniforms.uPost.value = c.post; uniforms.uFlash.value = c.flash; uniforms.uRing.value = c.ring;
      uniforms.uC.value.set(540 + wobble(v * 43, 3) * c.shake, 1920 - c.cy + wobble(v * 47, 4) * c.shake);
      return c;
    },
  };
}
