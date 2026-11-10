// Procedural soundtrack for "What if false vacuum decay happened?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// Space: a deep, slowly swelling drone; while the wall is cutting something, a soft high sizzle and a low rumble;
// a deep boom as it reaches each body; fast-forwards between them rush past (filtered noise that rises and falls
// with the speed). The Sun roars until it is gone, then near silence. Paris: the evening street (traffic, voices,
// a far-off accordion-like drone), easing from time-lapse to real speed. The slow motion: the street's sound
// stretched into a low hum, a thin rising tone as the wall gets closer, air rushing in the chase; then a huge
// rising rush into the white, which turns back into the first frame (the loop). Soft envelopes only: no clicks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, tauAt, VIDEO_DURATION, LOOP, BEATS, SHOTS, V_HIT, T_SWITCH, C_KM } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.8)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.88, damp = 0.4) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));
const shotV = (n) => SHOTS.find((s) => s.name === n).v;
// while the wall is slicing through a body (video time spans)
const CUTS = [[0, 2.5], [4.3, 7.0], [8.6, 10.8], [12.2, 17.6], [29.9, 31.3], [32.7, 35.8]];

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(1979);
  const white = () => R0() * 2 - 1;
  const V_PARIS = shotV('paris'), V_MOON = shotV('moon'), V_SLOW = shotV('slowmo');

  const droneF = [new SVF(), new SVF()], sub = [new OnePole(40), new OnePole(40)];
  const sizF = [new SVF(), new SVF()], rumF = new SVF(), rumSub = new OnePole(30);
  const ffF = [new SVF(), new SVF()];
  const sunF = [new SVF(), new SVF()], sunSub = new OnePole(50);
  const trafF = new SVF(), trafSub = new OnePole(70), voiceF = Array.from({ length: 6 }, () => new SVF()), voiceE = Array.from({ length: 6 }, () => new OnePole(6));
  const humF = new SVF(), windF = [new SVF(), new SVF()];
  const boomF = new SVF(), endF = new SVF(), endSub = new OnePole(30);
  const revL = new Reverb(7), revR = new Reverb(8);
  const ph = new Float64Array(32);
  const chord = [55, 82.41, 110, 130.81, 164.81];

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0;
    const space = !['paris', 'slowmo'].includes(s.shot);
    const lr = Math.log10(Math.max(s.rate, 1e-12));

    // --- the pad under everything: a minor chord that swells slowly and grows toward the end ---
    {
      const grow = 0.35 + 0.65 * smooth(0, V_HIT, v);
      const k = (space ? 1 : 0.55) * grow * (1 - smooth(V_HIT, V_HIT + 0.3, v));
      let pd = 0;
      chord.forEach((f, i) => { ph[i] += f * (1 + 0.002 * Math.sin(v * 0.3 + i)) / SR; pd += (Math.sin(TAU * ph[i]) * 0.6 + saw(ph[i]) * 0.25) * (0.6 + 0.4 * Math.sin(v * (0.21 + i * 0.07) + i * 1.7)); });
      const pl = droneF[0].run(pd, 300 + 250 * grow, 0.5).lp * 0.05 * k, pr = droneF[1].run(pd, 320 + 250 * grow, 0.5).lp * 0.05 * k;
      const sb = (sub[0].run(white()) * 2.2) * 0.12 * k;
      l += pl + sb; r += pr + sb; wet += (pl + pr) * 0.5;
    }
    // --- the wall cutting: a soft high sizzle and a deep rumble while it eats something ---
    {
      let c = 0;
      for (const [a, b] of CUTS) c = Math.max(c, smooth(a - 0.3, a + 0.3, v) * (1 - smooth(b - 0.2, b + 0.4, v)));
      if (c > 0.001) {
        const big = s.shot === 'sun' ? 1.4 : s.shot === 'earth' ? 1.3 : 1;
        l += sizF[0].run(white(), 5200, 0.7).bp * 0.05 * c; r += sizF[1].run(white(), 6100, 0.7).bp * 0.05 * c;
        const rm = (rumSub.run(white()) * 3 + rumF.run(white(), 90, 0.6).lp) * 0.11 * c * big;
        l += rm; r += rm; wet += rm * 0.4;
      }
    }
    // --- fast-forward: a rush that rises and falls with the speed of the clock ---
    {
      const k = smooth(1.2, 3.3, lr) * (space || v < V_PARIS + 1.5 ? 1 : 0.5);
      if (k > 0.001) {
        const fc = 300 + 2600 * smooth(1.2, 4.0, lr);
        l += ffF[0].run(white(), fc, 0.5).bp * 0.12 * k; r += ffF[1].run(white(), fc * 1.1, 0.5).bp * 0.12 * k;
      }
    }
    // --- the Sun: a deep roar, gone the moment the Sun is ---
    if (s.shot === 'sun') {
      const k = smooth(shotV('sun') + 0.4, 12.2, v) * (1 - smooth(16.6, 17.6, v));
      const sv = (sunSub.run(white()) * 2.5 + sunF[0].run(white(), 160, 0.6).lp) * 0.14 * k;
      l += sv + sunF[1].run(white(), 900, 0.5).bp * 0.025 * k; r += sv; wet += sv * 0.3;
    }
    // --- Paris at sunset: traffic and voices; real speed by the end of the time-lapse ---
    if (s.shot === 'paris') {
      const k = smooth(V_PARIS, V_PARIS + 0.6, v) * (1 - smooth(V_MOON - 0.25, V_MOON, v));
      const tv = (trafF.run(white(), 350 + 300 * smooth(0, 2.5, lr), 0.5).lp + trafSub.run(white()) * 1.5) * 0.09 * k;
      l += tv; r += tv * 0.95;
      let cv = 0;
      for (let q = 0; q < 6; q++) {
        const a = voiceE[q].run(Math.max(0, Math.sin(v * (2.0 + q * 0.6) + q * 1.3) + white() * 0.3));
        cv += voiceF[q].run(white(), 360 + q * 210 + 70 * Math.sin(v * (1.1 + q * 0.3)), 0.22).bp * a;
      }
      const real = 1 - smooth(0.6, 2.2, lr);   // voices only once it is close to real speed
      l += cv * 0.05 * k * real; r += cv * 0.045 * k * real;
    }
    // --- the slow motion: the city stretched into a low hum; a thin tone rising as the wall closes in ---
    if (s.shot === 'slowmo') {
      const k = smooth(V_SLOW, V_SLOW + 0.8, v) * (1 - smooth(V_HIT - 0.05, V_HIT + 0.2, v));
      const hm = humF.run(white(), 70, 0.4).lp * 0.35 * k;
      l += hm; r += hm; wet += hm * 0.3;
      const close = clamp(1 - Math.log10(Math.max(tauAt(v) * C_KM * 1000, 0.01) + 1) / 5.5);   // 0 at ~300 km .. 1 here
      ph[20] += (220 + 660 * close * close) / SR; ph[21] += (221.5 + 664 * close * close) / SR;
      const tn = (Math.sin(TAU * ph[20]) + Math.sin(TAU * ph[21])) * 0.018 * k * (0.3 + 0.7 * close);
      l += tn; r += tn; wet += tn * 0.8;
      // flying with the wall: air
      const ch = smooth(47.6, 48.4, v) * (1 - smooth(54.3, 54.9, v));
      if (ch > 0) { l += windF[0].run(white(), 700, 0.6).bp * ch * 0.08; r += windF[1].run(white(), 800, 0.6).bp * ch * 0.08; }
    }
    // --- a boom as the wall reaches each body ---
    for (const b of BEATS) {
      const dt = v - b.v;
      if (dt < -0.01 || dt > 3) continue;
      ph[25] += (24 + 46 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
      const bv = (Math.tanh(2.2 * Math.sin(TAU * ph[25])) * 0.75 + boomF.run(white(), 180, 0.6).lp * 0.8) * env(dt, 0.015, 0.7) * 0.2;
      l += bv; r += bv; wet += bv * 0.6;
    }
    // --- the end: a huge rising rush into the white ---
    {
      const dt = v - V_HIT;
      if (dt > -2.4 && v < T_SWITCH + 0.2) {
        const rise = smooth(-2.4, 0, dt);
        const ev = (endF.run(white(), 200 + 2400 * rise, 0.6).bp * 0.7 + endSub.run(white()) * 3 * rise) * rise * 0.32 * (1 - smooth(V_HIT + 0.15, T_SWITCH + 0.1, v));
        l += ev; r += ev; wet += ev * 0.5;
      }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.8, outR = r + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.7 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.5); R[n] = Math.tanh(R[n] * 1.5);
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
