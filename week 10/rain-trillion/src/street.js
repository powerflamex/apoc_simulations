// The flooded avenue up close, the first seconds:
//   - a flood-depth gauge beside you (white board, feet marked 1-7): the water climbs it from 2 ft to 3 ft by 0:03
//   - junk floating up the avenue in the current (bins, bags, cones, boxes, pallets, coolers, balls)
//   - water pouring off the roof edges (overflowing gutters), off the shop awnings, and gushing from the drainpipes;
//     each fall ends at the water line, so they shorten as the water rises
//   - the rain splashing on every surface: the water, the car roofs, the bus roof, the awnings, your hood
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, SIGNS, WALK, ROAD, YOU0 } from './layout.js';
import { drownMat } from './drown.js';
import { rng } from './util.js';

export const GAUGE = { x: 3.7, z: 3.4 };
const FT = 0.3048;

export function makeStreet(scene) {
  const group = [];
  const add = (m) => { m.frustumCulled = false; scene.add(m); group.push(m); return m; };
  const P = (c, r = 0.7, extra = {}) => drownMat(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra }));
  const R = rng(5150);

  // ---- the gauge ----
  {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 1024;
    const g = cv.getContext('2d');
    const H = 2.25;                                    // board height (m), from the street up
    const py = (m) => 1024 - (m / H) * 1024;
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 128, 1024);
    g.fillStyle = '#c81e1e'; g.fillRect(0, 0, 128, py(7 * FT) + 4);
    g.fillStyle = '#111';
    for (let i = 1; i <= 7; i++) {
      for (let k = 0; k < 10; k++) { const y = py((i - 1 + k / 10) * FT); g.fillRect(0, y - 2, k === 5 ? 46 : 30, 4); }
      const y = py(i * FT);
      g.fillRect(0, y - 4, 128, 8);
      g.font = 'bold 82px Arial'; g.textAlign = 'right'; g.textBaseline = 'top';
      if (i < 7) g.fillText(String(i), 122, y + 8);
    }
    g.fillStyle = '#fff'; g.font = 'bold 48px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FT', 64, py(7 * FT) / 2 + 2);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.3, H).translate(0, H / 2, 0.035), P(0xffffff, 0.5, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.06).translate(0, 1.3, 0), P(0x4a4d52, 0.4, { metalness: 0.5 }));
    const gg = new THREE.Group(); gg.add(board, post);
    gg.position.set(GAUGE.x, 0, GAUGE.z); gg.rotation.y = 0.25;      // turned to face up the camera's way
    scene.add(gg); group.push(gg);
    gg.traverse((o) => { o.frustumCulled = false; });
  }

  // ---- floating junk ----
  const TYPES = [
    { g: new THREE.SphereGeometry(0.32, 10, 8).scale(1.1, 0.75, 0.9), c: [0x151515, 0x1d1f22], sink: 0.12 },              // bin bag
    { g: mergeGeometries([new THREE.BoxGeometry(0.62, 0.95, 0.72), new THREE.BoxGeometry(0.66, 0.06, 0.78).translate(0, 0.5, 0.02)]).rotateZ(1.45), c: [0x2f6a34, 0x3a3e44, 0x1f4a8a], sink: 0.12 },   // wheelie bin on its side
    { g: new THREE.ConeGeometry(0.18, 0.7, 12).rotateZ(Math.PI / 2), c: [0xff6a10], sink: 0.0 },                            // traffic cone
    { g: new THREE.BoxGeometry(0.5, 0.42, 0.55), c: [0xa07a4a, 0x8e6a3e], sink: 0.1 },                                      // cardboard box
    { g: new THREE.BoxGeometry(0.62, 0.36, 0.4), c: [0xf2f2f0, 0xe8e2d0], sink: 0.05 },                                     // cooler
    { g: new THREE.BoxGeometry(1.2, 0.14, 1.0), c: [0xb89a6a], sink: 0.02 },                                               // pallet
    { g: new THREE.SphereGeometry(0.14, 12, 10), c: [0xe82a2a, 0x2a6ae8, 0xf2d21a], sink: 0.0 },                            // ball
    { g: new THREE.BoxGeometry(0.55, 0.3, 0.42), c: [0x2a7ad8, 0xd83a2a], sink: 0.08 },                                     // plastic crate
  ];
  const JUNK = [];
  for (let i = 0; i < 90; i++) {
    const t = Math.floor(R() * TYPES.length);
    JUNK.push({ t, x: -9.8 + R() * 23, z0: -70 + R() * 115, sp: 1.0 + R() * 1.4, yaw: R() * 6.28, spin: (R() - 0.5) * 0.8, ph: R() * 6.28, c: TYPES[t].c[Math.floor(R() * TYPES[t].c.length)] });
  }
  const jm = TYPES.map((T, k) => {
    const list = JUNK.filter((j) => j.t === k);
    const m = new THREE.InstancedMesh(T.g, P(0xffffff, k === 0 ? 0.25 : 0.6), Math.max(1, list.length));
    const c = new THREE.Color();
    list.forEach((j, i) => { j.i = i; m.setColorAt(i, c.set(j.c)); });
    return add(m);
  });

  // ---- falls: roof edges, awnings, drainpipes (one mesh of ribbons; the shader drops each to the water line) ----
  const FALLS = [];
  const AWN = [];
  for (const b of B) {
    if (!b.front || b.balcony || b.z > 70 || b.z < -110) continue;
    const face = b.side * WALK;
    const n = b.h < 26 ? 1 + Math.floor(R() * 2.5) : 0;      // (off tall roofs the fall tears into spray)
    for (let k = 0; k < n; k++) FALLS.push({ x: face, z: b.z + (R() - 0.5) * b.d * 0.8, top: b.h + 0.85, w: 1.2 + R() * 2.6, side: b.side, kind: 0, seed: R() });
    // a drainpipe or two down the front, gushing at 3 m
    for (let k = 0; k < 1 + (R() < 0.5 ? 1 : 0); k++) FALLS.push({ x: face - b.side * 0.12, z: b.z + (k ? 1 : -1) * b.d * (0.3 + 0.15 * R()), top: 3.0, w: 0.22, side: b.side, kind: 2, seed: R(), pipeTop: b.h });
  }
  for (const s of SIGNS) {
    if (s.z > 60 || s.z < -100 || R() < 0.3) continue;
    const a = { x: s.side * (WALK - 0.75), z: s.z, w: Math.min(s.w + 0.6, 4.2), side: s.side, y: 3.05, col: [0x9a1c1c, 0x1c5a32, 0x1c2c5a, 0x6a1c5a, 0xb85a10][Math.floor(R() * 5)] };
    AWN.push(a);
    FALLS.push({ x: s.side * (WALK - 1.5), z: s.z, top: a.y - 0.2, w: a.w * 0.95, side: s.side, kind: 1, seed: R() });
  }
  {
    // the awnings (fabric, sloping down toward the street) and the drainpipes
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const am = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.08, 1), P(0xffffff, 0.8), Math.max(1, AWN.length));
    AWN.forEach((a, i) => { m4.makeRotationZ(a.side * 0.38).setPosition(a.x, a.y, a.z).multiply(new THREE.Matrix4().makeScale(1, 1, a.w)); am.setMatrixAt(i, m4); am.setColorAt(i, c.set(a.col)); });
    add(am);
    const pipes = FALLS.filter((f) => f.kind === 2);
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8).translate(0, 0.5, 0), P(0x55585c, 0.5, { metalness: 0.4 }), Math.max(1, pipes.length));
    pipes.forEach((f, i) => { m4.makeScale(1, f.pipeTop - 3.0, 1).setPosition(f.x + f.side * 0.0, 3.0, f.z); pm.setMatrixAt(i, m4); });
    add(pm);
  }
  const fu = { uTime: { value: 0 }, uLevel: { value: 0 }, uLight: { value: new THREE.Color(0.6, 0.63, 0.68) }, uK: { value: 1 } };
  {
    const NS = 26, pos = [], aF = [], aG = [], idx = [];
    let base = 0;
    for (const f of FALLS) {
      for (let j = 0; j <= NS; j++) for (const u of [-0.5, 0.5]) { pos.push(u, j / NS, 0); aF.push(f.x, f.z, f.top, f.w); aG.push(f.side, f.kind, f.seed, 0); }
      for (let j = 0; j < NS; j++) { const a = base + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      base += (NS + 1) * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aF', new THREE.Float32BufferAttribute(aF, 4));
    geo.setAttribute('aG', new THREE.Float32BufferAttribute(aG, 4));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: fu, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aF; attribute vec4 aG; uniform float uLevel; varying vec2 vQ; varying float vDrop; varying float vKind; varying float vSeed; varying float vT;
        void main() {
          float top = aF.z, drop = max(top - uLevel, 0.0);
          float t = position.y;
          float dy = drop * t;
          // thrown out from the wall: a roof gutter spills ~1 m/s, an awning's edge less, a drainpipe's mouth fast
          float v0 = aG.y < 0.5 ? 1.0 : aG.y < 1.5 ? 0.5 : 2.2;
          float outd = v0 * sqrt(2.0 * dy / 9.8) + (aG.y < 0.5 ? 0.25 : 0.0);
          float w = aF.w * (1.0 + 0.35 * t * (aG.y > 1.5 ? 2.0 : 1.0));
          vec3 p = vec3(aF.x - aG.x * outd, top - dy, aF.y + position.x * w);
          vQ = vec2(position.x * aF.w, top - dy); vDrop = drop; vKind = aG.y; vSeed = aG.z; vT = t;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uLight; uniform float uK; varying vec2 vQ; varying float vDrop; varying float vKind; varying float vSeed; varying float vT;
        float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          if (vDrop < 0.05) discard;
          // falling ropes of water: streaks across, scrolling down fast
          float sp = 7.0 + 4.0 * vT;
          float s1 = n2(vec2(vQ.x * 9.0 + vSeed * 50.0, (vQ.y + uTime * sp) * 0.9));
          float s2 = n2(vec2(vQ.x * 23.0 - vSeed * 30.0, (vQ.y + uTime * sp * 1.2) * 2.2));
          float rope = smoothstep(0.35, 0.85, s1 * 0.6 + s2 * 0.5);
          float edge = 1.0 - smoothstep(0.32, 0.5, abs(vQ.x) / max(0.001, 1.0));
          float a = (0.25 + 0.6 * rope) * (vKind > 1.5 ? 1.3 : 1.0);
          // break up into spray lower down; bright churn where it hits the water
          a *= mix(1.0, 0.55 + 0.6 * s2, vT);
          a *= smoothstep(0.0, 0.04, vT);
          vec3 c = uLight * (0.9 + 0.8 * rope) + vec3(0.25) * smoothstep(0.8, 1.0, vT);
          gl_FragColor = vec4(c, clamp(a * uK, 0.0, 0.9));
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3;
    add(m);
  }

  // ---- splashes: droplets bouncing off surfaces (a list of rectangles set each frame) and a little spray ----
  const NSURF = 48, NP = 14000;
  const su = {
    uTime: { value: 0 }, uSurf: { value: Array.from({ length: NSURF }, () => new THREE.Vector4()) },
    uSurfS: { value: Array.from({ length: NSURF }, () => new THREE.Vector4()) }, uLight: fu.uLight, uRate: { value: 1 }, uK: { value: 1 },
  };
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    const a = new Float32Array(NP * 4);
    for (let i = 0; i < NP; i++) a.set([R(), R(), R(), (i % NSURF) + 0.5], i * 4);
    geo.setAttribute('aR', new THREE.InstancedBufferAttribute(a, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: su, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aR; uniform float uTime; uniform vec4 uSurf[${NSURF}]; uniform vec4 uSurfS[${NSURF}]; uniform float uRate;
        varying vec2 vUv; varying float vA; varying float vMist;
        float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
        void main() {
          vUv = uv;
          int si = int(aR.w);
          vec4 S = uSurf[si], SS = uSurfS[si];
          vA = 0.0; vMist = 0.0;
          if (SS.z <= 0.0 || aR.y > SS.z) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
          float mist = step(0.86, aR.z);
          float per = mix(0.32, 0.55, aR.x) / uRate * (mist > 0.5 ? 2.0 : 1.0);
          float cyc = uTime / per + aR.y * 17.0;
          float n = floor(cyc), ph = fract(cyc);
          float life = mist > 0.5 ? 0.6 : 0.22 + 0.1 * aR.x;
          float tt = ph * per;
          if (tt > life) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
          float k1 = h1(n * 1.37 + aR.x * 113.0), k2 = h1(n * 2.11 + aR.y * 71.0), k3 = h1(n * 0.73 + aR.z * 57.0);
          // a random point on the rectangle (centre S.xyz, yaw S.w, half sizes SS.xy)
          vec2 l = (vec2(k1, k2) * 2.0 - 1.0) * SS.xy;
          float c = cos(S.w), s = sin(S.w);
          vec3 base = S.xyz + vec3(l.x * c + l.y * s, 0.0, -l.x * s + l.y * c);
          float ang = k3 * 6.2831, up = 1.4 + 1.2 * h1(n + aR.z * 9.0), outv = 0.6 + 0.7 * h1(n * 3.0 + aR.x);
          vec3 vel = mist > 0.5 ? vec3(0.4, 0.5, 0.2) : vec3(cos(ang) * outv, up, sin(ang) * outv);
          vec3 p = base + vel * tt + vec3(0.0, -4.9 * tt * tt * (1.0 - mist), 0.0);
          vec3 v = vel + vec3(0.0, -9.8 * tt * (1.0 - mist), 0.0);
          vec3 toC = normalize(cameraPosition - p);
          vec3 ax = normalize(v + vec3(0.0001));
          vec3 sd = normalize(cross(ax, toC));
          float len = mist > 0.5 ? 0.18 + 0.2 * aR.x : length(v) * 0.017 + 0.012;
          float wid = mist > 0.5 ? len : 0.009 + 0.006 * aR.x;
          vec3 up2 = mist > 0.5 ? normalize(cross(toC, sd)) : ax;
          vec3 w = p + up2 * position.y * len + sd * position.x * wid * (1.0 + 0.05 * length(cameraPosition - p));
          float lt = tt / life;
          vA = (1.0 - lt) * smoothstep(0.0, 0.08, lt) * smoothstep(0.6, 2.0, length(cameraPosition - p));
          vMist = mist;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; uniform float uK; varying vec2 vUv; varying float vA; varying float vMist;
        void main() {
          vec2 q = vUv * 2.0 - 1.0;
          float a = vMist > 0.5 ? exp(-dot(q, q) * 2.5) * 0.12 : (1.0 - abs(q.x)) * (1.0 - q.y * q.y);
          gl_FragColor = vec4(uLight * a * vA * 0.42 * uK, 1.0);
        }`,
    });
    const m = new THREE.InstancedMesh(geo, mat, NP);
    m.renderOrder = 7;
    add(m);
  }
  const dummy = new THREE.Object3D();
  let nS = 0;
  return {
    group, GAUGE, AWN,
    // the splash surfaces for this frame: rect(cx, cy, cz, yaw, hw, hl, density 0..1)
    beginSurf() { nS = 0; },
    surf(cx, cy, cz, yaw, hw, hl, dens = 1) {
      if (nS >= NSURF) return;
      dens *= Math.min(1, (4 * hw * hl) / 6);           // the same rain per square metre on small surfaces
      su.uSurf.value[nS].set(cx, cy, cz, yaw); su.uSurfS.value[nS].set(hw, hl, dens, 0); nS++;
    },
    endSurf() { for (let i = nS; i < NSURF; i++) su.uSurfS.value[i].set(0, 0, 0, 0); },
    nSurf: () => nS,
    frame(v, L, rate, light, on) {
      su.uTime.value = v; su.uRate.value = rate; fu.uTime.value = v; fu.uLevel.value = L;
      fu.uLight.value.copy(light);
      for (const m of group) m.visible = on;
      // the junk rides the current up the avenue (wrapping round, far from the camera)
      const span = 115;
      for (const j of JUNK) {
        const T = TYPES[j.t];
        let z = j.z0 - j.sp * v; z = ((z + 70) % span + span) % span - 70;
        let x = j.x + 0.5 * Math.sin(v * 0.4 + j.ph);
        // round you
        const dz = z - YOU0.z, dx = x - YOU0.x;
        if (Math.abs(dz) < 1.2 && Math.abs(dx) < 0.9) x = YOU0.x + Math.sign(dx || 1) * 0.9;
        dummy.position.set(x, L - T.sink + 0.04 * Math.sin(v * 2.3 + j.ph), z);
        dummy.rotation.set(0.12 * Math.sin(v * 1.7 + j.ph), j.yaw + j.spin * v, 0.1 * Math.sin(v * 1.3 + j.ph * 2), 'YXZ');
        dummy.updateMatrix();
        jm[j.t].setMatrixAt(j.i, dummy.matrix);
      }
      jm.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    },
  };
}
