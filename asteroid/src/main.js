import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld, CAM_BASE, AZ_IMPACT, waterHeight } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, DURATION, T_IMPACT, T_SHOCK, STORY_START, VIDEO_DURATION } from './timeline.js';
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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.4, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// grain, vignette, and frost creeping over the lens at the end
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: params.has('grain') ? 0.026 : 0 }, uVig: { value: 0.3 }, uUnder: { value: 0 }, uAb: { value: 0 }, uTitle: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uUnder; uniform float uAb; uniform float uTitle;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    void main() {
      vec2 c = vUv - 0.5;
      // underwater: wobble, murk, bubbles
      vec2 wob = vec2(sin(vUv.y * 40.0 + uTime * 6.0), cos(vUv.x * 30.0 + uTime * 5.0)) * 0.006 * uUnder;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + wob + off).r, texture2D(tDiffuse, vUv + wob).g, texture2D(tDiffuse, vUv + wob - off).b);
      if (uUnder > 0.0) {
        vec3 blur = (texture2D(tDiffuse, vUv + wob + vec2(0.01, 0.0)).rgb + texture2D(tDiffuse, vUv + wob - vec2(0.01, 0.0)).rgb +
                     texture2D(tDiffuse, vUv + wob + vec2(0.0, 0.006)).rgb + texture2D(tDiffuse, vUv + wob - vec2(0.0, 0.006)).rgb) * 0.25;
        vec3 murk = vec3(0.02, 0.12, 0.13) * (1.2 - vUv.y * 0.8) + blur * vec3(0.2, 0.5, 0.5) * 0.4;
        vec2 bp = vUv * vec2(18.0, 32.0) + vec2(0.0, -uTime * 3.0);
        vec2 bi = floor(bp), bf = fract(bp) - 0.5;
        float bub = step(0.82, h(bi)) * smoothstep(0.18, 0.1, length(bf + (vec2(h(bi + 3.1), h(bi + 7.7)) - 0.5) * 0.4));
        murk += vec3(0.5, 0.7, 0.7) * bub * 0.5;
        col = mix(col, murk, uUnder);
      }
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
const SUN_EL = 8 * DEG;
const SUN_DIR = dirFromAzEl(12 * DEG, SUN_EL);
const IMPACT_DIR = dirFromAzEl(AZ_IMPACT, 0.0);
const ROCK_A = dirFromAzEl(15 * DEG, 22 * DEG);   // starts inside the top of the frame
const ROCK_B = dirFromAzEl(AZ_IMPACT, -0.6 * DEG);
const ctx = { sunDir: SUN_DIR.clone(), impactDir: IMPACT_DIR.clone(), rockDir: new THREE.Vector3(), fogColor: new THREE.Color(), sunVis: 1 };

function update(t) {
  const s = state(t);
  ctx.rockDir.copy(ROCK_A).lerp(ROCK_B, s.rockPath).normalize();
  // the wave rises in front of the low sun and puts the whole city in its shadow
  const waveTop = s.waveOn ? s.waveH : 0;
  const elev = s.waveOn ? Math.atan2(waveTop - 20, Math.max(s.waveF + 150, 1)) : -1;
  ctx.sunVis = 1 - smooth(SUN_EL - 1.5 * DEG, SUN_EL + 0.6 * DEG, elev);
  ctx.fogColor.setRGB(0.78, 0.58, 0.45).lerp(new THREE.Color(0.36, 0.3, 0.27), s.haze * 0.6);

  // camera: handheld, shaken by the quake and the blast
  const q = s.quake;
  const hf = (k) => Math.sin(t * 31 + k) * 0.5 + Math.sin(t * 47.3 + k * 2.1) * 0.3 + Math.sin(t * 73.1 + k * 3.7) * 0.2;
  camera.position.set(
    CAM_BASE.x + wobble(t * 0.35, 1) * 0.03 + hf(5) * q * 0.04,
    CAM_BASE.y + wobble(t * 0.4, 2) * 0.02 + hf(4) * q * 0.05,
    CAM_BASE.z + wobble(t * 0.3, 3) * 0.03,
  );
  const shakeA = q * 0.35 * DEG;
  // tilt up a little to follow the wave as it towers over the city
  const look = smooth(66, 73.4, t) * 9 * DEG;
  // slow camera moves that follow the story (degrees; keys ease between points)
  const pan = keys([[8, 3], [16.5, -1.5], [36, -1], [44, 3], [56, 4], [62, -1.5]], t) * DEG;
  const tilt = keys([[11, -7], [16.5, -8], [19, -9.5], [36, -6.5], [41, -9], [52, -13], [57, -12], [63, -8.5], [66, -9]], t) * DEG;
  camera.rotation.set(
    tilt + look + wobble(t * 0.5, 4) * 0.12 * DEG + hf(1) * shakeA,
    pan + wobble(t * 0.42, 5) * 0.18 * DEG + hf(2) * shakeA,
    wobble(t * 0.37, 6) * 0.1 * DEG + hf(3) * shakeA * 0.6,
  );
  camera.fov = keys([[8, 59.5], [16.5, 62]], t);   // a gentle push-in while the rock comes down
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = t;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  u.uSunDir.value.copy(SUN_DIR);
  u.uSunVis.value = 1;
  u.uHaze.value = s.haze;
  u.uImpactLight.value = s.impactLight;
  u.uImpactDir.value.copy(IMPACT_DIR);
  u.uRockA.value.copy(ROCK_A);
  u.uRockB.value.copy(ROCK_B);
  u.uRockPath.value = Math.max(s.rockPath, 0.0001);
  u.uRockGlow.value = s.rockGlow;
  u.uTrailFade.value = t > 10.5 ? s.trailFade : 0;
  u.uFireball.value = s.fireball;
  u.uPlume.value = s.plume;
  u.uAnvil.value = s.anvil;
  u.uRing.value = t > 30 && t < T_SHOCK ? (t - 30) / (T_SHOCK - 30) : 0;   // progress of the shock front from 60 miles out to here

  world.frame(t, s, ctx);

  renderer.toneMappingExposure = s.exposure;
  bloom.strength = 0.22 + Math.min(s.impactLight * 0.03, 0.6) + s.rockGlow * 0.2;
  finish.uniforms.uTime.value = t;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uUnder.value = s.under;
  finish.uniforms.uAb.value = q * 0.1;

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
  renderFrame(60);
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
