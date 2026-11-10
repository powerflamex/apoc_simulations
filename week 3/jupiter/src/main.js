import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeSuit, S } from './suit.js';
import { makeProbe } from './probe.js';
import { makeStreaks } from './streaks.js';
import { makeDiamonds } from './diamonds.js';
import { makeOverlay } from './overlay.js';
import { state, boltsAt, VIDEO_DURATION, LOOP, V_WIND, V_PROBE, V_CRACK, V_GLOW, V_DIAMOND, V_OCEAN, V_STORM, V_BASE3, V_LAMP } from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 80;
const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 6000);
scene.add(camera);
const sky = makeSky();
sky.mesh.layers.enable(1);
scene.add(sky.mesh);
const suit = makeSuit();
scene.add(suit.root);
const probe = makeProbe();
scene.add(probe.group);
const streaks = makeStreaks(3200, 26);
scene.add(streaks.mesh);
const diamonds = makeDiamonds(1600, 14);
scene.add(diamonds.mesh);
const overlay = makeOverlay();

// lights: the Sun, the sky/cloud bounce, lightning flashes, the glow from below
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.1, far: 12 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x6f8fd0, 0xd8a070, 1.0);
scene.add(hemi);
const flash = new THREE.DirectionalLight(0xc8d6ff, 0);
scene.add(flash, flash.target);
// reflections (the gold visor, the probe's foil): the sky alone, rendered around your helmet every frame
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.1, 6000, cubeRT);
cubeCam.children.forEach((c) => c.layers.set(1));
scene.add(cubeCam);
scene.environment = cubeRT.texture;
scene.environmentIntensity = 0.45;

// post: MSAA scene target -> bloom -> tone map -> heat shimmer, vignette, bands behind the title and counter
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.45, 2.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uHeat: { value: 0 }, uShake: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uHeat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main() {
      vec2 uv = vUv;
      // heat shimmer in the glowing deep
      if (uHeat > 0.0) {
        float sh = (vn(vec2(uv.x * 30.0, uv.y * 18.0 + uTime * 2.5)) - 0.5) * 0.006 * uHeat;
        uv += vec2(sh, sh * 0.6);
      }
      vec3 col = texture2D(tDiffuse, uv).rgb;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.535) / 0.06, 2.0)) * smoothstep(0.75, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);
// Only the scene needs 4 samples per pixel. When every scene render lands in renderTarget2 (checked below by walking
// the passes), renderTarget1 only ever receives full-screen passes, where all samples of a pixel are equal: a plain
// buffer gives the same image without filling and resolving a second multisampled target every frame.
{
  // the last pass draws to the screen; swapping the buffers after it only decides which one the next frame starts
  // in. Keep the number of swaps per frame even, so the scene always starts in the same (multisampled) buffer.
  if (composer.passes.filter((pass) => pass.needsSwap).length % 2 === 1) composer.passes[composer.passes.length - 1].needsSwap = false;
  let read = composer.renderTarget2, write = composer.renderTarget1, sceneInTwo = true;
  for (const pass of composer.passes) {
    if (pass instanceof RenderPass && read !== composer.renderTarget2) sceneInTwo = false;
    if (pass.needsSwap) [read, write] = [write, read];
  }
  if (sceneInTwo && read === composer.renderTarget2) {
    const old = composer.renderTarget1;
    composer.renderTarget1 = composer.writeBuffer = new THREE.WebGLRenderTarget(old.width, old.height, { type: old.texture.type, depthBuffer: false });
    old.dispose();
  }
}

// ---------- motion of the specks around you (m/s, relative to you; you fall, so they rise) ----------
function relVel(v, out) {
  const up = keys([[-2, 9], [3, 16], [8.8, 22], [16, 30], [20, 34], [27, 30], [33, 24], [37, 9], [44, 12], [53, 6], [59, 14], [67, 26]], v);
  const side = 34 * smooth(V_WIND - 0.1, V_WIND + 0.6, v) * (1 - smooth(12.5, 16.5, v));
  return out.set(-side, up, 0);
}
const TRAVEL = (() => {   // integrated once: where the specks have got to at each 1/240 s
  const dt = 1 / 240, t0 = -3, n = Math.ceil((VIDEO_DURATION + 4) / dt);
  const xs = new Float32Array(n + 1), ys = new Float32Array(n + 1);
  const tmpv = new THREE.Vector3();
  for (let i = 1; i <= n; i++) { relVel(t0 + (i - 0.5) * dt, tmpv); xs[i] = xs[i - 1] + tmpv.x * dt; ys[i] = ys[i - 1] + tmpv.y * dt; }
  return (v, out) => {
    const f = clamp((v - t0) / dt, 0, n - 1), i = Math.floor(f), k = f - i;
    return out.set(lerp(xs[i], xs[i + 1], k), lerp(ys[i], ys[i + 1], k), 0);
  };
})();
// the cloud tops sliding past (km): slow drift, then the jet stream carries you sideways
const camXZ = (v) => [0.02 * v + 12 * smooth(V_WIND - 0.2, 15.5, v), -0.03 * v];

const HEAT = (h) => {   // blackbody-ish colour for the glowing air (matches sky.js heatCol)
  const c = new THREE.Color(0.45, 0.03, 0.0);
  c.lerp(new THREE.Color(1.0, 0.2, 0.02), smooth(0, 0.25, h));
  c.lerp(new THREE.Color(1.0, 0.45, 0.06), smooth(0.2, 0.45, h));
  c.lerp(new THREE.Color(1.0, 0.75, 0.3), smooth(0.45, 0.75, h));
  c.lerp(new THREE.Color(1.0, 0.95, 0.85), smooth(0.75, 1.0, h));
  return c;
};

const tmp = new THREE.Color(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const qFree = new THREE.Quaternion(), qLook = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
const mLook = new THREE.Matrix4();
const helmet = new THREE.Vector3();

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);   // loop tail: the white clears into the first frame
  suit.pose(v, s);
  suit.helmetPos(helmet);

  // ---------- the camera: over your shoulder, round to your visor in the clouds, above you in the storms,
  // beside you in the dark with the probe, at your cracking visor, then above you as you sink into the glow ----------
  const az = keys([[-3, 9], [8.8, 8], [11, -6], [15.5, -14], [17.5, 95], [20.5, 165], [24, 190], [26.5, 160], [28.5, 20], [33, 40],
    [36, 30], [42, 38], [44, 90], [45.5, 165], [50, 190], [53.5, 150], [58, 110], [61, 40], [68, 20]], v) * DEG;
  const el = keys([[-3, 46], [8.8, 44], [12, 30], [16, 22], [18, 12], [24, 8], [26.5, 30], [28.5, 62], [32, 55], [35, 25],
    [36, 16], [42, 20], [45.5, 6], [50, 4], [53.5, 30], [58, 42], [61, 66], [68, 74]], v) * DEG;
  const dist = keys([[-3, 2.8], [8.8, 2.8], [12, 2.9], [16, 3.0], [18, 1.9], [21, 1.35], [24, 1.5], [26.5, 2.6], [28.5, 3.4], [33, 3.6],
    [36, 2.3], [42, 2.6], [45.5, 1.6], [48.8, 1.05], [51, 1.15], [53.5, 3.2], [58, 4.6], [61, 4.4], [68, 3.0]], v);
  const look = keys([[-3, 0], [16.6, 0], [18, 1], [26.5, 1], [28.5, 0.35], [31, 0.35], [32.5, 1], [68, 1]], v);   // 0: free look, 1: look at you
  const fYaw = keys([[-3, 0], [8.8, -1], [11, -12], [15.5, -24], [17.5, -30], [26.5, -30], [28.5, -8], [35, -30]], v) * DEG;
  const fPitch = keys([[-3, -14], [8.8, -14], [12, -10], [15.5, -6], [17.5, -8], [26.5, -40], [28.5, -64], [31, -42], [34, -30], [35, -20]], v) * DEG;
  const shake = smooth(V_WIND - 0.1, V_WIND + 0.2, v) * (1 - smooth(10.5, 13.5, v)) * 1.0 + s.in1 * 0.15 + s.in2 * 0.1;
  const tgt = tmpV.set(0, 0.45, 0);
  const cx = tgt.x + Math.sin(az) * Math.cos(el) * dist;
  const cy = tgt.y + Math.sin(el) * dist;
  const cz = tgt.z + Math.cos(az) * Math.cos(el) * dist;
  camera.position.set(cx + wobble(v * 9, 3) * 0.03 * shake, cy + wobble(v * 11, 5) * 0.03 * shake, cz);
  eul.set(fPitch + wobble(v * 0.4, 2) * 0.012 + wobble(v * 13, 6) * 0.02 * shake, fYaw + wobble(v * 0.3, 8) * 0.015 + wobble(v * 15, 9) * 0.02 * shake,
    wobble(v * 0.25, 4) * 0.02 + Math.sin(v * 2.2) * 0.06 * shake * shake);
  qFree.setFromEuler(eul);
  // look at you (the helmet, or between you and the probe)
  const lookAt = tmpV2.copy(helmet).multiplyScalar(0.8).add(tgt.clone().multiplyScalar(0.2));
  if (s.probe > 0) lookAt.lerp(probe.group.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.8 * s.probe);
  mLook.lookAt(camera.position, lookAt, new THREE.Vector3(0, 1, 0));
  qLook.setFromRotationMatrix(mLook);
  camera.quaternion.copy(qFree).slerp(qLook, look);
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the Sun and the light that reaches you ----------
  const sunDir = tmpV.set(Math.sin(s.sunAz * DEG) * Math.cos(s.sunEl * DEG), Math.sin(s.sunEl * DEG), -Math.cos(s.sunAz * DEG) * Math.cos(s.sunEl * DEG));
  const sunUp = smooth(-2.5, 3, s.sunEl);
  const sunCol = new THREE.Color(1.0, 0.96, 0.9).lerp(tmp.setRGB(1.0, 0.55, 0.25), s.sunset);
  const sunI = 3.2 * sunUp * (1 - 0.35 * s.sunset);
  const u = sky.uniforms;
  u.uSunDir.value.copy(sunDir);
  u.uSunCol.value.copy(sunCol);
  u.uSunI.value = sunI;
  u.uSunset.value = s.sunset;
  const [kx, kz] = camXZ(v);
  u.uCam.value.set(kx, s.alt, kz);
  u.uPx.value = (2 * Math.tan((FOV * DEG) / 2)) / RH;
  u.uTime.value = v;
  u.uMode.value = s.mode;
  // the fog inside a deck: sunset-gold in the ammonia, dim brown below, grey in the storm base
  const inCol = new THREE.Color();
  let inAmt = 0;
  if (s.in1 > 0) { inCol.setRGB(1.0, 0.86, 0.72).multiplyScalar(lerp(1.3, 0.35, smooth(10, 16.5, s.depth))); inAmt = s.in1; }
  if (s.in2 > 0) { inCol.setRGB(0.5, 0.34, 0.2).multiplyScalar(lerp(0.4, 0.06, smooth(30, 44, s.depth))); inAmt = s.in2; }
  if (s.in3 > 0) { inCol.setRGB(0.12, 0.12, 0.14); inAmt = s.in3; }
  u.uIn.value = inAmt;
  u.uInCol.value.copy(inCol);
  u.uL2.value = 0.32 * (1 - smooth(18, 27, v)) + 0.04;
  u.uL3.value = 0.16 * (1 - smooth(30, 34, v)) + 0.05;
  const bolts = boltsAt(v);
  let flashI = 0;
  for (let i = 0; i < 4; i++) {
    const b = bolts[i];
    if (b) { u.uBolt.value[i].set(b[0], b[1], b[2], b[3]); flashI += b[3] * Math.exp(-Math.abs(b[1] - s.alt) / 12) * 3.0; }
    else u.uBolt.value[i].set(0, 0, 0, 0);
  }
  if (bolts[0]) flash.position.set(bolts[0][0], Math.max(-2, (bolts[0][1] - s.alt) * 0.3), bolts[0][2]).normalize().multiplyScalar(10);
  flash.intensity = flashI * 1.5;
  u.uGlow.value = s.glow;
  u.uHeat.value = s.heat;
  u.uOcean.value = s.ocean;
  u.uMetal.value = s.metal;
  u.uFall.value = TRAVEL(v, tmpV2).y * 0.01;
  u.uDia.value = s.diamonds;
  sky.mesh.position.copy(camera.position);

  sun.position.copy(sunDir).multiplyScalar(6);
  sun.target.position.set(0, 0, 0);
  sun.color.copy(sunCol);
  sun.intensity = sunI * (1 - s.in1 * 0.85) * (1 - smooth(13, 20, s.depth));
  // sky and bounce light: blue above / orange-cream cloud tops below; the fog's own colour inside a deck; the glow from below in the deep
  const glowC = HEAT(s.heat);
  const glowI = s.glow * lerp(0.35, 1.3, s.heat * s.heat) * (1 + 0.4 * s.metal);
  hemi.color.setRGB(0.32, 0.45, 0.8).multiplyScalar(1 - 0.6 * s.sunset).lerp(inCol, inAmt);
  hemi.groundColor.setRGB(0.95, 0.66, 0.42).multiplyScalar(1 - 0.5 * s.sunset).lerp(inCol, inAmt);
  const dayK = s.mode === 0 ? 1 : s.mode === 1 ? 0.3 : 0.06;
  hemi.intensity = lerp(dayK, 1.0, inAmt) * (s.depth > 80 ? 0 : 1) * 0.9 + 0.02;
  if (s.glow > 0) {
    hemi.color.lerp(glowC.clone().multiplyScalar(0.6), 1);
    hemi.groundColor.copy(glowC);
    hemi.intensity = glowI * 1.2 + 0.01;
  }
  // the suit
  S.uFrost.value = s.frost;
  S.uWet.value = s.wet;
  S.uHot.value = s.suitHot;
  S.uHotCol.value.copy(glowC);
  S.uCrack.value = s.crack;
  S.uTime.value = v;
  probe.frame(v, s, V_PROBE);

  // ---------- the specks ----------
  const su = streaks.u;
  TRAVEL(v, su.uOffset.value);
  relVel(v, su.uVel.value);
  su.uCenter.value.copy(camera.position);
  su.uShutter.value = 1 / 60;
  su.uTime.value = v;
  su.uLampPos.value.copy(helmet);
  suit.lamp.getWorldDirection ? null : null;
  su.uLampDir.value.copy(suit.lamp.target.getWorldPosition(new THREE.Vector3())).sub(suit.lamp.getWorldPosition(new THREE.Vector3())).normalize();
  su.uLamp.value = s.lamp;
  // what the specks are, phase by phase
  let col = [0.8, 0.88, 1.0], alpha = 0.1 + 0.15 * smooth(8, 10, v), size = 0.003, cnt = 0.08 + 0.2 * smooth(8, 10, v), lit = 1, spark = 0;
  if (s.depth > 10) { col = [1.0, 0.95, 0.88]; alpha = 0.55 * Math.max(s.in1, 0.3); cnt = 0.9; size = 0.004; }
  if (s.depth > 17) { col = [0.75, 0.55, 0.38]; alpha = 0.35; cnt = 0.7; }
  if (s.depth > 44) { col = [0.7, 0.75, 0.85]; alpha = 0.4; cnt = 0.8; size = 0.005; lit = 0.2 + flashI * 0.6; }   // rain, seen by lightning
  if (s.depth > 90) { col = [0.8, 0.75, 0.7]; alpha = 0.25; cnt = 0.6; size = 0.003; lit = 0.0; }                    // dust: only in your lamp
  if (v > V_GLOW - 1) { col = glowC.toArray(); alpha = 0.3 + 0.3 * s.glow; cnt = 0.7; size = 0.004; lit = s.glow * 2.0; }   // embers
  if (s.diamonds > 0) { alpha *= 1 - 0.6 * s.diamonds; }
  if (s.ocean > 0.5) { col = glowC.toArray(); alpha = 0.5; cnt = 0.9; size = 0.012; lit = 1.0; spark = 0; }
  su.uColor.value.setRGB(...col);
  su.uAlpha.value = alpha * (1 - s.flash);
  su.uSize.value = size;
  su.uCount.value = cnt;
  su.uLit.value = lit;
  su.uSparkle.value = spark;

  {   // diamonds drift up past you (you sink faster than they do)
    const du = diamonds.u;
    du.uOffset.value.set(0, (v - V_DIAMOND) * 1.6, 0);
    du.uCenter.value.copy(camera.position);
    du.uTime.value = v;
    du.uOn.value = s.diamonds * (1 - s.flash);
    du.uPx.value = RH / (2 * Math.tan((FOV * DEG) / 2));
    diamonds.mesh.visible = s.diamonds > 0.001;
  }
  // reflections
  cubeCam.position.copy(helmet);
  renderer.toneMappingExposure = (1.0 + 0.6 * smooth(30, 40, v) * (1 - s.glow * 0.5)) * (1 - 0.25 * smooth(58, 64, v));
  bloom.strength = 0.35 + 0.25 * s.glow + 0.2 * smooth(V_STORM, V_STORM + 1, v) * (1 - smooth(V_BASE3 + 2, V_BASE3 + 4, v));
  finish.uniforms.uTime.value = v;
  finish.uniforms.uHeat.value = s.heat * s.glow;
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
  cubeCam.update(renderer, scene);
  composer.render();
  if (comp) comp.paint();
}

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [62, 50, 40, 30, 20, 10, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, suit, sky };
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
