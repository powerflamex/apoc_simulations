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

export function makeAnimals(scene, ctx) {
  const all = [];          // { k, meshes, frame(v) }
  const add = (k, meshes, frame) => all.push({ k, meshes, frame });

  // ---------- 1912: the runaway wagon ----------
  {
    const path = makePath(LANES[1][0]);
    const sEnd = sAtDist(path, 3.9);
    const speed = (v) => 4.2 + 6.8 * smooth(6.6, 7.8, v);
    const sAt = distance(speed, J[1], sEnd);
    const team = [-0.78, 0.78].map((dx, i) => {
      const pth = makePath(LANES[1][0].map(([x, z]) => [x + dx, z]));
      return quadOn(scene, { ...HORSE, colors: i ? HORSE.colors : { ...HORSE.colors, back: 0x2a1a10, flank: 0x4a2c18 } }, 1, { path: pth, sAt: (v) => sAt(v) + (i ? 0.25 : 0), speedAt: speed, C: 5.2, vFull: 10, offs: GALLOP.map((o) => o + i * 0.18), beta: 0.4 });
    });
    // the wagon: a box on four spoked wheels, two shafts to the horses
    const wood = ctx.plainMat(0x6a4a2c, 0.85), dark = ctx.plainMat(0x2a2018, 0.8), cargo = ctx.plainMat(0x9a8a6a, 0.95);
    const wagon = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 3.2).translate(0, 1.05, 0), wood); wagon.add(bed);
    for (const sx of [-1, 1]) wagon.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 3.2).translate(sx * 0.85, 1.45, 0), wood));
    wagon.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.6).translate(0, 1.6, 0.5), cargo));
    wagon.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.5).translate(0, 1.7, -1.3), dark));   // the seat
    const wheels = [];
    for (const sx of [-1, 1]) for (const [z, r] of [[-1.1, 0.5], [1.1, 0.62]]) {
      const w = new THREE.Group(); w.position.set(sx * 0.95, r, z);
      w.add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.03, 0.035, 6, 20).rotateY(Math.PI / 2), dark));
      for (let s = 0; s < 6; s++) w.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 1.9, 0.04).rotateX((s / 6) * Math.PI), wood));
      w.userData.r = r; wagon.add(w); wheels.push(w);
    }
    for (const sx of [-0.55, 0.55]) wagon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6).rotateX(Math.PI / 2).translate(sx, 1.0, -3.0), wood));
    wagon.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(wagon);
    const meshes = [...team.flatMap((t) => t.q.meshes), wagon];
    add(1, meshes, (v) => {
      for (const [ti, t] of team.entries()) {
        const b = t.base(v), gal = smooth(6.6, 7.8, v);
        const ph = b.g * Math.PI * 2;
        t.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: HORSE.H + b.gy + 0.05 * Math.sin(ph * 2) * (0.5 + gal), lean: 0.05 * Math.sin(ph) * gal - 0.03, neckPitch: -0.15 + 0.12 * Math.sin(ph + 1) * gal - 0.15 * gal, headPitch: 0.1 + 0.15 * gal + 0.2 * win(v, 9.3, 9.6, 10.3, 10.6), tail: [0.2 * Math.sin(v * 3), 0.3 * gal], feet: b.feet });
        if (ti === 1) FOCUS[1].copy(t.q.lastH.o);
      }
      const p = team[0].path.at(team[0].sAt(v) - 3.6), p2 = team[1].path.at(team[1].sAt(v) - 3.6);
      wagon.position.set((p.x + p2.x) / 2, 0.03 * Math.abs(Math.sin(v * 9)), (p.z + p2.z) / 2);
      wagon.rotation.set(0, p.yaw + Math.PI, 0.02 * Math.sin(v * 7));
      for (const w of wheels) w.rotation.x = -team[0].sAt(v) / w.userData.r;
    });
    // two carriages parked at the right kerb, their horses idling; a cart in the far lane coming slowly
    for (const [x, z, yaw, sp, col] of [[7.6, -18, Math.PI, 0, 0xd8cfc0], [7.6, -42, Math.PI, 0, 0x2a2420], [-6.4, -70, 0, 1.6, 0x4a3420]]) {
      const pth = makePath([[x, z - 60 * Math.cos(yaw)], [x, z + 60 * Math.cos(yaw)]]);
      const s0 = 60;
      const t = quadOn(scene, { ...HORSE, colors: { ...HORSE.colors, back: col, flank: col === 0xd8cfc0 ? 0xc8beb0 : 0x5a3a24, belly: col === 0xd8cfc0 ? 0xb8b0a0 : 0x4a3020 } }, 1, { path: pth, sAt: (v) => s0 + sp * (v - 7), speedAt: () => Math.max(sp, 0.001), C: 1.8, vFull: 1.6, offs: WALK, beta: 0.65 });
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

  // ---------- forest: the moose ----------
  {
    const path = makePath(LANES[2][0]);
    const sEnd = sAtDist(path, 2.4);
    const speed = (v) => 1.4 + 10.6 * smooth(13.4, 14.4, v);
    const sAt = distance(speed, J[2] - 0.02, sEnd);
    const m = quadOn(scene, MOOSE, 2, { path, sAt, speedAt: speed, C: 4.6, vFull: 11, offs: WALK, beta: 0.5 });
    // (walk, then gallop: the phase offsets blend once it charges)
    const gWalk = m.gait;
    add(2, m.q.meshes, (v) => {
      const b = m.base(v), ch = smooth(13.2, 14.0, v), ph = b.g * Math.PI * 2;
      const offs = WALK.map((o, i) => lerp(o, GALLOP[i], ch));
      const plants = [false, false, true, true].map((front, i) => (vm) => {
        const p = path.at(sAt(vm) + (front ? MOOSE.fore.at[0] : 0)), sd = i % 2 ? 1 : -1, side = (front ? MOOSE.fore.at[2] : MOOSE.hind.at[2]) * sd;
        const x = p.x - Math.cos(p.yaw) * side, z = p.z + Math.sin(p.yaw) * side;
        return { x, z, yaw: p.yaw, y: heightAt(2, x, z) };
      });
      const feet = plants.map((pl, i) => { const f = gWalk.foot(v, offs[i], lerp(0.65, 0.42, ch), pl); return { x: f.p.x, y: f.p.y, z: f.p.z, yaw: f.p.yaw, lift: f.lift }; });
      m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: MOOSE.H + b.gy + 0.07 * Math.sin(ph * 2) * ch, lean: -b.pitch + 0.05 * Math.sin(ph) * ch, neckPitch: lerp(0.05, -0.35, ch) + 0.05 * Math.sin(ph) * ch, neckYaw: lerp(0.5 * Math.sin(v * 0.7), 0, ch), headPitch: lerp(0, -0.25, ch), headYaw: lerp(0.25, 0, ch), tail: [0, 0], feet });
      FOCUS[2].copy(m.q.lastH.o);
    });
  }

  // ---------- ice age: the mastodon herd ----------
  {
    // the lead one's tusks reach you at the jump; the others are spread along their lanes
    const spec = [[0, 4.6, J[3], 2.3, 0], [1, 6.5, 20.6, 2.1, 1], [2, 10, 21.6, 2.2, 2], [3, 14, 23.0, 1.9, 3], [4, 0, 19.0, 2.0, 4]];
    for (const [lane, dEnd, vEnd, sp, i] of spec) {
      const path = makePath(LANES[3][lane]);
      const sRef = lane === 0 ? sAtDist(path, dEnd) : path.L * (lane === 4 ? 0.7 : 0.55);
      const sAt = distance(() => sp, vEnd, sRef);
      const tint = [1, 0.85, 1.1, 0.95, 0.9][i];
      const m = quadOn(scene, { ...MASTO, colors: { ...MASTO.colors, flank: new THREE.Color(MASTO.colors.flank).multiplyScalar(tint).getHex() } }, 3, { path, sAt, speedAt: () => sp, C: 3.2, vFull: 2.2, offs: WALK.map((o) => o + i * 0.13), beta: 0.65, lat: 0.9 });
      add(3, m.q.meshes, (v) => {
        const b = m.base(v), ph = b.g * Math.PI * 2;
        const trumpet = lane === 0 ? win(v, 18.2, 18.7, 19.6, 20.3) : lane === 1 ? win(v, 19.6, 20.0, 20.8, 21.3) * 0.7 : 0;
        const lowered = lane === 0 ? smooth(20.2, 21.2, v) : 0;
        m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: MASTO.H + b.gy + 0.04 * Math.sin(ph * 2), lean: -b.pitch * 0.8, roll: 0.03 * Math.sin(ph), neckPitch: 0.08 * Math.sin(ph + 0.5) + 0.35 * trumpet - 0.25 * lowered, neckYaw: 0.12 * Math.sin(v * 0.5 + i), headPitch: 0.25 * trumpet - 0.15 * lowered, tail: [0.2 * Math.sin(v * 1.4 + i), 0], feet: b.feet, trunk: 0.85 * trumpet + 0.12 * lowered, trunkSwing: 0.35 * Math.sin(v * 1.2 + i * 2) });
        if (lane === 0) FOCUS[3].copy(m.q.lastH.o);
      });
    }
  }

  // ---------- the short-faced bear ----------
  {
    const path = makePath(LANES[4][0]);
    const sStop = sAtDist(path, 4.6);
    const V_STOP = 23.35, V_REAR = 23.45, V_DROP = 26.25;
    const speed = (v) => 12 * (1 - smooth(22.7, V_STOP, v)) + 6 * smooth(V_DROP + 0.15, V_DROP + 0.4, v) * (1 - smooth(J[4], J[4] + 0.2, v));
    const sAt = distance(speed, V_STOP, sStop);
    const m = quadOn(scene, BEAR, 4, { path, sAt, speedAt: speed, C: 3.4, vFull: 11, offs: GALLOP, beta: 0.42 });
    add(4, m.q.meshes, (v) => {
      const b = m.base(v), ph = b.g * Math.PI * 2;
      const run = 1 - smooth(22.9, V_STOP, v);
      const up = smooth(V_REAR, V_REAR + 0.8, v) * (1 - smooth(V_DROP, V_DROP + 0.4, v));
      const roar = Math.max(win(v, 23.7, 23.95, 24.9, 25.3), win(v, 25.9, 26.1, 26.6, 26.8) * 0.9, win(v, 26.45, 26.6, 27.2, 27.4));
      const lean = -b.pitch + 0.06 * Math.sin(ph) * run - 1.28 * up;
      const feet = b.feet.slice();
      // standing: the hind feet stay where they are; the front paws come up in front of the chest, claws out
      if (up > 0.01) {
        const fwd = { x: Math.sin(b.p.yaw), z: Math.cos(b.p.yaw) }, rt = { x: -Math.cos(b.p.yaw), z: Math.sin(b.p.yaw) };
        for (const [i, sd] of [[2, -1], [3, 1]]) {
          const reachF = 0.55 + 0.25 * Math.sin(v * 2.1 + sd), hy = 2.25 + 0.15 * Math.sin(v * 1.7 + sd);
          const tgt = { x: b.p.x + fwd.x * reachF + rt.x * sd * 0.42, y: b.gy + hy - 0.1, z: b.p.z + fwd.z * reachF + rt.z * sd * 0.42, yaw: b.p.yaw, lift: 0, hint: new THREE.Vector3(0, -1, 0) };
          const f = feet[i];
          feet[i] = { x: lerp(f.x, tgt.x, up), y: lerp(f.y, tgt.y, up), z: lerp(f.z, tgt.z, up), yaw: b.p.yaw, lift: 0, hint: up > 0.5 ? tgt.hint : undefined };
        }
      }
      m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: BEAR.H + b.gy + 0.06 * Math.sin(ph * 2) * run + 0.12 * up, lean, neckPitch: -0.1 * run - 0.55 * up + 0.1 * Math.sin(v * 1.3) * up, headPitch: -0.75 * up + 0.15 * roar, headYaw: 0.08 * Math.sin(v * 0.9) * up, tail: [0, 0], feet, jaw: 0.9 * roar + 0.08 });
      FOCUS[4].copy(m.q.lastH.o);
    });
  }

  // ---------- three sabertooths ----------
  {
    const lanes = [[0, 1.2, 32.0, 0], [1, 1.3, 32.2, 1], [2, 1.1, J[5], 2]];
    for (const [lane, sp, vEnd, i] of lanes) {
      const path = makePath(LANES[5][lane]);
      const lead = lane === 2;
      const dEnd = lead ? 2.2 : 4.2;
      const V_SPRING = 31.75;
      const speed = lead ? (v) => sp + 7.5 * smooth(V_SPRING - 0.1, V_SPRING + 0.15, v) : () => sp;
      const sAt = distance(speed, vEnd, sAtDist(path, dEnd));
      const m = quadOn(scene, CAT, 5, { path, sAt, speedAt: speed, C: lead ? 2.6 : 1.4, vFull: lead ? 6 : 1.2, offs: lead ? GALLOP : WALK, beta: lead ? 0.5 : 0.65 });
      add(5, m.q.meshes, (v) => {
        const b = m.base(v), ph = b.g * Math.PI * 2;
        const crouch = lead ? win(v, 30.9, 31.4, 31.65, 31.8) : smooth(29, 31.5, v) * 0.5;
        const air = lead ? win(v, V_SPRING, V_SPRING + 0.12, J[5] - 0.25, J[5] + 0.1) : 0;
        const snarl = Math.max(win(v, 28.6 + i * 0.9, 28.9 + i * 0.9, 29.8 + i * 0.9, 30.2 + i * 0.9), lead ? smooth(31.3, 31.6, v) : 0);
        const feet = b.feet.map((f, j) => {
          if (air < 0.01) return f;
          const front = j >= 2, fwd = { x: Math.sin(b.p.yaw), z: Math.cos(b.p.yaw) };
          const reach = front ? CAT.fore.at[0] + 0.5 : -0.35;
          return { x: lerp(f.x, b.p.x + fwd.x * reach, air), y: lerp(f.y, b.gy + (front ? 0.75 : 0.45), air), z: lerp(f.z, b.p.z + fwd.z * reach, air), yaw: f.yaw, lift: 0 };
        });
        m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: CAT.H + b.gy - 0.2 * crouch - 0.08 * (1 - (lead ? smooth(V_SPRING, V_SPRING + 0.1, v) : 0)) + 0.55 * air, lean: -b.pitch + 0.1 * crouch - 0.15 * air, neckPitch: -0.12 - 0.15 * crouch + 0.1 * air, neckYaw: lead ? 0 : 0.15 * Math.sin(v * 0.5 + i), headPitch: 0.15 + 0.15 * snarl, tail: [0.2 * Math.sin(v * 2 + i), 0.3], feet, jaw: 0.75 * snarl + 0.05 });
        if (lead) FOCUS[5].copy(m.q.lastH.o);
      });
    }
  }

  // ---------- the megalodon ----------
  add(6, ...makeShark(scene));

  // ---------- dinosaurs: the brachiosaur crossing, then the Acrocanthosaurus ----------
  {
    const path = makePath(LANES[7][0]);
    const speed = () => 2.6;
    let sMid = 0; for (let s0 = 0; s0 < path.L; s0 += 0.05) if (path.at(s0).x < -7) sMid = s0;
    const sAt = distance(speed, 40.5, sMid);
    const m = quadOn(scene, SAURO, 7, { path, sAt, speedAt: speed, C: 5.5, vFull: 2.6, offs: WALK, beta: 0.7, minStep: 0.35 });
    add(7, m.q.meshes, (v) => {
      const b = m.base(v), ph = b.g * Math.PI * 2;
      m.q.pose({ x: b.p.x, z: b.p.z, yaw: b.p.yaw, h: SAURO.H + b.gy + 0.08 * Math.sin(ph * 2), lean: -b.pitch, roll: 0.02 * Math.sin(ph), neckPitch: 0.05 * Math.sin(ph) + 0.08, neckYaw: -0.35 * smooth(38, 41, v) + 0.1 * Math.sin(v * 0.3), headPitch: -0.2 - 0.3 * smooth(38.5, 41, v), tail: [0.15 * Math.sin(ph * 0.5), 0], feet: b.feet });
      FOCUS2.copy(m.q.lastH.o);
    });
    STEPS.sauro = { gait: m.gait, offs: WALK };
  }
  {
    const path = makePath(LANES[7][1]);
    const sEnd = sAtDist(path, 6.4);
    const V_GO = 42.0;
    const speed = (v) => 0.6 + 7.6 * smooth(V_GO - 0.2, V_GO + 0.7, v);
    const sAt = distance(speed, V_WHITE - 0.05, sEnd);
    const rex = makeTheropod(scene, { seed: 3, colors: { back: 0x3a1e12, flank: 0x7a4a2a, belly: 0xd0b890, stripe: 0x1e0e08 } });
    // the high spines along its back (Acrocanthosaurus: "high-spined lizard"): a low ridge from the neck to the tail
    const ridge = makeLoft(1 + 10 * 2, 8, { mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), color: (u, a) => (Math.sin(a) > 0.3 ? [0.3, 0.13, 0.07] : [0.24, 0.12, 0.07]) });
    scene.add(ridge.mesh);
    const gait = makeGait({ sAt, speedAt: speed, C: 3.6, vFull: 7.5, minStep: 0.3, v0: -2, v1: 50 });
    const LAT = 0.5;
    const plant = (sd) => (vm) => { const q = path.at(sAt(vm)); const x = q.x - Math.cos(q.yaw) * LAT * sd, z = q.z + Math.sin(q.yaw) * LAT * sd; return { x, z, yaw: q.yaw, y: heightAt(7, x, z) }; };
    add(7, [...rex.meshes, ridge.mesh], (v) => {
      const q = path.at(sAt(v)), g = gait.gAt(v), ph = g * Math.PI * 2;
      const run = smooth(V_GO - 0.2, V_GO + 0.7, v);
      const feet = [plant(-1), plant(1)].map((pl, i) => { const f = gait.foot(v, i * 0.5, lerp(0.62, 0.42, run), pl); return { x: f.p.x, y: f.p.y, z: f.p.z, yaw: f.p.yaw, lift: f.lift }; });
      const roar = Math.max(win(v, 40.9, 41.2, 41.9, 42.3), win(v, 45.25, 45.45, 46.2, 46.4) * 1.1);
      const gy = heightAt(7, q.x, q.z);
      // at the end its head comes down to your lens and the jaws open wide
      const low = smooth(44.6, 45.8, v);
      const out = rex.pose({ x: q.x, z: q.z, yaw: q.yaw, h: 3.35 + gy + 0.12 * Math.abs(Math.sin(ph)) * run - 0.35 * low, lean: 0.05 + 0.1 * run + 0.12 * low, neckPitch: 0.1 - 0.2 * run - 0.3 * low + 0.25 * win(v, 40.9, 41.2, 41.9, 42.3), neckYaw: 0.15 * Math.sin(v * 0.6) * (1 - run), headPitch: -0.05 + 0.25 * roar - 0.15 * low, headYaw: 0, jaw: 1.05 * roar + 0.06, tail: [0.12 * Math.sin(ph), 0.05], breath: 0, feet, arm: 0.5 + 0.5 * Math.sin(ph) });
      FOCUS[7].copy(out.head.o);
      // the ridge
      const st = [];
      const fr = out.fr, tl = out.tl;
      const frames = [];
      for (let i = 4; i >= 1; i--) frames.push([tl[i], out.TAIL_R[i]]);
      for (let i = 0; i < fr.length - 1; i++) frames.push([fr[i], out.FWD_R[i]]);
      frames.forEach(([f, r], i) => { const u = i / (frames.length - 1); const hgt = 0.12 + 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.1)); st.push({ p: f.at(0, r[1] * 0.85, 0), up: f.dir(0, 1, 0), w: 0.05, t: hgt + 0.05, b: 0.05 }); });
      ridge.update(resample(st, 2).slice(0, 1 + 10 * 2).concat(Array(Math.max(0, 21 - resample(st, 2).length)).fill(st[st.length - 1])));
    });
    STEPS.acro = { gait, v0: V_GO };
  }

  // every animal's meshes shown only at its own stop
  return {
    all,
    frame(v) {
      const k = stopAt(v);
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
export function sharkAt(v) {
  // across in front of you, 27 m out, fin up (32.4-35.4)
  if (v < 35.4) {
    const u = (v - 32.4) / 3.0;
    return { x: lerp(5, -10, u), y: SEA_Y - 1.25, z: -21 + 2.0 * u, yaw: Math.atan2(-15, 2.0), pitch: 0, jaw: 0 };
  }
  // turning in toward you and diving (a curve: from where it was, round through a control point, to 13 m off the rocks)
  const A = { x: -10, z: -19 }, Cc = { x: -15, z: -16 }, T = { x: -0.8, z: -13 };
  const u = smooth(35.4, 36.3, v), w = 1 - u;
  let x = w * w * A.x + 2 * w * u * Cc.x + u * u * T.x, z = w * w * A.z + 2 * w * u * Cc.z + u * u * T.z;
  const tx = 2 * w * (Cc.x - A.x) + 2 * u * (T.x - Cc.x), tz = 2 * w * (Cc.z - A.z) + 2 * u * (T.z - Cc.z);
  let yaw = Math.atan2(tx, tz);
  if (u > 0.98) yaw = Math.atan2(T.x - Cc.x, T.z - Cc.z);
  // the breach: up out of the water and on toward you, jaws open
  const breach = smooth(36.2, 37.9, v);
  x += 0.6 * breach; z += 8.5 * breach;
  yaw = lerp(yaw, Math.atan2(0.1, 1), smooth(36.2, 36.6, v));
  const y = lerp(SEA_Y - 1.25, SEA_Y - 3.0, u) + 7.6 * Math.pow(breach, 0.8);
  const pitch = -0.15 * u * (1 - breach) + 0.62 * Math.sin(Math.PI * Math.min(breach * 0.9, 1)) * (1 - 0.4 * smooth(37.4, 37.9, v));
  return { x, y, z, yaw, pitch, jaw: smooth(36.1, 36.7, v) };
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
    const swim = Math.sin(v * 3.2) * (1 - smooth(36.3, 37.0, v) * 0.7);
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
