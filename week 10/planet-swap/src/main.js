import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, LAND } from './timeline.js';
import { CAM0, landY } from './layout.js';
import { DEG, wobble, smooth } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer: street scale (near plane 0.15 m), the walls are drawn far off
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.5, 0.5, 0.5), 0.0002);
const FOV = 62;
const camera = new THREE.PerspectiveCamera(FOV, W / H_, 0.15, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const world = makeWorld(scene);
const overlay = makeOverlay();

// each side of the wipe is drawn into its own target, then mixed
const mkRT = () => new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const rtA = mkRT(), rtB = mkRT();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType }));
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const mix = new ShaderPass({
  uniforms: { tA: { value: null }, tB: { value: null }, uW: { value: 0 }, uExpA: { value: 1 }, uExpB: { value: 1 },
    uShimA: { value: 0 }, uShimB: { value: 0 }, uT: { value: 0 }, uAspect: { value: W / H_ },
    uVeilA: { value: new THREE.Vector4(1, 1, 1, 0) }, uVeilB: { value: new THREE.Vector4(1, 1, 1, 0) }, uStrA: { value: 0 }, uStrB: { value: 0 },
    uIceA: { value: 0 }, uIceB: { value: 0 }, uBuryA: { value: 0 }, uBuryB: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA, tB; uniform float uW, uExpA, uExpB, uShimA, uShimB, uT, uAspect, uStrA, uStrB, uIceA, uIceB, uBuryA, uBuryB; uniform vec4 uVeilA, uVeilB;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    // heat shimmer (Venus): the air wobbles, most low down
    vec2 shim(vec2 uv, float k) {
      if (k <= 0.0) return uv;
      float m = smoothstep(0.75, 0.3, uv.y);
      vec2 q = vec2(uv.x * 30.0, uv.y * 70.0 - uT * 7.0);
      return uv + k * m * 0.0022 * vec2(n(q) - 0.5, n(q + 17.0) - 0.5);
    }
    // dust streaming past the lens in ragged horizontal ribbons (Mars, inside the storm): lighter and darker bands
    vec3 streaks(vec3 col, vec3 vc, float k) {
      if (k <= 0.0) return col;
      vec2 q = vec2(vUv.x * 1.6 - uT * 2.6, vUv.y * 26.0 + 2.0 * n(vec2(vUv.x * 3.0 - uT * 1.5, 0.0)));
      float a = n(q) * 0.6 + n(q * vec2(2.7, 1.9) + 9.0) * 0.4;
      float b = n(q * vec2(0.6, 0.5) + 31.0);
      col = mix(col, vc * 1.25, k * smoothstep(0.5, 0.85, a) * 0.7);
      col = mix(col, vc * 0.45, k * smoothstep(0.55, 0.85, b) * 0.35);
      return col;
    }
    // frost growing over the lens from its edges (a fixed pattern: no time in it, so the loop point matches), and the
    // frozen air piled up over it (solid, cold white)
    vec3 lens(vec3 col, float k, float bury) {
      if (k > 0.0) {
        vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
        float nn = n(vUv * vec2(4.0, 7.0)) * 0.6 + n(vUv * vec2(11.0, 19.0)) * 0.4;
        float d = 0.62 - length(c * vec2(1.0, 0.8)) + 0.22 * (nn - 0.5);
        float thr = mix(-0.25, 0.95, k);
        float ice = 1.0 - smoothstep(thr - 0.09, thr + 0.05, d);
        // crystals: streaks running in from the edge, sparkling a little
        vec2 dir = normalize(c + 1e-4);
        float ang = atan(dir.y, dir.x);
        float fern = n(vec2(ang * 40.0, length(c) * 18.0)) * 0.55 + n(vUv * vec2(70.0, 124.0)) * 0.45;
        vec3 ic = mix(vec3(0.74, 0.82, 0.93), vec3(1.0, 1.0, 1.03), fern) * (0.95 + 0.15 * k);
        col = mix(col, ic, ice * mix(0.78, 1.0, k));
      }
      // the snow climbing over the lens from the bottom up (a soft, lumpy edge)
      if (bury > 0.0) {
        float edge = bury * 1.35 - 0.12 + 0.06 * (n(vec2(vUv.x * 9.0, 3.0)) - 0.5) + 0.03 * (n(vec2(vUv.x * 31.0, 7.0)) - 0.5);
        float b = smoothstep(edge + 0.02, edge - 0.04, vUv.y);
        col = mix(col, vec3(0.9, 0.94, 1.0) * (0.92 + 0.08 * vUv.y), b);
      }
      return col;
    }
    void main() {
      // the wipe's edge sweeps right to left, leaning a little; the new weather comes in on the right
      float s = vUv.x + (vUv.y - 0.5) * 0.22 / uAspect;
      float E = mix(1.16, -0.16, uW);
      vec3 col;
      // a veil (dust, white-out) close round you, thicker toward the edges and the bottom of the frame
      float vg = 0.75 + 0.5 * length(vUv - vec2(0.5, 0.55)) + 0.2 * (n(vUv * vec2(6.0, 11.0) + vec2(uT * 2.0, 0.0)) - 0.5);
      if (uW <= 0.0 || s < E) { col = texture2D(tA, shim(vUv, uShimA)).rgb * uExpA; col = mix(col, uVeilA.rgb, clamp(uVeilA.a * vg, 0.0, 1.0)); col = streaks(col, uVeilA.rgb, uStrA); col = lens(col, uIceA, uBuryA); }
      else { col = texture2D(tB, shim(vUv, uShimB)).rgb * uExpB; col = mix(col, uVeilB.rgb, clamp(uVeilB.a * vg, 0.0, 1.0)); col = streaks(col, uVeilB.rgb, uStrB); col = lens(col, uIceB, uBuryB); }
      if (uW > 0.0 && uW < 1.0) {
        float d = abs(s - E);
        col += vec3(1.4, 1.25, 1.0) * (exp(-d * 260.0) * 3.0 + exp(-d * 40.0) * 0.5);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
});
mix.needsSwap = true;
mix.uniforms.tA.value = rtA.texture; mix.uniforms.tB.value = rtB.texture;     // (ShaderPass clones its uniforms' textures)
composer.addPass(mix);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.45, 1.25);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.24 }, uTitle: { value: 0 }, uPick: { value: 0 }, uAb: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uPick; uniform float uAb;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.15);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.85) / 0.075, 2.0));
      col *= 1.0 - uPick * 0.36 * exp(-pow((vUv.y - 0.66) / 0.11, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// the camera: just behind you on the sand, at 1.9 m, looking out to sea and up a little at the low Sun (it never moves;
// it shakes). Pitched 7 deg so the Sun, low over the sea, sits under the title and counter
const CAMY = landY(CAM0.x) + CAM0.h, PITCH = 7;
function placeCamera(v, o, snap) {
  const sh = window.__cover ? 0 : (o ? o.shake : 0) + snap * 0.6;
  const jolt = window.__cover ? 0 : (o ? o.jolt : 0);
  let x = CAM0.x + wobble(v * 0.4, 2) * 0.012, y = CAMY + wobble(v * 0.33, 3) * 0.01, z = CAM0.z;
  let pitch = (PITCH + wobble(v * 0.3, 7) * 0.22) * DEG, yaw = (90 - CAM0.b + wobble(v * 0.27, 5) * 0.22) * DEG, roll = wobble(v * 0.21, 9) * 0.25 * DEG;
  if (sh > 0) {
    x += wobble(v * 13, 1) * 0.015 * sh; y += wobble(v * 11, 4) * 0.015 * sh;
    pitch += wobble(v * 17, 6) * 0.45 * DEG * sh; roll += wobble(v * 9, 8) * 0.6 * DEG * sh; yaw += wobble(v * 15, 2) * 0.3 * DEG * sh;
  }
  pitch -= (snap * 0.8 + jolt * 0.6) * DEG;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = FOV * (1 - 0.025 * snap);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function drawSide(i, v, target, snap) {
  placeCamera(v, null, snap);
  const o = world.setStop(i, v, camera);
  placeCamera(v, o, snap);
  world.sky.mesh.position.copy(camera.position);
  renderer.toneMappingExposure = 1;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  return o;
}

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  let oa;
  if (s.w <= 0 || s.a === s.b) { oa = drawSide(s.a, v, rtA, s.snap); mix.uniforms.uW.value = 0; }
  else {
    oa = drawSide(s.a, v, rtA, 0);
    const ob = drawSide(s.b, v, rtB, s.snap);
    mix.uniforms.uW.value = s.w; mix.uniforms.uExpB.value = ob.exp; mix.uniforms.uShimB.value = ob.shimmer;
    mix.uniforms.uVeilB.value.set(...ob.veil); mix.uniforms.uStrB.value = ob.streak || 0; mix.uniforms.uIceB.value = ob.lensIce || 0; mix.uniforms.uBuryB.value = ob.bury || 0;
  }
  mix.uniforms.uExpA.value = oa.exp; mix.uniforms.uShimA.value = oa.shimmer; mix.uniforms.uT.value = v;
  mix.uniforms.uVeilA.value.set(...oa.veil); mix.uniforms.uStrA.value = oa.streak || 0; mix.uniforms.uIceA.value = oa.lensIce || 0; mix.uniforms.uBuryA.value = oa.bury || 0;
  finish.uniforms.uAb.value = s.snap * 0.7 + (oa.jolt || 0) * 0.5;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uPick.value = window.__cover ? 0 : (1 - s.flash);
  overlay(v, s);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.9, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [44, 42, 40, 37, 34, 31.8, 29, 27, 24.1, 22, 19, 16.4, 13, 10, 8.7, 6, 4, 1.0, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world, state, comp: () => comp };
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
    hud.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});
