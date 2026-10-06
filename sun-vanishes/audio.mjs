// Procedural soundtrack for "What if the Sun suddenly vanished?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, DURATION, T_DARK, GRID, gridBrown, STORY_START, T_SWITCH, LOOP } from './src/timeline.js';
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
  const R0 = rng(7);
  const white = () => R0() * 2 - 1;

  // scheduled one-shots
  const gulls = [];
  for (let t = 0.4; t < 24; t += 0.18 + R0() * 1.1) gulls.push({ t, f: 2900 + R0() * 1500, d: 0.06 + R0() * 0.09, pan: R0() * 2 - 1, g: 0.012 + R0() * 0.018 });
  for (let i = 0; i < 6; i++) gulls.push({ t: 24.4 + R0() * 2.2, f: 1900 + R0() * 500, d: 0.25, pan: R0() * 2 - 1, g: 0.05 });
  const crashes = [];
  for (let t = 0.3; t < 60; t += 2.2 + R0() * 1.8) crashes.push({ t, g: 0.15 + R0() * 0.12 });
  const bells = [2.6, 5.1, 7.6, 10.1, 12.6, 15.1];
  // cowbells from the pasture (right), a steamer horn on the lake, a train horn on the far shore
  const cowbells = [];
  for (let t = 0.6; t < 31; t += 0.25 + R0() * 1.4) cowbells.push({ t, f: 520 + R0() * 260, g: (0.006 + R0() * 0.01) * (t > 24 ? 0.5 : 1), pan: 0.3 + R0() * 0.6 });
  const toots = [[8.6, 2.4, [146.8, 220.0], 0.03], [17.2, 0.7, [329.6, 415.3], 0.01], [18.1, 1.1, [329.6, 415.3], 0.01]];
  const horns = [[29.2, 392, -0.5], [29.9, 349, 0.4], [30.6, 440, -0.2], [31.8, 415, 0.6], [32.5, 392, -0.6], [33.4, 466, 0.2]];
  const pews = [];
  for (let i = 0; i < 26; i++) pews.push({ t: 57 + Math.pow(R0(), 0.8) * 15, f: 1800 + R0() * 2200, g: 0.04 + R0() * 0.05, pan: R0() * 2 - 1 });
  const booms = [];
  for (let i = 0; i < 7; i++) booms.push({ t: 58 + R0() * 14, g: 0.25 + R0() * 0.25 });
  const crackles = [];
  for (let i = 0; i < 900; i++) crackles.push({ t: 49.8 + R0() * 16.5, g: 0.02 + R0() * 0.05 * R0(), pan: R0() * 2 - 1 });
  crackles.sort((a, b) => a.t - b.t);
  // the lens ice cracks: ticks that come faster and faster until it shatters at T_SWITCH (own random stream)
  const RC = rng(4242), noise = () => RC() * 2 - 1;
  const ticks = [];
  for (let t = 75.45; t < T_SWITCH; t += 0.012 + RC() * 0.07 * (1 - (t - 75.45) / (T_SWITCH - 75.45))) {
    ticks.push({ t, g: 0.05 + RC() * 0.12, f: 2500 + RC() * 4500, pan: RC() * 1.6 - 0.8 });
  }
  // relays clunking out as the grid goes down, far shore first (quiet, distant) to near (loud)
  const clunks = [[47.3, 0.04, -0.6], [47.7, 0.05, 0.5], [48.1, 0.06, -0.2], [48.5, 0.08, 0.7], [48.85, 0.1, -0.5], [49.2, 0.12, 0.2], [49.5, 0.15, 0.0]];

  const surfLP = new OnePole(600), surfLP2 = new OnePole(450), crashF = new SVF();
  const crowd = Array.from({ length: 6 }, () => new SVF());
  const crowdEnv = Array.from({ length: 6 }, () => new OnePole(3));
  const windL = new SVF(), windR = new SVF(), whistle = new SVF();
  const padLP = new OnePole(900), droneLP = new OnePole(500), riserF = new SVF(), sirenF = new OnePole(3000);
  const revL = new Reverb(1), revR = new Reverb(2);
  const hornLP = new OnePole(700);
  const ph = new Float64Array(48);
  const humLP = new OnePole(320);
  let crI = 0;
  const activeCr = [];

  let s = state(0);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    if (n % 48 === 0) s = state(t);
    const end = t >= 76.0;
    let l = 0, r = 0, wet = 0;
    for (const k of ticks) {
      const dt = t - k.t;
      if (dt > 0 && dt < 0.03) {
        const v = (noise() * Math.exp(-dt * 400) + Math.sin(TAU * k.f * dt) * Math.exp(-dt * 160) * 0.6) * k.g;
        l += v * (1 - k.pan) * 0.5; r += v * (1 + k.pan) * 0.5; wet += v * 0.6;
      }
    }

    // --- surf: steady wash + a crash every few seconds; dies away as the sea freezes ---
    const seaG = (0.16 + 0.1 * smooth(0, 2, t)) * s.waves * (end ? 0 : 1);
    const wash = surfLP2.run(surfLP.run(white())) * seaG * 0.45 * (0.7 + 0.3 * Math.sin(t * 0.4));
    for (const bt of bells) {
      const dt = t - bt;
      if (dt > 0 && dt < 6) {
        let bv = 0;
        [[0.5, 0.5], [1, 1], [1.19, 0.6], [1.5, 0.45], [2, 0.35], [2.52, 0.25], [3.01, 0.15]].forEach(([m, a], k) => { ph[28 + k] += (196 * m) / SR; bv += Math.sin(TAU * ph[28 + k]) * a * Math.exp(-dt * (0.6 + k * 0.25)); });
        bv *= 0.035 * Math.min(dt / 0.004, 1);
        l += bv * 0.8; r += bv; wet += bv * 1.5;
      }
    }
    let crash = 0;
    for (const c of crashes) {
      const dt = t - c.t;
      if (dt > 0 && dt < 4) crash += white() * c.g * Math.min(dt / 0.25, 1) * Math.exp(-dt * 1.2);
    }
    const cf = crashF.run(crash, 700 + 900 * Math.exp(-((t * 0.2) % 1)), 0.7).lp * seaG * 1.6;
    l += wash + cf; r += wash * 0.9 + cf * 1.05;

    // --- cowbells: dull inharmonic clanks ---
    for (const b of cowbells) {
      const dt = t - b.t;
      if (dt > 0 && dt < 0.6) {
        let v = 0;
        [[1, 1], [2.32, 0.5], [3.9, 0.3], [5.4, 0.15]].forEach(([m, a]) => { v += Math.sin(TAU * b.f * m * dt) * a * Math.exp(-dt * (7 + m * 3)); });
        v *= b.g * Math.min(dt / 0.002, 1);
        l += v * (1 - b.pan) * 0.5; r += v * (1 + b.pan) * 0.5; wet += v * 0.6;
      }
    }
    for (const [ht, hd, fs, hg] of toots) {
      const dt = t - ht;
      if (dt > 0 && dt < hd) {
        let v = 0;
        fs.forEach((f, k) => { ph[36 + k] += f / SR; v += saw(ph[36 + k]) * 0.5 + Math.sin(TAU * ph[36 + k]) * 0.5; });
        v = hornLP.run(v) * hg * Math.min(dt / 0.08, 1) * Math.min((hd - dt) / 0.3, 1);
        l += v * 0.6; r += v * 0.4; wet += v * 2.0;
      }
    }

    // --- gulls ---
    for (const g of gulls) {
      const dt = t - g.t;
      if (dt > 0 && dt < g.d) {
        const k = dt / g.d;
        const f = g.f * (1 - 0.35 * k) * (1 + 0.03 * Math.sin(dt * 70));
        ph[0] += f / SR;
        const e = Math.sin(Math.PI * k) * g.g;
        const v = (Math.sin(TAU * ph[0]) + 0.3 * Math.sin(TAU * ph[0] * 2.01)) * e;
        l += v * (1 - g.pan) * 0.5; r += v * (1 + g.pan) * 0.5; wet += v * 0.4;
      }
    }

    // --- crowd murmur: swells into a gasp at the blackout, thins as people leave ---
    const crowdG = 0.05 * smooth(0, 2, t) * (1 + 1.6 * smooth(T_DARK + 0.3, T_DARK + 1.5, t) * (1 - smooth(30, 34, t)) + 0.5 * smooth(28, 32, t)) * (1 - s.leave) * (end ? 0 : 1);
    if (crowdG > 0) {
      let cv = 0;
      for (let k = 0; k < 6; k++) {
        const amp = crowdEnv[k].run(Math.max(0, Math.sin(t * (2.1 + k * 0.7) + k * 1.3) + white() * 0.2));
        cv += crowd[k].run(white(), 380 + k * 210 + 120 * Math.sin(t * (1.1 + k * 0.3)), 0.25).bp * amp;
      }
      l += cv * crowdG; r += cv * crowdG * 0.95;
    }

    // --- warm pad (D major) through the countdown; cut dead at the blackout ---
    const padG = 0.07 * smooth(1, 7, t) * (t < T_DARK ? 1 : 0);
    if (padG > 0) {
      const ch = [146.83, 185.0, 220.0, 293.66, 329.63];
      let pv = 0;
      ch.forEach((f, k) => { ph[2 + k] += f / SR; pv += saw(ph[2 + k]) * (k === 0 ? 0.8 : 0.5); });
      pv = padLP.run(pv) * padG;
      l += pv; r += pv; wet += pv * 0.8;
    }
    // heartbeat-like pulse that tightens toward the moment
    if (t > 6 && t < T_DARK) {
      const rate = 0.8 + 1.4 * smooth(6, T_DARK, t);
      const pp = (t * rate) % 1;
      const thump = Math.sin(TAU * 52 * pp) * Math.exp(-pp * 18) * 0.25 * smooth(6, 12, t);
      l += thump; r += thump;
    }
    // reverse swell into the blackout
    if (t > T_DARK - 3.5 && t < T_DARK) {
      const k = smooth(T_DARK - 3.5, T_DARK, t);
      const rv = riserF.run(white(), 300 + 5000 * k * k, 0.3).bp * k * k * 0.35;
      l += rv; r += rv;
    }
    // the blackout: a deep drop
    {
      const dt = t - T_DARK;
      if (dt > 0 && dt < 5) {
        ph[8] += (38 + 30 * Math.exp(-dt * 3)) / SR;
        const b = Math.sin(TAU * ph[8]) * Math.exp(-dt * 0.9) * 0.6;
        l += b; r += b; wet += b * 0.3;
      }
    }

    // --- cold drone after dark (D minor), getting thinner and higher over the year ---
    const drG = 0.075 * smooth(T_DARK + 1.5, T_DARK + 6, t) * (1 - smooth(72, 75.8, t)) * (end ? 0 : 1);
    if (drG > 0) {
      const ch = [73.42, 110.0, 146.83, 174.61, 220.0];
      const thin = smooth(50, 72, t);
      let dv = 0;
      ch.forEach((f, k) => {
        ph[10 + k] += (f * (1 + 0.002 * k)) / SR;
        const x = ph[10 + k];
        dv += (saw(x) * (1 - thin) + Math.sin(TAU * x) * thin) * (k === 0 ? 0.8 * (1 - thin * 0.7) : 0.5);
      });
      droneLP.set(350 + 900 * thin);
      dv = droneLP.run(dv) * drG;
      l += dv; r += dv; wet += dv * 0.9;
    }

    // --- panic: horns + a distant siren ---
    for (const [ht, hf, hp] of horns) {
      const dt = t - ht;
      if (dt > 0 && dt < 0.8) {
        ph[16] += hf / SR;
        const v = (saw(ph[16]) * 0.5 + saw(ph[16] * 1.5) * 0.3) * Math.min(dt / 0.02, 1) * Math.min((0.8 - dt) / 0.1, 1) * 0.02;
        l += v * (1 - hp) * 0.5; r += v * (1 + hp) * 0.5; wet += v * 0.5;
      }
    }
    if (t > 30 && t < 46) {
      const e = smooth(30, 32, t) * (1 - smooth(42, 46, t)) * 0.03;
      const f = 900 + 350 * Math.sin(t * 1.3);
      ph[17] += f / SR;
      const v = sirenF.run(saw(ph[17])) * e;
      l += v * 0.7; r += v * 1.1; wet += v;
    }

    // --- the grid fails: a mains hum swells, sags and stutters with the brownout, then dies as the relays clunk out ---
    if (t > 43.5 && t < GRID.t0 + GRID.span + 0.6) {
      const down = smooth(GRID.t0, GRID.t0 + GRID.span + 0.5, t);
      const g = 0.03 * smooth(43.5, 46.0, t) * gridBrown(t) * (1 - down);
      ph[40] += (50 * (1 - 0.4 * down)) / SR;
      const v = humLP.run(saw(ph[40]) + 0.5 * saw(ph[40] * 2)) * g;
      l += v; r += v; wet += v * 0.3;
    }
    for (const [ct, cg, cp] of clunks) {
      const dt = t - ct;
      if (dt > 0 && dt < 0.4) {
        ph[41] += (70 + 60 * Math.exp(-dt * 30)) / SR;
        const v = (Math.sin(TAU * ph[41]) * Math.exp(-dt * 14) + white() * Math.exp(-dt * 120) * 0.6) * cg;
        l += v * (1 - cp) * 0.5; r += v * (1 + cp) * 0.5; wet += v * 0.8;
      }
    }

    // --- wind: picks up through the cold, with a thin whistle ---
    const windG = (0.03 + 0.2 * smooth(36, 62, t)) * (1 - smooth(71, 75.8, t)) * (end ? 0 : 1);
    const wfc = 380 + 300 * smooth(36, 66, t) + 140 * Math.sin(t * 0.33) + 70 * Math.sin(t * 1.1);
    l += windL.run(white(), wfc, 0.4).bp * windG * 1.3;
    r += windR.run(white(), wfc * 1.1, 0.4).bp * windG * 1.3;
    const wh = whistle.run(white(), 1100 + 300 * Math.sin(t * 0.21), 0.04).bp * windG * 0.12 * smooth(45, 60, t);
    l += wh; r += wh * 0.8;

    // --- fire crackle ---
    while (crI < crackles.length && crackles[crI].t <= t) activeCr.push({ ...crackles[crI++], age: 0 });
    for (let i = activeCr.length - 1; i >= 0; i--) {
      const c = activeCr[i];
      c.age += 1 / SR;
      if (c.age > 0.02) { activeCr.splice(i, 1); continue; }
      const v = white() * Math.exp(-c.age * 400) * c.g;
      l += v * (1 - c.pan) * 0.5; r += v * (1 + c.pan) * 0.5;
    }

    // --- singing sea ice: dispersive "pew" chirps and deep booms ---
    for (const p of pews) {
      const dt = t - p.t;
      if (dt > 0 && dt < 0.5) {
        const f = p.f * Math.exp(-dt * 14) + 180;
        ph[20] += f / SR;
        const v = Math.sin(TAU * ph[20]) * Math.exp(-dt * 9) * p.g;
        l += v * (1 - p.pan) * 0.5; r += v * (1 + p.pan) * 0.5; wet += v * 1.2;
      }
    }
    for (const b of booms) {
      const dt = t - b.t;
      if (dt > 0 && dt < 2) {
        ph[21] += (45 + 20 * Math.exp(-dt * 6)) / SR;
        const v = Math.sin(TAU * ph[21]) * Math.exp(-dt * 2.2) * b.g * Math.min(dt / 0.01, 1);
        l += v; r += v; wet += v * 0.5;
      }
    }

    // --- the end: one glassy tone as the frost closes in ---
    if (t > 68 && !end) {
      const e = smooth(68, 71, t) * (1 - smooth(74.5, 75.9, t)) * 0.03;
      ph[22] += 1318.5 / SR; ph[23] += 1975.5 / SR;
      const v = (Math.sin(TAU * ph[22]) + 0.5 * Math.sin(TAU * ph[23])) * e * (0.8 + 0.2 * Math.sin(t * 5));
      l += v; r += v; wet += v * 1.5;
    }
    if (t > 76.5) {
      const e = smooth(76.5, 78.2, t) * (1 - smooth(79.0, 80, t)) * 0.05;
      [146.83, 220.0, 293.66, 349.23].forEach((f, k) => { ph[24 + k] += f / SR; const v = Math.sin(TAU * ph[24 + k]) * [0.5, 0.35, 0.3, 0.2][k] * e; l += v; r += v; wet += v; });
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    L[n] = l + rl * 0.9; R[n] = r + rr * 0.9;
  }

  // the video loops: from T_SWITCH on (under the ice) the soundtrack becomes what plays just before the first
  // frame, so the end runs straight into the start; the shatter rings out on top and dies before the loop point
  {
    const a = Math.round(T_SWITCH * SR), b = Math.round((STORY_START - LOOP) * SR), n = Math.round(LOOP * SR), xf = Math.round(0.15 * SR);
    const pings = [];
    for (let i = 0; i < 46; i++) pings.push({ t: Math.pow(RC(), 1.6) * 0.55, f: 2200 + RC() * 5200, g: 0.02 + RC() * 0.05, d: 0.04 + RC() * 0.16, pan: RC() * 2 - 1 });
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const t = i / SR, die = 1 - smooth(0.55, 0.85, t / LOOP);
      const w = noise(), burst = (w - prev) * Math.exp(-t * 14) * 0.22 * die;   // bright crunch
      prev = w;
      let fl = burst, fr = burst;
      for (const p of pings) {
        const dt = t - p.t;
        if (dt > 0 && dt < p.d * 6) { const v = Math.sin(TAU * p.f * dt) * Math.exp(-dt / p.d) * p.g * die; fl += v * (1 - p.pan) * 0.5; fr += v * (1 + p.pan) * 0.5; }
      }
      L[a + i] = L[a + i] * wo + L[b + i] * wi + fl;
      R[a + i] = R[a + i] * wo + R[b + i] * wi + fr;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 2.1); R[n] = Math.tanh(R[n] * 2.1);
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
