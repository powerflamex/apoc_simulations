// What stands on the beach and the pier, and what the heat does to it:
//   tall fan palms (a thin trunk, a small round crown over a skirt of dead fronds): they brown, flare up, burn to stubs
//   beach umbrellas, towels, chairs: they scorch, smoke, burn and are gone
//   the lifeguard towers (painted huts on stilts), street lamps
//   the pier: a wooden deck on rows of pilings, railings, lamps, the arcade and the restaurant at the end; the Ferris
//   wheel (turning, its rim lit) and the roller coaster around it. It burns (Arcturus) and, once the sea has boiled
//   off from under it, falls in pieces (Rigel)
//   the mountains to the north and Palos Verdes to the south
// Burning is keyed per object from its own seed, so it spreads rather than all at once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALMS, UMBRELLAS, TOWELS, CHAIRS, LIFEGUARD, LAMPS, PEAKS, PIER, WHEEL, landY, groundY, CAM0 } from './layout.js';
// (this scene was built for star-picker, where the stars set everything on fire; tonight nothing burns: every
// ignition time is "never")
const LAND = new Proxy({}, { get: () => 1e9 });
import { patchHeat } from './heat.js';
import { rng, smooth, clamp, lerp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpC = new THREE.Color();

function frond(len) {
  const segs = 6, g = new THREE.PlaneGeometry(1, 1, 1, segs);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getY(i) + 0.5, side = pos.getX(i);
    const s = u * len;
    const w = (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (1 - u * 0.4);
    const y = 0.35 * s - 0.12 * s * s;
    pos.setXYZ(i, side * w, y - Math.abs(side) * 0.12 * w, -s * 0.95);
  }
  g.computeVertexNormals();
  return g;
}

export function makeProps(scene, { plainMat, glowMat, shadowy }) {
  const charred = (m, key, burnK = 1) => patchHeat(m, key, { burnK });
  const T_IGN = (seed, a, b) => a + (b - a) * seed;      // ignition (video s)
  // ---------- palms ----------
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1, 7, 1).translate(0, 0.5, 0);
  const crownGeo = mergeGeometries([
    ...Array.from({ length: 12 }, (_, i) => {
      const g = frond(1.9 + (i % 3) * 0.3);
      g.rotateX(-0.25 + (i % 2) * 0.3);
      g.rotateY((i / 12) * Math.PI * 2 + (i % 2) * 0.2);
      return g.toNonIndexed();
    }),
  ]);
  const skirtGeo = new THREE.ConeGeometry(0.55, 1.8, 8, 1, true).translate(0, -0.6, 0);
  const trunkMat = charred(plainMat(0x8a7a64, 0.95), 'palm-trunk');
  const crownMat = charred(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), 'palm-crown');
  const trunks = shadowy(new THREE.InstancedMesh(trunkGeo, trunkMat, PALMS.length));
  const crowns = shadowy(new THREE.InstancedMesh(crownGeo, crownMat, PALMS.length));
  const skirts = shadowy(new THREE.InstancedMesh(skirtGeo, charred(plainMat(0x6b5536, 0.95, { side: THREE.DoubleSide }), 'palm-skirt'), PALMS.length));
  scene.add(trunks, crowns, skirts);
  const palmTop = [];
  PALMS.forEach((pl, i) => {
    const y0 = pl.y ?? landY(pl.x, pl.z);
    const yaw = pl.seed * 6.28;
    e.set(pl.lean, yaw, 0, 'YXZ'); q.setFromEuler(e);
    m4.compose(p.set(pl.x, y0, pl.z), q, sc.set(1, pl.h, 1));
    trunks.setMatrixAt(i, m4);
    const top = new THREE.Vector3(0, 1, 0).multiply(sc).applyQuaternion(q).add(p);
    m4.compose(top, q.setFromEuler(e.set(0, yaw, 0)), sc.set(1, 1, 1));
    skirts.setMatrixAt(i, m4);
    palmTop.push({ x: top.x, y: top.y, z: top.z, yaw, seed: pl.seed, d: Math.hypot(top.x - CAM0.x, top.z - CAM0.z) });
  });
  // ---------- umbrellas, towels, chairs ----------
  const canopyGeo = new THREE.ConeGeometry(1.15, 0.38, 10, 1, true).translate(0, -0.19, 0);
  const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).translate(0, 0.5, 0);
  const canopyMat = charred(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), 'umb');
  const canopies = shadowy(new THREE.InstancedMesh(canopyGeo, canopyMat, UMBRELLAS.length));
  const poles = shadowy(new THREE.InstancedMesh(poleGeo, charred(plainMat(0xdedede, 0.4, { metalness: 0.5 }), 'pole', 0.5), UMBRELLAS.length + LAMPS.length));
  const umb = UMBRELLAS.map((u) => ({ ...u, y: landY(u.x, u.z), dc: Math.hypot(u.x - CAM0.x, u.z - CAM0.z) }));
  umb.forEach((u, i) => canopies.setColorAt(i, tmpC.set(u.col)));
  // a towel: a thin sheet with a gentle ruck across it; the stripes, the white border and the fringe are drawn on it
  const towelGeo = new THREE.PlaneGeometry(0.9, 1.8, 6, 12).rotateX(-Math.PI / 2);
  {
    const pa = towelGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      pa.setY(i, 0.012 + 0.018 * Math.max(0, Math.sin(z * 5.1 + 0.6)) * (0.6 + 0.4 * Math.cos(x * 4.0)) + 0.01 * Math.sin(x * 7 + z * 3));
    }
    towelGeo.computeVertexNormals();
  }
  const towelAt = TOWELS.map((t) => ({ x: t.x, y: landY(t.x, t.z), z: t.z, dc: Math.hypot(t.x - CAM0.x, t.z - CAM0.z) }));
  const towelMat = charred(plainMat(0xffffff, 0.95, { side: THREE.DoubleSide }), 'towel', 0.35);   // (they scorch, they don't go black)
  {
    const prev = towelMat.onBeforeCompile;
    towelMat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvTU = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU;').replace('#include <color_fragment>', `#include <color_fragment>
        {
          // wide stripes across in the towel's colour and white, a white border, a fringe at the ends
          float st = step(0.5, fract(vTU.y * 7.0));
          vec3 base = diffuseColor.rgb;
          float lum = dot(base, vec3(0.3, 0.59, 0.11));
          vec3 alt = mix(vec3(0.95, 0.94, 0.9), base * 0.55, step(0.75, lum));
          diffuseColor.rgb = mix(base, alt, st * 0.85);
          float bord = 1.0 - step(0.06, min(vTU.x, 1.0 - vTU.x));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88) * (0.6 + 0.4 * lum / max(lum, 0.3)), bord * 0.7);
          float fr = 1.0 - step(0.035, min(vTU.y, 1.0 - vTU.y));
          diffuseColor.rgb *= 1.0 - 0.35 * fr * step(0.5, fract(vTU.x * 30.0));
        }`);
    };
  }
  const towels = shadowy(new THREE.InstancedMesh(towelGeo, towelMat, TOWELS.length));
  TOWELS.forEach((t, i) => {
    e.set(0, t.yaw, 0); q.setFromEuler(e);
    m4.compose(p.set(t.x, towelAt[i].y, t.z), q, sc.set(1, 1, 1));
    towels.setMatrixAt(i, m4); towels.setColorAt(i, tmpC.set(t.col));
  });
  const chairGeo = mergeGeometries([
    new THREE.BoxGeometry(0.55, 0.04, 0.55).translate(0, 0.32, 0),
    new THREE.BoxGeometry(0.55, 0.6, 0.04).rotateX(-0.35).translate(0, 0.58, 0.3),
    new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(-0.25, 0.16, -0.25), new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(0.25, 0.16, -0.25),
    new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(-0.25, 0.16, 0.25), new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(0.25, 0.16, 0.25),
  ].map((g) => g.toNonIndexed()));
  const chairs = shadowy(new THREE.InstancedMesh(chairGeo, charred(plainMat(0xffffff, 0.6), 'chair'), CHAIRS.length));
  CHAIRS.forEach((t, i) => {
    e.set(0, t.yaw, 0); q.setFromEuler(e);
    m4.compose(p.set(t.x, landY(t.x, t.z), t.z), q, sc.set(1, 1, 1));
    chairs.setMatrixAt(i, m4); chairs.setColorAt(i, tmpC.set(t.seed < 0.5 ? 0xf2f2ee : t.seed < 0.75 ? 0x2f6db5 : 0xe9b949));
  });
  // ---------- street lamps ----------
  const headGeo = mergeGeometries([
    new THREE.BoxGeometry(0.1, 0.1, 2.2).translate(0, 9.6, -1.1), new THREE.BoxGeometry(0.4, 0.14, 0.7).translate(0, 9.5, -2.1),
  ].map((g) => g.toNonIndexed()));
  const heads = shadowy(new THREE.InstancedMesh(headGeo, charred(plainMat(0x9aa0a6, 0.4, { metalness: 0.6 }), 'lamp', 0.5), LAMPS.length * 2));
  const lampLights = [];
  let hi = 0;
  LAMPS.forEach((l, li) => {
    const y0 = landY(l.x, l.z);
    m4.compose(p.set(l.x, y0, l.z), q.identity(), sc.set(5, 9.7, 5));
    poles.setMatrixAt(UMBRELLAS.length + li, m4);
    for (const s of [1, -1]) {
      e.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0); q.setFromEuler(e);   // arms reach out over the road
      m4.compose(p.set(l.x, y0, l.z), q, sc.set(1, 1, 1));
      heads.setMatrixAt(hi++, m4);
      lampLights.push([l.x - s * 2.1, y0 + 9.4, l.z]);
    }
  });
  // ---------- lifeguard towers ----------
  const hutGeo = new THREE.BoxGeometry(3.0, 2.3, 2.6).translate(0, 1.6 + 1.15, 0);
  const lgWood = charred(plainMat(0xf2efe8, 0.8), 'lg-wood');
  const lgGroup = [];
  for (const lg of LIFEGUARD) {
    const g = new THREE.Group();
    const y0 = landY(lg.x, lg.z);
    g.position.set(lg.x, y0, lg.z); g.rotation.y = lg.yaw;
    g.add(shadowy(new THREE.Mesh(hutGeo, charred(plainMat(lg.col, 0.75), `lg-${lg.col}`))));
    const frame = mergeGeometries([
      ...[[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]].map(([x, z]) => new THREE.BoxGeometry(0.16, 1.7, 0.16).translate(x, 0.85, z).toNonIndexed()),
      new THREE.BoxGeometry(3.5, 0.12, 3.1).translate(0, 4.1, 0).toNonIndexed(),               // the roof
      new THREE.BoxGeometry(3.4, 0.1, 1.0).translate(0, 1.6, -1.8).toNonIndexed(),             // the deck in front
      new THREE.BoxGeometry(1.0, 0.08, 4.2).rotateX(-0.36).translate(0, 0.8, 3.2).toNonIndexed(),   // the ramp
      new THREE.BoxGeometry(2.4, 1.0, 0.04).translate(0, 2.7, -1.31).toNonIndexed(),           // the window (front)
    ]);
    g.add(shadowy(new THREE.Mesh(frame, lgWood)));
    scene.add(g);
    lgGroup.push({ g, seed: lg.x * 0.01 % 1 });
  }
  scene.add(canopies, poles, towels, chairs, heads);

  // ---------- the pier ----------
  // built in 30 m sections along x so that it can fall apart; each section: deck, pilings, railings, lamps
  const deckMat = charred(plainMat(0x8f7a60, 0.9), 'pier-deck');
  const pileMat = charred(plainMat(0x5d4f40, 0.95), 'pier-pile');
  const railMat = charred(plainMat(0xe8e4dc, 0.7), 'pier-rail');
  const SECT = [];
  const parkZ0 = PIER.z - PIER.w / 2, parkZ1 = PIER.z + PIER.parkW - PIER.w / 2;
  for (let x1 = PIER.x0; x1 > PIER.x1; x1 -= 30) {
    const x0 = Math.max(PIER.x1, x1 - 30), xm = (x0 + x1) / 2, len = x1 - x0;
    const park = xm > PIER.park[0] && xm < PIER.park[1];
    const za = PIER.z - PIER.w / 2, zb = park ? parkZ1 : PIER.z + PIER.w / 2;
    const deck = [new THREE.BoxGeometry(len, 0.6, zb - za).translate(0, -0.3, (za + zb) / 2 - PIER.z)];
    const piles = [], rails = [];
    for (let x = x0 + 3; x < x1; x += 7) for (let z = za + 1.5; z < zb; z += 5.2) {
      if (x > 150) continue;                         // (the road and the walk pass under a bridge)
      const bed = groundY(x, z);
      const hgt = PIER.deck - 0.6 - bed;
      if (hgt > 0.3) piles.push(new THREE.CylinderGeometry(0.28, 0.32, hgt, 6).translate(x - xm, -0.6 - hgt / 2, z - PIER.z));
      piles.push(new THREE.BoxGeometry(0.3, 0.5, zb - za).translate(x - xm, -0.9, (za + zb) / 2 - PIER.z));   // the crossbeams
    }
    for (const z of [za + 0.15, zb - 0.15]) {
      rails.push(new THREE.BoxGeometry(len, 0.08, 0.08).translate(0, 1.05, z - PIER.z));
      rails.push(new THREE.BoxGeometry(len, 0.05, 0.05).translate(0, 0.55, z - PIER.z));
      for (let x = x0 + 1; x < x1; x += 2.5) rails.push(new THREE.BoxGeometry(0.06, 1.05, 0.06).translate(x - xm, 0.52, z - PIER.z));
    }
    const g = new THREE.Group();
    g.position.set(xm, PIER.deck, PIER.z);
    g.add(shadowy(new THREE.Mesh(mergeGeometries(deck.map((x) => x.toNonIndexed())), deckMat)));
    if (piles.length) g.add(shadowy(new THREE.Mesh(mergeGeometries(piles.map((x) => x.toNonIndexed())), pileMat)));
    g.add(shadowy(new THREE.Mesh(mergeGeometries(rails.map((x) => x.toNonIndexed())), railMat)));
    scene.add(g);
    // lamps along both rails (glow at dusk), and points along the deck where it burns
    const lamps = [], burn = [];
    for (let x = x0 + 4; x < x1; x += 12) for (const z of [za + 0.4, zb - 0.4]) lamps.push([x, z]);
    for (let x = x0 + 2; x < x1; x += 4.5) for (let z = za + 2; z < zb - 1; z += 6.5) burn.push([x, z, (x * 13.7 + z * 7.1) % 1]);
    SECT.push({ g, xm, x0, x1, za, zb, lamps, burn, fallSeed: ((xm * 0.37) % 1 + 1) % 1, inSea: xm < 0 });
  }
  // buildings on the deck: the carousel house near the shore, arcades, a restaurant at the end
  const bmat = (c) => charred(plainMat(c, 0.75), `pier-b-${c}`);
  const PB = [
    [190, PIER.z + 2, 26, 14, 9, 0xf3efe6], [150, PIER.z - 3, 16, 9, 5, 0xe6d8bf], [-30, PIER.z - 4, 22, 8, 5, 0x3a6ea8],
    [-235, PIER.z, 18, 10, 5.5, 0xf2f0ea], [-305, PIER.z, 34, 15, 6, 0xf3eee2], [-265, PIER.z + 5, 10, 6, 4, 0xd5463c],
  ];
  const pierB = PB.map(([x, z, lx, lz, h, c]) => {
    const g = new THREE.Group();
    g.position.set(x, PIER.deck, z);
    g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(lx, h, lz).translate(0, h / 2, 0), bmat(c))));
    g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(lx + 1.2, 0.35, lz + 1.2).translate(0, h + 0.18, 0), bmat(0xc9c2b6))));
    scene.add(g);
    return { g, x, z };
  });
  // ---------- the Ferris wheel ----------
  const wheel = new THREE.Group();          // its base on the deck; the turning part around the hub
  wheel.position.set(WHEEL.x, PIER.deck, WHEEL.z);
  const turn = new THREE.Group();
  turn.position.set(0, WHEEL.hub - PIER.deck, 0);
  wheel.add(turn);
  const steel = charred(plainMat(0xf4f4f2, 0.45, { metalness: 0.4 }), 'wheel-steel', 0.6);
  const rimGeo = mergeGeometries([
    new THREE.TorusGeometry(WHEEL.r, 0.22, 6, 72).toNonIndexed(),
    new THREE.TorusGeometry(WHEEL.r - 1.6, 0.12, 5, 64).toNonIndexed(),
    ...Array.from({ length: 20 }, (_, i) => new THREE.BoxGeometry(0.1, WHEEL.r, 0.1).translate(0, WHEEL.r / 2, 0).rotateZ((i / 20) * Math.PI * 2).toNonIndexed()),
    new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12).rotateX(Math.PI / 2).toNonIndexed(),
  ]);
  const rim = shadowy(new THREE.Mesh(rimGeo, steel));
  turn.add(rim);
  const legs = mergeGeometries([-1, 1].flatMap((sz) => [-1, 1].map((sx) => {
    const g = new THREE.CylinderGeometry(0.25, 0.35, WHEEL.hub - PIER.deck + 1, 6).translate(0, (WHEEL.hub - PIER.deck) / 2, 0);
    g.rotateZ(sx * 0.32); g.translate(sx * 2.7, 0, sz * 1.6);
    return g.toNonIndexed();
  })));
  wheel.add(shadowy(new THREE.Mesh(legs, steel)));
  const gondGeo = new THREE.BoxGeometry(1.5, 1.4, 1.2).translate(0, -0.9, 0);
  const GCOL = [0xe94f37, 0xf6c445, 0x3b8ed0, 0x6dbf73, 0xff7f2a, 0x8e44ad, 0x16a085, 0xff9ec4];
  const gondolas = shadowy(new THREE.InstancedMesh(gondGeo, charred(plainMat(0xffffff, 0.6), 'gondola'), 20));
  for (let i = 0; i < 20; i++) gondolas.setColorAt(i, tmpC.set(GCOL[i % GCOL.length]));
  wheel.add(gondolas);
  scene.add(wheel);
  // ---------- the roller coaster around it ----------
  const coaster = new THREE.Group();
  coaster.position.set(0, 0, 0);
  const cpts = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const cx = -118 + Math.cos(a) * 62, cz = PIER.z + 14 + Math.sin(a) * 14;
    cpts.push(new THREE.Vector3(cx, PIER.deck + 5 + 5 * Math.max(0, Math.sin(a * 2 + 0.6)) + 2.5 * Math.sin(a * 5), cz));
  }
  const curve = new THREE.CatmullRomCurve3(cpts, true);
  const trackMat = charred(plainMat(0xf2c230, 0.5, { metalness: 0.3 }), 'coaster', 0.6);
  const supMat = charred(plainMat(0xeeeeee, 0.6), 'coaster-sup', 0.6);
  const rails2 = [];
  for (const off of [-0.55, 0.55]) {
    const pts = curve.getSpacedPoints(400).map((pt, k, arr) => {
      const t = curve.getTangentAt(k / 400);
      const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
      return pt.clone().addScaledVector(side, off);
    });
    rails2.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 400, 0.12, 5, true).toNonIndexed());
  }
  coaster.add(shadowy(new THREE.Mesh(mergeGeometries(rails2), trackMat)));
  const sups = [];
  curve.getSpacedPoints(70).forEach((pt) => { const hgt = pt.y - PIER.deck; sups.push(new THREE.CylinderGeometry(0.12, 0.12, hgt, 5).translate(pt.x, PIER.deck + hgt / 2, pt.z).toNonIndexed()); });
  coaster.add(shadowy(new THREE.Mesh(mergeGeometries(sups), supMat)));
  scene.add(coaster);

  // ---------- the mountains ----------
  const R = rng(55);
  for (const [px, pz, rad, hgt] of PEAKS) {
    const prof = [];
    for (let k = 0; k <= 24; k++) { const u = k / 24; prof.push(new THREE.Vector2(Math.max(Math.pow(1 - Math.pow(u, 1.5), 0.85), 0.001), u)); }
    const g = new THREE.LatheGeometry(prof, 48);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    const seed = R() * 100;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const n = Math.sin(ang * 3 + seed) * 0.08 + Math.sin(ang * 7 + y * 6 + seed) * 0.05 + Math.sin(ang * 15 + y * 13) * 0.025;
      pos.setXYZ(i, x * (1 + n) * rad, y * (hgt + 60) * (1 + 0.3 * n) - 60, z * (1 + n) * rad * 0.7);
      const c = [0.22 + 0.06 * R(), 0.24 + 0.05 * R(), 0.15];
      cols.set(c, i * 3);
    }
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(g, patchHeat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95 }), 'peak', { burnK: 0.8 }));
    mesh.position.set(px, 0, pz);
    mesh.receiveShadow = false;
    scene.add(mesh);
  }

  // ---------- per frame: burning, the wheel turning, the pier falling ----------
  const rimLights = [];
  for (let i = 0; i < 48; i++) rimLights.push((i / 48) * Math.PI * 2);
  const v3 = new THREE.Vector3();
  return {
    palmTop, umb, SECT,
    frame(v, s, fire, smoke, glows, cam) {
      const night = s.nightL;
      const cx = cam.position.x, cz = cam.position.z;
      // palms: fronds brown (scorch), flare up, then hang as charred stubs (Vega on)
      PALMS.forEach((pl, i) => {
        const top = palmTop[i];
        const t0 = T_IGN(pl.seed, LAND.vega + 0.4, LAND.vega + 4.5);
        const k = clamp((v - t0) / 3.5);
        const scorch = smooth(LAND.sirius + 1, LAND.vega + 1, v) * 0.6 + smooth(t0 - 1.5, t0, v) * 0.4;
        e.set(0, top.yaw, 0); q.setFromEuler(e);
        const shrink = 1 - 0.7 * smooth(0.3, 1, k);
        m4.compose(p.set(top.x, top.y, top.z), q, sc.set(shrink, 1 - 0.4 * smooth(0.3, 1, k), shrink));
        crowns.setMatrixAt(i, m4);
        crowns.setColorAt(i, tmpC.setRGB(0.2, 0.32, 0.12).lerp(new THREE.Color(0.4, 0.31, 0.15), scorch).lerp(new THREE.Color(0.05, 0.04, 0.03), smooth(0.2, 0.7, k)));
        const burning = k > 0 && k < 1 ? Math.sin(Math.PI * Math.pow(k, 0.6)) : 0;
        const dc = Math.hypot(top.x - cx, top.z - cz);
        if (burning > 0 && dc < 2500) {
          const nF = dc < 150 ? 6 : 3;
          for (let j = 0; j < nF; j++) {
            const a = j / nF * 6.28 + pl.seed * 9;
            fire.add(top.x + Math.cos(a) * 0.9, top.y - 0.8, top.z + Math.sin(a) * 0.9, 1.4, 2.8 + 1.2 * Math.sin(j + v * 3), burning, pl.seed + j * 0.1);
          }
          smoke.puff(top.x, top.y + 3 + (v * 3 % 5), top.z, 2 + burning * 2, 0.22 * burning, 0.12, 0.6 * burning, pl.seed);
        }
      });
      crowns.instanceMatrix.needsUpdate = true; if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      // umbrellas: the canopy scorches and smokes (Sirius), flares, and burns away
      umb.forEach((u, i) => {
        // (the ones near you shade the people sheltering under them through Sirius, and catch fire at Vega)
        const t0 = u.late ? T_IGN(u.seed, LAND.aldebaran + 0.3, LAND.aldebaran + 0.9) : u.near || u.shade ? T_IGN(u.seed, LAND.vega + 0.6, LAND.vega + 2.0) : T_IGN((u.seed + Math.max(0, -u.z) / 300) % 1, LAND.sirius + 3.0, LAND.vega + 5.0);
        const k = clamp((v - t0) / (u.near ? 3.0 : 4.0));
        const left = 1 - smooth(0.35, 1, k);
        e.set(u.tilt, u.seed * 6, 0); q.setFromEuler(e);
        m4.compose(p.set(u.x, u.y, u.z), q, sc.set(1, u.h, 1));
        poles.setMatrixAt(i, m4);
        const top = v3.set(0, u.h, 0).applyQuaternion(q).add(p);
        if (left > 0.02) { m4.compose(top, q, sc.set(left, left, left)); canopies.setMatrixAt(i, m4); } else canopies.setMatrixAt(i, hide);
        canopies.setColorAt(i, tmpC.set(u.col).lerp(new THREE.Color(0.2, 0.15, 0.1), smooth(t0 - 1.5, t0 + 0.2, v) * 0.6).lerp(new THREE.Color(0.04, 0.03, 0.03), smooth(0.05, 0.5, k)));
        const burning = k > 0 && k < 1 ? Math.sin(Math.PI * Math.pow(k, 0.55)) : 0;
        const dc = Math.hypot(u.x - cx, u.z - cz);
        const smo = smooth(t0 - 1.6, t0, v) * (1 - smooth(0.2, 0.6, k));
        if (smo > 0.02 && dc < 160 && dc > 8) for (let j = 0; j < 6; j++) {
          const ph = (v * 0.9 + u.seed * 7 + j / 6) % 1;
          smoke.puff(top.x + ph * 0.8, top.y + 0.1 + ph * 3.5, top.z, 0.22 + ph * 0.5, 0.14 * smo * Math.sin(Math.PI * ph), 0.32, 0.0, u.seed + j);
        }
        if (burning > 0 && dc < 1500) {
          fire.add(top.x, top.y - 0.35, top.z, 1.8 * left + 0.4, 1.8 + 0.8 * burning, burning, u.seed);
          if (dc < 60) fire.add(top.x + 0.4, top.y - 0.4, top.z - 0.3, 1.4 * left + 0.3, 1.4 + 0.6 * burning, burning * 0.8, u.seed + 0.27);
          fire.add(u.x + 0.6, u.y, u.z, 0.6, 0.7, burning * 0.6, u.seed + 0.5);
          if (i % 3 === 0 && dc > 20) for (let j = 0; j < 3; j++) {
            const ph = (v * 0.5 + u.seed * 5 + j / 3) % 1;
            smoke.puff(top.x + ph * 1.5, top.y + 1 + ph * 6, top.z, 0.7 + ph * 1.2, 0.2 * burning * Math.sin(Math.PI * ph), 0.1, 0.5 * burning * (1 - ph), u.seed + j);
          }
        }
      });
      canopies.instanceMatrix.needsUpdate = true; poles.instanceMatrix.needsUpdate = true;
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
      // towels: they smoke first (the dark ones soonest), then burn low with small flames and are left black
      TOWELS.forEach((t, i) => {
        const a = towelAt[i];
        const t0 = t.near ? T_IGN(t.seed, LAND.sirius + 1.2, LAND.sirius + 2.6) : T_IGN(t.seed, LAND.sirius + 1.5, LAND.sirius + 5);
        const k = clamp((v - t0) / 2.5);
        towels.setColorAt(i, tmpC.set(t.col).lerp(new THREE.Color(0.32, 0.2, 0.11), smooth(t0 - 1.0, t0, v) * 0.5).lerp(new THREE.Color(0.11, 0.07, 0.05), smooth(0, 0.6, k) * 0.85));
        const dc = Math.hypot(a.x - cx, a.z - cz);
        if (dc > 90) return;
        const smo = smooth(t0 - 1.2, t0, v) * (1 - smooth(0.5, 1, k)) * smooth(2.5, 4, dc);
        if (smo > 0.02) for (let j = 0; j < 3; j++) {
          const ph = (v * 0.8 + t.seed * 5 + j / 3) % 1;
          smoke.puff(a.x + (j - 1) * 0.35 + ph * 0.6, a.y + 0.1 + ph * 2.4, a.z, 0.12 + ph * 0.4, 0.4 * smo * Math.sin(Math.PI * ph), 0.3, 0.2 * k, t.seed + j);
        }
        const burning = k > 0 && k < 1 ? Math.sin(Math.PI * Math.pow(k, 0.5)) : 0;
        if (burning > 0 && dc > 2.5) for (let j = 0; j < 3; j++) fire.add(a.x + (j - 1) * 0.45, a.y, a.z + (j - 1) * 0.3, 0.7, 0.55 + 0.45 * burning, burning, t.seed + j * 0.31);
      });
      if (towels.instanceColor) towels.instanceColor.needsUpdate = true;
      // street lamps: on in Proxima's dusk
      if (night > 0.02) for (const [x, y, z] of lampLights) if (Math.abs(z - cz) < 700) glows.add(x, y, z, 1.6, 3.5 * night, 2.6 * night, 1.6 * night);

      // ---- the pier: lamps, fire along the deck, then the sections fall into the drained sea ----
      const pf = s.pierFire;
      SECT.forEach((st, si) => {
        // it falls once the sea has gone from under it (the sea-end first), crumpling as it drops
        const k = st.inSea ? smooth(0, 1, (s.pierFall - st.fallSeed * 0.4) / 0.6) : 0;
        st.g.position.y = PIER.deck - (PIER.deck + s.drop * 0.9 + 4) * Math.pow(k, 1.6);
        st.g.rotation.z = (si % 2 ? 1 : -1) * 0.25 * k;
        st.g.rotation.x = (st.fallSeed - 0.5) * 0.4 * k;
        st.k = k;
        const y = st.g.position.y;
        if (night > 0.02 && k === 0) for (const [x, z] of st.lamps) glows.add(x, y + 4, z, 1.0, 3.2 * night, 2.6 * night, 1.8 * night);
        if (pf > 0) {
          for (const [x, z, sd] of st.burn) {
            // it catches from the sea end and the park (the sunlit, dry planks first), burning along to the shore
            // (twice: under Arcturus, put out by Proxima's cold; again under Aldebaran)
            const dt0 = 0.6 + 3.2 * clamp((x + 250) / 480) * sd + 1.5 * sd;
            const ign = (L0) => smooth(L0 + dt0, L0 + dt0 + 1.2, v);
            const b = Math.max(ign(LAND.arcturus) * (1 - s.pierOut), ign(LAND.aldebaran - 0.2)) * (1 - 0.6 * smooth(0.5, 1, k)) * (1 - s.vapor);
            const big = sd < 0.45 ? 1 : 0;      // (it burns in clumps: some planks blaze, others only smoulder)
            if (b > 0.01 && big) fire.add(x, y + 0.1, z, 4 + 5 * sd, (3 + 12 * sd * sd) * (0.4 + 0.6 * b) * (0.8 + 0.4 * Math.sin(v * 2.3 + sd * 40)), b, sd);
            if (b > 0.3 && sd < 0.14 && s.vapor < 0.99) for (let j = 0; j < 3; j++) {
              const ph = (v * 0.2 + sd * 9 + j / 3) % 1;
              smoke.puff(x + ph * 22, y + 6 + ph * 70, z + ph * 6, 4 + ph * 18, 0.22 * b * (1 - smooth(LAND.betelgeuse, LAND.betelgeuse + 0.8, v)) * Math.sin(Math.PI * Math.min(1, ph * 1.3)), 0.05, 0.6 * b * (1 - ph) * (1 - ph), sd + j);
            }
          }
        }
      });
      pierB.forEach((b) => {
        const st = SECT.find((x) => b.x <= x.x1 && b.x >= x.x0) || SECT[0];
        b.g.position.y = st.g.position.y; b.g.rotation.z = st.g.rotation.z;
      });
      // ---- the Ferris wheel: turning slowly, its rim lit; it burns, then topples into the empty sea ----
      const ang = -v * 0.24;
      turn.rotation.z = ang;
      for (let i = 0; i < 20; i++) {
        const a = ang + (i / 20) * Math.PI * 2;
        m4.compose(p.set(Math.cos(a) * WHEEL.r, WHEEL.hub - PIER.deck + Math.sin(a) * WHEEL.r, 0), q.identity(), sc.set(1, 1, 1));
        gondolas.setMatrixAt(i, m4);
      }
      gondolas.instanceMatrix.needsUpdate = true;
      const wst = SECT.find((x) => WHEEL.x <= x.x1 && WHEEL.x >= x.x0);
      const wk = wst ? wst.k : 0;
      wheel.position.y = wst ? wst.g.position.y : PIER.deck;
      wheel.rotation.x = 1.25 * Math.pow(wk, 1.3);                 // over onto its side (to the south)
      coaster.position.y = (wst ? wst.g.position.y : PIER.deck) - PIER.deck;
      coaster.rotation.x = -0.12 * wk;
      if (wk < 0.3) {
        wheel.updateMatrixWorld();
        const lit = Math.max(0.35, night) * (1 - smooth(LAND.arcturus + 1, LAND.arcturus + 3, v));
        for (let i = 0; i < rimLights.length; i++) {
          const a = ang + rimLights[i];
          v3.set(Math.cos(a) * (WHEEL.r + 0.1), WHEEL.hub - PIER.deck + Math.sin(a) * (WHEEL.r + 0.1), 0.3);
          wheel.localToWorld(v3);
          const hue = (i / rimLights.length + v * 0.15) % 1;
          tmpC.setHSL(hue, 0.9, 0.6);
          glows.add(v3.x, v3.y, v3.z, 0.9, tmpC.r * 5 * lit, tmpC.g * 5 * lit, tmpC.b * 5 * lit);
        }
        // the wheel burns: its gondolas and hub flare
        const wf = Math.max(smooth(LAND.arcturus + 1.2, LAND.arcturus + 3.5, v) * (1 - s.pierOut), smooth(LAND.aldebaran + 0.8, LAND.aldebaran + 3.0, v)) * (1 - s.vapor);
        if (wf > 0) for (let i = 0; i < 20; i += 2) {
          const a = ang + (i / 20) * Math.PI * 2;
          v3.set(Math.cos(a) * WHEEL.r, WHEEL.hub - PIER.deck + Math.sin(a) * WHEEL.r - 1.6, 0);
          wheel.localToWorld(v3);
          fire.add(v3.x, v3.y, v3.z, 1.6, 2.4, wf * (0.6 + 0.4 * ((i * 0.37) % 1)), i * 0.07);
        }
      }
    },
  };
}
