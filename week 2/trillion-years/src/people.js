// The people on the promenade, as a pure function of story time. Walkers stream along seven lanes (one passer-by
// per cycle of a slot, each with their own clothes; slots in a lane share a speed and are evenly spaced, so nobody
// ever walks through anybody); people stop at the railing for a few minutes to watch the sunset and leave again.
// Fewer at night. At 40x real time they hurry past; as the time-lapse speeds up they become passing glimpses, and
// once a frame spans days they are gone from the picture (s.crowd). You stand at the railing the whole time.
import { LANES, RAIL_SPOTS, YOU, coastX } from './layout.js';
import { SKIN, HAIR } from './crowd.js';
import { rng } from './util.js';

const SHIRT = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1c2833, 0xd35400, 0x16a085, 0xf5b7b1, 0x5d6d7e, 0xfad7a0, 0x922b21, 0x1f618d, 0xe8daef, 0xffffff, 0x111111];
const PANTS = [0x1b2631, 0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x7f8c8d, 0x2e4053, 0xd5c4a1, 0x4a6fa5];
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7 + 0.13) * 43758.5453; return x - Math.floor(x); };
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// how busy the promenade is at a given clock time (minutes after midnight)
const TOD0 = 17 * 60 + 47;     // the first frame: 23 minutes before an equinox sunset (18:10)
export const clockAt = (T) => (((TOD0 + T) % 1440) + 1440) % 1440;
const busy = (tod) => {
  const h = tod / 60;
  if (h < 6) return 0.06;
  if (h < 9) return 0.06 + (h - 6) / 3 * 0.5;
  if (h < 17) return 0.6;
  if (h < 20) return 0.95;
  if (h < 23) return 0.95 - (h - 20) / 3 * 0.75;
  return 0.2 - (h - 23) * 0.14;
};

export const SLOTS = [];
LANES.forEach((L, li) => { for (let j = 0; j < L.n; j++) SLOTS.push({ kind: 'walk', L, li, j, off: (j + 0.3 * hash(li, j)) / L.n }); });
RAIL_SPOTS.forEach((r, i) => SLOTS.push({ kind: 'rail', r, i }));
export const YOU_COL = [0xf2c14e, 0x2c3e50, 0xe0ac86, 0x2e2018];
export const NPEOPLE = SLOTS.length + 1;   // the last one is you

// fills poses[i] (crowd.pose fields) and colours (when a slot's person changes) for story time T (minutes)
export function peopleFrame(s, crowd, colorCache) {
  const ts = s.T * 60;            // story seconds
  let i = 0;
  for (const sl of SLOTS) {
    let o = null, who = 0;
    if (sl.kind === 'walk') {
      const L = sl.L, P = L.len / L.speed;
      const c = ts / P + sl.off + L.seed;
      const cyc = Math.floor(c), f = c - cyc;
      who = cyc * 31 + sl.li * 7 + sl.j * 1000;
      const on = hash(cyc, sl.li * 13 + sl.j) < busy(clockAt(s.T - (f * P) / 60)) && hash(cyc, 99 + sl.j) < s.crowd;
      if (on) {
        const z = L.dir < 0 ? L.z0 - f * L.len : L.z1 + f * L.len;
        const d = f * L.len;
        const yaw = L.dir < 0 ? Math.PI : 0;
        o = { x: coastX(z) + L.u, y: 0, z, yaw, s: 0.92 + 0.14 * hash(who, 3), walk: d / 0.75 * Math.PI + hash(who, 4) * 6, stride: 1 };
        if (hash(who, 5) < 0.18) { o.armR = 1.0; o.look = 0.12; }
      }
    } else {
      const r = sl.r, P = (r.stay + r.every) * 60;
      const c = ts / P + r.seed;
      const cyc = Math.floor(c), f = c - cyc;
      who = cyc * 53 + sl.i * 977 + 5;
      const on = f * P < r.stay * 60 && hash(cyc, sl.i) < busy(clockAt(s.T)) && hash(cyc, 77 + sl.i) < s.crowd;
      if (on) {
        o = { x: coastX(r.z) + 0.85 + 0.2 * hash(who, 6), y: 0, z: r.z, yaw: Math.PI + (hash(who, 7) - 0.5) * 0.5, s: 0.92 + 0.14 * hash(who, 3), look: 0.05 };
        const pose = hash(who, 8);
        if (pose < 0.3) { o.armR = 1.05; o.look = 0.1; }               // filming the sunset
        else if (pose < 0.55) { o.armL = 0.45; o.armR = 0.45; }        // leaning on the railing
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
  // you: at the railing, looking out to sea, the whole time
  if (colorCache[i] !== -1) { colorCache[i] = -1; crowd.color(i, ...YOU_COL); }
  crowd.pose(i, youPose(s));
  crowd.commit();
}
export function youPose(s) {
  // a slow breath and a small shift of weight now and then (only noticeable in real time)
  const b = s.E < 0.05 ? Math.sin(s.T * 60 * 0.9) * 0.012 : 0;
  return { x: YOU.x, y: s.youY || 0, z: YOU.z, yaw: Math.PI - 0.12, s: 1.0, pitch: b, armL: 0.08, armR: 0.08, look: 0.08 };
}
