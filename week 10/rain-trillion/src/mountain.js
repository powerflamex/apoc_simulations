// The mountain 5 km beyond the city: a 2,300 m peak standing on a 600 m upland. Green forest on its lower slopes, a
// tree line at ~1,350 m, bare rock and alpine meadow above, a snow cap from ~1,750 m. At its foot (on the upland,
// facing the city) a town with its lights on; a switchback road climbing from the town to a hut at the tree line (cars
// crawling up it); a trail from the hut to the top with climbers' headlamps strung along it; on the summit a cross and
// the last climbers. (World metres, the same frame as the city.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SUMMIT, TOWN } from './layout.js';
import { UPLAND_H, TOWN_H } from './timeline.js';
import { ridged, fbm } from './terrain.js';
import { drownMat } from './drown.js';
import { rng } from './util.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the direction from the summit toward the city (the face we see)
export const TO_CITY = new THREE.Vector2(-SUMMIT.x, -SUMMIT.z - 300).normalize();

export function mtnH(x, z) {
  const dx = x - SUMMIT.x, dz = z - SUMMIT.z, r = Math.hypot(dx, dz);
  // the upland: ~600 m round the mountain, falling to the plain 2.6-4.6 km out (a few low swells on it)
  let h = UPLAND_H * (1 - sm(2700, 4700, r)) + 35 * (fbm(x / 900 + 2, z / 900) - 0.5) * (1 - sm(2400, 4000, r));
  // the peak: a pyramid with five faces, concave (steeper near the top), buttresses and gullies on its faces
  let m = 0;
  for (const [f, s] of [[0, 1.0], [70, 1.12], [140, 0.95], [215, 1.05], [290, 0.92]]) {
    const a = (f + 12) * Math.PI / 180;
    m = Math.max(m, (dx * Math.cos(a) + dz * Math.sin(a)) * s);
  }
  let p = SUMMIT.h - (SUMMIT.h - UPLAND_H + 40) * Math.pow(m / 1500, 0.72);
  // two shoulders, one each side of the face we see (lower peaks, so it reads as a mountain, not a pyramid)
  for (const [su, ss, sh, sr] of [[340, -560, 1880, 420], [240, 600, 1760, 400]]) {
    const sx = SUMMIT.x + TO_CITY.x * su - TO_CITY.y * ss, sz = SUMMIT.z + TO_CITY.y * su + TO_CITY.x * ss;
    const rr = Math.hypot(x - sx, z - sz);
    p = Math.max(p, sh - (sh - UPLAND_H) * Math.pow(rr / (sr * 2.4), 0.75));
  }
  p += 110 * (ridged(x / 650 + 3, z / 650 - 2, 5) - 0.5) * sm(40, 500, r) * sm(UPLAND_H, UPLAND_H + 500, p);
  p += 25 * (ridged(x / 120, z / 120, 4) - 0.5) * sm(30, 160, r);
  // the summit: a small rounded top (room for a cross and a few climbers), steep rock falling away from it
  p = Math.max(p, r < 20 ? SUMMIT.h - 0.015 * r * r : SUMMIT.h - 6 - 2.2 * (r - 20));
  // broken rock near the top: ribs, blocks and steps (none on the few metres where the climbers stand)
  p += (9 * (ridged(x / 38 + 5, z / 38 - 1, 4) - 0.5) * sm(7, 40, r) + 1.6 * (ridged(x / 4, z / 4 + 3, 3) - 0.5) * sm(5, 14, r)) * (1 - sm(300, 700, r));
  if (r < 60) p = Math.min(p, SUMMIT.h - 0.004 * r * r);
  h = Math.max(h, p);
  // the town's ground: smoothed flat
  const tw = 1 - sm(TOWN.r * 0.8, TOWN.r * 1.5, Math.hypot(x - TOWN.x, z - TOWN.z));
  if (tw > 0) h = h * (1 - tw) + TOWN_H * tw;
  // low wooded hills round the far edges of the plain
  const far = sm(9000, 16000, Math.hypot(x, z + 600));
  h = Math.max(h, far * (60 + 500 * ridged(x / 6000 + 1, z / 6000 + 2, 5)));
  // flat where the city is
  const city = (1 - sm(1500, 2200, Math.abs(x))) * sm(-700, -560, z) * (1 - sm(2000, 2600, z));
  return h * (1 - city) - 3 * city;
}

// a point on the city-facing slope: u = metres from the summit toward the city, s = metres sideways
const slopePt = (u, s) => ({ x: SUMMIT.x + TO_CITY.x * u - TO_CITY.y * s, z: SUMMIT.z + TO_CITY.y * u + TO_CITY.x * s });

// the road: from the town's top edge in switchbacks up to the hut at the tree line; the trail from the hut to the top
export const ROAD = [], TRAIL = [];
{
  let u = 1250, s = 60, dir = 1;
  ROAD.push(slopePt(1450, -40)); ROAD.push(slopePt(u, s));
  while (u > 620) { s = dir * 200; u -= 110; ROAD.push(slopePt(u, s)); dir = -dir; }
  // densify, then drape on the ground
  const fine = [];
  for (let i = 0; i < ROAD.length - 1; i++) for (let k = 0; k < 12; k++) {
    const a = ROAD[i], b = ROAD[i + 1], t = k / 12;
    fine.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  fine.push(ROAD[ROAD.length - 1]);
  ROAD.length = 0; fine.forEach((q) => ROAD.push({ ...q, y: mtnH(q.x, q.z) + 1.5 }));
  let u2 = 600, s2 = 0, d2 = 1;
  TRAIL.push(slopePt(600, 200));
  while (u2 > 20) { u2 -= 60; s2 = d2 * Math.max(8, 60 * (u2 / 600)); TRAIL.push(slopePt(u2, s2)); d2 = -d2; }
  TRAIL.push(slopePt(4, 0));
  const tf = [];
  for (let i = 0; i < TRAIL.length - 1; i++) for (let k = 0; k < 8; k++) {
    const a = TRAIL[i], b = TRAIL[i + 1], t = k / 8;
    tf.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  TRAIL.length = 0; tf.forEach((q) => TRAIL.push({ ...q, y: mtnH(q.x, q.z) + 1.8 }));
}
const along = (P, k) => {                     // a point at fraction k (0..1) along polyline P
  const f = Math.min(P.length - 1.001, Math.max(0, k * (P.length - 1))), i = Math.floor(f), t = f - i;
  const a = P[i], b = P[i + 1];
  return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
};

export function makeMountainStuff(scene) {
  const P = (c, r = 0.85, extra = {}) => drownMat(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra }));
  const group = [];
  const add = (m) => { m.frustumCulled = false; scene.add(m); group.push(m); return m; };
  const R = rng(1234);
  // ---- the town: houses with pitched roofs, a church; window lights (glows, in frame()) ----
  const HOUSES = [];
  for (let i = 0; i < 400 && HOUSES.length < 170; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * TOWN.r;
    const x = TOWN.x + Math.cos(a) * rr, z = TOWN.z + Math.sin(a) * rr;
    const w = 8 + R() * 7, d = 7 + R() * 5, h = 5.5 + R() * 4;
    if (HOUSES.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.z - z) < (o.d + d) / 2 + 4)) continue;
    HOUSES.push({ x, z, w, d, h, y: mtnH(x, z) - 0.5, yaw: (R() - 0.5) * 0.6 + Math.atan2(TO_CITY.x, TO_CITY.y), wall: [0xeee6d6, 0xe2d3b4, 0xd9c49c, 0xf2efe8, 0xc9b79a][Math.floor(R() * 5)], roof: [0x5a3428, 0x3a3a3e, 0x6e3a2a, 0x2e3236][Math.floor(R() * 4)], lit: R() });
  }
  {
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), P(0xffffff, 0.8), HOUSES.length);
    const roofG = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6 * 0).translate(0, 0.36, 0);
    const roofs = new THREE.InstancedMesh(roofG, P(0xffffff, 0.7), HOUSES.length);
    HOUSES.forEach((o, i) => {
      q.setFromAxisAngle(up, o.yaw);
      m4.compose(new THREE.Vector3(o.x, o.y, o.z), q, new THREE.Vector3(o.w, o.h, o.d)); walls.setMatrixAt(i, m4); walls.setColorAt(i, c.set(o.wall));
      m4.compose(new THREE.Vector3(o.x, o.y + o.h, o.z), q, new THREE.Vector3(o.w * 1.08, o.h * 0.55, o.d * 1.1)); roofs.setMatrixAt(i, m4); roofs.setColorAt(i, c.set(o.roof));
    });
    add(walls); add(roofs);
    // the church: a nave and a tall white tower with a spire
    const cx = TOWN.x + 30, cz = TOWN.z - 20, cy = mtnH(cx, cz) - 0.5;
    const ch = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(14, 12, 30).translate(0, 6, 0),
      new THREE.BoxGeometry(7, 34, 7).translate(0, 17, 17),
      new THREE.ConeGeometry(5.2, 18, 4).rotateY(Math.PI / 4).translate(0, 43, 17),
    ]), P(0xf0ece4, 0.7));
    ch.position.set(cx, cy, cz); ch.rotation.y = Math.atan2(TO_CITY.x, TO_CITY.y); add(ch);
  }
  // ---- the road and the trail: pale ribbons draped on the slope ----
  const ribbon = (pts, w, col, lift) => {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      const A = [a.x + nx, a.y + lift, a.z + nz], B2 = [a.x - nx, a.y + lift, a.z - nz], C = [b.x + nx, b.y + lift, b.z + nz], D = [b.x - nx, b.y + lift, b.z - nz];
      pos.push(...A, ...B2, ...C, ...B2, ...D, ...C);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return add(new THREE.Mesh(g, P(col, 0.6, { side: THREE.DoubleSide })));
  };
  ribbon(ROAD, 9, 0x8a8a86, -0.9);
  ribbon(TRAIL, 3, 0x9a8a72, -1.2);
  // the hut at the road's end (lit)
  const hutP = ROAD[ROAD.length - 1];
  const hut = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 10).translate(0, 4, 0), P(0x7a5a3a, 0.8));
  hut.position.set(hutP.x + 14, mtnH(hutP.x + 14, hutP.z) - 0.5, hutP.z); add(hut);
  // ---- the summit: a cross, a few boulders ----
  const sy = mtnH(SUMMIT.x, SUMMIT.z);
  const cross = new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(0.22, 4.2, 0.22).translate(0, 2.1, 0),
    new THREE.BoxGeometry(2.0, 0.2, 0.2).translate(0, 3.1, 0),
    new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(0, 0.1, 0),
  ]), P(0x3a2c20, 0.7));
  { const u = 5.6, sd = 0.6; const cx = SUMMIT.x + TO_CITY.x * u - TO_CITY.y * sd, cz = SUMMIT.z + TO_CITY.y * u + TO_CITY.x * sd; cross.position.set(cx, mtnH(cx, cz) - 0.25, cz); } cross.rotation.y = Math.atan2(TO_CITY.x, TO_CITY.y) + 0.4; add(cross);
  {
    const bg = [];
    for (let k = 0; k < 14; k++) {
      const a = R() * 6.28, rr = 5 + R() * 9, x = SUMMIT.x + Math.cos(a) * rr, z = SUMMIT.z + Math.sin(a) * rr;
      bg.push(new THREE.DodecahedronGeometry(0.5 + R() * 0.9, 0).scale(1.2, 0.7, 1).rotateY(R() * 6).translate(x, mtnH(x, z) - 0.15, z));
    }
    add(new THREE.Mesh(mergeGeometries(bg), P(0x4a4846, 0.9, { flatShading: true })));
  }
  // cars on the road (index into it, speed, up or down) and climbers on the trail
  const CARS = Array.from({ length: 14 }, () => ({ k: R(), sp: 0.004 + R() * 0.006, up: R() < 0.7 }));
  const LAMPS = Array.from({ length: 34 }, (_, i) => ({ k: 0.05 + 0.9 * Math.pow(i / 34, 0.8) + R() * 0.02, sp: 0.0012 + R() * 0.001 }));
  const win = new THREE.Vector3();
  return {
    group, HOUSES,
    // lights: town windows and street lamps, the church, car headlights on the road, headlamps on the trail
    frame(v, glows, cam, L) {
      const sz = (x, y, z, base) => Math.max(base, cam.position.distanceTo(win.set(x, y, z)) * 0.0032);
      for (const o of HOUSES) {
        if (o.y + 2 < L || o.lit < 0.15) continue;
        const s = sz(o.x, o.y, o.z, 2);
        glows.add(o.x, o.y + o.h * 0.5, o.z, s, 2.6 * o.lit + 0.6, 1.9 * o.lit + 0.4, 0.9 * o.lit + 0.2);
      }
      for (const c of CARS) {
        const k = ((c.up ? c.k + v * c.sp : c.k - v * c.sp) % 1 + 1) % 1;
        const [x, y, z] = along(ROAD, k);
        if (y < L) continue;
        const s = sz(x, y, z, 1.5);
        if (c.up) glows.add(x, y + 0.8, z, s * 0.8, 3.2, 0.25, 0.1); else glows.add(x, y + 0.8, z, s, 3.4, 3.1, 2.6);
      }
      for (const l of LAMPS) {
        const k = Math.min(0.995, l.k + v * l.sp);
        const [x, y, z] = along(TRAIL, k);
        if (y < L) continue;
        glows.add(x, y + 0.2, z, sz(x, y, z, 0.6) * 0.75, 3.4, 3.3, 3.0);
      }
      if (hut.position.y + 4 > L) glows.add(hut.position.x, hut.position.y + 4, hut.position.z, sz(hut.position.x, hut.position.y, hut.position.z, 2), 3, 2.2, 1.1);
    },
  };
}
