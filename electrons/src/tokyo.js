// Shibuya Crossing at noon, from the station side (east) looking west across the scramble. Hundreds of people
// crossing in every direction, all traffic stopped at the red, giant video screens, neon signs, Q-Front on the
// far corner, Shibuya 109 at the end of the road, the subway under the street.
// When the electrons vanish (s.gone) every mesh swaps to its "ghost" material (xray.js): unlit glowing outlines,
// drawn without depth so you see through everything. Time all but stops (slow motion x1e9): people freeze mid-step.
// As the nuclei push apart (s.repel) everything swells, sheds sparks and glows brighter until it burns white.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, G } from './bend.js';
import { rng, smooth, clamp, lerp, DEG } from './util.js';
import { makeFleet } from './cars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { xrayMat, xrayGround, XR } from './xray.js';
import { V_EVENT } from './timeline.js';

const RX = 11, RZ = 12;            // half-widths of the two roads (N-S road along z: |x| < RX; E-W road along x: |z| < RZ)
const CW = 6;                      // crosswalk width
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

export function makeTokyo(scene) {
  const R = rng(1109);
  const T = { ghosts: [] };
  const plainMat = (color, rough = 0.9, extra = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const glowMat = (color) => patch(new THREE.MeshBasicMaterial({ color, toneMapped: true }));
  const shadowy = (m) => { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; return m; };
  // every visible mesh gets a ghost twin material, swapped in when the electrons vanish
  const ghost = (mesh, opts) => { T.ghosts.push({ mesh, normal: mesh.material, ghost: xrayMat(opts) }); return mesh; };

  // ---------- the ground: asphalt, the famous scramble markings, sidewalks ----------
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vGW;
        float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float bars(float along, float aa) { return smoothstep(0.5 - aa, 0.5 + aa, fract(along / 0.9)) ; }
        ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vGW.xz;
          float aa = max(max(fwidth(p.x), fwidth(p.y)) * 0.8, 0.01);
          vec3 col = vec3(0.17, 0.17, 0.18) * (0.82 + 0.3 * vn2(p * 0.6) + 0.12 * vn2(p * 5.0));
          float inX = 1.0 - smoothstep(${RX}.0 - aa, ${RX}.0 + aa, abs(p.x));
          float inZ = 1.0 - smoothstep(${RZ}.0 - aa, ${RZ}.0 + aa, abs(p.y));
          float road = max(inX, inZ);
          // zebra crosswalks on all four sides (bars run along the traffic, you step across them)
          float cwE = step(${RX}.0 + 0.5, abs(p.x)) * step(abs(p.x), ${RX + CW}.0) * inZ;   // crossing the E-W road
          float cwN = step(${RZ}.0 + 0.5, abs(p.y)) * step(abs(p.y), ${RZ + CW}.0) * inX;   // crossing the N-S road
          float zeb = cwE * bars(p.y, aa / 0.9) + cwN * bars(p.x, aa / 0.9);
          // the two diagonals across the middle
          float d1 = abs(p.x - p.y * ${(RX / RZ).toFixed(3)}) * 0.7, d2 = abs(p.x + p.y * ${(RX / RZ).toFixed(3)}) * 0.7;
          float inMid = inX * inZ;
          float diag = inMid * (step(d1, 2.6) * bars((p.x + p.y) * 0.707, aa) + step(d2, 2.6) * bars((p.x - p.y) * 0.707, aa));
          // stop lines and lane dashes on the approaches
          float stopL = (1.0 - smoothstep(0.2 - aa, 0.2 + aa, abs(abs(p.x) - ${(RX + CW + 1.5).toFixed(1)}))) * inZ + (1.0 - smoothstep(0.2 - aa, 0.2 + aa, abs(abs(p.y) - ${(RZ + CW + 1.5).toFixed(1)}))) * inX;
          float lane = (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.y) - 4.0))) * step(${RX + CW + 2}.0, abs(p.x)) * step(fract(p.x / 8.0), 0.45) * inZ
                     + (1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(abs(p.x) - 3.6))) * step(${RZ + CW + 2}.0, abs(p.y)) * step(fract(p.y / 8.0), 0.45) * inX;
          float centre = (1.0 - smoothstep(0.08 - aa, 0.08 + aa, abs(p.y))) * step(${RX + CW + 2}.0, abs(p.x)) + (1.0 - smoothstep(0.08 - aa, 0.08 + aa, abs(p.x))) * step(${RZ + CW + 2}.0, abs(p.y));
          vec3 paint = vec3(0.82, 0.81, 0.77) * (0.7 + 0.3 * vn2(p * 2.0));
          col = mix(col, paint, clamp(max(zeb, diag) * 0.92 + stopL + lane * 0.8, 0.0, 1.0) * road);
          col = mix(col, vec3(0.8, 0.62, 0.15), centre * 0.85 * road);
          // sidewalks: pale tiles
          vec2 q = p / 0.6; vec2 f = fract(q);
          vec3 tile = vec3(0.56, 0.54, 0.5) * (0.88 + 0.18 * h2(floor(q)));
          tile *= 0.85 + 0.15 * smoothstep(0.0, 0.08, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
          col = mix(tile, col, road);
          diffuseColor.rgb = col;
        }`);
    };
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), mat);
    g.receiveShadow = true; g.frustumCulled = false;
    scene.add(g);
    T.ghosts.push({ mesh: g, normal: mat, ghost: xrayGround() });
    // curbs
    const curb = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      curb.push(new THREE.BoxGeometry(400, 0.15, 0.3).translate(sx * (RX + 200), 0.075, sz * RZ));
      curb.push(new THREE.BoxGeometry(0.3, 0.15, 400).translate(sx * RX, 0.075, sz * (RZ + 200)));
    }
    ghost(scene.add(new THREE.Mesh(mergeGeometries(curb), plainMat(0x8a8780, 0.8))).children.at(-1), { color: 0x9fc4ff, gain: 0.5 });
  }

  // ---------- buildings: dense mid-rise blocks in every quadrant, a few towers ----------
  const B = [];
  const pal = [0xb9b2a6, 0xa49d92, 0x8f8c88, 0xd1cbc0, 0x7f7a74, 0xc8c1b5, 0x6f747a, 0x9da4ab, 0xb3a28c, 0x8a7f73];
  const glassPal = [0x55697d, 0x5e7690, 0x6f879b, 0x46586a];
  const addB = (x0, x1, z0, z1, h, color) => B.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h, color: color ?? pal[Math.floor(R() * pal.length)], seed: R() });
  // landmark boxes (kept clear of the generic blocks)
  const QF = { x0: -46, x1: -19, z0: -44, z1: -20 };          // Q-Front, the giant-screen building on the far corner
  const L109 = { x: -190, z: 6, r: 13 };                       // Shibuya 109 at the end of the road
  const clear = (x, z) => (x > QF.x0 - 2 && x < QF.x1 + 2 && z > QF.z0 - 2 && z < QF.z1 + 2) || Math.hypot(x - L109.x, z - L109.z) < 22;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // blocks along the roads, then deeper rows with side streets every ~45 m
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 8; col++) {
        const bx0 = (RX + CW + 2) + col * 46, bz0 = (RZ + CW + 2) + row * 42;
        let x = bx0;
        while (x < bx0 + 38) {
          const w = 7 + R() * 14;
          let z = bz0;
          while (z < bz0 + 34) {
            const d = 9 + R() * 14;
            const cx = sx * (x + Math.min(w, bx0 + 38 - x) / 2), cz = sz * (z + Math.min(d, bz0 + 34 - z) / 2);
            if (!clear(cx, cz)) {
              const near = Math.hypot(cx, cz);
              let h = 14 + Math.pow(R(), 1.3) * 36 + (near > 150 ? R() * 20 : 0);
              if (R() < 0.05) h = 70 + R() * 70;
              const X0 = sx > 0 ? x : -(x + Math.min(w, bx0 + 38 - x)), X1 = sx > 0 ? x + Math.min(w, bx0 + 38 - x) : -x;
              const Z0 = sz > 0 ? z : -(z + Math.min(d, bz0 + 34 - z)), Z1 = sz > 0 ? z + Math.min(d, bz0 + 34 - z) : -z;
              addB(X0 + 0.25, X1 - 0.25, Z0 + 0.25, Z1 - 0.25, h, h > 70 ? glassPal[Math.floor(R() * glassPal.length)] : undefined);
            }
            z += d;
          }
          x += w;
        }
      }
    }
  }
  // Shibuya Scramble Square, the 230 m tower over the station (behind you at the start; seen when you look up)
  addB(40, 92, -36, 6, 230, 0x5a6f84);
  // Q-Front: glass box
  addB(QF.x0, QF.x1, QF.z0, QF.z1, 38, 0x3f4a55);
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(B, (b) => b.seed), 1));
  bGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(new Float32Array(B.length).fill(0.15), 1));
  const bMesh = shadowy(new THREE.InstancedMesh(bGeo, patch(new THREE.MeshStandardMaterial({ roughness: 0.8 }), { windows: true }), B.length));
  B.forEach((b, i) => { dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix(); bMesh.setMatrixAt(i, dummy.matrix); bMesh.setColorAt(i, tmpC.set(b.color)); });
  scene.add(bMesh);
  ghost(bMesh, { color: 0x8fb8ff, gain: 0.55, grid: true });
  // Shibuya 109: a silver cylinder tower with a tall sign
  {
    const g = mergeGeometries([
      new THREE.CylinderGeometry(L109.r, L109.r, 46, 32).translate(0, 23, 0).toNonIndexed(),
      new THREE.CylinderGeometry(L109.r * 0.92, L109.r * 0.92, 10, 32).translate(0, 51, 0).toNonIndexed(),
    ]);
    const m = shadowy(new THREE.Mesh(g, plainMat(0xc9ccd0, 0.35, { metalness: 0.35 })));
    m.position.set(L109.x, 0, L109.z);
    scene.add(m);
    ghost(m, { color: 0x8fb8ff, gain: 0.7 });
  }

  // ---------- giant screens and signs ----------
  const screens = [];
  // Q-Front's wall of screen on the two faces toward the crossing; big screens on the other corners
  screens.push({ p: [QF.x1 + 0.3, 21, (QF.z0 + QF.z1) / 2], w: 22, h: 26, yaw: Math.PI / 2 });
  screens.push({ p: [(QF.x0 + QF.x1) / 2, 21, QF.z1 + 0.3], w: 25, h: 26, yaw: 0 });
  for (const b of B) {
    const nearCorner = Math.abs(b.x) < 80 && Math.abs(b.z) < 80 && b.h > 18;
    if (!nearCorner || R() < 0.45) continue;
    // a screen on the face toward the crossing
    const faceX = Math.abs(b.x) > Math.abs(b.z);
    const w = Math.min(faceX ? b.d : b.w, 8 + R() * 10), h = 6 + R() * 10, y = 8 + R() * Math.max(b.h - h - 10, 2);
    if (faceX) screens.push({ p: [b.x - Math.sign(b.x) * (b.w / 2 + 0.3), y + h / 2, b.z], w, h, yaw: b.x > 0 ? -Math.PI / 2 : Math.PI / 2 });
    else screens.push({ p: [b.x, y + h / 2, b.z - Math.sign(b.z) * (b.d / 2 + 0.3)], w, h, yaw: b.z > 0 ? Math.PI : 0 });
  }
  const screenU = { uTime: G.uTime, uOn: { value: 1 } };
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from(screens, () => R()), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: screenU,
      vertexShader: /* glsl */ `attribute float aSeed; varying vec2 vUv; varying float vSeed;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform float uOn; varying vec2 vUv; varying float vSeed;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        float h1(float n){ return fract(sin(n * 91.7) * 43758.5); }
        void main() {
          #include <logdepthbuf_fragment>
          float slide = floor(uTime / (2.0 + vSeed * 2.5) + vSeed * 7.0);
          vec3 a = 0.5 + 0.5 * cos(6.2831 * (h1(slide + vSeed * 13.0) + vec3(0.0, 0.33, 0.67)));
          vec3 b = 0.5 + 0.5 * cos(6.2831 * (h1(slide * 1.7 + vSeed * 5.0) + vec3(0.1, 0.4, 0.8)));
          float kind = h1(slide * 3.1 + vSeed);
          vec3 c;
          if (kind < 0.3) c = mix(a, b, smoothstep(0.2, 0.8, vUv.y + 0.25 * sin(vUv.x * 5.0 + uTime * 1.3)));
          else if (kind < 0.6) c = mix(a * 0.25, b, step(0.5, fract(vUv.x * 3.0 - uTime * 0.5)) * step(0.2, vUv.y) * step(vUv.y, 0.8));
          else c = mix(vec3(0.05, 0.05, 0.08), a, smoothstep(0.3, 0.27, length((vUv - vec2(0.5 + 0.18 * sin(uTime * 0.8 + vSeed * 9.0), 0.5)) * vec2(1.6, 1.0))));
          float fr = step(0.015, vUv.x) * step(vUv.x, 0.985) * step(0.015, vUv.y) * step(vUv.y, 0.985);
          c = c * (0.5 + 2.4 * fr) * uOn + vec3(0.03) * (1.0 - uOn);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const im = new THREE.InstancedMesh(geo, mat, screens.length);
    screens.forEach((s, i) => { dummy.position.set(...s.p); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(s.w, s.h, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.frustumCulled = false; scene.add(im);
    ghost(im, { color: 0xc8dcff, gain: 0.9, rect: true });
  }
  // vertical neon signs on the street faces (Tokyo's signature): coloured glowing panels
  {
    const signs = [];
    for (const b of B) {
      if (Math.hypot(b.x, b.z) > 140 || b.h < 14) continue;
      const n = Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const faceX = Math.abs(b.x) > Math.abs(b.z) ? R() < 0.7 : R() < 0.3;
        const h = 3 + R() * 9, y = 4 + R() * Math.max(b.h - h - 6, 1), off = (R() - 0.5) * (faceX ? b.d : b.w) * 0.8;
        if (faceX) signs.push({ p: [b.x - Math.sign(b.x) * (b.w / 2 + 0.9), y + h / 2, b.z + off], h, yaw: 0, c: R() });
        else signs.push({ p: [b.x + off, y + h / 2, b.z - Math.sign(b.z) * (b.d / 2 + 0.9)], h, yaw: Math.PI / 2, c: R() });
      }
    }
    const geo = new THREE.BoxGeometry(0.25, 1, 1.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(geo, mat, signs.length);
    const cols = [0xff3b5c, 0x39d0ff, 0xffd23f, 0x7dff6a, 0xff8a2a, 0xffffff, 0xd56bff];
    signs.forEach((s, i) => { dummy.position.set(...s.p); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(1, s.h, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.set(cols[Math.floor(s.c * cols.length)]).multiplyScalar(2.2)); });
    im.frustumCulled = false; scene.add(im);
    ghost(im, { color: 0xb8d0ff, gain: 0.5 });
  }

  // ---------- street furniture: traffic lights (red for cars: it's the scramble), a few trees ----------
  {
    const poles = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [0, 1]) poles.push({ x: sx * (RX + 0.8 + k * (CW + 1.5)), z: sz * (RZ + 0.8 + (1 - k) * (CW + 1.5)) });
    const pg = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.15, 5.5, 8).translate(0, 2.75, 0).toNonIndexed(), new THREE.BoxGeometry(0.4, 1.3, 0.35).translate(0, 5.0, 0).toNonIndexed()]);
    const pm = shadowy(new THREE.InstancedMesh(pg, plainMat(0x404448, 0.6), poles.length));
    poles.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
    scene.add(pm);
    ghost(pm, { color: 0x9fc4ff, gain: 0.6 });
    T.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 5.35, 0.2), glowMat(new THREE.Color(9, 0.6, 0.3)), poles.length);
    poles.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.updateMatrix(); T.lamps.setMatrixAt(i, dummy.matrix); });
    T.lamps.frustumCulled = false; scene.add(T.lamps);
  }

  // ---------- the subway under the street (only seen once everything turns see-through) ----------
  {
    const parts = [];
    parts.push(new THREE.BoxGeometry(14, 7, 600).translate(-30, -12, 0));
    parts.push(new THREE.BoxGeometry(600, 7, 14).translate(0, -20, 30));
    const tunnel = new THREE.Mesh(mergeGeometries(parts), plainMat(0x333333, 1));
    scene.add(tunnel);
    ghost(tunnel, { color: 0x6f8fd8, gain: 0.2 });
    const cars = [];
    for (let k = 0; k < 10; k++) cars.push([-33, -13.5, -80 + k * 20.5, 0]);
    for (let k = 0; k < 10; k++) cars.push([30 - k * 20.5, -21.5, 27, 1]);
    for (let k = 0; k < 10; k++) cars.push([-26.5, -13.5, 70 + k * 20.5, 0]);
    const cg = new THREE.BoxGeometry(2.9, 3.6, 20);
    const cm = new THREE.InstancedMesh(cg, plainMat(0xc0c4c8, 0.5), cars.length);
    cars.forEach(([x, y, z, rot], i) => { dummy.position.set(x, y + 1.8, z); dummy.rotation.set(0, rot ? Math.PI / 2 : 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); cm.setMatrixAt(i, dummy.matrix); });
    cm.frustumCulled = false; scene.add(cm);
    ghost(cm, { color: 0xbfe0ff, gain: 0.5, grid: true });
  }

  // ---------- cars, buses and taxis waiting at the red on all four approaches ----------
  const carList = [];
  {
    const lanes = [];
    // approach from the east (heading -x) on the south half... (Japan drives on the left)
    for (const [axis, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) for (const lane of [2.0, 5.6, 9.0]) lanes.push({ axis, sgn, lane });
    for (const L of lanes) {
      const stop = (L.axis === 'x' ? RX : RZ) + CW + 3;
      const n = 3 + Math.floor(R() * 5);
      let d = 0;
      for (let k = 0; k < n; k++) {
        const bus = R() < 0.08;
        const len = bus ? 11 : 4.8;
        const along = stop + d + len / 2;
        d += len + 1.4 + R() * 1.6;
        // keep left: traffic arriving from +x (heading -x) uses z < 0... and so on
        if (L.axis === 'x') carList.push({ x: L.sgn * along, z: -L.sgn * L.lane, yaw: L.sgn > 0 ? -Math.PI / 2 : Math.PI / 2, bus });
        else carList.push({ x: L.sgn * L.lane, z: L.sgn * along, yaw: L.sgn > 0 ? 0 : Math.PI, bus });
      }
    }
  }
  const fleet = makeFleet(scene, carList.length, { plainMat, glowMat, shadowy });
  {
    const RK = rng(9);
    const paint = [0xf2f2f2, 0x1b1b1f, 0xb8b8b8, 0x2b4a6b, 0x7a1e22, 0xe6e2d8];
    carList.forEach((c, i) => {
      const taxi = RK() < 0.35;
      fleet.color(i, c.bus ? 0x2e8b57 : taxi ? (RK() < 0.6 ? 0x1c2a22 : 0xd9b23a) : paint[Math.floor(RK() * paint.length)], c.bus ? 3 : taxi ? 0 : [0, 1, 2, 0, 1][Math.floor(RK() * 5)]);
      dummy.position.set(c.x, 0, c.z); dummy.rotation.set(0, c.yaw, 0); dummy.scale.set(c.bus ? 1.35 : 1, c.bus ? 1.7 : 1, c.bus ? 2.3 : 1); dummy.updateMatrix();
      fleet.set(i, dummy.matrix, true);
    });
    fleet.commit();
  }
  T.fleet = fleet;

  // ---------- people: the scramble (every direction at once), people waiting on the corners ----------
  const P = [];
  {
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => new THREE.Vector2(sx * (RX + 3), sz * (RZ + 3)));
    for (let i = 0; i < 760; i++) {
      // a walk from one corner to another (straight across or diagonally), already under way
      const a = corners[Math.floor(R() * 4)];
      let b = corners[Math.floor(R() * 4)];
      if (b === a) b = corners[(corners.indexOf(a) + 1 + Math.floor(R() * 3)) % 4];
      const dir = b.clone().sub(a);
      const len = dir.length(); dir.normalize();
      const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar((R() - 0.5) * 7);
      const u0 = 2 + R() * (len - 6);
      P.push({ kind: 'cross', a: a.clone().add(side), dir, len, u0, speed: 1.1 + R() * 0.6, h: 0.9 + R() * 0.17, ph: R() * 6.28, phone: R() < 0.2, umb: R() < 0.06 });
    }
    // crowds on the corners and the sidewalks, some walking along
    for (let i = 0; i < 520; i++) {
      const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1;
      const alongX = R() < 0.5;
      const x = alongX ? sx * (RX + CW + 2 + R() * 90) : sx * (RX + 0.6 + R() * 5.5);
      const z = alongX ? sz * (RZ + 0.6 + R() * 5.5) : sz * (RZ + CW + 2 + R() * 90);
      const walk = R() < 0.55;
      const d = R() < 0.5 ? -1 : 1;
      P.push({ kind: walk ? 'walk' : 'wait', x, z, alongX, d, speed: 1.0 + R() * 0.5, yaw: R() * 6.28, h: 0.9 + R() * 0.17, ph: R() * 6.28, phone: R() < 0.3 });
    }
  }
  // nobody walks into the camera in the first 2.2 s (it stands at about (17.5, 15) -> (15.3, 13.6))
  for (let i = P.length - 1; i >= 0; i--) {
    for (let t = 0; t <= 2.2; t += 0.1) {
      const at = personAt(P[i], t);
      const cx = lerp(17.5, 15.3, t / 2.2), cz = lerp(15, 13.6, t / 2.2);
      if (Math.hypot(at.x - cx, at.z - cz) < 2.6) { P.splice(i, 1); break; }
    }
  }
  const crowd = makeCrowd(scene, P.length, plainMat(0xffffff, 0.8), { castShadow: true });
  {
    const RP = rng(77);
    const clothes = [0x1d1d1d, 0x2b2d42, 0xedf2f4, 0x8d99ae, 0x3a3a3a, 0xc9c1b1, 0x5c6b73, 0xe9c46a, 0xef233c, 0x264653, 0xf1faee, 0x6d597a];
    const skin = [0xf1c8a6, 0xe8b996, 0xdba882, 0xf6d5bd, 0xc68a62];
    P.forEach((p, i) => crowd.color(i, clothes[Math.floor(RP() * clothes.length)], [0x1d1d1d, 0x2b2d42, 0x3d405b, 0x6b705c, 0x8a817c][Math.floor(RP() * 5)], skin[Math.floor(RP() * skin.length)], HAIR[Math.floor(RP() * 3)], RP() < 0.6));
  }
  T.crowdMeshes = crowd.meshes;
  for (const m of crowd.meshes) ghost(m, { color: 0xe0ecff, gain: 0.9, person: true });
  for (const m of fleet.meshes) ghost(m, { color: 0xd8e6ff, gain: 0.8 });

  // ---------- sparks: as the nuclei push apart, every surface sheds glowing specks ----------
  {
    const n = 60000, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), sz = new Float32Array(n);
    const RS = rng(5);
    for (let i = 0; i < n; i++) {
      let x, y, z;
      const pick = RS();
      if (pick < 0.45) {   // off the people
        const p = P[Math.floor(RS() * P.length)];
        const pp = personAt(p, V_EVENT);
        x = pp.x + (RS() - 0.5) * 0.5; y = RS() * 1.7; z = pp.z + (RS() - 0.5) * 0.5;
      } else if (pick < 0.85) {   // off the buildings near the crossing
        let b; do { b = B[Math.floor(RS() * B.length)]; } while (Math.hypot(b.x, b.z) > 140);
        const fx = RS() < 0.5;
        x = b.x + (fx ? Math.sign(RS() - 0.5) * b.w / 2 : (RS() - 0.5) * b.w); y = RS() * b.h; z = b.z + (fx ? (RS() - 0.5) * b.d : Math.sign(RS() - 0.5) * b.d / 2);
      } else {   // off the street itself
        x = (RS() - 0.5) * 120; y = 0.05; z = (RS() - 0.5) * 120;
      }
      pos.set([x, y, z], i * 3);
      const d = new THREE.Vector3(RS() - 0.5, RS() * 0.8 - 0.2, RS() - 0.5).normalize().multiplyScalar(0.5 + RS() * 3);
      vel.set([d.x, d.y, d.z], i * 3);
      sz[i] = 1.0 + RS() * 2.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    T.sparkU = { uK: { value: 0 }, uTime: G.uTime };
    const m = new THREE.ShaderMaterial({
      uniforms: T.sparkU, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute vec3 aVel; attribute float aSize; uniform float uK; varying float vA;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vec3 p = position + aVel * uK * uK * 6.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          gl_PointSize = aSize * (1.0 + 4.0 * uK) * clamp(30.0 / max(dist, 1.0), 0.4, 3.0);
          vA = smoothstep(0.0, 0.15, uK) * (0.5 + 0.5 * fract(aSize * 7.3)) * exp(-dist / 260.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `varying float vA;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * vA * pow(1.0 - d * 2.0, 1.5) * 1.6, 1.0);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 30;
    scene.add(pts);
    T.sparks = pts;
  }

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight(0xfff2e0, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 700;
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x8a7b6a, 1.1);
  scene.add(sun, sun.target, hemi);
  T.sunDir = new THREE.Vector3(-0.18, Math.sin(47 * DEG), 0.66).normalize();   // noon, high in the south (+z)

  // where a person is at real time t (s); time all but stops once the electrons are gone
  function personAt(p, t) {
    if (p.kind === 'cross') {
      const u = clamp(p.u0 + p.speed * t, 0, p.len);
      return { x: p.a.x + p.dir.x * u, z: p.a.y + p.dir.y * u, yaw: Math.atan2(p.dir.x, p.dir.y) };
    }
    if (p.kind === 'walk') {
      const dx = p.alongX ? p.d * p.speed * t : 0, dz = p.alongX ? 0 : p.d * p.speed * t;
      return { x: p.x + dx, z: p.z + dz, yaw: p.alongX ? (p.d > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.d > 0 ? 0 : Math.PI) };
    }
    return { x: p.x, z: p.z, yaw: p.yaw };
  }

  // ---------- per frame ----------
  let lastGone = -1;
  T.frame = (v, s, cam) => {
    const t = Math.min(v, V_EVENT) + (v > V_EVENT ? s.tau * 1e8 : 0);   // real time; frozen (to the eye) after the event
    G.uTime.value = Math.min(v, V_EVENT);
    G.uCity.value = 0.0;
    G.uSunDir.value.copy(T.sunDir);
    sun.position.copy(cam.position).addScaledVector(T.sunDir, 350); sun.position.y = T.sunDir.y * 350;
    sun.target.position.set(cam.position.x - 30, 0, cam.position.z - 10);
    // the ghost switch
    const gone = s.gone ? 1 : 0;
    if (gone !== lastGone) {
      for (const g of T.ghosts) g.mesh.material = gone ? g.ghost : g.normal;
      sun.visible = hemi.visible = !gone;
      T.lamps.visible = !gone;
      lastGone = gone;
    }
    screenU.uOn.value = gone ? 0 : 1;
    // ghosts: brighter and swelling as the nuclei push apart; people brightest ("every person outshines the Sun")
    XR.uRepel.value = s.repel;
    XR.uSwell.value = s.repel * s.repel * 0.35;
    XR.uTime.value = v;
    T.sparkU.uK.value = s.repel;
    T.sparks.visible = s.repel > 0.001;
    // people: where each would be, then nudged apart so nobody walks through anybody (a few relaxation passes
    // over a coarse grid; a pure function of the positions, so it's the same every time this frame is drawn)
    const pos = P.map((p) => personAt(p, t));
    for (let it = 0; it < 3; it++) {
      const grid = new Map();
      pos.forEach((a, i) => { const k = `${Math.floor(a.x / 0.8)},${Math.floor(a.z / 0.8)}`; (grid.get(k) || grid.set(k, []).get(k)).push(i); });
      pos.forEach((a, i) => {
        const gx = Math.floor(a.x / 0.8), gz = Math.floor(a.z / 0.8);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const cell = grid.get(`${gx + dx},${gz + dz}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const b = pos[j], ex = b.x - a.x, ez = b.z - a.z, d = Math.hypot(ex, ez);
            if (d < 0.62 && d > 1e-6) { const push = (0.62 - d) * 0.5; a.x -= ex / d * push; a.z -= ez / d * push; b.x += ex / d * push; b.z += ez / d * push; }
          }
        }
      });
    }
    P.forEach((p, i) => {
      const at = pos[i];
      const moving = p.kind !== 'wait' && !(p.kind === 'cross' && (p.u0 + p.speed * t >= p.len));
      const walk = moving ? t * 5.5 * p.speed + p.ph : 0;
      crowd.pose(i, { x: at.x, y: Math.abs(at.x) > RX && Math.abs(at.z) > RZ ? 0.15 : 0, z: at.z,
        yaw: at.yaw + (p.kind === 'wait' ? Math.sin(t * 0.3 + p.ph) * 0.2 : 0), s: p.h, walk, stride: moving ? 1 : 0,
        armR: p.phone ? 1.0 : 0, armL: p.umb ? 1.25 : 0, look: 0.05 });
    });
    crowd.commit();
  };
  return T;
}
