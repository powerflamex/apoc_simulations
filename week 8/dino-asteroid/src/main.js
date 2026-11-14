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
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFire } from './fire.js';
import { makeOverlay } from './overlay.js';
import { makeRock } from './rock.js';
import { makeEffects } from './effects.js';
import { makeStreetcar } from './streetcar.js';
import { H, patchHeat } from './heat.js';
import { CAM0, EYE, TREES, AWNINGS, FX, QUAY, STREETCAR, FAR_BANK, groundY, SEA_Y } from './layout.js';
import {
  state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, HITS, SUN_AZ, SUN_EL, D_KM, DROP_KM, T_ENTRY,
  V_FLAME, V_SINK, V_IMPACT, V_FLASH, V_RISE, V_SMOKE, V_TREES, V_QUAKE, V_EJECTA, V_RED, V_CARS, V_WALL, V_REAL, V_FALL, V_RIVER, V_HIT,
  rockSky,
} from './timeline.js';
import { lerp, smooth, wobble, clamp, keys, rng } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;     // (ACES turns fire orange into tan)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
// (a plain depth buffer: the street is a metre off, the rock is drawn 4 km out, the wall comes from 30 km)
const camera = new THREE.PerspectiveCamera(60, W / H_PX, 0.4, 60000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
// directions: az 0 = down the street (south, toward the crater, -z), + to the right (west); el up
const dirAE = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
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
const streetcar = makeStreetcar(scene, ctx);
const glows = makeGlows(scene, 6000);
glows.cam = camera.position;
const smoke = makeSmoke(scene, 2600);
const fire = makeFire(scene, 1600);
const rock = makeRock(scene);
const fx = makeEffects(scene, smoke, fire, city);

// the evening Sun, low behind your right shoulder; it goes behind the smoke and the debris
const sunL = new THREE.DirectionalLight(0xffe8c8, 2.8);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 110, bottom: -110, near: 20, far: 900 });
scene.add(sunL, sunL.target);
// the light from the south: the rock's fire, the flash, the fireball low on the horizon (shadows run back at you)
const fbL = new THREE.DirectionalLight(0xffffff, 0);
fbL.castShadow = true;
fbL.shadow.mapSize.set(2048, 2048);
fbL.shadow.bias = -0.0005; fbL.shadow.normalBias = 0.05;
Object.assign(fbL.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 20, far: 1200 });
scene.add(fbL, fbL.target);
const hemi = new THREE.HemisphereLight(0xa8c4ff, 0x9a8a78, 1.25);
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
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uShim; uniform float uHor; uniform float uWhite;
    uniform vec2 uCenter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 d = vUv - uCenter;
      // the heat shimmer: hot air rising off the street ripples everything seen through it, most along the horizon
      vec2 q = vec2(vUv.x * 46.0, vUv.y * 70.0 - uTime * 3.2);
      vec2 sh = vec2(ln(q) - 0.5, ln(q * 1.7 + 13.0) - 0.5);
      float band = exp(-pow((vUv.y - uHor) / 0.16, 2.0)) * 0.85 + 0.15 * smoothstep(uHor + 0.15, uHor - 0.2, vUv.y);
      vec2 suv = vUv + sh * vec2(0.0022, 0.0035) * uShim * band;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = uCenter + (suv - uCenter) * (1.0 - uBlur * k);
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
      col = mix(col, vec3(1.0, 0.985, 0.96), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: your phone, held up over the crowd, looking down Canal Street to the river ----------
// It follows the rock down to the horizon, zooms in on the fireball as it climbs over the horizon, pulls back out to the
// street as the palms catch fire, tilts up into the falling rocks, then holds on the street and the river as the wall comes.
const PITCH = [[-2, 10], [0, 10], [1.4, 4.5], [3, 3.6], [5.3, 3.4], [7, 3.2], [10, 4.5], [12, 5.5], [15, 6], [19.5, 7], [21.5, 12], [24.5, 13], [27.5, 8], [29, 3.6], [37, 4.2], [42, 5.5], [44.5, 7], [46.5, 9]];
const YAW = [[-2, -4.5], [0, -4.5], [1.4, -2.5], [4, -0.6], [7, 0], [10, 0], [12.5, 3], [14.5, 4], [19.5, 1], [24, -2], [27.5, 0], [46.5, 0]];
const FOV = [[-2, 60], [0, 60], [1.4, 60], [5.1, 58], [6.3, 58], [8.0, 40], [9.6, 40], [11.5, 60], [19.5, 60], [21.5, 63], [27.5, 62], [29, 54], [33, 54], [37.5, 58], [42, 63], [46.5, 66]];
function camAt(v) {
  const pos = new THREE.Vector3(CAM0.x, EYE, CAM0.z);
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = -keys(YAW, v) * DEG;     // (YAW keys are azimuths: + right)
  let roll = wobble(v * 0.3, 7) * 0.4 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  const k = fov / 60;
  yaw += wobble(v * 0.45, 4) * 0.35 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.3 * DEG * k;
  return { pos, yaw, pitch, roll, fov };
}

// ---------- fires, embers: who burns when ----------
const R0 = rng(31);
// (the palms facing the fireball first, nearest first; the far bank's trees and roofs as a red glow)
const TF = TREES.map((t) => ({ ...t, tIgn: V_TREES - 0.3 + Math.min(3.5, Math.max(0, (Math.hypot(t.x - CAM0.x, t.z - CAM0.z) - 8) / 30)) + 0.3 * R0(), seed: R0() }));
const AF = AWNINGS.filter((a) => a.z > QUAY + 10).map((a) => ({ ...a, tIgn: V_TREES + 1.5 + Math.min(4, Math.abs(a.z - CAM0.z) / 30) + 2 * R0(), seed: R0() }));
const SHOPS = [];
for (const side of [-1, 1]) for (let z = 40; z > -70; z -= 9 + R0() * 7) SHOPS.push({ x: side * (FX - 0.15), z, tIgn: V_RED - 1 + R0() * 5, seed: R0(), w: 2 + R0() * 2.5 });
const EMBERS = Array.from({ length: 260 }, () => ({ x: (R0() - 0.5) * 50, z: CAM0.z - 4 - R0() * 110, ph: R0() * 10, sp: 0.6 + R0() * 1.6, dr: (R0() - 0.5) * 2 }));
// fires across the river once the heat has been on them a while (seen as glows and smoke columns)
const FARFIRE = Array.from({ length: 70 }, () => { const z = FAR_BANK - 60 - Math.pow(R0(), 0.8) * 2600; return { x: (R0() - 0.5) * (1400 + (FAR_BANK - z) * 1.1), z, t0: V_TREES + 0.5 + R0() * 9, s: 20 + R0() * 40, ph: R0() * 10 }; });
// the grit raining down near you once the rocks arrive: tiny glowing streaks
const GRIT = Array.from({ length: 140 }, () => ({ x: (R0() - 0.5) * 70, z: CAM0.z - 6 - R0() * 120, ph: R0(), sp: 0.7 + R0() * 0.6 }));

const tmpC = new THREE.Color(), tmpS = new THREE.Vector3(), rockD = new THREE.Vector3(), rockD2 = new THREE.Vector3(), fbD = new THREE.Vector3();
const C_SUN = new THREE.Color(1.0, 0.9, 0.76), C_RED = new THREE.Color(1.0, 0.38, 0.12);
function update(v, cover = -1) {
  const s = state(v);
  const white = Math.max(s.white, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);
  s.brown = smooth(V_SMOKE - 1, V_TREES + 0.5, v);
  s.treeBurnt = smooth(V_TREES + 2, V_TREES + 7, v);
  s.sag = 0;
  s.kick = 0;
  for (const t of HITS) { const dt = v - t; if (dt > -0.05 && dt < 1.2) s.kick = Math.max(s.kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.3) * (0.45 + 0.4 * t / 46)); }
  const wallNear = smooth(2500, 60, s.frontM) * s.wall;
  // ---------- the camera ----------
  const cam = camAt(v);
  const sh = (s.kick * 0.7 + 0.02 + 1.6 * s.quake + 0.9 * wallNear) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.35 * DEG * cam.fov / 60;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.03 * s.kick);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the light from the south: the rock's fire, then the flash, then the fireball ----------
  const r = s.rock;
  const rockLight = r.hot * (v < V_SINK + 0.7 ? 1 : 0) * 0.7 + s.under * 1.4;
  const fbLight = s.fbI + s.flash * 3;
  const southI = rockLight + fbLight;
  const fbTop = Math.max(0, (s.fbKm - DROP_KM)) / D_KM;              // (rad) how high the fireball's top stands
  const fbEl = v < V_IMPACT ? Math.max(r.el * 0.5, 1) : Math.max(1.5, Math.atan(fbTop) / DEG * 0.55);
  dirAE(v < V_IMPACT ? r.az * 0.5 : 0, fbEl, fbD);
  const heatC = tmpC.setRGB(1.0, 0.55 + 0.4 * smooth(0.6, 1.1, s.fbHeat), 0.25 + 0.6 * smooth(0.8, 1.15, s.fbHeat));
  const lc = new THREE.Vector3(CAM0.x, 0, CAM0.z - 40);
  fbL.position.copy(fbD).multiplyScalar(600).add(lc);
  fbL.target.position.copy(lc); fbL.target.updateMatrixWorld();
  fbL.color.copy(heatC);
  fbL.intensity = 1.6 * Math.min(southI, 2.6);
  fbL.castShadow = southI > 0.05;
  // the Sun: behind the smoke and the debris cloud once the sky goes red
  const dim = smooth(V_EJECTA, V_RED + 1, v);
  sunL.position.copy(SUN).multiplyScalar(500).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 2.8 * (1 - 0.92 * dim) * (1 - 0.3 * s.smoke);
  sunL.color.copy(C_SUN).lerp(C_RED, dim * 0.6);
  hemi.intensity = 1.2 * (1 - 0.4 * dim) + 0.35 * s.fbI + 0.6 * s.red;
  hemi.color.setRGB(0.66, 0.77, 1.0).lerp(tmpC.setRGB(1.0, 0.6, 0.38), smooth(V_IMPACT, 14, v) * 0.5).lerp(tmpC.setRGB(1.0, 0.36, 0.14), s.red);
  hemi.groundColor.setRGB(0.6, 0.54, 0.47).lerp(tmpC.setRGB(0.5, 0.22, 0.1), s.red);
  renderer.toneMappingExposure = 1.0 - 0.15 * smooth(V_FLASH, V_FLASH + 0.4, v) * (1 - smooth(V_FLASH + 2, V_FLASH + 5, v));

  // ---------- the heat on everything that faces the fireball ----------
  H.uSunW.value.copy(fbD);
  H.uTK.value = s.heatK; H.uAmbK.value = 300 + 260 * s.red; H.uTKP.value = s.heatK; H.uAmbKP.value = H.uAmbK.value;
  H.uGlowGain.value = 2.0;

  // ---------- the sky's colours, for everything that mirrors it ----------
  const hi = tmpC.setRGB(0.09, 0.26, 0.66).lerp(new THREE.Color(0.35, 0.18, 0.1), s.smoke * 0.4).lerp(new THREE.Color(0.3, 0.05, 0.02), s.red);
  GU.uSkyHi.value.copy(hi); CU.uSkyHi.value.copy(hi);
  const lo = tmpC.setRGB(0.62, 0.72, 0.86).lerp(new THREE.Color(0.75, 0.5, 0.35), s.smoke * 0.4).lerp(new THREE.Color(1.0, 0.3, 0.06), s.red);
  GU.uSkyLo.value.copy(lo); CU.uSkyLo.value.copy(lo);
  const hz = tmpC.copy(lo).multiplyScalar(0.9).lerp(new THREE.Color(0.35, 0.18, 0.1), s.wall * 0.6);
  GU.uHaze.value.copy(hz); CU.uHaze.value.copy(hz);
  const hd = lerp(lerp(16000, 7000, s.smoke), 5000, s.red);
  GU.uHazeD.value = hd; CU.uHazeD.value = hd;
  GU.uSun.value.copy(SUN); CU.uSun.value.copy(SUN);
  GU.uSunA.value = 0.004;
  GU.uSunCol.value.copy(C_SUN).multiplyScalar(1 - dim);
  GU.uTime.value = v; CU.uTime.value = v;
  GU.uMirage.value = 0.6 * smooth(12, 20, v);
  GU.uTar.value = 0.4 * smooth(16, 30, v);
  GU.uSteam.value = 0.3 * smooth(14, 26, v); GU.uBoil.value = 0;
  GU.uEnd.value = 0;
  GU.uQuake.value = s.quake;
  GU.uFront.value = s.wall > 0 ? s.frontM : 1e6;
  GU.uFbDir.value.copy(fbD);
  GU.uFbCol.value.copy(heatC).multiplyScalar(southI * 0.8);
  CU.uCrack.value = smooth(V_HIT - 0.4, V_HIT - 0.05, v); CU.uPower.value = 1 - smooth(V_FLASH, V_FLASH + 0.6, v) * 0.85;
  city.SU.uOn.value = 1 - smooth(V_QUAKE, V_QUAKE + 0.4, v);

  // ---------- the sky ----------
  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  u.uT.value = v;
  u.uSun.value.copy(SUN);
  u.uPx.value = (camera.fov * DEG) / H_PX;
  u.uRock.value.set(r.az, r.el); u.uRockR.value = r.deg * 0.5;
  u.uRockM.value.set(r.daz, r.del);
  u.uHot.value = r.hot * (1 - smooth(V_SINK + 0.4, V_SINK + 1.0, v));
  const e = rockSky(T_ENTRY - 0.3);
  u.uEntry.value.set(e.az, e.el);
  u.uTrail.value = r.hot * (1 - smooth(V_IMPACT + 1, V_IMPACT + 5, v));
  u.uTrailAge.value = Math.max(0, s.T - T_ENTRY);
  u.uUnder.value = s.under; u.uUnderAz.value = lerp(-6, 0, smooth(V_SINK, V_IMPACT, v));
  u.uFbR.value = s.fbKm; u.uFbHeat.value = s.fbHeat; u.uFbI.value = s.fbI; u.uDrop.value = DROP_KM; u.uDist.value = D_KM;
  u.uFlash.value = s.flash;
  u.uRed.value = s.red; u.uSmoke.value = s.smoke;
  u.uDust.value = 0.45 * s.wall * smooth(40000, 3000, s.frontM);

  // ---------- the rock ----------
  {
    const vis = v < V_SINK + 1.2;
    rock.mesh.visible = vis;
    if (vis) {
      const RS = 4000;
      dirAE(r.az, r.el, rockD);
      rock.mesh.position.copy(rockD).multiplyScalar(RS).add(camera.position);
      rock.mesh.scale.setScalar(Math.tan(r.deg * 0.5 * DEG) * RS * 0.92);
      rock.mesh.rotation.set(0.4 + v * 0.06, 1.1 + v * 0.04, 0.3 - v * 0.03);
      rock.mesh.updateMatrixWorld();
      dirAE(r.az + r.daz * 0.1, r.el + r.del * 0.1, rockD2);
      rock.uniforms.uFront.value.copy(rockD2).sub(rockD).normalize().multiplyScalar(0.8).add(tmpS.copy(rockD).multiplyScalar(-0.6)).normalize();
      rock.uniforms.uHot.value = r.hot;
      rock.uniforms.uTime.value = v;
      rock.uniforms.uSun.value.copy(SUN);
    }
  }

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  fire.begin();
  people.frame(v, s);
  traffic.frame(v, s, glows, smoke, fire);
  streetcar.frame(v, s);
  city.frame(v, s);
  fx.frame(v, s, camera, glows);
  fx.WU.uLight.value.copy(C_RED).multiplyScalar(0.6 + 0.8 * s.red);
  fx.WU.uHaze.value.copy(hz);
  // the palms: smoke from the fronds facing the fireball, then flames in the crowns, then embers; dark smoke
  for (const t of TF) {
    const sm = smooth(V_SMOKE + (t.tIgn - V_TREES), t.tIgn, v);
    const f = smooth(t.tIgn, t.tIgn + 0.7, v) * (1 - 0.6 * smooth(t.tIgn + 8, t.tIgn + 14, v));
    const cy = t.topY - 0.6;
    if (sm > 0 && f < 0.5) for (let k = 0; k < 3; k++) {
      const T = 3.0, age = ((v + k * T / 3 + t.seed * T) % T + T) % T;
      smoke.puff(t.topX + 0.4 * age, cy + 1 + 2.5 * age, t.topZ, 0.5 + 0.8 * age, 0.45 * sm * (1 - age / T), 0.6, 0, (t.seed + k * 0.23) % 1);
    }
    if (f <= 0) continue;
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
    const f = smooth(a.tIgn, a.tIgn + 0.8, v) * (1 - 0.6 * smooth(a.tIgn + 6, a.tIgn + 10, v));
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
  // the streetcar goes up with the cars
  {
    const f = smooth(V_CARS + 0.8, V_CARS + 2.4, v);
    if (f > 0) {
      const gy = groundY(STREETCAR.z);
      for (let k = 0; k < 6; k++) {
        const zz = STREETCAR.z + (k - 2.5) * STREETCAR.len / 6.5;
        fire.add(STREETCAR.x + (k % 2 ? 0.4 : -0.4), gy + 1.6, zz, 2.6, (2.4 + 2.2 * f) * (0.8 + 0.3 * Math.sin(v * 3 + k)), f, 0.37 + k * 0.11);
      }
      glows.add(STREETCAR.x, gy + 2.5, STREETCAR.z, 9, 2.4 * f, 0.8 * f, 0.15 * f);
      for (let k = 0; k < 4; k++) {
        const T = 3.6, age = ((v - V_CARS) + k * T / 4) % T;
        smoke.puff(STREETCAR.x + 0.5 * age, gy + 4 + 3.5 * age, STREETCAR.z + (k - 1.5) * 3, 1.6 + 1.6 * age, 0.65 * f * (1 - age / T), 0.12, 0, (0.4 + k * 0.21) % 1);
      }
    }
  }
  // fires across the river: a glow on each, a column of smoke
  for (const ff of FARFIRE) {
    const age = v - ff.t0;
    if (age < 0) continue;
    const dist = CAM0.z - ff.z;
    if (s.wall > 0 && s.frontM < dist - 50) continue;
    const g = smooth(0, 3, age);
    glows.add(ff.x, SEA_Y + 6, ff.z, ff.s * 0.9, 3.0 * g, 1.0 * g, 0.15 * g);
    for (let k = 0; k < 3; k++) {
      const T = 6, uu = ((age * 0.5 + k / 3 + ff.ph) % 1);
      smoke.puff(ff.x + uu * 20, SEA_Y + 10 + uu * 140 * Math.min(1, age / 4 + 0.3), ff.z, ff.s * (0.5 + 1.5 * uu), 0.35 * g * (1 - uu), 0.14, 0.3 * (1 - uu), (ff.ph + k * 0.3) % 1);
    }
  }
  // embers drifting up from the fires
  {
    const k = smooth(V_TREES, V_TREES + 1.5, v);
    if (k > 0.01) for (const em of EMBERS) {
      const T = 4.5, age = ((v * em.sp + em.ph) % T + T) % T;
      const tw = 0.5 + 0.5 * Math.sin(v * 9 + em.ph * 5);
      glows.add(em.x + em.dr * age + Math.sin(age * 2 + em.ph), groundY(em.z) + 1 + 3.2 * age, em.z, 0.1, 3.0 * k * tw, 1.0 * k * tw, 0.2 * k * tw);
    }
  }
  // the grit coming down around you: little glowing specks falling fast
  {
    const k = smooth(V_EJECTA, V_EJECTA + 2, v);
    if (k > 0.01) for (const gr of GRIT) {
      const T = 1.6 / gr.sp, age = ((v + gr.ph * T) % T + T) % T;
      const y = groundY(gr.z) + 60 * (1 - age / T);
      glows.add(gr.x - 12 * (age / T), y, gr.z + 20 * (age / T), 0.18, 3.2 * k, 1.3 * k, 0.4 * k);
    }
  }
  smoke.end();
  glows.end();
  fire.end();
  fire.mat.uniforms.uTime.value = v;
  fire.mat.uniforms.uOcc.value = 0.75;
  fire.mat.uniforms.uGain.value = 1.05;
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.5, 1.45, 1.4).lerp(tmpC.setRGB(1.8, 0.8, 0.4), Math.max(s.red, smooth(V_IMPACT, 14, v) * 0.4));
  smoke.mat.uniforms.uSun.value.copy(SUN);

  // ---------- post ----------
  bloom.strength = 0.26 + 0.25 * s.kick + 0.3 * s.flash + 0.15 * r.hot * (v < V_SINK + 0.6 ? 1 : 0);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.6 + s.quake * 0.5;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.02;
  finish.uniforms.uShim.value = 0.8 * smooth(11, 20, v);
  finish.uniforms.uHor.value = 0.5 - Math.tan(cam.pitch) / Math.tan(cam.fov * DEG / 2) * 0.5;
  // the flash: the frame washes out for a moment (it never quite reaches white, so it doesn't read as the loop)
  finish.uniforms.uWhite.value = window.__cover ? 0 : Math.max(white, 0.3 * s.flash * s.flashIn);
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
