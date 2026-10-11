import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld, CAM_BASE } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, hourAngle, storyHours, VIDEO_DURATION, LOOP, V_FLOAT, ROOF_Y } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

// ?wide=1: a 1920x1080 version for the long-form compilation (same story, wider frame)
const WIDE = new URLSearchParams(location.search).has('wide');
const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));   // ?res=0.5: a quicker, softer preview (the text stays sharp)
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

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8899aa, 0.0001);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 60000);
camera.rotation.order = 'YXZ';

const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene, sky.uniforms);
const overlay = makeOverlay();

// post: MSAA scene target -> bloom -> tone map -> vignette + title band
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: params.has('grain') ? 0.028 : 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uTitle; uniform float uCounter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      // soft dark bands behind the title and the counter so they read on any sky
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.535) / 0.06, 2.0)) * smoothstep(0.75, 0.2, vUv.x);
      col += (h(vUv * 1920.0 + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ----- story -> scene -----
const ctx = { sunDir: new THREE.Vector3(), sunPrev: new THREE.Vector3(), moonDir: new THREE.Vector3(), fogColor: new THREE.Color() };
const LAT = 1.3 * DEG, DEC = -6 * DEG, VEN_DEC = -14 * DEG;
const skyDir = (Hdeg, dec, out) => {
  const Hr = Hdeg * DEG;
  return out.set(
    Math.cos(LAT) * Math.sin(dec) - Math.sin(LAT) * Math.cos(dec) * Math.cos(Hr),
    Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(Hr),
    -Math.cos(dec) * Math.sin(Hr),
  );
};
const venus = new THREE.Vector3();
const night = new THREE.Color(0.03, 0.04, 0.08), dusk = new THREE.Color(0.55, 0.36, 0.34), dayHaze = new THREE.Color(0.56, 0.66, 0.8), goldHaze = new THREE.Color(0.86, 0.6, 0.4), white = new THREE.Color(0.93, 0.93, 0.91);

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.cloud = Math.max(s.cloud, cover); }   // loop tail: the cloud's white clears into the first frame
  ctx.sunDir.fromArray(s.sun);
  // the Sun's streak: where it was a moment ago (a phone time-lapse smears it along its path)
  const trail = Math.min(s.skySpeed * 0.25, 0.3);
  skyDir(s.H - trail / DEG, DEC, ctx.sunPrev);
  ctx.moonDir.fromArray(s.moon);
  skyDir(s.H - 38, VEN_DEC, venus);

  // fog / haze colour follows the sky near the horizon
  ctx.fogColor.copy(night).lerp(dusk, smooth(-0.2, -0.02, ctx.sunDir.y)).lerp(goldHaze, smooth(-0.01, 0.08, ctx.sunDir.y)).lerp(dayHaze, smooth(0.12, 0.4, ctx.sunDir.y)).lerp(white, s.cloud);

  // camera: a phone held up on the deck; it watches the sky, looks down at the flood, then floats up into a cloud
  // you watch the sky from the middle of the deck, walk to the front rail to look down at the flood,
  // turn to the pool as everyone gets lighter, then float up with it all
  const rise = s.camRise;
  const walking = smooth(15.3, 15.8, v) * (1 - smooth(19.2, 19.8, v));
  camera.position.set(
    keys([[15.4, 0], [16.6, 2.25], [18.2, 2.2], [19.6, 3.4]], v) + wobble(v * 0.35, 1) * 0.03,
    CAM_BASE.y + wobble(v * 0.4, 2) * 0.02 + Math.abs(Math.sin(v * Math.PI * 1.9)) * 0.05 * walking + rise,
    keys([[15.4, 0], [16.6, -3.5], [18.2, -8.5], [19.6, -12.6]], v) + wobble(v * 0.3, 3) * 0.03 - rise * 0.08,
  );
  const yaw = keys([[-1, 15], [14, 14], [16.5, 9], [19.5, 4], [28, 2], [31, 40], [34.5, 92], [46, 96], [V_FLOAT, 99], [56.5, 100], [58.5, 93], [60.5, 82], [62, 76]], v) * DEG;   // keep watching the deck's things float up around you
  const pitch = keys([[-1, 5], [0, 5], [6, 4.5], [13, 3], [15.4, 0], [17, -6], [19.6, -24], [23, -32], [27, -26], [30, -14], [34.5, -9], [40, -8], [46, -8], [50, -9], [V_FLOAT, -14], [55.2, -34], [57, -24], [58.6, -8], [60, 4], [61, 10], [62, 15]], v) * DEG;
  const roll = (Math.sin(v * Math.PI * 0.95) * 0.6 * walking + smooth(V_FLOAT + 1, 62, v) * 5) * DEG;
  camera.rotation.set(
    pitch + wobble(v * 0.5, 4) * 0.12 * DEG,
    yaw + wobble(v * 0.42, 5) * 0.18 * DEG,
    wobble(v * 0.37, 6) * 0.1 * DEG + roll,
  );
  camera.fov = 62;
  if (WIDE) camera.fov = 2 * Math.atan(Math.tan(camera.fov * DEG / 2) * 0.62) / DEG;   // same scene, a wider and shorter frame
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // sky
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uTime.value = v;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uSunDir.value.copy(ctx.sunDir);
  u.uSunPrev.value.copy(ctx.sunPrev);
  u.uMoonDir.value.copy(ctx.moonDir);
  u.uVenusDir.value.copy(venus);
  u.uPole.value.fromArray(s.pole);
  u.uRot.value = s.starRot;
  u.uTrail.value = Math.min(s.skySpeed * 0.006, 0.01);   // tiny tails: the stars read as stars, the motion shows in the video
  u.uCity.value = s.cityLights;
  u.uWhite.value = s.cloud;
  const hrs = s.hours;
  u.uCloudOff.value.set(hrs * 0.09, -hrs * 0.035);
  u.uCloudMorph.value = hrs * 0.06;
  const cloudSpeed = (storyHours(v + 0.05) - storyHours(v - 0.05)) / 0.1;   // story hours per video second
  u.uCloudBlur.value.set(0.09, -0.035).multiplyScalar(cloudSpeed * 0.12);
  u.uCloudH.value = Math.max(520 - camera.position.y, 30);
  u.uCloudCover.value = 0.3;

  world.frame(v, s, ctx);

  // exposure: a phone brightening the night (night mode) and holding the sunset
  renderer.toneMappingExposure = (lerp(1.9, 0.82, smooth(0, 1, s.day)) + 0.1 * s.twilight) * (1 - 0.2 * (1 - smooth(0.05, 0.35, ctx.sunDir.y)) * s.day);
  bloom.strength = 0.26 + 0.22 * (1 - s.day);
  bloom.threshold = 1.2;
  bloom.radius = 0.28;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// cloud's white clears, so the video loops seamlessly.
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

// ----- boot -----
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  renderFrame(55);   // compile everything once (night, day, floating)
  renderFrame(3);
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
