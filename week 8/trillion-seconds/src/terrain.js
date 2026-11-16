// The shape of the ground in the last 20,000 years. Cities bury their streams in pipes under the streets; with nobody
// to keep the pipes up, the stream comes back: from 0:27 it cuts a valley down the old avenue (2.4 m deep, ~10 m
// across at the bottom), past you on your right, and from 0:36 it swings across its valley the way rivers do. Soil
// and the rubble under it rise into low mounds. The same height function runs here (to stand trees, animals and
// stones on the ground) and in the ground shader (GLSL below), so nothing floats or sinks.
import { CZ, YOU } from './layout.js';
import { smooth } from './util.js';

export const RIVER = { hw: 4.5, bank: 5.0, depth: 2.4, water: 0.9 };
// the near patch of ground that can change shape (outside it the ground stays flat)
export const PATCH = { x0: -80, x1: 80, z0: CZ - 230, z1: CZ + 40 };

const edge = (x, z) => smooth(PATCH.x0, PATCH.x0 + 20, x) * (1 - smooth(PATCH.x1 - 20, PATCH.x1, x)) * smooth(PATCH.z0, PATCH.z0 + 40, z) * (1 - smooth(PATCH.z1 - 25, PATCH.z1, z));

export function riverX(z, meander) {
  return -1.5 + (3 + 5 * meander) * Math.sin((z - CZ) * 0.03 + 0.6 + 1.4 * meander);
}
// s: { river, meander, soil }
export function groundH(x, z, s) {
  const e = edge(x, z);
  if (e <= 0) return 0;
  const dx = Math.abs(x - riverX(z, s.meander));
  const D = RIVER.depth * s.river * (1 - smooth(5, 20, z));          // (the valley ends behind the camera)
  let h = -D * (1 - smooth(RIVER.hw, RIVER.hw + RIVER.bank, dx));
  const hill = (Math.sin(x * 0.09 + 1.0) * Math.sin(z * 0.07) + 0.5 * Math.sin(x * 0.21 + z * 0.17 + 2.0)) * 0.8 * s.soil;
  h += hill * smooth(5, 12, Math.hypot(x - YOU.x, z - YOU.z)) * smooth(RIVER.hw + 2, RIVER.hw + 9, dx);
  return h * e;
}
// how far out from the river's centre line the water reaches: the bank is below the water line where
// -D * (1 - smooth(t)) < -D + water, i.e. smooth(t) < water / D (t: 0 at the bottom's edge, 1 at the top of the bank)
export function waterHalfWidth(s) {
  const D = RIVER.depth * s.river;
  if (D <= RIVER.water + 0.05) return 0;
  const k = RIVER.water / D;
  let a = 0, b = 1;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (m * m * (3 - 2 * m) < k) a = m; else b = m; }
  return RIVER.hw + RIVER.bank * (a + b) / 2;
}
export const waterLevel = (s) => -RIVER.depth * s.river + RIVER.water;

// the same height function in GLSL (uniforms: uRiver, uMeander, uSoil)
export const GLSL_TERRAIN = /* glsl */ `
uniform float uRiver; uniform float uMeander; uniform float uSoilH;
float tsm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float tEdge(vec2 p) { return tsm(${PATCH.x0.toFixed(1)}, ${(PATCH.x0 + 20).toFixed(1)}, p.x) * (1.0 - tsm(${(PATCH.x1 - 20).toFixed(1)}, ${PATCH.x1.toFixed(1)}, p.x))
  * tsm(${PATCH.z0.toFixed(1)}, ${(PATCH.z0 + 40).toFixed(1)}, p.y) * (1.0 - tsm(${(PATCH.z1 - 25).toFixed(1)}, ${PATCH.z1.toFixed(1)}, p.y)); }
float riverX(float z) { return -1.5 + (3.0 + 5.0 * uMeander) * sin((z - (${CZ.toFixed(1)})) * 0.03 + 0.6 + 1.4 * uMeander); }
float riverDepth(vec2 p) { return ${RIVER.depth.toFixed(2)} * uRiver * (1.0 - tsm(5.0, 20.0, p.y)) * tEdge(p) * (1.0 - tsm(${RIVER.hw.toFixed(2)}, ${(RIVER.hw + RIVER.bank).toFixed(2)}, abs(p.x - riverX(p.y)))); }
float groundH(vec2 p) {
  float e = tEdge(p);
  float dx = abs(p.x - riverX(p.y));
  float D = ${RIVER.depth.toFixed(2)} * uRiver * (1.0 - tsm(5.0, 20.0, p.y));
  float h = -D * (1.0 - tsm(${RIVER.hw.toFixed(2)}, ${(RIVER.hw + RIVER.bank).toFixed(2)}, dx));
  float hill = (sin(p.x * 0.09 + 1.0) * sin(p.y * 0.07) + 0.5 * sin(p.x * 0.21 + p.y * 0.17 + 2.0)) * 0.8 * uSoilH;
  h += hill * tsm(5.0, 12.0, length(p - vec2(${YOU.x.toFixed(2)}, ${YOU.z.toFixed(2)}))) * tsm(${(RIVER.hw + 2).toFixed(2)}, ${(RIVER.hw + 9).toFixed(2)}, dx);
  return h * e;
}
`;
