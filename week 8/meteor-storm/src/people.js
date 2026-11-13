// The people. Planned up front so nobody walks through anybody (or you), jumps or changes size:
//   - a packed crowd on the promenade between you and the railing, looking up at the radiant, half filming with their
//     phones held up (the screens glow), some pointing; more along the jetty walkway, on the pier, and down the
//     promenade past it;
//   - the fireballs: people point and follow them; the booms: everyone flinches (0:06.7, 0:13), the ones near the car
//     jump back (0:22);
//   - 0:26.5 everyone near you runs for the covered pier (one path each, checked against everyone else at 0.1 s steps;
//     anyone whose path can't be made clear crouches where they stand instead, hands over their head);
//   - 0:31 everyone turns to the biggest one; 0:41 hands up against its light.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { QZ, JX, JZ, ROAD, PIER, HIT_CAR, LAMPS } from './layout.js';
import { rng, clamp, smooth, wobble, lerp } from './util.js';
import { V_FB1, V_BOOM1, V_DAY, V_BOOM, V_SPLASH, V_CAR, V_RUN, V_BIG, V_DIVE, V_IMPACT } from './timeline.js';

const SHIRTS = [0x1d2230, 0xe8e2d6, 0x3a3328, 0x6b5a44, 0xc8d4e8, 0x7a2a2a, 0x24384a, 0xf0c060, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x8a5a8a, 0xd05030, 0x3a4a6a, 0xffffff, 0x60a0d0, 0xe86a8a, 0x40b0b0, 0xc8a050];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x8a7a66, 0xc9c2b6, 0x4a6a9a];

// a path: waypoints [x, z], a speed, the time it starts
function path(pts, sp, t0) {
  const seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push({ a: pts[i], b: pts[i + 1], L0: L, d }); L += d; }
  return { pts, sp, t0, seg, L };
}
function posOf(p, v, out = {}) {
  const raw = p.sp * (v - p.t0);
  const s = clamp(raw, 0, p.L);
  out.moving = raw > 0 && raw < p.L && p.L > 0;
  out.s = s;
  if (!p.seg.length) { out.x = p.pts[0][0]; out.z = p.pts[0][1]; out.yaw = null; return out; }
  let g = p.seg[p.seg.length - 1];
  for (const q of p.seg) if (s <= q.L0 + q.d) { g = q; break; }
  const u = g.d > 0 ? (s - g.L0) / g.d : 0;
  out.x = g.a[0] + (g.b[0] - g.a[0]) * u; out.z = g.a[1] + (g.b[1] - g.a[1]) * u;
  out.yaw = Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]);
  return out;
}

const CAM = { x: 0, z: 0 };
export const PEOPLE = [];
{
  const R = rng(1833);
  const obst = LAMPS.filter((l) => !l.roof).map((l) => ({ x: l.x, z: l.z, r: 0.45 }));
  for (let z = PIER.z0 - 1; z >= PIER.roofZ1; z -= 6.5) for (const x of [PIER.x0 + 0.5, PIER.x1 - 0.5]) obst.push({ x, z, r: 0.5 });
  const onLand = (x, z) => (z > QZ + 0.55 && z < 30) || (x > JX + 0.6 && x < ROAD[0] - 0.4 && z > JZ + 1 && z < QZ + 1) || (x > PIER.x0 + 0.6 && x < PIER.x1 - 0.6 && z < PIER.z0 + 0.6 && z > PIER.z1 + 1);
  const free = (x, z, r = 0.62) => {
    if (!onLand(x, z)) return false;
    if ((x - CAM.x) ** 2 + (z - CAM.z) ** 2 < 1.25 ** 2) return false;
    if (z > -1.0 && Math.abs(x) < 3.5) return false;                           // (nobody beside or behind you)
    // the view from you to the car that gets hit stays clear
    { const ex = HIT_CAR.x, ez = HIT_CAR.z, L = Math.hypot(ex, ez), u = (x * ex + z * ez) / L; if (u > 2.5 && u < L && Math.abs(x * ez - z * ex) / L < 1.1) return false; }
    for (const o of obst) if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return false;
    for (const p of PEOPLE) if ((x - p.x0) ** 2 + (z - p.z0) ** 2 < r * r) return false;
    return true;
  };
  const ACT = () => (R() < 0.55 ? 'phone' : R() < 0.35 ? 'point' : 'look');
  const stand = (x, z, extra = {}) => { const p = { x0: x, z0: z, act: ACT(), yaw: Math.PI + (R() - 0.5) * 0.6 + x * 0.004, ...extra }; PEOPLE.push(p); return p; };
  // hand placed close in front of you on frame 0: backs to you, phones up at the sky
  for (const [x, z, act] of [[0.62, -1.75, 'phone'], [-0.78, -2.15, 'phone'], [1.75, -2.6, 'point'], [-1.95, -1.6, 'look'], [2.7, -1.35, 'phone'], [-0.1, -3.4, 'phone'], [-2.9, -3.0, 'phone'], [1.05, -4.1, 'look']]) {
    stand(x, z, { act, near: true });
  }
  // the packed crowd between you and the railing
  for (let k = 0; k < 6000 && PEOPLE.length < 120; k++) {
    const x = -13.5 + R() * 22.5, z = QZ + 0.6 + Math.pow(R(), 0.8) * 10.5;
    if (free(x, z)) stand(x, z, { front: true });
  }
  // along the jetty walkway (not right by the car that gets hit)
  for (let k = 0; k < 3000 && PEOPLE.length < 150; k++) {
    const x = JX + 0.8 + R() * 2.4, z = QZ - R() * 50;
    if (z < HIT_CAR.z + 7 && z > HIT_CAR.z - 7) continue;
    if (free(x, z, 0.7)) stand(x, z, { yaw: Math.PI * 0.75 + (R() - 0.5) * 0.6, jetty: true });
  }
  // on the pier, under its roof and out past it
  for (let k = 0; k < 3000 && PEOPLE.length < 180; k++) {
    const x = PIER.x0 + 0.9 + R() * 10.2, z = PIER.z0 - 3 - R() * 85;
    if (free(x, z, 0.8)) stand(x, z, { yaw: Math.PI * 1.15 + (R() - 0.5) * 0.7, pier: true });
  }
  // down the promenade past the pier
  for (let k = 0; k < 3000 && PEOPLE.length < 250; k++) {
    const x = -30 - R() * 110, z = QZ + 0.7 + R() * 9;
    if (free(x, z, 0.7)) stand(x, z, { yaw: Math.PI * 0.95 + (R() - 0.5) * 0.7, west: true });
  }

  PEOPLE.forEach((p, i) => {
    p.i = i;
    p.shirt = SHIRTS[Math.floor(R() * SHIRTS.length)];
    p.pants = PANTS[Math.floor(R() * PANTS.length)];
    p.skin = SKIN[Math.floor(R() * SKIN.length)];
    p.hair = HAIR[Math.floor(R() * HAIR.length)];
    p.sleeves = R() < 0.35;
    p.s = R() < 0.05 && !p.near ? 0.72 : 0.92 + R() * 0.16;
    p.ph = R() * 10;
    p.react = 0.1 + R() * 0.3;
    p.track = R();
    p.path = path([[p.x0, p.z0]], 0, 0);
  });

  // ---- 0:26.5: the run for the pier (the front crowd, the jetty people nearest it; the far ones crouch) ----
  const STEPS = []; for (let v = V_RUN; v <= V_RUN + 14; v += 0.1) STEPS.push(v);
  const tracks = [];      // the people already planned (moving or not): positions at each step
  const trackOf = (p) => { const xs = new Float32Array(STEPS.length), zs = new Float32Array(STEPS.length), a = {}; STEPS.forEach((v, k) => { posOf(p.path, v, a); xs[k] = a.x; zs[k] = a.z; }); return { xs, zs, p }; };
  const clear = (tr) => {
    for (let k = 0; k < STEPS.length; k++) {
      const x = tr.xs[k], z = tr.zs[k];
      if ((x - CAM.x) ** 2 + (z - CAM.z) ** 2 < 1.1 ** 2) return false;
      if (!onLand(x, z)) return false;
      for (const o of obst) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r * 0.9) ** 2) return false;
      for (const t of tracks) { const dx = x - t.xs[k], dz = z - t.zs[k]; if (dx * dx + dz * dz < 0.46 * 0.46) return false; }
    }
    return true;
  };
  const runners = PEOPLE.filter((p) => p.front || (p.jetty && p.z0 > -30)).sort((a, b) => Math.hypot(a.x0 + 20, a.z0 - QZ) - Math.hypot(b.x0 + 20, b.z0 - QZ));
  const stayers = PEOPLE.filter((p) => !runners.includes(p));
  for (const p of stayers) tracks.push(trackOf(p));
  let nRun = 0;
  for (const p of runners) {
    let ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      const ex = PIER.x0 + 2.0 + R() * 8, tx = PIER.x0 + 1.0 + R() * 10, tz = PIER.z0 - 4 - R() * 44;
      const t0 = V_RUN + p.react + R() * 0.5 + tries * 0.09;
      const sp = 3.0 + R() * 1.3;
      const pts = [[p.x0, p.z0]];
      if (p.jetty) pts.push([JX + 1.5, QZ + 1.3 + R() * 0.8], [JX - 1.2, QZ + 1.8 + R() * 2]);
      pts.push([ex, QZ + 1.0 + R() * 1.5], [ex + (R() - 0.5), QZ - 2.5], [tx, tz]);
      p.path = path(pts, sp, t0);
      const tr = trackOf(p);
      if (clear(tr)) { tracks.push(tr); ok = true; p.runs = true; nRun++; }
    }
    if (!ok) { p.path = path([[p.x0, p.z0]], 0, 0); p.crouch = true; tracks.push(trackOf(p)); }
  }
  for (const p of stayers) if (!p.pier) p.crouch = true;
  console.log(`people: ${PEOPLE.length}, running ${nRun}`);
}

export function makePeople(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const crowd = makeCrowd(scene, PEOPLE.length, mat, { castShadow: true });
  // the phones' screens, held up high (we see them from behind the people filming): small bright panels
  const scr = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.95, 1.2) }), PEOPLE.length);
  scr.frustumCulled = false; scene.add(scr);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const p of PEOPLE) crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair, p.sleeves);
  const a = {};
  return {
    crowd,
    frame(v, glows, aimYaw) {
      for (const p of PEOPLE) {
        posOf(p.path, v, a);
        let yaw = a.yaw ?? p.yaw, stride = 0, walk = 0, armL = 0, armR = 0, look = 0.7, pitch = 0, sit = 0;
        const running = a.moving && p.runs;
        if (!a.moving) yaw = (p.runs && v > p.path.t0 ? (p.endYaw ?? (p.endYaw = Math.PI * 1.1 + (p.ph % 1 - 0.5) * 0.8)) : p.yaw) + wobble(v * 0.3, p.ph) * 0.12;
        if (running) { stride = 1.55; walk = a.s * 2.4 + p.ph; look = 0.05; }
        const act = p.act;
        let phone = false;
        if (act === 'phone') { armR = 1.55; armL = 0.3; phone = true; }
        else if (act === 'point') { armL = 1.2 + 0.1 * Math.sin(v * 1.3 + p.ph); }
        // following the fireballs across the sky (a slow turn), pointing at the first one
        const fol = smooth(V_FB1 + p.react, V_FB1 + p.react + 0.4, v) * (1 - smooth(V_FB1 + 2.5, V_FB1 + 3.5, v)) + smooth(V_DAY + p.react, V_DAY + 0.5 + p.react, v) * (1 - smooth(V_DAY + 2.5, V_DAY + 3.6, v));
        if (fol > 0 && !a.moving) { yaw += fol * 0.35 * (p.track - 0.4); if (act !== 'phone') armL = lerp(armL, 1.35, fol * 0.8); }
        // flinches: the booms, the car (near ones jump back, hands up)
        let f = 0;
        for (const tb of [V_BOOM1, V_BOOM]) f = Math.max(f, smooth(tb + 0.05, tb + 0.15, v) * (1 - smooth(tb + 0.7, tb + 1.4, v)));
        const nearCar = Math.hypot(a.x - HIT_CAR.x, a.z - HIT_CAR.z) < 16;
        if (nearCar) f = Math.max(f, smooth(V_CAR + 0.03, V_CAR + 0.15, v) * (1 - smooth(V_CAR + 1.2, V_CAR + 2.2, v)));
        f = Math.max(f, 0.6 * smooth(V_SPLASH + 0.05, V_SPLASH + 0.2, v) * (1 - smooth(V_SPLASH + 0.8, V_SPLASH + 1.5, v)));
        if (f > 0) { armL = lerp(armL, 1.6, f); armR = lerp(armR, 1.6, f); look = lerp(look, -0.1, f); pitch += 0.25 * f; }
        // after the car: everyone turns toward it for a moment
        const tc = smooth(V_CAR + 0.4 + p.react, V_CAR + 1.0 + p.react, v) * (1 - smooth(V_RUN - 1.2, V_RUN - 0.2, v));
        if (tc > 0 && !a.moving) { yaw = lerp(yaw, Math.atan2(HIT_CAR.x - a.x, HIT_CAR.z - a.z), tc * 0.85); look = lerp(look, 0.05, tc); }
        // crouching where they are, hands over the head
        if (p.crouch) {
          const c = smooth(V_RUN + p.react, V_RUN + p.react + 0.5, v) * (1 - smooth(V_BIG + 0.5, V_BIG + 1.5, v));
          if (c > 0) { sit = 0.55 * c; armL = lerp(armL, 1.6, c); armR = lerp(armR, 1.6, c); look = lerp(look, -0.2, c); pitch += 0.3 * c; }
        }
        if (running) { armL = 0.2 * Math.sin(walk); armR = -0.2 * Math.sin(walk); phone = false; }
        // the biggest one: everyone turns up to it; once it dives, a hand up against the glare
        const up = smooth(V_BIG + 0.8 + p.react * 2, V_BIG + 1.8 + p.react * 2, v) * (a.moving ? 0 : 1);
        if (up > 0) { look = lerp(look, 0.75, up); yaw = lerp(yaw, aimYaw(a.x, a.z), up * 0.6); }
        const sh = smooth(V_DIVE + p.react, V_DIVE + 0.6 + p.react, v) * (a.moving ? 0 : 1);
        if (sh > 0) { armL = lerp(armL, 1.5, sh); look = lerp(look, 0.45, sh); }
        crowd.pose(p.i, { x: a.x, y: 0, z: a.z, yaw, s: p.s, walk, stride, pitch, armL, armR, look, sit });
        // the phone's screen, facing back toward its holder (and you), at the raised hand
        if (phone && f < 0.5 && sit < 0.1) {
          const an = armR * 1.45, fw = (0.6 * Math.sin(an) + 0.04) * p.s, hy = (1.40 - 0.6 * Math.cos(an) + 0.05) * p.s;
          const hx = a.x + Math.sin(yaw) * fw + Math.cos(yaw) * 0.215 * p.s, hz = a.z + Math.cos(yaw) * fw - Math.sin(yaw) * 0.215 * p.s;
          eu.set(-0.35, yaw + Math.PI, 0, 'YXZ'); q.setFromEuler(eu);
          scr.setMatrixAt(p.i, m4.compose(P.set(hx, hy, hz), q, S1));
        } else scr.setMatrixAt(p.i, Z0);
      }
      crowd.commit();
      scr.instanceMatrix.needsUpdate = true;
    },
  };
}
