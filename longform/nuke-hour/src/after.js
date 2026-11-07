// The hour after the blast, outside: everything the heat lit is burning, the blast has wrecked the street, and the
// fires grow and join. All of it is a function of story time t (s since the flash) plus the video clock v for flicker.
//   - fires on your street: wrecked cars, the stalls, rooms behind broken windows (flame tongues out of them), your own
//     building's floors catching one after another;
//   - the city on the plain: thousands of fires, a carpet of glow under smoke;
//   - embers and smoke riding the wind, which swings round to blow toward the fires as they join (the firestorm);
//   - rubble and glass on the street, trees stripped, stall canopies gone;
//   - the gas main that blows up ahead of you, the burning slab that falls off your building;
//   - the park on the crest: scorched lawn, the people who got there, trees bending toward the city;
//   - ash that starts falling about 40 minutes in.
// The people of these scenes are here too (folk): placed and moved per scene so nobody walks through anybody.
import * as THREE from 'three';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { CARS } from './traffic.js';
import { FX, PROM, YOURS, STALLS, PARK, CAM0, HIT, PLAIN, groundY } from './layout.js';
const PROMX = PROM + 0.5;
import { rng, smooth, clamp, lerp, wobble } from './util.js';

import { GAS, SLAB_FALL } from './timeline.js';

const SHIRTS = [0x1d2230, 0xe8e2d6, 0x3a3328, 0x6b5a44, 0xc8d4e8, 0x7a2a2a, 0x24384a, 0xf0c060, 0x2f3d2c, 0xb8b0a0, 0x15151a, 0x8a5a8a, 0xd05030, 0x3a4a6a, 0x60a0d0];
const PANTS = [0x15161a, 0x23252b, 0x2c3340, 0x4a4238, 0x1a1a1a, 0x3a3a40, 0x8a7a66];

export function makeAfter(scene, ctx) {
  const R = rng(9090);
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);

  // ---- fires on and around the street ----
  const WIN = [];
  for (const side of [-1, 1]) for (let z = 46; z > -230; z -= 4 + R() * 9) {
    const yours = side < 0 && z > YOURS.z0 && z < YOURS.z1;
    if (yours) continue;
    const floors = z > -60 ? 10 : 5;
    WIN.push({ x: side * (FX + 0.4), y: groundY(z) + 6.5 + Math.floor(R() * floors) * 3.4, z, s: 2.2 + R() * 2.6, t0: 300 + R() * 1300, seed: R() * 10 });
  }
  // your building's front: the floors go one after another from the first minutes on
  const MINE = [];
  for (let f = 0; f < 11; f++) for (let k = 0; k < 4; k++) MINE.push({ x: -FX - 0.4, y: YOURS.lobbyH + 1.8 + f * 3.4, z: YOURS.z0 + 3 + k * 7 + R() * 3, s: 2.6 + R() * 2.2, t0: 520 + (10 - f) * 18 + R() * 40 + (f < 3 ? 99999 : 0), seed: R() * 10 });
  const STALL_F = STALLS.map((st) => ({ x: st.x + (R() - 0.5) * 3, z: st.z + 6 + R() * 6, s: 2.4 + R() * 1.4, seed: R() * 10 }));
  // a ring of street-level fires further down the hill (seen from the sidewalk) and on the blocks behind the fronts
  const FAR_F = Array.from({ length: 70 }, () => { const z = -80 - R() * 1100, x = (R() < 0.5 ? -1 : 1) * (FX + 2 + R() * 300); return { x, z, y: groundY(z) + 4 + R() * 12, s: 8 + R() * 16, seed: R() * 10 }; });

  // ---- the city on the plain: a carpet of fires ----
  const CITY_F = [];
  for (let i = 0; i < 2600; i++) {
    const dist = 1400 + Math.pow(R(), 0.6) * 19000, b = (R() - 0.5) * 2.0;
    const x = CAM0.x + dist * Math.sin(b), z = CAM0.z - dist * Math.cos(b);
    CITY_F.push({ x, z, y: groundY(z) + 10, s: (40 + R() * 90) * (0.6 + dist / 7000), k: 0.4 + R() * 0.8, t0: 120 + R() * 900, seed: R() * 10 });
  }

  // ---- embers on the wind, and smoke near the street ----
  const EMB = Array.from({ length: 700 }, () => ({ x: (R() - 0.5) * 90, y: R() * 30, z: (R() - 0.5) * 120, s: 0.06 + R() * 0.16, ph: R() * 10, r: R() }));
  // ---- ash: flakes round the camera ----
  const ASH = Array.from({ length: 2400 }, () => ({ x: (R() - 0.5) * 40, y: R() * 16, z: (R() - 0.5) * 40, s: 0.03 + R() * 0.06, ph: R() * 10, r: R() }));
  const ashMat = new THREE.MeshBasicMaterial({ color: 0x8a7a70, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.8), ashMat, ASH.length);
  ash.frustumCulled = false; ash.renderOrder = 8;
  scene.add(ash);
  ash.visible = false;

  // ---- rubble on the street: chunks of masonry, sheet metal, glass glints ----
  const N_RUB = 900;
  const rubMat = ctx.plainMat(0x4a443e, 0.85);
  const rubble = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), rubMat, N_RUB);
  rubble.frustumCulled = false; rubble.castShadow = true; rubble.receiveShadow = true;
  for (let i = 0; i < N_RUB; i++) {
    const side = R() < 0.5 ? -1 : 1;
    // (mostly along the building fronts; on the road, smaller, and none on the promenade where you walk)
    const nearFront = R() < 0.7;
    const x = nearFront ? side * (FX - R() * 5) : side * (PROMX + R() * (FX - PROMX - 5));
    let z = 50 - Math.pow(R(), 0.8) * 260;
    if (x < -14 && z > 0 && z < 24) z -= 30;                          // (not where you walk out of the lobby)
    const s0 = (0.15 + Math.pow(R(), 2.5) * 1.6) * (nearFront ? 1 : 0.5);
    e.set(R() * 6, R() * 6, R() * 6);
    rubble.setMatrixAt(i, m4.compose(p.set(x, groundY(z) + s0 * 0.25, z), q.setFromEuler(e), sc.set(s0 * (0.6 + R()), s0 * (0.3 + R() * 0.5), s0 * (0.6 + R()))));
    rubble.setColorAt(i, new THREE.Color().setHSL(0.07, 0.1, 0.12 + R() * 0.25));
  }
  g.add(rubble);

  // ---- the burning slab that falls off your building ----
  // (a whole piece of the front, three floors high: windows and all)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 8), ctx.plainMat(0x4a443e, 0.9));
  slab.castShadow = true; slab.visible = false;
  g.add(slab);

  // ---- the park: a scorched lawn on the crest, trees, the way down into the garage ----
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  lawnMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float z = (modelMatrix * vec4(position, 1.0)).z; transformed.y += ${PLAIN.toFixed(1)} * smoothstep(0.0, 1.0, clamp((z + 60.0) / -1240.0, 0.0, 1.0)) + 0.06; }`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLW;
      float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float n = ln(vLW.xz * 0.15) * 0.6 + ln(vLW.xz * 0.9) * 0.4;
        // scorched: black where it burned, dead brown where it didn't; a pale path across it
        vec3 c = mix(vec3(0.035, 0.03, 0.025), vec3(0.16, 0.12, 0.06), smoothstep(0.35, 0.7, n));
        float path = smoothstep(2.6, 1.8, abs(vLW.x + 200.0 + 30.0 * sin(vLW.z * 0.012)));
        c = mix(c, vec3(0.3, 0.27, 0.23), path);
        diffuseColor.rgb = c; }`);
  };
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0, 40, 120).rotateX(-Math.PI / 2), lawnMat);
  lawn.position.set((PARK.x0 + PARK.x1) / 2, 0, (PARK.z0 + PARK.z1) / 2);
  lawn.receiveShadow = true;
  g.add(lawn);
  const PTREES = [];
  for (let i = 0; i < 130; i++) {
    const x = PARK.x0 + 10 + R() * (PARK.x1 - PARK.x0 - 20), z = PARK.z0 + 10 + R() * (PARK.z1 - PARK.z0 - 20);
    if (Math.abs(x + 200 + 30 * Math.sin(z * 0.012)) < 8) continue;
    if (Math.hypot(x + 180, z + 160) < 75 || (Math.abs(x + 179) < 12 && z > -110 && z < -40)) continue;   // (the clearing where the crowd is, your way to the garage)
    PTREES.push({ x, z, y: groundY(z), h: 7 + R() * 6, burn: R() < 0.35, seed: R() * 10 });
  }
  const trunkMat = ctx.plainMat(0x1a1410, 0.95);
  const ptr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.32, 1, 6).translate(0, 0.5, 0), trunkMat, PTREES.length);
  const branches = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7, 1, true).translate(0, 0.5, 0), ctx.plainMat(0x16120e, 0.95, { side: THREE.DoubleSide }), PTREES.length);
  ptr.frustumCulled = false; branches.frustumCulled = false; ptr.castShadow = true;
  g.add(ptr, branches);
  // the garage's way in: a concrete portal over a ramp at the south edge of the park, its sign lit by a battery lamp
  const GATE = { x: -176, z: -70 };
  const portalMat = ctx.plainMat(0x7a766e, 0.9);
  const portal = new THREE.Group();
  const pb = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), portalMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; portal.add(m); };
  pb(0.6, 3.4, 10, -4.3, 1.7, 0); pb(0.6, 3.4, 10, 4.3, 1.7, 0); pb(9.2, 0.9, 1.0, 0, 3.4, -4.6); pb(9.2, 0.3, 10, 0, 3.8, 0.2);
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(8, 12).rotateX(-Math.PI / 2 + 0.16), ctx.plainMat(0x2a2826, 0.8));
  ramp.position.set(0, -0.9, 1.2); portal.add(ramp);
  const pcv = document.createElement('canvas'); pcv.width = 512; pcv.height = 128;
  { const c2 = pcv.getContext('2d'); c2.fillStyle = '#1a3a8a'; c2.fillRect(0, 0, 512, 128); c2.fillStyle = '#fff'; c2.font = '900 84px Arial'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('P  PARKING', 256, 68); }
  const ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: ptex, color: new THREE.Color(0.9, 0.9, 0.9) }));
  sign.position.set(0, 3.4, -5.15); sign.rotation.y = Math.PI; portal.add(sign);
  portal.position.set(GATE.x, 0, GATE.z);
  g.add(portal);

  // ---- what the firestorm's wind drags along the street: paper, sheet metal, burning bits, flying at you ----
  const N_DEB = 320;
  const DEB = Array.from({ length: N_DEB }, () => ({ x: (R() - 0.5) * 34, y: 0.2 + Math.pow(R(), 1.6) * 9, z: R() * 140, sp: 12 + R() * 16, s: [0.15 + R() * 0.9, 0.02 + R() * 0.05, 0.12 + R() * 0.7], spin: [(R() - 0.5) * 14, (R() - 0.5) * 14, (R() - 0.5) * 14], ph: R() * 10, burn: R() < 0.3 }));
  const debMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), debMat, N_DEB);
  deb.frustumCulled = false;
  DEB.forEach((d, i) => deb.setColorAt(i, new THREE.Color().setHSL(0.08, 0.12, d.burn ? 0.08 : 0.25 + R() * 0.45)));
  g.add(deb);
  // ---- chunks of road the gas main throws ----
  const N_CH = 60;
  const CHK = Array.from({ length: N_CH }, (_, k) => ({ an: k * 2.399, sp: 6 + R() * 14, up: 10 + R() * 18, s: 0.3 + R() * 0.9, spin: [(R() - 0.5) * 9, (R() - 0.5) * 9, (R() - 0.5) * 9] }));
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 0.8), ctx.plainMat(0x2a2624, 0.9), N_CH);
  chunks.frustumCulled = false; chunks.castShadow = true;
  g.add(chunks);

  // ---- the people ----
  const FOLK = [];
  const mkP = (x, z, o = {}) => { FOLK.push({ x, z, s: 0.92 + R() * 0.14, ph: R() * 10, shirt: SHIRTS[Math.floor(R() * SHIRTS.length)], pants: PANTS[Math.floor(R() * PANTS.length)], skin: SKIN[Math.floor(R() * SKIN.length)], hair: HAIR[Math.floor(R() * HAIR.length)], ...o }); };
  // (a jittered scatter that keeps everyone 0.9 m apart and off a list of keep-out circles)
  const scatter = (n, x0, x1, z0, z1, scene, extra = () => ({}), keep = []) => {
    const mine = [];
    for (let k = 0; k < n * 40 && mine.length < n; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (scene === 'walk' && Math.abs(x - 0.5) < 1.8) continue;          // (your lane: nobody walks against the camera)
      if (mine.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 0.9 * 0.9)) continue;
      if (keep.some(([kx, kz, kr]) => (kx - x) ** 2 + (kz - z) ** 2 < kr * kr)) continue;
      const o = { x, z };
      mine.push(o);
      mkP(x, z, { scene, ...extra(o) });
    }
  };
  // after the blast, on the street: people come out and stand looking at the cloud, some sit on the curb
  scatter(90, -21, 21, -60, 30, 'after', () => ({ act: R() < 0.25 ? 'sit' : R() < 0.5 ? 'look' : 'stand', yaw: (R() - 0.5) * 0.8 }), [[-18, 14, 3.5], [-15, 8, 3], [0, 0, 0]]);
  // ten minutes in: walking away south on the promenade and sidewalks, some looking back
  scatter(80, -20, 20, -40, 60, 'burning', () => ({ act: 'leave', sp: 1.1 + R() * 0.4, back: R() < 0.3 }), [[3, 20, 4]]);
  // twenty minutes in: walking south with you, ahead and beside, hands up over mouths
  scatter(80, -14, 14, 30, 160, 'walk', () => ({ act: 'walk', sp: 1.25 + R() * 0.25, mouth: R() < 0.6 }), [[0, 20, 6]]);
  // the park: sitting and standing in the clearing, most facing the city
  scatter(240, -235, -125, -235, -106, 'park', () => ({ act: R() < 0.55 ? 'sit' : R() < 0.7 ? 'hug' : 'look', yaw: (R() - 0.5) * 0.9 }), [[-182, -100, 5]]);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const crowd = makeCrowd(g, FOLK.length, mat, { castShadow: true });
  FOLK.forEach((f, i) => { f.i = i; crowd.color(i, f.shirt, f.pants, f.skin, f.hair); });

  const fireL = [new THREE.PointLight(0xff7a2a, 0, 0, 1.4), new THREE.PointLight(0xff8a34, 0, 0, 1.4)];
  g.add(...fireL);

  return {
    group: g, ash, fireL, GATE,
    // camPos: the camera; scene: which shot (after, burning, walk, park); t story time, v video time
    frame(t, v, s, cam, glows, flames, smoke) {
      const scn = s.shot;
      g.visible = true;
      const wind = lerp(0.25, 1, s.storm);                    // toward the fire (-z), m/s scale below
      // street fires
      const street = scn !== 'park';
      if (street) {
        for (const c of CARS) {
          if (!c.wrecked || c.pz === undefined || c.pz < -260 || c.pz > 60 || (c.ph * 13) % 1 > 0.5) continue;
          flames.add(c.px, c.py + 0.5, c.pz, 3.2 + (c.ph % 1.4), 1, c.ph, 1.4, 1.0);
          glows.add(c.px, c.py + 1.6, c.pz, 5, 0.8, 0.26, 0.05);
        }
        for (const f of STALL_F) { flames.add(f.x, groundY(f.z) + 0.2, f.z, f.s, 0.9, f.seed, 1.3, 0.8); glows.add(f.x, groundY(f.z) + 1.5, f.z, 6, 1.4, 0.45, 0.1); }
        for (const w of WIN) { const k = smooth(w.t0, w.t0 + 60, t); if (k > 0.02) { flames.add(w.x, w.y, w.z, w.s, k, w.seed, 0.9, 1.1); glows.add(w.x, w.y + 1, w.z, 7, 1.6 * k, 0.5 * k, 0.1 * k); } }
        for (const w of MINE) { const k = smooth(w.t0, w.t0 + 40, t); if (k > 0.02) { flames.add(w.x, w.y, w.z, w.s, k, w.seed, 1.0, 1.25); glows.add(w.x, w.y + 1.2, w.z, 8, 1.8 * k, 0.55 * k, 0.1 * k); } }
        for (const f of FAR_F) { flames.add(f.x, f.y, f.z, f.s, 0.9, f.seed, 1.2, 1.0); glows.add(f.x, f.y + f.s * 0.5, f.z, f.s * 2.2, 2.2, 0.7, 0.12); }
        // smoke off the fronts, leaning with the wind
        for (let k = 0; k < 40; k++) {
          const side = k % 2 ? 1 : -1, z0 = 40 - (k >> 1) * 13;
          const u = ((v * 0.06 + k * 0.137) % 1);
          smoke.puff(side * (FX + 4) - side * u * 6, groundY(z0) + 14 + u * 60, z0 - u * 40 * wind, 6 + 14 * u, 0.45 * (1 - u) * smooth(0, 0.15, u), 0.12, 0.12 * (1 - u), k * 1.3);
        }
      }
      // the city's fires (a carpet of glow; the near rows flicker)
      for (const f of CITY_F) {
        const k = smooth(f.t0, f.t0 + 300, t) * f.k * (0.75 + 0.25 * Math.sin(v * 3 + f.seed * 7));
        if (k > 0.02) glows.add(f.x, f.y, f.z, f.s * (0.8 + 0.6 * s.storm), 2.4 * k, 0.75 * k, 0.12 * k);
      }
      // embers: carried by the wind round the camera (wrapped in a box that follows it)
      {
        const W = 90, D = 120;
        for (const m of EMB) {
          const tt = v + m.ph * 3;
          let x = m.x + Math.sin(tt * 0.7 + m.ph) * 2.0, y = (m.y + tt * (1.2 + 1.5 * m.r)) % 30, z = m.z - tt * (2 + 9 * wind) * (0.6 + 0.6 * m.r);
          x = cam.x + ((((x - cam.x) % W) + W * 1.5) % W) - W / 2;
          z = cam.z + ((((z - cam.z) % D) + D * 1.5) % D) - D / 2;
          const f = (0.5 + 0.5 * Math.sin(v * 9 + m.ph * 5)) * (scn === 'park' ? 0.5 : 1);
          glows.add(x, groundY(z) + y, z, m.s, 4.5 * f, 1.6 * f, 0.22 * f);
        }
      }
      // the gas main (walking out): a roaring column of fire out of the road ahead, then a burning jet
      if (scn === 'walk') {
        const a = v - GAS.t;
        if (a > 0) {
          const big = Math.exp(-a / 1.1), jet = smooth(0.3, 1.5, a);
          const gy = groundY(GAS.z);
          // a fireball out of the road taller than the buildings, then a roaring jet that keeps burning
          for (let k = 0; k < 12; k++) flames.add(GAS.x + Math.sin(k * 2.1) * (1.5 + 4 * big), gy, GAS.z + Math.cos(k * 1.7) * (1.5 + 4 * big), 7 + 26 * big + 4 * jet, 1, k * 3.7 + 1, 0.9 + 0.5 * big, 1.6 + 1.0 * big);
          glows.add(GAS.x, gy + 8 + 14 * big, GAS.z, 25 + 40 * big, 4.5 * big + 1.4, 1.8 * big + 0.5, 0.35 * big + 0.08);
          if (a < 0.25) glows.add(GAS.x, gy + 4, GAS.z, 60, 12 * (1 - a / 0.25), 10 * (1 - a / 0.25), 8 * (1 - a / 0.25));
          // (the road's chunks)
          chunks.visible = a < 6;
          CHK.forEach((c, i) => {
            const tt = Math.min(a, 6);
            let y = gy + 0.5 + c.up * tt - 4.9 * tt * tt;
            const land = (c.up + Math.sqrt(c.up * c.up + 2 * 9.8 * 0.5)) / 9.8;
            const tl = Math.min(tt, land);
            y = tt < land ? y : gy + 0.25;
            e.set(c.spin[0] * tl, c.spin[1] * tl, c.spin[2] * tl, 'XYZ');
            chunks.setMatrixAt(i, m4.compose(p.set(GAS.x + Math.cos(c.an) * c.sp * tl, y, GAS.z + Math.sin(c.an) * c.sp * tl), q.setFromEuler(e), sc.setScalar(c.s)));
          });
          chunks.instanceMatrix.needsUpdate = true;
          for (let k = 0; k < 18; k++) { const u = ((a * 0.25 + k / 18) % 1); smoke.puff(GAS.x + Math.sin(k) * 3, gy + 8 + u * 50, GAS.z - u * 14 * wind, 4 + 10 * u, 0.5 * (1 - u), 0.1, 0.25 * (1 - u), k); }
          // the blast throws chunks of the road
          if (a < 3) for (let k = 0; k < 40; k++) {
            const an = k * 2.399, sp = 8 + (k % 7) * 3;
            const x = GAS.x + Math.cos(an) * sp * a * 0.5, z = GAS.z + Math.sin(an) * sp * a * 0.5, y = gy + 1 + (14 + (k % 5) * 4) * a - 4.9 * a * a;
            if (y > gy) glows.add(x, y, z, 0.35, 4, 1.8, 0.4);
          }
        }
      }
      // the firestorm's wind: debris flying up the street at you (walking out), and once the wind turns (ten minutes in)
      {
        const k = scn === 'walk' ? 1 : scn === 'burning' ? smooth(130, 134, v) * 0.6 : 0;
        deb.visible = k > 0;
        if (k > 0) {
          const D = 140;
          DEB.forEach((d, i) => {
            if (i > N_DEB * k) { deb.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
            const tt = v + d.ph * 4;
            let z = d.z - tt * d.sp;
            z = cam.z + ((((z - cam.z + 20) % D) + D) % D) - 20 - (scn === 'walk' ? 0 : 60);
            const x = cam.x + d.x + Math.sin(tt * 1.3 + d.ph) * 1.2;
            const y = groundY(z) + d.y + Math.sin(tt * 2.1 + d.ph) * 0.6;
            e.set(d.spin[0] * tt, d.spin[1] * tt, d.spin[2] * tt, 'XYZ');
            deb.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromEuler(e), sc.set(d.s[0], d.s[1], d.s[2])));
            if (d.burn) glows.add(x, y, z, 0.35 + d.s[0] * 0.5, 3.2, 1.2, 0.2);
          });
          deb.instanceMatrix.needsUpdate = true;
          if (deb.instanceColor) deb.instanceColor.needsUpdate = false;
          // smoke streaming low along the street with it
          for (let k2 = 0; k2 < 24; k2++) {
            const u = ((v * 0.35 + k2 / 24) % 1);
            smoke.puff(cam.x + ((k2 * 7.3) % 30) - 15, groundY(cam.z) + 1 + (k2 % 4) * 1.6, cam.z + 60 - u * 110, 3 + 3 * u, 0.22 * Math.sin(Math.PI * u) * k, 0.2, 0.08, k2 * 1.9);
          }
        }
      }
      // the slab off your building
      if (scn === 'burning') {
        const a = v - SLAB_FALL.v;
        if (a > -2) {
          const y = a < 0 ? SLAB_FALL.y : Math.max(4.6, SLAB_FALL.y - 4.9 * a * a);
          const x = SLAB_FALL.x + (a > 0 ? Math.min(a, 2.3) * 2.6 : 0);
          const landed = a > Math.sqrt((SLAB_FALL.y - 4.6) / 4.9);
          for (let k = 0; k < 3; k++) flames.add(x + 0.6, y - 3.5 + k * 2.4, SLAB_FALL.z - 2.5 + k * 2.5, 5.5, 1, 7.7 + k, 1.3, 1.1);
          glows.add(x, y, SLAB_FALL.z, 14, 2.2, 0.8, 0.15);
          if (landed) {
            const b = a - Math.sqrt((SLAB_FALL.y - 4.6) / 4.9);
            for (let k = 0; k < 120 && b < 2.5; k++) { const an = k * 2.399, sp = 4 + (k % 6) * 3; const yy = 0.5 + (6 + (k % 4) * 4) * b - 4.9 * b * b; if (yy > 0) glows.add(x + Math.cos(an) * sp * b, yy, SLAB_FALL.z + Math.sin(an) * sp * b, 0.3, 5 * Math.exp(-b), 2.4 * Math.exp(-b), 0.4 * Math.exp(-b)); }
            for (let k = 0; k < 22; k++) smoke.puff(x + Math.sin(k * 2) * 7 * smooth(0, 2, b), 1 + (k % 5) * 1.2 * smooth(0, 3, b), SLAB_FALL.z + Math.cos(k * 2) * 7 * smooth(0, 2, b), 2 + 4 * smooth(0, 3, b), 0.6 * (1 - smooth(1.5, 9, b)), 0.35, 0.12, k);
          }
          s.slab = { x, y, z: SLAB_FALL.z, a };
          slab.visible = true;
          slab.position.set(x, y + 0.2, SLAB_FALL.z);
          // (it peels off the front, top first, and lands flat on the sidewalk)
          slab.rotation.set(0, 0, -Math.min(Math.PI / 2, 0.68 * Math.max(a, 0) * Math.max(a, 0)));
          if (landed) { slab.rotation.set(0, 0, -Math.PI / 2); slab.position.y = 0.45; }
        }
      }
      if (scn !== 'burning') slab.visible = false;
      if (!(scn === 'walk' && v > GAS.t)) chunks.visible = false;
      // the park's trees: bare, bending toward the city in the wind; a third of them still burning
      branches.visible = ptr.visible = lawn.visible = portal.visible = scn === 'park';
      if (scn === 'park') {
        PTREES.forEach((tr, i) => {
          const bend = (0.08 + 0.1 * wind) * (1 + 0.25 * Math.sin(v * 1.3 + tr.seed));
          e.set(-bend, tr.seed, 0, 'YXZ');
          ptr.setMatrixAt(i, m4.compose(p.set(tr.x, tr.y, tr.z), q.setFromEuler(e), sc.set(1, tr.h, 1)));
          branches.setMatrixAt(i, m4.compose(p.set(tr.x + 0.0, tr.y + tr.h * 0.35, tr.z - tr.h * 0.1 * bend * 4), q.setFromEuler(e), sc.set(tr.h * 0.28, tr.h * 0.75, tr.h * 0.28)));
          if (tr.burn) { flames.add(tr.x, tr.y + tr.h * 0.6, tr.z - bend * 2, 3 + tr.h * 0.25, 0.85, tr.seed, 1.1, 1.0); glows.add(tr.x, tr.y + tr.h * 0.8, tr.z, 8, 1.4, 0.45, 0.08); }
        });
        ptr.instanceMatrix.needsUpdate = true; branches.instanceMatrix.needsUpdate = true;
        glows.add(GATE.x, 3.9, GATE.z - 5.3, 1.6, 3, 3, 3.2);
      }
      // ash: grey flakes drifting down, then thick
      ash.visible = s.ash > 0.01 && scn === 'park';
      if (ash.visible) {
        const W = 18;
        let n = 0;
        const N = Math.floor(ASH.length * s.ash);
        for (let i = 0; i < N; i++) {
          const a0 = ASH[i];
          const tt = v + a0.ph * 2;
          let x = a0.x + Math.sin(tt * 0.9 + a0.ph) * 0.6 - tt * 0.8 * wind * 0.3, y = a0.y - tt * (0.5 + 0.4 * a0.r), z = a0.z - tt * 1.2 * wind;
          x = cam.x + ((((x - cam.x) % W) + W * 1.5) % W) - W / 2;
          z = cam.z + ((((z - cam.z) % W) + W * 1.5) % W) - W / 2;
          y = cam.y - 2 + (((y % 9) + 9) % 9);
          if (Math.abs(x - cam.x) < 1.6 && Math.abs(z - cam.z) < 1.6) continue;
          e.set(tt * 1.3 + a0.ph, tt * 0.9, tt * 0.7, 'XYZ');
          ash.setMatrixAt(n++, m4.compose(p.set(x, y, z), q.setFromEuler(e), sc.setScalar(a0.s)));
        }
        ash.count = n;
        ash.instanceMatrix.needsUpdate = true;
        ashMat.color.setRGB(0.42 + 0.22 * s.fireK, 0.37 + 0.08 * s.fireK, 0.34);
      }
      // the fires nearest the camera light it
      fireL[0].position.set(cam.x - 8, 4, cam.z - 10);
      fireL[1].position.set(cam.x + 7, 6, cam.z + 6);
      const fl = (a, b) => 0.7 + 0.3 * Math.sin(v * a) * Math.sin(v * b + 1);
      // (indoors the lobby has its own firelight and the stairwell only its emergency lamp)
      const indoors = scn === 'stairs' || scn === 'lobby';
      fireL[0].intensity = (scn === 'park' || indoors ? 0 : 260) * fl(11, 6.3);
      fireL[1].intensity = (scn === 'park' ? 90 : indoors ? 0 : 160) * fl(9, 4.1);

      // people
      for (const f of FOLK) {
        const on = f.scene === scn;
        if (!on) { crowd.pose(f.i, { x: 0, y: 0, z: 0, visible: false }); continue; }
        let x = f.x, z = f.z, yaw = (f.yaw || 0), walk = v * 1.4 + f.ph, stride = 0, armL = 0, armR = 0, look = 0.25, sit = 0, pitch = 0, y = 0;
        const dt = s.dt;
        if (f.act === 'sit') { sit = 1; look = 0.35; armL = armR = 0.4; }
        else if (f.act === 'look') { look = 0.65; armR = 0.3 * (1 + Math.sin(v * 0.3 + f.ph)); }
        else if (f.act === 'hug') { sit = 0.9; armL = armR = 1.0; look = 0.1; }
        else if (f.act === 'leave') {
          // walking away south (+z), some stop and turn to look back at the fire
          const stopAt = f.back ? 8 + (f.ph % 1) * 20 : 1e9;
          const d = f.sp * Math.min(dt, stopAt);
          z += d; walk = d * 2.6 + f.ph; stride = dt < stopAt ? 1 : 0;
          yaw = Math.PI + (dt > stopAt ? Math.PI * smooth(stopAt, stopAt + 1.2, dt) : 0);
          look = dt > stopAt ? 0.5 : 0.1;
        } else if (f.act === 'walk') {
          const d = f.sp * dt;
          z += d; walk = d * 2.6 + f.ph; stride = 1; yaw = Math.PI;
          if (f.mouth) { armR = 1.05; armL = 0.15; look = -0.1; }
          // (the gas main: everyone near it throws themselves down)
          const dg = Math.hypot(x - GAS.x, z - GAS.z);
          const down = v > GAS.t + 0.1 && dg < 40 ? smooth(GAS.t + 0.1, GAS.t + 0.7, v) : 0;
          if (down > 0) { z -= f.sp * Math.max(0, v - GAS.t - 0.1); walk = (f.sp * (GAS.t - 140)) * 2.6 + f.ph; stride = 1 - down; sit = down; armL = armR = lerp(armL, 0.75, down); look = -0.5 * down; pitch = 0.35 * down; y = -0.42 * down; }
        }
        yaw += wobble(v * 0.3, f.ph) * 0.12;
        // (crowd.js people face +z at yaw 0)
        y += groundY(z) + (f.scene === 'park' ? 0.06 : 0);
        crowd.pose(f.i, { x, y, z, yaw: f.act === 'leave' || f.act === 'walk' ? yaw - Math.PI : yaw + Math.PI, s: f.s, walk, stride, sit, pitch, armL, armR, look });
      }
      crowd.commit();
    },
    hide() { g.visible = false; ash.visible = false; fireL.forEach((l) => { l.intensity = 0; }); },
  };
}
