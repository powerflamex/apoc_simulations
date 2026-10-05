import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld, CAM_BASE } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, DURATION, STORY_START, VIDEO_DURATION } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x222233, 0.0001);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 60000);
camera.rotation.order = 'YXZ';

const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();

// post: MSAA scene target -> bloom -> tone map -> grain/vignette
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: params.has('grain') ? 0.028 : 0 }, uVig: { value: 0.32 }, uAb: { value: 0 }, uTitle: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uAb; uniform float uTitle;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float v = 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= v;
      // a soft dark band behind the opening title so it reads on any sky
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.69) / 0.095, 2.0));
      col += (h(vUv * 1920.0 + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;   // film grain: off by default, it wrecks TikTok/YouTube compression
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ----- story -> scene -----
const dirFromAzEl = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
const MOON_START = dirFromAzEl(-11 * DEG, 20 * DEG);
const SUN_DIR = new THREE.Vector3(0.15, -0.05, 1).normalize();
const ctx = { bhDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), fogColor: new THREE.Color(), camLift: 0, camRoll: 0 };
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q0 = new THREE.Quaternion();
const fwd = new THREE.Vector3(0, 0, -1);

function slerpDir(a, b, k, out) {
  qa.setFromUnitVectors(fwd, a);
  qb.setFromUnitVectors(fwd, b);
  q0.slerpQuaternions(qa, qb, k);
  return out.copy(fwd).applyQuaternion(q0);
}

function update(t) {
  const s = state(t);
  ctx.bhDir.copy(dirFromAzEl(s.bhAz, s.bhEl));
  slerpDir(MOON_START, ctx.bhDir, s.moonProgress, ctx.moonDir);
  const n = s.night;
  ctx.fogColor.setRGB(lerp(0.36, 0.022, n), lerp(0.30, 0.022, n), lerp(0.42, 0.036, n))
    .add(new THREE.Color(0.32, 0.15, 0.06).multiplyScalar(s.disk * 0.35));

  // camera: handheld breathing, quake shake, then the building lets go
  const lift = s.lift;
  ctx.camLift = Math.pow(lift, 2.6) * 620;
  ctx.camRoll = (lift * lift) * 9 * DEG;
  const shakeA = s.quake * 0.32 * DEG;
  const hf = (k) => Math.sin(t * 31 + k) * 0.5 + Math.sin(t * 47.3 + k * 2.1) * 0.3 + Math.sin(t * 73.1 + k * 3.7) * 0.2;
  camera.position.set(
    CAM_BASE.x + wobble(t * 0.35, 1) * 0.03,
    CAM_BASE.y + ctx.camLift + wobble(t * 0.4, 2) * 0.02 + hf(4) * s.quake * 0.03,
    CAM_BASE.z + wobble(t * 0.3, 3) * 0.03,
  );
  // slow camera moves that follow the story (degrees; keys ease between points)
  const pan = keys([[12, 0], [24, -1], [30, -4], [35, -3], [39, 0]], t) * DEG;
  const pitch = keys([[12, -5], [19, -3], [26, 1.5], [33, 2], [37, -1], [42, -6], [48, -4], [54, 1], [60, -1], [66, -3]], t) * DEG + smooth(66, 76, t) * 21 * DEG;
  camera.rotation.set(
    pitch + wobble(t * 0.5, 4) * 0.12 * DEG + hf(1) * shakeA,
    pan + wobble(t * 0.42, 5) * 0.18 * DEG + hf(2) * shakeA,
    wobble(t * 0.37, 6) * 0.1 * DEG + hf(3) * shakeA * 0.6 + ctx.camRoll,
  );
  camera.fov = 62 + smooth(66, 76, t) * 8;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // sky
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = t;
  u.uNight.value = n;
  u.uStarVis.value = s.starVis;
  u.uSunDir.value.copy(SUN_DIR);
  u.uBhDir.value.copy(ctx.bhDir);
  u.uBhD.value = s.bhD;
  u.uDisk.value = s.disk;
  u.uMoonDir.value.copy(ctx.moonDir);
  u.uMoonTail.value.copy(ctx.bhDir).sub(MOON_START).normalize();   // along the Moon's path (well defined even once it reaches the hole)
  u.uMoonStretch.value = s.moonStretch;
  u.uMoonFade.value = s.moonFade;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;

  G.uDiskLight.value = s.disk;
  world.frame(t, s, ctx);

  renderer.toneMappingExposure = s.exposure;
  bloom.strength = 0.32 + s.disk * 0.12 + s.flash * 1.5;
  bloom.threshold = 1.0;
  finish.uniforms.uTime.value = t;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uAb.value = s.quake * 0.12 + s.flash * 1.2;

  overlay(t, s);
  return s;
}

let comp = null;
// t is video time; the story starts STORY_START seconds in
function renderFrame(t) {
  update(t + STORY_START);
  composer.render();
  if (comp) comp.paint();
}

// ----- boot -----
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  // compile everything once
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  renderFrame(60);
  renderFrame(0);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { G, scene, camera, renderer, composer };
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
  const fit = () => {
    const k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${k})`;
  };
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
  window.__error = String(e && e.stack || e);
});
