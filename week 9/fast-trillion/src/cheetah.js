// The cheetah running level with you on frame 0, then left behind as you speed up. A rotary gallop at its top speed
// (68 mph = 30.4 m/s, ~3.4 strides a second, the feet down only ~12% of each stride): the spine gathers and stretches,
// the head stays level, the tail counter-swings. Body, legs and head are lofted tubes rebuilt every frame (loft.js),
// tan with a white belly, black spots and a ringed tail tip (spots drawn in the shader from the tube's own coordinates).
// Drawn in render space: you at the origin running toward -z; the cheetah runs beside you at x = CX.
import * as THREE from 'three';
import { makeLoft, resample, ik2 } from './loft.js';
import { distAt } from './timeline.js';
import { clamp, smooth } from './util.js';

export const CHEETAH_V = 30.4;           // m/s
export const CX = -1.55;                  // its line, left of yours
const D0 = 3.6;                           // how far ahead of you it is at frame 0 (m)
const FREQ = 3.4;                         // strides per second
// where it is relative to you (m along your path; + = ahead)
// (before frame 0 it runs level with you; from frame 0 you pull away)
export const cheetahAhead = (v) => (v < 0 ? D0 : D0 + CHEETAH_V * v - distAt(v));

function spotMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aSpot; varying vec2 vSpot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpot = aSpot;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vSpot;
      float ch(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // solid black spots on a jittered grid, none on the white belly; fur streaks along the body
          vec2 g = vSpot, id = floor(g), f = fract(g);
          float d = 9.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            vec2 c = o + 0.2 + 0.6 * vec2(ch(id + o), ch(id + o + 17.0));
            d = min(d, length((f - c) * vec2(1.0, 1.25)) / (0.22 + 0.12 * ch(id + o + 5.0)));
          }
          float tan = smoothstep(0.75, 0.6, vColor.b / max(vColor.r, 0.01));
          float spot = (1.0 - smoothstep(0.75, 1.0, d)) * tan;
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.2 * ch(floor(g * vec2(9.0, 3.0)))), vec3(0.03, 0.025, 0.02), spot);
        }`);
  };
  m.customProgramCacheKey = () => 'cheetah-spots';
  return m;
}

// fur colour: tan back and flanks, white belly (a < 0 is the underside), black rings at the tail tip
const TAN = [0.9, 0.62, 0.28], CREAM = [0.96, 0.92, 0.84], BLACK = [0.05, 0.04, 0.03];
const furCol = (under, k = 1) => (u, a) => {
  const s = Math.sin(a);
  const w = clamp((-s - under) / 0.35, 0, 1) * k;
  return TAN.map((c, i) => c + (CREAM[i] - c) * w);
};

export function makeCheetah(scene) {
  const mat = spotMaterial();
  const group = new THREE.Group();
  scene.add(group);
  const NB = 41, NR = 16;
  const body = makeLoft(NB, NR, {
    mat, uvLen: 1, uvRound: 1,
    color: (u, a) => {
      // u: 0 tail tip .. 1 nose; rings on the last 15% of the tail
      if (u < 0.13) return Math.floor(u / 0.026) % 2 === 0 ? BLACK : CREAM;
      return furCol(0.3)(u, a);
    },
  });
  const head = makeLoft(9, 14, { mat, uvLen: 1, uvRound: 1, color: (u, a) => (u > 0.9 ? BLACK : furCol(0.1)(u, a)) });
  const legs = [0, 1, 2, 3].map(() => makeLoft(13, 10, { mat, uvLen: 1, uvRound: 1, color: (u, a) => (u > 0.93 ? [0.6, 0.48, 0.3] : furCol(-0.2, 0.6)(u, a)) }));
  // spot coordinates: along x round (body ~3 m long: spots ~0.12 m apart)
  const spotUV = (L, nS, nR, lenM, roundM) => {
    const n = nS * nR + 2, a = new Float32Array(n * 2);
    for (let i = 0; i < nS; i++) for (let j = 0; j < nR; j++) a.set([(i / (nS - 1)) * lenM, (j / nR) * roundM], (i * nR + j) * 2);
    L.mesh.geometry.setAttribute('aSpot', new THREE.BufferAttribute(a, 2));
  };
  spotUV(body, NB, NR, 24, 6); spotUV(head, 9, 14, 3, 3);
  legs.forEach((L) => spotUV(L, 13, 10, 7, 2.5));
  for (const L of [body, head, ...legs]) group.add(L.mesh);
  // ears and eyes
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6 });
  const ears = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.03, 0.035, 0.012), mat.clone()); e.material.vertexColors = false; e.material.color.setRGB(0.6, 0.45, 0.22); group.add(e); return e; });
  const eyes = [0, 1].map(() => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), dark); group.add(e); return e; });

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0), FWD = V(0, 0, -1);
  const tmp = new THREE.Vector3(), knee = new THREE.Vector3();

  return {
    group,
    // v: video time; out: anything else (e.g. how visible it is)
    frame(v) {
      const ahead = cheetahAhead(v);
      group.visible = ahead > -12;
      if (!group.visible) return;
      const g = v * FREQ;
      const P = V(CX, 0, -ahead);
      // body frame: a = along (forward +), h = height above the ground, z = across (right +)
      const W = (a, h, zz = 0) => V(P.x + zz, h, P.z - a);
      const flex = 0.2 * Math.cos(2 * Math.PI * (g - 0.62));       // + gathered (back arched), - stretched
      const bob = 0.03 * Math.cos(4 * Math.PI * (g - 0.27));
      const hc = 0.66 + bob;
      // the spine: rear half rotates by +flex (hips tuck under), front half by -flex/2
      // (gathered: both ends drop below the middle of the back; stretched: they lift)
      const spine = (a, h) => {
        const th = a < 0 ? flex : 0.5 * flex, dh = h - hc;
        return [a * Math.cos(th), hc + dh * Math.cos(th) - Math.abs(a) * Math.sin(th)];
      };
      const tail = 0.07 * Math.sin(2 * Math.PI * g + 1.0);
      const K = [
        // a, h, w, t, b
        [-1.42, 0.36 + tail * 1.6, 0.02, 0.02, 0.02],
        [-1.15, 0.38 + tail, 0.026, 0.026, 0.026],
        [-0.86, 0.5 + tail * 0.4, 0.032, 0.032, 0.032],
        [-0.64, 0.66, 0.05, 0.05, 0.05],
        [-0.52, 0.7, 0.11, 0.07, 0.15],
        [-0.27, 0.69, 0.095, 0.06, 0.075],
        [0.02, 0.67, 0.12, 0.08, 0.2],
        [0.28, 0.69, 0.125, 0.1, 0.2],
        [0.44, 0.74, 0.11, 0.09, 0.13],
        [0.6, 0.79, 0.07, 0.06, 0.07],
        [0.72, 0.82, 0.062, 0.06, 0.06],
      ];
      const keys = K.map(([a, h, w, t, b]) => {
        const [aa, hh] = spine(a, h + bob);
        return { p: W(aa, hh), up: UP, w, t, b, sq: 0.9 };
      });
      body.update(resample(keys, 4));
      // the head: level, looking ahead
      const hb = keys[keys.length - 1].p;
      const hk = [
        { p: tmp.copy(hb).add(V(0, 0.0, 0.02)).clone(), up: UP, w: 0.06, t: 0.055, b: 0.045 },
        { p: V(hb.x, hb.y + 0.01, hb.z - 0.08), up: UP, w: 0.07, t: 0.06, b: 0.05 },
        { p: V(hb.x, hb.y - 0.005, hb.z - 0.16), up: UP, w: 0.052, t: 0.045, b: 0.04 },
        { p: V(hb.x, hb.y - 0.02, hb.z - 0.22), up: UP, w: 0.03, t: 0.025, b: 0.025 },
      ];
      head.update(resample(hk, 3));
      for (let i = 0; i < 2; i++) {
        const sx = i ? 1 : -1;
        ears[i].position.set(hb.x + sx * 0.045, hb.y + 0.06, hb.z - 0.04);
        ears[i].rotation.set(0.3, 0, -sx * 0.4);
        eyes[i].position.set(hb.x + sx * 0.04, hb.y + 0.025, hb.z - 0.13);
      }
      // the legs: [hind L, hind R, fore R, fore L] with the rotary gallop's footfalls
      const LEG = [
        { a: -0.5, z: -0.075, off: 0.0, hind: true }, { a: -0.5, z: 0.075, off: 0.07, hind: true },
        { a: 0.36, z: 0.07, off: 0.38, hind: false }, { a: 0.36, z: -0.07, off: 0.45, hind: false },
      ];
      const BETA = 0.13;
      LEG.forEach((L, i) => {
        const [ja, jh] = spine(L.a, 0.62 + bob);
        const J = W(ja, jh, L.z);
        let ps = ((g - L.off) % 1 + 1) % 1;
        let fa, fh;
        const back = L.hind ? -0.7 : -0.55, front = L.hind ? 0.35 : 0.7;
        if (ps < BETA) { fa = front + (back - front) * (ps / BETA); fh = 0.0; }
        else {
          const u = (ps - BETA) / (1 - BETA), e = u * u * (3 - 2 * u);
          fa = back + (front - back) * e + (L.hind ? -0.1 : 0.12) * Math.sin(Math.PI * u);
          fh = (L.hind ? 0.3 : 0.34) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.8);
        }
        const foot = W(ja + fa, fh + 0.03, L.z);
        const L1 = L.hind ? 0.34 : 0.31, L2 = L.hind ? 0.33 : 0.3, L3 = L.hind ? 0.17 : 0.1;
        // the wrist/hock above the paw (the paw's bone slants: hocks lean back)
        const wrist = V(foot.x, foot.y + L3, foot.z + (L.hind ? 0.06 : 0.0));
        ik2(J, wrist, L1, L2, L.hind ? FWD : tmp.copy(FWD).negate(), knee);
        const st = [
          { p: J.clone(), up: FWD, w: L.hind ? 0.075 : 0.06, t: L.hind ? 0.09 : 0.07, b: L.hind ? 0.09 : 0.07 },
          { p: knee.clone(), up: FWD, w: 0.04, t: 0.045, b: 0.045 },
          { p: wrist.clone(), up: FWD, w: 0.026, t: 0.028, b: 0.028 },
          { p: foot.clone(), up: FWD, w: 0.032, t: 0.03, b: 0.03 },
          { p: V(foot.x, foot.y - 0.025, foot.z - 0.05), up: FWD, w: 0.03, t: 0.02, b: 0.02 },
        ];
        legs[i].update(resample(st, 3));
      });
    },
  };
}
