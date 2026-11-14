// Procedural soundtrack for "What if the asteroid that killed the dinosaurs hit today?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: Canal Street on a summer evening (traffic, people talking) and the owner's scream on frame 0
// (sounds/scream.mp3, set near the level of the hits); a deep hit on every beat, bigger each time, over a low drone. Then a
// sound for each thing you see: the crowd's alarm and running feet; the quake's deep rumble, windows rattling and car
// alarms set off as the cars rock; the crackle of the palms and cars burning, with a whump as each goes up; the rocks
// coming down (soft hissing streaks, thuds as the near ones land); a roar that swells as the dust wall comes, a riser and
// one last hit under the white. (The real sound of the impact would take ~46 minutes to get here: it comes with the blast.)
// The loop: under the white the street starts again, so the sound runs on across the seam. Every onset is soft (8 ms+).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_DURATION, LOOP, T_SWITCH, HITS, V_FLASH, V_RUN, V_TREES, V_QUAKE, V_EJECTA, V_CARS, V_WALL, V_REAL, V_RIVER, V_HIT, V_RED,
} from './src/timeline.js';
import { CARS } from './src/traffic.js';
import { CAM0 } from './src/layout.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAM_AT = 0.12, SCREAM_VOL = 0.2;

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
  run(x, fb = 0.86, damp = 0.3) {
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

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;                                   // the run starts LOOP s before frame 0 (the loop's lead-in)
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(4747);
  const white = () => R0() * 2 - 1;

  // ---- the beats: a hit on each, the flash and the blast deepest ----
  const BEATS = HITS.map((t, n) => ({ t, k: clamp(0.4 + 0.055 * n, 0, 0.95), root: 55 * Math.pow(2, -Math.min(n, 10) / 24) }));
  BEATS[1].k = 1.0; BEATS[1].deep = true;
  BEATS.push({ t: V_HIT, k: 1.25, root: 30, deep: true });
  // ---- whumps: the palms going up, the streetcar, the nearest cars ----
  const WHUMPS = [{ t: V_TREES, g: 0.8, pan: 0 }, { t: V_TREES + 0.4, g: 0.5, pan: -0.5 }, { t: V_TREES + 0.8, g: 0.45, pan: 0.5 }, { t: V_CARS + 0.85, g: 0.8, pan: 0.3 }];
  const nearCars = CARS.map((c) => ({ c, d: Math.hypot(c.x - CAM0.x, c.zs[c.zs.length - 1] - CAM0.z) })).filter((o) => o.d < 70).sort((a, b) => a.d - b.d).slice(0, 7);
  for (const { c, d } of nearCars) WHUMPS.push({ t: c.tFire + 0.05, g: 0.85 * Math.min(1, 14 / d), pan: clamp((c.x - CAM0.x) / 14, -0.8, 0.8) });
  WHUMPS.forEach((w) => { w.f = new SVF(); w.ph = 0; });
  // ---- car alarms: set off as the quake rocks the cars, going until they burn ----
  const ALARMS = Array.from({ length: 5 }, (_, i) => ({ t: V_QUAKE + 0.4 + i * 0.35 + R0() * 0.3, end: V_CARS + 0.5 + i * 0.4, f0: 600 + R0() * 350, rate: 1.4 + R0() * 1.2, pan: R0() * 1.6 - 0.8, g: 0.012 + 0.008 * R0(), ph: 0, lp: new OnePole(2500) }));
  // ---- windows and signs rattling in the quake (soft high bursts) ----
  const RATTLE = Array.from({ length: 260 }, () => ({ t: V_QUAKE + R0() * 3.4, d: 0.02 + R0() * 0.05, f: 1500 + R0() * 3000, g: 0.008 + 0.01 * R0(), pan: R0() * 1.6 - 0.8, fl: new SVF() }));
  // ---- fire crackles ----
  const CRK = Array.from({ length: 900 }, () => ({ t: V_TREES + R0() * (V_HIT - V_TREES), d: 0.015 + R0() * 0.05, f: 1200 + R0() * 4000, g: 0.012 * (0.4 + R0()), pan: R0() * 1.8 - 0.9, fl: new SVF() }));
  // ---- running feet ----
  const FEET = Array.from({ length: 180 }, () => ({ t: V_RUN + 0.1 + Math.pow(R0(), 1.3) * 10, f: 90 + R0() * 60, g: 0.03 + 0.04 * R0(), pan: R0() * 1.6 - 0.8, ph: 0 }));
  // ---- the falling rocks: hissing streaks overhead, thuds where the near ones land ----
  const HISS = Array.from({ length: 120 }, () => ({ t: V_EJECTA - 0.3 + Math.pow(R0(), 0.8) * (V_HIT - V_EJECTA), d: 0.4 + R0() * 0.8, f: 1800 + R0() * 2500, g: 0.015 + 0.02 * R0(), pan: R0() * 1.8 - 0.9, fl: new SVF() }));
  const THUDS = Array.from({ length: 50 }, () => ({ t: V_EJECTA + 0.3 + R0() * (V_HIT - V_EJECTA - 1), g: 0.12 + 0.25 * R0(), pan: R0() * 1.6 - 0.8, f: new SVF(), ph: 0 }));

  const cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
  const fireF = [new SVF(), new SVF()], fireLP = new OnePole(300);
  const roarF = [new SVF(), new SVF(), new SVF()], roarLP = new OnePole(70), riserF = new SVF(), quakeLP = new OnePole(45), quakeLP2 = new OnePole(45);
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(400), new OnePole(400)];
  const revL = new Reverb(21), revR = new Reverb(22);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const crowdK = 1 - smooth(V_RUN + 8, 28, v);
    // --- the street: traffic (it stops at the flash), people talking, then shouting ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    {
      const traffic = 0.18 * (1 - smooth(V_FLASH, V_FLASH + 1.5, v)) + 0.06;
      l += cityLP.run(brownL) * traffic; r += cityLP2.run(brownR) * traffic;
      let cv = 0;
      for (let q = 0; q < 6; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = (0.8 + 1.2 * smooth(V_FLASH - 0.2, V_FLASH + 0.8, v)) * crowdK;
      l += cv * 0.05 * talk; r += cv * 0.046 * talk;
    }
    // --- the low roar: growing all the way, swelling as the wall comes ---
    {
      const g = 1.7 * (0.05 + 0.05 * smooth(V_FLASH, 12, v) + 0.08 * smooth(V_WALL - 1, V_REAL, v) + 0.4 * smooth(V_REAL, V_HIT, v)) * (1 - smooth(V_HIT, V_HIT + 0.25, v));
      const w = white();
      const fc = 120 + 300 * smooth(V_REAL, V_HIT, v);
      const rv = (roarF[0].run(w, fc, 0.6).bp * 0.9 + roarF[1].run(w, fc * 2.4, 0.7).bp * 0.35 + roarLP.run(white()) * 2.2) * g;
      dl += rv; dr += roarF[2].run(w, fc * 1.1, 0.6).bp * 0.9 * g + roarLP.y * 2.2 * g; wet += rv * 0.3;
    }
    // --- the quake: a deep rumble, rolling in and out ---
    {
      const g = smooth(V_QUAKE - 0.4, V_QUAKE + 0.2, v) * (1 - smooth(V_QUAKE + 2.8, V_QUAKE + 4.6, v));
      if (g > 0) {
        const am = 0.7 + 0.3 * Math.sin(v * 7.3) * Math.sin(v * 3.1);
        const qv = quakeLP.run(white()) * 9 * g * am, qr = quakeLP2.run(white()) * 9 * g * am;
        ph[25] += (31 + 4 * Math.sin(v * 2.3)) / SR;
        const sv = Math.sin(TAU * ph[25]) * 0.25 * g * am;
        dl += qv + sv; dr += qr + sv; wet += qv * 0.3;
      }
    }
    for (const q of RATTLE) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const e = smooth(0, 0.008, dt) * (1 - smooth(q.d - 0.01, q.d, dt));
        const gv = q.fl.run(white(), q.f, 0.5).bp * e * q.g * 2;
        l += gv * (1 - q.pan) * 0.5; r += gv * (1 + q.pan) * 0.5; wet += gv * 0.5;
      }
    }
    for (const f of FEET) {
      const dt = v - f.t;
      if (dt < 0 || dt > 0.12) continue;
      f.ph += f.f / SR;
      const fv = Math.sin(TAU * f.ph) * env(dt, 0.008, 0.03) * f.g;
      l += fv * (1 - f.pan) * 0.5; r += fv * (1 + f.pan) * 0.5;
    }
    // --- fire ---
    {
      const g = smooth(V_TREES - 0.1, V_TREES + 1, v) * (0.6 + 0.4 * smooth(V_CARS, V_CARS + 3, v)) * (1 - 0.6 * smooth(40, V_HIT, v));
      if (g > 0) {
        const w = white();
        const fv = (fireF[0].run(w, 700 + 200 * Math.sin(v * 3.1), 0.7).bp * 0.6 + fireLP.run(white()) * 1.2) * 0.19 * g * (0.75 + 0.25 * Math.sin(v * 9) * Math.sin(v * 5.3));
        l += fv; r += fireF[1].run(w, 900, 0.7).bp * 0.11 * g + fireLP.y * 0.22 * g; wet += fv * 0.3;
      }
    }
    for (const c of CRK) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        const e = smooth(0, 0.008, dt) * (1 - smooth(c.d - 0.01, c.d, dt));
        const cv = c.fl.run(white(), c.f, 0.5).bp * e * c.g * 2.2;
        l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5;
      }
    }
    for (const w of WHUMPS) {
      const dt = v - w.t;
      if (dt < -0.01 || dt > 2.5) continue;
      w.ph += (55 - 25 * Math.min(dt * 2, 1)) / SR;
      const wv = (Math.sin(TAU * w.ph) * 0.6 * env(dt + 0.01, 0.02, 0.35) + w.f.run(white(), 500 - 300 * Math.min(dt, 1), 0.6).bp * 0.5 * env(dt + 0.01, 0.03, 0.45)) * w.g;
      dl += wv * (1 - w.pan * 0.5); dr += wv * (1 + w.pan * 0.5); wet += wv * 0.8;
    }
    for (const a of ALARMS) {
      if (v < a.t || v > a.end + 0.4) continue;
      const g = smooth(a.t, a.t + 0.05, v) * (1 - smooth(a.end, a.end + 0.4, v));
      const f = a.f0 * (1 + 0.35 * Math.sin(TAU * a.rate * (v - a.t)));
      a.ph += f / SR;
      const av = a.lp.run(Math.sign(Math.sin(TAU * a.ph)) * 0.6 + Math.sin(TAU * a.ph) * 0.4) * a.g * g;
      l += av * (1 - a.pan) * 0.5; r += av * (1 + a.pan) * 0.5; wet += av * 0.8;
    }
    // --- the rocks ---
    for (const q of HISS) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const k = dt / q.d, e = smooth(0, 0.15, k) * (1 - smooth(0.7, 1, k));
        const pan = q.pan * (1 - 2 * k);
        const hv = q.fl.run(white(), q.f * (1.2 - 0.5 * k), 0.4).bp * e * q.g;
        l += hv * (1 - pan) * 0.5; r += hv * (1 + pan) * 0.5; wet += hv * 0.5;
      }
    }
    for (const w of THUDS) {
      const dt = v - w.t;
      if (dt < -0.01 || dt > 1.2) continue;
      w.ph += (70 - 30 * Math.min(dt * 3, 1)) / SR;
      const wv = (Math.sin(TAU * w.ph) * env(dt + 0.01, 0.01, 0.15) + w.f.run(white(), 900 - 600 * Math.min(dt * 2, 1), 0.6).bp * 0.6 * env(dt + 0.01, 0.01, 0.2)) * w.g;
      dl += wv * (1 - w.pan * 0.5); dr += wv * (1 + w.pan * 0.5); wet += wv * 0.6;
    }
    // --- the riser into the blast ---
    {
      const k = smooth(V_RIVER - 2.5, V_HIT, v) * (1 - smooth(V_HIT - 0.02, V_HIT + 0.08, v));
      if (k > 0) { const rv = riserF.run(white(), 250 + 4000 * k * k, 0.35).bp * k * k * 0.16; dl += rv; dr += rv; wet += rv * 0.5; }
    }
    // --- the beats ---
    {
      let braam = 0, sub = 0;
      for (const h of BEATS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, (0.8 + 0.8 * h.k) * (h.deep ? 1.6 : 1)) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.006 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, (0.7 + 0.4 * h.k) * (h.deep ? 2 : 1)) * h.k;
      }
      const bf = braamLP.run(braam, 1300, 0.6).lp * 0.08;
      const sv = subLP.run(sub) * 0.38 + sub * 0.19;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the drone: a tense chord that steps up as it gets worse ---
    {
      const ch = v < V_QUAKE ? [110, 138.6, 164.8] : v < V_WALL ? [116.5, 146.8, 174.6] : [123.5, 155.6, 185];
      const dg = 1.5 * (0.025 + 0.025 * smooth(4, 12, v) + 0.04 * smooth(V_RED, 40, v)) * (1 - smooth(V_HIT, V_HIT + 0.3, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const cutf = 300 + 600 * smooth(20, 44, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    L[n] = l + dl + rl * 0.8; R[n] = r + dr + rr * 0.8;
  }
  // the owner's scream (sounds/scream.mp3): its first 0.55 s of silence cut; its level set from the mix around the flash
  {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', 'scream.mp3');
    if (fs.existsSync(file)) {
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', file, '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
      const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
      const n0 = Math.round((SCREAM_AT - T0) * SR), len = sc.length >> 1;
      let mix = 0, own = 0;
      const h0 = Math.round((V_FLASH - T0) * SR), h1 = Math.round((V_FLASH + 2 - T0) * SR);
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
    } else console.warn('audio: no sounds/scream.mp3: left out');
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
