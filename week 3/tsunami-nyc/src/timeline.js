// "What if a 1,000 ft tsunami hit New York?" — the story as functions of VIDEO time v (seconds).
// You are at the railing of the promenade at the Battery, the southern tip of Manhattan, at sunset, looking south
// across Upper New York Bay to the Statue of Liberty. A tsunami is already crossing the bay toward you. Real time.
//   - Ahead of a tsunami the sea runs out: the harbor drains (down 12 m), boats settle on the mud.
//   - The wave is a moving wall of water (a bore) on the shallow harbor. Its speed is about √(g·(H + depth)):
//     ~56 m/s (125 mph) for a 300 m wall on 15 m of water. It starts 3.3 km out (2 miles), 600 ft tall, and grows as
//     the water gets shallower, to 1,000 ft (305 m) at the seawall. 3,300 m / 56 m/s = 59 s.
//   - It passes the Statue of Liberty (93 m to the torch, 2.4 km out) at ~16 s: three times as tall as she is;
//     the Staten Island Ferry at ~31 s; Governors Island (1 km) at ~41 s; Jersey City's towers at ~47 s.
//   - Nearly every tower in Manhattan is shorter than 1,000 ft (One World Trade's roof is 1,368 ft).
// It hits you at V_HIT: the foam whites out the frame (the loop point sits in it), which clears onto the first frame.
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FT = 0.3048;
export const SPEED = 56;                    // m/s: the wall's speed across the harbor (125 mph)
export const V_HIT = 59.0;                  // it reaches the seawall (z = 0)
export const D0 = SPEED * V_HIT;            // 3.3 km: where it is at the first frame
export const WATER0 = -2.5;                 // the harbor's normal level, below the promenade
export const frontZ = (v) => -SPEED * (V_HIT - v);              // the wall's foot (z: north +, it comes from -z)
export const distAt = (v) => Math.max(0, SPEED * (V_HIT - v));  // metres away
// its height (m): 600 ft at 2 miles out, 1,000 ft at the seawall (it grows as the water shoals)
export const heightAt = (v) => FT * (1000 - 400 * clamp(distAt(v) / D0));
// the sea running out ahead of it: how far the harbor has dropped (m) at video time v
export const drainAt = (v) => 7 + 6 * smooth(-4, 20, v);

// ---- the big moments ----
export const LIBERTY = { x: 343, z: -2441 };          // (straight ahead, a little right: layout.js)
export const GOVERNORS = { x: -820, z: -980 };
export const FERRY = { x: 300, z: -1720 };            // the Staten Island Ferry, heading for the slip on the left
export const vAtZ = (z) => V_HIT + z / SPEED;          // when the wall's foot reaches z
export const V_LIBERTY = vAtZ(LIBERTY.z + 30);        // 16 s: the foot reaches her
export const FERRY_U = 8;                              // m/s toward the slip (16 knots)
// where the ferry's bow meets the wall: -1720 + 8 v = -56 (59 - v)
export const V_FERRY = (FERRY.z + SPEED * V_HIT) / (SPEED - FERRY_U);
export const V_GOV = vAtZ(GOVERNORS.z + 250);         // ~46 s
export const V_JERSEY = vAtZ(-150);
export const T_SWITCH = 59.6;                         // the foam has covered everything: the loop point sits in it
export const LOOP = 1.0;
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const FOAM_COLOR = '#f4f7f6';

const ftAt = (v) => heightAt(v) / FT;
export const vAtFt = (ft) => V_HIT - D0 * (1000 - ft) / 400 / SPEED;
// the beats: the wave's height every 100 ft, and what it takes on the way
export const BEATS = [
  { v: 3.6, text: '−30 ft', label: 'THE SEA RUNS OUT', small: true },
  { v: vAtFt(700), text: '700 ft', label: 'THE WAVE IS' },
  { v: V_LIBERTY + 0.2, text: 'Liberty', label: 'SWALLOWED', small: true },
  { v: 22.6, text: 'run', label: 'NOWHERE TO', small: true },
  { v: vAtFt(800), text: '800 ft', label: 'THE WAVE IS' },
  { v: V_FERRY + 0.3, text: 'the ferry', label: 'SWALLOWED', small: true },
  { v: vAtFt(900), text: '900 ft', label: 'THE WAVE IS' },
  { v: V_GOV, text: 'the island', label: 'SWALLOWED', small: true },
  { v: 51.0, text: '¼ mile', label: 'IT IS', small: true },
  { v: 57.0, text: '1,000 ft', label: 'THE WAVE IS' },
];
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}

export const CAPTIONS = [
  [3.9, 6.3, 'You’re in Battery Park, New York.'],
  [6.5, 8.9, 'The sea is running out of the harbor.'],
  [9.1, 11.5, 'That wall on the horizon is water.'],
  [11.4, 13.6, 'It’s coming at 125 mph.'],
  [13.8, 16.4, 'Three times taller than Lady Liberty.'],
  [20.0, 22.4, 'Everyone runs.'],
  [23.2, 25.6, 'It doesn’t matter. It’s 125 mph.'],
  [25.8, 28.2, 'Almost every tower here is shorter.'],
  [29.4, 31.8, 'A mile away. 29 seconds.'],
  [34.0, 36.4, 'The ferry didn’t have a chance.'],
  [37.2, 39.6, 'It grows as the water gets shallow.'],
  [41.0, 43.4, 'It stretches across the whole harbor.'],
  [46.6, 49.0, 'Governors Island is gone.'],
  [51.2, 53.6, 'A quarter mile. Eight seconds.'],
  [53.8, 56.2, 'You’re looking straight up at it.'],
  [56.4, 58.6, '1,000 feet of water.'],
];
export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.35), fadeOut = clamp((b - v) / 0.35);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'IT HITS YOU IN',
    fmt: (t) => { const c = Math.max(0, Math.floor(t * 100)); return `0:${pad(Math.floor(c / 100))}.${pad(c % 100)}`; },
    value: (v) => Math.max(0, V_HIT - v),
    unit: (v) => {
      const mi = distAt(v) / 1609.34;
      const d = mi >= 0.95 ? `${mi.toFixed(1)} MILES` : `${Math.round(distAt(v) / FT).toLocaleString('en-US')} ft AWAY`;
      return `${Math.round(ftAt(v) / 10) * 10} ft TALL · ${d} · 125 mph`;
    },
    badge: () => '1,000 ft TALL WHEN IT HITS',
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.front = frontZ(v);
  s.H = heightAt(v);
  s.drain = drainAt(v);
  s.level = WATER0 - s.drain;
  s.grid = 1; s.dusk = 0.65;
  s.dist = distAt(v);
  // the wall shades the low sun more and more; spray fills the air at the end
  s.shade = smooth(30, 56, v);
  s.spray = smooth(50, V_HIT, v);
  s.shake = 0.1 + 0.4 * smooth(35, 58, v) + 0.5 * smooth(56, V_HIT, v);
  s.flash = smooth(V_HIT - 0.35, V_HIT + 0.25, v);
  s.flashColor = FOAM_COLOR;
  s.title = 1 - smooth(3.0, 3.8, v);
  s.you = 1 - smooth(6.2, 7.0, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
