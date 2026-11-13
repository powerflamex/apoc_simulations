import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity, CU } from './city.js';
import { makePeople } from './people.js';
import { makeTraffic } from './traffic.js';
import { makeFountain } from './fountain.js';
import { makeSign } from './tempsign.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFire } from './fire.js';
import { makeOverlay } from './overlay.js';
import { H, patchHeat } from './heat.js';
import { CAM0, EYE, TREES, AWNINGS, FOUNT, FX, QUAY, groundY, SEA_Y } from './layout.js';
import {
  state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, HITS, SUN_AZ, SUN_EL,
  V_SHADE, V_VENUS, V_STEAM, V_BOIL, V_TREES, V_CARS, V_SAG, V_GLOW, V_FILL, V_SURF, V_HIT,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, keys, rng } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (street-scale; the far shore is 3 km off)
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;     // (ACES turns fire orange into tan)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H_PX, 0.4, 9000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const dirAE = (az, el) => new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
const SUN = dirAE(SUN_AZ, SUN_EL);
let matN = 0;
const plainMat = (color, rough = 0.9, extra = {}, heat = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `m${matN++}`, heat);
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
const ctx = { plainMat, glowMat, shadowy };
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene, ctx);
const people = makePeople(scene);
const traffic = makeTraffic(scene, ctx);
const fountain = makeFountain(scene, ctx);
const sign = makeSign(scene, ctx);
const glows = makeGlows(scene, 5000);
glows.cam = camera.position;
const smoke = makeSmoke(scene, 2400);
const fire = makeFire(scene, 1500);
H.uSunW.value.copy(SUN);

// the Sun stands over the end of the avenue (north), so you look into it; the shadows run toward you
const sunL = new THREE.DirectionalLight(0xfff3e2, 3.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 110, bottom: -110, near: 20, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.3);
scene.add(hemi);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H_PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H_PX);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uShim: { value: 0 }, uHor: { value: 0.3 }, uWhite: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uShim; uniform float uHor; uniform float uWhite;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 d = vUv - 0.5;
      // the heat shimmer: hot air rising off the street ripples everything seen through it, most along the horizon
      vec2 q = vec2(vUv.x * 46.0, vUv.y * 70.0 - uTime * 3.2);
      vec2 sh = vec2(ln(q) - 0.5, ln(q * 1.7 + 13.0) - 0.5);
      float band = exp(-pow((vUv.y - uHor) / 0.16, 2.0)) * 0.85 + 0.15 * smoothstep(uHor + 0.15, uHor - 0.2, vUv.y);
      vec2 suv = vUv + sh * vec2(0.0022, 0.0035) * uShim * band;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = 0.5 + (suv - 0.5) * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.37) / 0.11, 2.0));
      col *= 1.0 - uCounter * 0.4 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.75, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
      // the end: white
      col = mix(col, vec3(1.0), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: you stand in the plaza in the crowd, phone up. Into the Sun down the avenue; a turn to the sign as
// everyone runs; a cut to the other way (south, the Sun behind you) as Venus sweeps over; back north to the fountain, the
// trees, the cars on the left, the sign again; then up and up into the Sun ----------
const C1 = 7.344, C1b = 7.346, C2 = 10.59, C2b = 10.592, C3 = 24.29, C3b = 24.292;     // the cuts (between frames)
export const P2 = { x: -0.3, z: 0.5 };                          // (10.6-24.3: a few steps from the fountain)
const PITCH = [[-2, 13], [5.0, 13.5], [6.3, 15], [C1, 15], [C1b, 13], [C2, 14], [C2b, -3], [14.9, -2.5], [16.2, 12], [19.4, 12.5], [20.6, -1], [C3, -1], [C3b, 16], [28.4, 16], [29.4, 13], [31, 15], [34, 18], [37, 24], [40, 30], [42, 33], [44.5, 40], [47.5, 44]];
const YAW = [[-2, -3], [5.0, -3], [6.3, -26], [C1, -27], [C1b, 180], [C2, 182], [C2b, -13], [14.9, -12], [16.2, 2], [19.4, 1], [20.6, 42], [C3, 44], [C3b, -24], [28.4, -26], [29.4, -5], [47.5, -6]];
const FOV = [[-2, 60], [0, 60], [5.0, 51], [6.3, 50], [C1, 50], [C1b, 54], [C2, 52], [C2b, 48], [14.9, 45], [16.2, 62], [19.4, 60], [20.6, 60], [C3, 56], [C3b, 52], [28.4, 50], [29.4, 62], [36, 66], [42, 66], [44.5, 50], [47.5, 38]];
function camAt(v) {
  const at2 = v > C2b && v < C3b;
  const pos = new THREE.Vector3(at2 ? P2.x : CAM0.x, EYE, at2 ? P2.z : CAM0.z);
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = keys(YAW, v) * DEG;
  let roll = wobble(v * 0.3, 7) * 0.4 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.35 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.3 * DEG * k;
  return { pos, yaw, pitch, roll, fov };
}

// ---------- fires, steam and embers: who burns when ----------
const R0 = rng(31);
const TF = TREES.map((t) => ({ ...t, tIgn: V_TREES + Math.min(2.5, Math.max(0, (Math.hypot(t.x - CAM0.x, t.z - CAM0.z) - 16) / 40)) + 0.2 * R0(), seed: R0() }));
const AF = AWNINGS.filter((a) => a.z > QUAY + 10).map((a) => ({ ...a, tIgn: V_CARS + 1.0 + Math.min(3, Math.abs(a.z - CAM0.z) / 30) + R0(), seed: R0() }));
const SHOPS = [];
for (const side of [-1, 1]) for (let z = 40; z > -70; z -= 9 + R0() * 7) SHOPS.push({ x: side * (FX - 0.15), z, tIgn: V_GLOW - 1.5 + R0() * 4, seed: R0(), w: 2 + R0() * 2.5 });
const EMBERS = Array.from({ length: 260 }, () => ({ x: (R0() - 0.5) * 50, z: CAM0.z - 4 - R0() * 110, ph: R0() * 10, sp: 0.6 + R0() * 1.6, dr: (R0() - 0.5) * 2 }));
const STEAM_BAY = Array.from({ length: 70 }, () => ({ x: (R0() - 0.5) * 700, z: QUAY - 40 - Math.pow(R0(), 0.7) * 900, ph: R0() * 10, r: 25 + R0() * 40 }));
const ROADSMOKE = Array.from({ length: 60 }, () => ({ x: (R0() < 0.5 ? -1 : 1) * (8 + R0() * 6.5), z: CAM0.z - 6 - R0() * 90, ph: R0() * 10 }));
const V_POWER = V_SAG + 1.8;     // the power fails (screens, the sign, the fountain's pumps)

const tmpC = new THREE.Color(), tmpS = new THREE.Vector3(), venD = new THREE.Vector3();
const VEN_C = dirAE(180, 30), VEN_T = new THREE.Vector3(-1, 0, 0);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.flash, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the white clears)
  s.treeBurnt = smooth(V_TREES + 2, V_TREES + 7, v);
  // ---------- the beats: a kick on each ----------
  s.kick = 0;
  for (const t of HITS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * (0.45 + 0.5 * t / 46)); }
  // ---------- the camera ----------
  const cam = camAt(v);
  const sh = (s.kick * 0.7 + 0.02 + 0.25 * s.melt) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.35 * DEG * cam.fov / 60;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.03 * s.kick);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the heat ----------
  // (what glows: the sunlit faces follow the physics up to ~2,600 K; the shady faces only to a dull red-orange, so the
  // city stays a dark shape against the Sun instead of a flat orange wash)
  const tk = Math.min(s.sunK, 2600), ak = Math.min(s.airK, 1150);
  H.uTK.value = tk; H.uAmbK.value = ak; H.uTKP.value = tk; H.uAmbKP.value = ak;
  H.uGlowGain.value = 2.6 + 1.5 * smooth(1000, 2600, s.sunK);
  const sunA = Math.min(s.sunDeg, 179) / 2 * DEG;
  const power = 1 - smooth(V_POWER, V_POWER + 0.3, v);
  // the sky's colours, for everything that mirrors it
  const smk = 0.75 * smooth(V_TREES, V_CARS + 4, v) * (1 - 0.5 * s.melt);
  const heatK = smooth(60, 250, s.F);
  const hi = tmpC.setRGB(0.07, 0.24, 0.7).lerp(new THREE.Color(0.16, 0.3, 0.62), heatK * 0.5).lerp(new THREE.Color(0.25, 0.15, 0.08), smk).lerp(new THREE.Color(0.6, 0.2, 0.05), s.melt);
  GU.uSkyHi.value.copy(hi); CU.uSkyHi.value.copy(hi); fountain.PU.uSkyHi.value.copy(hi);
  const lo = tmpC.setRGB(0.52, 0.7, 0.92).lerp(new THREE.Color(0.8, 0.8, 0.76), heatK * 0.55).lerp(new THREE.Color(0.55, 0.3, 0.13), smk).lerp(new THREE.Color(0.85, 0.3, 0.05), s.melt);
  GU.uSkyLo.value.copy(lo); CU.uSkyLo.value.copy(lo); fountain.PU.uSkyLo.value.copy(lo);
  const hz = tmpC.copy(lo).lerp(new THREE.Color(0.42, 0.24, 0.12), smk * 0.5);
  GU.uHaze.value.copy(hz); CU.uHaze.value.copy(hz);
  const hd = lerp(lerp(6000, 3500, heatK), 2200, smk);
  GU.uHazeD.value = hd; CU.uHazeD.value = hd;
  GU.uSun.value.copy(SUN); CU.uSun.value.copy(SUN); fountain.PU.uSun.value.copy(SUN);
  GU.uSunA.value = sunA;
  GU.uSunCol.value.setRGB(1.0, 0.9, 0.72).lerp(tmpC.setRGB(1.0, 0.6, 0.25), smooth(5, 30, s.sunDeg));
  GU.uTime.value = v; CU.uTime.value = v;
  GU.uMirage.value = s.shimmer * (1 - 0.7 * s.glow);
  GU.uTar.value = smooth(110, 170, s.F);
  GU.uSteam.value = s.steam; GU.uBoil.value = smooth(V_BOIL - 0.5, V_BOIL + 3, v) * 0.8 + 0.2 * smooth(V_SAG, V_GLOW, v);
  GU.uEnd.value = s.melt;
  CU.uCrack.value = s.crack; CU.uPower.value = power;
  city.SU.uOn.value = power;

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uT.value = v * 0.5 + 6 * smooth(V_FILL, V_HIT, v);
  u.uSun.value.copy(SUN); u.uSunA.value = sunA;
  u.uWhite.value = 1 - smooth(3.0, 9, s.sunDeg);
  u.uSunI.value = lerp(1.0, 1.15, smooth(10, 60, s.sunDeg));
  u.uProm.value = smooth(9, 22, s.sunDeg);
  u.uGlowK.value = 1 - 0.75 * smooth(20, 80, s.sunDeg);
  u.uPx.value = (cam.fov * DEG) / H_PX;
  u.uCloud.value = 1 - smooth(1.0, 4.0, v);
  u.uHeat.value = heatK; u.uSmoke.value = smk; u.uEnd.value = s.melt;
  // Venus: along its path, drawn ~5x
  const ph = s.venus.phi;
  venD.copy(VEN_C).multiplyScalar(Math.cos(ph)).addScaledVector(VEN_T, Math.sin(ph)).normalize();
  u.uVen.value.copy(venD); u.uVenA.value = s.venus.deg / 2 * DEG; u.uVenVis.value = s.venus.vis;

  // ---------- light: the Sun's light grows; as it fills the sky the shadows soften and the fill light swells ----------
  const lc = new THREE.Vector3(CAM0.x, 0, CAM0.z - 50);
  sunL.position.copy(SUN).multiplyScalar(500).add(lc);
  sunL.target.position.copy(lc);
  sunL.target.updateMatrixWorld();
  sunL.intensity = 3.0 * (1 + 0.2 * smooth(0, 60, s.F) + 0.25 * smooth(150, 800, s.F)) * (1 - 0.35 * smk) * (1 - 0.4 * smooth(30, 100, s.sunDeg));
  sunL.color.setRGB(1, 0.96, 0.9).lerp(tmpC.setRGB(1, 0.72, 0.42), smooth(4, 40, s.sunDeg));
  sunL.shadow.radius = 1 + 10 * smooth(3, 40, s.sunDeg);
  hemi.intensity = (1.3 + 0.3 * heatK) * (1 + 0.6 * smooth(10, 110, s.sunDeg)) * (1 - 0.3 * smk);
  hemi.color.setRGB(0.61, 0.75, 1.0).lerp(tmpC.setRGB(0.95, 0.9, 0.82), heatK * 0.5).lerp(tmpC.setRGB(0.9, 0.62, 0.38), smk).lerp(tmpC.setRGB(1.0, 0.55, 0.2), smooth(10, 80, s.sunDeg));
  hemi.groundColor.setRGB(0.6, 0.54, 0.47).lerp(tmpC.setRGB(0.55, 0.3, 0.15), s.melt);
  renderer.toneMappingExposure = 1.0 - 0.12 * smooth(20, 90, s.sunDeg);

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  fire.begin();
  people.frame(v);
  traffic.frame(v, s, glows, smoke, fire);
  fountain.frame(v, s, V_POWER, smooth(V_POWER + 0.5, V_GLOW, v));
  sign.frame(v, s, s.F, power);
  city.frame(v, s);
  // steam off the fountain: wisps from ~180°F, a rolling cloud once it boils, gone when it's dry
  {
    const st = s.steam * (1 - smooth(V_GLOW - 1, V_GLOW + 1, v));
    if (st > 0.01) for (let i = 0; i < 26; i++) {
      const T = 2.6, age = ((v * (1 + s.boil * 0.6) + i * 0.37) % T + T) % T;
      const a = i * 2.39, rr = (FOUNT.r - 0.6) * Math.sqrt((i * 0.618) % 1);
      smoke.puff(FOUNT.x + Math.cos(a) * rr + 0.4 * age, 0.7 + (1.3 + 1.2 * s.boil) * age, FOUNT.z + Math.sin(a) * rr, 0.4 + (0.7 + 0.5 * s.boil) * age, (0.2 + 0.35 * s.boil) * st * Math.sin(Math.PI * age / T), 1.0, 0, (i * 0.17) % 1);
    }
  }
  // steam over the bay
  {
    const st = smooth(V_STEAM, V_BOIL + 3, v) * (1 - 0.5 * s.melt);
    if (st > 0.01) for (const b of STEAM_BAY) {
      const T = 9, age = ((v + b.ph) % T + T) % T;
      smoke.puff(b.x + 6 * age, SEA_Y + 4 + 9 * age * (0.6 + 0.6 * st), b.z, b.r * (0.6 + 0.12 * age), 0.32 * st * Math.sin(Math.PI * age / T), 1.0, 0, (b.ph * 0.1) % 1);
    }
  }
  // the trees: flames in the crowns, then embers; dark smoke
  for (const t of TF) {
    const f = smooth(t.tIgn, t.tIgn + 0.7, v) * (1 - 0.75 * smooth(t.tIgn + 5, t.tIgn + 9, v));
    if (f <= 0) continue;
    const cy = t.topY - 0.6;
    for (let k = 0; k < 8; k++) {
      const a = k * 0.785 + t.seed * 6, rr = t.r * (k % 2 ? 0.75 : 0.35);
      fire.add(t.topX + Math.cos(a) * rr, cy - (k % 2) * 0.5, t.topZ + Math.sin(a) * rr, t.r * 1.3, (3.2 + 2.4 * f) * (0.8 + 0.3 * Math.sin(v * 3 + k + t.seed * 9)), f, t.seed + k * 0.11);
    }
    glows.add(t.topX, cy + 1.5, t.topZ, 5 + 4 * f, 2.8 * f, 1.0 * f, 0.2 * f);
    for (let k = 0; k < 4; k++) {
      const T = 3.4, age = ((v - t.tIgn) + k * T / 4 + t.seed * T) % T;
      if (v - t.tIgn < age) continue;
      smoke.puff(t.topX + 0.5 * age, cy + 3.5 + 3 * age, t.topZ, 1.0 + 1.3 * age, 0.6 * f * (1 - age / T), 0.18, 0, (t.seed + k * 0.23) % 1);
    }
  }
  // the awnings and then the shop fronts
  for (const a of AF) {
    const f = smooth(a.tIgn, a.tIgn + 0.8, v) * (1 - 0.6 * smooth(a.tIgn + 4, a.tIgn + 8, v));
    if (f <= 0) continue;
    const gy = groundY(a.z);
    for (let k = 0; k < 3; k++) fire.add(a.x - Math.sign(a.x) * 0.6, gy + 3.6, a.z + (k - 1) * a.w * 0.3, a.w * 0.45, (1.4 + 0.8 * f) * (0.8 + 0.3 * Math.sin(v * 4 + k)), f, a.seed + k * 0.2);
  }
  for (const b of SHOPS) {
    const f = smooth(b.tIgn, b.tIgn + 1.2, v);
    if (f <= 0) continue;
    const gy = groundY(b.z);
    fire.add(b.x, gy + 0.3, b.z, b.w, (2.6 + 1.5 * f) * (0.85 + 0.25 * Math.sin(v * 3 + b.seed * 10)), f, b.seed);
    glows.add(b.x - Math.sign(b.x) * 1.0, gy + 2, b.z, 5, 2.4 * f, 0.8 * f, 0.15 * f);
    if (Math.abs(b.z - CAM0.z) < 90) for (let k = 0; k < 3; k++) {
      const T = 3.6, age = ((v - b.tIgn) + k * T / 3 + b.seed * T) % T;
      if (v - b.tIgn < age) continue;
      smoke.puff(b.x - Math.sign(b.x) * (0.8 + 0.6 * age), gy + 4 + 3 * age, b.z, 1.2 + 1.4 * age, 0.6 * f * (1 - age / T), 0.15, 0, (b.seed + k * 0.3) % 1);
    }
  }
  // smoke off the road once the asphalt cooks
  {
    const k = smooth(V_CARS, V_SAG + 2, v) * (1 - 0.6 * s.melt);
    if (k > 0.01) for (const r of ROADSMOKE) {
      const T = 3.0, age = ((v + r.ph) % T + T) % T;
      smoke.puff(r.x + 0.3 * age, groundY(r.z) + 0.2 + 0.9 * age, r.z, 0.5 + 0.8 * age, 0.28 * k * Math.sin(Math.PI * age / T), 0.35, 0.15 * s.glow, (r.ph * 0.1) % 1);
    }
  }
  // embers drifting up from the fires
  {
    const k = smooth(V_TREES, V_TREES + 1.5, v) * (1 - s.surf);
    if (k > 0.01) for (const e of EMBERS) {
      const T = 4.5, age = ((v * e.sp + e.ph) % T + T) % T;
      const tw = 0.5 + 0.5 * Math.sin(v * 9 + e.ph * 5);
      glows.add(e.x + e.dr * age + Math.sin(age * 2 + e.ph), groundY(e.z) + 1 + 3.2 * age, e.z, 0.1, 3.0 * k * tw, 1.0 * k * tw, 0.2 * k * tw);
    }
  }
  smoke.end();
  glows.end();
  fire.end();
  fire.mat.uniforms.uTime.value = v;
  fire.mat.uniforms.uOcc.value = 0.75;
  fire.mat.uniforms.uGain.value = 1.05;
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.6, 1.55, 1.5).lerp(tmpC.setRGB(1.8, 1.0, 0.5), Math.max(smk * 0.5, s.melt));
  smoke.mat.uniforms.uSun.value.copy(SUN);

  // ---------- post ----------
  bloom.strength = 0.26 + 0.25 * s.kick + 0.1 * smooth(10, 80, s.sunDeg);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.6;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.02;
  finish.uniforms.uShim.value = window.__cover ? 0.3 * s.shimmer : s.shimmer * (1 - 0.6 * s.surf);
  finish.uniforms.uHor.value = 0.5 - Math.tan(cam.pitch) / Math.tan(cam.fov * DEG / 2) * 0.5;
  finish.uniforms.uWhite.value = window.__cover ? 0 : white;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.6, 1, white);
  finish.uniforms.uVig.value = 0.2;

  s.hide = smooth(0.6, 1.0, white);
  overlay(v, s);
  {
    const p = window.__cover ? null : popupAt(v);
    const a = p ? smooth(0, 0.06, p.dt) * (1 - smooth(POP - 0.35, POP, p.dt)) * (1 - s.hide) : 0;
    stampEl.style.opacity = a.toFixed(3);
    finish.uniforms.uPop.value = a;
    { const c = window.__cover ? null : captionAt(v); finish.uniforms.uCap.value = c ? c.alpha * (1 - s.hide) : 0; }
    stampW.style.opacity = '0';
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
  for (const t of [46, 40, 34, 28, 22, 16, 10, 4, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, H, comp: () => comp };
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
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H_PX)})`; };
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
