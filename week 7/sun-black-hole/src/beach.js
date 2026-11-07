// What stands on and around the beach: the sand (dry, wet, then frost and snow), the promenade, the road, umbrellas,
// towels, loungers, surfboards, the lifeguard tower, palms (their fronds frost, brown and droop: uPalm), lamps, the hotels
// behind you and the far city (windows that light up: uWin), the pier with its Ferris wheel, the far shore and its hills.
// Everything is frostified (frost.js): rime as it freezes (FU.uFrost) and snow lying on every upward face (FU.uCover).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frostify } from './frost.js';
import {
  Z_W, PROM, ROAD, sandY, UMBRELLAS, TOWELS, CHAIRS, PALMS, LAMPS, HOTELS, CITY, BOARDS, TOWER, PIER, WHEEL, FAR, FAR_Y,
} from './layout.js';
import { rng } from './util.js';

export const BU = { uWin: { value: 0 }, uGlowK: { value: 0.2 }, uDim: { value: 0 }, uPalm: { value: 0 } };
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
const tmpC = new THREE.Color();
const place = (x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx, pitch = 0, roll = 0) => { e.set(pitch, yaw, roll, 'YXZ'); q.setFromEuler(e); return m4.compose(p.set(x, y, z), q, sc.set(sx, sy, sz)); };

// a patch on top of frostify: extra uniforms and code before the frost (color) and after it (emissive)
function patch(mat, uniforms, colorCode, emissiveCode = '', pars = '') {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    prev(sh);
    Object.assign(sh.uniforms, uniforms);
    const decl = Object.keys(uniforms).map((k) => `uniform float ${k};`).join(' ');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}\n${pars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${colorCode}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissiveCode}`);
  };
  return mat;
}
const WIN_GLSL = /* glsl */ `
  // windows on a wall: 3.2 m bays, 3.3 m floors; returns the glass mask, faded to its average once smaller than a pixel
  float winMask(vec3 wp, vec3 n, out float lit, float share) {
    float side = 1.0 - abs(n.y);
    float u = abs(n.x) > 0.5 ? wp.z : wp.x;
    vec2 g = vec2(u / 3.2, (wp.y - 1.2) / 3.3);
    vec2 cell = floor(g), f = fract(g);
    float w = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.86) * step(0.0, g.y);
    float px = max(fwidth(g.x), fwidth(g.y));
    float fade = smoothstep(0.3, 0.8, px);
    float hh = fract(sin(dot(cell + floor(wp.xz / 37.0) * 13.1 + n.xz * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
    lit = mix(w * step(hh, share), 0.3 * share, fade) * side;
    return mix(w, 0.44, fade) * side;
  }
`;

export function makeBeach(scene, ctx) {
  const { plainMat, shadowy } = ctx;
  const out = { lamps: [], pierLamps: [], bulbs: [] };

  // ---------- the sand and the sea floor ----------
  {
    const g = new THREE.PlaneGeometry(1600, PROM.z0 + 260, 40, 120).rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // rows bunched toward the waterline and you
      const z0 = pos.getZ(i);                                   // -h/2 .. h/2
      const u = (z0 + (PROM.z0 + 260) / 2) / (PROM.z0 + 260);   // 0 far out .. 1 at the promenade
      const z = -260 + Math.pow(u, 0.55) * (PROM.z0 + 260);
      pos.setZ(i, z);
      pos.setY(i, sandY(z));
    }
    g.computeVertexNormals();
    const mat = patch(frostify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })), {},
      /* glsl */ `
      {
        float dz = vFW.z - (${Z_W.toFixed(1)});
        float wet = 1.0 - smoothstep(0.5, 4.5, dz);
        float rip = 0.5 + 0.5 * sin(vFW.x * 3.1 + sin(vFW.z * 0.7) * 2.0 + vFW.z * 1.3);
        float n = fh13(floor(vFW * vec3(2.3, 1.0, 2.3))) * 0.5 + fn3(vFW * 0.35) * 0.5;
        vec3 dry = vec3(0.7, 0.55, 0.36) * (0.88 + 0.14 * n + 0.04 * rip);
        vec3 wc = vec3(0.45, 0.37, 0.27) * (0.9 + 0.1 * n);
        diffuseColor.rgb = mix(dry, wc, wet);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.36), smoothstep(-0.3, -3.0, vFW.y));
      }`);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
    // the snow that piles up on it (raised as it deepens; it stops short of the water)
    const sg = g.clone();
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) if (sp.getZ(i) < Z_W + 2.5) sp.setY(i, -6);
    sg.computeVertexNormals();
    const smat = frostify(new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.9 }), { base: 0.6 });
    out.snow = new THREE.Mesh(sg, smat);
    out.snow.receiveShadow = true;
    out.snow.visible = false;
    scene.add(out.snow);
  }
  // ---------- the promenade, its wall, the road, the sidewalk ----------
  {
    const W = 1600;
    const prom = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, PROM.z1 - PROM.z0).translate(0, PROM.y - 0.25, (PROM.z0 + PROM.z1) / 2), plainMat(0xd8d0c2, 0.85));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, PROM.wall + 1.5, 0.5).translate(0, PROM.y + PROM.wall / 2 - 0.75, PROM.z0), plainMat(0xe8e2d6, 0.8));
    const road = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, ROAD.z1 - ROAD.z0).translate(0, ROAD.y - 0.2, (ROAD.z0 + ROAD.z1) / 2), plainMat(0x34363a, 0.9));
    const walk = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, 14).translate(0, PROM.y - 0.2, ROAD.z1 + 7), plainMat(0xcfc8bc, 0.85));
    const lines = new THREE.Mesh(mergeGeometries([75.1, 78.0].map((z) => new THREE.BoxGeometry(W, 0.02, 0.15).translate(0, ROAD.y + 0.01, z))), plainMat(0xe8e0c0, 0.6));
    for (const m of [prom, wall, road, walk, lines]) { m.receiveShadow = true; m.castShadow = m !== road && m !== lines; scene.add(m); }
  }
  // ---------- umbrellas: a striped canopy (two meshes: odd and even panels), a pole ----------
  {
    const N = 10, R = 1.25, Hc = 0.42;
    const wedge = (k) => {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const g = new THREE.BufferGeometry();
      const v = [0, 0, 0, Math.cos(a0) * R, -Hc, Math.sin(a0) * R, Math.cos(a1) * R, -Hc, Math.sin(a1) * R];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      // (both faces: the canopy is seen from below too)
      const back = g.clone(); back.setAttribute('position', new THREE.Float32BufferAttribute([v[0], v[1], v[2], v[6], v[7], v[8], v[3], v[4], v[5]], 3)); back.computeVertexNormals();
      return [g, back];
    };
    const even = mergeGeometries(Array.from({ length: N / 2 }, (_, i) => wedge(i * 2)).flat());
    const odd = mergeGeometries(Array.from({ length: N / 2 }, (_, i) => wedge(i * 2 + 1)).flat());
    const pole = new THREE.CylinderGeometry(0.025, 0.025, 1, 6).translate(0, -0.5, 0);
    const mA = shadowy(new THREE.InstancedMesh(even, plainMat(0xffffff, 0.8, { side: THREE.DoubleSide }), UMBRELLAS.length));
    const mB = shadowy(new THREE.InstancedMesh(odd, plainMat(0xffffff, 0.8, { side: THREE.DoubleSide }), UMBRELLAS.length));
    const mP = shadowy(new THREE.InstancedMesh(pole, plainMat(0xe8e8e8, 0.5), UMBRELLAS.length));
    UMBRELLAS.forEach((u, i) => {
      const y = sandY(u.z) + u.h;
      place(u.x, y, u.z, u.yaw, 1, 1, 1, u.tilt * 0.5, u.tilt * 0.5);
      mA.setMatrixAt(i, m4); mB.setMatrixAt(i, m4);
      mA.setColorAt(i, tmpC.set(u.col)); mB.setColorAt(i, tmpC.set(u.col2));
      place(u.x, y, u.z, 0, 1, u.h + 0.2, 1, u.tilt * 0.5, u.tilt * 0.5);
      mP.setMatrixAt(i, m4);
    });
    for (const m of [mA, mB, mP]) scene.add(m);
  }
  // ---------- towels, loungers, surfboards ----------
  {
    const towel = new THREE.BoxGeometry(0.95, 0.03, 1.85).translate(0, 0.015, 0);
    const mT = new THREE.InstancedMesh(towel, plainMat(0xffffff, 0.95), TOWELS.length);
    mT.receiveShadow = true; mT.frustumCulled = false;
    TOWELS.forEach((t, i) => { mT.setMatrixAt(i, place(t.x, sandY(t.z), t.z, t.yaw)); mT.setColorAt(i, tmpC.set(t.col)); });
    scene.add(mT);
    const chair = mergeGeometries([
      new THREE.BoxGeometry(0.62, 0.05, 1.25).translate(0, 0.3, 0.2),
      new THREE.BoxGeometry(0.62, 0.05, 0.75).rotateX(-1.05).translate(0, 0.62, -0.55),
      ...[-0.27, 0.27].flatMap((x) => [new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(x, 0.15, 0.75), new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(x, 0.15, -0.3)]),
    ].map((g) => g.toNonIndexed()));
    const mC = shadowy(new THREE.InstancedMesh(chair, plainMat(0xffffff, 0.7), CHAIRS.length));
    CHAIRS.forEach((c, i) => { mC.setMatrixAt(i, place(c.x, sandY(c.z), c.z, c.yaw)); mC.setColorAt(i, tmpC.set(c.col)); });
    scene.add(mC);
    const board = new THREE.SphereGeometry(1, 12, 8).scale(0.27, 1.05, 0.04).translate(0, 0.75, 0);
    const mB = shadowy(new THREE.InstancedMesh(board, plainMat(0xffffff, 0.5), BOARDS.length));
    BOARDS.forEach((b, i) => { mB.setMatrixAt(i, place(b.x, sandY(b.z) - 0.25, b.z, b.yaw, 1, 1, 1, 0.12)); mB.setColorAt(i, tmpC.set(b.col)); });
    scene.add(mB);
  }
  // ---------- the lifeguard tower ----------
  {
    const y0 = sandY(TOWER.z);
    const g = new THREE.Group();
    const red = plainMat(0xd8402e, 0.6), white = plainMat(0xf0ece4, 0.7), wood = plainMat(0x8a6a4a, 0.85);
    for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16).translate(x, 1.3, z), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 3.0).translate(0, 2.6, 0), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 2.2).translate(0, 3.6, 0.25), white));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.05).translate(0, 3.9, -0.86), plainMat(0x1a2a36, 0.2)));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 2.8).translate(0, 4.62, 0.15), red));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 3.6).rotateX(-0.6).translate(0, 1.3, 2.5), wood));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.06).translate(0, 2.95, -1.5), red));
    g.position.set(TOWER.x, y0, TOWER.z);
    g.rotation.y = 0.15;
    g.traverse((o) => { if (o.isMesh) shadowy(o); });
    scene.add(g);
    out.towerY = y0 + 2.7;
  }
  // ---------- palms ----------
  {
    const frond = (len) => {
      const segs = 8, g = new THREE.PlaneGeometry(1, 1, 1, segs);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getY(i) + 0.5, side = pos.getX(i);
        const s = u * len, w = (0.18 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15))) * (1 - u * 0.5);
        pos.setXYZ(i, side * w, 0.45 * s - 0.09 * s * s - Math.abs(side) * 0.18 * w, -s * 0.95);
      }
      g.computeVertexNormals();
      return g;
    };
    const trunk = mergeGeometries(Array.from({ length: 6 }, (_, k) => new THREE.CylinderGeometry(0.17 - k * 0.012, 0.19 - k * 0.012, 1 / 6 + 0.01, 7, 1).translate(0.06 * Math.pow(k / 6, 2), (k + 0.5) / 6, 0).toNonIndexed()));
    const crown = mergeGeometries(Array.from({ length: 11 }, (_, i) => frond(3.4 + (i % 3) * 0.5).rotateX(-0.15 + (i % 2) * 0.25).rotateY((i / 11) * Math.PI * 2).toNonIndexed()));
    const tMat = plainMat(0x8a7458, 0.95);
    const cMat = plainMat(0x3f7a2c, 0.8, { side: THREE.DoubleSide });
    // the crown: it browns and droops as the palms freeze (the frond tips sag furthest)
    {
      const prev = cMat.onBeforeCompile;
      cMat.onBeforeCompile = (sh) => {
        prev(sh);
        sh.uniforms.uPalm = BU.uPalm;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPalm;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            { float r = length(transformed.xz); transformed.y -= uPalm * (0.12 * r * r + 0.25 * r); transformed.xz *= 1.0 - 0.12 * uPalm; }`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPalm;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.2) * (0.8 + 0.4 * fract(sin(dot(floor(vFW.xz * 1.7), vec2(12.9, 78.2))) * 43758.5)), uPalm * 0.85);`);
      };
    }
    const mT = shadowy(new THREE.InstancedMesh(trunk, tMat, PALMS.length));
    const mC = shadowy(new THREE.InstancedMesh(crown, cMat, PALMS.length));
    PALMS.forEach((pl, i) => {
      const py = pl.y ?? PROM.y;
      mT.setMatrixAt(i, place(pl.x, py, pl.z, pl.yaw, 1, pl.h, 1, pl.lean));
      const top = new THREE.Vector3(0.06, 1, 0).applyEuler(new THREE.Euler(pl.lean, pl.yaw, 0, 'YXZ'));
      mC.setMatrixAt(i, place(pl.x + top.x * pl.h, py + top.y * pl.h, pl.z + top.z * pl.h, pl.yaw + pl.seed * 3));
    });
    scene.add(mT, mC);
  }
  // ---------- lamps on the promenade ----------
  {
    const post = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6).translate(0, 3.25, 0), new THREE.BoxGeometry(0.9, 0.12, 0.3).translate(-0.4, 6.45, 0)].map((g) => g.toNonIndexed()));
    const mL = shadowy(new THREE.InstancedMesh(post, plainMat(0x3a3e44, 0.5, { metalness: 0.4 }), LAMPS.length));
    LAMPS.forEach((l, i) => { mL.setMatrixAt(i, place(l.x, PROM.y, l.z, Math.PI / 2)); out.lamps.push([l.x, PROM.y + 6.3, l.z - 0.75]); });
    scene.add(mL);
  }
  // ---------- buildings: the hotels behind you and the far city (windows that light) ----------
  const facade = (col) => patch(plainMat(col, 0.85), { uWin: BU.uWin, uGlowK: BU.uGlowK, uDim: BU.uDim },
    /* glsl */ `{ float lt; float g = winMask(vFW, normalize(vFN), lt, 0.5); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.24), g * 0.8); }`,
    /* glsl */ `{ float lt; float share = mix(0.1, 0.42, uWin) * (1.0 - 0.65 * uDim); winMask(vFW, normalize(vFN), lt, share);
       totalEmissiveRadiance += vec3(1.0, 0.76, 0.5) * lt * 0.6 * uGlowK; }`, WIN_GLSL);
  {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mH = shadowy(new THREE.InstancedMesh(box, facade(0xffffff), HOTELS.length));
    HOTELS.forEach((h, i) => { mH.setMatrixAt(i, place(h.x, PROM.y - 0.3, h.z, 0, h.w, h.h, h.d)); mH.setColorAt(i, tmpC.set(h.col)); });
    scene.add(mH);
    const mF = new THREE.InstancedMesh(box, facade(0xffffff), CITY.length);
    mF.frustumCulled = false;
    const R = rng(55);
    CITY.forEach((c, i) => {
      mF.setMatrixAt(i, place(c.x, FAR_Y - 1, c.z, c.seed * 1.2, c.w, c.h, c.d));
      mF.setColorAt(i, tmpC.setHSL(0.08 + R() * 0.06, 0.12, 0.62 + R() * 0.2));
    });
    scene.add(mF);
  }
  // ---------- the far shore and its hills ----------
  {
    const pts = [...FAR, [14000, 600], [14000, -16000], [FAR[0][0], -16000]];
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, FAR_Y, 0);
    const land = new THREE.Mesh(g, plainMat(0x6d6a50, 0.95));
    land.receiveShadow = true;
    scene.add(land);
    const hills = [];
    const R = rng(808);
    for (let k = 0; k < 14; k++) {
      const i = 1 + Math.floor(R() * (FAR.length - 3)), u = R();
      const [ax, az] = FAR[i], [bx, bz] = FAR[i + 1];
      const x = ax + (bx - ax) * u + 1500 + R() * 1800, z = az + (bz - az) * u - 900 - R() * 1500;
      hills.push(new THREE.SphereGeometry(1, 14, 8).scale(500 + R() * 600, 180 + R() * 260, 500 + R() * 600).translate(x, FAR_Y - 40, z).toNonIndexed());
    }
    const hm = new THREE.Mesh(mergeGeometries(hills), plainMat(0x4f6440, 0.95));
    scene.add(hm);
  }
  // ---------- the pier: deck, rails, pilings, the arcade at its end, lamps; the Ferris wheel ----------
  {
    const len = PIER.z0 - PIER.z1, zc = (PIER.z0 + PIER.z1) / 2;
    const wood = plainMat(0x7a6650, 0.9), white = plainMat(0xeeeae2, 0.7);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(PIER.w, 0.5, len).translate(PIER.x, PIER.y - 0.25, zc), wood);
    const rails = new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.12, 1.1, len).translate(PIER.x + s * (PIER.w / 2 - 0.1), PIER.y + 0.55, zc))), white);
    const piles = [];
    for (let z = PIER.z0 - 4; z > PIER.z1; z -= 9) for (const s of [-1, 1]) piles.push(new THREE.CylinderGeometry(0.3, 0.3, 14, 6).translate(PIER.x + s * (PIER.w / 2 - 0.6), PIER.y - 7.3, z).toNonIndexed());
    const pm = new THREE.Mesh(mergeGeometries(piles), wood);
    const arcade = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(PIER.w + 10, 6, 26).translate(PIER.x, PIER.y + 3, PIER.z1 + 16),
      new THREE.BoxGeometry(PIER.w + 12, 0.6, 28).translate(PIER.x, PIER.y + 6.3, PIER.z1 + 16),
    ].map((g) => g.toNonIndexed())), white);
    const pdeck = new THREE.Mesh(new THREE.BoxGeometry(PIER.w + 16, 0.5, 70).translate(PIER.x, PIER.y - 0.25, PIER.z1 + 30), wood);
    for (const m of [deck, rails, pm, arcade, pdeck]) { shadowy(m); scene.add(m); }
    for (let z = PIER.z0 - 6; z > PIER.z1 + 40; z -= 12) for (const s of [-1, 1]) out.pierLamps.push([PIER.x + s * (PIER.w / 2 - 0.2), PIER.y + 3.6, z]);
    const posts = new THREE.Mesh(mergeGeometries(out.pierLamps.map(([x, y, z]) => new THREE.CylinderGeometry(0.06, 0.06, 3.6, 5).translate(x, y - 1.8, z).toNonIndexed())), plainMat(0x30343a, 0.5));
    scene.add(posts);
    // the wheel: a double rim, spokes, gondolas, an A-frame; it turns slowly (once every ~6 min) until the power stops it
    const W = new THREE.Group();
    const rim = mergeGeometries([-1, 1].map((s) => new THREE.TorusGeometry(WHEEL.r, 0.22, 6, 64).translate(0, 0, s * 1.2).toNonIndexed()));
    const spokes = [];
    for (let k = 0; k < 24; k++) spokes.push(new THREE.BoxGeometry(0.12, WHEEL.r, 0.12).translate(0, WHEEL.r / 2, 0).rotateZ((k / 24) * Math.PI * 2).translate(0, 0, (k % 2 ? 1 : -1) * 1.2).toNonIndexed());
    const hub = new THREE.CylinderGeometry(1.2, 1.2, 3, 12).rotateX(Math.PI / 2).toNonIndexed();
    const wheel = new THREE.Mesh(mergeGeometries([rim, ...spokes, hub]), white);
    const rot = new THREE.Group();
    rot.add(wheel);
    const gond = new THREE.BoxGeometry(1.8, 1.9, 1.8);
    const gm = new THREE.InstancedMesh(gond, plainMat(0xffffff, 0.6), 20);
    for (let k = 0; k < 20; k++) gm.setColorAt(k, tmpC.set([0xd8402e, 0xf3c52f, 0x2f8fd8, 0x29a36a, 0xff7f2a][k % 5]));
    gm.frustumCulled = false;
    const legs = new THREE.Mesh(mergeGeometries([-1, 1].flatMap((sz) => [-1, 1].map((sx) => {
      const L = Math.hypot(WHEEL.r * 0.55, WHEEL.y - PIER.y);
      return new THREE.CylinderGeometry(0.35, 0.45, L, 6).translate(0, -L / 2, 0).rotateZ(sx * Math.atan2(WHEEL.r * 0.55, WHEEL.y - PIER.y)).translate(0, 0, sz * 2.4).toNonIndexed();
    }))), white);
    W.add(rot, legs);
    W.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    W.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(W, gm);
    out.wheel = { group: W, rot, gm };
  }
  return out;
}

// the wheel's turn and its gondolas (hanging level), and its rim bulbs (glows) for this frame
export function wheelFrame(beach, ang, glows, on, t) {
  const { rot, gm } = beach.wheel;
  rot.rotation.z = ang;
  for (let k = 0; k < 20; k++) {
    const a = ang + (k / 20) * Math.PI * 2;
    place(WHEEL.x + Math.sin(a) * WHEEL.r, WHEEL.y - Math.cos(a) * WHEEL.r - 1.3, WHEEL.z, 0);
    gm.setMatrixAt(k, m4);
  }
  gm.instanceMatrix.needsUpdate = true;
  if (on <= 0.001) return;
  const N = 48;
  for (let k = 0; k < N; k++) {
    const a = ang + (k / N) * Math.PI * 2;
    // they come on in a sweep round the rim, then chase in colours
    const lit = Math.min(1, Math.max(0, on * 1.4 - (k / N) * 0.4));
    const ch = 0.6 + 0.4 * Math.sin(t * 3 - k * 0.8);
    const c = [[1.0, 0.35, 0.55], [0.4, 0.7, 1.0], [1.0, 0.8, 0.3]][k % 3];
    for (const s of [-1.2, 1.2]) glows.add(WHEEL.x + Math.sin(a) * WHEEL.r, WHEEL.y - Math.cos(a) * WHEEL.r, WHEEL.z + s, 1.6, c[0] * 5 * lit * ch, c[1] * 5 * lit * ch, c[2] * 5 * lit * ch);
    if (k % 2 === 0) { const rr = WHEEL.r * 0.5; glows.add(WHEEL.x + Math.sin(a) * rr, WHEEL.y - Math.cos(a) * rr, WHEEL.z - 1.3, 1.1, 2.4 * lit, 2.2 * lit, 2.0 * lit); }
  }
}
