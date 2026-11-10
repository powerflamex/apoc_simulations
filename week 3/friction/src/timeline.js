// "What if friction disappeared?" — the story as functions of VIDEO time v (seconds).
// You are at the top of a steep San Francisco street (a 19% grade, 92 m above the bay over 480 m), looking down it to
// the bay at golden hour. Friction vanished T0 s before the first frame and never comes back.
// What friction does, and what happens without it (story time t since it vanished):
//   - standing and walking need grip: everyone's feet slide out at once; nobody can get up again
//   - anything on a slope slides: a = g sin θ = 1.8 m/s² downhill (4 mph faster every second), held back only by
//     the air (terminal speeds: a person ~55 mph, a car ~150 mph); on flat ground nothing slows down
//   - brakes, tyres and the cable car's grip on its cable are all friction: the cable car (going up at 9.5 mph)
//     stops and slides back down; parked cars slide; moving cars can't stop or steer
//   - from the crest (500 m up) a car reaches the bottom after ~24 s at ~85 mph; everything shoots across the flat
//     waterfront and off the seawall into the bay
//   - nuts and bolts unscrew (a thread only holds by friction): street lamps topple; nails slide out (a nail only
//     holds by friction): the wooden Victorian houses rack sideways and fold down the hill, far ones first
//   - sand and soil only hold a slope by friction: the ground cracks, and the top 6 m of the hillside slides
//     down as one slab with everything on it, you included; its front rides over the lower street and pours into
//     the bay at ~48 s, and you go over the seawall into the bay at 1:00 (story time), at ~90 mph.
// Then deep, muddy water, which clears onto the first frame (the video loops).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;             // everything here runs on the video clock
export const T0 = 0.8;                    // friction vanished this long before the first frame
export const tOf = (v) => v + T0;         // story time (since friction vanished)
export const vOf = (t) => t - T0;

// ---- the ground: the street rises south (-z) from the flat waterfront at a 19% grade to the crest ----
export const GRADE = 0.19;
export const SIN = GRADE / Math.hypot(1, GRADE);
export const COS = 1 / Math.hypot(1, GRADE);
export const AZ = 9.81 * SIN * COS;      // 1.80 m/s²: how fast things speed up downhill (along z)
export const Z_FOOT = -14;               // where the slope starts (the south side of Beach St)
export const Z_EDGE = 36;                // the seawall: beyond it, the bay
export const WATER_Y = -2.4;
export const S1 = 482, RR = 20;           // the slope runs 482 m up from the foot, then rounds over 20 m onto the flat top
const FOOT_R = 3;                          // the foot of the slope is rounded over a few metres
export function hill(z) {
  const s = Z_FOOT - z;                    // distance up the slope
  if (s <= 0) return 0;
  if (s < 2 * FOOT_R) return GRADE * s * s / (4 * FOOT_R);
  if (s < S1) return GRADE * (s - FOOT_R);
  if (s < S1 + RR) return GRADE * (S1 - FOOT_R) + GRADE * (s - S1) * (1 - (s - S1) / (2 * RR));
  return GRADE * (S1 - FOOT_R + RR / 2);
}
export const H_TOP = hill(-600);          // 92.9 m

// ---- sliding without friction (closed form) ----
// From rest on the slope, held back by air drag only (terminal speed vt): u = vt tanh(a t / vt),
// s = vt²/a ln cosh(a t / vt). On the flat it coasts, slowed only by the air: u = u0 / (1 + k u0 t), k = a / vt².
const lncosh = (x) => { const a = Math.abs(x); return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2; };
export const slideS = (tau, vt) => (tau <= 0 ? 0 : vt * vt / AZ * lncosh(AZ * tau / vt));
export const slideU = (tau, vt) => (tau <= 0 ? 0 : vt * Math.tanh(AZ * tau / vt));
const tauToGo = (L, vt) => vt / AZ * Math.acosh(Math.exp(Math.min(L * AZ / (vt * vt), 300)));
// Where a thing let go at story time ts from z0 is at story time t (moving toward +z, downhill).
//   o = { z0, ts, vt, u0 (initial speed along +z, optional), float (s it stays up in the bay) }.
//   Something moving uphill (u0 < 0) first coasts to a stop (drag ignored: it is slow); something already moving
//   downhill is treated as if it had started from rest a little earlier, higher up.
//   Returns { z, y, u, phase: 0 slope / 1 flat / 2 air / 3 water, dt (s in this phase) }.
export function slide(o, t, out = {}) {
  const tau = t - o.ts;
  out.phase = 0; out.dt = tau;
  const u0 = o.u0 || 0;
  if (tau <= 0) { out.z = o.z0; out.y = hill(o.z0); out.u = u0; return out; }
  const k = AZ / (o.vt * o.vt);
  let zf, tf, uf;                     // reaching the foot (tf: time since ts)
  if (o.z0 >= Z_FOOT) { zf = o.z0; tf = 0; uf = u0; }
  else {
    let zr = o.z0, tr = 0, off = 0;   // the equivalent start from rest: at zr, tr after ts, already off s into it
    if (u0 < 0) {
      const ts2 = -u0 / AZ;
      if (tau < ts2) { out.z = o.z0 + u0 * tau + 0.5 * AZ * tau * tau; out.y = hill(out.z); out.u = u0 + AZ * tau; return out; }
      zr = o.z0 - u0 * u0 / (2 * AZ); tr = ts2;
    } else if (u0 > 0) {
      off = o.vt / AZ * Math.atanh(Math.min(u0 / o.vt, 0.995));
      zr = o.z0 - slideS(off, o.vt);
    }
    const L = Z_FOOT - zr;
    const tAll = tauToGo(L, o.vt);              // from the virtual rest to the foot
    tf = tr + tAll - off; uf = slideU(tAll, o.vt); zf = Z_FOOT;
    if (tau < tf) {
      const q = tau - tr + off;
      out.z = zr + slideS(q, o.vt); out.y = hill(out.z); out.u = slideU(q, o.vt); return out;
    }
  }
  // the flat: coasting toward the seawall
  const t1 = tau - tf;
  const ue = Math.max(uf, 0.05);
  const tEdge = (Math.exp(k * Math.max(Z_EDGE - zf, 0)) - 1) / (k * ue);
  if (t1 < tEdge || ue < 0.06) {
    out.phase = 1; out.dt = t1;
    out.z = zf + Math.log1p(k * ue * t1) / k; out.y = 0; out.u = ue / (1 + k * ue * t1);
    if (ue < 0.06) { out.z = zf; out.u = 0; }
    return out;
  }
  // off the seawall and down into the bay
  const t2 = t1 - tEdge, uE = ue / (1 + k * ue * tEdge);
  const tW = Math.sqrt(2 * -WATER_Y / 9.81);
  if (t2 < tW) { out.phase = 2; out.dt = t2; out.z = Z_EDGE + uE * t2; out.y = -4.905 * t2 * t2; out.u = uE; return out; }
  const t3 = t2 - tW;
  out.phase = 3; out.dt = t3;
  out.z = Z_EDGE + uE * tW + uE * 0.9 * (1 - Math.exp(-t3 / 0.9));
  out.u = uE * Math.exp(-t3 / 0.9);
  out.y = WATER_Y - 0.6 * smooth(0, 1.5, t3) - Math.max(0, t3 - (o.float ?? 3)) * 0.5;
  return out;
}
// story time when something let go at ts from z0 goes over the seawall
export function tSeawall(z0, ts, vt) {
  const k = AZ / (vt * vt);
  const L = Z_FOOT - z0, tf = L > 0 ? tauToGo(L, vt) : 0, uf = L > 0 ? slideU(tf, vt) : 0;
  return ts + tf + (Math.exp(k * (Z_EDGE - Math.max(z0, Z_FOOT))) - 1) / (k * Math.max(uf, 0.05));
}

export const VT = { person: 25, car: 66, cable: 80, debris: 22, lamp: 30 };   // terminal speeds (m/s)

// ---- the hillside slides (sand and soil can't hold a slope) ----
export const SLAB = { head: -760, toe: -164, th: 6, vt: 63 };   // the slab that lets go: the whole top, down to its toe
export const V_CRACK = 32.4;                              // the street cracks across
export const V_SLIDE = 33.2;                              // the slab starts to move (held back by the air and by
                                                          // churning: terminal speed vt, so you go in at story 1:00)
// how far the slab has slid (m, downhill) at video time v
export const slabD = (v) => slideS(Math.max(0, v - V_SLIDE), SLAB.vt);
export const slabU = (v) => slideU(Math.max(0, v - V_SLIDE), SLAB.vt);
export const frontZ = (v) => SLAB.toe + slabD(v);         // where its front (the earth riding over the street) is
// The ground's height at z (the same in ground.js's shader): the hill, plus the slab where it has ridden out over
// the street below its old toe (6 m thick, a rounded nose of churned earth at its front). The nose stops at the
// seawall: past it the earth pours into the bay.
export function surfaceY(z, D) {
  let y = hill(z);
  if (D <= 0) return y;
  const front = Math.min(SLAB.toe + D, Z_EDGE + 1);
  const grow = Math.min(1, D / 25);
  const ride = smooth(SLAB.toe, SLAB.toe + 25, z) * (1 - smooth(front - 10, front + 0.5, z));
  const nose = 2.4 * Math.exp(-(((z - (front - 8)) / 4.5) ** 2)) * smooth(10, 30, D) * (z < Z_EDGE + 0.5 ? 1 : 0);
  return y + SLAB.th * grow * ride + nose;
}
// Something resting on the slab at z0 (its old place) at video time v: where it is, riding down with the hill, and
// off the seawall into the bay. Returns { z, y, phase: 0 riding / 2 falling / 3 in the water, dt }.
export function ride(z0, v, out = {}) {
  const D = slabD(v);
  const z = z0 + D;
  out.phase = 0; out.dt = 0;
  if (z <= Z_EDGE) { out.z = z; out.y = surfaceY(z, D); out.u = slabU(v); return out; }
  // over the edge: it left the seawall at the slab's speed then, from the top of the earth (6 m up)
  let lo = V_SLIDE, hi = v;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (z0 + slabD(m) > Z_EDGE) hi = m; else lo = m; }
  const vE = hi, uE = slabU(vE), tau = v - vE, y0 = surfaceY(Z_EDGE - 0.1, slabD(vE));
  const tW = (Math.sqrt(2 * 9.81 * (y0 - WATER_Y)) ) / 9.81;
  if (tau < tW) { out.phase = 2; out.dt = tau; out.z = Z_EDGE + uE * tau; out.y = y0 - 4.905 * tau * tau; out.u = uE; return out; }
  const t3 = tau - tW;
  out.phase = 3; out.dt = t3;
  out.z = Z_EDGE + uE * tW + uE * 1.2 * (1 - Math.exp(-t3 / 1.2));
  out.y = WATER_Y - 3 * smooth(0, 2, t3);
  out.u = uE * Math.exp(-t3 / 1.2);
  return out;
}
// Something standing on the street below the slab's toe (not riding it): the front bulldozes it ahead of its nose.
export function bulldoze(z0, v) {
  const f = frontZ(v);
  return f + 2 > z0 ? f + 2 - z0 : 0;     // how far it has been shoved downhill (m)
}

// ---- the big moments (video time) ----
export const V_YOU = 0.35;                 // your feet go
export const V_BOLTS = 15.2;               // nuts work loose: the street lamps start to topple
export const V_NAILS = 20.5;               // nails slide out: the first houses rack (low down first, yours last)
export const V_TOE_BAY = 48.3;             // the slab's front pours into the bay
export const V_PLUNGE = vOf(60.0);         // you go over the seawall (story 1:00)
export const T_SWITCH = 60.0;              // deep water; the loop point sits in it
export const LOOP = 1.0;                   // the water clears onto the first frame over the last LOOP seconds
export const VIDEO_DURATION = T_SWITCH + LOOP;
export const UNDER_COLOR = '#08201c';

// the fastest thing on the hill: a car let go at the crest (until it reaches the bottom)
const L_TOP = S1 - 6;
const T_TOP = tauToGo(L_TOP, VT.car);
export const topSpeed = (v) => slideU(Math.min(tOf(v), T_TOP), VT.car) * 2.23694;   // mph
export const vAtMph = (mph) => { const u = mph / 2.23694; return vOf(VT.car / AZ * Math.atanh(Math.min(u / VT.car, 0.999))); };
export const TOP_MPH = topSpeed(99);

// the beats: every 10 mph the fastest car gains, then the big failures
export const BEATS = [20, 30, 40, 50, 60, 70, 80].map((m) => ({ v: vAtMph(m), text: `${m} mph`, label: 'SLIDING AT' }))
  .filter((b) => b.v < V_NAILS + 0.4)
  .concat([
    { v: V_NAILS + 0.6, text: 'nails', label: 'SLIDING OUT', small: true },
    { v: 27.0, text: 'houses', label: 'FALLING', small: true },
    { v: V_CRACK + 0.2, text: 'the ground', label: 'CRACKING', small: true },
  ])
  .concat([30, 40, 50, 60, 70, 80].map((m) => ({ v: V_SLIDE + SLAB.vt / AZ * Math.atanh(m / 2.23694 / SLAB.vt), text: `${m} mph`, label: 'THE HILL IS SLIDING AT' })));
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}

export const CAPTIONS = [
  [3.9, 6.3, 'Friction vanished. Nobody can stand.'],
  [6.5, 8.9, 'Brakes and tyres are friction too.'],
  [9.1, 11.5, 'The cable car can’t grip its cable.'],
  [11.7, 14.1, 'Every second, 4 mph faster.'],
  [14.3, 16.7, 'Nothing slows down. Nothing stops.'],
  [16.9, 19.3, 'A bolt only holds by friction.'],
  [19.5, 21.9, 'It all ends up in the bay.'],
  [23.6, 26.0, 'The cable car hits it at 85 mph.'],
  [26.2, 28.6, 'Nails slide out. The houses fold.'],
  [28.8, 31.6, 'You can’t get up. You can’t even crawl.'],
  [32.4, 34.8, 'Then the ground cracks.'],
  [35.0, 37.4, 'Sand only holds a slope by friction.'],
  [37.6, 40.0, 'The whole hillside starts to slide.'],
  [40.2, 42.6, 'With you on it.'],
  [42.8, 45.2, 'Millions of tons of earth.'],
  [45.4, 47.8, 'It speeds up just like the cars did.'],
  [48.0, 50.4, 'Its front pours into the bay.'],
  [50.6, 53.0, 'You’re going 70 mph.'],
  [53.2, 55.6, 'There is nothing to hold on to.'],
  [55.8, 58.4, 'One minute without friction.'],
];

export function captionAt(v) {
  for (const [a, b, text] of CAPTIONS) {
    if (v >= a - 0.01 && v <= b + 0.01) {
      const fadeIn = clamp((v - a) / 0.35);
      const fadeOut = clamp((b - v) / 0.35);
      return { text, alpha: Math.min(fadeIn, fadeOut), rise: (1 - fadeIn) * 14 };
    }
  }
  return null;
}

// ---- the counter: how long friction has been gone, racing to the finish line ----
const pad = (n, w = 2) => String(n).padStart(w, '0');
function stage(v) {
  const notes = [[-9, 'NOBODY CAN STAND'], [3.5, 'EVERYTHING SLIDES'], [8.7, 'NOTHING CAN BRAKE'], [V_BOLTS, 'BOLTS UNSCREW'],
    [V_NAILS, 'NAILS SLIDE OUT'], [V_CRACK, 'THE GROUND CRACKS'], [V_SLIDE + 1.5, 'THE HILL IS SLIDING']];
  let n = '';
  for (const [m, t] of notes) if (v >= m) n = t;
  return n;
}
export const COUNTERS = [
  {
    from: -3, to: T_SWITCH + 2, label: 'NO FRICTION FOR',
    fmt: (t) => { const c = Math.floor(Math.max(0, t) * 100); return `${Math.floor(c / 6000)}:${pad(Math.floor(c / 100) % 60)}.${pad(c % 100)}`; },
    value: (v) => tOf(v),
    unit: (v) => {
      const top = v < V_NAILS ? `FASTEST CAR ${Math.round(topSpeed(v))} mph` : v < V_SLIDE + 1.5 ? '' : `${Math.round(slabU(v) * 2.23694)} mph`;
      return [stage(v), top].filter(Boolean).join(' · ');
    },
    badge: () => 'YOU REACH THE BAY AT 1:00',   // the finish line the clock races toward
  },
];

// ---- state ----
export function state(v) {
  const s = { v };
  s.t = tOf(v);
  s.D = slabD(v);
  s.front = frontZ(v);
  s.U = slabU(v);
  s.crack = smooth(V_CRACK - 0.3, V_SLIDE + 1, v);
  // dust from the falling houses, then the moving hillside
  s.dust = 0.12 * smooth(V_NAILS, 30, v) + 0.22 * smooth(V_SLIDE, 55, v);
  s.grid = 1 - smooth(V_NAILS + 4, V_NAILS + 12, v);     // the lights go as the houses come down
  s.shake = 0.15 * smooth(V_NAILS, 30, v) + 0.85 * smooth(V_CRACK - 0.5, 56, v);
  s.under = v >= V_PLUNGE + 0.42 ? 1 : 0;      // (the camera dives in after you, main.js)
  s.flash = v >= V_PLUNGE + 0.42 ? smooth(V_PLUNGE + 0.42, V_PLUNGE + 0.7, v) : 0;
  s.flashColor = UNDER_COLOR;
  s.title = 1 - smooth(3.0, 3.8, v);
  s.you = 1 - smooth(5.6, 6.4, v);
  s.endcard = 0; s.endText = 0; s.fadeOut = 0;
  return s;
}
