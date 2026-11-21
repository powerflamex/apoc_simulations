// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A street-level action topic, so the sound is the place itself (a crowd at a court, the fountain, the city) and
// what each gravity does to it, no music:
//   the Moon: the crowd yelling (the owner's scream on frame 0), slow whooshes as people sail up, the rim's clang and
//     the net's swish at the dunk, the ball's slow bounces, a roar and a soft whomp when the whole court jumps.
//   Pluto: wind rising past you as you go up and up, the fountain roaring, a hushed airy hum, "oh my god".
//   Jupiter: a heavy thud as everyone drops, a groan, wood creaking; the big limbs snapping (a split, a crash).
//   The Sun: a huge slam, a scream, the hoop's post groaning and the board crashing, tyres bursting one after another,
//     trees cracking and crashing, then glass raining off the buildings.
//   The white dwarf: a crushing boom; the buildings collapsing in a rolling thunder; the ground cracking open with a
//     deep groan and a hiss of heat.
//   The neutron star: the biggest boom of all, then a roar of heat rising into the white.
// Every wipe: a whoosh across and a deep hit. No sharp clicks: every burst has a soft attack and is low-passed.
// The loop: the whole track is made in one run that starts before frame 0; under the white at the end it fades over
// into the moments just before frame 0, so the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STOPS, LAND, T_END } from './src/timeline.js';
import {
  GRAV, MOON_DUNK, MOON_ALL, MOON_YOU, PLU_TAKE, JUP_BUCKLE, JUP_SNAP, JUP_BENCH, JUP_HOOP, jupCarT, SUN_FLAT, sunTyreT, SUN_LAMPS,
  SUN_HOOP, SUN_BOARD_HIT, sunTreeT, sunRoofT, SUN_WINDOWS, SUN_TOP_LIST, WD_CRUSH, WD_BLDG_T, WD_FLAT0, WD_FLAT1, NS_FILM, NS_WAVE0, NS_WAVE1,
} from './src/sched.js';
import { CARS, BUILDINGS } from './src/layout.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 6) / SR);
    this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h;
    return { lp: this.l, bp: this.b, hp: h };
  }
}
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

// the ball's bounces (the same little simulations as world.js): times in stop time
function bounces(y, vy, g, e, n) {
  const out = []; let t = 0;
  for (let b = 0; b < n; b++) {
    const disc = vy * vy + 2 * g * (y - 0.12);
    const th = (vy + Math.sqrt(disc)) / g;
    t += th; out.push([t, Math.sqrt(disc)]);
    vy = Math.sqrt(disc) * e; y = 0.12; if (vy < 0.3) break;
  }
  return out;
}

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77), R1 = rng(91), R2 = rng(123), R3 = rng(321);
  const lands = STOPS.map((s) => s.land);
  const gainOf = (k, v) => smooth(lands[k] - 0.02, lands[k] + 0.22, v) * (k + 1 < lands.length ? 1 - smooth(lands[k + 1] - 0.02, lands[k + 1] + 0.22, v) : 1) + (k === 0 && v < lands[0] ? 1 : 0);

  // ---- one-shot events: [time (video), kind, gain, pan, extra] ----
  const ev = [];
  const add = (t, kind, g = 1, p = 0, x = 0) => ev.push({ t, kind, g, p, x });
  // Moon: the dunk, the ball, the court's jump
  add(LAND.moon + MOON_DUNK, 'clang', 0.55, -0.1); add(LAND.moon + MOON_DUNK + 0.12, 'swish', 0.35, -0.1);
  for (const [t, v] of bounces(3.3, -3.2, GRAV.moon, 0.72, 5)) add(LAND.moon + MOON_DUNK + t, 'ball', 0.25 * Math.min(1, v / 4), -0.1);
  add(LAND.moon + MOON_ALL, 'whomp', 0.5, 0);
  // Pluto: your take-off
  add(LAND.pluto + PLU_TAKE, 'whomp', 0.35, 0.1);
  // Jupiter: everyone drops (thuds as the jumpers slam down), the ball dies; ~3 s in: limbs, benches, the hoop, the cars
  add(LAND.jupiter + JUP_BUCKLE, 'boom', 0.75, 0, 0.6);
  for (let k = 0; k < 7; k++) add(LAND.jupiter + 0.2 + 0.05 * k, 'thud', 0.35, -0.6 + 0.2 * k);
  for (const [t, v] of bounces(1.0, -1.5, GRAV.jupiter, 0.6, 6)) add(LAND.jupiter + t, 'ball', 0.3 * Math.min(1, v / 5), 0.3);
  JUP_SNAP.forEach((t, k) => { const p = [-0.6, 0.6, -0.5, 0.5, 0.3][k]; add(LAND.jupiter + t, 'snap', 0.5, p); add(LAND.jupiter + t + 0.62, 'crash', 0.45, p); });
  JUP_BENCH.forEach((t, k) => add(LAND.jupiter + t, 'splinter', 0.45, [-0.5, 0.2, 0.5, -0.1][k]));
  add(LAND.jupiter + JUP_HOOP, 'groan', 0.55, -0.1); add(LAND.jupiter + 5.5, 'groan', 0.5, -0.1); add(LAND.jupiter + 5.95, 'clang', 0.25, -0.1);
  for (let k = 0; k < 6; k++) add(LAND.jupiter + 5.9 + 0.12 * k, 'thud', 0.3, -0.5 + 0.2 * k);
  CARS.forEach((c, k) => { if (Math.abs(c.x) < 22) add(LAND.jupiter + jupCarT(k), 'clunk', 0.35 * (c.z > -30 ? 1 : 0.6), clamp(c.x / 20, -0.9, 0.9)); });
  // (the trees creaking under the weight, wood and steel straining, between the beats)
  for (const [t, p] of [[1.3, -0.5], [1.9, 0.5], [4.8, -0.3], [6.6, 0.4], [7.1, -0.2]]) add(LAND.jupiter + t, 'groan', 0.4, p);
  add(LAND.jupiter + 1.6, 'crack', 0.3, -0.4); add(LAND.jupiter + 6.8, 'crack', 0.35, 0.4);
  // the Sun: the slam, tyres, lamps; ~3 s in the hoop, the trees, the roofs, the windows; ~6 s in the building tops
  add(LAND.sun + SUN_FLAT, 'boom', 1.1, 0, 1);
  CARS.forEach((c, k) => { if (Math.abs(c.x) < 22) add(LAND.sun + sunTyreT(k), 'pop', 0.3 * (c.z > -30 ? 1 : 0.6), clamp(c.x / 20, -0.9, 0.9)); });
  add(LAND.sun + SUN_LAMPS, 'groan', 0.3, 0.5);
  add(LAND.sun + SUN_HOOP, 'groan', 0.6, -0.1);
  add(LAND.sun + SUN_BOARD_HIT, 'crash', 0.85, -0.1); add(LAND.sun + SUN_BOARD_HIT, 'glass', 0.5, -0.1);
  for (let ti = 0; ti < 13; ti++) { const t0 = sunTreeT(ti); if (ti < 5) add(LAND.sun + t0, 'snap', 0.28, (ti % 2 ? 0.5 : -0.5)); add(LAND.sun + t0 + 0.24, 'crash', ti < 5 ? 0.45 : 0.18, (ti % 2 ? 0.5 : -0.5)); }
  CARS.forEach((c, k) => { if (Math.abs(c.x) < 22) add(LAND.sun + sunRoofT(k), 'crunch', 0.35 * (c.z > -30 ? 1 : 0.6), clamp(c.x / 20, -0.9, 0.9)); });
  add(LAND.sun + SUN_WINDOWS, 'glassrain', 0.45, 0);
  SUN_TOP_LIST.forEach(({ i, t }) => add(LAND.sun + t, 'collapse', 0.5, clamp(BUILDINGS[i].x / 35, -0.9, 0.9)));
  for (const [t, p] of [[2.3, 0.3], [5.3, -0.4], [7.6, 0.2]]) { add(LAND.sun + t, 'groan', 0.45, p); add(LAND.sun + t + 0.2, 'collapse', 0.25, p); }
  // the white dwarf: the crush; the buildings one after another, the near ones loudest; the front of cracks
  add(LAND.wd + WD_CRUSH, 'boom', 1.3, 0, 1.4);
  BUILDINGS.forEach((b, i) => { const d = Math.hypot(b.x, b.z); add(LAND.wd + WD_BLDG_T[i] + 0.05, 'collapse', 0.25 + 0.5 * smooth(75, 42, d), clamp(b.x / 35, -0.9, 0.9)); });
  add(LAND.wd + WD_FLAT0, 'crack', 0.5, 0); add(LAND.wd + WD_FLAT1, 'boom', 1.2, 0, 1.3);
  // the neutron star
  add(LAND.ns + NS_FILM, 'boom', 1.6, 0, 2.0);

  const FL = new Map();
  const flt = (name) => { let f = FL.get(name); if (!f) { f = new SVF(); FL.set(name, f); } return f; };
  const wipes = lands.slice(1);
  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    const w1 = R0() * 2 - 1, w2 = R1() * 2 - 1, w3 = R2() * 2 - 1, w4 = R3() * 2 - 1;
    let l = 0, r = 0;
    // ===================== the place: crowd murmur, the fountain, distant traffic (quieter as things break) =====================
    {
      const gm = gainOf(0, v), gp = gainOf(1, v), gj = gainOf(2, v), gs = gainOf(3, v), gw = gainOf(4, v), gn = gainOf(5, v);
      const murm = flt('murm').run(w1, 700, 0.9).bp, murm2 = flt('murm2').run(w2, 1300, 1.2).bp;
      const mod = 0.7 + 0.3 * Math.sin(TAU * 0.7 * v) * Math.sin(TAU * 1.13 * v + 1);
      const crowd = (murm * 0.6 + murm2 * 0.3) * mod;
      // the excited crowd on the Moon and Pluto: a cheering roar, swelling with the jumps
      const cheer = flt('cheer').run(w3, 1600 + 400 * Math.sin(TAU * 0.4 * v), 0.7).bp;
      const tm = v - LAND.moon - MOON_ALL;
      const swell = 0.5 + 0.6 * Math.exp(-Math.max(0, tm) / 1.4) * smooth(-0.3, 0.1, tm);
      const water = flt('water').run(w4, 2400, 0.5).bp * 0.5 + flt('water2').run(w4, 600, 0.8).bp * 0.4;
      const traffic = flt('traf').run(w2, 90, 0.7).lp * 2.5;
      const bed = crowd * (0.12 * (gm + gp) + 0.07 * gj) + cheer * (0.36 * gm * swell + 0.12 * gp) + water * (0.07 * gm + 0.14 * gp + 0.04 * gj) + traffic * (0.09 * (gm + gp + gj) + 0.03 * gs);
      l += bed; r += bed * 0.96 + (cheer * 0.03 * gm);
      // Pluto: the wind past you as you rise, a hushed airy hum
      if (gp > 0.001) {
        const tt = v - LAND.pluto, up = smooth(PLU_TAKE, PLU_TAKE + 2.5, tt);
        const wind = flt('pwind').run(w1, 300 + 900 * up, 0.5).bp * (0.05 + 0.3 * up * (1 - 0.4 * smooth(4, 6.5, tt)));
        const hum = (Math.sin(TAU * 220 * v) * 0.5 + Math.sin(TAU * 277.2 * v) * 0.35 + Math.sin(TAU * 329.6 * v) * 0.3) * 0.02 * up;
        l += gp * (wind + hum); r += gp * (wind * 0.9 + hum);
      }
      // Jupiter: a low strain, wood creaking
      if (gj > 0.001) {
        const tt = v - LAND.jupiter;
        const creak = flt('creak').run(w2, 380 + 120 * Math.sin(TAU * 0.9 * v), 0.15).bp * (0.5 + 0.5 * Math.sin(TAU * 2.3 * v)) * 0.12 * smooth(0.3, 1.2, tt);
        const groan = flt('jgroan').run(w3, 260, 0.35).bp * (env(tt - JUP_BUCKLE, 0.25, 1.2) * 0.5 + 0.34 * smooth(0.5, 1.5, tt) * (0.7 + 0.3 * Math.sin(TAU * 0.5 * tt)));
        const strain = flt('jstr').run(w4, 55, 0.6).lp * 2.2;
        l += gj * (creak + groan + strain * 0.22); r += gj * (creak * 0.8 + groan + strain * 0.22);
      }
      // the Sun, the white dwarf: a pressing low roar; the neutron star: the heat roaring up to the white
      if (gs > 0.001 || gw > 0.001) {
        const p = flt('press').run(w1, 70, 0.6).lp * 3.0;
        const ts = v - LAND.sun, rumble = flt('srumb').run(w2, 160, 0.6).lp * 2.2 * (0.6 + 0.4 * Math.sin(TAU * 0.6 * v));
        l += p * (0.24 * gs + 0.3 * gw) + rumble * (0.1 * gs + 0.12 * gw); r += p * (0.24 * gs + 0.3 * gw) + rumble * (0.1 * gs + 0.12 * gw);
        const tw = v - LAND.wd;
        if (gw > 0.001) {
          const hiss = flt('whiss').run(w3, 3200, 0.6).bp * 0.07 * smooth(WD_FLAT0, WD_FLAT1, tw);
          const crackle = flt('wcrk').run(w4 * (R0() < 0.004 ? 6 : 0.2), 900, 0.8).bp * 0.12 * smooth(WD_FLAT0, WD_FLAT0 + 1, tw);
          l += gw * (hiss + crackle); r += gw * (hiss * 0.9 + crackle);
        }
      }
      if (gn > 0.001) {
        const tt = v - LAND.ns, k = smooth(NS_FILM, NS_FILM + 0.3, tt), hot = smooth(NS_WAVE0, NS_WAVE1 + 0.4, tt);
        const roar = flt('nroar').run(w2, 120 + 1400 * hot, 0.5).bp * (0.15 + 0.9 * hot) * k;
        const sub = Math.sin(TAU * (32 + 10 * hot) * tt) * (0.12 + 0.25 * hot) * k;
        const sizzle = flt('nsiz').run(w4, 4000, 0.7).bp * 0.08 * k * (0.4 + hot);
        l += gn * (roar + sub + sizzle); r += gn * (roar * 0.95 + sub + sizzle * 1.05);
      }
    }
    // ===================== one-shots =====================
    for (const e of ev) {
      const d = v - e.t;
      if (d < -0.01 || d > 3.5) continue;
      let s = 0;
      const id = e.kind + e.t.toFixed(3);
      switch (e.kind) {
        case 'clang': {      // a rim rattling: a few inharmonic partials, a soft strike
          const a = env(d, 0.003, 0.35);
          s = (Math.sin(TAU * 523 * d) * 0.5 + Math.sin(TAU * 1340 * d) * 0.3 * Math.exp(-d * 6) + Math.sin(TAU * 2210 * d) * 0.15 * Math.exp(-d * 10)) * a * (1 + 0.4 * Math.sin(TAU * 18 * d));
          break;
        }
        case 'swish': s = flt(id).run(w1, 3000, 0.9).bp * env(d, 0.04, 0.12); break;
        case 'ball': s = Math.sin(TAU * (95 + 60 * Math.exp(-d * 30)) * d) * env(d, 0.004, 0.07) + flt(id).run(w2, 500, 0.8).lp * env(d, 0.003, 0.03) * 0.6; break;
        case 'whomp': s = Math.sin(TAU * (50 + 40 * Math.exp(-d * 6)) * d) * env(d, 0.05, 0.4) + flt(id).run(w3, 250 + 800 * Math.exp(-d * 3), 0.6).bp * env(d, 0.08, 0.5); break;
        case 'boom': {       // a deep impact: a falling sub thump, a rumble, a dull broadband crunch on top
          const sz = e.x;
          s = Math.sin(TAU * (30 + 45 * Math.exp(-d * (5 / sz))) * d) * env(d, 0.006, 0.35 * sz) * 1.2
            + flt(id).run(w1, 140 + 500 * Math.exp(-d * 4), 0.6).lp * env(d, 0.01, 0.6 * sz) * 2.2
            + flt(id + 'c').run(w2, 1100, 0.7).lp * env(d, 0.008, 0.08) * 0.8;
          break;
        }
        case 'groan': {      // steel bending: a falling buzzy tone
          const f = 110 * Math.exp(-d * 0.9);
          s = (Math.sin(TAU * f * d) + 0.5 * Math.sin(TAU * 2.03 * f * d) + 0.3 * Math.sin(TAU * 3.1 * f * d)) * env(d, 0.08, 0.45) * 0.5
            + flt(id).run(w4, 600 * Math.exp(-d), 0.15).bp * env(d, 0.05, 0.4) * 0.6;
          break;
        }
        case 'crash': s = flt(id).run(w1, 900, 0.7).lp * env(d, 0.006, 0.35) * 2.2 + Math.sin(TAU * (45 + 30 * Math.exp(-d * 8)) * d) * env(d, 0.006, 0.25) * 0.8 + flt(id + 'l').run(w3, 2200, 0.5).bp * env(d, 0.03, 0.45) * 0.25; break;
        case 'snap': s = flt(id).run(w2, 1600, 0.6).lp * env(d, 0.006, 0.05) * 2.0 + flt(id + 'b').run(w4, 600, 0.4).bp * env(d, 0.004, 0.12) * 1.2; break;
        case 'pop': s = Math.sin(TAU * (70 + 90 * Math.exp(-d * 25)) * d) * env(d, 0.004, 0.09) * 1.1 + flt(id).run(w3, 1100, 0.6).lp * env(d, 0.004, 0.12) * 1.8; break;
        case 'glass': case 'glassrain': {   // glass: a hiss of grains and soft little high tinkles (no sharp ticks)
          const len = e.kind === 'glass' ? 0.6 : 1.6;
          const hiss = flt(id).run(w4, 3800, 0.5).bp * env(d, 0.03, len);
          let tk = 0;
          for (let j = 0; j < 7; j++) { const t0 = (j * 0.137 + 0.05 * Math.sin(j * 7.1)) * len * 0.8, dd = d - t0; if (dd > 0) tk += Math.sin(TAU * (3200 + 900 * Math.sin(j * 3.3)) * dd) * env(dd, 0.003, 0.05); }
          s = hiss * 0.9 + tk * 0.06;
          break;
        }
        case 'thud': s = Math.sin(TAU * (60 + 50 * Math.exp(-d * 20)) * d) * env(d, 0.005, 0.12) + flt(id).run(w1, 400, 0.7).lp * env(d, 0.005, 0.06) * 1.2; break;
        case 'splinter': s = flt(id).run(w2, 1300, 0.6).lp * env(d, 0.006, 0.07) * 2.0 + flt(id + 'w').run(w3, 450, 0.3).bp * env(d, 0.01, 0.2) * 1.3 + Math.sin(TAU * (80 + 40 * Math.exp(-d * 12)) * d) * env(d, 0.01, 0.15) * 0.6; break;
        case 'clunk': s = Math.sin(TAU * (55 + 35 * Math.exp(-d * 15)) * d) * env(d, 0.006, 0.18) + flt(id).run(w4, 700, 0.3).bp * env(d, 0.006, 0.1) * 0.8; break;
        case 'crunch': s = flt(id).run(w1, 900 + 400 * Math.sin(d * 40), 0.4).bp * env(d, 0.01, 0.25) * 2.0 * (0.6 + 0.4 * Math.sin(TAU * 31 * d)) + Math.sin(TAU * (50 + 30 * Math.exp(-d * 10)) * d) * env(d, 0.008, 0.2) * 0.6; break;
        case 'collapse': s = flt(id).run(w2, 180 + 250 * Math.exp(-d * 2), 0.6).lp * env(d, 0.03, 0.9) * 3.0 + Math.sin(TAU * (34 + 20 * Math.exp(-d * 4)) * d) * env(d, 0.02, 0.6) * 0.7; break;
        case 'crack': s = flt(id).run(w3, 700, 0.5).bp * env(d, 0.01, 0.7) * 1.6 + flt(id + 'h').run(w1, 2600, 0.6).bp * env(d, 0.005, 0.2) * 0.8; break;
        default: break;
      }
      const [pl, pr] = pan(e.p);
      l += s * e.g * pl * 1.2; r += s * e.g * pr * 1.2;
    }
    // ===================== every wipe: a whoosh across (right to left, like the wipe) and a deep hit =====================
    for (const t of wipes) {
      const d = v - t + 0.12;
      if (d < 0 || d > 2.5) continue;
      const ws = flt('fWhoosh' + t).run(w3, 350 + 3000 * clamp(d / 0.4), 0.6).bp * env(d, 0.18, 0.12) * 0.9;
      const [pl, pr] = pan(0.8 - 1.6 * clamp(d / 0.4));
      const hd = d - 0.12;
      const hit = hd > 0 ? Math.sin(TAU * (48 + 36 * Math.exp(-hd * 7)) * hd) * env(hd, 0.008, 0.45) * 0.55 : 0;
      l += ws * pl + hit; r += ws * pr + hit;
    }
    L[n] = l; R[n] = r;
  }
  // ---- the owner's voice clips, each set relative to the mix around it ----
  const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx');
  const clip = (name, skip, len, at, vol, refFrom, refTo) => {
    const file = path.join(DIR, name);
    if (!fs.existsSync(file)) { console.warn(`audio: no sfx/${name}: left out`); return; }
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(skip), '-i', file, '-t', String(len), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    const n0 = Math.round((at - T0) * SR), cl = sc.length >> 1;
    let mix = 0, own = 0;
    const h0 = Math.round((refFrom - T0) * SR), h1 = Math.round((refTo - T0) * SR);
    for (let k = h0; k < h1; k++) mix += L[k] ** 2 + R[k] ** 2;
    mix /= (h1 - h0);
    for (let k = 0; k < cl; k++) own += sc[2 * k] ** 2 + sc[2 * k + 1] ** 2;
    own /= cl;
    const g = vol * Math.sqrt(mix / own);
    for (let k = 0; k < cl && n0 + k < N; k++) {
      const f = Math.min(1, k / (0.01 * SR), (cl - k) / (0.25 * SR));
      L[n0 + k] += sc[2 * k] * g * f; R[n0 + k] += sc[2 * k + 1] * g * f;
    }
    console.log(`audio: ${name} at ${at}s, gain ${g.toFixed(2)}`);
  };
  clip('scream.mp3', 0.08, 2.4, 0.1, 0.9, 0.0, 2.5);
  clip('omg.mp3', 0.0, 0.9, LAND.pluto + 1.6, 1.0, LAND.pluto + 1.0, LAND.pluto + 3.0);
  clip('nooo.mp3', 0.13, 2.2, LAND.sun + 0.35, 0.55, LAND.sun + 0.2, LAND.sun + 2.5);
  clip('gasp.mp3', 0.23, 0.42, LAND.wd + 0.15, 0.5, LAND.wd + 0.2, LAND.wd + 1.5);

  // the video's track: [0, T_SWITCH) as made; from T_SWITCH on it fades over into the run's own lead-in to frame 0
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = L[o0 + n], r = R[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = o0 + n - M;
      l = l * wo + L[j] * wi; r = r * wo + R[j] * wi;
    }
    OL[n] = l; OR[n] = r;
  }
  let peak = 0;
  for (let n = 0; n < M; n++) { OL[n] = Math.tanh(OL[n] * 1.2); OR[n] = Math.tanh(OR[n] * 1.2); peak = Math.max(peak, Math.abs(OL[n]), Math.abs(OR[n])); }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n] * g, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n] * g, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
