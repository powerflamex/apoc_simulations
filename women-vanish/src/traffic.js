// The cars waiting at the red on all four approaches (pure data, shared by shibuya.js and audio.mjs).
// About a third have a woman at the wheel. When she vanishes there is no foot on the brake, and an automatic car
// creeps forward at idle (~6 km/h) until it bumps into the car ahead; the ones at the front roll into the crossing.
import { rng, clamp } from './util.js';

export const RX = 22, RZ = 20;      // half-widths of the two roads (N-S road: |x| < RX; E-W road: |z| < RZ)
export const CW = 7;                // crosswalk width
const CREEP = 1.7, RAMP = 1.4;      // creep speed (m/s) and how long it takes to get there (s)

export const CARS = [];
{
  const R = rng(4170);
  for (const [axis, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    for (const lane of [2.6, 6.1, 9.6]) {
      const stop = (axis === 'x' ? RX : RZ) + CW + 2.6;
      const n = 3 + Math.floor(R() * 4);
      let d = 0;
      const ids = [];
      for (let k = 0; k < n; k++) {
        const bus = R() < 0.07;
        const len = bus ? 11 : 4.6;
        const along0 = stop + d + len / 2;
        d += len + 1.6 + R() * 1.8;
        const driverless = R() < 0.32;
        ids.push(CARS.length);
        CARS.push({ axis, sgn, lane, along0, len, bus, driverless, delay: 0.15 + R() * 0.5, ahead: k === 0 ? -1 : ids[k - 1],
          roll: 8 + R() * 6, kind: bus ? 3 : [0, 1, 2, 0, 1][Math.floor(R() * 5)], taxi: R() < 0.35, paint: R() });
      }
    }
  }
}
// distance a driverless car has crept t seconds after its driver vanished (free, before anything stops it)
const creep = (t) => (t <= 0 ? 0 : t < RAMP ? CREEP * t * t / (2 * RAMP) : CREEP * (t - RAMP / 2));
// (the front car of a lane rolls out into the crossing and slowly comes to a stop)
const free = (c, t) => (c.ahead < 0 ? c.roll * (1 - Math.exp(-creep(t - c.delay) / c.roll)) : creep(t - c.delay));
// where every car is (distance from the middle of the crossing along its road) tau seconds after the vanishing
export function carsAlong(tau, out = new Float32Array(CARS.length)) {
  CARS.forEach((c, i) => {
    let a = c.along0 - (c.driverless ? free(c, tau) : 0);
    if (c.ahead >= 0) { const b = CARS[c.ahead]; a = Math.max(a, out[c.ahead] + (b.len + c.len) / 2 + 0.12); }
    out[i] = a;
  });
  return out;
}
export function carPose(i, along) {
  const c = CARS[i];
  // Japan keeps left; the car's front is its -z
  if (c.axis === 'x') return { x: c.sgn * along, z: c.sgn * c.lane, yaw: c.sgn > 0 ? Math.PI / 2 : -Math.PI / 2 };
  return { x: -c.sgn * c.lane, z: c.sgn * along, yaw: c.sgn > 0 ? 0 : Math.PI };
}
// the bumps: when a creeping car first touches the car ahead (tau, where, how hard)
export const BUMPS = [];
{
  const prev = carsAlong(0), cur = new Float32Array(CARS.length);
  const hit = new Uint8Array(CARS.length);
  for (let t = 0; t < 14; t += 1 / 120) {
    carsAlong(t, cur);
    CARS.forEach((c, i) => {
      if (!c.driverless || hit[i]) return;
      if (c.ahead >= 0 && cur[i] > c.along0 - free(c, t) + 1e-4) { hit[i] = 1; const p = carPose(i, cur[i]); BUMPS.push({ tau: t, x: p.x, z: p.z, g: clamp((prev[i] - cur[i]) * 120 / CREEP, 0.3, 1) }); }
    });
    prev.set(cur);
  }
}
// the space a car takes up at tau (for keeping people out of its way): centre, half-length, half-width, axis
export function carBox(i, tau) {
  const c = CARS[i], p = carPose(i, carsAlong(tau)[i]);
  return { x: p.x, z: p.z, hl: c.len / 2 + 0.6, hw: (c.bus ? 1.35 : 0.95) + 0.6, axis: c.axis };
}
