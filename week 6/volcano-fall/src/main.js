import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky, makePlume } from './sky.js';
import { makeCrater } from './crater.js';
import { makeLake, makeSpatter, makeFountain, NHOT, NSEAM } from './lake.js';
import { makeYou, makeSmoke } from './you.js';
import { makeOnlookers } from './people.js';
import { makeOverlay } from './overlay.js';
import {
  state, joltAt, storyT, heightAt, driftAt, VIDEO_DURATION, LOOP, T_SWITCH, RIM, YOU_R, LAKE_R, T_FALL, T_IMPACT,
  V_IMPACT, V_SLIP, V_CRACK, V_SMOKE, V_HAZE, V_UP, V_WAKE, V_RAIN, V_RIFT, V_DOME, V_BURST, V_FLASH, LOOK, BUBBLES,
} from './timeline.js';
import { DEG, lerp, smooth, wobble, keys, clamp, rng } from './util.js';
import { makeCompositor } from './compose.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;   // (ACES turns lava orange into tan)
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

// ---------- the world (lake center at the origin, the lake surface at y = 0, your side of the rim at +z) ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1e0a04, 0.0004);
const camera = new THREE.PerspectiveCamera(80, W / H, 0.06, 12000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sky = makeSky();
scene.add(sky.mesh);
const plume = makePlume();
scene.add(plume.mesh);
const crater = makeCrater();
scene.add(crater.group);
const lake = makeLake();
scene.add(lake.mesh);
const fountain = makeFountain();
scene.add(fountain.col, fountain.surge);
const spatter = makeSpatter(3000);
scene.add(spatter.mesh);
const you = makeYou();
scene.add(you.root);
const shoeSmoke = makeSmoke(260, new THREE.Color(0.34, 0.3, 0.28));
scene.add(shoeSmoke.mesh);
const gas = makeSmoke(140, new THREE.Color(0.42, 0.37, 0.22));
scene.add(gas.mesh);

const hemi = new THREE.HemisphereLight(0x2a3550, 0xff5a1a, 0.6);
scene.add(hemi);
const lakeLight = new THREE.DirectionalLight(0xff4a12, 1);     // from the lake below
scene.add(lakeLight, lakeLight.target);
const pls = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff5518, 0, 0, 2); scene.add(l); return l; });

// ---------- the tourists: on the spur to your left, beside you on the rim, and behind ----------
const YZ = YOU_R;
const PR = rng(31);
const specs = [];
const yourSpot = new THREE.Vector3(0, RIM, YZ);
const addP = (x, y, z, o = {}) => {
  const p = { x, y, z, yaw: Math.PI + (o.face ?? 0), pitch: o.pitch ?? 0.12, look: o.look ?? -0.7, armR: o.phone ? 1.05 + PR() * 0.2 : 0, phone: !!o.phone, armL: o.armL ?? 0, delay: o.delay ?? PR() * 0.4, react: o.react ?? 1 };
  // they turn to you when the rock gives way, a hand goes up, then they lean over to watch you fall
  const toYou = Math.atan2(yourSpot.x - x, yourSpot.z - z);
  p.pose = (t, base) => {
    const k = smooth(0.15 + p.delay, 0.75 + p.delay, t) * p.react;
    const over = smooth(1.6 + p.delay, 2.6 + p.delay, t);
    let dy = toYou - base.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return {
      yaw: base.yaw + dy * k * (1 - 0.6 * over),
      armL: Math.max(base.armL, 1.35 * k * (1 - over * 0.5)),
      pitch: base.pitch + 0.08 * k + 0.25 * over,
      look: base.look * (1 - k) + (-0.3) * k * (1 - over) + (-1.25) * over,
    };
  };
  specs.push(p);
};
// on the spur (x ~ -2.75, z 108..123, top ~399.75), close in front of you and to your left
addP(-2.1, 399.72, 117.6, { phone: true, face: 0.35, look: -0.9, delay: 0.0 });
addP(-3.5, 399.7, 116.3, { phone: true, face: -0.15, look: -0.8 });
addP(-2.3, 399.66, 114.4, { phone: true, face: 0.5, pitch: 0.2, look: -1.0 });
addP(-3.6, 399.62, 112.6, { phone: false, face: 0.1, armL: 0.4, look: -0.8 });
addP(-2.6, 399.55, 110.6, { phone: true, face: -0.3, pitch: 0.22, look: -1.1 });
addP(-3.8, 399.7, 119.2, { phone: false, face: 0.6, look: -0.6 });
// beside you on the rim, and a row behind
addP(1.45, 400, 122.3, { phone: true, face: -0.5, look: -0.8, delay: 0.05 });
addP(2.6, 400, 122.4, { phone: true, face: -0.2, look: -0.9 });
addP(3.9, 400, 122.2, { phone: false, face: -0.1, look: -0.8 });
addP(5.3, 400, 122.0, { phone: true, face: 0.1, look: -0.9 });
addP(-1.3, 400, 123.2, { phone: true, face: 0.4, look: -0.6 });
for (let i = 0; i < 7; i++) addP(-2 + i * 1.3 + PR() * 0.5, 400, 124.4 + PR() * 1.4, { phone: PR() < 0.5, face: (PR() - 0.5) * 0.6, look: -0.5, pitch: 0.05 });
const people = makeOnlookers(scene, specs, { seed: 8 });

// ---------- what happens on the lake (story time) ----------
const T_OF = (v) => storyT(v);
const zL = YOU_R - driftAt(T_IMPACT);         // where you land
const LAND = new THREE.Vector2(0, zL);
// spatter, set up once: the rocks' splashes, your landing, the bubbles, the rain round you, the eruption
{
  const R = rng(99);
  for (const rk of crater.rocks) {
    if (rk.size < 0.12) continue;
    const x = Math.cos(rk.a) * (rk.r0 - rk.out), z = Math.sin(rk.a) * (rk.r0 - rk.out);
    const n = Math.round(3 + rk.size * 10);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = 2 + R() * 6 * (0.5 + rk.size);
      spatter.add(rk.tLand, x, 0.1, z, Math.cos(a) * sp * 0.5, 3 + R() * 9 * (0.4 + rk.size), Math.sin(a) * sp * 0.5, 0.05 + R() * 0.12 * (0.5 + rk.size));
    }
    rk.splash = [x, z];
  }
  // you: crust fragments and glowing drops thrown up round you
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2, r = 1.2 + R() * 1.5, sp = 1.5 + R() * 3.5;
    spatter.add(T_IMPACT, Math.cos(a) * r, 0.05, zL + Math.sin(a) * r, Math.cos(a) * sp, 2 + R() * 5.5, Math.sin(a) * sp, 0.03 + R() * 0.07, i < 30 ? 1 : 0);
  }
  for (const [v, x, z, size] of BUBBLES) {
    const T0 = T_OF(v);
    const n = Math.round(28 * size * size + 8);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = (1 + R() * 4) * Math.sqrt(size);
      spatter.add(T0 + R() * 0.25, x + Math.cos(a) * size, 0.3, z + Math.sin(a) * size, Math.cos(a) * sp, (6 + R() * 9) * Math.sqrt(size), Math.sin(a) * sp, (0.12 + R() * 0.35) * Math.sqrt(size));
    }
  }
  // lava rain: blobs thrown from the near bursts (34.6, 36.4, 37.4 s) that come down round you
  for (const [v, x, z] of BUBBLES.filter((b) => b[0] > 34 && b[0] < 38)) {
    const T0 = T_OF(v);
    for (let i = 0; i < 26; i++) {
      const tx = (R() - 0.5) * 9, tz = zL + (R() - 0.65) * 9;          // where it comes down
      const tf = 2.2 + R() * 1.2;                                     // time of flight
      const vx = (tx - x) / tf, vz = (tz - z) / tf, vy = 4.905 * tf - 0.3 / tf;
      spatter.add(T0 + R() * 0.3, x, 0.3, z, vx, vy, vz, 0.04 + R() * 0.08);
    }
  }
  // the eruption under you: a fountain all round you
  const TB = T_OF(V_BURST);
  for (let i = 0; i < 1300; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 14;
    const tz = zL + Math.sin(a) * r - 2, tx = Math.cos(a) * r;
    const up = 10 + R() * 30 * (1 - r / 18);
    spatter.add(TB + R() * 1.2, tx, 0.2, tz, Math.cos(a) * R() * 3, up, Math.sin(a) * R() * 3 + 1.5, 0.08 + R() * 0.35);
  }
}
// smoke from your shoes (positions set once from the sitting pose), and the gas rolling in
let smokeReady = false;
function setupSmoke() {
  const R = rng(17);
  you.root.position.set(0, 0.14, zL + 0.12);
  you.root.rotation.set(0, 0, 0);
  you.pose(0, 0, 1);
  you.root.updateMatrixWorld(true);
  const s0 = you.shoeAt(0, new THREE.Vector3()), s1 = you.shoeAt(1, new THREE.Vector3());
  const T0 = T_OF(V_SMOKE - 0.4), T1 = T_OF(T_SWITCH + 1);
  for (let T = T0; T < T1; T += 0.055) {
    const s = R() < 0.5 ? s0 : s1;
    const g = smooth(T0, T0 + 2.5, T);
    shoeSmoke.add(T, s.x + (R() - 0.5) * 0.12, s.y + 0.02, s.z + (R() - 0.5) * 0.2, (R() - 0.5) * 0.12 + 0.05, 0.35 + R() * 0.35, (R() - 0.5) * 0.12, 0.06, 0.22 + R() * 0.15, 2.2 + R() * 1.2, 0.5 * g + 0.15);
  }
  const G0 = T_OF(V_HAZE - 1.2);
  // from across the lake on your right (where you look at V_HAZE), drifting low over the crust toward you
  const dir = new THREE.Vector2(Math.sin(42 * DEG), -Math.cos(42 * DEG));
  for (let i = 0; i < 140; i++) {
    const T = G0 + i * 0.12;
    const d = 14 + R() * 50, side = (R() - 0.5) * 40;
    const x = dir.x * d - dir.y * side, z = zL + dir.y * d + dir.x * side;
    const sp = 0.8 + R() * 0.7;
    gas.add(T, x, 0.8 + R() * 3, z, -dir.x * sp, 0.12 + R() * 0.2, -dir.y * sp, 4 + R() * 6, 0.8 + R() * 0.8, 12 + R() * 6, 0.4);
  }
  smokeReady = true;
}

// ---------- the post: bloom, heat haze, the title / counter shading, the white ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.35, 2.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.3 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCap: { value: 0 },
    uZoom: { value: 0 }, uZC: { value: new THREE.Vector2(0.5, 0.5) }, uHeat: { value: 0 }, uTime: { value: 0 }, uWhite: { value: 0 }, uOrange: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVig, uTitle, uCounter, uCap, uZoom, uHeat, uTime, uWhite, uOrange; uniform vec2 uZC;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      // heat shimmer, stronger low in the frame (the hot air rises from below)
      float hk = uHeat * (0.5 + 0.5 * smoothstep(0.9, 0.1, vUv.y));
      uv += hk * 0.0022 * vec2(sin(uv.y * 85.0 + uTime * 9.0) + sin(uv.y * 31.0 - uTime * 6.0), 0.6 * cos(uv.x * 60.0 + uTime * 7.0) + 0.5 * sin(uv.y * 47.0 + uTime * 11.0));
      // speed: a radial blur out from where you are falling to
      vec3 col = vec3(0.0);
      vec2 d = uv - uZC;
      for (int i = 0; i < 8; i++) { float k = float(i) / 7.0; col += texture2D(tDiffuse, uZC + d * (1.0 - uZoom * k)).rgb; }
      col /= 8.0;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.36) / 0.08, 2.0));
      col *= 1.0 - uCounter * 0.3 * exp(-pow((vUv.y - 0.5) / 0.06, 2.0)) * smoothstep(0.85, 0.2, vUv.x);
      col *= 1.0 - uCap * 0.22 * exp(-pow((vUv.y - 0.36) / 0.05, 2.0));
      col = mix(col, vec3(1.0, 0.62, 0.22), uOrange);
      col = mix(col, vec3(1.0, 0.98, 0.94), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);
const overlay = makeOverlay();

// ---------- per frame ----------
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
const lookKeys = (i) => LOOK.map((k) => [k[0], k[i]]);
const LK = [lookKeys(1), lookKeys(2), lookKeys(3)];
const hotList = [];

function update(v, cover = -1) {
  const s = state(v);
  if (cover >= 0) s.flash = Math.max(s.flash, cover);
  const T = s.T;
  const j = joltAt(v);

  // ---------- where you are ----------
  let eye, fall = 0, sit = 0;
  const domeH = 2.2 * smooth(V_DOME - 0.2, V_BURST, v);
  if (!s.onLake) {
    const feet = heightAt(T);
    const z = YOU_R - driftAt(T);
    eye = v3.set(0, feet + 1.66, z);
    fall = smooth(V_SLIP - 0.3, V_SLIP + 1.2, v);
    sit = smooth(V_IMPACT - 0.45, V_IMPACT, v) * 0.8;
    you.root.position.set(0, feet + 0.9, z + 0.05);
    you.root.rotation.set(-0.1 * fall, 0, 0.05 * Math.sin(v * 1.3) * fall);
  } else {
    const dt = T - T_IMPACT;
    // the crust gives a little under you and springs back; then it rides the lake, and the dome lifts it
    const sink = 0.45 * Math.exp(-dt * 5) * Math.sin(Math.min(dt * 9, Math.PI)) + 0.04 * Math.sin(v * 1.1);
    const crust = domeH - sink;
    const BT = T_OF(V_BURST);
    const thrown = T > BT ? Math.max(0, 13 * (T - BT) - 4.905 * (T - BT) ** 2) : 0;
    eye = v3.set(0.02 * Math.sin(v * 0.7), crust + 0.88 + thrown, zL + 0.1 - 0.6 * thrown / 8);
    sit = 1;
    you.root.position.set(0, crust + 0.14 + thrown * 0.95, zL + 0.22);
    you.root.rotation.set(-0.06 * smooth(V_DOME, V_BURST, v), 0, 0);
  }
  you.pose(v, fall, sit);
  you.root.visible = true;

  // ---------- where you look ----------
  let yaw = keys(LK[0], v) * DEG, pitch = keys(LK[1], v) * DEG, fov = keys(LK[2], v);
  const buzz = s.onLake ? 0.001 : 0.0035 * clamp(s.speed / 50);
  yaw += wobble(v * 21, 3) * (j * 0.05 + buzz) + wobble(v * 0.4, 5) * 0.02;
  pitch += wobble(v * 19, 4) * (j * 0.05 + buzz) + wobble(v * 0.33, 8) * 0.015;
  const roll = wobble(v * 0.5, 2) * 0.03 + wobble(v * 17, 6) * j * 0.03 + (s.onLake ? 0.04 * smooth(V_DOME, V_BURST, v) : 0);
  // the slab tipping you forward at the start
  pitch -= 0.08 * smooth(-0.4, V_SLIP, v) * (1 - smooth(V_SLIP, 2, v));
  camera.position.copy(eye);
  camera.rotation.set(pitch, yaw, roll);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  sky.mesh.position.copy(camera.position);

  // ---------- the light (from the lake below, by your height) ----------
  const y = Math.max(eye.y, 0.6);
  const E = 0.5 * (1 - y / Math.sqrt(y * y + LAKE_R * LAKE_R));
  const lakeGlow = 1 + 0.6 * s.molten;
  const up = smooth(250, 395, eye.y);
  // (from the lake below and in front of you; up on the rim it lights the tourists' faces as they look in)
  lakeLight.position.set(eye.x + 30, eye.y - (s.onLake ? 12 : 60), eye.z - 70);
  lakeLight.target.position.copy(eye);
  lakeLight.intensity = (3.5 * up + 9 * E + (s.onLake ? 1.5 : 0)) * lakeGlow;
  hemi.color.setRGB(0.07 + 0.14 * up, 0.075 + 0.05 * up, 0.12 + 0.04 * up);
  hemi.groundColor.setRGB(1.0, 0.22, 0.05).multiplyScalar(0.25 + 3.2 * E * lakeGlow);
  hemi.intensity = 1.0;

  // ---------- events on the lake ----------
  hotList.length = 0;
  for (const [bv, x, z, size] of BUBBLES) {
    const dt = T - T_OF(bv);
    if (dt < -0.6 || dt > 9) continue;
    const r = size * 3.2 * smooth(-0.5, 0.5, dt) * (1 + 0.25 * smooth(0, 4, dt));
    hotList.push([x, z, r, (dt < 0 ? 0.6 : 1) * Math.exp(-Math.max(dt, 0) / 3.5), Math.hypot(x - LAND.x, z - LAND.y)]);
  }
  for (const rk of crater.rocks) {
    if (!rk.splash) continue;
    const dt = T - rk.tLand;
    if (dt < 0 || dt > 5) continue;
    hotList.push([rk.splash[0], rk.splash[1], 0.5 + rk.size * 2.5, Math.exp(-dt / 1.2), 50]);
  }
  if (s.onLake) {
    // the crust round you breaks at the landing: a few glowing gaps
    const dt = T - T_IMPACT;
    for (const [dx, dz, r] of [[1.4, -0.9, 0.5], [-1.2, -1.4, 0.4], [0.2, 1.6, 0.45], [-1.7, 0.6, 0.35]]) hotList.push([dx, zL + dz, r * smooth(0, 0.5, dt), Math.exp(-dt / 6) * 0.9 + 0.1, 0]);
  }
  hotList.sort((a, b) => a[4] - b[4]);
  for (let i = 0; i < NHOT; i++) {
    const h = hotList[i];
    if (h) lake.U.uHot.value[i].set(h[0], h[1], h[2], h[3]); else lake.U.uHot.value[i].set(0, 0, 0, 0);
  }
  // seams: the crack beside you, the rift, the cracks round the dome
  const seams = [
    [V_CRACK, [-0.7, zL + 0.9, -1.5, zL - 2.6], 0.3, 1.2],
    [V_RIFT, [1.6, zL + 4.5, 3.4, zL - 7.5], 1.5, 1.0],
    [V_DOME + 0.4, [-3.2, zL + 2.5, -0.5, zL - 5.0], 0.5, 1.4],
    [V_DOME + 1.0, [0.6, zL - 1.5, 2.8, zL - 8.0], 0.6, 1.4],
  ];
  seams.forEach(([sv, ab, w, grow], i) => {
    const k = smooth(sv, sv + grow, v);
    lake.U.uSeam.value[i].set(...ab);
    lake.U.uSeamW.value[i].set(w * (0.1 + 0.9 * k) * (1 + 0.3 * smooth(V_DOME, V_BURST, v)), k > 0 ? Math.min(1, k * 3) : 0);
  });
  lake.U.uDome.value.set(0, zL, 7, domeH);
  lake.U.uDomeGlow.value = smooth(V_DOME - 0.2, V_BURST, v);
  lake.U.uMolten.value = s.molten;
  lake.U.uYou.value.copy(LAND);
  lake.U.uSwell.value = 0.6 * smooth(V_RIFT, V_BURST, v);
  lake.U.uT.value = T;
  lake.U.uGlow.value = lakeGlow;
  // the lake waking up: the crust drifts faster
  lake.U.uFlow.value.set(0.05, 0.18 + 0.25 * smooth(V_WAKE, V_WAKE + 3, v));

  // point lights: the nearest bright events (also for the walls)
  const pts = [];
  if (s.onLake) {
    const kC = smooth(V_CRACK, V_CRACK + 1, v);
    if (kC > 0) pts.push([-1.1, 0.3, zL - 0.8, 2.5 * kC]);
    const kR = smooth(V_RIFT, V_RIFT + 1, v);
    if (kR > 0) pts.push([2.6, 0.6, zL - 1.5, 4 * kR]);
    const kD = smooth(V_DOME, V_BURST, v);
    if (kD > 0) pts.push([0, domeH - 0.3, zL - 1.0, 3 * kD]);
    const kB = smooth(V_BURST - 0.2, V_BURST + 0.8, v);
    if (kB > 0) pts.push([0, 3, zL - 6, 40 * kB]);
  }
  for (const h of hotList.slice(0, 6)) if (h[3] > 0.2 && h[2] > 1.5) pts.push([h[0], 1.5, h[1], h[2] * h[2] * h[3] * 2.5]);
  pts.sort((a, b) => b[3] / (1 + (a[0] - eye.x) ** 2 + (a[2] - eye.z) ** 2) - a[3] / (1 + (b[0] - eye.x) ** 2 + (b[2] - eye.z) ** 2));
  pls.forEach((l, i) => {
    const p = pts[i];
    if (p) { l.position.set(p[0], p[1], p[2]); l.intensity = p[3]; } else l.intensity = 0;
  });
  for (let i = 0; i < 4; i++) {
    const p = pts[i];
    if (p) crater.U.uPL.value[i].set(p[0], p[1], p[2], p[3] * 0.6); else crater.U.uPL.value[i].set(0, -1e4, 0, 0);
  }

  // ---------- the pit's haze, the gas ----------
  const gasK = smooth(V_HAZE - 0.8, V_HAZE + 1.5, v) * (1 - 0.55 * smooth(V_UP - 0.6, V_UP + 0.6, v));
  const fogD = 0.0004 + 0.0002 * smooth(100, 0, eye.y) + 0.0045 * gasK + 0.002 * smooth(V_RIFT, V_BURST, v);
  const fogC = new THREE.Color(0.16, 0.055, 0.02).lerp(new THREE.Color(0.26, 0.15, 0.05), gasK);
  scene.fog.density = fogD;
  scene.fog.color.copy(fogC);
  lake.U.uFogD.value = fogD; lake.U.uFogC.value.copy(fogC);
  crater.U.uFogD.value = fogD; crater.U.uFogC.value.copy(fogC);
  crater.U.uLake.value = lakeGlow;
  // the wall smear: how far the wall moves in a frame, against its distance from you
  {
    const wallDist = Math.max(1, (wallAtY(eye.y) - eye.z));
    crater.U.uBlur.value = s.onLake ? 0 : clamp((s.speed * s.rate / 60) / Math.max(0.05, wallDist * 0.004), 0, 25);
  }
  crater.U.uCamY.value = eye.y;
  crater.U.uT.value = T;
  crater.U.uHotFoot.value = 1 + 0.5 * s.molten;
  crater.U.uSky.value.setRGB(0.05, 0.065, 0.12);
  crater.U.uPlume.value.setRGB(0.09, 0.035, 0.012).multiplyScalar(lakeGlow);
  plume.U.uT.value = T;
  plume.U.uGlow.value = lakeGlow;

  // the eruption: a column of lava climbs out of the lake just in front of you, then the surge swallows the view
  {
    const k = smooth(V_BURST - 0.1, V_FLASH, v);
    fountain.col.visible = k > 0;
    if (k > 0) {
      const ht = 1 + 48 * Math.pow(k, 0.7), rad = 1.6 + 1.6 * k;
      fountain.col.position.set(0.5, -1, zL - 9);
      fountain.col.scale.set(rad, ht, rad);
    }
    const ks = smooth(V_FLASH - 0.45, T_SWITCH, v);
    fountain.surge.visible = ks > 0;
    if (ks > 0) {
      fountain.surge.position.set(0, eye.y - 1.5, zL - 9 + 8.5 * ks);
      fountain.surge.scale.setScalar(2 + 7 * ks);
    }
    fountain.U.uT.value = T;
    fountain.U.uFogD.value = fogD; fountain.U.uFogC.value.copy(fogC);
  }
  crater.update(T, v);
  people.update(v);
  spatter.update(T);
  if (smokeReady) {
    shoeSmoke.update(T, camera, 1);
    gas.update(T, camera, 1 - 0.6 * smooth(V_UP - 0.5, V_UP + 0.5, v));
  }

  // ---------- post ----------
  // the speed blur streams out from straight below you (or above, when you look up) while you fall
  const dirY = pitch < 0 ? -1 : 1;
  const vp = v3b.set(eye.x, eye.y + dirY * 1e4, eye.z).project(camera);
  finish.uniforms.uZC.value.set(clamp(vp.x * 0.5 + 0.5, -0.5, 1.5), clamp(vp.y * 0.5 + 0.5, -0.5, 1.5));
  const along = Math.abs(Math.sin(pitch));
  finish.uniforms.uZoom.value = s.onLake ? 0 : clamp(0.012 * clamp(s.speed / 55) * along * (vp.z < 1 ? 1 : 0), 0, 0.02);
  finish.uniforms.uHeat.value = clamp((s.heat - 3) / 25) * 0.9 + 0.35 * smooth(V_DOME, V_BURST, v);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uOrange.value = 0;
  finish.uniforms.uWhite.value = 0;
  finish.uniforms.uTitle.value = window.__cover ? 1.15 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : (1 - s.flash) * 0.9;
  finish.uniforms.uCap.value = window.__cover ? 0 : 1;
  renderer.toneMappingExposure = 1.0 + 0.4 * smooth(300, 395, eye.y) - 0.3 * s.molten;
  bloom.strength = 0.35 + 0.3 * smooth(V_BURST, V_FLASH, v);
  overlay(v, s);
  return s;
}
const wallAtY = (y) => 120 + 30 * Math.pow(clamp(1 - y / RIM), 2);

let comp = null;
// t is video time. The last LOOP seconds replay the moments just before the first frame while the white clears.
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
  setupSmoke();
  if (!params.has('dom')) comp = await makeCompositor(renderer.domElement, stage);
  for (const t of [44.5, 40, 36, 30, 25, 20, 13, 9, 5, 1, 0]) renderFrame(t);   // compile everything once
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, crater, lake, you, update, state, THREE, people, plume };
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
