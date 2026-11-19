// Real things in your path after the avenue, each placed where you reach it at a speed where it can still be seen
// coming (an object is in view from the horizon/haze until it flashes past):
//   sailboats (0:11-0:12.3, 4-5 km/s), a ferry, an airliner you overtake as if it were parked (0:11.55: it flies
//   250 m/s, you 4,200), ships and a cruise ship (0:15-0:16.5), an island and an archipelago (0:16.2-0:17.7).
//   The container ship you go through, the coastal city and the mountain are in wrecks.js.
// All in render space (you at the origin, running toward -z): a thing at distance s along your path sits at
// z = -(s - you), dropped by the curve of the Earth (d^2 / 2R).
import * as THREE from 'three';
import { distAt, R_EARTH } from './timeline.js';
import { SEA_Y, hh } from './avenue.js';
import { SU } from './surface.js';

// a lit material with the sea's distance haze
export function seaMat(color, rough = 0.8, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = SU.uHaze; sh.uniforms.uHazeD = SU.uHazeD;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 hw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          hw = instanceMatrix * hw;
          #endif
          vTW = (modelMatrix * hw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; uniform vec3 uHaze; uniform float uHazeD;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 1.0 - exp(-length(vTW - cameraPosition) / (uHazeD * 2.5)));`);
  };
  m.customProgramCacheKey = () => 'sea-thing-' + color;
  return m;
}
// rows of lit windows (ships, towers)
export function windowTex(cols, rows, lit = 0.5) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.15) * 256 / cols, y = (r + 0.3) * 256 / rows;
    g.fillStyle = Math.sin(r * 7.1 + c * 3.3) > 1 - 2 * lit ? '#2a3440' : '#465868';
    g.fillRect(x, y, 256 / cols * 0.7, 256 / rows * 0.45);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---- the list (s in metres along your path; x across; for the airliner a cruise speed) ----
const SAILS = [10900, 11350, 11800, 12200, 12650, 13100, 13550, 14000, 14600, 15150].map((s, i) => ({ s, x: (i % 2 ? 1 : -1) * (9 + 26 * hh(i, 71)), yaw: (hh(i, 72) - 0.5) * 1.2, k: hh(i, 73) }));
const FERRY = { s: 14800, x: -32 };
const PLANE = { s0: 12320 - 250 * 11.55, v: 250, x: 22, y: 75 };
const CRUISE = { s: 49500, x: 160 };
const SHIPS = [{ s: 36000, x: -90 }, { s: 43000, x: 120 }, { s: 57000, x: -80 }, { s: 64000, x: 140 }];
const ISLAND = { s: 62000, x: -3700, r: 2200, h: 480 };   // (every island's shore stays clear of your path: flying through one strobes)
const ISLES = [];
for (let i = 0; i < 18; i++) { const r = 300 + 1400 * hh(i, 103); ISLES.push({ s: 52000 + 36000 * (i / 18) + 1500 * hh(i, 101), x: (i % 2 ? 1 : -1) * (1.6 * r + 250 + 1500 * hh(i, 102)), r, h: 60 + 380 * hh(i, 104) }); }
export const COAST_S = 90000;            // the land starts here (surface.js uses the same)
export const LAND_END_S = 900000;        // and the next ocean here
// what passes you and where (for the soundtrack's whooshes): [s, loudness, kind 0 boat/ship 1 island 2 tower 3 peak]
export const PASSES = [
  ...SAILS.map((b) => [b.s, 0.5, 0]), [FERRY.s, 0.8, 0], [CRUISE.s, 1, 0], ...SHIPS.map((sh) => [sh.s, 0.8, 0]),
  [ISLAND.s, 1, 1], ...ISLES.map((c) => [c.s, 0.4 + c.h / 600, 1]),
];
export const PLANE_PASS_S = PLANE.s0;   // (it flies 250 m/s: you pass it when distAt(t) = PLANE.s0 + 250 t)
export const PLANE_V = PLANE.v;

export function makeThings(scene) {
  const all = [];
  const add = (o) => { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; scene.add(o); all.push(o); return o; };
  // sailboats: a white hull, a mast and two sails
  const boatG = new THREE.Group();
  {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 9, 10, 1).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.4, 0), seaMat(0xf4f2ee, 0.5));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 13, 6).translate(0, 7, 0.5), seaMat(0xc0c0c0, 0.4));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.4, 0.6, 0, 13, 0.5, 0, 1.4, 4.4, 0, 1.6, 0.2, 0, 10, 0.3, 0, 1.6, -3.6], 3));
    sg.computeVertexNormals();
    const sail = new THREE.Mesh(sg, seaMat(0xfdfbf6, 0.9, { side: THREE.DoubleSide }));
    boatG.add(hull, mast, sail);
  }
  const boats = SAILS.map(() => add(boatG.clone()));
  // the ferry
  const ferry = new THREE.Group();
  {
    const hullT = windowTex(16, 2, 0.3); hullT.repeat.set(3, 1);
    ferry.add(new THREE.Mesh(new THREE.BoxGeometry(14, 6, 80).translate(0, 2, 0), seaMat(0x1d3a5f, 0.6)));
    ferry.add(new THREE.Mesh(new THREE.BoxGeometry(12, 7, 50).translate(0, 8.5, 4), seaMat(0xffffff, 0.5, { map: hullT })));
    ferry.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 5, 10).translate(0, 14, 12), seaMat(0xb02020, 0.5)));
  }
  add(ferry);
  // the airliner: fuselage, wings, tail, two engines (nose toward -z)
  const plane = new THREE.Group();
  {
    const white = seaMat(0xf2f2f0, 0.35, { metalness: 0.2 }), blue = seaMat(0x23408a, 0.4);
    plane.add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 36, 16).rotateX(Math.PI / 2), white));
    plane.add(new THREE.Mesh(new THREE.SphereGeometry(2, 16, 10).scale(1, 1, 2.2).translate(0, 0, -18), white));
    plane.add(new THREE.Mesh(new THREE.ConeGeometry(2, 9, 16).rotateX(Math.PI / 2).translate(0, 0.3, 22), white));
    const wing = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(17, 7), new THREE.Vector2(17, 10), new THREE.Vector2(0, 8)].map((p) => p));
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.5, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, -0.6, -4);
    plane.add(new THREE.Mesh(wg, white));
    plane.add(new THREE.Mesh(wg.clone().scale(-1, 1, 1), white));
    plane.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 6).translate(0, 5, 21).rotateX(0), blue));
    plane.add(new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 4).translate(0, 1, 22), white));
    for (const sx of [-1, 1]) plane.add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.2, 5, 12).rotateX(Math.PI / 2).translate(sx * 6, -1.8, -2), blue));
    plane.add(new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.5, 30).translate(0, -0.2, 0), blue));
  }
  add(plane);
  // the cruise ship: a long white hull, decks stepping up, lifeboats, a funnel
  const cruise = new THREE.Group();
  {
    const wt = windowTex(24, 6, 0.4); wt.repeat.set(6, 1);
    cruise.add(new THREE.Mesh(new THREE.BoxGeometry(36, 16, 300).translate(0, 2, 0), seaMat(0x1b2230, 0.6)));
    for (let d = 0; d < 5; d++) cruise.add(new THREE.Mesh(new THREE.BoxGeometry(34 - d * 3, 9, 270 - d * 30).translate(0, 14.5 + d * 9, -10 + d * 4), seaMat(0xffffff, 0.45, { map: wt })));
    cruise.add(new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 18, 12).translate(0, 66, 40), seaMat(0xc62828, 0.5)));
  }
  add(cruise);
  const ships = SHIPS.map((sh, i) => { const g = (i % 2 ? cruise : ferry).clone(); g.scale.setScalar(i % 2 ? 0.7 : 1.6); return add(g); });
  // the island: a green hill with a sandy shore
  const isl = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 12, true), seaMat(0x3d5a2a, 0.95));
  {
    const p = isl.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.25 * Math.sin(a * 3 + 1) + 0.12 * Math.sin(a * 7) + 0.1 * Math.sin(y * 9 + a * 2);
      p.setXYZ(i, x * k, y + 0.5, z * k);
    }
    isl.geometry.computeVertexNormals();
  }
  add(isl);
  const beach = add(new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.1, 0.02, 48), seaMat(0xd9c79a, 0.95)));
  const isles = add(new THREE.InstancedMesh(isl.geometry, isl.material, ISLES.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // where a thing at distance s sits now (render z), and how far the Earth's curve drops it
  const place = (S, s) => { const d = s - S; return { z: -d, drop: (d * d) / (2 * R_EARTH), d }; };
  return {
    all,
    frame(v, S, visible) {
      for (const o of all) o.visible = visible;
      if (!visible) return;
      const near = (d, ahead, behind) => d < ahead && d > -behind;
      SAILS.forEach((b, i) => {
        const P = place(S, b.s), o = boats[i];
        o.visible = near(P.d, 30000, 600);
        o.position.set(b.x, SEA_Y - P.drop + 0.15 * Math.sin(v * 1.3 + i), P.z);
        o.rotation.set(0.05 * Math.sin(v * 1.1 + i * 2), b.yaw, 0.12 * Math.sin(v * 0.9 + i));
        o.scale.setScalar(1.4 + 0.8 * b.k);
      });
      { const P = place(S, FERRY.s); ferry.visible = near(P.d, 30000, 800); ferry.position.set(FERRY.x, SEA_Y - P.drop, P.z); ferry.rotation.set(0, 0.25, 0.02 * Math.sin(v)); }
      { const sP = PLANE.s0 + PLANE.v * v, P = place(S, sP); plane.visible = near(P.d, 40000, 1500); plane.position.set(PLANE.x, PLANE.y - P.drop, P.z); plane.rotation.set(0.03, 0, 0.04); }
      { const P = place(S, CRUISE.s); cruise.visible = near(P.d, 45000, 2000); cruise.position.set(CRUISE.x, SEA_Y - P.drop, P.z); cruise.rotation.set(0, -0.12, 0); }
      { const P = place(S, ISLAND.s); isl.visible = beach.visible = near(P.d, 90000, 6000);
        isl.position.set(ISLAND.x, SEA_Y - P.drop - 5, P.z); isl.scale.set(ISLAND.r, ISLAND.h, ISLAND.r * 1.9);
        beach.position.set(ISLAND.x, SEA_Y - P.drop + 0.2, P.z); beach.scale.set(ISLAND.r, 1, ISLAND.r * 1.9); }
      SHIPS.forEach((sh, i) => { const P = place(S, sh.s), o = ships[i]; o.visible = near(P.d, 40000, 1500); o.position.set(sh.x, SEA_Y - P.drop, P.z); o.rotation.set(0, 0.3 * (i % 2 ? 1 : -1), 0); });
      ISLES.forEach((c, i) => {
        const P = place(S, c.s);
        isles.setMatrixAt(i, near(P.d, 90000, 5000) ? m4.compose(p.set(c.x, SEA_Y - P.drop - 3, P.z), q.setFromEuler(e.set(0, i * 2.1, 0)), sc.set(c.r, c.h, c.r * 1.5)) : zero);
      });
      isles.instanceMatrix.needsUpdate = true;
    },
  };
}
