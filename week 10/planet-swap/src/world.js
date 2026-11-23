// The whole scene for one place at one moment: setStop(i, v) poses everything for stop i at video time v (main.js
// draws one stop, or both sides of a wipe, one after the other). Nothing resets at a wipe: each stop starts from where
// the last one left the beach (burnt things, the sea's level, frost, snow, where everyone is).
// Order: Earth (frame 0) -> Mercury -> Mars -> Venus -> Jupiter -> Pluto.
import * as THREE from 'three';
import { makeGround, GU } from './ground.js';
import { makeSea } from './sea.js';
import { makeProps } from './props.js';
import { makeCrowd } from './crowd.js';
import { makeFire } from './fire.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { makeSky } from './sky.js';
import { makeWall } from './walls.js';
import { makeParts } from './parts.js';
import { makeYou } from './you.js';
import { makeSnow } from './snow.js';
import { FX } from './fx.js';
import { H, patchHeat } from './heat.js';
import { PEOPLE, personPose } from './people.js';
import { landY, groundY, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW } from './layout.js';
import { STOPS, LAND, DUR, DRAW, sunWide, raceK } from './timeline.js';
import { MER_FLASH, MER_FIRE, MER_BOIL, MER_PIER, MER_TRUCK, MER_WALL, merHeat,
  MARS_OUT, MARS_FROST, marsFrostF, MARS_ICE, marsIceR, MARS_DUST,
  VEN_THAW, VEN_STEAM, VEN_CLOUD, venCloud, VEN_RAIN,
  JUP_SNOW, JUP_FZ0, JUP_FZDUR, JUP_FZO0, JUP_FZP, jupSeaFront, JUP_CLEAR, jupClear,
  PLU_RAIN, PLU_FROST, PLU_STATUE, PLU_FREEZE, PLU_LENS, PLU_SKY, pluFrost, snowDepth, snowFar } from './sched.js';
import { smooth, clamp, lerp, DEG } from './util.js';

const F = new THREE.Vector3(CAM_FWD.x, 0, CAM_FWD.z), RT = new THREE.Vector3(CAM_RIGHT.x, 0, CAM_RIGHT.z), UP = new THREE.Vector3(0, 1, 0);
const BEAR = CAM0.b * DEG;
// the Sun on screen: low over the sea, a little right of straight ahead (between you and the pier)
export const SUN_AZ = 3.5 * DEG, SUN_EL = 6.6 * DEG;
const dirAt = (az, el) => new THREE.Vector3().addScaledVector(F, Math.cos(az) * Math.cos(el)).addScaledVector(RT, Math.sin(az) * Math.cos(el)).addScaledVector(UP, Math.sin(el)).normalize();
const SUN_VIEW = dirAt(SUN_AZ, SUN_EL);
// the light falls from the same side but higher, so the tops are lit (and a fill from behind the camera keeps the
// people readable against the low Sun: bright sand and sea bouncing it back)
const LIGHT_DIR = dirAt(SUN_AZ - 12 * DEG, 34 * DEG);
const FILL_DIR = new THREE.Vector3().addScaledVector(F, -0.62).addScaledVector(RT, -0.35).addScaledVector(UP, 0.7).normalize();
const SUN_R0 = 0.004653;               // the real Sun's angular radius from Earth (rad)
const hash = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
const wrapTo = (x, a, b) => a + ((((x - a) % (b - a)) + (b - a)) % (b - a));
// the sea's level after Mercury boiled some of it off (m below normal)
const LEV = (tt) => 1.4 * smooth(MER_WALL - 1.5, MER_WALL + 2.5, tt);
const LEV_END = LEV(DUR.mercury);

// ---- how each place looks (and Earth's place, where frame 0 starts) ----
const LOOK = {
  earth: { top: [0.16, 0.33, 0.68], low: [0.58, 0.7, 0.85], haze: [0.86, 0.84, 0.8], hazeK: 0.5, cloud: 0.12, cLit: [1, 0.97, 0.92], cDark: [0.62, 0.66, 0.72],
    disc: [1, 0.88, 0.62], discI: 2.4, aur: 0.25, aurCol: [1, 0.85, 0.6], glare: 0.6,
    lc: [1, 0.9, 0.76], li: 2.2, hSky: [0.62, 0.74, 0.98], hGnd: [0.78, 0.68, 0.52], hI: 1.0, fill: 0.9, fog: [0.78, 0.8, 0.84], fogD: 0.0003, exp: 1.0,
    body: [0.012, 0.06, 0.085], glint: 2.0, night: 0, smoke: [1, 0.97, 0.92] },
  mercury: { top: [0.22, 0.4, 0.72], low: [0.8, 0.84, 0.88], haze: [1, 0.93, 0.82], hazeK: 0.35, cloud: 0, cLit: [1, 1, 1], cDark: [0.9, 0.88, 0.84],
    disc: [1, 0.86, 0.58], discI: 3.8, aur: 0.45, aurCol: [1, 0.86, 0.6], glare: 0.5,
    lc: [1, 0.93, 0.8], li: 6.0, hSky: [0.9, 0.9, 0.86], hGnd: [1, 0.86, 0.68], hI: 1.6, fill: 1.1, fog: [1, 0.94, 0.84], fogD: 0.00018, exp: 0.62,
    body: [0.05, 0.08, 0.08], glint: 3.2, night: 0, smoke: [2.0, 1.95, 1.85] },
  mars: { top: [0.05, 0.16, 0.45], low: [0.42, 0.56, 0.76], haze: [0.62, 0.7, 0.82], hazeK: 0.4, cloud: 0.15, cLit: [0.9, 0.93, 1.0], cDark: [0.5, 0.56, 0.66],
    disc: [1, 0.9, 0.7], discI: 1.9, aur: 0.15, aurCol: [0.9, 0.86, 0.8], glare: 0.5,
    lc: [0.88, 0.92, 1.0], li: 1.2, hSky: [0.45, 0.58, 0.9], hGnd: [0.5, 0.52, 0.58], hI: 0.85, fill: 0.6, fog: [0.6, 0.68, 0.8], fogD: 0.00025, exp: 1.3,
    body: [0.01, 0.04, 0.07], glint: 1.6, night: 0, smoke: [0.95, 1.0, 1.08] },
  venus: { top: [0.24, 0.42, 0.74], low: [0.82, 0.86, 0.9], haze: [0.98, 0.92, 0.82], hazeK: 0.4, cloud: 0.04, cLit: [1, 0.97, 0.9], cDark: [0.85, 0.82, 0.76],
    disc: [1, 0.88, 0.62], discI: 3.0, aur: 0.4, aurCol: [1, 0.86, 0.62], glare: 0.7,
    lc: [1, 0.9, 0.74], li: 3.8, hSky: [0.95, 0.9, 0.8], hGnd: [0.9, 0.78, 0.6], hI: 1.4, fill: 1.0, fog: [0.95, 0.9, 0.8], fogD: 0.00022, exp: 0.78,
    body: [0.03, 0.07, 0.08], glint: 2.6, night: 0, smoke: [1.7, 1.65, 1.55] },
  jupiter: { top: [0.035, 0.06, 0.13], low: [0.18, 0.23, 0.31], haze: [0.27, 0.31, 0.37], hazeK: 0.55, cloud: 0.25, cLit: [0.38, 0.41, 0.47], cDark: [0.15, 0.17, 0.21],
    disc: [1, 0.94, 0.84], discI: 3.2, aur: 0.1, aurCol: [0.9, 0.9, 1], glare: 0.8,
    lc: [0.86, 0.9, 1.0], li: 0.32, hSky: [0.36, 0.44, 0.62], hGnd: [0.42, 0.44, 0.5], hI: 0.42, fill: 0.22, fog: [0.27, 0.3, 0.36], fogD: 0.0009, exp: 2.4,
    body: [0.005, 0.02, 0.04], glint: 1.0, night: 0.05, smoke: [0.5, 0.52, 0.58] },
  pluto: { top: [0.0, 0.0, 0.004], low: [0.015, 0.02, 0.04], haze: [0.02, 0.025, 0.045], hazeK: 0.4, cloud: 0, cLit: [0.1, 0.1, 0.12], cDark: [0.03, 0.03, 0.04],
    disc: [1, 0.97, 0.92], discI: 0.5, aur: 0.01, aurCol: [0.9, 0.9, 1], glare: 0.05,
    lc: [0.85, 0.9, 1.0], li: 0.1, hSky: [0.25, 0.3, 0.45], hGnd: [0.3, 0.32, 0.38], hI: 0.085, fill: 0.13, fog: [0.02, 0.025, 0.04], fogD: 0.0002, exp: 8.5,
    body: [0, 0.01, 0.02], glint: 0.4, night: 1, smoke: [0.14, 0.15, 0.17] },
};
// a look part-way between two places (k: 0 a .. 1 b; arrays lerp per channel, numbers in log for strengths)
const LOGK = new Set(['li', 'hI', 'fill', 'exp', 'discI', 'fogD', 'glint']);
function mixLook(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    if (Array.isArray(x)) o[key] = x.map((xx, j) => lerp(xx, y[j], k));
    else if (LOGK.has(key) && x > 0 && y > 0) o[key] = Math.exp(lerp(Math.log(x), Math.log(y), k));
    else o[key] = lerp(x, y, k);
  }
  return o;
}

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.side || 0}`);
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 900 });
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  scene.add(fill, fill.target);
  const hemi = new THREE.HemisphereLight(0x9cbbe6, 0xb8a080, 1.2);
  scene.add(hemi);
  const sky = makeSky();
  scene.add(sky.mesh);
  const ground = makeGround(scene);
  const sea = makeSea(scene);
  const snow = makeSnow(scene);
  const walls = [makeWall(scene, 2), makeWall(scene, 3)];
  const glows = makeGlows(scene, 600);
  const props = makeProps(scene, { plainMat, shadowy, glowMat });
  const crowd = makeCrowd(scene, PEOPLE.length, patchHeat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'crowd', { burnK: 0.25, people: true }));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const fire = makeFire(scene, 1600);
  fire.mat.uniforms.uOcc.value = 0.7;
  const smoke = makeSmoke(scene, 2200);
  const parts = makeParts(scene, 9000);
  const you = makeYou(scene);
  FX.uFxTop.value = YOU.y + 1.84;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const toW = (f, l, y, out = v4) => out.set(CAM0.x + F.x * f + RT.x * l, y, CAM0.z + F.z * f + RT.z * l);
  const youLocal = (x, y, z, out) => { you.root.updateMatrixWorld(true); return out.set(x, y, z).applyMatrix4(you.root.matrixWorld); };
  // particles in a box in front of the camera: f (forward), l (across, widening with f), y (up from the sand)
  function box(n, seed, tt, fMin, fMax, y0, y1, vf, vl, vy, cb) {
    for (let i = 0; i < n; i++) {
      const a = hash(i, seed), b = hash(i, seed + 1.7), c = hash(i, seed + 3.3), d = hash(i, seed + 5.1);
      const f = fMin + (fMax - fMin) * Math.pow(a, 1.7);
      const hw = 0.5 + f * 0.4;
      const l = wrapTo((b * 2 - 1) * hw + vl * tt * (0.8 + 0.4 * d), -hw, hw);
      const y = wrapTo(y0 + c * (y1 - y0) + vy * tt * (0.85 + 0.3 * d), y0, y1);
      const ff = vf ? wrapTo(f + vf * tt, fMin, fMax) : f;
      const w = toW(ff, l, landY(CAM0.x + F.x * ff) + y, v4);
      cb(w.x, w.y, w.z, i, ff, d);
    }
  }
  // particles spread through the view itself (screen position x depth), so the near ones are all in frame
  const TANV = Math.tan(31 * DEG), TANH = TANV * 1080 / 1920, CAMY = landY(CAM0.x) + CAM0.h, PIT = Math.tan(7 * DEG);
  function frust(n, seed, tt, fMin, fMax, vl, vy, cb) {
    for (let i = 0; i < n; i++) {
      const a = hash(i, seed), b = hash(i, seed + 1.7), c = hash(i, seed + 3.3), d = hash(i, seed + 5.1);
      const f = fMin + (fMax - fMin) * Math.pow(a, 1.5);
      const hw = f * TANH * 1.15, yc = CAMY + PIT * f, hy = f * TANV * 1.15;
      const l = wrapTo((b * 2 - 1) * hw + vl * tt * (0.8 + 0.4 * d), -hw, hw);
      const y = wrapTo(yc + (c * 2 - 1) * hy + vy * tt * (0.85 + 0.3 * d), yc - hy, yc + hy);
      const w = toW(f, l, y, v4);
      cb(w.x, w.y, w.z, i, f, d);
    }
  }
  // a breath: a little cloud puffed out in front of a face every couple of seconds
  function breath(x, y, z, yaw, seed, tt, k) {
    if (k <= 0.01) return;
    const per = 2.2 + 0.6 * seed;
    const ph = ((tt + seed * per) % per) / per;
    if (ph > 0.5) return;
    const u = ph / 0.5;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const d = 0.12 + 0.35 * u;
    smoke.puff(x + fx * d, y + 0.08 * u, z + fz * d, 0.05 + 0.2 * u, 0.32 * k * Math.sin(Math.PI * Math.min(1, u * 1.3)), 0.9, 0, seed);
  }

  // ---- you: what each place does to you (your own frame: x to your left, y up, z ahead; your right side is x < 0;
  // the middle of your body is at x = 0.105) ----
  const HOLD = {
    shade: [[-0.03, 1.69, 0.17], [-0.62, 1.45, 0.02]],          // right hand flat over your eyes
    faceL: [[0.06, 1.71, 0.19], [0.62, 1.5, 0.05]],             // left forearm across your face
    faceR: [[-0.06, 1.62, 0.2], [-0.62, 1.4, 0.02]],
    // cold: arms crossed tight over the chest, each hand tucked under the other arm, elbows forward and in
    coldR: [[0.2, 1.16, 0.11], [0.0, 0.98, 0.6]],
    coldL: [[0.0, 1.2, 0.13], [0.2, 1.0, 0.6]],
    // hands on top of your head (the hot rain)
    headR: [[0.03, 1.86, 0.03], [-0.5, 1.72, 0.12]],
    headL: [[0.18, 1.86, 0.03], [0.72, 1.72, 0.12]],
    downR: [[-0.24, 0.9, 0.06], [-0.4, 1.2, -0.25]],
    downL: [[0.24, 0.9, 0.06], [0.4, 1.2, -0.25]],
  };
  const mixH = (a, b, k) => [a[0].map((x, j) => lerp(x, b[0][j], k)), a[1].map((x, j) => lerp(x, b[1][j], k))];
  // the cold: crossed arms, hunched, knees bent, shaking and stamping (k 0..1 how cold)
  function cold(q, tt, k, hunch = 0.26) {
    q.R = mixH(q.R || HOLD.downR, HOLD.coldR, k); q.L = mixH(q.L || HOLD.downL, HOLD.coldL, k); q.curlR = 0.85; q.curlL = 0.85;
    q.hunch = Math.max(q.hunch, hunch * k); q.sink = Math.max(q.sink, 0.08 * k);
    q.head = [lerp(q.head[0], 0.28, k), q.head[1]];
    q.roll = 0.03 * Math.sin(tt * 37) * k + 0.012 * Math.sin(tt * 53);
    q.twist = 0.025 * Math.sin(tt * 29) * k;
    const st = Math.sin(tt * 2 * Math.PI * 1.5);
    q.lift = [0.09 * Math.max(0, st) * k, 0.09 * Math.max(0, -st) * k];
    q.breath = k;
  }
  // the pose numbers for one place at tt (no world positions yet); hands as [target, pole] in your frame
  function youQ(key, tt) {
    const q = { head: [-0.2, 0.05], hunch: 0, sink: 0, lean: 0, roll: 0, twist: 0, reach: 0, R: HOLD.downR, L: HOLD.downL, curlR: 0.4, curlL: 0.4, frost: 0, breath: 0, lift: [0, 0] };
    if (key === 'earth') {
      q.head = [-0.22, 0.05];
    } else if (key === 'mercury') {
      // a hand up to the swelling Sun; the blast: both arms over your face, head down and away; down into a crouch
      const sh = smooth(-0.4, 0.05, tt);
      q.R = mixH(HOLD.downR, HOLD.shade, sh); q.curlR = 0.1;
      const h = smooth(MER_FLASH, MER_FLASH + 0.35, tt);
      q.L = mixH(HOLD.downL, HOLD.faceL, h); q.curlL = 0.5;
      q.R = mixH(q.R, HOLD.faceR, h);
      q.head = [lerp(-0.15, 0.5, h), lerp(0.05, -0.55, h)];
      q.hunch = 0.28 * h; q.lean = -0.04 * h; q.twist = 0.22 * h;
      const c = smooth(1.8, 2.6, tt);
      q.sink = 0.3 * c; q.hunch += 0.25 * c;
      // the pier going up: you look round at it (to your right), then back down
      const pk = smooth(MER_PIER + 0.2, MER_PIER + 0.6, tt) * (1 - smooth(MER_PIER + 2.4, MER_PIER + 3.0, tt));
      q.head = [lerp(q.head[0], 0.15, pk), lerp(q.head[1], -0.85, pk)];
    } else if (key === 'mars') {
      cold(q, tt, smooth(0.25, 0.85, tt));
      q.head[1] = -0.05 + 0.25 * smooth(MARS_ICE + 0.2, MARS_ICE + 1.0, tt);         // (looking at the sea skinning over)
      q.frost = 0.12 * smooth(MARS_FROST + 1.2, MARS_FROST + 2.2, tt);
    } else if (key === 'venus') {
      // warm again: you uncurl, look up at the swelling Sun, shade your eyes; up at the cloud closing over; then the
      // hot rain: hands on your head
      const up = smooth(0.4, 1.2, tt);
      q.head = [lerp(0.1, -0.3, up), 0.05];
      const sh = smooth(1.4, 1.9, tt) * (1 - smooth(VEN_CLOUD + 0.6, VEN_CLOUD + 1.2, tt));
      q.R = mixH(HOLD.downR, HOLD.shade, sh); q.curlR = 0.15;
      const cl = smooth(VEN_CLOUD + 0.6, VEN_CLOUD + 1.4, tt);
      q.head = [lerp(q.head[0], -0.55, cl), lerp(0.05, -0.2, cl)];
      const rn = smooth(VEN_RAIN + 0.1, VEN_RAIN + 0.5, tt);
      q.R = mixH(q.R, HOLD.headR, rn); q.L = mixH(HOLD.downL, HOLD.headL, rn); q.curlR = 0.5; q.curlL = 0.5;
      q.head = [lerp(q.head[0], 0.3, rn), q.head[1]]; q.hunch = 0.2 * rn;
    } else if (key === 'jupiter') {
      cold(q, tt, smooth(0.2, 0.9, tt), 0.32);
      q.head[0] = lerp(q.head[0], -0.4, smooth(JUP_CLEAR + 0.6, JUP_CLEAR + 1.4, tt) * (1 - smooth(JUP_CLEAR + 3.0, JUP_CLEAR + 3.8, tt)));
      q.frost = 0.1 + 0.16 * smooth(1.0, 7.0, tt);
    } else if (key === 'pluto') {
      // you look up at the black sky; your right hand goes out to catch the falling air; the frost grows over you from
      // your hair down; then you freeze like that
      const tz = PLU_STATUE + 1.3;
      const t = Math.min(tt, tz);
      cold(q, t, 1, 0.22);
      const up = smooth(0.2, 1.0, t);
      q.head = [lerp(0.28, -0.6, up), 0.1];
      const rh = smooth(PLU_RAIN + 0.4, PLU_RAIN + 1.2, t);
      q.reach = rh; q.R = rh > 0.5 ? null : q.R;
      q.frost = 0.27 + 0.73 * smooth(PLU_FROST - 0.6, PLU_FROST + 3.2, tt);
      q.breath = 1 - smooth(tz - 0.3, tz, tt);
      if (tt >= tz) { q.lift = [0, 0]; }
    }
    return q;
  }
  const KEYS = STOPS.map((s) => s.key);
  const endQ = new Map();
  function placeYou(key, tt) {
    you.root.position.set(YOU.x, YOU.y, YOU.z);
    you.root.rotation.set(0, FACE_YAW, 0);
    you.root.scale.setScalar(1);
    you.root.updateMatrixWorld(true);
    let q = youQ(key, tt);
    // carried over from the last place: ease out of how it left you
    const i = KEYS.indexOf(key);
    if (i > 0) {
      const pk = KEYS[i - 1];
      if (!endQ.has(pk)) endQ.set(pk, youQ(pk, DUR[pk]));
      const P = endQ.get(pk), k = smooth(0.0, 0.7, tt);
      for (const f of ['hunch', 'sink', 'lean', 'twist', 'frost']) q[f] = lerp(P[f], q[f], k);
      q.head = [lerp(P.head[0], q.head[0], k), lerp(P.head[1], q.head[1], k)];
      const mh = (a, b) => (a && b ? [a[0].map((x, j) => lerp(x, b[0][j], k)), a[1].map((x, j) => lerp(x, b[1][j], k))] : b);
      q.R = mh(P.R, q.R); q.L = mh(P.L, q.L);
    }
    const W = (h) => [youLocal(h[0][0], h[0][1] - 0.95 * q.sink, h[0][2], new THREE.Vector3()), youLocal(h[1][0], h[1][1] - 0.95 * q.sink, h[1][2], new THREE.Vector3())];   // (crouching takes the hands down too)
    const pq = { head: q.head, hunch: q.hunch, sink: q.sink, lean: q.lean, roll: q.roll, twist: q.twist, curlR: q.curlR, curlL: q.curlL, lift: q.lift };
    if (q.R) { const [t, pole] = W(q.R); pq.holdR = t; pq.poleR = pole; }
    if (q.L) { const [t, pole] = W(q.L); pq.holdL = t; pq.poleL = pole; }
    if (q.reach > 0) { pq.reach = q.reach; pq.reachDir = new THREE.Vector3(-0.12, 0.35, 1).normalize(); pq.curl = 0.2; }
    you.pose(pq);
    you.root.updateMatrixWorld(true);
    FX.uFrost.value = q.frost; FX.uDust.value = 0; FX.uScorch.value = 0; FX.uHeat.value = 0; FX.uBurn.value = 0;
    // your breath
    if (q.breath > 0) { const hp = youLocal(0.1, 1.62, 0.12, v2); breath(hp.x, hp.y, hp.z, FACE_YAW + 0.2, 0.37, tt, q.breath); }
  }

  return {
    sun, fill, hemi, sky, sea, snow, walls, crowd, props, you, parts, smoke, fire, glows,
    setStop(i, v, camera) {
      const st = STOPS[i], key = st.key, tt = v - st.land;
      const k = raceK(i, tt);
      const L = mixLook(LOOK[i === 0 ? 'earth' : STOPS[i - 1].key], LOOK[key], k);
      const out = { exp: L.exp, shimmer: 0, veil: [1, 1, 1, 0], shake: 0, jolt: 0, streak: 0, lensIce: 0, bury: 0 };
      fire.begin(); smoke.begin(); glows.begin(); parts.begin();
      parts.mat.uniforms.uT.value = v;
      // ---- reset the shared surface weather ----
      H.uFrost.value = 0; H.uDust.value = 0; H.uWetK.value = 0; H.uCharK.value = 1; H.uPplFrost.value = 0;
      H.uTK.value = 300; H.uAmbK.value = 300; H.uTKP.value = 300; H.uAmbKP.value = 300; H.uGlowGain.value = 0;
      H.uSunW.value.copy(LIGHT_DIR);
      H.uFrostF.value = -1e5; H.uFrostAll.value = 0; H.uCamXZ.value.set(camera.position.x, camera.position.z); H.uFwdXZ.value.set(F.x, F.z);
      GU.uTime.value = v; GU.uStream.value = 0; GU.uScorchG.value = 0; GU.uWindD.value.set(RT.x, RT.z); GU.uRime.value = 0.85;
      // what Mercury did stays done: charred tops, bleached sand
      if (i > 1) { H.uTKP.value = 640; H.uAmbKP.value = 420; GU.uScorchG.value = 0.5; }
      // ---- the sky and the Sun ----
      const s = sky.u;
      s.uTop.value.setRGB(...L.top); s.uLow.value.setRGB(...L.low); s.uHaze.value.setRGB(...L.haze); s.uHazeK.value = L.hazeK;
      const R = SUN_R0 * DRAW * sunWide(i, tt);
      s.uSunD.value.copy(SUN_VIEW); s.uSunR.value = R; s.uSunCol.value.setRGB(...L.disc); s.uSunI.value = L.discI;
      s.uAur.value = L.aur; s.uAurCol.value.setRGB(...L.aurCol); s.uGlare.value = L.glare;
      s.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / 1920;
      s.uPoint.value = smooth(0.0026, 0.0012, R);
      s.uCloud.value = L.cloud; s.uCloudLit.value.setRGB(...L.cLit); s.uCloudDark.value.setRGB(...L.cDark);
      s.uStreak.value = 0.3; s.uCloudScale.value = 1; s.uWindD.value.set(RT.x, RT.z);
      s.uDrift.value.set(-RT.x * 8 * v, -RT.z * 8 * v);
      s.uNight.value = L.night; s.uT.value = v;
      s.uDeck.value = 0; s.uDeckSun.value = 0;
      // ---- light ----
      sun.color.setRGB(...L.lc); sun.intensity = L.li;
      fill.color.setRGB(...L.lc).lerp(new THREE.Color(...L.hSky), 0.3); fill.intensity = L.fill;
      hemi.color.setRGB(...L.hSky); hemi.groundColor.setRGB(...L.hGnd); hemi.intensity = L.hI;
      const look = toW(30, 0, 0, v1);
      sun.target.position.copy(look); sun.position.copy(look).addScaledVector(LIGHT_DIR, 400);
      fill.target.position.copy(look); fill.position.copy(look).addScaledVector(FILL_DIR, 400);
      scene.fog.color.setRGB(...L.fog); scene.fog.density = L.fogD;
      // ---- the sea ----
      const su = sea.u;
      su.uTime.value = v; su.uWaveT.value = v; su.uFrozenT.value = v; su.uChop.value = 0.3; su.uFreeze.value = 0; su.uFreezeR.value = 0;
      su.uSun.value.copy(SUN_VIEW); su.uSunI.value = L.glint; su.uSunCol.value.setRGB(...L.disc);
      su.uSkyHi.value.setRGB(...L.top).lerp(new THREE.Color(...L.low), 0.35); su.uSkyLo.value.setRGB(...L.haze);
      su.uDirC.value.setRGB(...L.lc).multiplyScalar(L.li); su.uAmbC.value.setRGB(...L.hSky).multiplyScalar(L.hI);
      su.uBody.value.setRGB(...L.body); su.uHazeC.value.setRGB(...L.fog); su.uHazeD.value = L.fogD * 0.8;
      su.uBoil.value = 0; su.uTear.value = 0; su.uWindD.value.set(RT.x, RT.z); su.uFlash.value = 0; su.uLevel.value = i > 1 ? LEV_END : 0; su.uFzIn.value = 0;
      su.uPx.value = s.uPx.value;
      // ---- snow, walls off by default ----
      snow.mesh.visible = false; snow.u.uDepth.value = 0; snow.u.uFar.value = 0; snow.u.uLiquid.value = 0; snow.u.uSpark.value = 0.9 / L.exp; snow.u.uT.value = v; snow.u.uTint.value.setRGB(1, 1, 1);
      for (const w of walls) { w.u.uAlpha.value = 0; w.mesh.visible = false; w.u.uC.value.copy(camera.position).setY(0); w.u.uB0.value = BEAR; w.u.uT.value = tt; w.u.uLean.value = 0; w.u.uScale.value = 1; w.u.uSweep.value = 9; w.u.uY0.value = 0; }
      smoke.mat.uniforms.uLight.value.setRGB(...L.smoke);
      smoke.mat.uniforms.uSun.value.copy(LIGHT_DIR);
      let lit = 0.3;
      let breathK = 0;
      placeYou(key, tt);

      // ====================================================================================== the places
      // a wall of steam off the bay, and steam rising off the shallows
      const steamWall = (wk, h, r, alpha, lev, wi = 1) => {
        const w1 = walls[wi];
        w1.mesh.visible = true;
        w1.u.uKind.value = 1; w1.u.uR.value = r; w1.u.uSpan.value = 1.55; w1.u.uH.value = h; w1.u.uTop.value = 1; w1.u.uAlpha.value = alpha;
        w1.u.uLit.value.setRGB(1.3, 1.26, 1.16); w1.u.uDark.value.setRGB(0.62, 0.6, 0.57); w1.u.uHazeC.value.setRGB(...L.fog); w1.u.uHazeK.value = 0.1; w1.u.uY0.value = -3 - lev;
        w1.u.uScale.value = 1.3; w1.u.uT.value = tt * 2.2 * wk;
      };
      const shallowSteam = (k, n, lev, rise, hmul = 1) => {
        for (let j = 0; j < n; j++) {
          const a = hash(j, 9.1), b = hash(j, 9.7);
          const ph = (tt * (0.35 + 0.2 * b) * rise + a) % 1;
          const p = toW(26 + 70 * Math.pow(b, 1.3) + lev * 10 * b, (a * 2 - 1) * (12 + 30 * b), 0);
          smoke.puff(p.x, Math.max(groundY(p.x), -lev) + 0.5 + ph * (5 + 7 * b) * hmul, p.z, (1.2 + ph * 4) * Math.sqrt(hmul), 0.26 * k * Math.sin(Math.PI * ph), 1.6, 0, a);
        }
      };
      // the sea boiling: domes of white water bursting up off the surface, near the shore and out across the bay
      const boilBursts = (k, n, lev) => {
        if (k <= 0.01) return;
        for (let j = 0; j < n; j++) {
          const a = hash(j, 5.3), b = hash(j, 5.9), c = hash(j, 6.7);
          const f = 25.5 + 160 * Math.pow(a, 1.6), hw = f * TANH * 1.2;
          const per = 0.45 + 0.5 * c, ph = ((tt + c * 7) % per) / per;
          const p = toW(f, (b * 2 - 1) * hw, 0);
          if (p.x > -0.5) continue;
          const sz = (0.18 + 0.02 * f) * (0.6 + 0.8 * ph);
          parts.add(p.x, -lev + sz * 0.3 + 0.25 * ph * (1 + f * 0.01), p.z, sz, 0, 1.2, 0, 0, 1.0, 1.0, 0.98, 0.75 * k * Math.sin(Math.PI * ph), a);
        }
      };
      // rain: streaks through the view and out over the beach
      const rain = (k, col, near = 900, far = 1400, vy = -9) => {
        if (k <= 0.01) return;
        frust(near, 4.17, tt, 1.4, 14, 0.4, vy, (x, y, z, j, f, d) => parts.add(x, y, z, 0.008 + 0.004 * d + f * 0.0006, 0.6, vy * 1.8, 0, 1, col[0], col[1], col[2], 0.6 * k, d));
        box(far, 4.93, tt, 14, 120, 0, 30, 0, 0.4, vy, (x, y, z, j, f, d) => parts.add(x, y, z, 0.015 + 0.0018 * f, 0.6, vy * 1.8, 0, 1, col[0], col[1], col[2], 0.4 * k, d));
      };

      if (key === 'earth') {
        lit = 0.25;
      } else if (key === 'mercury') {
        const hk = merHeat(tt);
        H.uTK.value = lerp(300, 640, hk); H.uAmbK.value = lerp(300, 420, hk); H.uTKP.value = H.uTK.value; H.uAmbKP.value = H.uAmbK.value;
        GU.uScorchG.value = 0.5 * smooth(0.3, 4.0, tt);
        out.shimmer = 2.2 * smooth(0.0, 1.0, tt);
        // the blast of white-hot light as the Sun balloons
        out.exp *= 1 + 0.9 * Math.exp(-Math.max(0, tt - MER_FLASH) / 0.35) * smooth(-0.05, MER_FLASH, tt);
        // the sea boils: white water bursting all over, steam off the shallows; later it throws up steam and its level
        // falls (it is boiling away)
        const bk = smooth(MER_BOIL, MER_BOIL + 0.9, tt);
        const lev = LEV(tt);
        su.uBoil.value = 0.8 * bk; su.uLevel.value = lev; su.uChop.value = 0.3 + 0.2 * bk;
        boilBursts(bk, 520, lev);
        shallowSteam(0.55 * bk, 110, lev, 1.6);
        const wk = smooth(MER_WALL - 0.3, MER_WALL + 1.6, tt);
        if (wk > 0) steamWall(1.5, 6 + 12 * Math.pow(wk, 0.8), 300, 0.55 * wk, lev);
        out.jolt = 0.7 * Math.exp(-Math.abs(tt - MER_FLASH) / 0.15) + 0.35 * Math.exp(-Math.abs(tt - MER_PIER) / 0.18) * smooth(MER_PIER - 0.2, MER_PIER, tt)
          + 0.45 * Math.exp(-Math.abs(tt - MER_TRUCK) / 0.18) * smooth(MER_TRUCK - 0.2, MER_TRUCK, tt);
        out.shake = 0.12 + 0.15 * bk + 0.1 * wk;
        // embers and ash over the beach once things burn
        box(380, 4.4, tt, 2, 60, 0, 12, 0, 1.5, 1.6, (x, y, z, j, f, d) => parts.add(x, y, z, 0.03, 0.5, 1.6, 0, 3, 2.6, 0.9, 0.25, 0.5 * smooth(MER_FIRE, MER_FIRE + 1.5, tt) * Math.max(0, Math.sin(tt * 5 + d * 30)), d));
        lit = 0.2;
      } else if (key === 'mars') {
        H.uTK.value = 210; H.uAmbK.value = 210;
        // the boiling stops dead; the steam freezes out of the air in a breath
        const gone = 1 - smooth(0.0, 0.9, tt);
        su.uBoil.value = 0.8 * gone;
        if (gone > 0.01) { boilBursts(gone, 300, LEV_END); shallowSteam(0.55 * gone, 90, LEV_END, 0.6); steamWall(1, 18, 300, 0.55 * gone, LEV_END); }
        // the frost front up the beach to you; everything it passes goes white (people too, only lightly)
        const fF = marsFrostF(tt);
        H.uFrost.value = smooth(MARS_FROST - 0.05, MARS_FROST + 0.15, tt); H.uFrostF.value = fF; H.uFrostAll.value = 0.12; GU.uRime.value = 0.7;
        // halfway: the sea skins over with ice out from the shore
        su.uFreeze.value = 1; su.uFreezeR.value = marsIceR(tt); su.uFrozenT.value = LAND.mars + MARS_ICE + 0.25; su.uChop.value = 0.2;
        const fz = tt - MARS_FROST;
        if (fz > 0 && fF > -6) for (let j = 0; j < 70; j++) {
          const a = hash(j, 2.6), ph = (tt * 2.2 + hash(j, 2.9)) % 1;
          const f = Math.max(fF + 0.5, 3.8), hw = f * TANH * 1.25;
          const p = toW(f + ph * 1.5, (a * 2 - 1) * hw, 0);
          parts.add(p.x, landY(p.x) + 0.1 + ph * 0.6, p.z, 0.25 + 0.5 * ph + f * 0.02, 0, 0.3, 0, 0, 0.85, 0.9, 0.98, 0.32 * Math.sin(Math.PI * ph) * smooth(4, 10, f), a);
        }
        if (fz > 0) box(320, 8.8, 0, 1, 18, 0.02, 0.06, 0, 0, 0, (x, y, z, j, f, d) => {
          if (f < fF) return;
          const tw = Math.max(0, Math.sin(tt * 3 + d * 40));
          parts.add(x, landY(x) + 0.03, z, 0.014, 0, 0, 0, 3, 1.6, 1.8, 2.1, tw * tw * 0.7, d);
        });
        // the ice racing out across the bay: a line of white mist along its edge
        const iR = marsIceR(tt);
        if (iR > 2 && iR < 2100) for (let j = 0; j < 80; j++) {
          const a = hash(j, 7.3), ph = (tt * 1.6 + hash(j, 7.9)) % 1;
          const f = CAM0.x / 0.978 + iR, hw = f * TANH * 1.3;
          const p = toW(f, (a * 2 - 1) * hw, 0);
          const sz = 0.4 + f * 0.03;
          parts.add(p.x, -LEV_END + sz * (0.2 + ph), p.z, sz * (1 + ph), 0, 0.4, 0, 0, 0.85, 0.9, 0.98, 0.35 * Math.sin(Math.PI * ph) * smooth(2000, 400, iR), a);
        }
        // diamond dust: ice crystals drifting down, glittering in the low Sun
        const dd = smooth(MARS_DUST - 0.6, MARS_DUST + 0.8, tt);
        if (dd > 0) frust(800, 6.3, tt, 1.5, 30, 0.15, -0.35, (x, y, z, j, f, d) => {
          const tw = Math.max(0, Math.sin(tt * (4 + 5 * d) + d * 60));
          parts.add(x, y, z, 0.006 + 0.0012 * f, 0, -0.35, 0, 3, 1.9, 2.0, 2.3, dd * (0.15 + 0.85 * tw * tw * tw), d);
        });
        breathK = smooth(0.6, 1.4, tt);
        out.jolt = 0.35 * Math.exp(-Math.abs(tt - (MARS_FROST + 1.2)) / 0.15) + 0.25 * Math.exp(-Math.abs(tt - MARS_ICE) / 0.15);
        out.shake = 0.05;
        lit = 0.4;
      } else if (key === 'venus') {
        const hk = smooth(0.2, 2.2, tt);
        H.uTK.value = lerp(210, 380, hk); H.uAmbK.value = lerp(210, 330, hk);
        out.shimmer = 1.2 * smooth(0.8, 2.4, tt);
        // the frost and the sea ice melt away
        const th = 1 - smooth(VEN_THAW, VEN_THAW + 1.4, tt);
        H.uFrost.value = th; H.uFrostAll.value = 0.12; GU.uRime.value = 0.7;
        su.uFreeze.value = 1 - smooth(VEN_THAW + 0.2, VEN_THAW + 2.0, tt); su.uFreezeR.value = marsIceR(DUR.mars); su.uFrozenT.value = LAND.mars + MARS_ICE + 0.25;
        // the sea steams harder and harder: off the shallows, then towers of steam off the whole bay, up into a cloud
        // that closes over the sky from the horizon (the Sun a bright smear through it)
        const sk = smooth(0.8, 2.4, tt);
        const wk = smooth(VEN_STEAM, VEN_STEAM + 2.4, tt);
        const cl = venCloud(tt);
        su.uBoil.value = 0.25 * sk + 0.3 * wk; su.uChop.value = 0.35;
        shallowSteam(0.42 * sk, 90, LEV_END, 1.2, 1 + 0.6 * wk);
        // towers of steam rising off the bay into the cloud: billowing white columns
        if (wk > 0) for (let c = 0; c < 11; c++) {
          const a = hash(c, 11.3), b = hash(c, 11.9);
          const f = 70 + 330 * Math.pow(a, 0.8), l = (b * 2 - 1) * f * TANH * 1.15;
          const H2 = (28 + 48 * hash(c, 12.7)) * smooth(0, 1, wk * 1.4 - 0.4 * hash(c, 13.1));
          if (H2 < 2) continue;
          const base = toW(f, l, 0, v1);
          const bx = base.x, bz = base.z;
          for (let j = 0; j < 14; j++) {
            const ph = (tt * 0.1 + j / 14 + a) % 1;
            const r = (2.2 + 0.016 * f) * (0.8 + 2.0 * ph);
            smoke.puff(bx + RT.x * ph * H2 * 0.15, -LEV_END + ph * H2 + r * 0.3, bz + RT.z * ph * H2 * 0.15, r, 0.7 * Math.sin(Math.PI * Math.min(1, ph * 1.15 + 0.08)), 1.25, 0, a + j * 0.07);
          }
        }
        s.uDeck.value = cl; s.uDeckLit.value.setRGB(0.98, 0.93, 0.84); s.uDeckDark.value.setRGB(0.28, 0.27, 0.29); s.uDeckSun.value = 0.7;
        smoke.mat.uniforms.uLight.value.setRGB(1.75, 1.7, 1.6);
        // under the cloud the light goes soft and warm; keep the exposure up so it stays bright
        sun.intensity *= 1 - 0.72 * cl; hemi.intensity *= 1 + 0.5 * cl; fill.intensity *= 1 + 0.3 * cl;
        out.exp *= 1 + 0.45 * cl;
        su.uSunI.value *= 1 - 0.8 * cl;
        // then the hot rain
        const rk = smooth(VEN_RAIN - 0.2, VEN_RAIN + 0.5, tt);
        rain(rk, [0.3, 0.32, 0.36], 1400, 1800);
        if (rk > 0) box(260, 2.2, 0, 2, 30, 0, 0.05, 0, 0, 0, (x, y, z, j, f, d) => {
          const per = 0.35 + 0.3 * d, ph = ((tt + d * 5) % per) / per;
          parts.add(x, landY(x) + 0.03 + 0.12 * ph, z, 0.04 + 0.004 * f, 0, 0.8, 0, 0, 0.95, 0.95, 0.95, 0.5 * rk * Math.sin(Math.PI * ph), d);
        });
        H.uWetK.value = 0.6 * rk;
        out.jolt = 0.3 * Math.exp(-Math.abs(tt - (VEN_STEAM + 0.3)) / 0.2) * smooth(VEN_STEAM, VEN_STEAM + 0.3, tt) + 0.25 * Math.exp(-Math.abs(tt - VEN_RAIN) / 0.2) * smooth(VEN_RAIN - 0.2, VEN_RAIN, tt);
        out.shake = 0.06 + 0.12 * wk;
        lit = 0.25 + 0.35 * cl;
      } else if (key === 'jupiter') {
        H.uTK.value = 140; H.uAmbK.value = 140;
        // the cloud from Venus goes dark and snows itself out, then breaks open on a dot of a Sun
        const clr = jupClear(tt);
        s.uDeck.value = 1 - 0.88 * clr; s.uDeckLit.value.setRGB(0.15, 0.16, 0.19); s.uDeckDark.value.setRGB(0.05, 0.055, 0.065); s.uDeckSun.value = 0.12;
        sun.intensity *= 0.3 + 0.7 * clr; hemi.intensity *= 1.25 - 0.25 * clr;
        out.exp *= 1.25 - 0.25 * clr;
        // the steam towers freeze out at once
        const gone = 1 - smooth(0.0, 1.0, tt);
        if (gone > 0.01) shallowSteam(gone * 0.4, 80, LEV_END, 0.5);
        // the freeze front from the horizon: every wave frozen where it stood
        su.uBoil.value = 0.55 * (1 - smooth(0.0, 0.6, tt)); su.uChop.value = 0.25;
        su.uFzIn.value = 1; su.uFzT0.value = LAND.jupiter + JUP_FZ0; su.uFzDur.value = JUP_FZDUR; su.uFzO0.value = JUP_FZO0; su.uFzP.value = JUP_FZP;
        const oF = jupSeaFront(tt);
        if (tt > JUP_FZ0 && oF > 1) for (let j = 0; j < 90; j++) {
          const a = hash(j, 1.3), ph = (tt * 1.8 + hash(j, 1.9)) % 1;
          const f = CAM0.x + oF * 0.98 + ph * 3, hw = f * TANH * 1.3;
          const p = toW(f, (a * 2 - 1) * hw, 0);
          const sz = 0.5 + f * 0.035;
          parts.add(p.x, -LEV_END + sz * (0.3 + 1.6 * ph), p.z, sz * (1 + 1.5 * ph), 0, 0.5, 0, 0, 0.75, 0.8, 0.88, 0.4 * Math.sin(Math.PI * ph) * smooth(1800, 300, oF), a);
        }
        // Venus' hot rain turns to snow, thick until the cloud breaks, then lighter; it piles up
        const rk = 1 - smooth(0.0, JUP_SNOW + 0.3, tt);
        rain(rk, [0.85, 0.88, 0.92], 600, 900);
        const sn = smooth(JUP_SNOW - 0.1, JUP_SNOW + 0.6, tt) * (1 - 0.55 * clr);
        H.uFrost.value = 0.25 + 0.75 * smooth(1.0, 5.0, tt); H.uFrostAll.value = 0.3; GU.uRime.value = 0.9;
        H.uPplFrost.value = 0.14 * smooth(1.5, 6.0, tt);
        const dep = snowDepth('jupiter', tt);
        if (dep > 0.002) { snow.mesh.visible = true; snow.u.uDepth.value = dep; snow.u.uFar.value = dep; snow.u.uTint.value.setRGB(0.95, 0.97, 1.0); }
        if (sn > 0) {
          frust(1000, 2.7, tt, 1.6, 14, 0.35, -1.3, (x, y, z, j, f, d) => parts.add(x, y, z, 0.006 + 0.004 * d + f * 0.0006, 0.35, -1.3, 0, 0, 0.92, 0.94, 0.98, 0.65 * sn, d));
          box(1600, 3.9, tt, 14, 90, 0, 26, 0, 0.4, -1.3, (x, y, z, j, f, d) => parts.add(x, y, z, 0.02 + 0.0015 * f, 0.4, -1.3, 0, 0, 0.9, 0.92, 0.96, 0.45 * sn, d));
          scene.fog.density = L.fogD + 0.0012 * sn;
        }
        breathK = smooth(0.4, 1.2, tt);
        out.jolt = 0.3 * Math.exp(-Math.abs(tt - (JUP_FZ0 + JUP_FZDUR)) / 0.15);
        out.shake = 0.04;
        lit = 1.0;
      } else if (key === 'pluto') {
        H.uTK.value = 60; H.uAmbK.value = 60;
        su.uChop.value = 0.25;
        su.uFzIn.value = 1; su.uFzT0.value = LAND.jupiter + JUP_FZ0; su.uFzDur.value = JUP_FZDUR; su.uFzO0.value = JUP_FZO0; su.uFzP.value = JUP_FZP;
        // the sky goes black as the air rains out of it; stars come out round the point of a Sun
        const dk = PLU_SKY(tt);
        const J = LOOK.jupiter;
        s.uTop.value.setRGB(...J.top).lerp(new THREE.Color(...LOOK.pluto.top), dk); s.uLow.value.setRGB(...J.low).lerp(new THREE.Color(...LOOK.pluto.low), dk);
        s.uHaze.value.setRGB(...J.haze).lerp(new THREE.Color(...LOOK.pluto.haze), dk); s.uNight.value = dk; s.uCloud.value = J.cloud * (1 - dk);
        s.uDeck.value = 0.12 * (1 - dk); s.uDeckLit.value.setRGB(0.32, 0.34, 0.4); s.uDeckDark.value.setRGB(0.14, 0.15, 0.18);
        su.uSkyHi.value.copy(s.uTop.value); su.uSkyLo.value.copy(s.uHaze.value);
        // rime on everything; on people it grows from their heads down over a few seconds
        H.uFrost.value = 1; H.uFrostAll.value = 0.6; GU.uRime.value = 1;
        H.uPplFrost.value = 0.14 + 0.86 * pluFrost(tt);
        // the air comes down: first as liquid (pale blue drops, pooling glossy on the snow), then as snow, piling up
        const rk = smooth(PLU_RAIN, PLU_RAIN + 0.8, tt) * (1 - smooth(PLU_FREEZE - 0.2, PLU_FREEZE + 0.8, tt));
        if (rk > 0) {
          frust(520, 7.1, tt, 1.4, 12, 0.1, -4.5, (x, y, z, j, f, d) => parts.add(x, y, z, 0.006 + 0.003 * d + f * 0.0005, 0, -4.5 * 1.6, 0, 2, 0.55, 0.72, 0.95, 0.85 * rk, d));
          box(800, 7.9, tt, 12, 70, 0.2, 18, 0, 0.1, -4.5, (x, y, z, j, f, d) => parts.add(x, y, z, 0.012 + 0.002 * f, 0, -4.5 * 1.6, 0, 1, 0.6, 0.75, 0.95, 0.6 * rk, d));
        }
        snow.mesh.visible = true;
        const dep = snowDepth('pluto', tt);
        snow.u.uDepth.value = dep; snow.u.uFar.value = snowFar('pluto', tt); snow.u.uTint.value.setRGB(0.93, 0.96, 1.0);
        snow.u.uLiquid.value = smooth(PLU_RAIN + 0.8, PLU_RAIN + 2.4, tt) * (1 - smooth(PLU_FREEZE, PLU_FREEZE + 1.4, tt));
        const sn = smooth(PLU_FREEZE - 0.2, PLU_FREEZE + 0.8, tt);
        if (sn > 0) {
          frust(1400, 2.71, tt, 1.5, 14, 0.15, -2.0, (x, y, z, j, f, d) => parts.add(x, y, z, 0.005 + 0.003 * d + f * 0.0005, 0.15, -2.0, 0, 0, 0.95, 0.97, 1.0, 0.55 * sn, d));
          box(2000, 3.91, tt, 14, 120, 0, 30, 0, 0.15, -2.0, (x, y, z, j, f, d) => parts.add(x, y, z, 0.02 + 0.0015 * f, 0.15, -2.0, 0, 0, 0.92, 0.95, 1.0, 0.45 * sn, d));
        }
        breathK = 1 - smooth(PLU_STATUE, PLU_STATUE + 1.6, tt);
        // the end: frost creeps over the lens from the edges, and the frozen air piles up over it
        out.lensIce = 0.6 * smooth(PLU_LENS, PLU_LENS + 1.4, tt);
        out.bury = smooth(1.8, 2.08, dep);
        out.shake = 0.03;
        out.jolt = 0.25 * Math.exp(-Math.abs(tt - PLU_FREEZE) / 0.15);
        lit = 0.8 * (1 - smooth(PLU_STATUE, PLU_STATUE + 3, tt) * 0.5);
      }

      // ---- surfaces, props, people, you ----
      props.frame(key, tt, { fire, smoke, parts, glows, cam: camera, lit });
      const cx = camera.position.x, cz = camera.position.z;
      PEOPLE.forEach((p, j) => {
        const o = personPose(p, key, tt);
        crowd.pose(j, o);
        // breath clouds in the cold (only the people near enough to see it)
        if (breathK > 0 && p.f < 26) {
          const dx = o.x - cx, dz = o.z - cz;
          if (dx * F.x + dz * F.z > 3) {
            const hy = o.y + (1.58 - 0.42 * (o.sit || 0)) * o.s;
            breath(o.x, hy, o.z, o.yaw, p.seed, tt, breathK);
          }
        }
      });
      crowd.commit();
      fire.mat.uniforms.uTime.value = v; smoke.mat.uniforms.uTime.value = v;
      fire.end(); smoke.end(); glows.end(); parts.end();
      return out;
    },
  };
}
