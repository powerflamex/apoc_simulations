// The avenue you stand on at the first two stops (k 0 today, k 1 in 1912). You stand on the median (x 0); the road runs
// north-south (z), four lanes, sidewalks at |x| 9-14, buildings beyond. Today it rewinds: cars drive backward and turn
// into older cars (2010s -> 1950s -> 1910s), people walk backward, towers come down floor by floor to the brick
// blocks that stood here before them, the street lights turn into gas lamps. 1912 is dusk: gas lamps and windows lit.
import * as THREE from 'three';
import { makeFleet } from './cars.js';
import { makeOldFleet } from './oldcars.js';
import { makeCrowd, SKIN, HAIR } from './crowd.js';
import { HPY, JUMPS } from './timeline.js';
import { rng, smooth, clamp, lerp } from './util.js';

const R0 = rng(77);
// video time at which the rewind passes 'years' ago (today's counter: L = 5 + v * 0.94 / (JUMPS[0] - 0.28))
export const vOfYears = (y) => (Math.log10(y * HPY) - 5.0) / (0.94 / (JUMPS[0] - 0.28));

// ---------- buildings: instanced boxes with a facade shader (glass, concrete, brick, stone) ----------
const FAC = { uDusk: { value: 0 }, uTime: { value: 0 } };
function facadeMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FAC);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSt; varying vec4 vSt; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSt = aSt; vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uDusk; uniform float uTime; varying vec4 vSt; varying vec3 vWP; varying vec3 vWN;
        float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fMetal = 0.0, fRough = 0.85; vec3 fEm = vec3(0.0);
        {
          float style = vSt.x, seed = vSt.y, cut = vSt.z, topY = vSt.w;
          vec3 an = abs(vWN);
          float along = an.x > 0.5 ? vWP.z : vWP.x;
          bool roof = an.y > 0.5;
          vec3 base = lin(vColor.rgb);
          vec3 c = base;
          float fl = style < 1.5 ? 3.6 : 3.3;           // floor height
          float bay = style < 0.5 ? 1.6 : style < 1.5 ? 2.4 : 2.0;
          vec2 g = vec2(along / bay, vWP.y / fl);
          vec2 f = fract(g), id = floor(g);
          float ground = step(vWP.y, 4.2);
          if (!roof) {
            if (style < 0.5) {         // glass curtain wall: blue-grey glass, thin mullions, a sky reflection
              float mull = step(0.94, f.x) + step(0.9, f.y);
              c = mix(lin(vec3(0.32, 0.45, 0.58)) * (0.75 + 0.5 * fh(id + seed)), lin(vec3(0.75, 0.78, 0.8)), clamp(mull, 0.0, 1.0));
              fMetal = 0.6; fRough = 0.15;
            } else {
              float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.85);
              if (style > 2.5) win *= step(0.3, f.x) * step(f.x, 0.7);
              vec3 wall = base * (0.85 + 0.25 * fh(floor(vWP.xy * vec2(6.0, 12.0)) + seed));
              if (style > 1.5 && style < 2.5) {   // brick courses
                vec2 b = vec2(along * 4.0 + 0.5 * floor(vWP.y * 13.0), vWP.y * 13.0);
                wall *= mix(0.75, 1.0, smoothstep(0.0, 0.08, min(fract(b.x), fract(b.y))));
              }
              float lit = step(0.45 + 0.25 * (1.0 - uDusk), fh(id * 1.31 + seed));
              vec3 glass = mix(lin(vec3(0.12, 0.14, 0.17)), lin(vec3(1.0, 0.72, 0.38)) * 2.2, lit * uDusk);
              c = mix(wall, glass, win);
              fEm = lin(vec3(1.0, 0.68, 0.34)) * 2.4 * win * lit * uDusk;
              fRough = mix(0.9, 0.2, win);
              // shopfronts at street level
              if (ground > 0.5 && vWP.y > 0.4 && vWP.y < 3.4 && fract(along / 5.0) > 0.12) {
                c = mix(lin(vec3(0.1, 0.1, 0.11)), lin(vec3(1.0, 0.8, 0.5)) * 1.5, uDusk * 0.7); fEm = lin(vec3(1.0, 0.75, 0.45)) * 1.6 * uDusk; fRough = 0.2;
              }
              // a cornice under the roof line
              if (style > 1.5 && vWP.y > topY - 0.9) c = base * 0.7;
            }
          } else c = base * 0.55;
          // being taken down: a bright cut edge at the top
          fEm += vec3(1.0, 0.9, 0.7) * 3.0 * cut * smoothstep(topY - 0.6, topY, vWP.y);
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEm;');
  };
  m.customProgramCacheKey = () => 'bt-facade';
  m.vertexColors = false;
  return m;
}

export function makeStreet(scene, ctx) {
  const today = new THREE.Group(), old = new THREE.Group(), both = new THREE.Group();
  scene.add(today, old, both);

  // ---- the lots: along both sides from behind you to far up the avenue; each has a 1912 building and maybe a newer one
  const lots = [];
  const R = rng(5);
  for (const side of [-1, 1]) {
    let z = 40;
    while (z > -420) {
      const w = 14 + R() * 18;
      const d = 16 + R() * 10;
      const oldH = 10 + Math.floor(R() * 4) * 3.4 + (R() < 0.12 ? 18 + R() * 20 : 0);
      const oldStyle = R() < 0.75 ? 2 : 3;
      const modern = R() < 0.62;
      const tall = modern && R() < 0.55;
      const newH = modern ? (tall ? 60 + R() * 120 : 25 + R() * 30) * (z < -150 ? 1.2 : 1) : oldH;
      const newStyle = modern ? (tall ? 0 : 1) : oldStyle;
      const built = modern ? (tall ? 4 + R() * 45 : 50 + R() * 40) : 1e9;         // years ago it went up
      const oc = oldStyle === 2 ? [0x8a4a34, 0x9a5a3c, 0x6e3a2a, 0xa8705a][Math.floor(R() * 4)] : [0xc8bca4, 0xb0a890, 0xd8ccb4][Math.floor(R() * 3)];
      const nc = newStyle === 0 ? 0x6a7c8c : [0xb8b4aa, 0xa8a8a4, 0xd0c8b8][Math.floor(R() * 3)];
      lots.push({ x: side * (14.5 + d / 2), z: z - w / 2, w: w - 0.6, d, oldH, oldStyle, newH, newStyle, built, oc, nc, seed: R() * 50 });
      z -= w;
    }
  }
  // the skyline further up the avenue (towers that come down first)
  for (let i = 0; i < 40; i++) {
    const x = (R() - 0.5) * 260, z = -460 - R() * 500;
    const old = 14 + R() * 30;
    const tall = R() < 0.7;
    lots.push({ x, z, w: 24 + R() * 26, d: 24 + R() * 26, oldH: old, oldStyle: R() < 0.5 ? 2 : 3, newH: tall ? 90 + R() * 220 : old, newStyle: tall ? (R() < 0.7 ? 0 : 1) : 2, built: tall ? 3 + R() * 50 : 1e9, oc: 0x8a5a44, nc: R() < 0.5 ? 0x5a6e80 : 0x8a9098, seed: R() * 50 });
  }
  for (const L of lots) L.vDown = vOfYears(L.built);
  const N = lots.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const aSt = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  geo.setAttribute('aSt', aSt);
  const bmesh = new THREE.InstancedMesh(geo, facadeMat(), N);
  bmesh.castShadow = true; bmesh.receiveShadow = true; bmesh.frustumCulled = false;
  both.add(bmesh);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();

  // ---- street furniture: today's light poles and the gas lamps (both sides, every 24 m) ----
  const poles = [], gas = [];
  for (const sx of [-1, 1]) for (let z = 20; z > -300; z -= 24) { poles.push([sx * 9.6, z]); gas.push([sx * 9.5, z + 6]); }
  const poleG = new THREE.CylinderGeometry(0.09, 0.13, 8.5, 8).translate(0, 4.25, 0);
  const armG = new THREE.BoxGeometry(2.0, 0.1, 0.18).translate(-1.0, 8.4, 0);
  const headG = new THREE.BoxGeometry(0.7, 0.14, 0.32).translate(-1.9, 8.32, 0);
  const pm = ctx.plainMat(0x5a5e62, 0.5, { metalness: 0.4 });
  const mkI = (g, m, n, grp) => { const im = new THREE.InstancedMesh(g, m, n); im.castShadow = true; im.frustumCulled = false; grp.add(im); return im; };
  const poleI = mkI(poleG, pm, poles.length, today), armI = mkI(armG, pm, poles.length, today), headI = mkI(headG, ctx.plainMat(0xdfe6ea, 0.3), poles.length, today);
  poles.forEach(([x, z], i) => { m4.makeRotationY(x > 0 ? 0 : Math.PI).setPosition(x, 0, z); for (const im of [poleI, armI, headI]) im.setMatrixAt(i, m4); });
  const gpost = new THREE.CylinderGeometry(0.07, 0.12, 3.6, 8).translate(0, 1.8, 0);
  const gbox = new THREE.CylinderGeometry(0.26, 0.15, 0.55, 6).translate(0, 3.9, 0);
  const gcap = new THREE.ConeGeometry(0.3, 0.3, 6).translate(0, 4.3, 0);
  const gm = ctx.plainMat(0x1c2a22, 0.6, { metalness: 0.3 });
  const gpI = mkI(gpost, gm, gas.length, old), gcI = mkI(gcap, gm, gas.length, old);
  const gbI = mkI(gbox, new THREE.MeshStandardMaterial({ color: 0xffd59a, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.3 }), gas.length, old);
  gas.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); for (const im of [gpI, gbI, gcI]) im.setMatrixAt(i, m4); });

  // ---- the cars today: 4 lanes, driving BACKWARD (rewind). Lanes x>0 head north (-z) normally; x<0 south. ----
  const CARS = [];
  const lanes = [[-6.6, 1], [-3.0, 1], [3.0, -1], [6.6, -1]];   // [x, normal direction of travel in z]
  for (const [x, dir] of lanes) for (let k = 0; k < 9; k++) {
    CARS.push({ x, dir, z0: -6 - k * 24 - R0() * 10 + (x > 0 ? 8 : 0), kind: Math.floor(R0() * 4), c: [0xf2f2f0, 0x1a1c20, 0xa8acb0, 0x7a1a1a, 0x2a4a7a, 0xd8d4c8, 0x3a3e44][Math.floor(R0() * 7)],
      c50: [0xd84a4a, 0x7ab8c8, 0xf0d8a0, 0x4a8a6a, 0xe88aa0, 0xf4f0e0][Math.floor(R0() * 6)], sp: 11 + R0() * 4, v50: vOfYears(36 + R0() * 10), vT: vOfYears(82 + R0() * 12) });
  }
  const fleet = makeFleet(today, CARS.length, ctx);
  const f50 = makeOldFleet(today, CARS.length, ctx, '50s');
  const fT = makeOldFleet(today, CARS.length + 4, ctx, 'T');
  CARS.forEach((c, i) => { fleet.color(i, c.c, c.kind); f50.color(i, c.c50); });
  // 1912: two Model Ts creeping along with the carts
  const T1912 = [[3.0, -1, -38, 2.5], [6.6, -1, -75, 3.2], [-3.0, 1, -120, 3.0], [-6.6, 1, -24, 2.2]];
  const fTold = makeOldFleet(old, T1912.length, ctx, 'T');

  // ---- people: today (bright clothes, walking backward) and 1912 (dark coats, long dresses, hats) ----
  const pm2 = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const crowdNow = makeCrowd(today, 70, pm2);
  const crowdOld = makeCrowd(old, 64, pm2);
  const PEOPLE = { now: [], old: [] };
  const rr = rng(9);
  // around you on the median (close to the camera, in frame), then the sidewalks
  const near = [[-0.9, -2.2, 0.3], [0.8, -3.4, -0.4], [-0.5, -5.5, 0.1], [0.4, -8.2, 0.2], [-0.7, -11, 0], [0.6, -14.5, 0], [-1.6, 1.0, 0.6], [1.9, -1.0, -0.8]];
  for (const [x, z, yaw] of near) PEOPLE.now.push({ x, z, yaw: Math.PI + yaw, walk: 0, sp: 0, phone: rr() < 0.6 });
  for (let i = PEOPLE.now.length; i < 70; i++) {
    const sd = rr() < 0.5 ? -1 : 1;
    PEOPLE.now.push({ x: sd * (10 + rr() * 3.5), z: 20 - rr() * 200, yaw: rr() < 0.5 ? 0 : Math.PI, walk: rr() * 6, sp: 1.2 + rr() * 0.5, phone: rr() < 0.3 });
  }
  const shirtsNow = [0xe04848, 0x2a6ad0, 0xf0c030, 0x20a070, 0xf2f2f2, 0x1a1a1a, 0xe07a30, 0x8a4ad0, 0x40b0e0];
  PEOPLE.now.forEach((p, i) => crowdNow.color(i, shirtsNow[i % shirtsNow.length], [0x2a3a5a, 0x1a1a1a, 0x6a6a6a, 0xb8a888][i % 4], SKIN[i % SKIN.length], HAIR[i % HAIR.length]));
  // 1912: a ring of people round you staring (they turn to you), others on the sidewalks
  const nearOld = [[-2.4, -3.2], [2.2, -4.6], [-3.4, -1.0], [3.6, -0.6], [-1.6, -7.5], [2.8, -9.5], [-4.2, -6.0], [4.6, -3.0], [-5.8, -11], [5.4, -12]];
  for (const [x, z] of nearOld) PEOPLE.old.push({ x, z, stare: 1, sp: 0, walk: 0 });
  for (let i = PEOPLE.old.length; i < 64; i++) {
    const sd = rr() < 0.5 ? -1 : 1;
    PEOPLE.old.push({ x: sd * (10 + rr() * 3.5), z: 15 - rr() * 160, yaw: rr() < 0.5 ? 0 : Math.PI, walk: rr() * 6, sp: rr() < 0.4 ? 0 : 1.1 + rr() * 0.3, stare: rr() < 0.4 ? 0.6 : 0 });
  }
  const coats = [0x1a1a1e, 0x2a2420, 0x3a3428, 0x22262e, 0x4a3a2a, 0x5a4a3a, 0x2e2e2e];
  const dresses = [0x2a2440, 0x5a2a2a, 0x3a4a3a, 0x6a5a4a, 0x1e1e2a];
  PEOPLE.old.forEach((p, i) => { p.woman = i % 3 === 1; const c = p.woman ? dresses[i % dresses.length] : coats[i % coats.length]; crowdOld.color(i, c, p.woman ? c : 0x1e1c1a, SKIN[i % 3], HAIR[i % HAIR.length]); p.hat = p.woman ? 2 : i % 2; });
  // hats (bowler, flat cap, a wide hat with a ribbon) and long skirts for the 1912 crowd
  const hatG = [
    new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 1.1, 1.1).translate(0, 0.02, 0),
    new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12).translate(0, 0.03, 0.02),
    new THREE.CylinderGeometry(0.11, 0.13, 0.12, 12).translate(0, 0.07, 0),
  ];
  const brimG = [new THREE.CylinderGeometry(0.17, 0.17, 0.015, 14), new THREE.BoxGeometry(0.2, 0.015, 0.12).translate(0, 0, 0.12), new THREE.CylinderGeometry(0.27, 0.27, 0.015, 16)];
  const hatM = ctx.plainMat(0x161412, 0.7), hatW = ctx.plainMat(0x6a5040, 0.8);
  const hats = hatG.map((g, i) => mkI(g, i === 2 ? hatW : hatM, 64, old)), brims = brimG.map((g, i) => mkI(g, i === 2 ? hatW : hatM, 64, old));
  const skirt = mkI(new THREE.ConeGeometry(0.34, 0.98, 12, 1, true).translate(0, 0.49, 0), ctx.plainMat(0x2a2440, 0.9, { side: THREE.DoubleSide }), 64, old);
  PEOPLE.old.forEach((p, i) => skirt.setColorAt(i, col.set(p.woman ? dresses[i % dresses.length] : 0x000000)));

  const zero = new THREE.Matrix4().makeScale(0, 0, 0), q = new THREE.Quaternion(), e = new THREE.Euler(), vv = new THREE.Vector3(), sc = new THREE.Vector3();
  const wrapZ = (z) => { const L = 260; let t = ((z - 40) % L + L) % L; return 40 - t; };

  return {
    today, old, both, lots, CARS, PEOPLE, vOfYears,
    frame(k, v, s, glows, wagonX) {
      today.visible = k === 0; old.visible = k === 1; both.visible = k <= 1;
      if (k > 1) return;
      FAC.uDusk.value = k === 1 ? 1 : 0;
      // buildings
      lots.forEach((L, i) => {
        let h = L.oldH, style = L.oldStyle, c = L.oc, cut = 0;
        if (k === 0) {
          const d = smooth(L.vDown - 0.3, L.vDown + 0.35, v);
          if (d < 1) {
            const fl = L.newStyle === 0 ? 3.6 : 3.3;
            h = L.oldH + Math.ceil((L.newH - L.oldH) * (1 - d) / fl) * fl * (L.newH > L.oldH ? 1 : 0);
            if (L.newH <= L.oldH) h = L.oldH;
            style = L.newStyle; c = L.nc; cut = d > 0 && d < 1 ? 1 : 0;
            if (d > 0.98) { style = L.oldStyle; c = L.oc; }
          }
        }
        m4.compose(vv.set(L.x, 0, L.z), q.identity(), sc.set(L.d, h, L.w));
        bmesh.setMatrixAt(i, m4);
        bmesh.setColorAt(i, col.set(c));
        aSt.setXYZW(i, style, L.seed, cut, h);
      });
      bmesh.instanceMatrix.needsUpdate = true; bmesh.instanceColor.needsUpdate = true; aSt.needsUpdate = true;
      if (k === 0) {
        CARS.forEach((c, i) => {
          // rewinding: they move opposite to their direction of travel, front still facing it
          const z = wrapZ(c.z0 - c.dir * c.sp * v);
          const yaw = c.dir > 0 ? Math.PI : 0;          // cars.js: front at -z
          m4.compose(vv.set(c.x, 0, z), q.setFromEuler(e.set(0, yaw, 0)), sc.set(1, 1, 1));
          const era = v < c.v50 ? 0 : v < c.vT ? 1 : 2;
          fleet.set(i, era === 0 ? m4 : zero, true);
          f50.set(i, era === 1 ? m4 : null);
          fT.set(i, era === 2 ? m4 : null);
          // the change: a flash where the car is
          for (const vc of [c.v50, c.vT]) { const d = v - vc; if (d > -0.05 && d < 0.25) glows.add(c.x, 1.0, z, 3.5 * (1 - d / 0.25), 3, 3, 3.2); }
        });
        fleet.commit(); f50.commit(); fT.commit();
        PEOPLE.now.forEach((p, i) => {
          const z = p.sp ? wrapZ(p.z - Math.cos(p.yaw) * p.sp * v * 1.6) : p.z;
          crowdNow.pose(i, { x: p.x, y: 0, z, yaw: p.yaw, walk: -(p.walk + v * 7 * (p.sp ? 1 : 0)), stride: p.sp ? 1 : 0, armR: p.phone ? 1 : 0, look: p.sp ? 0 : 0.15 });
        });
        crowdNow.commit();
        poleI.visible = armI.visible = headI.visible = true;
      } else {
        T1912.forEach(([x, dir, z0, sp], i) => {
          const z = z0 + dir * sp * (v - JUMPS[0]);
          m4.compose(vv.set(x, 0, z), q.setFromEuler(e.set(0, dir > 0 ? Math.PI : 0, 0)), sc.set(1, 1, 1));
          fTold.set(i, m4);
        });
        fTold.commit();
        PEOPLE.old.forEach((p, i) => {
          let x = p.x, z = p.z, yaw = p.yaw ?? 0, walk = 0, stride = 0, armR = 0;
          if (p.sp) { z = wrapZ(p.z + Math.cos(p.yaw) * p.sp * v); walk = p.walk + v * 6; stride = 1; }
          if (p.stare) {
            yaw = Math.atan2(x, z) + Math.PI;
            // the ones near the wagon's lane step back out of its way
            const dodge = smooth(8.6, 9.4, v) * (Math.abs(x) < 3.5 && z > -12 ? 1 : 0);
            x += Math.sign(x || 1) * 2.2 * dodge;
            armR = i % 4 === 0 ? smooth(6.0, 6.6, v) * (1 - dodge) : 0;
            stride = dodge > 0 && dodge < 1 ? 1.4 : 0; walk = v * 9;
          }
          crowdOld.pose(i, { x, y: 0, z, yaw, walk, stride, armR, look: p.stare ? 0.1 : 0 });
          const s1 = 1;
          for (let h = 0; h < 3; h++) {
            const on = p.hat === h;
            m4.compose(vv.set(x, 1.73 * s1, z), q.setFromEuler(e.set(0, yaw, 0)), sc.set(1, 1, 1));
            hats[h].setMatrixAt(i, on ? m4 : zero);
            m4.compose(vv.set(x, 1.735 * s1, z), q, sc.set(1, 1, 1));
            brims[h].setMatrixAt(i, on ? m4 : zero);
          }
          m4.compose(vv.set(x, 0.0, z), q.setFromEuler(e.set(0, yaw, 0)), sc.set(1, 1, 1));
          skirt.setMatrixAt(i, p.woman ? m4 : zero);
        });
        crowdOld.commit();
        for (const im of [...hats, ...brims, skirt]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
        for (const [x, z] of gas) glows.add(x, 3.9, z, 1.6, 2.6, 1.6, 0.6);
      }
    },
  };
}
