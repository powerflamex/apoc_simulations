// The whole scene for one world at one moment: setStop(i, v) poses everything for stop i at video time v (main.js
// draws one stop, or both sides of a wipe, one after the other). Each stop starts fresh at its wipe.
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
import { makeBolts } from './bolts.js';
import { makeParts } from './parts.js';
import { makeUmbrella, GRIP, RAD } from './umbrella.js';
import { makeYou } from './you.js';
import { FX } from './fx.js';
import { H, patchHeat } from './heat.js';
import { PEOPLE, personPose, titFrontF } from './people.js';
import { landY, groundY, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW, LIFEGUARD } from './layout.js';
import { STOPS, LAND } from './timeline.js';
import { STRIKES, strikeK, JUP_RAIN, marsR, MARS_IN, MARS_CLEAR, MARS_FROST, marsFrostF, VEN_FIRE, VEN_STEAM, venLevel, TIT_FZ0, TIT_FZDUR, TIT_FZO0, TIT_FZP, TIT_SHORE, TIT_RUN, TIT_SHATTER, titSeaFront, SAT_FLIP, SAT_RIP, NEP_SHRED, NEP_LIFT, NEP_PIER, nepWhite } from './sched.js';
import { smooth, clamp, lerp, wobble, DEG } from './util.js';

const F = new THREE.Vector3(CAM_FWD.x, 0, CAM_FWD.z), RT = new THREE.Vector3(CAM_RIGHT.x, 0, CAM_RIGHT.z), UP = new THREE.Vector3(0, 1, 0);
const BEAR = CAM0.b * DEG;
// the Sun: high, behind you and to the left (the beach is lit from the front)
const SUN_DIR = new THREE.Vector3().addScaledVector(F, -Math.cos(35 * DEG)).addScaledVector(RT, -Math.sin(35 * DEG)).multiplyScalar(Math.cos(42 * DEG)).add(new THREE.Vector3(0, Math.sin(42 * DEG), 0)).normalize();
const hash = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
const wrapTo = (x, a, b) => a + ((((x - a) % (b - a)) + (b - a)) % (b - a));
const blown = (t, acc, vmax) => (t <= 0 ? 0 : t < vmax / acc ? 0.5 * acc * t * t : vmax * vmax / (2 * acc) + vmax * (t - vmax / acc));
const C3 = (a) => new THREE.Color(a[0], a[1], a[2]);

// ---- how each world looks ----
// sky: top / low / haze colours, haze strength, cloud cover and its lit / dark colours, streak (stretched by wind);
// light: the Sun's colour and strength, the sky's fill (hemi); fog; exposure; sea: its body colour
const LOOK = {
  jupiter: { top: [0.05, 0.04, 0.035], low: [0.24, 0.16, 0.11], haze: [0.3, 0.2, 0.14], hazeK: 0.7, cloud: 0.95, cLit: [0.32, 0.22, 0.16], cDark: [0.07, 0.055, 0.05], streak: 0.6, cScale: 1,
    sun: [1.0, 0.75, 0.55], sunI: 0.7, hSky: [0.62, 0.48, 0.38], hGnd: [0.32, 0.23, 0.16], hI: 1.35, fog: [0.24, 0.17, 0.12], fogD: 0.00011, exp: 1.05, body: [0.02, 0.035, 0.035], smoke: [0.55, 0.5, 0.47] },
  mars: { top: [0.62, 0.46, 0.31], low: [0.94, 0.74, 0.52], haze: [0.92, 0.7, 0.5], hazeK: 0.85, cloud: 0.2, cLit: [0.95, 0.75, 0.55], cDark: [0.7, 0.48, 0.32], streak: 1, cScale: 1,
    sun: [1.0, 0.83, 0.64], sunI: 2.0, hSky: [0.95, 0.7, 0.5], hGnd: [0.6, 0.38, 0.24], hI: 1.35, fog: [0.78, 0.52, 0.33], fogD: 0.0007, exp: 0.95, body: [0.06, 0.04, 0.03], smoke: [1.15, 0.7, 0.45] },
  venus: { top: [0.82, 0.66, 0.26], low: [1.0, 0.84, 0.42], haze: [1.0, 0.82, 0.44], hazeK: 0.95, cloud: 0.75, cLit: [1.0, 0.9, 0.58], cDark: [0.72, 0.55, 0.26], streak: 0.4, cScale: 1,
    sun: [1.0, 0.82, 0.52], sunI: 1.3, hSky: [1.0, 0.84, 0.52], hGnd: [0.78, 0.58, 0.32], hI: 1.6, fog: [0.96, 0.78, 0.44], fogD: 0.0022, exp: 0.82, body: [0.08, 0.08, 0.05], smoke: [1.2, 1.1, 0.92] },
  titan: { top: [0.3, 0.16, 0.06], low: [0.56, 0.33, 0.13], haze: [0.62, 0.38, 0.16], hazeK: 0.95, cloud: 0.55, cLit: [0.62, 0.4, 0.2], cDark: [0.18, 0.1, 0.05], streak: 0.3, cScale: 1,
    sun: [1.0, 0.72, 0.42], sunI: 0.35, hSky: [0.8, 0.52, 0.28], hGnd: [0.42, 0.27, 0.13], hI: 1.0, fog: [0.52, 0.31, 0.13], fogD: 0.0019, exp: 1.25, body: [0.03, 0.025, 0.015], smoke: [0.9, 0.62, 0.36] },
  saturn: { top: [0.6, 0.53, 0.38], low: [0.93, 0.85, 0.63], haze: [0.95, 0.87, 0.65], hazeK: 0.8, cloud: 0.75, cLit: [1.0, 0.96, 0.82], cDark: [0.72, 0.62, 0.44], streak: 7, cScale: 1,
    sun: [1.0, 0.93, 0.76], sunI: 2.7, hSky: [0.92, 0.84, 0.64], hGnd: [0.66, 0.56, 0.38], hI: 1.3, fog: [0.9, 0.81, 0.6], fogD: 0.0011, exp: 0.85, body: [0.03, 0.06, 0.06], smoke: [1.15, 1.0, 0.75] },
  neptune: { top: [0.01, 0.03, 0.15], low: [0.06, 0.17, 0.48], haze: [0.13, 0.27, 0.58], hazeK: 0.6, cloud: 0.6, cLit: [0.85, 0.93, 1.0], cDark: [0.22, 0.33, 0.62], streak: 10, cScale: 1.4,
    sun: [0.75, 0.86, 1.0], sunI: 0.9, hSky: [0.38, 0.52, 0.98], hGnd: [0.16, 0.24, 0.48], hI: 1.55, fog: [0.16, 0.3, 0.62], fogD: 0.0014, exp: 1.2, body: [0.005, 0.02, 0.07], smoke: [0.85, 0.95, 1.15] },
};

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.side || 0}`);
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 900 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9cbbe6, 0xb8a080, 1.2);
  scene.add(hemi);
  const sky = makeSky();
  scene.add(sky.mesh);
  const ground = makeGround(scene);
  const sea = makeSea(scene);
  const walls = [makeWall(scene, 2), makeWall(scene, 3)];
  const glows = makeGlows(scene, 600);
  const props = makeProps(scene, { plainMat, shadowy });
  const crowd = makeCrowd(scene, PEOPLE.length, patchHeat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'crowd', { burnK: 0.25 }));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const fire = makeFire(scene, 1200);
  fire.mat.uniforms.uOcc.value = 0.65;
  const smoke = makeSmoke(scene, 1400);
  const bolts = makeBolts(scene);
  const parts = makeParts(scene, 9000);
  const you = makeYou(scene);
  const umb = makeUmbrella(scene);

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), qq = new THREE.Quaternion(), mm = new THREE.Matrix4();
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
  const TANV = Math.tan(31 * DEG), TANH = TANV * 1080 / 1920, CAMY = landY(CAM0.x) + CAM0.h, PIT = Math.tan(5.2 * DEG);
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
  // ---- you and your umbrella, posed for one stop ----
  // the umbrella's apex and its "down" (toward the handle), in your own frame (x left, y up, z ahead)
  const APEX0 = new THREE.Vector3(-0.12, 2.44, 0.2), DOWN0 = new THREE.Vector3(-0.1, -1, -0.04).normalize();
  const umbQ = (downW, spin) => {
    const up = v2.copy(downW).negate().normalize();
    qq.setFromUnitVectors(UP, up);
    const qs = new THREE.Quaternion().setFromAxisAngle(UP, spin);
    return qq.multiply(qs);
  };
  function placeYou(key, tt, o) {
    you.root.position.set(YOU.x, YOU.y, YOU.z);
    you.root.rotation.set(0, FACE_YAW, 0);
    you.root.scale.setScalar(1);
    const q = { head: [-0.25, 0], curlR: 1 };
    let apex = APEX0.clone(), down = DOWN0.clone(), spin = 0.2, held = true, flying = null;
    const U = umb.U;
    U.uFlip.value = 0; U.uFlut.value = 0.15; U.uBend.value = 0; U.uShred.value = 0; U.uBurn.value = 0; U.uScorch.value = 0;
    U.uFrost.value = 0; U.uDust.value = 0; U.uWet.value = 0; U.uT.value = tt; U.uCrack.value = 0; U.uShatter.value = 0;
    FX.uFrost.value = 0; FX.uDust.value = 0; FX.uScorch.value = 0; FX.uHeat.value = 0; FX.uBurn.value = 0;
    let windL = 0;
    if (key === 'jupiter') {
      q.head = [-0.35, 0.05];
      U.uFlut.value = 0.5 + 0.4 * Math.sin(tt * 1.7);
      windL = 0.4;
      const hit = STRIKES.find((s) => s.who === 'you').t;
      const k = smooth(hit - 0.02, hit + 0.06, tt);
      U.uScorch.value = k;
      const fl = Math.exp(-Math.max(0, tt - hit) / 0.6) * k;
      q.hunch = 0.3 * fl + 0.12 * k; q.sink = 0.07 * fl + 0.03 * k; q.head = [lerp(-0.35, 0.45, fl), 0.15 * fl];
      apex.add(new THREE.Vector3(0.04 * Math.sin(tt * 47) * fl, -0.1 * fl, 0.05 * fl));
      if (fl > 0.05 || tt > hit) { q.holdL = youLocal(0.08, 1.62 - 0.1 * fl, 0.28, new THREE.Vector3()); q.poleL = youLocal(0.5, 1.0, 0.0, new THREE.Vector3()); q.curlL = 0.5; }
      const rain = smooth(JUP_RAIN, JUP_RAIN + 1, tt);
      U.uWet.value = rain; FX.uDust.value = 0;
      q.hunch = (q.hunch || 0) + 0.08 * rain;
    } else if (key === 'mars') {
      const R = marsR(tt);
      const hit = smooth(9, 3.5, R);
      U.uFlut.value = 0.3 + 1.1 * hit; windL = 0.3 + 1.0 * hit;
      U.uDust.value = 0.85 * smooth(MARS_IN - 0.2, MARS_IN + 0.9, tt); FX.uDust.value = 0.4 * smooth(MARS_IN, MARS_IN + 1.0, tt);
      // the frost front reaches you (4 m ahead of the camera)
      const tYou = MARS_FROST + 1.15 * Math.pow(30 / 42, 1 / 0.85);
      const fr = smooth(tYou - 0.1, tYou + 0.2, tt);
      U.uFrost.value = 0.95 * fr; FX.uFrost.value = 0.42 * fr;
      U.uFlut.value *= 1 - 0.8 * fr; windL *= 1 - 0.7 * fr;
      q.head = [lerp(-0.2, 0.35, hit), lerp(0, 0.5, hit)];
      q.hunch = 0.25 * hit + 0.1 * fr; q.sink = 0.05 * hit;
      if (hit > 0.02) { q.holdL = youLocal(0.06, lerp(1.2, 1.62, hit), lerp(0.1, 0.25, hit), new THREE.Vector3()); q.poleL = youLocal(0.5, 1.0, -0.1, new THREE.Vector3()); q.curlL = 0.6; }
      if (fr > 0) { q.roll = 0.02 * Math.sin(tt * 38) * fr; }
      apex.x += -0.12 * hit; apex.y -= 0.12 * hit; down.x -= 0.15 * hit;
    } else if (key === 'venus') {
      const k = smooth(0.25, 0.7, tt);
      q.head = [lerp(-0.2, 0.3, k), lerp(0, -0.35, k)];
      q.holdL = youLocal(0.04, lerp(1.0, 1.66, k), lerp(0.1, 0.24, k), new THREE.Vector3()); q.poleL = youLocal(0.5, 1.0, -0.1, new THREE.Vector3()); q.curlL = 0.5;
      q.hunch = 0.15 * k;
      const b = smooth(VEN_FIRE, VEN_FIRE + 2.6, tt);
      U.uBurn.value = Math.max(b, 0.06 * smooth(VEN_FIRE - 0.05, VEN_FIRE + 0.1, tt));
      U.uDust.value = 0.35 * smooth(0, VEN_FIRE, tt);            // (scorching brown before it catches)
      // you hold the burning umbrella out at arm's length, leaning away from it
      const away = smooth(VEN_FIRE + 0.2, VEN_FIRE + 0.9, tt);
      apex.add(new THREE.Vector3(-0.42 * away, 0.08 * away, 0.38 * away)); down.add(new THREE.Vector3(0.25 * away, 0, -0.32 * away)).normalize();
      q.lean = -0.1 * away; q.twist = 0.15 * away; q.head[1] -= 0.25 * away;
      windL = 0.05;
      U.uFlut.value = 0.08;
    } else if (key === 'titan') {
      const k = smooth(0.2, 0.7, tt);
      // the front reaches you (4 m ahead of the camera); the frozen umbrella cracks, then shatters
      const tYou = TIT_SHORE + 0.7 * (20 / 30);
      const fr = smooth(tYou - 0.12, tYou + 0.15, tt);
      const sh = smooth(TIT_SHATTER, TIT_SHATTER + 0.1, tt);
      const fl = Math.exp(-Math.max(0, tt - TIT_SHATTER) / 0.5) * smooth(TIT_SHATTER - 0.02, TIT_SHATTER + 0.05, tt);
      q.head = [lerp(-0.3, -0.75, k * (1 - smooth(TIT_RUN, TIT_RUN + 0.5, tt))) + 0.25 * fr + 0.35 * fl, -0.25 * fr];
      // a hand out, palm up, catching drops; then seeing the front coming; flinching from the shards
      const look = smooth(TIT_RUN, TIT_RUN + 0.5, tt);
      q.holdL = youLocal(lerp(0.22, 0.5, k * (1 - look)) + 0.1 * fl, lerp(1.0, 1.28, k) + 0.35 * fl, lerp(0.1, 0.42, k * (1 - look)), new THREE.Vector3()); q.poleL = youLocal(0.6, 0.9, -0.1, new THREE.Vector3()); q.curlL = 0.15 + 0.6 * look;
      q.hunch = 0.15 * look + 0.25 * fl; q.sink = 0.05 * fl;
      U.uWet.value = smooth(0.4, 1.5, tt) * (1 - fr); U.uFrost.value = fr; FX.uFrost.value = 0.55 * fr;
      U.uCrack.value = smooth(tYou + 0.15, TIT_SHATTER - 0.05, tt); U.uShatter.value = sh; U.uBend.value = 0.3 * sh;
      U.uFlut.value = 0.05 * (1 - fr);
      apex.add(new THREE.Vector3(0.03 * Math.sin(tt * 53) * fl, -0.06 * fl, 0));
    } else if (key === 'saturn') {
      const k = smooth(0.0, 0.3, tt);
      U.uFlip.value = smooth(SAT_FLIP, SAT_FLIP + 0.16, tt);
      U.uFlut.value = 0.6 + 1.6 * k; windL = 1.6 * k;
      U.uBend.value = 0.25 * smooth(1.2, 2.6, tt);
      q.roll = -0.2 * k; q.sink = 0.1 * k; q.hunch = 0.2 * k; q.head = [0.25 * k, 0.5 * k];
      q.holdL = youLocal(0.06, 1.62, 0.24, new THREE.Vector3()); q.poleL = youLocal(0.5, 1.0, -0.1, new THREE.Vector3()); q.curlL = 0.5;
      // the wind drags the umbrella down to your right (kept low, clear of the text); then it's gone, sideways
      const drag = k + 0.3 * smooth(1.5, 2.8, tt);
      apex.add(new THREE.Vector3(-0.5 * drag + 0.05 * Math.sin(tt * 13), -0.3 * drag, 0.05 * Math.sin(tt * 17)));
      down.add(new THREE.Vector3(0.7 * drag, 0, 0)).normalize();
      if (tt > SAT_RIP) {
        const t = tt - SAT_RIP;
        held = false;
        flying = { t, acc: 45, vmax: 70, up: 0.45, spinK: 8 };
        // your hand flies after it, then drops
        const reach = Math.exp(-t / 0.7);
        q.holdR = youLocal(-0.55 - 0.15 * (1 - reach), 1.55 + 0.25 * reach, 0.18, new THREE.Vector3()); q.poleR = youLocal(-0.6, 0.9, -0.2, new THREE.Vector3()); q.curlR = 0.25;
        q.head = [0.1, -0.7 * smooth(0, 0.4, t)];
      }
    } else if (key === 'neptune') {
      const k = smooth(0.0, 0.25, tt);
      U.uFlip.value = 0.55 * smooth(0.1, 0.3, tt);
      U.uShred.value = 0.55 * smooth(NEP_SHRED, NEP_SHRED + 0.4, tt) + 0.35 * smooth(2.0, 4.0, tt);
      U.uBend.value = 0.5 * smooth(0.3, 1.0, tt) + 0.3 * smooth(3.0, 5.0, tt);
      U.uFlut.value = 2.5 * k; windL = 2.2 * k;
      U.uFrost.value = 0.6 * smooth(0.5, 3.0, tt); FX.uFrost.value = 0.2 * smooth(0.5, 3.0, tt);
      q.roll = -0.25 * k; q.sink = 0.14 * k; q.hunch = 0.25 * k; q.head = [0.3, 0.55 * k];
      // both hands on the shaft, dragged to the right
      const drag = k + 0.5 * smooth(2, 5.5, tt);
      apex.add(new THREE.Vector3(-0.55 * drag + 0.06 * Math.sin(tt * 19), -0.2 * drag, 0.08 * Math.sin(tt * 23)));
      down.add(new THREE.Vector3(0.65 * drag, 0, 0)).normalize();
      if (tt > NEP_LIFT) {
        // it takes you with it: up and away to the right, you hanging on beneath it
        const t = tt - NEP_LIFT;
        held = 'hang';
        flying = { t, acc: 14, vmax: 90, up: 1.4, spinK: 0 };
      }
    }
    // the umbrella in the world
    const apexW = youLocal(apex.x, apex.y, apex.z, new THREE.Vector3());
    const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, FACE_YAW, 0));
    const downW = down.clone().applyQuaternion(rq).normalize();
    if (flying && held !== 'hang') {
      const { t, acc, vmax, up, spinK } = flying;
      apexW.addScaledVector(RT, blown(t, acc, vmax)).y += up * t * (1 + 1.6 * t);
      umb.group.position.copy(apexW);
      umb.group.quaternion.copy(umbQ(downW, spin)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(t * spinK * 0.8, t * spinK * 0.3, t * spinK)));
    } else {
      if (held === 'hang') {
        const t = flying.t;
        const t2 = Math.max(0, t - 1.1);
        apexW.addScaledVector(RT, 0.3 * t * t + 9 * t2 * t2).y += 0.2 * t * t + 1.6 * t2 * t2;      // (off to the right, under the text)
        downW.lerp(new THREE.Vector3(0, -1, 0), smooth(0, 0.4, t)).add(RT.clone().multiplyScalar(-0.35 * smooth(0, 0.5, t))).normalize();
      }
      umb.group.position.copy(apexW);
      umb.group.quaternion.copy(umbQ(downW, spin));
    }
    umb.group.updateMatrixWorld(true);
    const ww = RT.clone().multiplyScalar(windL);
    U.uWindL.value.copy(ww).applyQuaternion(umb.group.quaternion.clone().invert());
    // your right hand on the grip
    if (held) {
      const grip = umb.gripWorld(new THREE.Vector3());
      if (held === 'hang') {
        // hanging beneath it: place yourself so your hands reach the shaft, legs dangling and kicking
        const t = flying.t;
        const sway = 0.35 * Math.sin(t * 5.5) * Math.exp(-t * 0.8);
        you.root.position.copy(grip).add(new THREE.Vector3(0, -1.95, 0)).addScaledVector(RT, 0.18 - 0.35 * smooth(0, 0.6, t));
        you.root.rotation.set(0, FACE_YAW, 0);
        you.root.rotateOnWorldAxis(F, -(0.35 * smooth(0, 0.6, t) + sway));
        q.lift = [0.25 + 0.15 * Math.sin(t * 13), 0.2 + 0.15 * Math.sin(t * 11 + 1)]; q.float = 0.7; q.sink = 0;
        q.roll = 0; q.hunch = 0; q.head = [-0.3, 0.4];
        q.holdR = grip; q.poleR = youLocal(-0.6, 1.4, -0.3, new THREE.Vector3());
        q.holdL = umb.at(new THREE.Vector3(), 0, -GRIP + 0.12, 0); q.poleL = youLocal(0.6, 1.4, -0.3, new THREE.Vector3()); q.curlL = 1;
      } else {
        q.holdR = grip; q.poleR = youLocal(-0.55, 0.85, -0.15, new THREE.Vector3());
        if (key === 'neptune') { q.holdL = umb.at(new THREE.Vector3(), 0, -GRIP + 0.14, 0); q.poleL = youLocal(0.5, 0.9, -0.1, new THREE.Vector3()); q.curlL = 1; }
      }
    }
    you.pose(q);
    you.root.updateMatrixWorld(true);
  }

  return {
    sun, hemi, sky, sea, walls, crowd, props, you, umb, parts, smoke, fire, glows, bolts,
    setStop(i, v, camera) {
      const st = STOPS[i], key = st.key, tt = v - st.land, L = LOOK[key];
      const out = { exp: L.exp, shimmer: 0, veil: [1, 1, 1, 0], shake: 0, jolt: 0, streak: 0 };
      let lit = null;                     // (the wheel's lights: null = the stop's default)
      fire.begin(); smoke.begin(); glows.begin(); bolts.begin(); parts.begin();
      parts.mat.uniforms.uT.value = v;
      // ---- reset the shared weather on surfaces ----
      H.uFrost.value = 0; H.uDust.value = 0; H.uWetK.value = 0; H.uCharK.value = 1;
      H.uTK.value = 300; H.uAmbK.value = 300; H.uTKP.value = 300; H.uAmbKP.value = 300; H.uGlowGain.value = 0;
      H.uSunW.value.copy(SUN_DIR);
      H.uFrostF.value = -1e5; H.uFrostAll.value = 0; H.uCamXZ.value.set(camera.position.x, camera.position.z); H.uFwdXZ.value.set(F.x, F.z);
      GU.uTime.value = v; GU.uStream.value = 0; GU.uScorchG.value = 0; GU.uWindD.value.set(RT.x, RT.z); GU.uRime.value = 0.85;
      // ---- the sky ----
      const s = sky.u;
      s.uTop.value.setRGB(...L.top); s.uLow.value.setRGB(...L.low); s.uHaze.value.setRGB(...L.haze); s.uHazeK.value = L.hazeK;
      s.uSunD.value.copy(SUN_DIR); s.uSunI.value = 0; s.uSunGlow.value = 0;
      s.uCloud.value = L.cloud; s.uCloudLit.value.setRGB(...L.cLit); s.uCloudDark.value.setRGB(...L.cDark);
      s.uStreak.value = L.streak; s.uCloudScale.value = L.cScale; s.uWindD.value.set(RT.x, RT.z);
      const cloudV = key === 'saturn' ? 420 : key === 'neptune' ? 600 : key === 'jupiter' ? 30 : key === 'mars' ? 25 : 6;
      s.uDrift.value.set(-RT.x * cloudV * tt, -RT.z * cloudV * tt);
      s.uFlash.value = 0; s.uT.value = v;
      // ---- light ----
      sun.color.setRGB(...L.sun); sun.intensity = L.sunI;
      hemi.color.setRGB(...L.hSky); hemi.groundColor.setRGB(...L.hGnd); hemi.intensity = L.hI;
      const look = toW(30, 0, 0, v1);
      sun.target.position.copy(look); sun.position.copy(look).addScaledVector(SUN_DIR, 400);
      scene.fog.color.setRGB(...L.fog); scene.fog.density = L.fogD;
      // ---- the sea ----
      const su = sea.u;
      su.uTime.value = v; su.uWaveT.value = v; su.uFrozenT.value = v; su.uChop.value = 0.3; su.uFreeze.value = 0; su.uFreezeR.value = 0;
      su.uSun.value.copy(SUN_DIR); su.uSunI.value = 0; su.uSunCol.value.setRGB(...L.sun);
      su.uSkyHi.value.setRGB(...L.cDark).lerp(C3(L.top), 1 - L.cloud); su.uSkyLo.value.setRGB(...L.haze);
      su.uDirC.value.setRGB(...L.sun).multiplyScalar(L.sunI); su.uAmbC.value.setRGB(...L.hSky).multiplyScalar(L.hI);
      su.uBody.value.setRGB(...L.body); su.uHazeC.value.setRGB(...L.fog); su.uHazeD.value = L.fogD * 0.8;
      su.uBoil.value = 0; su.uTear.value = 0; su.uWindD.value.set(RT.x, RT.z); su.uFlash.value = 0; su.uLevel.value = 0; su.uFzIn.value = 0;
      su.uPx.value = (2 * Math.tan((camera.fov * DEG) / 2)) / 1920;
      // ---- walls off by default ----
      for (const w of walls) { w.u.uAlpha.value = 0; w.mesh.visible = false; w.u.uC.value.copy(camera.position).setY(0); w.u.uB0.value = BEAR; w.u.uT.value = tt; w.u.uLean.value = 0; w.u.uScale.value = 1; }
      smoke.mat.uniforms.uLight.value.setRGB(...L.smoke);
      smoke.mat.uniforms.uSun.value.copy(SUN_DIR);
      let flash = 0;
      const cx = camera.position.x, cz = camera.position.z;
      placeYou(key, tt, out);

      // ====================================================================================== the worlds
      if (key === 'jupiter') {
        // the storm wall, coming on
        const w = walls[0];
        w.mesh.visible = true;
        w.u.uKind.value = 0; w.u.uR.value = 3600 - 1100 * smooth(0, 9, tt); w.u.uSpan.value = 1.45; w.u.uH.value = 1950; w.u.uTop.value = 1.0; w.u.uAlpha.value = 1;
        w.u.uC1.value.setRGB(0.92, 0.8, 0.62); w.u.uC2.value.setRGB(0.66, 0.32, 0.16); w.u.uC3.value.setRGB(0.32, 0.15, 0.08); w.u.uC4.value.setRGB(0.86, 0.6, 0.32);
        w.u.uLit.value.setRGB(1.55, 1.38, 1.2); w.u.uDark.value.setRGB(0.07, 0.06, 0.055); w.u.uRain.value = 1;
        w.u.uHazeC.value.setRGB(...L.haze); w.u.uHazeK.value = 0.06; w.u.uScale.value = 0.8;
        // lightning
        let fx = 0, fd = null;
        for (const sk of STRIKES) {
          const k = strikeK(tt, sk.t);
          if (k <= 0) continue;
          let from, to, width, weight;
          if (sk.who === 'far' || sk.who === 'sea') {
            to = new THREE.Vector3(sk.x, 0, sk.z);
            from = to.clone().add(new THREE.Vector3(-200, sk.who === 'far' ? 1700 : 1300, 120));
            width = sk.who === 'far' ? 5 : 2.2; weight = sk.who === 'far' ? 0.45 : 0.9;
          } else if (sk.who === 'hut') {
            const lg = LIFEGUARD[0];
            to = new THREE.Vector3(lg.x + 1.5, landY(lg.x) + 6.4, lg.z + 1.0);
            from = to.clone().add(new THREE.Vector3(-90, 1100, -60)); width = 0.8; weight = 1.0;
          } else {
            to = umb.tipWorld(new THREE.Vector3());
            from = to.clone().add(new THREE.Vector3(-170, 140, -25)); width = 0.03; weight = 0.55;
          }
          bolts.add(sk.seed, from, to, k, width);
          const kk = k * weight;
          if (kk > fx) { fx = kk; fd = to; }
          flash += kk;
          // sparks where it lands (the hut, your umbrella)
          if ((sk.who === 'hut' || sk.who === 'you') && tt > sk.t) {
            const d = tt - sk.t;
            for (let j = 0; j < 90; j++) {
              const a = hash(j, sk.seed * 9), b = hash(j, sk.seed * 9 + 1), c = hash(j, sk.seed * 9 + 2);
              const sp = (sk.who === 'you' ? 3.5 : 9) * (0.4 + a);
              const dir = v2.set(Math.cos(b * 6.28) * Math.sqrt(1 - (c * 2 - 1) ** 2), c * 2 - 1, Math.sin(b * 6.28) * Math.sqrt(1 - (c * 2 - 1) ** 2));
              const life = 0.25 + 0.5 * a;
              if (d > life) continue;
              const px = to.x + dir.x * sp * d, py = to.y + dir.y * sp * d - 4.9 * d * d, pz = to.z + dir.z * sp * d;
              parts.add(px, py, pz, sk.who === 'you' ? 0.025 : 0.08, dir.x * sp, dir.y * sp - 9.8 * d, dir.z * sp, 1, 3.5, 2.6, 1.6, 1 - d / life, a);
            }
          }
        }
        if (fd) { s.uFlashD.value.copy(fd).sub(camera.position).normalize(); const bb = Math.atan2(-(fd.z - cz), -(fd.x - cx)); w.u.uFlashP.value.set((bb - BEAR) * w.u.uR.value, 1200); }
        // a flicker inside the wall between strikes
        const flick = Math.max(0, Math.sin(tt * 7.3) * Math.sin(tt * 3.1 + 1) * Math.sin(tt * 13.7)) * 0.9;
        w.u.uFlash.value = Math.min(2.5, flash * 1.6 + flick);
        if (!fd) w.u.uFlashP.value.set(900 * Math.sin(tt * 0.9), 1300);
        flash = Math.min(flash, 2.2);
        s.uFlash.value = flash * 0.8 + flick * 0.1;
        hemi.intensity += 2.6 * flash; hemi.color.lerp(new THREE.Color(0.75, 0.8, 1.0), Math.min(1, flash * 0.8));
        sun.intensity += 1.0 * flash;
        su.uFlash.value = flash; su.uChop.value = 1.1;
        out.exp *= 1 + 0.18 * Math.min(flash, 1.2);
        out.jolt = Math.min(1, flash * 0.6);
        // your umbrella after the hit: smoke curling off it, drifting right
        const hit = STRIKES.find((x) => x.who === 'you').t;
        if (tt > hit) for (let j = 0; j < 22; j++) {
          const ph = (tt * 0.6 + j / 22) % 1, a = hash(j, 4.4);
          const pt = umb.canopyPoint(v3, 0.2 + 0.6 * a, a * 40);
          smoke.puff(pt.x + RT.x * ph * 2.5, pt.y + 0.05 + ph * 1.6, pt.z + RT.z * ph * 2.5, 0.08 + ph * 0.35, 0.3 * Math.sin(Math.PI * ph) * smooth(hit, hit + 0.3, tt), 0.15, 0, a);
        }
        // the rain arrives: a grey veil sweeping in from the sea, then streaks everywhere
        const rain = smooth(JUP_RAIN - 0.6, JUP_RAIN + 0.6, tt);
        if (rain > 0) {
          box(2600, 1.1, tt, 0.6, 70, 0, 26, 0, 5, -12, (x, y, z, j, f) => parts.add(x, y, z, 0.006 + f * 0.0016, RT.x * 5, -12, RT.z * 5, 1, 0.7, 0.72, 0.75, 0.32 * rain, hash(j, 2)));
          H.uWetK.value = rain * 0.8;
          scene.fog.density = L.fogD + 0.004 * rain;
        }
        // blowing sand and spray in the gusts before it
        box(500, 2.2, tt, 2, 40, 0.05, 1.5, 0, 14, 0, (x, y, z, j) => parts.add(x, y, z, 0.01, RT.x * 14, 0, RT.z * 14, 1, 0.75, 0.62, 0.48, 0.25 * (1 - rain), hash(j, 5)));
        out.shake = 0.15 + 0.35 * rain;
      } else if (key === 'mars') {
        // the dust wall: at the wipe it already towers behind the pier and the wheel; it swallows them, then the crowd
        // by the water, then you
        const R = marsR(tt);
        const w = walls[0];
        const inside = smooth(11, 4, R);                   // 0 before it reaches you, 1 once you're in it
        w.mesh.visible = R > 4.5;
        w.u.uKind.value = 1; w.u.uR.value = R; w.u.uSpan.value = 1.55; w.u.uH.value = 128; w.u.uTop.value = 1; w.u.uAlpha.value = smooth(4.5, 11, R);
        w.u.uLit.value.setRGB(0.98, 0.5, 0.24); w.u.uDark.value.setRGB(0.17, 0.065, 0.025); w.u.uHazeC.value.setRGB(...L.haze); w.u.uHazeK.value = 0.04;
        w.u.uScale.value = 0.3 + 0.7 * smooth(5, 200, R);
        lit = 0.35 * smooth(200, 230, R);                     // (the wheel's lights go out as the dust takes it)
        // inside: thick dust you can still see a few metres through (you and the people nearest are dark shapes),
        // streaming past; then it drops out of the air, leaving everything coated red under a dim, dusky sky
        const clear = smooth(MARS_CLEAR, MARS_CLEAR + 0.6, tt);
        const dust = inside * (1 - 0.88 * clear);
        const DC = [0.74, 0.43, 0.22];
        scene.fog.color.setRGB(...DC).lerp(new THREE.Color(0.5, 0.32, 0.2), clear);
        scene.fog.density = L.fogD + 0.046 * dust + 0.006 * clear;
        out.veil = [DC[0], DC[1], DC[2], 0.08 * dust];
        out.streak = 0.5 * dust;
        sun.intensity *= (1 - 0.93 * dust) * (1 - 0.5 * clear); hemi.intensity *= (1 - 0.72 * dust) * (1 - 0.35 * clear);
        const skyK = Math.max(dust, 0);
        s.uTop.value.lerp(C3(DC), skyK).lerp(new THREE.Color(0.27, 0.15, 0.1), clear); s.uLow.value.lerp(C3(DC), skyK).lerp(new THREE.Color(0.6, 0.38, 0.24), clear);
        s.uHaze.value.lerp(C3(DC), skyK).lerp(new THREE.Color(0.56, 0.36, 0.23), clear); s.uCloud.value = L.cloud * (1 - skyK);
        su.uSkyLo.value.lerp(new THREE.Color(0.5, 0.33, 0.22), clear);
        // a rolling foot of dust where the wall meets the sand (puffs along its front)
        if (R > 16) for (let j = 0; j < 120; j++) {
          const a = hash(j, 6.6), b = hash(j, 7.7);
          const l = (a * 2 - 1) * (R * 0.75 + 4);
          const ph = (tt * 1.1 + b) % 1;
          const p = toW(Math.max(R - 1 - 5 * ph, 12), l, 0);
          p.y = landY(p.x) + 0.5 + ph * 6;
          smoke.puff(p.x, p.y, p.z, Math.min(2 + 5 * ph + R * 0.035, 0.4 * (R - 6)), 0.55 * Math.sin(Math.PI * ph) * smooth(16, 30, R), 0.35 + 0.3 * b, 0, a);
        }
        // clouds of dust racing past through the crowd once you're in it (they never hide you: none nearer than 6 m)
        for (let j = 0; j < 46; j++) {
          const a = hash(j, 4.1), b = hash(j, 4.7), c = hash(j, 5.3);
          const f = 6 + 26 * Math.pow(a, 1.3), hw = f * TANH * 1.3;
          const l = wrapTo((b * 2 - 1) * hw + tt * (16 + 10 * c), -hw, hw);
          const p = toW(f, l, 0);
          smoke.puff(p.x, landY(p.x) + 0.4 + 2.5 * c, p.z, 1.6 + 2.2 * c + f * 0.05, 0.2 * dust, 0.25 + 0.2 * c, 0, a);
        }
        // dust streaming past in streaks, darker and lighter
        const n = Math.round(400 + 1100 * dust);
        box(n, 3.3, tt, 2.6, 40, 0, 6, 0, 22, 0.4, (x, y, z, j, f, d) => {
          const near = f < R ? 1 : 0.25;
          const sh = 0.55 + 0.7 * hash(j, 3.9);
          parts.add(x, y, z, 0.01 + 0.016 * d, RT.x * (18 + 12 * d), 0.4, RT.z * (18 + 12 * d), 1, 0.72 * sh, 0.42 * sh, 0.22 * sh, (0.08 + 0.22 * dust) * near, d);
        });
        // sand on the move before it, dust settling on everything once it's through
        H.uDust.value = 0.7 * smooth(MARS_IN - 0.6, MARS_IN + 0.6, tt);
        GU.uStream.value = 0.5 * smooth(0, 1.0, tt) * (1 - clear);
        // the frost: a white front racing up the beach from the water to you, everything it passes frozen white;
        // the sea icing over out from the shore
        const fF = marsFrostF(tt);
        H.uFrost.value = smooth(MARS_FROST - 0.05, MARS_FROST + 0.15, tt); H.uFrostF.value = fF; H.uFrostAll.value = 0.95; GU.uRime.value = 0.42;
        out.exp *= 1 + 0.3 * clear;
        su.uChop.value = 0.6;
        const fz = tt - MARS_FROST;
        if (fz > 0) { su.uFreeze.value = 1; su.uFreezeR.value = 420 * Math.pow(smooth(0, 1.8, fz), 1.2); su.uFrozenT.value = st.land + MARS_FROST; }
        // ice mist along the front and glints behind it
        if (fz > 0 && fF > -6) for (let j = 0; j < 70; j++) {
          const a = hash(j, 2.6), ph = (tt * 2.2 + hash(j, 2.9)) % 1;
          const f = Math.max(fF + 0.5, 3.8), hw = f * TANH * 1.25;
          const p = toW(f + ph * 1.5, (a * 2 - 1) * hw, 0);
          parts.add(p.x, landY(p.x) + 0.1 + ph * 0.6, p.z, 0.25 + 0.5 * ph + f * 0.02, 0, 0.3, 0, 0, 0.8, 0.86, 0.92, 0.32 * Math.sin(Math.PI * ph) * smooth(4, 10, f), a);
        }
        if (fz > 0) box(320, 8.8, 0, 1, 18, 0.02, 0.06, 0, 0, 0, (x, y, z, j, f, d) => {
          if (f < fF) return;
          const tw = Math.max(0, Math.sin(tt * 3 + d * 40));
          parts.add(x, landY(x) + 0.03, z, 0.014, 0, 0, 0, 3, 1.6, 1.8, 2.1, tw * tw * 0.7, d);
        });
        out.shake = 0.12 + 0.55 * dust + 0.25 * smooth(0.3, 1.2, tt) * (1 - inside);
        out.jolt = 0.4 * Math.exp(-Math.abs(tt - MARS_IN) / 0.15);
      } else if (key === 'venus') {
        const k = smooth(0.0, 0.6, tt);
        su.uBoil.value = k; su.uChop.value = 0.4;
        // ~3 s in the sea boils off: its level falls (the sea floor comes out, steaming) and a wall of steam towers up
        // off the whole bay
        const lev = venLevel(tt), stK = smooth(VEN_STEAM - 0.2, VEN_STEAM + 1.4, tt);
        su.uLevel.value = lev;
        const w0 = walls[0], w1 = walls[1];
        w0.mesh.visible = w1.mesh.visible = true;
        w0.u.uKind.value = 2; w0.u.uR.value = 105 - 25 * smooth(0, 6, tt); w0.u.uSpan.value = 1.5; w0.u.uH.value = 35; w0.u.uTop.value = 0.3 + 0.7 * smooth(0.1, 1.5, tt); w0.u.uAlpha.value = 0.75 * k;
        w0.u.uLit.value.setRGB(1.05, 1.0, 0.88); w0.u.uDark.value.setRGB(0.8, 0.72, 0.56); w0.u.uHazeC.value.setRGB(...L.fog); w0.u.uHazeK.value = 0.12; w0.u.uY0.value = -2 - lev;
        // the steam wall: billowing up off the bay, white on top, grey underneath, churning upward
        w1.u.uKind.value = 1; w1.u.uR.value = 330 - 80 * stK; w1.u.uSpan.value = 1.55; w1.u.uH.value = 25 + 115 * Math.pow(stK, 0.8); w1.u.uTop.value = 1;
        w1.u.uAlpha.value = smooth(VEN_STEAM - 0.4, VEN_STEAM + 0.2, tt) + 0.6 * k * (1 - smooth(VEN_STEAM - 0.4, VEN_STEAM + 0.2, tt));
        w1.u.uLit.value.setRGB(1.25, 1.18, 1.02); w1.u.uDark.value.setRGB(0.42, 0.37, 0.3); w1.u.uHazeC.value.setRGB(...L.fog); w1.u.uHazeK.value = 0.12; w1.u.uY0.value = -3 - lev;
        w1.u.uScale.value = 1.3; w1.u.uT.value = tt * 2.2;
        // steam boiling off the shallows right in front of you, then off the sea floor as the water goes
        for (let j = 0; j < 150; j++) {
          const a = hash(j, 9.1), b = hash(j, 9.7);
          const ph = (tt * (0.35 + 0.2 * b) + a) % 1;
          const p = toW(28 + 70 * Math.pow(b, 1.3) + lev * 10 * b, (a * 2 - 1) * (12 + 30 * b), 0);
          smoke.puff(p.x, groundY(p.x) + 0.5 + ph * (6 + 10 * b), p.z, 1.6 + ph * 5, 0.32 * k * Math.sin(Math.PI * ph), 1.0, 0, a);
        }
        if (stK > 0) { out.jolt = 0.5 * Math.exp(-Math.abs(tt - VEN_STEAM) / 0.2); out.shake = 0.35 * stK; }
        // the heat: everything scorches (the sand doesn't burn, it bleaches)
        const T = lerp(300, 737, smooth(0, 2.4, tt));
        H.uTK.value = T; H.uAmbK.value = T; H.uTKP.value = T; H.uAmbKP.value = T;
        GU.uScorchG.value = 0.4 * smooth(0, 2.5, tt);
        out.shimmer = 1.6 * smooth(0.0, 0.8, tt);
        scene.fog.density = L.fogD * (1 + 1.2 * smooth(0.5, 5, tt));
        // your umbrella: smoking, then flames along its burning edge, embers flying up
        // your umbrella: smoking from the moment the heat hits, in flames at ~0.8 s, burning down to its ribs
        const b = smooth(VEN_FIRE, VEN_FIRE + 2.6, tt);
        const fk = smooth(VEN_FIRE - 0.05, VEN_FIRE + 0.15, tt) * (1 - smooth(VEN_FIRE + 1.9, VEN_FIRE + 2.4, tt));
        const pre = smooth(0.0, 0.25, tt) * (1 - smooth(VEN_FIRE + 2.0, VEN_FIRE + 3.0, tt));
        for (let j = 0; j < 30; j++) {
          const ph = (tt * 0.9 + j / 30) % 1, a = hash(j, 3.9);
          const pt = umb.canopyPoint(v3, 0.35 + 0.65 * a, a * 40);
          smoke.puff(pt.x + ph * 0.3, pt.y + 0.05 + ph * 1.8, pt.z, 0.06 + ph * 0.45, 0.42 * pre * Math.sin(Math.PI * ph), 0.25, 0.3 * fk, a);
        }
        // the moment it catches: a burst of flame right across the canopy
        const burst = Math.exp(-Math.max(0, tt - VEN_FIRE) / 0.25) * smooth(VEN_FIRE - 0.03, VEN_FIRE + 0.05, tt);
        if (burst > 0.02) for (let j = 0; j < 22; j++) {
          const a = hash(j, 5.9) * 6.28, r = 0.2 + 0.8 * hash(j, 6.9);
          const pt = umb.canopyPoint(v3, r, a);
          fire.add(pt.x, pt.y, pt.z, 0.3, 0.35 + 0.4 * hash(j, 7.9), burst, 0.5 + j * 0.09);
        }
        if (fk > 0) {
          const edge = Math.max(0.05, 1.15 - b * 1.4);
          for (let j = 0; j < 28; j++) {
            const a = (j / 28) * Math.PI * 2 + 0.1 * Math.sin(tt * 3 + j);
            const pt = umb.canopyPoint(v3, Math.min(1, edge + 0.04 * Math.sin(j * 2.3)), a);
            fire.add(pt.x, pt.y - 0.02, pt.z, 0.24, 0.32 + 0.22 * Math.abs(Math.sin(j * 1.7 + tt * 4)), fk * 0.95, 0.3 + j * 0.07);
          }
          for (let j = 0; j < 60; j++) {
            const a = hash(j, 2.2), ph = (tt * (0.7 + 0.5 * a) + hash(j, 2.9)) % 1;
            const pt = umb.canopyPoint(v3, edge, a * 6.28);
            parts.add(pt.x + (a - 0.5) * 0.6 * ph + RT.x * ph * 0.4, pt.y + ph * 2.2, pt.z + RT.z * ph * 0.4, 0.012, 0, 2, 0, 3, 3.0, 1.2, 0.3, (1 - ph) * b * (1 - b) * 3, a);
          }
        }
        // embers and ash over the beach once things burn
        box(400, 4.4, tt, 2, 60, 0, 12, 0, 1.5, 1.6, (x, y, z, j, f, d) => parts.add(x, y, z, 0.03, 0.5, 1.6, 0, 3, 2.6, 0.9, 0.25, 0.5 * smooth(VEN_FIRE, VEN_FIRE + 2, tt) * Math.max(0, Math.sin(tt * 5 + d * 30)), d));
      } else if (key === 'titan') {
        // a freeze front races in from the horizon across the sea, each wave freezing where it stood as it goes over,
        // then up the beach: everything it passes (people mid-stride, you, your umbrella) frozen white
        su.uFzIn.value = 1; su.uFzT0.value = st.land + TIT_FZ0; su.uFzDur.value = TIT_FZDUR; su.uFzO0.value = TIT_FZO0; su.uFzP.value = TIT_FZP;
        su.uChop.value = 0.25;
        H.uWetK.value = 0.6 * smooth(0.3, 1.5, tt) * (1 - smooth(TIT_SHORE, TIT_SHORE + 0.8, tt));
        const fF = titFrontF(tt);
        H.uFrost.value = 1; H.uFrostF.value = fF; H.uFrostAll.value = 1; GU.uRime.value = 0.7;
        // a wall of ice mist boiling up along the front as it runs in
        const oF = titSeaFront(tt);
        if (tt > TIT_FZ0 && fF > -6) for (let j = 0; j < 90; j++) {
          const a = hash(j, 1.3), ph = (tt * 1.8 + hash(j, 1.9)) % 1;
          const f = Math.max(fF, 3.8) + ph * (1.5 + fF * 0.03);
          const hw = f * TANH * 1.3;
          const p = toW(f, (a * 2 - 1) * hw, 0);
          const sz = 0.5 + f * 0.035;
          parts.add(p.x, Math.max(groundY(p.x), 0) + sz * (0.3 + 1.6 * ph), p.z, sz * (1 + 1.5 * ph), 0, 0.5, 0, 0, 0.85, 0.83, 0.8, 0.45 * Math.sin(Math.PI * ph) * (oF > 0 ? smooth(1800, 300, oF) : 1), a);
        }
        // the drops: up to a centimetre across, falling ~1.6 m/s (6x slower than rain on Earth), amber: short streaks
        const rk = smooth(0.0, 0.5, tt) * (1 - 0.6 * smooth(TIT_SHATTER, TIT_SHATTER + 0.5, tt));
        frust(520, 7.1, tt, 1.4, 12, 0.25, -1.6, (x, y, z, j, f, d) => {
          parts.add(x, y, z, 0.007 + 0.003 * d + f * 0.0006, 0, -1.6 * 1.7, 0, 1, 0.3, 0.17, 0.07, 0.9 * rk, d);
        });
        box(700, 7.9, tt, 12, 60, 0.2, 14, 0, 0.35, -1.6, (x, y, z, j, f, d) => parts.add(x, y, z, 0.012 + 0.002 * f, 0, -1.6 * 1.7, 0, 1, 0.3, 0.17, 0.07, 0.75 * rk, d));
        // the shatter: the frozen canopy bursts into shards that fly off and rain down onto the sand, glinting
        const shT = tt - TIT_SHATTER;
        if (shT > 0) {
          for (let j = 0; j < 150; j++) {
            const a = hash(j, 3.1) * 6.28, r = 0.2 + 0.8 * Math.sqrt(hash(j, 3.7));
            const t0 = 0.08 * hash(j, 4.3), t = shT - t0;
            if (t <= 0) continue;
            const c = umb.canopyPoint(v3, r, a);
            const cx0 = c.x, cy0 = c.y, cz0 = c.z;
            const ctr = umb.at(v2, 0, -0.1, 0);
            const ox = cx0 - ctr.x, oz = cz0 - ctr.z, ol = Math.hypot(ox, oz) || 1;
            const sp = 1.5 + 2.8 * hash(j, 5.1);
            const vx = ox / ol * sp + RT.x * 1.5, vz = oz / ol * sp + RT.z * 1.5, vy = 0.2 + 1.1 * hash(j, 5.7);
            const gy = landY(cx0 + vx * t) + 0.02;
            let y = cy0 + vy * t - 4.9 * t * t;
            const landed = y <= gy;
            if (landed) y = gy;
            const tl = landed ? Math.min(t, (vy + Math.sqrt(Math.max(0, vy * vy + 19.6 * (cy0 - gy)))) / 9.8) : t;
            const blue = Math.floor((a / (Math.PI / 4)) + 0.5) % 2 === 0;
            const sh = 0.75 + 0.5 * hash(j, 6.1);
            parts.add(cx0 + vx * tl, y, cz0 + vz * tl, 0.035 + 0.05 * hash(j, 6.7), landed ? 0 : vx, landed ? 0 : vy - 9.8 * t, landed ? 0 : vz, 5,
              (blue ? 0.42 : 0.92) * sh, (blue ? 0.55 : 0.95) * sh, (blue ? 0.85 : 1.0) * sh, 1, hash(j, 7.3));
          }
          // a burst of glitter, and ice dust hanging in the air
          for (let j = 0; j < 70; j++) {
            const a = hash(j, 8.3) * 6.28, r = hash(j, 8.7);
            const c = umb.canopyPoint(v3, 0.3 + 0.7 * r, a);
            const t = shT, sp = 2 + 3 * hash(j, 9.3);
            parts.add(c.x + Math.cos(a) * sp * t, c.y + 0.5 * t - 3 * t * t, c.z + Math.sin(a) * sp * t, 0.012, 0, 0, 0, 3, 2.2, 2.4, 2.8, Math.exp(-t / 0.35), hash(j, 9.9));
          }
          out.jolt = 0.6 * Math.exp(-shT / 0.12);
        }
        out.shake = 0.08 + 0.3 * Math.exp(-Math.abs(tt - TIT_SHORE) / 0.3);
        // splashes on your umbrella: slow-motion crowns that rise and fall back (until it freezes)
        if (tt < TIT_SHORE + 0.5) for (let j = 0; j < 26; j++) {
          const period = 0.9 + 0.5 * hash(j, 6.1);
          const ph = (tt + hash(j, 6.3) * period) % period / period;
          const r0 = 0.25 + 0.7 * hash(j, 6.5), a0 = hash(j, 6.7) * 6.28 + Math.floor((tt + hash(j, 6.3) * period) / period) * 2.1;
          const c = umb.canopyPoint(v3, r0, a0);
          for (let m = 0; m < 7; m++) {
            const ang = m / 7 * 6.28 + j, sp = 0.18 + 0.06 * hash(m, j);
            const t = ph * 0.55;
            parts.add(c.x + Math.cos(ang) * sp * t, c.y + 0.01 + 0.9 * t - 3 * t * t, c.z + Math.sin(ang) * sp * t, 0.009, 0, 0, 0, 0, 0.8, 0.52, 0.25, rk * (1 - ph), m);
          }
        }
      } else if (key === 'saturn' || key === 'neptune') {
        const N = key === 'neptune';
        const k = smooth(0.0, 0.3, tt);
        su.uTear.value = k * (N ? 1 : 0.8); su.uChop.value = N ? 1.6 : 1.2;
        GU.uStream.value = k;
        // sand and spray streaming past, fast; scraps and chips tumbling through
        const sp = N ? 70 : 42;
        box(N ? 3000 : 2200, 5.5, tt, 0.7, 60, 0, N ? 9 : 4, 0, sp, 0.4, (x, y, z, j, f, d) => {
          const v = sp * (0.7 + 0.6 * d);
          const ice = N && d > 0.55;
          parts.add(x, y, z, 0.006 + 0.006 * d, RT.x * v, 0.4, RT.z * v, 1, ice ? 0.9 : 0.86, ice ? 0.95 : 0.74, ice ? 1.0 : 0.52, (N ? 0.32 : 0.24) * k, d);
        });
        box(N ? 90 : 50, 6.6, tt, 6, 50, 0.3, N ? 12 : 5, 0, sp * 0.8, 0.5, (x, y, z, j, f, d) => {
          const col = [[0.75, 0.3, 0.22], [0.85, 0.75, 0.3], [0.25, 0.45, 0.7], [0.9, 0.88, 0.82], [0.45, 0.35, 0.25]][j % 5];
          parts.add(x, y, z, 0.03 + 0.06 * d + f * 0.002, RT.x * 30, 0.3, RT.z * 30, 4, col[0], col[1], col[2], 0.85 * k, d);
        });
        // a low sheet of blown sand across the beach, and spray torn off the sea
        const w0 = walls[0], w1 = walls[1];
        w0.mesh.visible = w1.mesh.visible = true;
        w0.u.uKind.value = 3; w0.u.uR.value = N ? 70 : 90; w0.u.uSpan.value = 1.5; w0.u.uH.value = N ? 14 : 8; w0.u.uTop.value = 1; w0.u.uAlpha.value = (N ? 0.75 : 0.5) * k; w0.u.uSpeed.value = N ? 520 : 300;
        w0.u.uLit.value.setRGB(...(N ? [0.8, 0.86, 0.95] : [1.0, 0.9, 0.7])); w0.u.uDark.value.setRGB(...(N ? [0.45, 0.52, 0.7] : [0.78, 0.66, 0.46])); w0.u.uHazeC.value.setRGB(...L.fog); w0.u.uHazeK.value = 0.1;
        w1.u.uKind.value = 3; w1.u.uR.value = N ? 380 - 340 * smooth(6.5, 12, tt) : 500; w1.u.uSpan.value = 1.5; w1.u.uH.value = N ? 60 + 180 * smooth(6, 12, tt) : 45; w1.u.uTop.value = 1;
        w1.u.uAlpha.value = (N ? 0.7 + 0.3 * smooth(7.5, 11, tt) : 0.55) * k; w1.u.uSpeed.value = N ? 700 : 420;
        w1.u.uLit.value.setRGB(...(N ? [0.92, 0.96, 1.0] : [1.0, 0.97, 0.88])); w1.u.uDark.value.setRGB(...(N ? [0.55, 0.65, 0.85] : [0.85, 0.78, 0.62])); w1.u.uHazeC.value.setRGB(...L.fog); w1.u.uHazeK.value = 0.15;
        scene.fog.density = L.fogD + (N ? 0.006 + 0.03 * nepWhite(tt) : 0.0025) * k;
        out.shake = (N ? 0.8 : 0.5) * k + (N ? 0.6 * smooth(NEP_LIFT, NEP_LIFT + 1, tt) : 0);
        if (N) {
          H.uFrost.value = 0.55 * smooth(0.5, 3.0, tt);
          // shreds of your umbrella torn off downwind
          if (tt > NEP_SHRED) for (let j = 0; j < 30; j++) {
            const t0 = NEP_SHRED + hash(j, 8.1) * 4.5, t = tt - t0;
            if (t < 0 || t > 1.6) continue;
            const pt = umb.canopyPoint(v3, 0.5 + 0.5 * hash(j, 8.3), hash(j, 8.5) * 6.28);
            const d = blown(t, 60, 120);
            parts.add(pt.x + RT.x * d, pt.y + 1.5 * t, pt.z + RT.z * d, 0.1 + 0.08 * hash(j, 8.7), RT.x * 30, 1, RT.z * 30, 4, j % 2 ? 0.93 : 0.06, j % 2 ? 0.93 : 0.27, j % 2 ? 0.9 : 0.8, 1, hash(j, 8.9));
          }
          // the white-out closing in at the end
          out.veil = [0.88, 0.93, 1.0, 0.85 * nepWhite(tt)];
        }
      }

      // ---- surfaces, props, people, you ----
      props.frame(key, tt, { fire, smoke, parts, glows, cam: camera, lit });
      PEOPLE.forEach((p, j) => crowd.pose(j, personPose(p, key, tt)));
      crowd.commit();
      bolts.end(camera);
      fire.mat.uniforms.uTime.value = v; smoke.mat.uniforms.uTime.value = v;
      fire.end(); smoke.end(); glows.end(); parts.end();
      return out;
    },
  };
}
