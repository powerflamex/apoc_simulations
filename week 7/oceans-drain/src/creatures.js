// The animals left behind: fish flopping on the wet sand, crabs running, kelp lying flat, humpback whales the size of buses.
import * as THREE from 'three';
import { paint, place, ball, box, merge, propMaterial } from './build.js';
import { rng, clamp, lerp, smooth, wobble } from './util.js';

const tc = new THREE.Color();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();

// ---- fish: silver, on their sides, flipping and arching ----
export function makeFish(parent, list) {
  // (a fish lying on its side: long in x, flat in y)
  const body = new THREE.SphereGeometry(1, 14, 8).scale(0.5, 0.07, 0.17);
  { // blue-grey back (one edge), silver flank, white belly (the other edge)
    const n = body.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const z = body.attributes.position.getZ(i) / 0.17;
      tc.set(z > 0.35 ? 0x34506e : z > -0.3 ? 0xb9c6cf : 0xf2f4f2);
      a[i * 3] = tc.r; a[i * 3 + 1] = tc.g; a[i * 3 + 2] = tc.b;
    }
    body.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  const tail = place(paint(new THREE.ConeGeometry(0.2, 0.26, 3, 1).scale(1, 1, 0.12), 0x40566e), -0.6, 0, 0, Math.PI / 2, 0, -Math.PI / 2);
  const fin = place(paint(new THREE.ConeGeometry(0.07, 0.2, 3, 1).scale(1, 1, 0.2), 0x40566e), 0.05, 0, 0.2, Math.PI / 2, 0, 0);
  const geo = merge([body.toNonIndexed(), tail, fin]);
  const mat = propMaterial({ rough: 0.25, metal: 0.55, gloss: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  parent.add(mesh);
  return {
    mesh,
    frame(v, h) {
      list.forEach((f, i) => {
        // bursts of flopping, then lying still, gasping
        const t = v * 1.0 + f.ph;
        const burst = Math.pow(0.5 + 0.5 * Math.sin(t * 2.1 + 3 * Math.sin(t * 0.7)), 2.0);
        const flip = Math.sin(t * 17) * burst;   // (bigger fish close to you: they must read as fish)
        const hop = Math.abs(Math.sin(t * 17)) * 0.2 * burst * f.s;
        e.set(flip * 1.25, f.yaw + 0.5 * Math.sin(t * 8.5) * burst, flip * 0.25, 'YXZ');
        q.setFromEuler(e);
        m4.compose(p3.set(f.x + 0.15 * Math.sin(t * 1.3) * burst, h(f.x, f.z) + 0.07 * f.s + hop, f.z), q, s3.setScalar(f.s));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- crabs: red, running sideways across the sand ----
export function makeCrabs(parent, list) {
  const parts = [ball(1, 0xd8452a, 0, 0.5, 0, 0.62, 0.26, 0.46, 10)];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = -0.3 + k * 0.2;
      parts.push(box(0.5, 0.07, 0.07, 0xc23a22, sx * 0.72, 0.5, z, 0, 0, sx * -0.5), box(0.07, 0.5, 0.07, 0xb8341e, sx * 0.98, 0.25, z, 0, 0, sx * 0.2));
    }
    parts.push(box(0.34, 0.1, 0.1, 0xd8452a, sx * 0.42, 0.5, 0.55, 0, sx * 0.9, 0), ball(0.17, 0xe8603a, sx * 0.3, 0.52, 0.74, 1.2, 0.7, 1, 8));
    parts.push(ball(0.05, 0x111111, sx * 0.16, 0.74, 0.4, 1, 1, 1, 6));
  }
  const geo = merge(parts);
  const mesh = new THREE.InstancedMesh(geo, propMaterial({ rough: 0.4, gloss: 0.6 }), list.length);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  parent.add(mesh);
  return {
    mesh,
    frame(v, h) {
      list.forEach((c, i) => {
        const d = c.sp * (v - c.t0);
        const x = c.x + Math.cos(c.dir) * d, z = c.z - Math.sin(c.dir) * d;
        // (a crab faces across the way it runs; its body rocks as the legs go)
        e.set(0.1 * Math.sin(v * 31 + c.ph), c.dir + Math.PI / 2, 0.14 * Math.sin(v * 27 + c.ph), 'YXZ');
        q.setFromEuler(e);
        m4.compose(p3.set(x, h(x, z) + 0.02 * Math.abs(Math.sin(v * 29 + c.ph)), z), q, s3.setScalar(c.s));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- giant kelp lying flat: long olive-gold ribbons with a rib and little floats ----
export function makeKelp(parent, list, h) {
  const SEG = 14, Lk = 9;
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG, x = t * Lk, wz = 0.5 * Math.sin(t * 7.0) + 0.25 * Math.sin(t * 17.0), w = 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.06)) + 0.06;
    for (const sd of [-1, 0, 1]) {
      pos.push(x, 0.05 + 0.05 * Math.sin(t * 23 + sd * 2) + (sd === 0 ? 0.05 : 0), wz + sd * w);
      tc.set(sd === 0 ? 0x3a3410 : (j % 2 ? 0x5f6a1c : 0x4d5a18));
      col.push(tc.r, tc.g, tc.b);
    }
  }
  for (let j = 0; j < SEG; j++) for (let k = 0; k < 2; k++) { const a = j * 3 + k, b = a + 1, c = a + 3, d = c + 1; idx.push(a, b, c, b, d, c); }
  let ribbon = new THREE.BufferGeometry();
  ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ribbon.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ribbon.setIndex(idx);
  ribbon.computeVertexNormals();
  ribbon = ribbon.toNonIndexed();
  ribbon.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ribbon.attributes.position.count * 2), 2));
  const floats = [];
  for (let j = 1; j < SEG; j += 2) { const t = j / SEG; floats.push(ball(0.07, 0x8a8226, t * Lk, 0.1, 0.5 * Math.sin(t * 7.0) + 0.25 * Math.sin(t * 17.0) + (j % 4 === 1 ? 0.3 : -0.3), 1.5, 0.8, 1, 6)); }
  const geo = merge([ribbon, ...floats]);
  const mesh = new THREE.InstancedMesh(geo, propMaterial({ rough: 0.5, gloss: 0.3, side: THREE.DoubleSide }), list.length);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  list.forEach((k, i) => {
    e.set(k.pitch || 0, k.yaw, 0, 'YXZ'); q.setFromEuler(e);
    m4.compose(p3.set(k.x, (k.y ?? h(k.x, k.z)) + 0.02, k.z), q, s3.set(k.s, 1, k.s * (k.w || 1)));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, tc.setScalar(0.8 + 0.4 * ((i * 0.618) % 1)));
  });
  parent.add(mesh);
  return mesh;
}

// ---- a humpback whale, lying on its belly: a lofted body (dark back, pale grooved throat), long knobbly flippers,
//      and a tail that still lifts and slaps down. About 14.5 m long (a city bus is 12 m). The head is at +x. ----
const PROF = [[0, 0.3, 0.42], [0.03, 0.62, 0.8], [0.1, 1.05, 1.25], [0.22, 1.48, 1.6], [0.36, 1.66, 1.72], [0.5, 1.56, 1.55], [0.64, 1.2, 1.08], [0.76, 0.82, 0.58], [0.87, 0.5, 0.3], [0.94, 0.36, 0.2], [1.0, 0.3, 0.17]];
function prof(u) {
  let i = 0;
  while (i < PROF.length - 2 && u > PROF[i + 1][0]) i++;
  const [a, ha, wa] = PROF[i], [b, hb, wb] = PROF[i + 1], k = smooth(a, b, u);
  return [lerp(ha, hb, k), lerp(wa, wb, k)];
}
export function whaleGeo(L = 14.5) {
  const NU = 46, NR = 22, U1 = 0.68;      // (the rear third, the tail stock and the flukes, is its own piece: it lifts)
  const build = (uA, uB, nu) => {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= nu; i++) {
      const u = lerp(uA, uB, i / nu), [hh, hw] = prof(u);
      const x = (0.5 - u) * L;
      for (let k = 0; k <= NR; k++) {
        const ph = (k / NR) * Math.PI * 2;          // 0 = right side, PI/2 = top
        const sn = Math.sin(ph), cs = Math.cos(ph);
        // lying on the sand: the belly flattened and spread
        const y = sn > 0 ? hh * sn : hh * 0.78 * sn;
        const z = hw * cs * (1 + 0.12 * Math.max(0, -sn));
        pos.push(x, y + hh * 0.78, z);
        const under = -sn;                              // 1 = belly
        const groove = u < 0.52 && under > -0.12 && u > 0.02;
        let c;
        if (groove) c = (k % 2 ? 0xe6e2d8 : 0x7d7b78);
        else if (under > 0.1) c = 0xd8d4cc;
        else c = sn > 0.45 ? 0x33404c : 0x445463;
        if (u < 0.2 && Math.abs(sn + 0.02) < 0.09) c = 0x14181c;     // the mouth line
        tc.set(c); col.push(tc.r, tc.g, tc.b);
      }
    }
    for (let i = 0; i < nu; i++) for (let k = 0; k < NR; k++) { const a = i * (NR + 1) + k, b = a + 1, c = a + NR + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ng = g.toNonIndexed();
    ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    return ng;
  };
  const parts = [build(0, U1, NU)];
  // knobs on the head, an eye each side, the small dorsal fin, the flippers (a third of the body long, white edged)
  const R = rng(77);
  for (let k = 0; k < 16; k++) { const u = 0.02 + R() * 0.13, [hh, hw] = prof(u), a = (R() - 0.5) * 1.6; parts.push(ball(0.11, 0x333c45, (0.5 - u) * L, hh * 0.78 + hh * Math.cos(a) * 0.97, hw * Math.sin(a) * 0.97, 1, 0.7, 1, 6)); }
  for (const sd of [-1, 1]) {
    { const u = 0.17, [hh, hw] = prof(u); parts.push(ball(0.09, 0x0c0d0e, (0.5 - u) * L, hh * 0.78 - 0.05, sd * hw * 0.99, 1, 1, 0.6, 8)); }
    // the flipper: splayed out on the sand
    const fl = new THREE.SphereGeometry(1, 12, 8).scale(2.5, 0.13, 0.55);
    const n = fl.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const fx = fl.attributes.position.getX(i), fz = fl.attributes.position.getZ(i); tc.set(Math.abs(fz) > 0.34 || fx > 1.9 ? 0xdedbd4 : 0x3a444e); a[i * 3] = tc.r; a[i * 3 + 1] = tc.g; a[i * 3 + 2] = tc.b; }
    fl.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(place(fl.toNonIndexed(), (0.5 - 0.3) * L - 1.3, 0.28, sd * 3.2, 0, sd * -1.15, sd * 0.06));
  }
  parts.push(place(paint(new THREE.ConeGeometry(0.5, 0.55, 8).scale(1.5, 1, 0.35), 0x2b343d), (0.5 - 0.66) * L, prof(0.66)[0] * 1.78 + 0.12, 0, 0, 0, 0.5));
  const body = merge(parts);
  // the tail: stock and flukes, hinged at its front end (the origin)
  const stock = build(U1, 1.0, 14);
  stock.translate(-(0.5 - U1) * L, -prof(U1)[0] * 0.78, 0);
  const sh = new THREE.Shape();
  sh.moveTo(0.4, 0); sh.quadraticCurveTo(-0.2, 1.0, -1.5, 2.7); sh.quadraticCurveTo(-1.0, 1.2, -0.75, 0.25); sh.lineTo(-0.55, 0);
  sh.lineTo(-0.75, -0.25); sh.quadraticCurveTo(-1.0, -1.2, -1.5, -2.7); sh.quadraticCurveTo(-0.2, -1.0, 0.4, 0);
  const fluke = paint(new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 10 }), 0x2b343d);
  fluke.scale(1.25, 1.25, 1); fluke.rotateX(Math.PI / 2); fluke.translate(-(1 - U1) * L + 0.2, (prof(1)[0] - prof(U1)[0]) * 0.78, 0);
  const tail = merge([stock, fluke]);
  return { body, tail, hingeX: (0.5 - U1) * L, hingeY: prof(U1)[0] * 0.78, L };
}
export function makeWhales(parent, list, h) {
  const g = whaleGeo();
  const mat = propMaterial({ rough: 0.5, gloss: 0.35 });
  const whales = list.map((w) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(g.body, mat), tail = new THREE.Mesh(g.tail, mat);
    tail.position.set(g.hingeX, g.hingeY, 0);
    for (const m of [body, tail]) { m.castShadow = true; m.receiveShadow = true; }
    grp.add(body, tail);
    grp.position.set(w.x, h(w.x, w.z) - 0.12, w.z);
    grp.rotation.set(w.roll || 0, w.yaw, 0, 'YXZ');
    grp.scale.setScalar(w.s || 1);
    parent.add(grp);
    return { w, grp, tail };
  });
  return {
    whales,
    frame(v) {
      for (const { w, tail } of whales) {
        // the tail lifts slowly and slaps down, again and again
        const t = (v * 0.42 + w.ph) % 1;
        const up = t < 0.6 ? smooth(0, 0.6, t) : 1 - smooth(0.6, 0.72, t);
        tail.rotation.z = -(0.02 + 0.3 * up * (w.lift ?? 1));
      }
    },
  };
}
