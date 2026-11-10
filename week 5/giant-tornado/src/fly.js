// Where a thing torn loose by the wind is at video time v. The wind blows toward the wall (-z): the storm's inflow,
// and it keeps rising. o = { x, y, z: where it rested; t0: when it tore loose; tau: how fast it picks up the wind
// (s; a leaf 0.3, a sign 1, a person 2.5, a car 4, a roof 3); lift: how high the gusts carry it (m); r: size (m,
// sets the tumble); seed; ground: the lowest it can go }. Returns { x, y, z, ang, dt }; before t0 it's at rest.
import { windMs } from './timeline.js';

export function flight(o, v, out = {}) {
  const dt = v - o.t0;
  out.dt = dt;
  if (dt <= 0) { out.x = o.x; out.y = o.y; out.z = o.z; out.ang = 0; return out; }
  const tau = o.tau || 1;
  const W = windMs(o.t0 + dt * 0.6);                        // the wind keeps rising while it flies
  const gain = dt - tau * (1 - Math.exp(-dt / tau));        // ∫ (1 - e^(-t/tau)) dt
  out.z = o.z - W * gain;
  const sd = o.seed || 0, s = sd * 6.283;
  out.x = o.x + Math.sin(dt * (0.7 + sd) + s) * Math.min(dt, 2.5) * (0.8 + 0.4 * Math.min(o.r || 1, 4));
  const hop = 0.55 + 0.45 * Math.sin(dt * (1.3 + sd * 1.5) + s);
  const L = (o.lift || 3) * (0.5 + 0.5 * Math.min(W / 60, 1.5));
  const g = o.ground ?? 0;
  out.y = Math.max(g, g + (o.y - g) * Math.exp(-dt * 1.5) + L * (1 - Math.exp(-dt / 0.6)) * hop + 0.25 * L * dt * Math.min(1, W / 80));
  out.ang = dt * (1.2 + 3.0 / Math.max(o.r || 1, 0.3));
  return out;
}
// true once it has flown into the wall (or out of the world): hide it
export const gone = (f, s) => f.dt > 0 && (f.z < -s.d - 40 || f.z < -1800 || f.y > 900);
