// Times Square at night in the rain. Metres; x east, y up, -z north (the cameras mostly look north up the square).
// West of x = 2 is the pedestrian plaza (building fronts at x = -16); the avenue's lanes run south (+z) between the
// curbs at x = 2 and 14, the east sidewalk to the fronts at x = 16. Cross streets at z = -70 and +61. The square
// ends in a tower at z = -262 whose face is one big screen. Everything that moves runs on the world clock W
// (it stops when time stops). The ground is wet: under it the screens and buildings are drawn again upside down
// and the ground is partly see-through (a mirror), most in the puddles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { makeAds, CELL, GRID } from './ads.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { makeFleet } from './cars.js';
import { W0, TRUCK_BAGS, worldT } from './timeline.js';

export const W_FRONT = -16, CURB_A = 2, CURB_B = 14, E_FRONT = 16;
export const ZX = [-70, 61], XHALF = 9;
const inCross = (z, pad = 0) => ZX.some((c) => Math.abs(z - c) < XHALF + pad);
export const TRUCK = { x: 3.55, z0: -8.2, z1: -1.0 };            // parked at the plaza curb, nose north, doors open at z1
export const YOU0 = { x: 2.55, z: 0.55 };                          // where you stand at the truck's doors
export const BAGS = [];                                            // the cash bags (you.js moves the ones you take)
export const LANES_CAR = [6.3, 9.3, 12.3];

const R = rng(1031);

// ---------- buildings ----------
export const BLD = [];
function addB(x0, x1, z0, z1, h, extra = {}) {
  const b = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.abs(x1 - x0), d: Math.abs(z1 - z0), h, seed: R(), tone: R(), ...extra };
  BLD.push(b);
  return b;
}
for (const side of [-1, 1]) {
  const front = side < 0 ? W_FRONT : E_FRONT;
  let z = 160;
  while (z > -250) {
    let L = 14 + R() * 26;
    if (inCross(z - L / 2, L / 2)) {
      const c = ZX.find((cz) => Math.abs(z - L / 2 - cz) < XHALF + L / 2);
      if (z > c + XHALF) L = z - (c + XHALF);
      else { z = c - XHALF; continue; }
      if (L < 6) { z = c - XHALF; continue; }
    }
    const near = Math.abs(z) < 120 ? 1 : 0.8;
    const h = (28 + Math.pow(R(), 1.6) * 150) * near;
    const depth = 30 + R() * 20;
    addB(front, front + side * depth, z, z - L + 0.4, h, { side, front });
    // a taller slab set back behind some of them
    if (R() < 0.45) addB(front + side * (depth + 4), front + side * (depth + 34), z - 2, z - L + 2, h + 30 + R() * 90, { side: 0 });
    z -= L;
  }
}
// the tower at the north end: its face is one big screen
export const NTOWER = addB(-20, 20, -262, -292, 130, { side: 0, north: true });
// a ring of distant towers so the sky line never ends
for (let k = 0; k < 60; k++) {
  const a = R() * Math.PI * 2, r = 330 + R() * 500;
  addB(Math.cos(a) * r - 20, Math.cos(a) * r + 20, Math.sin(a) * r - 20, Math.sin(a) * r + 20, 60 + R() * 220, { side: 0 });
}

// ---------- screens: billboards on the fronts, the lit shop windows at street level, the news ----------
// { x, y, z, w, h, ry (0 faces +z, PI/2 faces +x, -PI/2 faces -x), cell, seed, anim }
export const SCREENS = [];
const scr = (x, y, z, w, h, ry, cell, anim = 0) => SCREENS.push({ x, y, z, w, h, ry, cell, seed: R(), anim });
for (const b of BLD) {
  if (!b.side) continue;
  const ry = b.side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const fx = b.front - b.side * 0.12;                // the face toward the square, a hair in front
  const zc = b.z, L = b.d;
  // shop windows at street level
  const ns = Math.max(1, Math.round(L / 9));
  for (let k = 0; k < ns; k++) {
    const z = zc + L / 2 - (k + 0.5) * L / ns;
    scr(fx, 2.3, z, L / ns - 1.2, 3.6, ry, 10 + Math.floor(R() * 2));
  }
  // billboards stacked up the front (Times Square fronts are covered to ~40 m)
  let y = 5.6;
  const top = Math.min(b.h - 2, 44 + R() * 10);
  while (y < top - 4) {
    const h = Math.min(top - y, 5 + R() * 13);
    if (R() < 0.82) {
      const w = Math.min(L - 1, 8 + R() * 22);
      const z = zc + (R() - 0.5) * Math.max(0, L - w - 1);
      scr(fx, y + h / 2, z, w, h, ry, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15][Math.floor(R() * 12)], R() < 0.4 ? 1 : R() < 0.5 ? 2 : 0);
    }
    y += h + 0.8 + R() * 2.2;
  }
}
// the news where the cameras can read it: on the north tower's face (huge) and two fronts near the truck
scr(0, 34, NTOWER.z + NTOWER.d / 2 + 0.15, 30, 30, 0, 12);
scr(0, 66, NTOWER.z + NTOWER.d / 2 + 0.15, 32, 22, 0, 4, 1);
scr(0, 96, NTOWER.z + NTOWER.d / 2 + 0.15, 26, 18, 0, 13);
scr(0, 12, NTOWER.z + NTOWER.d / 2 + 0.15, 34, 10, 0, 1, 1);
export const NEWS_SPOTS = [];
for (const b of BLD) {
  if (!b.side) continue;
  if ((b.side > 0 && b.z < -14 && b.z > -60) || (b.side < 0 && b.z < -28 && b.z > -66)) {
    const ry = b.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    scr(b.front - b.side * 0.2, 13, b.z, Math.min(b.d - 1, 15), 11, ry, b.side > 0 ? 13 : 12);
    NEWS_SPOTS.push(SCREENS[SCREENS.length - 1]);
  }
}

// ---------- people ----------
// walkers move along lanes (constant x, one speed per lane, spaced so nobody ever overlaps); standers stay put.
export const PEOPLE = [];
const SHIRTS = [0xd94b4b, 0x2f5fa8, 0xf2f2f2, 0x1e1e22, 0xe0b040, 0x3f9a6a, 0xc95fa0, 0x8a6a4a, 0x4fb3d9, 0xff7a3a, 0x6a4fa0, 0x222a40, 0xe85a8a, 0x2a2a2a, 0x7a1f2a];
const PANTS = [0x1f2a44, 0x2a2a2a, 0x3a4a6a, 0x6b5a48, 0xd8d0c0, 0x111111, 0x4a3a5a];
const UMB = [0x111111, 0xd8202a, 0x1f3a8a, 0x2b2b2b, 0xf2c21a, 0x3a7a4a, 0x7a2a7a, 0xe8e8e8, 0x0a0a0a, 0x2a6ad8];
const Z_MIN = -175, Z_MAX = 125;
function person(o) {
  const p = {
    x: 0, z: 0, dir: 0, sp: 0, yaw: 0, phase: R() * 6.28, umb: R() < 0.5 ? UMB[Math.floor(R() * UMB.length)] : null,
    shirt: SHIRTS[Math.floor(R() * SHIRTS.length)], pants: PANTS[Math.floor(R() * PANTS.length)],
    skin: SKIN[Math.floor(R() * SKIN.length)], hair: HAIR[Math.floor(R() * HAIR.length)], s: 0.93 + R() * 0.12,
    phone: R() < 0.25, look: 0, ep: 0, seed: R(), ...o,
  };
  p.i = PEOPLE.length;
  PEOPLE.push(p);
  return p;
}
// lanes: [x, dir (-1 north, +1 south), speed m/s, mean gap]
const WLANES = [[-14.8, 1, 1.25, 6], [-14.0, -1, 1.35, 7], [-12.9, 1, 1.15, 9], [-10.4, -1, 1.3, 8], [-9.5, 1, 1.4, 9],
  [-7.2, -1, 1.2, 10], [-4.9, 1, 1.3, 9], [-4.0, -1, 1.45, 11], [-2.2, 1, 1.25, 12], [-1.3, -1, 1.35, 12],
  [0.55, -1, 1.2, 14], [14.6, 1, 1.3, 6], [15.35, -1, 1.2, 6]];
for (const [x, dir, sp, gap] of WLANES) {
  let z = Z_MIN + R() * gap;
  while (z < Z_MAX) {
    // keep the area right round you and the truck's doors clear (the close ones are placed by hand below)
    if (!(x > -2.5 && x < 2 && z > -4 && z < 7)) person({ x: x + (R() - 0.5) * 0.12, z, dir, sp, walk: true });
    z += gap * (0.55 + R() * 0.9);
  }
}
// the close ones on the first frame: a woman under a red umbrella passing on your left, a man in a yellow
// raincoat filming the screens, a couple under one umbrella
export const WOMAN = person({ x: 0.55, z: -1.2, dir: -1, sp: 1.2, walk: true, umb: 0xd8202a, shirt: 0x1e1e22, pants: 0x111111, skin: SKIN[0], hair: HAIR[3], s: 0.98, phone: false });
person({ x: -1.3, z: -2.6, dir: -1, sp: 1.35, walk: true, umb: null, shirt: 0xf2c21a, pants: 0x1f2a44, phone: true });
person({ x: -2.2, z: 4.4, dir: 1, sp: 1.25, walk: true, umb: 0x1f3a8a, shirt: 0x2f5fa8, pants: 0x2a2a2a });
person({ x: -2.2, z: -5.5, dir: 1, sp: 1.25, walk: true, umb: 0x111111, shirt: 0xe85a8a });
// standers: people stopped to look and film, in the gaps between the lanes
for (let k = 0; k < 120; k++) {
  const xs = [-11.6, -8.3, -6.0, -3.1, 1.4];
  const x = xs[Math.floor(R() * xs.length)] + (R() - 0.5) * 0.5;
  const z = -150 + R() * 260;
  if (x > -4 && z > -9 && z < 8) continue;
  if (PEOPLE.some((q) => !q.walk && Math.hypot(q.x - x, q.z - z) < 0.9)) continue;
  person({ x, z, yaw: R() * 6.28, look: 0.3 + R() * 0.5, phone: R() < 0.55 });
}
// the guard by the truck: walking back to its doors (frozen mid-step)
export const GUARD = person({ x: 1.75, z: -3.9, dir: 1, sp: 0, yaw: 0.25, walk: false, frozenStep: 0.9, umb: null, shirt: 0x34404a, pants: 0x2a3038, hair: 0x101010, skin: SKIN[3], s: 1.03, guard: true, phone: false });
// cops (the manhunt and after): around the parked cruisers, one talking on his radio where you walk past
export const COPS = [];
const cop = (x, z, yaw, ep, o = {}) => { const p = person({ x, z, yaw, ep, umb: null, shirt: 0x1a2440, pants: 0x161c2e, hair: 0x0a0a0a, phone: false, cop: true, look: 0.1, ...o }); COPS.push(p); return p; };
export const RADIO_COP = cop(-2.4, -9.0, 0.35, 1, { radio: true });
for (const [x, z, yaw, ep] of [[3.0, -24, 2.6, 1], [-0.3, -27, -0.8, 1], [7.2, -38, 0.4, 1], [-5.6, -46, 1.9, 1], [10.5, -14, -1.2, 1], [-9.8, -30, 2.2, 2], [-12, -58, 0.5, 2], [4.4, -62, 1.3, 2], [12.4, -48, -2.2, 2], [-1.6, -36, 0.1, 2], [6.5, 9, 3.0, 2], [-6.6, 14, 2.4, 2]]) cop(x, z, yaw, ep);

// ---------- cars ----------
export const CARS = [];
const CARC = [0xe8e8e8, 0x1a1a1a, 0x2a3f6a, 0x9a1f1f, 0x8a8a8a, 0x2a5a3a, 0xd0d4d8, 0x101010];
for (const x of LANES_CAR) {
  const sp = x === 6.3 ? 4.5 : x === 9.3 ? 3.4 : 2.6;      // a slow evening crawl (m/s)
  let z = -330 + R() * 6;
  while (z < 160) {
    const kind = R() < 0.1 ? 3 : R() < 0.3 ? 2 : R() < 0.4 ? 1 : 0;
    const len = [4.5, 4.0, 4.6, 4.9][kind];
    const taxi = R() < 0.55;
    CARS.push({ x: x + (R() - 0.5) * 0.25, z, sp, kind, col: taxi ? 0xf2b80f : CARC[Math.floor(R() * CARC.length)], taxi, len });
    z += len + 3.0 + R() * 5;
  }
}
// the taxi splashing through the puddle beside the truck on the first frame: its front wheel at z = -1.2 at W0
// (cars face south, +z: the front wheel is at z + len/2 - 0.82). The near lane's cars all shift together.
export const SPLASH = {};
{
  const lane = CARS.filter((c) => c.x < 7);
  const c0 = lane.reduce((b, c) => (Math.abs(c.z + 4) < Math.abs(b.z + 4) ? c : b), lane[0]);
  c0.taxi = true; c0.col = 0xf2b80f; c0.kind = 0; c0.len = 4.5;
  const dz = -1.2 - (c0.z + c0.len / 2 - 0.82);
  for (const c of lane) c.z += dz;
  SPLASH.car = c0;
}
export const CAR_Z_MIN = -340, CAR_Z_MAX = 170;
// police cruisers: parked with their lights going (the manhunt and after)
export const CRUISERS = [
  { x: 1.2, z: -22, yaw: 0.6, ep: 1 }, { x: 6.5, z: -33, yaw: -0.3, ep: 1 }, { x: -6.5, z: -50, yaw: 1.2, ep: 1 }, { x: 10.0, z: -18, yaw: 0.2, ep: 1 },
  { x: 4.0, z: -58, yaw: -0.9, ep: 2 }, { x: -10.5, z: -36, yaw: 2.0, ep: 2 }, { x: 8.0, z: 4, yaw: 0.4, ep: 2 }, { x: -3.5, z: -70, yaw: 1.5, ep: 2 },
  { x: 11.5, z: -60, yaw: 0.1, ep: 2 }, { x: 0.5, z: 16, yaw: -1.4, ep: 2 },
];
// helicopters over the square, their searchlights sweeping the plaza
export const HELIS = [
  { x: -4, y: 74, z: -70, ep: 1, ph: 0 },
  { x: 22, y: 92, z: -150, ep: 2, ph: 2.1 },
  { x: -30, y: 84, z: 10, ep: 2, ph: 4.0 },
];
// the first helicopter's beam is frozen right over the cop you walk past (when time stops at 25 s)
{
  const Wf = worldT(25.6);
  let best = 1e9, bp = 0;
  for (let ph = 0; ph < Math.PI * 2; ph += 0.0005) {
    const x = -3 + 7 * Math.sin(Wf * 0.37 + ph), z = -14 + 12 * Math.cos(Wf * 0.29 + ph * 1.3);
    const d = Math.hypot(x + 1.6, z + 8.0);
    if (d < best) { best = d; bp = ph; }
  }
  HELIS[0].ph = bp;
}
export function heliAt(h, W) {
  const p = new THREE.Vector3(h.x + 6 * Math.sin(W * 0.11 + h.ph), h.y + 1.5 * Math.sin(W * 0.5 + h.ph), h.z + 5 * Math.cos(W * 0.09 + h.ph));
  const t = new THREE.Vector3(-3 + 7 * Math.sin(W * 0.37 + h.ph), 0, -14 + 12 * Math.cos(W * 0.29 + h.ph * 1.3));
  return { p, t, yaw: 0.4 * Math.sin(W * 0.07 + h.ph) + h.ph };
}

// ============================================================================================================
export function makeStreet(scene) {
  const G = new THREE.Group();     // everything above the ground
  const M = new THREE.Group();     // the mirror world under the wet ground
  M.scale.y = -1;
  scene.add(G, M);
  const ads = makeAds();
  const U = {
    uW: { value: 0 }, uFogC: { value: new THREE.Color(0.09, 0.07, 0.12) }, uFogD: { value: 0.006 },
    uCones: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uConeH: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uRate: { value: 0 }, uNeon: { value: new THREE.Color(0.55, 0.32, 0.6) }, uTime: { value: 0 },
  };
  const fogGLSL = /* glsl */ `
    uniform vec3 uFogC; uniform float uFogD;
    vec3 fogIt(vec3 c, float d) { float f = 1.0 - exp(-uFogD * uFogD * d * d); return mix(c, uFogC, f); }`;

  // ---- buildings: dark towers with window grids (some lit), instanced boxes ----
  {
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const n = BLD.length;
    const aS = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    geo.setAttribute('aS', aS);
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */ `
        attribute vec2 aS; varying vec3 vP; varying vec3 vN; varying vec2 vS; varying float vD;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vP = (instanceMatrix * vec4(position, 1.0)).xyz;
          vN = normalize(mat3(instanceMatrix) * normal);
          vS = aS;
          vec4 mv = viewMatrix * wp;
          vD = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vP; varying vec3 vN; varying vec2 vS; varying float vD;
        ${fogGLSL}
        uniform vec3 uNeon;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 n = normalize(vN);
          vec3 c;
          if (n.y > 0.5) c = vec3(0.025, 0.024, 0.03);
          else {
            float u = abs(n.x) > 0.5 ? vP.z : vP.x;
            vec2 g = vec2(u / 2.1, vP.y / 3.7);
            vec2 id = floor(g), f = fract(g);
            float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.86);
            float lit = step(0.62 - 0.25 * vS.y, h21(id + vS.x * 91.0));
            vec3 wl = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.85, 1.0), h21(id + 7.0)) * (0.5 + 0.8 * h21(id + 3.0));
            vec3 wall = mix(vec3(0.03, 0.03, 0.038), vec3(0.07, 0.06, 0.07), vS.y);
            vec3 glass = vec3(0.02, 0.025, 0.04) + uNeon * 0.05;
            c = mix(wall, mix(glass, wl * 0.9, lit), win);
            c += uNeon * 0.025 * smoothstep(60.0, 0.0, vP.y);
          }
          gl_FragColor = vec4(fogIt(c, vD), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mk = (parent) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; parent.add(m); return m; };
    const a = mk(G), b = mk(M);
    const m4 = new THREE.Matrix4();
    BLD.forEach((bd, i) => {
      m4.compose(new THREE.Vector3(bd.x, 0, bd.z), new THREE.Quaternion(), new THREE.Vector3(bd.w, bd.h, bd.d));
      a.setMatrixAt(i, m4); b.setMatrixAt(i, m4);
      aS.setXY(i, bd.seed, bd.tone);
    });
  }

  // ---- the screens (and their reflections) ----
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { ...U, tAtlas: { value: ads.tex }, uBright: { value: 1.7 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aI; varying vec2 vUv; varying vec4 vI; varying float vD; varying vec2 vSz;
      void main() {
        vUv = uv; vI = aI;
        vSz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        vD = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAtlas; uniform float uW; uniform float uBright;
      varying vec2 vUv; varying vec4 vI; varying float vD; varying vec2 vSz;
      ${fogGLSL}
      void main() {
        float cell = vI.x;
        vec2 uv = vUv;
        // animated ads: some scroll, some pulse (on the world clock: frozen when time stops)
        float anim = vI.z;
        if (anim > 0.5 && anim < 1.5) uv.x = fract(uv.x + uW * 0.06 + vI.y);
        vec2 cuv = (vec2(mod(cell, ${GRID}.0), ${GRID - 1}.0 - floor(cell / ${GRID}.0)) + clamp(uv, 0.004, 0.996)) / ${GRID}.0;
        vec3 c = texture2D(tAtlas, cuv).rgb;
        c = pow(c, vec3(2.2));
        if (anim > 1.5) c *= 0.75 + 0.25 * sin(uW * 2.3 + vI.y * 40.0);
        // LED pixels close up
        vec2 px = fract(vUv * vSz * 9.0);
        float led = mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y), smoothstep(30.0, 6.0, vD));
        // a dark frame round each screen
        vec2 e = min(vUv, 1.0 - vUv) * vSz;
        float frame = smoothstep(0.08, 0.16, min(e.x, e.y));
        c = c * led * frame * uBright * (cell > 9.5 && cell < 11.5 ? 0.75 : 1.0);
        gl_FragColor = vec4(fogIt(c, vD), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    const n = SCREENS.length;
    const aI = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aI', aI);
    const a = new THREE.InstancedMesh(geo, screenMat, n), b = new THREE.InstancedMesh(geo, screenMat, n);
    a.frustumCulled = b.frustumCulled = false;
    G.add(a); M.add(b);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    SCREENS.forEach((s, i) => {
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromEuler(e.set(0, s.ry, 0)), new THREE.Vector3(s.w, s.h, 1));
      a.setMatrixAt(i, m4); b.setMatrixAt(i, m4);
      aI.setXYZW(i, s.cell, s.seed, s.anim, 0);
    });
  }

  // ---- the ground: plaza pavers, the avenue (lanes, crosswalks), curbs; wet, with frozen (or falling) ripples ----
  const groundMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: true,
    vertexShader: /* glsl */ `
      varying vec3 vP; varying float vD; varying vec3 vV;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; vec4 mv = viewMatrix * wp; vD = length(mv.xyz); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vP; varying float vD; varying vec3 vV;
      uniform float uW; uniform float uRate; uniform vec3 uNeon; uniform vec4 uCones[3]; uniform vec3 uConeH[3];
      ${fogGLSL}
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vP.xz;
        bool cross = abs(p.y + 70.0) < 9.0 || abs(p.y - 61.0) < 9.0;
        bool road = (p.x > 2.0 && p.x < 14.0) || cross;
        vec3 base;
        float rough = 0.0;
        if (road) {
          base = vec3(0.028, 0.028, 0.032) * (0.8 + 0.4 * n2(p * 3.0));
          // lane lines (dashed white), the double yellow is not on a one-way avenue
          for (int k = 0; k < 2; k++) {
            float lx = k == 0 ? 7.8 : 10.8;
            float d = abs(p.x - lx);
            float dash = step(0.5, fract(p.y / 9.0));
            base = mix(base, vec3(0.55), (1.0 - smoothstep(0.07, 0.1, d)) * dash * (cross ? 0.0 : 1.0));
          }
          // crosswalks at the cross streets
          float cw = 0.0;
          for (int k = 0; k < 2; k++) {
            float cz = k == 0 ? -70.0 : 61.0;
            float dz = abs(p.y - cz);
            if (dz > 9.5 && dz < 13.5 && p.x > 2.0 && p.x < 14.0) cw = step(0.5, fract(p.x / 1.2));
            if (abs(p.x - 0.0) < 100.0 && dz < 9.0 && ((p.x > -19.0 && p.x < -15.0) || (p.x > 15.0 && p.x < 19.0))) cw = step(0.5, fract(p.y / 1.2));
          }
          base = mix(base, vec3(0.6), cw);
        } else {
          // the plaza: big grey-red pavers with dark joints; sidewalk slabs beside the fronts
          vec2 g = p / vec2(1.2, 1.2);
          vec2 f = fract(g);
          float joint = smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
          base = mix(vec3(0.02), mix(vec3(0.085, 0.06, 0.06), vec3(0.075, 0.075, 0.08), h21(floor(g))) * (0.85 + 0.3 * n2(p * 2.0)), joint);
          rough = 0.15;
        }
        // curbs: a bright edge line
        float cd = min(abs(p.x - 2.0), abs(p.x - 14.0));
        if (!cross) base = mix(base, vec3(0.16, 0.15, 0.15), 1.0 - smoothstep(0.1, 0.16, cd));
        // light from the screens all round (purple-pink), stronger near the fronts
        vec3 lit = base * (0.55 + uNeon * 1.6 * (0.6 + 0.4 * smoothstep(12.0, 16.0, abs(p.x - 0.0))));
        // the searchlights' pools
        for (int k = 0; k < 3; k++) {
          vec4 c = uCones[k];
          if (c.w <= 0.0) continue;
          float d = length(p - c.xy);
          lit += base * vec3(5.0, 5.2, 5.6) * c.w * exp(-d * d / (c.z * c.z));
        }
        // wet: puddles reflect most (the mirror world shows through), rain ripples ring them
        float pud = smoothstep(0.45, 0.75, n2(p * 0.22) * 0.7 + n2(p * 0.9) * 0.3);
        float ripple = 0.0;
        {
          vec2 g = p * 1.6;
          vec2 id = floor(g), f = fract(g) - 0.5;
          float ph = fract(uW * 1.3 + h21(id) * 9.0);
          float r = length(f - (vec2(h21(id + 3.1), h21(id + 5.7)) - 0.5) * 0.5);
          ripple = exp(-pow((r - ph * 0.45) / 0.025, 2.0)) * (1.0 - ph);
        }
        vec3 V = normalize(vV);
        float fres = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        float refl = clamp(mix(0.28 + rough * -0.6, 0.85, pud) * (0.35 + 0.65 * fres) + 0.18 * pud, 0.0, 0.92);
        refl *= 1.0 - 0.35 * ripple;
        lit += vec3(0.25, 0.22, 0.3) * ripple * pud * 0.5;
        vec3 c = fogIt(lit, vD);
        // the mirror under us is fogged by its own depth; the ground's alpha shows it through
        gl_FragColor = vec4(c, 1.0 - refl);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), groundMat);
  ground.renderOrder = 1;
  G.add(ground);
  // a dark floor under the mirror world (what the reflection shows where nothing is mirrored)
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0a10, side: THREE.DoubleSide }));
  under.position.y = 0.02;  // (inside M: y flipped, so just under the ground)
  M.add(under);
  // curbs and planters (solid)
  const solidMat = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  {
    const curb = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(0.25, 0.15, 520).translate(CURB_A - 0.12, 0.075, -100),
      new THREE.BoxGeometry(0.25, 0.15, 520).translate(CURB_B + 0.12, 0.075, -100),
    ]), solidMat(0x4a4848, 0.5));
    G.add(curb);
    // planters and bollards along the plaza edge
    const pl = [];
    for (let z = -160; z < 120; z += 7) { if (inCross(z, 2) || (z > -12 && z < 8)) continue; pl.push(new THREE.CylinderGeometry(0.11, 0.13, 0.95, 8).translate(1.6, 0.475, z)); }
    G.add(new THREE.Mesh(mergeGeometries(pl), solidMat(0x2a2a30, 0.35, 0.6)));
    // street lights and traffic signals at the cross street (a pole, an arm, lit heads)
    const poles = [];
    for (const z of [-58, -82, 49, 73]) for (const x of [1.0, 15.0]) poles.push(new THREE.CylinderGeometry(0.1, 0.13, 8, 8).translate(x, 4, z));
    G.add(new THREE.Mesh(mergeGeometries(poles), solidMat(0x1a1a1e, 0.4, 0.7)));
  }

  // ---- people ----
  const pmat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.0 });
  const NP = PEOPLE.length;
  const crowd = makeCrowd(G, NP, pmat, { castShadow: false });
  PEOPLE.forEach((p) => crowd.color(p.i, p.shirt, p.pants, p.skin, p.hair));
  // umbrellas: a canopy (a shallow cone with ribs) and a shaft, per person who has one
  const umbG = mergeGeometries([new THREE.ConeGeometry(0.58, 0.28, 8, 1, true).translate(0, 0.14, 0)].map((g) => g.toNonIndexed()));
  const umb = new THREE.InstancedMesh(umbG, new THREE.MeshStandardMaterial({ roughness: 0.35, side: THREE.DoubleSide }), NP);
  const shaft = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.75, 4).translate(0, -0.3, 0), solidMat(0x222222, 0.4, 0.5), NP);
  umb.frustumCulled = shaft.frustumCulled = false;
  G.add(umb, shaft);
  const tc = new THREE.Color();
  PEOPLE.forEach((p) => umb.setColorAt(p.i, tc.set(p.umb || 0x000000)));
  // phones held up: a small lit rectangle
  const phones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.15, 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 2.0) }), NP);
  phones.frustumCulled = false;
  G.add(phones);
  // ---- cars (and the cruisers) ----
  const plainMat = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: true });
  const shadowy = (m) => { m.frustumCulled = false; return m; };
  const NC = CARS.length + CRUISERS.length;
  const fleet = makeFleet(G, NC, { plainMat, glowMat, shadowy });
  CARS.forEach((c, i) => fleet.color(i, c.col, c.kind));
  CRUISERS.forEach((c, i) => fleet.color(CARS.length + i, 0xf4f4f4, 0));
  // taxi roof signs; cruiser light bars (boxes; their glow is added each frame)
  const roofSign = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.22, 0.28).translate(0, 1.56, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.2) }), NC);
  const lightBar = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.12, 0.3).translate(0, 1.5, 0.15), solidMat(0x222222, 0.3, 0.2), NC);
  const stripe = new THREE.InstancedMesh(new THREE.BoxGeometry(1.84, 0.12, 2.6).translate(0, 0.72, 0.1), solidMat(0x1d3fb0, 0.4), NC);
  roofSign.frustumCulled = lightBar.frustumCulled = stripe.frustumCulled = false;
  G.add(roofSign, lightBar, stripe);

  // ---- the armored truck (doors open at the back, shelves of cash bags inside) ----
  const truck = new THREE.Group();
  {
    const L = TRUCK.z1 - TRUCK.z0, W = 2.45;
    const body = solidMat(0x9a9c9e, 0.45, 0.35), dark = solidMat(0x18191b, 0.6), steel = solidMat(0x8a8d90, 0.35, 0.7);
    // the cargo box, open at the back (box faces: +x -x +y -y +z -z; the +z one is left out)
    const none = new THREE.MeshBasicMaterial({ visible: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W, 2.5, L - 2.2).translate(0, 1.95, 1.1), [body, body, body, body, none, body]);
    const inM = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.8, side: THREE.BackSide });
    const inside = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 2.36, L - 2.3).translate(0, 1.95, 1.05), [inM, inM, inM, inM, none, inM]);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 1.8, 2.0).translate(0, 1.55, -L / 2 + 1.0), body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.6, 0.05).translate(0, 2.0, -L / 2 - 0.02), solidMat(0x10141a, 0.1, 0.6));
    const bump = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.3, 0.25).translate(0, 0.55, L / 2 + 0.05), dark);
    const wheels = [];
    for (const sx of [-1, 1]) for (const z of [-L / 2 + 1.3, L / 2 - 1.5]) wheels.push(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.12), 0.5, z));
    const wh = new THREE.Mesh(mergeGeometries(wheels), solidMat(0x111111, 0.85));
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.18, L - 2.2).translate(0, 1.5, 1.1), solidMat(0x1d4f8a, 0.4));
    // the two back doors swung open (hinged at the back corners)
    const door = (sx) => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.02, 2.3, 0.08).translate(sx * (W / 4), 0, 0), body);
      d.position.set(sx * W / 2, 1.95, L / 2 + 0.04);
      d.rotation.y = sx * 1.85;
      return d;
    };
    // shelves inside with stacked bags
    const shelf = new THREE.Mesh(mergeGeometries([0.95, 1.85].map((y) => new THREE.BoxGeometry(W - 0.2, 0.05, 2.6).translate(0, y, L / 2 - 1.5))), steel);
    truck.add(box, inside, cab, glass, bump, wh, band, door(-1), door(1), shelf);
    // a dim light inside
    const lamp = new THREE.PointLight(0xfff0d0, 1.6, 6, 2);
    lamp.position.set(0, 2.9, L / 2 - 1.0);
    truck.add(lamp);
    truck.position.set(TRUCK.x, 0, (TRUCK.z0 + TRUCK.z1) / 2);
    G.add(truck);
  }
  // cash bags: canvas sacks (squashed spheres) on the shelves; the ones you take fly to your duffel (you.js moves them)
  const bagG = mergeGeometries([new THREE.SphereGeometry(0.27, 16, 10).scale(1.0, 0.9, 0.75).toNonIndexed(), new THREE.CylinderGeometry(0.04, 0.09, 0.14, 8).translate(0, 0.28, 0).toNonIndexed()]);
  const bagTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#c9b892'; c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(80,60,30,${Math.random() * 0.08})`; c.fillRect(Math.random() * 256, Math.random() * 128, 3, 3); }
    c.fillStyle = '#2f5a2a'; c.font = 'bold 64px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('$', 64, 70); c.fillText('$', 192, 70);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const NB = 14;
  const bags = new THREE.InstancedMesh(bagG, new THREE.MeshStandardMaterial({ map: bagTex, roughness: 0.9 }), NB);
  bags.frustumCulled = false;
  G.add(bags);
  BAGS.length = 0;
  {
    const L = TRUCK.z1 - TRUCK.z0;
    for (let i = 0; i < NB; i++) {
      const row = i < 7 ? 0 : 1;
      const k = i % 7;
      const x = TRUCK.x - 0.85 + (k % 4) * 0.55 + (k > 3 ? 0.27 : 0);
      const y = (row ? 1.88 : 0.98) + 0.22 + (k > 3 ? 0.35 : 0);
      const z = TRUCK.z1 - 0.55 - (k > 3 ? 0.6 : 0) - (R() * 0.1);
      BAGS.push({ x, y, z, i, take: i < TRUCK_BAGS.length ? TRUCK_BAGS[i] : null, rot: R() * 6 });
    }
  }

  // ---- helicopters ----
  const helis = HELIS.map(() => {
    const g = new THREE.Group();
    const dk = solidMat(0x1a1d24, 0.45, 0.3);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 10).scale(1, 0.85, 1.8), dk));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 6, 8).rotateX(Math.PI / 2).translate(0, 0.3, 4.6), dk));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.8).translate(0, 0.9, 7.4), dk));
    const skid = mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.08, 0.08, 3.4).translate(s * 0.9, -1.45, 0)));
    g.add(new THREE.Mesh(skid, dk));
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.3).translate(0, 1.55, 0), dk);
    const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2;
    const rot = new THREE.Group(); rot.add(rotor, rotor2);
    g.add(rot);
    G.add(g);
    return { g, rot };
  });
  // searchlight beams: cones from the helicopter to the ground, soft, additive
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), vV)), 1.6); float along = mix(1.0, 0.35, vUv.y);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * edge * along * 0.11 * uA, 1.0); }`,
  });
  const beams = HELIS.map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1, 1, 24, 1, true).translate(0, -0.5, 0), beamMat); m.frustumCulled = false; m.renderOrder = 5; G.add(m); return m; });

  // ============================ each frame ============================
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const wrap = (z, a, b) => a + ((((z - a) % (b - a)) + (b - a)) % (b - a));
  const up = new THREE.Vector3(0, 1, 0);

  function frame(v, s, glows, opts = {}) {
    const W = s.W, ep = s.ep;
    U.uW.value = W; U.uRate.value = s.rate; U.uTime.value = v;
    ads.news(ep);
    // ---- people ----
    for (const p of PEOPLE) {
      let x = p.x, z = p.z, yaw = p.yaw, walk = 0, stride = 0, armR = 0, armL = 0, look = p.look;
      const on = p.cop ? ep >= p.ep : true;
      if (p.walk) {
        z = wrap(p.z + p.dir * p.sp * (W - W0), Z_MIN, Z_MAX);
        yaw = p.dir < 0 ? 0 : Math.PI;
        walk = p.phase + (W - W0) * p.sp * 2.6;
        stride = 1;
      } else if (p.guard) {
        // the guard: frozen mid-step on the first frame; when time runs he turns and finds the truck empty
        const tR = clamp(W - W0);
        walk = 2.0 + 0.9 * (1 - smooth(0, 0.4, W - W0)); stride = 0.9 * (1 - smooth(0, 0.5, W - W0));
        yaw = lerp(0.25, -2.6, smooth(0.2, 1.2, W - W0));
        armR = 0.15 + 0.9 * smooth(1.0, 1.6, W - W0);
        z = p.z + 0.35 * smooth(0, 0.5, W - W0);
        look = 0.1;
        if (ep > 0) { x = -100; }
      } else {
        if (p.phone) armR = 1.0;
        if (p.radio) armL = 1.1;
      }
      if (p.phone && p.walk) armR = 0.85;
      if (p.umb) armL = Math.max(armL, 0.75);
      const vis = on && !(opts.hideNear && Math.hypot(x - opts.hideNear.x, z - opts.hideNear.z) < 0.8);
      crowd.pose(p.i, { x, y: 0, z, yaw, s: p.s, walk, stride, armL, armR, look, visible: vis && x > -99 });
      // the umbrella over the head (held in the left hand), the phone in the right
      if (p.umb && vis) {
        e.set(0.08 * (p.walk ? 1 : 0), yaw, 0.12, 'YXZ');
        q.setFromEuler(e);
        v3.set(-0.12, 2.12 * p.s, -0.12).applyQuaternion(q).add(s3.set(x, 0, z));
        m4.compose(v3, q, s3.set(p.s, p.s, p.s));
        umb.setMatrixAt(p.i, m4); shaft.setMatrixAt(p.i, m4);
      } else { umb.setMatrixAt(p.i, hide); shaft.setMatrixAt(p.i, hide); }
      if (p.phone && vis && !p.walk) {
        e.set(0, yaw, 0, 'YXZ'); q.setFromEuler(e);
        v3.set(0.22, 1.58 * p.s, -0.5).applyQuaternion(q).add(s3.set(x, 0, z));
        m4.compose(v3, q, s3.set(1, 1, 1));
        phones.setMatrixAt(p.i, m4);
      } else phones.setMatrixAt(p.i, hide);
    }
    crowd.commit();
    umb.instanceMatrix.needsUpdate = shaft.instanceMatrix.needsUpdate = phones.instanceMatrix.needsUpdate = true;
    if (umb.instanceColor) umb.instanceColor.needsUpdate = true;

    // ---- cars ----
    CARS.forEach((c, i) => {
      const z = wrap(c.z + c.sp * (W - W0), CAR_Z_MIN, CAR_Z_MAX);
      m4.compose(v3.set(c.x, 0, z), q.setFromAxisAngle(up, Math.PI), s3.set(1, 1, 1));   // facing south (+z)
      fleet.set(i, m4, true);
      roofSign.setMatrixAt(i, c.taxi ? m4 : hide);
      lightBar.setMatrixAt(i, hide); stripe.setMatrixAt(i, hide);
      // headlights reach far down the avenue as glows (and in the wet road)
      if (Math.abs(z) < 260) {
        const hz = z + c.len / 2 + 0.1;
        for (const sx of [-0.62, 0.62]) {
          glows.add(c.x + sx, 0.7, hz, 0.55, 2.4, 2.2, 1.9);
          glows.add(c.x + sx, -0.7, hz, 0.9, 0.5, 0.45, 0.4);
          glows.add(c.x + sx, 0.75, z - c.len / 2 - 0.1, 0.35, 1.6, 0.08, 0.05);
          glows.add(c.x + sx, -0.75, z - c.len / 2 - 0.1, 0.6, 0.4, 0.02, 0.01);
        }
      }
    });
    CRUISERS.forEach((c, j) => {
      const i = CARS.length + j;
      if (ep < c.ep) { fleet.set(i, hide, false); lightBar.setMatrixAt(i, hide); stripe.setMatrixAt(i, hide); roofSign.setMatrixAt(i, hide); return; }
      m4.compose(v3.set(c.x, 0, c.z), q.setFromAxisAngle(up, c.yaw), s3.set(1, 1, 1));
      fleet.set(i, m4, true);
      lightBar.setMatrixAt(i, m4); stripe.setMatrixAt(i, m4); roofSign.setMatrixAt(i, hide);
      // red and blue, alternating fast (on the world clock: frozen mid-flash when time stops)
      const ph = Math.floor((W + j * 0.37) * 6.0) % 2;
      for (const sx of [-0.4, 0.4]) {
        const red = (sx < 0) === (ph === 0);
        v3.set(sx, 1.58, 0.15).applyAxisAngle(up, c.yaw).add(s3.set(c.x, 0, c.z));
        const k = 0.6 + 0.4 * Math.abs(Math.sin((W + j) * 19));
        if (red) { glows.add(v3.x, v3.y, v3.z, 1.6, 4.5 * k, 0.15, 0.1); glows.add(v3.x, -v3.y, v3.z, 2.6, 1.4 * k, 0.05, 0.03); }
        else { glows.add(v3.x, v3.y, v3.z, 1.6, 0.15, 0.6, 5.5 * k); glows.add(v3.x, -v3.y, v3.z, 2.6, 0.05, 0.2, 1.7 * k); }
      }
    });
    fleet.commit();
    roofSign.instanceMatrix.needsUpdate = lightBar.instanceMatrix.needsUpdate = stripe.instanceMatrix.needsUpdate = true;

    // ---- the truck: there on the first visit only ----
    truck.visible = ep === 0;
    bags.visible = ep === 0;

    // ---- helicopters and their searchlights ----
    const cones = U.uCones.value;
    HELIS.forEach((h, k) => {
      const on = ep >= h.ep;
      helis[k].g.visible = on; beams[k].visible = on;
      cones[k].set(0, 0, 1, 0);
      if (!on) return;
      const a = heliAt(h, W);
      helis[k].g.position.copy(a.p);
      helis[k].g.rotation.set(0.08, a.yaw, 0.03);
      helis[k].rot.rotation.y = W * 31;
      const dir = v3.copy(a.t).sub(a.p);
      const L = dir.length();
      const rad = 3.6;
      const b = beams[k];
      b.position.copy(a.p).addScaledVector(dir, 1.6 / L);
      b.quaternion.setFromUnitVectors(s3.set(0, -1, 0), dir.normalize());
      b.scale.set(rad, L, rad);
      cones[k].set(a.t.x, a.t.z, rad * 0.9, 1);
      U.uConeH.value[k].copy(a.p);
      // the lamp itself, and the blinking anti-collision lights
      glows.add(a.p.x, a.p.y - 1.2, a.p.z, 2.5, 6, 6, 6.5);
      if (Math.floor(W * 1.3 + k) % 2 === 0) glows.add(a.p.x, a.p.y + 1.2, a.p.z + 2, 1.2, 4, 0.2, 0.1);
    });
  }

  return { G, M, U, frame, bags, crowd, fleet, helis, ads, TRUCKG: truck };
}
