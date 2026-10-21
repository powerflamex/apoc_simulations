import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeTerrain, makeCity, TU } from './terrain.js';
import { makeStatue, SU, STATUE } from './statue.js';
import { makeSummit } from './summit.js';
import { makeBeach, extraBuildings, windowPoints } from './beach.js';
import { beachXZ, STREET } from './geo.js';
import { makeFx } from './fx.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, V5, V0, fallOf, vOfTau } from './timeline.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// log depth: from the tourists' shoes to the hills 25 km off
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const HAZE = new THREE.Color(0.62, 0.72, 0.85), DUSTC = new THREE.Color(0.7, 0.65, 0.57), FIRE = new THREE.Color(1.0, 0.45, 0.15);
scene.fog = new THREE.FogExp2(HAZE.clone(), 0.000045);
const camera = new THREE.PerspectiveCamera(58, W / H, 0.3, 80000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// late morning: the Sun high in the north-east, lighting the statue's face
const SUN = new THREE.Vector3(0.32, 0.87, -0.38).normalize();
TU.uSunDir.value.copy(SUN);
const sky = makeSky(SUN);
scene.add(sky.mesh);
const terrain = makeTerrain(scene);
const EXTRA = extraBuildings();
const city = makeCity(scene, EXTRA);
const beach = makeBeach(scene);
const statue = makeStatue(scene);
const summit = makeSummit(scene);
const fx = makeFx(scene, city.B, windowPoints(EXTRA));
fx.dust.mat.uniforms.uLight.value.setRGB(1.35, 1.3, 1.24);

const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 450 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9cc0ee, 0x5a5040, 1.15);
scene.add(hemi);

const overlay = makeOverlay();

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({   // no infinities or NaNs into the bloom
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 60.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.3, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uMuffle: { value: 0 }, uShake: { value: 0 }, uFire: { value: 0 }, uPop: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uMuffle; uniform float uShake; uniform float uFire; uniform float uPop;
    varying vec2 vUv;
    void main() {
      // the moment the air thins: a ring of distortion races out from the middle of the frame
      vec2 cc = (vUv - 0.5) * vec2(1.0, 1.7778);
      float rr = length(cc);
      float front = (1.0 - uPop) * 1.6;
      float ring = exp(-pow((rr - front) / 0.08, 2.0)) * uPop;
      vec2 uv = vUv + normalize(cc + 1e-5) * ring * 0.025 * vec2(1.0, 0.5625);
      vec2 off = (vUv - 0.5) * (uShake * 0.006 + ring * 0.03);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col += vec3(0.9, 0.95, 1.0) * pow(uPop, 3.0) * 0.45 + ring * 0.15;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.22);
      col = mix(col, col * vec3(1.15, 0.75, 0.5) + vec3(0.25, 0.08, 0.0), uFire);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.345) / 0.09, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.53) / 0.065, 2.0)) * smoothstep(0.8, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: held shots (a drone off the terrace, you at the railing, falling with the mountain) ----------
// attached: the camera is on the summit, so it sinks with it
const SUMMIT_Y = STATUE.base;
const BX = (sv, a, y) => { const [x, z] = beachXZ(sv, a); return [x, y, z]; };
const SZ = STREET.z;
const SHOTS = [
  // the statue: a normal day, then the moment
  { a: -3, b: 5.0, pos: [50, 712.5, 7], pos2: [46, 711.8, 6], aim: [0, 727, 0], aim2: [0, 726, 0], fov: 58 },
  // the same moment on Copacabana's promenade, looking up the beach (the sea on the right)
  { a: 5.0, b: 9.0, pos: BX(101, 40, 5.3), pos2: BX(101, 46, 5.3), aim: BX(30, 330, 9), aim2: BX(30, 336, 12), fov: 60 },
  // the same moment in Botafogo: in the street, looking up at the towers
  { a: 9.0, b: 12.5, pos: [2400, 6.7, SZ + 3], pos2: [2412, 6.7, SZ + 3], aim: [2720, 150, SZ - 2], aim2: [2730, 160, SZ - 2], fov: 64 },
  // the same moment on Avenida Atlântica: traffic, the beach, Sugarloaf, the clouds, the helicopter
  { a: 12.5, b: 16.0, pos: BX(119, -170, 5.4), pos2: BX(119, -150, 5.4), aim: BX(40, 900, 150), aim2: BX(40, 920, 160), fov: 55 },
  // then the five seconds (9x)
  { a: 16.0, b: 21.4, pos: [62, 724, 46], pos2: [56, 721, 42], aim: [0, 713, 0], aim2: [0, 708, 0], fov: 50 },
  { a: 21.4, b: 26.8, pos: BX(1050, 330, 270), pos2: BX(1020, 340, 262), aim: BX(250, 420, 40), aim2: BX(300, 420, 50), fov: 55 },
  { a: 26.8, b: 32.2, pos: [-62, 735, 42], pos2: [-56, 730, 38], aim: [0, 714, 0], aim2: [0, 706, 0], fov: 52, aimSink: true },
  { a: 32.2, b: 37.6, pos: [2420, 6.7, SZ + 3], pos2: [2440, 6.7, SZ + 3], aim: [2720, 110, SZ - 2], aim2: [2730, 90, SZ - 2], fov: 64 },
  { a: 37.6, b: 43.0, pos: [58, 712, 44], pos2: [54, 706, 40], aim: [8, SUMMIT_Y + 2, 0], aim2: [8, SUMMIT_Y, 0], fov: 50, aimSink: true },
  { a: 43.0, b: 48.4, pos: BX(1500, 300, 380), pos2: BX(1480, 310, 370), aim: BX(500, 420, 60), aim2: BX(550, 420, 60), fov: 55 },
  { a: 48.4, b: 53.8, pos: [31, SUMMIT_Y + 1.6, 6], pos2: [31, SUMMIT_Y + 1.6, 7], aim: [3300, 40, 2200], aim2: [3400, 20, 2300], fov: 34, attached: true },
  { a: 53.8, b: VIDEO_DURATION + 1, pos: [8, SUMMIT_Y + 1.6, 12.5], pos2: [8.5, SUMMIT_Y + 1.6, 12.8], aim: [300, 420, 2400], aim2: [300, 520, 2400], fov: 60, attached: true },
];
const shotAt = (v) => SHOTS.find((s) => v >= s.a && v < s.b) || SHOTS[0];
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const tmpC = new THREE.Color();

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const t = s.t;

  // ---------- camera ----------
  const sh = shotAt(v);
  const k = smooth(sh.a, sh.b, v);
  v3.set(...sh.pos.map((x, i) => lerp(x, sh.pos2[i], k)));
  v4.set(...sh.aim.map((x, i) => lerp(x, sh.aim2[i], k)));
  if (sh.attached) { v3.y -= s.sink; if (Math.abs(sh.aim[1] - SUMMIT_Y) < 40) v4.y -= s.sink; }
  if (sh.aimSink) v4.y -= s.sink;   // a drone that stays put, tilting down after the sinking summit
  // falling: a slow sway as the ground drops away (it all happens in slow motion)
  const fallSway = smooth(1.6, 3.5, t) * (sh.attached ? 1 : 0);
  v4.sub(v3);
  let yaw = Math.atan2(-v4.x, -v4.z), pitch = Math.atan2(v4.y, Math.hypot(v4.x, v4.z)), roll = 0;
  yaw += (wobble(v * 0.4, 4) * 0.45 + wobble(v * 0.23, 9) * 2.0 * fallSway) * DEG;
  pitch += (wobble(v * 0.5, 3) * 0.4 + wobble(v * 0.19, 8) * 1.6 * fallSway) * DEG;
  roll += (wobble(v * 0.3, 5) * 0.4 + wobble(v * 0.17, 7) * 3.0 * fallSway) * DEG;
  // the moment the pressure drops (a jolt), and the rumble of the ground going
  const segA = s.seg.vm;
  const jolt = s.place >= 1 && s.place <= 4 ? Math.exp(-Math.pow((v - segA - 0.06) / 0.14, 2)) : 0;   // each replay of the moment: everything jumps
  const rumble = smooth(0.2, 2.0, t) * (sh.attached ? 1 : 0.35) * (1 - s.flash);
  pitch += (jolt * 2.5 * Math.sin((v - segA) * 40) + wobble(v * 23, 1) * 0.25 * rumble) * DEG;
  roll += jolt * 1.5 * Math.sin((v - segA) * 31) * DEG;
  yaw += wobble(v * 19, 2) * 0.25 * rumble * DEG;
  camera.position.copy(v3);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = sh.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the world ----------
  TU.uTime.value = v; TU.uT.value = t; TU.uSink.value = s.sink; TU.uFall.value = fallOf(t);
  TU.uDust.value = smooth(0.1, 3.5, t) * 0.7; TU.uErupt.value = smooth(0, 0.07, t); TU.uFire.value = s.ignite;
  SU.uFall.value = fallOf(t); SU.uDust.value = smooth(0.3, 1.5, t); SU.uTime.value = t; SU.uSkin.value = smooth(0, 0.008, t);
  statue.mesh.position.y = STATUE.base - s.sink;
  summit.frame(v, s, camera);
  beach.frame(v, s);
  fx.frame(v, s, SUN);

  // ---------- light, air, sky ----------
  // the shadows cover wherever the camera is looking (the statue, the beach, the street)
  {
    const fx_ = Math.sin(camera.rotation.y) * -1, fz_ = -Math.cos(camera.rotation.y);
    const cx = camera.position.x + fx_ * 35, cz = camera.position.z + fz_ * 35, cy = sh.attached || Math.abs(camera.position.y - STATUE.base) < 60 ? STATUE.base - s.sink : Math.max(camera.position.y - 20, 0);
    sun.position.set(cx + SUN.x * 200, cy + SUN.y * 200, cz + SUN.z * 200);
    sun.target.position.set(cx, cy, cz);
  }
  sun.intensity = 3.0 * (1 - 0.35 * smooth(1, 4.5, t));
  hemi.intensity = 1.15 * (1 - 0.2 * smooth(1, 4.5, t));
  sky.mesh.position.copy(camera.position);
  sky.uniforms.uDim.value = smooth(0, 0.004, t);
  sky.uniforms.uDust.value = smooth(0.5, 4.0, t) * 0.45;
  sky.uniforms.uFire.value = s.ignite;
  sky.uniforms.uTime.value = v;
  const dustK = smooth(0.4, 4.5, t);
  scene.fog.color.copy(HAZE).lerp(DUSTC, dustK).lerp(FIRE, s.ignite);
  scene.fog.density = 0.000045 + 0.00003 * dustK;

  // ---------- post ----------
  renderer.toneMappingExposure = 1.0 + 0.15 * s.ignite;
  bloom.strength = 0.3 + 0.25 * s.ignite;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uShake.value = jolt * 3 + rumble * 0.3;
  finish.uniforms.uPop.value = s.pop;
  finish.uniforms.uFire.value = s.ignite;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  overlay(v, s, v);
  return s;
}

let comp = null;
// the last LOOP seconds replay the moment before the first frame (oxygen still there) while the white clears
function renderFrame(tt) {
  const tail = tt - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(tt - VIDEO_DURATION, 1 - smooth(0, LOOP * 0.92, tail));
  else update(tt);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const tt of [58, 45, 30, 15, 5, 0]) renderFrame(tt);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer };
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
