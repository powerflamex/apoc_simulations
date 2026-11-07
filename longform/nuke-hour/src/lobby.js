// Your building's ground floor: the recessed entrance on the avenue (the alcove, where you get out of the light), the
// lobby behind its glass front, and the concrete stairwell at the back where you get down. At the blast the front's
// panes burst into the lobby (shards flying at you, slowed down on the video clock), dust floods in, the stairwell door
// slams; eight seconds later the wind comes back the other way and yanks it open. Afterwards: glass all over the floor,
// ceiling panels hanging, the desk shoved over, dust in the air, the street's fires lighting it orange.
// Story time t (seconds since the flash); s.front: the blast front's distance from ground zero (m).
import * as THREE from 'three';
import { YOURS, FX, HIT } from './layout.js';
import { rng, smooth, clamp, lerp, wobble } from './util.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { T_HIT } from './timeline.js';

const X0 = -48, XF = -FX - 0.3, Z0 = -5.5, Z1 = 23.5, CEIL = 4.6, SLAB = YOURS.lobbyH;
const AL = YOURS.alcove;                       // z0 4, z1 12, x1 -27
export const STAIR = { x0: -50, x1: -44, z0: 5, z1: 15, door: { z0: 9.0, z1: 10.4, h: 2.3 } };

export function makeLobby(scene, ctx) {
  const R = rng(3131);
  const g = new THREE.Group();
  scene.add(g);
  const box = (w, h, d, x, y, z, mat, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // stone cladding: big panels with dark joints and a faint vein in each; the stairwell's concrete painted two-tone
  const panelled = (m, k = 1) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vSW; float sh1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh1(i), sh1(i + vec2(1, 0)), f.x), mix(sh1(i + vec2(0, 1)), sh1(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 u = vec2(vSW.x + vSW.z, vSW.y);
          vec2 c = u / vec2(1.6, 1.2); vec2 id = floor(c), f = fract(c);
          float joint = (1.0 - smoothstep(0.0, 0.025, f.x)) + (1.0 - smoothstep(0.0, 0.03, f.y));
          float vein = smoothstep(0.93, 1.0, 1.0 - abs(sn(u * 1.7 + id * 3.0) - 0.5) * 2.0);
          diffuseColor.rgb *= (0.88 + 0.22 * sh1(id)) * (1.0 - 0.45 * clamp(joint, 0.0, 1.0)) * (1.0 - 0.25 * vein * ${k.toFixed(2)}); }`);
    };
    m.customProgramCacheKey = () => 'lobby-panel-' + k;
    return m;
  };
  const stone = panelled(ctx.plainMat(0xc9c0b0, 0.45));
  const stoneDark = panelled(ctx.plainMat(0x6e665c, 0.5), 0.5);
  const concrete = ctx.plainMat(0x8f8b84, 0.92);
  concrete.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float y = vCW.y;
        vec3 c = mix(vec3(0.3, 0.36, 0.33), vec3(0.62, 0.6, 0.56), step(1.25, y));
        c = mix(c, vec3(0.75, 0.6, 0.12), step(1.25, y) * step(y, 1.4));
        float blk = step(0.5, fract(vCW.y / 0.4)) * 0.04;
        diffuseColor.rgb = c * (0.95 + blk); }`);
  };
  concrete.customProgramCacheKey = () => 'stair-paint';
  const metal = ctx.plainMat(0x6a6e74, 0.35, { metalness: 0.6 });
  const wood = ctx.plainMat(0x4a3324, 0.6);

  // ---- the floor: polished stone tiles (a shader so the tiles and their sheen read) ----
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0 });
  floorMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vFW; float fh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 c = vFW.xz / 1.2; vec2 id = floor(c), f = fract(c);
        float k = mod(id.x + id.y, 2.0);
        diffuseColor.rgb = mix(vec3(0.62, 0.58, 0.52), vec3(0.36, 0.33, 0.3), k) * (0.9 + 0.2 * fh(id));
        float gr = smoothstep(0.0, 0.02, f.x) * smoothstep(0.0, 0.02, f.y);
        diffuseColor.rgb *= mix(0.5, 1.0, gr); }`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(XF - X0, Z1 - Z0).rotateX(-Math.PI / 2), floorMat);
  floor.position.set((X0 + XF) / 2, 0.02, (Z0 + Z1) / 2);
  floor.receiveShadow = true;
  g.add(floor);
  // stairwell floor and the alcove's floor are plain concrete / stone
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(STAIR.x1 - STAIR.x0, STAIR.z1 - STAIR.z0).rotateX(-Math.PI / 2), concrete);
  sf.position.set((STAIR.x0 + STAIR.x1) / 2, 0.021, (STAIR.z0 + STAIR.z1) / 2); sf.receiveShadow = true; g.add(sf);

  // ---- ceiling with light panels ----
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(XF - X0 + 0.3, Z1 - Z0).rotateX(Math.PI / 2), ctx.plainMat(0xd8d4cc, 0.9));
  ceil.position.set((X0 + XF) / 2 + 0.15, CEIL, (Z0 + Z1) / 2);
  g.add(ceil);
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.6) });
  const PANELS = [];
  for (let x = -45; x < -24; x += 3.2) for (let z = -3.5; z < 22.5; z += 3.2) if (!(x > AL.x1 - 0.5 && z > AL.z0 - 1 && z < AL.z1 + 1)) PANELS.push({ x, z, seed: R() });
  const panels = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 1.3).rotateX(Math.PI / 2), panelMat, PANELS.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  PANELS.forEach((pp, i) => panels.setMatrixAt(i, m4.makeTranslation(pp.x, CEIL - 0.01, pp.z)));
  panels.frustumCulled = false;
  g.add(panels);
  // (afterwards: ceiling tiles hanging down by one edge)
  const tileMat = ctx.plainMat(0xc8c4bc, 0.9);
  const HANG = Array.from({ length: 26 }, () => ({ x: -44 + R() * 21, z: -4 + R() * 26, a: 0.5 + R() * 0.9, yaw: R() * 6.28 }));
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.03, 0.6).translate(0, 0, 0.3), tileMat, HANG.length);
  tiles.frustumCulled = false; tiles.castShadow = true;
  HANG.forEach((h, i) => { e.set(h.a, h.yaw, 0, 'YXZ'); tiles.setMatrixAt(i, m4.compose(p.set(h.x, CEIL - 0.02, h.z), q.setFromEuler(e), sc)); });
  tiles.visible = false;
  g.add(tiles);

  // ---- walls ----
  // side walls, back wall (with the stairwell door and the lift doors), the alcove's two walls
  box(XF - X0, SLAB, 0.4, (X0 + XF) / 2, SLAB / 2, Z0 - 0.2, stone);
  box(XF - X0, SLAB, 0.4, (X0 + XF) / 2, SLAB / 2, Z1 + 0.2, stone);
  const D = STAIR.door;
  box(0.4, SLAB, D.z0 - Z0, -44.2, SLAB / 2, (Z0 + D.z0) / 2, stoneDark);
  box(0.4, SLAB, Z1 - D.z1, -44.2, SLAB / 2, (D.z1 + Z1) / 2, stoneDark);
  box(0.4, SLAB - D.h, D.z1 - D.z0, -44.2, D.h + (SLAB - D.h) / 2, (D.z0 + D.z1) / 2, stoneDark);
  for (const z of [16.2, 19.4]) box(0.06, 2.6, 1.6, -43.97, 1.3, z, metal, false);
  box(4.8, SLAB, 0.4, -FX - 2.5, SLAB / 2, AL.z0 - 0.2, stone);
  box(4.8, SLAB, 0.4, -FX - 2.5, SLAB / 2, AL.z1 + 0.2, stone);
  // the stairwell: concrete box behind the back wall, stairs going up along its far wall
  box(0.4, SLAB, STAIR.z1 - STAIR.z0 + 0.8, STAIR.x0 - 0.2, SLAB / 2, (STAIR.z0 + STAIR.z1) / 2, concrete);
  box(STAIR.x1 - STAIR.x0, SLAB, 0.4, (STAIR.x0 + STAIR.x1) / 2, SLAB / 2, STAIR.z0 - 0.2, concrete);
  box(STAIR.x1 - STAIR.x0, SLAB, 0.4, (STAIR.x0 + STAIR.x1) / 2, SLAB / 2, STAIR.z1 + 0.2, concrete);
  const stepMat = ctx.plainMat(0x7c7872, 0.9);
  for (let k = 0; k < 13; k++) box(2.3, 0.18 * (k + 1), 0.28, STAIR.x0 + 1.15, 0.09 * (k + 1), 14.6 - k * 0.28, stepMat);
  box(2.3, 0.16, 2.0, STAIR.x0 + 1.15, 2.34, 10.0, stepMat);
  box(0.05, 0.05, 4.2, STAIR.x0 + 2.35, 1.4, 12.6, metal, false);
  // the lobby's things: reception desk, two columns, planters, a bench
  const desk = box(4.2, 1.1, 1.0, -36, 0.55, 17.5, wood);
  const deskTop = box(4.4, 0.06, 1.2, -36, 1.13, 17.5, stone);
  for (const z of [1.5, 16]) box(0.9, CEIL, 0.9, -32.5, CEIL / 2, z, stone);
  const PLANT = [[-24, -4.2], [-24, 22.2], [-29, 2.6], [-29, 13.4]];
  const potMat = ctx.plainMat(0x2a2a2e, 0.5), leafMat = ctx.plainMat(0x2e5a2a, 0.8);
  const plants = PLANT.map(([x, z]) => {
    const pg = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 12).translate(0, 0.3, 0), potMat);
    const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1).translate(0, 1.1, 0), leafMat);
    pot.castShadow = lf.castShadow = true;
    pg.add(pot, lf); pg.position.set(x, 0, z);
    g.add(pg);
    return pg;
  });
  const bench = box(2.2, 0.45, 0.6, -40, 0.23, 2.5, wood);

  // ---- the glass front: the panes and their mullions ----
  const PANES = [];
  const run = (x, za, zb, axis) => {
    const n = Math.max(1, Math.round((zb - za) / 2.4)), w = (zb - za) / n;
    for (let k = 0; k < n; k++) PANES.push({ x, z: za + w * (k + 0.5), w, axis });
  };
  run(XF, Z0, AL.z0, 'z'); run(XF, AL.z1, Z1, 'z');
  // the alcove's glass, a door-sized gap in the middle (the doors stand open)
  run(AL.x1, AL.z0, 7.0, 'z'); run(AL.x1, 9.4, AL.z1, 'z');
  const PH = 4.3;
  PANES.forEach((pp) => { pp.rr = Math.hypot(pp.x - HIT.x, pp.z - HIT.z); });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fa6b4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, emissive: 0x000000 });
  const panes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), glassMat, PANES.length);
  panes.frustumCulled = false; panes.renderOrder = 4;
  g.add(panes);
  const mull = [];
  for (const pp of PANES) { mull.push([pp.x, pp.z - pp.w / 2]); mull.push([pp.x, pp.z + pp.w / 2]); }
  const mullMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, SLAB, 0.12), ctx.plainMat(0x1c1e22, 0.5, { metalness: 0.5 }), mull.length);
  mull.forEach(([x, z], i) => mullMesh.setMatrixAt(i, m4.makeTranslation(x, SLAB / 2, z)));
  mullMesh.castShadow = true; mullMesh.frustumCulled = false;
  g.add(mullMesh);
  // the band of dark spandrel over the glass
  box(0.3, SLAB - PH - 0.1, Z1 - Z0, XF, PH + 0.1 + (SLAB - PH - 0.1) / 2, (Z0 + Z1) / 2, stoneDark);

  // ---- the shards: every pane breaks into pieces that fly into the lobby ----
  const N_SH = 1400;
  const SH = Array.from({ length: N_SH }, (_, i) => {
    const pp = PANES[i % PANES.length];
    return {
      pane: pp, z: pp.z + (R() - 0.5) * pp.w, y: 0.2 + R() * (PH - 0.2), x: pp.x,
      vx: -(18 + R() * 34), vz: 2 + R() * 12, vy: -1 + R() * 4, s: 0.05 + Math.pow(R(), 2.2) * 0.45,
      spin: [(R() - 0.5) * 30, (R() - 0.5) * 30, (R() - 0.5) * 30], rest: [R() * 6, R() * 6], dl: R() * 0.012,
    };
  });
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xb8ccd8, roughness: 0.05, metalness: 0.4, emissive: 0x334455, side: THREE.DoubleSide });
  const shards = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.7), shardMat, N_SH);
  shards.frustumCulled = false;
  g.add(shards);

  // ---- the lobby's name over the desk (lit until the blackout), the stairwell's level number, an extinguisher, pipes ----
  const signCv = document.createElement('canvas'); signCv.width = 1024; signCv.height = 160;
  { const c2 = signCv.getContext('2d'); c2.fillStyle = '#16120e'; c2.fillRect(0, 0, 1024, 160); c2.fillStyle = '#e8c88a'; c2.font = '600 92px Georgia, serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('HILLCREST  TOWER', 512, 84); }
  const signTex = new THREE.CanvasTexture(signCv); signTex.colorSpace = THREE.SRGBColorSpace;
  const nameMat = new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(1.6, 1.6, 1.6) });
  const nameSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), nameMat);
  nameSign.position.set(-36, 3.3, Z1 - 0.02); nameSign.rotation.y = Math.PI; g.add(nameSign);
  const numCv = document.createElement('canvas'); numCv.width = 256; numCv.height = 256;
  { const c2 = numCv.getContext('2d'); c2.fillStyle = '#f0e8d8'; c2.font = '900 210px Arial'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('1', 128, 140); }
  const numTex = new THREE.CanvasTexture(numCv); numTex.colorSpace = THREE.SRGBColorSpace;
  const num = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.9 }));
  num.position.set(STAIR.x0 + 0.02, 2.0, 8.0); num.rotation.y = Math.PI / 2; g.add(num);
  box(0.25, 0.6, 0.25, STAIR.x0 + 0.14, 1.1, 6.2, ctx.plainMat(0xb81a14, 0.4));
  for (const [z, r] of [[5.6, 0.09], [5.9, 0.06], [14.4, 0.07]]) { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, STAIR.x1 - STAIR.x0, 8).rotateZ(Math.PI / 2), ctx.plainMat(0x5a5e62, 0.5, { metalness: 0.5 })); pipe.position.set((STAIR.x0 + STAIR.x1) / 2, SLAB - 0.3, z); g.add(pipe); }

  // ---- people in the doorway with you (they ran in at the flash), and you, for the shots that show you ----
  const NB = [
    { x: -23.2, z: 4.6, yaw: -2.4, crouch: 1, s: 1 }, { x: -24.8, z: 4.9, yaw: -2.0, crouch: 1, s: 0.95 },
    { x: -25.9, z: 11.0, yaw: 2.6, crouch: 0.9, s: 1.02 }, { x: -23.7, z: 11.3, yaw: 3.0, crouch: 1, s: 0.97 },
    { x: -24.6, z: 11.6, yaw: 2.8, crouch: 0.8, s: 0.62 },
    { x: -22.3, z: 5.0, yaw: 2.5, crouch: 0, s: 1, you: true },
  ];
  const nbCrowd = makeCrowd(g, NB.length, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const NBC = [[0x2a3a5a, 0x1a1a1a], [0xd8d0c0, 0x2c3340], [0x7a2a2a, 0x23252b], [0x3a4a3a, 0x4a4238], [0xf0c060, 0x2c3340], [0x24384a, 0x15161a]];
  NB.forEach((o, i) => nbCrowd.color(i, NBC[i][0], NBC[i][1], SKIN[(i * 3) % SKIN.length], HAIR[(i * 5) % HAIR.length]));

  // ---- the stairwell door, the EXIT signs, the emergency light ----
  const door = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, D.h - 0.05, D.z1 - D.z0 - 0.04).translate(0, (D.h - 0.05) / 2, -(D.z1 - D.z0 - 0.04) / 2), ctx.plainMat(0x5a5f66, 0.45, { metalness: 0.5 }));
  leaf.castShadow = true;
  door.add(leaf);
  door.position.set(-44.2, 0, D.z1 - 0.02);
  g.add(door);
  const exitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 0.45) });
  for (const x of [-43.95, -44.45]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2).rotateY(x > -44.2 ? Math.PI / 2 : -Math.PI / 2), exitMat); m.position.set(x, D.h + 0.3, (D.z0 + D.z1) / 2); g.add(m); }
  const emMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const em = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.12), emMat);
  em.position.set(-47.2, 3.1, STAIR.z1 - 0.06);
  g.add(em);

  // ---- lights: the ceiling, the stairwell's emergency light, the fires outside shining in afterwards ----
  const ceilL = [new THREE.PointLight(0xfff0dc, 0, 0, 1.8), new THREE.PointLight(0xfff0dc, 0, 0, 1.8)];
  ceilL[0].position.set(-36, 4.2, 3); ceilL[1].position.set(-36, 4.2, 16);
  const emL = new THREE.PointLight(0xdfe8ff, 0, 0, 1.6);
  emL.position.set(-47.2, 2.9, 14.2);
  const fireIn = new THREE.PointLight(0xff8a3a, 0, 21, 1.4);
  fireIn.position.set(-20, 3.5, 9);
  g.add(...ceilL, emL, fireIn);

  // when each pane breaks (story seconds): when the front reaches it
  const breakT = (pp, s) => s.front > 0 ? s.front - (pp.rr - 1.5) : -1;   // metres the front is past the pane

  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group: g, lights: [...ceilL, emL, fireIn], STAIR,
    // t: story time; s: { front, dark, after, wind } ; v: video time (for flicker)
    frame(t, s, v, glows, smoke, showYou = false) {
      // the people beside you in the doorway: crouched in the shade, heads down, from a few seconds after the flash
      {
        const here = t > 2.5 && t < T_HIT + 0.2;
        NB.forEach((o, i) => {
          const vis = here && (!o.you || showYou);
          const c = o.crouch, br = wobble(v * 0.6, i) * 0.04;
          nbCrowd.pose(i, { x: o.x, y: -0.4 * c, z: o.z, yaw: o.yaw, s: o.s, sit: c * 0.85, pitch: 0.35 * c + br, armL: o.you ? 0.2 : 0.75 * c + 0.2, armR: o.you ? 1.35 : 0.75 * c + 0.2, look: o.you ? 0.25 : -0.5 * c, visible: vis });
        });
        nbCrowd.commit();
      }
      nameMat.color.setScalar(0.15 + 1.45 * (1 - s.dark));
      const after = t > T_HIT + 0.35;
      const tAfter = t > 200;
      // the ceiling lights: on, then out with the blackout
      const on = 1 - s.dark;
      panelMat.color.setRGB(3.2 * on + 0.02, 3.0 * on + 0.02, 2.6 * on + 0.02);
      ceilL.forEach((l) => { l.intensity = 22 * on; });
      // panes and shards
      let anyBroken = false;
      PANES.forEach((pp, i) => {
        const b = breakT(pp, s) > 0 || after;
        pp.broken = b;
        anyBroken = anyBroken || b;
        if (b) { panes.setMatrixAt(i, hide); return; }
        m4.compose(p.set(pp.x, 0.1 + PH / 2, pp.z), q.identity(), sc.set(1, PH, pp.w - 0.1));
        panes.setMatrixAt(i, m4);
      });
      panes.instanceMatrix.needsUpdate = true;
      glassMat.emissive.setRGB(0.05 * s.glare, 0.035 * s.glare, 0.02 * s.glare);
      shards.visible = anyBroken;
      if (anyBroken) {
        SH.forEach((h, i) => {
          // seconds since this pane broke: the front moves ~390 m/s here
          const db = after ? 9 : breakT(h.pane, s);
          if (db <= 0) { shards.setMatrixAt(i, hide); return; }
          const dt = after ? 9 : db / 390 - h.dl;
          if (dt <= 0) { shards.setMatrixAt(i, hide); return; }
          // flying, slowing in the air, falling; then lying on the floor (or on the stairwell's floor)
          const k = 1 - Math.exp(-dt / 0.45);
          let x = h.x + h.vx * 0.45 * k, z = h.z + h.vz * 0.45 * k;
          let y = h.y + h.vy * dt - 4.9 * dt * dt;
          const floorX = x < -44.2 && (z < STAIR.door.z0 || z > STAIR.door.z1) ? -44.3 : X0 + 0.3;
          if (x < floorX) x = floorX;
          let lying = false;
          if (y <= 0.03) { y = 0.025; lying = true; }
          if (lying) e.set(-Math.PI / 2, h.rest[0], 0, 'YXZ');
          else e.set(h.spin[0] * dt + h.rest[1], h.spin[1] * dt, h.spin[2] * dt, 'XYZ');
          m4.compose(p.set(x, y, z), q.setFromEuler(e), sc.setScalar(h.s));
          shards.setMatrixAt(i, m4);
          // (flying shards catch the light)
          if (!lying && glows && (i % 3 === 0)) glows.add(x, y, z, 0.12 + h.s * 0.3, 1.6, 1.5, 1.4);
          // (on the floor afterwards, a few glint in the firelight)
          if (lying && tAfter && glows && (i % 7 === 0)) { const gl = Math.max(0, Math.sin(v * 2.3 + i * 1.7)) ** 8; if (gl > 0.05) glows.add(x, 0.04, z, 0.08, 2.5 * gl, 1.6 * gl, 0.9 * gl); }
        });
        shards.instanceMatrix.needsUpdate = true;
      }
      // the door: open; slammed by the blast; yanked open again when the wind comes back; hanging open after
      {
        const slam = smooth(T_HIT + 0.17, T_HIT + 0.25, t);
        const back = smooth(54.2, 54.6, t);
        const rattle = t > T_HIT + 0.25 && t < 54.2 ? 0.05 * Math.sin(t * 61) * Math.exp(-(t - T_HIT) / 4) : 0;
        let a = lerp(-1.65, 0, slam) + rattle;          // (radians; it stands open into the lobby)
        a = lerp(a, -1.25 + 0.04 * Math.sin(t * 13) * Math.exp(-(t - 54.6) / 2), back);
        door.rotation.y = a;
      }
      // the emergency light: comes on after the blast, flickers, then steady
      {
        const k = t > T_HIT + 0.6 ? (t < T_HIT + 2.2 ? (Math.sin(t * 37) > 0.2 ? 1 : 0.1) : 1) : 0;
        emMat.color.setRGB(4 * k, 4.2 * k, 4.6 * k);
        emL.intensity = 9 * k;
        if (k > 0 && glows) glows.add(-47.2, 3.0, STAIR.z1 - 0.2, 0.5, 2.2 * k, 2.3 * k, 2.6 * k);
      }
      // the fires outside lighting the wrecked lobby
      fireIn.intensity = after ? (60 + 30 * s.roomFire) * (0.7 + 0.3 * Math.sin(v * 9) * Math.sin(v * 5.3 + 1)) : 0;
      tiles.visible = after;
      // the desk shoved, plants knocked over, bench thrown, afterwards
      const w = after ? 1 : 0;
      desk.position.set(-36 - 1.4 * w, 0.55, 17.5 + 1.2 * w); desk.rotation.y = 0.35 * w;
      deskTop.position.set(-36 - 1.6 * w, 1.13 - 1.1 * w, 17.5 + 2.3 * w); deskTop.rotation.set(1.2 * w, 0.4 * w, 0);
      plants.forEach((pl, i) => { pl.rotation.set(0, 0, 0); if (w) { pl.rotation.z = Math.PI / 2 * 0.95; pl.rotation.y = 0.6 + i; pl.position.x = PLANT[i][0] - 3 - i; pl.position.y = 0.32; } else { pl.position.x = PLANT[i][0]; pl.position.y = 0; } });
      bench.position.set(-40 - 2.5 * w, 0.23, 2.5 + 3 * w); bench.rotation.y = 0.9 * w;
      // dust: floods in with the shards, hangs in the air afterwards
      if (smoke) {
        if (anyBroken && !after) {
          const db = Math.max(0, s.front - (PANES[0].rr - 1.5));
          const dt = db / 390;
          for (let k = 0; k < 26; k++) {
            const u = clamp(dt * 2.2 - k * 0.03);
            if (u <= 0) continue;
            const z = -4 + (k % 9) * 3.2, y = 0.6 + (k % 4) * 1.1;
            smoke.puff(XF - u * 24, y, z + u * 3, 1.2 + 2.6 * u, 0.55 * Math.min(1, u * 3), 0.36, 0.05, k * 1.7);
          }
        }
        if (after && t < 70) {
          // the stairwell full of dust, thinning
          const d = 1 - smooth(T_HIT, 66, t);
          for (let k = 0; k < 10; k++) smoke.puff(-47.5 + (k % 3) * 1.4, 0.6 + (k % 4) * 0.9 + 0.2 * Math.sin(t + k), 7 + (k * 0.77 % 7), 1.6, 0.18 * d + 0.05, 0.42, 0.06, k * 3.1 + t * 0.2);
          // the jets under and round the door while the wind blows
          if (t < 54.2) for (let k = 0; k < 6; k++) { const u = ((t * 1.7 + k / 6) % 1); smoke.puff(-44.4 - u * 2.5, 0.15 + 0.6 * (k % 2), 9.2 + k * 0.2, 0.3 + u * 0.9, 0.4 * (1 - u), 0.4, 0.05, k); }
        }
        if (tAfter) for (let k = 0; k < 14; k++) smoke.puff(-42 + (k % 5) * 4.5, 1.2 + (k % 3) * 1.1, -3 + Math.floor(k / 5) * 9 + 1.5 * Math.sin(v * 0.2 + k), 3.4, 0.07, 0.55, 0.12, k * 2.3 + v * 0.05);
      }
    },
  };
}
