// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// An action-weather topic, so the sound is the weather itself (a wind / roar bed, no music), changing with each wipe:
//   Jupiter: a storm roar, thunder at every strike (a bright crack, then a long rumble), a huge crack and an electric
//     buzz when your umbrella is hit, then the rain hissing in; the owner's scream (sfx/scream.mp3) in the first second.
//   Mars: the dust wall's roar swelling as it comes, a thump as it hits you, sand hissing inside it, then a thin cold
//     wind and a crackling sweep of frost racing up the beach.
//   Venus: a deep whoomp of heat, the sea hissing and bubbling, your umbrella going up with a whoosh and crackling,
//     then the sea boiling off with a roar of steam.
//   Titan: quiet and heavy: big slow drops plopping on the umbrella; the freeze front crackling in across the sea, a
//     boom as it hits the shore, your frozen umbrella shattering like glass and its shards tinkling down.
//   Saturn: a howling gale, the umbrella snapping inside out and flapping, then tearing away.
//   Neptune: a double sonic boom, a roar far louder than anything before, the cloth shredding, the pier crashing,
//     a rush as you're lifted, and the roar peaking into the white.
// Every wipe: a whoosh and a deep hit; the picker clicks as its cursor locks on.
// The loop: the whole track is made in one run that starts before frame 0; under the white at the end it fades over
// into the moments just before frame 0, so the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STOPS, LAND, T_END } from './src/timeline.js';
import { STRIKES, JUP_RAIN, marsR, MARS_IN, MARS_CLEAR, MARS_FROST, VEN_FIRE, VEN_STEAM, TIT_FZ0, TIT_SHORE, TIT_SHATTER, SAT_FLIP, SAT_RIP, NEP_SHRED, NEP_LIFT, NEP_PIER, nepWhite } from './src/sched.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAMS = [[0.15, 1.0]];          // [when, how loud]: the storm wall on frame 0 (one scream only)
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

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77), R1 = rng(91), R2 = rng(123);
  const lands = STOPS.map((s) => s.land);
  // how much of stop k is in the mix at time v (a quick crossfade at each wipe)
  const gainOf = (k, v) => smooth(lands[k] - 0.02, lands[k] + 0.22, v) * (k + 1 < lands.length ? 1 - smooth(lands[k + 1] - 0.02, lands[k + 1] + 0.22, v) : 1) + (k === 0 && v < lands[0] ? 1 : 0);

  // ---- events (in video time) ----
  // thunder: [t, crack gain, rumble gain, pan, delay]
  const thunder = [];
  for (const s of STRIKES) {
    const t = LAND.jupiter + s.t;
    if (s.who === 'far') thunder.push([t + 0.35, 0.25, 0.7, -0.3 + 0.6 * s.seed, 0]);
    else if (s.who === 'sea') thunder.push([t + 0.05, 0.75, 0.9, 0.2 - 0.4 * s.seed, 0]);
    else thunder.push([t, 1.25, 1.1, -0.35, 1]);       // your umbrella: right on top of you
  }
  // random event lists (deterministic)
  const evts = (t0, t1, rate, rr) => { const o = []; let t = t0; while (t < t1) { t += -Math.log(1 - rr() * 0.999) / rate; if (t < t1) o.push([t, rr(), rr()]); } return o; };
  const frostTinks = [...evts(LAND.mars + MARS_FROST, LAND.mars + MARS_FROST + 1.3, 60, rng(5)), ...evts(LAND.mars + MARS_FROST + 1.3, LAND.venus, 9, rng(15))];
  const bubbles = evts(LAND.venus + 0.2, LAND.titan, 26, rng(6));
  const crackles = evts(LAND.venus + VEN_FIRE, LAND.titan, 38, rng(7));
  const plops = evts(LAND.titan + 0.3, LAND.titan + TIT_SHORE + 0.5, 7, rng(8));
  const iceCracks = [...evts(LAND.titan + TIT_FZ0 + 0.3, LAND.titan + TIT_SHORE + 0.6, 22, rng(9)), ...evts(LAND.titan + TIT_SHORE + 0.6, LAND.saturn, 4, rng(19))];
  const shards = evts(LAND.titan + TIT_SHATTER + 0.25, LAND.titan + TIT_SHATTER + 1.4, 45, rng(10));
  const wipes = lands.slice(1);

  // every call site gets its own filter (a filter run twice in one sample would run at double speed)
  const FL = new Map();
  const flt = (name, kind) => { let f = FL.get(name); if (!f) { f = kind === 'OnePole' ? new OnePole(60) : new SVF(); FL.set(name, f); } return f; };
  let ph1 = 0, ph2 = 0, phB = 0, phS = 0;
  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    const w1 = R0() * 2 - 1, w2 = R1() * 2 - 1, w3 = R2() * 2 - 1;
    let l = 0, r = 0;
    // ===================== Jupiter =====================
    const gJ = gainOf(0, v);
    if (gJ > 0.001) {
      const tt = v - LAND.jupiter;
      const gust = 0.6 + 0.4 * Math.sin(tt * 0.9) * Math.sin(tt * 0.37 + 1);
      const wind = flt('fWind1', 'SVF').run(w1, 260 + 160 * gust, 0.9).bp * 1.3 + flt('fRumble2', 'SVF').run(w2, 85, 0.7).lp * 2.6;
      const rain = smooth(JUP_RAIN - 0.5, JUP_RAIN + 0.8, tt);
      const rn = flt('fRain3', 'SVF').run(w3, 5200, 0.6).hp * 0.22 * rain ;
      // thunder: a crack (bright, a few ms to rise so it never clacks) and a long rolling rumble
      let crk = 0, rum = 0, buzz = 0, pc = 0;
      for (const [t, cg, rg, p, you] of thunder) {
        const d = v - t;
        if (d < -0.01 || d > 6) continue;
        const ec = env(d, 0.004, 0.07) * cg + env(d - 0.09, 0.004, 0.05) * cg * 0.6;
        const er = env(d, 0.12, 1.3 + rg) * rg * (0.75 + 0.25 * Math.sin(d * 7 + t));
        crk += ec; rum += er; pc += p * (ec + er);
        if (you) { buzz += env(d, 0.003, 0.25); }
      }
      const cs = flt('fCrack4', 'SVF').run(w1, 3800, 0.5);
      const crackS = (cs.lp * 0.7 + cs.hp * 0.25) * crk * 1.4;
      const rumS = flt('fRoar5', 'SVF').run(w2, 70 + 40 * Math.sin(v * 3), 0.5).lp * rum * 3.2;
      phB += 118 / SR; const bz = ((phB % 1) * 2 - 1) * 0.3 + w3 * 0.2;
      const buzzS = bz * buzz * 0.5;
      const [pl, pr] = pan(clamp(pc / Math.max(crk + rum, 1e-3), -1, 1) * 0.6);
      const crowd = flt('fCrowd6', 'SVF').run(w3, 700 + 300 * Math.sin(v * 2.3), 2.0).bp * 0.12 * (0.6 + 0.4 * Math.sin(v * 1.7));
      const gs = gJ * (0.85 + 0.15 * smooth(-1, 1, tt));
      l += gs * (wind * 0.9 + rn + crackS * pl + rumS * pl + buzzS + crowd);
      r += gs * (wind * 0.85 + rn * 0.95 + crackS * pr + rumS * pr + buzzS * 0.8 + crowd * 0.9);
    }
    // ===================== Mars =====================
    const gM = gainOf(1, v);
    if (gM > 0.001) {
      const tt = v - LAND.mars;
      const Rd = marsR(tt);
      const near = smooth(240, 6, Rd);
      const thin = smooth(MARS_CLEAR, MARS_CLEAR + 0.8, tt);
      const roar = flt('fWind27', 'SVF').run(w1, 180 + 600 * near, 0.6).lp * (0.7 + 1.0 * near) * (1 - 0.7 * thin);
      const hiss = flt('fHiss8', 'SVF').run(w2, 3600, 0.8).bp * 0.5 * smooth(10, 4, Rd) * (1 - 0.85 * thin);
      const cold = flt('fWhistle9', 'SVF').run(w3, 950 + 80 * Math.sin(tt * 0.7), 0.06).bp * 0.16 * thin;
      // the wall hitting you: a deep thump under the roar
      const hi = tt - MARS_IN + 0.1;
      const thump = hi > 0 ? Math.sin(TAU * (40 + 30 * Math.exp(-hi * 6)) * hi) * env(hi, 0.02, 0.4) * 0.8 : 0;
      // the frost racing up the beach: a rushing crackle that sweeps toward you
      const fs = tt - MARS_FROST;
      const sweep = flt('fFrostSweep', 'SVF').run(w1, 2600 + 1800 * clamp(fs / 1.2), 0.7).bp * (fs > 0 ? env(fs, 0.6, 0.5) : 0) * 0.35;
      let tk = 0;
      for (const [t, a, b] of frostTinks) { const d = v - t; if (d >= 0 && d < 0.3) tk += Math.sin(TAU * (2400 + 2200 * a) * d) * env(d, 0.002, 0.06) * (0.03 + 0.03 * b); }
      l += gM * (roar + hiss + cold + tk + thump + sweep); r += gM * (roar * 0.95 + hiss * 0.9 + cold * 0.8 + tk * 0.7 + thump + sweep * 0.9);
    }
    // ===================== Venus =====================
    const gV = gainOf(2, v);
    if (gV > 0.001) {
      const tt = v - LAND.venus;
      const k = smooth(0.0, 1.0, tt);
      const whoomp = Math.sin(TAU * (42 + 30 * Math.exp(-tt * 6)) * tt) * env(tt, 0.02, 0.5) * 0.9 + flt('fFire10', 'SVF').run(w1, 220, 0.7).lp * env(tt, 0.03, 0.4) * 2.0;
      const steam = flt('fHiss11', 'SVF').run(w2, 3800, 0.9).bp * 0.6 * k * (0.75 + 0.25 * Math.sin(tt * 13));
      let bub = 0;
      for (const [t, a, b] of bubbles) { const d = v - t; if (d >= 0 && d < 0.12) bub += Math.sin(TAU * (90 + 160 * a) * (1 + 2 * d) * d) * env(d, 0.004, 0.035) * 0.14 * (0.5 + b); }
      const fire = smooth(VEN_FIRE - 0.1, VEN_FIRE + 0.4, tt) * (1 - 0.6 * smooth(VEN_FIRE + 3, VEN_FIRE + 4.5, tt));
      const ign = env(tt - VEN_FIRE, 0.15, 0.6);
      const roar = flt('fRoar12', 'SVF').run(w3, 280 + 900 * ign, 0.7).lp * (1.0 * fire + 1.2 * ign);
      let cr = 0;
      for (const [t, a] of crackles) { const d = v - t; if (d >= 0 && d < 0.03) cr += (R2() * 2 - 1) * env(d, 0.003, 0.006) * (0.12 + 0.3 * a); }
      const crS = flt('fCrackle13', 'SVF').run(cr, 2600, 0.8).lp * 1.1;
      // the sea boiling off: a deep boom and a huge rising roar of steam
      const se = tt - VEN_STEAM;
      const sBoom = se > 0 ? Math.sin(TAU * (36 + 30 * Math.exp(-se * 5)) * se) * env(se, 0.03, 0.8) * 0.9 : 0;
      const sRoar = flt('fSteamRoar', 'SVF').run(w1, 900 + 1400 * smooth(0, 2, se), 0.6).bp * smooth(-0.1, 0.6, se) * (1 - 0.4 * smooth(2, 4, se)) * 0.7
        + flt('fSteamLow', 'SVF').run(w2, 160, 0.7).lp * smooth(-0.1, 0.5, se) * 1.6;
      l += gV * (whoomp + steam + bub + roar + crS + sBoom + sRoar); r += gV * (whoomp + steam * 0.92 + bub * 0.8 + roar * 0.95 + crS * 1.1 + sBoom + sRoar * 0.95);
    }
    // ===================== Titan =====================
    const gT = gainOf(3, v);
    if (gT > 0.001) {
      const tt = v - LAND.titan;
      ph1 += 55 / SR; ph2 += 82.4 / SR;
      const drone = (Math.sin(TAU * ph1) * 0.09 + Math.sin(TAU * ph2) * 0.05) * smooth(0, 0.8, tt);
      const air = flt('fWind14', 'SVF').run(w1, 220, 0.8).lp * 0.45;
      let pl = 0, pr = 0;
      for (const [t, a, b] of plops) {
        const d = v - t; if (d < 0 || d > 0.25) continue;
        const s = Math.sin(TAU * (520 - 300 * Math.min(1, d / 0.07)) * d) * env(d, 0.003, 0.07) * (0.13 + 0.08 * b);
        const [ql, qr] = pan(a * 1.4 - 0.7); pl += s * ql; pr += s * qr;
      }
      // the freeze: a boom as the front sets off far out, cracks racing in (louder as it nears), a big boom at the shore
      let boom = 0;
      for (const [t0, g] of [[TIT_FZ0, 0.6], [TIT_SHORE, 1.1]]) { const fz = tt - t0; if (fz > -0.01) boom += Math.sin(TAU * (38 + 25 * Math.exp(-fz * 4)) * fz) * env(fz, 0.01, 0.8) * g; }
      const groan = flt('fGroan15', 'SVF').run(w2, 140 + 90 * Math.sin(tt * 1.3), 0.08).bp * 0.12 * smooth(TIT_FZ0, TIT_FZ0 + 0.5, tt) * (0.5 + 0.5 * Math.sin(tt * 2.1));
      const nearK = 0.3 + 0.7 * smooth(TIT_FZ0, TIT_SHORE, tt);
      let ic = 0;
      for (const [t, a] of iceCracks) { const d = v - t; if (d >= 0 && d < 0.4) ic += ((R2() * 2 - 1) * env(d, 0.003, 0.03 + 0.05 * a) * 0.35 + Math.sin(TAU * (90 + 60 * a) * d) * env(d, 0.004, 0.18) * 0.25) * nearK; }
      const icS = flt('fCrack16', 'SVF').run(ic, 1800, 0.7).lp;
      // the umbrella shattering: a bright smash of glass, then the shards tinkling down onto the frozen sand
      const sd = tt - TIT_SHATTER;
      const smash = sd > -0.005 ? (flt('fSmash', 'SVF').run(w3, 3000, 0.8).bp * env(sd, 0.008, 0.13) * 0.75 + flt('fSmashLo', 'SVF').run(w1, 700, 0.8).bp * env(sd, 0.008, 0.09) * 0.8) : 0;
      let tink = 0;
      for (const [t, a, b] of shards) { const d = v - t; if (d >= 0 && d < 0.25) tink += Math.sin(TAU * (2800 + 3600 * a) * d) * env(d, 0.001, 0.04 + 0.03 * b) * (0.05 + 0.05 * b); }
      l += gT * (drone + air + pl + boom + groan + icS + smash + tink); r += gT * (drone + air + pr + boom + groan * 0.9 + icS * 0.9 + smash * 0.95 + tink * 0.8);
    }
    // ===================== Saturn and Neptune: the winds =====================
    for (const k of [4, 5]) {
      const g = gainOf(k, v);
      if (g < 0.001) continue;
      const Nn = k === 5;
      const tt = v - lands[k];
      const on = smooth(-0.02, 0.15, tt);
      const big = Nn ? 1.0 : 0.65;
      const roar = flt('windRoar' + k, 'SVF').run(w1, (Nn ? 900 : 650) + 250 * Math.sin(tt * 1.7), 0.5).lp * 1.3 * big * on;
      const howl = flt('fWhistle17' + k, 'SVF').run(w2, (Nn ? 1100 : 820) + 380 * Math.sin(tt * 2.3) + 200 * Math.sin(tt * 5.1), 0.09).bp * 0.32 * on;
      const howl2 = flt('fWhistle218' + k, 'SVF').run(w3, (Nn ? 1700 : 1350) + 400 * Math.sin(tt * 1.4 + 2), 0.12).bp * 0.18 * on;
      let sub = flt('fSub19' + k, 'OnePole').run(w2) * (Nn ? 3.0 : 1.6) * on;
      let s = 0;
      if (!Nn) {
        // the umbrella: snaps inside out (a soft thump and a slap of cloth), flaps, tears away
        const fl = tt - SAT_FLIP;
        s += Math.sin(TAU * 85 * fl) * env(fl, 0.006, 0.09) * 0.7 + flt('fTear20' + k, 'SVF').run(w3, 1400, 0.9).bp * env(fl, 0.004, 0.08) * 1.2;
        const flap = tt > SAT_FLIP && tt < SAT_RIP ? 0.5 + 0.5 * Math.sin(TAU * 11 * tt) : 0;
        s += flt('fFlap21' + k, 'SVF').run(w1, 900, 1.2).bp * flap * 0.25;
        const rp = tt - SAT_RIP;
        s += flt('fTear22' + k, 'SVF').run(w2, 1600 + 2000 * clamp(rp / 0.3), 0.6).bp * (rp > 0 && rp < 0.35 ? 1 : 0) * 0.9 * env(rp, 0.03, 0.2) * 1.2;
      } else {
        // a double boom as it hits; the cloth shredding; the pier going; the rush as you're lifted; the roar to the white
        for (const d0 of [0, 0.12]) { const d = tt - d0; s += Math.sin(TAU * (34 + 40 * Math.exp(-d * 8)) * d) * env(d, 0.004, 0.35) * 1.4; }
        s += flt('fTear23' + k, 'SVF').run(w3, 2200, 0.7).bp * (0.5 + 0.5 * Math.sin(TAU * 23 * tt)) * smooth(NEP_SHRED, NEP_SHRED + 0.2, tt) * (1 - smooth(3.5, 5, tt)) * 0.5;
        const pc = tt - NEP_PIER;
        s += (Math.sin(TAU * (45 + 20 * Math.exp(-pc * 3)) * pc) * env(pc, 0.01, 0.7) + flt('fCrackle24' + k, 'SVF').run(w1, 600, 0.7).lp * env(pc, 0.01, 0.9) * 2.5) * 0.8;
        const lf = tt - NEP_LIFT;
        s += flt('fWhoosh25' + k, 'SVF').run(w2, 400 + 1800 * clamp(lf / 1.6), 0.5).bp * env(lf, 0.5, 0.9) * 0.9;
        sub *= 1 + 1.2 * nepWhite(tt);
      }
      const swell = Nn ? 1 + 1.3 * nepWhite(tt) : 1;
      l += g * ((roar + howl + sub) * swell + howl2 * 0.6 + s);
      r += g * ((roar * 0.95 + howl * 0.8 + sub) * swell + howl2 + s * 0.9);
    }
    // ===================== every wipe: a whoosh across (right to left, like the wipe) and a deep hit =====================
    for (const t of wipes) {
      const d = v - t + 0.12;
      if (d < 0 || d > 2.5) continue;
      const ws = flt('fWhoosh26' + t, 'SVF').run(w3, 350 + 3000 * clamp(d / 0.4), 0.6).bp * env(d, 0.18, 0.12) * 0.9;
      const [pl, pr] = pan(0.8 - 1.6 * clamp(d / 0.4));
      const hd = d - 0.12;
      const hit = hd > 0 ? Math.sin(TAU * (48 + 36 * Math.exp(-hd * 7)) * hd) * env(hd, 0.008, 0.45) * 0.55 : 0;
      const click = hd > 0 ? Math.sin(TAU * 1900 * hd) * env(hd, 0.002, 0.012) * 0.05 : 0;
      l += ws * pl + hit + click; r += ws * pr + hit + click;
    }
    L[n] = l; R[n] = r;
  }
  // the owner's scream (sfx/scream.mp3). The file's silence is cut; its level follows the mix around it
  {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx', 'scream.mp3'),
      '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    for (const [at, vol] of SCREAMS) {
      const n0 = Math.round((at - T0) * SR), len = sc.length >> 1;
      let mix = 0, own = 0;
      for (let i = 0; i < len; i++) { mix += L[n0 + i] ** 2 + R[n0 + i] ** 2; own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2; }
      const g = 0.6 * vol * Math.sqrt(mix / own);
      for (let i = 0; i < len; i++) {
        const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
        L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
      }
    }
  }
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
