// The people on the terrace at dusk, as a pure function of story time. Walkers stroll along nine lanes parallel to
// the railing (one passer-by per cycle of a slot, each with their own clothes; slots in a lane share a speed and are
// evenly spaced, so nobody ever walks through anybody); people stop at the railing for a few minutes to watch the
// sunset over the city and leave again. Once time races they are gone from the picture (s.crowd). You stand at the
// railing the whole time; when Earth evaporates you float up off the terrace.
import { LANES, RAIL_SPOTS, YOU, TERRACE } from './layout.js';
import { SKIN, HAIR } from './crowd.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7 + 0.13) * 43758.5453; return x - Math.floor(x); };
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

export const SLOTS = [];
LANES.forEach((L, li) => { for (let j = 0; j < L.n; j++) SLOTS.push({ kind: 'walk', L, li, j, off: (j + 0.3 * hash(li, j)) / L.n }); });
RAIL_SPOTS.forEach((r, i) => SLOTS.push({ kind: 'rail', r, i }));
export const YOU_COL = [0xf2c14e, 0x2c3e50, 0xe0ac86, 0x2e2018];
export const NPEOPLE = SLOTS.length + 1;   // the last one is you

export function peopleFrame(s, crowd, colorCache) {
  const ts = s.T * 60;            // story seconds
  let i = 0;
  for (const sl of SLOTS) {
    let o = null, who = 0;
    if (s.crowd > 0.01) {
      if (sl.kind === 'walk') {
        const L = sl.L, len = L.x1 - L.x0, P = len / L.speed;
        const c = ts / P + sl.off + L.seed;
        const cyc = Math.floor(c), f = c - cyc;
        who = cyc * 31 + sl.li * 7 + sl.j * 1000;
        const on = hash(cyc, sl.li * 13 + sl.j) < 0.72 && hash(cyc, 99 + sl.j) < s.crowd;
        if (on) {
          const x = L.dir < 0 ? L.x1 - f * len : L.x0 + f * len;
          o = { x, y: 0, z: L.z, yaw: L.dir < 0 ? -Math.PI / 2 : Math.PI / 2, s: 0.92 + 0.14 * hash(who, 3), walk: f * len / 0.75 * Math.PI + hash(who, 4) * 6, stride: 1 };
          if (hash(who, 5) < 0.18) { o.armR = 1.0; o.look = 0.12; }
        }
      } else {
        const r = sl.r, P = (r.stay + r.every) * 60;
        const c = ts / P + r.seed;
        const cyc = Math.floor(c), f = c - cyc;
        who = cyc * 53 + sl.i * 977 + 5;
        const on = f * P < r.stay * 60 && hash(cyc, sl.i) < 0.8 && hash(cyc, 77 + sl.i) < s.crowd;
        if (on) {
          o = { x: r.x + 0.2 * (hash(who, 6) - 0.5), y: 0, z: TERRACE.z0 + 0.75 + 0.2 * hash(who, 6), yaw: Math.PI + (hash(who, 7) - 0.5) * 0.6, s: 0.92 + 0.14 * hash(who, 3), look: -0.1 };
          const pose = hash(who, 8);
          if (pose < 0.3) { o.armR = 1.05; o.look = 0.05; }              // filming the sunset
          else if (pose < 0.55) { o.armL = 0.42; o.armR = 0.42; }        // leaning on the parapet
        }
      }
    }
    if (o) {
      if (colorCache[i] !== who) {
        colorCache[i] = who;
        crowd.color(i, pick(SHIRT, hash(who, 1)), pick(PANTS, hash(who, 2)), pick(SKIN, hash(who, 9)), pick(HAIR, hash(who, 10)));
      }
      crowd.pose(i, o);
    } else crowd.pose(i, { visible: false, x: 0, y: 0, z: 0 });
    i++;
  }
  if (colorCache[i] !== -1) { colorCache[i] = -1; crowd.color(i, ...YOU_COL); }
  crowd.pose(i, youPose(s));
  crowd.commit();
}
export function youPose(s) {
  const b = s.E < 0.05 ? Math.sin(s.T * 60 * 0.9) * 0.012 : 0;
  const fl = Math.min(1, Math.max(0, s.youY || 0) / 3);   // floating: arms drift out, the body turns slowly
  return { x: YOU.x, y: s.youY || 0, z: YOU.z + 0.15, yaw: Math.PI - 0.08 + 0.5 * fl * Math.sin(s.v * 0.05), s: 1.0, pitch: b - 0.1 * fl, armL: 0.08 + 0.55 * fl, armR: 0.08 + 0.6 * fl, look: 0.05 + 0.3 * (s.lookUp || 0) };
}
