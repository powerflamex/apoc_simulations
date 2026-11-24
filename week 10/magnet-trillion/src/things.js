// Everything steel on the promenade and the street that comes to you, one kind per step (each lands with its own sound,
// audio.mjs reads LANDINGS): bikes and signs (1,000x), carts, manhole covers, cafe chairs, tables and bins (3,000x),
// lamp posts that bend toward you and snap (from 11 s), bollards, benches and the kiosk (17 s), and the steel beams torn
// out of the buildings (21 s; one from every window city.js tears open: the same hash). Instanced, one mesh per part.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BIKES, ASIGNS, CARTS, COVERS, CAFE, BINS, LAMPS, RAILS, BENCHES, KIOSK, BLD } from './layout.js';
import { releaseAt, GROUPS } from './timeline.js';
import { flight, flyPose, pileSlot, randQuat } from './fly.js';
import { GU } from './ground.js';
import { stretchy } from './field.js';
import { rng } from './util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const ni = (g) => g.toNonIndexed();
// a tube from a to b
function tube(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return ni(g);
}
const box = (w, h, d, x = 0, y = 0, z = 0) => ni(new THREE.BoxGeometry(w, h, d).translate(x, y, z));

// ---- geometry (origin at the base where it stands; bikes along x) ----
function bikeParts() {
  const rh = V3(-0.52, 0.34, 0), bb = V3(0, 0.3, 0), st = V3(-0.13, 0.86, 0), ht = V3(0.42, 0.9, 0), hb = V3(0.47, 0.62, 0), fh = V3(0.52, 0.34, 0);
  const frame = mergeGeometries([tube(rh, bb, 0.022), tube(rh, st, 0.018), tube(bb, st, 0.026), tube(st, ht, 0.026), tube(bb, hb, 0.03), tube(hb, fh, 0.02), tube(hb, ht, 0.03),
    tube(V3(0.4, 1.0, -0.3), V3(0.4, 1.0, 0.3), 0.016), tube(ht, V3(0.4, 1.0, 0), 0.02), box(0.32, 0.22, 0.34, 0.62, 0.86, 0), tube(st, V3(-0.15, 0.95, 0), 0.016)]);
  const wheels = mergeGeometries([ni(new THREE.TorusGeometry(0.33, 0.025, 6, 28).translate(-0.52, 0.34, 0)), ni(new THREE.TorusGeometry(0.33, 0.025, 6, 28).translate(0.52, 0.34, 0)),
    ...[-0.52, 0.52].flatMap((x) => [0, 1, 2, 3].map((k) => box(0.006, 0.62, 0.006, x, 0.34, 0).rotateZ(0).applyMatrix4(new THREE.Matrix4().makeTranslation(-x, -0.34, 0)).applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI / 4)).applyMatrix4(new THREE.Matrix4().makeTranslation(x, 0.34, 0))))]);
  const seat = box(0.24, 0.06, 0.12, -0.15, 0.98, 0);
  return { frame, wheels, seat };
}
function cartGeo() {
  const g = [];
  const L = 0.85, W = 0.52, y0 = 0.32, y1 = 0.98;
  for (const y of [y0, y1]) { g.push(box(L, 0.015, 0.015, 0, y, -W / 2), box(L, 0.015, 0.015, 0, y, W / 2), box(0.015, 0.015, W, -L / 2, y, 0), box(0.015, 0.015, W * 0.8, L / 2, y, 0)); }
  for (let k = 0; k <= 10; k++) { const x = -L / 2 + k * L / 10; g.push(box(0.008, y1 - y0, 0.008, x, (y0 + y1) / 2, -W / 2), box(0.008, y1 - y0, 0.008, x, (y0 + y1) / 2, W / 2)); }
  for (let k = 0; k <= 6; k++) { const z = -W / 2 + k * W / 6; g.push(box(0.008, y1 - y0, 0.008, -L / 2, (y0 + y1) / 2, z)); g.push(box(L, 0.008, 0.008, 0, y0, z)); }
  g.push(tube(V3(-L / 2, y1, -W / 2), V3(-L / 2 - 0.15, y1 + 0.08, -W / 2), 0.012), tube(V3(-L / 2, y1, W / 2), V3(-L / 2 - 0.15, y1 + 0.08, W / 2), 0.012));
  for (const [x, z] of [[-0.38, -0.22], [-0.38, 0.22], [0.38, -0.2], [0.38, 0.2]]) g.push(tube(V3(x, y0, z), V3(x, 0.08, z), 0.012));
  const red = box(0.04, 0.04, W + 0.04, -L / 2 - 0.15, y1 + 0.08, 0);
  const wheels = mergeGeometries([[-0.38, -0.22], [-0.38, 0.22], [0.38, -0.2], [0.38, 0.2]].map(([x, z]) => ni(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10).rotateX(Math.PI / 2).translate(x, 0.06, z))));
  return { wire: mergeGeometries(g), red, wheels };
}
function chairGeo() {
  return mergeGeometries([box(0.42, 0.03, 0.42, 0, 0.46, 0), ...[[-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18]].map(([x, z]) => box(0.025, 0.46, 0.025, x, 0.23, z)),
    box(0.025, 0.42, 0.025, -0.18, 0.67, -0.19), box(0.025, 0.42, 0.025, 0.18, 0.67, -0.19), box(0.4, 0.06, 0.02, 0, 0.83, -0.19), box(0.4, 0.06, 0.02, 0, 0.66, -0.19)]);
}
const tableGeo = () => mergeGeometries([ni(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 24).translate(0, 0.74, 0)), ni(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8).translate(0, 0.37, 0)), ni(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 16).translate(0, 0.015, 0))]);
const binGeo = () => mergeGeometries([ni(new THREE.CylinderGeometry(0.26, 0.24, 0.9, 18, 1, true).translate(0, 0.45, 0)), ni(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18).translate(0, 0.92, 0)), ni(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 18).translate(0, 0.02, 0))]);
const lampGeo = () => mergeGeometries([ni(new THREE.CylinderGeometry(0.06, 0.095, 5.0, 10).translate(0, 2.5, 0)), ni(new THREE.CylinderGeometry(0.14, 0.16, 0.5, 10).translate(0, 0.25, 0)), tube(V3(0, 4.9, 0), V3(0, 5.15, 0.55), 0.04), box(0.32, 0.14, 0.55, 0, 5.12, 0.75)]);
const bollardGeo = () => mergeGeometries([ni(new THREE.CylinderGeometry(0.1, 0.11, 0.92, 12).translate(0, 0.46, 0)), ni(new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.92, 0))]);
const benchParts = () => ({ frame: mergeGeometries([...[-0.75, 0.75].flatMap((x) => [box(0.05, 0.45, 0.05, x, 0.22, 0.2), box(0.05, 0.85, 0.05, x, 0.42, -0.22), box(0.05, 0.05, 0.5, x, 0.44, 0)])]),
  slats: mergeGeometries([0, 1, 2, 3].map((k) => box(1.7, 0.035, 0.1, 0, 0.47, -0.18 + k * 0.12)).concat([0, 1, 2].map((k) => box(1.7, 0.1, 0.035, 0, 0.62 + k * 0.13, -0.24)))) });
const coverGeo = () => mergeGeometries([ni(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 28).translate(0, 0.025, 0)), ...[-0.2, -0.1, 0, 0.1, 0.2].map((x) => box(0.025, 0.012, 0.55 * Math.sqrt(1 - (x / 0.32) ** 2), x, 0.055, 0))]);
function beamGeo() {
  // an I-beam 1 m long (scaled per instance), 0.3 m deep
  return mergeGeometries([box(1, 0.025, 0.3, 0, 0.1375, 0), box(1, 0.025, 0.3, 0, -0.1375, 0), box(1, 0.25, 0.018, 0, 0, 0)]);
}
const kioskParts = () => ({ body: mergeGeometries([box(KIOSK.w, 2.3, KIOSK.d, 0, 1.15, 0), box(KIOSK.w + 0.5, 0.14, KIOSK.d + 0.6, 0, 2.38, 0)]),
  trim: mergeGeometries([box(KIOSK.w + 0.04, 0.08, KIOSK.d + 0.04, 0, 0.98, 0), box(KIOSK.w - 0.3, 0.9, 0.02, 0, 1.55, KIOSK.d / 2 + 0.005)]) });

// signs: a painted atlas, 4 x 2 cells: MENU (chalk), GELATO, NEWS, TICKETS, P, no entry, COFFEE, FLOWERS
function signAtlas() {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 512;
  const g = cv.getContext('2d');
  const cells = [['MENU', '#1f2f26', '#f2efe4'], ['GELATO', '#f3a6c4', '#5a1030'], ['NEWS', '#f2c230', '#1a1a1a'], ['TICKETS', '#1f4f9a', '#ffffff'],
    ['P', '#1f56b8', '#ffffff'], ['', '#c8241e', '#ffffff'], ['COFFEE', '#4a2a1a', '#f6e8d0'], ['FLOWERS', '#2a7a4a', '#ffffff']];
  cells.forEach(([w, bg, fg], i) => {
    const x0 = (i % 4) * 512, y0 = Math.floor(i / 4) * 256;
    g.fillStyle = bg; g.fillRect(x0 + 3, y0 + 3, 506, 250);
    g.fillStyle = fg; g.strokeStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (i === 0) { g.font = 'italic 700 92px Georgia, serif'; g.fillText(w, x0 + 256, y0 + 78); g.lineWidth = 6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x0 + 90, y0 + 150 + k * 32); g.lineTo(x0 + 330 + 60 * Math.sin(k * 2), y0 + 150 + k * 32); g.stroke(); } }
    else if (i === 4) { g.font = '900 210px Arial, sans-serif'; g.fillText(w, x0 + 256, y0 + 134); g.lineWidth = 10; g.strokeRect(x0 + 140, y0 + 16, 232, 224); }
    else if (i === 5) { g.beginPath(); g.arc(x0 + 256, y0 + 128, 118, 0, 6.29); g.fillStyle = fg; g.fill(); g.beginPath(); g.arc(x0 + 256, y0 + 128, 100, 0, 6.29); g.fillStyle = bg; g.fill(); g.fillStyle = fg; g.fillRect(x0 + 186, y0 + 110, 140, 36); }
    else { g.font = '900 116px Georgia, serif'; g.fillText(w, x0 + 256, y0 + 132); g.lineWidth = 6; g.strokeRect(x0 + 18, y0 + 18, 476, 220); }
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// a sign material: aCell picks the atlas cell (0-7)
function signMat(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.03 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(aCell, 4.0) + uv.x) / 4.0, 1.0 - (floor(aCell / 4.0) + 1.0 - uv.y) / 2.0);
        vEmissiveMapUv = vMapUv;`);
  };
  m.customProgramCacheKey = () => 'mag-sign-v1';
  return m;
}

// ---- the plan: every thing, its flight ----
export const THINGS = [];      // { type, f, s (scale), cell, col }
export const LANDINGS = [];    // { t, kind, x, y, z, size } for the sound
{
  const R = rng(2468);
  const add = (type, x, y, z, yaw, group, ring, o = {}) => {
    const d = Math.hypot(x, z);
    const [dmin, dmax] = o.range ?? [0, 40];
    const p0 = V3(x, y, z), q0 = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw);
    const p1 = pileSlot(x, z, ring, R);
    const f = flight({ p0, q0, p1, q1: o.long ? radialQ(p1, o.long, R) : randQuat(R), tR: o.tR ?? releaseAt(group, d, dmin, dmax, (R() - 0.5) * (o.jit ?? 0.3)),
      acc: o.acc ?? 22, dMin: o.dMin ?? 0.45, dMax: o.dMax ?? 2.2, arc: o.arc ?? 0.6 + 1.2 * R(), spin: o.spin ?? 3 + 4 * R(), shake: o.shake ?? 0.5, bend: o.bend, bendT: o.bendT, size: o.size ?? 1 }, R);
    const t = { type, f, s: o.s ?? 1, cell: o.cell ?? 0, col: o.col, kind: o.kind ?? type };
    THINGS.push(t);
    LANDINGS.push({ t: f.tL, kind: t.kind, x: f.p1.x, y: f.p1.y, z: f.p1.z, size: o.size ?? 1, tR: f.tR, x0: x, z0: z });
    return t;
  };
  // long things (lamp posts, beams) land lying along the line to you, so they never reach across the camera's gap
const radialQ = (p1, axis, R) => { const d = V3(p1.x, 0.25 * (R() - 0.3), p1.z).normalize(); return new THREE.Quaternion().setFromUnitVectors(axis === 'y' ? V3(0, 1, 0) : V3(1, 0, 0), d); };
  const NEARR = { rMin: 0.9, rMax: 2.7, yMin: 0.0, yMax: 0.45 };   // (low: your chest, arms and head stay out of the pile)
  const BIKEC = [0x1f8a8a, 0x1f8a8a, 0xd23a2a, 0x2a2a2a, 0xe8c040];
  for (const b of BIKES) add('bike', b.x, 0, b.z, b.yaw, 'bike', NEARR, { range: [2, 32], col: b.rack ? 0x1f8a8a : BIKEC[Math.floor(R() * BIKEC.length)] });
  for (const a of ASIGNS) {
    if (a.kind === 0) add('aframe', a.x, 0, a.z, a.yaw, 'sign', { ...NEARR, yMax: 0.6 }, { range: [2, 30], kind: 'sign' });
    else if (a.kind === 1) add('panel', a.x, 2.6, a.z, a.yaw, 'sign', { ...NEARR, rMin: 1.0, yMax: 0.7 }, { range: [2, 30], cell: [1, 2, 3, 6, 7][Math.floor(R() * 5)], kind: 'sign' });
    else add('street', a.x, 0, a.z, a.yaw, 'sign', { ...NEARR, rMin: 1.0, yMax: 0.5 }, { range: [2, 50], cell: R() < 0.5 ? 4 : 5, kind: 'sign', shake: 0.9 });
  }
  for (const c of CARTS) add('cart', c.x, 0, c.z, c.yaw, 'cart', NEARR, { range: [10, 26] });
  COVERS.forEach((c, i) => {
    const t = add('cover', c.x, 0, c.z, R() * 6, 'cover', { ...NEARR, rMin: 0.8, yMax: 0.6 }, { range: [4, 40], arc: 0.3 + 0.6 * R(), shake: 0.6 });
    GU.uCov.value[i].set(c.x, c.z, t.f.tR, 0);
  });
  for (const c of CAFE) {
    add('table', c.x, 0, c.z, 0, 'chair', NEARR, { range: [3, 24] });
    for (const s of [-1, 1]) add('chair', c.x + s * 0.62, 0, c.z + 0.1 * s, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'chair', NEARR, { range: [3, 24] });
  }
  for (const b of BINS) add('bin', b.x, 0, b.z, 0, 'chair', NEARR, { range: [3, 40] });
  for (const l of LAMPS) {
    const d = Math.hypot(l.x, l.z);
    if (l.z > 3 || d > 70) continue;
    add('lamp', l.x, 0, l.z, l.x > 0 ? Math.PI / 2 : -Math.PI / 2, 'lamp', { rMin: 2.6, rMax: 5.0, yMin: 0.3, yMax: 1.2 }, { range: [7, 70], bend: 0.75, bendT: 3.2, shake: 1.2, acc: 14, dMax: 2.6, size: 2, long: 'y' });
  }
  for (const r of RAILS) add('bollard', r.x, 0, r.z, 0, 'rail', { rMin: 2.8, rMax: 5.8, yMin: 0.2, yMax: 1.4 }, { range: [8, 60], shake: 0.9, kind: 'bollard' });
  for (const b of BENCHES) { if (b.z > 3) continue; add('bench', b.x, 0, b.z, b.yaw, 'rail', { rMin: 3.0, rMax: 6.0, yMin: 0.3, yMax: 1.6 }, { range: [5, 60], kind: 'bollard', size: 1.5 }); }
  add('kiosk', KIOSK.x, 0, KIOSK.z, 0, 'rail', { rMin: 5.5, rMax: 6.5, yMin: 0.5, yMax: 1.5 }, { range: [0, 30], tR: 18.4, acc: 10, size: 3, kind: 'kiosk', shake: 1.0 });
  // the beams: one from every window torn open in the street walls within 75 m (city.js's hash)
  const hash = (ix, iy, seed, face) => { const a = Math.fround(ix * 13 + iy * 71 + seed * 29 + face * 3); const m = Math.fround(a * Math.fround(0.61803398)); return m - Math.floor(m); };
  let nb = 0;
  for (const b of BLD) {
    if (!(b.tear < 500)) continue;
    const side = Math.sign(b.x), face = side > 0 ? 1 : 5, fx = b.x - side * b.w / 2;
    const FH = b.kind === 2 ? 3.7 : 3.5, g0 = b.kind === 2 ? 5.0 : 5.6;
    const W = b.d, nCol = Math.max(1, Math.floor(W / b.colW + 0.5)), cw = W / nCol;
    for (let j = 0; g0 + (j + 0.6) * FH < b.h - 1.5; j++) for (let i = 0; i < nCol; i++) {
      const wt = hash(i, j, b.i, face);
      if (wt > 0.5) continue;
      const z = b.z - b.d / 2 + (i + 0.5) * cw, y = g0 + (j + 0.5) * FH;
      const tR = b.tear + 2.6 * wt * 2;
      if (z > 6 || nb > 420) continue;
      nb++;
      const len = cw * (1.1 + 0.6 * R());
      const bp1 = pileSlot(fx, z, { rMin: 5, rMax: 14, yMin: 0.2, yMax: 2.6 }, R);
      const f = flight({ p0: V3(fx - side * 0.35, y, z), q0: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2), p1: bp1, q1: radialQ(bp1, 'x', R),
        tR, acc: 34, dMin: 0.7, dMax: 2.2, arc: 1 + 4 * R(), spin: 2 + 4 * R(), shake: 0.25, size: 1.5 }, R);
      THINGS.push({ type: 'beam', f, s: 1, len });
      LANDINGS.push({ t: f.tL, kind: 'beam', x: f.p1.x, y: f.p1.y, z: f.p1.z, size: 1.5, tR, x0: fx, z0: z });
    }
  }
  console.log(`things: ${THINGS.length} (${nb} beams)`);
}

export function makeThings(scene, ctx) {
  const pm = (c, r = 0.5, e = {}) => stretchy(ctx.plainMat(c, r, e), `th${c.toString(16)}${r}`);
  const steel = pm(0x8a8d92, 0.35, { metalness: 0.75 });
  const tex = signAtlas();
  const sgn = stretchy(ctx.hazedM(signMat(tex)), 'sign');
  const bp = bikeParts(), cg = cartGeo(), bench = benchParts(), kp = kioskParts();
  const aframe = mergeGeometries([box(0.6, 0.85, 0.03, 0, 0.45, 0.17).rotateX(0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.22)), box(0.6, 0.85, 0.03, 0, 0.45, -0.17).applyMatrix4(new THREE.Matrix4().makeRotationX(0.22))]);
  const TYPES = {
    bike: [[bp.frame, pm(0xffffff, 0.4, { metalness: 0.3 }), true], [bp.wheels, pm(0x18181a, 0.7)], [bp.seat, pm(0x101010, 0.6)]],
    aframe: [[aframe, sgn, false, 0], [mergeGeometries([box(0.64, 0.03, 0.03, 0, 0.9, 0)]), steel]],
    panel: [[box(2.2, 0.62, 0.06), sgn, false, 'cell']],
    street: [[ni(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 8).translate(0, 1.45, 0)), pm(0x9a9ca0, 0.4, { metalness: 0.6 })], [box(0.56, 0.56, 0.03, 0, 2.6, 0.05), sgn, false, 'cell']],
    cart: [[cg.wire, steel], [cg.red, pm(0xc0302a, 0.5)], [cg.wheels, pm(0x202020, 0.8)]],
    cover: [[coverGeo(), pm(0x34322f, 0.75, { metalness: 0.4 })]],
    chair: [[chairGeo(), pm(0xb8bcc2, 0.3, { metalness: 0.7 })]],
    table: [[tableGeo(), pm(0xb8bcc2, 0.3, { metalness: 0.7 })]],
    bin: [[binGeo(), pm(0x2c4a3a, 0.6, { metalness: 0.3 })]],
    lamp: [[lampGeo(), pm(0x2e3a36, 0.55, { metalness: 0.4 })]],
    bollard: [[bollardGeo(), pm(0x26282b, 0.6, { metalness: 0.4 })]],
    bench: [[bench.frame, pm(0x2b2d30, 0.5, { metalness: 0.5 })], [bench.slats, pm(0x8a5a32, 0.8)]],
    kiosk: [[kp.body, pm(0x1f5a3a, 0.5, { metalness: 0.3 })], [kp.trim, pm(0xd8c890, 0.5)]],
    beam: [[beamGeo(), pm(0xa8643a, 0.55, { metalness: 0.4 })]],
  };
  const groups = {};
  for (const [type, parts] of Object.entries(TYPES)) {
    const list = THINGS.filter((t) => t.type === type);
    if (!list.length) continue;
    const meshes = parts.map(([geo, mat, colored, cellMode]) => {
      const g = geo.clone();
      if (cellMode !== undefined) {
        const a = new Float32Array(list.length);
        list.forEach((t, i) => { a[i] = cellMode === 'cell' ? t.cell : cellMode; });
        g.setAttribute('aCell', new THREE.InstancedBufferAttribute(a, 1));
      }
      const m = new THREE.InstancedMesh(g, mat, list.length);
      if (colored) list.forEach((t, i) => m.setColorAt(i, new THREE.Color(t.col ?? 0xffffff)));
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    groups[type] = { list, meshes };
  }
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {
    frame(v) {
      for (const { list, meshes } of Object.values(groups)) {
        list.forEach((t, i) => {
          const s = flyPose(t.f, v, pos, q) * t.s;
          if (t.type === 'beam') sc.set(t.len, 1.6, 1.6); else sc.set(s, s, s);
          m4.compose(pos, q, sc);
          for (const m of meshes) m.setMatrixAt(i, m4);
        });
        for (const m of meshes) m.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
