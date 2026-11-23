// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// An action-weather topic, so the sound is the weather itself (a wind / roar bed, no music), changing at each wipe:
//   Venus: a hot wind rising, the crowd yelling and the owner's scream (sfx/scream.mp3) in the first second, a deep
//     whoomp as the heat hits, the sea hissing, then a roar and a boom as the steam wall towers up.
//   Mars: a thin cold whistle; the sea's new ice cracking and creaking; a crackling sweep as the frost races up the
//     beach to you; tiny glassy tinkles as the ice crystals glitter down.
//   Mercury: a huge boom and roar as the Sun balloons, the owner's "nooo"; the ice flashing to steam with a great hiss;
//     the sea boiling and bubbling, a roar of steam off the bay; fires crackling, whooshes as the umbrellas go up.
//   Jupiter: everything drops away (a gasp); the fires hiss out; the freeze front groans and cracks in across the sea
//     to a boom at the shore; a low cold drone, the hush of falling snow.
//   Pluto: thin and eerie (the air is going); "oh my god" as the sky goes black; the liquid air pattering down; a
//     crackling front as everyone freezes; the snow hissing down, then a deep muffled rush as it piles over the lens.
// Every wipe: a whoosh and a deep hit; the picker clicks as its cursor locks on.
// The loop: the whole track is made in one run that starts before frame 0; under the white at the end it fades over
// into the moments just before frame 0, so the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STOPS, LAND, T_END } from './src/timeline.js';
import { VEN_HEAT, VEN_STEAM, venSteam, MARS_ICE, MARS_FROST, MARS_DUST, MER_FLASH, MER_BOIL, MER_WALL, MER_FIRE, MER_UMB, MER_HUT,
  JUP_OUT, JUP_FZ0, JUP_FZDUR, JUP_SNOW, PLU_RAIN, PLU_FREEZE, PLU_STATUE, snowDepth } from './src/sched.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SQZ = Number(process.env.SQZ ?? 3);       // the squeeze starts this many dB over the median
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx');
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 6) / SR);
    this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h;
    return { lp: this.l, bp: this.b, hp: h };
  }
}
class OnePole { constructor(fc) { this.y = 0; this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
const boom = (t, f0, f1, k, a, d) => (t > 0 ? Math.sin(TAU * (f0 + f1 * Math.exp(-t * k)) * t) * env(t, a, d) : 0);

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77), R1 = rng(91), R2 = rng(123), R3 = rng(311);
  const lands = STOPS.map((s) => s.land);
  // how much of stop k is in the mix at time v (a quick crossfade at each wipe)
  const gainOf = (k, v) => smooth(lands[k] - 0.02, lands[k] + 0.22, v) * (k + 1 < lands.length ? 1 - smooth(lands[k + 1] - 0.02, lands[k + 1] + 0.22, v) : 1) + (k === 0 && v < lands[0] ? 1 : 0);
  // random event lists (deterministic)
  const evts = (t0, t1, rate, rr) => { const o = []; let t = t0; while (t < t1) { t += -Math.log(1 - rr() * 0.999) / rate; if (t < t1) o.push([t, rr(), rr()]); } return o; };
  const iceCracks = evts(LAND.mars + MARS_ICE + 0.2, LAND.mercury, 9, rng(9));
  const frostTinks = [...evts(LAND.mars + MARS_FROST, LAND.mars + MARS_FROST + 1.4, 55, rng(5)), ...evts(LAND.mars + MARS_FROST + 1.4, LAND.mercury, 6, rng(15))];
  const dustTinks = evts(LAND.mars + MARS_DUST - 0.4, LAND.mercury, 18, rng(25));
  const bubbles = evts(LAND.mercury + MER_BOIL, LAND.jupiter, 30, rng(6));
  const crackles = evts(LAND.mercury + MER_FIRE - 0.4, LAND.jupiter + JUP_OUT + 0.6, 45, rng(7));
  const umbWhoosh = [0, 0.7, 1.3, 2.1, 2.9].map((d, j) => [LAND.mercury + MER_UMB + d, j]);
  const jupCracks = evts(LAND.jupiter + JUP_FZ0 + 0.2, LAND.jupiter + JUP_FZ0 + JUP_FZDUR + 0.5, 20, rng(19));
  const plinks = evts(LAND.pluto + PLU_RAIN + 0.2, LAND.pluto + PLU_FREEZE + 0.6, 40, rng(29));
  const pluCracks = evts(LAND.pluto + PLU_STATUE, LAND.pluto + PLU_STATUE + 1.6, 40, rng(39));
  const wipes = lands.slice(1);

  // every call site gets its own filter (a filter run twice in one sample would run at double speed)
  const FL = new Map();
  const flt = (name, kind) => { let f = FL.get(name); if (!f) { f = kind === 'OnePole' ? new OnePole(60) : new SVF(); FL.set(name, f); } return f; };
  let ph1 = 0, ph2 = 0, ph3 = 0;
  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    const w1 = R0() * 2 - 1, w2 = R1() * 2 - 1, w3 = R2() * 2 - 1, w4 = R3() * 2 - 1;
    let l = 0, r = 0;
    // ===================== Venus =====================
    const gV = gainOf(0, v);
    if (gV > 0.001) {
      const tt = v - LAND.venus;
      const hk = smooth(0.0, 2.6, tt);
      const wind = flt('vWind', 'SVF').run(w1, 380 + 300 * hk + 80 * Math.sin(tt * 1.3), 0.7).bp * (0.55 + 0.6 * hk) + flt('vLow', 'SVF').run(w2, 90, 0.7).lp * 1.8;
      // the crowd yelling, loudest as the heat hits and they run
      const yell = (flt('vy1', 'SVF').run(w3, 760, 0.45).bp * 0.5 + flt('vy2', 'SVF').run(w4, 1200, 0.4).bp * 0.35 + flt('vy3', 'SVF').run(w1, 2500, 0.5).bp * 0.16)
        * (0.8 + 0.2 * Math.sin(TAU * 2.7 * v) * Math.sin(TAU * 0.9 * v)) * (0.35 + 0.65 * env(tt - VEN_HEAT, 0.3, 2.2)) * 1.1;
      const whoomp = boom(tt - VEN_HEAT, 40, 32, 6, 0.03, 0.55) * 0.9 + flt('vWh', 'SVF').run(w2, 200, 0.7).lp * env(tt - VEN_HEAT, 0.04, 0.4) * 2.0;
      const sk = venSteam(tt);
      const hiss = flt('vHiss', 'SVF').run(w3, 2200, 0.9).bp * 0.24 * sk * (0.8 + 0.2 * Math.sin(tt * 11));
      const se = tt - VEN_STEAM;
      const sRoar = flt('vSR', 'SVF').run(w4, 800 + 1200 * smooth(0, 2, se), 0.6).bp * smooth(-0.2, 0.6, se) * 0.6 + flt('vSL', 'SVF').run(w1, 150, 0.7).lp * smooth(-0.2, 0.5, se) * 1.5;
      const sBoom = boom(se, 36, 30, 5, 0.03, 0.8) * 0.75;
      l += gV * (wind + yell + whoomp + hiss + sRoar + sBoom); r += gV * (wind * 0.95 + yell * 0.96 + whoomp + hiss * 0.92 + sRoar * 0.95 + sBoom);
    }
    // ===================== Mars =====================
    const gM = gainOf(1, v);
    if (gM > 0.001) {
      const tt = v - LAND.mars;
      const cold = flt('mWh', 'SVF').run(w1, 950 + 90 * Math.sin(tt * 0.7), 0.06).bp * 0.2 + flt('mWh2', 'SVF').run(w2, 1520 + 120 * Math.sin(tt * 0.5 + 1), 0.07).bp * 0.1;
      const air = flt('mAir', 'SVF').run(w3, 260, 0.8).lp * 0.55 + flt('mSub', 'SVF').run(w4, 70, 0.7).lp * 1.2;
      // the sea's new ice: cracks (a sharp-ish tick with a low thump under it) and a slow creak
      let ic = 0;
      for (const [t, a] of iceCracks) { const d = v - t; if (d >= 0 && d < 0.4) ic += (w4 * env(d, 0.003, 0.025 + 0.04 * a) * 0.3 + Math.sin(TAU * (80 + 70 * a) * d) * env(d, 0.004, 0.16) * 0.3); }
      const icS = flt('mIc', 'SVF').run(ic, 1600, 0.7).lp;
      const creak = flt('mCreak', 'SVF').run(w2, 180 + 60 * Math.sin(tt * 1.1), 0.08).bp * 0.12 * smooth(MARS_ICE, MARS_ICE + 1, tt) * (0.5 + 0.5 * Math.sin(tt * 1.9));
      // the frost racing up the beach: a rushing crackle sweeping toward you
      const fs2 = tt - MARS_FROST;
      const sweep = flt('mSweep', 'SVF').run(w1, 2400 + 2000 * clamp(fs2 / 1.3), 0.7).bp * (fs2 > 0 ? env(fs2, 0.9, 0.5) : 0) * 0.5;
      const reach = boom(tt - MARS_FROST - 1.2, 50, 30, 7, 0.01, 0.3) * 0.45;
      let tk = 0;
      for (const [t, a, b] of frostTinks) { const d = v - t; if (d >= 0 && d < 0.3) tk += Math.sin(TAU * (2400 + 2200 * a) * d) * env(d, 0.002, 0.06) * (0.03 + 0.03 * b); }
      for (const [t, a, b] of dustTinks) { const d = v - t; if (d >= 0 && d < 0.5) tk += Math.sin(TAU * (3600 + 3000 * a) * d) * env(d, 0.003, 0.12) * (0.015 + 0.02 * b); }
      l += gM * (cold + air + icS + creak + sweep + reach + tk); r += gM * (cold * 0.85 + air + icS * 0.9 + creak * 0.9 + sweep * 0.9 + reach + tk * 0.8);
    }
    // ===================== Mercury =====================
    const gR = gainOf(2, v);
    if (gR > 0.001) {
      const tt = v - LAND.mercury;
      // the blast as the Sun balloons: a huge low boom and a roar that stays
      const blast = boom(tt, 30, 45, 4, 0.02, 1.1) * 1.3 + flt('rBl', 'SVF').run(w1, 300 + 1200 * env(tt, 0.05, 0.4), 0.6).lp * env(tt, 0.03, 0.9) * 2.2;
      const roar = flt('rRoar', 'SVF').run(w2, 420 + 120 * Math.sin(tt * 1.7), 0.6).lp * (0.7 + 0.5 * smooth(0, 2, tt)) + flt('rSub', 'SVF').run(w3, 60, 0.7).lp * 1.6;
      // the ice flashing to steam: a great hiss
      const fl = tt - MER_FLASH;
      const fsh = flt('rFsh', 'SVF').run(w4, 1500 + 1200 * clamp(fl / 0.3), 0.7).bp * env(fl, 0.08, 1.2) * 0.9 + flt('rFsh2', 'SVF').run(w1, 3200, 0.8).bp * env(fl, 0.06, 0.6) * 0.15;
      // boiling
      let bub = 0;
      for (const [t, a, b] of bubbles) { const d = v - t; if (d >= 0 && d < 0.12) bub += Math.sin(TAU * (90 + 160 * a) * (1 + 2 * d) * d) * env(d, 0.004, 0.035) * 0.15 * (0.5 + b); }
      const boilBed = flt('rBoil', 'SVF').run(w2, 600, 0.9).bp * 0.25 * smooth(MER_BOIL, MER_BOIL + 1.2, tt);
      // the steam wall
      const se = tt - MER_WALL;
      const sRoar = flt('rSR', 'SVF').run(w3, 700 + 1400 * smooth(0, 2.5, se), 0.6).bp * smooth(-0.3, 0.8, se) * 0.7 + flt('rSL', 'SVF').run(w4, 140, 0.7).lp * smooth(-0.3, 0.6, se) * 1.8;
      const sBoom = boom(se, 34, 30, 5, 0.03, 0.9) * 0.85;
      // fire: crackles (soft, low-passed) and whooshes as things go up
      let cr = 0;
      for (const [t, a] of crackles) { const d = v - t; if (d >= 0 && d < 0.03) cr += (R2() * 2 - 1) * env(d, 0.003, 0.006) * (0.1 + 0.3 * a); }
      const fireK = smooth(MER_FIRE - 0.5, MER_FIRE + 2.5, tt);
      const crS = flt('rCr', 'SVF').run(cr, 2400, 0.8).lp * 1.1 * fireK + flt('rFire', 'SVF').run(w1, 240, 0.7).lp * 1.4 * fireK;
      let wh = 0;
      for (const [t, j] of umbWhoosh) { const d = v - t; if (d > -0.05 && d < 1.5) wh += flt('rWh' + j, 'SVF').run(w2, 300 + 900 * env(d, 0.15, 0.4), 0.6).lp * env(d, 0.12, 0.45) * 1.4; }
      const hut = tt - MER_HUT;
      wh += flt('rHut', 'SVF').run(w3, 250 + 800 * env(hut, 0.2, 0.5), 0.6).lp * env(hut, 0.18, 0.7) * 1.8;
      l += gR * (blast + roar + fsh + bub + boilBed + sRoar + sBoom + crS + wh); r += gR * (blast + roar * 0.95 + fsh * 0.95 + bub * 0.8 + boilBed + sRoar * 0.95 + sBoom + crS * 1.1 + wh * 0.9);
    }
    // ===================== Jupiter =====================
    const gJ = gainOf(3, v);
    if (gJ > 0.001) {
      const tt = v - LAND.jupiter;
      ph1 += 55 / SR; ph2 += 82.4 / SR;
      const drone = (Math.sin(TAU * ph1) * 0.14 + Math.sin(TAU * ph2) * 0.08) * smooth(0, 1.2, tt) + flt('jWind2', 'SVF').run(w4, 420 + 120 * Math.sin(tt * 0.8), 0.5).bp * 0.35 * smooth(3, 5, tt);
      const air = flt('jAir', 'SVF').run(w1, 240, 0.8).lp * 0.5 + flt('jWh', 'SVF').run(w2, 700 + 60 * Math.sin(tt * 0.6), 0.08).bp * 0.08;
      // the fires and the boiling hiss out
      const out = flt('jOut', 'SVF').run(w3, 1900, 0.8).bp * env(tt, 0.08, JUP_OUT * 1.2) * 0.35;
      // the freeze front cracking in across the sea, a boom where it hits the shore
      const nearK = 0.3 + 0.7 * smooth(JUP_FZ0, JUP_FZ0 + JUP_FZDUR, tt);
      let ic = 0;
      for (const [t, a] of jupCracks) { const d = v - t; if (d >= 0 && d < 0.4) ic += (w4 * env(d, 0.003, 0.03 + 0.05 * a) * 0.32 + Math.sin(TAU * (90 + 60 * a) * d) * env(d, 0.004, 0.18) * 0.26) * nearK; }
      const icS = flt('jIc', 'SVF').run(ic, 1700, 0.7).lp;
      const groan = flt('jGroan', 'SVF').run(w2, 140 + 90 * Math.sin(tt * 1.3), 0.08).bp * 0.14 * smooth(JUP_FZ0, JUP_FZ0 + 0.5, tt) * (0.5 + 0.5 * Math.sin(tt * 2.1));
      const shore = boom(tt - JUP_FZ0 - JUP_FZDUR, 36, 28, 4, 0.01, 0.9) * 1.0 + boom(tt - JUP_FZ0, 40, 20, 4, 0.01, 0.6) * 0.4;
      // the hush of snow
      const hush = flt('jHush', 'SVF').run(w3, 1800, 0.5).bp * 0.12 * smooth(JUP_SNOW, JUP_SNOW + 2, tt);
      l += gJ * (drone + air + out + icS + groan + shore + hush); r += gJ * (drone + air * 0.95 + out * 0.9 + icS * 0.9 + groan * 0.9 + shore + hush * 0.92);
    }
    // ===================== Pluto =====================
    const gP = gainOf(4, v);
    if (gP > 0.001) {
      const tt = v - LAND.pluto;
      ph3 += 440 / SR;
      const eerie = (Math.sin(TAU * ph3) * 0.5 + Math.sin(TAU * ph3 * 1.498) * 0.35 + Math.sin(TAU * ph3 * 0.5 + Math.sin(tt * 0.7)) * 0.4) * 0.06 * smooth(0.2, 2, tt);
      const low = flt('pLow', 'SVF').run(w1, 60, 0.7).lp * 2.4 * (0.5 + 0.5 * smooth(PLU_FREEZE, PLU_FREEZE + 4, tt));
      // the liquid air pattering down (a fine hiss, plinks on the frozen ground)
      const rk = smooth(PLU_RAIN, PLU_RAIN + 0.8, tt) * (1 - smooth(PLU_FREEZE - 0.2, PLU_FREEZE + 0.8, tt));
      const patter = flt('pPat', 'SVF').run(w2, 2800, 0.7).bp * 0.1 * rk + flt('pPat2', 'SVF').run(w4, 1100, 0.6).bp * 0.45 * rk;
      let pk = 0;
      for (const [t, a, b] of plinks) { const d = v - t; if (d >= 0 && d < 0.1) pk += Math.sin(TAU * (900 + 1500 * a) * (1 - 0.3 * d) * d) * env(d, 0.002, 0.03) * (0.04 + 0.05 * b); }
      // everyone freezing: a crackling front running up the beach, a boom as it all locks
      let ic = 0;
      for (const [t, a] of pluCracks) { const d = v - t; if (d >= 0 && d < 0.3) ic += w4 * env(d, 0.003, 0.02 + 0.03 * a) * 0.3 * (0.4 + 0.6 * clamp((t - LAND.pluto - PLU_STATUE) / 1.5)); }
      const icS = flt('pIc', 'SVF').run(ic, 2200, 0.7).lp;
      const lock = boom(tt - PLU_FREEZE, 38, 30, 5, 0.01, 0.8) * 0.8;
      // the snow: a hiss that grows to a muffled rush as it piles over the lens
      const dep = snowDepth('pluto', tt);
      const sn = smooth(PLU_FREEZE - 0.2, PLU_FREEZE + 1, tt);
      const rush = flt('pRush', 'SVF').run(w3, 1100 - 850 * smooth(1.4, 2.0, dep), 0.6).bp * (0.5 * sn + 0.5 * smooth(1.2, 1.9, dep));
      const thud = flt('pThud', 'SVF').run(w1, 90, 0.7).lp * 2.4 * smooth(1.5, 1.95, dep);
      l += gP * (eerie + low + patter + pk + icS + lock + rush + thud); r += gP * (eerie + low + patter * 0.9 + pk * 0.8 + icS * 0.9 + lock + rush * 0.95 + thud);
    }
    // ===================== every wipe: a whoosh across (right to left, like the wipe) and a deep hit =====================
    for (const t of wipes) {
      const d = v - t + 0.12;
      if (d < 0 || d > 2.5) continue;
      const ws = flt('fWhoosh' + t, 'SVF').run(w3, 350 + 3000 * clamp(d / 0.4), 0.6).bp * env(d, 0.18, 0.12) * 0.9;
      const [pl, pr] = pan(0.8 - 1.6 * clamp(d / 0.4));
      const hd = d - 0.12;
      const hit = hd > 0 ? Math.sin(TAU * (48 + 36 * Math.exp(-hd * 7)) * hd) * env(hd, 0.008, 0.45) * 0.55 : 0;
      const click = hd > 0 ? Math.sin(TAU * 1900 * hd) * env(hd, 0.002, 0.012) * 0.05 : 0;
      l += ws * pl + hit + click; r += ws * pr + hit + click;
    }
    L[n] = l; R[n] = r;
  }
  // the owner's clips (sfx/): each one's level follows the mix around it
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
  clip('scream.mp3', 0.08, 2.4, 0.15, 0.85, 0.0, 2.5);
  clip('nooo.mp3', 0.13, 2.2, LAND.mercury + 0.35, 0.5, LAND.mercury + 0.2, LAND.mercury + 2.5);
  clip('gasp.mp3', 0.23, 0.42, LAND.jupiter + 0.25, 0.6, LAND.jupiter + 0.2, LAND.jupiter + 1.5);
  clip('omg.mp3', 0.0, 0.9, LAND.pluto + 1.4, 0.9, LAND.pluto + 1.0, LAND.pluto + 3.0);

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
  {
    // a gentle squeeze on the loudest moments so the quieter stretches sit closer to them: loudness every 10 ms (RMS
    // over 60 ms); above the threshold 2.5:1, fast down and slowly back up
    const hop = Math.round(0.01 * SR), win = Math.round(0.06 * SR), nb = Math.ceil(M / hop), lev = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      let e = 0, c = 0;
      for (let n = Math.max(0, b * hop - win / 2); n < Math.min(M, b * hop + win / 2); n++) { e += OL[n] * OL[n] + OR[n] * OR[n]; c++; }
      lev[b] = 10 * Math.log10(e / Math.max(1, c) / 2 + 1e-12);
    }
    const sorted = Array.from(lev).sort((a, b) => a - b), thr = sorted[Math.floor(nb * 0.55)] + SQZ;
    const gdb = new Float32Array(nb);
    let gs = 0, gmin = 0;
    for (let b = 0; b < nb; b++) { const want = lev[b] > thr ? -(lev[b] - thr) * (1 - 1 / 2.5) : 0; gs += (want - gs) * (want < gs ? 0.5 : 0.04); gdb[b] = gs; gmin = Math.min(gmin, gs); }
    for (let n = 0; n < M; n++) { const g = Math.pow(10, gdb[Math.min(nb - 1, Math.floor(n / hop))] / 20); OL[n] *= g; OR[n] *= g; }
    console.log(`audio: squeeze above ${thr.toFixed(1)} dB, at most ${gmin.toFixed(1)} dB`);
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
