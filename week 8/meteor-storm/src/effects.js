// What the falling rocks do, and the parked cars:
//   - splashes: a column of white water thrown up where a rock hits the harbour, falling back, a cloud of steam
//     rising off it (water.js draws the rings);
//   - the parked cars along the quay street; after the sonic boom (0:13) their alarms go off (hazard lights blinking);
//   - the hit car (0:22): crushed flat in the middle, glass and sparks flying, then burning (flames, smoke, a scorch).
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { PARKED, HIT_CAR } from './layout.js';
import { SPLASHES } from './meteors.js';
import { rng, smooth, clamp } from './util.js';
import { V_BOOM, V_CAR, V_SPLASH } from './timeline.js';

const G = 9.81;
// each splash's droplets and steam, planned once
for (const s of SPLASHES) {
  const R = rng(Math.round(s.t1 * 100));
  const k = s.big ? 1 : 0.35 + s.size * 0.12;
  s.drops = [];
  const n = s.big ? 170 : 26;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, col = i % 3 === 0;
    // a third make the column (fast, straight up), the rest the crown (thrown out and up)
    const up = col ? (18 + R() * 16) * (s.big ? 1 : 0.6) : (6 + R() * 10) * (s.big ? 1 : 0.6), out = col ? R() * 1.2 : (3 + R() * 6) * k;
    s.drops.push({ vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: up, r: (0.45 + R() * 0.8) * (s.big ? 1.3 : 0.9) * (0.6 + 0.5 * k) * (col ? 0.8 : 0.42), seed: R() });
  }
  s.steam = Array.from({ length: s.big ? 16 : 5 }, () => ({ dx: (R() - 0.5) * 6 * k, dz: (R() - 0.5) * 6 * k, rise: 1.5 + R() * 2.5, r: (3 + R() * 4) * (s.big ? 1.2 : 0.7) * k, seed: R(), d: R() * 0.8 }));
}
export const ALARMS = PARKED.filter((c, i) => i % 3 !== 1 && Math.abs(c.z) < 60).map((c, i) => ({ c, t0: V_BOOM + 0.25 + (i * 0.37) % 1.4, per: 0.48 + (i % 3) * 0.06 }));
export const CAR_DEBRIS = (() => {
  const R = rng(1992), out = [];
  for (let i = 0; i < 60; i++) { const a = R() * Math.PI * 2, up = 3 + R() * 9, sp = 2 + R() * 7; out.push({ vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: up, life: 0.6 + R() * 1.4, hot: R() < 0.55 }); }
  return out;
})();

export function makeEffects(scene, ctx, fire, smoke, spray) {
  const fleet = makeFleet(scene, PARKED.length, ctx);
  PARKED.forEach((c, i) => fleet.color(i, c.col, c.kind));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const hitIdx = PARKED.indexOf(HIT_CAR);
  return {
    frame(v, glows, spots) {
      // ---- the parked cars (the hit one crushed: roof down, body sagged in the middle, nose and tail kicked up) ----
      PARKED.forEach((c, i) => {
        let sy = 1, roll = 0, pitch = 0, dy = 0;
        if (i === hitIdx) {
          const k = smooth(V_CAR - 0.01, V_CAR + 0.06, v);
          const bounce = v > V_CAR ? Math.exp(-(v - V_CAR) / 0.15) * Math.sin((v - V_CAR) * 40) * 0.06 : 0;
          sy = 1 - 0.42 * k + bounce; roll = 0.06 * k; pitch = -0.04 * k; dy = -0.08 * k;
        }
        e.set(pitch, c.yaw, roll, 'YXZ'); q.setFromEuler(e);
        m4.compose(pos.set(c.x, dy, c.z), q, sc.set(1, sy, 1));
        fleet.set(i, m4, false);
      });
      fleet.commit();
      // ---- car alarms: hazard lights blinking orange at the four corners ----
      for (const a of ALARMS) {
        if (v < a.t0 || a.c === HIT_CAR && v > V_CAR) continue;
        const on = ((v - a.t0) / a.per) % 1 < 0.5 ? 1 : 0;
        if (!on) continue;
        const f = Math.cos(a.c.yaw), s = Math.sin(a.c.yaw);
        for (const [lx, lz] of [[-0.78, -2.3], [0.78, -2.3], [-0.78, 2.3], [0.78, 2.3]]) {
          glows.add(a.c.x + lx * f + lz * s, 0.72, a.c.z + lz * f - lx * s, 0.5, 3.2, 1.5, 0.15);
        }
        spots.push([a.c.x, a.c.z, 3.0, 0, 0.25, 0.12, 0.01, 0, Math.hypot(a.c.x, a.c.z) + 4]);
      }
      // ---- the hit car: glass and sparks bursting out, then fire and smoke ----
      if (v > V_CAR) {
        const dt = v - V_CAR, X = HIT_CAR.x, Z = HIT_CAR.z;
        for (const d of CAR_DEBRIS) {
          if (dt > d.life) continue;
          const y = 1.0 + d.vy * dt - 0.5 * G * dt * dt;
          if (y < 0.05) continue;
          const k = 1 - dt / d.life;
          if (d.hot) glows.add(X + d.vx * dt, y, Z + d.vz * dt, 0.18, 6 * k, 3.2 * k, 0.9 * k);
          else glows.add(X + d.vx * dt, y, Z + d.vz * dt, 0.1, 1.5 * k, 1.7 * k, 2.0 * k);
        }
        // the flash of the hit, then the fire's glow
        const fl = 14 * Math.exp(-dt / 0.12);
        const burn = smooth(0.15, 1.2, dt);
        glows.add(X, 1.4, Z, 2.5 + 3 * Math.exp(-dt / 0.2), fl + 2.4 * burn, fl * 0.85 + 1.2 * burn, fl * 0.6 + 0.3 * burn);
        spots.push([X, Z, 6 + 4 * burn, 0, 1.4 * burn + fl * 0.2, 0.6 * burn + fl * 0.16, 0.12 * burn + fl * 0.1, 0, 0]);
        for (let k = 0; k < 9; k++) fire.add(X + (k - 4) * 0.22 * Math.cos(k), 0.75 + 0.15 * Math.sin(k * 2.1), Z + (k - 4) * 0.48, 1.3, (2.2 + 1.3 * Math.sin(k * 1.7 + 1)) * burn, burn * 1.3, k * 0.137);
        for (let k = 0; k < 18; k++) {
          const age = (dt * 0.9 + k * 0.42) % 7.5, born = dt * 0.9 - age;
          if (born < 0) continue;
          const r = 0.8 + age * 0.75;
          smoke.puff(X + Math.sin(k * 2.3) * 0.4 + age * 0.35, 2.0 + age * 2.1, Z + Math.cos(k * 1.7) * 0.5 - age * 0.15, r, 0.5 * (1 - age / 7.5) * smooth(0, 0.6, age) * burn, 0.12, 0.35 * Math.exp(-age / 1.2), k * 0.37);
        }
      }
      // ---- splashes ----
      for (const s of SPLASHES) {
        const dt = v - s.t1;
        if (dt < 0 || dt > 9) continue;
        for (const d of s.drops) {
          const y = s.y + d.vy * dt - 0.5 * G * dt * dt;
          if (y < s.y - 0.5) continue;
          const r = d.r * (1 + dt * 0.45);
          const a = 0.85 * (1 - smooth(0.7, 2.3, dt)) * (y < s.y + 1 && d.vy * dt > 3 ? 0.4 : 1);
          spray.puff(s.x + d.vx * dt, y, s.z + d.vz * dt, r, a, 1.0, 0.25 * Math.exp(-dt / 0.3), d.seed);
        }
        for (const st of s.steam) {
          const a = dt - st.d;
          if (a < 0) continue;
          spray.puff(s.x + st.dx * 0.5 + a * 0.4, s.y + 2 + a * st.rise * 0.6, s.z + st.dz * 0.5, st.r * 0.42 * (1 + a * 0.3), 0.16 * smooth(0, 0.4, a) * (1 - smooth(0.9, 2.4, a)), 0.95, 0.4 * Math.exp(-a / 0.6), st.seed);
        }
        // the hiss of steam glowing off the hot rock for a moment
        if (dt < 0.6) glows.add(s.x, s.y + 1, s.z, (s.big ? 6 : 3) * (1 + dt * 3), 5 * (1 - dt / 0.6), 3 * (1 - dt / 0.6), 1.4 * (1 - dt / 0.6));
      }
    },
  };
}
