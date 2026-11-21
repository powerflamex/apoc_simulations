// The rooftop pool on the north block: a glass-walled box at the roof's front edge (12 x 5 m, 1.35 m of water), a
// wooden deck, loungers, white parasols and a glass railing. With gravity off the water can't leave as a ball: air
// can't get under it, so the air pressure holds it in like a suction cup. What moves is what was moving: the pool's
// floor springs back (the slab sagged ~1.5 cm under the water) and pushes the middle up, so a mound rises (~0.3 m/s,
// 1.5 m by 0.00) while the water along the glass drains into it; the swimmers' waves grow (crests keep rising,
// troughs keep sinking) and their splashes fly on. At 0.00 the mound collapses (0.55 s) and slops over the glass front.
import * as THREE from 'three';
import { POOL, POOLB } from './layout.js';
import { G, T_ON, fly } from './timeline.js';
import { WU, makeBlobs } from './fountain.js';
import { CU, HAZE_GLSL, hazed } from './city.js';
import { rng, smooth, clamp } from './util.js';

const CX = (POOL.x0 + POOL.x1) / 2, CZ = (POOL.z0 + POOL.z1) / 2, HX = (POOL.x1 - POOL.x0) / 2, HZ = (POOL.z1 - POOL.z0) / 2;
const Y0 = POOL.floor + POOL.depth;
const NX = 60, NZ = 26;
// the waves the swimmers had made: [kx, kz, phase, amplitude, omega]
const WAVES = [];
{ const R = rng(5150); for (let k = 0; k < 9; k++) { const a = R() * Math.PI, kk = 2.2 + 3 * R(); WAVES.push([Math.cos(a) * kk, Math.sin(a) * kk, R() * 6.28, 0.02 + 0.02 * R(), Math.sqrt(G * kk)]); } }

// the water's height above the pool floor at local (u, w) (u along x from the centre, w along z), story time t
export function poolH(u, w, t) {
  const tt = clamp(t, 0, T_ON);
  const shape = Math.exp(-((u / 3.1) ** 2 + (w / 1.35) ** 2));
  // the mound: rising at 0.3 m/s from a quick start (the slab's kick), wobbling; after 0.00 it falls back
  let m = 0.4 * tt * smooth(0, 0.25, tt) + 0.06 * Math.sin(tt * 2.1) * smooth(0.3, 1.5, tt);
  let drain = m * 0.31;
  let slosh = 0;
  if (t > T_ON) {
    const s = t - T_ON, m5 = 0.4 * T_ON + 0.06 * Math.sin(T_ON * 2.1);
    m = Math.max(0, m5 + 0.4 * s - 0.5 * G * s * s);
    drain = m * 0.31;
    // the collapse: a surge out to the walls and over the front glass
    const k = smooth(0.45, 0.8, s);
    slosh = k * (0.55 * Math.exp(-(((Math.abs(u) - 3.5) / 2.2) ** 2)) + 0.4 * smooth(0, HZ, w)) * (1 - 0.3 * smooth(0.8, 1.3, s));
  }
  let wv = 0;
  for (const [kx, kz, ph, a, om] of WAVES) { const th = kx * u + kz * w + ph; wv += a * (Math.cos(th) + om * 0.12 * tt * Math.sin(th)); }
  wv *= 1 - 0.6 * shape;
  const edge = Math.min(1, (HX - Math.abs(u)) / 0.6, (HZ - Math.abs(w)) / 0.4);
  return POOL.depth + m * shape - drain * (1 - shape) + wv * clamp(edge, 0.2, 1) + slosh;
}

export function makePool(scene, ctx) {
  const R = rng(919);
  // ---- water: a heightfield top and side skirts down to the floor ----
  const nTop = (NX + 1) * (NZ + 1), nSide = 2 * (NX + 1) * 2 + 2 * (NZ + 1) * 2;
  const pos = new Float32Array((nTop + nSide) * 3);
  const idx = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  // side strips: pairs (top, bottom) along each edge
  const sideRuns = [];
  let base = nTop;
  const run = (cells) => { const start = base; sideRuns.push({ start, cells }); for (let k = 0; k < cells.length - 1; k++) { const a = start + k * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, c, b, d); } base += cells.length * 2; };
  run(Array.from({ length: NX + 1 }, (_, i) => [i, NZ]));            // front (south, faces the square)
  run(Array.from({ length: NX + 1 }, (_, i) => [NX - i, 0]));        // back
  run(Array.from({ length: NZ + 1 }, (_, j) => [0, j]));             // west
  run(Array.from({ length: NZ + 1 }, (_, j) => [NX, NZ - j]));       // east
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const wmat = new THREE.ShaderMaterial({
    uniforms: { ...WU, uHaze: CU.uHaze, uHazeD: CU.uHazeD, uFog: CU.uFog, uFogCol: CU.uFogCol, uFogD: CU.uFogD },
    side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `varying vec3 vW; varying vec3 vN;
      uniform vec3 uSkyHi; uniform vec3 uSkyLo; uniform vec3 uSun; uniform vec3 uSunCol;
      uniform vec3 uHaze; uniform float uHazeD; uniform float uFog; uniform vec3 uFogCol; uniform float uFogD;
      ${HAZE_GLSL}
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        if (dot(N, V) < 0.0) N = -N;
        float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 r = reflect(-V, N);
        vec3 sky = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, clamp(r.y, 0.0, 1.0)), 0.6));
        float depthK = clamp((vW.y - ${POOL.floor.toFixed(2)}) / 1.4, 0.0, 2.0);
        vec3 body = mix(vec3(0.04, 0.32, 0.42), vec3(0.18, 0.62, 0.7), clamp(depthK * 0.6, 0.0, 1.0));
        body *= 0.75 + 0.35 * max(dot(N, uSun), 0.0);
        vec3 c = mix(body, sky * 1.1, fr * 0.8);
        c += uSunCol * 3.0 * pow(max(dot(reflect(-uSun, N), V), 0.0), 80.0);
        c = hazeIt(c, vW);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, wmat);
  water.frustumCulled = false; water.castShadow = false;
  scene.add(water);

  // ---- the box: tiled floor and back, glass front and sides, a coping round the top ----
  const tile = hazed(new THREE.MeshStandardMaterial({ color: 0x5ab8c8, roughness: 0.35 }));
  const coping = hazed(new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 }));
  const W2 = POOL.x1 - POOL.x0, D2 = POOL.z1 - POOL.z0;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.3, 0.12, D2 + 0.3), tile);
  floor.position.set(CX, POOL.floor - 0.06, CZ); scene.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.3, POOL.wall, 0.15), tile);
  back.position.set(CX, POOL.floor + POOL.wall / 2, POOL.z0 - 0.075); scene.add(back);
  const glassM = new THREE.MeshStandardMaterial({ color: 0xbfe6ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
  const gFront = new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.3, POOL.wall, 0.04), glassM);
  gFront.position.set(CX, POOL.floor + POOL.wall / 2, POOL.z1 + 0.02); gFront.renderOrder = 4; scene.add(gFront);
  for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, POOL.wall, D2 + 0.3), glassM); s.position.set(CX + sx * (HX + 0.15), POOL.floor + POOL.wall / 2, CZ); s.renderOrder = 4; scene.add(s); }
  const cop = new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.5, 0.08, 0.3), coping); cop.position.set(CX, POOL.floor + POOL.wall + 0.04, POOL.z0 - 0.1); scene.add(cop);
  // the deck (wood) over the roof, a glass railing along the roof's front edge
  const deck = new THREE.Mesh(new THREE.BoxGeometry(POOLB.x1 - POOLB.x0 - 2, 0.1, 13), hazed(new THREE.MeshStandardMaterial({ color: 0x9a7452, roughness: 0.8 })));
  deck.position.set(0, POOLB.h + 0.05, POOLB.z1 - 7); deck.receiveShadow = true; scene.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(POOLB.x1 - POOLB.x0 - 0.4, 1.1, 0.03), glassM);
  rail.position.set(0, POOLB.h + 0.55, POOLB.z1 - 0.2); rail.renderOrder = 4; scene.add(rail);
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(POOLB.x1 - POOLB.x0 - 0.4, 0.05, 0.06), ctx.plainMat(0x9aa0a6, 0.4, { metalness: 0.6 }));
  railTop.position.set(0, POOLB.h + 1.12, POOLB.z1 - 0.2); scene.add(railTop);
  // parasols and loungers on the deck behind the pool's ends
  const white = ctx.plainMat(0xf4f1ea, 0.7);
  for (const x of [-12.5, -9, 9, 12.5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), ctx.plainMat(0x6a6a6a, 0.5));
    pole.position.set(x, POOLB.h + 1.2, -33); scene.add(pole);
    const can = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 10, 1, true), white);
    can.position.set(x, POOLB.h + 2.45, -33); ctx.shadowy(can); scene.add(can);
    const lou = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.9), white);
    lou.position.set(x + 0.9, POOLB.h + 0.27, -32.6); ctx.shadowy(lou); scene.add(lou);
  }

  // ---- the swimmers (their heads at the water) and the sunbathers (on loungers), crowd people ----
  const SWIM = [[-3.8, -0.6], [-1.2, 0.9], [0.4, -0.2], [2.6, 0.7], [4.4, -0.8]].map(([u, w]) => ({ u, w, ph: R() * 6.28, s: 0.95 + 0.1 * R() }));
  const BATH = [-12.5, -9, 9, 12.5].map((x) => ({ x: x + 0.9, z: -32.6, u: 0.1 + 0.2 * R(), ph: R() * 6.28 }));
  // splashes the swimmers had thrown up (flying on) and the crests' fingers
  const SPL = [];
  for (const S of SWIM) for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, sp = 0.3 + 1.4 * R(); SPL.push({ x: CX + S.u + Math.cos(a) * 0.3, z: CZ + S.w + Math.sin(a) * 0.3, v: [Math.cos(a) * sp * 0.6, 0.4 + 1.6 * R(), Math.sin(a) * sp * 0.6], r: 0.015 + 0.04 * R() * R() }); }
  const blobs = makeBlobs(scene, 2600);
  const SPLASH = [];
  const o = {};
  const P = {};
  return {
    SWIM, BATH, water, SPLASH,
    frame(t, crowd, idx0, poser) {
      // the water mesh
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
        const u = -HX + (2 * HX * i) / NX, w = -HZ + (2 * HZ * j) / NZ, k = (j * (NX + 1) + i) * 3;
        pos[k] = CX + u; pos[k + 1] = POOL.floor + poolH(u, w, t); pos[k + 2] = CZ + w;
      }
      for (const S of sideRuns) S.cells.forEach(([i, j], k) => {
        const src = (j * (NX + 1) + i) * 3, a = (S.start + k * 2) * 3;
        pos[a] = pos[src]; pos[a + 1] = Math.min(pos[src + 1], POOL.floor + POOL.wall - 0.01); pos[a + 2] = pos[src + 2];
        pos[a + 3] = pos[src]; pos[a + 4] = POOL.floor + 0.01; pos[a + 5] = pos[src + 2];
      });
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      // blobs: splashes flying on, fingers off the wave crests near each swimmer, the overflow sheet at the end
      blobs.begin();
      SPLASH.length = 0;
      for (const s of SPL) {
        const f = fly([s.x, Y0 + 0.05, s.z], s.v, t, o, POOL.floor + 0.5);
        if (!f.landed && t > 0) blobs.add(o.x, o.y, o.z, s.v[0], o.vy, s.v[2], s.r, s.r * 1.4);
      }
      for (const S of SWIM) for (let k = 0; k < 2; k++) {
        const u = S.u + Math.cos(S.ph + k * 2.1) * 0.5, w = S.w + Math.sin(S.ph + k * 2.1) * 0.35;
        const h = poolH(u, w, t), up = (0.25 + 0.2 * k) * Math.min(t, T_ON) * (t > T_ON ? Math.max(0, 1 - (t - T_ON) / 0.4) : 1);
        for (let q = 0; q <= 4; q++) blobs.add(CX + u, POOL.floor + h + up * q / 4, CZ + w, 0, 1, 0, 0.045 * (1 - 0.12 * q), Math.max(0.045, up / 8));
      }
      // the collapse slops over the glass front and off the roof's edge: a waterfall down the facade onto the square
      if (t > T_ON + 0.55) {
        for (let i = 0; i < 46; i++) {
          const u = -HX + 0.2 + (2 * HX - 0.4) * ((i * 0.618) % 1), sp = (i * 0.377) % 1;
          for (let k = 0; k < 44; k++) {
            const te = T_ON + 0.55 + k * 0.05 + 0.04 * sp;
            const age = t - te; if (age <= 0) break;
            // the pour thins out after a second and a half
            const flow = Math.max(0, 1 - (te - T_ON - 0.55) / 2.2);
            if (flow <= 0 || ((i * 7 + k * 3) % 10) / 10 > flow) continue;
            const y = POOL.floor + POOL.wall + 0.25 + 0.4 * age - 0.5 * G * age * age, z = POOL.z1 + 0.2 + 1.5 * age;
            if (y < 0.05) { if (y > -0.8) SPLASH.push([CX + u, z, age]); continue; }
            blobs.add(CX + u + 0.15 * Math.sin(k * 1.7 + i), y, z, 0, 0.4 - G * age, 1.5, (0.14 + 0.08 * sp) * flow + 0.05, 0.3 + G * age * 0.05);
          }
        }
      }
      blobs.end();
      // people
      SWIM.forEach((S, k) => {
        const h = poolH(S.u, S.w, t);
        const bob = 0.05 * Math.sin(t * 2.4 + S.ph);
        Object.assign(P, { x: CX + S.u, y: POOL.floor + h - 1.55 + bob, z: CZ + S.w, yaw: S.ph, s: S.s, pitch: 0.15 * Math.sin(t + S.ph), roll: 0, walk: 0, stride: 0, sit: 0, look: 0.3, armL: 1.3 + 0.4 * Math.sin(t * 1.7 + S.ph), armR: 1.3 + 0.4 * Math.sin(t * 1.5 + S.ph * 2), visible: true });
        poser(idx0 + k, P, t, S.ph, 'swim');
      });
      BATH.forEach((B, k) => {
        const f = fly([B.x, POOLB.h + 0.5, B.z], [0, B.u, 0], t, o, POOLB.h + 0.5);
        const lie = f.landed ? 1 : 1 - 0.6 * smooth(0, 3, t);
        Object.assign(P, { x: f.x, y: f.y - 0.45, z: f.z, yaw: Math.PI, s: 1, pitch: -1.45 * lie - 0.4 * (1 - lie), roll: 0.1 * Math.sin(t + B.ph), walk: 0, stride: 0, sit: 0, look: 0.2, armL: 0.4 + 0.9 * (1 - lie), armR: 0.4 + 0.9 * (1 - lie), visible: true });
        poser(idx0 + SWIM.length + k, P, t, B.ph, 'bath');
      });
    },
    count: 9,
  };
}
