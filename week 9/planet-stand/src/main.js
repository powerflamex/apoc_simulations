import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP } from './timeline.js';
import { DEG, wobble } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer: everything solid is within a few km (the sky is drawn at the far plane)
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
scene.fog = new THREE.FogExp2(new THREE.Color(1, 1, 1), 0.001);
const FOV = 60;
const camera = new THREE.PerspectiveCamera(FOV, W / H_, 0.1, 12000);
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
  uniforms: { tA: { value: rtA.texture }, tB: { value: rtB.texture }, uW: { value: 0 }, uExpA: { value: 1 }, uExpB: { value: 1 },
    uShimA: { value: 0 }, uShimB: { value: 0 }, uT: { value: 0 }, uAspect: { value: W / H_ } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA, tB; uniform float uW, uExpA, uExpB, uShimA, uShimB, uT, uAspect;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    // heat shimmer: the air wobbles, most near the ground and horizon
    vec2 shim(vec2 uv, float k) {
      if (k <= 0.0) return uv;
      float m = smoothstep(0.62, 0.38, uv.y);
      vec2 q = vec2(uv.x * 30.0, uv.y * 70.0 - uT * 6.0);
      return uv + k * m * 0.0022 * vec2(n(q) - 0.5, n(q + 17.0) - 0.5);
    }
    void main() {
      // the wipe's edge sweeps right to left, leaning a little; the new place comes in on the right
      float s = vUv.x + (vUv.y - 0.5) * 0.22 / uAspect;
      float E = mix(1.16, -0.16, uW);
      vec3 col;
      if (uW <= 0.0 || s < E) col = texture2D(tA, shim(vUv, uShimA)).rgb * uExpA;
      else col = texture2D(tB, shim(vUv, uShimB)).rgb * uExpB;
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
      col *= 1.0 - uPick * 0.34 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// the camera: over your right shoulder, a little above your head, looking out ahead with the horizon low in the frame
const CAM = { x: -0.22, y: 1.52, z: -2.95, pitch: 2.0 };
function placeCamera(v, cam, snap) {
  let x = CAM.x + wobble(v * 0.4, 2) * 0.012 + (cam.dx || 0);
  let y = CAM.y + wobble(v * 0.33, 3) * 0.01 + (cam.dy || 0);
  let pitch = (CAM.pitch + (cam.pitch || 0) + wobble(v * 0.3, 7) * 0.25) * DEG;
  let yaw = Math.PI + wobble(v * 0.27, 5) * 0.25 * DEG;          // (yaw PI looks along +z)
  let roll = (wobble(v * 0.21, 9) * 0.3 + (cam.roll || 0)) * DEG;
  const sh = (cam.shake || 0) + snap * 0.6;
  if (!window.__cover && sh > 0) {
    x += wobble(v * 13, 1) * 0.02 * sh; y += wobble(v * 11, 4) * 0.02 * sh;
    pitch += wobble(v * 17, 6) * 0.5 * DEG * sh; roll += wobble(v * 9, 8) * 0.7 * DEG * sh;
  }
  pitch -= snap * 0.8 * DEG;
  camera.position.set(x, y, CAM.z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = FOV * (1 - 0.025 * snap);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  world.sky.mesh.position.copy(camera.position);
  world.sky.u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
}

function drawSide(i, v, target, snap) {
  const o = world.setPlace(i, v);
  placeCamera(v, o.cam, window.__cover ? 0 : snap);
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
  else if (s.w >= 1) { oa = drawSide(s.b, v, rtA, s.snap); mix.uniforms.uW.value = 0; }
  else {
    oa = drawSide(s.a, v, rtA, s.snap);
    const ob = drawSide(s.b, v, rtB, s.snap);
    mix.uniforms.uW.value = s.w; mix.uniforms.uExpB.value = ob.exp; mix.uniforms.uShimB.value = ob.shimmer;
  }
  mix.uniforms.uExpA.value = oa.exp; mix.uniforms.uShimA.value = oa.shimmer; mix.uniforms.uT.value = v;
  finish.uniforms.uAb.value = s.snap * 0.7;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uPick.value = window.__cover ? 0 : (1 - s.flash);
  overlay(v, s);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - THREE.MathUtils.smoothstep(tail, 0, LOOP * 0.9));
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
  for (const t of [45, 43, 39, 33, 30.4, 27, 24.2, 21, 18, 15, 12, 9, 6, 3, 0]) renderFrame(t);   // compile everything once
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
