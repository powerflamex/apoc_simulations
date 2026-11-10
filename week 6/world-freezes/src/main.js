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
import { makeBirds } from './birds.js';
import { makeWeather } from './weather.js';
import { makeWall } from './wall.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeOverlay } from './overlay.js';
import { FU, frostify } from './frost.js';
import { CAM0, EYE, BLD, FX, HERO, QUAY, groundY, SEA_Y } from './layout.js';
import { state, VIDEO_DURATION, LOOP, popupAt, captionAt, POP, V_FROST, V_STALL, V_RAIN, V_POUR, V_SNOW, V_CRACK, V_FALL, V_LENS, V_ZERO } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys, rng } from './util.js';

const W = 1080, H = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
// a plain depth buffer (the street is 0.4 m from you; the far shore 3 km): street-scale, so no log depth
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, W / H, 0.4, 9000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- the world ----------
const plainMat = (color, rough = 0.9, extra = {}) => frostify(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
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
const birds = makeBirds(scene, ctx);
const weather = makeWeather(scene, CAM0);
const wall = makeWall(scene);
const glows = makeGlows(scene, 4000);
glows.cam = camera.position;
const smoke = makeSmoke(scene, 1800);

// the Sun high behind you (south-west), so the street, the crowd and the wall's face are lit and nothing goes black
const SUN = new THREE.Vector3(-0.28, 0.66, 0.7).normalize();
const sunL = new THREE.DirectionalLight(0xfff3e2, 2.9);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 110, bottom: -110, near: 20, far: 900 });
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x9a8a78, 1.15);
scene.add(hemi);

const overlay = makeOverlay();
const stampEl = document.getElementById('stamp');
const stampW = document.getElementById('stampw');

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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.25, 0.4, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 },
    uAb: { value: 0 }, uCap: { value: 0 }, uPop: { value: 0 }, uBlur: { value: 0 }, uGust: { value: 0 }, uLens: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter;
    uniform float uAb; uniform float uCap; uniform float uPop; uniform float uBlur; uniform float uGust; uniform float uLens;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
    float lf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * ln(p); p = p * 2.13 + 1.7; a *= 0.5; } return s; }
    float vorE(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(lh(i + o), lh(i + o + 31.0)) - f; float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      return sqrt(d2) - sqrt(d1); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = d * uAb * 0.01;
      float bl = uBlur + uGust * 0.03;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = 0.5 + d * (1.0 - bl * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      col = mix(col, col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), 0.12);
      // the front going past you: a white-out of ice crystals
      col = mix(col, vec3(0.86, 0.92, 1.0), uGust * 0.82);
      // frost on the lens: feathers of ice growing in from the edges until it is solid (a still pattern, so the loop's
      // last frame and the frame after it match)
      if (uLens > 0.0) {
        vec2 a = vec2(vUv.x * 0.5625, vUv.y);
        float ed = min(min(vUv.x, 1.0 - vUv.x) * 0.5625, min(vUv.y, 1.0 - vUv.y));
        vec2 w = vec2(lf(a * 4.0), lf(a * 4.0 + 9.0)) - 0.5;
        // crystals: the edges of ice grains at three sizes, each feathered by the next
        float fr = (1.0 - smoothstep(0.0, 0.07, vorE(a * 6.0 + w * 0.8))) * 0.55
                 + (1.0 - smoothstep(0.0, 0.06, vorE(a * 17.0 + w * 1.6))) * 0.35
                 + (1.0 - smoothstep(0.0, 0.05, vorE(a * 46.0 + w * 3.0))) * 0.22;
        float grain = lf(a * 120.0);
        float e = ed - 0.09 * lf(a * 5.0 + 2.0) - 0.035 * fr;
        float grow = uLens * 0.36;
        float cov = 1.0 - smoothstep(grow - 0.03, grow, e);
        float edge = smoothstep(grow - 0.04, grow - 0.004, e) * cov;
        vec3 ice = mix(vec3(0.56, 0.69, 0.84), vec3(0.9, 0.95, 1.0), clamp(fr * 0.95 + grain * 0.25 + 0.15, 0.0, 1.0));
        ice += vec3(0.28, 0.3, 0.32) * edge;
        // thin where it has only just formed (you see through it, milky), solid behind
        float thick = clamp(smoothstep(0.0, 0.07, grow - e) * 0.6 + 0.4 + 0.3 * fr, 0.0, 1.0);
        thick = mix(thick, 1.0, smoothstep(0.85, 1.0, uLens));
        float near = (1.0 - smoothstep(grow, grow + 0.06, e)) * (1.0 - cov);
        col = mix(col, col * 0.7 + vec3(0.32, 0.36, 0.42), near * 0.5);
        col = mix(col, ice, cov * thick);
      }
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.5 * exp(-pow((vUv.y - 0.37) / 0.11, 2.0));
      col *= 1.0 - uCounter * 0.38 * exp(-pow((vUv.y - 0.5) / 0.07, 2.0)) * smoothstep(0.66, 0.1, vUv.x);
      col *= 1.0 - uCap * 0.45 * exp(-pow((vUv.y - 0.175) / 0.04, 2.0));
      col *= 1.0 - uPop * 0.45 * exp(-pow((vUv.y - 0.175) / 0.05, 2.0));
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

// ---------- the camera: you stand in the plaza, phone up, and only your eyes move: down the avenue at the wall, at the
// fountain, up at the birds, at the rain and the sky, a zoom to the bay, up at the tower on the right ----------
const PITCH = [[-2, 3.5], [2.4, 3.5], [3.3, 2], [5.2, 1], [8.2, 3], [8.9, 15], [9.4, 14], [10.6, 0], [11.2, 0], [12.0, -3.5], [14.2, -3.5], [15.0, 0.5], [17, 2], [20.6, 3], [21.6, 9], [23.4, 9], [24.4, -4], [26.6, -3], [27.6, 5], [29.4, 5], [30.6, 24], [32.2, 24], [33.0, -3], [35.4, -3], [36.2, 10], [41.6, 9], [42.8, 3.5], [50, 3.5]];
const FOV = [[-2, 62], [5.2, 62], [6.1, 52], [7.6, 52], [8.6, 62], [11.2, 62], [12.0, 46], [14.2, 46], [15.0, 57], [17.5, 57], [18.3, 62], [29.6, 62], [30.6, 68], [32.2, 68], [33.0, 30], [35.4, 30], [36.2, 52], [41.6, 52], [42.8, 62], [50, 62]];
const YAW = [[-2, 0], [5.2, 0], [6.1, -9], [7.6, -9], [8.6, 0], [11.2, 0], [12.0, 0], [14.2, 0], [15.0, 0], [32.2, 0], [33.0, 2], [35.4, 2], [36.2, -10], [41.6, -11], [42.8, 0], [50, 0]];
function camAt(v) {
  const pos = new THREE.Vector3(CAM0.x, EYE, CAM0.z);
  let pitch = keys(PITCH, v) * DEG, fov = keys(FOV, v), yaw = keys(YAW, v) * DEG;
  let roll = wobble(v * 0.3, 7) * 0.4 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  const k = fov / 62;
  yaw += wobble(v * 0.45, 4) * 0.3 * DEG * k; pitch += wobble(v * 0.55, 3) * 0.28 * DEG * k;
  // shivering, once the cold is on you (until you freeze too)
  const shiv = smooth(V_FROST, V_FROST + 1, v) * (1 - smooth(14.5, 15.5, v));
  pitch += Math.sin(v * 37) * Math.sin(v * 5.3) * 0.12 * DEG * shiv;
  return { pos, yaw, pitch, roll, fov };
}

// ---------- the glass coming off the fronts once they crack, and the tower's fall ----------
const SHARDS = [];
{
  const R = rng(99);
  const near = BLD.filter((b) => Math.abs(Math.abs(b.x) - (FX + b.w / 2)) < 1 && b.z > -200 && b.z < 30);
  for (let i = 0; i < 700; i++) {
    const b = near[Math.floor(R() * near.length)], side = Math.sign(b.x);
    const sz = b.z + (R() - 0.5) * b.d;
    SHARDS.push({ x: side * FX - side * 0.1, z: sz, gy: groundY(sz), y: groundY(sz) + 6 + R() * (b.h - 8), t: V_CRACK + 0.2 + R() * 8.5, vx: -side * (0.5 + R() * 2.5), ph: R() * 10 });
  }
  for (let i = 0; i < 500; i++) SHARDS.push({ x: HERO.x + (R() - 0.5) * HERO.w, z: HERO.z + HERO.w / 2 + 0.3, gy: SEA_Y, y: SEA_Y + 10 + R() * 175, t: V_CRACK + 0.5 + R() * 7, vx: (R() - 0.5) * 3, vz: 1 + R() * 5, ph: R() * 10, far: true });
}
const boil = [];
{
  const R = rng(5);
  for (let i = 0; i < 70; i++) boil.push({ x: (R() - 0.5) * 34, z: CAM0.z - 4 - Math.pow(R(), 0.8) * 70, r: 1.4 + R() * 2.4, ph: R() * 10, dx: (R() - 0.5) * 0.6 });
}

const tmpC = new THREE.Color(), tmpS = new THREE.Vector3();
const _gy = groundY;
const SKY_HI = new THREE.Color(0.1, 0.3, 0.78), SKY_LO = new THREE.Color(0.62, 0.78, 0.95), HAZE = new THREE.Color(0.66, 0.73, 0.82), BLK = new THREE.Color(0.004, 0.006, 0.014), BLK_LO = new THREE.Color(0.02, 0.03, 0.06);
function update(v, cover = -1) {
  const s = state(v);
  const lens = Math.max(s.lens, cover);
  if (cover >= 0) s.title *= 1 - smooth(0.55, 1, cover);   // (in the loop's lead-in the title fades in as the ice clears)
  // ---------- the camera ----------
  const cam = camAt(v);
  const sh = (s.kick * 0.7 + 0.02 + s.gust * 0.8) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - s.kick * 0.4 * DEG * cam.fov / 62;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.03 * s.kick);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------- the cold ----------
  const pale = smooth(V_FROST, V_FROST + 3, v) * (1 - smooth(V_RAIN - 1, V_RAIN + 0.5, v));
  const haze = smooth(V_RAIN - 0.6, V_RAIN + 1.2, v) * (1 - smooth(V_SNOW + 1.5, V_SNOW + 3.5, v));
  FU.uTime.value = v;
  FU.uFront.value = s.front + 35;
  FU.uFrost.value = s.frost;
  FU.uCover.value = s.cover;
  GU.uTime.value = v; GU.uFront.value = s.front + 35; GU.uFrost.value = s.frost; GU.uDust.value = smooth(18, 20, v);
  GU.uPool.value = s.pool; GU.uCover.value = s.cover; GU.uCrackR.value = s.seaCrack > 0 ? s.seaCrack * 2500 : -300;
  CU.uCrack.value = s.crack; CU.uFall.value = s.fall;
  // the sky's colours, for everything that mirrors it
  const hi = tmpC.copy(SKY_HI).lerp(HAZE, pale * 0.15).lerp(HAZE, haze).lerp(BLK, s.dark);
  GU.uSkyHi.value.copy(hi); CU.uSkyHi.value.copy(hi); fountain.PU.uSkyHi.value.copy(hi);
  const lo = tmpC.copy(SKY_LO).lerp(HAZE, Math.max(pale * 0.25, haze)).lerp(BLK_LO, s.dark);
  GU.uSkyLo.value.copy(lo); CU.uSkyLo.value.copy(lo); fountain.PU.uSkyLo.value.copy(lo);
  // the air between you and the far side: a little haze on a summer day, white in the condensing air, none once it's gone
  const hz = tmpC.copy(SKY_LO).lerp(HAZE, Math.max(pale * 0.3, haze)).lerp(BLK_LO, s.dark);
  GU.uHaze.value.copy(hz); CU.uHaze.value.copy(hz);
  const hd = lerp(lerp(lerp(6000, 5000, pale), 320, haze), 1e6, s.dark);
  GU.uHazeD.value = hd; CU.uHazeD.value = hd;
  GU.uSun.value.copy(SUN); CU.uSun.value.copy(SUN);

  const u = sky.uniforms;
  sky.mesh.position.copy(camera.position);
  sky.mesh.scale.setScalar(5000);
  u.uTime.value = v; u.uSun.value.copy(SUN);
  u.uPale.value = pale; u.uHaze.value = haze; u.uDark.value = s.dark;
  u.uCloud.value = 1 - smooth(V_RAIN - 3, V_RAIN, v);

  // ---------- light: the Sun stays; the sky's blue fill goes with the air, the white ground throws light back up ----------
  sunL.position.copy(SUN).multiplyScalar(500).add(tmpS.set(CAM0.x, 0, CAM0.z - 60));
  sunL.target.position.set(CAM0.x, 0, CAM0.z - 60);
  sunL.target.updateMatrixWorld();
  sunL.intensity = lerp(2.9, 2.2, haze) * (1 - 0.12 * s.cover) + 0.4 * s.dark;
  sunL.color.setRGB(1, 0.95, 0.88).lerp(tmpC.setRGB(1, 1, 1), s.dark);
  hemi.intensity = lerp(1.15, 1.4, haze) * (1 - 0.35 * s.dark);
  hemi.color.setRGB(0.61, 0.75, 1.0).lerp(tmpC.setRGB(0.9, 0.93, 0.98), haze).lerp(tmpC.setRGB(0.25, 0.28, 0.35), s.dark);
  hemi.groundColor.setRGB(0.6, 0.54, 0.47).lerp(tmpC.setRGB(0.7, 0.75, 0.82), s.frost * smooth(V_FROST - 0.5, V_FROST + 2, v)).lerp(tmpC.setRGB(0.85, 0.88, 0.95), s.cover);
  renderer.toneMappingExposure = lerp(1.0, 0.86, Math.max(s.cover, haze * 0.6));

  // ---------- things ----------
  glows.begin(camera);
  smoke.begin();
  wall.frame(v, s.front - 5, camera.position.z, SUN, groundY);
  // rolling mist along the foot of the wall
  if (s.front < CAM0.z + 6) {
    for (let i = 0; i < 34; i++) {
      const x = -90 + i * 5.5 + wobble(i * 1.7, 3) * 2, z = s.front - 3 + wobble(i * 2.3 + v * 0.4, 5) * 2;
      const dz = CAM0.z - z;
      smoke.puff(x, groundY(z) + 3 + (i % 3) * 2.5, z, 6 + (i % 4) * 1.6, 0.85 * smooth(4, 20, dz) * smooth(6, 34, CAM0.z - s.front), 1.0, 0, (i * 0.37) % 1);
    }
  }
  people.frame(v, s, smoke);
  traffic.frame(v, s, glows, smoke);
  fountain.frame(v, s, glows);
  birds.frame(v);
  // the liquid air boiling off the ground: a low white mist over the pools
  if (s.boil > 0.01) for (const b of boil) {
    const T = 3.2, age = ((v + b.ph) % T + T) % T;
    smoke.puff(b.x + b.dx * age, groundY(b.z) + 0.2 + 0.35 * age, b.z, b.r * (0.6 + 0.25 * age), 0.32 * s.boil * Math.sin(Math.PI * age / T), 1.0, 0, (b.ph * 0.1) % 1);
  }
  // the screens die with the cars
  city.SU.uOn.value = 1 - smooth(V_STALL, V_STALL + 0.35, v);
  // glass off the cracked fronts: glints falling and tumbling
  if (v > V_CRACK) for (const g of SHARDS) {
    const t = v - g.t;
    if (t < 0) continue;
    const y = g.y - 4.9 * t * t;
    if (y < g.gy + 0.05) continue;
    const tw = 0.3 + 0.7 * Math.max(0, Math.sin(t * 17 + g.ph));
    glows.add(g.x + g.vx * t, y, g.z + (g.vz || 0) * t, g.far ? 1.1 : 0.16, 2.2 * tw, 2.4 * tw, 2.7 * tw);
  }
  // the tower: a cloud of shattered glass and ice where it breaks, and a plume where its top hits the bay
  if (s.fall > 0) {
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, rr = 8 + 26 * s.fall * (0.6 + 0.4 * Math.sin(i * 1.7));
      smoke.puff(HERO.x + Math.cos(a) * rr, SEA_Y + HERO.brk + Math.sin(a * 1.3) * 10 - 30 * s.fall * (i % 4) / 3, HERO.z + Math.sin(a) * rr * 0.5, 5 + 8 * s.fall, 0.5 * smooth(0, 0.15, s.fall) * (1 - 0.5 * s.fall), 1.0, 0, (i * 0.19) % 1);
    }
    const land = smooth(0.78, 1.0, s.fall) + clamp((v - V_FALL - 4) / 3) * 0.5;
    if (land > 0) for (let i = 0; i < 30; i++) {
      const a = i * 2.4, rr = 30 + 60 * land * (0.5 + 0.5 * Math.sin(i * 2.1));
      smoke.puff(HERO.x + 95 + Math.cos(a) * rr, SEA_Y + 10 + (i % 5) * 18 * land, HERO.z + Math.sin(a) * rr * 0.6, 24 + 30 * land, 0.8 * smooth(0, 0.2, land), 1.0, 0, (i * 0.23) % 1);
    }
  }
  smoke.end();
  glows.end();
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.62, 1.68, 1.8).multiplyScalar(lerp(1, 0.9, s.dark));
  smoke.mat.uniforms.uSun.value.copy(SUN);
  const wu = weather.uniforms;
  wu.uTime.value = v;
  wu.uDiamond.value = smooth(V_FROST, V_FROST + 1.5, v) * (1 - smooth(V_RAIN - 1, V_RAIN, v)) * 0.55;
  wu.uDust.value = s.dust; wu.uRain.value = s.rain; wu.uSnow.value = s.snow; wu.uGust.value = smooth(V_FROST - 0.6, V_FROST - 0.1, v) * (1 - smooth(V_FROST + 0.2, V_FROST + 1.0, v));
  wu.uSky.value.copy(hi); wu.uLight.value = 1 - 0.25 * s.dark;

  // ---------- post ----------
  bloom.strength = 0.22 + 0.25 * s.kick + 0.15 * s.gust;
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = s.kick * 0.6;
  finish.uniforms.uBlur.value = window.__cover ? 0 : s.kick * 0.02;
  finish.uniforms.uGust.value = window.__cover ? 0 : s.gust;
  finish.uniforms.uLens.value = window.__cover ? 0 : lens;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - lens) * 1.0;
  finish.uniforms.uVig.value = 0.2;

  s.hide = smooth(0.82, 1.0, lens);           // (the counter and the text go under the ice as it closes)
  overlay(v, s, v);
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
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, CU, GU, FU, comp: () => comp };
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
