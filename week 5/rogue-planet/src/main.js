import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU } from './city.js';
import { makeWater } from './water.js';
import { makePeople } from './people.js';
import { makeTraffic } from './traffic.js';
import { makeDebris } from './debris.js';
import { makeSpace } from './space.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { POOLS, CAM0, BAY_Z } from './layout.js';
import {
  state, VIDEO_DURATION, LOOP, popupAt, POP, RJ, RE, RMOON, T_MOON_HIT, V_MOON_HIT, V_FLOOD, V_WIND, V_FISSURE, V_LIFT,
  V_SPLIT, CUT, T_SWITCH, moonAt, Tleft,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, rng } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer: the street scene runs from 0.3 m to the far plumes; the planet and Moon are in the sky shader
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, W / H, 0.3, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
const ground = makeGround(scene);
const city = makeCity(scene, ctx);
const water = makeWater(scene, sky.uniforms);
const people = makePeople(scene);
const traffic = makeTraffic(scene, ctx);
const debris = makeDebris(scene, ctx);
const glows = makeGlows(scene, 9000);
const smoke = makeSmoke(scene, 1400);
const space = makeSpace(sky.uniforms);

// light: the night (a dim blue sky, the city's glow from below), the planet's light (it grows from nothing to
// daylight), the Moon's hit flashing, the glow of the fissure
const hemi = new THREE.HemisphereLight(0x2a3560, 0x4a3026, 0.7);
scene.add(hemi);
const pLight = new THREE.DirectionalLight(0xffd8a8, 0);
pLight.castShadow = true;
pLight.shadow.mapSize.set(2048, 2048);
pLight.shadow.camera.left = -70; pLight.shadow.camera.right = 70; pLight.shadow.camera.top = 70; pLight.shadow.camera.bottom = -70;
pLight.shadow.camera.near = 10; pLight.shadow.camera.far = 600;
pLight.shadow.bias = -0.0006; pLight.shadow.normalBias = 0.05;
scene.add(pLight, pLight.target);
const lava = new THREE.PointLight(0xff6a1a, 0, 220, 1.5);
scene.add(lava);
const lava2 = new THREE.PointLight(0xff6a1a, 0, 60, 1.6);
scene.add(lava2);
const fill = new THREE.PointLight(0xffb08a, 0, 0, 2);
scene.add(fill);
// the big screens light the crowd (their colour follows the picture: red once the alert is up)
const SCREEN_L = POOLS.filter((p) => p.screen).slice(0, 4).map((p) => {
  const l = new THREE.PointLight(0xffffff, 0, 110, 1.4);
  l.position.set(p.screen.x + Math.sin(p.screen.yaw) * 4, p.screen.y - 4, p.screen.z + Math.cos(p.screen.yaw) * 4);
  scene.add(l);
  return { l, i: POOLS.indexOf(p) };
});

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.45, 0.4, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.35 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 0.97, 0.92) }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uFlash; uniform vec3 uFlashC; uniform float uBlur; uniform vec2 uCenter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - uCenter;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = uCenter + d * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      col += uFlashC * uFlash;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.36) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.32 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the sky's fixed parts ----------
const P0 = new THREE.Vector3().fromArray(state(0).pdir);
const RIGHT0 = new THREE.Vector3().crossVectors(P0, new THREE.Vector3(0, 1, 0)).normalize();
const UP0 = new THREE.Vector3().crossVectors(RIGHT0, P0).normalize();
// the planet's spin axis: across the line of sight, tipped 22° (the bands slant a little)
const AXIS = UP0.clone().multiplyScalar(Math.cos(22 * DEG)).addScaledVector(RIGHT0, Math.sin(22 * DEG)).addScaledVector(P0, -0.25).normalize();
const AXX = new THREE.Vector3().crossVectors(AXIS, P0).normalize();
sky.uniforms.uAxis.value.copy(AXIS);
sky.uniforms.uAxX.value.copy(AXX);
// the great storm turns to face you in the last half minute (it sits south of the middle: the lower half you see)
{
  const s32 = state(32);
  const N = new THREE.Vector3().fromArray(s32.pdir).negate();
  const axY = new THREE.Vector3().crossVectors(AXIS, AXX);
  const rot = (32400 - s32.T) / 36000 * Math.PI * 2, lat = -0.36;
  const jet = Math.sin(lat * 11) * 0.16 + Math.sin(lat * 23 + 1.3) * 0.05;
  sky.uniforms.uStorm.value = Math.atan2(N.dot(axY), N.dot(AXX)) + rot * (1 + jet) + 0.2;
}
// the Moon sits to the right of the planet and a little below it (as seen from the crossing)
const MOON_PA = -22 * DEG;
const pv = new THREE.Vector3(), mv = new THREE.Vector3(), rv = new THREE.Vector3(), uv3 = new THREE.Vector3();
function moonDir(s, out) {
  if (!s.moon) return null;
  pv.fromArray(s.pdir);
  rv.crossVectors(pv, new THREE.Vector3(0, 1, 0)).normalize();
  uv3.crossVectors(rv, pv).normalize();
  const t = rv.multiplyScalar(Math.cos(MOON_PA)).addScaledVector(uv3, Math.sin(MOON_PA)).normalize();
  return out.copy(pv).multiplyScalar(Math.cos(s.moon.sep)).addScaledVector(t, Math.sin(s.moon.sep)).normalize();
}
const HIT = moonDir({ pdir: state(V_MOON_HIT - 0.02).pdir, moon: moonAt(T_MOON_HIT + 1) }, new THREE.Vector3());
const starM4 = new THREE.Matrix4();
const POLE = new THREE.Vector3(0, Math.sin(40 * DEG), -Math.cos(40 * DEG));

// ---------- steam over the fissure ----------
const STEAM = (() => { const R = rng(31); return Array.from({ length: 70 }, (_, i) => ({ z: -12 - Math.pow(R(), 1.6) * 260, ph: R() * 10, r: 0.6 + R() * 1.6 })); })();
const fisX = (z) => 2.0 + 2.6 * Math.sin(z * 0.013 + 0.6) + 0.9 * Math.sin(z * 0.051);

// ---------- the camera ----------
function camAt(v, s) {
  const pdir = pv.fromArray(s.pdir);
  const alt = Math.asin(pdir.y) / DEG;
  const az = Math.atan2(pdir.x, -pdir.z) / DEG;
  // aim: the planet in the upper third, a little left of centre while the Moon is up (it's to the right)
  const moonK = 1 - smooth(V_MOON_HIT, V_MOON_HIT + 2.5, v);
  const yawDeg = az + 5.0 * moonK;
  // the street stays in view: the camera tips up only a little as it grows, and more once things lift off
  let pitch = (alt - 18.5 + 3.5 * smooth(18, 36, v) + 9 * smooth(V_LIFT + 0.8, V_LIFT + 4.5, v)) * DEG;
  // when the sea comes, you look down at it rushing in round everyone's legs, then back up
  pitch -= 12 * DEG * (smooth(V_FLOOD + 0.9, V_FLOOD + 1.7, v) - smooth(V_FLOOD + 4.2, V_FLOOD + 5.1, v));
  let yaw = -yawDeg * DEG;
  let fov = lerp(64, 68, smooth(16, 40, v));
  let roll = wobble(v * 0.3, 7) * 0.5 * DEG;
  const pos = new THREE.Vector3(CAM0.x, 1.75, CAM0.z);
  // creeping forward a little into the crowd, swaying like a handheld phone
  const fwd = new THREE.Vector3(Math.sin(-yaw) * 1, 0, -Math.cos(yaw));
  pos.addScaledVector(fwd, 0.8 * smooth(0, 14, v));
  pos.x += wobble(v * 0.5, 2) * 0.03; pos.y += wobble(v * 0.7, 5) * 0.02;
  yaw += wobble(v * 0.45, 4) * 0.4 * DEG; pitch += wobble(v * 0.55, 3) * 0.35 * DEG;
  // at the end you lift off too, then the ground splits open under you: you look down into it
  const up = smooth(V_LIFT + 3.5, V_SPLIT, v);
  pos.y += 1.4 * up * up;
  const sp = smooth(V_SPLIT, V_SPLIT + 1.2, v);
  pitch = lerp(pitch, -38 * DEG, sp);
  roll += 14 * DEG * sp;
  pos.y += 1.2 * sp;
  return { pos, yaw, pitch, roll, fov };
}

const tmpC = new THREE.Color();
function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  CU.uTime.value = v; GU.uTime.value = v;
  sky.uniforms.uTime.value = v;
  water.U.uTime.value = v;

  // ---------- the camera, jolted on every jump ----------
  const cam = camAt(v, s);
  const sh = (s.kick * 0.9 + 0.06 + s.quake * 0.9 + (v > V_SPLIT ? 2.5 * smooth(V_SPLIT, V_SPLIT + 0.6, v) : 0)) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.9 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.035 * s.kick);
  camera.near = 0.3; camera.far = 30000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(8000);
  u.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / H;
  u.uPDir.value.fromArray(s.pdir);
  u.uPD.value = (s.d - RE) / RJ;
  u.uSun.value.fromArray(s.sdir);
  u.uRot.value = (32400 - s.T) / 36000 * Math.PI * 2;
  u.uDet.value = smooth(0.05, 0.6, s.ang);
  // the light it throws: its share of the sky (sin^2 of its angular radius) times the part of it lit
  const lit = (1 + -(s.sdir[0] * s.pdir[0] + s.sdir[1] * s.pdir[1] + s.sdir[2] * s.pdir[2])) / 2;
  const Ip = Math.pow(Math.sin(s.ang), 2) * (0.35 + 0.65 * lit);
  u.uSkyLit.value = 0.9 * Ip;
  u.uCity.value = 1 - 0.6 * smooth(V_FISSURE, V_LIFT + 3, v);
  u.uVolc.value = s.volcano;
  u.uDawn.value = smooth(30, 46, v) * 0.6;
  // the stars turn round the pole (40° up in the north) as Earth spins
  u.uStar.value.setFromMatrix4(starM4.makeRotationAxis(POLE, (32400 - s.T) / 86164 * Math.PI * 2));
  // the Moon
  const md = moonDir(s, mv);
  u.uMoonOn.value = md ? 1 : 0;
  if (md) {
    u.uMoonDir.value.copy(md);
    u.uMoonAng.value = RMOON / s.moon.dist;
    u.uMoonTo.value.fromArray(s.pdir);
    u.uMoonStr.value = smooth(260e6, 135e6, s.moon.toP);
    u.uMoonBrk.value = smooth(130e6, 85e6, s.moon.toP);
  }
  u.uHitDir.value.copy(HIT);
  u.uHitAge.value = v >= V_MOON_HIT ? v - V_MOON_HIT : -1;
  // eyes adjusting as it gets brighter (the planet itself keeps its look)
  const expo = 1.1 / Math.pow(1 + 1.9 * Ip, 0.5);
  renderer.toneMappingExposure = expo;
  u.uPlanetK.value = 1;

  // ---------- lights ----------
  hemi.intensity = 0.6 + 1.5 * Ip;
  hemi.color.setRGB(0.18 + 0.3 * Ip, 0.23 + 0.4 * Ip, 0.42 + 0.6 * Ip);
  pLight.intensity = 6.5 * Ip;
  pLight.position.set(CAM0.x + s.pdir[0] * 300, s.pdir[1] * 300, CAM0.z - 30 + s.pdir[2] * 300);
  pLight.target.position.set(CAM0.x, 0, CAM0.z - 30);
  pLight.target.updateMatrixWorld();
  // the Moon's hit lights everything for a moment
  if (v >= V_MOON_HIT && v < V_MOON_HIT + 3) { const f = Math.exp(-(v - V_MOON_HIT) / 0.5); pLight.intensity += 6 * f; hemi.intensity += 2.5 * f; }
  lava.position.set(fisX(-30), 2, -30);
  lava.intensity = 3000 * s.fissure * (0.85 + 0.15 * Math.sin(v * 7));
  lava2.position.set(CAM0.x + 1, 0.5, CAM0.z - 4);
  lava2.intensity = 600 * smooth(V_SPLIT + 0.2, V_SPLIT + 1.0, v);
  // the shops behind you light the backs of the people in front
  fill.position.set(CAM0.x + 1.5, 3.2, CAM0.z + 5);
  fill.intensity = 60 * CU.uPower.value;

  // the screens: ads, then the emergency alert (their light on the street turns red)
  city.SU.uAlert.value = smooth(3.6, 8.0, v) * 1.0;
  CU.uPower.value = 1 - smooth(V_FISSURE + 1.5, V_LIFT + 4, v) * 0.95;
  CU.uQuake.value = s.quake;
  GU.uCracks.value = s.cracks;
  GU.uFissure.value = s.fissure;
  GU.uSplit.value = s.split;
  GU.uLava.value = smooth(V_FISSURE, V_FISSURE + 3, v);
  GU.uPoolK.value = CU.uPower.value;
  POOLS.forEach((p, i) => {
    if (!p.screen) return;
    const al = city.SU.uAlert.value > p.screen.seed * 0.12 + 0.02;
    if (al) { const f = Math.sin(v * 1.6 * Math.PI * 2 + p.screen.seed) > 0 ? 1 : 0.55; GU.uPoolC.value[i].set(0.85 * f, 0.08 * f, 0.05 * f); }
    else { tmpC.setHSL((v * 0.05 + p.screen.seed * 0.17) % 1, 0.7, 0.55); GU.uPoolC.value[i].set(tmpC.r * 1.2, tmpC.g * 1.2, tmpC.b * 1.2); }
  });
  for (const { l, i } of SCREEN_L) { const c = GU.uPoolC.value[i]; l.color.setRGB(c.x, c.y, c.z); l.intensity = 200 * CU.uPower.value; }

  // ---------- the water ----------
  water.U.uLevel.value = s.water;
  // the front runs down the avenue at ~20 m/s (a time-lapse) and reaches you at ~18.9 s
  const front = clamp(-45 + 20 * (v - (V_FLOOD + 0.9)), -45, 45);
  water.U.uFront.value = front;
  water.mesh.visible = s.water > 0;
  water.bore.visible = v > V_FLOOD + 0.7 && front < 44;
  water.bore.position.set(CAM0.x, Math.max(s.water, 0) - 0.05, front + 1.0);
  water.bore.material.uniforms.uH.value = 1.6 * (1 - smooth(20, 44, front));
  water.U.uLight.value.setRGB(Ip, Ip * 0.9, Ip * 0.8);

  // ---------- things ----------
  glows.begin(camera);
  people.frame(v, s, glows);
  traffic.frame(v, s, glows);
  debris.frame(v, s);
  city.glows(glows, v, s);
  // lava fountains along the fissure
  if (s.fissure > 0) {
    const zEnd = lerp(BAY_Z, -11, s.fissure);
    for (const st of STEAM) {
      if (st.z < zEnd) continue;
      const x0 = fisX(st.z);
      glows.add(x0, 0.6, st.z, 2.2 + st.r, 3.2 * s.fissure, 0.9 * s.fissure, 0.18 * s.fissure);
      for (let k = 0; k < 5; k++) {
        const t = (v * 0.7 + st.ph + k / 5) % 1;
        const hgt = (6 + 10 * st.r) * 4 * t * (1 - t) * s.fissure;
        glows.add(x0 + Math.sin(st.ph * 3 + k) * 1.6 * t, 0.5 + hgt, st.z + Math.cos(st.ph + k * 2) * 1.2 * t, 0.45, 4.0 * (1 - 0.5 * t), 1.3 * (1 - 0.6 * t), 0.25 * (1 - t));
      }
    }
  }
  glows.end();
  smoke.begin();
  if (s.fissure > 0) {
    for (const st of STEAM) {
      const zEnd = lerp(BAY_Z, -11, s.fissure);
      if (st.z < zEnd) continue;
      for (let k = 0; k < 3; k++) {
        const t = ((v * 0.35 + st.ph + k / 3) % 1);
        smoke.puff(fisX(st.z) + Math.sin(st.ph + k) * 0.6, 0.5 + t * 9, st.z, st.r * (1 + t * 2.5), 0.13 * (1 - t) * s.fissure, 0.95, 0.9 * (1 - t), st.ph + k);
      }
    }
  }
  smoke.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(0.25 + 1.2 * Ip, 0.25 + 1.1 * Ip, 0.3 + 1.0 * Ip);
  smoke.mat.uniforms.uSun.value.fromArray(s.pdir);

  // ---------- post ----------
  bloom.strength = 0.5 + 0.35 * s.kick + 0.25 * smooth(V_SPLIT, V_SPLIT + 1, v);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.8 + s.quake * 0.25;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.03;
  // (the zoom blur of each jump comes out of the planet)
  pv.fromArray(s.pdir).add(camera.position);
  const pc = pv.project(camera);
  finish.uniforms.uCenter.value.set(clamp(pc.x * 0.5 + 0.5, 0.05, 0.95), clamp(pc.y * 0.5 + 0.5, 0.05, 0.95));
  finish.uniforms.uFlash.value = 0;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;

  // ---------- the cutaway ----------
  if (s.cut) {
    const k = (v - CUT[0]) / (CUT[1] - CUT[0]);
    space.frame(v, k);
    renderPass.scene = space.scene; renderPass.camera = space.camera;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.autoUpdate = false;
    bloom.strength = 0.3;
  } else {
    renderPass.scene = scene; renderPass.camera = camera;
    renderer.shadowMap.autoUpdate = true;
  }

  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.flash) : 0;
    stampEl.style.opacity = a.toFixed(3);
    stampW.style.opacity = '0';
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(64, Math.min(118, 1700 / p.say.length));
      stampEl.style.fontSize = `${fit.toFixed(1)}px`;
      stampEl.style.transform = `translateY(${(22 * (1 - smooth(0, 0.18, p.dt))).toFixed(1)}px)`;
    }
  }
  return s;
}

let comp = null;
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
  await space.ready;
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state };
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
