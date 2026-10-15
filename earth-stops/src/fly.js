// Where a thing torn loose by the wind is at video time v (closed form, see drift() in timeline.js).
//   o = { x, y, z: where it stood; v: when it tore loose (video time); tau: drag time (s); r: size (m, sets how
//         fast it tumbles); lift: how high the gusts toss it (m); seed }
// Returns { x, y, z, ang (tumble angle, rad), dt (s since release) }. Before release dt < 0 and it is where it stood.
import { drift, tOf, Wms } from './timeline.js';
import { clamp } from './util.js';

export const FLY = { cx: 0, cy: 7, cz: 0 };
export function flight(o, v, out = {}) {
  const t = tOf(v), ts = tOf(o.v), dt = t - ts;
  out.dt = dt;
  if (dt <= 0) { out.x = o.x; out.y = o.y; out.z = o.z; out.ang = 0; out.dz = 0; return out; }
  const dz = drift(ts, o.tau, t);
  const s = o.seed * 6.283;
  out.dz = dz;
  out.z = o.z + dz;
  // the avenue channels the flow: things drift a little sideways and toward the middle of the street canyon
  out.x = o.x + Math.sin(dt * (0.6 + o.seed) + s) * Math.min(dt, 2) * 1.2 - Math.sign(o.x) * Math.min(Math.abs(o.x) * 0.3, dt * 1.5) * (o.keep ? 0 : 1);
  // tossed up by the gusts, more as the wind gets stronger; heavy things skip along the ground
  const gust = clamp(Wms(t) / 120);
  const L = (o.lift || 2) * (0.35 + 0.65 * gust);
  const hop = Math.abs(Math.sin(dt * (1.6 + o.seed * 1.4) + s));
  const fallIn = Math.exp(-dt * 1.8);
  out.y = Math.max(o.ground ?? 0, (o.y - (o.ground ?? 0)) * fallIn + L * (1 - Math.exp(-dt / 0.5)) * (0.25 + 0.75 * hop));
  out.ang = dz / Math.max(o.r || 1, 0.2) * 0.5 + dt * 1.5;
  {
    const near = Math.exp(-Math.pow((out.z - FLY.cz) / 18, 2));
    const clear = 4 + (o.r || 1) * 0.8;
    const dx = out.x - FLY.cx, dy = out.y - FLY.cy;
    const d = Math.hypot(dx, dy);
    if (near > 0.01 && d < clear) { const k = (clear - d) * near; out.x += (dx >= 0 ? 1 : -1) * k; out.y = Math.max(o.ground ?? 0, out.y - (dy < 0 ? k * 0.5 : -k * 0.3)); }
  }
  return out;
}
