// What comes at you at each stop, and when (video time; the jumps are JUMPS in timeline.js):
//   1912      a runaway two-horse wagon gallops down the tram tracks at you (+ a cart, two parked carriages)
//   forest    a bull moose walks behind the trees, then charges out at you
//   ice age   a herd of five mastodons walks through; the lead one comes straight at you
//   bear      a short-faced bear charges, stops 6 m off, rears up 3.4 m (11 ft) and roars, then drops onto you
//   cats      three Smilodon stalk in from three sides; the one ahead springs
//   shore     a megalodon's fin circles, then it breaks the surface right off the rocks, jaws open
//   dinosaurs a giant brachiosaur crosses in front of you (its head 17 m up); an Acrocanthosaurus runs out at the lens
// Each animal: a path (layout.js LANES), how far along it is at each moment (integrated from a speed profile so the
// legs match the ground speed), feet planted by makeGait (they never slide), and its acting (head, jaw, rearing).
import * as THREE from 'three';
import { makeQuad } from './quad.js';
import { makeTheropod } from './theropod.js';
import { makeLoft, resample, makeGait, makeSpikes, Frame } from './loft.js';
import { HORSE, MOOSE, MASTO, BEAR, CAT, SAURO } from './species.js';
import { makePath, LANES } from './layout.js';
import { heightAt, SEA_Y } from './ground.js';
import { JUMPS, V_WHITE, stopAt } from './timeline.js';
import { smooth, clamp, lerp, wobble } from './util.js';

const J = JUMPS;
const win = (v, a, b, c, d) => smooth(a, b, v) * (1 - smooth(c, d, v));

// s(v) along a path from a speed profile, pinned so that s(vRef) = sRef
function distance(speedAt, vRef, sRef, v0 = -2, v1 = 50, dt = 1 / 240) {
  const n = Math.ceil((v1 - v0) / dt), S = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) S[k] = S[k - 1] + speedAt(v0 + (k - 0.5) * dt) * dt;
  const raw = (v) => { const f = clamp((v - v0) / dt, 0, n - 1e-6), k = Math.floor(f); return S[k] + (S[k + 1] - S[k]) * (f - k); };
  const off = sRef - raw(vRef);
  return (v) => raw(v) + off;
}
// the arc length on a path where it comes within r of you
function sAtDist(path, r) { let best = 0; for (let s = 0; s <= path.L + 20; s += 0.02) { const q = path.at(s); if (Math.hypot(q.x, q.z) >= r) best = s; else break; } return best; }

// a four-legged walker on a path: feet from the gait, height from the ground of its stop
function quadOn(scene, spec, k, { path, sAt, speedAt, C, vFull, offs, beta, minStep = 0.3, lat = 1 }) {
  const q = makeQuad(scene, spec);
  const gait = makeGait({ sAt, speedAt, C, vFull, minStep, v0: -2, v1: 50 });
  const fx = spec.fore.at[0];
  const plant = (front, sd) => (vm) => {
    const p = path.at(sAt(vm) + (front ? fx : 0)), side = (front ? spec.fore.at[2] : spec.hind.at[2]) * lat * sd;
    const x = p.x - Math.cos(p.yaw) * side, z = p.z + Math.sin(p.yaw) * side;
    return { x, z, yaw: p.yaw, y: heightAt(k, x, z) };
  };
  const plants = [plant(false, -1), plant(false, 1), plant(true, -1), plant(true, 1)];
  return {
    q, gait, path, sAt,
    base(v) {
      const p = path.at(sAt(v)), pf = path.at(sAt(v) + fx);
      const gy = (heightAt(k, p.x, p.z) + heightAt(k, pf.x, pf.z)) / 2;
      const feet = plants.map((pl, i) => gait.foot(v, offs[i], beta, pl));
      return { p, gy, feet: feet.map((f) => ({ x: f.p.x, y: f.p.y, z: f.p.z, yaw: f.p.yaw, lift: f.lift })), g: gait.gAt(v), pitch: Math.atan2(heightAt(k, pf.x, pf.z) - heightAt(k, p.x, p.z), fx) };
    },
  };
}
const WALK = [0, 0.5, 0.25, 0.75], GALLOP = [0, 0.12, 0.5, 0.62], TROT = [0, 0.5, 0.5, 0];

// a copy of a path's control points shifted sideways by d (right +), for animals side by side
function offsetPts(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
    return [p[0] - (tz / L) * d, p[1] + (tx / L) * d];
  });
}
const rightOf = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });
// the first arc length at which the path's z passes zMin (for paths that run on past you)
function sAtZ(path, z0) { for (let s = 0; s <= path.L + 20; s += 0.02) if (path.at(s).z >= z0) return s; return path.L; }
export const EYES = [];       // the cats' eye points this frame (main.js draws the eyeshine)

export function makeAnimals(scene, ctx) {
  const all = [];          // { k, meshes, frame(v) }
  const add = (k, meshes, frame) => all.push({ k, meshes, frame });

  // ---------- 1912: a two-horse wagon crosses right in front of you, swings round and bolts at you ----------
  {
    const S = J[0], E = J[1];
    const C0 = LANES[1][0];
    const center = makePath(C0);
    const sEnd = sAtDist(center, 3.9);
    const speed = (v) => 8.6 + 2.6 * smooth(S + 3.2, S + 4.0, v);
    const sAt = distance(speed, E, sEnd);
    const team = [-0.78, 0.78].map((dx, i) => {
      const pth = makePath(offsetPts(C0, dx));
      const k = pth.L / center.L;
      return quadOn(scene, { ...HORSE, colors: i ? HORSE.colors : { ...HORSE.colors, back: 0x2a1a10, flank: 0x4a2c18 } }, 1, { path: pth, sAt: (v) => sAt(v) * k + (i ? 0.25 : 0), speedAt: (v) => speed(v) * k, C: 5.2, vFull: 10, offs: GALLOP.map((o) => o + i * 0.18), beta: 0.4 });
    });
    // the wagon: a box on four spoked wheels, a load, a seat, two shafts to the horses
    const wood = ctx.plainMat(0x7a5a38, 0.85), dark = ctx.plainMat(0x2a2018, 0.8), cargo = ctx.plainMat(0xb0a07a, 0.95);
    const wagon = new THREE.Group();
    wagon.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 3.2).translate(0, 1.05, 0), wood));
    for (const sx of [-1, 1]) wagon.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 3.2).translate(sx * 0.85, 1.45, 0), wood));
    wagon.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.6).translate(0, 1.6, 0.5), cargo));
    wagon.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.5).translate(0, 1.7, -1.3), dark));
    const wheels = [];
    for (const sx of [-1, 1]) for (const [z, r] of [[-1.1, 0.5], [1.1, 0.62]]) {
      const w = new THREE.Group(); w.position.set(sx * 0.95, r, z);
      w.add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.03, 0.035, 6, 20).rotateY(Math.PI / 2), dark));
      for (let q = 0; q < 6; q++) w.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 1.9, 0.04).rotateX((q / 6) * Math.PI), wood));
      w.userData.r = r; wagon.add(w); wheels.push(w);
    }
    for (const sx of [-0.55, 0.55]) wagon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6).rotateX(Math.PI / 2).translate(sx, 1.0, -3.0), wood));
    wagon.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(wagon);
    add(1, [...team.flatMap((t) => t.q.meshes), wagon], (v) => {
      const bolt = smooth(S + 3.2, S + 4.0, v);
      for (const [ti, t] of team.entries()) {
        const b = t.base(v), ph = b.g * Math.PI * 2;
        t.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: HORSE.H + b.gy + 0.06 * Math.sin(ph * 2), lean: 0.05 * Math.sin(ph) - 0.03, neckPitch: -0.2 + 0.12 * Math.sin(ph + 1) - 0.1 * bolt, neckYaw: 0, headPitch: 0.15 + 0.15 * bolt, tail: [0.2 * Math.sin(v * 3), 0.35], feet: b.feet });
        if (ti === 1) FOCUS[1].copy(t.q.lastH.o);
      }
      const p = center.at(sAt(v) - 3.6);
      wagon.position.set(p.x, 0.03 * Math.abs(Math.sin(v * 9)), p.z);
      wagon.rotation.set(0, p.yaw + Math.PI, 0.02 * Math.sin(v * 7));
      for (const w of wheels) w.rotation.x = -sAt(v) / w.userData.r;
    });
    // two carriages parked at the right kerb, their horses idling; a cart far up the street coming slowly
    for (const [x, z, yaw, sp, col] of [[7.6, -40, Math.PI, 0, 0xd8cfc0], [7.6, -58, Math.PI, 0, 0x2a2420], [-6.4, -80, 0, 1.6, 0x4a3420]]) {
      const pth = makePath([[x, z - 60 * Math.cos(yaw)], [x, z + 60 * Math.cos(yaw)]]);
      const t = quadOn(scene, { ...HORSE, colors: { ...HORSE.colors, back: col, flank: col === 0xd8cfc0 ? 0xc8beb0 : 0x5a3a24, belly: col === 0xd8cfc0 ? 0xb8b0a0 : 0x4a3020 } }, 1, { path: pth, sAt: (v) => 60 + sp * (v - 5), speedAt: () => Math.max(sp, 0.001), C: 1.8, vFull: 1.6, offs: WALK, beta: 0.65 });
      const cart = new THREE.Group();
      cart.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2.2).translate(0, 1.2, 0), sp ? wood : dark));
      if (!sp) cart.add(new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 2.3).translate(0, 1.95, 0.1), dark));
      for (const sx of [-1, 1]) for (const zz of [-0.8, 0.8]) cart.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 18).rotateY(Math.PI / 2).translate(sx * 0.78, 0.52, zz), dark));
      cart.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(cart);
      add(1, [...t.q.meshes, cart], (v) => {
        const b = t.base(v);
        t.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: HORSE.H + b.gy, lean: 0, neckPitch: -0.1 + 0.08 * wobble(v * 0.6, x), neckYaw: 0.1 * wobble(v * 0.4, z), headPitch: 0.05 * Math.sin(v * 1.3 + x), tail: [0.3 * Math.sin(v * 1.1 + z), 0], feet: b.feet });
        const c = pth.at(t.sAt(v) - 3.4);
        cart.position.set(c.x, 0, c.z); cart.rotation.y = c.yaw;
      });
    }
  }

  // ---------- forest: a bull moose walks into a sunlit clearing ~8 m off, stands, paws the ground and tosses its antlers,
  //            then lowers its head and charges, pulling up right beside you on your left, antlers swinging at you ----------
  {
    const S = J[1], E = J[2];
    const path = makePath(LANES[2][0]);
    const sStop = sAtZ(path, -2.0);
    const speed = (v) => 1.6 * (1 - smooth(S + 1.2, S + 1.6, v)) + 5.6 * smooth(S + 3.0, S + 3.35, v) * (1 - smooth(S + 3.95, S + 4.45, v));
    const sAt = distance(speed, S + 4.5, sStop);
    const m = quadOn(scene, MOOSE, 2, { path, sAt, speedAt: speed, C: 3.4, vFull: 5.5, offs: WALK, beta: 0.55 });
    const plants = [false, false, true, true].map((front, i) => (vm) => {
      const p = path.at(sAt(vm) + (front ? MOOSE.fore.at[0] : 0)), sd = i % 2 ? 1 : -1, side = (front ? MOOSE.fore.at[2] : MOOSE.hind.at[2]) * sd;
      const x = p.x - Math.cos(p.yaw) * side, z = p.z + Math.sin(p.yaw) * side;
      return { x, z, yaw: p.yaw, y: heightAt(2, x, z) };
    });
    add(2, m.q.meshes, (v) => {
      const b = m.base(v), ph = b.g * Math.PI * 2;
      const ch = smooth(S + 2.9, S + 3.3, v) * (1 - smooth(S + 4.2, S + 4.6, v));   // charging
      const low = smooth(S + 2.7, S + 3.2, v);                                        // head down, antlers forward
      const still = 1 - smooth(0.25, 0.9, speed(v));
      const offs = WALK.map((o, i) => lerp(o, GALLOP[i], ch));
      const feet = plants.map((pl, i) => {
        const f = m.gait.foot(v, offs[i], lerp(0.62, 0.42, ch), pl), P0 = pl(v);
        // standing: every hoof on the ground, except the stamp of a front hoof (pawing the ground, then at you)
        const stamp = i === 3 ? 0.55 * win(v, S + 2.0, S + 2.12, S + 2.25, S + 2.4) + 0.5 * win(v, S + 4.75, S + 4.9, S + 5.0, S + 5.15) : 0;
        return { x: lerp(f.p.x, P0.x, still), y: lerp(f.p.y, P0.y, still), z: lerp(f.p.z, P0.z, still), yaw: f.p.yaw, lift: f.lift * (1 - still) + stamp };
      });
      const toss = win(v, S + 1.7, S + 1.9, S + 2.4, S + 2.6), swing = smooth(S + 4.4, S + 4.7, v);
      m.q.pose({
        x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: MOOSE.H + b.gy + 0.07 * Math.sin(ph * 2) * ch, lean: -b.pitch + 0.05 * Math.sin(ph) * ch + 0.06 * low,
        neckPitch: 0.05 + 0.25 * toss * Math.sin(v * 9) - 0.5 * low + 0.05 * Math.sin(ph) * ch, neckYaw: 0.25 * Math.sin(v * 1.3) * (1 - low) + 0.25 * swing,
        headPitch: -0.05 - 0.3 * low + 0.15 * toss, headYaw: swing * (0.25 + 0.3 * Math.sin(v * 7.5)), tail: [0, 0], feet,
      });
      FOCUS[2].copy(m.q.lastH.o);
    });
  }

  // ---------- ice age: the mastodon herd (the lead one walks at you the whole stop) ----------
  {
    const S = J[2];
    const spec = [[0, 4.6, J[3], 2.3, 0], [1, 6.5, S + 4.7, 2.1, 1], [2, 10, S + 5.7, 2.2, 2], [3, 14, S + 7.1, 1.9, 3], [4, 0, S + 3.1, 2.0, 4]];
    for (const [lane, dEnd, vEnd, sp, i] of spec) {
      const path = makePath(LANES[3][lane]);
      const sRef = lane === 0 ? sAtDist(path, dEnd) : path.L * (lane === 4 ? 0.7 : 0.55);
      const sAt = distance(() => sp, vEnd, sRef);
      const tint = [1, 0.85, 1.1, 0.95, 0.9][i];
      const m = quadOn(scene, { ...MASTO, colors: { ...MASTO.colors, flank: new THREE.Color(MASTO.colors.flank).multiplyScalar(tint).getHex() } }, 3, { path, sAt, speedAt: () => sp, C: 3.2, vFull: 2.2, offs: WALK.map((o) => o + i * 0.13), beta: 0.65, lat: 0.9 });
      add(3, m.q.meshes, (v) => {
        const b = m.base(v), ph = b.g * Math.PI * 2;
        const trumpet = lane === 0 ? win(v, S + 2.3, S + 2.8, S + 3.7, S + 4.4) : lane === 1 ? win(v, S + 3.7, S + 4.1, S + 4.9, S + 5.4) * 0.7 : 0;
        const lowered = lane === 0 ? smooth(S + 4.3, S + 5.3, v) : 0;
        m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: MASTO.H + b.gy + 0.04 * Math.sin(ph * 2), lean: -b.pitch * 0.8, roll: 0.03 * Math.sin(ph), neckPitch: 0.08 * Math.sin(ph + 0.5) + 0.35 * trumpet - 0.25 * lowered, neckYaw: 0.12 * Math.sin(v * 0.5 + i), headPitch: 0.25 * trumpet - 0.15 * lowered, tail: [0.2 * Math.sin(v * 1.4 + i), 0], feet: b.feet, trunk: 0.85 * trumpet + 0.12 * lowered, trunkSwing: 0.35 * Math.sin(v * 1.2 + i * 2) });
        if (lane === 0) FOCUS[3].copy(m.q.lastH.o);
      });
    }
  }

  // ---------- the short-faced bear: a fast gallop in, it stops ~4 m off and stands up for 1.8 s (the camera backs off
  //            and tilts up so it towers over you), drops and lunges into the flash ----------
  {
    const S = J[3], E = J[4];
    const path = makePath(LANES[4][0]);
    const V_STOP = S + 2.3, UP0 = S + 2.35, UP1 = S + 2.65, DN0 = S + 4.1, DN1 = S + 4.4;
    const speed = (v) => 15 * (1 - smooth(S + 1.75, V_STOP, v)) + 0.9 * smooth(DN1, DN1 + 0.2, v);
    const sAt = distance(speed, V_STOP, sAtZ(path, -3.9));
    const RUN = [0, 0.15, 0.5, 0.65];
    const m = quadOn(scene, BEAR, 4, { path, sAt, speedAt: speed, C: 3.4, vFull: 12, offs: RUN, beta: 0.36 });
    const ps = path.at(sAt(V_STOP)), rs = rightOf(ps.yaw);
    const hindStand = [-1, 1].map((sd) => ({ x: ps.x + rs.x * sd * 0.3, z: ps.z + rs.z * sd * 0.3, yaw: ps.yaw, lift: 0 }));
    for (const f of hindStand) f.y = heightAt(4, f.x, f.z);
    add(4, m.q.meshes, (v) => {
      const b = m.base(v), ph = b.g * Math.PI * 2;
      const run = clamp(speed(v) / 12, 0, 1);
      const up = smooth(UP0, UP1, v) * (1 - smooth(DN0, DN1, v));
      const stand = smooth(V_STOP - 0.25, V_STOP, v);
      const roar = Math.max(win(v, UP0 + 0.25, UP0 + 0.4, UP0 + 1.0, UP0 + 1.2), win(v, DN1 + 0.1, DN1 + 0.25, E + 0.3, E + 0.5));
      const fwd = { x: Math.sin(b.p.yaw), z: Math.cos(b.p.yaw) }, rt = rightOf(b.p.yaw);
      const sway = 0.07 * Math.sin((v - UP0) * 3.2) * up;
      const feet = b.feet.map((f, i) => {
        if (i < 2) {
          const h = hindStand[i];
          return stand > 0.001 ? { x: lerp(f.x, h.x, stand), y: lerp(f.y, h.y, stand), z: lerp(f.z, h.z, stand), yaw: f.yaw, lift: f.lift * (1 - stand) } : f;
        }
        const P0 = { x: f.x, y: f.y, z: f.z };
        if (stand > 0.001 && up < 0.001) { const p = path.at(sAt(v) + BEAR.fore.at[0]); const sd = i === 2 ? -1 : 1; P0.x = lerp(f.x, p.x - Math.cos(p.yaw) * sd * 0.26, stand); P0.z = lerp(f.z, p.z + Math.sin(p.yaw) * sd * 0.26, stand); P0.y = lerp(f.y, heightAt(4, P0.x, P0.z), stand); }
        if (up < 0.001) return { ...f, ...P0, lift: f.lift * (1 - stand) };
        const sd = i === 2 ? -1 : 1;
        const reach = 0.3 + 0.1 * Math.sin(v * 2.6 + sd), hy = 1.62 + 0.12 * Math.sin(v * 2.1 + sd * 1.3);
        const tx = b.p.x + fwd.x * reach + rt.x * sd * 0.5 + rt.x * sway, tz = b.p.z + fwd.z * reach + rt.z * sd * 0.5 + rt.z * sway;
        return { x: lerp(P0.x, tx, up), y: lerp(P0.y, b.gy + hy, up), z: lerp(P0.z, tz, up), yaw: b.p.yaw, lift: 0, hang: up };
      });
      const lunge = smooth(DN1, E, v);
      m.q.pose({
        x: b.p.x + rt.x * sway, z: b.p.z + rt.z * sway, yaw: b.p.yaw,
        h: BEAR.H + b.gy + 0.07 * Math.sin(ph * 2) * run + 0.1 * up - 0.08 * lunge,
        lean: -b.pitch + (0.07 * Math.sin(ph) - 0.03) * run - 1.25 * up + 0.08 * lunge, roll: 0.05 * Math.sin((v - UP0) * 3.2) * up,
        neckPitch: -0.12 * run - 0.45 * up + 0.12 * Math.sin(v * 1.7) * up - 0.1 * lunge, headPitch: -0.55 * up + 0.2 * roar, headYaw: 0.12 * Math.sin(v * 1.1) * up,
        tail: [0, 0], feet, jaw: 0.95 * roar + 0.08,
      });
      FOCUS[4].copy(m.q.lastH.o);
    });
  }

  // ---------- a pack of four sabertooths: the first one walks in down the middle, the others spread out beside it;
  //            they stalk in low with their mouths open (the sabres show), rush from ~29 s, and the nearest one leaps
  //            into the flash ----------
  {
    const S = J[4], E = J[5], L0 = E - 0.6;
    // [lane, lead?, pelvis z at its key time, key time, speed profile]
    const cats = [
      [2, true, -2.9, S + 2.5, (v) => 2.7 * (1 - smooth(S + 2.2, S + 2.6, v)) + 0.3 + 1.0 * smooth(S + 4.6, S + 5.0, v) * (1 - smooth(L0 - 0.05, L0 + 0.05, v)) + 3.4 * smooth(L0, L0 + 0.12, v)],
      [0, false, -4.4, S + 2.5, (v) => 2.4 * (1 - smooth(S + 2.2, S + 2.7, v)) + 0.35 + 1.4 * smooth(S + 4.4, S + 5.0, v)],
      [1, false, -5.4, S + 2.5, (v) => 2.4 * (1 - smooth(S + 2.2, S + 2.7, v)) + 0.35 + 1.4 * smooth(S + 4.6, S + 5.2, v)],
      [3, false, -9.5, S + 2.5, (v) => 2.6 * (1 - smooth(S + 2.4, S + 2.9, v)) + 0.4 + 1.8 * smooth(S + 4.5, S + 5.1, v)],
    ];
    for (const [lane, lead, zKey, vKey, speed] of cats) {
      const path = makePath(LANES[5][lane]);
      const sAt = distance(speed, vKey, sAtZ(path, zKey));
      const m = quadOn(scene, CAT, 5, { path, sAt, speedAt: speed, C: 1.6, vFull: 4.5, offs: GALLOP, beta: 0.5 });
      add(5, m.q.meshes, (v) => {
        const b = m.base(v), ph = b.g * Math.PI * 2;
        const run = clamp(speed(v) / 4, 0, 1);
        const stalk = smooth(S + 2.0, S + 2.6, v) * (1 - smooth(S + 4.4, S + 4.9, v));      // low, slow, mouth open
        const air = lead ? smooth(L0 - 0.05, L0 + 0.1, v) : 0;
        const arc = lead ? Math.sin(Math.PI * clamp((v - L0) / 0.9, 0, 1)) : 0;
        const crouch = lead ? win(v, L0 - 0.35, L0 - 0.15, L0 - 0.05, L0 + 0.05) : 0;
        const snarl = Math.max(stalk * (0.75 + 0.25 * Math.sin(v * 3 + lane)), lead ? smooth(L0 - 0.3, L0, v) : smooth(S + 4.4, S + 4.8, v) * 0.8);
        const fwd = { x: Math.sin(b.p.yaw), z: Math.cos(b.p.yaw) };
        const feet = b.feet.map((f, j) => {
          if (air < 0.01) return f;
          const front = j >= 2, reach = front ? CAT.fore.at[0] + 0.6 : -0.45;
          return { x: lerp(f.x, b.p.x + fwd.x * reach, air), y: lerp(f.y, b.gy + 0.9 * arc + (front ? 0.85 : 0.35), air), z: lerp(f.z, b.p.z + fwd.z * reach, air), yaw: f.yaw, lift: 0 };
        });
        m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: CAT.H + b.gy + 0.05 * Math.sin(ph * 2) * run * (1 - air) - 0.2 * stalk - 0.18 * crouch + (0.9 * arc + 0.35) * air,
          lean: -b.pitch + (0.06 * Math.sin(ph) - 0.04) * run * (1 - air) + 0.08 * stalk + 0.1 * crouch - 0.12 * air, neckPitch: -0.12 - 0.12 * stalk + 0.1 * air, neckYaw: 0, headPitch: 0.25 * stalk + 0.12 + 0.2 * snarl * (1 - stalk), tail: [0.2 * Math.sin(v * 2 + lane), 0.3], feet, jaw: 0.9 * snarl + 0.05 });
        const H = m.q.lastH;
        EYES.push(H.at(CAT.eyeAt[0] + 0.02, CAT.eyeAt[1], -CAT.eyeAt[2]), H.at(CAT.eyeAt[0] + 0.02, CAT.eyeAt[1], CAT.eyeAt[2]));
        if (lead) FOCUS[5].copy(H.o);
      });
    }
  }

  // ---------- the megalodon ----------
  add(6, ...makeShark(scene));

  // ---------- dinosaurs: the giant brachiosaur crossing in front, then the Acrocanthosaurus ----------
  {
    const path = makePath(LANES[7][0]);
    const speed = () => 2.6;
    // (its neck comes into the frame from the left as the DINOSAURS popup goes, its legs ~3 s later)
    let sMid = 0; for (let s0 = 0; s0 < path.L; s0 += 0.05) if (path.at(s0).x < -14) sMid = s0;
    const sAt = distance(speed, 41.0, sMid);
    const m = quadOn(scene, SAURO, 7, { path, sAt, speedAt: speed, C: 5.5, vFull: 2.6, offs: WALK, beta: 0.7, minStep: 0.35 });
    add(7, m.q.meshes, (v) => {
      const b = m.base(v), ph = b.g * Math.PI * 2;
      m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: SAURO.H + b.gy + 0.08 * Math.sin(ph * 2), lean: -b.pitch, roll: 0.02 * Math.sin(ph), neckPitch: 0.05 * Math.sin(ph) + 0.08, neckYaw: -0.35 * smooth(38, 41, v) + 0.1 * Math.sin(v * 0.3), headPitch: -0.2 - 0.3 * smooth(38.5, 41, v), tail: [0.15 * Math.sin(ph * 0.5), 0], feet: b.feet });
      FOCUS2.copy(m.q.lastH.o);
    });
  }
  {
    // the hunter: runs in from ~30 m, at least your height by 0:43, then slows, crouches and brings its head down beside
    // you, jaws open at the lens (nothing touches you: the flash takes you away first)
    const path = makePath(LANES[7][1]);
    const speed = (v) => 5.2 * (1 - smooth(42.6, 43.2, v)) + 0.9 * smooth(42.6, 43.2, v) * (1 - smooth(45.0, 45.5, v)) + 0.3;
    const sAt = distance(speed, 45.6, sAtZ(path, -3.7));
    const rex = makeTheropod(scene, { seed: 3, colors: { back: 0x24120a, flank: 0xc07a38, belly: 0xf2e6c8, stripe: 0x1a0c06 } });
    const ridge = makeLoft(21, 8, { mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), color: (u, a) => (Math.sin(a) > 0.3 ? [0.22, 0.09, 0.04] : [0.3, 0.13, 0.06]) });
    scene.add(ridge.mesh);
    const gait = makeGait({ sAt, speedAt: speed, C: 3.4, vFull: 4.6, minStep: 0.3, v0: -2, v1: 50 });
    const LAT = 0.5;
    const plant = (sd) => (vm) => { const q = path.at(sAt(vm)); const x = q.x - Math.cos(q.yaw) * LAT * sd, z = q.z + Math.sin(q.yaw) * LAT * sd; return { x, z, yaw: q.yaw, y: heightAt(7, x, z) }; };
    add(7, [...rex.meshes, ridge.mesh], (v) => {
      const q = path.at(sAt(v)), g = gait.gAt(v), ph = g * Math.PI * 2;
      const run = clamp(speed(v) / 4.6, 0, 1);
      const still = 1 - smooth(0.4, 1.0, speed(v));
      const feet = [plant(-1), plant(1)].map((pl, i) => { const f = gait.foot(v, i * 0.5, lerp(0.62, 0.42, run), pl), P0 = pl(v); return { x: lerp(f.p.x, P0.x, still), y: lerp(f.p.y, P0.y, still), z: lerp(f.p.z, P0.z, still), yaw: f.p.yaw, lift: f.lift * (1 - still) }; });
      const roar = Math.max(win(v, 40.2, 40.5, 41.0, 41.4), win(v, 44.9, 45.15, 46.2, 46.4) * 1.1);
      const gy = heightAt(7, q.x, q.z);
      const low = smooth(43.6, 45.0, v);
      const out = rex.pose({ x: q.x, z: q.z, yaw: q.yaw, h: 3.35 + gy + 0.12 * Math.abs(Math.sin(ph)) * run - 0.5 * low, lean: 0.05 + 0.1 * run + 0.12 * low,
        neckPitch: 0.1 - 0.2 * run - 0.3 * low + 0.25 * win(v, 40.2, 40.5, 41.0, 41.4), neckYaw: 0.15 * Math.sin(v * 0.6) * (1 - run) * (1 - low) + 0.3 * low,
        headPitch: -0.05 + 0.3 * roar - 0.05 * low, headYaw: 0.3 * low, jaw: 1.1 * roar + 0.06, tail: [0.12 * Math.sin(ph), 0.05], breath: 0, feet, arm: 0.5 + 0.5 * Math.sin(ph) });
      FOCUS[7].copy(out.head.o);
      const st = [];
      const frames = [];
      for (let i = 4; i >= 1; i--) frames.push([out.tl[i], out.TAIL_R[i]]);
      for (let i = 0; i < out.fr.length - 1; i++) frames.push([out.fr[i], out.FWD_R[i]]);
      frames.forEach(([f, r], i) => { const u = i / (frames.length - 1); const hgt = 0.12 + 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.1)); st.push({ p: f.at(0, r[1] * 0.85, 0), up: f.dir(0, 1, 0), w: 0.05, t: hgt + 0.05, b: 0.05 }); });
      const rs = resample(st, 2);
      while (rs.length < 21) rs.push(rs[rs.length - 1]);
      ridge.update(rs.slice(0, 21));
    });
  }

  // every animal's meshes shown only at its own stop
  return {
    all,
    frame(v) {
      const k = stopAt(v);
      EYES.length = 0;
      for (const a of all) {
        const on = a.k === k;
        for (const m of a.meshes) m.visible = on;
        if (on) a.frame(v);
      }
    },
  };
}
export const STEPS = {};
// what each stop's danger is: the point the camera leans toward (its head), updated as it moves
export const FOCUS = Array.from({ length: 8 }, () => new THREE.Vector3(0, 2, -30));
export const FOCUS2 = new THREE.Vector3();

// ---------- the megalodon: a tube body (dark grey back, white belly), fins, a jaw full of teeth ----------
// It circles 26 m out with its fin above the water (32.4-35.6), turns in and dives, then breaks the surface 11 m off the
// rocks at 36.3, rising out of the water toward you with its jaws open until the jump (37.9).
export const SHARK = { len: 15.5 };
// the snout's distance from you along its run: one speed that only rises (5 m/s -> 8.2 m/s), straight at you after a
// turn-in by 1.6 s; the head breaks the surface at 2.3 s, surges half out of the water, and from 4.4 s lunges up out of
// the sea over the rocks at you, jaws open, until the flash (6.7 s)
export function sharkAt(v) {
  const S = JUMPS[5], E = JUMPS[6], t = clamp(v - S, -0.5, E - S + 0.6);
  const dAt = (tt) => 36.5 - (4.0 * tt + 0.18 * tt * tt);
  const xAt = (tt) => -0.9 + 9.5 * Math.pow(1 - smooth(0, 1.6, tt), 1.5);
  const x = xAt(t), z = -dAt(t);
  const yaw = Math.atan2(xAt(t + 0.02) - xAt(t - 0.02), dAt(t - 0.02) - dAt(t + 0.02));
  const surf = smooth(2.2, 4.3, t), lunge = smooth(4.3, 6.7, t);
  const y = SEA_Y - 1.1 + 1.5 * surf + 2.9 * Math.pow(lunge, 0.85);
  const pitch = 0.1 * surf + 0.3 * Math.sin(Math.PI * Math.min(lunge * 1.2, 1)) + 0.08 * lunge;
  return { x, y, z, yaw, pitch, jaw: smooth(3.4, 4.6, t), surf, lunge, t };
}
function makeShark(scene) {
  const N = 26;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
  const body = makeLoft(N, 20, { mat, color: (u, a) => { const s = Math.sin(a); const top = [0.24, 0.27, 0.3], bel = [0.85, 0.85, 0.82]; const k = Math.min(1, Math.max(0, (0.15 - s) * 2.5)); return [lerp(top[0], bel[0], k), lerp(top[1], bel[1], k), lerp(top[2], bel[2], k)]; } });
  const jaw = makeLoft(9, 14, { mat, color: (u, a) => (Math.sin(a) > 0.2 ? [0.55, 0.22, 0.24] : [0.86, 0.86, 0.83]) });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2a0606, roughness: 0.9 }));
  const finMat = new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: 0.5, side: THREE.DoubleSide });
  const tri = (pts) => { const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); return new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 }).translate(0, 0, -0.06); };
  const dorsal = new THREE.Mesh(tri([[0, 0], [1.9, 0], [0.4, 2.1], [-0.2, 2.0]]), finMat);
  const tailU = new THREE.Mesh(tri([[0, 0], [0.9, 0], [-1.7, 3.0], [-2.1, 2.8]]), finMat);
  const tailL = new THREE.Mesh(tri([[0, 0], [0.8, 0], [-1.3, -2.2], [-1.6, -2.0]]), finMat);
  const pecs = [0, 1].map(() => new THREE.Mesh(tri([[0, 0], [1.6, 0], [-0.8, 2.6], [-1.2, 2.3]]), finMat));
  const teeth = makeSpikes(scene, 90, 0xf2eee2, 0.3);
  const eye = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 })));
  for (const o of [body.mesh, jaw.mesh, mouth, dorsal, tailU, tailL, ...pecs, ...eye]) { o.castShadow = true; scene.add(o); }
  const meshes = [body.mesh, jaw.mesh, mouth, dorsal, tailU, tailL, ...pecs, teeth.mesh, ...eye];
  const F = new Frame(), G = new Frame();
  // sections along the body (u 0 snout .. 1 tail base): half width, top, bottom
  const sec = (u) => { const g = Math.sin(Math.PI * Math.pow(Math.min(u * 1.25, 1), 0.65)); return [0.15 + 1.45 * g * (1 - 0.55 * u), 0.15 + 1.55 * g * (1 - 0.5 * u), 0.15 + 1.45 * g * (1 - 0.6 * u)]; };
  return [meshes, (v) => {
    const S = sharkAt(v), L = SHARK.len;
    // the snout frame: X forward along the shark
    F.o.set(S.x, S.y, S.z);
    F.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), S.yaw - Math.PI / 2);
    F.turn(0, S.pitch, 0);
    const swim = Math.sin(v * 4.2) * (1 - S.lunge * 0.7) * (0.6 + 0.4 * (1 - S.surf));
    const st = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), [w, t, b] = sec(u);
      const bend = swim * 0.9 * u * u;
      // from the snout backward
      st.push({ p: F.at(-u * L, -0.25 * Math.pow(u, 2) * 0, bend), up: F.dir(0, 1, 0), w, t, b, sq: 0.95 });
    }
    st[0].w = 0.25; st[0].t = 0.2; st[0].b = 0.3;
    body.update(st);
    // the jaw: hinged 1.6 m back, under the snout
    G.copy(F); G.o.copy(F.at(-1.7, -0.75, 0)); G.turn(0, -0.9 * S.jaw, 0);
    const js = [];
    for (let i = 0; i < 9; i++) { const u = i / 8; js.push({ p: G.at(u * 1.8, -0.15 * u, 0), up: G.dir(0, 1, 0), w: 1.05 * (1 - 0.65 * u), t: 0.25, b: 0.45 * (1 - 0.5 * u), sq: 0.9 }); }
    jaw.update(js.reverse());
    mouth.position.copy(F.at(-1.6, -0.55 - 0.4 * S.jaw, 0)); mouth.quaternion.copy(F.q); mouth.scale.set(1.0, 0.25 + 0.75 * S.jaw, 1.0);
    teeth.begin();
    for (const sd of [-1, 1]) for (let k = 0; k < 14; k++) {
      const u = k / 13;
      teeth.add(F.at(-0.25 - u * 1.5, -0.45 - 0.1 * u, sd * (0.25 + 0.75 * Math.sin(u * 1.6))), F.dir(0.1, -1, 0), 0.22 - 0.07 * u, 0.06);
      teeth.add(G.at(1.75 - u * 1.6, 0.18, sd * (0.3 + 0.7 * Math.sin(u * 1.6))), G.dir(0.1, 1, 0), 0.2 - 0.06 * u, 0.055);
    }
    teeth.end();
    for (const [i, sd] of [[0, -1], [1, 1]]) eye[i].position.copy(F.at(-1.25, 0.2, sd * 0.72));
    F.at(-0.5, 0, 0, FOCUS[6]);
    const place = (m, u, yOff, rx = 0, rz = 0) => {
      const bend = swim * 0.9 * u * u;
      m.position.copy(F.at(-u * L, yOff, bend));
      m.quaternion.copy(F.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, -swim * 0.9 * 2 * u * 0.3, rz)));
    };
    place(dorsal, 0.42, sec(0.42)[1] * 0.85);
    place(tailU, 0.97, 0.05); place(tailL, 0.97, 0.0);
    pecs.forEach((m, i) => { const sd = i ? 1 : -1; place(m, 0.32, -sec(0.32)[2] * 0.6, sd * 1.9, 0); m.position.add(F.dir(0, 0, sd * sec(0.32)[0] * 0.7)); });
  }];
}
