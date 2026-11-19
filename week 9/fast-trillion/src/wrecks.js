// What you go through, close up (you are unharmed; only your speed changes). Each one: seen coming, the hit, then the
// camera swings round to look back at what is left. Energies: the drag on you, F = 1/2 rho CdA v^2, is the energy you
// dump per metre, in whatever you're passing through.
//   A container ship broadside across your path at 0:12.3 (5.3 km/s, running upright, CdA 0.7 m^2): across its 51 m
//     beam (~12,000 kg of hull, cargo and ballast per m^2 of your path) that's ~1.2e11 J = ~30 tons of TNT, inside the
//     hull at the waterline: it breaks the ship's back (a 300 kg torpedo warhead under the keel is enough), the middle
//     of the deck load is thrown 100+ m; the ship itself (100,000 t) only breaks in two and sags.
//   A coastal city at 0:17.8-0:18.4 (33-45 km/s, flying head first, CdA 0.15). Through a 330 m tower's foot (~42 m of
//     floors and core at ~150-300 kg/m^3): ~150-300 t of TNT (200 t at 200 kg/m^3); it drops into its own fireball. Your wake through the air is a
//     line charge of ~29 kg of TNT per metre: >10 psi within ~40 m of your path (blocks collapse), ~5 psi at 60 m (walls
//     blown in), ~2 psi at 130 m (windows), arriving r / 343 s after you pass: a strip of flattened blocks behind you.
//   A mountain at 0:20.1 (106 km/s): ~9.1 km of rock (2,700 kg/m^3) along your path through its foot: ~2.1e16 J =
//     ~5 megatons along a channel 1-3 km under its flanks. Like a deep cratering shot: fire jets out of both ends of the
//     channel at once, the slopes crack, and the summit is heaved up (~100-300 m/s) and blown apart.
import * as THREE from 'three';
import { distAt, speedAt, tPass, R_EARTH, P0, PSI, CS } from './timeline.js';
import { SEA_Y, hh } from './avenue.js';
import { SU } from './surface.js';
import { seaMat, windowTex } from './things.js';
import { makeSmoke } from './smoke.js';
import { smooth, clamp } from './util.js';

const G = 9.81;
// overpressure (psi) at r metres from your path when you passed at vel, flying head first
export function psiFly(vel, r) {
  const E = 0.5 * 1.2 * 0.15 * vel * vel, x = Math.sqrt(E / P0) / Math.max(r, 0.2);
  return (0.25 * Math.pow(x, 0.75) + 0.6 * x * x) * P0 / PSI;
}

// ---- the container ship: 366 m long, 51 m beam, broadside across your path; you hit it 40 m from its middle ----
export const SHIP = { s: 15900, beam: 51, cx: 40, L1: 143, L2: 223 };
export const T_SHIP = tPass(SHIP.s);
// ---- the coastal city (91.5-112 km) and the tower in your path ----
export const TOWER = { s: 98000, h: 330, w: 42 };
export const T_TOWER = tPass(TOWER.s - TOWER.w / 2);
const BLDG = [];
{
  const add = (x, s, w, h, seed) => {
    const tp = tPass(s), vel = speedAt(tp), r = Math.abs(x) - w / 2;
    const psi = psiFly(vel, r);
    BLDG.push({ x, s, w, h, seed, tHit: tp + r / CS, psi, keep: psi > 10 ? 0.08 : psi > 5 ? 0.35 : 1, dark: psi > 2 ? 1 : 0 });
  };
  // the blocks lining your path (you fly down the main street) ...
  for (let k = 0; k < 280; k++) {
    const s = 92000 + k * 68 + 20 * hh(k, 300);
    const down = Math.exp(-Math.pow((s - 99000) / 6000, 2));
    for (const side of [-1, 1]) {
      const w = 24 + 22 * hh(k, 301 + side);
      add(side * (30 + w / 2 + 14 * hh(k, 303 + side)), s, w, 16 + (30 + 150 * down) * Math.pow(hh(k, 305 + side), 1.3), k * 2 + (side > 0 ? 1 : 0));
    }
  }
  // ... and the city round it
  for (let i = 0; i < 420; i++) {
    const side = hh(i, 201) < 0.5 ? -1 : 1, w = 24 + 34 * hh(i, 202);
    const s = 91500 + 21000 * hh(i, 204), down = Math.exp(-Math.pow((s - 99000) / 7000, 2));
    add(side * (110 + w / 2 + 900 * Math.pow(hh(i, 203), 1.6)), s, w, 15 + (40 + 210 * down) * Math.pow(hh(i, 205), 1.6), 1000 + i);
  }
}
// ---- the mountain in your path, and the range round it ----
export const MTN = { s: 240000, h: 3800, r: 4600 };
export const T_MTN = tPass(MTN.s - MTN.r * 0.894);       // (the cone's foot facing you is 0.894 r out: see the ridges below)
const PEAKS = [];
for (let i = 0; i < 80; i++) {
  const side = i % 2 ? 1 : -1, h = 1600 + 2800 * hh(i, 93), r = h * (0.85 + 0.45 * hh(i, 94));
  const s = 212000 + 418000 * hh(i, 91), x = side * (1.3 * r + 250 + 2200 * hh(i, 92));
  if (Math.abs(s - MTN.s) < 9000 && Math.abs(x) < 9000) continue;
  // (none close beside you just after the hit, while the camera swings round: they'd whip past one a frame and strobe)
  if (s > MTN.s - 4000 && s < 345000 && Math.abs(x) < 40000) continue;
  PEAKS.push({ s, x, h, r });
}
export const HITS = [{ t: T_SHIP, k: 0.7 }, { t: T_TOWER, k: 0.9 }, { t: T_MTN, k: 1.25 }];
// a hard white hit as you punch through (and the camera behind you goes through the same hole)
export function hitFlash(v) {
  let f = 0;
  for (const h of HITS) { const d = v - h.t; if (d > -0.03 && d < 0.5) f = Math.max(f, smooth(-0.03, 0, d) * Math.exp(-Math.max(d, 0) / 0.07) * h.k); }
  return f;
}

const NOISE = /* glsl */ `
  float wh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
`;
// a ridged cone with snow on top (height 1, radius 1, base at y = -0.5)
function peakGeo() {
  const g = new THREE.ConeGeometry(1, 1, 64, 16, true);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5, z = p.getZ(i), a = Math.atan2(z, x);
    const ridge = 1 + 0.3 * Math.abs(Math.sin(a * 4 + 0.5)) - 0.15 + 0.1 * Math.sin(a * 11 + y * 6);
    p.setXYZ(i, x * ridge, y - 0.5, z * ridge);
    const snow = y > 0.62 ? 1 : y > 0.5 ? (y - 0.5) / 0.12 : 0;
    const rock = [0.36, 0.33, 0.3], sn = [0.95, 0.96, 1.0];
    col.set(rock.map((r, j) => r + (sn[j] - r) * snow), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
// the mountain you go through: its top heaves up and splits, glowing cracks run up its slopes from your channel
function burstMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true });
  m.userData.uAge = { value: -1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAge = m.userData.uAge; sh.uniforms.uHaze = SU.uHaze; sh.uniforms.uHazeD = SU.uHazeD;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAge; varying vec3 vLoc; varying vec3 vTW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position;
        if (uAge > 0.0) {
          float yn = position.y + 0.5;
          float top = smoothstep(0.4, 0.92, yn);
          float hn = fract(sin(dot(floor(position.xz * 7.0) + floor(position.y * 5.0), vec2(12.9898, 78.233))) * 43758.5453);
          float k = 1.0 - exp(-uAge / 0.75);
          transformed.y += top * k * (0.05 + 0.09 * hn);
          transformed.xz *= 1.0 + top * k * (0.04 + 0.14 * hn);
        }`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uAge; uniform vec3 uHaze; uniform float uHazeD; varying vec3 vLoc; varying vec3 vTW;\n${NOISE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uAge > 0.0) {
          float yn = vLoc.y + 0.5;
          float reach = 0.06 + 0.92 * smoothstep(0.0, 1.4, uAge);
          vec2 q = vec2(atan(vLoc.z, vLoc.x) * 4.0, yn * 7.0);
          float n = wn(q * 1.7) * 0.6 + wn(q * 4.3 + 3.0) * 0.4;
          float line = 1.0 - smoothstep(0.0, 0.03 + 0.03 * (1.0 - yn), abs(n - 0.5));
          float on = 1.0 - smoothstep(reach - 0.12, reach, yn);
          totalEmissiveRadiance += vec3(2.6, 0.75, 0.12) * line * on * (0.5 + 0.7 * (1.0 - yn));
          diffuseColor.rgb *= 1.0 - 0.45 * on * smoothstep(0.0, 0.6, uAge);
        }`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vTW - cameraPosition) / (uHazeD * 2.5)));`);
  };
  m.customProgramCacheKey = () => 'burst-mountain';
  return m;
}

export function makeWrecks(scene) {
  const all = [];
  const add = (o, parent = scene) => { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; parent.add(o); all.push(o); return o; };
  const fx = makeSmoke(scene, 2600);
  all.push(fx.mesh);
  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (S, s) => { const d = s - S; return { z: -d, drop: (d * d) / (2 * R_EARTH), d }; };

  // ---------- the ship ----------
  const ship = add(new THREE.Group());
  const halves = [new THREE.Group(), new THREE.Group()];
  halves.forEach((h) => ship.add(h));
  {
    const hullM = seaMat(0x1d3557, 0.6), stripe = seaMat(0xa5281e, 0.7), deck = seaMat(0x3a3f44, 0.8);
    [[-SHIP.L1, 0], [0, SHIP.L2]].forEach(([x0, x1], i) => {
      const L = x1 - x0, xc = (x0 + x1) / 2;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(L, 26, SHIP.beam).translate(xc, 1, 0), hullM);
      const bs = new THREE.Mesh(new THREE.BoxGeometry(L, 3, SHIP.beam + 0.4).translate(xc, -0.5, 0), stripe);
      const dk = new THREE.Mesh(new THREE.BoxGeometry(L, 0.6, SHIP.beam - 1).translate(xc, 14.2, 0), deck);
      halves[i].add(hull, bs, dk);
    });
    const wt = windowTex(10, 9, 0.5); wt.repeat.set(2, 1);
    const house = new THREE.Mesh(new THREE.BoxGeometry(26, 36, 46).translate(SHIP.L2 - 52, 32, 0), seaMat(0xf2f2ee, 0.5, { map: wt }));
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 16, 14).translate(SHIP.L2 - 30, 22, 0), seaMat(0x23282e, 0.6));
    halves[1].add(house, funnel);
    halves.forEach((h) => h.traverse((o) => { o.frustumCulled = false; }));
  }
  // the deck load: 40 ft containers, 7 high, 19 across, in bays along the ship
  const CONT = [];
  for (let x = -SHIP.L1 + 8; x < SHIP.L2 - 10; x += 12.7) {
    if (x > SHIP.L2 - 70 && x < SHIP.L2 - 18) continue;
    const ends = Math.min(x + SHIP.L1, SHIP.L2 - x);
    const tiers = ends < 30 ? 4 : ends < 60 ? 6 : 7;
    for (let row = 0; row < 19; row++) for (let tier = 0; tier < tiers; tier++) {
      const k = CONT.length;
      CONT.push({ x, y: 14.5 + 1.3 + tier * 2.62, z: -22.5 + row * 2.5, half: x < 0 ? 0 : 1, r1: hh(k, 401), r2: hh(k, 402), r3: hh(k, 403) });
    }
  }
  const cont = add(new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.44), seaMat(0xffffff, 0.75), CONT.length), ship);
  const CCOL = [0xb03a2e, 0x2e5e9c, 0x2f7d4f, 0xd98b2b, 0xe8e6df, 0x7a7f86, 0x6e2c3a, 0x1f6f78, 0xc9b23c];
  CONT.forEach((ct, i) => cont.setColorAt(i, c.set(CCOL[Math.floor(ct.r1 * CCOL.length)]).offsetHSL(0, 0, (ct.r2 - 0.5) * 0.08)));
  const halfM = [new THREE.Matrix4(), new THREE.Matrix4()];
  let shipStatic = false;

  // ---------- the city ----------
  const bT = windowTex(8, 26, 0.45);
  const blds = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), seaMat(0xffffff, 0.55, { map: bT }), BLDG.length));
  const BCOL = BLDG.map((b) => new THREE.Color().setHSL(0.08 + 0.5 * hh(b.seed, 207), 0.1 + 0.08 * hh(b.seed, 208), 0.5 + 0.25 * hh(b.seed, 209)));
  const tower = add(new THREE.Group());
  {
    const tT = windowTex(10, 70, 0.4);
    tower.add(new THREE.Mesh(new THREE.BoxGeometry(TOWER.w, TOWER.h, TOWER.w).translate(0, TOWER.h / 2, 0), seaMat(0xb9cde0, 0.3, { map: tT, metalness: 0.25 })));
    tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 60, 8).translate(0, TOWER.h + 30, 0), seaMat(0xd0d4d8, 0.4)));
    tower.traverse((o) => { o.frustumCulled = false; });
  }
  const NDEB = 160;
  const deb = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), seaMat(0x8a8580, 0.9), NDEB));

  // ---------- the mountains ----------
  const pg = peakGeo();
  const mtn = add(new THREE.Mesh(pg, burstMat()));
  const peaks = add(new THREE.InstancedMesh(pg, seaMat(0xffffff, 0.9, { vertexColors: true }), PEAKS.length));
  const NROCK = 90;
  const rocks = add(new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), seaMat(0x4a4440, 0.95), NROCK));

  return {
    all,
    frame(v, S, on, light = 1) {
      const vis = { ship: on && v > 10.2 && v < 14.6, city: on && v > 16.2 && v < 19.9, mtn: on && v > 18.6 && v < 23.0 };
      ship.visible = cont.visible = vis.ship;
      blds.visible = tower.visible = deb.visible = vis.city;
      mtn.visible = peaks.visible = rocks.visible = vis.mtn;
      fx.mat.uniforms.uTime.value = v; fx.mat.uniforms.uLight.value.setRGB(light, light, light);
      fx.begin();
      // ======== the ship ========
      if (vis.ship) {
        const P = place(S, SHIP.s + SHIP.beam / 2);
        ship.position.set(0, SEA_Y - P.drop, P.z);
        const a = v - T_SHIP;
        // its back broken: both halves sag about the keel where you went through, and drift apart
        const th = a > 0 ? 0.13 * (1 - Math.exp(-a / 0.6)) : 0, sep = a > 0 ? 12 * (1 - Math.exp(-a / 0.5)) : 0, sink = a > 0 ? 6 * (1 - Math.exp(-a / 0.7)) : 0;
        [-1, 1].forEach((sd, i) => {
          const h = halves[i];
          // (each half turns about the break at the waterline, so its far end lifts: the ship folds into a V)
          h.position.set(sd * sep, -sink, 0); h.rotation.set(0, 0, sd * th);
          h.updateMatrix(); halfM[i].copy(h.matrix);
        });
        if (a > 0 || !shipStatic) {
          CONT.forEach((ct, i) => {
            const f = 1 - Math.abs(ct.x) / 46;
            if (a > 0 && f > 0) {
              // thrown by the blast inside the hull
              const vx = Math.sign(ct.x || 1) * (20 + 70 * f) * (0.5 + ct.r1), vy = (25 + 105 * f) * (0.35 + 0.65 * ct.r2) * (0.7 + 0.03 * (ct.y - 14)), vz = (ct.r3 - 0.5) * 70;
              const t = Math.min(a, 6);
              const y = Math.max(-1.5, ct.y + vy * t - 0.5 * G * t * t);
              e.set(ct.r1 * 6 + t * 3 * f, ct.r2 * 6 + t * 2.5 * f, ct.r3 * 6 + t * 4 * f); q.setFromEuler(e);
              cont.setMatrixAt(i, m4.compose(p.set(ct.x + vx * t, y, ct.z + vz * t), q, sc.set(1, 1, 1)));
            } else {
              m5.makeTranslation(ct.x, ct.y, ct.z);
              cont.setMatrixAt(i, m4.multiplyMatrices(halfM[ct.half], m5));
            }
          });
          cont.instanceMatrix.needsUpdate = true;
          shipStatic = a <= 0;
        }
        if (a > -0.02) {
          const z0 = P.z, y0 = SEA_Y - P.drop;
          // the fireball out of the hull, turning to black smoke that climbs
          for (let k = 0; k < 34; k++) {
            const r1 = hh(k, 410), r2 = hh(k, 411), r3 = hh(k, 412);
            const R = 52 * (1 - Math.exp(-Math.max(a, 0) / 0.1)) + 14 * Math.max(a, 0);
            const glow = 2.4 * Math.exp(-Math.max(a, 0) / 0.4) + 0.3 * Math.exp(-Math.max(a, 0) / 2);
            fx.puff((r1 - 0.5) * 2 * R * 0.9, y0 + 8 + (r2 - 0.25) * R * 0.9 + 22 * Math.max(a, 0), z0 + (r3 - 0.5) * 2 * R * 0.7,
              14 + 26 * r2 + 0.45 * R, 0.9 * smooth(-0.02, 0.02, a), 0.1 + 0.08 * r3, glow * (0.6 + 0.4 * r1), k * 1.7);
          }
          // the sea thrown up both sides of the hull where it broke
          for (let k = 0; k < 22; k++) {
            const r1 = hh(k, 420), r2 = hh(k, 421), sd = k % 2 ? 1 : -1;
            const ag = Math.max(a - 0.03, 0), up = 95 * (1 - Math.exp(-ag / 0.45)) * (0.4 + 0.6 * r2);
            fx.puff((r1 - 0.5) * 70, y0 + up * (0.3 + 0.7 * r1), z0 + sd * (30 + 20 * r2 * (1 - Math.exp(-ag / 0.5))), 16 + 24 * r1 + 18 * (1 - Math.exp(-ag / 0.6)),
              0.75 * smooth(0, 0.08, ag) * (1 - smooth(2.5, 4.5, ag)), 0.95, 0, 30 + k);
          }
        }
      }
      // ======== the city ========
      if (vis.city) {
        BLDG.forEach((b, i) => {
          const P = place(S, b.s);
          if (P.d > 70000 || P.d < -60000) { blds.setMatrixAt(i, zero); return; }
          const a = v - b.tHit;
          const hf = a > 0 ? 1 - (1 - b.keep) * smooth(0, 1.3, a) : 1;
          const lean = a > 0 && b.keep < 1 ? (hh(b.seed, 210) - 0.5) * 0.35 * smooth(0, 1.3, a) : 0;
          e.set(0, 0, lean); q.setFromEuler(e);
          blds.setMatrixAt(i, m4.compose(p.set(b.x, SEA_Y + 1.5 - P.drop, P.z), q, sc.set(b.w, b.h * hf, b.w)));
          blds.setColorAt(i, c.copy(BCOL[i]).multiplyScalar(a > 0 && b.dark ? 1 - 0.55 * smooth(0, 0.25, a) : 1));
          // dust and fire out of the blocks that come down
          if (a > 0 && b.keep < 1 && P.d > -40000) {
            // (it comes down in a few seconds: the dust boils out and up to about its own height, fire at its foot)
            const grow = 1 - Math.exp(-a / 0.4);
            const fire = b.psi > 10 ? 1 : 0.45;
            for (let k = 0; k < 3; k++) {
              const r1 = hh(b.seed, 220 + k), r2 = hh(b.seed, 230 + k);
              fx.puff(b.x + (r1 - 0.5) * b.w + Math.sign(b.x) * 25 * grow * k, SEA_Y - P.drop + 8 + (0.12 + 0.3 * k) * Math.max(b.h, 60) * grow, P.z + (r2 - 0.5) * b.w * 1.5,
                0.6 * b.w + (22 + 34 * r2) * grow, 0.92 * smooth(0, 0.05, a), 0.16 + 0.12 * r1, fire * (1.8 * Math.exp(-a / 0.6) + 0.55) * (k === 0 ? 1 : k === 1 ? 0.45 : 0.15), b.seed * 0.37 + k);
            }
          }
        });
        blds.instanceMatrix.needsUpdate = true; if (blds.instanceColor) blds.instanceColor.needsUpdate = true;
        // the tower: you go through its foot; it drops into its own fireball and starts to lean
        const P = place(S, TOWER.s), a = v - T_TOWER;
        const fall = a > 0 ? Math.min(0.5 * G * a * a, 80) : 0;
        tower.position.set(0, SEA_Y + 1.5 - P.drop - fall, P.z);
        tower.rotation.set(0, 0, a > 0 ? -0.03 * a * a : 0);
        let nd = 0;
        if (a > -0.02) {
          const y0 = SEA_Y - P.drop;
          for (let k = 0; k < 40; k++) {
            const r1 = hh(k, 440), r2 = hh(k, 441), r3 = hh(k, 442), aa = Math.max(a, 0);
            const R = 120 * (1 - Math.exp(-aa / 0.12)) + 40 * aa;
            fx.puff((r1 - 0.5) * 2 * R, y0 + 10 + r2 * R * 1.1 + 60 * aa * r2, P.z + (r3 - 0.5) * 2 * R, 24 + 40 * r2 + 0.45 * R,
              0.92 * smooth(-0.02, 0.02, a), 0.16 + 0.1 * r3, (2.6 * Math.exp(-aa / 0.45) + 0.45) * (0.5 + 0.5 * r1), 50 + k * 1.3);
          }
          // a ring of dust racing out along the ground
          for (let k = 0; k < 24; k++) {
            const ang = (k / 24) * Math.PI * 2, aa = Math.max(a, 0), Rr = 40 + 260 * (1 - Math.exp(-aa / 0.6));
            fx.puff(Math.cos(ang) * Rr, y0 + 12 + 10 * hh(k, 450), P.z + Math.sin(ang) * Rr, 26 + 30 * (1 - Math.exp(-aa / 0.8)), 0.8 * smooth(0, 0.08, aa) * (1 - smooth(4, 7, aa)), 0.4, 0, 80 + k);
          }
          for (let k = 0; k < NDEB; k++) {
            const r1 = hh(k, 460), r2 = hh(k, 461), r3 = hh(k, 462), aa = Math.max(a, 0);
            const ang = r1 * Math.PI * 2, sp = 60 + 200 * r2, up = 15 + 110 * r3;
            const t = Math.min(aa, 5);
            const y = Math.max(0.5, 5 + 60 * r3 + up * t - 0.5 * G * t * t);
            e.set(r1 * 9 + t * 5, r2 * 9 + t * 4, r3 * 9 + t * 6); q.setFromEuler(e);
            deb.setMatrixAt(nd++, a > 0 ? m4.compose(p.set(Math.cos(ang) * sp * t, y0 + y, P.z + Math.sin(ang) * sp * t), q, sc.setScalar(2 + 5 * r3)) : zero);
          }
        }
        for (; nd < NDEB; nd++) deb.setMatrixAt(nd, zero);
        deb.instanceMatrix.needsUpdate = true;
      }
      // ======== the mountain ========
      if (vis.mtn) {
        const P = place(S, MTN.s), a = v - T_MTN;
        mtn.position.set(0, SEA_Y - P.drop + MTN.h * 0.5 - 30, P.z);
        mtn.scale.set(MTN.r, MTN.h, MTN.r);
        mtn.material.userData.uAge.value = a;
        PEAKS.forEach((m, i) => {
          const Q = place(S, m.s);
          peaks.setMatrixAt(i, Q.d < 300000 && Q.d > -260000 ? m4.compose(p.set(m.x, SEA_Y - Q.drop + m.h * 0.5 - m.h * 0.05, Q.z), q.setFromEuler(e.set(0, i * 1.3, 0)), sc.set(m.r, m.h, m.r)) : zero);
        });
        peaks.instanceMatrix.needsUpdate = true;
        const y0 = SEA_Y - P.drop;
        let nr = 0;
        if (a > -0.02) {
          const aa = Math.max(a, 0);
          // fire jets out of both ends of your channel, along your path
          for (const end of [-1, 1]) {
            for (let k = 0; k < 26; k++) {
              const f = k / 25, r1 = hh(k, 470 + end), r2 = hh(k, 480 + end);
              const len = 3200 * (1 - Math.exp(-aa / 0.35)) * (end < 0 ? 1 : 0.7);
              fx.puff((r1 - 0.5) * 400 * f, y0 + 150 + 400 * f * r2, P.z + end * (MTN.r * 0.894 + len * f), 160 + 650 * f * (0.5 + r2),
                0.9 * smooth(-0.02, 0.03, a), 0.2 + 0.15 * r2, (2.4 * Math.exp(-aa / 0.6) + 0.4) * (1 - 0.6 * f), 120 + k + end * 40);
            }
          }
          // the summit blown up: ash and fire
          const ab = Math.max(a - 0.18, 0);
          for (let k = 0; k < 34; k++) {
            const r1 = hh(k, 490), r2 = hh(k, 491), r3 = hh(k, 492);
            const R = 900 * (1 - Math.exp(-ab / 0.5));
            fx.puff((r1 - 0.5) * 2 * R, y0 + MTN.h * (0.85 + 0.1 * r2) + 350 * (1 - Math.exp(-ab / 0.7)) + r2 * R * 0.8, P.z + (r3 - 0.5) * 2 * R,
              260 + 520 * r3 * (1 - Math.exp(-ab / 0.6)), 0.85 * smooth(0, 0.1, ab), 0.32 + 0.2 * r1, (1.6 * Math.exp(-ab / 0.7) + 0.25) * (0.4 + 0.6 * r2), 160 + k);
          }
          // and its rock thrown up and out
          for (let k = 0; k < NROCK; k++) {
            const r1 = hh(k, 500), r2 = hh(k, 501), r3 = hh(k, 502);
            const ang = r1 * Math.PI * 2, out = 60 + 200 * r2, up = 120 + 260 * r3, t = Math.min(ab, 6);
            e.set(r1 * 9 + t * 2, r2 * 9 + t * 3, r3 * 9 + t * 2.5); q.setFromEuler(e);
            rocks.setMatrixAt(nr++, ab > 0 ? m4.compose(p.set(Math.cos(ang) * out * t, y0 + MTN.h * (0.8 + 0.15 * r2) + up * t - 0.5 * G * t * t, P.z + Math.sin(ang) * out * t), q, sc.setScalar(25 + 70 * r3 * r3)) : zero);
          }
        }
        for (; nr < NROCK; nr++) rocks.setMatrixAt(nr, zero);
        rocks.instanceMatrix.needsUpdate = true;
      }
      fx.end();
    },
  };
}
