// The promenade's furniture: the railing along the sea wall, lamp posts, benches, a row of trees that go through
// the seasons (green, gold, bare, blossom; their average once a frame spans a year), and a kiosk whose sign changes
// with every new owner: English at first, then, after a few centuries, words and letters nobody today can read.
import * as THREE from 'three';
import { TREES, LAMPS, POSTS, BENCHES, KIOSK, PROM, coastX } from './layout.js';
import { rng, clamp, smooth, lerp } from './util.js';

const NAMES = ['OCEAN CAFE', 'BAY BIKES', 'SUNSET GELATO', 'FERRY TICKETS', 'SURF & COFFEE', 'PIER 9 TACOS', 'SEA BREEZE',
  'HARBOR NEWS', 'FRESH JUICE', 'BOARDWALK BAR', 'ICE CREAM', 'BAY TOURS', 'TIDE POOL', 'SALT & SAND', 'LOBSTER ROLL', 'SHORE THING'];
const W = 1024, H = 128, ROWS = 32;   // sign atlas: 32 signs, one per row

// a made-up script: each glyph a few strokes from a seeded grid
function drawGlyphs(ctx, x0, y0, n, size, R) {
  ctx.lineWidth = size * 0.11; ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const gx = x0 + k * size * 0.95;
    ctx.beginPath();
    const strokes = 2 + Math.floor(R() * 3);
    for (let s = 0; s < strokes; s++) {
      const pts = [[R(), R()], [R(), R()]];
      if (R() < 0.35) { ctx.moveTo(gx + size * (0.2 + 0.6 * pts[0][0]), y0 + size * (0.2 + 0.6 * pts[0][1])); ctx.arc(gx + size * 0.5, y0 + size * 0.5, size * (0.15 + 0.2 * R()), R() * 6, R() * 6 + 2 + R() * 3); }
      else { ctx.moveTo(gx + size * (0.15 + 0.7 * pts[0][0]), y0 + size * (0.1 + 0.8 * pts[0][1])); ctx.lineTo(gx + size * (0.15 + 0.7 * pts[1][0]), y0 + size * (0.1 + 0.8 * pts[1][1])); }
    }
    ctx.stroke();
  }
}
function signAtlas() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H * ROWS;
  const ctx = c.getContext('2d');
  const R = rng(4321);
  const bgs = ['#1b3a5c', '#7a1f2b', '#f2e6c9', '#0f5c4e', '#2b2b2b', '#e8b33a', '#f4f4f0', '#5b2a6e'];
  for (let i = 0; i < ROWS; i++) {
    const y = i * H;
    const bg = bgs[i % bgs.length];
    ctx.fillStyle = bg; ctx.fillRect(0, y, W, H);
    const light = ['#f2e6c9', '#e8b33a', '#f4f4f0'].includes(bg);
    ctx.fillStyle = ctx.strokeStyle = light ? '#1d1d1d' : '#fff8ec';
    if (i < 16) {
      ctx.font = `700 ${H * 0.58}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(NAMES[i], W / 2, y + H * 0.54, W * 0.92);
    } else {
      const n = 5 + Math.floor(R() * 6), size = H * 0.62;
      drawGlyphs(ctx, (W - n * size * 0.95) / 2, y + H * 0.19, n, size, R);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeProps(scene, { plainMat, glowMat }) {
  const R = rng(55);
  const place = (u, z) => [coastX(z) + u, z];
  // railing: posts and a top rail following the shore
  const steel = plainMat(0x6f7378, 0.4, { metalness: 0.6 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6).translate(0, 0.525, 0), steel, POSTS.length);
  POSTS.forEach((pp, i) => { const [x, z] = place(PROM.rail, pp.z); posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z)); });
  const railPts = POSTS.map((pp) => { const [x, z] = place(PROM.rail, pp.z); return new THREE.Vector3(x, 1.05, z); });
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), POSTS.length * 2, 0.03, 6), steel);
  const rail2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts.map((p) => p.clone().setY(0.55))), POSTS.length * 2, 0.018, 5), steel);
  for (const m of [posts, rail, rail2]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  // lamps
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 8).translate(0, 2.3, 0), plainMat(0x2d3033, 0.5, { metalness: 0.5 }), LAMPS.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 12, 8).translate(0, 4.75, 0), glowMat(new THREE.Color(1, 0.9, 0.7)), LAMPS.length);
  LAMPS.forEach((l, i) => { const [x, z] = place(l.u, l.z); const m = new THREE.Matrix4().makeTranslation(x, 0, z); pole.setMatrixAt(i, m); head.setMatrixAt(i, m); });
  for (const m of [pole, head]) { m.castShadow = m === pole; m.frustumCulled = false; scene.add(m); }
  // benches
  const wood = plainMat(0x7a5a3c, 0.8);
  const benchGeo = new THREE.BoxGeometry(0.5, 0.08, 1.8).translate(0, 0.45, 0);
  const backGeo = new THREE.BoxGeometry(0.06, 0.4, 1.8).translate(0.24, 0.72, 0);
  const benches = new THREE.InstancedMesh(benchGeo, wood, BENCHES.length), backs = new THREE.InstancedMesh(backGeo, wood, BENCHES.length);
  BENCHES.forEach((b, i) => { const [x, z] = place(b.u, b.z); const m = new THREE.Matrix4().makeTranslation(x, 0, z); benches.setMatrixAt(i, m); backs.setMatrixAt(i, m); });
  for (const m of [benches, backs]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  // trees: trunk and a crown of a few blobs; the crown's colour and fullness follow the season
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7).translate(0, 1.6, 0), plainMat(0x4a3a2c, 0.9), TREES.length);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const crowns = new THREE.InstancedMesh(crownGeo, plainMat(0xffffff, 0.85, { flatShading: true }), TREES.length * 3);
  const blobs = [];
  TREES.forEach((t, i) => {
    const [x, z] = place(t.u, t.z);
    trunk.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s)));
    for (let k = 0; k < 3; k++) blobs.push({ x: x + (R() - 0.5) * 1.6 * t.s, y: (3.6 + R() * 1.4) * t.s, z: z + (R() - 0.5) * 1.6 * t.s, r: (1.2 + R() * 0.5) * t.s, seed: R() });
  });
  for (const m of [trunk, crowns]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  // the kiosk, its sign facing you (east, +z)
  const [kx, kz] = place(KIOSK.u, KIOSK.z);
  const kiosk = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(KIOSK.w, KIOSK.h, KIOSK.d).translate(0, KIOSK.h / 2, 0), plainMat(0xe9e2d4, 0.7));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(KIOSK.w + 0.8, 0.18, KIOSK.d + 0.9).translate(0, KIOSK.h + 0.09, 0), plainMat(0x3b6e8f, 0.6));
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.0, KIOSK.d * 0.7).translate(-KIOSK.w / 2 - 0.01, 1.45, 0), plainMat(0x1a1d22, 0.3));
  const atlas = signAtlas();
  const signMat = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: true });
  atlas.repeat.set(1, 1 / ROWS);
  // the big sign: on two posts above the kiosk, turned to face you
  const SW = 9.6, SH = 1.2;
  const sign = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), signMat);
  face.position.set(0, 5.0, 0.09);
  const board = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.3, SH + 0.3, 0.16).translate(0, 5.0, 0), plainMat(0x22262b, 0.6));
  const legs = [-1, 1].map((k) => new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.6, 0.16).translate(k * SW * 0.35, 2.3, -0.1), plainMat(0x2d3033, 0.5)));
  sign.add(face, board, ...legs);
  sign.rotation.y = Math.atan2(-1.0 - kx, 7.0 - kz) - 0.15;
  for (const m of [body, roof, hatch, board, ...legs]) { m.castShadow = true; m.receiveShadow = true; }
  kiosk.add(body, roof, hatch, sign);
  kiosk.position.set(kx, 0, kz);
  scene.add(kiosk);

  const all = [posts, rail, rail2, pole, head, benches, backs, trunk, crowns, kiosk];
  const col = new THREE.Color(), c2 = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const SEASON = [   // day of year -> leaf colour, fullness (deciduous trees at 35° N)
    [0, 0x6b5a45, 0.1], [75, 0x8fa860, 0.35], [100, 0xd9b8c8, 0.75], [125, 0x5f8a3a, 0.95], [200, 0x4d7a30, 1.0],
    [270, 0x6f7f30, 0.95], [300, 0xd08a2a, 0.85], [325, 0xa8502a, 0.5], [345, 0x6b5a45, 0.15], [366, 0x6b5a45, 0.1],
  ];
  const season = (doy) => {
    const d = ((doy % 365.25) + 365.25) % 365.25;
    let i = 0;
    while (d > SEASON[i + 1][0]) i++;
    const k = (d - SEASON[i][0]) / (SEASON[i + 1][0] - SEASON[i][0]);
    col.set(SEASON[i][1]).lerp(c2.set(SEASON[i + 1][1]), k);
    return lerp(SEASON[i][2], SEASON[i + 1][2], k);
  };
  return {
    frame(s, glows, nightGlow) {
      // leaves: this frame's season, or the year's average once a frame spans a year (a soft olive, half full)
      const Ed = s.E / 1440;
      let full = season(s.sun.doy);
      const avg = clamp(Ed / 200);
      col.lerp(c2.set(0x6e7a45), avg); full = lerp(full, 0.65, avg);
      const vis = s.city > 0.02 ? Math.min(1, s.city * 1.5) : 0;
      blobs.forEach((b, i) => {
        const r = b.r * (0.55 + 0.45 * full) * vis;
        m4.compose(p.set(b.x, b.y, b.z), q, sc.set(r, r * 0.85 * (0.4 + 0.6 * full), r));
        crowns.setMatrixAt(i, m4);
        crowns.setColorAt(i, c2.copy(col).multiplyScalar(0.85 + 0.3 * b.seed));
      });
      crowns.instanceMatrix.needsUpdate = true; crowns.instanceColor.needsUpdate = true;
      // the furniture lasts as long as the city does
      for (const m of all) m.visible = s.city > 0.25;
      // the sign: a new owner every ~12 years; after a few centuries the language has changed beyond reading
      const owner = Math.floor(s.Y / 12 + 0.37);
      const R2 = rng(owner * 7 + 3); R2();
      const strange = smooth(250, 800, s.Y);
      const row = R2() < strange ? 16 + Math.floor(R2() * 16) : Math.floor(R2() * 16);
      atlas.offset.set(0, 1 - (row + 1) / ROWS);
      // lamps glow at night
      head.material.color.setRGB(1, 0.9, 0.7).multiplyScalar(0.25 + 3 * nightGlow);
      if (nightGlow > 0.02 && s.city > 0.25) for (const l of LAMPS) { const [x, z] = place(l.u, l.z); glows.add(x, 4.75, z, 2.2, 2.4 * nightGlow, 1.8 * nightGlow, 1.0 * nightGlow); }
    },
  };
}
