import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, blackbody } from './sky.js';
import { makeWorld } from './world.js';
import { makeSpace } from './space.js';
import { makeOverlay } from './overlay.js';
import { state, beatAt, VIDEO_DURATION, LOOP, V_ENGULF, V_NOVA, V_IMPACT, oldV } from './timeline.js';
import { CAM } from './layout.js';
import { DEG, lerp, smooth, wobble, clamp } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');
const RES = Math.min(1, Math.max(0.25, Number(params.get('res') || 1)));
const RW = Math.round(W * RES), RH = Math.round(H * RES);

const stage = document.getElementById('stage');
// Plain depth buffer (not logarithmic: that one makes the GPU shade hidden surfaces, ~1.6x slower). Near 0.5 m keeps
// the precision where it matters; far away only the sea, the sea floor and the hills meet, tens of metres apart.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd09060, 0.00005);
const camera = new THREE.PerspectiveCamera(CAM.fov, W / H, 0.5, 400000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const world = makeWorld(scene);
const space = makeSpace();
const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');
const youEl = document.getElementById('you');

const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(RW, RH);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.35, 0.45, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uAb: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uAb;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * uAb * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.25);   // a gentle S-curve
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, 1.15), 0.0);                              // a little more colour
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.45 * exp(-pow((vUv.y - 0.69) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.53) / 0.065, 2.0)) * smoothstep(0.8, 0.2, vUv.x);
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
// behind you at the railing; over the centuries the view slowly rises and pulls back to take in the bay and the
// city, lifts higher while the sea drains away, then comes back down behind you to face the giant Sun
const PX = [[-3, CAM.x], [12, CAM.x], [30, -1.6], [44, -2.6], [50, -2.4], [54, -1.6], [56.5, 0.3], [58, 0.6]];
const PY = [[-3, CAM.y], [11, CAM.y], [22, 3.2], [32, 5.0], [42, 8.0], [48, 10.5], [51, 11.5], [54, 6.0], [56.5, 2.8], [58, 2.4]];
const PZ = [[-3, CAM.z], [11, CAM.z], [22, 8.0], [32, 10.5], [42, 14.0], [48, 17.0], [51, 18.0], [54, 12.0], [56.5, 6.6], [58, 6.0]];
const YAW = [[-3, CAM.yaw], [12, CAM.yaw], [22, -4.5], [34, -5.0], [40, -1.0], [46, 0.0], [50, -1.5], [54, 1.0], [56.5, 4.5], [58, 5.0]];
const PITCH = [[-3, CAM.pitch], [11, CAM.pitch], [24, -3.8], [40, -5.6], [46, -6.0], [48, -3.0], [51, -6.5], [54, -3.0], [56.5, 1.5], [58, 3.5]];

const tmp = new THREE.Color(), tmp2 = new THREE.Color();
const v3 = new THREE.Vector3();
const look = {
  sunA: new THREE.Vector3(), sunB: new THREE.Vector3(), sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), sunI: 1,
  skyHi: new THREE.Color(), skyLo: new THREE.Color(), night: 0, lights: 0, windows: 0,
};
// Betelgeuse: up and to the left (12° south of west, 22° up); the impact: over the horizon, 14° south of west
const NOVA_DIR = new THREE.Vector3(-Math.sin(12 * DEG) * Math.cos(22 * DEG), Math.sin(22 * DEG), -Math.cos(12 * DEG) * Math.cos(22 * DEG)).normalize();
const IMP_DIR = new THREE.Vector3(-Math.sin(14 * DEG), 0, -Math.cos(14 * DEG));

// the sky's colours near the horizon (lo) and above (hi) for the Sun's elevation (degrees): for the sea and glass
function skyColors(e, hi, lo) {
  const day = smooth(8, 22, e), gold = smooth(-1, 3, e), twi = smooth(-8, -1, e), dark = smooth(-14, -8, e);
  hi.setRGB(0.006, 0.01, 0.03).lerp(tmp.setRGB(0.04, 0.07, 0.2), dark).lerp(tmp.setRGB(0.05, 0.09, 0.24), twi)
    .lerp(tmp.setRGB(0.3, 0.42, 0.68), gold).lerp(tmp.setRGB(0.17, 0.34, 0.74), day);
  lo.setRGB(0.03, 0.04, 0.08).lerp(tmp.setRGB(0.25, 0.12, 0.12), dark).lerp(tmp.setRGB(0.8, 0.35, 0.18), twi)
    .lerp(tmp.setRGB(1.05, 0.6, 0.3), gold).lerp(tmp.setRGB(0.62, 0.74, 0.92), day);
}

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) { s.fadeOut = cover; s.flash = 0; }
  const b = beatAt(v);
  let punch = 0;
  if (b && !window.__cover && cover < 0) punch = smooth(0, 0.05, b.dt) * Math.exp(-Math.max(0, b.dt - 0.05) * 5);

  if (s.space) {
    // ---------- after Earth: you, adrift ----------
    renderPass.scene = space.scene;
    space.frame(v, camera, s);
    camera.rotation.x -= punch * 0.8 * DEG;
    camera.fov = 58 - 3 * punch;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.toneMappingExposure = 1.3 * (1 - 0.3 * (1 - s.squash));
    bloom.strength = 0.6 * (1 - 0.6 * (1 - s.squash));
  } else {
    renderPass.scene = scene;
    // ---------- camera ----------
    const ov = oldV(v);   // the camera moves are the trillion-years ones, keyed to the same story moments
    let x = spline(PX, ov), y = spline(PY, ov), z = spline(PZ, ov);
    let yaw = spline(YAW, ov) * DEG, pitch = spline(PITCH, ov) * DEG, roll = 0;
    x += wobble(v * 0.5, 2) * 0.03; y += wobble(v * 0.6, 3) * 0.02;
    yaw += wobble(v * 0.4, 5) * 0.25 * DEG; pitch += wobble(v * 0.35, 7) * 0.2 * DEG; roll += wobble(v * 0.3, 9) * 0.3 * DEG;
    pitch -= punch * 0.9 * DEG; roll += punch * 1.0 * DEG * (b && b.i % 2 ? 1 : -1);
    // the impact's shock: the view shakes
    const q = s.impact > 0 ? Math.exp(-s.impact * 1.8) * smooth(0.0, 0.05, s.impact) : 0;
    pitch += q * 1.4 * DEG * Math.sin(v * 60); roll += q * 1.2 * DEG * Math.sin(v * 47);
    camera.position.set(x, y, z);
    camera.rotation.set(pitch, yaw, roll);
    camera.fov = CAM.fov - 3 * punch;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // ---------- the Sun, the sky, the light ----------
    const sn = s.sun;
    look.sunA.fromArray(sn.a); look.sunB.fromArray(sn.b);
    look.sunDir.copy(look.sunA).add(look.sunB).normalize();
    const e = Math.asin(look.sunDir.y) / DEG;
    const angR = s.sunR / DEG;                                   // apparent radius, degrees
    const giant = smooth(1.5, 16, angR);
    blackbody(s.life.temp, look.sunCol);
    const low = 1 - smooth(2, 20, e);
    look.sunCol.lerp(tmp.setRGB(1.0, 0.55, 0.3), low * 0.75 * (1 - giant));
    // surface brightness goes with T^4: a red giant is far dimmer per square degree than today's Sun
    look.sunI = lerp(22 * Math.pow(s.life.lum, 0.15) * Math.pow(s.life.temp / 5772, 4), 1.9, smooth(0.6, 5, angR));
    look.night = 1 - smooth(-7, 1, e);
    look.lights = (1 - smooth(-3, 9, e)) * s.city;
    look.windows = 0.06 + 0.5 * (1 - smooth(-4, 6, e));
    skyColors(e, look.skyHi, look.skyLo);
    // haze from the boiling seas, a hotter Sun, the giant's light, the impact's glow and dust
    const haze = Math.max(s.steam * 0.9, smooth(9.2, 9.6, Math.log10(Math.max(1, s.Y))) * 0.22 * (1 - giant));
    look.skyLo.lerp(tmp.setRGB(1.0, 0.94, 0.86), haze * 0.8); look.skyHi.lerp(tmp.setRGB(0.9, 0.86, 0.8), haze * 0.6);
    look.skyLo.lerp(tmp.copy(look.sunCol).multiplyScalar(0.8), giant * 0.8); look.skyHi.lerp(tmp.copy(look.sunCol).multiplyScalar(0.35), giant * 0.7);
    const tau = s.impact;
    const red = tau > 0 ? smooth(0.35, 1.0, tau) * (1 - smooth(1.6, 2.6, tau)) : 0;
    const dust = tau > 0 ? smooth(1.4, 2.2, tau) * (1 - smooth(2.6, 3.8, tau)) : 0;
    const flashI = tau > -0.05 ? Math.exp(-Math.max(tau, 0) * 7) * smooth(-0.05, 0, tau) : 0;
    look.skyLo.lerp(tmp.setRGB(1.0, 0.36, 0.12), red * 0.75).lerp(tmp.setRGB(0.2, 0.15, 0.11), dust * 0.85);
    look.skyHi.lerp(tmp.setRGB(0.8, 0.25, 0.1), red * 0.75).lerp(tmp.setRGB(0.15, 0.11, 0.09), dust * 0.85);

    const u = sky.uniforms;
    sky.mesh.position.copy(camera.position);
    u.uSunA.value.copy(look.sunA); u.uSunB.value.copy(look.sunB);
    // a giant Sun sits on the horizon (its middle a little below it), swelling up out of the sea
    if (giant > 0) {
      const dropDir = (vv) => { vv.y = lerp(vv.y, Math.sin(-0.35 * s.sunR), giant); return vv.normalize(); };
      dropDir(u.uSunA.value); dropDir(u.uSunB.value);
    }
    u.uSunR.value = s.sunR; u.uSpread.value = s.sun.spread; u.uSunCol.value.copy(look.sunCol); u.uSunI.value = look.sunI;
    u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / RH;
    u.uCloud.value = 1 / (1 + s.E / 30);
    u.uCloudCov.value = (1 - smooth(0.0, 0.3, s.steam + giant)) * (1 - smooth(9.0, 9.4, Math.log10(Math.max(1, s.Y))) * 0.8);
    u.uCloudPhase.value.set(((s.T * 0.004) % 50) + 3, ((s.T * 0.0013) % 50) + 7);
    u.uNova.value = s.nova; u.uNovaDir.value.copy(NOVA_DIR);
    u.uImpact.value = tau; u.uImpDir.value.copy(IMP_DIR);
    u.uHaze.value = haze; u.uGiant.value = giant; u.uTime.value = v; u.uDim.value = 1;

    const L = world.sun, hemi = world.hemi;
    L.color.copy(look.sunCol);
    L.intensity = (3.0 * smooth(-1.5, 2.5, e) * Math.min(1.3, Math.pow(s.life.lum, 0.3)) * (1 - 0.7 * dust)) * (1 - 0.45 * giant) + flashI * 6;
    hemi.color.copy(look.skyHi).lerp(look.skyLo, 0.35);
    hemi.groundColor.setRGB(0.35, 0.27, 0.2).multiplyScalar(0.3 + 0.7 * (1 - look.night));
    hemi.intensity = (lerp(0.75, 0.12, look.night) + s.nova * 0.8 + red * 0.8 + flashI * 2) * (1 - 0.4 * giant);
    scene.fog.color.copy(look.skyLo).multiplyScalar(0.9);
    scene.fog.density = 0.00004 + 0.00008 * haze + 0.0001 * dust;
    world.frame(v, s, camera, look);
    renderer.toneMappingExposure = lerp(1.05, 2.0, look.night) * (1 - 0.15 * giant) * (1 - 0.3 * flashI);
    bloom.strength = 0.35 + 0.15 * giant;
  }
  finish.uniforms.uAb.value = punch * 1.5;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - Math.max(s.flash, s.fadeOut)) * 0.9;

  overlay(v, s, v);
  // "YOU": a label over your head
  {
    if (s.space) v3.copy(space.youPos).add(new THREE.Vector3(0.1, 0.9, 0)); else v3.set(0, 1.85, 0);
    v3.project(camera);
    const a = window.__cover || v3.z > 1 ? 0 : clamp(s.you) * (1 - Math.max(s.flash, s.fadeOut));
    youEl.style.opacity = a.toFixed(3);
    if (a > 0) {
      const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
      youEl.style.left = `${(sx - 120).toFixed(1)}px`;
      youEl.style.top = `${(sy - 112).toFixed(1)}px`;
    }
  }
  // the big number at each beat: pops in, holds, fades
  {
    const a = b && !window.__cover && cover < 0 ? smooth(0, 0.06, b.dt) * (1 - smooth(1.3, 1.8, b.dt)) * (1 - Math.max(s.flash, s.fadeOut)) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = a.toFixed(3);
    if (a > 0) {
      if (stampEl.textContent !== b.label) stampEl.textContent = b.label;
      const base = b.label.length > 14 ? 108 : b.label.length > 11 ? 124 : 138;
      stampEl.style.fontSize = `${(base * (1 + 0.3 * Math.exp(-b.dt * 9))).toFixed(1)}px`;
    }
  }
  return s;
}

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the dark clears,
// so the video loops seamlessly.
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
  for (const t of [62, 50, 34.5, 33.5, 28, 22, 12, 4, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, world, space };
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
