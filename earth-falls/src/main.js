import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld, CAM_BASE } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, STORY_START, VIDEO_DURATION } from './timeline.js';
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8899aa, 0.0001);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 60000);
camera.rotation.order = 'YXZ';

const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.4, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// heat shimmer, the title band, vignette, and the glare that bleaches the frame at the end
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: params.has('grain') ? 0.026 : 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uShimmer: { value: 0 }, uGlare: { value: 0 }, uCounter: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uTitle; uniform float uShimmer; uniform float uGlare; uniform float uCounter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main() {
      vec2 c = vUv - 0.5;
      // rising heat shimmer, strongest low in the frame over the hot ground
      vec2 sp = vec2(vUv.x * 24.0, vUv.y * 60.0 - uTime * 3.0);
      vec2 off = (vec2(vn(sp), vn(sp + 7.3)) - 0.5) * 0.004 * uShimmer * (1.2 - vUv.y);
      vec3 col = texture2D(tDiffuse, vUv + off).rgb;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.69) / 0.095, 2.0));
      col = mix(col, vec3(1.0, 0.95, 0.85), uGlare * 0.4 * (0.6 + 0.4 * smoothstep(0.2, 0.8, vUv.y)));
      // a soft shade behind the counter so it stays readable on a bright sky
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.525) / 0.07, 2.0)) * smoothstep(0.75, 0.05, vUv.x);
      float v = 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= v;
      col += (h(vUv * 1920.0 + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ----- story -> scene -----
const dirFromAzEl = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
const SUN_BASE = { az: 8 * DEG, el: 4.2 * DEG };
const ctx = { sunDir: new THREE.Vector3(), sunR: 0.00466, fogColor: new THREE.Color() };

function update(t) {
  const s = state(t);
  // the Sun sits low over the sea; as it swells its centre climbs a little so it stays in the sky
  ctx.sunR = 0.00466 * s.sunScale;
  ctx.sunDir.copy(dirFromAzEl(SUN_BASE.az * (1 - 0.6 * smooth(40, 58, t)), SUN_BASE.el + ctx.sunR * 1.15));
  ctx.fogColor.setRGB(0.85, 0.6, 0.42).lerp(new THREE.Color(1.0, 0.92, 0.78), s.heat).lerp(new THREE.Color(0.4, 0.3, 0.22), s.smoke * 0.5);

  // camera: a handheld phone on the balcony; slow moves that follow the story
  camera.position.set(
    CAM_BASE.x + wobble(t * 0.35, 1) * 0.03,
    CAM_BASE.y + wobble(t * 0.4, 2) * 0.02,
    CAM_BASE.z + wobble(t * 0.3, 3) * 0.03,
  );
  const pan = keys([[0, -2], [9, 1.5], [16, 0], [24, -3], [34, 2.5], [42, 0], [50, 3]], t) * DEG;
  const tilt = keys([[0, -4.2], [7, -3.2], [16, -2.5], [26, -1.2], [36, -3.5], [44, -1.5], [52, 1.5], [58, 3]], t) * DEG;
  camera.rotation.set(
    tilt + wobble(t * 0.5, 4) * 0.12 * DEG,
    pan + wobble(t * 0.42, 5) * 0.18 * DEG,
    wobble(t * 0.37, 6) * 0.1 * DEG,
  );
  camera.fov = 62;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = t;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  u.uSunDir.value.copy(ctx.sunDir);
  u.uSunR.value = ctx.sunR;
  u.uHeat.value = s.heat;
  u.uSmoke.value = s.smoke;
  u.uSteam.value = s.boil;

  world.frame(t, s, ctx);

  renderer.toneMappingExposure = s.exposure;
  bloom.strength = 0.3 + 0.2 * s.glare;
  bloom.threshold = 1.0 + 2.2 * s.heat;   // only the Sun and the fires glow, not the whole bright sky
  finish.uniforms.uTime.value = t;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uShimmer.value = smooth(22, 40, t);
  finish.uniforms.uGlare.value = s.glare;
  finish.uniforms.uCounter.value = window.__cover ? 0 : smooth(28, 40, t) * (1 - s.flash);

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

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  renderFrame(40);
  renderFrame(0);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.DURATION = VIDEO_DURATION;
  window.__dbg = { G, scene, camera, renderer, composer };
  window.__glInfo = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })();
  window.__ready = true;
  if (!RENDER_MODE) startPreview();
}

function startPreview() {
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H)})`; };
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
  window.__error = String((e && e.stack) || e);
});
