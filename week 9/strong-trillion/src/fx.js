// Effects: the craters and cracks under your feet at every lift; dust, chunks of pavement and glass; the splash and
// spray of the ship; the jet's fireball and the fire it starts; the dust of every landing, and the wall of dust after
// the mountain lands. All of it is a function of time (every particle's path is worked out from its launch).
import * as THREE from 'three';
import { B, V_WHITE } from './timeline.js';
import { SPOT, SEA_Y, QUAY_Z, SHIP, TOWER, MTN, FAR_Z } from './layout.js';
import { NCR, craterH } from './world.js';
import { MOVES } from './choreo.js';
import { smooth, clamp, lerp, rng } from './util.js';

const G = 9.81;
// the craters: [spot, time it starts, time it's done, radius, depth, crack reach, rubble]
const CRATERS = [
  [SPOT.bus, B.busGrab + 0.6, B.busUp + 0.3, 0.9, 0.04, 3.0, 0.2],
  [SPOT.truck, B.truckGrab + 0.5, B.truckUp + 0.4, 1.8, 0.16, 8.0, 0.5],
  [SPOT.jet, B.jetGrab + 0.4, B.jetUp + 0.4, 3.2, 0.42, 15.0, 0.8],
  [SPOT.ship, B.shipGrab + 0.6, B.shipUp + 0.5, 5.5, 0.75, 26.0, 1.0],
  [SPOT.tower, B.towerGrab + 0.5, B.towerUp + 0.5, 8.5, 1.05, 42.0, 1.0],
  [SPOT.mtn, B.leapLand - 0.02, B.leapLand + 0.25, 6.0, 0.7, 30.0, 1.0],
];
export function makeFx(scene, ctx, { smoke, glows }) {
  const R = rng(9090);
  // ---- chunks: instanced boxes (pavement, glass, metal, rock) ----
  const MAXC = 2600;
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const chunkMat = ctx.plainMat(0xffffff, 0.85);
  const chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, MAXC);
  chunks.castShadow = true; chunks.receiveShadow = true; chunks.frustumCulled = false;
  scene.add(chunks);
  const col = new THREE.Color();
  for (let i = 0; i < MAXC; i++) chunks.setColorAt(i, col.setRGB(1, 1, 1));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let nc = 0;
  const chunk = (x, y, z, s, rx, ry, rz, r, g, b) => {
    if (nc >= MAXC || s <= 0.001) return;
    chunks.setMatrixAt(nc, m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), sc.set(s, s * 0.55, s * 0.8)));
    chunks.setColorAt(nc, col.setRGB(r, g, b));
    nc++;
  };
  // a burst of chunks thrown from (x, y, z) at t0: n pieces, speed v, size s, colour; they bounce once and lie still
  const BURSTS = [];
  const burst = (t0, x, y, z, n, v, s, c, o = {}) => BURSTS.push({ t0, x, y, z, n, v, s, c, seed: R() * 1000, up: o.up ?? 0.8, dir: o.dir || null, spread: o.spread ?? 1, floor: o.floor ?? null, life: o.life ?? 6 });
  // the touchdowns of your bounds: small cracks of dust and chunks
  const TOUCH = [];
  for (const [t0, t1, a, b, kind, nb] of MOVES) {
    if (kind !== 'bound') continue;
    for (let i = 1; i <= nb; i++) {
      const k = (i / nb) * (1 - 0.12) + 0.12;
      const kk = clamp((k - 0.12) / 0.88, 0, 1);
      const s = kk * kk * (3 - 2 * kk) * 0.25 + kk * 0.75;
      TOUCH.push({ t: t0 + k * (t1 - t0), x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s });
    }
  }
  // what breaks when: pavement at each crater, glass when the bus and truck crash, metal and glass at the ship
  const pave = [0.6, 0.57, 0.53];
  for (const [sp, t0, t1, r, d, reach] of CRATERS) burst(t0 + 0.05, sp.x, 0.1, sp.z, Math.round(10 + r * 9), 1.5 + r * 0.9, 0.12 + r * 0.05, pave, { up: 1.2 });
  for (const t of TOUCH) burst(t.t, t.x, 0.05, t.z, 14, 3, 0.18, pave, { up: 1.4 });
  burst(B.carLand, -2.2, 0.6, -14.5, 30, 3.5, 0.05, [0.7, 0.8, 0.85], { up: 0.6 });                 // the car's glass
  burst(B.busLand, -11, 0.8, -50.5, 70, 6, 0.08, [0.75, 0.85, 0.9], { up: 0.7 });                  // the bus's windows
  burst(B.busLand, -11, 0.4, -50.5, 30, 4, 0.3, [0.16, 0.16, 0.17], { up: 1.1 });                   // asphalt
  burst(B.truckHit, 6.2, 6.5, -95, 60, 8, 0.35, [0.82, 0.4, 0.12], { up: 0.5, dir: [0, 0, 1] });   // the container's sheet metal
  burst(B.truckHit, 6.2, 6.5, -96, 50, 7, 0.25, [0.1, 0.14, 0.24], { up: 0.5, dir: [0, 0, 1] });   // the hull's plates
  burst(B.jetHit, 40, 33, -92, 160, 14, 0.45, [0.92, 0.92, 0.9], { up: 0.7, dir: [0, 0.2, 1] });   // the jet and the decks
  burst(B.towerGrab + 0.6, TOWER.x - 18, 2, SPOT.tower.z, 60, 4, 0.4, [0.55, 0.6, 0.66], { up: 1.2 });   // the tower's base floors
  burst(B.towerUp, TOWER.x - 18, 4, SPOT.tower.z, 50, 5, 0.6, [0.45, 0.55, 0.65], { up: 1.0 });
  // glass glints when the tower comes away: pieces from its lower floors
  burst(B.towerUp + 0.2, TOWER.x, 30, TOWER.z, 120, 6, 0.35, [0.6, 0.72, 0.82], { up: 0.2 });

  const ripple = [];
  return {
    // ---- the crater uniforms ----
    craters(v, GU) {
      CRATERS.forEach(([sp, t0, t1, r, d, reach, rub], i) => {
        const k = smooth(t0, t1, v);
        // the mountain's crater keeps growing as you lift it (the ground under you gives)
        let R0 = r, D0 = d, Rk = reach;
        if (i === 5) { const m = smooth(B.mtnGrab + 0.4, B.mtnThrow, v); R0 = r + 12 * m; D0 = d + 1.6 * m; Rk = reach + 140 * m + 200 * smooth(B.mtnThrow, B.mtnLand, v); }
        GU.uCr.value[i].set(sp.x, sp.z, R0 * (0.3 + 0.7 * k), D0 * k);
        GU.uCk.value[i].set(Rk * (0.15 + 0.85 * smooth(t0, t1 + 0.6, v)), k > 0 ? 1 : 0, 3.7 * i + 1.1, rub * k);
      });
    },
    frame(v, o) {
      nc = 0;
      // ---- chunk bursts ----
      for (const b of BURSTS) {
        const t = v - b.t0;
        if (t < 0 || t > b.life) continue;
        const rr = rng(Math.floor(b.seed));
        for (let i = 0; i < b.n; i++) {
          const a = rr() * Math.PI * 2, sp = b.v * (0.35 + 0.65 * rr()), up = b.up * (0.4 + 0.8 * rr());
          let vx = Math.cos(a) * sp * b.spread, vz = Math.sin(a) * sp * b.spread, vy = sp * up;
          if (b.dir) { vx = vx * 0.5 + b.dir[0] * sp; vy += b.dir[1] * sp; vz = vz * 0.5 + b.dir[2] * sp; }
          const s = b.s * (0.4 + 0.9 * rr());
          // fall to the ground (or the water) and stop
          const yg = b.y > 3 && Math.abs(b.z - QUAY_Z) < 6 ? (rr() < 0.5 ? SEA_Y : 0) : 0;
          const tLand = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0.01, b.y - yg))) / G;
          const tt = Math.min(t, tLand);
          const x = b.x + vx * tt + (t > tLand ? vx * 0.15 * (1 - Math.exp(-(t - tLand) * 4)) : 0);
          const z = b.z + vz * tt + (t > tLand ? vz * 0.15 * (1 - Math.exp(-(t - tLand) * 4)) : 0);
          const y = Math.max(yg + s * 0.25, b.y + vy * tt - 0.5 * G * tt * tt);
          const spin = Math.min(t, tLand + 0.3) * (4 + 6 * rr());
          const fade = yg < 0 && t > tLand ? 0 : 1;
          const sh = 0.85 + 0.3 * rr();
          chunk(x, y, z, s * fade, spin + a, spin * 0.7, spin * 0.3, b.c[0] * sh, b.c[1] * sh, b.c[2] * sh);
        }
      }
      for (let i = nc; i < MAXC; i++) chunks.setMatrixAt(i, zero);
      chunks.instanceMatrix.needsUpdate = true; chunks.instanceColor.needsUpdate = true;

      // ---- dust ----
      const dustRing = (t0, x, z, R0, n, size, life, shade = 0.62, h = 0.6) => {
        const t = v - t0; if (t < 0 || t > life) return;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + i * 0.37, f = ((i * 0.618) % 1);
          const r = R0 + size * 3.5 * (1 - Math.exp(-t * 1.4)) * (0.6 + 0.6 * f);
          smoke.puff(x + Math.cos(a) * r, h + 0.5 * size * t * (0.4 + f), z + Math.sin(a) * r, size * (0.5 + 0.8 * (1 - Math.exp(-t * 1.2))) * (0.7 + 0.5 * f),
            0.55 * smooth(0, 0.15, t) * (1 - smooth(life * 0.45, life, t)), shade, 0, f);
        }
      };
      for (const [sp, t0, t1, r, d, reach] of CRATERS) if (r > 1 && sp !== SPOT.ship && sp !== SPOT.tower) dustRing(t0, sp.x, sp.z, r * 0.8, 10 + Math.round(r * 2), 0.25 + r * 0.22, 3 + r * 0.3);
      for (const t of TOUCH) dustRing(t.t, t.x, t.z, 0.4, 8, 0.6, 2.5);
      dustRing(B.carLand, -2.4, -14.8, 1.0, 10, 0.7, 3);
      dustRing(B.busLand, -11, -50.5, 3, 18, 1.4, 5);
      dustRing(B.busLand + 0.9, -12, -60, 3, 14, 1.2, 4);
      dustRing(B.truckHit + 0.9, 5, -88, 4, 16, 1.6, 5);

      // ---- the ship: water pouring off it as it rises; the splash where it was; the crash on the far shore ----
      {
        const t = v - (B.shipGrab + 1.6);
        if (t > 0 && t < 6) {
          const k = smooth(0, 1.2, t) * (1 - smooth(2.6, 5.5, t));
          const lifted = Math.min(9.8, 9.8 * smooth(0, 1.4, t));
          for (let i = 0; i < 90; i++) {
            const f = (i * 0.618) % 1, xx = -130 + 260 * (i / 90);
            const zz = SHIP.z + 3.2 * smooth(0, 1.4, t) + (i % 3 ? 18.5 : -18.5);
            const fall = ((t * 1.3 + f) % 1);
            smoke.puff(xx, lerp(SEA_Y + lifted - 7, SEA_Y + 0.3, fall * fall), zz + (i % 3 ? 1 : -1) * 1.5 * fall, 1.3 + 1.6 * f + 1.5 * fall, 0.45 * k * (1 - fall * 0.5), 1.0, 0, f);
          }
          // the hole the ship leaves in the water fills back in: a ring of foam spreading
        }
        const tl = v - B.shipLand;
        if (tl > 0 && tl < 9) {
          for (let i = 0; i < 70; i++) {
            const f = (i * 0.618) % 1, g = (i * 0.377) % 1;
            const xx = -290 + 300 * (i / 70);
            const r = 10 + 60 * (1 - Math.exp(-tl * 0.9)) * (0.5 + f);
            smoke.puff(xx, 8 + 30 * g * (1 - Math.exp(-tl * 1.2)) + 3 * tl, -398 + (g - 0.5) * 60 + r * 0.3, 10 + 14 * f + 4 * tl, 0.7 * smooth(0, 0.2, tl) * (1 - smooth(4, 9, tl)), i % 3 ? 0.68 : 0.95, 0, f);
          }
        }
      }
      // ---- the jet: a fireball when it hits the ship, then it burns ----
      {
        const t = v - B.jetHit;
        o.fireL.intensity = 0;
        if (t > 0) {
          const fb = Math.exp(-t / 0.9);
          const jp = o.js.p;
          for (let i = 0; i < 26; i++) {
            const f = (i * 0.618) % 1, g = (i * 0.377) % 1, a = i * 2.4;
            const r = (4 + 22 * (1 - Math.exp(-t * 2.5))) * (0.4 + 0.6 * f);
            smoke.puff(jp.x + Math.cos(a) * r, jp.y + r * 0.5 * (g - 0.3) + 4 * t, jp.z + 6 + Math.sin(a) * r * 0.6, 6 + 10 * g * (1 - Math.exp(-t * 2)) + 2 * t,
              0.85 * smooth(0, 0.08, t) * (1 - smooth(1.6, 3.5, t)), 0.18, 1.1 * fb * (1.0 - g) + 0.15, f);
          }
          // smoke rising from where it burns (rides with the ship)
          if (v < B.shipThrow + 0.3) for (let i = 0; i < 16; i++) {
            const f = (i * 0.618) % 1, h = ((t * 0.35 + f) % 1);
            smoke.puff(jp.x + (f - 0.5) * 20, jp.y + 6 + 60 * h, jp.z + 4 + 10 * h, 5 + 14 * h, 0.6 * smooth(0, 1, t) * (1 - h), 0.12, h < 0.15 ? 1.2 : 0, f);
          }
          o.fireL.position.set(jp.x, jp.y + 4, jp.z + 8);
          o.fireL.intensity = v < B.shipThrow ? 160 * (0.5 + 2 * fb) : 0;
          for (let i = 0; i < 20 && v < B.shipThrow; i++) {
            const f = (i * 0.618) % 1;
            glows.add(jp.x + (f - 0.5) * 24, jp.y + 2 * Math.sin(v * 9 + i), jp.z + 6, 4 + 4 * f, 1.6, 0.6, 0.15);
          }
        }
      }
      // ---- the tower: dust where it lands, along its length ----
      {
        const t = v - B.towerLand;
        if (t > 0 && t < 9) for (let i = 0; i < 50; i++) {
          const f = (i * 0.618) % 1, g = (i * 0.377) % 1;
          const d = 285 * (i / 50);
          smoke.puff(185 + d * 0.94 + (f - 0.5) * 30, 6 + 40 * g * (1 - Math.exp(-t)) + 4 * t, -392 - d * 0.34 + (g - 0.5) * 40, 14 + 12 * f + 5 * t, 0.75 * smooth(0, 0.25, t) * (1 - smooth(5, 9, t)), 0.66, 0, f);
        }
      }
      // ---- the leap's landing: a ring of dust and sand ----
      dustRing(B.leapLand, SPOT.mtn.x, SPOT.mtn.z, 3.5, 22, 1.3, 2.6, 0.7);
      // ---- the mountain: rock and dust falling off its face as you lift; dust along its foot; the landing ----
      {
        const lift = smooth(B.mtnGrab + 0.3, B.mtnUp, v);
        if (v > B.mtnGrab && v < B.mtnLand + 3) {
          // dust along the foot, where it tears from the ground
          const k = smooth(B.mtnGrab + 0.3, B.mtnGrab + 2, v) * (1 - smooth(B.mtnThrow + 0.6, B.mtnThrow + 2.5, v));
          for (let i = 0; i < 40; i++) {
            const f = (i * 0.618) % 1, x = SPOT.mtn.x - 260 + 520 * (i / 40);
            const zf = MTN.z + MTN.rz * Math.sqrt(Math.max(0, 1 - Math.pow((x - MTN.x) / MTN.rx, 2)));
            smoke.puff(x, 3 + 8 * f + 4 * lift, zf - 6 - 10 * f, 6 + 8 * f + 6 * lift, 0.55 * k, 0.6, 0, f);
          }
          // rockfalls down the face (dust plumes sliding down)
          for (let i = 0; i < 24; i++) {
            const f = (i * 0.618) % 1, g = (i * 0.377) % 1;
            const ts = B.mtnGrab + 0.8 + 4 * f;
            const tt = v - ts; if (tt < 0 || tt > 4) continue;
            const x = SPOT.mtn.x - 300 + 600 * g;
            const h0 = 300 + 700 * ((i * 0.211) % 1), h = Math.max(0, h0 - 160 * tt);
            const zf = MTN.z + MTN.rz - 50 - h * 0.75;
            const pp = new THREE.Vector3(x, h, zf).applyMatrix4(o.ms.M);
            smoke.puff(pp.x, pp.y, pp.z, 20 + 25 * tt, 0.5 * smooth(0, 0.4, tt) * (1 - smooth(2.5, 4, tt)), 0.58, 0, f);
          }
        }
        // the landing: a wall of dust along its whole outline, rising, then rolling back toward you
        const t = v - B.mtnLand;
        if (t > -0.1) {
          const dist = 3500 - 1550 * Math.max(0, t);        // the wall's front, metres north of you
          for (let i = 0; i < 90; i++) {
            const f = (i * 0.618) % 1, g = (i * 0.377) % 1;
            const x = SPOT.mtn.x - 3000 + 6000 * (i / 90);
            const zf = SPOT.mtn.z - Math.max(160, dist) - 300 * g;
            const hgt = 100 + 900 * g * Math.min(1, (t + 0.1) * 0.9);
            smoke.puff(x, hgt, zf, 160 + 200 * f + 60 * Math.max(0, t), 0.9 * smooth(-0.1, 0.4, t), 0.8, 0, f);
          }
        }
      }
    },
  };
}
