// The gold vault 80 ft under Wall Street (modelled on the New York Fed's: 122 compartments, ~507,000 bars). Three
// long halls side by side (centres x = -26, 0, 26), each a corridor (|x - xc| < 2) between two rows of 20 steel-mesh
// cages (4 m along z, 8 m deep, z 0 .. -80). In every cage, 9 stacks of bars laid in alternating layers. A stack is
// one box whose shader draws the bars; as they're carried off it shrinks layer by layer from the top. The order:
// the first cage (GOLD_A .. step 1), the rest of its row (.. step 2), half the vault (.. step 3), the rest (.. step 4).
// While it empties, see-through copies of you (a time-lapse: months of work in frozen time) carry bars out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smooth, lerp } from './util.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { GOLD_A, GOLD_STEPS } from './timeline.js';

const R = rng(507000);
export const HALLS = [0, -26, 26];
export const CAGE_L = 4, CAGE_D = 8, N_ALONG = 20, HALL_L = CAGE_L * N_ALONG, CEIL = 3.3;
// cages in the order they're emptied
export const CAGES = [];
{
  const list = [];
  HALLS.forEach((xc, h) => { for (const side of [1, -1]) for (let j = 0; j < N_ALONG; j++) list.push({ h, xc, side, j, x: xc + side * (2.1 + CAGE_D / 2), z: -(j + 0.5) * CAGE_L }); });
  // 0: main hall, right side, nearest; then the rest of that row; then the left row; then the other halls
  const main = list.filter((c) => c.h === 0);
  const rest = list.filter((c) => c.h !== 0);
  const order = [...main.filter((c) => c.side > 0), ...main.filter((c) => c.side < 0), ...rest.sort((a, b) => a.j - b.j + (a.h - b.h) * 0.01)];
  order.forEach((c, i) => { c.k = i; CAGES.push(c); });
}
// each cage's emptying window (video time)
const S = GOLD_STEPS;
function windowOf(k) {
  // [count, a, b] per step: 1 cage, 19 more (the row), 41 more (to half), 59 more (all)
  const steps = [[0, 1, GOLD_A, S[0]], [1, 20, S[0], S[1]], [20, 61, S[1], S[2]], [61, 120, S[2], S[3]]];
  for (const [k0, k1, a, b] of steps) {
    if (k < k1) {
      const n = k1 - k0, f = (k - k0) / n;
      const span = (b - a) * Math.min(1, 6 / n + 0.12);
      const st = a + f * (b - a - span);
      return [st, Math.min(b - 0.05, st + span)];
    }
  }
  return [S[3], S[3]];
}
CAGES.forEach((c) => { [c.a, c.b] = windowOf(c.k); });

// ---- the close shots (main.js frames them with .cam; frame() poses your hands, the copies and the bars) ----
// hero: the stack right in front of the camera, drawn bar by bar ('full': it sinks to the pallet over .win; 'last':
// only the last 14 bars are left on it). hands: when your gloved hands reach for a bar (each lift takes HAND_P s;
// hold: the last one stays up in front of you). ghosts: each copy's spots (x, z, yaw), it pops from one to the next
// every GHOST_P s, bending to a stack, then up with a bar.
const cageAt = (h, side, j) => CAGES.find((c) => c.h === h && c.side === side && c.j === j);
const PI = Math.PI;
export const HAND_P = 0.56, GHOST_P = 0.5;
export const CLOSE = {
  goldHands: {
    cage: cageAt(0, 1, 6), win: [33.3, 35.0], hero: { i: 0, j: 1, kind: 'full' },
    cam: { p0: [4.95, 1.66, -25.62], p1: [4.9, 1.6, -25.72], t: [3.05, 0.55, -26.25], fov: 72 },
    hands: [33.32, 33.88, 34.44], hold: false,
    ghosts: [
      [[2.62, -25.7, PI / 2], [2.62, -26.35, PI / 2]],
      [[2.62, -27.15, PI / 2], [2.62, -24.85, PI / 2]],
      [[4.85, -27.3, -PI / 2 - 0.3], [4.85, -24.7, -PI / 2 + 0.3]],
    ],
  },
  goldGuard: {
    cam: { p0: [0.95, 1.3, -9.2], p1: [0.9, 1.28, -9.75], t: [0.95, 0.85, -30], fov: 64 },
    walker: { from: [-0.85, -13.6], to: [-0.6, -10.2], a: 35.0, b: 36.7 },
  },
  goldCopies: {
    cage: cageAt(0, -1, 12), win: [36.7, 38.5],
    // inside the cage, low, down the row of stacks: the copies lifting bars right ahead, the stacks sinking
    cam: { p0: [-2.42, 1.0, -48.25], p1: [-2.48, 0.96, -48.55], t: [-3.5, 0.62, -52.2], fov: 68 },
    ghosts: [
      [[-2.62, -50.6, -PI / 2], [-2.62, -51.4, -PI / 2]],
      [[-4.85, -50.0, PI / 2], [-2.62, -51.4, -PI / 2]],
      [[-4.85, -48.85, PI / 2], [-4.85, -51.15, PI / 2]],
    ],
  },
  goldLast: {
    cage: cageAt(1, 1, 19), win: [39.9, 41.15], hero: { i: 0, j: 1, kind: 'last' },
    cam: { p0: [-21.05, 1.66, -77.62], p1: [-21.1, 1.6, -77.72], t: [-22.95, 0.45, -78.25], fov: 72 },
    hands: [39.98, 40.6, 41.22], hold: true,
    ghosts: [
      [[-23.38, -77.7, PI / 2], [-23.38, -78.35, PI / 2]],
      [[-23.38, -79.15, PI / 2], [-23.38, -76.85, PI / 2]],
    ],
  },
  goldYou: {
    // you, in the empty last cage, the last bar in your hands; the inspector frozen beside you
    you: { x: -21.0, z: -77.75, yaw: -2.8 },
    cam: { p0: [-21.85, 1.55, -80.75], p1: [-21.8, 1.5, -80.35], t: [-21.1, 1.2, -77.4], fov: 60 },
  },
};
// the cages filmed up close empty during their shot (so the stacks around you sink while you're there)
for (const c of Object.values(CLOSE)) if (c.cage) [c.cage.a, c.cage.b] = c.win;
// the stacks: 3 across the cage's depth x 3 along it
export const STACKS = [];
for (const c of CAGES) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dx = (i - 1) * 2.3, dz = (j - 1) * 1.15;
    const h = 1.05 + 0.3 * R();
    const order = i * 3 + j;                            // the front row (by the corridor) first
    const f0 = order / 9, f1 = (order + 1.6) / 9;
    // (in a cage filmed up close they all sink together, slightly staggered, over the whole shot)
    const close = Object.values(CLOSE).some((cl) => cl.cage === c);
    const [sa, sb] = close ? [lerp(c.a, c.b, order * 0.02), lerp(c.a, c.b, 0.84 + order * 0.02)] : [lerp(c.a, c.b, f0 * 0.75), lerp(c.a, c.b, Math.min(1, f1 * 0.75 + 0.25))];
    STACKS.push({ i, j, x: c.xc + c.side * (2.1 + 1.6 + i * 2.3), z: c.z + dz, w: 1.25, d: 0.92, h, a: sa, b: sb, cage: c });
  }
}
// the hero stacks, bar by bar: 18 x 9 x 4.5 cm bars, layers alternating direction. Each bar's time it's taken:
// the copies sweep each layer from the far side toward you (top layer first); your hands take the nearest bar of the
// top layer at each grab (it's then carried, not gone)
const BAR = { L: 0.18, W: 0.09, H: 0.045 };
export const HERO_BARS = [];
for (const [key, c] of Object.entries(CLOSE)) {
  if (!c.hero) continue;
  const st = STACKS.find((s) => s.cage === c.cage && s.i === c.hero.i && s.j === c.hero.j);
  st.hero = true;
  st.a = st.b = -1;                                  // (the instanced stack isn't drawn: the bars are)
  const cam = c.cam.p0;
  const nL = c.hero.kind === 'full' ? Math.round(st.h / BAR.H) : 1;
  const list = [];
  for (let l = 0; l < nL; l++) {
    const alongX = l % 2 === 0;
    const [nx, nz] = alongX ? [7, 10] : [14, 5];
    const [sx, sz] = alongX ? [BAR.L, BAR.W] : [BAR.W, BAR.L];
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const x = st.x - (nx * sx) / 2 + (a + 0.5) * sx, z = st.z - (nz * sz) / 2 + (b + 0.5) * sz;
      const far = -Math.hypot(x - cam[0], z - cam[2]);
      list.push({ key, l, x, y: 0.12 + (l + 0.5) * BAR.H, z, yaw: alongX ? 0 : PI / 2, far, hand: -1 });
    }
  }
  // 'last': only the 14 bars nearest you are left
  let bars = list;
  if (c.hero.kind === 'last') bars = list.sort((p, q) => q.far - p.far).slice(0, 14);
  // the sweep: top layer first, far to near within a layer
  const [wa, wb] = c.win;
  bars.sort((p, q) => q.l - p.l || p.far - q.far);
  bars.forEach((b, n) => { b.t = lerp(wa, wb, (n + 1) / bars.length); });
  if (c.hold) {
    // the last bars: your hands take the nearest ones (the very last is the one you hold up); the copies the rest
    const near = [...bars].sort((p, q) => q.far - p.far);
    c.hands.forEach((h, hi) => { near[hi].hand = hi; near[hi].t = h + 0.18; });
    const lastT = c.hands[c.hands.length - 1] + 0.18;
    const rest = bars.filter((b) => b.hand < 0);
    rest.forEach((b, n) => { b.t = lerp(wa, Math.min(wb, lastT - 0.1), (n + 1) / rest.length); });
  } else {
    // your hands: at each grab the nearest bar still there in the top layer
    c.hands.forEach((h, hi) => {
      const tg = h + 0.18;
      const left = bars.filter((b) => b.t > tg && b.hand < 0);
      const top = Math.max(...left.map((b) => b.l));
      const pick = left.filter((b) => b.l === top).sort((p, q) => q.far - p.far)[0];
      pick.hand = hi; pick.t = tg;
    });
  }
  c.bars = bars;
  HERO_BARS.push(...bars);
}
// the top of a hero stack at time v (where your hands reach)
export function heroTop(c, v) {
  let y = 0.12;
  for (const b of c.bars) if (b.t > v && b.hand < 0) y = Math.max(y, b.y + BAR.H / 2);
  return y;
}
// your hands at video time v in a close shot: which lift, how far into it (0..1), and how far you bend down (m)
export function handsAt(c, v) {
  if (!c || !c.hands) return null;
  let hi = -1;
  for (let i = 0; i < c.hands.length; i++) if (v >= c.hands[i]) hi = i;
  if (hi < 0) return { hi, u: 0, bend: 0 };
  const u = (v - c.hands[hi]) / HAND_P;
  const bar = c.bars.find((b) => b.hand === hi);
  // bend toward a low bar while reaching for it, back up as you lift it
  const low = clamp((1.0 - bar.y) / 0.9);
  const k = c.hold && hi === c.hands.length - 1 ? smooth(0, 0.3, u) * (1 - smooth(0.32, 0.7, u)) : smooth(0, 0.3, u) * (1 - smooth(0.3, 0.75, u));
  return { hi, u, bend: 0.55 * low * k, bar };
}

export function makeGold(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const std = (c, r = 0.5, m = 0, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
  const U = { uV: { value: 0 }, uFogC: { value: new THREE.Color(0.05, 0.04, 0.03) }, uFogD: { value: 0.012 } };
  // ---- floors, walls, ceilings ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, HALL_L + 20).rotateX(-Math.PI / 2).translate(0, 0, -HALL_L / 2), std(0x8a857a, 0.45, 0.1));
  G.add(floor);
  const wallG = [];
  for (const xc of HALLS) {
    for (const sx of [-1, 1]) wallG.push(new THREE.BoxGeometry(0.6, CEIL, HALL_L + 6).translate(xc + sx * (2.1 + CAGE_D + 0.5), CEIL / 2, -HALL_L / 2 + 1));
    wallG.push(new THREE.BoxGeometry(2 * (2.1 + CAGE_D + 0.8), CEIL, 0.6).translate(xc, CEIL / 2, -HALL_L - 2.3));
    // the entrance wall with a doorway (the corridor's width)
    for (const sx of [-1, 1]) wallG.push(new THREE.BoxGeometry(CAGE_D + 0.4, CEIL, 0.6).translate(xc + sx * (2.0 + (CAGE_D + 0.4) / 2 + 0.1), CEIL / 2, 2.2));
    wallG.push(new THREE.BoxGeometry(4.2, 0.7, 0.6).translate(xc, CEIL - 0.35, 2.2));
  }
  wallG.push(new THREE.BoxGeometry(90, CEIL, 0.6).translate(0, CEIL / 2, 9.5));
  const walls = new THREE.Mesh(mergeGeometries(wallG), std(0xb0a896, 0.8));
  G.add(walls);
  const ceilings = HALLS.map((xc) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * (2.1 + CAGE_D + 0.8), HALL_L + 6).rotateX(Math.PI / 2).translate(xc, CEIL, -HALL_L / 2 + 1), std(0xd8d2c4, 0.9));
    G.add(m);
    return m;
  });
  // ceiling light strips down each corridor and over the cages
  const stripG = [];
  for (const xc of HALLS) for (let z = -2; z > -HALL_L; z -= 4) for (const dx of [0, -6.1, 6.1]) stripG.push(new THREE.PlaneGeometry(0.25, 1.8).rotateX(Math.PI / 2).translate(xc + dx, CEIL - 0.01, z));
  const strips = new THREE.Mesh(mergeGeometries(stripG), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.72, 0.65) }));
  G.add(strips);
  // ---- the cages: posts, a top rail, mesh panels (front with a door, sides between cages) ----
  const meshMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: U,
    vertexShader: /* glsl */ `varying vec3 vP; varying float vD; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; vec4 mv = viewMatrix * wp; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `varying vec3 vP; varying float vD; uniform vec3 uFogC; uniform float uFogD;
      void main(){
        // diamond wire mesh (5 cm): discard the holes; fade the wires to a grey haze far off (no shimmer)
        vec2 p = vec2(vP.x + vP.z, vP.y) * 20.0;
        vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.5;
        vec2 f = abs(fract(q) - 0.5);
        float wire = 0.6 * (1.0 - smoothstep(0.04, 0.09, min(0.5 - f.x, 0.5 - f.y)));
        float a = mix(wire, 0.1, smoothstep(3.0, 10.0, vD));
        vec3 c = vec3(0.14, 0.145, 0.15);
        float fog = 1.0 - exp(-uFogD * uFogD * vD * vD);
        gl_FragColor = vec4(mix(c, uFogC, fog), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  meshMat.transparent = true; meshMat.depthWrite = false;
  {
    const panels = [], posts = [];
    for (const xc of HALLS) for (const side of [1, -1]) {
      const x0 = xc + side * 2.1, x1 = xc + side * (2.1 + CAGE_D);
      // front mesh along the corridor (2.6 m high)
      for (let j = 0; j < N_ALONG; j++) {
        const z0 = -j * CAGE_L, z1 = z0 - CAGE_L;
        panels.push(new THREE.PlaneGeometry(CAGE_L, 2.6).rotateY(Math.PI / 2).translate(x0, 1.3, (z0 + z1) / 2));
        posts.push(new THREE.BoxGeometry(0.08, 2.7, 0.08).translate(x0, 1.35, z0));
        // the divider between this cage and the next
        panels.push(new THREE.PlaneGeometry(CAGE_D, 2.6).translate((x0 + x1) / 2, 1.3, z0));
        posts.push(new THREE.BoxGeometry(0.06, 0.06, CAGE_L).translate(x0, 2.66, (z0 + z1) / 2));
      }
    }
    G.add(new THREE.Mesh(mergeGeometries(panels), meshMat));
    G.add(new THREE.Mesh(mergeGeometries(posts), std(0x3a3d40, 0.4, 0.8)));
  }
  // ---- the gold: one box per stack, the shader draws the bars ----
  const N = STACKS.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  geo.setAttribute('aA', aA);
  const goldMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      attribute vec4 aA; uniform float uV;
      varying vec3 vP; varying vec3 vN; varying float vD; varying vec3 vV; varying float vTop;
      void main() {
        float f = 1.0 - clamp((uV - aA.x) / max(aA.y - aA.x, 1e-3), 0.0, 1.0);
        // whole layers of bars (4.5 cm) go at a time
        float hL = aA.z * f; hL = floor(hL / 0.045 + 0.001) * 0.045;
        vec3 pos = position;
        pos.y *= hL / max(aA.z, 1e-3);
        vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
        vP = wp.xyz; vN = normalize(mat3(instanceMatrix) * normal);
        vTop = hL;
        vec4 mv = viewMatrix * wp; vD = length(mv.xyz); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = hL <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying float vD; varying vec3 vV; varying float vTop;
      uniform vec3 uFogC; uniform float uFogD;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vN);
        // which bar this pixel is on: layers alternate direction; bars 18 cm long, 9 cm wide, 4.5 cm tall
        float layer = floor(vP.y / 0.045);
        bool alongX = mod(layer, 2.0) < 0.5;
        vec2 cell; vec2 sz;
        if (abs(n.y) > 0.5) { cell = alongX ? vP.xz / vec2(0.18, 0.09) : vP.xz / vec2(0.09, 0.18); sz = vec2(1.0); }
        else {
          float u = abs(n.x) > 0.5 ? vP.z : vP.x;
          bool longSide = (abs(n.x) > 0.5) != alongX;    // looking at the bars' long sides or their ends
          cell = vec2(u / (longSide ? 0.18 : 0.09), vP.y / 0.045);
        }
        vec2 f = fract(cell), id = floor(cell);
        float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float gap = smoothstep(0.0, 0.06, edge);
        float bev = smoothstep(0.06, 0.2, edge);
        float var = h21(id + layer * 7.1);
        vec3 gold = mix(vec3(1.0, 0.52, 0.08), vec3(1.0, 0.64, 0.16), var) * (0.8 + 0.2 * var);
        // light from the strip lamps above and the room's bounce; a bright sheen on the bevels and tops
        float up = clamp(n.y, 0.0, 1.0);
        vec3 L = normalize(vec3(0.2, 1.0, 0.3));
        vec3 H = normalize(L + normalize(vV));
        float spec = pow(clamp(dot(n, H), 0.0, 1.0), 40.0) * 2.0 + pow(1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0), 3.0) * 0.6;
        vec3 c = gold * (0.35 + 0.75 * up + 0.25 * (1.0 - bev)) + gold * spec * (0.6 + 0.4 * (1.0 - bev));
        c *= mix(0.12, 1.0, gap);
        float fog = 1.0 - exp(-uFogD * uFogD * vD * vD);
        gl_FragColor = vec4(mix(c * 0.78, uFogC, fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const gold = new THREE.InstancedMesh(geo, goldMat, N);
  gold.frustumCulled = false;
  G.add(gold);
  {
    const m4 = new THREE.Matrix4();
    STACKS.forEach((s, i) => {
      m4.compose(new THREE.Vector3(s.x, 0.12, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w, s.h, s.d));
      gold.setMatrixAt(i, m4);
      aA.setXYZW(i, s.a, s.b, s.h, 0);
    });
    // pallets under the stacks
    const pal = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1).translate(0, 0.06, 0), std(0x6a5038, 0.9), N);
    STACKS.forEach((s, i) => { m4.compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w + 0.1, 1, s.d + 0.1)); pal.setMatrixAt(i, m4); });
    G.add(pal);
  }
  // ---- light ----
  G.add(new THREE.HemisphereLight(0xfff2dc, 0x6a5a40, 2.0));
  const pls = [];
  for (const z of [-1, -8, -16, -26]) { const l = new THREE.PointLight(0xfff0d8, 16, 20, 1.4); l.position.set(0, 3.0, z); G.add(l); pls.push(l); }
  const beacon = new THREE.PointLight(0xff1a10, 0, 20, 1.1); beacon.position.set(0, 3.0, 1.0); G.add(beacon);
  // ---- guards at the entrance; the time-lapse copies of you ----
  const pmat = std(0xffffff, 0.6);
  // the staff, all frozen while you work: two guards at the entrance (one with a coffee), guards at cage doors down
  // the corridor, an inspector with a clipboard; when time runs they turn, see the empty cages, hands to their heads
  const STAFF = [
    { x: -1.2, z: 3.6, yaw: 2.6, arm: 0.9, c: [0x2a3240, 0x1d2028, SKIN[4], HAIR[0]] },
    { x: 1.3, z: 4.2, yaw: -2.9, arm: 0.2, c: [0x2a3240, 0x1d2028, SKIN[1], HAIR[2]] },
    { x: 1.55, z: -3.4, yaw: Math.PI / 2 - 0.3, arm: 0.1, c: [0x2a3240, 0x1d2028, SKIN[2], HAIR[1]] },
    { x: -1.15, z: -7.2, yaw: -Math.PI / 2 + 0.2, arm: 0.95, clip: true, c: [0xd8d4c8, 0x2a2a30, SKIN[0], HAIR[6]] },
    { x: 1.5, z: -11.5, yaw: Math.PI / 2, arm: 0.1, c: [0x2a3240, 0x1d2028, SKIN[3], HAIR[0]] },
    { x: -1.5, z: -17, yaw: -Math.PI / 2, arm: 0.1, c: [0x2a3240, 0x1d2028, SKIN[5], HAIR[7]] },
    { x: 0.4, z: -24, yaw: 0.4, arm: 0.6, c: [0xd8d4c8, 0x2a2a30, SKIN[1], HAIR[2]] },
    // the inspector in the last cage (beside you at the end)
    { x: -21.85, z: -76.5, yaw: PI / 2 + 0.6, arm: 0.9, c: [0xd8d4c8, 0x2a2a30, SKIN[5], HAIR[6]] },
  ];
  const guards = makeCrowd(G, STAFF.length, pmat, { castShadow: false });
  STAFF.forEach((p, i) => guards.color(i, ...p.c));
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.02), std(0xf2efe6, 0.8));
  G.add(clip);
  const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, emissive: new THREE.Color(0.25, 0.4, 0.75) });
  const NG = 14;
  const ghosts = makeCrowd(G, NG, gmat, { castShadow: false });
  for (let i = 0; i < NG; i++) ghosts.color(i, 0x2c2f36, 0x15161a, SKIN[1], 0x2c2f36);
  ghosts.meshes.forEach((m) => { m.renderOrder = 4; });
  // the bars in the ghosts' arms
  const carry = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.09, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.5, 0.12), transparent: true, opacity: 0.6, depthWrite: false }), NG);
  carry.frustumCulled = false; carry.renderOrder = 4;
  G.add(carry);
  // ---- up close: the hero stacks' bars (real trapezoid bars, polished, reflecting the room), your gloved hands and
  // hoodie sleeves (first person), a lamp over the close shots ----
  const barGeo = new THREE.CylinderGeometry(0.6, 0.75, 1, 4, 1).rotateY(PI / 4);
  barGeo.scale(BAR.L / (0.75 * Math.SQRT2), BAR.H, BAR.W / (0.75 * Math.SQRT2));
  const barMat = new THREE.MeshStandardMaterial({ color: 0xffb53c, metalness: 1.0, roughness: 0.38, flatShading: true, envMapIntensity: 0.9, emissive: new THREE.Color(0.08, 0.04, 0.0) });
  const NB = HERO_BARS.length;
  const bars = new THREE.InstancedMesh(barGeo, barMat, NB);
  bars.frustumCulled = false;
  G.add(bars);
  {
    const Rb = rng(9);
    const col = new THREE.Color();
    for (let i = 0; i < NB; i++) bars.setColorAt(i, col.setRGB(1, 0.92 + 0.08 * Rb(), 0.85 + 0.15 * Rb()));
  }
  const sleeveMat = std(0x17181c, 0.9);
  const gloveMat = std(0x0b0b0d, 0.42, 0.15, { side: THREE.DoubleSide });
  const sleeves = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 1, 10, 1, true).translate(0, 0.5, 0), sleeveMat); G.add(m); return m; });
  // a glove: the back of the hand, fingers curled under the bar, a thumb (fingers point along -z)
  const gloveGeo = mergeGeometries([
    new THREE.BoxGeometry(0.088, 0.034, 0.1).translate(0, 0, -0.03).toNonIndexed(),
    new THREE.BoxGeometry(0.086, 0.03, 0.06).rotateX(-1.1).translate(0, -0.03, -0.095).toNonIndexed(),
    new THREE.BoxGeometry(0.026, 0.026, 0.065).rotateY(0.5).translate(0.05, -0.012, -0.04).toNonIndexed(),
  ]);
  gloveGeo.computeVertexNormals();
  const gloves = [0, 1].map((k) => { const m = new THREE.Mesh(gloveGeo, gloveMat); if (k === 0) m.scale.x = -1; G.add(m); return m; });
  const closeL = new THREE.PointLight(0xfff0d8, 0, 9, 1.3);
  G.add(closeL);
  // the very last bar, in your hands at the end
  const lastBar = new THREE.Mesh(barGeo, barMat);
  G.add(lastBar);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function frame(v, s, glows, opts = {}) {
    U.uV.value = v;
    ceilings.forEach((c) => { c.visible = !opts.noCeiling; });
    strips.visible = !opts.noCeiling;
    U.uFogD.value = opts.noCeiling ? 0.004 : 0.012;
    // guards: frozen at the entrance (one with a coffee); when time runs they turn, see it, hands to their heads
    const alarm = v >= 43.6;
    const wa = alarm ? s.W - s.Wresume : 0;
    STAFF.forEach((p, i) => {
      const d = i * 0.07;                       // (not all at once)
      const turn = smooth(0.1 + d, 0.6 + d, wa);
      // toward the nearest empty cage, then looking up and down the hall
      const look = i < 2 ? 0 : (p.x > 0 ? -Math.PI / 2 : Math.PI / 2);
      const yaw = lerp(p.yaw, (i < 2 ? (i ? -0.15 : 0.15) : look) + 0.5 * Math.sin(wa * 0.9 + i) * smooth(1.0, 1.6, wa), turn);
      const z = p.z - (i < 2 ? 0.5 : 0) * smooth(0.2, 0.9, wa);
      guards.pose(i, { x: p.x, y: 0, z, yaw, armR: lerp(p.arm, 1.65, smooth(0.3 + d, 0.7 + d, wa)), armL: p.clip ? lerp(0.9, 0.2, turn) : lerp(0, 1.65, smooth(0.35 + d, 0.8 + d, wa)), look: 0.05 + 0.1 * turn, walk: wa * 3, stride: i < 2 ? 0.6 * smooth(0.2, 0.4, wa) * (1 - smooth(0.7, 0.9, wa)) : 0 });
      if (p.clip) {
        // the clipboard: in his left hand, then dropped (it falls flat on the world clock)
        const fall = clamp((wa - 0.35) / 0.4), y = lerp(1.05, 0.02, fall * fall);
        clip.position.set(p.x + 0.35, y, z - 0.12);
        clip.rotation.set(-1.0 - 0.57 * fall, -Math.PI / 2, 0);
      }
    });
    guards.commit();
    // ghosts: while the vault empties, each hops every 1/12 s to a random spot by a cage being emptied. In a close
    // shot the first few are the copies right in front of you (popping between their spots every GHOST_P s:
    // bent to a stack, then up with a bar), and one walks past the camera with a bar in the guard shot
    const cl = CLOSE[s.shot.k];
    const busy = v > GOLD_A - 0.2 && v < S[3] + 0.1;
    const hop = Math.floor(v * 12);
    const live = CAGES.filter((c) => v > c.a - 0.1 && v < c.b + 0.1);
    const setCarry = (i, x, z, yaw, bend, up = 1.05, fz = -0.42) => {
      e.set(0, yaw, 0); q.setFromEuler(e);
      v3.set(0, up - bend * 0.4, fz).applyQuaternion(q).add(s3.set(x, 0, z));
      m4.compose(v3, q, s3.set(1, 1, 1));
      carry.setMatrixAt(i, m4);
    };
    let i0 = 0;
    if (cl && cl.ghosts) {
      cl.ghosts.forEach((spots, gi) => {
        const ph = (v - s.shot.a) / GHOST_P + gi * 0.37;
        const cyc = Math.floor(ph), u = ph - cyc;
        const [x, z, yaw] = spots[cyc % spots.length];
        const up = u > 0.5;
        const bend = up ? 0.08 : 0.55 * smooth(0, 0.25, u);
        ghosts.pose(i0, { x, y: 0, z, yaw, pitch: bend, armL: up ? 0.75 : 0.5, armR: up ? 0.75 : 0.5 });
        if (up) setCarry(i0, x, z, yaw, bend, 1.08, 0.4); else carry.setMatrixAt(i0, hide);
        i0++;
      });
    }
    if (cl && cl.walker) {
      const w = cl.walker, k = clamp((v - w.a) / (w.b - w.a));
      const x = lerp(w.from[0], w.to[0], k), z = lerp(w.from[1], w.to[1], k);
      const yaw = Math.atan2(w.to[0] - w.from[0], w.to[1] - w.from[1]);      // (the figures face +z at yaw 0)
      ghosts.pose(i0, { x, y: 0, z, yaw, armL: 0.75, armR: 0.75, walk: k * 9, stride: 0.6 });
      setCarry(i0, x, z, yaw, 0, 1.05, 0.4);
      i0++;
    }
    const near = cl ? 2.5 : 4.5;
    for (let i = i0; i < NG; i++) {
      if (!busy || !live.length || opts.noGhosts) { ghosts.pose(i, { x: 0, y: 0, z: 0, visible: false }); carry.setMatrixAt(i, hide); continue; }
      const Rh = rng(hop * 131 + i * 7919);
      const c = live[Math.floor(Rh() * live.length)];
      // in the cage's door, in the corridor, or walking out toward the entrance with a bar
      const where = Rh();
      let x, z, yaw;
      if (where < 0.55) { x = c.x + (Rh() - 0.5) * 5 * -c.side + c.side * -1.2; z = c.z + (Rh() - 0.5) * 3; yaw = c.side > 0 ? -Math.PI / 2 : Math.PI / 2; }
      else { x = c.xc + (Rh() - 0.5) * 2.6; z = c.z + Rh() * (2 - c.z) * 0.9; yaw = Math.PI + (Rh() - 0.5) * 0.4; }
      // (never right at the lens)
      if (opts.cam && Math.hypot(x - opts.cam.x, z - opts.cam.z) < near) { ghosts.pose(i, { x: 0, y: 0, z: 0, visible: false }); carry.setMatrixAt(i, hide); continue; }
      const bend = where < 0.55 ? 0.35 + 0.3 * Rh() : 0.05;
      ghosts.pose(i, { x, y: 0, z, yaw, pitch: bend, armL: 0.75, armR: 0.75, walk: Rh() * 6, stride: where < 0.55 ? 0.3 : 1 });
      setCarry(i, x, z, yaw, bend);
    }
    ghosts.commit();
    carry.instanceMatrix.needsUpdate = true;
    // sparkles where bars are being lifted (a few glints per live cage)
    for (const c of live) {
      const Rs = rng(Math.floor(v * 20) * 17 + c.k * 3);
      for (let k = 0; k < 3; k++) glows.add(c.x + (Rs() - 0.5) * 5, 0.4 + Rs() * 1.1, c.z + (Rs() - 0.5) * 3, 0.06 + 0.06 * Rs(), 3, 2.2, 0.8);
    }
    // the hero stacks' bars: there until taken (a glint as the copies take each one); the one in your hands follows it
    const H = handsAt(cl, v);
    let held = null;
    HERO_BARS.forEach((b, i) => {
      const own = cl && cl.bars && b.key === s.shot.k;
      if (!own) { bars.setMatrixAt(i, hide); return; }
      if (v < b.t) {
        m4.compose(v3.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.yaw, 0)), s3.set(1, 1, 1));
        bars.setMatrixAt(i, m4);
        return;
      }
      if (b.hand >= 0 && H && H.hi === b.hand) { held = { b, i }; return; }
      bars.setMatrixAt(i, hide);
      const dt = v - b.t;
      if (b.hand < 0 && dt < 0.1 && i % 7 === 0) glows.add(b.x, b.y + 0.03, b.z, 0.018 * (1 - dt / 0.1) + 0.005, 1.3, 1.0, 0.4);
    });
    // your hands (first person): from the bottom of the frame to the bar's ends, lift it up in front of you, then down
    // and away into the bag (out of frame); the last one is held up
    const camO = opts.camera;
    const fp = cl && cl.hands && camO && H;
    sleeves.forEach((m) => { m.visible = !!fp; });
    gloves.forEach((m) => { m.visible = !!fp; });
    if (fp) {
      const local = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(camO.matrixWorld);
      const camQ = camO.quaternion;
      const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, camO.rotation.y, 0, 'YXZ'));
      let ctr, qb;
      const hold = cl.hold && H.hi === cl.hands.length - 1;
      if (H.hi < 0 || !H.bar) {
        ctr = local(0, -0.75, -0.3); qb = qFlat;
      } else {
        const b = H.bar, u = H.u;
        const pile = new THREE.Vector3(b.x, b.y, b.z), qp = new THREE.Quaternion().setFromEuler(e.set(0, b.yaw, 0));
        const lift = local(0.0, hold ? -0.23 : -0.2, hold ? -0.5 : -0.46);
        const away = local(0.45, -0.75, -0.25);
        const start = H.hi === 0 ? local(0.05, -0.75, -0.3) : away;
        // turn the bar so it lies across your view as you lift it
        const qUp = qFlat.clone();
        if (u < 0.32) { ctr = start.clone().lerp(pile, smooth(0, 0.32, u)); qb = qp; }
        else if (hold || u < 0.68) { const k = smooth(0.32, 0.68, u); ctr = pile.clone().lerp(lift, k); ctr.y += Math.sin(k * PI) * 0.08; qb = qp.clone().slerp(qUp, k); }
        else { const k = smooth(0.68, 1.0, u); ctr = lift.clone().lerp(away, k); qb = qUp; }
        if (held && u >= 0.32) { m4.compose(ctr, qb, s3.set(1, 1, 1)); bars.setMatrixAt(held.i, m4); }
        else if (held) bars.setMatrixAt(held.i, hide);
      }
      // gloves at the bar's ends; sleeves from the elbows (below the frame) to the wrists
      [-1, 1].forEach((sd, k) => {
        const grip = new THREE.Vector3(sd * (BAR.L / 2 + 0.012), 0.006, 0).applyQuaternion(qb).add(ctr);
        const elbow = local(sd * 0.3, -0.7, 0.05);
        const g = gloves[k];
        g.position.copy(grip);
        const axis = new THREE.Vector3(sd, 0, 0).applyQuaternion(qb);
        const fwd = new THREE.Vector3(0, -0.55, -0.85).applyQuaternion(camQ);
        const zL = fwd.clone().addScaledVector(axis, -fwd.dot(axis)).normalize().negate();   // (fingers along -z)
        const xL = new THREE.Vector3().crossVectors(axis, zL);
        g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xL, axis, zL));
        const dir = grip.clone().sub(elbow).normalize();
        const wrist = grip.clone().addScaledVector(dir, -0.06);
        const sl = sleeves[k], len = wrist.distanceTo(elbow);
        sl.position.copy(elbow);
        sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        sl.scale.set(1, len, 1);
      });
    }
    bars.instanceMatrix.needsUpdate = true;
    // the last bar in your hands (you, seen from in front)
    lastBar.visible = s.shot.k === 'goldYou';
    if (lastBar.visible) {
      const y = CLOSE.goldYou.you;
      e.set(0, y.yaw, 0); q.setFromEuler(e);
      lastBar.position.set(0, 1.04, 0.44).applyQuaternion(q).add(v3.set(y.x, 0, y.z));
      lastBar.quaternion.copy(q);
      glows.add(lastBar.position.x, lastBar.position.y + 0.03, lastBar.position.z, 0.03 + 0.03 * Math.pow(Math.max(0, Math.sin(v * 3.1)), 8), 1.6, 1.15, 0.45);
    }
    // a lamp over the close shots (the halls off the middle one have no lamps of their own)
    if (cl && cl.cam) {
      const [px, py, pz] = cl.cam.p0;
      closeL.position.set(px + 0.3, 3.0, pz - 0.6);
      closeL.intensity = Math.abs(px) > 10 ? 9 : 0;     // (the middle hall has its own lamps)
    } else closeL.intensity = 0;
    const sw = alarm ? 0.5 + 0.5 * Math.sin(s.W * 9) : 0;
    beacon.intensity = alarm ? 8 + 12 * sw : 0;
    if (alarm) glows.add(0, 3.05, 1.6, 0.14, 1.2 + 2.2 * sw, 0.08, 0.04);
  }
  return { G, frame, setEnv(t) { barMat.envMap = t; barMat.needsUpdate = true; } };
}
