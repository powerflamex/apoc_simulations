// The crater: the pit's wall (one lathe mesh round the lake, 400 m on your side, lower across; the bottom undercut by
// the lava so it overhangs), the ground round the rim falling away down the volcano's flanks, the rock spur the
// tourists stand on beside you, the slab under your feet that gives way, the rocks that fall with you, and the ring of
// phone and head-torch lights round the rim. The wall and ground share one shader: old lava layers, sulfur stains,
// lit from below by the lake (a disc's view factor) and from above by the dusk sky and the glowing plume.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { RIM, RIM_R, LAKE_R, wallR, YOU_R, G, T_FALL } from './timeline.js';
import { rng, smooth, clamp } from './util.js';

const TAU = Math.PI * 2;
const YOUA = Math.PI / 2;            // your side: +z
// cheap smooth 1D/2D noise on the CPU
const hs = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const sn1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hs(i) * (1 - u) + hs(i + 1) * u; };
const sn2 = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), w = g * g * (3 - 2 * g);
  const h = (a, b) => hs(a * 57.13 + b * 113.7);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - w) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * w;
};
const dAng = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
// how close an angle is to your spot (1 there, 0 more than ~10 m along the rim away)
const nearYou = (a) => Math.exp(-Math.pow(dAng(a, YOUA) / 0.075, 2));

// the rim's height: 400 m on your side, 350 m across, a little ragged
export const rimY = (a) => 375 + 25 * Math.sin(a) + 4 * (sn1(a * 9 + 3) - 0.5 + 0.6 * (sn1(a * 23 + 7) - 0.5)) * (1 - nearYou(a));
// the wall's radius at angle a, height y: the overhanging profile plus big ragged buttresses (always outward near you)
export function wallAt(a, y) {
  const n = (sn2(a * 14, y / 45) - 0.45) * 7 + (sn2(a * 45 + 9, y / 14) - 0.5) * 2.4;
  const ny = nearYou(a);
  // (by you the rim is cut back to 121.5 m and the lip you stand on sticks out over the drop)
  return wallR(y) + n * (1 - ny) + ny * (1.5 + 0.15 * Math.abs(n));
}

function rockShader(U, isGround) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uLake, uBlur, uCamY, uFogD, uT, uHotFoot;
      uniform vec3 uSky, uPlume, uFogC; uniform vec4 uPL[4]; uniform vec3 uPLc[4];
      varying vec3 vW; varying vec3 vN;
      ${NOISE}
      void main() {
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        vec3 P = vW;
        float px = length(fwidth(P));
        // the wall streaming past you: the pattern stretched along y round your height
        vec3 Q = vec3(P.x, uCamY + (P.y - uCamY) / (1.0 + uBlur), P.z);
        float pxq = px / (1.0 + 0.3 * uBlur);
        float n1 = fbmA(Q * 0.035, pxq * 0.035, 0.0);
        float n2 = fbmA(Q * 0.5 + 3.1, pxq * 0.5, 0.0);
        float n3 = fbmA(Q * 3.0 - 1.7, pxq * 3.0, 0.0);
        vec3 alb;
        ${isGround ? `
        // ash and broken lava round the rim, darker scoria, lighter dust on the path
        alb = mix(vec3(0.09, 0.085, 0.08), vec3(0.2, 0.17, 0.14), smoothstep(0.35, 0.7, n1));
        alb *= 0.55 + 0.9 * n2 * (0.6 + 0.6 * n3);
        alb = mix(alb, vec3(0.42, 0.37, 0.13), smoothstep(0.7, 0.85, n2) * 0.35);
        ` : `
        // layers of old lava flows: dark basalt, red-brown scoria, grey ash; yellow sulfur stains near the top
        float lay = Q.y * 0.07 + 2.5 * n1 + 0.6 * n2;
        float bnd = vnoise(vec3(lay, 0.5, 0.5) * 1.0);
        alb = mix(vec3(0.045, 0.042, 0.04), vec3(0.16, 0.08, 0.05), smoothstep(0.45, 0.75, bnd));
        alb = mix(alb, vec3(0.2, 0.19, 0.18), smoothstep(0.78, 0.92, vnoise(vec3(lay * 1.7, 2.0, 1.0))) * 0.7);
        alb *= 0.5 + 0.9 * n2 * (0.55 + 0.7 * n3);
        alb = mix(alb, vec3(0.5, 0.44, 0.12), smoothstep(0.66, 0.8, n2) * smoothstep(260.0, 380.0, P.y) * 0.55);
        `}
        // light from the lake below (a disc's view factor from this height), strongest on faces turned to it
        float y = max(P.y, 0.5);
        float E = 0.5 * (1.0 - y / sqrt(y * y + ${(LAKE_R * LAKE_R).toFixed(1)}));
        vec3 toL = normalize(vec3(-P.x * 0.6, -y, -P.z * 0.6));
        float f = clamp(dot(N, toL) * 0.75 + 0.25, 0.0, 1.0);
        vec3 light = vec3(1.0, 0.2, 0.04) * uLake * E * f * 12.0;
        // the dusk sky and the plume's orange underside from above
        float upF = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        float open = smoothstep(180.0, 390.0, P.y);
        light += (uSky + uPlume) * upF * (0.25 + 0.75 * open);
        for (int i = 0; i < 4; i++) {
          vec3 d = uPL[i].xyz - P; float dd = dot(d, d);
          light += uPLc[i] * uPL[i].w * max(dot(N, normalize(d)), 0.0) / (1.0 + dd);
        }
        vec3 col = alb * light;
        ${isGround ? '' : `
        // the foot of the wall, red-hot where the lava eats it; a few glowing cracks low down
        float foot = smoothstep(7.0 + 3.0 * n2, 0.0, P.y);
        col += vec3(1.0, 0.12, 0.01) * foot * 2.2 * uHotFoot;
        float crk = smoothstep(0.93, 0.985, vnoise(vec3(Q.x * 0.9, Q.y * 0.08, Q.z * 0.9)) * (0.7 + 0.3 * n3));
        col += vec3(1.0, 0.1, 0.008) * crk * smoothstep(45.0, 0.0, P.y) * 1.4 * uHotFoot;
        `}
        float dist = length(P - cameraPosition);
        float inPit = smoothstep(${(RIM + 20).toFixed(1)}, ${(RIM - 40).toFixed(1)}, P.y);
        float fog = 1.0 - exp(-uFogD * dist * (0.4 + 0.6 * inPit));
        col = mix(col, uFogC, fog);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function makeCrater() {
  const group = new THREE.Group();
  const U = {
    uLake: { value: 1 }, uBlur: { value: 0 }, uCamY: { value: 400 }, uFogD: { value: 0.0015 }, uT: { value: 0 }, uHotFoot: { value: 1 },
    uSky: { value: new THREE.Color(0.05, 0.07, 0.13) }, uPlume: { value: new THREE.Color(0.08, 0.03, 0.01) }, uFogC: { value: new THREE.Color(0.2, 0.06, 0.02) },
    uPL: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
    uPLc: { value: Array.from({ length: 4 }, () => new THREE.Color(1, 0.4, 0.1)) },
  };

  // ---- the wall ----
  const NA = 420, NY = 110;
  {
    const pos = [], idx = [];
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * TAU;
      const top = rimY(a);
      for (let j = 0; j <= NY; j++) {
        // rows closer together near the bottom and the top
        const k = j / NY, kk = 0.5 - 0.5 * Math.cos(Math.PI * k);
        const y = -4 + (top + 4) * (0.35 * k + 0.65 * kk);
        const r = wallAt(a, y);
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NY; j++) {
      const a = i * (NY + 1) + j, b = a + NY + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockShader(U, false));
    m.frustumCulled = false;
    group.add(m);
  }
  // ---- the ground round the rim: flat near the edge, then the volcano's flanks falling away ----
  {
    const RS = [0, 0.4, 1, 2, 3.5, 6, 10, 16, 25, 40, 70, 120, 220, 400, 800, 1600, 3000];
    const pos = [], idx = [];
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * TAU;
      const top = rimY(a), r0 = wallAt(a, top);
      for (const d of RS) {
        const r = r0 + d;
        const drop = d < 25 ? 0 : Math.pow(d - 25, 1.0) * 0.42;
        const bump = (sn2(a * 60, d * 0.3) - 0.5) * Math.min(d, 6) * 0.08;
        pos.push(Math.cos(a) * r, top - drop + bump - Math.min(d, 1) * 0.08, Math.sin(a) * r);
      }
    }
    const NR = RS.length;
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR - 1; j++) {
      const a = i * NR + j, b = a + NR;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockShader(U, true));
    m.frustumCulled = false;
    group.add(m);
  }

  // ---- the spur the tourists stand on (to your left) and the slab under you ----
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9490, roughness: 0.95, metalness: 0, vertexColors: true });
  const lumpy = (geo, amp, seed, taper = 0) => {
    const p = geo.attributes.position, cols = [];
    const box = new THREE.Box3().setFromBufferAttribute(p);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = sn2(x * 0.9 + seed, z * 0.9 + y * 0.7) - 0.5, n2 = sn2(x * 3.1 - seed, z * 2.7 + y * 2.9) - 0.5;
      const ky = (y - box.min.y) / (box.max.y - box.min.y);
      const t = 1 - taper * (1 - ky);
      p.setXYZ(i, x * t + n * amp, y + n2 * amp * 0.6 * (ky > 0.95 ? 0.4 : 1), z + n * amp * 0.7);
      const c = 0.55 + 0.6 * (n2 + 0.5);
      cols.push(0.2 * c, 0.18 * c, 0.17 * c);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const spur = new THREE.Mesh(lumpy(new THREE.BoxGeometry(2.7, 3.2, 15, 8, 6, 30).translate(0, -1.6, 0), 0.3, 4, 0.85), rockMat);
  spur.position.set(-3.0, 399.75, 115.6);
  spur.rotation.y = 0.06;
  group.add(spur);
  const slabGeo = lumpy(new THREE.BoxGeometry(1.7, 0.9, 1.5, 6, 4, 6).translate(0, -0.45, 0), 0.06, 9, 0.2);
  const slab = new THREE.Mesh(slabGeo, rockMat);
  group.add(slab);

  // ---- the rocks that fall with you: big ones drop faster (ahead, below you), pebbles slower (above you) ----
  const R = rng(77);
  const rocks = [];
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  lumpy(rockGeo, 0.18, 2);
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, 48);
  rockMesh.frustumCulled = false;
  group.add(rockMesh);
  const fallTable = (vt) => {
    const out = []; let x = 0, u = 0; const dt = 1 / 200;
    while (x < RIM + 10) { out.push(x); u += G * (1 - (u / vt) ** 2) * dt; x += u * dt; }
    return out;
  };
  const tables = {};
  for (let i = 0; i < 48; i++) {
    const big = i < 14, peb = i >= 30;
    const size = big ? 0.2 + R() * 0.32 : peb ? 0.03 + R() * 0.06 : 0.08 + R() * 0.14;
    const vt = big ? 85 + R() * 40 : peb ? 18 + R() * 12 : 45 + R() * 20;
    const key = Math.round(vt);
    tables[key] ??= fallTable(key);
    const T0 = big ? T_FALL - 0.3 + R() * 0.8 : peb ? -0.7 + R() * 3.2 : T_FALL + R() * 1.5;
    const a = YOUA + (R() - 0.5) * (peb ? 0.03 : 0.025);
    const r0 = YOU_R - 0.4 - R() * 0.8;
    rocks.push({ size, tab: tables[key], T0, a: a + (big ? (R() - 0.5) * 0.08 : 0), r0, out: big ? 5 + R() * 12 : peb ? 0.5 + R() * 2 : 2 + R() * 6, y0: RIM - 0.5 - size - R() * 0.4, spin: [R() * 4 - 2, R() * 4 - 2, R() * 4 - 2], ph: R() * 6 });
  }
  for (const k of rocks) {
    let n = 0; while (n < k.tab.length - 1 && k.tab[n] < k.y0) n++;
    k.tLand = k.T0 + n / 200;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  function rockAt(k, T, out) {
    const dt = T - k.T0;
    let drop = 0;
    if (dt > 0) { const f = dt * 200, i = Math.min(Math.floor(f), k.tab.length - 2); drop = k.tab[i] + (k.tab[i + 1] - k.tab[i]) * (f - i); }
    const y = k.y0 - drop;
    const r = k.r0 - k.out * smooth(0, 3, dt);
    return out.set(Math.cos(k.a) * r, Math.max(y, -k.size * 0.6), Math.sin(k.a) * r);
  }

  // ---- the ring of lights round the rim (phones, head torches) ----
  const lightGeo = new THREE.SphereGeometry(1, 8, 6);
  const NL = 117;
  const lights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), NL);
  lights.frustumCulled = false;
  const LR = rng(5);
  const lightSpecs = [];
  for (let i = 0; i < NL - 7; i++) {
    // clustered: groups of tourists at viewpoints round the rim, most on your side and across
    const grp = Math.floor(LR() * 9);
    const a = [YOUA, YOUA + 0.12, YOUA - 0.1, YOUA + 0.3, YOUA - 0.35, -YOUA, -YOUA + 0.2, -YOUA - 0.25, 0.4][grp] + (LR() - 0.5) * 0.06;
    if (Math.abs(dAng(a, YOUA)) < 0.03 && LR() < 0.7) { i--; continue; }
    const top = rimY(a), r = wallAt(a, top) + 0.6 + LR() * 2.5;
    lightSpecs.push({ x: Math.cos(a) * r, y: top + 1.2 + LR() * 0.5, z: Math.sin(a) * r, ph: LR() * 10, warm: LR() < 0.3 });
  }
  // phones held out over the spur's edge, pointing down at you (seen from below)
  for (let i = 0; i < 7; i++) lightSpecs.push({ x: -1.35 - LR() * 0.3, y: 400.6 + LR() * 0.6, z: 110.5 + i * 1.15 + LR() * 0.4, ph: LR() * 10, warm: false, late: 2.5 + LR() });
  lightSpecs.forEach((l, i) => lights.setColorAt(i, new THREE.Color(l.warm ? 0xffd9a8 : 0xffffff).multiplyScalar(14)));
  group.add(lights);

  function update(T, v, you) {
    U.uT.value = T;
    // the slab: it tilts forward and slides from T = -0.6, then falls ahead of you
    const k = clamp((T + 0.6) / (T_FALL + 0.6));
    const tilt = 0.38 * k * k;
    if (T < T_FALL) {
      slab.position.set(0, RIM - 0.55 * k * k, YOU_R + 0.15 - 0.35 * k * k);
      slab.rotation.set(-tilt, 0.02, 0.03 * k);
    } else {
      const dt = T - T_FALL;
      const tab = (tables[110] ??= fallTable(110));
      const f = Math.min(dt * 200, tab.length - 2), i = Math.floor(f);
      const drop = tab[i] + (tab[i + 1] - tab[i]) * (f - i);
      slab.position.set(0.2 * dt, Math.max(RIM - 0.55 - drop, -0.5), YOU_R + 0.15 - 0.35 - 1.1 * smooth(0, 2.5, dt));
      slab.rotation.set(-tilt - 0.9 * dt, 0.02 + 0.3 * dt, 0.03 + 0.5 * dt);
    }
    slab.visible = T < 9.5;
    rocks.forEach((rk, i) => {
      const p = rockAt(rk, T, pv);
      const dt = Math.max(0, T - rk.T0);
      e.set(rk.ph + rk.spin[0] * dt, rk.spin[1] * dt, rk.spin[2] * dt); q.setFromEuler(e);
      const gone = T > rk.tLand || T < rk.T0;     // (gone into the lava the moment it lands)
      m4.compose(p, q, sv.setScalar(gone ? 0 : rk.size));
      rockMesh.setMatrixAt(i, m4);
    });
    rockMesh.instanceMatrix.needsUpdate = true;
    lightSpecs.forEach((l, i) => {
      // a few turn on and wave about once you fall
      const tw = 0.9 + 0.1 * Math.sin(v * 3 + l.ph);
      m4.compose(pv.set(l.x, l.y, l.z), q.identity(), sv.setScalar(0.11 * tw * (l.late ? smooth(l.late, l.late + 0.5, T) : 1)));
      lights.setMatrixAt(i, m4);
    });
    lights.instanceMatrix.needsUpdate = true;
  }
  return { group, U, update, rocks, slab, spur, rockMesh, lights };
}
