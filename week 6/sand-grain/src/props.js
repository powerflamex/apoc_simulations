// What stands on the beach, and what each blast does to it (timed from where it stands, blastAt):
//   the lifeguard tower you're on; rows of hired umbrellas and towels (they fly); palms along the boardwalk (they bend, their
//   crowns go); the pier on its pilings, with a pavilion at the end and a Ferris wheel by the shore (the deck drops piece by
//   piece out from the hit, the wheel topples); boats at anchor (the sea leaves them on the mud); cars on the coast road.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFleet } from './cars.js';
import { PALMS, UMBRELLAS, TOWELS, BOATS, PIER, WHEEL, HIT, CAM0, DECK, groundY, shoreX, bedAt, craterY, rollY } from './layout.js';
import { blastAt, HITS, ROLL_A } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpC = new THREE.Color();
const distH = (x, z) => Math.hypot(x - HIT.x, z - HIT.z);

function frond(len) {
  const segs = 6, g = new THREE.PlaneGeometry(1, 1, 1, segs);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getY(i) + 0.5, side = pos.getX(i), s = u * len;
    const w = (0.2 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (1 - u * 0.4);
    pos.setXYZ(i, side * w, 0.45 * s - 0.2 * s * s, -s * 0.95);
  }
  g.computeVertexNormals();
  return g;
}

export function makeProps(scene, { plainMat, glowMat, shadowy }) {
  // ---------- the lifeguard tower you stand on ----------
  {
    const g = new THREE.Group();
    const white = plainMat(0xf2efe6, 0.7), red = plainMat(0xd8392b, 0.6), wood = plainMat(0xc4a67c, 0.85);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(5.6, 0.14, 7.2), wood, 0, DECK - 0.07, 1.4);
    for (const [x, z] of [[-2.5, -1.8], [2.5, -1.8], [-2.5, 4.5], [2.5, 4.5]]) add(new THREE.CylinderGeometry(0.11, 0.13, DECK, 8), white, x, DECK / 2, z);
    add(new THREE.BoxGeometry(4.6, 2.5, 3.4), white, 0, DECK + 1.25, 3.2);
    add(new THREE.BoxGeometry(5.2, 0.16, 4.2), red, 0, DECK + 2.6, 3.2);
    // a pole with a red flag on the corner
    add(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 6), white, 2.85, DECK + 2.25, -2.05);
    const flag = add(new THREE.PlaneGeometry(1.1, 0.7, 6, 1).translate(0.55, 0, 0), plainMat(0xe0301e, 0.8, { side: THREE.DoubleSide }), 2.85, DECK + 4.1, -2.05);
    g.userData.flag = flag;
    g.position.set(CAM0.x + 0.5, groundY(CAM0.x, CAM0.z + 0.5), CAM0.z + 2.9);
    g.userData.y0 = g.position.y;
    g.rotation.y = -0.28;
    scene.add(g);
    var tower = g;
  }
  // ---------- palms ----------
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 7, 1).translate(0, 0.5, 0);
  const crownGeo = mergeGeometries(Array.from({ length: 12 }, (_, i) => {
    const g = frond(3.6 + (i % 3) * 0.5);
    g.rotateX(-0.2 + (i % 2) * 0.3); g.rotateY((i / 12) * Math.PI * 2 + (i % 2) * 0.2);
    return g.toNonIndexed();
  }));
  const trunks = shadowy(new THREE.InstancedMesh(trunkGeo, plainMat(0x8a7a64, 0.95), PALMS.length));
  const crowns = shadowy(new THREE.InstancedMesh(crownGeo, plainMat(0x3f7f3a, 0.8, { side: THREE.DoubleSide }), PALMS.length));
  scene.add(trunks, crowns);
  const pal = PALMS.map((t) => { const d = distH(t.x, t.z); const b = blastAt(d); return { ...t, y: groundY(t.x, t.z), yaw: t.seed * 6.28, tG: b.t, ax: (t.x - HIT.x) / d, az: (t.z - HIT.z) / d }; });
  // ---------- umbrellas and towels ----------
  const canopyGeo = new THREE.ConeGeometry(1.25, 0.38, 10, 1, true).translate(0, -0.21, 0);
  const poleGeo = new THREE.CylinderGeometry(0.024, 0.024, 1, 5).translate(0, 0.5, 0);
  const canopies = shadowy(new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), UMBRELLAS.length));
  const poles = shadowy(new THREE.InstancedMesh(poleGeo, plainMat(0xdedede, 0.5), UMBRELLAS.length));
  scene.add(canopies, poles);
  const umb = UMBRELLAS.map((u, i) => {
    const d = distH(u.x, u.z), b = blastAt(d), R = rng(i + 31);
    canopies.setColorAt(i, tmpC.set(u.col));
    return { ...u, d, y: groundY(u.x, u.z), tG: b.t, sp: 14 + 16 * R(), up: 7 + 10 * R(), ax: (u.x - HIT.x) / d, az: (u.z - HIT.z) / d, sa: R() * 10 - 5, sb: R() * 10 - 5 };
  });
  const towelGeo = new THREE.PlaneGeometry(0.95, 1.9, 2, 3).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const towelMat = plainMat(0xffffff, 0.95, { side: THREE.DoubleSide });
  towelMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvTU = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU;').replace('#include <color_fragment>', `#include <color_fragment>
      { float st = step(0.5, fract(vTU.y * 7.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.94, 0.9), st * 0.8); }`);
  };
  const towels = shadowy(new THREE.InstancedMesh(towelGeo, towelMat, TOWELS.length));
  towels.castShadow = false;
  scene.add(towels);
  const tow = TOWELS.map((t, i) => {
    towels.setColorAt(i, tmpC.set(t.col));
    const d = distH(t.x, t.z);
    return { ...t, d, y: groundY(t.x, t.z), tG: blastAt(d).t };
  });
  // ---------- the pier: deck pieces (each with its rails and lamp) and rows of pilings ----------
  const SEG = 16, NS = Math.ceil((PIER.x1 - PIER.x0) / SEG);
  const deckGeo = mergeGeometries([
    new THREE.BoxGeometry(SEG - 0.2, 0.5, PIER.w).translate(0, -0.25, 0),
    new THREE.BoxGeometry(SEG - 0.2, 0.08, 0.08).translate(0, 1.0, PIER.w / 2 - 0.1),
    new THREE.BoxGeometry(SEG - 0.2, 0.08, 0.08).translate(0, 1.0, -PIER.w / 2 + 0.1),
    new THREE.BoxGeometry(0.1, 1.0, 0.1).translate(-5, 0.5, PIER.w / 2 - 0.1), new THREE.BoxGeometry(0.1, 1.0, 0.1).translate(5, 0.5, PIER.w / 2 - 0.1),
    new THREE.BoxGeometry(0.1, 1.0, 0.1).translate(-5, 0.5, -PIER.w / 2 + 0.1), new THREE.BoxGeometry(0.1, 1.0, 0.1).translate(5, 0.5, -PIER.w / 2 + 0.1),
    new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6).translate(0, 2.25, PIER.w / 2 - 0.4),
    new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6).translate(0, 2.25, -PIER.w / 2 + 0.4),
  ].map((g) => g.toNonIndexed()));
  const decks = shadowy(new THREE.InstancedMesh(deckGeo, plainMat(0x9c7f5c, 0.9), NS));
  const pileGeo = new THREE.CylinderGeometry(0.28, 0.34, 1, 7).translate(0, 0.5, 0);
  const piles = shadowy(new THREE.InstancedMesh(pileGeo, plainMat(0x4c3a2a, 0.9), NS * 3));
  scene.add(decks, piles);
  const seg = [];
  for (let i = 0; i < NS; i++) {
    const x = PIER.x0 + (i + 0.5) * SEG, R = rng(i + 777);
    const d = Math.abs(x - HIT.x), t0 = HITS[4].t + 0.05 + d / 170 + R() * 0.12;
    const bed = groundY(x, PIER.z);
    seg.push({ x, t0, bed, sa: (R() - 0.5) * 1.8, sb: (R() - 0.5) * 1.1, d, seed: R() });
  }
  // the pavilion at the end: a long white hall with a dome, it goes last
  const pav = new THREE.Group();
  {
    const add = (geo, mat, x, y, z) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); pav.add(m); return m; };
    const wh = plainMat(0xf3eee2, 0.65), roof = plainMat(0x2f8f86, 0.5), glass = plainMat(0x274250, 0.3);
    add(new THREE.BoxGeometry(62, 0.7, 30), plainMat(0x9c7f5c, 0.9), 0, -0.35, 0);
    add(new THREE.BoxGeometry(46, 8, 20), wh, 0, 4, 0);
    add(new THREE.BoxGeometry(46.4, 3.2, 20.4), glass, 0, 4.6, 0);
    add(new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), roof, 0, 8, 0);
    for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(2, 2, 11, 12), wh, s * 23, 5.5, 0); add(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), roof, s * 23, 11, 0); }
    pav.position.set(PIER.x1 + 16, PIER.deck, PIER.z);
    scene.add(pav);
  }
  // the Ferris wheel on its wide platform by the shore
  const wheel = new THREE.Group(), rimG = new THREE.Group();
  const GOND = 18;
  {
    const steel = plainMat(0xe8e6e0, 0.5);
    const plat = shadowy(new THREE.Mesh(new THREE.BoxGeometry(56, 0.6, 30), plainMat(0x9c7f5c, 0.9)));
    plat.position.set(WHEEL.x, PIER.deck - 0.3, WHEEL.z);
    scene.add(plat);
    var wheelPlat = plat;
    for (const s of [-1, 1]) for (const f of [-1, 1]) {
      const leg = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 25, 8), steel));
      leg.position.set(f * 6.2, 11.5, s * 2.8); leg.rotation.z = f * 0.28;
      wheel.add(leg);
    }
    const rim = mergeGeometries([new THREE.TorusGeometry(WHEEL.r, 0.28, 8, 64).translate(0, 0, 1.2), new THREE.TorusGeometry(WHEEL.r, 0.28, 8, 64).translate(0, 0, -1.2),
      ...Array.from({ length: 12 }, (_, i) => { const g = new THREE.CylinderGeometry(0.07, 0.07, WHEEL.r * 2, 5); g.rotateZ(i * Math.PI / 12); return g; })].map((g) => g.toNonIndexed()));
    rimG.add(shadowy(new THREE.Mesh(rim, new THREE.MeshStandardMaterial({ color: 0xf15a3a, roughness: 0.45 }))));
    for (let i = 0; i < GOND; i++) {
      const a = i / GOND * Math.PI * 2;
      const gm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 2.4), plainMat([0xf6c445, 0x3b8ed0, 0xe94f37, 0x29a36a, 0xffffff][i % 5], 0.5)));
      gm.position.set(Math.cos(a) * WHEEL.r, Math.sin(a) * WHEEL.r, 0);
      gm.userData.a = a;
      rimG.add(gm);
    }
    rimG.position.y = WHEEL.hub - PIER.deck;
    wheel.add(rimG);
    wheel.position.set(WHEEL.x, PIER.deck, WHEEL.z);
    scene.add(wheel);
  }
  // ---------- boats ----------
  const hullShape = new THREE.Shape([[0.5, -0.5], [0.5, 0.35], [0, 0.5], [-0.5, 0.35], [-0.5, -0.5]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 0.13, bevelEnabled: false }).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  const boatGeo = mergeGeometries([hull.toNonIndexed(), new THREE.BoxGeometry(0.36, 0.13, 0.2).translate(0, 0.19, 0).toNonIndexed()]);
  const boats = shadowy(new THREE.InstancedMesh(boatGeo, plainMat(0xf6f4ef, 0.45), BOATS.length));
  scene.add(boats);
  const bt = BOATS.map((b) => ({ ...b, o: b.x - shoreX(b.z) }));
  // ---------- cars on the coast road (they stop when the first big blast reaches the road, then they fly) ----------
  const NC = 46;
  const fleet = makeFleet(scene, NC, { plainMat, glowMat, shadowy });
  const R = rng(4411);
  const cars = Array.from({ length: NC }, (_, i) => {
    const lane = i % 4, x = [-120.5, -125.5, -136.5, -141.5][lane], dir = lane < 2 ? -1 : 1;
    fleet.color(i, [0xf2f2f2, 0x1a1a1f, 0xb5242a, 0x2a4f92, 0xc9c9c9, 0xe3b23c][Math.floor(R() * 6)], Math.floor(R() * 4));
    return { x, z0: -520 + R() * 1040, dir, sp: 9 + R() * 4, seed: R(), yaw: dir < 0 ? 0 : Math.PI };
  });
  const flagBase = tower.userData.flag.geometry.attributes.position.array.slice();

  return {
    tower,
    frame(v, s, smoke, glows) {
      const Rc = s.Rc, rollA = ROLL_A * s.roll;
      // the tower rides the ground
      tower.position.y = tower.userData.y0 + s.deckY;
      tower.rotation.x = 0.05 * s.roll * Math.sin(v * 2.7);
      // the flag: flapping, torn straight out by the blasts
      {
        const pa = tower.userData.flag.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const x = flagBase[i * 3];
          pa.setZ(i, Math.sin(x * 5 - v * 9) * 0.1 * x);
        }
        pa.needsUpdate = true;
        tower.userData.flag.geometry.computeVertexNormals();
      }
      pal.forEach((t, i) => {
        const dt = v - t.tG;
        const bend = dt > 0 ? smooth(0, 0.5, dt) : 0;
        e.set(t.lean + t.az * 1.15 * bend, t.yaw * 0, -t.ax * 1.15 * bend, 'XYZ');
        q.setFromEuler(e);
        m4.compose(p.set(t.x, t.y + rollY(distH(t.x, t.z), v, rollA), t.z), q, sc.set(1, t.h, 1));
        trunks.setMatrixAt(i, m4);
        const top = new THREE.Vector3(0, t.h, 0).applyQuaternion(q).add(p);
        const crown = 1 - smooth(0.1, 0.5, dt);
        if (crown <= 0) crowns.setMatrixAt(i, hide);
        else { m4.compose(top, q.setFromEuler(e.set(0, t.yaw, 0)), sc.setScalar(crown)); crowns.setMatrixAt(i, m4); }
      });
      trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
      umb.forEach((u, i) => {
        const dt = v - u.tG;
        if (u.d < Rc * 1.05) { canopies.setMatrixAt(i, hide); poles.setMatrixAt(i, hide); return; }
        const y0 = u.y + rollY(u.d, v, rollA);
        if (dt <= 0) {
          e.set(u.tilt, 0, u.tilt * 0.7); q.setFromEuler(e);
          m4.compose(p.set(u.x, y0, u.z), q, sc.set(1, u.h, 1)); poles.setMatrixAt(i, m4);
          m4.compose(new THREE.Vector3(0, u.h, 0).applyQuaternion(q).add(p), q, sc.set(1, 1, 1)); canopies.setMatrixAt(i, m4);
        } else {
          // torn out and thrown, tumbling (the pole goes with it)
          const fly = Math.min(dt, (u.up + Math.sqrt(u.up * u.up + 28)) / 14), lie = smooth(fly - 0.3, fly, dt);
          const x = u.x + u.ax * u.sp * fly, z = u.z + u.az * u.sp * fly, y = Math.max(y0 + 0.3, y0 + 1 + u.up * fly - 7 * fly * fly);
          e.set(lerp(u.sa * fly, 1.57, lie), u.sb * fly, u.tilt); q.setFromEuler(e);
          m4.compose(p.set(x, y, z), q, sc.set(1, 1, 1)); canopies.setMatrixAt(i, m4);
          m4.compose(p, q, sc.set(1, 2.1, 1)); poles.setMatrixAt(i, m4);
        }
      });
      canopies.instanceMatrix.needsUpdate = true; poles.instanceMatrix.needsUpdate = true;
      tow.forEach((t, i) => {
        if (v > t.tG || t.d < Rc * 1.1) { towels.setMatrixAt(i, hide); return; }
        e.set(0, t.yaw, 0); q.setFromEuler(e);
        m4.compose(p.set(t.x, t.y + rollY(t.d, v, rollA), t.z), q, sc.set(1, 1, 1));
        towels.setMatrixAt(i, m4);
      });
      towels.instanceMatrix.needsUpdate = true;
      // the pier goes, piece by piece, out from the hit
      seg.forEach((g, i) => {
        const dt = v - g.t0, fall = Math.max(0, dt);
        const y = Math.max(g.bed + 0.4, PIER.deck - 4.9 * fall * fall);
        const landed = PIER.deck - 4.9 * fall * fall < g.bed + 0.4;
        const ang = Math.min(fall, 1.1) * 0.8;
        e.set(g.sb * ang, 0, g.sa * ang); q.setFromEuler(e);
        const shove = 18 * (1 - Math.exp(-fall / 0.5)) * clamp(1.4 - g.d / 200) * Math.sign(g.x - HIT.x || 1);
        if (g.d < Rc * 0.9) decks.setMatrixAt(i, hide);
        else { m4.compose(p.set(g.x + shove, y, PIER.z), q, sc.set(1, 1, 1)); decks.setMatrixAt(i, m4); }
        for (let k = 0; k < 3; k++) {
          const zz = PIER.z + (k - 1) * (PIER.w / 2 - 0.5), hh = PIER.deck + 2 - g.bed;
          const lean = smooth(0, 1.2, fall) * (0.7 + 0.5 * Math.sin(g.seed * 40 + k)) * Math.sign(g.x - HIT.x || 1);
          if (g.d < Rc * 0.9) { piles.setMatrixAt(i * 3 + k, hide); continue; }
          e.set(0, 0, -lean * 1.1); q.setFromEuler(e);
          m4.compose(p.set(g.x, g.bed - 2, zz), q, sc.set(1, hh, 1));
          piles.setMatrixAt(i * 3 + k, m4);
        }
      });
      decks.instanceMatrix.needsUpdate = true; piles.instanceMatrix.needsUpdate = true;
      // the pavilion: the last thing to go, sliding down on its broken legs
      {
        const t0 = HITS[4].t + 0.05 + (PIER.x1 - HIT.x) / 170, f = Math.max(0, v - t0);
        pav.position.y = Math.max(groundY(PIER.x1 + 16, PIER.z) + 1, PIER.deck - 3 * f * f);
        pav.rotation.z = -Math.min(f * 0.1, 0.16); pav.rotation.x = Math.min(f * 0.05, 0.08);
      }
      // the wheel: turning, then it drops off the platform and topples north
      {
        const t0 = HITS[4].t + 0.2, f = Math.max(0, v - t0);
        rimG.rotation.z = v * 0.1 + 0.9 * Math.min(f, 3) * Math.min(f, 3) * 0.12;
        for (const m of rimG.children) if (m.userData.a !== undefined) m.rotation.z = -rimG.rotation.z;
        wheel.rotation.x = -1.45 * Math.pow(smooth(0, 2.0, f), 2);
        wheel.position.y = PIER.deck - 8 * smooth(0, 1.2, f);
        wheel.position.x = WHEEL.x + 14 * smooth(0, 2, f);
        wheel.visible = s.Rc < 48;
        wheelPlat.position.y = Math.max(groundY(WHEEL.x, WHEEL.z) + 0.3, PIER.deck - 0.3 - 4.9 * f * f);
        wheelPlat.rotation.z = -0.22 * smooth(0, 1, f); wheelPlat.visible = s.Rc < 40;
      }
      // the boats: riding the swell, then down on the mud with the sea gone from under them
      bt.forEach((b, i) => {
        const depth = s.seaY - bedAt(b.o);
        const float = smooth(0.0, 1.0, depth);
        const y = Math.max(s.seaY, bedAt(b.o) + 0.15) + 0.2 + Math.sin(v * 0.9 + b.seed * 9) * 0.12 * float;
        e.set(Math.sin(v * 0.7 + b.seed * 7) * 0.03 * float, b.yaw, (1 - float) * (b.seed - 0.5) * 0.7, 'YXZ'); q.setFromEuler(e);
        m4.compose(p.set(b.x, y, b.z), q, sc.set(b.L * 0.34, b.L * 0.5, b.L));
        boats.setMatrixAt(i, m4);
      });
      boats.instanceMatrix.needsUpdate = true;
      // the cars
      cars.forEach((c, i) => {
        const z = c.z0 + c.dir * c.sp * Math.min(v, 14 + c.seed * 2);
        const d = distH(c.x, z), tG = blastAt(d).t, dt = v - tG;
        let x = c.x, zz = z, y = 3.2 + 0.05;
        e.set(0, c.yaw, 0, 'YXZ');
        if (dt > 0) {
          const ax = (c.x - HIT.x) / d, az = (z - HIT.z) / d;
          x += ax * 26 * dt; zz += az * 26 * dt; y = Math.max(3.25, y + 6 * dt - 5 * dt * dt);
          e.set(dt * 2.4 * (c.seed - 0.5), c.yaw + dt, dt * 3 * (c.seed - 0.2), 'YXZ');
        }
        q.setFromEuler(e);
        m4.compose(p.set(x, y, zz), q, sc.set(1, 1, 1));
        fleet.set(i, m4, false);
      });
      fleet.commit();
    },
  };
}
