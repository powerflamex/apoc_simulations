// Procedural soundtrack for "What if Earth stopped orbiting the Sun?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, DURATION } from './src/timeline.js';
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
  const R0 = rng(65);
  const white = () => R0() * 2 - 1;

  // scheduled one-shots
  const gulls = [];
  for (let t = 0.3; t < 24; t += 0.2 + R0() * 1.3) gulls.push({ t, f: 2700 + R0() * 1500, d: 0.07 + R0() * 0.1, pan: R0() * 2 - 1, g: 0.012 + R0() * 0.016 });
  const crashes = [];
  for (let t = 0.2; t < 58; t += 3.0 + R0() * 2.2) crashes.push({ t, g: 0.16 + R0() * 0.12 });
  const laughs = [];   // bright little vocal blips from the beach (kids, a volleyball game)
  for (let t = 0.5; t < 21; t += 0.5 + R0() * 1.8) laughs.push({ t, f: 500 + R0() * 500, d: 0.12 + R0() * 0.2, pan: R0() * 1.6 - 0.8, g: 0.006 + R0() * 0.008 });
  const dayHits = [18.5, 23, 28, 32.8, 37.6, 42.4, 47.4, 52.2];   // a pulse as each new day comes up on the counter
  const crackles = [];
  for (let i = 0; i < 1800; i++) crackles.push({ t: 38 + R0() * 23.5, g: 0.02 + R0() * 0.06 * R0(), pan: R0() * 2 - 1 });
  crackles.sort((a, b) => a.t - b.t);

  const surfLP = new OnePole(600), surfLP2 = new OnePole(450), crashF = new SVF();
  const crowd = Array.from({ length: 6 }, () => new SVF());
  const crowdEnv = Array.from({ length: 6 }, () => new OnePole(3));
  const padLP = new OnePole(900), droneLP = new OnePole(400), hissF = new SVF(), roarF = new SVF(), roarLP = new OnePole(300);
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(48);
  let crI = 0;
  const activeCr = [];

  let s = state(0);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    if (n % 48 === 0) s = state(t);
    const end = t >= 62.2;
    let l = 0, r = 0, wet = 0;

    // --- surf: steady wash + a crash every few seconds; turns into a seething boil later ---
    const seaG = (0.15 + 0.06 * smooth(0, 1, t)) * (end ? 0 : 1) * (1 - 0.5 * s.boil);
    const wash = surfLP2.run(surfLP.run(white())) * seaG * 0.45 * (0.7 + 0.3 * Math.sin(t * 0.4));
    let crash = 0;
    for (const c of crashes) {
      const dt = t - c.t;
      if (dt > 0 && dt < 4) crash += white() * c.g * Math.min(dt / 0.25, 1) * Math.exp(-dt * 1.2);
    }
    const cf = crashF.run(crash, 700 + 900 * Math.exp(-((t * 0.2) % 1)), 0.7).lp * seaG * 1.6;
    l += wash + cf; r += wash * 0.9 + cf * 1.05;

    // --- gulls and the beach crowd, thinning out as people leave ---
    for (const g of gulls) {
      const dt = t - g.t;
      if (dt > 0 && dt < g.d) {
        const k = dt / g.d;
        const f = g.f * (1 - 0.35 * k) * (1 + 0.03 * Math.sin(dt * 70));
        ph[0] += f / SR;
        const v = (Math.sin(TAU * ph[0]) + 0.3 * Math.sin(TAU * ph[0] * 2.01)) * Math.sin(Math.PI * k) * g.g;
        l += v * (1 - g.pan) * 0.5; r += v * (1 + g.pan) * 0.5; wet += v * 0.4;
      }
    }
    for (const b of laughs) {
      const dt = t - b.t;
      if (dt > 0 && dt < b.d) {
        const k = dt / b.d;
        ph[1] += b.f * (1 + 0.25 * Math.sin(dt * 38)) / SR;
        const v = (Math.sin(TAU * ph[1]) * 0.6 + Math.sin(TAU * ph[1] * 2.0) * 0.3 + Math.sin(TAU * ph[1] * 3.0) * 0.1) * Math.sin(Math.PI * k) * b.g;
        l += v * (1 - b.pan) * 0.5; r += v * (1 + b.pan) * 0.5; wet += v * 0.5;
      }
    }
    const crowdG = 0.045 * smooth(0, 1.5, t) * s.crowd * (end ? 0 : 1);
    if (crowdG > 0.0005) {
      let cv = 0;
      for (let k = 0; k < 6; k++) {
        const amp = crowdEnv[k].run(Math.max(0, Math.sin(t * (2.1 + k * 0.7) + k * 1.3) + white() * 0.2));
        cv += crowd[k].run(white(), 380 + k * 210 + 120 * Math.sin(t * (1.1 + k * 0.3)), 0.25).bp * amp;
      }
      l += cv * crowdG; r += cv * crowdG * 0.95;
    }

    // --- warm major pad over the opening; it bends flat when Earth stops and fades into the fall ---
    const padG = 0.065 * smooth(0, 2, t) * (1 - smooth(14, 20, t));
    if (padG > 0) {
      const bend = 1 - 0.06 * smooth(5.6, 8, t);
      let pv = 0;
      [146.83, 185.0, 220.0, 293.66, 369.99].forEach((f, k) => { ph[2 + k] += (f * (k === 1 || k === 4 ? bend : 1)) / SR; pv += saw(ph[2 + k]) * (k === 0 ? 0.8 : 0.5); });
      pv = padLP.run(pv) * padG;
      l += pv; r += pv; wet += pv * 0.8;
    }
    // the stop: a deep hit and a breath of silence
    {
      const dt = t - 5.6;
      if (dt > 0 && dt < 5) {
        ph[8] += (36 + 26 * Math.exp(-dt * 3)) / SR;
        const b = Math.sin(TAU * ph[8]) * Math.exp(-dt * 0.8) * 0.55;
        l += b; r += b; wet += b * 0.3;
      }
    }

    // --- the fall: a low drone that rises in pitch and grows, with a heartbeat pulse at each new day ---
    const drG = 0.08 * smooth(12, 18, t) * (1 - smooth(61, 62.2, t));
    if (drG > 0) {
      const rise = 1 + 0.5 * smooth(16, 58, t);
      let dv = 0;
      [55.0, 82.41, 110.0, 130.81, 164.81].forEach((f, k) => { ph[12 + k] += (f * rise * (1 + 0.002 * k)) / SR; dv += saw(ph[12 + k]) * (k === 0 ? 0.9 : 0.5); });
      droneLP.set(250 + 1400 * smooth(16, 58, t));
      dv = droneLP.run(dv) * drG;
      l += dv; r += dv; wet += dv * 0.8;
    }
    for (const dh of dayHits) {
      const dt = t - dh;
      if (dt > 0 && dt < 1.2) {
        ph[20] += (48 + 20 * Math.exp(-dt * 8)) / SR;
        const v = Math.sin(TAU * ph[20]) * (Math.exp(-dt * 6) + 0.5 * Math.exp(-Math.max(dt - 0.28, 0) * 6) * (dt > 0.28 ? 1 : 0)) * 0.32;
        l += v; r += v;
      }
    }

    // --- heat: a hiss of steam once the sea boils, a roar building to the white-out ---
    const hissG = 0.05 * s.boil * (end ? 0 : 1);
    if (hissG > 0) { const hv = hissF.run(white(), 4200 + 800 * Math.sin(t * 0.7), 0.5).bp * hissG; l += hv; r += hv * 0.9; }
    const roarG = (0.04 * smooth(30, 50, t) + 0.25 * smooth(50, 61.8, t)) * (end ? 0 : 1);
    if (roarG > 0) { const rv = roarLP.run(roarF.run(white(), 180 + 500 * smooth(40, 60, t), 0.4).lp) * roarG * 2.5; l += rv; r += rv * 0.95; wet += rv * 0.3; }
    while (crI < crackles.length && crackles[crI].t <= t) activeCr.push({ ...crackles[crI++], age: 0 });
    for (let i = activeCr.length - 1; i >= 0; i--) {
      const c = activeCr[i];
      c.age += 1 / SR;
      if (c.age > 0.02) { activeCr.splice(i, 1); continue; }
      const v = white() * Math.exp(-c.age * 400) * c.g * (end ? 0 : 1);
      l += v * (1 - c.pan) * 0.5; r += v * (1 + c.pan) * 0.5;
    }

    // --- end card: a quiet chord ---
    if (t > 62.6) {
      const e = smooth(62.6, 64.0, t) * (1 - smooth(65, DURATION, t)) * 0.05;
      [146.83, 220.0, 293.66, 369.99].forEach((f, k) => { ph[24 + k] += f / SR; const v = Math.sin(TAU * ph[24 + k]) * [0.5, 0.35, 0.3, 0.2][k] * e; l += v; r += v; wet += v; });
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    L[n] = l + rl * 0.9; R[n] = r + rr * 0.9;
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 2.1); R[n] = Math.tanh(R[n] * 2.1);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
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
