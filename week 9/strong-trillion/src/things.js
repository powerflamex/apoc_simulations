// The things you lift: a red city bus, a container truck, a jumbo jet (747-size), a cruise ship (three pieces, so it
// can break where you hold it) and a glass tower (five pieces). Each is a group with its origin at the middle of its
// footprint on the ground (the ship: at its waterline), built in metres at real size. Every material of a thing shares
// that thing's dent uniforms: a dent where you grip it, and a crush (squashed, crumpled) after it lands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { hazed, FACADE_GLSL } from './world.js';
import { SHIP, TOWER } from './layout.js';
import { rng } from './util.js';

export function dentUniforms() {
  return {
    uDentP: { value: new THREE.Vector3() }, uDentD: { value: new THREE.Vector3(0, 1, 0) }, uDentR: { value: 1 }, uDentK: { value: 0 },
    uCrush: { value: 0 }, uCrushH: { value: 3 }, uSeed: { value: 0 },
  };
}
const DENT_GLSL = /* glsl */ `
uniform vec3 uDentP; uniform vec3 uDentD; uniform float uDentR; uniform float uDentK; uniform float uCrush; uniform float uCrushH; uniform float uSeed;
float dh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float dn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh(i), dh(i + vec3(1,0,0)), f.x), mix(dh(i + vec3(0,1,0)), dh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh(i + vec3(0,0,1)), dh(i + vec3(1,0,1)), f.x), mix(dh(i + vec3(0,1,1)), dh(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// a lit, hazed material that dents and crushes with the thing's uniforms (DU)
export function thingMat(DU, color, rough = 0.6, extra = {}) {
  const m = hazed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, DU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${DENT_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 p0 = transformed;
          float d = length(p0 - uDentP);
          float k = 1.0 - smoothstep(0.0, uDentR, d);
          transformed += uDentD * uDentK * k * k * (0.75 + 0.5 * dn(p0 * 1.7 + uSeed));
          // crushed: squashed down toward the ground and crumpled
          float c = uCrush;
          if (c > 0.0) {
            float n = dn(p0 * 0.6 + uSeed) - 0.5, n2 = dn(p0 * 2.1 + uSeed * 3.0) - 0.5;
            transformed.y = mix(transformed.y, transformed.y * (1.0 - 0.55 * c) + n * 0.25 * c * uCrushH, c);
            transformed.xz += vec2(n, n2) * c * 0.12 * uCrushH;
          }
        }`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '-dent';
  return m;
}
const shadowAll = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } }); return g; };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// ---------------- the bus: 12.2 x 2.55 m, 3.15 m tall, red, front at -z, doors on its right (+x) ----------------
export function makeBus() {
  const DU = dentUniforms(); DU.uCrushH.value = 3.2; DU.uSeed.value = 1.3;
  const g = new THREE.Group();
  const red = thingMat(DU, 0xc4211d, 0.45), glass = thingMat(DU, 0x101418, 0.12, { metalness: 0.4 }), white = thingMat(DU, 0xf2f0ea, 0.5),
    black = thingMat(DU, 0x161616, 0.8), tire = thingMat(DU, 0x111111, 0.9), hub = thingMat(DU, 0x9a9da2, 0.4, { metalness: 0.5 }),
    sign = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4) });
  const L = 12.2, W = 2.55;
  g.add(new THREE.Mesh(new RoundedBoxGeometry(W, 2.75, L, 3, 0.16).translate(0, 0.32 + 1.375, 0), red));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(W - 0.25, 0.25, L - 1.4, 2, 0.1).translate(0, 3.12, 0.3), white));   // roof AC pod
  // the window band (one dark glass band, broken by pillars), the windscreen, the rear window
  g.add(new THREE.Mesh(box(W + 0.03, 1.15, L - 1.9, 0, 2.05, 0.35), glass));
  const pil = [];
  for (let z = -4.6; z < 6.0; z += 1.55) for (const sx of [-1, 1]) pil.push(box(0.04, 1.17, 0.12, sx * (W / 2 + 0.02), 2.05, z));
  g.add(new THREE.Mesh(mergeGeometries(pil), red));
  g.add(new THREE.Mesh(box(W - 0.2, 1.75, 0.04, 0, 1.95, -L / 2 - 0.01), glass));
  g.add(new THREE.Mesh(box(W - 0.4, 0.8, 0.04, 0, 2.15, L / 2 + 0.01), glass));
  g.add(new THREE.Mesh(box(W - 0.5, 0.28, 0.05, 0, 2.95, -L / 2 - 0.02), sign));
  // the doors (curb side) and the bumpers, a white stripe under the windows
  g.add(new THREE.Mesh(mergeGeometries([box(0.04, 2.3, 1.1, W / 2 + 0.02, 1.5, -4.9), box(0.04, 2.3, 1.1, W / 2 + 0.02, 1.5, 0.9)]), glass));
  g.add(new THREE.Mesh(mergeGeometries([box(W + 0.04, 0.32, 0.18, 0, 0.5, -L / 2 - 0.05), box(W + 0.04, 0.32, 0.18, 0, 0.5, L / 2 + 0.05)]), black));
  g.add(new THREE.Mesh(box(W + 0.035, 0.12, L - 1.6, 0, 1.4, 0.2), white));
  for (const [z, sx] of [[-3.7, -1], [-3.7, 1], [3.0, -1], [3.0, 1]]) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.12), 0.5, z), tire));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 12).rotateZ(Math.PI / 2).translate(sx * (W / 2 + 0.05), 0.5, z), hub));
  }
  // a few headlights
  g.add(new THREE.Mesh(mergeGeometries([box(0.35, 0.16, 0.04, -0.85, 0.85, -L / 2 - 0.02), box(0.35, 0.16, 0.04, 0.85, 0.85, -L / 2 - 0.02)]), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.6) })));
  shadowAll(g);
  return { g, DU };
}

// ---------------- the truck: a blue tractor and a 40-ft orange container on a skeleton trailer, ~20.5 m ----------------
export function makeTruck() {
  const DU = dentUniforms(); DU.uCrushH.value = 4; DU.uSeed.value = 4.1;
  const g = new THREE.Group();
  const blue = thingMat(DU, 0x1f4f9a, 0.4), chrome = thingMat(DU, 0xc8ccd2, 0.25, { metalness: 0.8 }), glass = thingMat(DU, 0x111519, 0.1, { metalness: 0.4 }),
    dark = thingMat(DU, 0x1b1c1e, 0.8), tire = thingMat(DU, 0x101010, 0.9), orange = thingMat(DU, 0xd9661c, 0.62), rib = thingMat(DU, 0xb8521a, 0.65);
  const F = -10.25;          // the front bumper (local z)
  // tractor: hood, grille, cab, sleeper, stacks, tanks, fifth-wheel deck
  g.add(new THREE.Mesh(new RoundedBoxGeometry(2.3, 1.35, 2.2, 2, 0.15).translate(0, 1.55, F + 1.2), blue));
  g.add(new THREE.Mesh(box(1.3, 1.1, 0.06, 0, 1.55, F + 0.08), chrome));
  g.add(new THREE.Mesh(box(2.5, 0.35, 0.3, 0, 0.75, F + 0.15), chrome));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.1, 1.9, 2, 0.14).translate(0, 2.25, F + 3.2), blue));
  g.add(new THREE.Mesh(box(2.3, 0.85, 0.05, 0, 2.75, F + 2.24), glass));
  g.add(new THREE.Mesh(mergeGeometries([box(0.05, 0.7, 0.9, -1.26, 2.75, F + 3.0), box(0.05, 0.7, 0.9, 1.26, 2.75, F + 3.0)]), glass));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.5, 1.6, 2, 0.14).translate(0, 2.45, F + 4.9), blue));
  g.add(new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8).translate(-1.15, 3.2, F + 4.1), new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8).translate(1.15, 3.2, F + 4.1)]), chrome));
  g.add(new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.33, 0.33, 1.3, 12).rotateX(Math.PI / 2).translate(-1.05, 0.85, F + 3.4), new THREE.CylinderGeometry(0.33, 0.33, 1.3, 12).rotateX(Math.PI / 2).translate(1.05, 0.85, F + 3.4)]), chrome));
  g.add(new THREE.Mesh(box(1.0, 0.3, 7.0, 0, 0.95, F + 5.2), dark));
  // trailer frame and container
  const C0 = F + 7.1, CL = 12.19, CH = 2.59, CW = 2.44, CY = 1.32;
  g.add(new THREE.Mesh(box(1.0, 0.28, 12.4, 0, 1.15, C0 + CL / 2), dark));
  g.add(new THREE.Mesh(box(CW, CH, CL, 0, CY + CH / 2, C0 + CL / 2), orange));
  const ribs = [];
  for (let z = C0 + 0.25; z < C0 + CL; z += 0.28) for (const sx of [-1, 1]) ribs.push(box(0.04, CH - 0.2, 0.12, sx * (CW / 2 + 0.015), CY + CH / 2, z));
  for (const sx of [-1, 1]) ribs.push(box(0.06, 0.12, CL, sx * (CW / 2 + 0.02), CY + 0.06, C0 + CL / 2), box(0.06, 0.12, CL, sx * (CW / 2 + 0.02), CY + CH - 0.06, C0 + CL / 2));
  ribs.push(box(CW + 0.04, CH, 0.06, 0, CY + CH / 2, C0 + CL + 0.03));
  g.add(new THREE.Mesh(mergeGeometries(ribs), rib));
  // wheels: steer, two drive axles, two trailer axles
  const wl = [];
  for (const z of [F + 1.3, F + 5.4, F + 6.7, C0 + CL - 2.6, C0 + CL - 1.35]) for (const sx of [-1, 1]) wl.push(new THREE.CylinderGeometry(0.52, 0.52, z === F + 1.3 ? 0.3 : 0.6, 16).rotateZ(Math.PI / 2).translate(sx * (z === F + 1.3 ? 1.08 : 0.95), 0.52, z));
  g.add(new THREE.Mesh(mergeGeometries(wl), tire));
  g.add(new THREE.Mesh(mergeGeometries([box(0.3, 0.14, 0.04, -0.8, 1.1, F + 0.05), box(0.3, 0.14, 0.04, 0.8, 1.1, F + 0.05)]), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.6) })));
  shadowAll(g);
  return { g, DU };
}

// ---------------- the jumbo jet: 70.6 m long, 64.4 m span, nose at -z; fuselage axis 5.4 m up ----------------
export const JET_GEAR = { wing: [[-5.6, 1.5], [5.6, 1.5]], body: [[-1.9, 5.0], [1.9, 5.0]], nose: [0, -27.5], axisY: 5.4, R: 3.25 };
export function makeJet() {
  const DU = dentUniforms(); DU.uCrushH.value = 8; DU.uSeed.value = 7.7;
  const g = new THREE.Group();
  const white = thingMat(DU, 0xf4f4f2, 0.35), blue = thingMat(DU, 0x1d3f8c, 0.4), grey = thingMat(DU, 0xb9bcc0, 0.4, { metalness: 0.3 }),
    dark = thingMat(DU, 0x1a1c20, 0.6), tire = thingMat(DU, 0x101010, 0.9), win = thingMat(DU, 0x0d1520, 0.2);
  const Y = JET_GEAR.axisY, R = JET_GEAR.R;
  // fuselage: a lathe from the tail (z +35.3) to the nose (z -35.3)
  const prof = [];
  for (let k = 0; k <= 40; k++) {
    const z = -35.3 + (70.6 * k) / 40;
    let r = R;
    if (z < -27) { const t = (z + 35.3) / 8.3; r = R * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); }
    if (z > 22) { const t = (z - 22) / 13.3; r = R * (1 - 0.82 * t * t) ; }
    prof.push(new THREE.Vector2(Math.max(r, 0.05), z));
  }
  const fus = new THREE.LatheGeometry(prof, 28).rotateX(Math.PI / 2);
  // (the lathe's axis is y; turned so it runs along z; the tail cone raised a little)
  const pf = fus.attributes.position;
  for (let i = 0; i < pf.count; i++) { const z = pf.getZ(i); if (z > 22) pf.setY(i, pf.getY(i) + 1.6 * Math.pow((z - 22) / 13.3, 2)); }
  fus.computeVertexNormals();
  g.add(new THREE.Mesh(fus.translate(0, Y, 0), white));
  // the hump (upper deck) over the front third
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14).scale(2.55, 2.6, 15.5).translate(0, Y + 2.25, -17.5), white));
  // cheat line (window band) both sides, the upper-deck windows, the cockpit
  const band = (r, a0, a1, mat) => g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 50, 28, 1, true, a0, a1 - a0).rotateX(Math.PI / 2).translate(0, Y, -2), mat));
  const D2R = Math.PI / 180;
  band(R + 0.03, 84 * D2R, 100 * D2R, blue); band(R + 0.03, 260 * D2R, 276 * D2R, blue);
  band(R + 0.045, 104 * D2R, 109 * D2R, win); band(R + 0.045, 251 * D2R, 256 * D2R, win);
  g.add(new THREE.Mesh(box(1.8, 0.45, 0.6, 0, Y + 3.3, -30.6).rotateX(0), win));
  // wings: swept, from the root (z -4..+10, at the fuselage's lower side) to the tips (x +-32.2, z +18..+22)
  const wingG = (sx) => {
    const geo = new THREE.BufferGeometry();
    const r0 = [0, -4, 14, 0.9], t0 = [32.2 * sx, 18.0, 4.0, 0.25];
    const v = [], idx = [];
    for (const [x, z, c, th] of [r0, t0]) {
      v.push(x, Y - 1.4 + Math.abs(x) * 0.07, z, x, Y - 1.4 + Math.abs(x) * 0.07 + th, z + c * 0.25, x, Y - 1.4 + Math.abs(x) * 0.07, z + c);
    }
    // top: (0,1,2),(3,4,5); bottom: (0,2) (3,5)
    idx.push(0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 3, 5, 0, 5, 2);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(sx > 0 ? idx : idx.map((_, i) => idx[i - (i % 3) + (2 - (i % 3))]));
    geo.computeVertexNormals();
    return geo;
  };
  const wm = new THREE.Mesh(mergeGeometries([wingG(1), wingG(-1)]), white);
  wm.material = white; wm.material.side = THREE.DoubleSide;
  g.add(wm);
  // engines (four, under the wings), pylons
  const eng = [], pyl = [];
  for (const ex of [-21, -11.7, 11.7, 21]) {
    const ez = -4 + (Math.abs(ex) / 32.2) * 22 - 4.5, ey = Y - 1.4 + Math.abs(ex) * 0.07 - 1.7;
    eng.push(new THREE.CylinderGeometry(1.35, 1.15, 5.4, 18).rotateX(Math.PI / 2).translate(ex, ey, ez));
    pyl.push(box(0.35, 1.2, 4.0, ex, ey + 1.2, ez + 1.5));
  }
  g.add(new THREE.Mesh(mergeGeometries(eng), grey), new THREE.Mesh(mergeGeometries(pyl), white));
  const intakes = [];
  for (const ex of [-21, -11.7, 11.7, 21]) {
    const ez = -4 + (Math.abs(ex) / 32.2) * 22 - 4.5 - 2.72, ey = Y - 1.4 + Math.abs(ex) * 0.07 - 1.7;
    intakes.push(new THREE.CircleGeometry(1.25, 18).rotateY(Math.PI).translate(ex, ey, ez));
  }
  g.add(new THREE.Mesh(mergeGeometries(intakes), dark));
  // tail: the fin (blue) and the stabilisers
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(10.5, 0), new THREE.Vector2(13.2, 10.6), new THREE.Vector2(9.6, 10.6)]);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.45, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.22, Y + R - 0.6, 23.0);
  g.add(new THREE.Mesh(finG, blue));
  const stab = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(10.8, 4.6), new THREE.Vector2(10.8, 7.4), new THREE.Vector2(0, 8.0)]);
  const stG = (sx) => new THREE.ExtrudeGeometry(stab, { depth: 0.35, bevelEnabled: false }).rotateX(Math.PI / 2).scale(sx, 1, 1).translate(0, Y + 1.0, 26.5);
  const sm = new THREE.Mesh(mergeGeometries([stG(1), stG(-1)]), white); sm.material.side = THREE.DoubleSide; g.add(sm);
  // landing gear: the nose gear and four main bogies (struts and wheels)
  const strut = [], wheels = [];
  const gearAt = (x, z, n) => {
    strut.push(new THREE.CylinderGeometry(0.16, 0.18, Y - R + 0.4 - 0.6, 8).translate(x, (Y - R + 0.4 + 0.6) / 2, z));
    for (let i = 0; i < n; i++) for (const sx of [-1, 1]) wheels.push(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 16).rotateZ(Math.PI / 2).translate(x + sx * 0.45, 0.62, z + (n > 1 ? (i - 0.5) * 1.5 : 0)));
  };
  gearAt(0, JET_GEAR.nose[1], 1);
  for (const [x, z] of [...JET_GEAR.wing, ...JET_GEAR.body]) gearAt(x, z, 2);
  g.add(new THREE.Mesh(mergeGeometries(strut), grey), new THREE.Mesh(mergeGeometries(wheels), tire));
  shadowAll(g);
  return { g, DU };
}

// ---- the facade material for things that move (the ship's decks, the tower): same look as the buildings ----
export function movingFacade(DU) {
  const m = thingMat(DU, 0xffffff, 0.8);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aBox; attribute vec3 aCol; attribute vec4 aWin; attribute vec3 aFP;
      varying vec3 vFP; varying vec3 vFN; varying vec4 vBox; varying vec3 vCol; varying vec4 vWin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vFP = aFP; vFN = normal; vBox = aBox; vCol = aCol; vWin = aWin;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vFP; varying vec3 vFN; varying vec4 vBox; varying vec3 vCol; varying vec4 vWin;
      ${FACADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float glz; diffuseColor.rgb = facade(vFP, normalize(vFN), vec4(vBox.x, 1e5, vBox.z, vBox.w), vCol, vWin, 0.3, glz);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.1, glz);`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '-mfacade';
  return m;
}
// boxes in metres with facade attributes (each { x, y, z, w, h, d, wall, win, kind, fl, off }: bottom at y), one mesh
function facadeBoxes(DU, list, mat) {
  const geos = list.map((b) => {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d, 1, Math.max(1, Math.round(b.h / 12)), 1).translate(b.x, (b.y || 0) + b.h / 2, b.z);
    const p = geo.attributes.position, n = p.count;
    const fp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { fp[i * 3] = p.getX(i) - b.x + b.w / 2; fp[i * 3 + 1] = p.getY(i) - (b.y || 0) + (b.off || 0); fp[i * 3 + 2] = p.getZ(i) - b.z + b.d / 2; }
    const c = new THREE.Color(b.wall), w = new THREE.Color(b.win);
    const A = (k, vals) => geo.setAttribute(k, new THREE.Float32BufferAttribute(new Array(n).fill(vals).flat(), vals.length));
    A('aBox', [b.w, b.h, b.d, b.fl || 3]); A('aCol', [c.r, c.g, c.b]); A('aWin', [w.r, w.g, w.b, b.kind || 0]);
    geo.setAttribute('aFP', new THREE.BufferAttribute(fp, 3));
    return geo;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return mesh;
}

// ---------------- the cruise ship: 300 x 38 m, along x (bow at -x, west); three pieces cut at x = -50 and +60 ----------------
export const SHIP_CUTS = [-150, -50, 60, 150];
export function makeShip() {
  const R = rng(311);
  const pieces = [];
  for (let k = 0; k < 3; k++) {
    const DU = dentUniforms(); DU.uCrushH.value = 30; DU.uSeed.value = 11 + k;
    const g = new THREE.Group();
    const navy = thingMat(DU, 0x1b2740, 0.5), white = thingMat(DU, 0xf3f2ee, 0.55),
      blueT = thingMat(DU, 0x2f86c8, 0.25), orange = thingMat(DU, 0xe8771e, 0.5), yellow = thingMat(DU, 0xf0c22a, 0.45), deck = thingMat(DU, 0xb59a78, 0.85);
    const fac = movingFacade(DU);
    const x0 = SHIP_CUTS[k], x1 = SHIP_CUTS[k + 1];
    const half = SHIP.beam / 2, D = SHIP.draft, FB = 12;      // draft below the waterline, freeboard to the main deck
    // the hull's plan: full beam, a pointed bow in the first piece (x < -100), a rounded stern in the last
    const plan = (x) => {
      if (x < -105) { const t = (x + 150) / 45; return half * Math.pow(Math.max(t, 0), 0.75); }   // a sharp V bow
      if (x > 138) { const t = (150 - x) / 12; return half * (0.75 + 0.25 * Math.sqrt(Math.max(0, t))); }
      return half;
    };
    const NX = 30, NY = 6;
    // a skinned hull: rows from the keel to the main deck
    const vtx = [], idx = [], ys = [-D, -D * 0.6, -0.3, 0.3, FB * 0.5, FB];
    for (let i = 0; i <= NX; i++) {
      const x = x0 + ((x1 - x0) * i) / NX;
      const w = Math.max(plan(x), 0.2);
      for (let j = 0; j < NY; j++) {
        const y = ys[j];
        const taper = j === 0 ? 0.55 : j === 1 ? 0.92 : 1.0;
        vtx.push(x, y, -w * taper, x, y, w * taper);
      }
    }
    const geoH = new THREE.BufferGeometry();
    geoH.setAttribute('position', new THREE.Float32BufferAttribute(vtx, 3));
    const V = (i, j, s) => (i * NY + j) * 2 + s;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
      // north side (s=0, z<0) and south side (s=1)
      idx.push(V(i, j, 0), V(i + 1, j, 0), V(i + 1, j + 1, 0), V(i, j, 0), V(i + 1, j + 1, 0), V(i, j + 1, 0));
      idx.push(V(i, j, 1), V(i + 1, j + 1, 1), V(i + 1, j, 1), V(i, j, 1), V(i, j + 1, 1), V(i + 1, j + 1, 1));
    }
    for (let i = 0; i < NX; i++) idx.push(V(i, 0, 0), V(i, 0, 1), V(i + 1, 0, 1), V(i, 0, 0), V(i + 1, 0, 1), V(i + 1, 0, 0));   // keel
    // the cut ends (or the bow / stern caps)
    for (const i of [0, NX]) for (let j = 0; j < NY - 1; j++) {
      const a = V(i, j, 0), b = V(i, j, 1), c = V(i, j + 1, 1), d = V(i, j + 1, 0);
      if (i === 0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }   // (wound outward)
    geoH.setIndex(idx); geoH.computeVertexNormals();
    // colours by height: red below the waterline, navy above, a white line at the main deck
    {
      const pp = geoH.attributes.position, col = new Float32Array(pp.count * 3);
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); const c = y < 0 ? [0.42, 0.08, 0.06] : y > FB - 0.5 ? [0.85, 0.85, 0.83] : [0.06, 0.09, 0.17]; col.set(c, i * 3); }
      geoH.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.add(new THREE.Mesh(geoH, thingMat(DU, 0xffffff, 0.5, { vertexColors: true })));
    // main deck
    const deckXs = [Math.max(x0, -112), Math.min(x1, 142)];
    g.add(new THREE.Mesh(box(deckXs[1] - deckXs[0], 0.3, SHIP.beam - 1, (deckXs[0] + deckXs[1]) / 2, FB + 0.15, 0), deck));
    // the superstructure: stacked blocks of cabins with balconies (facade kind 0 = rows of windows), narrowing aft
    const blocks = [];
    const sx0 = Math.max(x0, -128), sx1 = Math.min(x1, 132);
    if (sx1 > sx0) {
      blocks.push({ x: (sx0 + sx1) / 2, y: FB + 0.3, z: 0, w: sx1 - sx0, h: 14, d: SHIP.beam - 2, wall: 0xf4f3ef, win: 0x22405e, kind: 3, fl: 2.9 });
      const ux0 = Math.max(x0, -118), ux1 = Math.min(x1, 122);
      if (ux1 > ux0) blocks.push({ x: (ux0 + ux1) / 2, y: FB + 14.3, z: 0, w: ux1 - ux0, h: 20, d: SHIP.beam - 5, wall: 0xf6f5f1, win: 0x2a4a6c, kind: 3, fl: 2.9, off: 14 });
      const tx0 = Math.max(x0, -110), tx1 = Math.min(x1, 100);
      if (tx1 > tx0) blocks.push({ x: (tx0 + tx1) / 2, y: FB + 34.3, z: 0, w: tx1 - tx0, h: 11.5, d: SHIP.beam - 10, wall: 0xf8f7f3, win: 0x2c4c70, kind: 3, fl: 2.9, off: 34 });
    }
    g.add(facadeBoxes(DU, blocks, fac));
    // the bridge and its wings at the front of the top decks (first piece)
    if (k === 0) {
      g.add(new THREE.Mesh(box(7, 4.2, SHIP.beam + 3, -115, FB + 33, 0), white));
      g.add(new THREE.Mesh(box(0.3, 1.8, SHIP.beam + 2.8, -118.6, FB + 33.3, 0), thingMat(DU, 0x10161e, 0.15)));
    }
    // lifeboats: orange capsules on both sides at the lowest superstructure deck
    const lb = [];
    for (let x = Math.max(x0, -100) + 6; x < Math.min(x1, 110) - 4; x += 12) for (const sz of [-1, 1]) lb.push(new THREE.CapsuleGeometry(1.5, 7, 4, 10).rotateZ(Math.PI / 2).translate(x, FB + 6, sz * (SHIP.beam / 2 + 0.2)));
    if (lb.length) g.add(new THREE.Mesh(mergeGeometries(lb), orange));
    // the top deck: pools, a yellow and a blue water slide, the funnel (in the last piece)
    const top = FB + 45.8;
    for (let x = Math.max(x0, -100) + 8; x < Math.min(x1, 96) - 8; x += 34) g.add(new THREE.Mesh(box(14, 0.4, 9, x, top + 0.05, (R() - 0.5) * 8), blueT));
    if (k === 1) {
      const sl = (col, ph) => {
        const pts = [];
        for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector3(10 + 18 * t, top + 12 - 11 * t, Math.sin(t * Math.PI * 3 + ph) * 8)); }
        return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.9, 8), col);
      };
      g.add(sl(yellow, 0), sl(blueT, 1.6));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 8).translate(10, top + 6, 0), white));
    }
    if (k === 2) {
      g.add(new THREE.Mesh(new RoundedBoxGeometry(14, 16, 10, 2, 1.5).translate(100, top + 8, 0), white));
      g.add(new THREE.Mesh(box(14.2, 3.2, 10.2, 100, top + 13.5, 0), navy));
    }
    shadowAll(g);
    pieces.push({ g, DU, x0, x1 });
  }
  return pieces;
}

// ---------------- the tower: 36 x 36 m glass, 285 m to the roof + a 35 m mast; five pieces of 57 m ----------------
export const TOWER_SEG = 57;
export function makeTower() {
  const pieces = [];
  for (let k = 0; k < 5; k++) {
    const DU = dentUniforms(); DU.uCrushH.value = 40; DU.uSeed.value = 21 + k;
    const g = new THREE.Group();
    const fac = movingFacade(DU);
    const list = [];
    const y0 = k * TOWER_SEG;
    if (k < 4) list.push({ x: 0, y: 0, z: 0, w: TOWER.w, h: TOWER_SEG, d: TOWER.d, wall: 0x7d8c99, win: 0x3f6684, kind: 1, fl: 3.8, off: y0 });
    else {
      list.push({ x: 0, y: 0, z: 0, w: TOWER.w, h: 26, d: TOWER.d, wall: 0x7d8c99, win: 0x3f6684, kind: 1, fl: 3.8, off: y0 });
      list.push({ x: 0, y: 26, z: 0, w: 28, h: 24, d: 28, wall: 0x7d8c99, win: 0x456d8c, kind: 1, fl: 3.8, off: y0 + 26 });
      list.push({ x: 0, y: 50, z: 0, w: 18, h: 8, d: 18, wall: 0x9aa6b0, win: 0x4a6a84, kind: 1, fl: 4, off: y0 + 50 });
    }
    g.add(facadeBoxes(DU, list, fac));
    if (k === 4) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 35, 8).translate(0, 58 + 17.5, 0), thingMat(DU, 0xc0c4c8, 0.4, { metalness: 0.6 })));
    if (k === 0) {
      // a lobby: a recessed glass base, a canopy
      g.add(new THREE.Mesh(box(TOWER.w + 4, 0.6, 6, 0, 6.5, TOWER.d / 2 + 2.5), thingMat(DU, 0x2a2e33, 0.5)));
    }
    shadowAll(g);
    pieces.push({ g, DU, y0 });
  }
  return pieces;
}
