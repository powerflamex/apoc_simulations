// The ground beyond the city: the sea you run out onto, and from then on the whole Earth under you, lap after lap.
// One big plane under the camera (render space) with one shader. What is under any point is a function of how far
// round the Earth it is (s mod 40,075 km, from your start eastward): ocean, a continent (green and brown, a desert),
// ocean, land, the widest ocean, home. Seen from just above at these speeds, everything is averaged along your path
// over the distance you cover in one frame (exact motion blur for a plane you move parallel to): read from a running
// sum along the lap, so it never flickers however far a frame takes you. Waves are summed from a spectrum and fade
// out as you go faster than they can be seen. Lit by the Sun (day/night), city lights at night, and your own fire.
import * as THREE from 'three';
import { LAP, tPass, speedAt } from './timeline.js';
import { SEA_Y } from './avenue.js';

const N = 4096;
// what's under you at distance s (m) along the lap: [land, desert, forest, lights], each 0..1
function typeAt(s) {
  const km = s / 1000;
  const land = [[5200, 12000], [12000, 16100], [23800, 28800], [40065, 40080], [-10, 12]];
  let L = 0;
  for (const [a, b] of land) L = Math.max(L, Math.min(1, Math.max(0, Math.min(km - a, b - km) / 60)));
  // islands
  const isl = [8600, 19500, 21000, 31500, 34800, 36600];
  for (const c of isl) L = Math.max(L, Math.max(0, 1 - Math.abs(km - c) / 90));
  const desert = km > 11800 && km < 14900 ? Math.min(1, Math.min(km - 11800, 14900 - km) / 300) : 0;
  const forest = (km > 5200 && km < 9000) || (km > 24500 && km < 27500) ? 1 : 0.35;
  // lights: towns along the coasts and a few big cities
  const lights = L * (0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(km * 0.013) * Math.sin(km * 0.0071 + 1)), 2)) + (km < 30 || km > 40045 ? 1 : 0);
  return [L, desert * L, forest * L * (1 - desert), Math.min(1, lights)];
}
function makeTypeTextures() {
  const raw = new Float32Array(N * 4), sum = new Float32Array((N + 1) * 4);
  const dx = LAP / N;
  for (let i = 0; i < N; i++) {
    // (each texel the average of 8 samples)
    const acc = [0, 0, 0, 0];
    for (let k = 0; k < 8; k++) { const t = typeAt((i + (k + 0.5) / 8) * dx); for (let c = 0; c < 4; c++) acc[c] += t[c] / 8; }
    raw.set(acc, i * 4);
  }
  for (let i = 0; i < N; i++) for (let c = 0; c < 4; c++) sum[(i + 1) * 4 + c] = sum[i * 4 + c] + raw[i * 4 + c];
  const tex = (d, w) => { const t = new THREE.DataTexture(d, w, 1, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const total = sum.slice(N * 4, N * 4 + 4);
  return { raw: tex(raw, N), sum: tex(sum, N + 1), total: new THREE.Vector4(...total) };
}

// when you passed distance s and how fast you were going, over log10(s) from 1 to 9.7 (10 m .. 5 million km)
const NL = 4096, LG0 = 1, LG1 = 9.7;
function makePassTexture() {
  const d = new Float32Array(NL * 4);
  for (let i = 0; i < NL; i++) {
    const s = Math.pow(10, LG0 + (LG1 - LG0) * i / (NL - 1));
    const tp = tPass(s);
    d.set([tp, speedAt(tp), 0, 0], i * 4);
  }
  const t = new THREE.DataTexture(d, NL, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
export const SU = {
  uS: { value: 0 }, uDz: { value: 0 }, uT: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.8) },
  uSkyHi: { value: new THREE.Color(0.1, 0.3, 0.7) }, uSkyLo: { value: new THREE.Color(0.6, 0.75, 0.9) }, uDay: { value: 1 },
  uFire: { value: new THREE.Color(0, 0, 0) }, uFireR: { value: 30 }, uHaze: { value: new THREE.Color(0.7, 0.8, 0.9) }, uHazeD: { value: 6000 },
  uRaw: { value: null }, uSum: { value: null }, uTot: { value: new THREE.Vector4() }, uTrench: { value: 0 }, uPass: { value: null }, uSabs: { value: 0 },
};

export function makeSurface(scene) {
  const T = makeTypeTextures();
  SU.uRaw.value = T.raw; SU.uSum.value = T.sum; SU.uTot.value = T.total; SU.uPass.value = makePassTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms: SU,
    vertexShader: /* glsl */ `varying vec3 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uS; uniform float uDz; uniform float uT; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyHi; uniform vec3 uSkyLo;
      uniform float uDay; uniform vec3 uFire; uniform float uFireR; uniform vec3 uHaze; uniform float uHazeD; uniform float uTrench;
      uniform sampler2D uRaw; uniform sampler2D uSum; uniform vec4 uTot; uniform sampler2D uPass; uniform float uSabs;
      varying vec3 vP;
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      const float LAPM = ${LAP.toFixed(1)};
      const float NN = ${N.toFixed(1)};
      vec4 sumAt(float s) {
        float laps = floor(s / LAPM), x = (s - laps * LAPM) / LAPM * NN;
        float i = floor(x), f = x - i;
        vec4 a = texture2D(uSum, vec2((i + 0.5) / (NN + 1.0), 0.5)), b = texture2D(uSum, vec2((i + 1.5) / (NN + 1.0), 0.5));
        return laps * uTot + mix(a, b, f);
      }
      vec4 rawAt(float s) {
        float x = fract(s / LAPM) * NN; float i = floor(x), f = x - i;
        vec4 a = texture2D(uRaw, vec2((i + 0.5) / NN, 0.5)), b = texture2D(uRaw, vec2((mod(i + 1.0, NN) + 0.5) / NN, 0.5));
        return mix(a, b, f);
      }
      vec2 passAt(float s) {
        float x = (log(max(s, 10.0)) / log(10.0) - ${LG0.toFixed(1)}) / ${(LG1 - LG0).toFixed(1)} * ${(NL - 1).toFixed(1)};
        float i = clamp(floor(x), 0.0, ${(NL - 2).toFixed(1)}), f = clamp(x - i, 0.0, 1.0);
        return mix(texture2D(uPass, vec2((i + 0.5) / ${NL.toFixed(1)}, 0.5)).rg, texture2D(uPass, vec2((i + 1.5) / ${NL.toFixed(1)}, 0.5)).rg, f);
      }
      vec3 skyRefl(vec3 r) {
        float h = clamp(r.y, 0.0, 1.0);
        vec3 c = mix(uSkyLo, uSkyHi, pow(smoothstep(0.0, 0.8, h), 0.6));
        return c + uSunCol * 0.9 * pow(max(dot(normalize(r), uSun), 0.0), 900.0) * step(0.0, uSun.y);
      }
      void main() {
        float s = uS - vP.z;                         // how far round the Earth this point is
        float dz = max(uDz, 0.05);
        // what's here, averaged over one frame's travel (texel = 9.8 km, so short travel reads the texture directly)
        vec4 ty = dz > 2000.0 ? (sumAt(s + dz) - sumAt(s)) / (dz / LAPM * NN) : rawAt(s + 0.5 * dz);
        float land = ty.x, desert = ty.y, forest = ty.z, lights = ty.w;
        vec3 V = normalize(vP - cameraPosition);
        float dist = length(vP - cameraPosition);
        // the sea: waves from a spectrum, each faded out once your travel per frame or the pixel is wider than it
        vec2 P = vec2(vP.x, s);
        vec2 grad = vec2(0.0);
        float px = dist * 0.0012;
        for (int k = 0; k < 14; k++) {
          float fk = float(k);
          float lam = 0.6 * pow(1.38, fk);
          float ang = h2(vec2(fk, 3.0)) * 2.4 - 1.2 + 0.4;
          vec2 dir = vec2(sin(ang), cos(ang));
          float kk = 6.2832 / lam;
          float amp = lam * 0.012;
          float vis = (1.0 - smoothstep(lam * 0.25, lam * 0.9, px)) * (1.0 - smoothstep(lam * 0.3, lam * 1.2, dz * abs(dir.y) + 0.0));
          float ph = dot(dir, P) * kk - sqrt(9.81 * kk) * uT + h2(vec2(fk, 7.0)) * 6.28;
          grad += dir * cos(ph) * amp * kk * vis;
        }
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 deep = vec3(0.012, 0.045, 0.075) * (0.3 + 0.7 * uDay);
        vec3 sea = mix(deep * (0.8 + 0.4 * max(uSun.y, 0.0)), skyRefl(reflect(V, N)) * 0.7, fres);
        // the land: greens and browns, desert, streaked along your path by the speed
        float streak = n2(vec2(vP.x * 0.02, 0.0)) * 0.5 + n2(vec2(vP.x * 0.2, 1.0)) * 0.3 + 0.2 * n2(vec2(vP.x * 1.3, 2.0));
        float detail = dz < 50.0 ? n2(P * 0.01) * 0.6 + n2(P * 0.07) * 0.4 : 0.5;
        vec3 ground = mix(vec3(0.2, 0.18, 0.11), vec3(0.08, 0.15, 0.06), forest) * (0.75 + 0.5 * mix(streak, detail, 0.5));
        ground = mix(ground, vec3(0.62, 0.5, 0.33) * (0.85 + 0.3 * streak), desert);
        float sunL = max(uSun.y, 0.0);
        ground *= (0.12 + 1.6 * sunL) * uSunCol + vec3(0.03, 0.04, 0.06) * uDay;
        vec3 col = mix(sea, ground, land);
        // night: the towns' lights
        col += vec3(1.0, 0.62, 0.25) * lights * (1.0 - uDay) * 0.35 * (0.6 + 0.8 * streak);
        // your fire lighting everything round you (falls off with distance from you)
        float dF = length(vP.xz - vec2(0.0, 2.0));
        col += uFire * (mix(0.25, 0.08, land) + fres * 0.5) / (1.0 + pow(dF / uFireR, 2.0));
        // your track: the blast's own width R = (E'/rho)^(1/4) sqrt(age) from when you last passed this point
        // (behind you: this lap, churned white water / scorched ground; ahead of you after the first lap: last
        // lap's trail, still burning)
        {
          float sAbs = uSabs - vP.z;
          float sp = vP.z > 0.0 ? sAbs : sAbs - LAPM;
          if (sp > 10000.0) {
            vec2 pa = passAt(sp);
            float age = uT - pa.x;
            float R = pow(0.35 * pa.y * pa.y, 0.25) * sqrt(max(age, 0.0));
            // (noise along your path stretched to the distance one frame covers, so it never flickers)
            float sk = 1.0 / max(dz, 2000.0);
            float st0 = n2(vec2(vP.x * 0.02 + 7.0, s * sk));
            float inT = (1.0 - smoothstep(R * (0.45 + 0.3 * st0), R, abs(vP.x))) * step(0.0, age);
            float burn = exp(-age / 1.5) * smoothstep(3000.0, 30000.0, pa.y) * land * step(vP.z, 0.0);   // (glowing: last lap's trail ahead of you)
            // churned water: dark, steaming, streaked with foam; scorched ground: black with glowing cracks
            float st = n2(vec2(vP.x * 0.03 + 3.0, s * sk * 0.4)) * 0.6 + n2(vec2(vP.x * 0.15, s * sk * 2.0)) * 0.4;
            // boiling white water and steam: bright and churned, edges torn into streaks
            vec3 foam = mix(vec3(0.42, 0.45, 0.48), vec3(0.92, 0.94, 0.96), smoothstep(0.3, 0.75, st)) * (0.25 + 0.75 * uDay);
            vec3 scorch = vec3(0.05, 0.04, 0.035) + vec3(1.2, 0.3, 0.06) * smoothstep(0.6, 0.85, st) * exp(-age / 6.0) * step(vP.z, 0.0);
            vec3 churn = mix(foam, scorch, land);
            col = mix(col, churn + uFire * 0.04, inT * 0.9 * (1.0 - exp(-age * 600.0)));
            col += vec3(1.3, 0.45, 0.12) * burn * inT * (0.5 + 0.5 * n2(vec2(vP.x * 0.004, s * sk * 0.6)));
          }
        }
        col = mix(col, uHaze, 1.0 - exp(-dist / uHazeD));
        // alpha 0: already blurred along your path here, so the post pass leaves it alone
        gl_FragColor = vec4(col, 0.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh, mat,
    frame({ s, dz, v, camX, camZ, y, visible }) {
      mesh.visible = visible;
      SU.uS.value = s % LAP; SU.uDz.value = dz; SU.uT.value = v; SU.uSabs.value = s;
      mesh.position.set(camX, y, camZ);
    },
  };
}
export { SEA_Y };
