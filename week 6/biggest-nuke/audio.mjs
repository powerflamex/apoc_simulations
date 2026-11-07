// Procedural soundtrack for "What if the biggest nuke ever hit your city?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// No music: only what you would hear. The bomb itself is silent for 45 seconds, because its sound travels with the blast.
//   - the opening: an ordinary evening street (traffic, people talking), a car alarm the flash set off and a dog barking
//     down the hill; a gasp and the owner's "oh my god" (sounds/gasp.mp3, sounds/omg.mp3, local only), tyres and two crashes;
//   - the blackout: transformers pop and buzz one after another down the street, coming closer, and the city's hum cuts out;
//   - the middle, nearly silent: the fire's crackle and roar close by, car alarms and sirens far off, the crowd running for a
//     few seconds, the helicopter (faint, and a muffled crash 100 m off), the billboard coming down;
//   - the end: nothing builds. The blast roar arrives all at once with the hit, glass bursting in it, into the white.
// The loop: the white falls back into the opening street at the same level (start and end are measured, not guessed), and
// the whole track is set by a fixed gain so the opening sits at about -24 dB like the owner's other Shorts. Every onset is
// soft (8 ms+): no clicks or clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, V_CRASH, V_POWER, V_PHONE, V_RUN, V_HEAT, V_FIRE, V_HELI, V_QUIET, V_SIGN, V_WALL } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// the voices at the start (the owner's clips): the gasp, then "oh my god"
const GASP_AT = 0.22, OMG_AT = 0.95;
const TARGET_OPENING_DB = -26;           // RMS of the first second, (L+R)/2 (about -24 dB on ffmpeg's stereo meter)
// the transformers along the street: [seconds after the blackout starts, how near (0 far .. 1 next to you), pan]
const POPS = [[0.15, 0.1, 0.6], [0.45, 0.25, -0.5], [0.72, 0.4, 0.3], [0.98, 0.6, -0.2], [1.2, 0.8, 0.45], [1.42, 1.0, -0.35]];

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) {
      const o = c.buf[c.i];
      c.lp = o * (1 - damp) + c.lp * damp;
      c.buf[c.i] = x + c.lp * fb;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    y /= this.combs.length;
    for (const a of this.aps) {
      const o = a.buf[a.i];
      const v = y + o * 0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.buf.length;
      y = o - v * 0.5;
    }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

// a clip from sounds/, mono, scaled to a given RMS over its loud part (so the voices sit where they should)
function loadClip(dir, file, rmsDb) {
  const f = path.join(dir, 'sounds', file);
  if (!fs.existsSync(f)) { console.warn(`audio: no sounds/${file}: left out`); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let s = 0, n = 0;
  for (const x of a) if (Math.abs(x) > 0.02) { s += x * x; n++; }
  const g = Math.pow(10, rmsDb / 20) / Math.sqrt(s / Math.max(n, 1) + 1e-12);
  console.log(`audio: sounds/${file}`);
  return { a, g };
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(6161);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  // (levels here are relative to the street; the master gain at the end sets the absolute level)
  const GASP = loadClip(DIR, 'gasp.mp3', -12), OMG = loadClip(DIR, 'omg.mp3', -13);

  // ---- people: cries at the start and when everyone runs, then nothing ----
  const cries = [];
  const addCries = (t0, t1, n, g) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: 240 + R0() * 300, d: 0.45 + R0() * 0.8, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() }); };
  addCries(1.2, 4.0, 5, 0.006); addCries(V_RUN, V_RUN + 4, 10, 0.007);
  // ---- the tyres and the two crashes ----
  const TYRES = Array.from({ length: 6 }, () => ({ t: 0.2 + R0() * 1.3, d: 0.8 + R0() * 1.1, f: 900 + R0() * 700, g: 0.008 + R0() * 0.008, pan: R0() * 1.6 - 0.8, fl: new SVF() }));
  const CRASHES = [{ t: V_CRASH, g: 0.6, pan: -0.35 }, { t: V_CRASH + 0.75, g: 0.45, pan: 0.45 }].map((c) => ({ ...c, a: new SVF(), parts: Array.from({ length: 22 }, () => ({ t: R0() * 0.5, d: 0.05 + R0() * 0.12, f: 1500 + R0() * 2500, g: 0.012 + 0.016 * R0(), fl: new SVF() })) }));
  // ---- car alarms: one set off by the flash, close; more far off once the power goes ----
  const ALARMS = [
    { t: -3, f: 760, rate: 3.1, pan: -0.55, g: 0.0075, lp: 1900 },
    { t: V_POWER + 0.8, f: 980, rate: 2.4, pan: 0.7, g: 0.0035, lp: 1300 },
    { t: V_POWER + 2.6, f: 1180, rate: 3.6, pan: -0.8, g: 0.0028, lp: 1100 },
    { t: 15, f: 860, rate: 2.0, pan: 0.2, g: 0.0025, lp: 1000 },
  ].map((a) => ({ ...a, ph: 0, fl: new SVF() }));
  // ---- the dog down the hill: pairs of barks ----
  const BARKS = [];
  for (const t of [0.5, 1.9, 2.25, 3.7, 5.2, 5.5, 7.4, 9.6, 9.9, 12.8]) BARKS.push({ t, f: 520 + R0() * 80, d: 0.13 + R0() * 0.04, f1: new SVF(), f2: new SVF(), ph: 0 });
  // ---- the horns, the sirens far off ----
  const HORNS = Array.from({ length: 6 }, () => ({ t: 0.8 + R0() * 6, d: 0.4 + R0() * 1.0, f: 300 + R0() * 200, pan: R0() * 1.6 - 0.8, ph: 0, ph2: 0, fl: new SVF() }));
  // ---- the transformers ----
  const TRANS = POPS.map(([dt, near, pan]) => ({ t: V_POWER + dt, near, pan, ph: 0, cr: new SVF(), bz: new SVF() }));
  const HUM_OFF = V_POWER + POPS[POPS.length - 1][0] + 0.05;
  // ---- the glass going as the blast hits ----
  const GLASS = Array.from({ length: 70 }, () => ({ t: V_WALL + R0() * 0.4, d: 0.06 + R0() * 0.12, f: 2600 + R0() * 3500, g: 0.02 + 0.02 * R0(), pan: R0() * 1.6 - 0.8, fl: new SVF() }));

  const cityLP = new OnePole(220), cityLP2 = new OnePole(260), idleLP = new OnePole(120);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const humF = new OnePole(700), sirenF = [new SVF(), new SVF()], feetF = new SVF(), rotorLP = new OnePole(260), phoneLP = new OnePole(5000);
  const fireF = [new SVF(), new SVF(), new SVF()], fireLP = new OnePole(150), crk = Array.from({ length: 3 }, () => ({ t: -1, f: 1500, g: 0, fl: new SVF() }));
  const thudF = new SVF();
  const roarF = [new SVF(), new SVF(), new SVF()], roarSub = new OnePole(55), boomLP = new OnePole(90);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0;
    const gone = 1 - smooth(V_WALL - 0.02, V_WALL + 0.06, v);           // the street, until the blast takes it
    const hush = 1 - 0.55 * smooth(V_QUIET - 0.3, V_QUIET + 0.15, v) * (1 - smooth(V_QUIET + 2.1, V_QUIET + 2.6, v));

    // --- the evening street: traffic, people talking; both thin out once the light comes ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const flow = 1 - smooth(1.0, 4.5, v);
    const traffic = (0.025 + 0.14 * flow) * gone;
    l += cityLP.run(brownL) * traffic + idleLP.run(white()) * 0.04 * (1 - flow) * gone * (1 - smooth(12, 18, v));
    r += cityLP2.run(brownR) * traffic + idleLP.y * 0.04 * (1 - flow) * gone * (1 - smooth(12, 18, v));
    {
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = (1 - smooth(1.5, 6, v)) * gone;
      l += cv * 0.025 * talk; r += cv * 0.023 * talk;
    }
    // --- the city's hum (the transformers and the lights), cut dead when the last one blows ---
    {
      const g = (1 - smooth(HUM_OFF - 0.01, HUM_OFF + 0.012, v)) * gone;
      if (g > 0) {
        ph[2] += 120 / SR;
        const hv = humF.run(saw(ph[2]) + 0.4 * saw(ph[2] * 2.003)) * 0.012 * g;
        l += hv; r += hv * 0.95;
      }
    }
    // --- the transformers: a thump and a crack, then an electric buzz sliding down; each one nearer than the last ---
    for (const tr of TRANS) {
      const dt = v - tr.t;
      if (dt < 0 || dt > 1.4) continue;
      const g = 0.25 + 0.75 * tr.near;
      ph[60] += (70 - 25 * Math.min(dt * 4, 1)) / SR;
      const thump = Math.sin(TAU * ph[60]) * env(dt, 0.008, 0.12) * 0.28;
      const crack = tr.cr.run(white(), 900 + 1300 * tr.near, 0.6).bp * env(dt, 0.008, 0.07) * 0.5;
      tr.ph += (130 * (1 - 0.6 * Math.min(dt / 0.9, 1))) / SR;
      const buzz = tr.bz.run(saw(tr.ph) + 0.6 * saw(tr.ph * 3.01), 500 + 600 * tr.near, 0.5).bp * smooth(0.01, 0.05, dt) * Math.exp(-dt / 0.35) * 0.3;
      const x = (thump + crack + buzz) * g;
      l += x * (1 - tr.pan) * 0.5; r += x * (1 + tr.pan) * 0.5; wet += x * (1.2 - tr.near);
    }
    // --- the dog ---
    for (const b of BARKS) {
      const dt = v - b.t;
      if (dt < 0 || dt > b.d) continue;
      b.ph += b.f * (1 - 0.3 * dt / b.d) / SR;
      const src = saw(b.ph) * (1 + 0.35 * white());
      const e = smooth(0, 0.01, dt) * (1 - smooth(b.d * 0.45, b.d, dt));
      const bv = (b.f1.run(src, 950, 0.45).bp + 0.6 * b.f2.run(src, 1900, 0.5).bp) * e * 0.014;
      l += bv * 0.35; r += bv * 0.75; wet += bv * 1.4;
    }
    // --- the tyres ---
    for (const q of TYRES) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const e = smooth(0, 0.05, dt) * (1 - smooth(q.d - 0.25, q.d, dt));
        const tv = q.fl.run(white(), q.f * (1 + 0.06 * Math.sin(dt * 34)), 0.09).bp * e * q.g;
        l += tv * (1 - q.pan) * 0.5; r += tv * (1 + q.pan) * 0.5; wet += tv * 0.5;
      }
    }
    // --- the crashes: a soft thump, metal and glass ---
    for (const c of CRASHES) {
      const dt = v - c.t;
      if (dt < 0 || dt > 2) continue;
      ph[6] += (64 - 26 * Math.min(dt * 3, 1)) / SR;
      let cv = Math.sin(TAU * ph[6]) * smooth(0, 0.012, dt) * Math.exp(-dt / 0.14) * 0.22 * c.g;
      cv += c.a.run(white(), 1100, 0.3).bp * smooth(0, 0.01, dt) * Math.exp(-dt / 0.2) * 0.09 * c.g;
      for (const q of c.parts) {
        const d2 = dt - q.t;
        if (d2 > 0 && d2 < q.d) cv += q.fl.run(white(), q.f, 0.5).bp * smooth(0, 0.01, d2) * (1 - smooth(q.d - 0.03, q.d, d2)) * q.g * c.g;
      }
      l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5; wet += cv * 0.7;
    }
    // --- your phone: three falling tones ---
    {
      const dt = v - (V_PHONE + 0.12);
      if (dt > 0 && dt < 0.75) {
        const k = Math.floor(dt / 0.24), u = dt - k * 0.24;
        const e = smooth(0, 0.012, u) * (1 - smooth(0.15, 0.2, u));
        ph[3] += [950, 760, 570][Math.min(k, 2)] / SR;
        const pv = phoneLP.run(Math.sin(TAU * ph[3])) * e * 0.022;
        l += pv * 0.8; r += pv;
      }
    }
    // --- car alarms ---
    for (const a of ALARMS) {
      const dt = v - a.t;
      if (dt < 0) continue;
      // (a whooping sweep, up and down)
      const f = a.f * (1 + 0.35 * (0.5 + 0.5 * Math.sin(dt * a.rate * TAU)));
      a.ph += f / SR;
      const av = a.fl.run(saw(a.ph), a.lp, 0.6).lp * a.g * smooth(0, 0.03, dt) * gone * (a.t < 0 ? 1 - 0.55 * smooth(8, 16, v) : 1);
      l += av * (1 - a.pan) * 0.5; r += av * (1 + a.pan) * 0.5; wet += av * 1.6;
    }
    // --- horns, then sirens far off ---
    for (const h of HORNS) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d) {
        h.ph += h.f / SR; h.ph2 += h.f * 1.26 / SR;
        const e = smooth(0, 0.03, dt) * (1 - smooth(h.d - 0.08, h.d, dt));
        const hv = h.fl.run(saw(h.ph) + saw(h.ph2) * 0.7, 1500, 0.5).lp * 0.012 * e;
        l += hv * (1 - h.pan) * 0.5; r += hv * (1 + h.pan) * 0.5; wet += hv * 0.6;
      }
    }
    {
      const sa = smooth(10, 16, v) * gone * hush;
      if (sa > 0) {
        for (let q = 0; q < 2; q++) {
          const f = 650 + 80 * q + 250 * Math.sin(v * (1.3 + 0.4 * q) + q * 2) + 100 * Math.sin(v * 0.7 + 1);
          ph[4 + q] += f / SR;
          const sv = sirenF[q].run(saw(ph[4 + q]), 900, 0.6).lp * 0.003 * sa;
          l += sv * (q ? 1 : 0.6); r += sv * (q ? 0.6 : 1); wet += sv * 3;
        }
      }
    }
    // --- the voices: the gasp, then "oh my god" ---
    for (const [C, at, pan] of [[GASP, GASP_AT, 0.05], [OMG, OMG_AT, -0.05]]) {
      if (!C) continue;
      const i = Math.round((v - at) * SR);
      if (i >= 0 && i < C.a.length) {
        const fade = Math.min(1, i / (0.01 * SR), (C.a.length - i) / (0.05 * SR));
        const s = C.a[i] * C.g * fade * 0.12;
        l += s * (1 - pan); r += s * (1 + pan); wet += s * 0.15;
      }
    }
    // --- the crowd running: a wash of feet, a few seconds ---
    {
      const g = smooth(V_RUN, V_RUN + 1.5, v) * (1 - smooth(V_RUN + 4, V_RUN + 9, v)) * gone;
      if (g > 0) {
        const tick = Math.pow(0.5 + 0.5 * Math.sin(v * 17) * Math.sin(v * 11.3 + 1), 2);
        const fv = feetF.run(white(), 500, 0.5).bp * 0.025 * g * (0.5 + tick);
        l += fv; r += fv * 0.92;
      }
    }
    // --- the helicopter: faint until it falls, then a muffled crash down the street ---
    if (v < V_HELI) {
      const lost = Math.max(0, v - (V_HELI - 3.1));
      ph[50] += (11 + 7 * lost) / SR;
      const cyc = ph[50] % 1;
      const rv = rotorLP.run(white()) * (0.25 + 0.75 * Math.exp(-cyc * 6)) * 0.12 * (0.3 + 0.7 * smooth(14, 24, v)) * hush;
      l += rv * 0.9; r += rv * 0.6;
    }
    for (const [t0, g0, f0] of [[V_HELI + 0.3, 0.35, 48], [V_SIGN + 1.45, 0.22, 66]]) {
      const dt = v - t0;
      if (dt < 0 || dt > 2) continue;
      ph[52] += (f0 * (1 - 0.4 * Math.min(dt * 2, 1))) / SR;
      const tv = (Math.sin(TAU * ph[52]) * Math.exp(-dt / 0.45) + thudF.run(white(), 300, 0.5).bp * 0.4 * Math.exp(-dt / 0.6)) * smooth(0, 0.015, dt) * g0 * 0.25;
      l += tv * 1.1; r += tv * 0.9; wet += tv * 1.2;
    }
    // --- the fire: a low roar and the crackle, from the first flames beside you to the end ---
    {
      const g = smooth(V_HEAT - 0.2, V_FIRE + 3, v) * gone * (0.55 + 0.45 * hush);
      if (g > 0) {
        const w = white();
        const roar = fireLP.run(w) * 0.5 + fireF[0].run(w, 260 + 90 * Math.sin(v * 2.3), 0.7).bp * 0.12;
        let cr = 0;
        for (const c of crk) {
          if (v - c.t > 0.06 && R0() < 0.0011) { c.t = v; c.f = 1200 + R0() * 2400; c.g = 0.3 + 0.7 * R0(); }
          const dt = v - c.t;
          if (dt >= 0 && dt < 0.06) cr += c.fl.run(white(), c.f, 0.6).bp * smooth(0, 0.004, dt) * Math.exp(-dt / 0.014) * c.g;
        }
        const fv = (roar * 0.11 + cr * 0.05) * g;
        l += fv; r += fv * 0.92; wet += fv * 0.3;
      }
    }
    // --- the blast: all at once with the hit. A boom, a roar, the glass ---
    {
      const g = smooth(V_WALL - 0.02, V_WALL + 0.03, v) * (1 - smooth(T_SWITCH - 0.25, T_SWITCH + 0.05, v));
      if (g > 0) {
        const w = white();
        const dt = v - V_WALL;
        const fc = 1800 - 1100 * smooth(V_WALL, T_SWITCH, v);
        ph[54] += (34 - 12 * Math.min(Math.max(dt, 0) * 2, 1)) / SR;
        const boom = (Math.sin(TAU * ph[54]) * 1.4 + boomLP.run(white()) * 3) * Math.exp(-Math.max(dt, 0) / 0.6);
        const rv = (roarF[0].run(w, fc, 0.6).bp + roarF[1].run(w, fc * 0.45, 0.7).bp * 0.8 + roarSub.run(white()) * 3) * 0.32 * g;
        l += rv + boom * 0.3 * g; r += roarF[2].run(w, fc * 1.1, 0.6).bp * 0.32 * g + roarSub.y * 3 * 0.32 * g + boom * 0.3 * g; wet += rv * 0.3;
      }
    }
    for (const q of GLASS) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const e = smooth(0, 0.012, dt) * (1 - smooth(q.d - 0.03, q.d, dt));
        const gv = q.fl.run(white(), q.f, 0.6).bp * e * q.g;
        l += gv * (1 - q.pan) * 0.5; r += gv * (1 + q.pan) * 0.5; wet += gv * 0.8;
      }
    }
    // --- cries ---
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        c.ph += c.f * (1.25 - 0.35 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(c.ph);
        const vv = (c.fA.run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * c.fB.run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.8, outR = r + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the street just before the first frame (the loop)
    const a = N - N0, xf = Math.round(0.34 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }

  // the master gain: the opening second at TARGET_OPENING_DB; a soft limit keeps the blast's peaks under full scale
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
    const a = out(L[n], gn), b = out(R[n], gn);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
