// The whole edit as a function of time: where the camera is, what the puppet does, the grade, the text.
// Times are seconds in the song (MONTAGEM MERZYN, Ultra Slowed, from 16.249 s): a steady beat every 0.6914 s,
// one 9-beat phrase played twice, a drop in each.

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
// the head nods on every beat
export const BOPS = GRID.map(([b, s]) => [b, s >= 1 ? 1 : 0.85]);
export const LETTERS = GRID.slice(0, 4).map(([b]) => b);  // e, em, emb, embi
export const GLITCH_AT = 2.60;                            // the word breaks up, gone at DROP1

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
function nod(x, ret = 0.43) {
  const a0 = -0.05, a1 = 0.04;
  if (x < a0) return 0;
  if (x < a1) { const u = (x - a0) / (a1 - a0); return u * u * (3 - 2 * u); }
  const u = (x - a1) / ret;
  return u >= 1 ? 0 : Math.pow(1 - u, 1.35);
}
// plain decaying pulse (for light, shake, blur)
const pulse = (x, decay) => (x < 0 ? 0 : Math.exp(-x * decay));
// wobble that never repeats inside the clip
const wob = (t, s) => Math.sin(t * 1.31 + s) * 0.5 + Math.sin(t * 2.17 + s * 2.3) * 0.3 + Math.sin(t * 3.73 + s * 4.1) * 0.2;

// ---------------------------------------------------------------- camera
// One long move per section (kodo style): the camera glides the whole time and surges forward on each beat
// (a smooth push, never a jump to a new angle). Whips only on the two drops and the turn into the second phrase.
const D2R = Math.PI / 180;
const lerp3 = (a, b, u) => a.map((v, j) => mix(v, b[j], u));
// a smooth step that starts with no speed and lands with no overshoot (~90% there after 0.27 s)
const surge = (x, tau = 0.07) => (x <= 0 ? 0 : 1 - (1 + x / tau) * Math.exp(-x / tau));
// progress along a section: part steady glide, part beat surges
function prog(t, t0, t1, beats, glide) {
  const L = clamp((t - t0) / (t1 - t0));
  const S = beats.reduce((s, b) => s + surge(t - b + 0.04), 0) / beats.length;
  return glide * L + (1 - glide) * S;
}
const orbit = (T, R, az, h) => [T[0] + R * Math.sin(az * D2R), h, T[2] + R * Math.cos(az * D2R)];
const beatsIn = (a, b) => GRID.map(([k]) => k).filter((k) => k > a + 0.1 && k < b - 0.25);

// intro: from the wide tilted shot, one push down the water toward him
function sIntro(t) {
  const uL = clamp(t / DROP1), u = prog(t, 0, DROP1, beatsIn(0, DROP1), 0.58);
  return {
    p: [mix(0.7, -1.1, uL) + 1.3 * Math.sin(Math.PI * uL), mix(3.0, 2.5, u), mix(-1.5, -25.5, u)],
    g: lerp3([0, 6.0, -60], [0.15, 3.4, CHAR.z], u), roll: mix(13, -7, uL), fov: mix(40, 36, u),
  };
}
// after the first drop: a slow orbit around him, closing in on the beats
function sOrbit1(t) {
  const uL = clamp((t - DROP1) / 3.3), u = prog(t, DROP1, 6.1, beatsIn(DROP1, 6.1), 0.5);
  const T = [0.1, mix(3.35, 3.65, u), CHAR.z];
  return { p: orbit(T, mix(10.5, 7.9, u), mix(15, -15, uL), mix(1.8, 2.9, uL)), g: T, roll: mix(-11, 5, uL), fov: mix(41, 38, u) };
}
// second phrase: from wide and low on the left, a second push in
function sPush2(t) {
  const uL = clamp((t - 5.95) / 3.1), u = prog(t, 6.0, DROP2, beatsIn(6.0, DROP2), 0.58);
  return {
    p: [mix(-3.3, 1.1, uL) - 1.1 * Math.sin(Math.PI * uL), mix(1.5, 2.3, u), mix(-4.0, -27.0, u)],
    g: lerp3([0.5, 6.6, -58], [0.15, 3.3, CHAR.z], u), roll: mix(-13, 7, uL), fov: mix(42, 37, u),
  };
}
// after the second drop: the low hero shot, craning up and round to his face
function sHero(t) {
  const uL = clamp((t - DROP2) / 1.85), u = prog(t, DROP2, LAST_HIT, beatsIn(DROP2, LAST_HIT), 0.5);
  const T = [0.05, mix(3.75, 3.95, uL), CHAR.z];
  return { p: orbit(T, mix(8.8, 4.5, u), mix(-10, 10, uL), mix(1.35, 3.45, smooth(0, 1, uL))), g: T, roll: mix(12, -5, uL), fov: mix(47, 38, u) };
}
// the end: a fast zoom into his face, into the loop's flash
function sEnd(t) {
  const k = t - LAST_HIT;
  return { p: [0.25, 3.85, -36.3 - 1.2 * k], g: HEAD, roll: -14 - 30 * k, fov: 30 };
}
const easeIO = (x) => { x = clamp(x); return x * x * x * (x * (6 * x - 15) + 10); };
// each section takes over from the one before: starting `lead` s before its time, over `dur` s
const SECTIONS = [
  { t: 0, lead: 0, dur: 0.42, f: sIntro, ease: (x) => easeOut(x, 3.2) },     // out of the previous loop's end
  { t: DROP1, lead: 0.11, dur: 0.28, f: sOrbit1, ease: easeIO },
  { t: 6.281, lead: 0.36, dur: 0.46, f: sPush2, ease: easeIO },
  { t: DROP2, lead: 0.11, dur: 0.28, f: sHero, ease: easeIO },
  { t: LAST_HIT, lead: 0.03, dur: 0.17, f: sEnd, ease: (x) => easeOut(x, 3.2) },
];

function basePose(t) {
  let pose = sEnd(t + DURATION);                       // before the first section: the end of the previous loop
  for (const s of SECTIONS) {
    const x = (t - (s.t - s.lead)) / s.dur;
    if (x <= 0) break;
    const e = s.ease(x), q = s.f(t);
    pose = { p: lerp3(pose.p, q.p, e), g: lerp3(pose.g, q.g, e), roll: mix(pose.roll, q.roll, e), fov: mix(pose.fov, q.fov, e) };
  }
  // a little pull back just before each drop (the wind-up)
  for (const d of [DROP1, DROP2]) {
    const w = smooth(d - 0.36, d - 0.1, t) * (1 - smooth(d - 0.1, d + 0.05, t));
    pose.p[2] += 1.3 * w; pose.fov += 3.0 * w; pose.roll += 2.5 * w;
  }
  return pose;
}
// how fast the view is turning/moving, in degrees per frame (drives the zoom and whip blur)
function viewSpeed(t) {
  const a = basePose(t - 1 / 60), b = basePose(t);
  const dir = (q) => { const d = q.g.map((v, j) => v - q.p[j]), n = Math.hypot(...d); return d.map((v) => v / n); };
  const da = dir(a), db = dir(b);
  const turn = Math.acos(clamp(da[0] * db[0] + da[1] * db[1] + da[2] * db[2], -1, 1)) / D2R;
  const dist = Math.hypot(...b.g.map((v, j) => v - b.p[j]));
  const move = Math.hypot(...b.p.map((v, j) => v - a.p[j])) / Math.max(dist, 3) / D2R;
  const side = da[0] * db[2] - da[2] * db[0];          // turning left or right
  return { v: turn + 0.6 * move + Math.abs(b.fov - a.fov) + 0.25 * Math.abs(b.roll - a.roll), side };
}

export function camera(t) {
  const pose = basePose(t), sp = viewSpeed(t);
  let blur = clamp(sp.v * 0.32, 0, 1.7);
  const whip = clamp(Math.max(0, sp.v - 1.2) * 0.35, 0, 1) * (sp.side > 0 ? 1 : -1);
  // the first frame has to match the last one: both sit inside the same full blur
  blur = Math.max(blur, 1.5 * smooth(DURATION - 0.19, DURATION - 0.03, t), 1.5 * (1 - smooth(0, 0.1, t)));

  // every beat: a small punch of the lens; a shake only on the drops
  let punch = 0, shake = 0;
  for (const [k, s] of KICKS) punch += s * bop(t - k + 0.017, 0.05, 8, 11);
  for (const d of [DROP1, DROP2]) shake += 1.2 * pulse(t - d, 6) * (t >= d ? 1 : 0);
  pose.fov -= 1.6 * punch;
  // the bump that makes the head bop read as a bounce: the picture dips on the beat and settles softly
  let bx = 0, by = 0;
  KICKS.forEach(([k, s], i) => {
    const x = t - k;
    if (x < -0.04) return;
    const b = Math.min(s, 1.2) * (x < 0 ? smooth(-0.04, 0, x) : Math.exp(-x * 6) * Math.cos(x * 15));
    by += b; bx += b * (i % 2 ? 1 : -1);
  });
  pose.pitch = -0.9 * by; pose.yaw = 0.45 * bx;
  // hand-held: never still, but slow
  pose.p[0] += wob(t * 1.2, 1.0) * 0.12 + Math.sin(t * 43) * 0.03 * shake;
  pose.p[1] += wob(t * 1.1, 5.2) * 0.08 + Math.sin(t * 51 + 1) * 0.035 * shake;
  pose.g[0] += wob(t * 1.0, 9.1) * 0.22 + Math.sin(t * 39 + 2) * 0.08 * shake;
  pose.g[1] += wob(t * 0.9, 3.3) * 0.15 + Math.sin(t * 55) * 0.10 * shake;
  pose.roll += wob(t * 0.7, 7.7) * 1.2 + Math.sin(t * 35) * 0.4 * shake;
  pose.p[1] = Math.max(0.55, pose.p[1]);
  pose.blur = blur; pose.whip = whip; pose.shake = shake;
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

  // the drops: crouch for a quarter second, then snap
  let lean = 0, bob = 0, scale = 0, headRot = 0, spear = 0, headZ = 0;
  for (const [d, amt] of [[DROP1, 1], [DROP2, 1.25]]) {
    const wind = smooth(d - 0.30, d - 0.05, t) * (1 - smooth(d - 0.03, d + 0.02, t));
    const x = t - d;
    const snap = x < 0 ? 0 : Math.exp(-4.6 * x) * Math.cos(11 * x);         // overshooting spring
    const settle = x < 0 ? 0 : Math.exp(-2.2 * x);
    lean += amt * (2.6 * wind - 7.5 * snap * (x < 0.045 ? x / 0.045 : 1));  // back, then lunge
    bob += amt * (16 * wind - 20 * snap * (x < 0.045 ? x / 0.045 : 1));
    scale += amt * (-0.025 * wind + 0.085 * snap + 0.03 * settle);
    headRot += amt * (3.0 * wind - 8.0 * snap);
    spear += amt * (-1.2 * wind + 4.6 * (x < 0 ? 0 : Math.exp(-3.4 * x) * Math.cos(9 * x - 0.5)));
    headZ += amt * 0.35 * settle;
    gust += amt * 2.6 * settle;
  }
  return {
    headRot: -6.0 * head + headRot + wob(t * 0.8, 2.2) * 0.5,            // degrees (negative = nod forward)
    headDy: 19 * head,                                                   // source-image pixels, down
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
  };
}

// ---------------------------------------------------------------- grade, light, text
export function look(t) {
  // 0 = dark and cool, 1 = fiery. Flips on each drop; cools again inside the whip to the second phrase.
  let heat = smooth(DROP1 - 0.012, DROP1 + 0.03, t) * (1 - smooth(5.98, 6.2, t)) + smooth(DROP2 - 0.012, DROP2 + 0.03, t) * 1.18;
  let kick = 0, flash = 0;
  for (const [k, s] of KICKS) kick += s * pulse(t - k, 7) * (t >= k ? 1 : 0);
  flash += 0.55 * pulse(t - DROP1, 14) * (t >= DROP1 ? 1 : 0) + 0.75 * pulse(t - DROP2, 12) * (t >= DROP2 ? 1 : 0);
  // loop point: the cut sits inside a full bright flash
  const loop = Math.max(smooth(DURATION - 0.13, DURATION - 0.015, t), 1 - smooth(0.0, 0.085, t));
  // lightning creeps in before each drop, and cracks on it
  const arc = Math.max(smooth(DROP1 - 0.62, DROP1 - 0.05, t) * (t < DROP1 ? 1 : pulse(t - DROP1, 10)),
    smooth(DROP2 - 0.62, DROP2 - 0.05, t) * (t < DROP2 ? 1 : pulse(t - DROP2, 10)));
  return { heat, kick: Math.min(kick, 1.6), flash, loop, arc };
}

export function text(t) {
  let n = 0;
  for (const k of LETTERS) if (t >= k - 0.017) n++;
  if (n === 0 || t >= DROP1) return { n: 0 };
  const since = t - (LETTERS[n - 1] - 0.017);
  const pop = pulse(since, 11);
  const g = smooth(GLITCH_AT, DROP1 - 0.09, t);            // break-up
  const bar = smooth(DROP1 - 0.105, DROP1 - 0.05, t);      // squash to a white bar
  const slide = smooth(DROP1 - 0.06, DROP1, t);            // and off to the left
  return { n, pop, glitch: g, bar, slide, alpha: 1 - smooth(DROP1 - 0.02, DROP1, t) };
}
