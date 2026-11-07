// The traffic jam: both ways stopped bumper to bumper, everyone gone, hazard lights blinking, some running lights on.
// Each car near a footstep jumps a little. Three cars meet the T. rex:
//   - 0:06 its left foot comes down on the roof of one (the body folds down to the sills, the glass bursts, dust);
//   - 0:12 it bites one, lifts it and flings it across the street (it tumbles, lands on its side, rolls onto its roof);
//   - 0:30 its leg bowls one aside (it slides and spins into the next lane).
// No car is in the way of anything that walks or runs (the T. rex's path, the herd's crossing, the thrown car's landing).
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { rng, smooth, clamp, lerp } from './util.js';
import { V_CRUSH, V_TOSS, V_SHOVE } from './timeline.js';
import { LANES, END_Z, SIDE1, CAM0 } from './layout.js';
import { CRUSH_CAR, PATH1, sRex1, PATH2, sRex2, PRINTS } from './rex.js';
import { HERD } from './herd.js';

const PAINT = [0xe8e8e8, 0xd02a2a, 0x2a5ab0, 0x9aa0a8, 0x1c2e4a, 0x111111, 0xf0f0f0, 0xc9c2b0, 0x30a06e, 0xe87a2a, 0x5a2a6a, 0x80c0e0, 0xf0c030];
const T_BITE = V_TOSS + 0.3, T_REL = V_TOSS + 0.66;

// the shoved car: beside its path at 0:30, on its right
const SHOVE = (() => { const q = PATH1.at(sRex1(V_SHOVE)); const r = { x: -Math.cos(q.yaw), z: Math.sin(q.yaw) }; return { x: q.x + r.x * 2.3, z: q.z + r.z * 2.3, yaw: 0.1, dx: r.x, dz: r.z }; })();

export const CARS = [];
{
  const R = rng(9090);
  const clear = (x, z) => {
    // the T. rex's path (its body and feet) from 0:00 to the end
    for (let s = sRex1(-1); s < sRex1(46); s += 0.5) { const q = PATH1.at(s); if (Math.hypot(q.x - x, q.z - z) < 3.6) return false; }
    for (let s = sRex2(31); s < sRex2(37.5); s += 0.5) { const q = PATH2.at(s); if (Math.hypot(q.x - x, q.z - z) < 4.0) return false; }
    if (z > SIDE1[0] - 3.5 && z < SIDE1[1] + 3.5) return false;                 // the crossing (the herd)
    if (Math.hypot(x - CRUSH_CAR.x, z - CRUSH_CAR.z) < 5.5 || Math.hypot(x - SHOVE.x, z - SHOVE.z) < 5.5) return false;
    if (x < 0 && z > -30 && z < -14) return false;                              // where the thrown car lands
    // the view from you to the boat in the harbour (0:22-0:25) stays clear
    { const dx = x - CAM0.x, dz = z - CAM0.z, a = dx * 0.88 - dz * 0.47, c = Math.abs(dx * 0.47 + dz * 0.88); if (x > 0 && a > 0 && a < 30 && c < 4.2) return false; }
    for (const h of HERD) for (let s = 0; s < h.P.L; s += 1) { const p = h.P.c.getPointAt(s / h.P.L); if (Math.abs(p.x - x) < 2.2 && Math.abs(p.z - z) < 3.4) return false; }
    return true;
  };
  for (const [x, yaw] of [[-LANES[1], Math.PI], [-LANES[0], Math.PI], [LANES[0], 0], [LANES[1], 0]]) {
    for (let z = 75 - R() * 5; z > END_Z + 6; z -= 6.2 + R() * 3.5) {
      // (on your right, near you, the two lanes leave a gap down the middle: the herd runs down it)
      const xx = (x > 0 && z > -12 ? (x < 8 ? 6.15 : 11.35) : x) + (R() - 0.5) * (x > 0 && z > -12 ? 0.15 : 0.5), a = yaw + (R() - 0.5) * (x > 0 && z > -12 ? 0.04 : 0.12);
      if (!clear(xx, z)) continue;
      CARS.push({ x: xx, z, yaw: a, col: PAINT[Math.floor(R() * PAINT.length)], kind: [0, 0, 1, 2, 2, 3][Math.floor(R() * 6)], hz: R() < 0.7, lights: R() < 0.5, ph: R() });
    }
  }
}

export function makeTraffic(scene, ctx, rexes) {
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => { c.i = i; fleet.color(i, c.col, c.kind); });
  // the three that meet it: their own fleet, with a shader that folds the crushed one's roof down
  const crushU = { value: 0 };
  const squash = (m, i) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uCrush = crushU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCrush;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          if (gl_InstanceID == 0 && uCrush > 0.0) {
            float y0 = 0.5;
            if (transformed.y > y0) {
              transformed.y = y0 + (transformed.y - y0) * (1.0 - 0.82 * uCrush) - 0.05 * uCrush * (0.5 + 0.5 * sin(transformed.z * 4.3) * cos(transformed.x * 5.1));
              transformed.x *= 1.0 + 0.07 * uCrush;
            }
            transformed.z *= 1.0 + 0.03 * uCrush;
          }
          #endif`);
    };
    m.customProgramCacheKey = () => 'dino-squash-' + i;
    return m;
  };
  let mk = 0;
  const sctx = { ...ctx, plainMat: (c, r, e) => squash(ctx.plainMat(c, r, e), mk++), glowMat: (c) => squash(ctx.glowMat(c), mk++) };
  const hero = makeFleet(scene, 3, sctx);
  hero.color(0, 0xf0c030, 0); hero.color(1, 0xd02a2a, 0); hero.color(2, 0xe8e8e8, 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const CEN = new THREE.Matrix4().makeTranslation(0, -0.75, 0);         // (the thrown car turns about its middle)

  // ---- the thrown car: where it sits, then held in the jaws (fixed to the jaw), then flying, landing, rolling ----
  let toss = null;
  function planToss() {
    const J = new THREE.Matrix4();
    rexes.frame(T_BITE);
    const jw = rexes.r1.out.jaw;
    J.compose(jw.o, jw.q, one);
    // it sits where the jaw closes on it, side-on to the bite, on the ground
    const tip = jw.at(0.95, -0.05, 0);
    const fwd = jw.dir(1, 0, 0);
    const yaw = Math.atan2(fwd.x, fwd.z) + Math.PI / 2;
    const rest = new THREE.Matrix4().compose(new THREE.Vector3(tip.x, 0, tip.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), one);
    const rel = new THREE.Matrix4().copy(J).invert().multiply(rest);
    const at = (t) => { rexes.frame(t); const j = rexes.r1.out.jaw; return new THREE.Matrix4().compose(j.o, j.q, one).multiply(rel); };
    // release: position and spin from two moments a hair apart
    const dt = 1 / 120;
    const a = at(T_REL - dt), b = at(T_REL);
    const pa = new THREE.Vector3().setFromMatrixPosition(a.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.75, 0)));
    const pb = new THREE.Vector3().setFromMatrixPosition(b.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.75, 0)));
    const vel = pb.clone().sub(pa).divideScalar(dt);
    // the throw: the way its head swings it, flung 8 m/s out and 5 m/s up
    const hz = Math.hypot(vel.x, vel.z) || 1;
    vel.x *= 8 / hz; vel.z *= 8 / hz; vel.y = 5;
    const qb = new THREE.Quaternion().setFromRotationMatrix(b);
    const g = 9.81, y0 = pb.y, yl = 0.95;
    const tl = (vel.y + Math.sqrt(vel.y * vel.y + 2 * g * (y0 - yl))) / g;     // flight time to landing
    const roll = new THREE.Vector3(0, 0, 1).applyQuaternion(qb);             // it barrels about its long axis
    toss = { rest, at, pb, vel, qb, tl, roll, spin: 5.2 };
    console.log(`toss: rest ${tip.x.toFixed(1)},${tip.z.toFixed(1)} release ${pb.x.toFixed(1)},${pb.y.toFixed(1)},${pb.z.toFixed(1)} v ${vel.x.toFixed(1)},${vel.y.toFixed(1)},${vel.z.toFixed(1)} lands after ${tl.toFixed(2)} s at ${(pb.x + vel.x * tl).toFixed(1)},${(pb.z + vel.z * tl).toFixed(1)}`);
  }
  const tossMatrix = (v, out) => {
    if (v < T_BITE) return out.copy(toss.rest);
    if (v < T_REL) return out.copy(toss.at(v));
    const t = v - T_REL;
    const T = toss;
    const qq = new THREE.Quaternion();
    if (t < T.tl) {
      p.copy(T.pb).addScaledVector(T.vel, t); p.y -= 4.905 * t * t;
      qq.setFromAxisAngle(T.roll, T.spin * t).multiply(T.qb);
      return out.compose(p, qq, one).multiply(CEN);
    }
    // on the ground: it skids on, rolls once more and comes to rest on its roof, settling with two small bounces
    const u = t - T.tl, k = smooth(0, 1.4, u);
    const land = T.pb.clone().addScaledVector(T.vel, T.tl); land.y = 0;
    const hv = new THREE.Vector3(T.vel.x, 0, T.vel.z);
    const slide = Math.min(hv.length() * 0.35, 4.5);
    hv.normalize();
    const ang0 = T.spin * T.tl, ang1 = Math.ceil((ang0 + 2.2) / Math.PI) * Math.PI;
    const ang = lerp(ang0, ang1, 1 - Math.pow(1 - k, 2.2));
    p.copy(land).addScaledVector(hv, slide * (1 - Math.pow(1 - k, 2)));
    // the centre's height: a car on its side is 0.9 up, on its roof or wheels 0.75; plus the bounces
    const side = Math.abs(Math.sin(ang));
    p.y = lerp(0.75, 0.92, side) + 0.45 * Math.abs(Math.sin(u * 7.5)) * Math.exp(-u * 3.2);
    qq.setFromAxisAngle(T.roll, ang).multiply(T.qb);
    // (no tilt left over from the bite: level it out as it settles)
    return out.compose(p, qq, one).multiply(CEN);
  };

  const hzOn = (c, v) => (Math.sin((v + c.ph) * Math.PI * 2 * 1.4) > 0 ? 1 : 0.08);
  return {
    hero,
    get toss() { return toss; },
    frame(v, s, glows, smoke) {
      if (!toss) { planToss(); rexes.frame(v); }
      // how much each footstep jolts things near it
      const jolt = (x, z) => {
        let k = 0;
        for (const P of PRINTS) { const dt = v - P.t; if (dt < 0 || dt > 0.5) continue; const d = Math.hypot(P.x - x, P.z - z); if (d < 14) k = Math.max(k, Math.exp(-dt / 0.12) * Math.sin(Math.min(dt * 40, Math.PI)) * (1 - d / 14)); }
        return k;
      };
      for (const c of CARS) {
        const j = jolt(c.x, c.z);
        e.set(0.01 * j, c.yaw, 0.008 * j);
        q.setFromEuler(e);
        m4.compose(p.set(c.x, 0.06 * j, c.z), q, one);
        fleet.set(c.i, m4, c.lights);
        if (c.hz) {
          const on = hzOn(c, v) * 2.2;
          const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
          for (const [lx, lz] of [[-0.82, -2.3], [0.82, -2.3], [-0.82, 2.32], [0.82, 2.32]]) {
            glows.add(c.x + lx * cs + lz * sn, 0.72, c.z - lx * sn + lz * cs, 0.3, 2.6 * on, 1.3 * on, 0.15 * on);
          }
        }
      }
      fleet.commit();
      // ---- the crushed car ----
      crushU.value = smooth(V_CRUSH - 0.12, V_CRUSH + 0.05, v);
      {
        const j = crushU.value > 0.5 ? 0 : jolt(CRUSH_CAR.x, CRUSH_CAR.z);
        e.set(0.03 * crushU.value * Math.sin(CRUSH_CAR.x), CRUSH_CAR.yaw, 0.02 * crushU.value);
        q.setFromEuler(e);
        hero.set(0, m4.compose(p.set(CRUSH_CAR.x, 0.05 * j, CRUSH_CAR.z), q, one), true);
        const sn = Math.sin(CRUSH_CAR.yaw), cs = Math.cos(CRUSH_CAR.yaw);
        const on = (Math.sin(v * Math.PI * 2 * 2.2) > 0 ? 2.6 : 0.1) * smooth(V_CRUSH, V_CRUSH + 0.2, v);
        for (const [lx, lz] of [[-0.82, -2.3], [0.82, -2.3], [-0.82, 2.32], [0.82, 2.32]]) glows.add(CRUSH_CAR.x + lx * cs + lz * sn, 0.6, CRUSH_CAR.z - lx * sn + lz * cs, 0.32, 2.6 * on, 1.3 * on, 0.15 * on);
        // the glass bursting out, and dust
        const dt = v - V_CRUSH;
        if (dt > 0 && dt < 1.6) {
          for (let k = 0; k < 40; k++) {
            const a = k * 2.39996, sp = 2 + (k % 7) * 0.7, up = 1.5 + (k % 5) * 0.8;
            const y = 0.9 + up * dt - 4.9 * dt * dt;
            if (y < 0.02) continue;
            const tw = 0.4 + 0.6 * Math.max(0, Math.sin(dt * 23 + k));
            glows.add(CRUSH_CAR.x + Math.cos(a) * sp * dt, y, CRUSH_CAR.z + Math.sin(a) * sp * dt, 0.07, 2.2 * tw, 2.4 * tw, 2.6 * tw);
          }
          for (let k = 0; k < 8; k++) { const a = k * 0.785, rr = 1.5 + 2.5 * Math.sqrt(dt); smoke.puff(CRUSH_CAR.x + Math.cos(a) * rr, 0.4 + 0.5 * dt, CRUSH_CAR.z + Math.sin(a) * rr, 0.6 + 0.8 * dt, 0.35 * (1 - dt / 1.6), 0.8, 0, (k * 0.13) % 1); }
        }
      }
      // ---- the thrown car ----
      {
        tossMatrix(v, m4);
        hero.set(1, m4, v < T_BITE);
        const t = v - T_REL - toss.tl;
        if (t > 0 && t < 2.5) {
          const pp = new THREE.Vector3().setFromMatrixPosition(m4);
          for (let k = 0; k < 10; k++) { const a = k * 0.63, rr = 1.2 + 3 * Math.sqrt(t); smoke.puff(pp.x + Math.cos(a) * rr, 0.4 + 0.6 * t, pp.z + Math.sin(a) * rr, 0.7 + 1.0 * t, 0.4 * (1 - t / 2.5), 0.8, 0, (k * 0.17) % 1); }
          if (t < 1.2) for (let k = 0; k < 30; k++) {
            const a = k * 2.39996, sp = 2 + (k % 6) * 0.9, up = 1 + (k % 4) * 1.1, y = 0.6 + up * t - 4.9 * t * t;
            if (y > 0.02) { const tw = 0.4 + 0.6 * Math.max(0, Math.sin(t * 21 + k)); glows.add(pp.x + Math.cos(a) * sp * t, y, pp.z + Math.sin(a) * sp * t, 0.07, 2.2 * tw, 2.4 * tw, 2.6 * tw); }
          }
        }
      }
      // ---- the car knocked aside ----
      {
        const k = smooth(V_SHOVE - 0.05, V_SHOVE + 0.9, v), j = jolt(SHOVE.x, SHOVE.z);
        const d = 2.8 * (1 - Math.pow(1 - k, 2));
        e.set(0.02 * j, SHOVE.yaw + 0.9 * (1 - Math.pow(1 - k, 2)), 0.06 * Math.sin(Math.PI * k));
        q.setFromEuler(e);
        hero.set(2, m4.compose(p.set(SHOVE.x + SHOVE.dx * d, 0.05 * j + 0.12 * Math.sin(Math.PI * Math.min(k * 2, 1)), SHOVE.z + SHOVE.dz * d), q, one), true);
        const dt = v - V_SHOVE;
        if (dt > 0 && dt < 1.4) for (let n = 0; n < 6; n++) smoke.puff(SHOVE.x + SHOVE.dx * d + (n - 2.5) * 0.7, 0.3 + 0.3 * dt, SHOVE.z + SHOVE.dz * d - 1.5 + n * 0.6, 0.5 + 0.6 * dt, 0.3 * (1 - dt / 1.4), 0.8, 0, (n * 0.19) % 1);
      }
      hero.commit();
    },
  };
}
export { SHOVE };
