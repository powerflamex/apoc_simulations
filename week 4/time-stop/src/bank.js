// A bank's main vault: a steel room (x -3.6..3.6, z -10..0, ceiling 3 m) behind a round door swung open, steel
// shelves down both sides and across the back stacked with bricks of cash (bundles of bills with paper bands).
// You clear it shelf by shelf (BANK_A..BANK_B): the bricks go in order as you pass. A teller and a guard frozen at
// the door; when time runs: the red beacon, the guard's hands to his head.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { BANK_A, BANK_B } from './timeline.js';

const R = rng(31);
export const PATH = [
  [0, 0.6, BANK_A - 0.4], [-2.0, -1.6, BANK_A], [-2.1, -8.2, BANK_A + 1.3], [2.1, -8.2, BANK_A + 2.0], [2.1, -1.6, BANK_B], [0.4, 0.8, BANK_B + 0.5],
];
export function youAt(v) {
  if (v <= PATH[0][2]) return { x: PATH[0][0], z: PATH[0][1], yaw: 0 };
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x0, z0, t0] = PATH[i], [x1, z1, t1] = PATH[i + 1];
    if (v <= t1) { const k = (v - t0) / (t1 - t0); return { x: lerp(x0, x1, k), z: lerp(z0, z1, k), yaw: Math.atan2(-(x1 - x0), -(z1 - z0)), k }; }
  }
  const l = PATH[PATH.length - 1];
  return { x: l[0], z: l[1], yaw: Math.PI };
}
// the bricks: shelves at 4 heights; along the left wall (x = -3.2), the back (z = -9.6), the right wall (x = 3.2)
export const BRICKS = [];
const BW = 0.17, BH = 0.11, BD = 0.075;     // a brick of 1,000 bills: 6.6 x 2.6 in, ~4.3 in tall (laid flat)
for (const [side, a0, a1] of [['L', -1.2, -9.2], ['R', -9.2, -1.2]]) {
  for (const sy of [0.35, 0.95, 1.55, 2.15]) {
    const along = side === 'B' ? [a0, a1] : [Math.max(a0, a1), Math.min(a0, a1)];
    const L = Math.abs(along[1] - along[0]);
    const n = Math.floor(L / (BW + 0.01));
    for (let i = 0; i < n; i++) {
      const a = along[0] + Math.sign(along[1] - along[0]) * (i + 0.5) * (BW + 0.01);
      for (let dpt = 0; dpt < 3; dpt++) for (let lay = 0; lay < 3; lay++) {
        const off = 0.12 + dpt * (BD + 0.12);
        const x = side === 'L' ? -3.4 + off : side === 'R' ? 3.4 - off : a;
        const z = side === 'B' ? -9.85 + off : a;
        BRICKS.push({ x, y: sy + 0.03 + lay * (BH - 0.04) + BH / 2 - 0.02, z, rot: side === 'B' ? 0 : Math.PI / 2, seed: R(), take: 0 });
      }
    }
  }
}
for (const b of BRICKS) {
  let best = 1e9, bt = BANK_A;
  for (let v = BANK_A; v <= BANK_B; v += 0.01) { const p = youAt(v); const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < best) { best = d; bt = v; } }
  b.take = bt + (b.y - 1.2) * 0.08 + (b.seed - 0.5) * 0.1;
}
// the people, on the world clock (wa: world seconds since the alarm): frozen mid-moment while you work; then they react
const sway = (wa, f, ph) => Math.sin(wa * f + ph);
const PEOPLE = [
  // the guard walking in, mid-step: stops dead, hands to his head, looks round
  { shirt: 0x202a3a, pants: 0x1a1d24, skin: SKIN[2], hair: HAIR[0], s: 1.03, pose: (wa) => {
    const r = smooth(0.15, 0.55, wa);
    return { x: 0.95, z: -2.1 - 0.5 * smooth(0, 0.4, wa), yaw: 0.15 * sway(wa, 0.9, 0) * r, walk: 2.2 + wa * 3, stride: 1 - smooth(0, 0.35, wa), armR: 1.65 * r, armL: 1.65 * smooth(0.2, 0.6, wa), look: 0.1 + 0.15 * r };
  } },
  // a teller at the table counting a stack of bills: jumps up, hands to her mouth, backs off
  { shirt: 0xe8e8ee, pants: 0x2a2a30, skin: SKIN[5], hair: HAIR[3], s: 0.95, pose: (wa) => {
    const r = smooth(0.1, 0.5, wa);
    return { x: 0.8 + 0.6 * smooth(0.2, 1.0, wa), z: -4.9, yaw: Math.PI / 2 - 0.9 * r + 0.4 * sway(wa, 1.1, 2) * r, pitch: 0.2 * (1 - r),
      armR: lerp(0.75 + 0.06 * Math.sin(wa * 0 + 1), 1.3, r), armL: lerp(0.7, 1.3, r), look: lerp(-0.3, 0.1, r) };
  } },
  // the manager with a clipboard, checking a shelf: turns round, points at the empty shelves
  { shirt: 0x2a2a30, pants: 0x2a2a30, skin: SKIN[1], hair: HAIR[6], pose: (wa) => {
    const r = smooth(0.2, 0.7, wa);
    return { x: -0.8, z: -5.4, yaw: -Math.PI / 2 + 0.3 - 1.0 * r + 0.6 * sway(wa, 0.8, 1) * smooth(0.8, 1.4, wa), armL: 0.9, armR: lerp(0.2, 1.1, r), look: 0.05 };
  } },
  // a second teller by the door outside, with a cart
  { shirt: 0xc95fa0, pants: 0x1f2a44, skin: SKIN[3], hair: HAIR[1], s: 0.96, pose: (wa) => {
    const r = smooth(0.3, 0.8, wa);
    return { x: -1.3, z: 2.2, yaw: -2.8 + 2.6 * r, armR: lerp(0.6, 1.4, r), armL: lerp(0.6, 0.3, r), look: 0.05 };
  } },
];

export function makeBank(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const std = (c, r = 0.5, m = 0, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
  const steel = std(0x9aa0a6, 0.32, 0.85);
  // the room: brushed steel panels (a grid of seams), a polished floor
  const panelTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#9da3a9'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.04)`; c.fillRect(0, Math.random() * 256, 256, 1); }
    c.fillStyle = '#4a4e52'; c.fillRect(0, 0, 256, 3); c.fillRect(0, 0, 3, 256);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const wallM = std(0xffffff, 0.35, 0.7, { map: panelTex });
  const walls = [
    new THREE.PlaneGeometry(10.5, 3).rotateY(Math.PI / 2).translate(-3.6, 1.5, -4.9),
    new THREE.PlaneGeometry(10.5, 3).rotateY(-Math.PI / 2).translate(3.6, 1.5, -4.9),
    new THREE.PlaneGeometry(7.2, 3).translate(0, 1.5, -10),
  ];
  walls.forEach((g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 2); });
  G.add(new THREE.Mesh(mergeGeometries(walls), wallM));
  G.add(new THREE.Mesh(new THREE.PlaneGeometry(7.2, 13).rotateX(-Math.PI / 2).translate(0, 0, -3.5), std(0x6a6e72, 0.15, 0.5)));
  G.add(new THREE.Mesh(new THREE.PlaneGeometry(7.2, 10.5).rotateX(Math.PI / 2).translate(0, 3, -4.9), std(0xd8dadc, 0.8)));
  // the doorway wall with the round opening, and the great round door swung open on its hinge
  {
    const sh = new THREE.Shape(); sh.moveTo(-3.6, 0); sh.lineTo(3.6, 0); sh.lineTo(3.6, 3); sh.lineTo(-3.6, 3); sh.lineTo(-3.6, 0);
    const hole = new THREE.Path(); hole.absarc(0, 1.25, 1.2, 0, Math.PI * 2, true); sh.holes.push(hole);
    const front = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, -0.3), steel);
    G.add(front);
    const door = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.55, 48).rotateX(Math.PI / 2), std(0xb8bcc0, 0.25, 0.9));
    const bolts = mergeGeometries(Array.from({ length: 16 }, (_, k) => { const a = k / 16 * Math.PI * 2; return new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10).rotateZ(Math.PI / 2).rotateZ(a).translate(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0); }));
    const wheel = mergeGeometries([new THREE.TorusGeometry(0.45, 0.04, 8, 32).translate(0, 0, 0.35), ...[0, 1, 2].map((k) => new THREE.BoxGeometry(0.9, 0.05, 0.05).rotateZ(k * Math.PI / 3).translate(0, 0, 0.35))]);
    door.add(disc, new THREE.Mesh(bolts, std(0xd8dadc, 0.2, 1)), new THREE.Mesh(wheel, std(0xd8c070, 0.25, 1)));
    const pivot = new THREE.Group();
    pivot.position.set(1.3, 1.25, 0.35);
    door.position.set(-1.3, 0, 0.3);
    pivot.add(door);
    pivot.rotation.y = -1.9;
    G.add(pivot);
  }
  // shelves: steel uprights and boards along both sides and the back
  {
    const sh = [];
    for (const sy of [0.35, 0.95, 1.55, 2.15]) {
      sh.push(new THREE.BoxGeometry(0.62, 0.03, 8.2).translate(-3.18, sy, -5.2), new THREE.BoxGeometry(0.62, 0.03, 8.2).translate(3.18, sy, -5.2), new THREE.BoxGeometry(5.8, 0.03, 0.62).translate(0, sy, -9.6));
    }
    for (let z = -1.1; z > -9.4; z -= 1.35) for (const x of [-2.88, 2.88]) sh.push(new THREE.BoxGeometry(0.04, 2.6, 0.04).translate(x, 1.3, z));
    G.add(new THREE.Mesh(mergeGeometries(sh), steel));
  }
  // the bricks (green-grey bills) and their paper bands
  const N = BRICKS.length;
  const brick = new THREE.InstancedMesh(new THREE.BoxGeometry(BW, BH, BD), std(0x7f9172, 0.85), N);
  const band = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, BH + 0.004, BD + 0.004), std(0xe8dcb0, 0.7), N);
  brick.frustumCulled = band.frustumCulled = false;
  G.add(brick, band);
  const tc = new THREE.Color();
  BRICKS.forEach((b, i) => { brick.setColorAt(i, tc.setHSL(0.27, 0.12 + 0.06 * b.seed, 0.42 + 0.08 * b.seed)); band.setColorAt(i, tc.set(b.seed < 0.5 ? 0xe8dcb0 : 0xd8a850)); });
  // the back wall: brass safe-deposit boxes, warm-lit (numbered doors, keyholes)
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = '#3a2a14'; c.fillRect(0, 0, 1024, 512);
    let n = 101;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const w = 64, h = 64, X = x * w, Y = y * h;
      const g = c.createLinearGradient(X, Y, X, Y + h); g.addColorStop(0, '#e8c27a'); g.addColorStop(0.5, '#c99a4a'); g.addColorStop(1, '#9a6e2e');
      c.fillStyle = g; c.fillRect(X + 3, Y + 3, w - 6, h - 6);
      c.fillStyle = '#5a3e18'; c.beginPath(); c.arc(X + w / 2, Y + h * 0.62, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#4a3210'; c.font = 'bold 13px Arial'; c.textAlign = 'center'; c.fillText(String(n++), X + w / 2, Y + 20);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const boxes = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.7).translate(0, 1.45, -9.95), std(0xffffff, 0.35, 0.6, { map: t, emissive: new THREE.Color(0.35, 0.25, 0.1), emissiveMap: t }));
    G.add(boxes);
  }
  // the counting table in the middle, a stack of bills on it
  G.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.8).translate(0, 0.86, -5.1), steel));
  G.add(new THREE.Mesh(mergeGeometries([[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.25], [0.5, 0.25]].map(([x, z]) => new THREE.BoxGeometry(0.05, 0.86, 0.05).translate(x, 0.43, -5.1 + z))), steel));
  G.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.075).translate(0.25, 0.95, -5.0), std(0x7f9172, 0.85)));
  // light: cold white from the ceiling panels; the red beacon by the door
  G.add(new THREE.HemisphereLight(0xf0f4ff, 0x606468, 1.1));
  const lights = [];
  for (const z of [-2, -5, -8]) { const l = new THREE.PointLight(0xf4f8ff, 7, 9, 1.6); l.position.set(0, 2.8, z); G.add(l); lights.push(l); }
  const panels = new THREE.Mesh(mergeGeometries([-2, -5, -8].map((z) => new THREE.PlaneGeometry(1.4, 0.5).rotateX(Math.PI / 2).translate(0, 2.98, z))), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.52, 0.56) }));
  G.add(panels);
  const beacon = new THREE.PointLight(0xff1a10, 0, 12, 1.2); beacon.position.set(0, 2.7, -0.6); G.add(beacon);
  const pmat = std(0xffffff, 0.6);
  const crowd = makeCrowd(G, PEOPLE.length, pmat, { castShadow: false });
  PEOPLE.forEach((p, i) => crowd.color(i, p.shirt, p.pants, p.skin, p.hair));

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function frame(v, s, glows) {
    BRICKS.forEach((b, i) => {
      if (v >= b.take) { brick.setMatrixAt(i, hide); band.setMatrixAt(i, hide); return; }
      m4.compose(v3.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.rot, 0)), s3.set(1, 1, 1));
      brick.setMatrixAt(i, m4); band.setMatrixAt(i, m4);
    });
    brick.instanceMatrix.needsUpdate = band.instanceMatrix.needsUpdate = true;
    if (brick.instanceColor) brick.instanceColor.needsUpdate = band.instanceColor.needsUpdate = true;
    const alarm = v >= 19.6;
    const wa = alarm ? s.W - s.Wresume : 0;
    PEOPLE.forEach((p, i) => {
      const P = p.pose(wa);
      crowd.pose(i, { x: P.x, y: 0, z: P.z, yaw: P.yaw, walk: P.walk || 0, stride: P.stride || 0, armL: P.armL || 0, armR: P.armR || 0, look: P.look || 0, pitch: P.pitch || 0, s: p.s || 1 });
    });
    crowd.commit();
    // the beacon: a rotating red light (a sweep on the world clock)
    const sweep = alarm ? 0.5 + 0.5 * Math.sin(s.W * 9) : 0;
    beacon.intensity = alarm ? 6 + 12 * sweep : 0;
    if (alarm) glows.add(0, 2.85, -0.4, 0.12, 1.2 + 2.2 * sweep, 0.08, 0.04);
  }
  return { G, frame };
}
