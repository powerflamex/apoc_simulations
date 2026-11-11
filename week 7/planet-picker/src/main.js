import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, LAND, T_WALL, T_HIT } from './timeline.js';
import { lookAt, LOOKS } from './looks.js';
import { CAM_FWD } from './people.js';
import { CAM0, PLANET_POS, landY, camFront } from './layout.js';
import { DEG, lerp, smooth, wobble, keys } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H_ = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H_ * RES);

const stage = document.getElementById('stage');
// plain depth buffer (street scale near, the mountains far off; the sea handles its own shoreline)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.05, 0.08, 0.16), 0.00006);
const FOV = 60;
const camera = new THREE.PerspectiveCamera(FOV, W / H_, 0.4, 120000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const overlay = makeOverlay();

// post: MSAA -> bloom -> tone map -> grade, vignette, bands behind the title and the picker
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.3, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.28 }, uTitle: { value: 0 }, uPick: { value: 0 }, uAb: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uPick; uniform float uAb;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.2);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.85) / 0.075, 2.0));
      col *= 1.0 - uPick * 0.36 * exp(-pow((vUv.y - 0.69) / 0.105, 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// Catmull-Rom through [time, value] keys
function spline(list, t) {
  if (t <= list[0][0]) return list[0][1];
  const n = list.length;
  if (t >= list[n - 1][0]) return list[n - 1][1];
  let i = 0;
  while (t > list[i + 1][0]) i++;
  const [t0, p0] = list[i], [t1, p1] = list[i + 1];
  const tm = i > 0 ? list[i - 1] : [t0 - (t1 - t0), p0 - (p1 - p0)];
  const tp = i + 2 < n ? list[i + 2] : [t1 + (t1 - t0), p1 + (p1 - p0)];
  const m0 = (p1 - tm[1]) / (t1 - tm[0]) * (t1 - t0), m1 = (tp[1] - p0) / (tp[0] - t0) * (t1 - t0);
  const u = (t - t0) / (t1 - t0), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
// The camera (video time). You stand on the sand in the crowd, a phone at chest height, looking out to sea at Jupiter
// over the people's heads. Moon: the same view, gone quiet. Mars: you lift the phone over the heads and swing right,
// along the red beach to the lit pier and its wheel, Mars at the left. Venus: back to it, lower, between the people. Neptune: you walk down through the
// crowd toward the water. Saturn: you look up, wider, to take in the rings; then you turn right round to the faces
// behind you, lit gold, and back. Jupiter: the sea heaps up under it and climbs the sand; you back up the beach while
// everyone runs past you; the wall comes in and you tilt up as it towers over you.
const L = LAND, J = LAND.jupiter;
const FW = [[-4, 0], [L.neptune + 0.4, 0.35], [L.neptune + 5.2, 7.6], [L.saturn + 1.6, CAM_FWD], [64, CAM_FWD]];     // metres walked toward the water
const BK = [[-4, 0], [J + 2.2, 0], [J + 3.6, 2.2], [J + 9.9, 31], [64, 31]];                                         // metres backed up the beach
const HH = [[-4, CAM0.eye], [L.mars + 0.15, CAM0.eye], [L.mars + 1.5, 2.2], [L.mars + 4.3, 2.2], [L.venus + 0.5, CAM0.eye], [L.venus + 1.8, 1.34], [L.neptune, 1.4], [L.saturn, 1.5], [J + 9.9, 1.62], [64, 1.62]];
const BB = [[-4, 9.5], [L.mars + 0.15, 9.8], [L.mars + 1.5, 20.5], [L.mars + 4.3, 22], [L.venus + 0.5, 10.5], [L.neptune, 9.5], [L.saturn + 4.5, 9.5], [L.saturn + 5.9, 166],
  [L.saturn + 8.1, 172], [L.saturn + 9.4, 9.5], [64, 9.5]];
const PP = [[-4, 17], [L.moon, 17], [L.moon + 0.6, 15.5], [L.mars + 0.2, 15], [L.mars + 1.6, 9.5], [L.mars + 4.3, 9], [L.venus + 0.5, 14], [L.neptune, 14.5], [L.neptune + 3, 15.5],
  [L.saturn, 16], [L.saturn + 0.6, 17.5], [L.saturn + 4.5, 17.5], [L.saturn + 5.9, 4], [L.saturn + 8.1, 5.5], [L.saturn + 9.4, 16.8], [J, 16.8], [J + 3.4, 16.8], [J + 9.9, 16.8],
  [T_WALL + 2.4, 16.8], [T_HIT, 27], [64, 27]];
const FF = [[-4, 60], [L.saturn - 0.1, 60], [L.saturn + 0.45, 63], [L.saturn + 4.5, 63], [L.saturn + 5.9, 56], [L.saturn + 8.1, 56], [L.saturn + 9.4, 60], [64, 60]];
const dirOf = (b, el) => new THREE.Vector3(-Math.cos(b * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.sin(b * DEG) * Math.cos(el * DEG));
// the planet sits where the Moon was. It is lit by the Sun, which is below the horizon behind you and to one side
// (a nearly full planet, 28 deg from full: the limb away from the Sun darkens, so it reads as a ball)
const P_DIR = dirOf(PLANET_POS.b, PLANET_POS.el);
const P_RIGHT = new THREE.Vector3().crossVectors(P_DIR, new THREE.Vector3(0, 1, 0)).normalize();
const P_UP = new THREE.Vector3().crossVectors(P_RIGHT, P_DIR).normalize();
const P_BACK = P_DIR.clone().negate();
const SUN_DIR = P_BACK.clone().multiplyScalar(Math.cos(28 * DEG)).addScaledVector(P_RIGHT, 0.6 * Math.sin(28 * DEG)).addScaledVector(P_UP, -0.8 * Math.sin(28 * DEG)).normalize();
// a planet's north pole: leaning right by tilt, tipped toward you by open (degrees)
const axisOf = (tilt, open, out) => out.copy(P_UP).multiplyScalar(Math.cos(tilt * DEG)).addScaledVector(P_RIGHT, Math.sin(tilt * DEG)).multiplyScalar(Math.cos(open * DEG)).addScaledVector(P_BACK, Math.sin(open * DEG)).normalize();
const tmpC = new THREE.Color();
axisOf(LOOKS.saturn.tilt, LOOKS.saturn.open, sky.uniforms.uAxisR.value);     // the rings' own axis

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const lk = lookAt(s.prev.key, s.planet.key, s.sw);

  // ---------- camera ----------
  const fw = keys(FW, v), bk = spline(BK, v);
  const c0 = camFront(fw, 0);
  let x = c0.x + bk, z = c0.z;
  let y = landY(Math.max(x, 1), z) + keys(HH, v);
  const B = keys(BB, v);
  s.camB = B * DEG;
  let yaw = (90 - B) * DEG, pitch = spline(PP, v) * DEG, roll = 0;
  // hand-held: a slow sway; walking (Neptune) and running backwards (the ending) bob it
  const walk = smooth(L.neptune + 0.5, L.neptune + 1.2, v) * (1 - smooth(L.saturn + 0.6, L.saturn + 1.6, v));
  const run = smooth(J + 2.4, J + 3.4, v) * (1 - smooth(J + 9.2, J + 10.2, v));
  x += wobble(v * 0.5, 2) * 0.04; y += wobble(v * 0.4, 3) * 0.03 + Math.abs(Math.sin(v * 5.6)) * 0.035 * walk + Math.abs(Math.sin(v * 8.5)) * 0.06 * run;
  yaw += (wobble(v * 0.35, 5) * 0.25 + wobble(v * 3.1, 1) * 0.5 * run) * DEG; pitch += (wobble(v * 0.3, 7) * 0.2 + wobble(v * 3.7, 4) * 0.6 * run) * DEG;
  roll += (wobble(v * 0.27, 9) * 0.3 + Math.sin(v * 5.6) * 0.5 * walk + Math.sin(v * 8.5) * 0.9 * run) * DEG;
  // each landing: a jolt (harder for the bigger planets); the wall coming: the ground shakes
  const big = [0, 1.6, 0.4, 0.7, 0.9, 1.3, 1.9, 2.2][s.i] || 0;
  const punch = window.__cover ? 0 : s.snap * big;
  pitch -= punch * 0.7 * DEG; roll += punch * 0.5 * DEG * Math.sin(v * 31);
  const sh = window.__cover ? 0 : 0.15 * s.pull * (1 - s.roar) + s.roar * s.roar * 1.1;
  x += wobble(v * 13, 1) * 0.08 * sh; y += wobble(v * 11, 4) * 0.08 * sh;
  pitch += wobble(v * 17, 6) * 0.5 * DEG * sh; roll += wobble(v * 9, 8) * 0.8 * DEG * sh;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = keys(FF, v) * (1 - 0.03 * punch);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the planet, the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uP.value.copy(P_DIR);
  u.uSunD.value.copy(SUN_DIR);
  axisOf(lk.tiltA, lk.openA, u.uAxisA.value); axisOf(lk.tiltB, lk.openB, u.uAxisB.value);
  const sinR = Math.exp(lerp(Math.log(s.prev.sin), Math.log(s.planet.sin), s.sw));
  u.uR.value = sinR;
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
  u.uT.value = v;
  u.uKa.value = lk.ka; u.uKb.value = lk.kb; u.uMix.value = s.sw;
  u.uRing.value = lk.ring; u.uPI.value = lk.pi * (1 + 0.5 * s.snap);
  u.uGlare.value = lk.glare * (1 + 0.6 * s.snap); u.uGlareCol.value.setRGB(...lk.glareCol);
  u.uTop.value.setRGB(...lk.top); u.uLow.value.setRGB(...lk.low); u.uNear.value.setRGB(...lk.near);
  u.uNight.value = lk.night; u.uCloud.value = lk.cloud; u.uDrift.value = v * 4;
  // ---------- the light ----------
  const sun = world.sun;
  sun.color.setRGB(...lk.light);
  sun.intensity = lk.li * (1 + 0.8 * s.snap);
  const sp = camera.position;
  sun.position.set(sp.x + P_DIR.x * 1500, P_DIR.y * 1500 + 2, sp.z + P_DIR.z * 1500);
  sun.target.position.set(sp.x - 30 * Math.sin(yaw), 0, sp.z - 30 * Math.cos(yaw));
  sun.shadow.camera.updateProjectionMatrix();
  world.hemi.color.setRGB(...lk.hemiSky);
  world.hemi.groundColor.setRGB(...lk.hemiGnd);
  world.hemi.intensity = lk.hi;
  scene.fog.color.setRGB(...lk.fog);
  scene.fog.density = lk.fogD;
  // the sea's mirror
  const su = world.sea.u;
  su.uTime.value = v;
  su.uWaveT.value = v;
  su.uSun.value.copy(P_DIR);
  su.uSunR.value = Math.asin(sinR);
  su.uSunI.value = lk.glint;
  su.uSunCol.value.setRGB(...lk.light);
  su.uSkyHi.value.setRGB(...lk.seaHi);
  su.uSkyLo.value.setRGB(...lk.seaLo);
  su.uDirC.value.setRGB(...lk.light).multiplyScalar(lk.li);
  su.uAmbC.value.setRGB(...lk.hemiSky).multiplyScalar(lk.hi);
  su.uBright.value = lk.bright;
  su.uPx.value = u.uPx.value;

  // spray lit by the planet and the sky
  const sl = world.smoke.mat.uniforms.uLight.value.setRGB(...lk.light).multiplyScalar(lk.li * 0.3).add(tmpC.setRGB(...lk.hemiSky).multiplyScalar(lk.hi * 0.6));
  const lum = 0.3 * sl.r + 0.5 * sl.g + 0.2 * sl.b;
  sl.lerp(tmpC.setRGB(lum, lum, lum * 1.03), 0.7).multiplyScalar(1.25);          // (white water, not dust)
  world.smoke.mat.uniforms.uSun.value.copy(P_DIR);
  world.frame(v, s, camera);

  renderer.toneMappingExposure = lk.exp * (1 + 0.25 * s.snap);
  bloom.strength = 0.22 + 0.12 * lk.glare;
  bloom.threshold = 2.2;
  finish.uniforms.uAb.value = punch * 0.8 + sh * 0.3;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uPick.value = window.__cover ? 0 : (1 - s.flash);

  overlay(v, s);
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the cover clears,
// so the video loops seamlessly.
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
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [46, 44, 33, 27, 22, 16, 11, 6, 3.5, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world, sky, state, comp: () => comp };
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
