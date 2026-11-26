import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU, heightAt, SEA_Y, LAKE_Y } from './ground.js';
import { makeWater, WU } from './sea.js';
import { makeNature } from './nature.js';
import { makeStreet } from './street.js';
import { makeAnimals, FOCUS, FOCUS2, sharkAt, EYES } from './animals.js';
import { makeYou } from './you.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { CAMS } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, JUMPS, V_WHITE, stopStart, stopEnd } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xaabbcc, 0.002);
const camera = new THREE.PerspectiveCamera(54, W / H, 0.1, 6000);
scene.add(camera);

const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };

const sky = makeSky();
scene.add(sky.mesh);
const ground = makeGround(scene);
const water = makeWater(scene);
const nature = makeNature(scene);
const street = makeStreet(scene, ctx);
const animals = makeAnimals(scene, ctx);
const glows = makeGlows(scene, 3000);
const smoke = makeSmoke(scene, 1600);

// ---------- you: hoodie and jeans, facing north (-z), the device on your right wrist ----------
const you = makeYou(scene, { glow: false, hoodie: 0xe8a020, jeans: 0x2f4d7d });
you.root.rotation.y = Math.PI;
// mirrored, so the device (on the figure's right wrist) is on the side facing the camera (behind your left shoulder)
you.root.scale.x = -1;
const dev = new THREE.Group();
dev.add(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.045, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide })));
const devFaceMat = new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x40e8ff, emissiveIntensity: 2, roughness: 0.2 });
const devFace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.016), devFaceMat);
devFace.position.set(0.048, 0, 0); devFace.rotation.y = Math.PI / 2;
dev.add(devFace);
const devRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 24).rotateX(Math.PI / 2), devFaceMat);
dev.add(devRing);
dev.position.set(0, -0.2, 0);
you.arms[0].el.add(dev);
const devLight = new THREE.PointLight(0x40e8ff, 0, 6, 2);
scene.add(devLight);

// ---------- the look of each stop ----------
const C = (r, g, b) => new THREE.Color(r, g, b);
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const LOOK = [
  { top: C(0.1, 0.3, 0.78), hor: C(0.62, 0.76, 0.93), sun: dir(0.45, 0.62, 0.65), sunC: C(1, 0.95, 0.86), sunI: 3.0, hs: C(0.62, 0.75, 1.0), hg: C(0.55, 0.5, 0.45), hI: 1.1, fog: 0.0011, cloud: 0.28, exp: 1.0, wind: 0.4 },
  { top: C(0.2, 0.4, 0.72), hor: C(0.8, 0.8, 0.76), sun: dir(-0.4, 0.55, 0.73), sunC: C(1, 0.88, 0.7), sunI: 3.2, hs: C(0.6, 0.65, 0.8), hg: C(0.45, 0.38, 0.3), hI: 1.1, fog: 0.0016, cloud: 0.35, exp: 1.0, wind: 0.3, cloudLit: C(1.0, 0.95, 0.85), cloudDark: C(0.6, 0.58, 0.55) },
  { top: C(0.3, 0.52, 0.75), hor: C(0.78, 0.84, 0.8), sun: dir(0.55, 0.45, 0.7), sunC: C(1, 0.93, 0.8), sunI: 3.3, hs: C(0.62, 0.72, 0.82), hg: C(0.3, 0.34, 0.2), hI: 1.25, fog: 0.006, cloud: 0.2, exp: 1.2, wind: 0.5 },
  { top: C(0.36, 0.46, 0.6), hor: C(0.8, 0.84, 0.9), sun: dir(0.35, 0.22, 0.91), sunC: C(0.92, 0.96, 1.0), sunI: 1.6, hs: C(0.72, 0.8, 0.92), hg: C(0.5, 0.5, 0.5), hI: 1.35, fog: 0.0042, cloud: 0.72, exp: 1.0, wind: 1.0, cloudLit: C(0.9, 0.92, 0.95), cloudDark: C(0.48, 0.52, 0.6) },
  { top: C(0.18, 0.32, 0.62), hor: C(1.0, 0.7, 0.4), sun: dir(-0.38, 0.15, 0.91), sunC: C(1, 0.68, 0.38), sunI: 3.3, hs: C(0.5, 0.55, 0.78), hg: C(0.5, 0.35, 0.2), hI: 0.85, fog: 0.0028, cloud: 0.3, exp: 1.0, wind: 0.8, cloudLit: C(1.0, 0.75, 0.5), cloudDark: C(0.5, 0.4, 0.45) },
  { top: C(0.05, 0.08, 0.27), hor: C(0.45, 0.38, 0.62), sun: dir(0.45, 0.5, 0.74), sunC: C(0.8, 0.86, 1.0), sunI: 3.2, hs: C(0.42, 0.48, 0.8), hg: C(0.25, 0.22, 0.3), hI: 1.3, fog: 0.004, cloud: 0.15, exp: 1.35, wind: 0.6, stars: 1, moon: dir(-0.08, 0.36, -0.93), cloudLit: C(0.55, 0.5, 0.75), cloudDark: C(0.12, 0.12, 0.24) },
  { top: C(0.04, 0.24, 0.72), hor: C(0.58, 0.8, 0.95), sun: dir(0.3, 0.75, 0.6), sunC: C(1, 0.97, 0.92), sunI: 3.2, hs: C(0.6, 0.75, 1.0), hg: C(0.4, 0.38, 0.35), hI: 1.15, fog: 0.0014, cloud: 0.32, exp: 1.0, wind: 1.0 },
  { top: C(0.28, 0.44, 0.56), hor: C(0.96, 0.8, 0.55), sun: dir(0.35, 0.55, 0.75), sunC: C(1, 0.88, 0.7), sunI: 3.0, hs: C(0.7, 0.72, 0.62), hg: C(0.42, 0.3, 0.16), hI: 1.0, fog: 0.0034, cloud: 0.4, exp: 1.0, wind: 0.6, cloudLit: C(1.0, 0.9, 0.75), cloudDark: C(0.55, 0.5, 0.45) },
];
const sunL = new THREE.DirectionalLight(0xffffff, 3);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -45, right: 45, top: 60, bottom: -60, near: 10, far: 700 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1);
scene.add(hemi);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.25, 0.4, 1.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uCap: { value: 0 }, uPop: { value: 0 }, uWhite: { value: 0 }, uStreak: { value: 0 }, uKick: { value: 0 }, uCen: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uTitle, uCounter, uCap, uPop, uWhite, uStreak, uKick; uniform vec2 uCen;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - uCen;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      // the jump: a zoom streak out from the device, then white
      float z = uStreak * 0.45 + uKick * 0.02;
      for (int i = 0; i < 8; i++) {
        float k = (float(i) + jit) / 8.0;
        vec2 uv = uCen + d * (1.0 - z * k);
        vec2 off = d * (0.004 + 0.02 * uStreak) * k;
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 8.0;
      // white streak lines radiating from the device
      vec2 dd = vUv - uCen; dd.y *= 1.78;
      float ang = atan(dd.y, dd.x), rad = length(dd);
      float lines = pow(h(vec2(floor(ang * 90.0), 1.0)), 6.0) * smoothstep(0.02, 0.5, rad);
      col += vec3(0.75, 0.95, 1.0) * lines * uStreak * 2.5;
      col = mix(col, vec3(0.88, 0.97, 1.0), smoothstep(0.55, 1.0, uStreak));
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.8) / 0.1, 2.0));
      col *= 1.0 - uCounter * 0.34 * exp(-pow((vUv.y - 0.64) / 0.07, 2.0)) * smoothstep(0.8, 0.1, vUv.x);
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: one locked framing behind your left shoulder, the same at every stop ----------
// Inside a stop it may lean a little toward the danger (and widen for the brachiosaur), but it leaves the locked framing
// only 0.4 s after a flash and is back on it 0.4 s before the next one: on both sides of every flash you and the watch
// are at exactly the same place on screen. No shake or hand-held drift within ~0.45 s of a flash either.
const LOCK = { p: new THREE.Vector3(-0.72, 1.72, 5.0), look: new THREE.Vector3(-0.2, 6.6, -40), fov: 54 };
// how free the camera is: 0 on the locked framing round every flash, 1 in the middle of a stop
function freeAt(v, k) {
  if (k === 0) return 0;
  return smooth(stopStart(k) + 0.4, stopStart(k) + 1.0, v) * (1 - smooth(stopEnd(k) - 1.2, stopEnd(k) - 0.4, v));
}
// near a flash: 0 (still), else 1
function calmAt(v) {
  let q = 1;
  for (const J of [...JUMPS, V_WHITE, 0]) q = Math.min(q, smooth(0.45, 0.7, Math.abs(v - J)));
  return q;
}
const TRACK = [0, 0.2, 0.25, 0.2, 0.25, 0.2, 0.25, 0.25];
function camAt(v, s) {
  const k = s.k, m = freeAt(v, k);
  const pos = LOCK.p.clone(), look = LOCK.look.clone();
  let fov = LOCK.fov;
  if (m > 0) {
    // the danger: lean the aim toward its head
    let f = FOCUS[k].clone();
    if (k === 7) f = FOCUS2.clone().lerp(FOCUS[7], smooth(41.0, 42.0, v));
    if (k === 6) { const S = sharkAt(v); f.set(S.x, Math.max(S.y, SEA_Y) + 0.5, S.z); }
    const dirL = look.clone().sub(pos).normalize(), dirF = f.clone().sub(pos);
    if (dirF.length() > 0.5) { dirF.normalize(); look.copy(pos).addScaledVector(dirL.lerp(dirF, TRACK[k] * m).normalize(), 45); }
    // the brachiosaur: widen so its head in the sky and all of you fit together
    if (k === 7) fov += 8 * m * (1 - smooth(40.8, 41.8, v));
    // keep you in the frame: you right of centre, never past ~0.8 of the width
    const lx = look.x - pos.x, lz = look.z - pos.z, yawL = Math.atan2(-lx, -lz);
    const yawY = Math.atan2(pos.x, pos.z);
    const half = Math.atan(Math.tan(fov * DEG / 2) * W / H);
    const d = clamp(yawL - yawY, 0.05, half * 0.62);
    const yawN = yawY + d, r = Math.hypot(lx, lz);
    look.x = pos.x - Math.sin(yawN) * r; look.z = pos.z - Math.cos(yawN) * r;
    // never tilt down so far that your feet leave the frame
    look.y = Math.max(look.y, pos.y + r * Math.tan(-0.2 * DEG));
  }
  // a hand-held drift (none round the flashes)
  const q = calmAt(v);
  pos.x += wobble(v * 0.5, 2) * 0.02 * q; pos.y += wobble(v * 0.7, 5) * 0.015 * q;
  return { pos, look, fov, q };
}

// ground shaking: the mastodons, the brachiosaur and the hunter's feet, the bear's charge (never round a flash)
function kickAt(v, s) {
  let k = 0;
  const S = stopStart(s.k);
  if (s.k === 3) k = Math.max(k, 0.25 * Math.pow(Math.abs(Math.sin(v * 3.3)), 12) * smooth(S + 1, S + 4, v));
  if (s.k === 7) k = Math.max(k, 0.5 * Math.pow(Math.abs(Math.sin(v * 1.6)), 16) * (1 - smooth(40.5, 41.5, v)), 0.6 * Math.pow(Math.abs(Math.sin(v * 6.0)), 14) * smooth(41.5, 45.0, v));
  if (s.k === 4) k = Math.max(k, 0.3 * Math.pow(Math.abs(Math.sin(v * 7.5)), 10) * (1 - smooth(S + 2.0, S + 2.4, v)));
  return k * calmAt(v);
}

const tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
function update(v, cover = -1) {
  const s = state(v);
  const k = s.k;
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  const L = LOOK[k];

  // ---------- things (before the camera: it follows them) ----------
  animals.frame(v);
  nature.frame(k, v);
  glows.begin(camera);
  smoke.begin();
  street.frame(k, v, s, glows);
  // the cats' eyes shine in the moonlight
  if (k === 5) for (const e of EYES) glows.add(e.x, e.y, e.z, 0.16, 1.4, 2.8, 0.9);

  // ---------- the camera ----------
  const cam = camAt(v, s);
  const kick = kickAt(v, s);
  camera.position.copy(cam.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look);
  camera.rotateZ((wobble(v * 0.3, 7) * 0.4 * DEG + wobble(v * 29, 5) * kick * 0.01) * cam.q);
  camera.rotateX((wobble(v * 43, 3) * kick * 0.012 + wobble(v * 0.55, 3) * 0.002) * cam.q);
  camera.rotateY((wobble(v * 47, 4) * kick * 0.012 + wobble(v * 0.45, 4) * 0.002) * cam.q);
  camera.fov = cam.fov;
  if (params.has('dbg')) { const d = params.get('dbg').split(',').map(Number); camera.position.set(d[0], d[1], d[2]); camera.lookAt(d[3], d[4], d[5]); camera.fov = d[6] || 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- you ----------
  {
    const head = FOCUS[k].clone().sub(tmpV.set(0, 1.6, 0));
    const yawTo = k === 0 ? 0 : clamp(Math.atan2(-head.x, -head.z), -0.6, 0.6);
    const pitchTo = k === 0 ? 0.05 : clamp(Math.atan2(head.y, Math.hypot(head.x, head.z)), -0.3, 0.6);
    // (your head follows the danger only inside a stop: round every flash you are in the same pose)
    const hm = k === 0 ? 0 : smooth(stopStart(k) + 0.4, stopStart(k) + 0.9, v) * (1 - smooth(stopEnd(k) - 0.9, stopEnd(k) - 0.45, v));
    you.pose({
      lift: [0, 0], lean: 0, head: [-pitchTo * 0.8 * hm, -yawTo * 0.9 * hm],
      reach: 0.62, reachDir: new THREE.Vector3(-0.3, -0.55 + 0.25 * s.tap, 0.78).normalize(), curl: 0.5,
      armsFwd: 0.85 * s.tap, armsOut: -0.55 * s.tap,
    });
    you.root.position.set(0, heightAt(k, 0, 0), 0);
    you.root.updateMatrixWorld(true);
    dev.getWorldPosition(tmpV);
    devFaceMat.emissiveIntensity = 1.5 + 3.5 * s.device;
    devLight.position.copy(tmpV);
    devLight.intensity = 0.6 * s.device * (k === 1 || k === 5 ? 2.2 : 1);
    glows.add(tmpV.x, tmpV.y, tmpV.z, 0.12 + 0.35 * (s.device - 0.35), 0.4 * s.device, 1.6 * s.device, 2.0 * s.device);
    // where the streak comes from: the device on screen
    tmpS.copy(tmpV).project(camera);
    finish.uniforms.uCen.value.set(clamp(tmpS.x * 0.5 + 0.5, 0.2, 0.8), clamp(tmpS.y * 0.5 + 0.5, 0.15, 0.7));
  }

  // ---------- light, sky, fog, water ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(4500);
  u.uTop.value.copy(L.top); u.uHor.value.copy(L.hor); u.uBelow.value.copy(L.hor).multiplyScalar(0.6);
  u.uSun.value.copy(L.sun); u.uSunC.value.copy(L.sunC); u.uSunK.value = k === 5 ? 0 : 6; u.uGlowC.value.copy(L.sunC); u.uGlowK.value = k === 5 ? 0 : 0.5;
  u.uCloud.value = L.cloud; u.uCloudLit.value.copy(L.cloudLit || C(1, 1, 1)); u.uCloudDark.value.copy(L.cloudDark || C(0.55, 0.6, 0.7));
  u.uMoonK.value = L.moon ? 1.6 : 0; if (L.moon) u.uMoon.value.copy(L.moon); u.uMoonR.value = 0.05;
  u.uStars.value = L.stars || 0; u.uTime.value = v; u.uSeed.value = k * 3.7;
  scene.fog.color.copy(L.hor); scene.fog.density = L.fog;
  renderer.toneMappingExposure = L.exp;
  sunL.color.copy(L.sunC); sunL.intensity = L.sunI;
  hemi.color.copy(L.hs); hemi.groundColor.copy(L.hg); hemi.intensity = L.hI;
  const look = tmpS.set(0, 0, -18);
  sunL.position.copy(L.sun).multiplyScalar(300).add(look);
  sunL.target.position.copy(look);
  sunL.target.updateMatrixWorld();
  GU.uStop.value = k; GU.uTime.value = v;
  water.visible = k === 2 || k === 6;
  WU.uStop.value = k; WU.uLevel.value = k === 2 ? LAKE_Y : SEA_Y; WU.uTime.value = v;
  WU.uSky.value.copy(L.hor).lerp(L.top, 0.3); WU.uSun.value.copy(L.sun); WU.uSunC.value.copy(L.sunC);
  WU.uFogC.value.copy(L.hor); WU.uFogD.value = L.fog;
  if (k === 2) { WU.uDeep.value.setRGB(0.02, 0.06, 0.06); WU.uShallow.value.setRGB(0.1, 0.16, 0.12); WU.uWave.value = 0.4; }
  else { WU.uDeep.value.setRGB(0.0, 0.05, 0.12); WU.uShallow.value.setRGB(0.02, 0.32, 0.36); WU.uWave.value = 1.0; }

  // ---------- the shark: its wake grows as it speeds up; white water round its head once it breaks the surface ----------
  if (k === 6) {
    const S = sharkAt(v), fwx = Math.sin(S.yaw), fwz = Math.cos(S.yaw);
    const sp = smooth(0, 4.5, S.t);
    WU.uSplash.value.set(S.x - fwx * 1.5, S.z - fwz * 1.5, 2.0 + 3.5 * S.surf + 2 * S.lunge, Math.max(0.35 * sp, S.surf) * (1 - 0.3 * S.lunge));
    // the wake: two white lines spreading back from the fin (and from the head once it's up), longer as it goes faster
    const fx = S.x - fwx * 6.0, fz = S.z - fwz * 6.0;
    const n = Math.round(10 + 26 * sp);
    for (let i = 0; i < n; i++) {
      const u = (i % 13) / 13, side = i % 2 ? 1 : -1, back = u * (4 + 10 * sp);
      const ox = fx - fwx * back + (-fwz) * side * back * 0.35, oz = fz - fwz * back + fwx * side * back * 0.35;
      smoke.puff(ox, SEA_Y + 0.1, oz, 0.25 + 0.35 * u, (0.25 + 0.4 * sp) * (1 - u), 1.3, 0, (i * 0.17 + v * 0.3) % 1);
    }
    // spray thrown up round the body where it leaves the water
    const br = S.surf;
    if (br > 0) for (let i = 0; i < 90; i++) {
      const a = i * 2.39, age = ((S.t - 2.2) * 1.3 + i * 0.0137) % 1.2;
      const along = 1 + (i % 9) / 9 * 6 + 3 * S.lunge, bx = S.x - fwx * along, bz = S.z - fwz * along;
      const r = 0.6 + 2.6 * age;
      smoke.puff(bx + Math.cos(a) * r, SEA_Y + 0.2 + 3.5 * age * (1.25 - age) * (0.6 + 0.6 * S.lunge), bz + Math.sin(a) * r * 0.7, 0.1 + 0.28 * age, 0.85 * br * (1 - age / 1.2), 1.35, 0, (i * 0.13) % 1);
    }
  } else WU.uSplash.value.set(0, 0, 1, 0);
  // dust under the charging animals' feet
  {
    const S4 = stopStart(4);
    const dusty = (k === 4 && (v < S4 + 2.4 || v > S4 + 3.6)) || (k === 7 && v > 41.2);
    if (dusty) {
      const f = FOCUS[k];
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + v * 2, age = (v * 0.9 + i / 6) % 1;
        smoke.puff(f.x + Math.cos(a) * 1.5, heightAt(k, f.x, f.z) + 0.3 + age, f.z + Math.sin(a) * 1.5 + 1, 0.5 + 0.8 * age, 0.12 * (1 - age), 1.05, 0, (i * 0.21) % 1);
      }
    }
  }
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.copy(L.sunC).multiplyScalar(0.6).add(L.hs.clone().multiplyScalar(0.5));
  smoke.mat.uniforms.uSun.value.copy(L.sun);

  // ---------- post ----------
  bloom.strength = 0.22 + 0.25 * s.streak + (k === 5 ? 0.15 : 0);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uKick.value = window.__cover ? 0 : kick;
  finish.uniforms.uStreak.value = window.__cover ? 0 : s.streak;
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.pow(white, 1.2);
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - white;
  s.hide = Math.max(smooth(0.5, 0.9, white), smooth(0.6, 0.95, s.streak) * 0);
  overlay(v, s, v);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - s.hide) : 0; }
    if (a > 0) {
      if (stampEl.textContent !== p.say) stampEl.textContent = p.say;
      const fit = Math.max(56, Math.min(118, 1560 / p.say.length));
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
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 40, 35, 30, 24, 19, 13, 8, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, street, animals, you, FOCUS, finish, dev, comp: () => comp };
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
