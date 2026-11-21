// The whole scene for one stop at one moment: setStop(i, v, camera) poses everything for stop i at video time v
// (main.js draws one stop, or both sides of a wipe, one after the other). Each stop starts fresh at its wipe: the
// park as it was on Earth, and from that moment this world's gravity.
import * as THREE from 'three';
import { makePark, GU } from './park.js';
import { makeTrees } from './trees.js';
import { makeCity } from './city.js';
import { makeFleet } from './cars.js';
import { makeCrowd } from './crowd.js';
import { makeSmoke } from './smoke.js';
import { makeGlows } from './glows.js';
import { makeSky } from './sky.js';
import { makeParts } from './parts.js';
import { makeYou } from './you.js';
import { H, patchHeat } from './heat.js';
import { PEOPLE, personPose } from './people.js';
import { YOU, FACE_YAW, HOOP, FOUNTAIN, CARS, BUILDINGS, COURT } from './layout.js';
import { STOPS } from './timeline.js';
import {
  GRAV, MOON_DUNK, MOON_ALL, MOON_YOU, V_JUMP, PLU_TAKE, PLU_VX, JUP_BUCKLE, SUN_FLAT, SUN_HOOP, SUN_BOARD_HIT, SUN_TYRES,
  WD_CRUSH, WD_BLDG0, WD_BLDG_STEP, WD_CRACK, NS_FILM, NS_FLARE, sqWD, sqNS,
} from './sched.js';
import { smooth, clamp, lerp } from './util.js';

const hash = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
// the Sun: high, behind you and to the left (the court is lit from the front, shadows fall ahead and to the right)
const SUN_DIR = new THREE.Vector3(-0.45, 0.66, 0.6).normalize();
const gE = 9.8;
const GV = { moon: GRAV.moon, pluto: GRAV.pluto, jupiter: GRAV.jupiter, sun: GRAV.sun, wd: GRAV.sun, ns: GRAV.sun };

// your jump: where your feet are t s into the stop (Moon, Pluto), and how high
export function youJump(key, tt) {
  if (key === 'moon') {
    const t = tt - MOON_YOU, v = 3.1;
    const h = t > 0 ? Math.max(0, v * t - 0.5 * GRAV.moon * t * t) : 0;
    return { x: YOU.x, z: YOU.z, h, t };
  }
  if (key === 'pluto') {
    const t = tt - PLU_TAKE;
    const h = t > 0 ? Math.max(0, V_JUMP * t - 0.5 * GRAV.pluto * t * t) : 0;
    const tc = Math.max(0, t);
    return { x: YOU.x - 0.21 * tc, z: YOU.z - PLU_VX * tc, h, t };
  }
  return { x: YOU.x, z: YOU.z, h: 0, t: 0 };
}

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patchHeat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }), `plain-${rough}-${extra.metalness || 0}-${extra.vertexColors ? 1 : 0}-${extra.emissive ? 1 : 0}`);
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color });
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 10, far: 400 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9cbbe6, 0x8a8070, 1.2);
  scene.add(hemi);
  const sky = makeSky();
  scene.add(sky.mesh);
  const park = makePark(scene, { plainMat, shadowy });
  const trees = makeTrees(scene, { plainMat, shadowy });
  const city = makeCity(scene);
  const fleet = makeFleet(scene, CARS.length, { plainMat, glowMat, shadowy });
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const crowd = makeCrowd(scene, PEOPLE.length, patchHeat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'crowd'));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));
  const smoke = makeSmoke(scene, 1400);
  const glows = makeGlows(scene, 400);
  const parts = makeParts(scene, 12000);
  const you = makeYou(scene, { hoodie: 0xd8352a });
  const youSq = new THREE.Group(); scene.add(youSq); youSq.add(you.root);
  you.root.rotation.order = 'YXZ';
  // the ball
  const ballTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#d4621f'; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#1a1210'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(0, 64); x.lineTo(256, 64); x.stroke();
    for (const u of [64, 192]) { x.beginPath(); x.moveTo(u, 0); x.lineTo(u, 128); x.stroke(); }
    x.beginPath(); x.ellipse(0, 64, 40, 64, 0, -Math.PI / 2, Math.PI / 2); x.stroke(); x.beginPath(); x.ellipse(256, 64, 40, 64, 0, Math.PI / 2, Math.PI * 1.5); x.stroke();
    x.beginPath(); x.ellipse(128, 64, 40, 64, 0, 0, Math.PI * 2); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ball = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), patchHeat(new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.7 }), 'ball')));
  scene.add(ball);

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const youLocal = (x, y, z, out) => { you.root.updateMatrixWorld(true); return out.set(x, y, z).applyMatrix4(you.root.matrixWorld); };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3(), e4 = new THREE.Euler();

  // ---- the fountain's jets: the drops in flight now, under Earth's gravity until the wipe, this world's after ----
  const F = FOUNTAIN;
  const JETS = [{ p: [F.x, 1.3, F.z], v: [0, 6.57, 0], n: 1 }];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const dx = -Math.sin(a), dz = -Math.cos(a), sp = 5.42;
    JETS.push({ p: [F.x + Math.sin(a) * 2.6, 0.58, F.z + Math.cos(a) * 2.6], v: [dx * sp * 0.5, sp * 0.866, dz * sp * 0.5], n: 0.6 });
  }
  function fountain(key, tt, wetOut) {
    const g = GV[key];
    if (key === 'wd' || key === 'ns') return;
    const DT = 0.022, back = 2.6;
    let wet = 0;
    JETS.forEach((J, j) => {
      const first = Math.ceil((tt - Math.min(tt + back, 40)) / DT);
      for (let k = 0; k < 2000; k++) {
        const e = tt - k * DT;                                 // when this drop left the nozzle
        if (e < -back) break;
        const sj = hash(k + j * 977, 3.3), sj2 = hash(k + j * 977, 5.7);
        const vx = J.v[0] * (1 + 0.05 * (sj - 0.5)) + 0.15 * (sj2 - 0.5), vy = J.v[1] * (1 + 0.04 * (sj2 - 0.5)), vz = J.v[2] * (1 + 0.05 * (sj - 0.5)) + 0.15 * (sj - 0.5);
        let x, y, z, vyN;
        if (e >= 0) { const t = tt - e; x = J.p[0] + vx * t; z = J.p[2] + vz * t; y = J.p[1] + vy * t - 0.5 * g * t * t; vyN = vy - g * t; }
        else {
          const a = -e; let y1 = J.p[1] + vy * a - 0.5 * gE * a * a; const vy1 = vy - gE * a;
          if (y1 < 0.38 && vy1 < 0) continue;                  // (landed back in the basin before the switch)
          const t = tt; x = J.p[0] + vx * (a + t); z = J.p[2] + vz * (a + t); y = y1 + vy1 * t - 0.5 * g * t * t; vyN = vy1 - g * t;
        }
        const inBasin = Math.hypot(x - F.x, z - F.z) < F.r - 0.3;
        const floor = inBasin ? F.water : 0.02;
        if (y < floor) {
          // landed: a little splash where it came down (only the recent ones)
          const tl = vyN < 0 ? (floor - y) / Math.max(0.5, -vyN) : 0;
          if (tl < 0.25 && k % 2 === 0) parts.add(x, floor + 0.05 + tl * 0.6, z, 0.05 + tl * 0.5, 0, 0.6, 0, 0, 0.85, 0.9, 0.95, 0.35 * (1 - tl / 0.25), sj);
          if (!inBasin) wet += 1;
          continue;
        }
        const big = Math.min(1.6, 0.6 + 0.012 * Math.abs(vyN));
        parts.add(x, y, z, (J.n > 0.9 ? 0.17 : 0.1) * (0.85 + 0.3 * sj), 0, 0, 0, 0, 0.8, 0.88, 0.97, 0.42, sj);      // (the stream's body: soft blobs that run together)
        parts.add(x, y, z, (0.075 * big * J.n + 0.03) * (0.8 + 0.5 * sj2), vx * 2.5, vyN * 2.5, vz * 2.5, 1, 0.86, 0.93, 1.0, 0.8, sj);
        if (k % 2 === 0) parts.add(x + (sj - 0.5) * 0.3, y, z + (sj2 - 0.5) * 0.3, 0.25 + 0.2 * sj * J.n, 0, 0, 0, 0, 0.92, 0.96, 1.0, 0.12, sj2);       // (spray mist round the stream)
      }
    });
    wetOut.w = clamp(wet / 300);
  }

  // ---- you ----
  function placeYou(key, tt) {
    you.root.position.set(YOU.x, 0, YOU.z);
    you.root.rotation.set(0, FACE_YAW, 0);
    youSq.scale.set(1, 1, 1);
    const q = { head: [-0.2, 0], curlR: 0.4 };
    if (key === 'moon') {
      const J = youJump(key, tt);
      q.head = [-0.45, 0.1];
      // pumping a fist at the dunk, then crouch and up with everyone
      const fist = smooth(MOON_DUNK - 0.1, MOON_DUNK + 0.2, tt) * (1 - smooth(MOON_YOU - 0.5, MOON_YOU - 0.25, tt));
      if (fist > 0) { q.holdR = youLocal(-0.3, 1.95 + 0.08 * Math.sin(tt * 9), 0.15, new THREE.Vector3()); q.poleR = youLocal(-0.7, 1.2, -0.2, new THREE.Vector3()); q.curlR = 1; }
      const cr = smooth(MOON_YOU - 0.3, MOON_YOU - 0.05, tt) * (1 - smooth(MOON_YOU - 0.05, MOON_YOU + 0.1, tt));
      q.sink = 0.25 * cr;
      if (J.h > 0) {
        you.root.position.y = J.h;
        q.lift = [0.12 + 0.05 * Math.sin(J.t * 3), 0.2 + 0.05 * Math.sin(J.t * 2.5)];
        q.holdR = youLocal(-0.35, 2.05 + 0.1 * Math.sin(J.t * 2.4), 0.1, new THREE.Vector3()); q.poleR = youLocal(-0.8, 1.4, -0.2, new THREE.Vector3());
        q.holdL = youLocal(0.35, 2.0 + 0.1 * Math.sin(J.t * 2.1 + 1), 0.1, new THREE.Vector3()); q.poleL = youLocal(0.8, 1.4, -0.2, new THREE.Vector3());
        q.curlR = 0.3; q.curlL = 0.3; q.head = [-0.55, 0.15];
      }
      const land = J.t > 0 && J.h === 0 ? Math.exp(-(J.t - 2 * 3.1 / GRAV.moon) / 0.2) : 0;
      q.sink = Math.max(q.sink, 0.2 * clamp(land));
    } else if (key === 'pluto') {
      const J = youJump(key, tt);
      you.root.position.set(J.x, J.h, J.z);
      const cr = smooth(0.08, PLU_TAKE - 0.05, tt) * (1 - smooth(PLU_TAKE - 0.05, PLU_TAKE + 0.12, tt));
      q.sink = 0.3 * cr; q.hunch = 0.2 * cr;
      if (J.t > 0) {
        const k = smooth(0, 1.0, J.t);
        q.lift = [0.18 * k + 0.08 * Math.sin(J.t * 2.2) * k, 0.3 * k + 0.08 * Math.sin(J.t * 1.9 + 1) * k];
        q.holdR = youLocal(-0.75, 1.55 + 0.25 * Math.sin(J.t * 1.6), 0.25, new THREE.Vector3()); q.poleR = youLocal(-0.7, 1.0, -0.4, new THREE.Vector3());
        q.holdL = youLocal(0.75, 1.55 + 0.25 * Math.sin(J.t * 1.6 + 2), 0.25, new THREE.Vector3()); q.poleL = youLocal(0.7, 1.0, -0.4, new THREE.Vector3());
        q.curlR = 0.2; q.curlL = 0.2; q.head = [lerp(-0.2, 0.75, smooth(0.5, 2.5, J.t)), 0.1]; q.hunch = 0.15 * k;
        you.root.rotation.x = 0.12 * k;
      }
    } else if (key === 'jupiter') {
      const k = smooth(JUP_BUCKLE, JUP_BUCKLE + 0.2, tt) + 0.12 * Math.exp(-Math.max(0, tt - 0.26) / 0.12) * smooth(0.1, 0.26, tt);
      const up = smooth(3.9, 4.5, tt) * (1 - smooth(4.9, 5.15, tt));
      // down on your knees, bent over, hands braced on your thighs (the legs are set after the pose, below)
      q.sink = (0.43 - 0.2 * up) * k; q.hunch = (0.5 - 0.2 * up) * k; q.head = [0.4 * k, -0.15];
      q.holdR = youLocal(-0.13, 0.62 + 0.15 * up, 0.3, new THREE.Vector3()); q.poleR = youLocal(-0.6, 1.0, -0.3, new THREE.Vector3());
      q.holdL = youLocal(0.34, 0.62 + 0.15 * up, 0.3, new THREE.Vector3()); q.poleL = youLocal(0.8, 1.0, -0.3, new THREE.Vector3());
      q.kneel = k * (1 - 0.5 * up);
      q.curlR = 0.8; q.curlL = 0.8; q.roll = 0.03 * up * Math.sin(tt * 23);
    } else {
      // slammed flat on your front, arms flung forward
      const k = key === 'sun' ? smooth(SUN_FLAT, SUN_FLAT + 0.08, tt) : smooth(WD_CRUSH - 0.02, WD_CRUSH + 0.05, tt);
      you.root.rotation.set(1.53 * k, FACE_YAW, 0.05 * k);
      you.root.position.y = 0.14 * k;
      you.root.updateMatrixWorld(true);
      q.holdR = youLocal(lerp(-0.3, -0.72, k), lerp(1.0, 1.55, k), lerp(0.2, 0.06, k), new THREE.Vector3()); q.poleR = youLocal(-0.6, 1.1, 0.3, new THREE.Vector3());
      q.holdL = youLocal(lerp(0.5, 0.93, k), lerp(1.0, 1.5, k), lerp(0.2, 0.06, k), new THREE.Vector3()); q.poleL = youLocal(0.8, 1.1, 0.3, new THREE.Vector3());
      q.head = [-0.5 * k, 0.6 * k]; q.curlR = 0.2; q.curlL = 0.2;
      if (key === 'wd') youSq.scale.y = sqWD(tt);
      if (key === 'ns') youSq.scale.y = sqNS(tt);
    }
    you.pose(q);
    if (q.kneel) you.legs.forEach((L, i) => {
      // thighs straight down, shins flat on the court behind, feet stretched
      const k = q.kneel;
      L.hip.rotation.x = lerp(L.hip.rotation.x, -0.1, k); L.knee.rotation.x = lerp(L.knee.rotation.x, 1.56, k); L.ankle.rotation.x = lerp(L.ankle.rotation.x, 0.75, k);
    });
    you.root.updateMatrixWorld(true);
  }

  // ---- the ball ----
  function placeBall(key, tt, dunker) {
    ball.scale.set(1, 1, 1); ball.rotation.set(tt * 0.6, tt * 1.1, 0);
    const g = GV[key];
    if (key === 'moon') {
      if (tt < MOON_DUNK) { ball.position.set(dunker.x - 0.05, dunker.y + 2.32 * dunker.s, dunker.z - 0.15); return; }
      // slammed down through the hoop, then bouncing slowly across the court
      let t = tt - MOON_DUNK, y = HOOP.y + 0.25, vy = -3.2, z = HOOP.z, e = 0.72;
      for (let b = 0; b < 6; b++) {
        const disc = vy * vy + 2 * g * (y - 0.12);
        const tHit = (vy + Math.sqrt(disc)) / g;
        if (t < tHit) { y = y + vy * t - 0.5 * g * t * t; break; }
        t -= tHit; vy = Math.sqrt(disc) * e; y = 0.12;
      }
      ball.position.set(HOOP.x + 0.1 * (tt - MOON_DUNK), y, z + 0.55 * (tt - MOON_DUNK));
    } else if (key === 'pluto') {
      // a dribble that never comes back: it floats up past you
      const t = Math.max(0, tt - 0.3);
      ball.position.set(-0.9 + 0.12 * t, 0.95 + 3.0 * t - 0.5 * g * t * t, -9.0 - 0.25 * t);
    } else if (key === 'jupiter') {
      // a dribble: it slams down and dies in a few quick, low bounces
      let t = tt, y = 1.0, vy = -1.5, e = 0.6;
      for (let b = 0; b < 8; b++) {
        const disc = vy * vy + 2 * g * (y - 0.12);
        const tHit = (vy + Math.sqrt(disc)) / g;
        if (t < tHit) { y = y + vy * t - 0.5 * g * t * t; break; }
        t -= tHit; vy = Math.sqrt(disc) * e; y = 0.12; if (vy < 0.3) { vy = 0; t = 0; break; }
      }
      ball.position.set(2.6 + 0.35 * Math.min(tt, 1.2), Math.max(0.12, y), -9.3 + 0.2 * Math.min(tt, 1.2));
    } else ball.position.set(3.1, 0.12, -8.9);
  }

  const toward = (p, k) => p;  // (placeholder for readability)
  const wetOut = { w: 0 };
  return {
    sun, hemi, sky, park, trees, city, crowd, you, parts, smoke, glows,
    setStop(i, v, camera) {
      const st = STOPS[i], key = st.key, tt = v - st.land;
      const out = { exp: 1, shimmer: 0, veil: [1, 1, 1, 0], shake: 0, jolt: 0, streak: 0 };
      smoke.begin(); glows.begin(); parts.begin();
      parts.mat.uniforms.uT.value = v;
      // ---- defaults: a bright afternoon ----
      H.uFrost.value = 0; H.uDust.value = 0; H.uWetK.value = 0; H.uCharK.value = 0; H.uGlowGain.value = 1;
      H.uTK.value = 300; H.uAmbK.value = 300; H.uTKP.value = 300; H.uAmbKP.value = 300;
      H.uSunW.value.copy(SUN_DIR); H.uFrostF.value = -1e5; H.uFrostAll.value = 0;
      H.uSq.value = 1; H.uSqY.value = 0;
      GU.uCrack.value = 0; GU.uCrackR.value = 0; GU.uCrackGlow.value = 0; GU.uPlate.value = 0; GU.uFilm.value = 0; GU.uWet.value = 0;
      GU.uCam.value.set(camera.position.x, camera.position.z); GU.uTime.value = v;
      const s = sky.u;
      s.uTop.value.setRGB(0.13, 0.32, 0.72); s.uLow.value.setRGB(0.6, 0.74, 0.92); s.uHaze.value.setRGB(0.78, 0.85, 0.93); s.uHazeK.value = 0.55;
      s.uSunD.value.copy(SUN_DIR); s.uSunI.value = 0; s.uSunGlow.value = 0.2;
      s.uCloud.value = 0.42; s.uCloudLit.value.setRGB(1.05, 1.05, 1.03); s.uCloudDark.value.setRGB(0.62, 0.68, 0.78); s.uStreak.value = 0.4; s.uCloudScale.value = 1;
      s.uDrift.value.set(4 * v, -2 * v); s.uFlash.value = 0; s.uT.value = v; s.uRingK.value = 0;
      sun.color.setRGB(1.0, 0.95, 0.86); sun.intensity = 2.6; sun.shadow.intensity = 1;
      hemi.color.setRGB(0.62, 0.74, 0.95); hemi.groundColor.setRGB(0.42, 0.4, 0.34); hemi.intensity = 1.25;
      const look = v1.set(0, 0, -18);
      sun.target.position.copy(look); sun.position.copy(look).addScaledVector(SUN_DIR, 150);
      scene.fog.color.setRGB(0.74, 0.82, 0.92); scene.fog.density = 0.0055;
      city.U.uSkyHi.value.setRGB(0.25, 0.45, 0.8); city.U.uSkyLo.value.setRGB(0.75, 0.82, 0.92);

      // ---- the park, the trees, the cars, the buildings ----
      const th = park.frame(key, tt);
      const burst = (tr, L, t) => {
        // leaves and splinters where a limb breaks or a crown hits the ground
        const n = 30;
        for (let j = 0; j < n; j++) {
          const a = hash(j, tr.x * 3.1 + (L ? L.az : 7)), b = hash(j, tr.z + 1.3), c = hash(j, 9.1 + (L ? L.len : 2));
          const cx = tr.x + (L ? Math.sin(L.az) * L.len * 0.6 : tr.fx * tr.Ht * 0.6), cz = tr.z + (L ? Math.cos(L.az) * L.len * 0.6 : tr.fz * tr.Ht * 0.6);
          const cy = L ? Math.max(0.5, tr.hs + L.y0 - 2.5 * t) : 1.0;
          parts.add(cx + (a - 0.5) * 3 * (0.3 + t * 4), cy + (b - 0.2) * 2 * (0.3 + t * 3) - 6 * t * t, cz + (c - 0.5) * 3 * (0.3 + t * 4), 0.05 + 0.04 * a, (a - 0.5) * 4, 1 - 9 * t, (c - 0.5) * 4, 4,
            0.2 + 0.15 * b, 0.42 + 0.15 * b, 0.12, (1 - t / (L ? 0.5 : 0.6)), a);
        }
      };
      trees.frame(key, tt, burst);
      // the cars: settle on Jupiter; on the Sun their tyres burst one after another (the bodies drop onto the rims)
      CARS.forEach((c, k) => {
        let sy = 1, dy = 0;
        if (key === 'jupiter') sy = 1 - 0.045 * smooth(0, 0.18, tt) - 0.015 * Math.exp(-tt / 0.2) * Math.sin(tt * 30) * smooth(0, 0.05, tt);
        if (key === 'sun') {
          const t0 = SUN_TYRES + 0.085 * ((k * 5) % CARS.length) * (12 / CARS.length);
          const T = key === 'sun' ? tt : 99;
          sy = 0.94 - 0.18 * smooth(t0, t0 + 0.05, T) + 0.03 * Math.exp(-Math.max(0, T - t0 - 0.05) / 0.08) * Math.sin((T - t0) * 60) * smooth(t0, t0 + 0.05, T);
          if (key === 'sun' && T > t0 && T < t0 + 0.6) {
            const d = T - t0;
            for (let j = 0; j < 18; j++) {           // a puff of dust and rubber at each wheel, glass bursting out
              const a = hash(j + k * 31, 2.2), b = hash(j + k * 31, 4.4);
              const wx = c.x + (j % 2 ? 1.6 : -1.6), wz = c.z + (j % 4 < 2 ? 0.9 : -0.9);
              parts.add(wx + (a - 0.5) * d * 6, 0.2 + b * d * 2 - 8 * d * d, wz + (b - 0.5) * d * 4, 0.08 + d * 0.6, 0, 0, 0, 0, 0.5, 0.47, 0.42, 0.45 * (1 - d / 0.6), a);
              if (j < 10) parts.add(c.x + (a - 0.5) * 3, 1.1 - 80 * d * d, c.z + (b - 0.5) * 1.6, 0.035, 0, -30, 0, 3, 1.6, 1.7, 1.8, (1 - d / 0.25) * (d < 0.25 ? 1 : 0), a);
            }
          }
        }
        m4.makeRotationY(c.yaw).premultiply(new THREE.Matrix4().makeScale(1, sy, 1)).setPosition(c.x, dy, c.z);
        fleet.set(k, m4, false);
      });
      fleet.commit();
      // the buildings: on the Sun their windows burst ~4.5 s in (glass raining down); the white dwarf pancakes them
      // one after another; the neutron star leaves a film
      let crushF = () => 0, bst = 0;
      if (key === 'sun') {
        bst = 0.75 * smooth(4.3, 5.0, tt);
        if (tt > 4.3 && tt < 6.2) for (let j = 0; j < 500; j++) {
          const bi = j % BUILDINGS.length, b = BUILDINGS[bi];
          if (b.back) continue;
          const t0 = 4.3 + 0.7 * hash(j, 1.1), t = tt - t0;
          if (t < 0 || t > 0.5) continue;
          const y0 = 4.5 + hash(j, 2.2) * (b.h - 5.5), y = y0 - 0.5 * 274 * 0.12 * t * t;
          if (y < 0.1) continue;
          parts.add(b.x + (hash(j, 3.3) - 0.5) * b.w, y, b.z + 0.4 + hash(j, 4.4) * 1.5, 0.05 + 0.04 * hash(j, 5.5), 0, -274 * 0.12 * t, 0, 5, 0.75, 0.85, 0.95, 0.9, hash(j, 6.6));
          if (j % 3 === 0) parts.add(b.x + (hash(j, 3.3) - 0.5) * b.w, y, b.z + 0.5, 0.06, 0, 0, 0, 3, 2.0, 2.1, 2.3, 0.6, hash(j, 7.7));
        }
      }
      if (key === 'wd') {
        // left to right, the near row and the tall row behind interleaved
        crushF = (bi) => { const b = BUILDINGS[bi]; const t0 = WD_BLDG0 + WD_BLDG_STEP * ((b.x + 50) / 7.5) + (b.back ? 0.12 : 0); return smooth(t0, t0 + 0.32, tt); };
        BUILDINGS.forEach((b, bi) => {
          const t0 = WD_BLDG0 + WD_BLDG_STEP * ((b.x + 50) / 7.5) + (b.back ? 0.12 : 0), t = tt - t0;
          if (t < 0.15 || t > 3.0) return;
          // a sheet of dust shoved out low along the street from its foot
          for (let j = 0; j < 14; j++) {
            const a = hash(j + bi * 13, 1.7), c = hash(j + bi * 13, 2.9);
            const r = (1.5 + 6 * Math.sqrt(t - 0.15)) * (0.5 + 0.6 * c);
            const px = b.x + (a - 0.5) * b.w * 1.1, pz = b.z - b.d * 0.4 + (j % 2 ? 1 : -0.3) * r * 0.9;
            smoke.puff(px, 0.4 + 0.5 * c, pz, 2.4 + 2.5 * c + 2 * t, 0.55 * (1 - smooth(1.2, 3.0, t)) * smooth(0.15, 0.3, t), 0.62, 0, a, 0.3);
          }
        });
      }
      if (key === 'ns') crushF = () => 1.063 * smooth(NS_FILM, NS_FILM + 0.14, tt);
      city.set(crushF, bst);

      // ---- the crowd, you, the ball, the fountain ----
      PEOPLE.forEach((p, j) => { const o = personPose(p, key, tt); crowd.pose(j, o); if (p.kind === 'dunker') { p._x = o.x; p._y = o.y; p._z = o.z; } });
      crowd.commit();
      placeYou(key, tt);
      const dk = PEOPLE.find((p) => p.kind === 'dunker');
      placeBall(key, tt, { x: dk._x, y: dk._y, z: dk._z, s: dk.s });
      fountain(key, tt, wetOut);
      GU.uWet.value = key === 'moon' || key === 'pluto' ? 0.5 + 0.5 * wetOut.w : 0;

      // ====================================================================================== the worlds
      if (key === 'moon') {
        out.shake = 0.05;
      } else if (key === 'pluto') {
        out.shake = 0.04;
      } else if (key === 'jupiter') {
        out.jolt = 0.9 * Math.exp(-Math.max(0, tt - 0.08) / 0.18) * smooth(0, 0.08, tt) + 0.35 * Math.max(...[2.75, 2.95, 3.2, 3.45, 3.9].map((t) => Math.exp(-Math.abs(tt - t - 0.3) / 0.1)));
        out.shake = 0.12;
      } else if (key === 'sun') {
        out.jolt = 1.3 * Math.exp(-Math.max(0, tt - 0.05) / 0.2) * smooth(0, 0.05, tt) + 0.7 * Math.exp(-Math.abs(tt - SUN_BOARD_HIT) / 0.08) + 0.6 * Math.exp(-Math.abs(tt - 2.95) / 0.12);
        out.shake = 0.25 + 0.4 * Math.exp(-Math.abs(tt - 3.0) / 0.4);
        // the backboard hits the court and bursts: glass and dust
        const bt = tt - SUN_BOARD_HIT;
        if (bt > 0 && bt < 1.2) {
          const c = park.boardCentre(v2);
          for (let j = 0; j < 220; j++) {
            const a = hash(j, 8.1) * 6.283, sp = 1.5 + 5 * hash(j, 8.3), up = 0.6 + 1.2 * hash(j, 8.5);
            const t = bt, tl = Math.min(t, up / (274 * 0.05) * 2);
            const y = Math.max(0.03, 0.1 + up * t - 0.5 * 274 * 0.05 * t * t);
            const sl = Math.min(t, 0.35);
            parts.add(c.x + Math.cos(a) * sp * sl, y, c.z + Math.sin(a) * sp * sl, 0.03 + 0.03 * hash(j, 8.7), 0, 0, 0, 5, 0.85, 0.92, 1.0, 1, hash(j, 8.9));
            if (j % 4 === 0 && bt < 0.4) parts.add(c.x + Math.cos(a) * sp * sl, y + 0.05, c.z + Math.sin(a) * sp * sl, 0.05, 0, 0, 0, 3, 2.2, 2.3, 2.5, 1 - bt / 0.4, hash(j, 9.1));
          }
          for (let j = 0; j < 12; j++) { const a = hash(j, 4.1); smoke.puff(c.x + (a - 0.5) * 2.5, 0.3, c.z + (hash(j, 4.3) - 0.5) * 1.5, 0.6 + 1.6 * Math.min(bt, 0.6), 0.4 * (1 - bt / 1.2), 0.7, 0, a, 0.5); }
        }
      } else if (key === 'wd') {
        const sq = sqWD(tt);
        H.uSq.value = sq; sun.shadow.intensity = smooth(0.4, 0.85, sq);
        const ck = smooth(WD_CRACK, WD_CRACK + 0.7, tt);
        GU.uCrack.value = smooth(WD_CRACK - 0.05, WD_CRACK + 0.1, tt); GU.uPlate.value = ck * (window.__noPlate ? 0 : 1); GU.uCrackR.value = 70 * Math.pow(smooth(WD_CRACK - 0.05, WD_CRACK + 0.8, tt), 0.7);
        GU.uCrackGlow.value = 2.5 * smooth(WD_CRACK, WD_CRACK + 2.5, tt);
        H.uAmbK.value = lerp(300, 820, smooth(WD_CRACK + 0.5, 7.5, tt));
        out.jolt = 1.4 * Math.exp(-Math.max(0, tt - WD_CRUSH) / 0.2) * smooth(0, WD_CRUSH, tt) + 1.3 * Math.exp(-Math.max(0, tt - WD_CRACK) / 0.25) * smooth(WD_CRACK - 0.05, WD_CRACK, tt);
        out.shake = 0.3 + 0.5 * smooth(0.3, 1.4, tt) * (1 - smooth(2.0, 2.8, tt)) + 0.5 * Math.exp(-Math.max(0, tt - WD_CRACK) / 1.5) * smooth(WD_CRACK - 0.05, WD_CRACK, tt);
        // the sky hazes over with dust
        scene.fog.color.setRGB(0.62, 0.6, 0.58); scene.fog.density = 0.0055 + 0.012 * smooth(0.4, 2.0, tt) * (1 - 0.5 * smooth(3, 7, tt));
        s.uHaze.value.lerp(new THREE.Color(0.62, 0.58, 0.54), smooth(0.4, 2.0, tt) * 0.6); s.uHazeK.value = 0.55 + 0.3 * smooth(0.4, 2.0, tt);
        // sparks spitting from the glowing seams
        if (tt > WD_CRACK) for (let j = 0; j < 160; j++) {
          const a = hash(j, 6.1), b = hash(j, 6.7), ph = (tt * 1.3 + hash(j, 7.3)) % 1;
          const f = 4 + 40 * Math.pow(a, 1.6), x = (b - 0.5) * f * 0.8;
          parts.add(x, 0.05 + ph * 0.4, -f, 0.03 + 0.02 * a, 0, 0.5, 0, 3, 2.4, 0.9, 0.25, Math.sin(Math.PI * ph) * GU.uCrackGlow.value * 0.3, a);
        }
      } else if (key === 'ns') {
        const sq = sqNS(tt);
        H.uSq.value = sq; sun.shadow.intensity = 0;
        GU.uFilm.value = smooth(NS_FILM, NS_FILM + 0.2, tt);
        // it heats till it glows: red at once, brighter and yellower from ~3 s, white at the end
        const T = lerp(300, 1750, smooth(NS_FILM, NS_FILM + 0.3, tt)) + 250 * smooth(0.8, NS_FLARE, tt) + 1800 * smooth(NS_FLARE, NS_FLARE + 2.2, tt) + 2500 * smooth(5.5, 8.8, tt);
        H.uAmbK.value = T; H.uTK.value = T;
        const dark = smooth(NS_FILM, NS_FILM + 1.2, tt);
        s.uTop.value.lerp(new THREE.Color(0.0, 0.0, 0.005), dark); s.uLow.value.lerp(new THREE.Color(0.05, 0.02, 0.015), dark); s.uHaze.value.lerp(new THREE.Color(0.2, 0.06, 0.02), dark);
        s.uCloud.value *= 1 - dark; s.uSunGlow.value = 0;
        sun.intensity *= 1 - 0.85 * dark; hemi.intensity *= 1 - 0.8 * dark;
        scene.fog.color.setRGB(0.3, 0.1, 0.03); scene.fog.density = 0.004;
        out.exp = 1 - 0.25 * smooth(NS_FLARE, NS_FLARE + 2, tt) + 2.5 * smooth(6.5, 8.95, tt);
        out.jolt = 1.6 * Math.exp(-Math.max(0, tt - NS_FILM) / 0.25) * smooth(0, NS_FILM, tt) + 0.9 * Math.exp(-Math.abs(tt - NS_FLARE) / 0.2);
        out.shake = 0.35 + 0.3 * smooth(NS_FLARE, NS_FLARE + 1, tt);
        out.shimmer = 1.2 * smooth(0.5, 2.5, tt);
        // a flash as it's crushed
        out.veil = [1.0, 0.75, 0.45, 0.85 * Math.exp(-Math.max(0, tt - NS_FILM) / 0.18) * smooth(0, NS_FILM, tt) + 0.35 * smooth(6.8, 8.9, tt)];
        // sparks of heat flickering over the film
        for (let j = 0; j < 220; j++) {
          const a = hash(j, 3.1), b = hash(j, 3.7), ph = (tt * 0.9 + hash(j, 4.3)) % 1;
          const f = 3 + 60 * Math.pow(a, 1.8), x = (b - 0.5) * f * 0.8;
          parts.add(x, 0.03 + ph * 0.25, -f, 0.02 + 0.015 * f * 0.05, 0, 0, 0, 3, 2.4, 1.3, 0.5, Math.sin(Math.PI * ph) * 0.5 * smooth(0.3, 1.5, tt), a);
        }
      }

      smoke.mat.uniforms.uLight.value.setRGB(1.0, 0.98, 0.95);
      smoke.mat.uniforms.uSun.value.copy(SUN_DIR);
      smoke.mat.uniforms.uTime.value = v;
      glows.end(); parts.end(); smoke.end();
      return out;
    },
  };
}
