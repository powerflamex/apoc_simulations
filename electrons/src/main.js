import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeTokyo } from './tokyo.js';
import { makeEarthScene } from './space.js';
import { makeSolarScene } from './solar.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, V_EVENT, V_REPEL, V_WHITE, V_SPACE } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

// ---------- the street ----------
const street = new THREE.Scene();
street.fog = new THREE.FogExp2(0xb8c6d6, 0.0012);
const cam = new THREE.PerspectiveCamera(58, W / H, 0.05, 20000);
cam.rotation.order = 'YXZ';
const sky = makeSky();
street.add(sky.mesh);
const tokyo = makeTokyo(street);
sky.uniforms.uSunDir.value.copy(tokyo.sunDir);

// ---------- space ----------
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(230,240,255,0.9)'); gr.addColorStop(0.5, 'rgba(160,190,255,0.22)'); gr.addColorStop(1, 'rgba(120,150,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const earth = makeEarthScene(glowTex);
const solar = makeSolarScene(glowTex);
const overlay = makeOverlay();

// post: MSAA scene target -> bloom -> tone map -> vignette + title band + counter band
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(street, cam);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (any(isnan(col))) col = vec3(0.0);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.535) / 0.06, 2.0)) * smoothstep(0.75, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// camera on the street: at the curb on the station side, looking west across the scramble
// (yaw: 90 = west, 165 = toward the Sun in the south; pitch + = up)
// after the electrons vanish: a look up at the black sky, a push forward through the frozen see-through crowd,
// a turn in the middle of the crossing as the sparks rise, then up and away above it as everything burns white
const CAM_X = [[-1, 17.5], [V_EVENT, 15.3], [4.8, 15.0], [8.2, 1.0], [14.6, -5.0], [V_WHITE, -6.0]];
const CAM_Y = [[-1, 1.68], [V_EVENT, 1.68], [4.8, 2.05], [14.6, 2.05], [V_WHITE, 70]];
const CAM_Z = [[-1, 15.0], [V_EVENT, 13.6], [4.8, 13.4], [8.2, 9.0], [14.6, 4.0], [V_WHITE, 2.0]];
const YAW = [[-1, 98], [V_EVENT, 97], [3.4, 112], [4.8, 86], [8.2, 80], [11.0, 120], [14.6, 150], [V_WHITE, 160]];
const PITCH = [[-1, 3], [V_EVENT, 3], [3.4, 26], [4.6, 2], [8.2, 0], [11.0, 6], [14.6, -4], [16.4, -50], [V_WHITE, -62]];

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  let scene = street, camera = cam, exposure = 1.0, bloomS = 0.3;
  if (s.scene === 'street') {
    const walk = 1 - smooth(V_EVENT - 0.3, V_EVENT + 0.2, v);
    cam.position.set(keys(CAM_X, v), keys(CAM_Y, v) + Math.abs(Math.sin(v * Math.PI * 1.9)) * 0.04 * walk + wobble(v * 0.3, 2) * 0.02, keys(CAM_Z, v));
    cam.rotation.set(keys(PITCH, v) * DEG + wobble(v * 0.6, 3) * 0.25 * DEG, keys(YAW, v) * DEG + wobble(v * 0.5, 4) * 0.3 * DEG, wobble(v * 0.4, 5) * 0.2 * DEG);
    cam.fov = 58;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    sky.mesh.position.copy(cam.position);
    sky.uniforms.uPx.value = (2 * Math.tan((cam.fov * DEG) / 2)) / RH;
    sky.uniforms.uBlack.value = s.gone;
    street.fog.density = s.gone ? 0 : 0.0012;
    tokyo.frame(v, s, cam);
    exposure = s.gone ? 1.0 : 1.0;
    bloomS = s.gone ? 0.4 + 0.5 * s.repel : 0.25;
  } else if (s.scene === 'earth') {
    scene = earth.scene; camera = earth.camera;
    earth.frame(v);
    bloomS = 0.3;
  } else {
    scene = solar.scene; camera = solar.camera;
    solar.frame(v);
    bloomS = 0.4;
  }
  renderPass.scene = scene;
  renderPass.camera = camera;
  renderer.toneMappingExposure = exposure;
  bloom.strength = bloomS;
  bloom.threshold = 1.0;
  bloom.radius = 0.4;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  overlay(v, s, v);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// white clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  await earth.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [50, 36, 25, 10, 1, 0]) renderFrame(t);   // compile every scene and material once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { G, street, cam, renderer, composer, tokyo, earth, solar };
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
  const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${k})`; };
  fit();
  addEventListener('resize', fit);
  const hud = document.createElement('div');
  hud.id = 'hud';
  document.body.appendChild(hud);
  let t = Number(params.get('still') ?? params.get('t') ?? 0);
  let playing = !params.has('still');
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
    hud.textContent = `${t.toFixed(2)}s ${playing ? '▶' : '❚❚'}  ${(1 / Math.max(dt, 1e-3)).toFixed(0)}fps`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => { console.error(e); window.__error = String(e && e.stack || e); });
