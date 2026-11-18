// The traffic: three lanes your way and three the other, each lane at its own steady city speed (so nobody runs into
// anybody), cars from hashed slots ~30 m apart. The blast does the rest: it lasts only milliseconds, so up to ~20 psi it
// rocks and shoves a car; past that it throws it away from your path (up, over and rolling, dragged a little your way
// by the wake) to land on its side or roof and slide to a stop (the next lane from ~0:08.6).
import * as THREE from 'three';
import { hh, LANES, LANES_ON, PLAZA, xstreetAt } from './avenue.js';
import { blastAt, PSI } from './timeline.js';
import { makeFleet } from './cars.js';
import { clamp, smooth } from './util.js';

const COLORS = [0xf0f0f0, 0x1a1a1a, 0x8a8f96, 0xb02020, 0x1f3f80, 0xe0c030, 0x2e6a3a, 0xc8c0b0, 0x5a2a6a, 0xd06020, 0x30a0c0, 0x404448];
const SPACING = 30;
// lane: x, dir (+1 toward -z, your way), speed (m/s)
const ALL = [...LANES.map((x, i) => ({ x, dir: 1, sp: 12 + 1.2 * i })), ...LANES_ON.map((x, i) => ({ x, dir: -1, sp: 12.5 + 1.1 * i }))];
const MAXC = 420;
const G = 9.81;

function carSpec(li, n) {
  if (hh(li, n, 1) < 0.2) return null;
  return { li, n, off: (hh(li, n, 2) - 0.5) * 10, kind: Math.floor(hh(li, n, 3) * 4), col: COLORS[Math.floor(hh(li, n, 4) * COLORS.length)], r: hh(li, n, 5), r2: hh(li, n, 6) };
}

export function makeTraffic(world, ctx) {
  const fleet = makeFleet(world, MAXC, ctx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0), Zax = new THREE.Vector3(0, 0, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const spec = new Map();
  const get = (li, n) => { const k = li * 100000 + n; if (!spec.has(k)) spec.set(k, carSpec(li, n)); return spec.get(k); };
  return {
    frame(v, s, visible) {
      let i = 0;
      if (visible) {
        const sa = Math.max(-200, s - 650), sb = Math.min(PLAZA - 10, s + 1500);
        ALL.forEach((L, li) => {
          const drift = L.dir * L.sp * v;
          const n0 = Math.floor((sa - drift) / SPACING) - 1, n1 = Math.ceil((sb - drift) / SPACING) + 1;
          for (let n = n0; n <= n1 && i < MAXC; n++) {
            const C = get(li, n);
            if (!C) continue;
            let sc0 = n * SPACING + C.off + drift;
            if (sc0 < sa || sc0 > sb) continue;
            // (cars don't sit in the middle of a cross street: they're through it or waiting)
            const r = Math.hypot(L.x, 0.8);
            const b = blastAt(sc0, r);
            let x = L.x, y = 0, z = -sc0, yaw = L.dir > 0 ? 0 : Math.PI, roll = 0, pitch = 0;
            if (v >= b.t) {
              const psi = b.pa / PSI, age = v - b.t;
              const sHit = n * SPACING + C.off + L.dir * L.sp * b.t;
              z = -sHit;
              // still rolling on at its speed for a moment, braking hard
              const roll0 = L.sp * Math.min(age, L.sp / 8) - 4 * Math.min(age, L.sp / 8) ** 2;
              z -= L.dir * roll0;
              if (psi < 20) {
                // rocked and shoved (the blast lasts milliseconds: a big pressure but a small push)
                const k = clamp((psi - 0.8) / 12, 0, 1);
                x += Math.sign(L.x) * 3.0 * k * (1 - Math.exp(-age * 3));
                yaw += Math.sign(L.x) * (C.r - 0.5) * 0.6 * k * (1 - Math.exp(-age * 3));
                roll = Math.sign(L.x) * 0.25 * k * Math.exp(-age * 3) * Math.sin(age * 14);
              } else {
                // thrown: up and away from your path, rolling over, dragged your way by the wake
                const k = clamp((psi - 20) / 40, 0, 1);
                const vl = 3 + 20 * k, vu = 2.5 + 8 * k, vf = 2 + 10 * k;
                const away = Math.sign(L.x);
                const tf = (2 * vu) / G;                    // time in the air
                const ta = Math.min(age, tf);
                const spinRate = (2 + 5 * k) * (C.r < 0.5 ? 1 : 0.8);
                x += away * vl * ta;
                y = vu * ta - 0.5 * G * ta * ta;
                z -= vf * ta;
                roll = away * -spinRate * ta;
                yaw += (C.r2 - 0.5) * 1.2 * ta;
                if (age > tf) {
                  // landed: slide to a stop, settling on its side or roof
                  const tl = age - tf;
                  const slide = 1 - Math.exp(-tl * 2.2);
                  x += away * vl * 0.35 * slide;
                  z -= vf * 0.4 * slide;
                  const r0 = roll, target = Math.round(r0 / (Math.PI / 2)) * (Math.PI / 2);
                  roll = r0 + (target - r0) * smooth(0, 0.35, tl);
                  y = Math.abs(Math.sin(roll)) * 0.85 * smooth(0, 0.35, tl) + (1 - smooth(0, 0.35, tl)) * 0;
                }
                y += Math.abs(Math.sin(roll)) * 0.9 * (age < tf ? 1 : 0);
              }
            }
            q.setFromAxisAngle(Y, yaw);
            q2.setFromAxisAngle(Zax, roll);
            q.multiply(q2);
            m4.compose(p.set(x, y, z), q, sc);
            fleet.set(i, zero, false);            // (clear this slot's old car model first)
            fleet.color(i, C.col, C.kind);
            fleet.set(i, m4, false);
            i++;
          }
        });
      }
      for (let k = i; k < MAXC; k++) fleet.set(k, zero, false);
      fleet.commit();
    },
  };
}
