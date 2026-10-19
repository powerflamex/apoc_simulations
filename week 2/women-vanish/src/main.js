import { WIDE, wideBand } from './wide.js';   // first: it changes how the scene camera frames 16:9
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeShibuya } from './shibuya.js';
import { makeInteriors } from './interiors.js';
import { makeOverlay } from './overlay.js';
import { state, VIDEO_DURATION, LOOP, V_EVENT, V_RISE, V_SUNUP, T_SWITCH, V_WARD, V_CLASS, V_BACK, V_LAST0, V_DEATH, V_LAST1, LAST_BENCH } from './timeline.js';
import { CAM0 } from './people.js';
import { DEG, lerp, smooth, wobble, keys, clamp } from './util.js';
import { G } from './bend.js';
import { makeCompositor } from './compose.js';

const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
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
scene.fog = new THREE.FogExp2(0xb8c6d6, 0.0012);
const cam = new THREE.PerspectiveCamera(58, W / H, 0.05, 20000);
cam.rotation.order = 'YXZ';
const sky = makeSky();
scene.add(sky.mesh);
const city = makeShibuya(scene);
const inside = makeInteriors();
const overlay = makeOverlay();

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, cam);
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
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - ${WIDE ? '0.665' : '0.69'}) / ${WIDE ? '0.17' : '0.1'}, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - ${WIDE ? '0.35' : '0.535'}) / ${WIDE ? '0.11' : '0.06'}, 2.0)) * smoothstep(${WIDE ? '0.42' : '0.75'}, ${WIDE ? '0.08' : '0.2'}, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// camera: standing on the north-east corner looking across the scramble to Q-Front; after it happens a look round;
// then up above the crossing (a slow circle through the decades), and at the end a turn up into the Sun
const TARGET = new THREE.Vector3(-4, 0, -4);
const ORBIT = { dist: 128, el: 40 * DEG };
const drone = (v) => {
  const A = keys([[V_RISE, 47], [16, 50], [V_SUNUP, 82], [80, 90]], v) * DEG;
  return { pos: new THREE.Vector3(TARGET.x + Math.sin(A) * Math.cos(ORBIT.el) * ORBIT.dist, Math.sin(ORBIT.el) * ORBIT.dist, TARGET.z + Math.cos(A) * Math.cos(ORBIT.el) * ORBIT.dist), yaw: A / DEG };
};
const STREET = new THREE.Vector3(CAM0.x, 1.75, CAM0.z);
const SUN_YAW = 128, SUN_PITCH = 22;
function placeCamera(v) {
  const k = smooth(V_RISE, 16.5, v), ke = smooth(0, 1, (v - V_RISE) / 6.5);
  const d = drone(v);
  // rise: up and back, easing in and out (the height leads, so we clear the crowd first)
  const ky = smooth(V_RISE, 15.5, v), kxz = smooth(V_RISE + 0.6, 16.5, v);
  cam.position.set(lerp(STREET.x, d.pos.x, kxz), lerp(STREET.y, d.pos.y, ky * ky * (3 - 2 * ky)), lerp(STREET.z, d.pos.z, kxz));
  // (a look round after they vanish; at the crash behind the queue on the right, a whip round to it)
  const streetYaw = keys([[-1, 47], [V_EVENT, 47], [3.6, 50], [5.2, 46], [5.45, 46], [6.05, 139.5], [8.0, 138], [V_RISE, 134]], v);
  const streetPitch = keys([[-1, 4], [V_EVENT, 4], [4.0, 2], [5.45, 2], [6.05, 0], [V_RISE, 1]], v);
  let yaw = lerp(streetYaw, d.yaw, k), pitch = lerp(streetPitch, -30, k);
  const ku = smooth(V_SUNUP, V_SUNUP + 5.5, v);   // the turn up into the Sun
  yaw = lerp(yaw, SUN_YAW, ku); pitch = lerp(pitch, SUN_PITCH, ku);
  cam.rotation.set(pitch * DEG + wobble(v * 0.6, 3) * 0.25 * DEG * (1 - k * 0.6), yaw * DEG + wobble(v * 0.5, 4) * 0.3 * DEG * (1 - k * 0.6), wobble(v * 0.4, 5) * 0.2 * DEG);
  cam.fov = keys([[-1, 58], [5.7, 58], [6.6, 30], [V_RISE - 0.4, 33], [V_RISE + 1.6, 58]], v);   // (zooming in on the crash, like a phone)
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

// the last man: from behind his right shoulder, the overgrown crossing in front of him, pushing in slowly
function lastCamera(v) {
  const k = smooth(V_LAST0, V_LAST1, v), fx = Math.sin(LAST_BENCH.yaw), fz = Math.cos(LAST_BENCH.yaw), rx = -fz, rz = fx;
  const back = lerp(4.6, 2.0, k), side = lerp(1.9, 1.1, k);
  cam.position.set(LAST_BENCH.x - fx * back + rx * side, lerp(2.15, 1.75, k), LAST_BENCH.z - fz * back + rz * side);
  const lead = lerp(1.4, 0.5, k);   // (aimed a little past him: you see what he's looking at)
  const tgt = new THREE.Vector3(LAST_BENCH.x + fx * lead, lerp(1.05, 0.95, k), LAST_BENCH.z + fz * lead);
  const d = tgt.sub(cam.position);
  cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)) + wobble(v * 0.4, 7) * 0.15 * DEG, Math.atan2(-d.x, -d.z) + wobble(v * 0.35, 8) * 0.2 * DEG, 0);
  cam.fov = 50;
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
}

// the cutaways inside: a slow push down the ward; a slow push from the back of the classroom
function insideCamera(v, s) {
  if (s.inside === 'ward') {
    const k = (v - V_WARD) / (V_CLASS - V_WARD), c = inside.ward.cam;
    c.position.set(-1.3, 1.65, 0.0 - 2.2 * k); c.rotation.set(-7 * DEG + wobble(v * 0.5, 3) * 0.2 * DEG, (-24 + 6 * k) * DEG + wobble(v * 0.4, 4) * 0.3 * DEG, 0);
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    inside.ward.frame(v);
    return inside.ward;
  }
  const k = (v - V_CLASS) / (V_BACK - V_CLASS), c = inside.classroom.cam;
  // from the front corner: the half-written board and the chalk on the floor, then round to the class
  const pan = smooth(0.15, 0.75, k);
  c.position.set(4.0, 1.75, -8.0 + 0.5 * k); c.rotation.set((-10 - 6 * pan) * DEG + wobble(v * 0.5, 5) * 0.2 * DEG, (69 + 80 * pan) * DEG + wobble(v * 0.4, 6) * 0.3 * DEG, 0);
  c.updateProjectionMatrix(); c.updateMatrixWorld();
  inside.classroom.frame(v);
  return inside.classroom;
}

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  if (s.inside) {
    const room = insideCamera(v, s);
    renderPass.scene = room.scene; renderPass.camera = room.cam;
    renderer.toneMappingExposure = 1.0;
    bloom.strength = 0.3; bloom.threshold = 1.0; bloom.radius = 0.4;
    finish.uniforms.uTitle.value = 0;
    finish.uniforms.uCounter.value = (1 - s.flash) * 0.9;
    overlay(v, s, v);
    return s;
  }
  renderPass.scene = scene; renderPass.camera = cam;
  if (s.last) lastCamera(v); else placeCamera(v);
  sky.mesh.position.copy(cam.position);
  sky.uniforms.uPx.value = (2 * Math.tan((cam.fov * DEG) / 2)) / (WIDE ? RH * 16 / 9 : RH);
  sky.uniforms.uSunDir.value.fromArray(s.sun);
  sky.uniforms.uBlack.value = s.night;
  sky.uniforms.uGlow.value = s.night * s.power;
  sky.uniforms.uShift.value.set(v * 0.004 + Math.max(0, v - V_RISE) * 0.35, v * 0.002 + Math.max(0, v - V_RISE) * 0.12);
  sky.uniforms.uWhite.value = smooth(T_SWITCH - 2.5, T_SWITCH, v) + (cover >= 0 ? cover : 0);
  const up = cam.position.y > 20;
  scene.fog.density = lerp(0.0012, 0.0007, smooth(V_RISE, 16, v));
  scene.fog.color.setRGB(lerp(0.72, 0.1, s.night), lerp(0.78, 0.1, s.night), lerp(0.84, 0.16, s.night));
  city.frame(v, s, cam);
  renderer.toneMappingExposure = lerp(1.0, 2.2, s.night) * (1 + 0.6 * smooth(V_SUNUP + 2, T_SWITCH, v));
  bloom.strength = lerp(0.25, 0.5, s.night) + 0.4 * smooth(V_SUNUP, T_SWITCH, v);
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
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [50, 20, 16, 13, 5, 1, 0]) renderFrame(t);   // compile every material once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { G, scene, cam, renderer, composer, city };
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
