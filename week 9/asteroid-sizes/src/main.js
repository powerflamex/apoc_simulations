import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeSky } from './sky.js';
import { makeGround, GU } from './ground.js';
import { makeCity } from './city.js';
import { makeTerrace } from './terrace.js';
import { makePeople } from './people.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFire } from './fire.js';
import { makeEffects } from './effects.js';
import { makeOverlay } from './overlay.js';
import { LU } from './looks.js';
import { BLD, TREES, GZ, EYE, HILL, RAIL_Z, LOW_Y, shore, groundY } from './layout.js';
import { state, VIDEO_DURATION, LOOP, S, STOPS, WHITE_CLEAR } from './timeline.js';
import { lerp, smooth, wobble, clamp, keys, rng } from './util.js';

const W = 1080, H_PX = 1920, DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const RENDER_MODE = params.has('render');
window.__cover = params.has('cover');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H_PX, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
// (a plain depth buffer: the nearest person is 3 m off; the far plane takes in the Moon-size rock 6,000 km out)
const camera = new THREE.PerspectiveCamera(56, W / H_PX, 1.0, 1.4e7);
camera.rotation.order = 'YXZ';
scene.add(camera);

// directions: az 0 = straight ahead (-z), + to the right; el up
const dirAE = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
const azel = (p, from) => { const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z; return [Math.atan2(dx, -dz) / DEG, Math.atan2(dy, Math.hypot(dx, dz)) / DEG]; };
const SUN_AZ = 158, SUN_EL = 34;
const SUN = dirAE(SUN_AZ, SUN_EL);

// ---------- the world ----------
const sky = makeSky();
scene.add(sky.mesh);
makeGround(scene);
const city = makeCity(scene);
const terrace = makeTerrace(scene);
const people = makePeople(scene);
const glows = makeGlows(scene, 9000);
const smoke = makeSmoke(scene, 3000);
const fire = makeFire(scene, 1800);
const fx = makeEffects(scene);
const overlay = makeOverlay();

// the Sun, behind your right shoulder (shadows over the terrace only)
const sunL = new THREE.DirectionalLight(0xfff1dc, 2.6);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.03;
Object.assign(sunL.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 400 });
scene.add(sunL, sunL.target);
// the light of whatever is burning in front of you (shadows run back toward you)
const frL = new THREE.DirectionalLight(0xffffff, 0);
frL.castShadow = true;
frL.shadow.mapSize.set(2048, 2048);
frL.shadow.bias = -0.0005; frL.shadow.normalBias = 0.04;
Object.assign(frL.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 10, far: 600 });
scene.add(frL, frL.target);
const hemi = new THREE.HemisphereLight(0xa8c4ff, 0x8a8070, 1.2);
scene.add(hemi);

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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H_PX / 2), 0.3, 0.3, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.2 }, uTitle: { value: 0 }, uCounter: { value: 0 }, uCounterY: { value: 0.66 }, uAb: { value: 0 }, uBlur: { value: 0 }, uWhite: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uTitle; uniform float uCounter; uniform float uCounterY;
    uniform float uAb; uniform float uBlur; uniform float uWhite; uniform vec2 uCenter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 col = vec3(0.0);
      float jit = h(vUv * 1920.0 + uTime) - 0.5;
      vec2 off = (vUv - 0.5) * uAb * 0.01;
      for (int i = 0; i < 6; i++) {
        float k = (float(i) + jit) / 6.0;
        vec2 uv = uCenter + (vUv - uCenter) * (1.0 - uBlur * k);
        col += vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col /= 6.0;
      vec2 c = vUv - 0.5;
      col *= 1.0 - uVig * dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75)) * 2.4;
      // a soft shade behind the title, the picker and the counter so the text reads over a bright sky
      col *= 1.0 - uTitle * 0.42 * exp(-pow((vUv.y - 0.86) / 0.07, 2.0));
      col *= 1.0 - uCounter * 0.22 * exp(-pow((vUv.y - uCounterY) / 0.055, 2.0)) * exp(-pow((vUv.x - 0.5) / 0.2, 2.0));
      col = mix(col, vec3(1.0, 0.99, 0.97), uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finish);

// ---------- the camera: your phone, held up over the crowd, looking over the city at ground zero ----------
const GZ_AZ = Math.atan2(GZ.x, -GZ.z) / DEG;
const CAM = new THREE.Vector3(0, EYE, 0.4);
function camAt(v, s) {
  const pos = CAM.clone();
  const i = s.i;
  // (a little higher in the sky for the bigger ones; a little wider for the biggest two)
  const pitchBase = [7.5, 7.5, 7.5, 14, 13, 13][i];
  const fovBase = [56, 56, 56, 58, 62, 64][i];
  let pitch = pitchBase * DEG, fov = fovBase, yaw = -(GZ_AZ + 0.6) * DEG;
  let roll = wobble(v * 0.3, 7) * 0.35 * DEG;
  pos.x += wobble(v * 0.5, 2) * 0.02; pos.y += wobble(v * 0.7, 5) * 0.015;
  yaw += wobble(v * 0.45, 4) * 0.3 * DEG; pitch += wobble(v * 0.55, 3) * 0.25 * DEG;
  return { pos, yaw, pitch, roll, fov };
}

// ---------- planned once ----------
const R0 = rng(5150);
// glints of breaking glass on every building's face toward you (house-size and jumbo-jet-size stops)
const GLINT = [];
BLD.forEach((b, i) => {
  if (b.kind === 5 && b.dist > 600) return;
  if (Math.abs(b.x) > 120 + b.dist * 0.4) return;
  const n = b.kind >= 2 ? 16 : 4;
  for (let k = 0; k < n; k++) GLINT.push({ i, x: b.x + (R0() - 0.5) * b.w, y: b.y + 3 + R0() * Math.max(2, b.h - 6), z: b.z + b.d * 0.5 + 0.5, dl: R0() * 0.35, vx: (R0() - 0.5) * 3, ph: R0() });
});
// shards from the terrace's glass panels
const SHARD = [];
terrace.PANELS.forEach((p) => {
  if (Math.abs(p.x) > 12) return;
  for (let k = 0; k < 40; k++) SHARD.push({ x: p.x + (R0() - 0.5) * 1.8, y: p.y + (R0() - 0.5) * 0.9, z: p.z + 0.05, vx: (R0() - 0.5) * 6, vy: 1 + R0() * 4, vz: 6 + R0() * 12, sp: (R0() - 0.5) * 30, ph: R0() * 6, dl: R0() * 0.06 });
});
// steam over the bay where it boils (spots on the water you can see)
const STEAM = [];
for (let k = 0; k < 220 && STEAM.length < 70; k++) {
  const z = -1950 - R0() * 3500, x = (R0() - 0.5) * 2 * (300 + -z * 0.32);
  if (shore(x, z) > -60) continue;
  STEAM.push({ x, z, r: 110 + R0() * 150, ph: R0(), sp: 0.7 + R0() * 0.6, seed: R0() });
}
// puffs from each tower's foot and body as it falls
const TOWERS = BLD.map((b, i) => ({ b, i })).filter((t) => t.b.h > 45 && t.b.kind !== 5);
// what the blast fronts pick up (jumbo jet, skyscraper): roof panels and chunks of wall from the blocks in view between
// ground zero and you, and the cars; each is carried out ahead of the dust, tumbling, and comes down further on
const DEB = [];
{
  const R = rng(4242);
  const ROOFC = [0x6a6a6e, 0x8a5040, 0x5a5a60, 0xa09888, 0x7a3a2a, 0x4a4a50, 0x9a9a98];
  const WALLC = [0xc8c0b0, 0xa89880, 0x9a5a48, 0xd8d4cc, 0x707478, 0x3a4a5a];
  for (const b of BLD) {
    if (DEB.length >= fx.NDEB) break;
    if (b.g > 2440 || b.dist < 120) continue;
    if (Math.abs(b.x) > 50 + b.dist * 0.33) continue;            // (in view)
    const near = b.dist < 1100;
    for (let k = 0; k < (near ? 3 : 1) && DEB.length < fx.NDEB; k++) {
      if (R() > (near ? 0.8 : 0.4)) continue;
      const roof = R() < 0.55;
      const cap = b.dist < 500 ? 8 : 15;
      const sz = roof ? [Math.min(b.w, cap) * (0.3 + 0.4 * R()), 0.3 + 0.35 * R(), Math.min(b.d, cap) * (0.3 + 0.4 * R())] : [1.5 + 4 * R(), 1.2 + 2.5 * R(), 0.5 + 1.2 * R()];
      DEB.push({ x: b.x + (R() - 0.5) * b.w * 0.6, y: b.y + (roof ? b.h : b.h * (0.2 + 0.7 * R())), z: b.z + (R() - 0.5) * b.d * 0.6, g: b.g,
        sz, col: new THREE.Color(roof ? ROOFC[Math.floor(R() * ROOFC.length)] : WALLC[Math.floor(R() * WALLC.length)]),
        H: (roof ? 25 : 12) + (roof ? 80 : 45) * R(), L: Math.min(150 + 350 * R(), Math.max(20, b.dist - 200)), T: 0.9 + 0.9 * R(), sp: 5 + 9 * R(), dl: 0.15 * R(), seed: R(),
        ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize() });
    }
  }
}
const CARP = city.CARS.map((c) => { const r = c.seed; return { H: 8 + 40 * ((r * 7.3) % 1), L: 80 + 260 * ((r * 3.7) % 1), T: 0.8 + 0.7 * ((r * 5.1) % 1), sp: 5 + 9 * ((r * 9.7) % 1), dl: 0.1 * ((r * 2.3) % 1), seed: r, ax: new THREE.Vector3(Math.sin(r * 40), Math.cos(r * 53), Math.sin(r * 71)).normalize() }; });
// the skyscraper-size crater's rocks: thrown out on arcs toward you, landing among the nearer blocks
const ROCKS = [];
{
  const R = rng(9090);
  const D0 = Math.hypot(GZ.x, GZ.z), ux = -GZ.x / D0, uz = -GZ.z / D0;     // (ground zero toward you)
  for (let k = 0; k < 110; k++) {
    const Dl = 700 + Math.pow(R(), 0.6) * 1400;                             // where it lands: m from ground zero
    const lat = (R() - 0.5) * 2 * 0.3 * (2440 - Dl);
    const lx = GZ.x + ux * Dl - uz * lat, lz = GZ.z + uz * Dl + ux * lat;
    const T = 1.3 + Dl * 0.0005 + 0.3 * R();
    let tl = 0.2 + R() * 2.4;
    const span = S.tower.you - S.tower.hit - 0.15;
    if (tl + T > span) tl = Math.max(0.1, span - T - 0.4 * R());
    const s = (10 + 38 * R() * R()) * (Dl > 1900 ? 0.6 : 1);
    const hits = [];
    BLD.forEach((b, i) => { if (Math.hypot(b.x - lx, b.z - lz) < s * 1.4 + Math.max(b.w, b.d) * 0.5) hits.push(i); });
    ROCKS.push({ lx, lz, ly: groundY(lx, lz), Dl, tl, T, H: 280 + Dl * 0.3 + 150 * R(), s, seed: R(), hits, ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), sp: 1 + 3 * R() });
  }
}
const ROCK_HIT = new Map();
ROCKS.forEach((r) => r.hits.forEach((i) => { const t = S.tower.hit + r.tl + r.T; if (!ROCK_HIT.has(i) || ROCK_HIT.get(i) > t) ROCK_HIT.set(i, t); }));
// the mountain-size rock: drawn landing past the far shore, 15 miles out (one 6 miles wide landing 1.5 miles away
// would already fill the whole sky), coming in from high up on the right at ~17 km/s
const EV_P = new THREE.Vector3(-1500, 0, -24000);
EV_P.y = groundY(EV_P.x, EV_P.z);
const EV_D = Math.hypot(EV_P.x - CAM.x, EV_P.z - CAM.z);
// the Texas-size one's wall of crust and fire comes from a point beyond the horizon, straight ahead
const TX_DF = 1.5e6;

// ---------- per stop: what the rock does ----------
const tmpC = new THREE.Color(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), tmpW = new THREE.Vector3(), FRONT_C = new THREE.Color();
const GZV = new THREE.Vector3(GZ.x, GZ.y, GZ.z);
const R_CERES = 469700, R_MOON = 1737400;
// the airburst over downtown (jumbo jet), drawn ~600 m up (real: 5.4 miles)
const BURST = new THREE.Vector3(GZ.x, 540, GZ.z);
// blast fronts (m from ground zero) per stop
const ring2 = (v) => { const st = S.jet, t1 = st.hit + 0.12; return v < t1 ? 0 : 2440 * Math.pow(clamp((v - t1) / (st.you - t1), 0, 1.3), 0.8); };
const tRing2 = (g) => { const st = S.jet, t1 = st.hit + 0.12; return t1 + (st.you - t1) * Math.pow(g / 2440, 1.25); };
const crater3 = (v) => { const st = S.tower; const u = clamp((v - st.hit) / 4.4); return 2000 * Math.pow(u, 0.75); };
const surge3 = (v) => { const st = S.tower; return v < st.hit ? 0 : 2440 * Math.pow(clamp((v - st.hit) / (st.you - st.hit), 0, 1.3), 0.85); };
const tSurge3 = (g) => { const st = S.tower; return st.hit + (st.you - st.hit) * Math.pow(g / 2440, 1 / 0.85); };
// the dinosaur killer's fireball: its edge's distance from where it landed, out to you at `you`
const dome4 = (v) => { const st = S.everest; return v < st.hit ? 0 : EV_D * Math.pow(clamp((v - st.hit) / (st.you - st.hit), 0, 1.3), 0.75); };
const tDome4 = (g) => { const st = S.everest; return st.hit + (st.you - st.hit) * Math.pow(g / EV_D, 1 / 0.75); };
// the Moon: the height of its lowest point over ground zero after it touches (m): from the towers' tops to your hilltop
const gapAt = (st, v) => {
  const u = clamp((v - st.hit) / (st.you - st.hit));
  return lerp(350, 118, 1 - Math.pow(1 - u, 1.4));
};
// a body of radius R whose lowest point ends up over ground zero (P0), coming in along A, seen ang degrees in radius
const bodyAlong = (R, A, ang, out) => {
  const P0 = tmpV3.set(GZ.x, GZ.y + 350 + R, GZ.z);
  const d = R / Math.sin(ang * DEG);
  const B = P0.clone().sub(CAM), ab = A.dot(B), disc = ab * ab - B.lengthSq() + d * d;
  const L = disc > 0 ? Math.max(0, -ab + Math.sqrt(disc)) : 0;
  return out.copy(P0).addScaledVector(A, L);
};
const blow = (st, v) => (v < st.hit ? 0 : 2440 * Math.pow(clamp((v - st.hit) / (st.you - st.hit), 0, 1.3), 0.75));
const tBlow = (st, g) => st.hit + (st.you - st.hit) * Math.pow(g / 2440, 1 / 0.75);

// the side of a rock that glows: its leading edge as you see it (the direction it moves across the sky, a little toward you)
const leadFront = (A, p, out) => {
  const view = tmpV2.copy(p).sub(CAM).normalize();
  out.copy(A).negate();
  out.addScaledVector(view, -out.dot(view)).normalize().multiplyScalar(0.92).addScaledVector(view, -0.4).normalize();
  return out;
};
// something picked up by a blast front: carried out away from `from`, tumbling, and down again further on
const fq = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), fm = new THREE.Matrix4(), fs = new THREE.Vector3(), fp = new THREE.Vector3();
function fly(d, x, y, z, from, t, out, q) {
  const u = Math.min(t / d.T, 1);
  let dx = x - from.x, dz = z - from.z; const L0 = Math.hypot(dx, dz) || 1; dx /= L0; dz /= L0;
  const run = d.L * (1 - Math.pow(1 - u, 1.8));
  const yEnd = groundY(x + dx * d.L, z + dz * d.L) + 0.5;
  out.set(x + dx * run, lerp(y, yEnd, u * u) + d.H * Math.sin(Math.PI * u) * (1 - 0.3 * u), z + dz * run);
  q.setFromAxisAngle(d.ax, d.sp * d.T * (1 - Math.pow(1 - u, 2)) * 0.5 + d.seed * 6);
  return u;
}
function tossDebris(v, tFront, from, gMax = 2440) {
  let n = 0;
  for (const d of DEB) {
    if (d.g > gMax) continue;
    const t = v - tFront(d.g) - d.dl;
    if (t < 0) continue;
    fly(d, d.x, d.y, d.z, from, t, fp, fq);
    fm.compose(fp, fq, fs.set(d.sz[0], d.sz[1], d.sz[2]));
    fx.debris.setMatrixAt(n, fm); fx.debris.setColorAt(n, d.col); n++;
  }
  fx.debris.count = n; fx.debris.instanceMatrix.needsUpdate = true; if (fx.debris.instanceColor) fx.debris.instanceColor.needsUpdate = true;
}
const carTosser = (v, tFront, gMin = 0) => (i, p, q) => {
  const g = Math.hypot(p.x - GZ.x, p.z - GZ.z);
  if (g > 2440 || g < gMin) return;
  const d = CARP[i], t = v - tFront(g) - d.dl;
  if (t < 0) return;
  fly(d, p.x, p.y, p.z, GZV, t, fp, fq2);
  p.copy(fp); q.premultiply(fq2);
};
// the terrace's glass panels bursting toward you at t0
const sm4 = new THREE.Matrix4(), sq = new THREE.Quaternion(), se = new THREE.Euler(), sp3 = new THREE.Vector3(), ss = new THREE.Vector3(1, 1, 1);
function burstGlass(v, t0) {
  const ta = v - t0;
  if (ta <= 0) return 0;
  terrace.glass.visible = false;
  let n = 0;
  for (const sh of SHARD) {
    const t = ta - sh.dl; if (t < 0) continue;
    sp3.set(sh.x + sh.vx * t, sh.y + sh.vy * t - 4.9 * t * t, sh.z + sh.vz * t);
    if (sp3.z > CAM.z - 0.8) continue;
    se.set(sh.ph + sh.sp * t, sh.ph * 2 + sh.sp * 0.7 * t, sh.sp * 0.3 * t); sq.setFromEuler(se);
    sm4.compose(sp3, sq, ss); fx.shards.setMatrixAt(n++, sm4);
    if (n % 3 === 0) glows.add(sp3.x, sp3.y, sp3.z, 0.25, 2.5, 2.5, 2.7);
  }
  fx.shards.count = n; fx.shards.instanceMatrix.needsUpdate = true;
  return ta;
}
function hideAll() {
  fx.rock.visible = false; fx.body.visible = false; fx.ring.visible = false; fx.ring2.visible = false;
  fx.curtain.visible = false; fx.ball.visible = false; fx.dome.visible = false; fx.shards.count = 0;
  fx.debris.count = 0; fx.rocks.count = 0;
  for (const m of [fx.ring, fx.ring2, fx.curtain, fx.dome, fx.ball]) m.material.uniforms.uWin.value.set(0, 999, 1);
}

function update(v, cover = -1) {
  const s = state(v);
  const st = s.stop, i = s.i;
  const white = Math.max(s.white, cover);
  s.shake = 0; s.lookEl = 12;
  let kick = 0;
  const kickAt = (t, k) => { const dt = v - t; if (dt > -0.05 && dt < 1.5) kick = Math.max(kick, smooth(-0.05, 0.04, dt) * Math.exp(-Math.max(dt, 0) / 0.32) * k); };
  hideAll();
  glows.begin(camera); smoke.begin(); fire.begin();
  // defaults: a clear morning
  const U = sky.uniforms;
  U.uTrail.value = 0; U.uHot.value = 0; U.uCloud.value = 0; U.uFlash.value = 0; U.uFire.value = 0; U.uDust.value = 0; U.uDim.value = 0;
  let frontI = 0; const frontDir = tmpV2.set(0, 0.2, -1).normalize(); let frontCol = FRONT_C.setRGB(1, 0.85, 0.65);
  let flash = 0, sunDim = 0, burnAll = 0, fireSky = 0, dustSky = 0, darkHaze = 0;
  LU.uFront.value = 1e9; LU.uKind.value = 0; LU.uCrater.value = 0; LU.uMelt.value = 0; LU.uScorch.value = 0; LU.uBoil.value = 0; LU.uTide.value = 0;
  LU.uGZ.value.set(GZ.x, GZ.z);
  terrace.glass.visible = true;
  let carsStop = 1e9, toss = null;

  // ---------------- the stops ----------------
  // building state, filled per stop: (break time, tip angle, sink, burn, dust)
  const BS = BLD.map(() => null);
  const set = (k, tb, ang, sink, burn, dust) => { BS[k] = [tb, ang, sink, burn, dust]; };

  if (st.key === 'house') {
    // a fireball crossing the sky from the right, bursting high up
    const u = clamp((v - st.t0) / (st.hit - st.t0));
    const az = lerp(15, -5, u), el = lerp(13.5, 9.6, u) + 0.8 * Math.sin(u * Math.PI);
    U.uHead.value.set(az, el); U.uTail.value.set(30, 19); U.uHeadR.value = 1.35 + 0.35 * u;
    U.uHot.value = 1 - smooth(st.hit, st.hit + 0.25, v);
    U.uTrail.value = 1; U.uAge.value = Math.max(0, v - st.t0 + 1.5); U.uTrailW.value = 0.55;
    U.uBurstP.value.set(-5, 9.6);
    const tb = v - st.hit;
    U.uCloud.value = smooth(0, 0.1, tb); U.uBurst.value = Math.max(0, tb); U.uBurstR.value = 1.2 + 3.2 * (1 - Math.exp(-Math.max(0, tb) / 0.8));
    flash = tb > 0 ? Math.exp(-tb / 0.35) * 0.6 : 0;
    U.uFlashP.value.set(-5, 9.6);
    // its light: brighter than the Sun as it flares (30x at the peak in 2013: capped here)
    dirAE(az, el, frontDir);
    frontI = (tb < 0 ? 2.0 + 0.6 * u : 0.4 + 2.2 * Math.exp(-tb / 0.6)) * (1 - smooth(st.hit + 1.5, st.hit + 2.5, v));
    frontCol.setRGB(1, 0.93, 0.8);
    s.lookEl = el;
    // the shock: a front sweeping in across the city from the burst, breaking every window it passes
    const T0 = 1.05, TD = st.you - 1.05;
    BLD.forEach((b, k) => set(k, T0 + TD * (1 - Math.min(b.dist, 3600) / 3600), 0, 0, 0, 0));
    for (const g of GLINT) {
      const b = BLD[g.i], tb2 = T0 + TD * (1 - Math.min(b.dist, 3600) / 3600) + g.dl, age = v - tb2;
      if (age < 0 || age > 1.6) continue;
      const y = g.y - 4.9 * age * age - 2 * age, a = 1.6 * Math.exp(-age / 0.7) * (0.45 + 0.55 * Math.sin(age * 34 + g.ph * 20) ** 2);
      if (y < b.y) continue;
      const sz = 3 + b.dist * 0.0042;
      glows.add(g.x + g.vx * age, y, g.z + 1.5 * age, sz, 3.0 * a, 3.0 * a, 3.2 * a);
    }
    kickAt(st.hit, 0.35);
    // the boom reaches the terrace: the glass panels burst toward you
    const ta = burstGlass(v, st.you);
    if (ta > 0) { kickAt(st.you, 1.0); s.shake = smooth(0, 0.1, ta) * Math.exp(-ta / 0.5); }
    kickAt(T0 + 0.6, 0.25);
  }

  else if (st.key === 'jet') {
    // a bigger fireball coming down steeply toward downtown, bursting ~600 m over it
    const [baz, bel] = azel(BURST, CAM);
    const u = clamp((v - st.t0 + 0.35) / (st.hit - st.t0 + 0.35));
    const e = 1 - Math.pow(1 - u, 1.3);
    const az = lerp(14, baz, e), el = lerp(27, bel, e);
    U.uHead.value.set(az, el); U.uTail.value.set(24, 40); U.uHeadR.value = 1.0 + 0.9 * u;
    U.uHot.value = 1 - smooth(st.hit, st.hit + 0.12, v);
    U.uTrail.value = 1 - smooth(st.hit + 2, st.hit + 4, v); U.uAge.value = Math.max(0, v - st.t0 + 1.0); U.uTrailW.value = 0.8;
    s.lookEl = el;
    const tb = v - st.hit;
    // the airburst: a fireball ~500 m wide that cools to dark smoke and rises
    if (tb > 0) {
      fx.ball.visible = true;
      const r = 210 * (1 - Math.exp(-tb / 0.2)) + 30 * tb;
      fx.ball.position.set(BURST.x, BURST.y + 30 * Math.max(0, tb - 0.5) ** 1.2, BURST.z);
      fx.ball.scale.set(r, r * 0.92, r);
      const m = fx.ball.material.uniforms;
      m.uMode.value = 1; m.uHeat.value = 1.15 * Math.exp(-tb / 1.1); m.uA.value = 1 - smooth(1.0, 2.6, tb); m.uLump.value = 2.2; m.uTop.value = 1.4;
      const sk = smooth(0.7, 1.6, tb);
      // (a ring of rolling smoke that spreads and rises, lit orange underneath at first)
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + 0.3 * Math.sin(k * 2.7), R1 = r * (0.55 + 0.3 * smooth(0.8, 5, tb)) * (0.85 + 0.3 * ((k * 7) % 3) / 2);
        const yy = BURST.y + 45 * tb + 30 * Math.sin(a * 3 + 1.0) + 40 * Math.max(0, tb - 1.2);
        smoke.puff(BURST.x + Math.cos(a) * R1, yy, BURST.z + Math.sin(a) * R1 * 0.7, r * 0.42 + 18 * tb, 0.7 * sk, 0.42, 0.5 * Math.exp(-tb / 1.2), (k * 0.137) % 1);
      }
      for (let k = 0; k < 5; k++) smoke.puff(BURST.x + (k - 2) * 25, BURST.y + 45 * tb + 60 + 40 * Math.max(0, tb - 1.2), BURST.z, r * 0.5 + 12 * tb, 0.6 * sk, 0.5, 0.35 * Math.exp(-tb / 1.2), (k * 0.31) % 1);
    }
    flash = tb > 0 ? Math.exp(-tb / 0.3) * 1.0 : 0;
    U.uFlashP.value.set(baz, bel);
    dirAE(tb > 0 ? baz : az, tb > 0 ? bel : el, frontDir);
    frontI = tb < 0 ? 0.8 + 1.2 * u : 0.6 + 3.6 * Math.exp(-tb / 0.5);
    frontCol.setRGB(1, 0.8 + 0.15 * Math.exp(-Math.max(tb, 0) / 0.6), 0.55 + 0.35 * Math.exp(-Math.max(tb, 0) / 0.6));
    // the shock: a low wall of dust racing out over the city (boiling up just behind the front, with roofs, cars and
    // chunks of wall thrown out ahead of it); every tower goes down as it passes
    const R = ring2(v);
    if (R > 0) {
      fx.ring.visible = true; fx.ring2.visible = true;
      const h = 30 + 0.045 * R;
      const Rd = Math.max(1, R - 60);
      fx.ring.position.set(GZ.x, 0, GZ.z); fx.ring.scale.set(Rd, h, Rd);
      fx.ring2.position.set(GZ.x, 0, GZ.z); fx.ring2.scale.set(Math.max(1, R - 450), h * 2.0 + 70, Math.max(1, R - 450));
      for (const [mesh, a, tp] of [[fx.ring, 0.9, 0.85], [fx.ring2, 0.4, 0.8]]) { const m = mesh.material.uniforms; m.uMode.value = 0; m.uA.value = a; m.uLump.value = 1.6; m.uTop.value = tp; }
      LU.uFront.value = R; LU.uKind.value = 1;
      dustSky = smooth(1950, 2440, R) * 0.45;
    }
    carsStop = st.hit + 0.3;
    toss = carTosser(v, tRing2);
    tossDebris(v, tRing2, GZV);
    BLD.forEach((b, k) => {
      const ta = tRing2(b.g);
      let ang = 0, sink = 0, dust = 0;
      if (v > ta) {
        const near = 1 - 0.45 * smooth(1300, 2440, b.g);
        if (b.h > 45) {
          const tF = ta + 0.1 + 0.4 * b.seed, dur = 2.0 + 0.004 * b.h;
          const f = clamp((v - tF) / dur);
          ang = (Math.PI * 0.46) * Math.pow(f, 1.7) * near; sink = 0.3 * f * near;
        } else sink = (0.55 * near + 0.1) * smooth(ta, ta + 0.6, v);
        dust = smooth(ta, ta + 0.4, v) * (0.4 + 0.6 * near);
      }
      set(k, ta, ang, sink, 0, dust);
    });
    // dust from each tower as it goes down
    for (const t of TOWERS) {
      const b = t.b, ta = tRing2(b.g); if (v < ta || b.g > 2440) continue;
      const age = v - ta;
      for (let k = 0; k < 3; k++) {
        const T = 2.2, a = ((age + k * T / 3 + b.seed * T) % T);
        if (age < a) continue;
        smoke.puff(b.x + (b.x - GZ.x) * 0.02 * a, b.y + 10 + 18 * a, b.z + 8 * a, (14 + b.h * 0.1) * (0.6 + a * 0.5), 0.55 * (1 - a / T), 0.62, 0, (b.seed + k * 0.3) % 1);
      }
    }
    // glass glinting as the front passes each building
    for (const g of GLINT) {
      const b = BLD[g.i], tb2 = tRing2(b.g) - 0.15 + g.dl * 0.5, age = v - tb2;
      if (age < 0 || age > 1.2) continue;
      const a = Math.exp(-age / 0.5) * (0.5 + 0.5 * Math.sin(age * 40 + g.ph * 20));
      glows.add(g.x + g.vx * age, g.y - 4.9 * age * age, g.z + 2 * age, 3 + b.dist * 0.004, 3.2 * a, 3.2 * a, 3.4 * a);
    }
    // the last moment: the terrace's glass bursts in at everyone
    burstGlass(v, st.you - 0.32);
    kickAt(st.hit, 0.6); kickAt(st.you - 0.32, 0.6); kickAt(st.you, 1.0);
    s.shake = smooth(st.you - 1.5, st.you, v) * 0.6;
  }

  else if (st.key === 'tower') {
    // a rock as big as a skyscraper (drawn 2.2x), coming in low from beyond the bay, white-hot in front
    const A = dirAE(15, 14);
    const u = clamp((v - st.t0 + 0.3) / (st.hit - st.t0 + 0.3));
    const L = 9000 * Math.pow(1 - u, 1.1);
    const size = 340 * 2.2;
    const p = tmpV.copy(GZV).addScaledVector(A, L + size * 0.5);
    if (v < st.hit + 0.05) {
      fx.rock.visible = true;
      fx.rock.position.copy(p); fx.rock.scale.setScalar(size * 0.5);
      fx.rock.rotation.set(0.4 + v * 0.3, 1.1 + v * 0.2, 0.3);
      leadFront(A, p, fx.RU.uFront.value); fx.RU.uHot.value = 1; fx.RU.uTime.value = v;
      const [az, el] = azel(p, CAM);
      const far = azel(tmpV3.copy(GZV).addScaledVector(A, L + 26000), CAM);
      U.uHead.value.set(az, el); U.uTail.value.set(far[0], far[1]); U.uHeadR.value = 0.9 * (size / p.distanceTo(CAM)) / DEG;
      U.uHot.value = 0.55; U.uTrail.value = 1; U.uAge.value = 1.2; U.uTrailW.value = 1.2 * (size / p.distanceTo(CAM)) / DEG + 0.5;
      glows.add(p.x - A.x * size * 0.6, p.y - A.y * size * 0.6, p.z - A.z * size * 0.6, size * 2.6, 1.6, 0.85, 0.35);
      s.lookEl = el;
      dirAE(az, el, frontDir); frontI = 0.6 + 1.6 * u; frontCol.setRGB(1, 0.75, 0.45);
    } else { U.uTrail.value = 1 - smooth(st.hit, st.hit + 1.5, v); s.lookEl = 4; }
    const tb = v - st.hit;
    // the crater opens: a curtain of rock and dust rising from its growing edge (and falling back); the city inside
    // goes into the pit; rocks thrown out of it come down among the nearer blocks; the base surge rolls out to you
    if (tb > 0) {
      const rb = Math.max(1, crater3(v));
      fx.curtain.visible = true;
      fx.curtain.position.set(GZ.x, 0, GZ.z); fx.curtain.scale.set(rb, rb * 0.5 + 90, rb);
      const m = fx.curtain.material.uniforms; m.uMode.value = 0; m.uA.value = 0.9 * (1 - smooth(800, 1250, rb)); m.uLump.value = 1.4; m.uTop.value = 0.75;
      LU.uCrater.value = rb;
      const Rs = Math.max(surge3(v), rb + 50);
      fx.ring.visible = true; fx.ring.position.set(GZ.x, 0, GZ.z); fx.ring.scale.set(Rs - 50, 25 + 0.035 * Rs, Rs - 50);
      const mr = fx.ring.material.uniforms; mr.uMode.value = 0; mr.uA.value = 0.8; mr.uLump.value = 1.6; mr.uTop.value = 0.85;
      LU.uFront.value = Rs; LU.uKind.value = 1;
      flash = Math.exp(-tb / 0.3) * 1.2; U.uFlashP.value.set(GZ_AZ, 0);
      dirAE(GZ_AZ, 3, frontDir); frontI = 2.8 * Math.exp(-tb / 0.6); frontCol.setRGB(1, 0.85, 0.65);
      dustSky = smooth(st.you - st.hit - 1.0, st.you - st.hit, tb) * 0.55;
      // a column of dust over the crater
      for (let k = 0; k < 6; k++) {
        const T = 3.0, a = ((tb + k * T / 6) % T);
        if (tb < a) continue;
        smoke.puff(GZ.x + Math.sin(k * 2.1) * 90, 150 + 300 * a, GZ.z + Math.cos(k * 1.7) * 90, 80 + 60 * a, 0.55 * (1 - a / T), 0.42, 0, (k * 0.37) % 1);
      }
      // the rocks: up out of the curtain on arcs, down among the blocks in front of you in bursts of dust
      let n = 0;
      for (const r of ROCKS) {
        const t = tb - r.tl; if (t < 0) continue;
        const uu = Math.min(t / r.T, 1);
        const r0 = crater3(st.hit + r.tl) * 0.9;
        const dx = r.lx - GZ.x, dz = r.lz - GZ.z, D = Math.hypot(dx, dz);
        const sx = GZ.x + dx / D * r0, sz = GZ.z + dz / D * r0;
        const x = lerp(sx, r.lx, uu), z = lerp(sz, r.lz, uu);
        const y = lerp(80, r.ly + r.s * 0.2, uu) + r.H * 4 * uu * (1 - uu);
        fq.setFromAxisAngle(r.ax, r.sp * Math.min(t, r.T) + r.seed * 6);
        fm.compose(fp.set(x, y, z), fq, fs.setScalar(r.s));
        fx.rocks.setMatrixAt(n++, fm);
        if (uu < 1) {
          for (let k = 1; k <= 3; k++) {
            const u2 = Math.max(0, uu - k * 0.045);
            smoke.puff(lerp(sx, r.lx, u2), lerp(80, r.ly, u2) + r.H * 4 * u2 * (1 - u2), lerp(sz, r.lz, u2), r.s * (0.6 + 0.25 * k), 0.3 * (1 - k / 4), 0.5, 0, (r.seed + k * 0.21) % 1);
          }
        } else {
          const age = t - r.T;
          if (age < 2.6) {
            for (let k = 0; k < 3; k++) smoke.puff(r.lx + (k - 1) * r.s * 0.8, r.ly + r.s * 0.5 + 30 * age * (0.7 + 0.3 * k), r.lz + (k - 1) * r.s * 0.3, r.s * 1.1 + 28 * age, 0.6 * (1 - age / 2.6), 0.55, 0, (r.seed + k * 0.3) % 1);
            if (age < 0.25) glows.add(r.lx, r.ly + r.s * 0.5, r.lz, r.s * 3, 1.8 * (1 - age / 0.25), 1.2 * (1 - age / 0.25), 0.6 * (1 - age / 0.25));
          }
        }
      }
      fx.rocks.count = n; fx.rocks.instanceMatrix.needsUpdate = true;
    }
    carsStop = st.hit + 0.3;
    toss = carTosser(v, tSurge3);
    if (tb > 0) tossDebris(v, (g) => Math.max(tSurge3(g), st.hit + 0.05), GZV);
    BLD.forEach((b, k) => {
      const rb = crater3(v);
      let ang = 0, sink = 0, dust = 0;
      if (tb > 0 && b.g < rb + 30) sink = 1;
      else {
        const ta = tSurge3(b.g);
        if (v > ta) {
          if (b.h > 40) { const f = clamp((v - ta - 0.1 - 0.4 * b.seed) / (1.8 + 0.004 * b.h)); ang = Math.PI * 0.46 * Math.pow(f, 1.7); sink = 0.3 * f; }
          else sink = 0.6 * smooth(ta, ta + 0.6, v);
          dust = smooth(ta, ta + 0.4, v);
        }
        const tr = ROCK_HIT.get(k);
        if (tr !== undefined && v > tr) { sink = Math.max(sink, 0.85 * smooth(tr, tr + 0.3, v)); dust = Math.max(dust, smooth(tr, tr + 0.2, v)); }
      }
      set(k, tb > 0 ? tSurge3(b.g) : 0, ang, sink, 0, dust);
    });
    kickAt(st.hit, 0.8); kickAt(st.hit + 0.5, 0.5); kickAt(st.you, 1.0);
    s.shake = (tb > 0 ? Math.exp(-tb / 1.2) * 0.8 : 0) + smooth(st.you - 1.5, st.you, v) * 0.7;
  }

  else if (st.key === 'everest') {
    // a rock 6 miles wide at its real size, coming in from high up on the right at ~17 km/s and going into the ground
    // past the far shore; the ground erupts round it, then its fireball rises over the hills and rolls out to you
    const P = EV_P;
    const A = dirAE(25, 38);
    const Rr = 5000;
    const tb = v - st.hit;
    const u = clamp((v - st.t0 + 0.3) / (st.hit - st.t0 + 0.3));
    const L = tb < 0 ? 42000 * Math.pow(1 - u, 1.12) : -9500 * (1 - Math.exp(-tb / 0.7));
    const p = tmpV.set(P.x, P.y + Rr * 0.92, P.z).addScaledVector(A, L);
    fx.rock.visible = tb < 2.4;
    fx.rock.position.copy(p); fx.rock.scale.setScalar(Rr);
    fx.rock.rotation.set(0.2 + v * 0.05, 0.6, 0.1);
    leadFront(A, p, fx.RU.uFront.value); fx.RU.uHot.value = 0.75 + 0.25 * u; fx.RU.uTime.value = v;
    const [az, el] = azel(p, CAM);
    const [paz, pel] = azel(P, CAM);
    const aR = Math.asin(Math.min(1, Rr / p.distanceTo(CAM))) / DEG;
    s.lookEl = Math.min(el + aR * 0.5, 40);
    // its trail of burning air
    const far = azel(tmpV3.copy(p).addScaledVector(A, 60000), CAM);
    U.uHead.value.set(az, el); U.uTail.value.set(far[0], far[1]); U.uHeadR.value = aR;
    U.uHot.value = 0; U.uTrail.value = 1 - smooth(st.hit + 0.3, st.hit + 1.5, v); U.uAge.value = 0.6; U.uTrailW.value = aR * 0.55;
    // the sky catches fire round it as it comes down, then everywhere
    fireSky = 0.3 * smooth(st.hit - 1.0, st.hit, v) + 0.7 * smooth(st.hit + 0.3, st.hit + 2.2, v);
    U.uFireP.value.set(paz, 4);
    dirAE(tb > 0 ? paz : az, tb > 0 ? 4 : Math.max(el, 4), frontDir);
    frontI = tb < 0 ? 0.5 + 1.2 * u : 1.3 + 1.6 * Math.exp(-tb / 1.2);
    frontCol.setRGB(1, 0.6, 0.28);
    sunDim = smooth(st.hit - 1.0, st.hit + 1.0, v) * 0.85;
    flash = tb > 0 ? Math.exp(-tb / 0.3) * 0.9 : 0; U.uFlashP.value.set(paz, pel + 3);
    darkHaze = smooth(st.hit, st.hit + 1.5, v);
    if (tb > 0) {
      // the ground thrown up round it: a curtain of fire and rock
      const rc = 2600 + 6500 * (1 - Math.exp(-tb / 0.9));
      fx.curtain.visible = true; fx.curtain.position.set(P.x, P.y - 60, P.z); fx.curtain.scale.set(rc, rc * 0.8 + 1200, rc);
      const mc = fx.curtain.material.uniforms; mc.uMode.value = 1; mc.uHeat.value = 0.4 + 0.6 * Math.exp(-tb / 2.0); mc.uA.value = 1 - smooth(2.6, 4.2, tb); mc.uLump.value = 0.25; mc.uTop.value = 0.9;
      // its fireball, rising over the hills, then rolling out over the bay and the city to you
      const Rf = dome4(v);
      fx.dome.visible = true; fx.dome.position.set(P.x, P.y - 100, P.z); fx.dome.scale.set(Rf, Rf * 1.05 + 3000 * smooth(0, 1.6, tb), Rf);
      const md = fx.dome.material.uniforms; md.uMode.value = 1; md.uHeat.value = 0.88; md.uA.value = 1; md.uLump.value = 0.22; md.uTop.value = 1.5;
      fx.ring.visible = true; fx.ring.position.set(P.x, 0, P.z); fx.ring.scale.set(Rf + 150, 300 + 0.05 * Rf, Rf + 150);
      const mr = fx.ring.material.uniforms; mr.uMode.value = 1; mr.uHeat.value = 0.95; mr.uA.value = 1; mr.uLump.value = 0.6; mr.uTop.value = 1;
      LU.uGZ.value.set(P.x, P.z); LU.uMelt.value = Rf * 0.9; LU.uFront.value = Rf; LU.uKind.value = 0; LU.uScorch.value = Rf + 1500;
    }
    burnAll = smooth(st.hit + 0.3, st.hit + 1.8, v) * 0.32;
    carsStop = st.hit;
    BLD.forEach((b, k) => {
      const gE = Math.hypot(b.x - P.x, b.z - P.z);
      let sink = 0, burn = burnAll * (b.dist < 4500 ? 0.8 : 0.4), ang = 0;
      if (tb > 0) {
        const ta = tDome4(gE);
        burn = Math.max(burn, smooth(ta - 0.6, ta, v));
        if (v > ta) { sink = smooth(ta, ta + 0.5, v); ang = b.h > 40 ? 0.9 * smooth(ta - 0.1, ta + 0.4, v) : 0; }
      }
      set(k, 0, ang, sink, burn, 0);
    });
    kickAt(st.hit, 0.7); kickAt(st.hit + 0.35, 0.6); kickAt(st.you, 1.0);
    s.shake = (tb > 0 ? 0.5 + 0.3 * Math.exp(-tb / 1.0) : smooth(st.hit - 1, st.hit, v) * 0.3) + smooth(st.you - 1.5, st.you, v) * 0.5;
  }

  else if (st.key === 'texas') {
    // ---------- a world 580 miles wide (Ceres), at its real size: it falls toward the horizon behind the city and
    // sinks into the ground beyond it; the ground erupts along its foot, and a wall of torn-up crust and fire comes
    // in over the far hills and the bay to you ----------
    const Rb = R_CERES;
    const u = clamp((v - st.t0) / (st.hit - st.t0)), tb = v - st.hit, w = clamp(tb / (st.you - st.hit));
    const ue = Math.pow(u, 1.3);
    const a = tb < 0 ? lerp(5, 11, ue) : lerp(11, 12, smooth(0, 1, w));
    const elc = tb < 0 ? lerp(17.5, 12.3, ue) : 12.3 - 8.8 * (1 - Math.pow(1 - w, 1.6));
    const azc = tb < 0 ? lerp(-6, -1.5, u) : lerp(-1.5, 0, w);
    const C = dirAE(azc, elc, tmpV).multiplyScalar(Rb / Math.sin(a * DEG)).add(CAM);
    fx.body.visible = true;
    fx.body.position.copy(C); fx.body.scale.setScalar(Rb);
    fx.body.rotation.set(0, 0, 0);
    const B = fx.BU;
    B.uC.value.copy(C); B.uR.value = Rb;
    B.uMoon.value = 0; B.uLumpy.value = 1; B.uMolten.value = 0; B.uRoll.value = 0;
    const toCam = tmpV3.copy(CAM).sub(C).normalize();
    B.uToCam.value.copy(toCam);
    B.uRight.value.crossVectors(toCam.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    B.uUp.value.crossVectors(B.uRight.value, toCam.clone().negate()).normalize();
    B.uHotH.value = 0; B.uGlow.value = 0; B.uBelow.value = 0;
    B.uCrack.value = 0.65 * smooth(st.hit + 0.4, st.hit + 4.0, v);
    B.uHazeK.value = 0.05;
    B.uBase.value.set(1.3 * smooth(st.hit - 0.5, st.hit + 0.4, v), Math.sin(1.25 * DEG));
    s.lookEl = Math.min(elc + 4, 30);
    // the eruption at its foot, then the wall coming in (sped up a lot: really it would take many minutes)
    const dF = 52000 * Math.pow(1 - w, 1.25);
    const hw = 3500 + 2200 * w;
    const F = tmpV3.set(Math.sin(-1.5 * DEG) * TX_DF, 0, -Math.cos(-1.5 * DEG) * TX_DF);
    const Rw = Math.max(1, F.length() - dF);
    if (tb > 0) {
      fx.ring2.visible = true; fx.ring2.position.copy(F); fx.ring2.scale.set(Rw, hw, Rw);
      const m = fx.ring2.material.uniforms; m.uMode.value = 1; m.uHeat.value = 0.9; m.uA.value = smooth(0, 0.35, tb); m.uLump.value = 0.3; m.uTop.value = 1.0;
      m.uWin.value.set(azc, a * 0.85 + 45 * smooth(0.1, 0.55, w), 4 + 6 * w);
      LU.uGZ.value.set(F.x, F.z); LU.uMelt.value = Rw - 150; LU.uScorch.value = Rw + 900; LU.uFront.value = Rw; LU.uKind.value = 0;
    }
    fireSky = 0.6 * smooth(st.hit + 0.2, st.hit + 3.0, v);
    U.uFireP.value.set(azc, 1);
    sunDim = 0.25 * smooth(st.t0, st.hit, v) + 0.45 * smooth(st.hit, st.hit + 3, v);
    flash = tb > 0 ? Math.exp(-tb / 0.4) * 0.8 : 0; U.uFlashP.value.set(azc, 1.5);
    dirAE(azc, 3, frontDir);
    frontI = smooth(st.hit - 0.3, st.hit + 0.5, v) * 1.6 + 1.3 * w;
    frontCol.setRGB(1, 0.55, 0.25);
    // the bay boils in the heat of the plume; the city catches fire; the wall flattens it as it passes
    LU.uBoil.value = smooth(st.hit + 0.3, st.hit + 2.2, v);
    burnAll = 0.4 * smooth(st.hit + 1.5, st.hit + 4.0, v);
    // steam boiling off the bay (left of downtown and behind it)
    if (LU.uBoil.value > 0.01) for (const sp of STEAM) {
      const T = 2.6, t2 = v - st.hit - 0.3, ag = (t2 + sp.ph * T) % T;
      if (t2 < ag) continue;
      smoke.puff(sp.x + 20 * ag, 20 + 240 * ag * sp.sp, sp.z, sp.r * (0.5 + 0.7 * ag), 0.4 * LU.uBoil.value * (1 - ag / T), 1.0, 0.12, sp.seed);
    }
    carsStop = st.hit;
    BLD.forEach((b, k) => {
      // (its distance from you along the wall's path: the wall flattens it as it passes)
      const dWall = TX_DF - F.distanceTo(tmpW.set(b.x, 0, b.z));
      const sink = tb > 0 ? clamp((dWall + 30 - dF) / 400) : 0;
      set(k, 0, 0, sink, Math.max(burnAll * (0.6 + 0.4 * b.seed), sink > 0 ? 1 : 0), 0);
    });
    kickAt(st.hit, 0.6); kickAt(st.you, 1.0);
    s.shake = smooth(st.hit - 0.2, st.hit + 0.3, v) * 0.4 + smooth(st.you - 2.0, st.you, v) * 0.6;
  }

  else {
    // ---------- the Moon, at its real size: it comes in over the city until it is wider than the frame, its pull
    // heaping the bay up toward it and cracking it apart; then it comes down on downtown and presses down, the ground
    // melting, a wall of fire and molten rock coming at you under it ----------
    const Rb = R_MOON;
    const A = dirAE(-3, 5);
    const u = clamp((v - st.t0) / (st.hit - st.t0)), tb = v - st.hit;
    const aEnd = Math.asin(Rb / tmpV3.set(GZ.x, GZ.y + 350 + Rb, GZ.z).distanceTo(CAM)) / DEG;
    const f = 0.4 * u + 0.6 * Math.pow(u, 8);
    const aNow = 8.5 * Math.pow(aEnd / 8.5, f);
    const C = v >= st.hit ? tmpV.set(GZ.x, GZ.y + gapAt(st, v) + Rb, GZ.z) : bodyAlong(Rb, A, aNow, tmpV);
    const zb = v >= st.hit ? gapAt(st, v) : C.y - Rb - GZ.y;
    fx.body.visible = true;
    fx.body.position.copy(C); fx.body.scale.setScalar(Rb);
    fx.body.rotation.set(0, 0, 0);
    const B = fx.BU;
    B.uC.value.copy(C); B.uR.value = Rb;
    B.uMoon.value = 1; B.uLumpy.value = 0; B.uBase.value.set(0, 0); B.uRoll.value = 0;
    const toCam = tmpV2.copy(CAM).sub(C).normalize();
    B.uToCam.value.copy(toCam);
    const toBody = toCam.clone().negate();
    B.uRight.value.crossVectors(toBody, new THREE.Vector3(0, 1, 0)).normalize();
    B.uUp.value.crossVectors(B.uRight.value, toBody).normalize();
    const dist = C.distanceTo(CAM);
    const ang = Math.asin(Math.min(1, Rb / dist)) / DEG;
    const [, el] = azel(C, CAM);
    s.lookEl = Math.min(el + ang * 0.4, 45);
    B.uHotH.value = 1100; B.uGlow.value = smooth(st.hit - 0.9, st.hit, v) * (1 - 0.85 * smooth(st.hit, st.hit + 1.0, v));
    B.uBelow.value = 0.12 * smooth(st.hit, st.hit + 1.5, v);
    // (inside ~6,000 miles it starts to break up: broad cracks open between plates of rock)
    B.uCrack.value = 0.75 * smooth(st.t0 + 1.2, st.hit - 0.2, v) + 0.25 * smooth(st.hit, st.you - 2, v);
    B.uMolten.value = 0.55 * smooth(st.you - 2.6, st.you - 0.6, v);
    B.uHazeK.value = 0.07 * (1 - smooth(st.hit - 1.5, st.hit, v));
    sunDim = smooth(st.t0, st.hit, v) * 0.45 + 0.5 * smooth(st.hit, st.hit + 0.8, v);
    dirAE(GZ_AZ, 3, frontDir);
    frontI = smooth(st.hit - 0.8, st.hit, v) * 1.6 + (tb > 0 ? 0.6 + 1.2 * smooth(st.you - 3, st.you, v) : 0);
    frontCol.setRGB(1, 0.6, 0.28);
    flash = tb > 0 ? Math.exp(-tb / 0.3) * 1.0 : 0; U.uFlashP.value.set(GZ_AZ, 0);
    // its pull heaps the bay up toward it into a hill of water, spray blowing off its top
    const tide = 1900 * Math.pow(smooth(st.t0 + 0.4, st.hit - 0.25, v), 1.3) * (1 - smooth(st.hit - 0.1, st.hit + 0.6, v));
    LU.uTide.value = tide;
    GU.uTideP.value.set(GZ.x + 300, GZ.z - 5200); GU.uTideR.value = 2300;
    if (tide > 60) {
      for (let k = 0; k < 14; k++) {
        const a2 = k * 2.39996, rr = 300 + 700 * ((k * 0.618) % 1);
        const ph = (v * 0.5 + k * 0.17) % 1;
        smoke.puff(GZ.x + 300 + Math.cos(a2) * rr, tide * (0.85 + 0.25 * ph), GZ.z - 5200 + Math.sin(a2) * rr * 0.6, 260 + 380 * ph, 0.5 * (tide / 1900) * Math.sin(ph * Math.PI), 1.25, 0, (k * 0.31) % 1);
      }
    }
    // the fire blowing out from under it, across the city to you; the ground melting behind it
    const Rf = blow(st, v);
    if (tb > 0) {
      fx.ring.visible = true; fx.ring.position.set(GZ.x, 0, GZ.z);
      fx.ring.scale.set(Rf + 40, zb * 0.45 + 25, Rf + 40);
      for (let k = 0; k < 200; k++) {
        const T = 1.4, ph0 = (k * 0.6180339) % 1, a2 = ((v - st.hit) / T + ph0) % 1;
        const ang2 = (k * 2.39996) % (Math.PI * 2) * 0.12 - 0.06 + Math.atan2(-GZ.x, -GZ.z);
        const rr = Rf + 40 + a2 * Math.min(700, 2440 - Rf);
        const ex = GZ.x + Math.sin(ang2) * rr, ez = GZ.z + Math.cos(ang2) * rr;
        const ey = 8 + (zb * 0.8) * ((k * 0.377) % 1) + 30 * a2;
        const f2 = (1 - a2) * smooth(0, 0.4, v - st.hit);
        glows.add(ex, ey, ez, 6 + 10 * ((k * 0.71) % 1), 2.6 * f2, 0.9 * f2, 0.2 * f2);
      }
      const mr = fx.ring.material.uniforms; mr.uMode.value = 2; mr.uHeat.value = 1.0; mr.uA.value = 1; mr.uLump.value = lerp(2.2, 7, smooth(1600, 2400, Rf)); mr.uTop.value = 1.6;
      LU.uMelt.value = Rf * 1.25 + 400; LU.uScorch.value = Rf + 1500;
      // flames racing ahead of it along the ground
      // (flames above the crust, up to its underside, and rolling along it toward you)
      fx.ring2.visible = true; fx.ring2.position.set(GZ.x, 0, GZ.z);
      fx.ring2.scale.set(Math.max(1, Rf - 20), zb + 90, Math.max(1, Rf - 20));
      const mf = fx.ring2.material.uniforms; mf.uMode.value = 1; mf.uHeat.value = 0.95; mf.uA.value = 0.95; mf.uLump.value = lerp(2.2, 6, smooth(1600, 2400, Rf)); mf.uTop.value = 1.3;
      B.uRoll.value = smooth(0, 0.6, tb); B.uFireR.value = Rf + 250;
    }
    LU.uBoil.value = smooth(st.hit, st.hit + 1, v);
    burnAll = smooth(st.hit - 1.0, st.hit + 0.5, v);
    carsStop = st.hit;
    const R2 = 2 * Rb;
    BLD.forEach((b, k) => {
      // pressed flat from the top: nothing stands taller than its underside
      const under = zb + (b.g * b.g) / R2 - b.y;
      let sink = b.h > under ? clamp(1 - under / b.h) : 0;
      const ta = tBlow(st, b.g);
      if (tb > 0 && v > ta) sink = Math.max(sink, smooth(ta, ta + 0.4, v));
      set(k, st.hit - 0.4, 0, sink, Math.max(burnAll * 0.7, tb > 0 ? smooth(ta - 0.8, ta, v) : 0), 0);
    });
    kickAt(st.hit, 1.0); kickAt(st.hit + 1.2, 0.6); kickAt(st.you, 1.0);
    s.shake = smooth(st.hit - 0.6, st.hit, v) * 0.6 + smooth(st.you - 2, st.you, v) * 0.6;
  }

  // ---------------- the camera ----------------
  const cam = camAt(v, s);
  const sh = (kick * 0.8 + 0.02 + 1.4 * s.shake) * 0.012 * cam.fov / 60;
  cam.pitch += wobble(v * 43, 3) * sh - kick * 0.35 * DEG;
  cam.yaw += wobble(v * 47, 4) * sh;
  cam.roll += wobble(v * 29, 5) * sh * 0.8;
  camera.position.copy(cam.pos);
  camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
  camera.fov = cam.fov * (1 - 0.03 * kick);
  if (params.has('top')) { camera.position.set(0, 4200, -1700); camera.rotation.set(-Math.PI / 2, 0, 0); camera.fov = 70; }
  if (params.has('side')) { camera.position.set(2600, 150, -2400); camera.rotation.set(0, Math.PI / 2, 0); camera.fov = 40; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---------------- the city ----------------
  BLD.forEach((b, k) => {
    const q = BS[k] || [0, 0, 0, 0, 0];
    city.place(k, b, q[1], q[2]);
    city.set(k, q[0], q[3], q[4]);
  });
  city.commit(v);
  city.traffic(v, st.t0, carsStop, toss);

  // ---------------- light ----------------
  const lc = new THREE.Vector3(0, LOW_Y, -10);
  sunL.position.copy(SUN).multiplyScalar(200).add(lc);
  sunL.target.position.copy(lc); sunL.target.updateMatrixWorld();
  sunL.intensity = 2.6 * (1 - sunDim) * (1 - 0.5 * dustSky * 0);
  frL.position.copy(frontDir).multiplyScalar(300).add(lc);
  frL.target.position.copy(lc); frL.target.updateMatrixWorld();
  frL.color.copy(frontCol);
  frL.intensity = Math.min(frontI, 3.0) + flash * 1.0;
  frL.castShadow = frL.intensity > 0.05;
  hemi.intensity = (1.15 * (1 - 0.55 * sunDim) + 0.3 * fireSky) * (1 - 0.55 * darkHaze);
  hemi.color.setRGB(0.66, 0.77, 1.0).lerp(tmpC.setRGB(1.0, 0.45, 0.2), fireSky);
  hemi.groundColor.setRGB(0.55, 0.5, 0.44).lerp(tmpC.setRGB(0.6, 0.25, 0.1), Math.max(fireSky, burnAll * 0.6));
  // the same light for the shader-drawn far things
  LU.uTime.value = v;
  LU.uSunDir.value.copy(SUN);
  LU.uSunC.value.setRGB(1.0, 0.94, 0.86).multiplyScalar(2.6 * (1 - sunDim) / Math.PI * 1.15);
  LU.uSkyC.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI * 1.1);
  LU.uGndC.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity / Math.PI * 0.9);
  LU.uFrontDir.value.copy(frontDir);
  LU.uFrontC.value.copy(frontCol).multiplyScalar(frL.intensity / Math.PI * 0.55);
  const hz = tmpC.setRGB(0.62, 0.72, 0.86).lerp(new THREE.Color(0.55, 0.46, 0.38), dustSky).lerp(new THREE.Color(0.42, 0.14, 0.05), fireSky * 0.8);
  hz.multiplyScalar(1 - 0.5 * sunDim * (1 - fireSky));
  // (behind the mountain-size one's fire the city stands dark against the glow)
  hz.lerp(new THREE.Color(0.06, 0.022, 0.012), darkHaze);
  LU.uHazeC.value.copy(hz);
  LU.uHazeD.value = lerp(26000, 7000, dustSky) * (1 - 0.35 * fireSky) * (1 + 0.6 * darkHaze);
  LU.uSkyHi.value.setRGB(0.07, 0.22, 0.62).lerp(new THREE.Color(0.5, 0.12, 0.03), fireSky).multiplyScalar(1 - 0.6 * sunDim);
  LU.uSkyLo.value.setRGB(0.56, 0.7, 0.88).lerp(new THREE.Color(1.0, 0.4, 0.1), fireSky).multiplyScalar(1 - 0.5 * sunDim);
  renderer.toneMappingExposure = 1.0 - 0.2 * Math.min(1, flash) - 0.15 * fireSky;

  // ---------------- the sky ----------------
  sky.mesh.position.copy(camera.position);
  U.uT.value = v; U.uSun.value.copy(SUN);
  U.uFlash.value = flash; U.uFire.value = fireSky; U.uDust.value = dustSky; U.uDim.value = sunDim * 0.8;
  U.uHazeC.value.copy(hz);

  // ---------------- people, fires, smoke ----------------
  glows.view(camera);
  people.frame(v, s);
  // fires across the city once it burns
  if (burnAll > 0.02) {
    for (let k = 0; k < TOWERS.length; k += 3) {
      const b = TOWERS[k].b; if (b.dist > 4000) continue;
      const f = burnAll;
      glows.add(b.x, b.y + b.h * 0.3, b.z + b.d * 0.5 + 2, 18 + b.h * 0.12, 1.3 * f, 0.45 * f, 0.08 * f);
    }
  }
  smoke.end(); glows.end(); fire.end();
  fire.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uTime.value = v;
  smoke.mat.uniforms.uLight.value.setRGB(1.4, 1.35, 1.3).lerp(tmpC.setRGB(1.8, 0.8, 0.4), fireSky);
  smoke.mat.uniforms.uSun.value.copy(SUN);

  // ---------------- post ----------------
  bloom.strength = 0.22 + 0.2 * kick + 0.15 * Math.min(1, flash);
  finish.uniforms.uTime.value = v;
  finish.uniforms.uAb.value = kick * 0.6 + s.shake * 0.4;
  finish.uniforms.uBlur.value = window.__cover ? 0 : kick * 0.02;
  finish.uniforms.uWhite.value = window.__cover ? 0 : white;
  finish.uniforms.uTitle.value = window.__cover ? 1.1 : s.title;
  finish.uniforms.uCounter.value = window.__cover ? 0 : 1 - smooth(0.5, 1, white);
  finish.uniforms.uCounterY.value = lerp(0.655, 0.727, s.up);
  s.hide = smooth(0.5, 1.0, white);
  overlay(v, s);
  return s;
}

let comp = null;
function renderFrame(t) {
  const tail = t - (VIDEO_DURATION - LOOP);
  if (tail >= 0) update(t - VIDEO_DURATION, WHITE_CLEAR(tail));
  else update(t);
  composer.render();
  if (comp) comp.paint();
}

async function boot() {
  await document.fonts.load('500 40px Cormorant');
  await document.fonts.load('italic 500 40px Cormorant');
  await document.fonts.load('600 40px Cormorant');
  await document.fonts.load('700 40px Cormorant');
  await document.fonts.ready;
  if (!params.has('dom')) {
    const { makeCompositor } = await import('./compose.js');
    comp = await makeCompositor(renderer.domElement, stage);
  }
  for (const t of [44, 36, 28, 20, 12, 6, 2, 0]) renderFrame(t);
  window.renderFrame = renderFrame;
  window.__comp = comp;
  window.__dbg = { scene, camera, renderer, composer, sky, state, update, LU, fx, city, comp: () => comp };
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
