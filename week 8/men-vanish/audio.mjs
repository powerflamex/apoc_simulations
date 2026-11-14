// Procedural soundtrack for "What if every man disappeared?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a busy corner at rush hour (traffic, a crowd talking, footsteps); at the vanishing a hollow whoosh,
// half the voices gone at once and the owner's scream (sounds/scream.mp3, at the level of the hits); soft thumps of
// clothes and phones landing; a crunch for each crash where you can see it, then car alarms. Time racing: a rushing
// sweep through each time-lapse. The next morning the jet's roar grows over you and ends in a deep boom. The grid's hum
// buzzes and dies with the lights. The highway and the empty shops: wind and the low drone. In the lab the hiss of
// the nitrogen; the drone turns warm. Through the months, a baby's fast heartbeat on the scan, louder as it grows. On
// day 280 the street's voices come back, a warm chord swells into the white. A deep hit on every beat. The loop: under
// the white the rush hour starts again, so the sound runs on across the seam. Every onset is soft (8 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_DURATION, LOOP, T_SWITCH, HITS, V_EVENT, V_NIGHT1, V_MORN, V_BOOM, V_CRANE, V_DUSK, V_TRUCK, V_LAPSE, V_LAB, V_PREG, V_BABY, V_SUNTURN, powerAt,
} from './src/timeline.js';
import { CRASHES } from './src/traffic.js';
import { HEAPS } from './src/people.js';
import { CAM0, CZ } from './src/layout.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAM_AT = V_EVENT + 0.22, SCREAM_VOL = 0.4;

class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; }
}
class Reverb {
  constructor(seed) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.3) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));
const inLapse = (v) => (v >= V_NIGHT1 && v < V_MORN) || (v >= V_CRANE && v < V_LAB) || (v >= V_PREG && v < V_BABY);

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(5151);
  const white = () => R0() * 2 - 1;

  const BEATS = HITS.map((t, n) => ({ t, k: clamp(0.38 + 0.05 * n, 0, 0.9), root: 55 * Math.pow(2, -Math.min(n, 10) / 24) }));
  BEATS.push({ t: V_BOOM, k: 1.1, root: 34, deep: true });
  // crashes you can see, nearest loudest
  const CR = CRASHES.filter((c) => c.t < V_NIGHT1 && Math.hypot(c.x - CAM0.x, c.z - CAM0.z) < 60).map((c) => {
    const d = Math.hypot(c.x - CAM0.x, c.z - CAM0.z);
    return { t: c.t, g: Math.min(1, 14 / d) * clamp(c.rel / 9, 0.4, 1), pan: clamp((c.x - CAM0.x) / 20, -0.8, 0.8), f: new SVF(), f2: new SVF(), ph: 0 };
  });
  const ALARMS = CR.slice(0, 3).map((c, i) => ({ t: c.t + 0.6 + i * 0.4, end: V_NIGHT1 + 0.2, f0: 650 + 220 * i, rate: 1.6 + 0.5 * i, pan: c.pan, g: 0.014, ph: 0, lp: new OnePole(2200) }));
  // clothes and things landing: soft fabric flumps
  const FLUMP = HEAPS.filter((h) => Math.hypot(h.x - CAM0.x, h.z - CAM0.z) < 14).map((h) => ({ t: V_EVENT + 0.38 + 0.06 * R0(), g: 0.05 * Math.min(1, 4 / Math.hypot(h.x - CAM0.x, h.z - CAM0.z)), pan: clamp((h.x - CAM0.x) / 8, -0.8, 0.8), f: new SVF() }));
  const FEET = Array.from({ length: 220 }, () => ({ t: -LOOP + R0() * (V_EVENT + LOOP), f: 110 + R0() * 70, g: 0.012 + 0.014 * R0(), pan: R0() * 1.6 - 0.8, ph: 0 }));
  const FEET2 = Array.from({ length: 160 }, () => ({ t: V_BABY + R0() * (T_SWITCH - V_BABY), f: 110 + R0() * 70, g: 0.01 + 0.012 * R0(), pan: R0() * 1.6 - 0.8, ph: 0 }));
  const HORNS = [{ t: -0.6, f: 420, d: 0.35 }, { t: 0.35, f: 380, d: 0.25 }, { t: V_BABY + 1.5, f: 440, d: 0.2 }, { t: V_BABY + 3.4, f: 400, d: 0.3 }].map((h) => ({ ...h, ph: 0, lp: new OnePole(1600) }));

  const cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const talkF = Array.from({ length: 8 }, () => new SVF()), talkE = Array.from({ length: 8 }, () => new OnePole(3));
  const sweepF = new SVF(), jetF = [new SVF(), new SVF()], jetLP = new OnePole(90), humF = new SVF(), windF = [new SVF(), new SVF()], hissF = [new SVF(), new SVF()];
  const whooshF = new SVF(), riserF = new SVF(), braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(400), new OnePole(400)], beatLP = new OnePole(120);
  const boomF = new SVF(), boomLP = new OnePole(70), crackF = new SVF();
  let crackE = 0;
  const revL = new Reverb(21), revR = new Reverb(22);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    // --- the street: traffic and voices (all of them at rush hour, half after; back on day 280) ---
    {
      const rush = v < V_NIGHT1 ? 1 : 0, back = smooth(V_BABY - 0.2, V_BABY + 1.2, v);
      const traffic = 0.32 * (v < V_EVENT ? 1 : v < V_NIGHT1 ? 0.55 : 0) + 0.28 * back + 0.06 * (v >= V_MORN && v < V_LAB ? 1 : 0);
      l += cityLP.run(brownL) * traffic; r += cityLP2.run(brownR) * traffic;
      let cv = 0;
      for (let q = 0; q < 8; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), (q < 4 ? 180 + q * 90 : 360 + q * 160) + 70 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp * (q < 4 && v >= V_EVENT && v < V_BABY ? 0 : 1);
      }
      const after = v >= V_EVENT && v < V_NIGHT1 ? 1.5 : 1;   // (the women left cry out, call out)
      const talk = (v < V_EVENT ? 1 : 0) + rush * (v >= V_EVENT ? 0.55 * after : 0) + 0.18 * (v >= V_MORN && v < V_CRANE ? 1 : 0) + 0.85 * back;
      l += cv * 0.05 * talk; r += cv * 0.046 * talk;
    }
    for (const f of [...FEET, ...FEET2]) {
      const dt = v - f.t;
      if (dt < 0 || dt > 0.1) continue;
      f.ph += f.f / SR;
      const fv = Math.sin(TAU * f.ph) * env(dt, 0.008, 0.025) * f.g;
      l += fv * (1 - f.pan) * 0.5; r += fv * (1 + f.pan) * 0.5;
    }
    for (const h of HORNS) {
      const dt = v - h.t;
      if (dt < 0 || dt > h.d + 0.1) continue;
      h.ph += h.f / SR;
      const hv = h.lp.run(saw(h.ph) * 0.6 + saw(h.ph * 1.26) * 0.4) * 0.03 * smooth(0, 0.02, dt) * (1 - smooth(h.d, h.d + 0.08, dt));
      dl += hv * 0.7; dr += hv; wet += hv * 0.5;
    }
    // --- the vanishing: a hollow reversed whoosh into the instant, a soft low thud ---
    {
      const dt = v - V_EVENT;
      if (dt > -0.7 && dt < 1.2) {
        const g = dt < 0 ? Math.pow(smooth(-0.7, 0, dt), 2) : Math.exp(-dt / 0.25);
        const wv = whooshF.run(white(), 300 + 2600 * (dt < 0 ? smooth(-0.7, 0, dt) : Math.exp(-dt * 4)), 0.4).bp * 0.32 * g;
        dl += wv; dr += wv; wet += wv * 0.8;
        ph[30] += (48 - 10 * Math.min(Math.max(dt, 0), 1)) / SR;
        const th = Math.sin(TAU * ph[30]) * env(dt, 0.012, 0.4) * 0.3;
        dl += th; dr += th;
      }
    }
    for (const f of FLUMP) {
      const dt = v - f.t;
      if (dt < 0 || dt > 0.3) continue;
      const fv = f.f.run(white(), 380, 0.7).bp * env(dt, 0.01, 0.06) * f.g * 3;
      l += fv * (1 - f.pan) * 0.5; r += fv * (1 + f.pan) * 0.5;
    }
    // --- crashes: a crunch (low thump, a burst of mid noise), a little falling glass ---
    for (const c of CR) {
      const dt = v - c.t;
      if (dt < -0.01 || dt > 1.6) continue;
      c.ph += (70 - 30 * Math.min(Math.max(dt, 0) * 3, 1)) / SR;
      const th = Math.sin(TAU * c.ph) * env(dt + 0.01, 0.01, 0.18) * 0.7;
      const cr = c.f.run(white(), 900 - 400 * Math.min(Math.max(dt, 0) * 4, 1), 0.5).bp * env(dt + 0.01, 0.012, 0.16) * 1.3;
      const gl = c.f2.run(white(), 5200, 0.3).bp * env(dt - 0.08, 0.01, 0.25) * 0.25 * (0.6 + 0.4 * Math.sin(dt * 90));
      const cv = (th + cr + gl) * c.g;
      dl += cv * (1 - c.pan * 0.6); dr += cv * (1 + c.pan * 0.6); wet += cv * 0.6;
    }
    for (const a of ALARMS) {
      if (v < a.t || v > a.end + 0.4) continue;
      const g = smooth(a.t, a.t + 0.05, v) * (1 - smooth(a.end, a.end + 0.4, v));
      a.ph += a.f0 * (1 + 0.3 * Math.sin(TAU * a.rate * (v - a.t))) / SR;
      const av = a.lp.run(Math.sign(Math.sin(TAU * a.ph)) * 0.6 + Math.sin(TAU * a.ph) * 0.4) * a.g * g;
      l += av * (1 - a.pan) * 0.5; r += av * (1 + a.pan) * 0.5; wet += av * 0.8;
    }
    // --- time racing: a rushing sweep through each time-lapse ---
    if (inLapse(v)) {
      const a = [[V_NIGHT1, V_MORN], [V_CRANE, V_LAB], [V_PREG, V_BABY]].find(([x, y]) => v >= x && v < y);
      const k = smooth(a[0], a[0] + 0.4, v) * (1 - smooth(a[1] - 0.4, a[1], v));
      const sv = sweepF.run(white(), 700 + 500 * Math.sin(v * 1.3), 0.6).bp * 0.06 * k;
      l += sv; r += sv * 0.9; wet += sv * 0.5;
    }
    // --- wind (the empty city) ---
    {
      const g = (v >= V_MORN && v < V_LAB ? 1 : 0) * 0.5 + (v >= V_PREG && v < V_BABY ? 0.3 : 0);
      if (g > 0) { const w = white(); l += windF[0].run(w, 420 + 160 * Math.sin(v * 0.7), 0.5).bp * 0.1 * g; r += windF[1].run(w, 500 + 160 * Math.sin(v * 0.9 + 1), 0.5).bp * 0.1 * g; }
    }
    // --- the jet: a growing roar and a whine overhead, panning left as it goes; cut by the impact ---
    {
      const k = smooth(V_MORN - 0.1, V_MORN + 2.2, v) * (1 - smooth(V_BOOM - 0.02, V_BOOM + 0.05, v));
      if (k > 0) {
        const near = 0.5 + 0.5 * Math.exp(-Math.pow((v - (V_MORN + 1.8)) / 1.6, 2));
        const w = white();
        const pan = clamp(0.6 - (v - V_MORN) * 0.35, -0.6, 0.6);
        ph[31] += (2100 + 300 * near) / SR;
        const jv = (jetF[0].run(w, 380 + 500 * near, 0.6).bp * 0.5 + jetLP.run(white()) * 1.6 + Math.sin(TAU * ph[31]) * 0.02) * 0.95 * k * near;
        dl += jv * (1 - pan * 0.5); dr += jv * (1 + pan * 0.5); wet += jv * 0.4;
      }
    }
    // --- the jet's explosion, on the fireball: a deep thump, a roaring blast, a rolling rumble with crackle ---
    {
      const dt = v - V_BOOM;
      if (dt > -0.02 && dt < 6) {
        ph[35] += (62 * Math.exp(-Math.max(dt, 0) * 2.2) + 24) / SR;
        const thump = Math.sin(TAU * ph[35]) * env(dt + 0.02, 0.015, 1.1) * 1.3;
        const blast = boomF.run(white(), 1800 * Math.exp(-Math.max(dt, 0) * 3) + 140, 0.8).lp * env(dt + 0.02, 0.02, 0.9) * 2.2;
        const rumble = boomLP.run(white()) * env(dt + 0.02, 0.3, 2.2) * 5.0;
        const crk = (R0() < 0.004 * Math.exp(-dt * 0.8) ? 1 : 0);
        crackE = Math.max(crackE * 0.995, crk);
        const crackle = crackF.run(white(), 2400, 0.5).bp * crackE * 0.25 * smooth(0.2, 0.6, dt);
        const ev = thump + blast + rumble + crackle;
        dl += ev; dr += ev * 0.97; wet += (blast + rumble) * 0.8;
      }
    }
    // --- the grid's hum: buzzing, flickering, dying with the lights ---
    if (v >= V_DUSK && v < V_TRUCK) {
      const p = powerAt(v);
      const g = (v < V_DUSK + 1.4 ? 0.4 : p.f > 0.5 ? 1 : 0.1) * (p.p > 0.5 ? 1 : 0.15);
      ph[32] += 60 / SR; ph[33] += 120 / SR;
      const hv = humF.run(saw(ph[32]) * 0.5 + saw(ph[33]) * 0.5, 600, 0.4).bp * 0.07 * g;
      l += hv; r += hv; wet += hv * 0.3;
    }
    // --- the nitrogen hissing in the lab ---
    if (v >= V_LAB && v < V_PREG) {
      const g = smooth(V_LAB, V_LAB + 0.3, v) * (1 - smooth(V_PREG - 0.3, V_PREG, v)) * (0.6 + 0.4 * smooth(V_LAB + 0.4, V_LAB + 2.4, v));
      const w = white();
      const hv = (hissF[0].run(w, 6500, 0.5).bp + hissF[1].run(w, 3200, 0.7).bp * 0.4) * 0.045 * g;
      l += hv * 0.8; r += hv; wet += hv * 0.5;
    }
    // --- the heartbeat on the scan (about 140 a minute), louder as the months go ---
    if (v >= V_PREG && v < V_BABY + 0.6) {
      const g = smooth(V_PREG + 0.5, V_BABY - 0.5, v) * (1 - smooth(V_BABY, V_BABY + 0.6, v));
      const bt = ((v - V_PREG) * 140 / 60) % 1;
      ph[34] += 55 / SR;
      const hb = Math.sin(TAU * ph[34]) * (env(bt, 0.01, 0.05) + 0.6 * env(bt - 0.18, 0.01, 0.05)) * 0.35 * g;
      const hw = whooshF.run(white(), 260, 0.6).bp * (env(bt, 0.02, 0.08) + 0.5 * env(bt - 0.18, 0.02, 0.08)) * 0.25 * g;
      dl += hb + hw; dr += hb + hw;
    }
    // --- the riser into the white ---
    {
      const k = smooth(V_SUNTURN - 0.2, T_SWITCH - 0.1, v) * (1 - smooth(T_SWITCH - 0.05, T_SWITCH + 0.2, v));
      if (k > 0) { const rv = riserF.run(white(), 300 + 3500 * k * k, 0.35).bp * k * k * 0.1; dl += rv; dr += rv; wet += rv * 0.6; }
    }
    // --- the beats ---
    {
      let braam = 0, sub = 0;
      for (const h of BEATS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, (0.7 + 0.8 * h.k) * (h.deep ? 1.8 : 1)) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.006 / SR; ph[12] += hf * 2 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, (0.6 + 0.4 * h.k) * (h.deep ? 2.4 : 1)) * h.k;
      }
      const bf = braamLP.run(braam, 1100, 0.6).lp * 0.07;
      const sv = subLP.run(sub) * 0.36 + sub * 0.18;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the drone: tense and minor through the first two weeks; warm and major from the lab on ---
    {
      const warm = smooth(V_LAB + 1.5, V_LAB + 4, v);
      const ch = warm < 0.5 ? (v < V_DUSK ? [110, 130.8, 164.8] : [103.8, 123.5, 155.6]) : [110, 138.6, 164.8, 220];
      const dg = 1.4 * (v < V_EVENT ? 0.012 : 0.028 + 0.02 * smooth(V_DUSK, V_LAPSE, v)) * (1 + 0.6 * smooth(V_BABY, V_SUNTURN, v)) * (1 - smooth(T_SWITCH - 0.1, T_SWITCH + 0.3, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[45 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[45 + q]); });
      const cutf = 320 + 500 * warm + 600 * smooth(V_BABY, T_SWITCH, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    L[n] = l + dl + rl * 0.8; R[n] = r + dr + rr * 0.8;
  }
  // the owner's scream (sounds/scream.mp3): its first 0.55 s of silence cut; set at the level of the hits
  {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', 'scream.mp3');
    if (fs.existsSync(file)) {
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', file, '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
      const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
      const n0 = Math.round((SCREAM_AT - T0) * SR), len = sc.length >> 1;
      let mix = 0, own = 0;
      const h0 = Math.round((V_EVENT - T0) * SR), h1 = Math.round((V_EVENT + 2 - T0) * SR);
      for (let i = h0; i < h1; i++) mix += L[i] ** 2 + R[i] ** 2;
      mix /= (h1 - h0);
      for (let i = 0; i < len; i++) own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2;
      own /= len;
      const g = SCREAM_VOL * Math.sqrt(mix / own);
      for (let i = 0; i < len && n0 + i < N; i++) {
        const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
        L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
      }
      console.log(`audio: scream at ${SCREAM_AT}s, gain ${g.toFixed(2)}`);
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
  for (let n = 0; n < M; n++) {
    OL[n] = Math.tanh(OL[n] * 1.4); OR[n] = Math.tanh(OR[n] * 1.4);
    if (!Number.isFinite(OL[n]) || !Number.isFinite(OR[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(OL[n]), Math.abs(OR[n]));
  }
  const gn = 0.89 / peak;
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
