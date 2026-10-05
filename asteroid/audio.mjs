// Procedural soundtrack for "What if a 1-mile asteroid hit the ocean?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, DURATION, T_IMPACT, T_SHOCK, T_ENGULF } from './src/timeline.js';
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
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 40), SR / 8) / SR);
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

export function makeSoundtrack(outFile) {
  const N = Math.round(DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(31);
  const white = () => R0() * 2 - 1;

  const gulls = [];
  for (let t = 0.6; t < T_IMPACT; t += 0.9 + R0() * 2.4) gulls.push({ t, f: 1500 + R0() * 700, d: 0.35 + R0() * 0.3, pan: R0() * 2 - 1, g: 0.03 + R0() * 0.03 });
  for (let i = 0; i < 7; i++) gulls.push({ t: T_IMPACT + 0.3 + R0() * 2, f: 1900 + R0() * 500, d: 0.25, pan: R0() * 2 - 1, g: 0.05 });
  const crashes = [];
  for (let t = 0.3; t < 44; t += 5.2 + R0() * 2.5) crashes.push({ t, g: 0.6 + R0() * 0.4 });
  const shards = [];
  for (let i = 0; i < 1400; i++) shards.push({ t: T_SHOCK + 0.03 + Math.pow(R0(), 1.6) * 3.2, f: 2500 + R0() * 7000, g: 0.02 + R0() * 0.06, pan: R0() * 2 - 1 });
  shards.sort((a, b) => a.t - b.t);
  const HITS = [[58.2, 0.8, 49], [64.0, 1.0, 43.65], [69.8, 1.2, 36.7]];

  const surfLP = new OnePole(600), surfLP2 = new OnePole(450), crashF = new SVF();
  const crowd = Array.from({ length: 6 }, () => new SVF());
  const crowdEnv = Array.from({ length: 6 }, () => new OnePole(3));
  const windL = new SVF(), windR = new SVF();
  const padLP = new OnePole(900), tensLP = new OnePole(500), riserF = new SVF(), braamLP = new SVF();
  const rumbleLP = new OnePole(90), roarL = new SVF(), roarR = new SVF(), boomLP = new OnePole(120), drainF = new SVF();
  const muffle = [new OnePole(18000), new OnePole(18000)];
  const sirenF = new OnePole(2500), alarmF = new OnePole(3000);
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(40);
  let shI = 0;
  let cleared = false;
  const activeSh = [];

  let s = state(0);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    if (n % 48 === 0) s = state(t);
    const end = t >= 76.0;
    let l = 0, r = 0, wet = 0;

    // --- surf + gulls + crowd (the sea goes quiet when it draws back) ---
    const seaG = (0.16 + 0.1 * smooth(0, 2, t)) * (1 - smooth(41.5, 47, t)) * (end ? 0 : 1);
    const wash = surfLP2.run(surfLP.run(white())) * seaG * (0.7 + 0.3 * Math.sin(t * 0.4));
    let crash = 0;
    for (const c of crashes) {
      const dt = t - c.t;
      if (dt > 0 && dt < 4) crash += white() * c.g * Math.min(dt / 0.25, 1) * Math.exp(-dt * 1.2);
    }
    const cf = crashF.run(crash, 900, 0.7).lp * seaG * 1.6;
    l += wash + cf; r += wash * 0.9 + cf * 1.05;
    for (const g of gulls) {
      const dt = t - g.t;
      if (dt > 0 && dt < g.d) {
        const k = dt / g.d;
        ph[0] += (g.f * (1 - 0.35 * k) * (1 + 0.03 * Math.sin(dt * 70))) / SR;
        const v = (Math.sin(TAU * ph[0]) + 0.3 * Math.sin(TAU * ph[0] * 2.01)) * Math.sin(Math.PI * k) * g.g;
        l += v * (1 - g.pan) * 0.5; r += v * (1 + g.pan) * 0.5; wet += v * 0.4;
      }
    }
    const crowdG = 0.05 * smooth(0, 2, t) * (1 + 1.4 * smooth(T_IMPACT + 0.2, T_IMPACT + 1.2, t) * (1 - smooth(22, 28, t))
      + 2.0 * smooth(T_SHOCK + 1.5, T_SHOCK + 3, t) * (1 - smooth(T_SHOCK + 6, T_SHOCK + 10, t))
      + 1.6 * smooth(52, 54, t)) * (1 - smooth(60, 66, t)) * (end ? 0 : 1);
    if (crowdG > 0) {
      let cv = 0;
      for (let k = 0; k < 6; k++) {
        const amp = crowdEnv[k].run(Math.max(0, Math.sin(t * (2.1 + k * 0.7) + k * 1.3) + white() * 0.2));
        cv += crowd[k].run(white(), 380 + k * 210 + 120 * Math.sin(t * (1.1 + k * 0.3)), 0.25).bp * amp;
      }
      l += cv * crowdG; r += cv * crowdG * 0.95;
    }

    // --- warm pad until the streak appears, then a riser into a silent flash ---
    const padG = 0.06 * smooth(1, 6, t) * (1 - smooth(10, 14, t));
    if (padG > 0) {
      let pv = 0;
      [110, 138.59, 164.81, 220, 277.18].forEach((f, k) => { ph[2 + k] += f / SR; pv += saw(ph[2 + k]) * (k === 0 ? 0.8 : 0.5); });
      pv = padLP.run(pv) * padG;
      l += pv; r += pv; wet += pv * 0.8;
    }
    if (t > 10.5 && t < T_IMPACT) {
      const k = smooth(10.5, T_IMPACT, t);
      const rv = riserF.run(white(), 200 + 6000 * k * k, 0.3).bp * k * k * 0.4;
      ph[8] += (40 + 160 * k * k) / SR;
      const tone = Math.sin(TAU * ph[8]) * k * 0.25;
      l += rv + tone; r += rv + tone; wet += rv * 0.5;
    }
    // the flash is silent: everything musical cuts out, a thin high ring hangs in the air
    if (t > T_IMPACT && t < T_IMPACT + 5) {
      const dt = t - T_IMPACT;
      ph[9] += 3150 / SR;
      const v = Math.sin(TAU * ph[9]) * 0.02 * Math.exp(-dt * 0.7);
      l += v; r += v;
    }
    // ground shakes first (seismic waves outrun the air blast)
    const rumG = (0.5 * smooth(17.6, 18.4, t) * (1 - smooth(21, 25, t)) + 0.6 * smooth(62, T_ENGULF, t)) * (end ? 0 : 1);
    if (rumG > 0) {
      const rv = rumbleLP.run(white()) * 6 * rumG;
      l += rv; r += rv;
    }

    // --- countdown tension: low pulse + dark cluster ---
    const tensG = 0.06 * smooth(19, 24, t) * (1 - smooth(34.6, 35.0, t)) + 0.07 * smooth(39, 46, t) * (1 - smooth(72.5, T_ENGULF, t));
    if (tensG > 0) {
      let tv = 0;
      [55, 58.27, 82.41, 87.31].forEach((f, k) => { ph[12 + k] += f / SR; tv += saw(ph[12 + k]) * 0.5; });
      tv = tensLP.run(tv) * tensG;
      const rate = t < 35 ? 1.1 + 1.5 * smooth(19, 35, t) : 0.9 + 1.8 * smooth(40, 72, t);
      const pp = (t * rate) % 1;
      const thump = Math.sin(TAU * 50 * pp) * Math.exp(-pp * 16) * tensG * 3.2;
      l += tv + thump; r += tv + thump; wet += tv * 0.8;
    }

    // --- the shockwave: a crushing boom, shattering glass, ringing ears ---
    {
      const dt = t - T_SHOCK;
      if (dt > -0.02 && dt < 6) {
        const e = dt < 0 ? 0 : Math.min(dt / 0.008, 1) * Math.exp(-dt * 1.1);
        ph[16] += (28 + 50 * Math.exp(-dt * 5)) / SR;
        const boom = (Math.sin(TAU * ph[16]) * 1.2 + boomLP.run(white()) * 5) * e;
        const crack = white() * Math.exp(-Math.max(dt, 0) * 14) * (dt > 0 ? 0.9 : 0);
        l += boom + crack; r += boom + crack * 0.9; wet += boom * 0.4 + crack * 0.6;
      }
      while (shI < shards.length && shards[shI].t <= t) activeSh.push({ ...shards[shI++], age: 0 });
      for (let i = activeSh.length - 1; i >= 0; i--) {
        const c = activeSh[i];
        c.age += 1 / SR;
        if (c.age > 0.06) { activeSh.splice(i, 1); continue; }
        const v = Math.sin(TAU * c.f * c.age) * (0.5 + 0.5 * white()) * Math.exp(-c.age * 70) * c.g;
        l += v * (1 - c.pan) * 0.5; r += v * (1 + c.pan) * 0.5; wet += v * 0.3;
      }
      if (dt > 0.3 && dt < 7) {
        ph[17] += 4200 / SR;
        const ring = Math.sin(TAU * ph[17]) * 0.025 * smooth(0.3, 0.8, dt) * (1 - smooth(3, 7, dt));
        l += ring; r += ring;
      }
    }
    // car alarms after the blast
    if (t > T_SHOCK + 1.2 && t < 62) {
      const e = smooth(T_SHOCK + 1.2, T_SHOCK + 1.6, t) * (1 - smooth(56, 62, t)) * 0.016;
      const f = Math.floor(t * 2.4) % 2 ? 1450 : 1050;
      ph[18] += f / SR;
      const v = alarmF.run(Math.sign(Math.sin(TAU * ph[18]))) * e;
      l += v * 1.2; r += v * 0.6; wet += v;
    }
    // wind gust then steady wind
    const windG = 0.25 * Math.exp(-Math.max(t - T_SHOCK, 0) * 0.6) * (t > T_SHOCK ? 1 : 0) + 0.06 * smooth(T_SHOCK, 45, t) + 0.12 * smooth(60, 72, t);
    if (windG > 0 && !end) {
      const wfc = 420 + 200 * Math.sin(t * 0.33) + 90 * Math.sin(t * 1.1);
      l += windL.run(white(), wfc, 0.4).bp * windG * 1.3;
      r += windR.run(white(), wfc * 1.1, 0.4).bp * windG * 1.3;
    }

    // --- the sea draining away ---
    if (t > 41 && t < 56) {
      const e = smooth(41, 44, t) * (1 - smooth(50, 56, t)) * 0.12;
      const v = drainF.run(white(), 600 - 400 * smooth(41, 56, t), 0.5).lp * e;
      l += v; r += v * 0.9; wet += v * 0.5;
    }
    // tsunami warning siren
    if (t > 52.5 && t < 73) {
      const e = smooth(52.5, 54, t) * (1 - smooth(70, 73, t)) * 0.035;
      const cyc = ((t - 52.5) % 8) / 8;
      const f = 420 + 560 * Math.sin(Math.PI * cyc);
      ph[19] += f / SR;
      const v = sirenF.run(saw(ph[19]) * 0.6 + Math.sin(TAU * ph[19])) * e;
      l += v * 0.8; r += v; wet += v * 1.4;
    }

    // --- the wave: a growing roar, and braam hits ---
    const roarG = 0.05 * smooth(58, 62, t) + 0.5 * Math.pow(smooth(60, T_ENGULF, t), 2);
    if (roarG > 0 && t < T_ENGULF + 0.05) {
      const fc = 220 + 1800 * Math.pow(smooth(58, T_ENGULF, t), 1.5);
      l += roarL.run(white(), fc, 0.6).lp * roarG * 1.5;
      r += roarR.run(white(), fc * 1.05, 0.6).lp * roarG * 1.5;
    }
    let braam = 0;
    for (const [ht, hs, hf] of HITS) {
      const dt = t - ht;
      if (dt > -0.01 && dt < 7) {
        const e = (dt < 0.06 ? dt / 0.06 : Math.exp(-(dt - 0.06) / 1.9)) * hs;
        for (let k = 0; k < 4; k++) ph[24 + k] += (hf * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(ph[24]) + saw(ph[25]) + 0.5 * saw(ph[26]) + 0.25 * saw(ph[27])) * e;
      }
    }
    braam = braamLP.run(braam, 900, 0.6).lp * 0.15;
    l += braam; r += braam; wet += braam * 0.7;

    // --- underwater: everything goes muffled and dark ---
    const under = s.under;
    const cut = 18000 - 17600 * under;
    muffle[0].set(cut); muffle[1].set(cut);
    if (under > 0 && !end) {
      ph[30] += (60 + 20 * Math.sin(t * 3)) / SR;
      const uv = (rumbleLP.run(white()) * 3 + Math.sin(TAU * ph[30]) * 0.3) * under * (1 - smooth(75, 76, t)) * 0.6;
      l += uv; r += uv;
    }

    // --- end card ---
    if (t > 76.5) {
      const e = smooth(76.5, 78.2, t) * (1 - smooth(79.0, 80, t)) * 0.05;
      [110, 164.81, 220, 261.63].forEach((f, k) => { ph[32 + k] += f / SR; const v = Math.sin(TAU * ph[32 + k]) * [0.5, 0.35, 0.3, 0.2][k] * e; l += v; r += v; wet += v; });
    }

    if (end && !cleared) {
      // hard cut at the black frame: flush the reverb so no roar leaks into the end card
      for (const rv of [revL, revR]) { rv.combs.forEach((c) => { c.buf.fill(0); c.lp = 0; }); rv.aps.forEach((a) => a.buf.fill(0)); }
      cleared = true;
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    let ol = l + rl * 0.9, orr = r + rr * 0.9;
    if (!end) { ol = muffle[0].run(ol); orr = muffle[1].run(orr); }
    if (end && t < 76.5) { ol = 0; orr = 0; }
    L[n] = ol; R[n] = orr;
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.8); R[n] = Math.tanh(R[n] * 1.8);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  const fade = SR * 0.005;
  for (let n = 0; n < N; n++) {
    const f = Math.min(1, n / fade, (N - n) / fade);
    buf.writeInt16LE(Math.round(clamp(L[n] * g * f, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * g * f, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
