// Procedural soundtrack for "What if the biggest meteor storm ever hit tonight?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a waterfront at night (water lapping at the quay, the city's far traffic, a crowd talking, swelling
// "ooh"s as the meteors flare) under a music bed for the sky (a dark minor drone and a high shimmer). The fireballs
// hiss as they cross (real fireballs are sometimes heard hissing as they pass); their booms come a second later as deep
// rolling thunder. The sonic boom (0:13): a heavy double crack, the windows rattling, car alarms starting up all along
// the quay. The harbour hit (0:17.5): a rushing whoosh, a deep splash, steam. The car (0:22): a crunch, glass, a thud,
// the fire crackling; the owner's scream. Far splashes thump all round. The run (0:26.5): footsteps, the boom of the
// sun-bright one. The biggest one: a low roar that grows to the end, a riser, the impact's hit, cut at the white; in the
// white the soundtrack turns into the lead-in of frame 0 so the loop has no seam. Every onset is soft (5 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_FB1, V_BOOM1, V_DAY, V_BOOM, V_SPLASH, V_CAR, V_RUN, V_BIG, V_FULL, V_DIVE, V_IMPACT, V_WHITE } from './src/timeline.js';
import { FIREBALLS, ROCKS, SHOWER } from './src/meteors.js';
import { ALARMS } from './src/effects.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_OPENING_DB = -25;
const GASP_AT = V_FB1 + 0.25, GASP_DB = -16, SCREAM_AT = V_CAR + 0.06, SCREAM_LEN = 1.7, SCREAM_DB = -14.5, NO_AT = V_RUN + 0.35, NO_DB = -17, OMG_AT = V_BIG + 1.7, OMG_DB = -17;

class OnePole {
  constructor(fc) { this.y = 0; this.set(fc); }
  set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); }
  run(x) { return (this.y += this.a * (x - this.y)); }
}
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR);
    this.l += f * this.b;
    const h = x - this.l - q * this.b;
    this.b += f * h;
    return { lp: this.l, bp: this.b, hp: h };
  }
}
class Reverb {
  constructor(seed) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.7)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

function loadClip(dir, name) {
  const file = path.join(dir, 'sounds', name);
  if (!fs.existsSync(file)) { console.warn(`audio: no sounds/${name}: left out`); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout;
  console.log(`audio: sounds/${name}`);
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(1833);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const GASP = loadClip(DIR, 'gasp.mp3'), SCREAM = loadClip(DIR, 'scream.mp3'), NO = loadClip(DIR, 'nooo.mp3'), OMG = loadClip(DIR, 'omg.mp3');
  const CL = new Float32Array(N), CR = new Float32Array(N);

  // the fireballs' hiss while they cross, and the crowd's "ooh" as each one (and each bright shooting star) flares
  const HISS = FIREBALLS.map((f) => ({ t: f.t0, d: f.dur, g: Math.min(0.35 + 0.12 * f.I, 1.2), f: new SVF(), pan: clamp(Math.sin(f.phi * Math.PI / 180) * 0.8, -0.8, 0.8) }));
  const OOH = [...FIREBALLS.map((f) => ({ t: f.t0 + 0.25, g: Math.min(0.5 + 0.15 * f.I, 1.3) })), ...SHOWER.filter((m) => m.B > 1.6 && m.t0 < V_FB1).map((m) => ({ t: m.t0 + 0.2, g: 0.35 }))];
  // booms: deep rolling thunder (first-fireball's at 0:06.7, the sonic boom's double crack at 0:13, the sun-bright one's, the big one breaking up)
  const BOOMS = [[V_BOOM1, 0.55, 0], [V_BOOM, 1.0, 1], [V_RUN + 1.0, 0.8, 1], [V_DIVE + 2.2, 0.6, 0], [V_SPLASH - 0.4, 0.3, 0]]
    .map(([t, g, dbl]) => ({ t, g, dbl, lp: new OnePole(70), n: new SVF(), ph: 0 }));
  // the rocks that come down: a rushing whoosh, then a splash (or the car's crash)
  const FALLS = ROCKS.map((r) => {
    const d = Math.hypot(r.x, r.z);
    return { t0: r.t1 - r.fall, t1: r.t1, kind: r.kind, g: clamp(30 / (d + 20), 0.05, 1) * (r.big ? 1.4 : 1), pan: clamp(r.x / (Math.abs(r.z) + 30), -0.8, 0.8), f: new SVF(), s: new SVF(), st: new SVF(), lp: new OnePole(220), big: r.big };
  });
  // the windows' rattle after the sonic boom: many tiny soft ticks of glass
  const TICKS = [];
  for (let k = 0; k < 160; k++) TICKS.push({ t: V_BOOM + 0.08 + Math.pow(R0(), 1.8) * 1.5, d: 0.012 + R0() * 0.02, f: 3000 + R0() * 4000, g: 0.05 + R0() * 0.08, pan: -0.2 - R0() * 0.6, fl: new SVF() });
  for (let k = 0; k < 60; k++) TICKS.push({ t: V_RUN + 1.08 + Math.pow(R0(), 1.8) * 1.1, d: 0.012 + R0() * 0.02, f: 3000 + R0() * 4000, g: 0.04 + R0() * 0.06, pan: -0.3 - R0() * 0.5, fl: new SVF() });
  // the car: crunch, glass, thud
  const CRUNCH = [], GLASS = [];
  for (let k = 0; k < 22; k++) CRUNCH.push({ t: V_CAR + Math.pow(R0(), 1.6) * 0.3, d: 0.06 + R0() * 0.16, f: 300 + R0() * 1500, g: 0.17 * (0.4 + R0() * 0.8), pan: -0.55 + (R0() - 0.5) * 0.3, fl: new SVF() });
  for (let k = 0; k < 60; k++) GLASS.push({ t: V_CAR + 0.02 + Math.pow(R0(), 1.4) * 0.8, d: 0.04 + R0() * 0.12, f: 2800 + R0() * 5000, g: 0.03 * (0.4 + R0() * 0.8), pan: -0.55 + (R0() - 0.5) * 0.5, fl: new SVF() });
  const THUDS = [{ t: V_CAR, g: 0.28, f: 48, dec: 0.4, n: new SVF(), ph: 0, pan: -0.5 }];
  // footsteps: the run
  const STEPS = [];
  for (let k = 0; k < 140; k++) STEPS.push({ t: V_RUN + 0.3 + R0() * 5.5, g: 0.04 + R0() * 0.05, pan: 0.1 + R0() * 0.6, f: new SVF(), fr: 600 + R0() * 600 });
  const HITS = BEATS.map((t, n) => ({ t, k: [0.4, 0.32, 0.45, 0.38, 0.45, 0.42, 0.5, 0.4][n] ?? 0.4, root: [41, 46, 44, 49, 46, 41, 39, 36][n] ?? 46 }));

  const trafLP = new OnePole(140), lapF = [new SVF(), new SVF()], lapE = new OnePole(0.8), crowdF = [new SVF(), new SVF(), new SVF()], crowdE = [new OnePole(1.5), new OnePole(2.2), new OnePole(1.1)], oohF = [new SVF(), new SVF()];
  const crackF = new OnePole(900), rumbleF = new OnePole(60), roarF = new SVF(), roarLP = new OnePole(180);
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(380), new OnePole(380)], riserF = new SVF(), shimLP = new OnePole(5000);
  const revL = new Reverb(41), revR = new Reverb(42);
  const ph = new Float64Array(80);
  let brownL = 0, brownR = 0;

  const clipGain = (clip, db) => {
    if (!clip) return 0;
    let s = 0, c = 0;
    for (let i = 0; i < clip.length; i++) { const x = clip[i]; if (Math.abs(x) > 0.02) { s += x * x; c++; } }
    return Math.pow(10, db / 20) / Math.max(Math.sqrt(s / Math.max(c, 1)), 1e-9);
  };
  const gG = clipGain(GASP, GASP_DB), gS = clipGain(SCREAM, SCREAM_DB), gN = clipGain(NO, NO_DB), gO = clipGain(OMG, OMG_DB);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0;
    const put = (x, pan, w = 0.3) => { l += x * (1 - pan) * 0.5 * 1.4; r += x * (1 + pan) * 0.5 * 1.4; wet += x * w; };
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const end = 1 - smooth(V_IMPACT, V_IMPACT + 0.12, v);
    // --- the waterfront: far traffic, water lapping at the quay, the crowd talking (louder at the run) ---
    {
      const tr = 0.08 * end;
      l += trafLP.run(brownL) * tr; r += trafLP.y * 0.4 * tr + brownR * 0.002 * end;
      const lap = lapE.run(0.5 + 0.5 * Math.sin(v * 2.1) * Math.sin(v * 0.73 + 1));
      put((lapF[0].run(white(), 380, 0.8).bp * 0.6 + lapF[1].run(white(), 900, 0.9).bp * 0.25) * lap * 0.05 * end, 0, 0.3);
      const crowd = (0.45 + 0.3 * smooth(V_FB1, V_FB1 + 0.5, v) + 0.4 * smooth(V_RUN, V_RUN + 0.5, v) * (1 - smooth(V_RUN + 4, V_RUN + 7, v)) - 0.15 * smooth(V_BIG, V_BIG + 3, v)) * end;
      let c = 0;
      for (let q = 0; q < 3; q++) {
        const e = crowdE[q].run(0.5 + 0.5 * Math.sin(v * (3.1 + q * 1.7) + q * 2.1) + white() * 0.3);
        c += crowdF[q].run(white(), 600 + q * 420 + 120 * Math.sin(v * (0.9 + q * 0.5)), 0.6).bp * e;
      }
      put(c * 0.04 * crowd, 0.1 * Math.sin(v * 0.3), 0.5);
      // the "ooh"s: a swell of voices (an open vowel: formants ~500 and ~900 Hz) after each flare
      let ok = 0;
      for (const o of OOH) { const dt = v - o.t; if (dt > -0.1 && dt < 2.5) ok += o.g * smooth(-0.1, 0.35, dt) * (1 - smooth(0.6, 2.5, dt)); }
      if (ok > 0.001) {
        const x = white();
        put((oohF[0].run(x, 520 + 40 * Math.sin(v * 7), 0.25).bp + 0.6 * oohF[1].run(x, 930, 0.3).bp) * Math.min(ok, 2) * 0.03 * end, 0.05, 0.6);
      }
    }
    // --- the fireballs' hiss ---
    for (const h of HISS) {
      const dt = v - h.t;
      if (dt < 0 || dt > h.d + 0.2) continue;
      const e = smooth(0, 0.15, dt) * (1 - smooth(h.d * 0.8, h.d + 0.2, dt));
      put(h.f.run(white(), 3500 + 2500 * (dt / h.d), 0.6).bp * e * h.g * 0.05, h.pan, 0.5);
    }
    // --- booms: a soft-edged crack (two for the sonic boom), then rolling thunder ---
    for (const b of BOOMS) {
      const dt = v - b.t;
      if (dt < -0.01 || dt > 5) continue;
      let crack = env(dt, 0.006, 0.05) + (b.dbl ? 0.8 * env(dt - 0.22, 0.006, 0.05) : 0);
      const x = crackF.run(white()) * crack * 1.2;
      const roll = rumbleF.run(brownL) * 3.0 * env(dt, 0.08, 1.4) * (0.7 + 0.3 * Math.sin(dt * 9) * Math.sin(dt * 3.7));
      b.ph += (38 - 10 * Math.min(dt, 1)) / SR;
      const sub = Math.sin(TAU * b.ph) * env(dt, 0.01, 0.7) * 0.8;
      put((x + roll + sub) * b.g * 0.25 * end, 0, 0.6);
    }
    // --- the rocks coming down: a rushing whoosh that rises, then the splash (or the crash) ---
    for (const f of FALLS) {
      const dt = v - f.t0, T = f.t1 - f.t0;
      if (dt < 0 || dt > T + 4) continue;
      if (dt < T) { const k = (dt / T) ** 2; put(f.f.run(white(), 600 + 3800 * k, 0.5).bp * k * f.g * 0.12 * end, f.pan * k, 0.4); }
      const a = dt - T;
      if (a > 0 && f.kind === 'water') {
        const splash = f.lp.run(white()) * env(a, 0.008, 0.5) * 0.9 + f.s.run(white(), 1500, 0.7).bp * env(a, 0.01, 0.35) * 0.5;
        const steam = f.st.run(white(), 5000, 0.8).hp * env(a - 0.1, 0.2, 1.4) * 0.05 * (f.big ? 1 : 0.4);
        put((splash + steam) * f.g * 0.35 * end, f.pan, 0.6);
      }
    }
    // --- the windows' rattle ---
    for (const c of TICKS) { const dt = v - c.t; if (dt < 0 || dt > c.d) continue; put(c.fl.run(white(), c.f, 0.4).bp * smooth(0, 0.004, dt) * (1 - smooth(c.d * 0.4, c.d, dt)) * c.g, c.pan, 0.5); }
    // --- the car: crunch, glass, thud; then the fire crackling ---
    for (const c of CRUNCH) { const dt = v - c.t; if (dt < 0 || dt > c.d) continue; put(c.fl.run(white(), c.f, 0.35).bp * smooth(0, 0.01, dt) * (1 - smooth(c.d * 0.5, c.d, dt)) * c.g, c.pan, 0.4); }
    for (const c of GLASS) { const dt = v - c.t; if (dt < 0 || dt > c.d) continue; put(c.fl.run(white(), c.f, 0.5).bp * smooth(0, 0.008, dt) * (1 - smooth(c.d * 0.4, c.d, dt)) * c.g, c.pan, 0.6); }
    for (const c of THUDS) {
      const dt = v - c.t;
      if (dt < -0.01 || dt > 3) continue;
      c.ph += c.f * (1 - 0.4 * Math.min(dt * 2, 1)) / SR;
      put((Math.sin(TAU * c.ph) * Math.exp(-dt / c.dec) * 0.7 + c.n.run(white(), 260, 0.5).bp * Math.exp(-dt / 0.12) * 0.5) * smooth(-0.01, 0.01, dt) * c.g, c.pan, 0.5);
    }
    if (v > V_CAR + 0.3) { const k = smooth(V_CAR + 0.3, V_CAR + 1.5, v) * end * (1 - 0.5 * smooth(V_BIG, V_BIG + 3, v)); const cr = R0() < 0.012 ? white() : 0; put((ph[70] = ph[70] * 0.9 + cr) * 0.05 * k + roarF.run(white(), 400, 0.9).bp * 0.012 * k, -0.5, 0.4); }
    // --- car alarms (two-tone whoops, panned right toward the quay street) ---
    for (const a of ALARMS) {
      const dt = v - a.t0;
      if (dt < 0) continue;
      const k = smooth(0, 0.05, dt) * end * (1 - 0.6 * smooth(V_BIG, V_BIG + 4, v)) * 0.0045;
      if (k <= 0) continue;
      const ix = ALARMS.indexOf(a);
      const f = (ix % 2 ? (Math.sin(TAU * 1.4 * dt) > 0 ? 780 : 1040) : 900 + 400 * (((dt * 2.2) % 1)));
      ph[30 + (ix % 20)] += f / SR;
      put(Math.tanh(Math.sin(TAU * ph[30 + (ix % 20)]) * 3) * k, -0.4 - 0.1 * (ix % 4), 0.5);
    }
    // --- footsteps on stone: the run ---
    for (const s of STEPS) { const dt = v - s.t; if (dt < 0 || dt > 0.08) continue; put(s.f.run(white(), s.fr, 0.6).bp * smooth(0, 0.006, dt) * Math.exp(-dt / 0.025) * s.g, s.pan, 0.4); }
    // --- the biggest one: a low roar that grows to the end ---
    {
      const k = smooth(V_BIG, V_IMPACT, v) ** 1.5 * end;
      if (k > 0.001) { const x = roarLP.run(brownL * 0.7 + brownR * 0.3) * 4 + 0.15 * roarF.run(white(), 250 + 600 * k, 0.7).bp; put(x * k * 0.2, -0.1, 0.5); }
    }
    // --- the music: hits on the beats, a dark drone, a high shimmer for the sky, the riser to the impact ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 4) continue;
        const e = env(dt + 0.02, 0.025, 0.9 + 0.6 * h.k) * h.k * (1 - smooth(2.8, 4, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.007 / SR; ph[12] += hf * 2 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12])) * e;
        ph[14] += (30 + 35 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.015, 0.6 + 0.3 * h.k) * h.k;
      }
      // the impact: one last huge hit, cut short by the white
      { const dt = v - V_IMPACT; if (dt > -0.01 && dt < 0.6) { ph[15] += (34 + 30 * Math.exp(-Math.max(dt, 0) * 6)) / SR; sub += Math.sin(TAU * ph[15]) * env(dt + 0.01, 0.01, 0.5) * 1.1 * (1 - smooth(0.25, 0.6, dt)); } }
      const bf = braamLP.run(braam, 900, 0.6).lp * 0.055;
      const sv = subLP.run(sub) * 0.24 + sub * 0.1;
      l += bf + sv; r += bf * 0.97 + sv; wet += bf * 0.5;
      const dg = (0.02 + 0.012 * smooth(V_FB1, V_FB1 + 3, v) + 0.018 * smooth(V_BIG, V_FULL + 2, v)) * (1 - smooth(V_IMPACT, V_WHITE, v));
      let a = 0, b = 0;
      [55, 65.4, 82.4].forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.005 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      l += xl; r += xr; wet += (xl + xr) * 0.4;
      const sk = 0.0055 * (1 - smooth(V_IMPACT, V_WHITE, v));
      let sh = 0;
      [880, 1046.5, 1318.5, 1975.5, 2349.3].forEach((f, q) => { ph[50 + q] += f * (1 + 0.002 * Math.sin(v * (0.3 + q * 0.17))) / SR; sh += Math.sin(TAU * ph[50 + q]) * (0.5 + 0.5 * Math.sin(v * (0.7 + q * 0.31) + q)); });
      const sx = shimLP.run(sh) * sk;
      l += sx * (1 + 0.3 * Math.sin(v * 0.5)); r += sx * (1 - 0.3 * Math.sin(v * 0.5)); wet += sx * 1.2;
      const k = smooth(V_DIVE - 1, V_IMPACT, v) * (1 - smooth(V_IMPACT, V_IMPACT + 0.1, v));
      if (k > 0.001) { const rv = riserF.run(white(), 300 + 4200 * k * k, 0.35).bp * k * k * 0.12; l += rv; r += rv; wet += rv * 0.5; ph[60] += (110 * (1 + 2 * k * k)) / SR; const p = saw(ph[60]) * k * k * 0.04; l += p; r += p; }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.7, outR = r + rr * 0.7;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
    if (n >= 0) {
      const clip = (C, at, g, kl, kr, len = 1e9) => { if (!C) return; const i = Math.round((v - at) * SR), L2 = Math.min(C.length, Math.round(len * SR)); if (i >= 0 && i < L2) { const f = Math.min(1, i / (0.01 * SR), (L2 - i) / (0.35 * SR)); CL[n] += C[i] * f * g * kl; CR[n] += C[i] * f * g * kr; } };
      clip(GASP, GASP_AT, gG, 1, 0.9); clip(SCREAM, SCREAM_AT, gS, 1, 0.8, SCREAM_LEN); clip(NO, NO_AT, gN, 0.9, 1, 1.8); clip(OMG, OMG_AT, gO, 0.95, 1);
    }
  }
  {   // in the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.34 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  const out = (x, g) => 0.95 * Math.tanh((x * g) / 0.95);
  const openingDb = (g) => { let s = 0; for (let n = 0; n < SR; n++) { const m = (out(L[n], g) + out(R[n], g)) / 2; s += m * m; } return 10 * Math.log10(s / SR + 1e-12); };
  let lo = 0.01, hi = 100;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (openingDb(m) < TARGET_OPENING_DB) lo = m; else hi = m; }
  const gn = Math.sqrt(lo * hi);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    const a = out(L[n], gn) + CL[n], b = out(R[n], gn) + CR[n];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  console.log(`audio: master gain ${gn.toFixed(3)} (opening at ${TARGET_OPENING_DB} dB)`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
