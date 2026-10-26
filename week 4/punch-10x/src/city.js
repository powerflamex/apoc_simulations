// Everything in the city the punches destroy: the buildings (instanced boxes, look in facade.js), the pieces they break
// into (boxes with the same facade, so a chunk of an office shows its windows), the traffic and the bus, the people,
// the palms and street lamps, and the dust and glass that come off them. All of it from video time alone.
import * as THREE from 'three';
import { B, CARS, LANES, laneX, BUS, PEOPLE, personX, PALMS, LAMPS, IMP } from './layout.js';
import { facadeMaterial, F } from './facade.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { vPunch } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';

const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mR = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();
const ax = new THREE.Vector3(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
const q = new THREE.Quaternion(), e = new THREE.Euler();
const G = 9.8;

// a box thrown at v0 from p0 with velocity vel and spin, landing on the ground (its half height hy), then skidding to a
// stop: position + rotation at time v (returns false before v0)
function thrown(o, v, out) {
  const t = v - o.v0;
  if (t < 0) return false;
  const vy = o.vel[1];
  const tg = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(o.p0[1] - o.hy, 0))) / G;
  let x, y, z, rt;
  if (t < tg) { x = o.p0[0] + o.vel[0] * t; y = o.p0[1] + vy * t - 0.5 * G * t * t; z = o.p0[2] + o.vel[2] * t; rt = t; }
  else {
    const ts = t - tg, sl = (o.slide ?? 0.5) * (1 - Math.exp(-ts / 0.4));
    x = o.p0[0] + o.vel[0] * (tg + sl); z = o.p0[2] + o.vel[2] * (tg + sl); y = o.hy; rt = tg + sl * 0.6;
  }
  out.pos.set(x, y, z);
  out.rot.set(o.spin[0] * rt + (o.r0 ? o.r0[0] : 0), o.spin[1] * rt + (o.r0 ? o.r0[1] : 0), o.spin[2] * rt + (o.r0 ? o.r0[2] : 0));
  // (once it lies still it settles flat: no box balanced on its corner)
  if (t >= tg) {
    const k = smooth(0, 0.5, t - tg);
    const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    out.rot.set(lerp(out.rot.x, snap(out.rot.x), k), out.rot.y, lerp(out.rot.z, snap(out.rot.z), k));
  }
  return true;
}

export function fallState(b, v) {
  const k = clamp((v - b.vHit) / b.dur);
  if (k <= 0) return { tip: 0, left: 1, k: 0 };
  const ek = k * (0.4 + 0.6 * k);
  const tip = b.lean * Math.sin(Math.min(ek * 1.3, 1) * Math.PI / 2) * (1 - smooth(0.8, 1, k) * 0.7);
  const rubble = Math.min(0.15, 5 / b.h);
  return { tip, left: 1 - (1 - rubble) * smooth(0.0, 1, ek), k };
}

export function makeCity(scene, ctx) {
  // ---------- buildings (plus the tops of the five towers, which drop when punch 8 goes through them) ----------
  const TOPS = B.filter((b) => b.hero === 'tower');
  const n = B.length + TOPS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aT = new Float32Array(n * 4), aS = new Float32Array(n * 4), aC = new Float32Array(n * 4), aY = new Float32Array(n);
  const Rf = rng(99);
  B.forEach((b, i) => {
    // fires inside the ones whose windows went long before they fall
    const fire = b.vGlass < b.vHit - 1.2 && b.dist < 2500 ? b.vGlass + 0.6 + Rf() * 1.5 : 1e9;
    aT.set([b.vGlass, fire, b.fate === 'fall' ? b.vHit : 1e9, b.dur], i * 4);
    aS.set([b.seed, b.kind, Math.min(b.vGlass + 0.3, b.vHit), b.h], i * 4);
    if (b.crown) { col.setHSL(Rf(), 0.8, 0.55); aC.set([col.r * 1.6, col.g * 1.6, col.b * 1.6, 1], i * 4); }
  });
  TOPS.forEach((b, j) => {
    const i = B.length + j;
    aT.set([b.vGlass, 1e9, 1e9, 1], i * 4);
    aS.set([b.seed, b.kind, b.vHit, b.h], i * 4);
    aY[i] = b.h * b.hole + 7;
    b.topIdx = i;
  });
  geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  geo.setAttribute('aY', new THREE.InstancedBufferAttribute(aY, 1));
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(), n);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  B.forEach((b, i) => mesh.setColorAt(i, col.set(b.col)));
  TOPS.forEach((b, j) => mesh.setColorAt(B.length + j, col.set(b.col)));
  scene.add(mesh);

  // ---------- the pieces: each burst building is cut into blocks (the towers: just the slab the punch goes through) ----------
  const CH = [];
  const R = rng(616);
  for (const b of B) {
    if (b.fate !== 'burst') continue;
    const hero = !!b.hero;
    let y0 = 0, y1 = b.h;
    if (b.hero === 'tower') { y0 = b.h * b.hole - 8; y1 = b.h * b.hole + 7; }
    const cap = b.hero === 'office' ? 260 : b.hero === 'shops' ? 150 : b.hero === 'tower' ? 110 : 55;
    const vol = b.w * b.d * (y1 - y0);
    let cs = Math.max(hero ? 3.2 : 5, Math.cbrt(vol / cap));
    const nx = Math.max(1, Math.round(b.w / cs)), nz = Math.max(1, Math.round(b.d / cs)), ny = Math.max(1, Math.round((y1 - y0) / cs));
    const sx = b.w / nx, sz = b.d / nz, sy = (y1 - y0) / ny;
    // where the blast comes from (the hit point on the near face), and how hard
    const hx = b.x, hz = b.z + b.d / 2, hy = b.hero === 'tower' ? (y0 + y1) / 2 : Math.min(b.h * 0.3, 12);
    const power = b.hero === 'office' ? 26 : b.hero === 'shops' ? 14 : b.hero === 'tower' ? 60 : 30 + 10 * ((b.nHit || 9) - 9);
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
      if (b.hero === 'shops' && iz < nz / 2 - 1 && R() < 0.5) continue;       // the back of the shops caves in instead
      const cx = b.x - b.w / 2 + (ix + 0.5) * sx, cy = y0 + (iy + 0.5) * sy, cz = b.z - b.d / 2 + (iz + 0.5) * sz;
      const dx = cx - IMP.x, dz = cz - IMP.z, dh = Math.hypot(dx, dz) || 1;
      // pushed away from you (and out from the hit point), the near face first, flying up a little
      const ox = cx - hx, oy = cy - hy, oz = cz - hz;
      const od = Math.hypot(ox, oy, oz) || 1;
      const kk = 1 / (1 + od / (b.hero === 'tower' ? 30 : 18));
      const sp = power * (0.35 + 0.65 * kk) * (0.7 + 0.6 * R());
      const dirx = (dx / dh) * 0.7 + (ox / od) * 0.5, dirz = (dz / dh) * 0.7 + (oz / od) * 0.5;
      const dl = Math.hypot(dirx, dirz) || 1;
      const s0 = [sx * (0.75 + 0.3 * R()), sy * (0.75 + 0.3 * R()), sz * (0.75 + 0.3 * R())];
      CH.push({
        b, v0: b.vHit + Math.max(0, (hz - cz)) / 400 + R() * 0.04, p0: [cx, cy, cz], hy: s0[1] / 2,
        vel: [dirx / dl * sp, (oy / od) * sp * 0.4 + 2 + R() * 6 + (b.hero === 'office' ? 6 : 0), dirz / dl * sp],
        spin: [(R() - 0.5) * 5, (R() - 0.5) * 4, (R() - 0.5) * 5], size: s0, yOff: cy - s0[1] / 2, slide: 1.2,
      });
    }
  }
  const cgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const cT = new Float32Array(CH.length * 4), cS = new Float32Array(CH.length * 4), cC = new Float32Array(CH.length * 4), cY = new Float32Array(CH.length);
  CH.forEach((c, i) => {
    cT.set([c.b.vGlass, 1e9, 1e9, 1], i * 4);
    cS.set([c.b.seed, c.b.kind, c.b.vHit, c.b.h], i * 4);
    cY[i] = c.yOff;
  });
  cgeo.setAttribute('aT', new THREE.InstancedBufferAttribute(cT, 4));
  cgeo.setAttribute('aS', new THREE.InstancedBufferAttribute(cS, 4));
  cgeo.setAttribute('aC', new THREE.InstancedBufferAttribute(cC, 4));
  cgeo.setAttribute('aY', new THREE.InstancedBufferAttribute(cY, 1));
  const chunks = new THREE.InstancedMesh(cgeo, facadeMaterial(), Math.max(1, CH.length));
  chunks.frustumCulled = false; chunks.castShadow = true;
  CH.forEach((c, i) => { chunks.setColorAt(i, col.set(c.b.col)); chunks.setMatrixAt(i, HIDE); });
  scene.add(chunks);

  // ---------- glass: where it bursts out of the windows near the street ----------
  const GL = [];
  for (const b of B) {
    if (b.vGlass > 1e8 || b.dist > 260) continue;
    const ns = Math.round(clamp(b.h / 2, 6, 50));
    for (let k = 0; k < ns; k++) {
      const face = Math.floor(R() * 4);
      const fx = face < 2 ? b.x + (face ? 1 : -1) * b.w / 2 : b.x + (R() - 0.5) * b.w;
      const fz = face >= 2 ? b.z + (face === 2 ? 1 : -1) * b.d / 2 : b.z + (R() - 0.5) * b.d;
      GL.push({ x: fx, y: 3 + R() * (b.h - 3), z: fz, v: b.vGlass + 0.3 * R(), out: face, seed: R() });
    }
  }

  // ---------- cars and the bus ----------
  const fleet = makeFleet(scene, CARS.length, ctx);
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  // each car's flight when its blast comes: thrown away from you, tumbling (the hero: up and over the avenue)
  for (const c of CARS) {
    const Rc = rng(Math.round(c.seed * 1e6));
    c.fly = null;
    if (c.vThrow > 1e8) continue;
    const L = c.parked ? null : LANES[c.lane];
    const x = c.parked ? c.x0 : laneX(L, c.x0, c.vThrow);
    const z = c.parked ? c.z : L.z;
    const dx = x - IMP.x, dz = z - IMP.z, d = Math.hypot(dx, dz) || 1;
    const sp = c.hero ? 15 : c.nThrow <= 6 ? 9 + Rc() * 6 : c.nThrow === 7 ? 16 + Rc() * 10 : 30 + Rc() * 25;
    const up = c.hero ? 10.5 : 2 + Rc() * (c.nThrow <= 6 ? 3 : 8);
    c.fly = { v0: c.vThrow, p0: [x, 0.0, z], hy: 0.0, vel: c.hero ? [1.5, up, -sp] : [dx / d * sp, up, dz / d * sp], slide: c.hero ? 0.35 : 0.8,
      spin: c.hero ? [-5.2, 0.6, 1.4] : [(Rc() - 0.5) * 6, (Rc() - 0.5) * 3, (Rc() - 0.5) * 6], r0: [0, c.parked ? c.yaw : (L.dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0] };
  }
  const busG = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(BUS.len, BUS.h - 0.45, BUS.w).translate(0, (BUS.h - 0.45) / 2 + 0.45, 0), ctx.plainMat(0xf2f0e8, 0.5));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(BUS.len + 0.02, 0.5, BUS.w + 0.02).translate(0, 1.0, 0), ctx.plainMat(0xc8261e, 0.5));
    const win = new THREE.Mesh(new THREE.BoxGeometry(BUS.len - 1.2, 1.05, BUS.w + 0.04).translate(0.2, 2.15, 0), ctx.plainMat(0x15191e, 0.15, { metalness: 0.5 }));
    const wsh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, BUS.w - 0.3).translate(-BUS.len / 2 - 0.01, 2.0, 0), ctx.plainMat(0x15191e, 0.1, { metalness: 0.5 }));
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 1.6).translate(-BUS.len / 2 - 0.03, 2.95, 0), ctx.glowMat(new THREE.Color(3, 1.8, 0.3)));
    const wheels = [];
    for (const wx of [-BUS.len / 2 + 2.3, BUS.len / 2 - 2.6]) for (const wz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateX(Math.PI / 2).translate(wx, 0.5, wz * (BUS.w / 2 - 0.12)), ctx.plainMat(0x111111, 0.9));
      wheels.push(w);
    }
    for (const m of [body, stripe, win, wsh, sign, ...wheels]) { m.castShadow = true; m.receiveShadow = true; busG.add(m); }
    scene.add(busG);
  }
  // the bus flips toward the far side: up onto its side, over onto its roof, sliding (about its north edge)
  const busFlip = (v) => {
    const t = v - BUS.vFlip;
    if (t < 0) return null;
    const k = 1 - Math.exp(-t / 0.55);
    return { roll: 3.1 * k + 0.12 * Math.sin(Math.min(t, 1.5) * 8) * Math.exp(-t * 3), slide: 10 * k, lift: Math.max(0, 5.5 * Math.sin(Math.min(t / 0.9, 1) * Math.PI)) };
  };

  // ---------- palms and street lamps ----------
  const trunkG = new THREE.CylinderGeometry(0.17, 0.26, 1, 7).translate(0, 0.5, 0);
  const frondG = (() => {
    // a crown of 11 drooping fronds (thin bent quads), the same for every palm
    const gs = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + 0.3 * Math.sin(k * 2.3);
      const g = new THREE.PlaneGeometry(0.9, 4.2, 1, 6).translate(0, 2.1, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = y / 4.2; p.setY(i, y * Math.cos(t * 1.2)); p.setZ(i, -Math.pow(t, 2) * 2.4 - y * Math.sin(t * 1.2) * 0.2); p.setX(i, p.getX(i) * (1 - t * 0.7)); }
      g.rotateX(-Math.PI / 2 + 0.55);
      g.rotateY(a);
      gs.push(g);
    }
    return mergeAll(gs);
  })();
  const trunks = new THREE.InstancedMesh(trunkG, ctx.plainMat(0x7a6650, 0.95), PALMS.length);
  const fronds = new THREE.InstancedMesh(frondG, ctx.plainMat(0x4d6a2a, 0.8, { side: THREE.DoubleSide }), PALMS.length);
  for (const m of [trunks, fronds]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
  PALMS.forEach((t, i) => fronds.setColorAt(i, col.setRGB(0.28 + 0.1 * t.seed, 0.4 + 0.08 * t.seed, 0.16)));
  const poleG = new THREE.CylinderGeometry(0.08, 0.11, 7.5, 8).translate(0, 3.75, 0);
  const armG = new THREE.BoxGeometry(0.1, 0.1, 1.8).translate(0, 7.4, 0.8);
  const lampPole = new THREE.InstancedMesh(poleG, ctx.plainMat(0x30343a, 0.6, { metalness: 0.5 }), LAMPS.length);
  const lampArm = new THREE.InstancedMesh(armG, ctx.plainMat(0x30343a, 0.6, { metalness: 0.5 }), LAMPS.length);
  for (const m of [lampPole, lampArm]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }

  // ---------- the crowd ----------
  const crowd = makeCrowd(scene, PEOPLE.length, ctx.plainMat(0xffffff, 0.85), { castShadow: true });
  const SHIRTS = [0xf2f2ee, 0x1d1f24, 0xe2574c, 0x3b6db3, 0xf3c94b, 0x58a37a, 0xe98bb4, 0x8c5ad1, 0xf08a3c, 0x41c1c9, 0xffffff, 0x2f2f2f, 0x9fb7d6];
  const PANTS = [0x2b3a55, 0x1b1b1d, 0xd8cfbd, 0x50555c, 0x6a4b33, 0xf0ece4, 0x2e4a3a];
  PEOPLE.forEach((p, i) => {
    const Rp = rng(1000 + i);
    crowd.color(i, SHIRTS[Math.floor(Rp() * SHIRTS.length)], PANTS[Math.floor(Rp() * PANTS.length)], SKIN[Math.floor(Rp() * SKIN.length)], HAIR[Math.floor(Rp() * HAIR.length)]);
    p.ph = Rp() * 6.28; p.phone = Rp() < 0.3;
  });

  const tmp = { pos: new THREE.Vector3(), rot: new THREE.Euler() };
  return {
    mesh, chunks, crowd, fleet, busG,
    frame(v, s, glows, smoke, camY) {
      F.uTime.value = v;
      const cityOn = v < 30;
      mesh.visible = cityOn;
      // ---- buildings ----
      if (cityOn) {
        for (let i = 0; i < B.length; i++) {
          const b = B[i];
          if (v < b.vHit) {
            const h = b.hero === 'tower' && v > b.vHit - 0.001 ? b.h * b.hole - 8 : b.h;
            mesh.setMatrixAt(i, mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, h, b.d)));
            continue;
          }
          if (b.hero === 'tower') {
            // the stump below the hole stays (until the round blasts), cracked; then it caves in
            const st = clamp((v - (b.vHit + 6.5)) / 1.5);
            const hh = (b.h * b.hole - 8) * (1 - 0.9 * smooth(0, 1, st));
            mesh.setMatrixAt(i, mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, Math.max(hh, 0.01), b.d)));
            continue;
          }
          if (b.fate === 'burst') { mesh.setMatrixAt(i, HIDE); continue; }
          const st = fallState(b, v);
          if (st.k >= 1 && v > b.vHit + b.dur + 4) { mesh.setMatrixAt(i, HIDE); continue; }
          mA.makeTranslation(b.x, 0, b.z).multiply(mB.makeScale(b.w, b.h * st.left, b.d));
          // tip away from you about the foot of the wall on the far side
          const dl = Math.hypot(b.x - IMP.x, b.z - IMP.z) || 1, ux = (b.x - IMP.x) / dl, uz = (b.z - IMP.z) / dl;
          const px = b.x + ux * b.w / 2, pz = b.z + uz * b.d / 2;
          ax.set(uz, 0, -ux);
          mR.makeRotationAxis(ax, -Math.abs(st.tip));
          m4.makeTranslation(px, 0, pz).multiply(mR).multiply(mB.makeTranslation(-px, 0, -pz)).multiply(mA);
          mesh.setMatrixAt(i, m4);
        }
        // the tower tops: they drop through the hole and topple, then break up in the dust
        for (const b of TOPS) {
          const y0 = b.h * b.hole + 7, hTop = b.h - y0;
          const t = v - b.vHit - 0.15;
          if (t < 0) { mesh.setMatrixAt(b.topIdx, mA.makeTranslation(b.x, y0, b.z).multiply(mB.makeScale(b.w, hTop, b.d))); continue; }
          const drop = Math.min(0.5 * G * 0.55 * t * t, y0 - 6 + hTop * 0.4);
          const tip = Math.min(t * t * 0.22, 1.2) * (b.ti % 2 ? 1 : -1);
          const sink = smooth(1.2, 4.0, t);
          if (sink >= 1) { mesh.setMatrixAt(b.topIdx, HIDE); continue; }
          mA.makeTranslation(b.x, y0 - drop, b.z - Math.min(t * 6, 14)).multiply(mR.makeRotationX(tip * 0.4)).multiply(mB.makeRotationZ(tip * 0.25)).multiply(m4.makeScale(b.w, hTop * (1 - 0.85 * sink), b.d));
          mesh.setMatrixAt(b.topIdx, mA);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      // ---- the pieces in flight ----
      chunks.visible = v < 29;
      if (chunks.visible) {
        for (let i = 0; i < CH.length; i++) {
          const c = CH[i];
          if (!thrown(c, v, tmp) || v - c.v0 > 14) { chunks.setMatrixAt(i, HIDE); continue; }
          q.setFromEuler(tmp.rot);
          m4.compose(tmp.pos, q, sc.set(c.size[0], c.size[1], c.size[2]));
          // (the box's origin is at its base: shift it so it spins about its middle)
          mA.makeTranslation(0, -0.5, 0);
          m4.multiply(mA);
          chunks.setMatrixAt(i, m4);
        }
        chunks.instanceMatrix.needsUpdate = true;
      }
      // ---- dust: a dark ball of dust bursting out of each building that blows apart, rolling along the ground;
      //      the ones that cave in sink into their own dust ----
      if (camY < 40000) for (const b of B) {
        const age = v - b.vHit;
        if (age < 0 || age > 12) continue;
        const near = b.dist < 700;
        if (!near && b.fate === 'fall') continue;
        const Rb = rng(Math.round(b.seed * 1e6));
        const span = Math.max(b.w, b.d);
        const np = b.hero ? 14 : b.fate === 'burst' ? 7 : 4;
        const big = b.hero === 'office' ? 1.1 : b.hero ? 0.8 : 1;
        for (let k = 0; k < np; k++) {
          const a = Rb() * Math.PI * 2, seed = Rb(), oy = Rb();
          const vs = b.vHit + (b.fate === 'fall' ? (k / np) * b.dur : Rb() * 0.15);
          const ag = v - vs;
          if (ag < 0) continue;
          const spread = (span * 0.35 + (b.fate === 'burst' ? 24 : 10) * big * (1 - Math.exp(-ag * 0.9))) * (0.5 + 0.7 * seed);
          const r = span * 0.25 * big + ag * (b.fate === 'burst' ? 4.5 : 3) * big;
          const hy = b.hero === 'tower' ? b.h * b.hole : b.h * 0.5;
          const y = Math.max(r * 0.45, hy * oy * Math.exp(-ag * 0.35) + ag * 1.2);
          const dl = Math.hypot(b.x - IMP.x, b.z - IMP.z) || 1;
          const push = (b.fate === 'burst' ? 10 : 3) * (1 - Math.exp(-ag * 1.2));
          const al = (b.hero ? 0.34 : 0.45) * smooth(0, 0.15, ag) * (1 - smooth(4, 10, ag));
          smoke.puff(b.x + Math.cos(a) * spread + (b.x - IMP.x) / dl * push, y, b.z + Math.sin(a) * spread + (b.z - IMP.z) / dl * push, r, al, 0.42 + 0.2 * seed, 0, seed);
        }
        if (b.fate === 'burst' && age < 0.2 && b.dist < 600) glows.add(b.x, b.hero === 'tower' ? b.h * b.hole : 10, b.z + b.d / 2, Math.max(b.w, 20), 2.4 * (1 - age / 0.2), 2.0 * (1 - age / 0.2), 1.6 * (1 - age / 0.2));
      }
      // glass: glittering shards falling out of the burst windows
      for (const g of GL) {
        const dt = v - g.v;
        if (dt < 0 || dt > 3) continue;
        const out = [[-1, 0], [1, 0], [0, 1], [0, -1]][g.out];
        const sp = 2 + 4 * g.seed;
        const y = g.y - 4.9 * dt * dt;
        if (y < 0.2) continue;
        const tw = 0.5 + 0.5 * Math.sin(dt * 40 + g.seed * 50);
        glows.add(g.x + out[0] * sp * dt, y, g.z + out[1] * sp * dt, 0.45 + 0.3 * g.seed, 1.6 * tw, 1.7 * tw, 1.8 * tw);
      }

      // ---- cars ----
      const carsOn = v < 30;
      for (let i = 0; i < CARS.length; i++) {
        const c = CARS[i];
        if (!carsOn) { fleet.set(i, HIDE, false); continue; }
        if (c.fly && thrown(c.fly, v, tmp)) {
          q.setFromEuler(tmp.rot);
          // (the car's origin is on its floor: spin it about its middle)
          m4.compose(tmp.pos.add(pos.set(0, 0.8, 0)), q, sc.set(1, 1, 1)).multiply(mA.makeTranslation(0, -0.8, 0));
          fleet.set(i, m4, v - c.fly.v0 < 0.4);
          // glass bursting off it as it goes
          if (v - c.fly.v0 < 0.8 && camY < 400) {
            const Rc = rng(31 + i);
            for (let k = 0; k < (c.hero ? 30 : 8); k++) {
              const a = Rc() * Math.PI * 2, sp = 1.5 + Rc() * 5, dt = v - c.fly.v0 - Rc() * 0.1;
              if (dt < 0) continue;
              const y = 1.1 + sp * 0.5 * dt - 4.9 * dt * dt;
              if (y < 0.05) continue;
              const p0 = c.fly.p0, tw = 0.6 + 0.4 * Math.sin(dt * 50 + k);
              glows.add(p0[0] + Math.cos(a) * sp * dt, y, p0[2] + Math.sin(a) * sp * dt, 0.16, 2.4 * tw, 2.5 * tw, 2.6 * tw);
            }
          }
          continue;
        }
        const L = c.parked ? null : LANES[c.lane];
        const x = c.parked ? c.x0 : laneX(L, c.x0, v);
        const z = c.parked ? c.z : L.z;
        const yaw = c.parked ? c.yaw : L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        // a jolt as the near blasts go by
        let jy = 0;
        for (const np of [2, 4, 5]) { const t = v - vPunch(np) - Math.hypot(x, z) / 340; if (t > 0 && t < 0.6) jy += Math.exp(-t / 0.15) * Math.sin(t * 30) * 0.05 * (np - 1) / Math.max(1, Math.hypot(x, z) / 15); }
        e.set(jy * 0.4, yaw, jy * 0.6); q.setFromEuler(e);
        m4.compose(pos.set(x, Math.max(0, jy), z), q, sc.set(1, 1, 1));
        fleet.set(i, m4, true);
        // hazard lights blinking after the first blasts (car alarms)
        if (v > vPunch(4) + 0.3 + c.seed && Math.sin(v * 9 + c.seed * 6) > 0.2 && Math.hypot(x, z) < 120) {
          const cy = Math.cos(yaw), sy = Math.sin(yaw);
          for (const sx2 of [-0.7, 0.7]) glows.add(x + sx2 * cy - 2.3 * sy, 0.75, z - sx2 * sy - 2.3 * cy, 0.5, 2.2, 1.2, 0.2);
        }
      }
      fleet.commit();
      // ---- the bus ----
      {
        const L = LANES[2];
        const bx = laneX(L, BUS.x0, v);
        const f = busFlip(v);
        busG.visible = v < 30;
        busG.position.set(bx, 0, BUS.z);
        busG.rotation.set(0, 0, 0);
        if (f) {
          // roll about the bus's north bottom edge (it goes over away from you), sliding north
          const pivotZ = BUS.z - BUS.w / 2;
          busG.position.set(bx, f.lift * 0.3, pivotZ - f.slide);
          busG.rotation.set(-f.roll, 0, 0);
          // shift so the rotation is about that edge: the body's own frame has its centre line at z = 0
          const off = new THREE.Vector3(0, 0, BUS.w / 2).applyEuler(busG.rotation);
          busG.position.add(off);
          // the far blasts throw it again
          const t7 = v - (vPunch(7) + 0.12);
          if (t7 > 0) busG.position.add(pos.set(0, Math.max(0, 9 * t7 - 4.9 * t7 * t7), -Math.min(t7, 2.2) * 20));
        }
      }
      // ---- palms and lamps: sway as the blasts go by, snap and fly when one reaches them ----
      const tw = (x, z, v0) => { let a = 0; for (const np of [2, 3, 4, 5, 6]) { const t = v - vPunch(np) - Math.hypot(x, z) / 340; if (t > 0 && t < 2) a += Math.exp(-t / 0.5) * Math.sin(t * 9) * 0.04 * (np - 1) / Math.max(1, Math.hypot(x, z) / 20); } return a; };
      PALMS.forEach((t, i) => {
        if (v > 30) { trunks.setMatrixAt(i, HIDE); fronds.setMatrixAt(i, HIDE); return; }
        const down = v > t.vDown ? smooth(0, 0.7, v - t.vDown) : 0;
        if (down >= 1 && v > t.vDown + 6) { trunks.setMatrixAt(i, HIDE); fronds.setMatrixAt(i, HIDE); return; }
        const sw = tw(t.x, t.z) + 0.015 * Math.sin(v * 1.1 + t.seed * 9);
        const fall = down * 1.45;
        const dl = Math.hypot(t.x, t.z) || 1;
        e.set(sw - fall * (-t.z / dl), 0, sw * 0.6 + fall * (t.x / dl) * -1, 'XYZ'); q.setFromEuler(e);
        m4.compose(pos.set(t.x, 0, t.z), q, sc.set(1, t.h, 1));
        trunks.setMatrixAt(i, m4);
        mA.compose(pos.set(0, 0, 0), q, sc.set(1, 1, 1));
        const top = new THREE.Vector3(0, t.h, 0).applyQuaternion(q);
        e.set(0, t.seed * 6, 0); const q2 = new THREE.Quaternion().setFromEuler(e);
        m4.compose(pos.set(t.x + top.x, top.y, t.z + top.z), q.clone().multiply(q2), sc.set(1, 1, 1));
        fronds.setMatrixAt(i, m4);
      });
      trunks.instanceMatrix.needsUpdate = true; fronds.instanceMatrix.needsUpdate = true;
      if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
      LAMPS.forEach((l, i) => {
        if (v > 30 || v > l.vDown + 5) { lampPole.setMatrixAt(i, HIDE); lampArm.setMatrixAt(i, HIDE); return; }
        const down = v > l.vDown ? smooth(0, 0.5, v - l.vDown) * 1.5 : 0;
        const sw = tw(l.x, l.z);
        e.set(sw - down, l.side > 0 ? Math.PI : 0, 0); q.setFromEuler(e);
        m4.compose(pos.set(l.x, 0, l.z), q, sc.set(1, 1, 1));
        lampPole.setMatrixAt(i, m4); lampArm.setMatrixAt(i, m4);
      });
      lampPole.instanceMatrix.needsUpdate = true; lampArm.instanceMatrix.needsUpdate = true;
      // ---- people: walking, turning to look at the wall, running; knocked flat when a blast reaches them ----
      if (camY < 2000 && v < 30) {
        PEOPLE.forEach((p, i) => {
          const px = personX(p, v);
          const yaw = px.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          let pitch = 0, x = px.x, z = p.z, stride = lerp(1, 1.6, px.run), look = 0, armL = 0, armR = p.phone && px.run < 0.5 ? 1 : 0;
          const walk = p.ph + px.dist / (px.run > 0.5 ? 1.45 : 0.75) * Math.PI;
          if (px.run > 0) { armL = Math.max(armL, 0.3 * px.run); }
          const kd = v - p.vKnock;
          if (kd > 0) {
            // knocked over backwards (away from the blast), skidding a little
            const k = smooth(0, 0.35, kd);
            const dx = x - IMP.x, dz = z - IMP.z, dl = Math.hypot(dx, dz) || 1;
            const slide = 2.5 * (1 - Math.exp(-kd / 0.3));
            x = personX(p, p.vKnock).x + dx / dl * slide; z = z + dz / dl * slide;
            const yawK = Math.atan2(-dx, -dz);
            crowd.pose(i, { x, y: 0, z, yaw: yawK, s: p.s, walk: 0, stride: 0, pitch: -1.5 * k, armL: 1.3 * k, armR: 1.3 * k });
            return;
          }
          crowd.pose(i, { x, y: 0, z, yaw, s: p.s, walk, stride, pitch, look, armL, armR });
        });
        crowd.commit();
      }
    },
  };
}

function mergeAll(gs) {
  let n = 0;
  for (const g of gs) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const g of gs) {
    g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setIndex(idx);
  return out;
}
