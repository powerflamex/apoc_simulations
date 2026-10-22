// The plan (metres), in the camera's frame: you stand at the railing of the Battery's seawall (z = 0) looking
// south-south-west down Upper New York Bay (-z); +x is to your right (west-north-west). Real bearings from the
// Battery are turned a little to fit the tall frame: the Statue of Liberty 2.5 km out just right of centre with the
// setting Sun behind her right shoulder, Governors Island 1 km out on the left, Ellis Island, Liberty State Park and
// Jersey City to the right, Red Hook and Brooklyn to the left. Behind you: the Battery's lawns, Castle Clinton, and
// the towers of Lower Manhattan.
import { rng, clamp, smooth } from './util.js';
import { WATER0, FERRY, FERRY_U, V_FERRY } from './timeline.js';

const at = (deg, d) => ({ x: d * Math.sin(deg * Math.PI / 180), z: -d * Math.cos(deg * Math.PI / 180) });
export const LIB = at(8, 2465);
export const GOV = { ...at(-17, 1000), rx: 380, rz: 210 };
export const ELLIS = at(35, 1500);
export const SUN = { a: 34, el: 5.6 };                         // degrees right of straight ahead (just out of the frame), and up
export const YOU_AT = { x: 0.35, z: 1.1 };
export const CAM = { x: -0.4, y: 3.4, z: 10.5 };

// ---- the land and the harbor floor (height in m; the promenade is y = 0, the harbor normally WATER0) ----
const g2 = (x, z, cx, cz, rx, rz) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
// signed "insideness" of an ellipse (1 inside, falling off over the shore band)
const ell = (x, z, c, rx, rz, band = 25) => clamp(1 - (Math.hypot((x - c.x) / rx, (z - c.z) / rz) - 1) * Math.max(rx, rz) / band);
export function landY(x, z) {
  // Manhattan: everything north of the seawall, the island narrowing as it goes (East River left, Hudson right)
  const manh = z > 0 && x > -720 - 0.15 * z && x < 520 + 0.06 * z;
  if (manh) return z < 12 ? 0 : 0.3;
  // the harbor floor: a step down at the seawall, sloping out to 15-18 m
  let y = WATER0 - (5 + 9 * smooth(-2, -320, z) + 3 * smooth(-500, -1400, z) * g2(x, z, 0, -1500, 900, 2500));
  // islands (fringed by a sloping shore)
  const isl = (k, top) => { if (k > 0) y = Math.max(y, y + (top - y) * k); };
  isl(ell(x, z, GOV, GOV.rx, GOV.rz, 40), 1.2);
  isl(ell(x, z, LIB, 150, 110, 30), 2);
  isl(ell(x, z, ELLIS, 120, 70, 25), 2);
  // New Jersey on the right (Liberty State Park, Jersey City), Brooklyn on the left (Red Hook, the Heights)
  isl(smooth(1100, 1300, x - 0.12 * z), 2.5);
  isl(smooth(-1150, -1350, x + 0.18 * z) * smooth(-3400, -3000, z), 3 + 14 * smooth(-200, 200, z));
  // Staten Island and Bayonne, far off: low hills
  isl(smooth(7600, 8400, -z), 40 + 60 * Math.sin(x / 1700) ** 2);
  return y;
}

// ---- towers ----
// kind 0 low brick/stone, 1 office (punched windows), 2 glass tower, 3 residential; landmark crowns
export const B = [];
{
  const R = rng(1776);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const STONE = [0xb9ad98, 0xa79c8a, 0xcfc4b0, 0x9a8f80, 0xc4b59d, 0x8e8374];
  const GLASS = [0x5d7891, 0x46677a, 0x6f8aa3, 0x4b5a6d, 0x7895ad, 0x3e5568];
  const BRICK = [0x9a4b36, 0x8c5040, 0xa66850];
  const add = (o) => { const b = { seed: R(), ...o }; B.push(b); return b; };
  // Lower Manhattan: blocks north of the park, taller toward the Financial District
  for (let z = 270; z < 1500; z += 46 + R() * 30) for (let x = -620 - 0.15 * z; x < 470 + 0.06 * z; x += 40 + R() * 28) {
    if (R() < 0.18) continue;
    const fd = g2(x, z, -150, 800, 420, 500);              // the Financial District's cluster of towers
    const kind = R() < 0.25 + 0.4 * fd ? 2 : R() < 0.5 ? 1 : R() < 0.5 ? 0 : 3;
    const h = kind === 0 ? 18 + R() * 25 : 40 + Math.pow(R(), 1.5) * (90 + 190 * fd);
    add({ kind, x, z, w: 24 + R() * 20, d: 24 + R() * 18, h, col: kind === 2 ? pick(GLASS) : kind === 0 ? pick(BRICK) : pick(STONE) });
  }
  // Battery Park City along the Hudson (right, behind you): residential towers
  for (let z = 180; z < 900; z += 55 + R() * 25) for (let x = 420; x < 560; x += 45 + R() * 15) add({ kind: 3, x, z, w: 30, d: 28, h: 70 + R() * 70, col: pick(STONE) });
  // landmarks: One World Trade (roof 417 m, the spire to 541 m), 3 WTC, 70 Pine, 40 Wall
  add({ kind: 2, x: 260, z: 1320, w: 62, d: 62, h: 417, col: 0x6f8fa8, landmark: 'owtc' });
  add({ kind: 2, x: 140, z: 1210, w: 50, d: 50, h: 329, col: 0x52687c });
  add({ kind: 2, x: 200, z: 1130, w: 48, d: 44, h: 298, col: 0x7d98ae });
  add({ kind: 1, x: -260, z: 820, w: 40, d: 40, h: 290, col: 0xc9bba2, landmark: 'pine' });
  add({ kind: 1, x: -170, z: 880, w: 38, d: 38, h: 283, col: 0xb3a58e, landmark: 'wall' });
  // Jersey City across the Hudson (right): a cluster of towers, and Brooklyn Heights (left): low
  for (let k = 0; k < 26; k++) add({ kind: R() < 0.7 ? 2 : 3, x: 1450 + R() * 600, z: -250 + R() * 1100, w: 30 + R() * 20, d: 30 + R() * 20, h: 60 + Math.pow(R(), 1.4) * 200, col: pick(GLASS), far: true });
  for (let k = 0; k < 60; k++) add({ kind: 0, x: -1250 - R() * 900, z: -900 + R() * 1600, w: 25 + R() * 25, d: 20 + R() * 25, h: 12 + R() * 25, col: pick(BRICK), far: true });
  // clear the park: nothing south of the park's north edge
  for (let i = B.length - 1; i >= 0; i--) { const b = B[i]; if (!b.far && b.z - b.d / 2 < 250) B.splice(i, 1); }
  for (const b of B) b.y0 = landY(b.x, b.z);
}

// ---- the Battery: trees, lamps, benches; the railing along the seawall ----
export const TREES = [];
export const LAMPS = [];
{
  const R = rng(77);
  for (let k = 0; k < 220; k++) {
    const x = -300 + R() * 640, z = 22 + R() * 210;
    if (Math.hypot(x - 60, z - 90) < 40) continue;            // Castle Clinton
    if (Math.abs(x) < 70 && z < 150) continue;                 // (the lawn in front of the city stays open)
    TREES.push({ x, z, s: 0.8 + R() * 0.6, seed: R() });
  }
  for (let x = -260; x <= 260; x += 18) LAMPS.push({ x, z: 7.5, seed: R() });
}
export const CASTLE = { x: 60, z: 90, r: 28, h: 8.5 };

// ---- people ----
// tourists along the railing (filming, pointing), walkers on the promenade, people on the lawns. Each one sets off
// running for the city at some point (or freezes), on a path planned up front so nobody runs through anybody.
export const PEOPLE = [];
export let YOU = null;
{
  const R = rng(1337);
  const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
  const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];
  const SKIN = [0xf1c8a6, 0xe0ac86, 0xc68a62, 0x9a6440, 0x6e4528, 0xf6d5bd, 0xd59b72];
  const HAIR = [0x1d1612, 0x2e2018, 0x4a3020, 0x6b4a2a, 0xa07a48, 0xd8c08a, 0x8c8c8c, 0x151515];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const mk = (o) => {
    const p = { s: 0.93 + R() * 0.13, ph: R() * 10, seed: R(), col: [pick(SHIRT), pick(PANTS), pick(SKIN), pick(HAIR)], ...o };
    PEOPLE.push(p); return p;
  };
  // where p is at video time v (before they run: standing / strolling; then running away from the water)
  const posAt = (p, v) => {
    if (v < p.vRun) return [p.x + (p.ux || 0) * (v + 3), p.z];
    const x0 = p.x + (p.ux || 0) * (p.vRun + 3);
    const dt = v - p.vRun, d = p.run * (dt - 0.6 * (1 - Math.exp(-dt / 0.6)));
    return [x0 + Math.sin(p.ang) * d, p.z + Math.cos(p.ang) * d];
  };
  const placed = [];
  const clash = (p) => {
    for (let v = -2; v < 40; v += 0.4) {
      const [x, z] = posAt(p, v);
      for (const q of placed) { const [qx, qz] = posAt(q, v); if (Math.abs(qx - x) < 0.9 && Math.abs(qz - z) < 0.9) return true; }
    }
    return false;
  };
  YOU = mk({ x: YOU_AT.x, z: YOU_AT.z, yaw: Math.PI + 0.05, vRun: 1e9, run: 0, ang: 0, you: true, col: [0xf2c14e, 0x2c3e50, 0xe0ac86, 0x2e2018] });
  placed.push(YOU);
  const add = (o) => { const p = mk(o); if (clash(p)) { PEOPLE.pop(); return null; } placed.push(p); return p; };
  // right beside you: a few more, close
  for (const x of [-3.4, -2.3, -1.2, 1.6, 2.7, 3.8]) add({ x: x + (R() - 0.5) * 0.3, z: 1.0 + R() * 0.5, yaw: Math.PI + (R() - 0.5) * 0.4, phone: R() < 0.6, point: R() < 0.25, vRun: 9 + R() * 9, run: 4.5 + R() * 2, ang: (R() - 0.5) * 0.5 });
  // the railing: a row of people looking out, filming, pointing (most turn and run between 6 and 20 s)
  for (let k = 0, n = 0; k < 900 && n < 54; k++) {
    const x = (R() - 0.5) * 120, z = 0.9 + R() * 1.4;
    if (Math.abs(x - YOU_AT.x) < 1.1 || (Math.abs(x - CAM.x) < 1.6 && z > 2)) continue;
    const p = add({ x, z, yaw: Math.PI + (R() - 0.5) * 0.5, phone: R() < 0.5, point: R() < 0.2, vRun: 6 + Math.pow(R(), 0.8) * 16, run: 4.2 + R() * 2.2, ang: (R() - 0.5) * 0.7, kid: R() < 0.06 });
    if (p) n++;
  }
  // the promenade and the lawns: walking along, then running for the city
  for (let k = 0, n = 0; k < 5000 && n < 240; k++) {
    const x = (R() - 0.5) * 180, z = 4 + Math.pow(R(), 1.2) * 110;
    const walk = R() < 0.6;
    const p = add({ x, z, yaw: walk ? (R() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : R() * 6.28, ux: walk ? (R() < 0.5 ? 1 : -1) * (1.1 + R() * 0.4) : 0, vRun: 7 + Math.pow(R(), 0.8) * 17, run: 3.6 + R() * 2.4, ang: (R() - 0.5) * 0.6, kid: R() < 0.05 });
    if (p) { p.yaw = p.ux > 0 ? Math.PI / 2 : p.ux < 0 ? -Math.PI / 2 : p.yaw; n++; }
  }
  for (const p of PEOPLE) { p.posAt = (v) => posAt(p, v); }
}

// ---- cars jammed on State Street / Battery Place, along the park's north edge ----
export const CARS = [];
{
  const R = rng(55);
  for (let x = -330; x < 380; x += 5.6 + R() * 2.5) for (const lane of [255, 259.5]) if (R() < 0.85) CARS.push({ x, z: lane, yaw: lane < 257 ? Math.PI / 2 : -Math.PI / 2, kind: Math.floor(R() * 4), seed: R(), taxi: R() < 0.3 });
}

// ---- boats: the Statue ferry at its dock, a few small boats near the seawall (they settle on the mud as the
//      harbor drains), and the Staten Island Ferry out in the bay heading for its slip ----
export const BOATS = [
  { kind: 'ferry', x: -150, z: -32, yaw: 0.05, len: 40, w: 10, col: 0xf0f2f4 },
  { kind: 'small', x: 90, z: -60, yaw: 0.9, len: 11, w: 3.5, col: 0xffffff },
  { kind: 'small', x: 210, z: -110, yaw: -0.4, len: 9, w: 3, col: 0xd0302a },
  { kind: 'small', x: -40, z: -140, yaw: 1.7, len: 14, w: 4, col: 0x2c4f8a },
  { kind: 'tug', x: 260, z: -380, yaw: 2.4, len: 22, w: 8, col: 0xb8322a },
  { kind: 'small', x: -260, z: -230, yaw: 0.3, len: 10, w: 3.2, col: 0xf2f2f0 },
  // in front of you, on the flats
  { kind: 'small', x: -9, z: -38, yaw: 0.5, len: 9, w: 3, col: 0xc8342c },
  { kind: 'small', x: 14, z: -62, yaw: -1.1, len: 12, w: 3.6, col: 0xf4f4f0 },
  { kind: 'tug', x: -4, z: -150, yaw: 1.2, len: 22, w: 8, col: 0x2f5f8a },
];
export const SIF = { x0: FERRY.x, z0: FERRY.z, len: 94, w: 21, to: { x: -470, z: 30 } };
{
  const dx = SIF.to.x - SIF.x0, dz = SIF.to.z - SIF.z0, L = Math.hypot(dx, dz);
  SIF.ux = dx / L * FERRY_U; SIF.uz = dz / L * FERRY_U; SIF.yaw = Math.atan2(dx, dz);
}
export const ferryAt = (v) => ({ x: SIF.x0 + SIF.ux * Math.min(v, V_FERRY), z: SIF.z0 + SIF.uz * Math.min(v, V_FERRY) });
