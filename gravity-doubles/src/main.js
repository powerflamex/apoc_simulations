import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeRain } from './rain.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, V_FALL, V_ATOMS, V_BH, V_HEART, V_BREATH, V_WHEEL, V_CLOUDS, vAtG } from './timeline.js';
import { CAM } from './layout.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { G, heave } from './bend.js';
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

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0xc89a8a);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.00018);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 40000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const rain = makeRain(scene);
sky.uniforms.uSunDir.value.copy(world.sunDir);
const overlay = makeOverlay();

// post: MSAA scene target -> bloom -> tone map -> the body's view (grey-out, black-out, tunnel), heat shimmer,
// vignette, bands behind the title and counter
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uGrey: { value: 0 }, uBlack: { value: 0 }, uTunnel: { value: 0 }, uHeat: { value: 0 }, uCover: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uGrey; uniform float uBlack; uniform float uTunnel; uniform float uHeat; uniform float uCover;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main() {
      vec2 uv = vUv;
      // heat shimmer over the glowing ground
      if (uHeat > 0.0) {
        float sh = (vn(vec2(uv.x * 40.0, uv.y * 25.0 - uTime * 3.0)) - 0.5) * 0.004 * uHeat * smoothstep(0.75, 0.2, uv.y);
        uv += vec2(sh, sh * 0.5);
      }
      vec3 col = texture2D(tDiffuse, uv).rgb;
      vec2 c = vUv - 0.5;
      vec2 ca = c * vec2(1.0, 1920.0 / 1080.0);
      float r = length(ca);
      // grey-out: the colour drains first, then the edges close in
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum) * vec3(0.95, 0.97, 1.0), uGrey * 0.9);
      float tun = clamp(uTunnel, 0.0, 1.0);
      float edge = smoothstep(0.95 - tun * 0.85, 1.25 - tun * 0.75, r + 0.04 * vn(vec2(atan(ca.y, ca.x) * 4.0, uTime)));
      col *= 1.0 - edge * tun;
      col *= 1.0 - uBlack;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.535) / 0.06, 2.0)) * smoothstep(0.75, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

const fogC = new THREE.Color();
const tmp = new THREE.Color();
const ORANGE = new THREE.Color(0.42, 0.12, 0.04), CLOUD = new THREE.Color(0.55, 0.47, 0.5), HAZE = new THREE.Color(0.72, 0.55, 0.5);

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);   // loop tail: the white clears into the first frame
  const g = s.g;

  // ---------- the camera: standing, straining, the fall, lying on the paving; at the end it lifts away ----------
  const strain = smooth(1.2, 4.0, g);
  const fall = s.fall;
  const standH = CAM.y - 0.2 * strain;
  const lieX = CAM.x + 0.15, lieZ = CAM.z - 0.95, lieH = 0.3;
  const breathing = (1 - fall) * 0.012 * strain + fall * 0.02 * s.breath;
  const breathe = Math.sin(v * (1.6 + 1.4 * strain) * Math.PI) * breathing;
  const heart = s.heart * fall * 0.004 * Math.pow(Math.max(0, Math.sin(v * 2.6 * Math.PI)), 12);
  let x = lerp(CAM.x, lieX, fall), z = lerp(CAM.z, lieZ, fall);
  let y = lerp(standH, lieH, fall * fall) + breathe + heart;
  // the fall: knees go, you pitch forward and hit the ground (a jolt), head turned a little on the paving
  const fk = smooth(V_FALL, V_FALL + 0.55, v);
  const dip = Math.sin(Math.PI * clamp((v - V_FALL) / 0.6)) * 22 * DEG;
  const jolt = Math.exp(-Math.pow((v - V_FALL - 0.52) / 0.06, 2)) * 0.05;
  y -= jolt * 0.4;
  const tremor = (0.002 + 0.006 * strain) * (1 - fall);
  // where you look: the skyline and the wheel while standing; from the ground, up a little at the towers,
  // the clouds coming down; level across the crushed plain at the end
  let yaw = (CAM.yaw + keys([[-3, 0], [3, 1.5], [6, 3], [8, 4], [9.2, 6], [11.8, 6], [13, 1], [14.3, -6], [16.6, -6], [18, 0], [22, 1], [26, -1], [33, 0], [50, 1], [58, 0]], v)) * DEG;
  let pitch = lerp(keys([[-3, 3.5], [3, 5], [6.5, 7]], v), keys([[V_FALL, 9], [11, 9], [14, 10], [22, 9], [V_CLOUDS, 11], [30, 15], [34, 10], [40, 7], [50, 6], [58, 5]], v), fk) * DEG - dip;
  let roll = lerp(0, -4 * DEG, fk) + wobble(v * 0.3, 7) * 0.3 * DEG;
  yaw += wobble(v * 0.5, 4) * 0.25 * DEG * (1 - fall) + wobble(v * 17, 5) * tremor;
  pitch += wobble(v * 0.4, 2) * 0.2 * DEG + wobble(v * 23, 3) * tremor + jolt * Math.sin(v * 80);
  x += wobble(v * 0.6, 1) * 0.02 * (1 - fall);
  // after you die the view slowly rises over the plaza: the whole city being pressed flat
  if (s.crane > 0) {
    const ce = s.crane * s.crane * (3 - 2 * s.crane);
    y = lerp(y, 26, ce); z += 14 * ce;
    pitch = lerp(pitch, -7 * DEG, ce);
    roll = lerp(roll, 0, ce);
  }
  // the ground heaves under you once rock flows
  y += s.flow * heave(x, z, v) * (1 - smooth(0, 0.3, s.crane));
  // the end: lift away to see the planet cave in
  const pull = s.pull;
  if (pull > 0) {
    const pe = pull * pull * (3 - 2 * pull);
    y = Math.exp(lerp(Math.log(Math.max(y, 0.3)), Math.log(380), pe));
    z += 40 * pe;
    pitch = lerp(pitch, -72 * DEG, smooth(0.1, 0.9, pull));
    roll = lerp(roll, 0, pull);
    yaw = lerp(yaw, -20 * DEG, pull);
  }
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the world's bend: rock cap, swells, curvature ----------
  G.uCap.value = Math.min(s.cap, 1e6);
  G.uCapR.value = Math.min(s.capRock, 1e6);
  G.uFlow.value = s.flow;
  const R = Math.max(s.radius, 30);
  G.uR.value = R < 6.0e6 ? R : 6.371e6;
  G.uCam.value.set(x, z);
  G.uHeat.value = s.heat;
  G.uGrid.value = s.grid;
  world.terrain.uCracks.value = s.cracks;
  world.terrain.uWhiteHot.value = s.whiteHot;

  // ---------- sky, air, light ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uTime.value = v;
  u.uCloudH.value = Math.exp(lerp(Math.log(2200), Math.log(25), s.clouds));
  u.uCloudCov.value = smooth(0.0, 0.5, s.clouds);
  u.uGone.value = s.cloudsGone;
  u.uShift.value.set(0.4 + v * 0.004, 0.2);
  u.uAir.value = s.air;
  u.uHeat.value = s.heat;
  u.uDark.value = s.dark;
  u.uCamY.value = Math.min(y, 2000);
  const hAbove = Math.max(y, 0.1);
  u.uDip.value = R < 6.0e6 ? Math.sqrt(Math.max(0, 1 - Math.pow(R / (R + hAbove), 2))) : 0;
  // haze: sunset air, then the fallen clouds as fog, then the thick crushed air, then the glow
  fogC.copy(FOG0);
  let fogD = 0.00018;
  const cf = smooth(0.6, 1.0, s.clouds) * (1 - s.cloudsGone);
  fogC.lerp(CLOUD, cf); fogD = lerp(fogD, 0.0007, cf);
  fogD += 0.0008 * s.rain;
  fogC.lerp(HAZE, s.air * 0.6); fogD = lerp(fogD, 0.0005, s.air * (1 - s.rain));
  fogC.lerp(ORANGE, s.heat); fogD = lerp(fogD, 0.0007, s.heat);
  fogD *= 1 - smooth(0, 0.4, s.pull);
  scene.fog.color.copy(fogC); scene.fog.density = fogD;
  world.glows.mat.uniforms.uFogD.value = fogD;
  const wu = world.terrain.waterU;
  wu.uSunDir.value.copy(world.sunDir); wu.uFogC.value.copy(fogC); wu.uFogD.value = fogD;
  wu.uWave.value = 1 / Math.sqrt(g); wu.uSpeed.value = Math.sqrt(g) * 0.5; wu.uLights.value = s.grid; wu.uDark.value = s.dark; wu.uAir.value = s.air;
  world.smoke.mat.uniforms.uTime.value = v;
  world.smoke.mat.uniforms.uSun.value.copy(world.sunDir);
  world.smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.82, 0.7).lerp(ORANGE, s.heat);
  const sunK = (1 - 0.8 * smooth(0.3, 0.9, s.clouds) * (1 - s.cloudsGone)) * (1 - 0.5 * s.air) * (1 - 0.7 * s.heat);
  world.sun.intensity = 2.8 * sunK;
  world.hemi.color.setRGB(0.55, 0.62, 0.82).lerp(tmp.setRGB(0.45, 0.4, 0.46), s.clouds * (1 - s.cloudsGone)).lerp(tmp.setRGB(0.25, 0.12, 0.1), s.heat);
  world.hemi.groundColor.setRGB(0.42, 0.31, 0.24).lerp(tmp.setRGB(1.0, 0.35, 0.1), s.heat);
  world.hemi.intensity = 1.0 + 0.3 * s.heat;
  world.plaza.jetU.uLight.value.setRGB(1.0, 0.86, 0.72).multiplyScalar(0.9 + 0.3 * sunK);

  world.frame(v, s, camera);

  renderer.toneMappingExposure = 1.0 + 0.3 * smooth(0.5, 1, s.clouds) * (1 - s.cloudsGone) + 0.15 * s.air - 0.1 * s.heat;
  bloom.strength = 0.35 + 0.15 * s.heat;
  rain.u.uTime.value = v; rain.u.uOn.value = s.rain; rain.u.uSpeed.value = 9 * Math.sqrt(g); rain.u.uCam.value.set(x, y, z);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uGrey.value = s.grey;
  finish.uniforms.uBlack.value = s.black * 0.92;
  finish.uniforms.uTunnel.value = Math.max(s.grey * 0.9, s.black, s.dying * 0.3);
  finish.uniforms.uHeat.value = s.heat * (1 - s.pull);
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

// ---------- boot ----------
async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [62, 45, 20, 10, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { G, scene, camera, renderer, composer, world };
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
