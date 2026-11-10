// Where everything is (metres). x to the right, y up, z toward you: you stand on a harbour promenade at night (a
// Hong Kong-style waterfront) looking south across the water (-z) at a lit skyline, the full Moon low over it.
//   The deck is y = 0 out to its edge at z = -10; from there wide stone terraces (0.22 m high, 1.8 m deep) go down into
//   the harbour. Mean sea level is 2.1 m below the deck; the tide swings it 1.25 m up and down.
//   The far shore is 1.45 km away, the towers from 1.55 to 2.5 km, the mountain behind them at ~4 km (550 m high).
export const CAM0 = { x: 0, y: 1.62, z: 0 };
export const EDGE_Z = -10;
export const STEP_H = 0.22, STEP_D = 1.8, STEPS = 22;    // (wide, low terraces: from the crowd you can see the water climb them)
export const SEA0 = -2.1;            // mean sea level (deck = 0)
export const TIDE_A = 1.25;          // the tide: up and down this much (Hong Kong's range is ~2.5 m at springs)
export const SHORE_Z = -1450;        // the far shore's waterline

// the ground under you: the deck, then the steps going down
export function deckY(z) {
  if (z >= EDGE_Z) return 0;
  const k = Math.min(STEPS, Math.ceil((EDGE_Z - z) / STEP_D - 1e-6));
  return -STEP_H * k;
}

// the lamps along the edge (posts 4.6 m high with a warm globe)
export const LAMPS = [];
for (let x = -105; x <= 105; x += 15) LAMPS.push({ x: x + 7.5, z: EDGE_Z + 0.6 });
// benches, back from the edge (people stand around them)
export const BENCHES = [];
for (let x = -96; x <= 96; x += 12) if (Math.abs(x) > 5) BENCHES.push({ x, z: 5.5 });

// ---- across the water ----
// the far side's ground: flat along the shore, then up the mountain to a ridge ~4 km away
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ridgeH = (x) => 420 + 110 * Math.sin(x / 700 + 1.1) + 60 * Math.sin(x / 290 + 0.4) + 25 * Math.sin(x / 97);
export const ridgeZ = (x) => -4100 + 280 * Math.sin(x / 900 + 0.3);
export function farY(x, z) {
  if (z > -2250) return 2;
  const zr = ridgeZ(x), H = ridgeH(x);
  if (z > zr) return 2 + (H - 2) * Math.pow(sm(-2250, zr, z), 1.15);
  return H * (1 - 0.45 * sm(zr, zr - 2500, z));
}
// the towers: { x, z (centre), w (along x), d (along z), h, base (ground y), style, seed, row }
//   style 0 punched windows, 1 curtain glass (lit floor bands), 2 LED stripes, 3 neon podium, 4 diagonal light lines
function rand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const TOWERS = [];
{
  const R = rand(1997);
  const add = (t) => TOWERS.push({ seed: R(), row: 0, ...t });
  const clash = (x, z, w, d) => TOWERS.some((t) => Math.abs(t.x - x) < (t.w + w) / 2 + 6 && Math.abs(t.z - z) < (t.d + d) / 2 + 6);
  // the landmarks (no real buildings copied: just the kinds of towers this skyline has)
  add({ x: 150, z: -1650, w: 56, d: 56, h: 412, style: 1, crown: 1 });     // the tallest, a crown of light
  add({ x: -285, z: -1770, w: 50, d: 50, h: 367, style: 4 });              // lines of light in an X
  add({ x: -55, z: -1930, w: 44, d: 44, h: 346, style: 1, crown: 1 });
  add({ x: 430, z: -1720, w: 40, d: 46, h: 296, style: 2 });
  add({ x: -560, z: -1660, w: 44, d: 40, h: 270, style: 0 });
  add({ x: 300, z: -2050, w: 40, d: 40, h: 300, style: 2 });
  // the waterfront: low podiums with neon on them
  for (let x = -1500; x < 1500; x += 30 + R() * 40) {
    const w = 26 + R() * 34, d = 22 + R() * 20, z = -1475 - d / 2 - R() * 10;
    if (Math.abs(x + 420) < 45) continue;                                  // (the wheel)
    if (!clash(x, z, w, d)) add({ x, z, w, d, h: 14 + R() * 28, style: 3 });
  }
  // the towers behind: taller in the middle, rows going back up the slope (on the mountain they stand on the ground)
  for (let k = 0; k < 2600 && TOWERS.length < 300; k++) {
    const x = (R() * 2 - 1) * 1700, z = -1560 - Math.pow(R(), 1.3) * 1500;
    const w = 26 + R() * 26, d = 26 + R() * 26;
    if (clash(x, z, w, d)) continue;
    const mid = Math.exp(-Math.pow(x / 750, 2));
    const back = z < -2300;
    let h = (back ? 70 + R() * 110 : 90 + R() * 150 + 130 * mid * R()) * (1 - 0.35 * Math.min(1, Math.abs(x) / 1700));
    const base = farY(x, z);
    const style = R() < 0.32 ? 1 : R() < 0.18 ? 2 : 0;
    add({ x, z, w, d, h, base, style, row: back ? 2 : 1 });
  }
  for (const t of TOWERS) if (t.base === undefined) t.base = 2;
}
export const WHEEL = { x: -420, z: -1500, y: 36, r: 30 };

// The Moon: low in the south over the skyline, a little right of the middle of the view
export const MOON_AZ = 3.2, MOON_EL = 15.2;     // degrees (az: + to the right of straight ahead)
// The Moon's orbit crosses the sky from the Moon's spot up to the upper right (on the screen, 28° from the horizon: the
// ring arches across the sky over the skyline instead of rising out of it like a searchlight beam)
export const ORBIT_TILT = 28;
