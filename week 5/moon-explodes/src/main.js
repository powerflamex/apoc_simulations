import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, MOON_DIR } from './sky.js';
import { makeWorld } from './world.js';
import { makeMoonRocks } from './rocks.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, V_BURST, HITS, V_SPLASH, V_WAVE, V_CHUNK, V_HIT } from './timeline.js';
import { camAt } from './camera.js';
import { DEG, smooth, wobble, clamp, rng } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer: the street-scale promenade near, the towers 2 km off, the streaks 100+ km up
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.02, 0.02, 0.03), 0.0006);
const camera = new THREE.PerspectiveCamera(52, W / H_, 0.3, 600000);
camera.rotation.order = 'YXZ';
camera.layers.enable(1);
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene, camera);
const rocks = makeMoonRocks(scene);
const overlay = makeOverlay();

// post: MSAA -> bloom -> tone map -> the time-lapse leap (a zoom blur out of the Moon), grade, vignette, a band behind the title
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.4, 1.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uLeap: { value: 0 }, uC: { value: new THREE.Vector2(0.55, 0.7) }, uWarm: { value: 0 }, uAb: { value: 0 }, uCount: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uLeap, uWarm, uAb, uCount; uniform vec2 uC;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec3 col = vec3(0.0);
      float lw = uLeap * exp(-dot((vUv - uC) * vec2(0.5625, 1.0), (vUv - uC) * vec2(0.5625, 1.0)) / 0.06);
      if (lw > 0.01) {
        for (int i = 0; i < 12; i++) { float k = 1.0 - float(i) / 12.0 * 0.03 * lw; col += texture2D(tDiffuse, uC + (vUv - uC) * k).rgb; }
        col /= 12.0;
      } else {
        vec2 off = c * uAb * 0.01;
        col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      }
      col = mix(col, col * vec3(1.12, 0.93, 0.76), uWarm);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.15);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.84) / 0.085, 2.0));
      col *= 1.0 - uCount * 0.5 * exp(-pow((vUv.x - 0.2) / 0.3, 2.0) - pow((vUv.y - 0.51) / 0.065, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);

  // ---- the camera ----
  const c = camAt(v);
  let x = c.x, y = c.y, z = c.z, yaw = -c.yaw * DEG, pitch = c.pitch * DEG, roll = 0;
  x += wobble(v * 0.5, 2) * 0.035; y += wobble(v * 0.4, 3) * 0.025;
  yaw += wobble(v * 0.35, 5) * 0.22 * DEG; pitch += wobble(v * 0.3, 7) * 0.18 * DEG; roll += wobble(v * 0.27, 9) * 0.3 * DEG;
  // jolts: the burst, the splash, its wave, every hit on the towers, the final rumble
  let j = 0;
  const jolt = (t0, k) => { const dt = v - t0; if (dt > 0 && dt < 2) j = Math.max(j, k * Math.exp(-dt * 3.5)); };
  jolt(V_BURST, 0.35); jolt(V_SPLASH + 1.5, 0.9); jolt(V_WAVE + 0.3, 0.5);
  for (const h of HITS) jolt(h.v + 1.2, 0.35 + 0.25 * h.size);
  const rumble = smooth(V_CHUNK + 1.2, V_HIT, v) * 1.6 + 0.25 * s.rain;
  const sh = window.__cover ? 0 : j + rumble;
  x += wobble(v * 13, 1) * 0.04 * sh; y += wobble(v * 11, 4) * 0.04 * sh;
  pitch += wobble(v * 17, 6) * 0.5 * DEG * sh; roll += wobble(v * 9, 8) * 0.7 * DEG * sh; yaw += wobble(v * 15, 3) * 0.4 * DEG * sh;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const px = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;

  world.frame(v, s, camera, px);
  rocks.frame(v, s, camera, px);

  // ---- the sky ----
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uCamPos.value.copy(camera.position);
  u.uPx.value = px; u.uTime.value = v;
  u.uM.value = s.M; u.uCut.value = v >= V_BURST ? 1 : 0;
  u.uCrack.value = v < V_BURST ? s.crack : 0;
  // the whole Moon (and its cracks) until it comes apart; from then on the 3D pieces (rocks.js)
  u.uBurst.value = s.burst; u.uHot.value = s.hot; u.uPieces.value = v < V_BURST ? 1 : 0;
  u.uDust.value = 0.2 * s.dust * (1 - 0.45 * s.rain); u.uDustR.value = s.dustR; u.uStretch.value = s.stretch;
  u.uRing.value = s.ring; u.uBand.value = 3.2; u.uSkyL.value = s.skyL;
  u.uStars.value = 1 - 0.6 * smooth(0.1, 1.2, s.skyL);
  u.uCity.value = 1 - 0.8 * s.black;
  u.uHeat.value = s.heat; u.uRain.value = s.rain; u.uLeap.value = s.leap;
  u.uClear.value = 1 - smooth(12.4, 13.6, v);
  u.uFlashSky.value.setRGB(...s.flashSky);
  if (s.chunkI > 0) u.uChunkDir.value.set(...s.chunkDir);
  u.uChunkI.value = s.chunkI;

  // ---- exposure and post ----
  renderer.toneMappingExposure = (1.35 - 0.3 * smooth(12.6, 13.8, v)) * (1 - 0.3 * s.rain - 0.25 * smooth(V_CHUNK - 5, V_CHUNK - 1, v));
  bloom.strength = 0.35 + 0.1 * s.burst + 0.2 * s.chunk;
  bloom.threshold = 1.2;
  finish.uniforms.uLeap.value = window.__cover ? 0 : s.leap * (1 - smooth(20, 24, v));
  // the Moon's place on screen (the leap's blur comes out of it)
  const mp = MOON_DIR.clone().project(camera);
  finish.uniforms.uC.value.set(mp.x * 0.5 + 0.5, mp.y * 0.5 + 0.5);
  finish.uniforms.uWarm.value = 0.25 * s.heat;
  finish.uniforms.uAb.value = sh * 0.6;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCount.value = window.__cover ? 0 : 1 - s.flash;

  overlay(v, s);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears,
// so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ---- boot ----
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [47.5, 44, 38, 33, 30, 25, 18, 12, 6, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world };
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
