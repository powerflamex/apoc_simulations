import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, T_SURGE, T_DASH1, T_DASH2, T_MOON, T_FLOOD, T_QUAKE, T_ZERO, T_LENS, T_SUNSET, CAM_END_X, SUN_ANG } from './timeline.js';
import { CAMW, LOOK_B } from './people.js';
import { CAM0, landY, Y } from './layout.js';
import { H } from './heat.js';
import { DEG, lerp, smooth, wobble, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer (street scale near, the mountains far off; the sea handles its own shoreline)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.8, 0.6, 0.45), 0.00008);
const camera = new THREE.PerspectiveCamera(36, W / H_, 0.4, 120000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();

// post: MSAA -> bloom -> tone map -> the dash blur, lens frost, grade, vignette, bands behind the text
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.3, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 1 }, uCap: { value: 0 }, uAb: { value: 0 }, uBlur: { value: 0 },
    uLens: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCap; uniform float uAb;
    uniform float uBlur; uniform float uLens; uniform float uTime; uniform float uFlash;
    varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
    float lf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * ln(p); p = p * 2.13 + 1.7; a *= 0.5; } return s; }
    float vorE(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(lh(i + o), lh(i + o + 31.0)) - f; float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      return sqrt(d2) - sqrt(d1); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.012;
      // the dash: a zoom blur (the time-lapse skipping ahead)
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = 0.5 + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.15);
      col = mix(col, vec3(1.0, 0.97, 0.92), uFlash);
      // frost on the lens: feathers of ice growing in from the edges until it is solid (a still pattern, so the loop's
      // last frame and the frame after it match)
      if (uLens > 0.0) {
        vec2 a = vec2(vUv.x * 0.5625, vUv.y);
        float ed = 0.38 * (1.0 - length(vec2((vUv.x - 0.5) * 1.75, (vUv.y - 0.5) * 2.0)));
        vec2 w = vec2(lf(a * 4.0), lf(a * 4.0 + 9.0)) - 0.5;
        float fr = (1.0 - smoothstep(0.0, 0.07, vorE(a * 6.0 + w * 0.8))) * 0.55
                 + (1.0 - smoothstep(0.0, 0.06, vorE(a * 17.0 + w * 1.6))) * 0.35
                 + (1.0 - smoothstep(0.0, 0.05, vorE(a * 46.0 + w * 3.0))) * 0.22;
        float grain = lf(a * 120.0);
        float e = ed - 0.09 * lf(a * 5.0 + 2.0) - 0.035 * fr;
        float grow = uLens * 0.36;
        float cov = 1.0 - smoothstep(grow - 0.03, grow, e);
        float edge = smoothstep(grow - 0.04, grow - 0.004, e) * cov;
        vec3 ice = mix(vec3(0.56, 0.69, 0.84), vec3(0.9, 0.95, 1.0), clamp(fr * 0.95 + grain * 0.25 + 0.15, 0.0, 1.0));
        ice += vec3(0.28, 0.3, 0.32) * edge;
        float thick = clamp(smoothstep(0.0, 0.07, grow - e) * 0.6 + 0.4 + 0.3 * fr, 0.0, 1.0);
        thick = mix(thick, 1.0, smoothstep(0.85, 1.0, uLens));
        float near = (1.0 - smoothstep(grow, grow + 0.06, e)) * (1.0 - cov);
        col = mix(col, col * 0.7 + vec3(0.32, 0.36, 0.42), near * 0.5);
        col = mix(col, ice, cov * thick);
      }
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.855) / 0.07, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.735) / 0.055, 2.0));
      col *= 1.0 - uCap * 0.42 * exp(-pow((vUv.y - 0.165) / 0.045, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// Catmull-Rom through [time, value] keys
function spline(list, t) {
  if (t <= list[0][0]) return list[0][1];
  const n = list.length;
  if (t >= list[n - 1][0]) return list[n - 1][1];
  let i = 0;
  while (t > list[i + 1][0]) i++;
  const [t0, p0] = list[i], [t1, p1] = list[i + 1];
  const tm = i > 0 ? list[i - 1] : [t0 - (t1 - t0), p0 - (p1 - p0)];
  const tp = i + 2 < n ? list[i + 2] : [t1 + (t1 - t0), p1 + (p1 - p0)];
  const m0 = (p1 - tm[1]) / (t1 - tm[0]) * (t1 - t0), m1 = (tp[1] - p0) / (tp[0] - t0) * (t1 - t0);
  const u = (t - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
// eased keys (each segment a smoothstep: holds stay still)
const ek = (list, t) => keys(list, t);
// The camera (video time). Part 0: you stand on the sand in the crowd, phone up, looking out to sea at the two suns over
// the people's heads; the sea races up the sand and you back up the beach as everyone runs past you, then you watch
// again from higher up (the Sun sets into the sea, the star stays up). Part 1 (after the first dash): up on the walk,
// looking over the beach to the sea and the pier: the Moon is dragged across the sky, you look down as the sea floods
// the sand up to your feet, the ground shakes, and at the closest pass you zoom in on the star over the Ferris wheel.
// Part 2 (after the second dash): the same spot, evening, the Sun smaller, the light going cold, the lens freezing.
const BK = [[-4, 0], [T_SURGE + 0.3, 0], [T_SURGE + 1.2, 3.0], [T_SURGE + 6.6, CAM_END_X - CAM0.x], [60, CAM_END_X - CAM0.x]];
const B0 = [[-4, -0.6], [T_SURGE + 0.2, -0.8], [T_SURGE + 2.5, 1.2], [9.8, 1.4], [T_SUNSET[0], 0.6], [T_SUNSET[1] + 0.6, 0.2], [60, 0.2]];
const P0 = [[-4, 4.0], [T_SURGE + 0.2, 4.0], [T_SURGE + 1.4, 1.6], [T_SURGE + 6.0, 1.6], [T_SURGE + 7.4, 2.2], [T_SUNSET[0], 2.4], [16.3, 2.6], [17.2, 1.4], [60, 1.4]];
// you step back up the sand with the crowd as each wave comes in
const BACK = [[0, 0], [9.95, 0], [10.9, 1.3], [13.25, 1.3], [14.2, 2.7], [16.4, 2.7], [18.2, 17], [19.4, 21], [60, 21]];
const F0 = [[-4, 21], [0, 20.5], [T_SURGE + 0.2, 19], [T_SURGE + 1.4, 50], [T_SURGE + 6.0, 50], [T_SURGE + 7.4, 30], [16.3, 30], [17.2, 46], [60, 46]];
// part 1: the phone zooms in on the Moon (it's pulled toward the star, whose edge is on the right), out again for the
// flood, and at the closest pass in on the star, up and to the left of the Ferris wheel
const B1 = [[0, 7.5], [T_MOON - 0.1, 7.5], [T_MOON + 1.0, 6.0], [T_MOON + 3.6, 7.8], [T_FLOOD + 0.6, 6], [T_QUAKE - 0.2, 7.5], [T_ZERO - 0.8, 11], [T_ZERO + 1.0, 15.2], [60, 15.2]];
const P1 = [[0, 6.3], [T_MOON - 0.1, 5.0], [T_MOON + 1.0, 2.0], [T_MOON + 3.6, 2.4], [T_FLOOD + 0.6, -5.5], [T_FLOOD + 1.3, -5.0], [T_FLOOD + 2.3, 0.5], [T_QUAKE - 0.3, 1.0], [T_QUAKE + 0.6, 3.5], [T_ZERO - 0.8, 4.0], [T_ZERO + 1.0, 3.4], [60, 3.4]];
const F1 = [[0, 40], [T_MOON - 0.1, 40], [T_MOON + 1.0, 9.5], [T_MOON + 3.6, 9.5], [T_FLOOD + 0.6, 52], [T_QUAKE + 0.6, 46], [T_ZERO - 0.8, 44], [T_ZERO + 1.3, 15], [60, 15]];
// part 2: zoomed in on the Sun as it shrinks, then out to the beach freezing
const B2 = [[0, -5], [38.4, -5], [40.4, 0.5], [48, -1.0]];
const P2 = [[0, 2.9], [38.4, 2.5], [40.4, 7.5], [T_LENS, 5.5], [48, 3.5]];
const F2 = [[0, 10], [38.4, 10], [40.4, 46], [48, 40]];
// FOV keys in log space, so a zoom feels steady
const fovK = (list, v) => Math.exp(keys(list.map(([t, f]) => [t, Math.log(f)]), v));

const dirOf = (b, el, out = new THREE.Vector3()) => out.set(-Math.cos(b * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.sin(b * DEG) * Math.cos(el * DEG));
const SUN_D = new THREE.Vector3(), STAR_D = new THREE.Vector3(), MOON_D = new THREE.Vector3(), tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const mix3 = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
// the looks: golden hour (the Sun up), the star's night (the Sun down, the star lights everything), the cold
const DAY = { top: [0.02, 0.06, 0.22], low: [0.9, 0.34, 0.09], nearS: [1.7, 0.6, 0.14], hemiSky: [0.55, 0.52, 0.66], hemiGnd: [0.55, 0.38, 0.24], hi: 0.9,
  fog: [0.7, 0.32, 0.12], seaHi: [0.03, 0.07, 0.16], seaLo: [0.3, 0.15, 0.08], cloud: 0.35, night: 0 };
const DUSK = { top: [0.02, 0.025, 0.085], low: [0.5, 0.2, 0.09], nearS: [0.3, 0.08, 0.04], hemiSky: [0.42, 0.28, 0.3], hemiGnd: [0.42, 0.22, 0.12], hi: 0.75,
  fog: [0.42, 0.19, 0.1], seaHi: [0.015, 0.02, 0.05], seaLo: [0.3, 0.12, 0.06], cloud: 0.4, night: 0.6 };
const COLD = { top: [0.03, 0.08, 0.22], low: [0.42, 0.36, 0.36], nearS: [1.2, 0.7, 0.4], hemiSky: [0.45, 0.55, 0.78], hemiGnd: [0.36, 0.38, 0.45], hi: 0.85,
  fog: [0.6, 0.64, 0.72], seaHi: [0.06, 0.1, 0.2], seaLo: [0.32, 0.36, 0.42], cloud: 0.45, night: 0 };
const BLUE = { top: [0.02, 0.045, 0.13], low: [0.17, 0.24, 0.4], nearS: [0.45, 0.42, 0.5], hemiSky: [0.26, 0.34, 0.55], hemiGnd: [0.18, 0.2, 0.28], hi: 0.75,
  fog: [0.16, 0.21, 0.33], seaHi: [0.03, 0.05, 0.12], seaLo: [0.16, 0.22, 0.36], cloud: 0.4, night: 0.5 };
function lookOf(s) {
  const L = {};
  let A = DAY, B = DUSK, k = s.dusk;
  if (s.part === 2) { A = COLD; B = BLUE; k = smooth(T_DASH2 + 3, 46, s.v); }
  for (const n of Object.keys(A)) L[n] = Array.isArray(A[n]) ? mix3(A[n], B[n], k) : A[n] + (B[n] - A[n]) * k;
  return L;
}

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.lens = Math.max(s.lens, cover); s.title *= 1 - smooth(0.55, 1, cover); }

  // ---------- camera ----------
  let x, z, y, B, P, fov;
  if (s.part === 0) {
    x = CAM0.x + spline(BK, v) + ek(BACK, v); z = CAM0.z;
    y = landY(x, z) + 1.62;
    B = ek(B0, v); P = ek(P0, v); fov = fovK(F0, v);
  } else if (s.part === 1) {
    x = CAMW.x; z = CAMW.z; y = Y.walk + 1.5;
    B = ek(B1, v); P = ek(P1, v); fov = fovK(F1, v);
  } else {
    x = CAMW.x; z = CAMW.z; y = Y.walk + 1.5;
    B = ek(B2, v); P = ek(P2, v); fov = fovK(F2, v);
  }
  let yaw = (90 - B) * DEG, pitch = P * DEG, roll = 0;
  // hand-held: a slow sway; running backwards (the surge) bobs it; the zoom steadies it
  const steady = s.part === 1 ? 1 - 0.85 * smooth(T_ZERO - 0.5, T_ZERO + 1, v) : 1;
  const run = s.part === 0 ? smooth(T_SURGE + 0.8, T_SURGE + 1.4, v) * (1 - smooth(T_SURGE + 6.0, T_SURGE + 6.8, v))
    + [[9.95, 10.9, 0.45], [13.25, 14.2, 0.45], [16.4, 19.6, 1]].reduce((a, [t0, t1, w]) => a + w * smooth(t0, t0 + 0.3, v) * (1 - smooth(t1 - 0.2, t1, v)), 0) : 0;
  x += wobble(v * 0.5, 2) * 0.04 * steady; y += (wobble(v * 0.4, 3) * 0.03 + Math.abs(Math.sin(v * 8.0)) * 0.06 * run) * steady;
  yaw += (wobble(v * 0.35, 5) * 0.25 * steady + wobble(v * 3.1, 1) * 0.5 * run) * DEG; pitch += (wobble(v * 0.3, 7) * 0.2 * steady + wobble(v * 3.7, 4) * 0.6 * run) * DEG;
  roll += (wobble(v * 0.27, 9) * 0.3 * steady + Math.sin(v * 8.0) * 0.9 * run) * DEG;
  // the ground shaking (and a little in the surge)
  const sh = window.__cover ? 0 : s.quake * 1.0 + 0.2 * s.surge * (s.part === 0 ? 1 : 0);
  x += wobble(v * 13, 1) * 0.06 * sh; y += wobble(v * 11, 4) * 0.06 * sh;
  const zsh = s.part === 1 ? Math.min(1, 12 / fov) : 1;         // (a zoomed shake is smaller in degrees)
  pitch += wobble(v * 17, 6) * 0.5 * DEG * sh / zsh; roll += wobble(v * 9, 8) * 0.9 * DEG * sh;
  yaw += wobble(v * 15, 2) * 0.35 * DEG * sh / zsh;
  // the dash: a push forward
  fov *= 1 - 0.18 * s.dash;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the sky ----------
  const L = lookOf(s);
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  dirOf(s.sun.b, s.sun.el, SUN_D); dirOf(s.star.b, s.star.el, STAR_D); dirOf(s.moon.b, s.moon.el, MOON_D);
  u.uSun.value.copy(SUN_D); u.uStar.value.copy(STAR_D); u.uMoon.value.copy(MOON_D);
  u.uSunA.value = SUN_ANG / s.dSun;
  u.uStarA.value = SUN_ANG * s.width;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uT.value = v;
  const coldK = s.part === 2 ? 1 : 0;
  u.uSunCol.value.setRGB(...(coldK ? [1, 0.88, 0.72] : [1, 0.74, 0.4]));
  u.uSunI.value = s.part === 2 ? 4.2 : 2.2;
  u.uSunG.value = (s.part === 2 ? 0.55 : 0.4) * (1 + 0.2 * s.dash) * (s.part === 2 ? 0.5 / Math.sqrt(s.dSun) + 0.2 : 1);
  u.uSunGC.value.setRGB(...(coldK ? [1, 0.82, 0.62] : [1, 0.64, 0.32]));
  u.uStarCol.value.setRGB(1, 0.3, 0.045);
  u.uStarI.value = 2.4 + 0.6 * smooth(1, 4, s.bright);
  u.uStarG.value = Math.min(0.85, 0.42 + 0.1 * s.bright);
  u.uStarGC.value.setRGB(1, 0.36, 0.08);
  u.uGran.value = 0.55 * smooth(1.4, 3.0, s.width);
  u.uMoonI.value = s.moon.vis * (s.part === 0 ? 0.5 : 1.0);
  // the Moon is lit by the star behind it (nearly new: a thin crescent on the star's side, earthshine on the rest)
  tmpV.copy(STAR_D).addScaledVector(MOON_D, -STAR_D.dot(MOON_D)).normalize();          // (across the sky, toward the star)
  u.uMoonL.value.copy(MOON_D).multiplyScalar(0.42).addScaledVector(tmpV, 0.906);          // (a fat crescent: drawn wider than the true one so it reads)
  u.uTop.value.setRGB(...L.top); u.uLow.value.setRGB(...L.low); u.uNearS.value.setRGB(...L.nearS);
  const glowX = Math.min(1.3, 0.2 + 0.28 * s.bright) * (s.part === 2 ? 0.3 : 1);
  u.uNearX.value.setRGB(1.0 * glowX, 0.4 * glowX, 0.13 * glowX);
  u.uNight.value = L.night; u.uCloud.value = L.cloud; u.uDrift.value = v * 6;

  // ---------- the light: the Sun and the star ----------
  const sunLI = 2.8 * s.sunUp * (s.part === 2 ? Math.pow(1 / s.dSun, 1.3) : 1) * smooth(-3.5, 0.5, s.sun.el);
  const starLI = 2.6 * Math.pow(s.bright, 0.72);
  const sl = world.sun, xl = world.star;
  sl.color.setRGB(...(coldK ? [1, 0.88, 0.74] : [1, 0.74, 0.46]));
  sl.intensity = sunLI;
  xl.color.setRGB(1, 0.56, 0.28);
  xl.intensity = starLI;
  const sp = camera.position;
  const tgx = sp.x - 30 * Math.sin(yaw), tgz = sp.z - 30 * Math.cos(yaw);
  for (const [lt, d] of [[sl, SUN_D], [xl, STAR_D]]) {
    // (a light just under the horizon still lights from just above it, fading out)
    const dy = Math.max(d.y, 0.02);
    lt.position.set(tgx + d.x * 1500, dy * 1500 + 2, tgz + d.z * 1500);
    lt.target.position.set(tgx, 0, tgz);
  }
  world.hemi.color.setRGB(...L.hemiSky);
  world.hemi.groundColor.setRGB(...L.hemiGnd);
  world.hemi.intensity = L.hi * (0.75 + 0.1 * starLI) * (s.part === 2 ? 0.8 + 0.4 / s.dSun : 1);
  scene.fog.color.setRGB(...L.fog);
  scene.fog.density = 0.00004;
  // the sea's mirror: both glitter paths
  const su = world.sea.u;
  su.uTime.value = v;
  su.uWaveT.value = v;
  su.uSun.value.copy(SUN_D); su.uSunR.value = u.uSunA.value; su.uSunI.value = 3.0 * s.sunUp * smooth(-1, 1.5, s.sun.el); su.uSunCol.value.setRGB(1, 0.72, 0.42);
  su.uSun2.value.copy(STAR_D); su.uSunR2.value = u.uStarA.value; su.uSunI2.value = 0.9 * Math.pow(s.bright, 0.6) * (s.part === 2 ? 0.3 : 1); su.uSunCol2.value.setRGB(1, 0.5, 0.22);
  su.uSkyHi.value.setRGB(...L.seaHi);
  su.uSkyLo.value.setRGB(...L.seaLo);
  su.uDirC.value.setRGB(1, 0.7, 0.45).multiplyScalar(sunLI + starLI);
  su.uAmbC.value.setRGB(...L.hemiSky).multiplyScalar(world.hemi.intensity);
  su.uBright.value = 0.8;
  su.uPx.value = u.uPx.value;
  su.uSurge.value = s.part === 0 ? s.surge : 0.2 * s.surge;      // (the flood has its own look: uFlood, bore.js)
  su.uIce.value = s.ice;
  const bu = world.bore.u;
  bu.uDirC.value.copy(su.uDirC.value); bu.uAmbC.value.copy(su.uAmbC.value); bu.uSunD.value.copy(STAR_D); bu.uSky.value.setRGB(...L.seaLo); bu.uPx.value = u.uPx.value;
  H.uFrost.value = 0.85 * s.frost;
  world.frame(v, s, camera);

  // exposure: the more light, the lower (an eye / a phone adapting), but the brighter star still reads brighter
  const total = sunLI + starLI + 1.2 * world.hemi.intensity;
  renderer.toneMappingExposure = (s.part === 2 ? 0.64 - 0.14 * s.cold : 0.74) * Math.pow(4.2 / total, 0.6);
  bloom.strength = 0.22 + 0.06 * s.bright;
  bloom.threshold = 1.35;
  finish.uniforms.uAb.value = 0.3 * sh + 0.8 * s.dash;
  finish.uniforms.uBlur.value = 0.22 * s.dash;
  finish.uniforms.uFlash.value = s.dashFlash;
  finish.uniforms.uLens.value = s.lens;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uTitle.value = window.__cover ? 0 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - s.lens;
  overlay(v, s);
  finish.uniforms.uCap.value = window.__cover ? 1.2 : s.capBand || 0;
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the lens ice clears,
// so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [46, 40, 33, 27, 22, 16, 11, 6, 3.5, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world, sky, state, comp: () => comp };
  window.DURATION = VIDEO_DURATION;
  window.__glInfo = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })();
  window.__ready = true;
  if (!RENDER_MODE) startPreview();
}

function startPreview() {
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_)})`; };
  fit();
  addEventListener('resize', fit);
  const hud = document.createElement('div');
  hud.id = 'hud';
  document.body.appendChild(hud);
  const still = params.has('still');
  let t = Number(params.get('still') ?? params.get('t') ?? 0);
  let playing = !still;
  let last = performance.now();
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') playing = !playing;
    if (e.code === 'ArrowRight') t = Math.min(VIDEO_DURATION, t + 5);
    if (e.code === 'ArrowLeft') t = Math.max(0, t - 5);
  });
  window.__seek = (x) => { t = x; playing = false; renderFrame(t); };
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (playing) t = (t + dt) % VIDEO_DURATION;
    renderFrame(t);
    hud.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps  [space] [←/→]`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});
