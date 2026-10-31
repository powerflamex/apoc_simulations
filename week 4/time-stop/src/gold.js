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
// the stacks: 3 across the cage's depth x 3 along it
export const STACKS = [];
for (const c of CAGES) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dx = (i - 1) * 2.3, dz = (j - 1) * 1.15;
    const h = 1.05 + 0.3 * R();
    const order = i * 3 + j;                            // the front row (by the corridor) first
    const f0 = order / 9, f1 = (order + 1.6) / 9;
    STACKS.push({ x: c.xc + c.side * (2.1 + 1.6 + i * 2.3), z: c.z + dz, w: 1.25, d: 0.92, h, a: lerp(c.a, c.b, f0 * 0.75), b: lerp(c.a, c.b, Math.min(1, f1 * 0.75 + 0.25)), cage: c });
  }
}

export function makeGold(scene) {
  const G = new THREE.Group();
  scene.add(G);
  const std = (c, r = 0.5, m = 0, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
  const U = { uV: { value: 0 }, uFogC: { value: new THREE.Color(0.05, 0.04, 0.03) }, uFogD: { value: 0.012 } };
  // ---- floors, walls, ceilings ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, HALL_L + 20).rotateX(-Math.PI / 2).translate(0, 0, -HALL_L / 2), std(0x55524c, 0.55, 0.1));
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
  const walls = new THREE.Mesh(mergeGeometries(wallG), std(0x8a8478, 0.8));
  G.add(walls);
  const ceilings = HALLS.map((xc) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * (2.1 + CAGE_D + 0.8), HALL_L + 6).rotateX(Math.PI / 2).translate(xc, CEIL, -HALL_L / 2 + 1), std(0xbdb8ae, 0.9));
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
        gl_FragColor = vec4(mix(c * 0.5, uFogC, fog), 1.0);
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
  G.add(new THREE.HemisphereLight(0xfff2dc, 0x4a3a28, 1.3));
  const pls = [];
  for (const z of [-3, -12, -24]) { const l = new THREE.PointLight(0xfff0d8, 10, 18, 1.4); l.position.set(0, 3.0, z); G.add(l); pls.push(l); }
  const beacon = new THREE.PointLight(0xff1a10, 0, 20, 1.1); beacon.position.set(0, 3.0, 1.0); G.add(beacon);
  // ---- guards at the entrance; the time-lapse copies of you ----
  const pmat = std(0xffffff, 0.6);
  const guards = makeCrowd(G, 2, pmat, { castShadow: false });
  guards.color(0, 0x2a3240, 0x1d2028, SKIN[4], HAIR[0]);
  guards.color(1, 0x2a3240, 0x1d2028, SKIN[1], HAIR[2]);
  const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.38, depthWrite: false });
  const NG = 14;
  const ghosts = makeCrowd(G, NG, gmat, { castShadow: false });
  for (let i = 0; i < NG; i++) ghosts.color(i, 0x2c2f36, 0x15161a, SKIN[1], 0x2c2f36);
  ghosts.meshes.forEach((m) => { m.renderOrder = 4; });
  // the bars in the ghosts' arms
  const carry = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.09, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.5, 0.12), transparent: true, opacity: 0.6, depthWrite: false }), NG);
  carry.frustumCulled = false; carry.renderOrder = 4;
  G.add(carry);

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
    const gp = [[-1.2, 3.6, 2.6], [1.3, 4.2, -2.9]];
    gp.forEach(([x, z, yaw], i) => {
      const turn = smooth(0.1, 0.6, wa);
      guards.pose(i, { x, y: 0, z: z - 0.5 * smooth(0.2, 0.9, wa), yaw: lerp(yaw, Math.PI * 0 + (i ? -0.15 : 0.15), turn), armR: i === 0 ? lerp(0.9, 1.65, smooth(0.3, 0.7, wa)) : lerp(0.2, 1.65, smooth(0.35, 0.75, wa)), armL: lerp(0, 1.65, smooth(0.35, 0.8, wa)), look: 0.05 });
    });
    guards.commit();
    // ghosts: while the vault empties, each hops every 1/12 s to a random spot by a cage being emptied
    const busy = v > GOLD_A - 0.2 && v < S[3] + 0.1;
    const hop = Math.floor(v * 12);
    const live = CAGES.filter((c) => v > c.a - 0.1 && v < c.b + 0.1);
    for (let i = 0; i < NG; i++) {
      if (!busy || !live.length || opts.noGhosts) { ghosts.pose(i, { x: 0, y: 0, z: 0, visible: false }); carry.setMatrixAt(i, hide); continue; }
      const Rh = rng(hop * 131 + i * 7919);
      const c = live[Math.floor(Rh() * live.length)];
      // in the cage's door, in the corridor, or walking out toward the entrance with a bar
      const where = Rh();
      let x, z, yaw;
      if (where < 0.55) { x = c.x + (Rh() - 0.5) * 5 * -c.side + c.side * -1.2; z = c.z + (Rh() - 0.5) * 3; yaw = c.side > 0 ? -Math.PI / 2 : Math.PI / 2; }
      else { x = c.xc + (Rh() - 0.5) * 2.6; z = c.z + Rh() * (2 - c.z) * 0.9; yaw = Math.PI + (Rh() - 0.5) * 0.4; }
      // (never right at the lens)
      if (opts.cam && Math.hypot(x - opts.cam.x, z - opts.cam.z) < 4.5) { ghosts.pose(i, { x: 0, y: 0, z: 0, visible: false }); carry.setMatrixAt(i, hide); continue; }
      const bend = where < 0.55 ? 0.35 + 0.3 * Rh() : 0.05;
      ghosts.pose(i, { x, y: 0, z, yaw, pitch: bend, armL: 0.75, armR: 0.75, walk: Rh() * 6, stride: where < 0.55 ? 0.3 : 1 });
      e.set(0, yaw, 0); q.setFromEuler(e);
      v3.set(0, 1.05 - bend * 0.4, -0.42).applyQuaternion(q).add(s3.set(x, 0, z));
      m4.compose(v3, q, s3.set(1, 1, 1));
      carry.setMatrixAt(i, m4);
    }
    ghosts.commit();
    carry.instanceMatrix.needsUpdate = true;
    // sparkles where bars are being lifted (a few glints per live cage)
    for (const c of live) {
      const Rs = rng(Math.floor(v * 20) * 17 + c.k * 3);
      for (let k = 0; k < 3; k++) glows.add(c.x + (Rs() - 0.5) * 5, 0.4 + Rs() * 1.1, c.z + (Rs() - 0.5) * 3, 0.06 + 0.06 * Rs(), 3, 2.2, 0.8);
    }
    const sw = alarm ? 0.5 + 0.5 * Math.sin(s.W * 9) : 0;
    beacon.intensity = alarm ? 30 + 40 * sw : 0;
    if (alarm) glows.add(0, 3.05, 1.6, 0.3, 4 + 6 * sw, 0.2, 0.1);
  }
  return { G, frame };
}
