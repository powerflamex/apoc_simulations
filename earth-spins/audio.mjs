// Procedural soundtrack for "What if Earth spun 17 times faster?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// The rooftop at golden hour (pool water, voices, the city below); a pad whose brightness follows the daylight,
// so day and night breathe faster and faster; a low hum that climbs with the spin; the sea's rumble as it
// rises; a swell into weightlessness, water burbling as the pool lifts off, wind as you rise into the cloud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, V_FLOAT, T_SWITCH } from './src/timeline.js';
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
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 30), SR / 8) / SR);
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
  const N = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  // the video loops: synthesis starts LOOP seconds before the first frame; that lead-in becomes the end
  const N0 = Math.round(LOOP * SR);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(1717);
  const white = () => R0() * 2 - 1;

  // every sunrise and sunset (the Sun crossing the horizon), for the whooshes and the day pulses
  const sunrises = [], sunsets = [];
  {
    let prev = state(-1.5).sun[1];
    for (let v = -1.5; v < VIDEO_DURATION + 0.5; v += 0.004) {
      const u = state(v).sun[1];
      if (u > 0 && prev <= 0) sunrises.push(v);
      if (u <= 0 && prev > 0) sunsets.push(v);
      prev = u;
    }
  }
  const turns = [...sunrises, ...sunsets].sort((a, b) => a - b);
  const laughs = [];
  for (let t = -1; t < 30; t += 0.5 + R0() * 1.6) laughs.push({ t, f: 480 + R0() * 520, d: 0.12 + R0() * 0.2, pan: R0() * 1.6 - 0.8, g: 0.006 + R0() * 0.008 });
  const splashes = [];
  for (let t = -1; t < 44; t += 1.2 + R0() * 2.5) splashes.push({ t, g: 0.05 + R0() * 0.05, pan: R0() * 1.4 - 0.7 });
  const bloops = [];
  for (let i = 0; i < 70; i++) bloops.push({ t: V_FLOAT + R0() * 7, f: 260 + R0() * 700, d: 0.06 + R0() * 0.12, g: 0.02 + R0() * 0.03, pan: R0() * 1.6 - 0.8 });

  const lapLP = new OnePole(900), lapLP2 = new OnePole(500), splashF = new SVF();
  const crowd = Array.from({ length: 6 }, () => new SVF());
  const crowdEnv = Array.from({ length: 6 }, () => new OnePole(3));
  const cityLP = new OnePole(180), cityLP2 = new OnePole(120);
  const padLP = new OnePole(900), humLP = new OnePole(300), whooshF = new SVF();
  const rumbleLP = new OnePole(80), rumbleLP2 = new OnePole(60), sloshF = new SVF();
  const swellF = new SVF(), windF = new SVF(), windF2 = new SVF(), washLP = new OnePole(2000);
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(48);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    const day = s.day;
    const light = clamp(1 - s.g);                    // 0 normal .. 1 weightless
    const people = 1 - smooth(V_FLOAT - 2, V_FLOAT + 3, v);
    const cloud = s.cloud;
    let l = 0, r = 0, wet = 0;

    // --- the pool lapping, and the odd splash ---
    const lapG = 0.06 * (1 - smooth(V_FLOAT, V_FLOAT + 2, v)) * (1 + light * 0.8);
    const lap = lapLP2.run(lapLP.run(white())) * lapG * (0.6 + 0.4 * Math.sin(v * 1.7) * Math.sin(v * 0.6 + 1));
    l += lap; r += lap * 0.9;
    let sp = 0;
    for (const e of splashes) { const dt = v - e.t; if (dt > 0 && dt < 0.6) sp += white() * e.g * Math.exp(-dt * 9) * Math.min(dt / 0.01, 1); }
    const spv = splashF.run(sp, 1800, 0.6).bp;
    l += spv; r += spv * 0.8; wet += spv * 0.4;

    // --- voices on the deck: chatter and laughter, thinning as everyone stares at the sky, gone when they float ---
    const crowdG = 0.04 * people * (1 - 0.5 * smooth(6, 20, v)) * (1 - cloud);
    if (crowdG > 0.0005) {
      let cv = 0;
      for (let k = 0; k < 6; k++) {
        const amp = crowdEnv[k].run(Math.max(0, Math.sin(v * (2.1 + k * 0.7) + k * 1.3) + white() * 0.2));
        cv += crowd[k].run(white(), 380 + k * 210 + 120 * Math.sin(v * (1.1 + k * 0.3)), 0.25).bp * amp;
      }
      l += cv * crowdG; r += cv * crowdG * 0.95; wet += cv * crowdG * 0.3;
    }
    for (const b of laughs) {
      const dt = v - b.t;
      if (dt > 0 && dt < b.d) {
        const k = dt / b.d;
        ph[1] += b.f * (1 + 0.25 * Math.sin(dt * 38)) / SR;
        const x = (Math.sin(TAU * ph[1]) * 0.6 + Math.sin(TAU * ph[1] * 2.0) * 0.3 + Math.sin(TAU * ph[1] * 3.0) * 0.1) * Math.sin(Math.PI * k) * b.g;
        l += x * (1 - b.pan) * 0.5; r += x * (1 + b.pan) * 0.5; wet += x * 0.5;
      }
    }

    // --- the city far below: a low hum of traffic, gone once the streets flood ---
    const cityG = 0.05 * (1 - smooth(19, 26, v));
    if (cityG > 0) { const c = cityLP2.run(cityLP.run(white())) * cityG * 3; l += c; r += c; }

    // --- the pad: a warm chord whose brightness follows the daylight; a soft whoosh at every sunrise and sunset ---
    const padG = 0.06 * (1 - smooth(V_FLOAT + 1, V_FLOAT + 6, v)) * (1 - cloud);
    if (padG > 0) {
      let pv = 0;
      [146.83, 220.0, 277.18, 329.63, 440.0].forEach((f, k) => { ph[2 + k] += f * (1 + 0.0015 * k) / SR; pv += saw(ph[2 + k]) * (k === 0 ? 0.8 : 0.45); });
      padLP.set(260 + 2200 * day * day + 500 * s.twilight);
      pv = padLP.run(pv) * padG * (0.55 + 0.45 * day);
      l += pv; r += pv; wet += pv * 0.8;
    }
    let wh = 0;
    for (const tt of turns) { const dt = v - tt; if (dt > -0.6 && dt < 0.6) wh += Math.exp(-Math.pow(dt / 0.22, 2)); }
    if (wh > 0.001) {
      const wv = whooshF.run(white(), 500 + 2500 * clamp(wh), 0.7).bp * wh * 0.05 * (1 - cloud);
      l += wv; r += wv * 0.9; wet += wv * 0.5;
    }
    // a soft low pulse at each new sunrise: the days arrive faster and faster
    for (const sr of sunrises) {
      const dt = v - sr;
      if (dt > 0 && dt < 0.9) {
        ph[8] += (52 + 22 * Math.exp(-dt * 9)) / SR;
        const b = Math.sin(TAU * ph[8]) * Math.exp(-dt * 6) * 0.07 * (1 - smooth(V_FLOAT - 2, V_FLOAT, v));
        l += b; r += b;
      }
    }

    // --- the spin: a low hum that climbs with Earth's speed ---
    const humG = 0.07 * smooth(2.5, 10, v) * (1 - smooth(V_FLOAT, V_FLOAT + 4, v)) * (1 - cloud);
    if (humG > 0) {
      const f0 = 41.2 * (1 + 0.42 * Math.log2(s.k));
      let hv = 0;
      [1, 1.5, 2, 3].forEach((m, k) => { ph[12 + k] += f0 * m * (1 + 0.003 * k) / SR; hv += saw(ph[12 + k]) * [0.9, 0.5, 0.4, 0.2][k]; });
      humLP.set(140 + 700 * smooth(5, V_FLOAT, v));
      hv = humLP.run(hv) * humG;
      l += hv; r += hv; wet += hv * 0.4;
    }

    // --- the sea rising: a deep rumble and water churning through the streets ---
    const seaG = smooth(16, 24, v) * (1 - smooth(V_FLOAT + 2, V_FLOAT + 7, v));
    if (seaG > 0) {
      const ru = rumbleLP2.run(rumbleLP.run(white())) * seaG * 0.9;
      const sl = sloshF.run(white(), 420 + 260 * Math.sin(v * 0.9), 0.5).bp * seaG * 0.05 * (0.6 + 0.4 * Math.sin(v * 1.3) * Math.sin(v * 0.47));
      l += ru + sl; r += ru * 0.95 + sl * 1.1; wet += sl * 0.3;
    }

    // --- into weightlessness: a rising swell, then a bright chord as everything lets go ---
    const swellG = smooth(V_FLOAT - 5, V_FLOAT, v) * (1 - smooth(V_FLOAT, V_FLOAT + 0.6, v));
    if (swellG > 0) { const sw = swellF.run(white(), 300 + 4000 * swellG * swellG, 0.6).bp * swellG * 0.12; l += sw; r += sw; wet += sw * 0.6; }
    const bloomG = smooth(V_FLOAT - 0.2, V_FLOAT + 0.8, v) * (1 - smooth(60, T_SWITCH, v)) * 0.055;
    if (bloomG > 0) {
      let bv = 0;
      [293.66, 369.99, 440.0, 554.37, 659.25, 880.0].forEach((f, k) => { ph[20 + k] += f * (1 + 0.004 * Math.sin(v * 0.7 + k)) / SR; bv += Math.sin(TAU * ph[20 + k]) * [0.5, 0.4, 0.35, 0.3, 0.25, 0.15][k]; });
      bv *= bloomG;
      l += bv; r += bv; wet += bv * 1.2;
    }
    for (const b of bloops) {   // the pool's water burbling as it lifts off in blobs
      const dt = v - b.t;
      if (dt > 0 && dt < b.d) {
        const k = dt / b.d;
        ph[30] += b.f * (1 + 1.2 * k) / SR;
        const x = Math.sin(TAU * ph[30]) * Math.sin(Math.PI * k) * b.g;
        l += x * (1 - b.pan) * 0.5; r += x * (1 + b.pan) * 0.5; wet += x * 0.6;
      }
    }

    // --- wind as you rise, turning into the soft roar inside the cloud ---
    const windG = smooth(V_FLOAT + 1, 58, v) * 0.09;
    if (windG > 0) {
      const w1 = windF.run(white(), 500 + 900 * smooth(55, 62, v) + 200 * Math.sin(v * 0.8), 0.4).bp;
      const w2 = windF2.run(white(), 1600 + 400 * Math.sin(v * 1.3), 0.6).bp;
      l += (w1 + w2 * 0.4) * windG; r += (w1 * 0.9 + w2 * 0.5) * windG;
    }
    if (cloud > 0) { const cw = washLP.run(white()) * cloud * 0.07; l += cw; r += cw * 0.97; wet += cw * 0.3; }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    if (n < 0) { PL[n + N0] = l + rl * 0.9; PR[n + N0] = r + rr * 0.9; } else { L[n] = l + rl * 0.9; R[n] = r + rr * 0.9; }
  }

  {   // inside the cloud's white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.25 * SR);
    for (let i = 0; i < N0; i++) {
      const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
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
  for (let n = 0; n < N; n++) {   // no fade at the ends: they join up when the video loops
    buf.writeInt16LE(Math.round(clamp(L[n] * g, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * g, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
