// The whole scene for one stop at one moment: setStop(i, v, camera) poses everything for stop i at video time v
// (main.js draws one stop, or both sides of a wipe, one after the other). Each stop starts fresh at its wipe: the
// park as it was on Earth, and from that moment this world's gravity.
import * as THREE from 'three';
import { makePark, GU } from './park.js';
import { makeTrees } from './trees.js';
import { makeFountain } from './fountain.js';
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
  GRAV, MOON_DUNK, MOON_ALL, MOON_YOU, V_JUMP, PLU_TAKE, PLU_VX, PLU_VXX, MOON_END, JUP_END, PLU_END, JUP_BUCKLE, JUP_SNAP, JUP_BENCH, JUP_HOOP, jupCarT,
  SUN_FLAT, SUN_HOOP, SUN_BOARD_HIT, sunTyreT, sunRoofT, SUN_TREES, SUN_WINDOWS, SUN_TOP_LIST,
  WD_CRUSH, WD_BLDG_T, WD_FLOORS, WD_FLAT0, WD_FLAT1, wdFrontR, NS_FILM, NS_WAVE0, NS_WAVE1, nsWaveR, sqWD, sqNS,
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
    return { x: YOU.x + PLU_VXX * tc, z: YOU.z - PLU_VX * tc, h, t };
  }
  // Jupiter and the Sun take over with you up in the air (from the Moon's jump, from Pluto's): you drop like a rock
  if (key === 'jupiter' || key === 'sun') {
    const P = key === 'jupiter' ? youJump('moon', MOON_END) : youJump('pluto', PLU_END);
    const Q = key === 'jupiter' ? youJump('moon', MOON_END - 0.01) : youJump('pluto', PLU_END - 0.01);
    const vy = (P.h - Q.h) / 0.01, g = GRAV[key];
    const tl = P.h > 0 ? (vy + Math.sqrt(vy * vy + 2 * g * P.h)) / g : 0;
    const h = tt < tl ? P.h + vy * tt - 0.5 * g * tt * tt : 0;
    return { x: P.x, z: P.z, h, t: tt, tl };
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
  const fountain = makeFountain(scene, { plainMat, shadowy, parts });
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
      // (Jupiter left you on your hands and knees: one push off the court and you're up into a crouch, then away)
      const kk = 1 - smooth(0.04, PLU_TAKE - 0.08, tt);
      q.sink = lerp(0.3 * cr, 0.43, kk); q.hunch = lerp(0.2 * cr, 1.2, kk); q.kneel = kk;
      if (kk > 0.001) {
        q.holdR = youLocal(lerp(-0.13, -0.24, kk), lerp(0.62, 0.12, kk), lerp(0.3, 0.62, kk), new THREE.Vector3()); q.poleR = youLocal(-0.6, 1.0, -0.3, new THREE.Vector3());
        q.holdL = youLocal(lerp(0.34, 0.45, kk), lerp(0.62, 0.12, kk), lerp(0.3, 0.62, kk), new THREE.Vector3()); q.poleL = youLocal(0.8, 1.0, -0.3, new THREE.Vector3());
        q.head = [-0.2 * kk, -0.15 * kk];
      }
      if (J.t > 0) {
        const k = smooth(0, 1.0, J.t);
        q.lift = [0.18 * k + 0.08 * Math.sin(J.t * 2.2) * k, 0.3 * k + 0.08 * Math.sin(J.t * 1.9 + 1) * k];
        q.holdR = youLocal(-0.75, 1.55 + 0.25 * Math.sin(J.t * 1.6), 0.25, new THREE.Vector3()); q.poleR = youLocal(-0.7, 1.0, -0.4, new THREE.Vector3());
        q.holdL = youLocal(0.75, 1.55 + 0.25 * Math.sin(J.t * 1.6 + 2), 0.25, new THREE.Vector3()); q.poleL = youLocal(0.7, 1.0, -0.4, new THREE.Vector3());
        q.curlR = 0.2; q.curlL = 0.2; q.head = [lerp(-0.2, 0.75, smooth(0.5, 2.5, J.t)), 0.1]; q.hunch = 0.15 * k;
        you.root.rotation.x = 0.12 * k;
      }
    } else if (key === 'jupiter') {
      // it takes over with you up in the air from the Moon: you drop like a rock, slam down onto your knees (a lurch, arms
      // thrown out), hands on your thighs; ~2.4 s in, as the trees break, you fold forward onto your hands
      const J = youJump(key, tt), tl = J.tl;
      if (J.h > 0) {
        you.root.position.y = J.h;
        q.lift = [0.14, 0.22];
        q.holdR = youLocal(-0.4, 2.1, 0.1, new THREE.Vector3()); q.poleR = youLocal(-0.8, 1.4, -0.2, new THREE.Vector3());
        q.holdL = youLocal(0.4, 2.05, 0.1, new THREE.Vector3()); q.poleL = youLocal(0.8, 1.4, -0.2, new THREE.Vector3());
        q.curlR = 0.3; q.curlL = 0.3; q.head = [-0.3, 0.1];
        you.pose(q); you.root.updateMatrixWorld(true);
        return;
      }
      const st = smooth(tl, tl + 0.06, tt) * (1 - smooth(tl + 0.2, tl + 0.35, tt));
      const k = smooth(tl, tl + 0.13, tt) + 0.12 * Math.exp(-Math.max(0, tt - tl - 0.13) / 0.12) * smooth(tl + 0.08, tl + 0.13, tt);
      const f = smooth(2.4, 2.7, tt);
      const up = smooth(3.9, 4.35, tt) * (1 - smooth(4.6, 4.85, tt));       // (you try to push up, and can't)
      q.roll = -0.16 * st + 0.03 * up * Math.sin(tt * 23);
      q.sink = 0.43 * k; q.hunch = 0.12 * st + lerp(0.5, 1.2 - 0.25 * up, f) * k; q.head = [lerp(0.4, -0.2, f) * k, -0.15];
      const hy = lerp(0.62, 0.12 + 0.12 * up, f), hz = lerp(0.3, 0.62, f);
      q.holdR = youLocal(lerp(-0.13, -0.24, f) - 0.5 * st, hy + 0.7 * st, hz - 0.15 * st, new THREE.Vector3()); q.poleR = youLocal(-0.6, 1.0, -0.3, new THREE.Vector3());
      q.holdL = youLocal(lerp(0.34, 0.45, f) + 0.5 * st, hy + 0.7 * st, hz - 0.15 * st, new THREE.Vector3()); q.poleL = youLocal(0.8, 1.0, -0.3, new THREE.Vector3());
      q.kneel = k;
      q.curlR = lerp(0.8, 0.2, f); q.curlL = q.curlR;
    } else {
      // slammed flat on your front, arms flung forward (the Sun: you drop from up over the hoop like a stone first)
      let k;
      if (key === 'sun') {
        const J = youJump(key, tt);
        you.root.position.set(J.x, J.h, J.z);
        if (J.h > 0) {
          you.root.rotation.x = 0.12;
          q.lift = [0.2, 0.3];
          q.holdR = youLocal(-0.6, 2.0, 0.2, new THREE.Vector3()); q.poleR = youLocal(-0.8, 1.4, -0.2, new THREE.Vector3());
          q.holdL = youLocal(0.6, 2.0, 0.2, new THREE.Vector3()); q.poleL = youLocal(0.8, 1.4, -0.2, new THREE.Vector3());
          q.head = [0.6, 0.1]; q.curlR = 0.2; q.curlL = 0.2;
          you.pose(q); you.root.updateMatrixWorld(true);
          return;
        }
        k = smooth(J.tl, J.tl + 0.05, tt);
      } else k = smooth(WD_CRUSH - 0.02, WD_CRUSH + 0.05, tt);
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
  // the ball's flight with bounces from (y, vy) under gravity g after t s: its height and speed now
  const bounceFrom = (y, vy, g, e, t) => {
    for (let b = 0; b < 10; b++) {
      const disc = vy * vy + 2 * g * (y - 0.12);
      const tHit = (vy + Math.sqrt(Math.max(0, disc))) / g;
      if (t < tHit) return { y: y + vy * t - 0.5 * g * t * t, vy: vy - g * t };
      t -= tHit; vy = Math.sqrt(Math.max(0, disc)) * e; y = 0.12; if (vy < 0.3) return { y: 0.12, vy: 0 };
    }
    return { y: 0.12, vy: 0 };
  };
  const moonBall = (tt) => { const t = tt - MOON_DUNK; const b = bounceFrom(HOOP.y + 0.25, -3.2, GRAV.moon, 0.72, t); return { x: HOOP.x + 0.1 * t, y: b.y, z: HOOP.z + 0.55 * t, vy: b.vy }; };
  const jupBall = (tt) => { const m = moonBall(MOON_END); const b = bounceFrom(m.y, m.vy, GRAV.jupiter, 0.55, tt); const d = Math.min(tt, 0.8); return { x: m.x + 0.1 * d, y: b.y, z: m.z + 0.3 * d }; };
  const pluBall = (tt) => { const j = jupBall(JUP_END), t = Math.max(0, tt - 0.35); return { x: j.x + 0.15 * t, y: 0.12 + 2.6 * t - 0.5 * GRAV.pluto * t * t, z: j.z - 0.1 * t, vy: 2.6 - GRAV.pluto * t }; };
  function placeBall(key, tt, dunker) {
    ball.scale.set(1, 1, 1); ball.rotation.set(tt * 0.6, tt * 1.1, 0);
    const g = GV[key];
    if (key === 'jupiter') { const b = jupBall(tt); ball.position.set(b.x, Math.max(0.12, b.y), b.z); return; }
    if (key === 'pluto') { const b = pluBall(tt); ball.position.set(b.x, b.y, b.z); return; }
    if (key === 'sun') { const p = pluBall(PLU_END), b = bounceFrom(p.y, p.vy, GRAV.sun, 0.2, tt); ball.position.set(p.x, Math.max(0.12, b.y), p.z); return; }
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
      GU.uCrack.value = 0; GU.uCrackR.value = 1e5; GU.uWave.value = 1e5; GU.uCrackGlow.value = 0; GU.uPlate.value = 0; GU.uFilm.value = 0; GU.uWet.value = 0;
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
      // the cars: Jupiter ~3 s in their springs bottom out, one after another (the bodies drop onto the wheels); the
      // Sun bursts their tyres at once, then ~3.5 s in crushes their roofs in
      CARS.forEach((c, k) => {
        let sy = 1;
        const dustAt = (d, n, col) => {
          for (let j = 0; j < n; j++) {
            const a = hash(j + k * 31, 2.2), b = hash(j + k * 31, 4.4);
            const wx = c.x + (j % 2 ? 1.5 : -1.5), wz = c.z + (j % 4 < 2 ? 0.85 : -0.85);
            parts.add(wx + (a - 0.5) * d * 5, 0.15 + b * d * 1.5, wz + (b - 0.5) * d * 3, 0.12 + d * 0.9, 0, 0, 0, 0, col, col * 0.95, col * 0.88, 0.5 * (1 - d / 0.7), a);
          }
        };
        if (key === 'jupiter') {
          const t0 = jupCarT(k);
          sy = 1 - 0.045 * smooth(0, 0.18, tt) - 0.1 * smooth(t0, t0 + 0.08, tt) + 0.02 * Math.exp(-Math.max(0, tt - t0 - 0.08) / 0.1) * Math.sin((tt - t0) * 50) * smooth(t0, t0 + 0.08, tt);
          if (tt > t0 && tt < t0 + 0.7) dustAt(tt - t0, 8, 0.55);
        }
        if (key === 'pluto') sy = 0.855;                  // (Jupiter broke their springs: they stay down)
        if (key === 'sun') {
          const t0 = sunTyreT(k), t1 = sunRoofT(k);
          sy = 0.855 - 0.03 * smooth(0, 0.1, tt) - 0.13 * smooth(t0, t0 + 0.05, tt) - 0.3 * smooth(t1, t1 + 0.07, tt);
          sy += 0.03 * Math.exp(-Math.max(0, tt - t0 - 0.05) / 0.08) * Math.sin((tt - t0) * 60) * smooth(t0, t0 + 0.05, tt);
          if (tt > t0 && tt < t0 + 0.7) dustAt(tt - t0, 14, 0.5);
          if (tt > t1 && tt < t1 + 0.4) for (let j = 0; j < 24; j++) {      // the windows burst as the roof comes down
            const a = hash(j + k * 17, 6.2), b = hash(j + k * 17, 7.4), d = tt - t1;
            parts.add(c.x + (a - 0.5) * 3.5 * (1 + 3 * d), Math.max(0.05, 1.0 - 60 * d * d), c.z + (b - 0.5) * 1.8 * (1 + 3 * d), 0.06, 0, 0, 0, 5, 0.8, 0.9, 1.0, 1 - d / 0.4, a);
            if (j % 3 === 0) parts.add(c.x + (a - 0.5) * 3, 1.0, c.z + (b - 0.5) * 1.6, 0.07, 0, 0, 0, 3, 2.0, 2.1, 2.3, Math.max(0, 1 - d / 0.15), b);
          }
        }
        m4.makeRotationY(c.yaw).premultiply(new THREE.Matrix4().makeScale(1, sy, 1)).setPosition(c.x, 0, c.z);
        fleet.set(k, m4, false);
      });
      fleet.commit();
      // the buildings: on the Sun their windows burst out ~4 s in, glass pouring down the fronts, and ~6 s in the tallest
      // start to give way at the top; the white dwarf brings them down one after another, the farthest first, coming
      // toward you, and the front of cracks presses the heaps flat; the neutron star leaves a film
      let crushF = () => 0, bst = 0;
      if (key === 'sun') {
        bst = 0.85 * smooth(SUN_WINDOWS, SUN_WINDOWS + 0.6, tt);
        if (tt > SUN_WINDOWS && tt < SUN_WINDOWS + 2.0) for (let j = 0; j < 900; j++) {
          const bi = j % BUILDINGS.length, b = BUILDINGS[bi];
          if (b.back) continue;
          const t0 = SUN_WINDOWS + 0.6 * hash(j, 1.1), t = tt - t0;
          if (t < 0 || t > 0.9) continue;
          const y0 = 4.5 + hash(j, 2.2) * (b.h - 5.5), fall = 0.5 * 274 * 0.04 * t * t, y = y0 - fall;
          if (y < 0.1) continue;
          const out = 3.5 * t * (0.5 + hash(j, 4.4));                     // blown out of the front, then straight down
          parts.add(b.x + (hash(j, 3.3) - 0.5) * b.w, y, b.z + 0.3 + out, 0.14 + 0.1 * hash(j, 5.5), 0, -274 * 0.04 * t, 3.5, 5, 0.78, 0.88, 0.98, 0.95, hash(j, 6.6));
          if (j % 3 === 0) parts.add(b.x + (hash(j, 3.3) - 0.5) * b.w, y, b.z + 0.4 + out, 0.16, 0, 0, 0, 3, 2.0, 2.1, 2.3, 0.7 * (1 - t / 0.9), hash(j, 7.7));
        }
        // the tallest ones' top floors give way: they sag down onto the floors below in a burst of dust
        const tops = new Map(SUN_TOP_LIST.map((x) => [x.i, x.t]));
        crushF = (bi) => (tops.has(bi) ? 0.28 * smooth(tops.get(bi), tops.get(bi) + 0.35, tt) : 0);
        for (const { i, t: t0 } of SUN_TOP_LIST) {
          const b = BUILDINGS[i], t = tt - t0;
          if (t < 0 || t > 2.5) continue;
          for (let j = 0; j < 16; j++) {
            const a = hash(j + i * 7, 1.9), c = hash(j + i * 7, 2.7);
            smoke.puff(b.x + (a - 0.5) * b.w, b.h * (1 - 0.26 * smooth(0, 0.35, t)) + 1 + 4 * c * Math.sqrt(t), b.z + 1 + 3 * c * t, 2 + 3 * c + 3 * t, 0.6 * (1 - smooth(0.8, 2.5, t)) * smooth(0, 0.15, t), 0.7, 0, a);
          }
        }
      }
      if (key === 'wd') {
        const R = wdFrontR(tt);
        // (the back rows go in one slump; the front row floor by floor: its roofline drops a floor, holds, drops the next)
        const floorsDown = (b, t) => { const n = Math.max(3, Math.round(b.h / 3.2)), u = clamp(t / WD_FLOORS) * n, k = Math.floor(u); return Math.min(1, (k + smooth(0, 0.35, u - k)) / n); };
        crushF = (bi) => { const b = BUILDINGS[bi], t0 = WD_BLDG_T[bi]; const d = Math.hypot(b.x, b.z - b.d / 2); return (b.row === 0 ? floorsDown(b, tt - t0) : smooth(t0, t0 + 0.32, tt)) + 0.063 * smooth(R + 6, R - 6, d); };
        BUILDINGS.forEach((b, bi) => {
          const t = tt - WD_BLDG_T[bi];
          // the front row: a puff of dust bursting out of the facade at the roofline each time a floor goes
          if (b.row === 0 && t > 0 && t < WD_FLOORS + 1.2) {
            const n = Math.max(3, Math.round(b.h / 3.2));
            for (let f = 0; f < n; f++) {
              const tf = t - WD_FLOORS * f / n; if (tf < 0 || tf > 1.2) continue;
              const yr = b.h * (1 - 0.94 * f / n);
              for (let j = 0; j < 6; j++) {
                const a = hash(j + f * 7 + bi * 31, 3.1), c = hash(j + f * 7 + bi * 31, 3.7);
                smoke.puff(b.x + (a - 0.5) * b.w, yr - 1.5 - 2 * tf, b.z + 0.8 + 3 * c * Math.sqrt(tf), 1.6 + 2 * c + 2.5 * tf, 0.6 * (1 - smooth(0.3, 1.2, tf)) * smooth(0, 0.08, tf), 0.66, 0, a, 0.3);
              }
            }
          }
          if (t < 0.12 || t > 3.0) return;
          // a sheet of dust shoved out low along the street from its foot
          for (let j = 0; j < 14; j++) {
            const a = hash(j + bi * 13, 1.7), c = hash(j + bi * 13, 2.9);
            const r = (1.5 + 6 * Math.sqrt(t - 0.12)) * (0.5 + 0.6 * c);
            const px = b.x + (a - 0.5) * b.w * 1.1, pz = b.z - b.d * 0.4 + (j % 2 ? 1 : -0.3) * r * 0.9;
            smoke.puff(px, 0.4 + 0.5 * c, pz, 2.4 + 2.5 * c + 2 * t, 0.55 * (1 - smooth(1.0, 2.6, t)) * smooth(0.12, 0.25, t), 0.62, 0, a, 0.3);
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
      // the fountain: this world's gravity from the wipe on (the white dwarf and the neutron star press it flat)
      const crushed = (key === 'wd' || key === 'ns') && tt > WD_CRUSH;
      const out_ = fountain.frame(key === 'wd' || key === 'ns' ? gE : GV[key], tt, !crushed, camera.position);
      GU.uWet.value = key === 'moon' || key === 'pluto' ? 0.4 + 0.6 * out_ : 0;

      // ====================================================================================== the worlds
      if (key === 'moon') {
        out.shake = 0.05;
      } else if (key === 'pluto') {
        out.shake = 0.04;
      } else if (key === 'jupiter') {
        const hits = [...JUP_SNAP.map((t) => t + 0.65), ...JUP_BENCH, JUP_HOOP + 0.4];
        const tl = youJump('jupiter', 0).tl;
        out.jolt = 1.2 * Math.exp(-Math.max(0, tt - tl) / 0.2) * smooth(tl - 0.03, tl, tt) + 0.45 * Math.max(...hits.map((t) => Math.exp(-Math.abs(tt - t) / 0.1)));
        out.shake = 0.12 + 0.25 * smooth(2.2, 2.5, tt) * (1 - smooth(3.6, 4.4, tt));
        // splinters where each bench breaks
        park.benches.forEach((bn, i) => {
          const t = tt - JUP_BENCH[i % JUP_BENCH.length];
          if (t < 0 || t > 0.6) return;
          for (let j = 0; j < 16; j++) {
            const a = hash(j + i * 19, 3.7), b = hash(j + i * 19, 5.1);
            parts.add(bn.x + (a - 0.5) * 1.6, Math.max(0.03, 0.45 + 1.5 * b * t - 12 * t * t), bn.z + (b - 0.5) * 0.8, 0.04 + 0.03 * a, 0, 0, 0, 4, 0.55, 0.36, 0.2, 1 - t / 0.6, a);
          }
          smoke.puff(bn.x, 0.2, bn.z, 0.5 + 1.2 * t, 0.35 * (1 - t / 0.6), 0.75, 0, i * 0.3, 0.5);
        });
      } else if (key === 'sun') {
        const tl = youJump('sun', 0).tl;
        out.jolt = 1.6 * Math.exp(-Math.max(0, tt - tl) / 0.22) * smooth(tl - 0.03, tl, tt) + 0.8 * Math.exp(-Math.abs(tt - SUN_BOARD_HIT) / 0.08) + 0.7 * Math.exp(-Math.abs(tt - SUN_TREES - 0.3) / 0.15)
          + 0.5 * Math.max(...SUN_TOP_LIST.map((x) => Math.exp(-Math.abs(tt - x.t - 0.2) / 0.12)));
        out.shake = 0.25 + 0.45 * Math.exp(-Math.abs(tt - 3.65) / 0.5) + 0.3 * Math.exp(-Math.abs(tt - 6.85) / 0.6);
        // the backboard hits the court and bursts: glass and dust
        const bt = tt - SUN_BOARD_HIT;
        if (bt > 0 && bt < 1.2) {
          const c = park.boardCentre(v2);
          for (let j = 0; j < 220; j++) {
            const a = hash(j, 8.1) * 6.283, sp = 1.5 + 5 * hash(j, 8.3), up = 0.6 + 1.2 * hash(j, 8.5);
            const t = bt;
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
        // the front of cracks sweeping in from the horizon: plates drop behind it, the seams glow
        const R = wdFrontR(tt), on = smooth(WD_FLAT0 - 0.05, WD_FLAT0 + 0.1, tt);
        GU.uCrack.value = on; GU.uPlate.value = on; GU.uCrackR.value = R; GU.uCrackGlow.value = 2.5 * smooth(WD_FLAT0, WD_FLAT1, tt);
        H.uAmbK.value = lerp(300, 760, smooth(WD_FLAT0 + 0.5, WD_FLAT1 + 0.8, tt));
        const bh = BUILDINGS.map((b, i) => Math.exp(-Math.abs(tt - WD_BLDG_T[i] - 0.25) / 0.09) * (0.15 + 0.35 * smooth(70, 40, Math.hypot(b.x, b.z))));
        out.jolt = 1.4 * Math.exp(-Math.max(0, tt - WD_CRUSH) / 0.2) * smooth(0, WD_CRUSH, tt) + Math.max(...bh) + 1.2 * Math.exp(-Math.max(0, tt - WD_FLAT1) / 0.25) * smooth(WD_FLAT1 - 0.1, WD_FLAT1, tt);
        out.shake = 0.3 + 0.35 * smooth(0.8, 1.5, tt) * (1 - smooth(5.0, 5.6, tt)) + 0.7 * smooth(WD_FLAT0, WD_FLAT1, tt) * (1 - smooth(WD_FLAT1 + 0.3, WD_FLAT1 + 1.2, tt));
        // the sky hazes over with dust as they come down
        scene.fog.color.setRGB(0.62, 0.6, 0.58); scene.fog.density = 0.0055 + 0.01 * smooth(4.0, 6.5, tt);
        s.uHaze.value.lerp(new THREE.Color(0.62, 0.58, 0.54), smooth(2.5, 6.0, tt) * 0.6); s.uHazeK.value = 0.55 + 0.3 * smooth(2.5, 6.0, tt);
        // sparks spitting from the glowing seams, just behind the front
        if (tt > WD_FLAT0) for (let j = 0; j < 200; j++) {
          const a = hash(j, 6.1), b = hash(j, 6.7), ph = (tt * 1.3 + hash(j, 7.3)) % 1;
          const f = Math.max(R, 4) + 40 * Math.pow(a, 1.6), x = (b - 0.5) * f * 0.8;
          parts.add(x, 0.05 + ph * 0.5, -f, 0.04 + 0.03 * a, 0, 0.5, 0, 3, 2.4, 0.9, 0.25, Math.sin(Math.PI * ph) * GU.uCrackGlow.value * 0.3, a);
        }
      } else if (key === 'ns') {
        const sq = sqNS(tt);
        H.uSq.value = sq; sun.shadow.intensity = 0;
        GU.uFilm.value = smooth(NS_FILM, NS_FILM + 0.2, tt);
        // pressed into a film that glows dull red at once; then one move: a bright wave of heat sweeps in from the horizon
        // over everything (white-hot behind it) and straight into the white
        const W = nsWaveR(tt);
        GU.uWave.value = tt > NS_WAVE0 - 0.05 ? W : 1e5;
        const T = lerp(300, 1300, smooth(NS_FILM, NS_FILM + 0.3, tt));
        H.uAmbK.value = T; H.uTK.value = T;
        const dark = smooth(NS_FILM, NS_FILM + 0.6, tt);
        s.uTop.value.lerp(new THREE.Color(0.0, 0.0, 0.005), dark); s.uLow.value.lerp(new THREE.Color(0.05, 0.02, 0.015), dark); s.uHaze.value.lerp(new THREE.Color(0.2, 0.06, 0.02), dark);
        s.uHaze.value.lerp(new THREE.Color(2.0, 1.5, 1.0), smooth(NS_WAVE0, NS_WAVE0 + 0.6, tt));      // (the horizon blazing as the wave sets off)
        s.uCloud.value *= 1 - dark; s.uSunGlow.value = 0;
        sun.intensity *= 1 - 0.85 * dark; hemi.intensity *= 1 - 0.8 * dark;
        scene.fog.color.setRGB(0.3, 0.1, 0.03); scene.fog.density = 0.003;
        out.exp = 1 + 1.6 * smooth(NS_WAVE1 - 0.6, NS_WAVE1 + 0.6, tt);
        out.jolt = 1.6 * Math.exp(-Math.max(0, tt - NS_FILM) / 0.25) * smooth(0, NS_FILM, tt);
        out.shake = 0.35 + 0.9 * smooth(NS_WAVE0, NS_WAVE1, tt);
        out.shimmer = 1.2 * smooth(0.4, 1.5, tt);
        out.veil = [1.0, 0.8, 0.55, 0.85 * Math.exp(-Math.max(0, tt - NS_FILM) / 0.18) * smooth(0, NS_FILM, tt) + 0.5 * smooth(NS_WAVE1 - 0.3, NS_WAVE1 + 0.5, tt)];
        // sparks thrown up along the wave's crest
        for (let j = 0; j < 260; j++) {
          const a = hash(j, 3.1), b = hash(j, 3.7), ph = (tt * 2.2 + hash(j, 4.3)) % 1;
          const f = Math.max(W, 2) + 6 * a, x = (b - 0.5) * f * 0.85;
          parts.add(x, 0.05 + ph * (0.4 + 0.02 * f), -f, 0.05 + 0.004 * f, 0, 1, 0, 3, 2.6, 1.9, 1.2, Math.sin(Math.PI * ph) * 0.8 * smooth(NS_WAVE0, NS_WAVE0 + 0.3, tt), a);
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
