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
import { PEOPLE, personPose } from './people.js';
import { landY, groundY, CAM0, CAM_FWD, CAM_RIGHT, YOU, FACE_YAW, LIFEGUARD } from './layout.js';
import { STOPS, LAND } from './timeline.js';
import { STRIKES, strikeK, JUP_RAIN, marsR, MARS_FROST, VEN_FIRE, TIT_FREEZE, SAT_FLIP, SAT_RIP, NEP_SHRED, NEP_LIFT, NEP_PIER, nepWhite } from './sched.js';
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
    U.uFrost.value = 0; U.uDust.value = 0; U.uWet.value = 0; U.uT.value = tt;
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
      U.uDust.value = 0.85 * smooth(2.8, 4.0, tt); FX.uDust.value = 0.35 * smooth(3.0, 4.2, tt);
      const fr = smooth(MARS_FROST, MARS_FROST + 1.3, tt);
      U.uFrost.value = 0.85 * fr; FX.uFrost.value = 0.22 * fr;
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
      const b = smooth(VEN_FIRE, VEN_FIRE + 3.2, tt);
      U.uBurn.value = b;
      // you hold the burning umbrella out at arm's length, leaning away from it
      const away = smooth(VEN_FIRE + 0.2, VEN_FIRE + 0.9, tt);
      apex.add(new THREE.Vector3(-0.42 * away, 0.08 * away, 0.38 * away)); down.add(new THREE.Vector3(0.25 * away, 0, -0.32 * away)).normalize();
      q.lean = -0.1 * away; q.twist = 0.15 * away; q.head[1] -= 0.25 * away;
      windL = 0.05;
      U.uFlut.value = 0.08;
    } else if (key === 'titan') {
      const k = smooth(0.3, 0.9, tt);
      const fr = smooth(TIT_FREEZE, TIT_FREEZE + 1.2, tt);
      q.head = [lerp(-0.3, -0.75, k * (1 - fr)) + 0.25 * fr, -0.25 * fr];
      // a hand out, palm up, catching drops; then hugging yourself in the cold
      q.holdL = youLocal(lerp(0.22, 0.5, k * (1 - fr)), lerp(1.0, 1.28, k) - 0.1 * fr, lerp(0.1, 0.42, k * (1 - fr)), new THREE.Vector3()); q.poleL = youLocal(0.6, 0.9, -0.1, new THREE.Vector3()); q.curlL = 0.15 + 0.6 * fr;
      U.uWet.value = smooth(0.4, 1.5, tt); U.uFrost.value = 0.5 * fr; FX.uFrost.value = 0.18 * fr;
      U.uFlut.value = 0.05;
    } else if (key === 'saturn') {
      const k = smooth(0.0, 0.3, tt);
      U.uFlip.value = smooth(SAT_FLIP, SAT_FLIP + 0.16, tt);
      U.uFlut.value = 0.6 + 1.6 * k; windL = 1.6 * k;
      U.uBend.value = 0.25 * smooth(1.2, 2.6, tt);
      q.roll = -0.2 * k; q.sink = 0.1 * k; q.hunch = 0.2 * k; q.head = [0.25 * k, 0.5 * k];
      q.holdL = youLocal(0.06, 1.62, 0.24, new THREE.Vector3()); q.poleL = youLocal(0.5, 1.0, -0.1, new THREE.Vector3()); q.curlL = 0.5;
      // the wind drags the umbrella down to your right; then it's gone
      const drag = k + 0.3 * smooth(1.5, 2.8, tt);
      apex.add(new THREE.Vector3(-0.45 * drag + 0.05 * Math.sin(tt * 13), -0.12 * drag, 0.05 * Math.sin(tt * 17)));
      down.add(new THREE.Vector3(0.55 * drag, 0, 0)).normalize();
      if (tt > SAT_RIP) {
        const t = tt - SAT_RIP;
        held = false;
        flying = { t, acc: 30, vmax: 70, up: 2.6, spinK: 8 };
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
        apexW.addScaledVector(RT, 0.22 * t * t + 7 * t2 * t2).y += 0.6 * t * t + 4 * t2 * t2;
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
      const out = { exp: L.exp, shimmer: 0, veil: [1, 1, 1, 0], shake: 0, jolt: 0 };
      fire.begin(); smoke.begin(); glows.begin(); bolts.begin(); parts.begin();
      parts.mat.uniforms.uT.value = v;
      // ---- reset the shared weather on surfaces ----
      H.uFrost.value = 0; H.uDust.value = 0; H.uWetK.value = 0; H.uCharK.value = 1;
      H.uTK.value = 300; H.uAmbK.value = 300; H.uTKP.value = 300; H.uAmbKP.value = 300; H.uGlowGain.value = 0;
      H.uSunW.value.copy(SUN_DIR);
      GU.uTime.value = v; GU.uStream.value = 0; GU.uScorchG.value = 0; GU.uWindD.value.set(RT.x, RT.z);
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
      su.uBoil.value = 0; su.uTear.value = 0; su.uWindD.value.set(RT.x, RT.z); su.uFlash.value = 0;
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
        const R = marsR(tt);
        const w = walls[0];
        const inside = smooth(9, 3.0, R);                  // 0 before it reaches you, 1 once you're in it
        w.mesh.visible = R > 2.5;
        w.u.uKind.value = 1; w.u.uR.value = Math.max(R, 2.5); w.u.uSpan.value = 1.55; w.u.uH.value = 150; w.u.uTop.value = 1; w.u.uAlpha.value = 1 - smooth(8, 3, R);
        w.u.uLit.value.setRGB(0.95, 0.56, 0.32); w.u.uDark.value.setRGB(0.26, 0.1, 0.04); w.u.uHazeC.value.setRGB(...L.haze); w.u.uHazeK.value = 0.06;
        w.u.uScale.value = 0.35 + 0.65 * smooth(5, 200, R);
        // the dust: thick around you once it's here, thinning as the frost comes
        const thin = smooth(MARS_FROST - 0.2, MARS_FROST + 1.2, tt);
        const dust = inside * (1 - 0.8 * thin);
        scene.fog.color.setRGB(0.66, 0.38, 0.2);
        scene.fog.density = L.fogD + 0.075 * dust;
        out.veil = [0.62, 0.34, 0.17, 0.45 * dust];
        sun.intensity *= 1 - 0.75 * dust; hemi.intensity *= 1 - 0.25 * dust;
        // a rolling foot of dust where the wall meets the sand (puffs along its front)
        if (R > 3) for (let j = 0; j < 110; j++) {
          const a = hash(j, 6.6), b = hash(j, 7.7);
          const l = (a * 2 - 1) * (R * 0.75 + 4);
          const ph = (tt * 0.8 + b) % 1;
          const p = toW(R - 1 - 4 * ph, l, 0);
          p.y = landY(p.x) + 0.5 + ph * 5;
          smoke.puff(p.x, p.y, p.z, 2 + 4 * ph + R * 0.03, 0.5 * Math.sin(Math.PI * ph) * smooth(2.5, 8, R), 0.45 + 0.3 * b, 0, a);
        }
        // dust streaming past, red-brown
        const n = Math.round(600 + 1800 * inside);
        box(n, 3.3, tt, 0.6, 45, 0, 7, 0, 18, 0.5, (x, y, z, j, f, d) => {
          const near = f < R ? 1 : 0.3;
          parts.add(x, y, z, 0.02 + 0.02 * d, RT.x * (14 + 10 * d), 0.5, RT.z * (14 + 10 * d), 1, 0.7, 0.42, 0.24, (0.12 + 0.35 * inside) * near * (1 - 0.7 * thin), d);
        });
        // sand on the move before it, dust settling on everything after
        H.uDust.value = 0.65 * smooth(2.6, 4.2, tt);
        GU.uStream.value = 0.5 * smooth(0, 1.5, tt) * (1 - thin);
        // the frost
        H.uFrost.value = 0.85 * smooth(MARS_FROST, MARS_FROST + 1.4, tt);
        su.uChop.value = 0.6;
        // frost sparkles near you
        if (thin > 0) box(260, 8.8, 0, 1, 14, 0.02, 0.06, 0, 0, 0, (x, y, z, j, f, d) => { const tw = Math.max(0, Math.sin(tt * 3 + d * 40)); parts.add(x, landY(x) + 0.03, z, 0.012, 0, 0, 0, 3, 1.5, 1.7, 2.0, thin * tw * tw * 0.6, d); });
        out.shake = 0.1 + 0.5 * inside * (1 - thin);
      } else if (key === 'venus') {
        const k = smooth(0.05, 1.2, tt);
        su.uBoil.value = k; su.uChop.value = 0.4;
        // the whole sea steaming: a near bank and a far one
        const w0 = walls[0], w1 = walls[1];
        w0.mesh.visible = w1.mesh.visible = true;
        w0.u.uKind.value = 2; w0.u.uR.value = 120 - 40 * smooth(0, 6, tt); w0.u.uSpan.value = 1.5; w0.u.uH.value = 70; w0.u.uTop.value = 0.25 + 0.75 * smooth(0.2, 2.5, tt); w0.u.uAlpha.value = 0.95 * k;
        w0.u.uLit.value.setRGB(1.05, 1.0, 0.88); w0.u.uDark.value.setRGB(0.82, 0.74, 0.58); w0.u.uHazeC.value.setRGB(...L.fog); w0.u.uHazeK.value = 0.15; w0.u.uY0.value = -2;
        w1.u.uKind.value = 2; w1.u.uR.value = 700; w1.u.uSpan.value = 1.5; w1.u.uH.value = 520; w1.u.uTop.value = 0.3 + 0.7 * smooth(0.3, 3, tt); w1.u.uAlpha.value = 0.95 * k;
        w1.u.uLit.value.setRGB(1.05, 0.97, 0.82); w1.u.uDark.value.setRGB(0.85, 0.72, 0.5); w1.u.uHazeC.value.setRGB(...L.fog); w1.u.uHazeK.value = 0.4; w1.u.uY0.value = -5;
        // steam boiling off the shallows right in front of you
        for (let j = 0; j < 220; j++) {
          const a = hash(j, 9.1), b = hash(j, 9.7);
          const ph = (tt * (0.35 + 0.2 * b) + a) % 1;
          const p = toW(25 + 70 * Math.pow(b, 1.3), (a * 2 - 1) * (12 + 30 * b), 0);
          smoke.puff(p.x, 0.5 + ph * (8 + 14 * b), p.z, 2 + ph * 7, 0.45 * k * Math.sin(Math.PI * ph), 1.0, 0, a);
        }
        // the heat: everything scorches (the sand doesn't burn, it bleaches)
        const T = lerp(300, 737, smooth(0, 2.4, tt));
        H.uTK.value = T; H.uAmbK.value = T; H.uTKP.value = T; H.uAmbKP.value = T;
        GU.uScorchG.value = 0.4 * smooth(0, 2.5, tt);
        out.shimmer = 1.6 * smooth(0.0, 0.8, tt);
        scene.fog.density = L.fogD * (1 + 1.2 * smooth(0.5, 5, tt));
        // your umbrella: smoking, then flames along its burning edge, embers flying up
        const b = smooth(VEN_FIRE, VEN_FIRE + 3.2, tt);
        const pre = smooth(0.8, VEN_FIRE, tt) * (1 - smooth(VEN_FIRE + 2.5, VEN_FIRE + 3.5, tt));
        for (let j = 0; j < 26; j++) {
          const ph = (tt * 0.8 + j / 26) % 1, a = hash(j, 3.9);
          const pt = umb.canopyPoint(v3, 0.5 + 0.5 * a, a * 40);
          smoke.puff(pt.x + ph * 0.3, pt.y + 0.05 + ph * 1.8, pt.z, 0.06 + ph * 0.4, 0.3 * pre * Math.sin(Math.PI * ph), 0.2, 0.3 * b, a);
        }
        if (b > 0 && b < 0.999) {
          const edge = Math.max(0.05, 1.15 - b * 1.4);
          for (let j = 0; j < 28; j++) {
            const a = (j / 28) * Math.PI * 2 + 0.1 * Math.sin(tt * 3 + j);
            const pt = umb.canopyPoint(v3, Math.min(1, edge + 0.04 * Math.sin(j * 2.3)), a);
            fire.add(pt.x, pt.y - 0.02, pt.z, 0.22, 0.28 + 0.2 * Math.abs(Math.sin(j * 1.7 + tt * 4)), Math.sin(Math.PI * Math.min(1, b * 1.15)) * 0.95, 0.3 + j * 0.07);
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
        // the sea freezes out from the shore
        const fz = tt - TIT_FREEZE;
        su.uFreeze.value = fz > 0 ? 1 : 0;
        su.uFreezeR.value = fz > 0 ? 4500 * Math.pow(smooth(0, 2.4, fz), 1.6) + 40 * smooth(0, 0.25, fz) : 0;
        su.uFrozenT.value = st.land + TIT_FREEZE;
        su.uChop.value = 0.15;
        H.uWetK.value = 0.7 * smooth(0.5, 2, tt);
        H.uFrost.value = 0.45 * smooth(TIT_FREEZE, TIT_FREEZE + 1.5, tt);
        // ice cracking white at the front as it runs out
        if (fz > 0 && fz < 3) for (let j = 0; j < 60; j++) {
          const a = hash(j, 1.3), ph = (fz * 2 + a) % 1;
          const p = toW(24 + su.uFreezeR.value * (0.9 + 0.2 * a), (a * 2 - 1) * (10 + su.uFreezeR.value * 0.5), 0);
          if (su.uFreezeR.value < 400) smoke.puff(p.x, 0.3 + ph * 2, p.z, 0.6 + ph * 2.5, 0.3 * Math.sin(Math.PI * ph) * smooth(3, 0, fz), 0.95, 0, a);
        }
        // the drops: up to a centimetre across, falling ~1.6 m/s (6x slower than rain on Earth), lit amber
        const rk = smooth(0.0, 0.8, tt);
        frust(1100, 7.1, tt, 0.3, 10, 0.3, -1.6, (x, y, z, j, f, d) => {
          const r = 0.004 + 0.001 * d;                     // (up to a centimetre across)
          parts.add(x, y, z, r * (1 + f * 0.03), 0, -1.6, 0, 2, 0.42, 0.27, 0.14, rk, d);
        });
        box(700, 7.9, tt, 14, 60, 0.2, 14, 0, 0.35, -1.6, (x, y, z, j, f, d) => parts.add(x, y, z, 0.012 + 0.002 * f, 0, -1.6, 0, 2, 0.42, 0.27, 0.14, 0.8 * rk, d));
        // splashes on your umbrella: slow-motion crowns that rise and fall back
        for (let j = 0; j < 26; j++) {
          const period = 0.9 + 0.5 * hash(j, 6.1);
          const ph = (tt + hash(j, 6.3) * period) % period / period;
          const r0 = 0.25 + 0.7 * hash(j, 6.5), a0 = hash(j, 6.7) * 6.28 + Math.floor((tt + hash(j, 6.3) * period) / period) * 2.1;
          const c = umb.canopyPoint(v3, r0, a0);
          for (let m = 0; m < 7; m++) {
            const ang = m / 7 * 6.28 + j, sp = 0.18 + 0.06 * hash(m, j);
            const t = ph * 0.55;
            parts.add(c.x + Math.cos(ang) * sp * t, c.y + 0.01 + 0.9 * t - 3 * t * t, c.z + Math.sin(ang) * sp * t, 0.0075, 0, 0, 0, 2, 0.42, 0.27, 0.14, rk * (1 - ph), m);
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
      props.frame(key, tt, { fire, smoke, parts, glows, cam: camera });
      PEOPLE.forEach((p, j) => crowd.pose(j, personPose(p, key, tt)));
      crowd.commit();
      bolts.end(camera);
      fire.mat.uniforms.uTime.value = v; smoke.mat.uniforms.uTime.value = v;
      fire.end(); smoke.end(); glows.end(); parts.end();
      return out;
    },
  };
}
