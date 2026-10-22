// Procedural soundtrack for "What if an earthquake hit magnitude 18?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// The city at sunset: traffic, voices, the cable car's bell and the hum of its cable. Under it a rumble that never
// stops growing (each magnitude step adds a deep boom), things rattling (smooth, no clicks), glass going (a soft
// hiss, not clinks), car alarms, buildings coming down in long roars, the Bay Bridge far off, the street tearing
// open with a groan; thrown into the air: wind; the dust: a muffled roar. In space: a deep churning drone, a boom
// at every step, the crust cracking; at 18.4 a huge rush into white, which turns back into the street (loop).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, STORY_START, LOOP, BEATS, V_GLASS, V_BRIDGE, V_SPLIT, V_AIR, V_DUST, V_PLANET, V_BREAK, T_SWITCH } from './src/timeline.js';
import { B } from './src/layout.js';
import { vAtMag } from './src/timeline.js';
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

export function makeSoundtrack(outFile) {
  const N = Math.round((VIDEO_DURATION + STORY_START) * SR);   // the whole story (the video skips the first STORY_START s)
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(1906);
  const white = () => R0() * 2 - 1;

  const trafF = new SVF(), trafSub = new OnePole(60), voiceF = Array.from({ length: 5 }, () => new SVF()), voiceE = Array.from({ length: 5 }, () => new OnePole(5));
  const cableF = new SVF();
  const rumF = [new SVF(), new SVF()], rumSub = [new OnePole(35), new OnePole(35)];
  const ratF = [new SVF(), new SVF()], ratE = new OnePole(20);
  const glassF = [new SVF(), new SVF()];
  const crashF = new SVF(), crashSub = new OnePole(45), groanF = new SVF();
  const boomF = new SVF();
  const windF = [new SVF(), new SVF()];
  const spaceF = [new SVF(), new SVF()], hissF = new SVF();
  const endF = new SVF(), endSub = new OnePole(30);
  const muffL = new OnePole(14000), muffR = new OnePole(14000);
  const revL = new Reverb(7), revR = new Reverb(8);
  const ph = new Float64Array(48);
  const BELLS = [-1.6, -1.25, 1.1, 1.45, 2.6];
  const ALARMS = [{ v: V_GLASS + 0.2, f: 980, p: -0.6 }, { v: V_GLASS + 0.7, f: 1250, p: 0.5 }, { v: V_GLASS + 1.3, f: 820, p: 0.1 }, { v: V_GLASS + 2.4, f: 1100, p: -0.2 }];
  // the collapses near enough to hear: the tallest buildings and the closest ones
  const FALLS = B.map((b) => ({ v: vAtMag(b.mFall), g: Math.min(1, 0.25 + b.h / 200) * (1 - Math.min(0.7, Math.hypot(b.x, b.z) / 1500)), d: b.dur + 2 }))
    .filter((f) => f.v < V_DUST + 1).sort((a, b) => b.g - a.g).slice(0, 30);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const city = v < V_PLANET ? 1 : 0;
    const m = s.m;

    // --- the city before: traffic hum, voices, the cable car (its cable, its bell) ---
    if (city) {
      const calm = 1 - smooth(V_GLASS - 1, V_GLASS + 2, v);
      const tv = (trafF.run(white(), 300, 0.5).lp + trafSub.run(white()) * 2) * 0.08;
      l += tv * (0.4 + 0.6 * calm); r += tv * (0.4 + 0.6 * calm);
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const a = voiceE[q].run(Math.max(0, Math.sin(v * (2.2 + q * 0.7) + q * 1.3) + white() * 0.3));
        cv += voiceF[q].run(white(), 380 + q * 230 + 80 * Math.sin(v * (1.1 + q * 0.3)), 0.22).bp * a;
      }
      // chatter, then shouting once it is clearly an earthquake
      const shout = smooth(V_GLASS - 0.5, V_GLASS + 1, v) * (1 - smooth(V_AIR, V_AIR + 2, v));
      l += cv * (0.05 * calm + 0.07 * shout); r += cv * (0.046 * calm + 0.07 * shout);
      const cab = 1 - smooth(V_GLASS - 0.6, V_GLASS, v);
      ph[1] += 47 / SR;
      const cbv = (cableF.run(white(), 180, 0.3).bp * 0.6 + Math.sin(TAU * ph[1]) * 0.25) * 0.05 * cab;
      l += cbv * 0.8; r += cbv;
      for (const bv of BELLS) {
        const dt = v - bv;
        if (dt < 0 || dt > 1.6) continue;
        const e = Math.min(dt / 0.004, 1) * Math.exp(-dt / 0.35);
        const b1 = Math.sin(TAU * 1180 * dt) + 0.5 * Math.sin(TAU * 2950 * dt) * Math.exp(-dt / 0.12) + 0.3 * Math.sin(TAU * 1770 * dt);
        l += b1 * e * 0.03; r += b1 * e * 0.045; wet += b1 * e * 0.04;
      }
    }
    // --- the rumble: deep, everywhere, growing with every step ---
    if (v < T_SWITCH) {
      const k = clamp(0.03 + Math.pow(1.38, m - 5) * 0.03, 0, 0.6) * (city ? 1 : 0.8);
      const rl = (rumSub[0].run(white()) * 3.2 + rumF[0].run(white(), 70 + 8 * m, 0.6).lp) * k;
      const rr = (rumSub[1].run(white()) * 3.2 + rumF[1].run(white(), 75 + 8 * m, 0.6).lp) * k;
      l += rl; r += rr; wet += (rl + rr) * 0.15;
      if (city) {
        const e = ratE.run(0.5 + 0.5 * Math.sin(v * 13.1) * Math.sin(v * 21.7 + 1));
        const rk = clamp((m - 4.7) * 0.03, 0, 0.09) * (1 - smooth(V_AIR, V_DUST, v));
        l += ratF[0].run(white(), 700, 0.5).bp * e * rk; r += ratF[1].run(white(), 900, 0.5).bp * e * rk;
      }
    }
    // --- glass going at magnitude 6: a soft rushing hiss ---
    {
      const dt = v - V_GLASS;
      if (dt > -0.2 && dt < 4) {
        const e = smooth(-0.2, 0.15, dt) * Math.exp(-Math.max(0, dt) / 1.1);
        l += glassF[0].run(white(), 4200, 0.6).bp * e * 0.05; r += glassF[1].run(white(), 5200, 0.6).bp * e * 0.05;
      }
    }
    // --- car alarms ---
    for (let ai = 0; ai < ALARMS.length; ai++) {
      const al = ALARMS[ai], dt = v - al.v;
      if (dt < 0 || v > V_AIR + 1) continue;
      const e = Math.min(dt / 0.15, 1) * (1 - smooth(V_AIR - 1, V_AIR + 1, v));
      ph[10 + ai] += al.f * (1 + 0.28 * Math.sin(TAU * dt * 1.4 + ai)) / SR;
      const av = Math.sin(TAU * ph[10 + ai]) * e * 0.01;
      l += av * (1 - al.p); r += av * (1 + al.p); wet += av * 0.6;
    }
    // --- buildings coming down: long roars; the bridge far off ---
    {
      let fv = 0;
      for (const f of FALLS) { const dt = v - f.v; if (dt > 0 && dt < f.d + 2) fv += f.g * Math.min(dt / 0.4, 1) * Math.exp(-Math.max(0, dt - f.d * 0.6) * 1.2); }
      const c0 = crashF.run(white(), 260, 0.5).lp, cs = crashSub.run(white());
      if (fv > 0) { const c = (c0 + cs * 2) * Math.tanh(fv) * 0.28; l += c; r += c * 0.95; wet += c * 0.4; }
      const db = v - V_BRIDGE;
      if (db > 0 && db < 5) { const c = cs * 1.5 * Math.min(db / 0.8, 1) * Math.exp(-db / 1.5) * 0.25; l += c; r += c; wet += c; }
    }
    // --- the street tearing open: a deep groan sliding down ---
    {
      const dt = v - V_SPLIT;
      if (dt > -0.1 && dt < 3.5) {
        ph[2] += (42 - 16 * Math.min(Math.max(dt, 0) / 2.5, 1)) / SR;
        const gv = (Math.tanh(2 * Math.sin(TAU * ph[2])) * 0.6 + groanF.run(white(), 120, 0.5).lp * 0.8) * Math.min(Math.max(dt, 0) / 0.2, 1) * Math.exp(-Math.max(0, dt - 1.5) / 0.8) * 0.3;
        dl += gv; dr += gv; wet += gv * 0.4;
      }
    }
    // --- thrown into the air: wind round you ---
    {
      const k = smooth(V_AIR, V_AIR + 1.2, v) * (1 - smooth(V_PLANET - 0.3, V_PLANET + 0.5, v));
      if (k > 0) { l += windF[0].run(white(), 520, 0.6).bp * k * 0.14; r += windF[1].run(white(), 600, 0.6).bp * k * 0.14; }
    }
    // --- a boom at every step ---
    for (const b of BEATS) {
      const dt = v - b.v;
      if (dt < -0.01 || dt > 2.5) continue;
      ph[3] += (26 + 50 * Math.exp(-Math.max(dt, 0) * 6)) / SR;
      const g = 0.16 + 0.02 * (b.m - 6);
      const bv = (Math.tanh(2.2 * Math.sin(TAU * ph[3])) * 0.75 + boomF.run(white(), 200, 0.6).lp * 0.8) * env(dt, 0.012, 0.6) * g;
      dl += bv; dr += bv; wet += bv * 0.5;
    }
    // --- space: a churning drone, the crust cracking (a hiss that grows with the glow) ---
    if (!city && v < T_SWITCH) {
      const k = smooth(V_PLANET - 0.2, V_PLANET + 1, v);
      ph[4] += 36.7 / SR; ph[5] += 55 / SR; ph[6] += 36.9 / SR;
      const dv = saw(ph[4]) * 0.5 + saw(ph[5]) * 0.25 + saw(ph[6]) * 0.4;
      const pd = spaceF[0].run(dv, 200 + 30 * (m - 13), 0.4).lp * 0.12 * k;
      dl += pd; dr += pd; wet += pd * 0.6;
      const hk = smooth(14, 17, m) * 0.05;
      l += hissF.run(white(), 1800, 0.5).bp * hk; r += spaceF[1].run(white(), 1500, 0.5).bp * hk;
    }
    // --- 18.4: everything flies apart: a rising rush and a long roar into the white ---
    {
      const dt = v - V_BREAK;
      if (dt > -1.6 && v < T_SWITCH + 0.3) {
        const rise = smooth(-1.6, 0, dt);
        const ev = (endF.run(white(), 200 + 1800 * rise, 0.6).bp * 0.6 + endSub.run(white()) * 3 * rise) * rise * 0.35 * (1 - smooth(T_SWITCH - 0.4, T_SWITCH + 0.2, v));
        l += ev; r += ev; wet += ev * 0.5;
      }
    }

    // inside the dust wall everything is muffled
    const fcm = 14000 * Math.pow(500 / 14000, s.brown);
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the lead-in to the first frame (the street before)
    const a = N - N0, b = Math.round((STORY_START - LOOP) * SR), xf = Math.round(0.7 * SR);
    for (let i = 0; i < N0; i++) { PL[i] = L[b + i]; PR[i] = R[b + i]; }
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
