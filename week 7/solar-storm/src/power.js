// The wires: wooden utility poles along the east curb, a crossarm with three wires and their insulators on each, the
// street lamps hanging off them on arms over the road, and the transformer can on the pole just ahead of you.
// Also the sparks: everything that sparks is planned here as a list of bursts (time, place, how many, how fast), and
// each frame the live sparks are drawn as tiny glows falling under gravity (0:05 the signs and lamps as the wave hits
// them; 0:07.5 the transformer blowing; 0:08-0:11 arcs running along the wires from pole to pole, dripping sparks).
import * as THREE from 'three';
import { POLES, XF_POLE, POLE_H, WIRE_X, LAMPS, SIGNS, BLADES, SCREENS, lampHead } from './layout.js';
import { V_XF, V_LINES, ORIGIN, dieAt } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

export const XF = { x: XF_POLE.x + 0.42, y: 8.2, z: XF_POLE.z };     // the transformer can (on the sidewalk side, over you)
const ARM_Y = POLE_H - 0.5, SAG = 0.55;
// a point on wire k between pole i and pole i+1 at fraction u
export function wireAt(i, k, u) {
  const a = POLES[i], b = POLES[i + 1];
  return { x: a.x + WIRE_X[k], y: ARM_Y + 0.12 - SAG * 4 * u * (1 - u), z: a.z + (b.z - a.z) * u };
}
// the arcs running along the wires: [start time, start pole, direction (+1 north / -1 south), wire, speed m/s]
export const RUNNERS = [
  [V_LINES, 1, 1, 0, 26], [V_LINES + 0.15, 1, 1, 2, 22], [V_LINES + 0.05, 1, -1, 1, 20], [V_LINES + 0.45, 1, 1, 1, 30],
  [V_LINES + 0.9, 1, -1, 0, 24], [V_LINES + 1.3, 1, 1, 0, 28],
];
// where runner r is at time v (null when not running): pole-span index, fraction
export function runnerAt(r, v) {
  const [t0, p0, dir, k, sp] = r;
  const t = v - t0;
  if (t < 0) return null;
  let d = sp * t;
  let i = dir > 0 ? p0 : p0 - 1;
  while (i >= 0 && i < POLES.length - 1) {
    const L = Math.abs(POLES[i + 1].z - POLES[i].z);
    if (d < L) { const u = dir > 0 ? d / L : 1 - d / L; return { i, k, u, d: sp * t }; }
    d -= L; i += dir;
  }
  return null;
}

// ---- spark bursts, and a flash of blue-white light where each lit thing dies ----
export const BURSTS = [], FLASHES = [];
{
  const R = rng(4242);
  const dist = (x, z) => Math.hypot(x - ORIGIN.x, z - ORIGIN.z);
  const add = (t, x, y, z, n, sp, up = 0.3, life = 1.1, hot = 1) => { for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, e = (R() - 0.3) * 1.4, s = sp * (0.3 + 0.7 * R());
    BURSTS.push({ t: t + R() * 0.08, x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + up * sp, vz: Math.sin(a) * Math.cos(e) * s, life: life * (0.5 + 0.8 * R()), hot: hot * (0.5 + R()) });
  } };
  // the signs and lamps as the wave reaches them
  for (const s of SIGNS) if (dist(s.x, s.z) < 140) add(dieAt(dist(s.x, s.z)), s.x - Math.sign(s.x) * 0.2, s.y, s.z + (R() - 0.5) * s.w, 22, 4.5, 0.2, 1.0, 1.3);
  for (const b of BLADES) if (dist(b.x, b.z) < 120) add(dieAt(dist(b.x, b.z)), b.x, b.y + b.h * 0.3, b.z, 18, 4, 0.2, 1.0, 1.3);
  for (const s of SCREENS) if (dist(s.x, s.z) < 140) add(dieAt(dist(s.x, s.z)), s.x - Math.sign(s.x) * 0.4, s.y - s.h / 2, s.z, 50, 5.5, 0.1, 1.4, 1.5);
  for (const l of LAMPS) if (dist(l.x, l.z) < 150) { const h = lampHead(l); add(dieAt(dist(l.x, l.z)), h.x, h.y, h.z, 26, 4, 0.1, 1.2, 1.4); }
  // the transformer: a big blue-white burst, then a rain of sparks for a second and a half
  add(V_XF, XF.x, XF.y + 0.3, XF.z, 140, 9, 0.25, 1.6, 1.6);
  for (let k = 0; k < 10; k++) add(V_XF + 0.12 + k * 0.14, XF.x, XF.y + 0.2, XF.z, 10, 3.5, 0.1, 1.3, 1);
  // drips from the arcs running along the wires (every ~0.06 s while each runs)
  for (const r of RUNNERS) for (let t = r[0]; t < r[0] + 3.2; t += 0.06) {
    const q = runnerAt(r, t); if (!q) break;
    const w = wireAt(q.i, q.k, q.u);
    add(t, w.x, w.y, w.z, 3, 2.5, 0.0, 0.9, 0.9);
  }
  // an insulator flashing over at every pole a runner passes
  for (const r of RUNNERS) for (let t = r[0]; t < r[0] + 3.2; t += 1 / 60) {
    const a = runnerAt(r, t), b = runnerAt(r, t + 1 / 60);
    if (!a || !b) break;
    if (a.i !== b.i) { const p = POLES[r[2] > 0 ? b.i : a.i]; add(t, p.x + WIRE_X[r[3]], ARM_Y + 0.25, p.z, 16, 4, 0.2, 1.0, 1.2); }
  }
  for (const s of SIGNS) if (dist(s.x, s.z) < 160) FLASHES.push({ t: dieAt(dist(s.x, s.z)), x: s.x - Math.sign(s.x) * 0.3, y: s.y, z: s.z, r: 2.4, k: 1 });
  for (const b of BLADES) if (dist(b.x, b.z) < 160) FLASHES.push({ t: dieAt(dist(b.x, b.z)), x: b.x, y: b.y, z: b.z, r: 2.2, k: 1 });
  for (const s of SCREENS) if (dist(s.x, s.z) < 160) FLASHES.push({ t: dieAt(dist(s.x, s.z)), x: s.x - Math.sign(s.x) * 0.5, y: s.y, z: s.z, r: 6, k: 1.2 });
  for (const l of LAMPS) if (dist(l.x, l.z) < 170) { const h = lampHead(l); FLASHES.push({ t: dieAt(dist(l.x, l.z)), x: h.x, y: h.y, z: h.z, r: 2.6, k: 1.2 }); }
  BURSTS.sort((a, b) => a.t - b.t);
}
// draw the live sparks (glows) at time v
export function drawSparks(v, glows) {
  for (const q of FLASHES) { const t = v - q.t; if (t < 0 || t > 0.4) continue; const k = Math.exp(-t / 0.09) * q.k; glows.add(q.x, q.y, q.z, q.r * (0.6 + 0.6 * k), 5 * k, 5.5 * k, 7 * k); }
  for (const s of BURSTS) {
    if (s.t > v) break;
    const t = v - s.t;
    if (t > s.life) continue;
    const y = s.y + s.vy * t - 4.9 * t * t;
    if (y < 0.02) continue;
    const f = 1 - t / s.life, k = s.hot * f * f;
    // hot white-blue first, cooling to orange
    const c = smooth(0, 0.35, t);
    glows.add(s.x + s.vx * t * 0.85, y, s.z + s.vz * t * 0.85, 0.08 + 0.06 * k, (2.4 + 1.6 * c) * k * 3, (2.6 + 0.2 * c) * k * 3, (3.4 - 2.9 * c) * k * 3);
  }
}

export function makePower(scene, ctx) {
  const wood = ctx.plainMat(0x4a3a2c, 0.9);
  const m4 = new THREE.Matrix4();
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.17, POLE_H, 8).translate(0, POLE_H / 2, 0), wood, POLES.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 0.12, 0.12), wood, POLES.length);
  const ins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 6), ctx.plainMat(0x6a7a6a, 0.3), POLES.length * 3);
  POLES.forEach((p, i) => {
    poles.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z));
    arms.setMatrixAt(i, m4.makeTranslation(p.x, ARM_Y, p.z));
    WIRE_X.forEach((dx, k) => ins.setMatrixAt(i * 3 + k, m4.makeTranslation(p.x + dx, ARM_Y + 0.14, p.z)));
  });
  for (const m of [poles, arms, ins]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // the wires (sagging between poles)
  {
    const geos = [];
    for (let i = 0; i < POLES.length - 1; i++) for (let k = 0; k < 3; k++) {
      const pts = []; for (let s = 0; s <= 16; s++) { const w = wireAt(i, k, s / 16); pts.push(new THREE.Vector3(w.x, w.y, w.z)); }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.022, 4, false));
    }
    const wmat = ctx.plainMat(0x0c0c0c, 0.6);
    for (const g of geos) { const mm = new THREE.Mesh(g, wmat); mm.frustumCulled = false; scene.add(mm); }
  }
  // the east lamps on the poles (arm out over the road)
  const east = LAMPS.filter((l) => l.x > 0);
  const larm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), ctx.plainMat(0x3a3d42, 0.5, { metalness: 0.4 }), east.length);
  const lhead = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.2, 0.34), ctx.plainMat(0x2a2c30, 0.5), east.length);
  east.forEach((l, i) => { larm.setMatrixAt(i, m4.makeTranslation(l.x + l.d * 1.2, l.h + 0.1, l.z)); lhead.setMatrixAt(i, m4.makeTranslation(l.x + l.d * 2.3, l.h, l.z)); });
  for (const m of [larm, lhead]) { m.frustumCulled = false; scene.add(m); }
  // the transformer can: grey drum, a lid, bushings on top, a bracket to the pole; it splits open when it blows
  const g = new THREE.Group();
  g.position.set(XF.x, XF.y, XF.z);
  const grey = ctx.plainMat(0x7a7e80, 0.5, { metalness: 0.4 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.05, 14), grey);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.06, 14), grey); lid.position.y = 0.55;
  const br = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.12), ctx.plainMat(0x333333, 0.6)); br.position.set(-0.32, 0, 0);
  g.add(drum, lid, br);
  for (const dz of [-0.14, 0.14]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 6), ctx.plainMat(0x6a7a6a, 0.3)); b.position.set(0, 0.68, dz); g.add(b); }
  const soot = ctx.plainMat(0x181614, 0.95);
  g.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
  scene.add(g);
  return {
    frame(v) {
      // after it blows: blackened, the lid knocked askew
      const b = smooth(V_XF, V_XF + 0.05, v);
      if (b > 0.5 && drum.material !== soot) { drum.material = soot; lid.material = soot; }
      if (b <= 0.5 && drum.material === soot) { drum.material = grey; lid.material = grey; }
      lid.rotation.set(0.5 * b, 0, 0.35 * b);
      lid.position.set(0.05 * b, 0.55 + 0.12 * b, 0.08 * b);
    },
  };
}
