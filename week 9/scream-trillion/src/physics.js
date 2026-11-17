// A thrown thing as a pure function of time: launched at t0 from p with velocity vel, it flies (gravity) until its
// centre comes down to height hs, then slides to a stop (deceleration D). Walls at |x| = wallX stop it.
// out: { x, y, z, f (0..1 of the flight done), landed, t (s since launch) }.
const G = 9.81;
export function throwAt(T, v, out) {
  const t = v - T.t0;
  out.t = t;
  if (!(t > 0)) { out.x = T.p[0]; out.y = T.p[1]; out.z = T.p[2]; out.f = 0; out.landed = false; return out; }
  const [vx, vy, vz] = T.vel;
  const tl = T.tl ?? (T.tl = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(T.p[1] - T.hs, 0))) / G);
  let x, z, y;
  if (t < tl) {
    x = T.p[0] + vx * t; z = T.p[2] + vz * t; y = T.p[1] + vy * t - 0.5 * G * t * t;
    out.f = tl > 0 ? t / tl : 1; out.landed = false;
  } else {
    const vh = Math.hypot(vx, vz), D = T.D ?? 6, ts = vh / D, s = Math.min(t - tl, ts);
    const d = vh * s - 0.5 * D * s * s;
    x = T.p[0] + vx * tl + (vh > 0 ? vx / vh * d : 0); z = T.p[2] + vz * tl + (vh > 0 ? vz / vh * d : 0); y = T.hs;
    out.f = 1; out.landed = true; out.slide = ts > 0 ? s / ts : 1;
  }
  if (T.wallX) x = Math.max(-T.wallX, Math.min(T.wallX, x));
  out.x = x; out.y = y; out.z = z;
  return out;
}
