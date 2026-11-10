// A layer of scattered evening cumulus 1.8-2.6 km up (blue-grey, pink on the sunset side, orange underneath from
// the city's glow). The first time you go up through it (jump 13) you punch a hole in it, and it stays open.
import * as THREE from 'three';
import { makeSmoke } from './smoke.js';
import { altitude, jumpOf } from './timeline.js';
import { rng, smooth } from './util.js';

const BASE = 1800;
// when you first pass up through the layer
const V_PUNCH = (() => { const j = jumpOf(13); for (let v = j.t0; v < j.t0 + j.d; v += 0.002) if (altitude(v) > BASE + 300) return v; return j.t0 + 0.4; })();
export { V_PUNCH };

export function makeClouds(scene) {
  const smoke = makeSmoke(scene, 1300);
  smoke.mat.uniforms.uLight.value.setRGB(0.26, 0.29, 0.42);
  const P = [];
  const R = rng(321);
  // clumps of puffs, sparser near the coast
  for (let c = 0; c < 140; c++) {
    const cx = (R() - 0.55) * 26000, cz = (R() - 0.5) * 26000;
    const n = 3 + Math.floor(R() * 5);
    const s = 300 + R() * 500;
    for (let k = 0; k < n; k++) P.push({ x: cx + (R() - 0.5) * s * 2, z: cz + (R() - 0.5) * s * 2, y: BASE + 250 + R() * 400, r: s * (0.5 + 0.6 * R()), seed: R() });
  }
  // a solid deck round the crossing (you go up through it at jump 13 and leave a hole)
  for (let k = 0; k < 300; k++) {
    const a = R() * Math.PI * 2, d = 4500 * Math.sqrt(R());
    P.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 600, y: BASE + 150 + R() * 300, r: 230 + R() * 260, seed: R() });
  }
  return {
    smoke,
    frame(v, camPos, sunDir) {
      smoke.mat.uniforms.uTime.value = v;
      smoke.mat.uniforms.uSun.value.copy(sunDir);
      smoke.begin();
      const punch = smooth(V_PUNCH - 0.05, V_PUNCH + 0.6, v);
      for (const p of P) {
        let x = p.x, z = p.z;
        const d = Math.hypot(x, z);
        if (punch > 0 && d < 700) { const push = (700 - d) * 0.9 * punch; x += (x / (d || 1)) * push; z += (z / (d || 1)) * push; }
        const dc = Math.hypot(x - camPos.x, p.y - camPos.y, z - camPos.z);
        if (dc > 60000) continue;
        const a = 0.4 * smooth(60000, 30000, dc);
        smoke.puff(x, p.y, z, p.r, a, 0.9, 0.1 + 0.08 * (1 - (p.y - BASE) / 700), p.seed);
      }
      // the ring of torn vapour round the hole as you pass
      if (v > V_PUNCH - 0.05 && v < V_PUNCH + 3) {
        const age = v - V_PUNCH;
        const Rr = rng(99);
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * 6.28, rr = 40 + 500 * (1 - Math.exp(-age / 0.5));
          smoke.puff(Math.cos(a) * rr, BASE + 350 + (Rr() - 0.5) * 120, Math.sin(a) * rr - 150, 90 + age * 60, 0.4 * (1 - smooth(0.5, 3, age)), 0.98, 0.1, Rr());
        }
      }
      smoke.end();
    },
  };
}
