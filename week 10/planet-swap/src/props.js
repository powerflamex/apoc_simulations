// What stands on the beach and the pier, and what each place does to it. Nothing resets at a wipe: what burned at
// Mercury's place stays burnt (a canopy that burned away is gone; towels stay black) through Jupiter and Pluto.
//   other people's umbrellas: shade at Venus; frosted at Mars; smoking, then burning away at Mercury
//   towels and chairs: frosted; towels smoke and catch fire at Mercury (dark cloth in 6.7x sunlight)
//   the lifeguard hut and the trucks parked on the sand: their paint blisters and chars at Mercury, the hut's roof
//     burns; snow on them at Jupiter, buried at Pluto (the snow itself is snow.js)
//   the pier, its Ferris wheel (turning, its lights on once it's dark; it stops at Jupiter) and roller coaster
// Every surface takes the shared heat patch (heat.js): char at Mercury, rime at Mars / Jupiter / Pluto.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UMBRELLAS, TOWELS, CHAIRS, LIFEGUARD, VEHICLES, PIER, WHEEL, landY, groundY, CAM0, CAM_FWD, CAM_RIGHT } from './layout.js';
import { makeFleet } from './cars.js';
import { patchHeat } from './heat.js';
import { MER_SMOKE, MER_FIRE, MER_UMB, MER_HUT, JUP_OUT, LAND, DUR } from './sched.js';
import { rng, smooth, clamp, lerp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpC = new THREE.Color(), WET = new THREE.Color(0, 0, 0);
const blown = (t, acc, vmax) => (t <= 0 ? 0 : t < vmax / acc ? 0.5 * acc * t * t : vmax * vmax / (2 * acc) + vmax * (t - vmax / acc));
const fOf = (x, z) => (x - CAM0.x) * CAM_FWD.x + (z - CAM0.z) * CAM_FWD.z;
// Mercury: when each umbrella / towel catches (seconds after Mercury's wipe), and how far it has burned at tt
const umbT0 = (u) => MER_UMB + u.seed * 2.6 + Math.max(0, u.f - 30) * 0.004;
const towT0 = (t) => MER_FIRE + t.seed * 2.8;
const burnK = (tt, t0, dur = 3.0) => clamp((tt - t0) / dur);

export function makeProps(scene, { plainMat, shadowy, glowMat }) {
  const charred = (m, key, burnK = 1) => patchHeat(m, key, { burnK });
  // ---------- umbrellas ----------
  const canopyGeo = new THREE.ConeGeometry(1.15, 0.38, 12, 1, true).translate(0, -0.19, 0);
  const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).translate(0, 0.5, 0);
  const canopyMat = charred(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), 'umb');
  const canopies = shadowy(new THREE.InstancedMesh(canopyGeo, canopyMat, UMBRELLAS.length));
  const poles = shadowy(new THREE.InstancedMesh(poleGeo, charred(plainMat(0xdedede, 0.4, { metalness: 0.5 }), 'pole', 0.5), UMBRELLAS.length));
  const umb = UMBRELLAS.map((u) => ({ ...u, y: landY(u.x), f: fOf(u.x, u.z) }));
  scene.add(canopies, poles);
  // ---------- towels ----------
  const towelGeo = new THREE.PlaneGeometry(0.9, 1.8, 6, 12).rotateX(-Math.PI / 2);
  {
    const pa = towelGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      pa.setY(i, 0.012 + 0.018 * Math.max(0, Math.sin(z * 5.1 + 0.6)) * (0.6 + 0.4 * Math.cos(x * 4.0)) + 0.01 * Math.sin(x * 7 + z * 3));
    }
    towelGeo.computeVertexNormals();
  }
  const towelMat = charred(plainMat(0xffffff, 0.95, { side: THREE.DoubleSide }), 'towel', 0.35);
  {
    const prev = towelMat.onBeforeCompile;
    towelMat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvTU = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU;').replace('#include <color_fragment>', `#include <color_fragment>
        {
          float st = step(0.5, fract(vTU.y * 7.0));
          vec3 base = diffuseColor.rgb;
          float lum = dot(base, vec3(0.3, 0.59, 0.11));
          vec3 alt = mix(vec3(0.95, 0.94, 0.9), base * 0.55, step(0.75, lum));
          diffuseColor.rgb = mix(base, alt, st * 0.85);
          float bord = 1.0 - step(0.06, min(vTU.x, 1.0 - vTU.x));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), bord * 0.7);
        }`);
    };
  }
  const towels = shadowy(new THREE.InstancedMesh(towelGeo, towelMat, TOWELS.length));
  const towelAt = TOWELS.map((t) => ({ ...t, y: landY(t.x), f: fOf(t.x, t.z) }));
  TOWELS.forEach((t, i) => towels.setColorAt(i, tmpC.set(t.col)));
  // ---------- chairs ----------
  const chairGeo = mergeGeometries([
    new THREE.BoxGeometry(0.55, 0.04, 0.55).translate(0, 0.32, 0),
    new THREE.BoxGeometry(0.55, 0.6, 0.04).rotateX(-0.35).translate(0, 0.58, 0.3),
    new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(-0.25, 0.16, -0.25), new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(0.25, 0.16, -0.25),
    new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(-0.25, 0.16, 0.25), new THREE.BoxGeometry(0.04, 0.32, 0.04).translate(0.25, 0.16, 0.25),
  ].map((g) => g.toNonIndexed())).translate(0, -0.35, 0);
  const chairs = shadowy(new THREE.InstancedMesh(chairGeo, charred(plainMat(0xffffff, 0.6), 'chair'), CHAIRS.length));
  CHAIRS.forEach((c, i) => chairs.setColorAt(i, tmpC.set(c.col)));
  scene.add(towels, chairs);
  // ---------- lifeguard huts ----------
  const hutGeo = new THREE.BoxGeometry(3.0, 2.3, 2.6).translate(0, 2.75, 0);
  const lgWood = charred(plainMat(0xf2efe8, 0.8), 'lg-wood');
  const huts = LIFEGUARD.map((lg) => {
    const g = new THREE.Group();
    g.position.set(lg.x, landY(lg.x), lg.z); g.rotation.y = lg.yaw;
    g.add(shadowy(new THREE.Mesh(hutGeo, charred(plainMat(lg.col, 0.75), `lg-${lg.col}`))));
    const frame = mergeGeometries([
      ...[[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]].map(([x, z]) => new THREE.BoxGeometry(0.16, 1.7, 0.16).translate(x, 0.85, z).toNonIndexed()),
      new THREE.BoxGeometry(3.5, 0.12, 3.1).translate(0, 4.1, 0).toNonIndexed(),
      new THREE.BoxGeometry(3.4, 0.1, 1.0).translate(0, 1.6, -1.8).toNonIndexed(),
      new THREE.BoxGeometry(1.0, 0.08, 4.2).rotateX(-0.36).translate(0, 0.8, 3.2).toNonIndexed(),
      new THREE.BoxGeometry(2.4, 1.0, 0.04).translate(0, 2.7, -1.31).toNonIndexed(),
      new THREE.CylinderGeometry(0.035, 0.035, 2.4, 5).translate(1.5, 5.2, 1.0).toNonIndexed(),      // a flagpole on the roof
    ]);
    g.add(shadowy(new THREE.Mesh(frame, lgWood)));
    const flag = shadowy(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 1).translate(0.45, 0, 0), charred(plainMat(0xe23a2a, 0.8, { side: THREE.DoubleSide }), 'flag')));
    flag.position.set(1.5, 6.1, 1.0);
    g.add(flag);
    scene.add(g);
    return { g, flag, lg, x0: lg.x, y0: landY(lg.x), z0: lg.z };
  });
  // ---------- the pier ----------
  const deckMat = charred(plainMat(0x8f7a60, 0.9), 'pier-deck');
  const pileMat = charred(plainMat(0x5d4f40, 0.95), 'pier-pile');
  const railMat = charred(plainMat(0xe8e4dc, 0.7), 'pier-rail');
  const SECT = [];
  const parkZ1 = PIER.z + PIER.parkW - PIER.w / 2;
  for (let x1 = PIER.x0; x1 > PIER.x1; x1 -= 30) {
    const x0 = Math.max(PIER.x1, x1 - 30), xm = (x0 + x1) / 2, len = x1 - x0;
    if (xm > 60) continue;                                     // (out of sight behind the camera)
    const park = xm > PIER.park[0] && xm < PIER.park[1];
    const za = PIER.z - PIER.w / 2, zb = park ? parkZ1 : PIER.z + PIER.w / 2;
    const deck = [new THREE.BoxGeometry(len, 0.6, zb - za).translate(0, -0.3, (za + zb) / 2 - PIER.z)];
    const piles = [], rails = [];
    for (let x = x0 + 3; x < x1; x += 7) for (let z = za + 1.5; z < zb; z += 5.2) {
      const hgt = PIER.deck - 0.6 - groundY(x);
      if (hgt > 0.3) piles.push(new THREE.CylinderGeometry(0.28, 0.32, hgt, 6).translate(x - xm, -0.6 - hgt / 2, z - PIER.z));
      piles.push(new THREE.BoxGeometry(0.3, 0.5, zb - za).translate(x - xm, -0.9, (za + zb) / 2 - PIER.z));
    }
    for (const z of [za + 0.15, zb - 0.15]) {
      rails.push(new THREE.BoxGeometry(len, 0.08, 0.08).translate(0, 1.05, z - PIER.z));
      for (let x = x0 + 1; x < x1; x += 2.5) rails.push(new THREE.BoxGeometry(0.06, 1.05, 0.06).translate(x - xm, 0.52, z - PIER.z));
    }
    const g = new THREE.Group();
    g.position.set(xm, PIER.deck, PIER.z);
    g.add(shadowy(new THREE.Mesh(mergeGeometries(deck.map((x) => x.toNonIndexed())), deckMat)));
    const top = new THREE.Group();                             // (what the wind tears off: the deck, the rails)
    if (piles.length) g.add(shadowy(new THREE.Mesh(mergeGeometries(piles.map((x) => x.toNonIndexed())), pileMat)));
    g.add(shadowy(new THREE.Mesh(mergeGeometries(rails.map((x) => x.toNonIndexed())), railMat)));
    scene.add(g);
    SECT.push({ g, xm, x0, x1, seed: ((xm * 0.37) % 1 + 1) % 1, lamps: Array.from({ length: Math.floor(len / 12) }, (_, k) => [x0 + 4 + k * 12 - xm, za + 0.4 - PIER.z]) });
  }
  const bmat = (c) => charred(plainMat(c, 0.75), `pier-b-${c}`);
  const pierB = [[-30, PIER.z - 4, 22, 8, 5, 0x3a6ea8], [-235, PIER.z, 18, 10, 5.5, 0xf2f0ea], [-305, PIER.z, 34, 15, 6, 0xf3eee2], [-265, PIER.z + 5, 10, 6, 4, 0xd5463c]].map(([x, z, lx, lz, h, c]) => {
    const g = new THREE.Group();
    g.position.set(x, PIER.deck, z);
    g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(lx, h, lz).translate(0, h / 2, 0), bmat(c))));
    g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(lx + 1.2, 0.35, lz + 1.2).translate(0, h + 0.18, 0), bmat(0xc9c2b6))));
    scene.add(g);
    return { g, x, z, seed: ((x * 0.13) % 1 + 1) % 1 };
  });
  // the Ferris wheel
  const wheel = new THREE.Group();
  wheel.position.set(WHEEL.x, PIER.deck, WHEEL.z);
  const turn = new THREE.Group();
  turn.position.set(0, WHEEL.hub - PIER.deck, 0);
  wheel.add(turn);
  const steel = charred(plainMat(0xf4f4f2, 0.45, { metalness: 0.4 }), 'wheel-steel', 0.6);
  turn.add(shadowy(new THREE.Mesh(mergeGeometries([
    new THREE.TorusGeometry(WHEEL.r, 0.22, 6, 72).toNonIndexed(),
    new THREE.TorusGeometry(WHEEL.r - 1.6, 0.12, 5, 64).toNonIndexed(),
    ...Array.from({ length: 20 }, (_, i) => new THREE.BoxGeometry(0.1, WHEEL.r, 0.1).translate(0, WHEEL.r / 2, 0).rotateZ((i / 20) * Math.PI * 2).toNonIndexed()),
    new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12).rotateX(Math.PI / 2).toNonIndexed(),
  ]), steel)));
  const legs = shadowy(new THREE.Mesh(mergeGeometries([-1, 1].flatMap((sz) => [-1, 1].map((sx) => {
    const g = new THREE.CylinderGeometry(0.25, 0.35, WHEEL.hub - PIER.deck + 1, 6).translate(0, (WHEEL.hub - PIER.deck) / 2, 0);
    g.rotateZ(sx * 0.32); g.translate(sx * 2.7, 0, sz * 1.6);
    return g.toNonIndexed();
  }))), steel));
  wheel.add(legs);
  const GCOL = [0xe94f37, 0xf6c445, 0x3b8ed0, 0x6dbf73, 0xff7f2a, 0x8e44ad, 0x16a085, 0xff9ec4];
  const gondolas = shadowy(new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.4, 1.2).translate(0, -0.9, 0), charred(plainMat(0xffffff, 0.6), 'gondola'), 20));
  for (let i = 0; i < 20; i++) gondolas.setColorAt(i, tmpC.set(GCOL[i % GCOL.length]));
  turn.add(gondolas);
  scene.add(wheel);
  // the roller coaster
  const coaster = new THREE.Group();
  {
    const cpts = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      cpts.push(new THREE.Vector3(-118 + Math.cos(a) * 62, PIER.deck + 5 + 5 * Math.max(0, Math.sin(a * 2 + 0.6)) + 2.5 * Math.sin(a * 5), PIER.z + 14 + Math.sin(a) * 14));
    }
    const curve = new THREE.CatmullRomCurve3(cpts, true);
    const rails2 = [];
    for (const off of [-0.55, 0.55]) {
      const pts = curve.getSpacedPoints(300).map((pt, k) => { const t = curve.getTangentAt(k / 300); return pt.clone().addScaledVector(new THREE.Vector3(-t.z, 0, t.x).normalize(), off); });
      rails2.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 300, 0.12, 5, true).toNonIndexed());
    }
    coaster.add(shadowy(new THREE.Mesh(mergeGeometries(rails2), charred(plainMat(0xf2c230, 0.5, { metalness: 0.3 }), 'coaster', 0.6))));
    const sups = [];
    curve.getSpacedPoints(60).forEach((pt) => { const hgt = pt.y - PIER.deck; sups.push(new THREE.CylinderGeometry(0.12, 0.12, hgt, 5).translate(pt.x, PIER.deck + hgt / 2, pt.z).toNonIndexed()); });
    coaster.add(shadowy(new THREE.Mesh(mergeGeometries(sups), charred(plainMat(0xeeeeee, 0.6), 'coaster-sup', 0.6))));
  }
  scene.add(coaster);

  // ---------- the trucks on the sand ----------
  const fleet = makeFleet(scene, VEHICLES.length, { plainMat, glowMat, shadowy });
  VEHICLES.forEach((c, i) => {
    fleet.color(i, c.col, c.kind);
    m4.compose(p.set(c.x, landY(c.x), c.z), q.setFromEuler(e.set(0, c.yaw, 0)), sc.set(1, 1, 1));
    fleet.set(i, m4, false);
  });
  fleet.commit();

  const v3 = new THREE.Vector3();
  const MER_END = DUR.mercury;
  const CHAR = new THREE.Color(0.05, 0.04, 0.035), SCORCH = new THREE.Color(0.2, 0.15, 0.1), TCHAR = new THREE.Color(0.08, 0.05, 0.04);
  return {
    huts, wheel, SECT,
    // key: the place; tt: seconds since its wipe; k: { fire, smoke, parts, glows, cam, lit }
    frame(key, tt, k) {
      const { fire, smoke, glows, cam } = k;
      const cx = cam.position.x, cz = cam.position.z;
      const MER = key === 'mercury', AFTER = key === 'jupiter' || key === 'pluto';
      // Mercury's clock as seen from this stop (after Mercury it is stuck at the end of Mercury's stay)
      const mt = MER ? tt : AFTER ? MER_END : -1e9;
      // Jupiter: the flames go out, what's left smoulders and the smoke thins away
      const ash = key === 'jupiter' ? 1 - smooth(JUP_OUT, JUP_OUT + 3.5, tt) : 0;
      // ---- umbrellas ----
      umb.forEach((u, i) => {
        const t0 = umbT0(u);
        const kb = burnK(mt, t0);
        const left = 1 - smooth(0.35, 1, kb);
        e.set(u.tilt, u.seed * 6, 0); q.setFromEuler(e);
        m4.compose(p.set(u.x, u.y, u.z), q, sc.set(1, u.h, 1)); poles.setMatrixAt(i, m4);
        const top = v3.set(0, u.h, 0).applyQuaternion(q).add(p);
        if (left > 0.02) {
          m4.compose(p.set(top.x, top.y, top.z), q, sc.set(left, left, left));
          canopies.setMatrixAt(i, m4);
        } else canopies.setMatrixAt(i, hide);
        canopies.setColorAt(i, tmpC.set(u.col).lerp(SCORCH, smooth(t0 - 1.6, t0 + 0.2, mt) * 0.6).lerp(CHAR, smooth(0.05, 0.5, kb)));
        const dc = Math.hypot(u.x - cx, u.z - cz);
        if (MER) {
          const burning = kb > 0 && kb < 1 ? Math.sin(Math.PI * Math.pow(kb, 0.55)) : 0;
          const smo = smooth(t0 - 1.8, t0, tt) * (1 - smooth(0.2, 0.6, kb));
          if (smo > 0.02 && dc < 120) for (let j = 0; j < 4; j++) {
            const ph = (tt * 0.9 + u.seed * 7 + j / 4) % 1;
            smoke.puff(top.x + ph * 0.6, top.y + 0.1 + ph * 3.5, top.z, 0.25 + ph * 0.6, 0.16 * smo * Math.sin(Math.PI * ph), 0.32, 0.0, u.seed + j);
          }
          if (burning > 0 && dc < 900) {
            fire.add(top.x, top.y - 0.35, top.z, 1.9 * left + 0.4, 1.9 + 0.9 * burning, burning, u.seed);
            if (dc < 60) fire.add(top.x + 0.4, top.y - 0.4, top.z - 0.3, 1.4 * left + 0.3, 1.4 + 0.6 * burning, burning * 0.8, u.seed + 0.27);
            if (i % 2 === 0 && dc > 12) for (let j = 0; j < 3; j++) {
              const ph = (tt * 0.5 + u.seed * 5 + j / 3) % 1;
              smoke.puff(top.x + ph * 1.5, top.y + 1 + ph * 6, top.z, 0.7 + ph * 1.4, 0.22 * burning * Math.sin(Math.PI * ph), 0.1, 0.5 * burning * (1 - ph), u.seed + j);
            }
          }
        } else if (ash > 0.02 && kb > 0.2 && dc < 120 && i % 2 === 0) {
          for (let j = 0; j < 2; j++) {
            const ph = (tt * 0.6 + u.seed * 5 + j / 2) % 1;
            smoke.puff(top.x + ph * 0.4, top.y - 0.2 + ph * 3, top.z, 0.3 + ph * 0.9, 0.18 * ash * Math.sin(Math.PI * ph), 0.4, 0.12 * ash * (1 - ph) * (1 - smooth(JUP_OUT - 0.2, JUP_OUT + 0.2, tt) * 0.8), u.seed + j);
          }
        }
      });
      canopies.instanceMatrix.needsUpdate = true; poles.instanceMatrix.needsUpdate = true;
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
      // ---- towels: smoking, then burning at Mercury; black after ----
      towelAt.forEach((t, i) => {
        e.set(0, t.yaw, 0); q.setFromEuler(e);
        m4.compose(p.set(t.x, t.y, t.z), q, sc.set(1, 1, 1));
        towels.setMatrixAt(i, m4);
        const tb = towT0(t);
        towels.setColorAt(i, tmpC.set(t.col).lerp(SCORCH, smooth(tb - 1.2, tb, mt) * 0.5).lerp(TCHAR, smooth(tb, tb + 1.5, mt) * 0.9));
        const dc = Math.hypot(t.x - cx, t.z - cz);
        if (MER && dc < 70 && dc > 3) {
          const sm = smooth(tb - 1.2, tb - 0.2, tt) * (1 - smooth(tb + 0.2, tb + 0.8, tt));
          if (sm > 0.02 && i % 2 === 0) { const ph = (tt * 0.8 + t.seed * 6) % 1; smoke.puff(t.x, t.y + 0.1 + ph * 1.6, t.z, 0.15 + ph * 0.5, 0.2 * sm * Math.sin(Math.PI * ph), 0.4, 0, t.seed); }
          const b = smooth(tb, tb + 0.6, tt) * (1 - smooth(tb + 2.5, tb + 4, tt));
          if (b > 0.02) for (let j = 0; j < 2; j++) fire.add(t.x + (j - 0.5) * 0.45, t.y, t.z + (j - 0.5) * 0.3, 0.6, 0.45 + 0.35 * b, b, t.seed + j * 0.31);
        }
      });
      towels.instanceMatrix.needsUpdate = true; if (towels.instanceColor) towels.instanceColor.needsUpdate = true;
      // ---- chairs (they stay put) ----
      CHAIRS.forEach((c, i) => {
        e.set(0, c.yaw, 0); q.setFromEuler(e);
        m4.compose(p.set(c.x, landY(c.x) + 0.35, c.z), q, sc.set(1, 1, 1));
        chairs.setMatrixAt(i, m4);
      });
      chairs.instanceMatrix.needsUpdate = true;
      // ---- the lifeguard huts: the roof catches at Mercury ----
      huts.forEach((h, hi) => {
        h.g.position.set(h.x0, h.y0, h.z0); h.g.rotation.set(0, h.lg.yaw, 0);
        h.flag.rotation.set(0, 0.12 * Math.sin(tt * 3 + hi), 0.15 * Math.sin(tt * 11 + hi));
        h.flag.visible = !(mt > MER_HUT + 0.6);
        const b = MER ? smooth(MER_HUT, MER_HUT + 1.2, tt) : 0;
        const sm = MER ? smooth(MER_HUT - 1.5, MER_HUT, tt) : ash * (mt > MER_HUT ? 1 : 0);
        if (b > 0) for (let j = 0; j < 5; j++) fire.add(h.x0 + (j - 2) * 0.6, h.y0 + 4.2, h.z0 + (j % 2) * 0.8 - 0.4, 1.2, 1.4 + 1.2 * b * Math.abs(Math.sin(j * 1.7 + tt * 2)), b, 0.3 + j * 0.13);
        if (sm > 0.02) for (let j = 0; j < 3; j++) { const ph = (tt * 0.4 + j / 3) % 1; smoke.puff(h.x0 + ph * 3, h.y0 + 5 + ph * 12, h.z0, 1 + ph * 3, 0.28 * sm * Math.sin(Math.PI * ph), MER ? 0.08 : 0.35, 0.4 * b * (1 - ph), j * 0.3); }
      });
      // ---- the trucks: smoke off their blistering paint, then the tyres catch (Mercury) ----
      VEHICLES.forEach((c, i) => {
        const tb = MER_SMOKE + 0.6 + i * 0.5;
        const sm = MER ? smooth(tb, tb + 1.5, tt) : ash;
        if (sm > 0.02) for (let j = 0; j < 5; j++) {
          const ph = (tt * 0.55 + j / 5 + i * 0.3) % 1;
          smoke.puff(c.x + (j - 2) * 0.7, landY(c.x) + 1.2 + ph * 4, c.z + (j % 2 - 0.5) * 1.2, 0.3 + ph * 1.2, 0.22 * sm * Math.sin(Math.PI * ph), MER ? 0.15 : 0.4, 0, i + j * 0.17);
        }
        if (MER && tt > MER_HUT + 0.8 + i * 0.6) {
          const b = smooth(MER_HUT + 0.8 + i * 0.6, MER_HUT + 1.6 + i * 0.6, tt);
          for (let j = 0; j < 4; j++) fire.add(c.x + (j - 1.5) * 0.9, landY(c.x) + 0.3 + 0.5 * (j % 2), c.z + 0.5 * (j - 1.5), 1.3, 1.2 + 0.9 * b * Math.abs(Math.sin(j * 1.9 + tt * 3)), b, 0.7 + i * 0.2 + j * 0.11);
        }
      });
      // ---- the pier and the wheel (turning until Jupiter's cold stops it; one clock for every stop) ----
      const vv = LAND[key] + tt;
      const stopT = LAND.jupiter + 1.8;
      const ang = -0.24 * (Math.min(vv, LAND.jupiter) + Math.max(0, Math.min(vv, stopT) - LAND.jupiter) * (1 - 0.5 * smooth(LAND.jupiter, stopT, Math.min(vv, stopT))));
      turn.rotation.z = ang;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        m4.compose(p.set(Math.cos(a) * WHEEL.r, Math.sin(a) * WHEEL.r, 0), q.setFromEuler(e.set(0, 0, -ang)), sc.set(1, 1, 1));
        gondolas.setMatrixAt(i, m4);
      }
      gondolas.instanceMatrix.needsUpdate = true;
      // the wheel's lights (bright once the day goes dark)
      const lit = k.lit ?? 0.35;
      if (lit > 0.01) {
        wheel.updateMatrixWorld();
        for (let i = 0; i < 40; i++) {
          const a = ang + (i / 40) * Math.PI * 2;
          v3.set(Math.cos(a) * (WHEEL.r + 0.1), WHEEL.hub - PIER.deck + Math.sin(a) * (WHEEL.r + 0.1), 0.3);
          wheel.localToWorld(v3);
          tmpC.setHSL((i / 40 + Math.min(vv, stopT) * 0.15) % 1, 0.9, 0.6);
          glows.add(v3.x, v3.y, v3.z, 0.9, tmpC.r * 4 * lit, tmpC.g * 4 * lit, tmpC.b * 4 * lit);
        }
      }
    },
  };
}
