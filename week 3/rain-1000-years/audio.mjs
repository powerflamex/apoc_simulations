// Procedural soundtrack for "What if it rained for 1,000 years?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// The rain never stops: a steady hiss, with the patter of drops on water close by. On the street at first: voices,
// a few car horns, splashing; car alarms when the cars lift off; the market sign buzzes and dies, the power goes
// with a falling hum. Thunder with every beat (soft-edged: a low crack and a long rumble, no clicks). Out on the open
// sea: wind and swell. A low drone builds toward Everest. Then quiet space, a rushing dive, the splash, and the deep:
// muffled, a slow rumble, bubbles, everything sinking into silence, which turns back into the street's rain (loop).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { state, VIDEO_DURATION, STORY_START, LOOP, BEATS, V_FLOAT, V_SIGN, V_POWER, V_EVEREST, V_EVEREST0, V_SPACE, V_PLUNGE, V_SPLASH, V_BOTTOM, V_SCREAM, V_UNDER, levelAt } from './src/timeline.js';
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
  const R0 = rng(1000);
  const white = () => R0() * 2 - 1;

  const rainF = [new SVF(), new SVF(), new SVF(), new SVF()], patF = [new SVF(), new SVF()], patE = [new OnePole(30), new OnePole(30)];
  const voiceF = Array.from({ length: 5 }, () => new SVF()), voiceE = Array.from({ length: 5 }, () => new OnePole(5));
  const sloshF = new SVF(), sloshE = new OnePole(3);
  const thF = [new SVF(), new SVF()], thSub = new OnePole(50), crackF = new SVF();
  const windF = [new SVF(), new SVF()], windSub = new OnePole(40), gust = new OnePole(0.6);
  const seaF = new SVF(), seaSub = new OnePole(30);
  const padLP = new OnePole(420), padLP2 = new OnePole(420);
  const diveF = [new SVF(), new SVF()], splashF = new SVF(), deepF = new SVF(), deepSub = new OnePole(30);
  const bubF = new SVF();
  const muffL = new OnePole(14000), muffR = new OnePole(14000);
  // the man in the car: the owner's "nooo" clip (sounds/nooo.mp3, kept out of git), voice from ~0.55 s into the file.
  // Clear while his head is above the water, then muffled and sinking away once it goes under.
  let NO = null;
  {
    const f = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', 'nooo.mp3');
    if (fs.existsSync(f)) {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
      if (r.status === 0) {
        const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
        let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x));
        NO = { a, g: 0.75 / Math.max(pk, 1e-6), t0: V_SCREAM - 0.55 };
      }
    } else console.warn('audio: sounds/nooo.mp3 not found, the scream is left out');
  }
  const noF = new OnePole(12000), noHP = new OnePole(180), gulpF = new SVF();
  const revL = new Reverb(7), revR = new Reverb(8);
  const ph = new Float64Array(40);
  // car horns on the street at the start (soft two-tone), and alarms when the cars float
  const HORNS = [{ v: -0.8, f: 392, d: 0.7, p: 0.5 }, { v: 0.9, f: 349, d: 0.45, p: -0.4 }, { v: 2.2, f: 415, d: 1.1, p: 0.2 }, { v: 3.4, f: 330, d: 0.5, p: -0.7 }, { v: 5.1, f: 370, d: 0.8, p: 0.6 }];
  const ALARMS = [{ v: V_FLOAT + 0.4, f: 900, p: -0.5 }, { v: V_FLOAT + 1.2, f: 1150, p: 0.6 }, { v: V_FLOAT + 2.5, f: 800, p: 0.1 }];
  // thunder: at every beat, plus the extra strikes (state() has them); each a slightly different rumble
  const THUNDER = BEATS.filter((b) => b.v < V_SPACE).map((b) => ({ v: b.v, g: 1, seed: R0() }))
    .concat([1.6, 13.0, 21.7, 33.2, 45.5].map((v) => ({ v, g: 0.6, seed: R0() })));
  // bubbles in the deep
  const BUBS = [];
  for (let k = 0; k < 40; k++) BUBS.push({ v: V_SPLASH + 0.1 + Math.pow(R0(), 1.5) * 3.2, f: 500 + R0() * 700, pan: R0() * 1.6 - 0.8, g: 0.02 + 0.03 * R0() });

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;   // d*: not muffled underwater (drone, the deep)
    const city = 1 - smooth(V_EVEREST0 - 0.3, V_EVEREST0, v);
    const air = v < V_SPACE ? 1 : 0;                                   // rain and weather until space
    const level = s.level;

    // --- the rain: a broad hiss, closer and brighter on the street, plus the patter on the water ---
    if (air) {
      const k = 0.07 * (1 - 0.35 * smooth(28, 34, v));
      l += (rainF[0].run(white(), 5200, 0.7).bp * 0.6 + rainF[1].run(white(), 1600, 0.8).bp * 0.5) * k;
      r += (rainF[2].run(white(), 5000, 0.7).bp * 0.6 + rainF[3].run(white(), 1700, 0.8).bp * 0.5) * k;
      // the patter: the hiss broken up into soft grains (smoothed amplitude, so no clicks)
      for (let c = 0; c < 2; c++) {
        const e = patE[c].run(Math.max(0, white()) ** 6 * 4);
        const pv = patF[c].run(white(), 2600 + 800 * c, 0.5).bp * e * 0.09;
        if (c === 0) l += pv; else r += pv;
      }
    }
    // --- the street at the start: voices, horns, splashing; it all goes as the water rises ---
    {
      const crowd = (1 - smooth(4, 8, v)) * city;
      if (crowd > 0.001) {
        let cv = 0;
        for (let q = 0; q < 5; q++) {
          const a = voiceE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.7) + q * 1.3) + white() * 0.3));
          cv += voiceF[q].run(white(), 380 + q * 220 + 80 * Math.sin(v * (1.1 + q * 0.3)), 0.22).bp * a;
        }
        l += cv * 0.03 * crowd; r += cv * 0.028 * crowd;
      }
      for (const hn of HORNS) {
        const dt = v - hn.v;
        if (dt < 0 || dt > hn.d + 0.2) continue;
        const e = Math.min(dt / 0.05, 1) * Math.min(Math.max(hn.d + 0.15 - dt, 0) / 0.08, 1);
        ph[20] += hn.f / SR; ph[21] += hn.f * 1.26 / SR;
        const hv = (Math.tanh(2 * Math.sin(TAU * ph[20])) + 0.7 * Math.tanh(2 * Math.sin(TAU * ph[21]))) * e * 0.022;
        l += hv * (1 - hn.p) * 0.6; r += hv * (1 + hn.p) * 0.6; wet += hv * 0.6;
      }
      // alarms: a slow wail (siren sweep), muffled as the cars go under
      for (const al of ALARMS) {
        const dt = v - al.v;
        if (dt < 0 || dt > 7) continue;
        const e = Math.min(dt / 0.15, 1) * (1 - smooth(4, 7, dt));
        ph[22 + ALARMS.indexOf(al)] += al.f * (1 + 0.25 * Math.sin(TAU * dt * 1.6)) / SR;
        const av = Math.sin(TAU * ph[22 + ALARMS.indexOf(al)]) * e * 0.012;
        l += av * (1 - al.p); r += av * (1 + al.p); wet += av * 0.8;
      }
      // water: sloshing and gurgling, growing as it rises through the street
      const sl = smooth(0.5, 6, v) * (1 - smooth(18, 26, v)) * city;
      if (sl > 0) {
        const e = sloshE.run(0.5 + 0.5 * Math.sin(v * 1.7) * Math.sin(v * 0.63 + 1));
        const sv = sloshF.run(white(), 260 + 200 * e, 0.4).lp * (0.4 + 0.6 * e) * sl * 0.22;
        l += sv; r += sv * 0.9;
      }
    }
    // --- the sign: an electric buzz while it flickers, then the power dies with a falling hum ---
    {
      const bz = smooth(V_SIGN - 1.0, V_SIGN - 0.8, v) * (1 - smooth(V_SIGN, V_SIGN + 0.25, v));
      if (bz > 0) {
        ph[1] += 120 / SR;
        const flick = Math.sin(v * 53) > -0.2 ? 1 : 0.2;
        const bv = (saw(ph[1]) * 0.5 + saw(ph[1] * 2) * 0.25) * bz * flick * 0.025;
        l += bv; r += bv;
      }
      const dt = v - V_POWER;
      if (dt > 0 && dt < 2.5) {
        ph[2] += (60 * Math.exp(-dt * 1.2) + 18) / SR;
        const pv = Math.sin(TAU * ph[2]) * env(dt, 0.02, 0.7) * 0.18;
        dl += pv; dr += pv;
      }
    }
    // --- thunder ---
    for (const th of THUNDER) {
      const dt = v - th.v - 0.12;
      if (dt < 0 || dt > 4.5) continue;
      const crack = crackF.run(white(), 900, 0.6).lp * env(dt, 0.015, 0.12) * 1.6;
      const roll = (thF[0].run(white(), 160 + 60 * Math.sin(dt * 3 + th.seed * 9), 0.5).lp + thSub.run(white()) * 3) * env(dt, 0.08, 1.4) * (0.7 + 0.3 * Math.sin(dt * 5.3 + th.seed * 20));
      const tv = (crack + roll * 0.9) * th.g * 0.32;
      l += tv * (0.9 + 0.2 * th.seed); r += tv * (1.1 - 0.2 * th.seed); wet += tv * 0.5;
    }
    // --- the open sea and the mountains: wind and swell ---
    if (air) {
      const k = smooth(22, 32, v) * (1 - smooth(V_UP_A, V_UP_A + 0.6, v));
      if (k > 0) {
        const g = gust.run(0.6 + 0.4 * Math.sin(v * 0.7) * Math.sin(v * 0.31 + 2) + 0.2 * white());
        l += (windF[0].run(white(), 380 + 260 * g, 0.6).bp * 0.6 + windSub.run(white()) * 1.4) * (0.08 + 0.05 * g) * k;
        r += windF[1].run(white(), 420 + 260 * g, 0.6).bp * 0.6 * (0.08 + 0.05 * g) * k + windSub.y * 1.4 * 0.1 * k;
        const sv = (seaF.run(white(), 120, 0.5).lp + seaSub.run(white()) * 2) * (0.5 + 0.5 * Math.sin(v * 0.9)) * 0.12 * k;
        l += sv; r += sv;
      }
    }
    // --- a low drone: two notes a minor third apart, climbing slowly, loudest toward Everest ---
    {
      const climb = clamp(Math.log10(Math.max(level, 0.1)) / 4);     // 0.1 m .. 8,849 m
      const f0 = 43.65 * Math.pow(2, climb * 0.5);
      const dg = (0.02 + 0.045 * smooth(10, 48, v)) * (1 - 0.45 * smooth(V_EVEREST, V_EVEREST + 1.2, v)) * (1 - smooth(V_BOTTOM - 1.5, V_BOTTOM, v));
      let pv = 0, pv2 = 0;
      [1, 1.189, 1.5, 2].forEach((m, q) => { ph[10 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[10 + q]) * (q === 0 ? 0.8 : 0.35); });
      [1.003, 1.192, 1.498].forEach((m, q) => { ph[15 + q] += (f0 * m * 2) / SR; pv2 += saw(ph[15 + q]) * 0.25; });
      pv = padLP.run(pv) * dg; pv2 = padLP2.run(pv2) * dg * 0.6;
      dl += pv + pv2 * 0.6; dr += pv * 0.9 + pv2; wet += (pv + pv2) * 0.5;
    }
    // --- Everest: the last moment, a deep swell as the water closes over the summit ---
    {
      const dt = v - V_EVEREST;
      if (dt > -1.2 && dt < 3) {
        ph[3] += (34 + 10 * Math.exp(-Math.max(dt, 0))) / SR;
        const ev = Math.sin(TAU * ph[3]) * smooth(-1.2, 0, dt) * env(Math.max(dt, 0) + 0.001, 0.001, 1.0) * 0.12;
        dl += ev; dr += ev; wet += ev * 0.5;
      }
    }
    // --- the dive: a rising rush, the splash, the deep ---
    {
      const k = smooth(V_PLUNGE, V_SPLASH, v) * (v < V_SPLASH ? 1 : 0);
      if (k > 0) {
        const dv = (diveF[0].run(white(), 300 + 2500 * k * k, 0.7).bp * 0.7 + diveF[1].run(white(), 120 + 400 * k, 0.6).lp) * k * k * 0.25;
        l += dv; r += dv;
      }
      const dt = v - V_SPLASH;
      if (dt > -0.01 && dt < 1.5) {
        const sp = splashF.run(white(), 900 - 500 * Math.min(dt, 1), 0.5).lp * env(dt, 0.045, 0.35) * 0.9;
        dl += sp; dr += sp; wet += sp * 0.6;
      }
      if (dt > 0) {
        const fade = 1 - smooth(V_BOTTOM - 0.8, V_BOTTOM + 0.2, v);
        const dv = (deepF.run(white(), 90, 0.5).lp * 1.5 + deepSub.run(white()) * 3) * 0.16 * smooth(0, 0.3, dt) * fade;
        dl += dv; dr += dv;
        for (const b of BUBS) {
          const bt = v - b.v;
          if (bt < 0 || bt > 0.25) continue;
          ph[30] += (b.f * (1 + bt * 3)) / SR;
          const bv = Math.sin(TAU * ph[30]) * env(bt, 0.008, 0.06) * b.g * fade;
          dl += bv * (1 - b.pan); dr += bv * (1 + b.pan);
        }
      }
    }

    // the man in the car screaming, then the water closing over his head
    if (NO) {
      const i = Math.round((v - NO.t0) * SR);
      if (i >= 0 && i < NO.a.length) {
        const under = smooth(V_UNDER - 0.08, V_UNDER + 0.2, v);
        noF.set(9000 * Math.pow(260 / 9000, under));
        const x = NO.a[i] * NO.g;
        const y = noF.run(x - noHP.run(x) * 0.6) * (1 - 0.55 * under) * (1 - smooth(V_UNDER + 0.3, V_UNDER + 1.8, v));
        l += y * 0.85; r += y * 1.0; wet += y * 0.35 * (1 - under);
      }
      // the gulp as the water goes over his head
      const dg = v - V_UNDER;
      if (dg > -0.05 && dg < 0.8) { const gv = gulpF.run(white(), 220 + 300 * Math.exp(-Math.max(dg, 0) * 8), 0.4).lp * env(dg, 0.03, 0.25) * 0.5; l += gv * 0.8; r += gv; }
    }
    // under the water, the world above is gone; in space, only the drone
    const under = v >= V_SPLASH ? 1 : 0;
    const fcm = under ? 400 : 14000;
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    if (v >= V_SPACE && v < V_PLUNGE) { l *= 0.15; r *= 0.15; }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the deep, the soundtrack turns into the lead-in to the first frame (the street's rain)
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
const V_UP_A = V_EVEREST + 0.15;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
