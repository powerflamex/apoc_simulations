// The story of "What if a black hole passed Earth?" as functions of the video clock v (seconds, 0..VIDEO_DURATION).
// No voice: the phone (notification cards), the giant screens on the avenue, one gold popup per big moment and a few
// short captions tell it. Seven chapters, each a jump closer in time (the stamp says how long is left), each with a
// bigger moment than the last. The first FF_LEN seconds replay V_FF (things falling up into the sky).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const VIDEO_DURATION = 340;
export const FF_LEN = 5.0;
export const V_FF = 286.0;

// which scene is on screen
export const SHOTS = [
  [0, 5, 'street'],
  [5, 24, 'street'],
  [24, 37, 'space', 'neptune'],
  [37, 62, 'street'],
  [62, 78, 'space', 'saturn'],
  [78, 95, 'street'],
  [95, 106, 'highway'],
  [106, 120, 'space', 'jupiter'],
  [120, 150, 'highway'],
  [150, 200, 'street'],
  [200, 252, 'subway'],
  [252, 300, 'street'],
  [300, 331, 'fall'],
  [331, VIDEO_DURATION, 'end'],
];
export function shotAt(v) {
  for (const s of SHOTS) if (v >= s[0] && v < s[1]) return { from: s[0], to: s[1], scene: s[2], what: s[3], u: (v - s[0]) / (s[1] - s[0]) };
  const s = SHOTS[SHOTS.length - 1];
  return { from: s[0], to: s[1], scene: s[2], what: s[3], u: 1 };
}

// the chapters: how long is left when each starts and how fast the clock runs through it (story s per video s)
export const SPEED_MPS = 2_000_000 / 3600;    // the hole moves at 2 million mph
export const PASS_MILES = 26_000;             // how close it passes
export const CHAPTERS = [
  { v: 5, left: 56 * 86400, rate: 1, stamp: '56 DAYS LEFT' },
  { v: 50, left: 19 * 86400, rate: 1, stamp: '19 DAYS LEFT' },
  { v: 95, left: 8 * 86400, rate: 1, stamp: '8 DAYS LEFT' },
  { v: 150, left: 3600, rate: 35, stamp: '1 HOUR LEFT' },
  { v: 200, left: 1800, rate: 26, stamp: '30 MINUTES LEFT' },
  { v: 252, left: 420, rate: 8.6, stamp: '7 MINUTES LEFT' },
  { v: 300, left: 8, rate: 0.26, stamp: null },
];
export function chapterAt(v) {
  let c = CHAPTERS[0], i = 0;
  CHAPTERS.forEach((x, k) => { if (v >= x.v) { c = x; i = k; } });
  return { ...c, i, dt: v - c.v };
}
// seconds left until the hole passes (story time)
export function leftAt(v) {
  if (v < FF_LEN) return leftAt(V_FF + v);
  const c = chapterAt(v);
  return Math.max(0, c.left - c.dt * c.rate);
}
export const milesAt = (v) => PASS_MILES + leftAt(v) * SPEED_MPS;

// the counter: the hole's distance, then your weight (from 258), then your clock while you fall in
const W0 = 160;
export const weightAt = (v) => W0 * (1 - smooth(257, 271, v)) - 70 * smooth(271, 284, v) - 300 * smooth(284, 299, v);
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export const COUNTERS = [
  { from: 0, to: 5, label: 'YOUR WEIGHT', value: (v) => weightAt(V_FF + v), fmt: (x) => fmtInt(Math.max(x, 0)), unit: (v) => (weightAt(V_FF + v) > 0 ? 'POUNDS' : 'POUNDS · FALLING UP') },
  { from: 5, to: 257, label: 'BLACK HOLE', value: milesAt, fmt: fmtInt, unit: () => 'MILES AWAY' },
  { from: 257, to: 300, label: 'YOUR WEIGHT', value: weightAt, fmt: (x) => fmtInt(Math.max(x, 0)), unit: (v) => (weightAt(v) > 0 ? 'POUNDS' : 'POUNDS · FALLING UP') },
  { from: 302, to: 327, label: 'ONE SECOND FOR YOU', value: (v) => Math.pow(10, lerp(0, 9.3, smooth(304, 326, v))), fmt: (x) => (x < 60 ? `${x.toFixed(x < 10 ? 1 : 0)} s` : x < 3600 ? `${Math.round(x / 60)} min` : x < 86400 * 2 ? `${Math.round(x / 3600)} hours` : x < 86400 * 730 ? `${Math.round(x / 86400)} days` : `${fmtInt(x / 31557600)} years`), unit: () => 'PASSES ON EARTH' },
];

// your phone: notification cards (top right). kind: msg (a text), alert (emergency alert), news, flight
export const NOTES = [
  [8.6, 5.2, 'alert', 'Emergency Alert', 'NASA: a black hole has entered the solar system. It gives off no light.'],
  [16.2, 3.6, 'msg', 'Mom', 'are you seeing this??'],
  [20.2, 3.4, 'msg', 'Jay', 'bro it\'s on every screen'],
  [39.5, 5.4, 'news', 'NASA', 'Its path passes between Earth and the Moon.'],
  [46.0, 3.4, 'msg', 'Mom', 'come home. NOW'],
  [55.0, 4.6, 'msg', 'Dad', 'got us 3 seats. flight 802, 9pm tonight. go to the airport'],
  [86.5, 3.8, 'msg', 'Mom', 'leave NOW the traffic is insane'],
  [99.0, 3.6, 'msg', 'Jay', 'highway hasn\'t moved in 2 hours'],
  [127.5, 5.0, 'flight', 'Flight 802', 'CANCELLED. All flights are grounded.'],
  [134.5, 3.6, 'msg', 'Dad', 'where are you'],
  [178.0, 5.4, 'alert', 'Emergency Alert', 'TAKE SHELTER UNDERGROUND NOW. Stay away from the coast.'],
  [206.0, 3.4, 'msg', 'Mom', 'where are you'],
  [210.2, 3.2, 'me', 'You', 'subway. safe i think'],
  [214.0, 3.2, 'msg', 'Mom', 'we\'re in the basement. love you'],
  [278.5, 4.8, 'me', 'You', 'i love you', 'Not Delivered'],
];
export function noteAt(v) {
  for (const n of NOTES) if (v >= n[0] - 0.05 && v < n[0] + n[1]) return { v0: n[0], dur: n[1], kind: n[2], from: n[3], text: n[4], fail: n[5], dt: v - n[0] };
  return null;
}

// gold popups: what is happening (a phrase, no number)
export const POPS = [
  [30.5, 'NEPTUNE IS TORN APART'],
  [70.0, 'SATURN\'S RINGS ARE SWALLOWED'],
  [112.5, 'JUPITER IS TORN APART'],
  [140.0, 'NOBODY IS LEAVING'],
  [165.0, 'THE MOON STARTS TO STRETCH'],
  [222.0, 'THE OCEAN IS COMING IN'],
  [256.0, 'THE MOON IS GONE'],
  [270.0, 'GRAVITY FLIPS'],
  [289.0, 'THE HORIZON PEELS UP'],
  [313.0, 'TIME STOPS FOR YOU'],
];
export const POP = 1.9;
export function popupAt(v) {
  for (const [t, say] of POPS) if (v >= t && v < t + POP) return { say, dt: v - t };
  return null;
}
// chapter stamps: big, for the first 2.4 s of each chapter
export function stampAt(v) {
  for (const c of CHAPTERS) if (c.stamp && v >= c.v && v < c.v + 2.6) return { say: c.stamp, dt: v - c.v };
  return null;
}

// captions (italic, lower middle): only in the gaps
export const CAPS = [
  [12.6, 15.8, 'It gives off no light. Only the stars around it bend.'],
  [43.4, 45.8, 'That\'s closer than the Moon.'],
  [80.2, 84.6, 'Now you can see it.'],
  [102.8, 106.0, 'Everyone had the same idea.'],
  [143.0, 147.0, 'There\'s nowhere left to fly.'],
  [189.0, 193.0, 'Underground. Now.'],
  [228.0, 232.0, 'The Moon is pulling the sea. The hole pulls harder.'],
  [244.0, 248.0, 'Up. Up the stairs.'],
  [260.0, 264.0, 'You feel lighter.'],
  [294.0, 298.0, 'And then the ground lets go of you.'],
  [304.5, 309.0, 'Earth is pulled into a stream behind you.'],
  [318.0, 322.5, 'Near the edge, the whole future of the universe flashes by.'],
];
export function captionAt(v) {
  if (popupAt(v) || stampAt(v)) return null;
  for (const [a, b, text] of CAPS) if (v >= a && v <= b) return { text, a: Math.min(clamp((v - a) / 0.4), clamp((b - v) / 0.5)) };
  return null;
}

// the closing (after the white-out)
export const CLOSING = [[333.0, VIDEO_DURATION - 0.6, 'Would you have made it?']];

// ---------- the state of the world (sky, street, people) at video time v ----------
// t: the story moment shown (the flash-forward shows V_FF + v)
export function state(v) {
  const t = v < FF_LEN ? V_FF + v : v;
  const s = { t, v };
  const c = chapterAt(t);
  s.ch = c.i;
  // the hole in the sky: how big (lens strength; the sky shader's distance in hole radii, smaller = bigger), its disk
  // (dim until it has eaten Neptune, brighter after Saturn and Jupiter, blazing in the last hour)
  s.bhD = t < 50 ? lerp(900, 700, smooth(5, 50, t)) : t < 95 ? lerp(600, 450, smooth(50, 95, t)) : t < 150 ? lerp(420, 340, smooth(95, 150, t))
    : t < 252 ? lerp(280, 160, smooth(150, 252, t)) : lerp(120, 14, Math.pow(smooth(252, 300, t), 0.8));
  s.disk = 0.04 * smooth(30, 40, t) + 0.25 * smooth(68, 80, t) + 0.5 * smooth(110, 125, t) + 0.6 * smooth(150, 170, t) + 0.4 * smooth(252, 290, t);
  // the Moon: stretches in the last hour, a ring when you come out of the subway
  s.moonStretch = 0.3 * smooth(160, 199, t) + 0.7 * smooth(205, 256, t);
  s.moonRing = smooth(250, 258, t);
  // the avenue: what's going on
  s.panic = smooth(36, 44, t);
  s.evac = t >= 50 && t < 150 ? 1 : 0;
  s.shelter = t >= 150 && t < 200 ? 1 : 0;
  s.flood = t >= 252 ? 0.55 + 0.1 * smooth(252, 268, t) : 0;
  // gravity flipping on the avenue (0 .. 1), the horizon peeling up, your own lift
  s.lift = smooth(262, 296, t);
  s.curl = smooth(284, 300, t);
  s.you = Math.pow(smooth(292, 300, t), 1.6);
  s.quake = 0.25 * smooth(150, 200, t) + 0.6 * smooth(262, 298, t);
  // the phones: everyone looks at theirs at each alert, and up at the sky after
  s.alert = Math.max(0, ...[[8.6, 9], [178, 9]].map(([a, d]) => smooth(a, a + 0.6, t) * (1 - smooth(a + d - 1.5, a + d, t))));
  s.lookUp = smooth(12, 14, t) * (1 - smooth(36, 40, t)) + smooth(80, 82, t) * (1 - smooth(92, 95, t)) + smooth(157, 160, t) * (1 - smooth(176, 179, t)) + smooth(253, 256, t);
  // the white-out at the end
  s.white = smooth(325.5, 330.5, t) * (1 - smooth(331.5, 333.5, t));
  s.black = smooth(331.0, 331.5, t);
  return s;
}
