// The whole scene, a pure function of video time: a riverside plaza at sunset, the embankment road and the river,
// the Ferris wheel, the suspension bridge and the city across the water, the airliner, the pigeons, the people.
// Gravity crushes it in order (see timeline.js). Parts: terrain.js (ground, river, hills), plaza.js (fountain,
// lamps, trees), wheel.js, bridge.js, skyline.js, air.js (plane, birds), people.js (who does what).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, G } from './bend.js';
import { makeTerrain } from './terrain.js';
import { makePlaza } from './plaza.js';
import { makeWheel } from './wheel.js';
import { makeBridge, SEG_FALL } from './bridge.js';
import { makeSkyline } from './skyline.js';
import { makeAir, planeAt } from './air.js';
import { makeGlows } from './glows.js';
import { makeSmoke } from './smoke.js';
import { makeFleet } from './cars.js';
import { makeCrowd } from './crowd.js';
import { PEOPLE, personPose } from './people.js';
import { CAM, SUN, ROAD, FAR_ROAD, RIVER, BRIDGE, WHEEL, PLANE, B, fallK, fallDur, inFrame, aOf } from './layout.js';
import { gAt, vAtG } from './timeline.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';

const dummy = new THREE.Object3D();
const m4 = new THREE.Matrix4();

export function makeWorld(scene) {
  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  const ctx = { plainMat, glowMat, shadowy };

  // ---------- light: the low Sun on the left, a sky that is blue above and warm below ----------
  const sunDir = new THREE.Vector3(Math.sin(SUN.az * DEG) * Math.cos(SUN.el * DEG), Math.sin(SUN.el * DEG), -Math.cos(SUN.az * DEG) * Math.cos(SUN.el * DEG));
  const sun = new THREE.DirectionalLight(0xffb27a, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 1600 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8d9fd0, 0x6b4f3e, 1.0);
  scene.add(hemi);

  const terrain = makeTerrain(scene, { cx: CAM.x, cz: CAM.z });
  const plaza = makePlaza(scene, ctx);
  const wheel = makeWheel(scene, ctx);
  const skyline = makeSkyline(scene, ctx);
  const air = makeAir(scene, ctx);
  const glows = makeGlows(scene, 5000);
  const smoke = makeSmoke(scene, 2600);

  // ---------- cars: the embankment road below the plaza, the bridge, the far bank ----------
  const NROAD = 18, NBR = 22, NFAR = 34;
  const fleet = makeFleet(scene, NROAD + NBR + NFAR, { plainMat, glowMat, shadowy });
  const bridge = makeBridge(scene, { ...ctx, fleet, carBase: NROAD });
  const CARPAL = [0xb8bcc2, 0x1f2328, 0xf2f2f0, 0x8c1d1d, 0x24406b, 0x55595e, 0xd9c9a3, 0x2f4f3a, 0xe3a21a, 0x6d1f4f];
  const RC = rng(31);
  for (let i = 0; i < NROAD + NBR + NFAR; i++) fleet.color(i, CARPAL[Math.floor(RC() * CARPAL.length)], Math.floor(RC() * 4));
  // drivers ease off as they get heavier, black out around 4-6x and the cars roll to a stop
  const drive = (v, gOut) => {
    const g = gAt(v);
    return (1 - 0.4 * smooth(1.6, 3.2, g)) * (1 - smooth(vAtG(gOut), vAtG(gOut) + 1.6, v));
  };
  const DIST = (() => {   // distance driven by video time, per lane (same profile within a lane: no car catches another)
    const outs = [4.6, 5.2, 4.9, 5.6], n = 80 * 120, tabs = outs.map(() => new Float64Array(n + 1));
    outs.forEach((o, L) => { for (let i = 1; i <= n; i++) { const v = -4 + (i - 0.5) / 120; tabs[L][i] = tabs[L][i - 1] + 12 * drive(v, o) / 120; } });
    return (L, v) => { const f = clamp((v + 4) * 120, 0, n - 1), i = Math.floor(f); return lerp(tabs[L][i], tabs[L][i + 1], f - i); };
  })();
  // where they stop: a few right in front of you
  const finals = [[0, -2], [0, 19], [0, -60], [0, 70], [1, 9], [1, 33], [1, -40], [1, 95], [2, -9], [2, 13], [2, 52], [2, -75], [3, 3], [3, 27], [3, -30], [3, 110], [0, 140], [2, 160]];
  const roadCars = finals.map(([L, xf], i) => {
    const dir = L < 2 ? 1 : -1;
    const Dend = DIST(L, 70);
    return { i, L, dir, z: ROAD.lanes[L], x0: xf - dir * Dend, crushG: 22 + RC() * 20 };
  });
  const farCars = Array.from({ length: NFAR }, (_, k) => ({ i: NROAD + NBR + k, L: k % 3, x0: -500 + RC() * 1000, sp: (k % 3 === 1 ? -1 : 1) * (10 + RC() * 4) }));
  const carMatrix = (x, y, z, yaw, g, crushG) => {
    const sag = 0.1 * smooth(1.4, 4, g) + 0.18 * smooth(8, 14, g);            // springs bottom out, then the tyres burst
    const crush = smooth(crushG * 0.6, crushG * 1.6, g);                         // the roof caves in, the body folds
    dummy.position.set(x, y - sag, z); dummy.rotation.set(0, yaw, 0.03 * smooth(8, 14, g));
    dummy.scale.set(1, 1 - 0.7 * crush, 1); dummy.updateMatrix();
    return dummy.matrix;
  };

  // ---------- the tour boat on the river ----------
  const boat = new THREE.Group();
  {
    const hull = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(30, 2.2, 7).translate(0, 0.4, 0).toNonIndexed(),
      new THREE.CylinderGeometry(3.5, 3.5, 2.2, 12, 1, false, 0, Math.PI).rotateY(Math.PI / 2).scale(1.4, 1, 1).translate(-15, 0.4, 0).toNonIndexed(),
    ]), plainMat(0x1d2a3a, 0.5));
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(22, 2.4, 5.6).translate(2, 2.7, 0), plainMat(0xe9e6df, 0.6));
    const win = new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 5.7).translate(2, 2.8, 0), glowMat(new THREE.Color(2.2, 1.6, 0.9)));
    boat.add(hull, cabin, win);
    boat.userData = { cabin, win };
    hull.castShadow = cabin.castShadow = true;
    scene.add(boat);
  }

  // ---------- the people ----------
  const crowd = makeCrowd(scene, PEOPLE.length, plainMat(0xffffff, 0.85));
  PEOPLE.forEach((p, i) => crowd.color(i, ...p.col));

  // ---------- city lights seen far off: street lights on the far bank, aircraft beacons ----------
  const street = [];
  {
    const R = rng(51);
    for (let z = -400; z > -2400; z -= 60) for (let x = -1400; x < 1600; x += 70) {
      if (R() < 0.25) continue;
      const along = R() < 0.5;
      street.push({ x: x + (along ? R() * 70 : 0), z: z + (along ? 0 : -R() * 60), s: 3 + R() * 2 });
    }
    for (let x = -800; x < 900; x += 26) street.push({ x, z: FAR_ROAD.z1 + 1.5, s: 3.5, road: true });
  }
  const beacons = B.filter((b) => b.h > 160).map((b) => ({ b, ph: rng(Math.round(b.seed * 1e6))() }));
  // the ruins burn: broken gas mains and wiring set a third of the heaps alight; the flames are beaten low as
  // gravity climbs and smothered when the rubble is pressed flat
  const FIRES = [];
  {
    const R = rng(808);
    for (const b of B) if (inFrame(b) && Math.hypot(b.x - CAM.x, b.z - CAM.z) < 1700 && R() < 0.4) FIRES.push({ b, ph: R() * 10, k: 0.6 + R() * 0.6, t0: b.vFall + fallDur(b) + 0.3 + R() * 1.5 });
  }

  return {
    sunDir, sun, hemi, terrain, wheel, bridge, skyline, plaza, air, crowd, glows, smoke,
    frame(v, s, cam) {
      const g = s.g;
      G.uTime.value = v;
      // sun & shadows follow the camera's patch of ground
      sun.position.set(CAM.x + sunDir.x * 900, sunDir.y * 900, CAM.z - 40 + sunDir.z * 900);
      sun.target.position.set(CAM.x, 0, CAM.z - 40);
      glows.begin(); smoke.begin();

      plaza.frame(v, s, glows);
      wheel.frame(v, s);
      bridge.frame(v, s);

      skyline.frame(v);
      air.frame(v, s, glows);

      // ---- cars ----
      for (const c of roadCars) {
        const x = c.x0 + c.dir * DIST(c.L, v);
        const lit = 1 - smooth(c.crushG * 0.8, c.crushG * 1.1, g);
        fleet.set(c.i, carMatrix(x, 0, c.z, c.dir > 0 ? -Math.PI / 2 : Math.PI / 2, g, c.crushG), lit > 0.5);
      }
      for (const c of bridge.cars) {
        const L = BRIDGE.z0 - BRIDGE.z1;
        const d = c.speed * (Math.min(v, vAtG(5.2)) + 3) * (1 - 0.3 * smooth(-1, 8, v));
        const z = BRIDGE.z0 - (((c.off + d) % L) + L) % L;
        const dp = bridge.deckY(z, v);
        const x = BRIDGE.x + (c.lane ? 3.6 : -3.6);
        dummy.position.set(x, dp.y + 0.8, z); dummy.rotation.set(dp.rx, c.speed > 0 ? 0 : Math.PI, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
        fleet.set(c.i, dummy.matrix, dp.k < 0.5);
      }
      for (const c of farCars) {
        const d = c.sp * (Math.min(v, vAtG(5.0)) + 3);
        const x = ((c.x0 + d + 900) % 1800 + 1800) % 1800 - 900;
        fleet.set(c.i, carMatrix(x, 0, FAR_ROAD.lanes[c.L], c.sp > 0 ? -Math.PI / 2 : Math.PI / 2, g, 30), g < 30);
      }
      fleet.commit();
      // bridge deck lamps
      for (let z = BRIDGE.z0 - 10; z > BRIDGE.z1; z -= 22) {
        const dp = bridge.deckY(z, v);
        if (dp.k > 0.6) continue;
        for (const sx of [-1, 1]) glows.add(BRIDGE.x + sx * (BRIDGE.w / 2 + 0.5), dp.y + 7, z, 4, 1.6 * s.grid, 1.1 * s.grid, 0.55 * s.grid);
      }

      // ---- the boat: drifting downstream, its lights on until it is crushed ----
      {
        const x = 75 - 2.4 * (Math.min(v, 30) + 3);
        const bob = Math.sin(v * 1.1) * 0.15 / Math.sqrt(g);
        boat.position.set(x, RIVER.water - 0.4 + bob, -168);
        boat.rotation.set(0, 0, Math.sin(v * 0.8) * 0.02 / g);
        const crush = smooth(vAtG(24), vAtG(50), v);
        boat.userData.cabin.scale.y = boat.userData.win.scale.y = 1 - 0.85 * crush;
        boat.userData.cabin.position.y = boat.userData.win.position.y = -2.0 * crush;
        boat.userData.win.visible = crush < 0.2;
      }

      // ---- people ----
      PEOPLE.forEach((p, i) => crowd.pose(i, personPose(p, v)));
      crowd.commit();

      // ---- far lights ----
      const gridOn = s.grid;
      if (gridOn > 0.01) {
        for (const l of street) {
          const fl = l.road ? 1 : 0.8;
          glows.add(l.x, 7, l.z, l.s * 2.2, 1.5 * gridOn * fl, 0.85 * gridOn * fl, 0.35 * gridOn * fl);
        }
      }
      for (const bc of beacons) {
        const k = fallK(bc.b, v);
        if (k > 0.05) continue;
        const blink = Math.sin((v + bc.ph * 3) * Math.PI * 1.3) > 0.4 ? 1 : 0;
        glows.add(bc.b.x, bc.b.h + 3, bc.b.z, 9, 4 * blink, 0.15 * blink, 0.1 * blink);
      }

      // ---- dust and smoke (low and short-lived: in strong gravity dust falls straight back down) ----
      const cap = s.cap;
      const capY = (y) => cap * Math.tanh(y / cap);
      const settle = (dt, gg) => Math.exp(-dt * (0.5 + 0.12 * Math.sqrt(gg)));
      for (const b of B) {
        const dt = v - b.vFall;
        if (dt < 0 || dt > 6) continue;
        if (!inFrame(b) || Math.hypot(b.x, b.z) > 2300) continue;
        const gF = gAt(b.vFall);
        const dur = fallDur(b);
        const grow = smooth(0, dur + 1.5, dt);
        const a = 0.75 * smooth(0, 0.25, dt) * settle(Math.max(0, dt - dur), gF);
        const nP = b.h > 120 ? 12 : 7;
        const R = rng(Math.round(b.seed * 1e5));
        const span = Math.max(b.w, b.d);
        for (let k = 0; k < nP; k++) {
          const ang = R() * Math.PI * 2, rr = span * (0.3 + 0.6 * grow) * (0.5 + R());
          const rad = span * (0.35 + 0.5 * grow) * (0.6 + 0.6 * R()) * (1 + 6 / Math.sqrt(gF));
          const hTop = Math.min(b.h, 30 + 220 / gF) * (1 - fallK(b, v)) + rad * 0.4;
          smoke.puff(b.x + Math.cos(ang) * rr, capY(R() * hTop * 0.7 + rad * 0.3), b.z + Math.sin(ang) * rr, rad, a * (0.6 + 0.4 * R()), 0.62, 0, R());
        }
      }
      // fires in the ruins
      for (const f of FIRES) {
        const on = smooth(f.t0, f.t0 + 1.2, v) * (1 - smooth(vAtG(500), vAtG(1100), v));
        if (on <= 0.01) continue;
        const b = f.b;
        const fl = 0.75 + 0.25 * Math.sin(v * 9 + f.ph) * Math.sin(v * 5.3 + f.ph * 2);
        const hgt = Math.min(b.heap, cap);
        const sz = (Math.max(b.w, b.d) * 0.9 + 10) * f.k * Math.min(1, 0.4 + 30 / Math.max(g, 1)) ;
        glows.add(b.x, capY(hgt * 0.8 + 4), b.z, sz * 1.6, 2.4 * on * fl * f.k, 0.85 * on * fl * f.k, 0.2 * on * fl * f.k);
        const R = rng(Math.round(f.ph * 1e5));
        for (let k = 0; k < 2; k++) {
          const r = sz * (0.5 + 0.4 * R());
          smoke.puff(b.x + (R() - 0.5) * b.w, capY(hgt + r * (0.6 + k * 0.9)), b.z + (R() - 0.5) * b.d, r, 0.42 * on, 0.12, 0.35 * on, R());
        }
      }
      // the plane's crash: a fire and a column of smoke, beaten down flat as gravity climbs
      {
        const dt = v - PLANE.crash;
        if (dt > 0) {
          const cx = planeAt(PLANE.crash).x;
          const R = rng(77);
          const top = 60 + 260 * smooth(0, 6, dt) / Math.sqrt(gAt(v) / 4);
          for (let k = 0; k < 22; k++) {
            const f = k / 22;
            const y = f * top;
            const r = 25 + 70 * f + 40 * R();
            const a = 0.65 * smooth(0, 0.6, dt - f * 2) * (1 - smooth(22, 30, v));
            smoke.puff(cx + (R() - 0.5) * 40 + f * 60, capY(y), PLANE.z + (R() - 0.5) * 40, r, a, 0.18, f < 0.2 ? 0.8 * (1 - smooth(14, 22, v)) : 0, R());
          }
        }
      }
      // the wheel hitting the bank and the river
      {
        const dt = v - WHEEL.v1;
        if (dt > -0.3 && dt < 5) {
          const R = rng(5);
          const a = 0.8 * smooth(-0.3, 0.1, dt) * settle(Math.max(0, dt), gAt(WHEEL.v1));
          for (let k = 0; k < 16; k++) {
            const x = WHEEL.x + (R() - 0.5) * 120, z = WHEEL.z + 20 + R() * 55;
            const r = 8 + 12 * R() * (1 + dt);
            smoke.puff(x, capY(r * 0.4), z, r, a, z > RIVER.z0 ? 0.92 : 0.6, 0, R());
          }
        }
      }
      // spray where the bridge deck hits the water
      {
        const R = rng(9);
        SEG_FALL.forEach((vf, i) => {
          const T = Math.sqrt(2 * (BRIDGE.deck - RIVER.water) / (9.81 * gAt(vf))) * 1.6;
          const dt = v - (vf + T);
          if (dt < -0.05 || dt > 2.5) return;
          const z = BRIDGE.z0 - (i + 0.5) * (BRIDGE.z0 - BRIDGE.z1) / 40;
          const a = 0.85 * smooth(-0.05, 0.08, dt) * Math.exp(-dt * 2.2);
          for (let k = 0; k < 3; k++) {
            const r = 4 + 6 * R() + 6 * dt;
            smoke.puff(BRIDGE.x + (R() - 0.5) * 26, RIVER.water + r * 0.35 * (1 - dt * 0.3), z + (R() - 0.5) * 8, r, a, 0.95, 0, R());
          }
        });
      }

      glows.end(); smoke.end();
    },
  };
}
