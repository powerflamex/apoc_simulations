// Effects that come from you: the vapour cone as you cross the speed of sound, the hot air piled up in front of you
// (a glowing cap of shocked air, orange from Mach ~6, white-violet by orbit speed), and the wake: the air along your
// path going off like a line of explosive, a half-cylinder of blast that grows behind you as R = (E'/rho)^(1/4) sqrt(age)
// (a cylindrical blast wave), white-hot near you, then steam over the sea and dust over land, fading as it spreads.
// Plus what the blast throws: glass from the windows on your side, litter and leaves whirled up behind you.
// All in render space (you at the origin running toward -z; behind you is +z).
import * as THREE from 'three';
import { distAt, speedAt, ePerM, RHO, tPass, blastAt, PSI, CITY_END, V_SEA } from './timeline.js';
import { blockLots, hh, BLD_R, CURB_R, XST, XST0, PLAZA } from './avenue.js';
import { clamp, smooth, rng } from './util.js';
import { makeSmoke } from './smoke.js';

const NOISE = /* glsl */ `
  float fh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float fn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float ffbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * fn3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
`;

// ---- the wake: rings at log-spaced ages behind you ----
const NA = 90, NTH = 40;
const A_MIN = 2e-5, A_MAX = 7.0;
export function wakeRadius(vel, age) { return Math.pow(ePerM(vel) / RHO, 0.25) * Math.sqrt(Math.max(age, 0)); }

function makeWake(scene) {
  const nV = NA * NTH;
  const pos = new Float32Array(nV * 3), aW = new Float32Array(nV * 4);
  const idx = [];
  for (let i = 0; i < NA - 1; i++) for (let j = 0; j < NTH - 1; j++) {
    const a = i * NTH + j, b = a + 1, c = a + NTH, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aW', new THREE.BufferAttribute(aW, 4).setUsage(THREE.DynamicDrawUsage));   // (unused), theta, heat, fade
  const aR = new Float32Array(nV);
  geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSteam: { value: new THREE.Color(0.9, 0.9, 0.92) }, uDust: { value: new THREE.Color(0.52, 0.47, 0.41) }, uWater: { value: 0 },
      uLight: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 }, uA: { value: 1 }, uSmod: { value: 0 }, uT: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute vec4 aW; attribute float aR; varying vec4 vW; varying vec3 vV; varying vec3 vP; varying float vCam; varying float vR;
      void main() { vW = aW; vR = aR; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vV = normalize(cameraPosition - w.xyz);
        vCam = length(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uSteam; uniform vec3 uDust; uniform float uWater; uniform vec3 uLight; uniform float uNight; uniform float uA;
      uniform float uSmod; uniform float uT;
      varying vec4 vW; varying vec3 vV; varying vec3 vP; varying float vCam; varying float vR;
      ${NOISE}
      void main() {
        vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
        float rim = 1.0 - abs(dot(n, normalize(vV)));
        // the dust / spray, fixed in the world and billowing as the blast spreads (its grain scales with the wave)
        vec3 q = vec3(vP.x, vP.y, vP.z - uSmod) / max(vR, 0.3);
        float nz = ffbm(q * 1.6 + vec3(0.0, -uT * 0.3, 0.0));
        float heat = vW.z;
        // ground-hugging walls (taller over water: the sea is thrown up), the top of the wave invisible air
        float hf = sin(clamp(vW.y, 0.0, 3.1416));
        float wall = 1.0 - smoothstep(mix(0.5, 0.2, uWater), mix(1.05, 0.6, uWater), hf);
        float a = wall * (0.55 + 0.45 * pow(rim, 1.2)) * smoothstep(0.18, 0.6, nz + 0.25 * rim) * vW.w * uA * mix(1.2, 1.2, uWater);
        a *= smoothstep(2.0, 9.0, vCam);
        vec3 cold = mix(uDust, uSteam, uWater) * (0.55 + 0.6 * nz) * uLight;
        vec3 hot = mix(vec3(1.6, 0.45, 0.08), vec3(3.2, 2.6, 2.2), smoothstep(0.55, 1.0, heat)) * (0.6 + 0.8 * nz);
        vec3 col = mix(cold, hot * (0.8 + 1.0 * heat), smoothstep(0.08, 0.5, heat));
        col += vec3(1.4, 0.5, 0.15) * uNight * smoothstep(0.0, 0.25, heat) * 0.6;
        a = max(a, smoothstep(0.3, 0.9, heat) * 0.5 * pow(rim, 2.0) * smoothstep(0.25, 0.75, nz + 0.2) * vW.w * smoothstep(2.0, 9.0, vCam));
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  scene.add(mesh);
  return {
    mesh, mat,
    // v: now; s: distance run; groundY(dist behind) -> the ground's height there; on: 0..1 how much there is to see;
    // hot: 0..1 how hot the air you pile up is (glow)
    frame(v, s, { on, groundY, hotK, water }) {
      mesh.visible = on > 0.002;
      if (!mesh.visible) return;
      mat.uniforms.uWater.value = water;
      for (let i = 0; i < NA; i++) {
        const age = A_MIN * Math.pow(A_MAX / A_MIN, i / (NA - 1));
        const te = v - age, d = s - distAt(te), vel = speedAt(te);
        const R = Math.min(wakeRadius(vel, age), 4000);
        const gy = groundY(d);
        // how hot: the air you piled up cools as the wave spreads (white-hot only in the first moments at high speed)
        const mach = vel / 343;
        // white-hot only in the few metres behind you, then glowing embers that cool within a fraction of a second
        const heatNear = smooth(5, 25, mach) * (1 - smooth(0.5, 6.0, d));
        const ember = smooth(8, 40, mach) * 0.25 * Math.exp(-age / 0.01);
        // (kept off: the flames streaming off you carry the heat; a glowing tube rim read as a stray orange arc)
        const heat = clamp(Math.max(heatNear, ember), 0, 1) * hotK * 0;
        // seen at all: the shock is invisible until it raises dust or steam; it thins out as it grows old
        const fade = (0.35 + 0.65 * smooth(2, 6, mach)) * smooth(1.0, 1.5, mach) * (1 - smooth(A_MAX * 0.4, A_MAX, age)) * smooth(0.5, 4, d) * on;
        const yc = gy - 0.15 * R;
        for (let j = 0; j < NTH; j++) {
          const th = -0.15 + (Math.PI + 0.3) * (j / (NTH - 1));
          const k = (i * NTH + j);
          pos[k * 3] = Math.cos(th) * R;
          pos[k * 3 + 1] = yc + Math.sin(th) * R * 0.8;
          pos[k * 3 + 2] = d;
          aW[k * 4] = 0; aR[k] = R;
          aW[k * 4 + 1] = th;
          aW[k * 4 + 2] = heat;
          aW[k * 4 + 3] = fade;
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aW.needsUpdate = true; geo.attributes.aR.needsUpdate = true;
      mat.uniforms.uSmod.value = s % 8192; mat.uniforms.uT.value = v;
    },
  };
}

// ---- the cap of shocked air in front of you, and the vapour cone at the sound barrier ----
function makeCaps(scene) {
  const capMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0, 0, 0) }, uT: { value: 0 }, uA: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      ${NOISE}
      void main(){
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float n = ffbm(vO * 3.0 + vec3(0.0, 0.0, uT * 9.0));
        float a = pow(rim, 3.0) * (0.5 + 0.8 * n) * uA;
        gl_FragColor = vec4(uCol * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // a paraboloid opening backward (+z), nose at z = 0
  const pts = [];
  for (let k = 0; k <= 20; k++) { const r = (k / 20) * 1.0; pts.push(new THREE.Vector2(r, r * r * 1.6)); }
  const capGeo = new THREE.LatheGeometry(pts, 40).rotateX(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.frustumCulled = false; cap.renderOrder = 6;
  scene.add(cap);
  const cap2 = new THREE.Mesh(capGeo, capMat.clone());
  cap2.frustumCulled = false; cap2.renderOrder = 6;
  scene.add(cap2);
  // the vapour cone: a white conical shell from your shoulders back (a Prandtl-Glauert cloud)
  const vapMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uT: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      ${NOISE}
      void main(){
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float n = ffbm(vec3(vO.x * 6.0, vO.y * 6.0, vO.z * 2.0 - uT * 4.0));
        float along = smoothstep(0.0, 0.15, vO.z) * (1.0 - smoothstep(0.25, 0.55, vO.z));
        float a = smoothstep(0.5, 0.85, n + 0.2 * rim) * along * (0.3 + 0.7 * rim) * uA;
        gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a * 0.75);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const vpts = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; vpts.push(new THREE.Vector2(0.28 + 0.42 * t, t * 0.55)); }
  const vap = new THREE.Mesh(new THREE.LatheGeometry(vpts, 48).rotateX(Math.PI / 2), vapMat);
  vap.frustumCulled = false; vap.renderOrder = 6;
  scene.add(vap);
  return { cap, cap2, capMat, vap, vapMat };
}

// ---- glass from the windows and shop fronts on your side; litter and leaves whirled up behind you ----
const SH_MAX = 6000, LT_MAX = 900;
function makeDebris(scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.4, 0, 0.55, -0.2, 0, -0.1, 0.6, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSky: { value: new THREE.Color(0.6, 0.75, 0.95) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uSky; varying vec3 vC;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vec3 V = normalize(w.xyz - cameraPosition);
        if (dot(n, V) > 0.0) n = -n;
        vec3 r = reflect(V, n);
        float glint = pow(max(dot(r, uSun), 0.0), 120.0) * 8.0;
        float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, n)), 2.0);
        vC = mix(vec3(0.12, 0.15, 0.17), uSky * 0.75, fres) + vec3(1.0, 0.97, 0.9) * glint;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const shards = new THREE.InstancedMesh(geo, glassMat, SH_MAX);
  shards.frustumCulled = false;
  scene.add(shards);
  const litMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  const litter = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.75), litMat, LT_MAX);
  litter.frustumCulled = false; litter.castShadow = false;
  scene.add(litter);
  const LCOL = [0xf2efe6, 0xe8e2d0, 0x9a7a3a, 0x6e8a3a, 0xb8902a, 0xd8d0c0, 0x8a4a2a];
  const c = new THREE.Color();
  for (let i = 0; i < LT_MAX; i++) litter.setColorAt(i, c.set(LCOL[i % LCOL.length]));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const G = 9.81;
  return {
    glassMat,
    // v, s; shift = s (world z -> render z = world z + s)
    frame(v, s, visible) {
      let n = 0;
      shards.visible = litter.visible = visible;
      if (visible) {
        // glass: windows on your side within 160 m behind you, lowest 8 floors, plus the shop fronts
        const s0 = Math.max(0, s - 160), s1 = Math.min(s + 2, PLAZA);
        const k0 = Math.floor((s0 - XST0) / XST) - 1, k1 = Math.floor((s1 - XST0) / XST) + 1;
        for (let k = k0; k <= k1 && n < SH_MAX; k++) {
          for (const L of blockLots(k, 1)) {
            const colW = L.colW, W = L.s1 - L.s0, nCol = Math.max(1, Math.round(W / colW)), cw = W / nCol;
            const FH = L.kind === 2 ? 3.7 : 3.5, g0 = L.kind === 2 ? 5.0 : 5.6;
            for (let ix = 0; ix < nCol && n < SH_MAX; ix++) {
              const ws = L.s0 + (ix + 0.5) * cw;
              if (ws < s0 || ws > s1) continue;
              for (let iy = -1; iy < 8 && n < SH_MAX; iy++) {
                const wy = iy < 0 ? (g0 - 1.4) * 0.5 + 0.3 : g0 + (iy + 0.5) * FH;
                if (wy > L.h - 2) break;
                const b = blastAt(ws, Math.hypot(BLD_R, wy - 1));
                if (v < b.t || b.pa / PSI < 0.12) continue;
                const age = v - b.t;
                const ns = iy < 0 ? 7 : 3;
                for (let j = 0; j < ns && n < SH_MAX; j++) {
                  const r1 = hh(L.seed * 31 + ix, iy * 7 + j, 1), r2 = hh(L.seed * 31 + ix, iy * 7 + j, 2), r3 = hh(L.seed * 31 + ix, iy * 7 + j, 3);
                  // pushed in by the blast then sucked back out on its low-pressure half: out over the sidewalk and down
                  const out = 1.5 + 5 * r1 + 2 * Math.min(4, b.pa / PSI), fwd = (r2 - 0.5) * 3 - 2 * r3;
                  const t = Math.min(age, 3);
                  let x = BLD_R - 0.1 - out * t, y = wy + (r2 - 0.4) * 1.2 + (1 + 2 * r3) * t - 0.5 * G * t * t;
                  const z = -(ws + (r1 - 0.5) * cw * 0.8) - fwd * t;
                  if (y < 0.02) { y = 0.02; x = Math.max(CURB_R - 0.5, x); }
                  const size = iy < 0 ? 0.08 + 0.18 * r3 * r3 : 0.05 + 0.1 * r3 * r3;
                  e.set(r1 * 6 + t * (r2 - 0.5) * 18, r2 * 6 + t * 7, r3 * 6 + t * (r1 - 0.5) * 14);
                  if (y <= 0.021) e.set(-Math.PI / 2, r1 * 6, 0);
                  q.setFromEuler(e);
                  shards.setMatrixAt(n++, m4.compose(p.set(x, y, z + s), q, sc.setScalar(size)));
                }
              }
            }
          }
        }
      }
      shards.count = n;
      shards.instanceMatrix.needsUpdate = true;
      // litter: bits on the street that your wind whirls up as you pass (each from a hash of its slot, 1.2 m apart)
      let nl = 0;
      if (visible) {
        const la = Math.max(-30, s - 90), lb = s + 1;
        for (let k = Math.floor(la / 1.2); k * 1.2 < lb && nl < LT_MAX; k++) {
          const ls = k * 1.2 + hh(k, 3) * 1.2;
          const lx = -1.4 + hh(k, 4) * 3.2;
          const tp = tPass(ls);
          if (v < tp) continue;
          const age = v - tp, vel = speedAt(tp);
          const kick = Math.min(1, vel / 60);
          const up = (2 + 5 * hh(k, 5)) * kick, side = (lx > 0 ? 1 : -1) * (1 + 3 * hh(k, 6)) * kick, fwd = (4 + 8 * hh(k, 7)) * kick;
          // fluttering bits: drag slows them, they drift down
          const t = Math.min(age, 6), dmp = (1 - Math.exp(-t * 1.6)) / 1.6;
          const x = lx + side * dmp, y = Math.max(0.01, 0.05 + up * dmp - 1.2 * t * t * 0.25), z = -(ls + fwd * dmp);
          e.set(hh(k, 8) * 6 + t * 9 * (hh(k, 9) - 0.5), hh(k, 10) * 6 + t * 5, hh(k, 11) * 6 + t * 7 * (hh(k, 12) - 0.5));
          q.setFromEuler(e);
          litter.setMatrixAt(nl++, m4.compose(p.set(x, y, z + s), q, sc.setScalar(0.12 + 0.12 * hh(k, 13))));
        }
      }
      litter.count = nl;
      litter.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- the plasma streaming off you: flame ribbons from your head, shoulders, elbows, hands, knees and feet, pouring
//      back along your body and out behind you (white-hot at your skin, orange, then red as they thin) ----
const NRIB = 12, NPT = 28;
function makeStreamers(scene) {
  const nV = NRIB * NPT * 2;
  const pos = new Float32Array(nV * 3), aC = new Float32Array(nV * 3);
  const idx = [];
  for (let r = 0; r < NRIB; r++) for (let i = 0; i < NPT - 1; i++) {
    const a = (r * NPT + i) * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aC', new THREE.BufferAttribute(aC, 3).setUsage(THREE.DynamicDrawUsage));   // along (0..1), across (-1..1), heat
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute vec3 aC; varying vec3 vC; varying float vCam; void main(){ vC = aC; vec4 w = modelMatrix * vec4(position, 1.0); vCam = length(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uT; uniform float uA; varying vec3 vC; varying float vCam;
      ${NOISE}
      void main(){
        float u = vC.x, x = vC.y;
        float n = fn3(vec3(u * 9.0 - uT * 40.0, x * 2.0, vC.z * 7.0));
        float core = exp(-x * x * 3.0);
        float a = core * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.3, 1.0, u)) * (0.45 + 0.8 * n) * uA * 0.75 * smoothstep(0.8, 2.2, vCam);
        vec3 c = mix(vec3(1.7, 1.45, 1.15), mix(vec3(1.5, 0.55, 0.14), vec3(0.7, 0.12, 0.03), smoothstep(0.35, 0.85, u)), smoothstep(0.0, 0.3, u));
        gl_FragColor = vec4(c * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  scene.add(mesh);
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Vector3(), Vd = new THREE.Vector3(), S = new THREE.Vector3();
  return {
    mesh, mat,
    // starts: world points on you; back: the direction the flow goes (behind you); len: how far back; w: width at the root
    frame(v, cam, starts, { a, len, w }) {
      mat.uniforms.uT.value = v; mat.uniforms.uA.value = a;
      mesh.visible = a > 0.002;
      if (!mesh.visible) return;
      for (let r = 0; r < NRIB; r++) {
        const st = starts[r % starts.length];
        const ph = r * 1.7;
        const L = len * (0.6 + 0.5 * hh(r, 3));
        for (let i = 0; i < NPT; i++) {
          const u = i / (NPT - 1);
          // back along the flow, spreading and wavering a little
          const spread = u * u * L * 0.08;
          P.set(st.x + Math.sin(v * 23 + ph + u * 7) * spread + (hh(r, 5) - 0.5) * u * L * 0.05,
            st.y + Math.cos(v * 19 + ph * 1.3 + u * 5) * spread + u * L * 0.02,
            st.z + u * L);
          Q.set(P.x, P.y, P.z + 0.1);
          T.subVectors(Q, P).normalize();
          Vd.subVectors(cam.position, P).normalize();
          S.crossVectors(T, Vd).normalize();
          const ww = w * (1 - 0.6 * u) * (0.8 + 0.4 * Math.sin(v * 31 + ph + u * 11));
          for (let k = 0; k < 2; k++) {
            const j = (r * NPT + i) * 2 + k, sg = k ? 1 : -1;
            pos[j * 3] = P.x + S.x * ww * sg; pos[j * 3 + 1] = P.y + S.y * ww * sg; pos[j * 3 + 2] = P.z + S.z * ww * sg;
            aC[j * 3] = u; aC[j * 3 + 1] = sg; aC[j * 3 + 2] = r;
          }
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aC.needsUpdate = true;
    },
  };
}

// ---- steam over the sea: billowing clouds rising along your track, from ~1 km behind you to the horizon (each cloud
//      fixed where the sea blew up: emitted on a fixed grid of times, growing with the blast's radius) ----
function makeSteam(scene) {
  const smoke = makeSmoke(scene, 1100);
  const DT = 0.0045, A0 = 0.012, A1 = 2.6;
  return {
    smoke,
    frame(v, s, { on, light, glow }) {
      smoke.begin();
      if (on > 0.002) {
        smoke.mat.uniforms.uTime.value = v;
        smoke.mat.uniforms.uLight.value.setRGB(light, light, light * 1.02);
        const k1 = Math.floor((v - A0) / DT), k0 = Math.ceil((v - A1) / DT);
        for (let k = k1; k >= k0; k--) {
          const te = k * DT, age = v - te;
          if (te < V_SEA_FX + 0.15) break;
          const d = s - distAt(te), vel = speedAt(te);
          const R = Math.min(wakeRadius(vel, age), 900);
          const fade = smooth(A0, A0 * 4, age) * (1 - smooth(A1 * 0.55, A1, age)) * on;
          const sd = hh(k, 1);
          for (const side of [-1, 1]) {
            const r2 = hh(k, side + 5);
            smoke.puff(side * R * (0.25 + 0.35 * r2), -0.7 + R * (0.28 + 0.2 * hh(k, side + 9)), d + (r2 - 0.5) * R * 0.3, R * (0.42 + 0.2 * sd),
              0.55 * fade, 0.95, glow * Math.exp(-age / 0.4), sd * 7 + side);
          }
        }
      }
      smoke.end();
    },
  };
}
const V_SEA_FX = V_SEA;

export function makeFx(sceneYou, sceneWorld) {
  const wake = makeWake(sceneYou);
  const caps = makeCaps(sceneYou);
  const debris = makeDebris(sceneWorld);
  const streamers = makeStreamers(sceneYou);
  const steam = makeSteam(sceneYou);
  return { wake, caps, debris, streamers, steam };
}
