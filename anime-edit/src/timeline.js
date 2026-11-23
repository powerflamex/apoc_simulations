// The whole edit as a function of time: where the camera is, what the puppet does, the grade, the text.
// Times are seconds in the song (MONTAGEM MERZYN, Ultra Slowed, from 16.249 s): a steady beat every 0.6914 s,
// one 9-beat phrase played twice, a drop in each.

import { KODO } from './kodo_curves.js';

export const DURATION = 11.05;
export const FPS = 60;
export const BEAT = 0.6914;
export const B0 = 0.058;                                  // the first beat
export const DROP1 = B0 + 4 * BEAT, DROP2 = B0 + 13 * BEAT;   // 2.824, 9.046
// every beat in the clip, [time, strength]: four heavy kicks, the drop, four lighter beats, again
export const GRID = Array.from({ length: 16 }, (_, k) => {
  const s = k === 4 ? 1.5 : k === 13 ? 1.6 : (k >= 5 && k <= 8) || k >= 14 ? 0.6 : 1;
  return [B0 + k * BEAT, s];
});
// the last hit before the loop is a real drum hit (not on the beat): the end zoom lands on it
export const LAST_HIT = 10.855;
export const KICKS = [...GRID, [LAST_HIT, 0.8]];
// half-time: every second beat (the chest and shoulders ride these)
export const HALF = GRID.filter((_, k) => k % 2 === 0).map(([b]) => b);
// The head nods on every beat, ON THE MELODY: the song's strongest melody note in each beat comes 90 ms before the
// kick (measured over the whole clip), and nods timed to the kick looked late against it (owner). nod() is lowest
// 35 ms after its time, so each nod is set 125 ms before the kick grid. Beat 16 (just past the end) keeps the loop seamless.
export const MELODY = -0.09;
export const BOPS = [...GRID, [B0 + 16 * BEAT, 1]].map(([b, s]) => [b + MELODY - 0.035, s >= 1 ? 1 : 0.85]);
export const LETTERS = GRID.slice(0, 4).map(([b]) => b);  // e, em, emb, embi
// The word stays up while the voice says "em-BI" (BI on the drop), pops on the drop, then breaks up and is gone half
// a beat later (it used to vanish on the drop, right as the voice said it: the owner saw the mismatch).
export const TEXT_OUT = DROP1 + BEAT / 2;
export const GLITCH_AT = DROP1 + 0.1;

// the character stands in the water in front of the shrine (world units: 1 = about half a metre)
export const CHAR = { x: 0.0, z: -38, h: 5.6, sink: 0.62, imgW: 901, imgH: 1316 };
const HEAD = [0.1, 3.9, CHAR.z], BODY = [0.2, 3.1, CHAR.z];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x, p = 3) => 1 - Math.pow(1 - clamp(x), p);

// a hit: quick dip, then a damped bounce back through rest. x = seconds since the hit.
function bop(x, down = 0.066, damp = 7.5, freq = 15) {
  if (x < 0) return 0;
  if (x < down) { const u = x / down; return u * u * (3 - 2 * u); }
  const y = x - down;
  return Math.exp(-damp * y) * Math.cos(freq * y);
}
// the head nod, as measured in reference head-bop edits: it starts a frame before the kick, is lowest about 40 ms
// after it, then comes back slowly and almost straight, with no bounce (the bounce is the camera's)
// Softened (owner, Nov 22: "too brusque"): down over 0.125 s instead of 0.09, and the way back up eases out of the
// bottom (no sharp turn there) and settles gently, still well before the next beat. It starts early enough that the
// head is lowest ~35 ms after the beat, as in the reference (lowest at +90 ms felt late against the voice).
function nod(x, ret = 0.43) {
  const a0 = -0.09, a1 = 0.035;
  if (x < a0) return 0;
  if (x < a1) { const u = (x - a0) / (a1 - a0); return u * u * (3 - 2 * u); }
  const u = (x - a1) / (ret + 0.05);
  return u >= 1 ? 0 : 1 - u * u * (3 - 2 * u);
}
// plain decaying pulse (for light, shake, blur)
const pulse = (x, decay) => (x < 0 ? 0 : Math.exp(-x * decay));
// wobble that never repeats inside the clip
const wob = (t, s) => Math.sin(t * 1.31 + s) * 0.5 + Math.sin(t * 2.17 + s * 2.3) * 0.3 + Math.sin(t * 3.73 + s * 4.1) * 0.2;

// ---------------------------------------------------------------- camera
// The camera follows the motion measured from the reference kodoae2 edit (src/kodo_curves.js, same song timing):
// head-on to the shrine, a slow zoom wave (out, in through the drop, out, then in through the cut), a pendulum
// roll that swings fastest on each beat, a slow slide, and a one-frame jolt on every beat. It cuts on beat 8
// (zooming straight into him) and plays the second half mirrored, like the reference.
const D2R = Math.PI / 180;
export const CUT = KODO.cut;                              // 5.589
const CUT_I = Math.ceil(CUT * KODO.fps);
// The reference's last frames before the cut are blurred too much to track, so they measured as "no motion": the
// camera froze for 0.1 s at the fastest point of the zoom, which felt like lag. Keep the last real motion going.
{
  const frozen = [];
  for (let i = CUT_I - 4; i < CUT_I; i++) if (Math.abs(KODO.z[i] - KODO.z[i - 1]) < 1) frozen.push(i);
  for (const a of [KODO.z, KODO.r, KODO.x, KODO.y]) for (const i of frozen) a[i] = a[i - 1] + (a[i - 1] - a[i - 2]);
}
function curve(a, t) {
  const n = a.length, lo = t < CUT ? 0 : CUT_I, hi = t < CUT ? CUT_I - 1 : n - 1;
  const x = clamp(t * KODO.fps, lo, hi), i = Math.min(Math.floor(x), hi - 1), u = x - i;
  const g = (k) => a[Math.min(hi, Math.max(lo, k))];
  const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);       // Catmull-Rom
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}
// piecewise-linear lookup in log(fill)
function byFill(f, pts) {
  const x = Math.log(f);
  if (x <= Math.log(pts[0][0])) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const a = Math.log(pts[i - 1][0]), b = Math.log(pts[i][0]);
    if (x <= b) return mix(pts[i - 1][1], pts[i][1], (x - a) / (b - a));
  }
  return pts[pts.length - 1][1];
}
export const mirrored = (t) => t >= CUT;
const ROLL = 1.0, SLIDE = 0.35;

function basePose(t) {
  const sg = mirrored(t) ? -1 : 1;                        // the picture is flipped afterwards: flip roll and slide here
  const z = curve(KODO.z, t), r = curve(KODO.r, t);
  const x = clamp(curve(KODO.x, t), -16, 16), y = clamp(curve(KODO.y, t), -16, 16);
  // zoom -> how much of the frame's height he fills (0.23 at the widest, 0.7 after the drops, >1 in the cuts)
  const fill = 0.30 * Math.exp(((z + 205) / 100) * 0.75);
  const Vh = CHAR.h / fill, Vw = Vh * 9 / 16;
  let fov = 40, d = Vh / (2 * Math.tan(20 * D2R));
  if (d > 36) { d = 36; fov = 2 * Math.atan(Vh / 72) / D2R; }
  const gy = byFill(fill, [[0.2, 4.7], [0.3, 4.2], [0.45, 3.6], [0.7, 3.3], [1.4, 3.7]]);
  const cy = byFill(fill, [[0.2, 3.0], [0.45, 2.7], [0.7, 2.6], [1.4, 3.5]]);
  const sx = -sg * (x / 100) * Vw * SLIDE, sy = (y / 100) * Vw * SLIDE;
  return { p: [sx, Math.max(0.6, cy + sy), CHAR.z + d], g: [sx, gy + sy, CHAR.z], roll: sg * ROLL * r, fov };
}
// how fast the view is turning/moving, in degrees per frame (drives the zoom blur)
function viewSpeed(t) {
  const a = basePose(t - 1 / 60), b = basePose(t);
  const dir = (q) => { const d = q.g.map((v, j) => v - q.p[j]), n = Math.hypot(...d); return d.map((v) => v / n); };
  const da = dir(a), db = dir(b);
  const turn = Math.acos(clamp(da[0] * db[0] + da[1] * db[1] + da[2] * db[2], -1, 1)) / D2R;
  const dist = Math.hypot(...b.g.map((v, j) => v - b.p[j]));
  const move = Math.hypot(...b.p.map((v, j) => v - a.p[j])) / Math.max(dist, 3) / D2R;
  // a cut is not motion
  const cut = Math.abs(t - CUT) < 1 / 60 || t < 1 / 60;
  return { v: cut ? 0 : turn + 0.6 * move + Math.abs(b.fov - a.fov), roll: cut ? 0 : b.roll - a.roll };
}
// the one-frame jolt on the beat: full for ~1.5 frames, gone in three more
const jolt = (x) => (x < -0.008 ? 0 : x < 0.025 ? 1 : Math.exp(-(x - 0.025) * 45));

export function camera(t) {
  const pose = basePose(t), sp = viewSpeed(t);
  let blur = clamp(sp.v * 0.3, 0, 1.7);
  // the cuts (mid-clip and the loop) sit inside a full zoom blur
  blur = Math.max(blur, 1.6 * smooth(CUT - 0.2, CUT - 0.02, t) * (t < CUT ? 1 : 0), 1.6 * (t >= CUT ? 1 - smooth(CUT, CUT + 0.12, t) : 0));
  blur = Math.max(blur, 1.5 * smooth(DURATION - 0.19, DURATION - 0.03, t), 1.5 * (1 - smooth(0, 0.12, t)));
  let j = 0;
  for (const [k, s] of GRID) j += Math.min(s, 1.2) * jolt(t - k);
  for (const d of [DROP1, DROP2]) j += 0.8 * jolt(t - d - 0.05);
  const sg = mirrored(t) ? -1 : 1;
  pose.yaw = -0.5 * j * sg; pose.pitch = -0.42 * j;
  blur = Math.max(blur, 0.45 * Math.min(j, 1.2));
  // a little life on top (much less than the reference's moves)
  pose.g[0] += wob(t * 0.9, 9.1) * 0.05; pose.g[1] += wob(t * 0.8, 3.3) * 0.04;
  pose.blur = blur; pose.whip = 0; pose.spin = clamp(sp.roll * D2R * 1.2, -0.09, 0.09);
  pose.mirror = mirrored(t) ? 1 : 0;
  return pose;
}

// ---------------------------------------------------------------- puppet
export function puppet(t) {
  let head = 0, body = 0, gust = 0, slide = 0;
  for (const [k, a] of BOPS) {
    head = Math.max(head, a * nod(t - k));
    slide = Math.max(slide, a * nod(t - k, 0.13));                       // a short slide toward where he faces
    body = Math.max(body, a * nod(t - k - 0.033, 0.46));                 // shoulders: one frame late, 70% as far
  }
  for (const [k, s] of KICKS) {
    gust += s * pulse(t - k - 0.02, 4.5) * (t >= k + 0.02 ? 1 : 0);
  }
  let chest = 0;
  for (const k of HALF) chest += bop(t - k - 0.035, 0.11, 5, 9.5);
  const breath = Math.sin(t * 2.3) * 0.5 + 0.5;

  // the drops: a small crouch, then one push forward that eases back (no spring rocking: the owner disliked it)
  let lean = 0, bob = 0, scale = 0, headRot = 0, spear = 0, headZ = 0;
  // arms (degrees; + turns clockwise in the picture): a slow, smooth, continuous sway of their own, not on the beat
  // (owner, Nov 22: the beat pumps looked choppy). Each arm mixes two slow waves with its own speeds and timing, so
  // they never move in step; the right forearm trails its upper arm. The speeds are whole cycles per clip, so the
  // loop joins up.
  const cyc = (n, p) => Math.sin(2 * Math.PI * n * t / DURATION + p);
  let armL = 7 * cyc(4, 0.3) + 2.5 * cyc(7, 1.7);
  let armR = -8 * cyc(5, 1.1) - 2.5 * cyc(8, 2.9);
  let armRf = -5 * Math.sin(2 * Math.PI * 5 * (t - 0.28) / DURATION + 1.1) + 2.5 * cyc(6, 0.4);   // trails the upper arm
  let armC = 5 * cyc(3, 2.2) + 2 * cyc(7, 0.8);
  for (const [d, amt] of [[DROP1, 1], [DROP2, 1.25]]) {
    const wind = 0.5 * smooth(d - 0.30, d - 0.05, t) * (1 - smooth(d - 0.03, d + 0.02, t));
    const x = t - d;
    const snap = x < 0 ? 0 : 0.55 * (1 - Math.exp(-x * 40)) * Math.exp(-x * 3.2);   // one push, eased back
    const settle = x < 0 ? 0 : Math.exp(-2.2 * x);
    lean += amt * (2.6 * wind - 7.5 * snap * (x < 0.045 ? x / 0.045 : 1));  // back, then lunge
    bob += amt * (16 * wind - 20 * snap * (x < 0.045 ? x / 0.045 : 1));
    scale += amt * (-0.025 * wind + 0.085 * snap + 0.03 * settle);
    headRot += amt * (3.0 * wind - 8.0 * snap);
    spear += amt * (-1.2 * wind + 4.4 * snap);
    headZ += amt * 0.35 * settle;
    gust += amt * 2.6 * settle;
  }
  return {
    headRot: -4.8 * head + headRot + wob(t * 0.8, 2.2) * 0.5,            // degrees (negative = nod forward)
    headDy: 15 * head,                                                   // source-image pixels, down
    headDx: -11 * slide,
    headScale: 0.02 * head,
    headZ: 0.14 * head + headZ,
    chestDy: 6.5 * chest,
    breath,
    lean: lean + 0.7 * body + wob(t * 0.6, 4.4) * 0.35,                  // degrees
    bob: bob + 13 * body,
    scale,
    spear: spear + Math.sin(t * 1.45 + 0.6) * 0.9 + 0.8 * Math.sin(t * 2.9) * 0.3 - 1.1 * head * 0.6,   // degrees
    gust: Math.min(gust, 3.2),
    arms: [armL, armR, armRf, armC],
  };
}

// ---------------------------------------------------------------- grade, light, text
export function look(t) {
  // 0 = dark and cool, 1 = fiery. Flips on the first drop and stays fiery through the cut, like the reference (a
  // flip back to blue at the cut looked wrong); the second drop burns a little hotter. Back to cool only at the loop.
  let heat = smooth(DROP1 - 0.012, DROP1 + 0.03, t) + 0.18 * smooth(DROP2 - 0.012, DROP2 + 0.03, t);
  let kick = 0, flash = 0;
  for (const [k, s] of KICKS) kick += s * pulse(t - k, 7) * (t >= k ? 1 : 0);
  flash += 0.55 * pulse(t - DROP1, 14) * (t >= DROP1 ? 1 : 0) + 0.75 * pulse(t - DROP2, 12) * (t >= DROP2 ? 1 : 0);
  // loop point: the cut sits inside a full bright flash
  // the mid cut hides in the zoom blur with only a short warm glow, like the reference (no blank screen)
  const loop = Math.max(smooth(DURATION - 0.13, DURATION - 0.015, t), 1 - smooth(0.0, 0.085, t),
    0.3 * (t < CUT ? smooth(CUT - 0.05, CUT - 0.01, t) : 1 - smooth(CUT, CUT + 0.04, t)));
  // lightning creeps in before each drop, and cracks on it
  const arc = Math.max(smooth(DROP1 - 0.62, DROP1 - 0.05, t) * (t < DROP1 ? 1 : pulse(t - DROP1, 10)),
    smooth(DROP2 - 0.62, DROP2 - 0.05, t) * (t < DROP2 ? 1 : pulse(t - DROP2, 10)));
  return { heat, kick: Math.min(kick, 1.6), flash, loop, arc };
}

export function text(t) {
  let n = 0;
  for (const k of LETTERS) if (t >= k - 0.017) n++;
  if (n === 0 || t >= TEXT_OUT) return { n: 0 };
  const since = t - (t >= DROP1 - 0.017 ? DROP1 - 0.017 : LETTERS[n - 1] - 0.017);   // one more pop on the "BI"
  const pop = pulse(since, 11) * (t >= DROP1 - 0.017 ? 1.4 : 1);
  const g = smooth(GLITCH_AT, TEXT_OUT - 0.09, t);           // break-up
  const bar = smooth(TEXT_OUT - 0.105, TEXT_OUT - 0.05, t);  // squash to a white bar
  const slide = smooth(TEXT_OUT - 0.06, TEXT_OUT, t);        // and off to the left
  return { n, pop, glitch: g, bar, slide, alpha: 1 - smooth(TEXT_OUT - 0.02, TEXT_OUT, t) };
}
