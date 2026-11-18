// Your laps, from the second one on: everything ahead of you is ground you already blasted on an earlier lap. The
// blast from each pass is still spreading (R = (E'/rho)^(1/4) sqrt(age)), so you fly down a canyon of fire between
// two walls of burning gas and smoke, half-width W = the widest of those blasts: 1.8 km as lap 2 starts (0:29.6),
// 4 km at 0:31, 9 km at 0:35, 20 km at light speed (every lap wrecks it wider). Walls in render space, bent down by
// the curve of the Earth, their fire streaked along your path by the distance you cover in one frame.
// Each time you pass home (your own city, the avenue) a flash runs along the ground and up the walls, hotter each lap.
import * as THREE from 'three';
import { distAt, speedAt, tPass, LAP, R_EARTH } from './timeline.js';
import { SEA_Y } from './avenue.js';
import { smooth, clamp } from './util.js';

const R = (vel, age) => Math.pow(0.35 * vel * vel, 0.25) * Math.sqrt(Math.max(age, 0));
const T0 = 29.3, T1 = 48, DT = 0.05;
const WTAB = [];
for (let v = T0; v <= T1 + 1e-6; v += DT) {
  const S = distAt(v);
  let W = 0;
  for (let k = 1; S - k * LAP > 0; k++) { const tp = tPass(S - k * LAP); W = Math.max(W, R(speedAt(tp), v - tp)); }
  WTAB.push(W);
}
export function corridorW(v) {
  if (v <= T0) return 0;
  const f = Math.min((v - T0) / DT, WTAB.length - 1.001), i = Math.floor(f);
  return WTAB[i] + (WTAB[i + 1] - WTAB[i]) * (f - i);
}
// the times you pass home (once round the Earth each): 0:29.5, 0:31.0, ...
export const HOME_PASSES = [];
for (let k = 1; k < 200; k++) { const t = tPass(k * LAP); if (t > 41) break; HOME_PASSES.push(t); }

const NOISE = /* glsl */ `
  float ch(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
`;
export function makeCorridor(scene) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 220);           // x: across the wall (unused), y: along your path
  const mat = new THREE.ShaderMaterial({
    uniforms: { uW: { value: 1000 }, uH: { value: 800 }, uScroll: { value: 0 }, uA: { value: 0 }, uFlash: { value: 0 }, uDay: { value: 1 }, uSide: { value: 1 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    // (the walls lower the target's alpha where they cover it: the post blur then leaves them alone, since their
    // streaks already carry the motion; otherwise the sky's depth behind them smears them into pale haze)
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `uniform float uW; uniform float uH; uniform float uSide; varying vec2 vQ; varying vec3 vP;
      void main() {
        // the wall's plane: u across 0..1 = bottom..top, v along = -400 km .. +30 km (ahead is -z)
        float along = mix(-400000.0, 30000.0, uv.y);
        float up = uv.x;
        vec3 p = vec3(uSide * uW * (1.0 + 0.15 * up), ${SEA_Y.toFixed(2)} + up * uH, along);
        p.y -= along * along / ${(2 * R_EARTH).toFixed(1)};
        vQ = vec2(up, along);
        vec4 w = modelMatrix * vec4(p, 1.0); vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `uniform float uScroll; uniform float uA; uniform float uFlash; uniform float uDay; uniform float uW;
      varying vec2 vQ; varying vec3 vP;
      ${NOISE}
      void main() {
        float up = vQ.x;
        // the walls' real detail flashes past in microseconds; what reads is streaks of fire rushing at you. The
        // pattern is laid out in log-distance ahead (even spacing on screen) and scrolls toward you at a rate the
        // eye can follow (never more than a fraction of a streak per frame, so it never flickers)
        float dAhead = max(-vQ.y, 800.0);
        float sc = log(dAhead) * 3.0 + uScroll;
        float far = smoothstep(25000.0, 90000.0, dAhead);
        float n = cn(vec2(up * 7.0, sc)) * 0.55 + cn(vec2(up * 17.0 + 4.0, sc * 1.7 + 2.0)) * 0.3 + cn(vec2(up * 41.0, sc * 2.6 + 5.0)) * 0.15 * (1.0 - far);
        // billowing: black smoke above, a band of fire at the base with tongues of flame licking up into it
        float bill = cn(vec2(up * 3.0 + 1.0, sc * 2.2 + 3.0)) * 0.6 + cn(vec2(up * 9.0, sc * 4.1 + 7.0)) * 0.4 * (1.0 - far);
        float edge = 0.26 + 0.4 * bill;
        float fire = 1.0 - smoothstep(edge - 0.07, edge + 0.03, up);
        float smoke = smoothstep(edge - 0.06, edge + 0.1, up);
        // fire: yellow at the roots, deep orange, then red at the tips; streaked hard along your path
        float tip = clamp(up / max(edge, 0.05), 0.0, 1.0);
        // (kept under ~1.3 so the tone mapping doesn't bleach it to peach)
        vec3 fc = mix(vec3(1.3, 0.62, 0.12), vec3(1.0, 0.24, 0.03), smoothstep(0.1, 0.55, tip));
        fc = mix(fc, vec3(0.5, 0.06, 0.012), smoothstep(0.7, 1.0, tip));
        vec3 col = fc * fire * (0.3 + 1.1 * n * n) * (1.0 + 0.8 * uFlash);
        // the smoke: near black, lit orange from below where it meets the fire
        vec3 sm = vec3(0.035, 0.03, 0.028) * (0.6 + 0.8 * n) + vec3(0.9, 0.25, 0.04) * exp(-max(up - edge, 0.0) * 9.0) * (0.4 + 0.6 * n);
        col += sm * smoke * (1.0 - fire);
        col += vec3(2.2, 1.7, 1.2) * uFlash * fire * 0.5;
        float a = clamp(fire + smoke * (0.82 + 0.15 * bill), 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, up)) * uA;
        // fade the far end into the glow ahead
        float dist = length(vP - cameraPosition);
        a *= 1.0 - smoothstep(150000.0, 380000.0, dist);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const walls = [-1, 1].map((sd) => { const m = new THREE.Mesh(geo, mat.clone()); m.material.uniforms.uSide.value = sd; m.frustumCulled = false; m.renderOrder = 3; scene.add(m); return m; });
  return {
    walls,
    frame(v, S, dz, day, on) {
      const W = corridorW(v);
      // a flash each time you pass home (only while laps are slower than ~1.5 a second; after that it's one glow)
      let fl = 0;
      HOME_PASSES.forEach((t, k) => { const d = v - t; if (d > -0.02 && d < 0.6) fl = Math.max(fl, Math.exp(-Math.max(d, 0) / 0.12) * (0.5 + 0.12 * k)); });
      fl *= 1 - smooth(32.5, 34, v);
      for (const w of walls) {
        const u = w.material.uniforms;
        w.visible = on > 0.001 && W > 50;
        // (streaks rush in faster as the laps speed up)
        u.uW.value = W; u.uH.value = W * 0.9; u.uScroll.value = (v - 29) * (3.0 + 4.0 * smooth(30, 40, v)); u.uA.value = on * smooth(29.5, 30.2, v); u.uFlash.value = fl; u.uDay.value = day;
      }
      return fl;
    },
  };
}
