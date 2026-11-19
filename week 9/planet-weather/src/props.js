// What stands on the beach and the pier, and what each world's weather does to it (each stop starts fresh):
//   other people's umbrellas: flapping (Jupiter, Mars), scorched then burning away (Venus), wet (Titan), blown inside
//     out and torn away tumbling (Saturn), all ripped off at once (Neptune)
//   towels and chairs: dusted, frosted, charred; lifted and blown away (Saturn, Neptune)
//   the lifeguard hut by the water: struck by lightning (Jupiter), smoking and burning (Venus), torn loose (Neptune)
//   the pier, its Ferris wheel (turning; spun by the wind; torn off by Neptune's) and roller coaster
// Every surface takes the shared heat patch (heat.js): char at Venus, red dust at Mars, rime at Mars / Titan / Neptune.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UMBRELLAS, TOWELS, CHAIRS, LIFEGUARD, PIER, WHEEL, landY, groundY, CAM0, CAM_FWD, CAM_RIGHT } from './layout.js';
import { patchHeat } from './heat.js';
import { STRIKES, marsR, marsHit, VEN_FIRE, NEP_PIER, satFrontT } from './sched.js';
import { rng, smooth, clamp, lerp } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
const hide = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpC = new THREE.Color(), WET = new THREE.Color(0, 0, 0);
const blown = (t, acc, vmax) => (t <= 0 ? 0 : t < vmax / acc ? 0.5 * acc * t * t : vmax * vmax / (2 * acc) + vmax * (t - vmax / acc));
const fOf = (x, z) => (x - CAM0.x) * CAM_FWD.x + (z - CAM0.z) * CAM_FWD.z;
// Saturn: half of everything goes in the first gust, the rest when the second gust's front reaches it
const angOf = (x, z) => Math.atan2((x - CAM0.x) * CAM_RIGHT.x + (z - CAM0.z) * CAM_RIGHT.z, fOf(x, z));
const satT = (x, z, seed, early) => (seed < 0.5 ? early : satFrontT(angOf(x, z)) + 0.15 * (seed - 0.5));

export function makeProps(scene, { plainMat, shadowy }) {
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

  const v3 = new THREE.Vector3(), W = new THREE.Vector3(CAM_RIGHT.x, 0, CAM_RIGHT.z);
  // a thing torn loose and blown away: offset along the wind, up in an arc, tumbling
  const fly = (t, seed, acc, vmax, up) => ({ d: blown(t, acc, vmax), y: Math.max(0, up * t * (1 + 2.5 * t) * (0.5 + seed)), spin: t * (4 + 7 * seed) });
  return {
    huts, wheel, SECT,
    // key: the world; tt: seconds since its wipe; k: { fire, smoke, parts, glows, cam, flash }
    frame(key, tt, k) {
      const { fire, smoke, parts, glows, cam } = k;
      const cx = cam.position.x, cz = cam.position.z;
      const J = key === 'jupiter', M = key === 'mars', V = key === 'venus', T = key === 'titan', S = key === 'saturn', N = key === 'neptune';
      const wind = J ? 0.5 : M ? 0.8 : S ? 1 : N ? 1 : 0.1;
      // ---- umbrellas ----
      umb.forEach((u, i) => {
        let t0 = 1e9;                                   // Venus: when it catches
        if (V) t0 = VEN_FIRE - 0.3 + u.seed * 3.2 + Math.max(0, u.f - 30) * 0.004;
        const kb = clamp((tt - t0) / 3.0);
        const left = 1 - smooth(0.35, 1, kb);
        // flapping in the gusts (Mars: once the dust reaches it)
        const gust = (J ? 0.5 + 0.5 * Math.sin(tt * 1.3 + u.seed * 9) : 0) + (M ? smooth(-0.4, 0.2, tt - marsHit(u.f)) : 0);
        let tilt = u.tilt + gust * 0.08 * Math.sin(tt * 9 + u.seed * 20), flip = 0;
        let fx = 0, fy = 0, spin = 0, poleGone = false;
        if (S || N) {
          const tf = S ? 0.2 + u.seed * 0.7 : 0.02 + u.seed * 0.25;
          flip = smooth(tf, tf + 0.12, tt);
          const tr = S ? satT(u.x, u.z, u.seed, 0.6 + u.seed * 3.0) : 0.15 + u.seed * 0.9;
          if (tt > tr) { const fl = fly(tt - tr, u.seed, S ? 35 : 90, S ? 70 : 200, S ? 2.2 : 4); fx = fl.d; fy = fl.y; spin = fl.spin; }
          poleGone = N && tt > 1.2 + u.seed * 2.5;
        }
        e.set(tilt, u.seed * 6, 0); q.setFromEuler(e);
        if (poleGone) poles.setMatrixAt(i, hide);
        else { m4.compose(p.set(u.x, u.y, u.z), q, sc.set(1, u.h, 1)); poles.setMatrixAt(i, m4); }
        const top = v3.set(0, u.h, 0).applyQuaternion(q).add(p);
        if (left > 0.02 && fx < 900) {
          if (spin > 0) { e.set(spin * 0.7, u.seed * 6 + spin * 0.4, spin * 0.5); q.setFromEuler(e); }
          m4.compose(p.set(top.x + W.x * fx, top.y + fy, top.z + W.z * fx), q, sc.set(left, left * (1 - 2 * flip), left));
          canopies.setMatrixAt(i, m4);
        } else canopies.setMatrixAt(i, hide);
        canopies.setColorAt(i, tmpC.set(u.col).lerp(new THREE.Color(0.2, 0.15, 0.1), smooth(t0 - 1.5, t0 + 0.2, tt) * 0.6).lerp(new THREE.Color(0.04, 0.03, 0.03), smooth(0.05, 0.5, kb)));
        const dc = Math.hypot(u.x - cx, u.z - cz);
        if (V) {
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
        }
      });
      canopies.instanceMatrix.needsUpdate = true; poles.instanceMatrix.needsUpdate = true;
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
      // ---- towels ----
      towelAt.forEach((t, i) => {
        let fx = 0, fy = 0, spin = 0;
        if ((S || N) && t.f > 9) {
          const tf = (S ? satT(t.x, t.z, t.seed, 0.15 + t.seed * 2.4) : 0.02 + t.seed * 0.4) + (t.near ? 0.1 : 0);
          if (tt > tf) { const fl = fly(tt - tf, t.seed, S ? 40 : 100, S ? 60 : 200, S ? 1.6 : 3); fx = fl.d; fy = fl.y; spin = fl.spin * 1.6; }
        } else if (J || M) {
          spin = 0; fy = 0;
        }
        if (fx > 900) { towels.setMatrixAt(i, hide); return; }
        e.set(spin * 0.9, t.yaw + spin * 0.3, spin * 0.6); q.setFromEuler(e);
        m4.compose(p.set(t.x + W.x * fx, t.y + fy + (spin > 0 ? 0.4 : 0), t.z + W.z * fx), q, sc.set(1, 1, 1));
        towels.setMatrixAt(i, m4);
        if (V) {
          const tb = VEN_FIRE + 0.5 + t.seed * 3;
          towels.setColorAt(i, tmpC.set(t.col).lerp(new THREE.Color(0.11, 0.07, 0.05), smooth(tb, tb + 1.5, tt) * 0.85));
          const dc = Math.hypot(t.x - cx, t.z - cz), b = smooth(tb, tb + 0.6, tt) * (1 - smooth(tb + 2.5, tb + 4, tt));
          if (b > 0.02 && dc < 70 && dc > 3) for (let j = 0; j < 2; j++) fire.add(t.x + (j - 0.5) * 0.45, t.y, t.z + (j - 0.5) * 0.3, 0.6, 0.45 + 0.35 * b, b, t.seed + j * 0.31);
        } else towels.setColorAt(i, tmpC.set(t.col));
      });
      towels.instanceMatrix.needsUpdate = true; if (towels.instanceColor) towels.instanceColor.needsUpdate = true;
      // ---- chairs ----
      CHAIRS.forEach((c, i) => {
        let fx = 0, fy = 0, spin = 0;
        if ((S || N) && (c.x - CAM0.x) * CAM_FWD.x + (c.z - CAM0.z) * CAM_FWD.z > 9) {
          const tf = S ? satT(c.x, c.z, c.seed, 0.6 + c.seed * 3.2) : 0.1 + c.seed * 0.8;
          if (tt > tf) { const fl = fly(tt - tf, c.seed, S ? 20 : 80, S ? 30 : 180, S ? 0.6 : 2.5); fx = fl.d; fy = fl.y; spin = fl.spin; }
        }
        if (fx > 900) { chairs.setMatrixAt(i, hide); return; }
        e.set(spin * 0.8, c.yaw + spin * 0.2, spin); q.setFromEuler(e);
        m4.compose(p.set(c.x + W.x * fx, landY(c.x) + 0.35 + fy, c.z + W.z * fx), q, sc.set(1, 1, 1));
        chairs.setMatrixAt(i, m4);
      });
      chairs.instanceMatrix.needsUpdate = true;
      // ---- the lifeguard huts ----
      huts.forEach((h, hi) => {
        h.g.position.set(h.x0, h.y0, h.z0); h.g.rotation.set(0, h.lg.yaw, 0);
        h.flag.rotation.set(0, (wind > 0.3 ? 0.9 : 0.3) * Math.sin(tt * (3 + 6 * wind) + hi) * 0.4 - (S || N ? 1.2 : 0), 0.15 * Math.sin(tt * 11 + hi));
        if (N) {
          const t = tt - (NEP_PIER - 1.6 + hi * 0.4);
          if (t > 0) {
            const fl = fly(t, 0.5, 40, 120, 1.2);
            h.g.position.set(h.x0 + W.x * fl.d, h.y0 + fl.y, h.z0 + W.z * fl.d);
            h.g.rotation.set(fl.spin * 0.25, h.lg.yaw + fl.spin * 0.1, -fl.spin * 0.5);
          }
        }
        if (V && hi === 0) {
          const b = smooth(VEN_FIRE + 1.0, VEN_FIRE + 2.2, tt);
          if (b > 0) for (let j = 0; j < 5; j++) fire.add(h.x0 + (j - 2) * 0.6, h.y0 + 4.2, h.z0 + (j % 2) * 0.8 - 0.4, 1.2, 1.4 + 1.2 * b * Math.abs(Math.sin(j * 1.7 + tt * 2)), b, 0.3 + j * 0.13);
          for (let j = 0; j < 3; j++) { const ph = (tt * 0.4 + j / 3) % 1; smoke.puff(h.x0 + ph * 3, h.y0 + 5 + ph * 12, h.z0, 1 + ph * 3, 0.28 * b * Math.sin(Math.PI * ph), 0.08, 0.4 * b * (1 - ph), j * 0.3); }
        }
      });
      // ---- the pier and the wheel ----
      let ang = -tt * 0.24;
      if (S) ang = -tt * 0.24 - Math.max(0, tt - 0.3) * Math.max(0, tt - 0.3) * 0.25;
      if (N) ang = -tt * 0.24 - Math.max(0, tt) * Math.max(0, tt) * 0.6;
      turn.rotation.z = ang;
      for (let i = 0; i < 20; i++) {
        const a = ang + (i / 20) * Math.PI * 2;
        m4.compose(p.set(Math.cos(a) * WHEEL.r, WHEEL.hub - PIER.deck + Math.sin(a) * WHEEL.r, 0), q.identity(), sc.set(1, 1, 1));
        gondolas.setMatrixAt(i, m4);
      }
      gondolas.instanceMatrix.needsUpdate = true;
      wheel.position.set(WHEEL.x, PIER.deck, WHEEL.z); wheel.rotation.set(0, 0, 0);
      coaster.position.set(0, 0, 0); coaster.rotation.set(0, 0, 0);
      SECT.forEach((st) => { st.g.position.set(st.xm, PIER.deck, PIER.z); st.g.rotation.set(0, 0, 0); });
      pierB.forEach((b) => { b.g.position.set(b.x, PIER.deck, b.z); b.g.rotation.set(0, 0, 0); });
      if (N) {
        // torn loose: the wheel off its legs, rolling and tumbling away; the coaster and the end of the pier after it
        const t = tt - NEP_PIER;
        if (t > 0) {
          const fl = fly(t, 0.6, 30, 140, 2.5);
          wheel.position.set(WHEEL.x + W.x * fl.d, PIER.deck + fl.y, WHEEL.z + W.z * fl.d);
          wheel.rotation.set(0.3 * fl.spin, 0, -0.6 * fl.spin);
          const fc = fly(t - 0.5, 0.3, 25, 120, 1.5);
          coaster.position.set(W.x * fc.d, fc.y, W.z * fc.d); coaster.rotation.set(0.05 * fc.spin, 0, 0);
          SECT.forEach((st) => {
            const ts = t - 0.3 - st.seed * 1.4 - Math.max(0, st.xm + 60) * 0.004;
            if (ts > 0) { const f2 = fly(ts, st.seed, 30, 150, 1.8); st.g.position.set(st.xm + W.x * f2.d, PIER.deck + f2.y, PIER.z + W.z * f2.d); st.g.rotation.set(f2.spin * 0.3, 0, -f2.spin * 0.2); }
          });
          pierB.forEach((b) => { const ts = t - 0.1 - b.seed; if (ts > 0) { const f2 = fly(ts, b.seed, 35, 150, 2.2); b.g.position.set(b.x + W.x * f2.d, PIER.deck + f2.y, b.z + W.z * f2.d); b.g.rotation.set(f2.spin * 0.4, 0, -f2.spin * 0.3); } });
        }
      }
      // the wheel's lights (in the darker worlds)
      const lit = k.lit ?? (T || N || J ? 1 : 0.35);
      if (!(N && tt > NEP_PIER)) {
        wheel.updateMatrixWorld();
        for (let i = 0; i < 40; i++) {
          const a = ang + (i / 40) * Math.PI * 2;
          v3.set(Math.cos(a) * (WHEEL.r + 0.1), WHEEL.hub - PIER.deck + Math.sin(a) * (WHEEL.r + 0.1), 0.3);
          wheel.localToWorld(v3);
          tmpC.setHSL((i / 40 + tt * 0.15) % 1, 0.9, 0.6);
          glows.add(v3.x, v3.y, v3.z, 0.9, tmpC.r * 4 * lit, tmpC.g * 4 * lit, tmpC.b * 4 * lit);
        }
      }
    },
  };
}
