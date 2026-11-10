import { WIDE } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeWorld } from './world.js';
import { makeOverlay } from './overlay.js';
import { state, beatAt, ride, slabD, hill, surfaceY, Z_EDGE, VIDEO_DURATION, LOOP, V_CRACK, V_SLIDE, V_PLUNGE, UNDER_COLOR, WATER_Y } from './timeline.js';
import { CAM, CABLE, cableAt } from './layout.js';
const cab = {};
import { youHead } from './people.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer (street scale: near 0.5 m keeps the precision; the far bay and hills are only a few km off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG0 = new THREE.Color(0.8, 0.7, 0.66), DUSTC = new THREE.Color(0.6, 0.5, 0.4);
scene.fog = new THREE.FogExp2(FOG0.clone(), 0.0002);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.5, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
sky.uniforms.uSunDir.value.copy(world.sunDir);
const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');
const youEl = document.getElementById('you');

// post: MSAA scene target -> bloom -> tone map -> grade (dust), shake blur, the muddy water, vignette, text bands
const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.45, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uUnder: { value: 0 }, uAb: { value: 0 }, uDust: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uUnder; uniform float uAb; uniform float uDust;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 wob = vec2(sin(vUv.y * 40.0 + uTime * 6.0), cos(vUv.x * 30.0 + uTime * 5.0)) * 0.006 * uUnder;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + wob + off).r, texture2D(tDiffuse, vUv + wob).g, texture2D(tDiffuse, vUv + wob - off).b);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col, 0.8) * vec3(1.05, 0.96, 0.84), uDust * 0.25);
      if (uUnder > 0.0) {
        // churning muddy water, silt drifting; nothing of the scene shows through
        float churn = fbm(vUv * vec2(3.0, 5.0) + wob * 20.0 + vec2(uTime * 0.4, uTime * 1.1));
        vec3 murk = vec3(0.05, 0.12, 0.1) * (1.15 - vUv.y * 0.7) + vec3(0.07, 0.07, 0.04) * churn;
        vec2 bp = vUv * vec2(18.0, 32.0) + vec2(0.0, -uTime * 2.4);
        vec2 bi = floor(bp), bf = fract(bp) - 0.5;
        float bub = step(0.84, h(bi)) * smoothstep(0.18, 0.1, length(bf + (vec2(h(bi + 3.1), h(bi + 7.7)) - 0.5) * 0.4));
        murk += vec3(0.4, 0.5, 0.45) * bub * 0.4;
        col = mix(col, murk, uUnder);
      }
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.28);
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.69'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.53'}) / ${WIDE ? '0.11' : '0.065'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.8'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
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
// The camera hovers over you at the top of the street looking down the hill to the bay. It rises like a drone
// (from up there the street spreads down the frame and you can watch it all slide away), takes a long lens to the
// waterfront to watch everything go off the seawall (14-26 s), comes back down beside the houses as they fold toward
// you, and drops at the crack. When the hillside goes it first holds still (the ground, you on it, slides away from
// under it), then chases you down the hill (F: how much of the slide it keeps up with), catches up by the bay, and
// follows you over the seawall into the water.
const DZ = [[-3, 0], [3, 0.5], [8, 6], [14, 14], [21, 14], [26, 8], [31, 1], [33, -1], [40, 0], [50, 4], [56, 7], [59, 8]];   // along the street
const DX = [[-3, 0], [6, 0.3], [14, -0.5], [21, 0], [26, 3], [30, 3.5], [33, 1.5], [42, 0.5], [52, -0.5], [59, 0.5]];
const HY = [[-3, CAM.h], [2, 7.4], [7, 20], [12, 31], [20, 33], [25, 22], [29.5, 10], [33, 7], [37, 10], [42, 22], [48, 25], [53, 14], [56.5, 7], [59, 4.5]];
const YAW = [[-3, 0], [8, 0.5], [15, -1], [21, 1], [26, 9], [30, 7], [34, 0], [42, -2], [46, 6], [50, 14], [53, 6], [56, 0], [59, 0]];
const PITCH = [[-3, CAM.pitch], [2, -14], [7, -24], [12, -28], [18, -25], [22, -20], [26, -16], [30, -15], [33.2, -22], [36, -19], [42, -26], [48, -22], [53, -16], [57, -12], [59, -16]];
const FOLLOW = [[-3, 0], [38.5, 0], [44, 0.3], [50, 0.7], [55, 0.95], [57.5, 1], [60, 1]];

const AIM = { x: 2, y: 0, z: -75 };   // where the long lens looks: the waterfront, the seawall
const fogC = new THREE.Color();
const tmp = new THREE.Color();
const v3 = new THREE.Vector3();
const rd = {};

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.flash = cover; s.flashColor = UNDER_COLOR; s.under = cover; }

  // ---------- camera ----------
  const z0 = CAM.z + spline(DZ, v);
  const fol = clamp(spline(FOLLOW, v));
  let x = CAM.x + spline(DX, v), z, y;
  if (fol > 0.999) {
    ride(z0, v, rd);
    z = rd.z; y = rd.y + spline(HY, v) * (rd.phase >= 2 ? Math.max(0, 1 - rd.dt * 2) : 1);
  } else {
    const D = slabD(v);
    z = z0 + D * fol;
    y = (z < Z_EDGE ? surfaceY(z, D) : WATER_Y) + spline(HY, v);
  }
  let yaw = (180 + spline(YAW, v)) * DEG, pitch = spline(PITCH, v) * DEG, roll = 0;
  // 14-26 s: a long lens on the waterfront, to watch everything go off the seawall into the bay
  // (before that, 5.5-12.5 s, a closer lens follows the cable car as it stops and slides back)
  let fov = 60;
  const aimAt = (tx, ty, tz, k, f) => {
    if (k <= 0) return;
    const dx = tx - x, dy = ty - y, dz = tz - z;
    let yawA = Math.atan2(-dx, -dz);
    yawA += 2 * Math.PI * Math.round((yaw - yawA) / (2 * Math.PI));
    const pitchA = Math.atan2(dy, Math.hypot(dx, dz));
    yaw = lerp(yaw, yawA, k); pitch = lerp(pitch, pitchA, k);
    fov = Math.exp(lerp(Math.log(fov), Math.log(f), k));
  };
  cableAt(v, cab);
  aimAt(CABLE.x, cab.y + 1.5, cab.z + 6, smooth(5.2, 6.8, v) * (1 - smooth(12.2, 13.6, v)), 30);
  aimAt(AIM.x, AIM.y, AIM.z, smooth(13.4, 15.4, v) * (1 - smooth(24.9, 26.6, v)), 15.5);
  // the dive: over the seawall after you, down into the water
  const dive = smooth(V_PLUNGE - 0.15, V_PLUNGE + 0.5, v);
  if (dive > 0) { y = lerp(y, WATER_Y - 3, dive); pitch = lerp(pitch, -55 * DEG, dive); }
  // under the churned surface (it heaves up to ~2 m with the mud): deep, muddy water
  if (cover < 0 && z > Z_EDGE && y < WATER_Y + 2.2) { s.under = 1; s.flash = Math.max(s.flash, clamp((WATER_Y + 2.2 - y) / 1.2)); }
  // hand-held drift, then the shudder of the ground moving
  const sh = s.shake;
  x += wobble(v * 0.5, 2) * 0.06 + wobble(v * 13, 1) * 0.05 * sh;
  y += wobble(v * 0.4, 3) * 0.05 + wobble(v * 11, 3) * 0.06 * sh;
  yaw += (wobble(v * 0.4, 5) * 0.35 + wobble(v * 13, 4) * 0.3 * sh) * DEG;
  pitch += (wobble(v * 0.35, 7) * 0.3 + wobble(v * 15, 6) * 0.3 * sh) * DEG;
  roll += (wobble(v * 0.3, 9) * 0.5 + wobble(v * 7, 8) * 0.5 * sh) * DEG;
  // the crack: a jolt as the ground gives under the camera
  const jolt = Math.exp(-Math.pow((v - V_CRACK - 0.08) / 0.12, 2)) + 0.7 * Math.exp(-Math.pow((v - V_SLIDE - 0.1) / 0.15, 2));
  pitch -= jolt * 2.2 * DEG; roll += jolt * 1.6 * DEG * Math.sin(v * 40);
  // each beat lands with a small punch-in
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover) {
    punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 5);
    pitch -= punch * 0.7 * DEG;
  }
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = fov * (1 - 0.04 * punch);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- sky, air, light ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / (WIDE ? RH * 16 / 9 : RH);
  u.uTime.value = v;
  u.uShift.value = v * 4;
  u.uDust.value = s.dust * 0.6;
  u.uCamY.value = y;
  fogC.copy(FOG0).lerp(DUSTC, clamp(s.dust * 1.8));
  const fogD = 0.0001 + 0.0006 * s.dust;
  scene.fog.color.copy(fogC); scene.fog.density = fogD;
  world.glows.mat.uniforms.uFogD.value = fogD;
  world.water.u.uFogC.value.copy(fogC); world.water.u.uFogD.value = fogD * 0.8;
  const sunK = 1 - 0.45 * clamp(s.dust * 1.6);
  world.sun.intensity = 3.3 * sunK;
  world.sun.color.setRGB(1.0, 0.72, 0.47).lerp(tmp.setRGB(1.0, 0.56, 0.32), s.dust);
  world.hemi.intensity = 1.5;
  world.water.u.uLight.value = 0.85 + 0.2 * sunK;
  world.smoke.mat.uniforms.uTime.value = v;
  world.smoke.mat.uniforms.uSun.value.copy(world.sunDir);
  world.smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.84, 0.7).multiplyScalar(0.8 + 0.3 * sunK);

  world.frame(v, s, camera);

  renderer.toneMappingExposure = 1.3;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uUnder.value = s.under;
  finish.uniforms.uAb.value = 0.25 * s.shake + punch * 1.2 + jolt * 1.5;
  finish.uniforms.uDust.value = s.dust;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  overlay(v, s, v);
  // "YOU": a label over you, lying in the crosswalk, for the first seconds
  {
    const hd = youHead(v);
    v3.set(hd.x, hd.y, hd.z).project(camera);
    const a = window.__cover || !hd.visible || v3.z > 1 ? 0 : s.you * (1 - s.flash);
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
      youEl.style.left = `${(sx - 120).toFixed(1)}px`;
      youEl.style.top = `${(sy - 112).toFixed(1)}px`;
    }
  }
  // the big text at each beat: pops in, holds, fades
  {
    const a = b && !window.__cover ? smooth(0, 0.06, b.dt) * (1 - smooth(1.3, 1.8, b.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== b.text) stampEl.textContent = b.text;
      if (stampW.textContent !== b.label) stampW.textContent = b.label;
      stampEl.style.fontSize = `${((b.small ? 110 : 138) * (1 + 0.3 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the
// muddy water clears, so the video loops seamlessly.
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
  for (const t of [59.5, 50, 35, 25, 10, 0]) renderFrame(t);   // compile everything once
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
