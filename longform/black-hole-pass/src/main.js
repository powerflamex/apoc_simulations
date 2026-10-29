// "What if a black hole passed Earth?" (1920x1080, 30 fps, no voice). The video is a pure function of time:
// renderFrame(v). timeline.js says which scene is on screen (shotAt) and what state the world is in (state); each
// scene module draws itself: the avenue (street.js), the highway to the airport (highway.js), the subway platform
// (subway.js), and space (space.js: the planets torn apart, and you falling in at the end). The avenue's main
// screen shows the LIVE picture from space, rendered into a texture first.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeStreet } from './street.js';
import { makeSpace } from './space.js';
import { makeHighway } from './highway.js';
import { makeSubway } from './subway.js';
import { feedAt } from './screens.js';
import { makeOverlay } from './overlay.js';
import { state, shotAt, SHOTS, VIDEO_DURATION, FF_LEN } from './timeline.js';
import { smooth, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const Wd = 1920, Hd = 1080;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(Wd, Hd, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const street = makeStreet(renderer);
const space = makeSpace(renderer);
const highway = makeHighway(renderer);
const subway = makeSubway(renderer);
const feed = space.makeFeed();
street.screens?.setFeed?.(feed.texture);
const blank = new THREE.Scene();
blank.background = new THREE.Color(0x000000);
const blankCam = new THREE.PerspectiveCamera();
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(Wd, Hd, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(Wd, Hd);
const renderPass = new RenderPass(street.scene, street.camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(Wd / 2, Hd / 2), 0.35, 0.45, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 }, uNote: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uAb, uNote;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.8), c * vec2(1.0, 0.8)) * 2.2;
      // soft dark bands behind the title and under the counter, so the text reads on any picture
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.6) / 0.16, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.14) / 0.12, 2.0)) * smoothstep(0.62, 0.15, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// cuts between shots get a quick white blink (not into or out of space, which cuts straight)
const CUTS = SHOTS.slice(1).map((s) => s[0]).filter((v) => v !== FF_LEN || true);

function update(v) {
  const s = state(v);
  const shot = shotAt(v);
  let exposure = 1.0;
  if (shot.scene === 'street') {
    const f = feedAt(v);
    if (f) feed.render(f.what, f.u, v);
    street.frame(v, s);
    renderPass.scene = street.scene; renderPass.camera = street.camera;
    exposure = 1.15;
    bloom.threshold = 1.0; bloom.strength = 0.4 + 0.15 * s.disk;
  } else if (shot.scene === 'space' || shot.scene === 'fall') {
    space.prepare(shot.scene === 'fall' ? 'fall' : shot.what, shot.u, v);
    renderPass.scene = space.lensScene; renderPass.camera = space.lensCamera;
    exposure = 0.9;
    bloom.threshold = 1.2; bloom.strength = 0.32;
  } else if (shot.scene === 'highway') {
    highway.frame(v, s);
    renderPass.scene = highway.scene; renderPass.camera = highway.camera;
    exposure = 1.1;
    bloom.threshold = 1.0; bloom.strength = 0.4;
  } else if (shot.scene === 'subway') {
    subway.frame(v, s);
    renderPass.scene = subway.scene; renderPass.camera = subway.camera;
    exposure = 1.1;
    bloom.threshold = 1.0; bloom.strength = 0.45;
  } else {
    renderPass.scene = blank; renderPass.camera = blankCam;
  }
  renderer.toneMappingExposure = exposure;
  // the blink at each cut, and the quake's colour fringe
  let blink = 0;
  for (const c of CUTS) if (c > FF_LEN - 0.01) blink = Math.max(blink, Math.exp(-Math.abs(v - c) * 16) * 0.55);
  if (v >= 300) blink = 0;
  s.blink = window.__cover ? 0 : blink;
  finish.uniforms.uAb.value = (s.quake || 0) * 0.5;
  finish.uniforms.uTitle.value = window.__cover ? 1.1 : v < FF_LEN ? 1 - smooth(4.3, 5.0, v) : 0;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 0.9 * (1 - Math.max(s.white, s.black));
  overlay(v, s);
  return s;
}

let comp = null;
function renderFrame(t) {
  update(t);
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
  for (const t of [2, 10, 22, 30, 70, 100, 115, 160, 220, 270, 310, 335]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { renderer, composer, street, space, state };
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / Wd, innerHeight / Hd)})`; };
  fit();
  addEventListener('resize', fit);
  const hudEl = document.createElement('div');
  hudEl.id = 'hud';
  document.body.appendChild(hudEl);
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
    hudEl.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps  [space] [←/→]`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
});
