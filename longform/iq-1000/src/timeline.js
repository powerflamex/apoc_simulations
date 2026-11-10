// "What if your IQ was 1,000 times higher?" — the whole story as functions of VIDEO time v (seconds, 30 fps, 16:9).
// You stand on a city plaza on a summer afternoon, a storm coming in. From SEC.climb on, your IQ doubles every
// D = 30 s and your brain runs twice as fast with it (f = IQ / 100). The video shows what YOU experience, so the world
// runs slower by the same factor: its clock is worldT(v) (real seconds), which advances 1/f seconds per video second.
// People, cars, rain, pigeons, bubbles, the fountain and the lightning are pure functions of worldT; the camera, the
// thought lines (hud.js), the counters and the captions follow the video clock.
//
// Numbers (see longform/IQ-1000.md): IQ 160 ~ Einstein's guessed IQ; 195 ~ 1 in 8 billion (6.33 standard deviations);
// at f = 1024 a second feels like 17 min. The brain uses ~20 W; at f x the thinking (same efficiency) it burns 20f W,
// blood carries away ~20 W, so a 1.4 kg brain (5,040 J/°C) warms by 20 (f - 1) / 5040 °C per real second.
// The climb itself takes D / ln 2 = 43.3 real seconds; the whole video ~1 minute of real time.
//
// The video is laid out in sections (SEC) that match the narration (SCRIPT.md); the owner's recording is cut into
// lines placed on this clock in src/voice.js (audio.mjs mixes them in).
import { smooth, clamp, lerp } from './util.js';

export const STORY_START = 0;
export const FPS = 30;
const TA = 11.0;                     // the climb starts: on his "Now it starts doubling" (right after the phone's 100)
// how fast your brain runs: log2(speed) at each video time (it keeps doubling; the first doublings come fast so the
// world visibly slows within seconds, then ~20-35 s per doubling). Straight lines in log space between the keys.
const SPEED = [[TA, 0], [17.5, 1], [32, 2], [64, 3], [86, 4], [108, 5], [128, 6], [150, 7], [176, 8], [210, 9], [250, 10]];
const log2At = (v) => {
  if (v <= SPEED[0][0]) return 0;
  for (let i = 0; i + 1 < SPEED.length; i++) {
    const [t0, a0] = SPEED[i], [t1, a1] = SPEED[i + 1];
    if (v <= t1) return a0 + (a1 - a0) * (v - t0) / (t1 - t0);
  }
  return 10;
};
// the video time the brain first reaches mult x
const at = (mult) => {
  const L = Math.log2(mult);
  for (let i = 0; i + 1 < SPEED.length; i++) {
    const [t0, a0] = SPEED[i], [t1, a1] = SPEED[i + 1];
    if (L <= a1) return t0 + (t1 - t0) * (L - a0) / (a1 - a0);
  }
  return SPEED[SPEED.length - 1][0];
};

// ---- sections (video time) ----
// Built for retention (owner's curves, Oct 25): no explaining in the first 30 s, the world visibly slows by 0:17,
// then a big visible moment every ~45-60 s: rain falling slowly, the ball, the pigeons, silence, the frozen
// flythrough, the lightning, the brain heating up, the bubble popping, everything rushing back.
export const SEC = {
  ff: 0,            // flash-forward: the frozen plaza, lightning lit over the towers, the bubble popping (title)
  plaza: 6,         // the plaza; your phone: the IQ test you just took on iqmaxx.ing, 100 (gone by 10.5)
  climb: TA,        // "Now it starts doubling"
  cube0: 12.2, cube1: 15.2,   // a Rubik's cube in your hands, solved in three seconds
  einstein: at(1.6),    // 15.2
  smartest: at(1.95),   // 17.3
  x2: at(2),        // 17.5
  slow: 20.5,       // the world visibly in slow motion
  chess0: 22, mate: 30.5,     // the park's chess hustler: checkmate
  rain: 30.0,         // the first drops
  x4: at(4),        // 32: the rain falls slowly
  see: 42.5,        // the kid dribbling: you see the paths ahead
  walk: 45,         // you start walking to the curb
  kick: 50,         // the kid taps the ball toward the road
  catch: 63.5,      // your hand catches it at the curb
  x8: at(8),        // 64
  mind: 76,         // math over the sky
  pigeons: 90.5,    // the pigeons take off (the close-up of one of them, 91-97)
  x16: at(16),      // 86
  stuck: 97,        // your body doesn't speed up; "hi" crawling out
  guitar: 104,      // the guitar's strings swinging
  x32: at(32),      // 108
  sink: 114,        // the sound sinks
  cure0: 112, cure1: 126,     // a cure for cancer: a glowing molecule builds itself over the plaza
  x64: at(64),      // 128
  hush: 130,        // [silence]
  silent: 134,      // "Silence."
  frozen: 140,      // the rain hangs; your mind's eye leaves your body and glides through the street
  x128: at(128),    // 150
  bolt: 160,        // "something starts to move" (the lightning's leader appears)
  leader: 168,      // ...crawls down the sky
  x256: at(256),    // 176
  stroke: 178.5,    // the flash (return stroke) [silence]
  fusion0: 180, fusion1: 194, // watching the lightning: fusion, a star in a bottle glowing over the avenue
  cost: 184,        // your brain heats up: shimmer, red edges, the temperature big
  rocket0: 200, rocket1: 214, // a rocket to Mars drawn in light over the fountain; its path up past the Moon
  stroke2: 191, stroke3: 204,
  x512: at(512),    // 210
  top: at(1024),    // 250: 1,024x (IQ 102,400)
  x1000: at(1000),  // ~249.7: IQ passes 100,000
  theory: 250,      // everything, explained: the whole sky becomes one glowing web
  burst: 253,       // a giant soap bubble starts to pop in front of you
  letgo: 285,       // "Or you could let go."
  back: 291,        // back to normal speed
  future0: 296, launch: 305, future1: 318,   // TEN YEARS LATER: the plaza rebuilt by what you invented
  end: 318,         // closing lines (your phone, the question)
  out: 334,
};
export const VIDEO_DURATION = SEC.out;
// the cutaways: what you're thinking about, shown (mind.js: neon thoughts on black; hospital.js: the ward)
export const CUTS = [
  { kind: 'math', from: 76, to: 85.8 },
  { kind: 'sick', from: 112, to: 118 },
  { kind: 'cells', from: 118, to: 123.4 },
  { kind: 'cured', from: 123.4, to: 127.6 },
  { kind: 'fusion', from: 181, to: 191 },
  { kind: 'space', from: 202.5, to: 212 },
  { kind: 'brain', from: 226, to: 236 },
  { kind: 'cosmos', from: 252, to: 262 },
];
export function cutAt(v) {
  for (const c of CUTS) if (v >= c.from && v < c.to) return { ...c, u: (v - c.from) / (c.to - c.from) };
  return null;
}
export const MONEY_V = 85.8;   // the million-dollar prize bursts out over the plaza
export const PIGEON_CLOSE = [91, 97];
export const CHESS_CLOSE = [22.6, 30.9];
// every doubling (2x, 4x ... 1,024x): a ripple runs across the picture
export const DOUBLINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => at(2 ** k));
export const V_FF = SEC.burst + 4;  // the flash-forward replays the frozen plaza from this moment
export const FF_LEN = 6;

// ---- how many times faster your brain runs, at video time v ----
export function speed(v) {
  if (v < SEC.letgo) return Math.pow(2, log2At(v));
  return Math.pow(2, 10 * (1 - smooth(SEC.letgo, SEC.back, v)));
}
// ---- the world's clock (real seconds) and your brain's temperature: integrated once, on a fine grid ----
const STEP = 1 / 240, NT = Math.ceil(VIDEO_DURATION / STEP) + 2;
const WT = new Float64Array(NT), TEMP = new Float64Array(NT);
{
  let w = 0, T = 37;
  for (let i = 0; i < NT; i++) {
    WT[i] = w; TEMP[i] = T;
    const v = (i + 0.5) * STEP, f = speed(v);
    w += STEP / f;
    // heating (per felt second): 20 (f - 1) / (5040 f); cooling back down slowly once you let go
    T += STEP * (20 * (f - 1) / (5040 * f)) - (v > SEC.back ? STEP * (T - 37) * 0.002 : 0);
  }
}
const grid = (A, v) => {
  const x = clamp(v, 0, VIDEO_DURATION) / STEP, i = Math.min(NT - 2, Math.floor(x)), k = x - i;
  return A[i] + (A[i + 1] - A[i]) * k;
};
export const worldT = (v) => grid(WT, v);
export const brainTemp = (v) => grid(TEMP, v);
// world times of the story's moments
export const W = Object.fromEntries(Object.entries(SEC).map(([k, v]) => [k, worldT(v)]));

// ---- the big moments: a gold phrase pops up at each one (a phrase, never a number; the soundtrack hits on each) ----
export const BEATS = [
  // the problems you solve (the story) and, on the side, what your speed does to the world
  { v: SEC.cube1, say: 'SOLVED IN THREE SECONDS' },
  { v: 17.4, say: 'THE SMARTEST PERSON ON EARTH' },
  { v: SEC.slow, say: 'THE WORLD SLOWS DOWN' },
  { v: SEC.mate, say: 'CHECKMATE' },
  { v: SEC.see, say: 'YOU SEE IT COMING' },
  { v: SEC.catch + 0.4, say: 'A LIFE SAVED' },
  { v: 79.6, say: 'THE HARDEST PROBLEM IN MATH' },
  { v: 86.6, say: 'A MILLION-DOLLAR PRIZE' },
  { v: 92.4, say: 'EVERY WINGBEAT' },
  { v: SEC.stuck + 1, say: "YOUR BODY CAN'T KEEP UP" },
  { v: 113, say: 'IT KILLS MILLIONS EVERY YEAR' },
  { v: 124.3, say: 'A CURE FOR CANCER' },
  { v: 133.7, say: 'SILENCE' },
  { v: SEC.frozen + 1.5, say: 'THE RAIN STOPS FALLING' },
  { v: 169.1, say: 'LIGHTNING' },
  { v: 187, say: 'A STAR IN A BOTTLE' },
  { v: 208, say: 'A ROCKET TO MARS' },
  { v: 228, say: 'YOUR BRAIN IS HEATING UP' },
  { v: 252.6, say: 'EVERYTHING, EXPLAINED' },
  { v: SEC.back + 0.5, say: 'BACK TO NORMAL' },
  { v: SEC.future0 + 0.8, say: 'TEN YEARS LATER' },
];
export const POP = 1.9;
export function beatAt(v) {
  let b = null;
  for (const x of BEATS) if (v >= x.v) b = x;
  return b ? { ...b, dt: v - b.v } : null;
}
// the popup on screen at v (null if none): captions and the thought labels wait while one shows
export function popupAt(v) {
  let b = null;
  for (const x of BEATS) if (x.say && v >= x.v && v < x.v + POP) b = { ...x, dt: v - x.v };
  return b;
}
// the one line under the counter: the next milestone
const NEXT = [
  [SEC.cube1, "A RUBIK'S CUBE"], [17.4, 'SMARTEST ON EARTH'], [SEC.mate, 'BEAT THE HUSTLER'], [SEC.catch, 'SAVE THE KID'],
  [86, 'THE HARDEST MATH PROBLEM'], [SEC.cure1, 'CURE CANCER'], [SEC.fusion1 - 4, 'ENDLESS CLEAN ENERGY'],
  [SEC.rocket1 - 6, 'GET TO MARS'], [SEC.theory + 1, 'EXPLAIN EVERYTHING'],
];
export function nextAt(v) {
  if (v >= SEC.theory + 1) return '';
  for (const [t, name] of NEXT) if (v < t) return `NEXT: ${name}`;
  return '';
}

// ---- the counters ----
const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
export const iqAt = (v) => 100 * speed(v);
export function fmtFeels(f) {
  if (f < 9.95) return `${f.toFixed(1)} seconds`;
  if (f < 59.5) return `${Math.round(f)} seconds`;
  const m = Math.floor(f / 60), s = Math.round(f - 60 * m);
  return s ? `${m} min ${s} s` : `${m} min`;
}
export const COUNTERS = [
  { from: -10, to: SEC.end, label: 'YOUR IQ', fmt: fmtInt, value: (v) => iqAt(v), unit: (v) => nextAt(v) },
];
// the number on the right: how long a second feels, then (once it costs something) your brain's temperature with
// the power it burns on the one line under it
export const RIGHT = [
  { from: SEC.slow, to: SEC.cost, label: '1 SECOND FEELS LIKE', value: (v) => fmtFeels(speed(v)), unit: () => '' },
  { from: SEC.cost, to: SEC.future0, label: 'YOUR BRAIN', value: (v) => `${brainTemp(v).toFixed(2)} °C`, unit: (v) => `${fmtInt(20 * speed(v))} WATTS`, hot: true },
];

// ---- the plaza's weather and light, by world time ----
// the storm front: the sun goes behind it as the rain arrives
export const rainAt = (w) => smooth(W.rain - 0.6, W.rain + 3.5, w);

// ---- how the scene looks (pure function of v) ----
export function state(v) {
  const s = { v };
  s.f = speed(v);
  s.w = worldT(v);
  s.iq = 100 * s.f;
  s.temp = brainTemp(v);
  // your eye's exposure (1/30 of a felt second), in world seconds: rain streaks shrink to beads as you speed up
  s.exp = 1 / (FPS * s.f);
  s.rain = rainAt(s.w);
  s.wet = smooth(W.rain, W.rain + 6, s.w);
  s.sunDim = smooth(W.rain - 2.5, W.rain + 1.5, s.w);
  // the sound you can still hear (for the picture: nothing; for audio.mjs: the city's pitch drops by f)
  s.hear = 1 - smooth(Math.log(40), Math.log(160), Math.log(s.f));
  // the lightning: the leader crawls down, then the strokes; the channel keeps a dim glow between them
  {
    const p = clamp((s.w - worldT(SEC.leader - 4)) / (W.stroke - worldT(SEC.leader - 4)));
    s.leader = s.w > worldT(SEC.bolt) ? p : 0;
    s.leaderVis = smooth(W.bolt, worldT(SEC.bolt + 3), s.w);
    let flash = 0;
    for (const ws of [W.stroke, W.stroke2, W.stroke3]) {
      const dt = s.w - ws;
      if (dt >= 0) flash = Math.max(flash, Math.exp(-dt / 0.0011));
    }
    s.flash = flash;   // 0..1 (the return stroke's light)
    s.channel = s.w >= W.stroke ? 0.22 + 0.78 * flash : 0;
    // after you let go the bolt is over (the last stroke's glow fades in tens of ms)
    s.channel *= 1 - smooth(W.stroke3 + 0.05, W.stroke3 + 0.25, s.w);
    s.boltOn = s.leaderVis * (s.w < W.stroke3 + 0.3 ? 1 : 0);
  }
  // your brain heating up (what you feel; the picture shimmers and reddens at the edges): from the cost on, growing
  // with the power it burns, gone when you let go
  s.heat = smooth(SEC.cost - 2, SEC.cost + 30, v) * (0.45 + 0.55 * smooth(Math.log(250), Math.log(1024), Math.log(s.f))) * (1 - smooth(SEC.letgo, SEC.back, v));
  // the soap bubble in front of you: its film tears open over ~30 ms (world)
  s.burst = clamp((s.w - W.burst) / 0.03);
  // TEN YEARS LATER: after you let go, years race by; the storm clears into a golden evening and the plaza fills with
  // what you invented (future.js)
  s.future = smooth(SEC.future0, SEC.future0 + 1.2, v);
  s.futureK = smooth(SEC.future0 + 1, SEC.future1 - 4, v);     // how much of the new city is built
  s.launch = Math.max(0, v - SEC.launch);                      // seconds since the rocket lit
  s.rain *= 1 - s.future; s.wet *= 1 - s.future; s.sunDim *= 1 - s.future;
  s.white = smooth(SEC.future0 - 0.6, SEC.future0, v) * (1 - smooth(SEC.future0, SEC.future0 + 0.9, v));
  // the closing: fade to black at the very end
  s.fadeOut = smooth(SEC.out - 2.5, SEC.out, v);
  s.title = 1 - smooth(6.0, 6.6, v);
  return s;
}
