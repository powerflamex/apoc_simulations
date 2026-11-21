// The whole edit as a function of time: where the camera is, what the puppet does, the grade, the text.
// Times are seconds in the song (work/beats.json): one 9-beat phrase played twice, a drop in each.

export const DURATION = 11.05;
export const FPS = 60;
export const BEAT = 0.6914;

export const DROP1 = 2.821, DROP2 = 9.044;
// [time, strength]: the four heavy kicks, the drop, then the lighter hits after it
export const KICKS = [
  [0.058, 1], [0.749, 1], [1.440, 1], [2.130, 1], [DROP1, 1.5],
  [3.048, 0.45], [3.593, 0.5], [3.936, 0.3], [4.203, 0.7], [4.423, 0.3], [4.824, 0.32], [5.114, 0.22], [5.364, 0.22], [5.497, 0.25],
  [6.281, 1], [6.972, 1], [7.663, 1], [8.353, 0.9], [DROP2, 1.6],
  [9.189, 0.3], [9.555, 0.4], [9.851, 0.35], [10.228, 0.4], [10.675, 0.35], [10.855, 0.8],
];
// half-time: every second beat (the chest and shoulders ride these)
export const HALF = [0.058, 1.440, DROP1, 4.203, 5.586, 6.972, 8.353, 9.737];
// the hits the head nods on (never closer than ~0.45 s, so each nod can finish)
export const BOPS = [
  [0.058, 1], [0.749, 1], [1.440, 1], [2.130, 1], [3.048, 0.85], [3.593, 0.9], [4.203, 1], [4.824, 0.85], [5.364, 0.8],
  [6.281, 1], [6.972, 1], [7.663, 1], [8.353, 1], [9.555, 0.9], [10.228, 0.9], [10.675, 0.8],
];
export const LETTERS = [0.058, 0.749, 1.440, 2.130];     // e, em, emb, embi
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
// Each shot: lands at `t`, starts moving `lead` s earlier and takes `dur` s to arrive (fast in, soft landing).
// p = position, g = look-at point, roll in degrees, fov in degrees; d* = drift per second after landing.
const END_SHOT = { t: 10.855, dur: 0.17, lead: 0.03, p: [0.25, 3.85, -36.3], g: HEAD, roll: -14, fov: 30, dp: [0, 0, -1.2], droll: -30, blur: 1.6 };
const SHOTS = [
  { ...END_SHOT, t: END_SHOT.t - DURATION },                   // the end of the previous loop
  { t: 0.0, dur: 0.42, lead: 0, p: [0.5, 3.0, -2.0], g: [0, 6.0, -60], roll: 13, fov: 40, dp: [0, 0, -1.7], droll: -4, blur: 1.5 },
  { t: 0.749, dur: 0.2, lead: 0.05, p: [-1.7, 2.7, -11.0], g: [0, 4.9, -52], roll: -10, fov: 39, dp: [0.25, 0, -1.6], droll: 4, blur: 0.8 },
  { t: 1.440, dur: 0.2, lead: 0.05, p: [1.9, 2.4, -17.5], g: [0.1, 3.9, -42], roll: 11, fov: 38, dp: [-0.3, 0, -1.6], droll: -4, blur: 0.8 },
  { t: 2.130, dur: 0.2, lead: 0.05, p: [-1.0, 2.6, -22.3], g: BODY, roll: -8, fov: 37, dp: [0.2, 0, -1.4], droll: 3, blur: 0.9 },
  // DROP 1: whip into a low medium shot
  { t: DROP1, dur: 0.24, lead: 0.04, p: [1.4, 1.9, -28.6], g: [0.2, 3.2, CHAR.z], roll: -11, fov: 41, dp: [-0.35, 0.08, -0.55], droll: 3.2, blur: 1.5, whip: 1 },
  { t: 4.203, dur: 0.2, lead: 0.05, p: [-1.25, 3.1, -31.6], g: [0.0, 3.7, CHAR.z], roll: 8, fov: 40, dp: [0.3, 0, -0.5], droll: -3, blur: 0.9 },
  // whip out for the second phrase
  { t: 6.281, dur: 0.5, lead: 0.42, p: [-3.3, 1.5, -5.5], g: [0.5, 6.6, -58], roll: -13, fov: 42, dp: [0.3, 0.05, -1.7], droll: 4, blur: 1.4, whip: -1 },
  { t: 6.972, dur: 0.2, lead: 0.05, p: [2.5, 2.3, -13.5], g: [0.2, 4.6, -46], roll: 10, fov: 39, dp: [-0.3, 0, -1.6], droll: -4, blur: 0.8 },
  { t: 7.663, dur: 0.2, lead: 0.05, p: [-1.9, 1.8, -21.5], g: BODY, roll: -8, fov: 37, dp: [0.3, 0, -1.4], droll: 3, blur: 0.9 },
  { t: 8.353, dur: 0.2, lead: 0.05, p: [0.9, 3.3, -29.2], g: [0.1, 3.6, CHAR.z], roll: 6, fov: 38, dp: [-0.15, 0, -0.7], droll: -3, blur: 0.9 },
  // DROP 2: the hero shot, low, the shrine looming behind
  { t: DROP2, dur: 0.24, lead: 0.04, p: [-0.95, 1.25, -30.6], g: [0.1, 3.55, CHAR.z], roll: 12, fov: 47, dp: [0.3, 0.05, -0.45], droll: -4.5, blur: 1.6, whip: 1 },
  { t: 10.02, dur: 0.18, lead: 0.04, p: [0.75, 3.45, -33.3], g: [0.08, 3.9, CHAR.z], roll: -6, fov: 40, dp: [-0.2, 0, -0.4], droll: 3, blur: 0.9 },
  END_SHOT,
];

function shotPose(s, t) {
  const k = t - s.t, dp = s.dp || [0, 0, 0];
  return {
    p: [s.p[0] + dp[0] * k, s.p[1] + dp[1] * k, s.p[2] + dp[2] * k],
    g: s.g.slice(), roll: s.roll + (s.droll || 0) * k, fov: s.fov + (s.dfov || 0) * k,
  };
}

export function camera(t) {
  let pose = shotPose(SHOTS[0], t), blur = 0, whip = 0, focusOn = 0;
  for (let i = 1; i < SHOTS.length; i++) {
    const s = SHOTS[i], t0 = s.t - s.lead;
    if (t < t0) break;
    const x = (t - t0) / s.dur, e = easeOut(x, 3.2), q = shotPose(s, t);
    pose = {
      p: pose.p.map((v, j) => mix(v, q.p[j], e)), g: pose.g.map((v, j) => mix(v, q.g[j], e)),
      roll: mix(pose.roll, q.roll, e), fov: mix(pose.fov, q.fov, e),
    };
    if (x < 1.6) {                                    // how fast the move is going right now
      const v = Math.pow(1 - clamp(x), 2.2) * (x < 0.06 ? x / 0.06 : 1);
      blur = Math.max(blur, v * s.blur * (i === 1 ? 1 : 1));
      if (s.whip) whip = v * s.whip;
    }
  }
  // the first frame has to match the last one: both sit inside the same full blur
  blur = Math.max(blur, 1.5 * smooth(DURATION - 0.19, DURATION - 0.03, t), 1.5 * (1 - smooth(0, 0.1, t)));

  // a little pull back just before each drop (the wind-up)
  for (const d of [DROP1, DROP2]) {
    const w = smooth(d - 0.34, d - 0.06, t) * (1 - smooth(d - 0.05, d, t));
    pose.p[2] += 1.3 * w; pose.fov += 3.5 * w; pose.roll += 2.5 * w;
  }
  // every kick: a small punch of the lens and a shake
  let punch = 0, shake = 0;
  for (const [k, s] of KICKS) {
    punch += s * bop(t - k + 0.017, 0.05, 9, 13);
    shake += s * pulse(t - k, 9) * (t >= k ? 1 : 0);
  }
  pose.fov -= 1.9 * punch;
  // and the bump that makes the head bop read as a bounce: the picture jumps up and sideways on the kick,
  // swings back past rest three frames later, settled by twelve
  let bx = 0, by = 0;
  KICKS.forEach(([k, s], i) => {
    const x = t - k;
    if (x < -0.035) return;
    const b = Math.min(s, 1.2) * (x < 0 ? smooth(-0.035, 0, x) : Math.exp(-x * 7) * Math.cos(x * 26));
    by += b; bx += b * (i % 2 ? 1 : -1);
  });
  pose.pitch = -1.15 * by; pose.yaw = 0.85 * bx;
  blur = Math.max(blur, 0.16 * Math.min(shake, 1.2));
  // hand-held: never still
  const hx = wob(t * 1.7, 1.0) * 0.10 + Math.sin(t * 47) * 0.035 * shake;
  const hy = wob(t * 1.5, 5.2) * 0.07 + Math.sin(t * 53 + 1) * 0.04 * shake;
  pose.p[0] += hx; pose.p[1] += hy;
  pose.g[0] += wob(t * 1.3, 9.1) * 0.22 + Math.sin(t * 41 + 2) * 0.10 * shake;
  pose.g[1] += wob(t * 1.2, 3.3) * 0.16 + Math.sin(t * 59) * 0.12 * shake;
  pose.roll += wob(t * 0.9, 7.7) * 1.1 + Math.sin(t * 37) * 0.5 * shake;
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
    const snap = x < 0 ? 0 : Math.exp(-5.2 * x) * Math.cos(13 * x);         // overshooting spring
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
