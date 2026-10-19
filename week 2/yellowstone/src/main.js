import { WIDE, wideBand } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld, CAM_BASE } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, STORY_START, VIDEO_DURATION, LOOP, GRID, gridBrown, VENT, colHeight, umbRadius, BOLTS, T_BOOM } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
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
// vignette, the dark band behind the opening title, and the end: inside the hot ash cloud the frame burns to white
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: params.has('grain') ? 0.026 : 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCover: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uTitle; uniform float uCover;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main() {
      vec2 c = vUv - 0.5;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.69'}) / ${WIDE ? '0.17' : '0.095'}, 2.0));
      float v = 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= v;
      col += (h(vUv * 1920.0 + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;
      // burning to white: red-orange first, from the bottom (the ground) up, then a flat white
      if (uCover > 0.0) {
        float k1 = smoothstep(0.0, 0.55, uCover), k2 = smoothstep(0.45, 1.0, uCover);
        float wave = smoothstep(-0.2, 0.0, k1 * 1.3 - vUv.y + (vn(vUv * vec2(6.0, 3.0) + uTime) - 0.5) * 0.25);
        col = mix(col, vec3(1.0, 0.55, 0.22), wave * 0.85 * (1.0 - k2));
        col = mix(col, vec3(1.0, 0.98, 0.95), k2);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ----- story -> scene -----
const dirFromAzEl = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
const SUN_DIR = dirFromAzEl(200 * DEG, 48 * DEG);   // high behind-left: the column is lit from the front
const ctx = { sunDir: SUN_DIR.clone(), fogColor: new THREE.Color(), city: 0, camera };

function update(t, cover = -1) {
  const s = state(t);
  if (cover >= 0) {   // loop tail: the white clears off the first frame
    s.cover = cover; s.hideText = 1 - smooth(0.4, 0.95, 1 - cover);
  }
  const day = s.day;
  // the town glows on the ash cloud while the grid holds
  ctx.city = smooth(37.5, 41, t) * gridBrown(t) * (1 - smooth(GRID.t0, GRID.t0 + GRID.span, t));
  const dd = day * day;   // the haze matches the dark ash sky once the cloud is overhead
  ctx.fogColor.setRGB(lerp(0.02, 0.55, dd), lerp(0.017, 0.64, dd), lerp(0.014, 0.78, dd))
    .add(new THREE.Color(0.05, 0.03, 0.015).multiplyScalar(ctx.city))
    .add(new THREE.Color(0.06, 0.065, 0.08).multiplyScalar(s.bolt * smooth(36, 40, t)))
    .add(new THREE.Color(0.45, 0.13, 0.03).multiplyScalar(s.near * s.near));

  // camera: handheld phone; the boom jolts it; the ground shakes as the hot ash cloud comes
  const shake = s.boom * 0.9 + 0.35 * s.near * s.near;
  camera.position.set(
    CAM_BASE.x + wobble(t * 0.35, 1) * 0.03,
    CAM_BASE.y + wobble(t * 0.4, 2) * 0.02,
    CAM_BASE.z + wobble(t * 0.3, 3) * 0.03,
  );
  // slow camera moves that follow the story (degrees; keys ease between points)
  const pan = keys([[20, -3], [26, -4], [31, -3], [36, 0], [41, 2], [46, 4], [50, 3], [53.5, 2], [58, 0], [62, -2], [72, -1], [85, -2]], t) * DEG;
  const tilt = keys([[20, 1], [23.5, 1], [27, 1.5], [31, 5], [35, 8], [38.5, 3], [42, -9], [46, -15], [51, -15], [53.5, -14], [57, -9], [61, -3], [70, -4], [78, -3], [83.5, 1]], t) * DEG;
  camera.rotation.set(
    tilt + wobble(t * 0.5, 4) * 0.12 * DEG + (Math.sin(t * 41) * 0.6 + Math.sin(t * 27 + 1) * 0.4) * shake * DEG,
    pan + wobble(t * 0.42, 5) * 0.18 * DEG + Math.sin(t * 33 + 2) * shake * 0.6 * DEG,
    wobble(t * 0.37, 6) * 0.1 * DEG + Math.sin(t * 23) * shake * 0.3 * DEG,
  );
  camera.fov = 62;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = t;
  u.uDay.value = day;
  u.uCity.value = ctx.city;
  u.uSunDir.value.copy(SUN_DIR);
  u.uVentAz.value = VENT.az;
  u.uVentD.value = VENT.dist;
  u.uColH.value = colHeight(t);
  u.uUmbR.value = umbRadius(t);
  u.uBolt.value = s.bolt;
  let bolt = null;
  for (const b of BOLTS) if (t >= b[0] && t - b[0] < 0.45) bolt = b;
  if (bolt) u.uBoltP.value.set(bolt[1], bolt[2], bolt[3], bolt[4]);
  u.uAsh.value = s.snowFall;
  u.uFlowGlow.value = s.flowOn * (0.25 + 1.5 * s.near);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / (WIDE ? H * 16 / 9 : H);

  world.frame(t, s, ctx);

  renderer.toneMappingExposure = s.exposure;
  bloom.strength = lerp(0.4, 0.25, day) * (1 - 0.5 * s.flowOn);
  finish.uniforms.uTime.value = t;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCover.value = s.cover;

  overlay(t, s);
  return s;
}

let comp = null;
// t is video time; the story starts STORY_START seconds in. The last LOOP seconds replay the moments just
// before the first frame while the white clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION + STORY_START, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t + STORY_START);
  if (world.beforeRender) world.beforeRender(renderer, camera, sky.mesh);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  renderFrame(50);
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
