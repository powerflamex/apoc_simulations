// Procedural soundtrack for "What if a tornado was 10 miles wide?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// A small-town street in a rising wind (gusts in the noise, a crowd talking, a car idling past), then: the owner's
// scream in the first second, gasps and cries; the tornado sirens winding up and the phones' alert tones; horns, the
// crash in front of you; a hit with a sub drop on every time-lapse jump (bigger each time); the wind rising to a
// howl and then the freight-train roar of the wall, with the low rumble that shakes the ground; hail rattling on
// the cars; thunder for every bolt, closer and closer; whooshes as things tear loose; the groan of roofs peeling;
// the riser into the final flash, which cuts to the quiet street of the first frame (the loop).
// Every onset is soft (8 ms+): no clicks or clacks. Every voice, tap and thud has its own phase and filters.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STEPS, BOLTS, windAt, V_SIREN, V_ALERT, V_FLEE, V_RUN, V_CRASH, V_LIFT1, V_CAR1, V_HAIL, V_TOWN, V_ROOFS, V_TRUCK, V_GLASS, V_PEOPLE, V_CARS, V_WALL, V_PEEL, V_YOU, V_FINAL } from './src/timeline.js';
import { rng, smooth, clamp, lerp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAM_AT = 0.15;
const SCREAM_FILES = [['scream.mp3', 0.0], ['nooo.mp3', 0.55]];

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

function loadClip(dir) {
  for (const [f, skip] of SCREAM_FILES) {
    const file = path.join(dir, 'sounds', f);
    if (!fs.existsSync(file)) continue;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(skip), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    if (r.status !== 0) continue;
    const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x));
    console.log(`audio: scream from sounds/${f}`);
    return { a, g: 0.62 / Math.max(pk, 1e-6) };
  }
  console.warn('audio: no sounds/scream.mp3 or sounds/nooo.mp3: the scream is left out');
  return null;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5151);
  const white = () => R0() * 2 - 1;
  const SC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // ---- the jumps: a hit on each, bigger each time ----
  const HITS = STEPS.map((t, n) => ({ t, k: clamp(0.28 + 0.045 * n, 0, 0.95), root: 55 * Math.pow(2, -Math.min(n, 12) / 24) }));
  // ---- cries (each voice its own pitch and filters) ----
  const cries = [];
  const addCries = (t0, t1, n, g) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: 240 + R0() * 300, d: 0.45 + R0() * 0.8, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() }); };
  addCries(0.6, 3.0, 8, 0.011); addCries(V_ALERT, V_ALERT + 3, 6, 0.009); addCries(V_RUN, V_RUN + 4.5, 14, 0.012); addCries(V_CRASH, V_CRASH + 1.5, 6, 0.012);
  addCries(V_LIFT1 + 0.5, V_LIFT1 + 4, 8, 0.011); addCries(V_HAIL + 0.5, V_HAIL + 4, 8, 0.01); addCries(V_ROOFS, V_ROOFS + 4, 10, 0.012); addCries(V_PEOPLE, V_PEOPLE + 7, 16, 0.013);
  // ---- horns, in the jam ----
  const horns = [[10.6, 1.1, 390], [11.4, 0.7, 440], [12.1, 1.6, 360], [13.9, 0.9, 470], [15.2, 1.4, 400], [16.6, 0.8, 430]].map(([t, d, f]) => ({ t, d, f, ph: 0, ph2: 0, fl: new SVF(), pan: R0() * 1.2 - 0.6 }));
  // ---- the crashes: low thuds with a soft crunch of glass ----
  const thuds = [{ t: V_CRASH, g: 0.5, f: 55 }, { t: V_CRASH + 1.15, g: 0.42, f: 48 }, { t: V_CRASH + 1.4, g: 0.2, f: 70 }].map((o) => ({ ...o, ph: 0, fl: new SVF(), fc: new SVF() }));
  // ---- hail: a dense rattle of soft tocks on the cars and the road ----
  const tocks = [];
  for (let k = 0; k < 900; k++) { const t = V_HAIL + Math.pow(R0(), 0.7) * 15; tocks.push({ t, f: 900 + R0() * 1800, g: 0.012 + 0.02 * R0(), d: 0.03 + 0.04 * R0(), pan: R0() * 1.6 - 0.8, ph: 0, fl: new SVF() }); }
  // ---- thunder: a rumble after each bolt, closer and sooner as the wall nears; the near ones crack first ----
  const thunder = BOLTS.map((b) => { const near = smooth(28, 44, b.t); return { t: b.t + 0.12 + 0.9 * (1 - near), g: 0.08 + 0.18 * near * b.str / 2, near, str: b.str, d: 1.4 + 1.6 * R0(), lp: new OnePole(90 + 220 * near), ph: 0, fc: new SVF(), final: b.final }; });
  // ---- whooshes as things tear loose ----
  const whoosh = [];
  const addWhoosh = (t0, t1, n, g) => { for (let k = 0; k < n; k++) whoosh.push({ t: t0 + R0() * (t1 - t0), d: 0.5 + R0() * 0.9, g: g * (0.6 + 0.8 * R0()), pan: R0() * 1.6 - 0.8, f: new SVF() }); };
  addWhoosh(V_LIFT1, V_LIFT1 + 6, 10, 0.05); addWhoosh(V_CAR1, V_CAR1 + 0.3, 1, 0.12); addWhoosh(V_TOWN, V_TOWN + 4, 6, 0.06); addWhoosh(V_ROOFS, V_ROOFS + 6, 9, 0.09);
  addWhoosh(V_TRUCK, V_TRUCK + 0.2, 1, 0.16); addWhoosh(V_PEOPLE, V_PEOPLE + 8, 14, 0.08); addWhoosh(V_PEEL, V_PEEL + 3.5, 6, 0.11);
  // ---- the roofs and the road tearing: low groans ----
  const groans = [];
  for (let k = 0; k < 9; k++) groans.push({ t: V_ROOFS - 1 + R0() * 6, d: 0.8 + R0() * 1.2, f: 50 + R0() * 60, g: 0.06 + 0.05 * R0(), ph: 0, fl: new SVF(), pan: R0() * 1.2 - 0.6 });
  for (let k = 0; k < 5; k++) groans.push({ t: V_PEEL + R0() * 3, d: 1.2 + R0() * 1.2, f: 35 + R0() * 40, g: 0.1 + 0.05 * R0(), ph: 0, fl: new SVF(), pan: R0() * 1.2 - 0.6 });

  const cityLP = new OnePole(260), cityLP2 = new OnePole(300);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const windF = [new SVF(), new SVF(), new SVF()], windSub = new OnePole(55), howlF = new SVF(), howlF2 = new SVF();
  const roarLP = new OnePole(120), roarLP2 = new OnePole(40), rumLP = new OnePole(30);
  const braamLP = new SVF(), subLP = new OnePole(80);
  const sirenF = [new SVF(), new SVF()], alertLP = new OnePole(4000), hailBed = new SVF(), hailBed2 = new SVF();
  const riserF = new SVF();
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0, brownW = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const W = windAt(v);                                   // mph
    const wk = clamp((W - 30) / 270);                       // 0 at frame 0 .. 1 at the wall

    // --- the street: a car idling by, people talking (until the alert) ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const town = 0.12 * (1 - smooth(10, 20, v));
    l += cityLP.run(brownL) * town; r += cityLP2.run(brownR) * town;
    {
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = 1 - smooth(0.5, 2.5, v);
      l += cv * 0.03 * talk; r += cv * 0.028 * talk;
    }
    // --- the wind: gusty from the start, rising to a howl, then the roar of the wall ---
    {
      const gust = 0.7 + 0.3 * Math.sin(v * 0.9) * Math.sin(v * 2.3 + 1) + 0.15 * Math.sin(v * 5.1);
      const wl = (0.08 + 0.5 * wk) * gust * (1 - smooth(T_SWITCH - 0.25, T_SWITCH, v));
      const wn = white();
      const fc = 250 + 900 * wk;
      const a = windF[0].run(wn, fc, 0.7).bp, b = windF[1].run(wn, fc * 2.3, 0.9).bp * 0.5, lo = windSub.run(white()) * 2.4;
      l += (a + b + lo) * wl; r += (windF[2].run(wn, fc * 1.1, 0.7).bp + b + lo) * wl;
      // the howl: a resonant whistle that wanders, from ~25 s
      const hk = smooth(22, 34, v) * (1 - smooth(T_SWITCH - 0.25, T_SWITCH, v));
      const hf = 600 + 500 * Math.sin(v * 0.7) * Math.sin(v * 0.23 + 2) + 300 * wk;
      const hw = howlF.run(white(), hf, 0.06).bp * 0.5 + howlF2.run(white(), hf * 1.5, 0.05).bp * 0.3;
      l += hw * 0.08 * hk; r += hw * 0.075 * hk; wet += hw * 0.03 * hk;
      // the roar: brown noise and a sub that shake everything, from ~28 s
      brownW = clamp(brownW + white() * 0.03, -1, 1) * 0.997;
      const rk = (0.05 * smooth(14, 28, v) + 0.45 * smooth(28, 44, v) + 0.2 * smooth(44, 46.5, v)) * (1 - smooth(T_SWITCH - 0.25, T_SWITCH, v));
      const ro = roarLP.run(brownW) * 2.0 + roarLP2.run(white()) * 2.5 + rumLP.run(white()) * 2.5;
      dl += ro * rk; dr += ro * rk * 0.95;
    }
    // --- the scream (the owner's clip) ---
    if (SC) {
      const i = Math.round((v - SCREAM_AT) * SR);
      if (i >= 0 && i < SC.a.length) {
        const fade = Math.min(1, i / (0.01 * SR), (SC.a.length - i) / (0.05 * SR));
        const s = SC.a[i] * SC.g * fade;
        l += s * 0.9; r += s * 1.0; wet += s * 0.25;
      }
    }
    // --- the sirens: two of them, winding up and down, far off, drowned by the wind later ---
    {
      const sa = smooth(V_SIREN, V_SIREN + 2.5, v) * (1 - smooth(28, 36, v));
      if (sa > 0) {
        for (let q = 0; q < 2; q++) {
          const cyc = ((v - V_SIREN) + q * 1.7) % 7.0;
          const f = 420 + 300 * (cyc < 3.5 ? smooth(0, 3.2, cyc) : 1 - smooth(3.5, 6.8, cyc)) + q * 25;
          ph[2 + q] += f / SR;
          const rot = 0.6 + 0.4 * Math.sin(v * 2.6 + q * 2);          // the horn turning
          const sv = sirenF[q].run(saw(ph[2 + q]), 1600, 0.6).lp * 0.024 * sa * rot;
          l += sv * (q ? 0.5 : 0.9); r += sv * (q ? 0.9 : 0.5); wet += sv * 1.4;
        }
      }
    }
    // --- the phones' alert: the two-tone buzz (853 + 960 Hz), three bursts, twice, on several phones ---
    {
      let al = 0;
      for (let q = 0; q < 4; q++) {
        const t = v - V_ALERT - q * 0.07;
        for (const rep of [0, 1.3]) {
          const tt = t - rep;
          if (tt < 0 || tt > 1.0) continue;
          const on = (tt % 0.33) < 0.22 ? 1 : 0;
          const e = on * Math.min(1, (tt % 0.33) / 0.012) * Math.min(1, (0.22 - (tt % 0.33)) / 0.012 + 0.0);
          ph[6 + q] += 853 / SR; ph[10 + q] += 960 / SR;
          al += (Math.sin(TAU * ph[6 + q]) + Math.sin(TAU * ph[10 + q])) * e * 0.012 * (1 - q * 0.15);
        }
      }
      const av = alertLP.run(al);
      l += av * 0.9; r += av; wet += av * 0.4;
    }
    // --- horns, the crash ---
    for (const h of horns) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d) {
        h.ph += h.f / SR; h.ph2 += h.f * 1.26 / SR;
        const e = Math.min(dt / 0.03, 1) * Math.min((h.d - dt) / 0.06, 1);
        const hv = h.fl.run(saw(h.ph) * 0.6 + saw(h.ph2) * 0.4, 1800, 0.8).lp * 0.022 * e;
        l += hv * (1 - h.pan) * 0.5; r += hv * (1 + h.pan) * 0.5; wet += hv * 0.6;
      }
    }
    for (const q of thuds) {
      const dt = v - q.t;
      if (dt > 0 && dt < 1.2) {
        q.ph += (q.f + 40 * Math.exp(-dt * 10)) / SR;
        const tv = (Math.sin(TAU * q.ph) * 0.8 + q.fl.run(white(), 160, 0.8).lp * 1.5) * env(dt, 0.015, 0.22) * q.g;
        const cr = q.fc.run(white(), 2800, 0.5).bp * env(dt, 0.025, 0.2) * q.g * 0.12;
        dl += tv; dr += tv; l += cr; r += cr * 0.9; wet += (tv + cr) * 0.5;
      }
    }
    // --- the jumps: a trailer braam with a sub drop ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, 0.9 + 0.8 * h.k) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[20] += hf / SR; ph[21] += hf * 1.005 / SR; ph[22] += hf * 2 / SR; ph[23] += hf * 3.01 / SR;
        braam += (saw(ph[20]) + saw(ph[21]) + 0.5 * saw(ph[22]) + 0.25 * saw(ph[23])) * e;
        ph[24] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[24]) * env(dt + 0.02, 0.012, 0.7 + 0.4 * h.k) * h.k;
      }
      const bf = braamLP.run(braam, 1400, 0.6).lp * 0.09;
      const sv = subLP.run(sub) * 0.5 + sub * 0.25;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- hail: the rattle ---
    {
      const hk = smooth(V_HAIL, V_HAIL + 1.5, v) * (1 - smooth(37, 40, v));
      if (hk > 0) {
        const bed = (hailBed.run(white(), 2600, 0.5).bp + 0.6 * hailBed2.run(white(), 4200, 0.6).bp) * 0.03 * hk * (0.7 + 0.3 * Math.sin(v * 9.3) * Math.sin(v * 3.7));
        l += bed; r += bed * 0.95;
      }
      for (const q of tocks) {
        const dt = v - q.t;
        if (dt > 0 && dt < 0.2) {
          q.ph += q.f / SR;
          const tv = q.fl.run(Math.sin(TAU * q.ph), q.f, 0.4).bp * env(dt, 0.006, q.d) * q.g;
          l += tv * (1 - q.pan) * 0.5; r += tv * (1 + q.pan) * 0.5; wet += tv * 0.3;
        }
      }
    }
    // --- thunder ---
    for (const th of thunder) {
      const dt = v - th.t;
      if (dt > 0 && dt < th.d + 1) {
        const e = env(dt, th.final ? 0.012 : 0.06 + 0.3 * (1 - th.near), th.d) * th.g * (th.final ? 3 : 1);
        const rum = th.lp.run(white()) * 6.0 * e * (0.7 + 0.3 * Math.sin(dt * 17 + th.str * 9));
        const crack = th.near > 0.3 ? th.fc.run(white(), 700 + 900 * th.near, 0.6).bp * env(dt, 0.012, 0.08) * th.g * 1.5 * th.near : 0;
        dl += rum; dr += rum * 0.9; l += crack; r += crack * 0.85; wet += (rum + crack) * 0.5;
      }
    }
    // --- whooshes, groans ---
    for (const w of whoosh) {
      const dt = v - w.t;
      if (dt > 0 && dt < w.d) {
        const k = dt / w.d;
        const vv = w.f.run(white(), 300 + 1500 * k, 0.6).bp * Math.sin(Math.PI * k) * w.g;
        l += vv * (1 - w.pan) * 0.5; r += vv * (1 + w.pan) * 0.5;
      }
    }
    for (const g of groans) {
      const dt = v - g.t;
      if (dt > 0 && dt < g.d) {
        g.ph += (g.f * (1 + 0.3 * dt / g.d)) / SR;
        const gv = g.fl.run(saw(g.ph), 260, 0.5).lp * Math.sin(Math.PI * dt / g.d) * g.g;
        l += gv * (1 - g.pan) * 0.5; r += gv * (1 + g.pan) * 0.5; wet += gv * 0.4;
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
    // --- the riser into the white, cut just inside it ---
    {
      const k = smooth(V_FINAL - 1.6, T_SWITCH - 0.05, v) * (1 - smooth(T_SWITCH - 0.05, T_SWITCH + 0.15, v));
      if (k > 0) {
        const rv = riserF.run(white(), 250 + 2600 * k * k, 0.35).bp * k * k * 0.15;
        dl += rv; dr += rv; wet += rv * 0.5;
      }
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.5 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.4); R[n] = Math.tanh(R[n] * 1.4);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const gn = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    buf.writeInt16LE(Math.round(clamp(L[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
