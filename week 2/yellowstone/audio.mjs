// Procedural soundtrack for "What if Yellowstone erupted?", synced to src/timeline.js (story time).
//   node audio.mjs  -> out/soundtrack.wav
// No sharp clicks or crackles anywhere (they read as "plastic breaking"): every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, DURATION, T_SHOCK, T_BOOM, T_FLOW, T_ARRIVE, GRID, gridBrown, STORY_START, T_SWITCH, LOOP, BOLTS } from './src/timeline.js';
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
  const birds = [];
  for (let t = 0.4; t < 24.5; t += 0.2 + R0() * 1.2) birds.push({ t, f: 2600 + R0() * 1800, d: 0.05 + R0() * 0.08, pan: R0() * 2 - 1, g: 0.008 + R0() * 0.012 });
  const cowbells = [];
  for (let t = 0.6; t < 34; t += 0.3 + R0() * 1.4) cowbells.push({ t, f: 520 + R0() * 260, g: (0.005 + R0() * 0.008) * (t > T_SHOCK ? 0.5 : 1), pan: 0.3 + R0() * 0.6 });
  // car horns as people flee, then a siren
  const horns = [[34.4, 392, -0.5], [35.1, 349, 0.4], [36.0, 440, -0.2], [37.3, 415, 0.6], [38.1, 392, -0.6], [40.2, 466, 0.2], [43.5, 370, -0.3]];
  // thunder: only for lightning overhead (the column's lightning is too far away to hear), arriving 1-4 s later
  const thunder = BOLTS.filter((b) => b[0] > 37).map((b) => ({ t: b[0] + 1 + b[4] * 3, g: 0.12 + 0.18 * b[3] * (1 - b[4] * 0.5), pan: b[1] * 8 }));
  // roofs caving in: a soft creak and a low thud each
  const caves = [];
  for (let k = 0; k < 10; k++) caves.push({ t: 53.3 + k * 0.52 + 0.4, g: 0.1 + R0() * 0.06, pan: R0() * 1.2 - 0.6 });
  const clunks = [[GRID.t0 + 0.1, 0.03, -0.6], [GRID.t0 + 0.5, 0.04, 0.5], [GRID.t0 + 0.9, 0.05, -0.2], [GRID.t0 + 1.3, 0.06, 0.7], [GRID.t0 + 1.7, 0.07, -0.5], [GRID.t0 + 2.1, 0.08, 0.2]];

  const surfLP = new OnePole(600), surfLP2 = new OnePole(450);
  const crowd = Array.from({ length: 6 }, () => new SVF());
  const crowdEnv = Array.from({ length: 6 }, () => new OnePole(3));
  const roarL = new SVF(), roarR = new SVF(), roarSub = new OnePole(60), boomF = new SVF();
  const ashL = new SVF(), ashR = new SVF(), thF = new SVF(), creakF = new SVF();
  const flowL = new SVF(), flowR = new SVF(), flowSub = new OnePole(45), flowHi = new SVF();
  const padLP = new OnePole(800), droneLP = new OnePole(450), sirenF = new OnePole(2500), hornLP = new OnePole(900), humLP = new OnePole(320);
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(48);

  let s = state(0);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    if (n % 48 === 0) s = state(t);
    let l = 0, r = 0, wet = 0;

    // --- a calm lake: gentle wash, birds, cowbells (until the ash comes) ---
    const calm = 1 - smooth(36, 42, t);
    const wash = surfLP2.run(surfLP.run(white())) * 0.05 * s.waves * (0.7 + 0.3 * Math.sin(t * 0.4));
    l += wash; r += wash * 0.9;
    for (const b of birds) {
      const dt = t - b.t;
      if (dt > 0 && dt < b.d) {
        const k = dt / b.d;
        ph[0] += (b.f * (1 + 0.25 * Math.sin(k * 9))) / SR;
        const v = Math.sin(TAU * ph[0]) * Math.sin(Math.PI * k) * b.g;
        l += v * (1 - b.pan) * 0.5; r += v * (1 + b.pan) * 0.5; wet += v * 0.4;
      }
    }
    for (const b of cowbells) {
      const dt = t - b.t;
      if (dt > 0 && dt < 0.6) {
        let v = 0;
        [[1, 1], [2.32, 0.5], [3.9, 0.3]].forEach(([m, a]) => { v += Math.sin(TAU * b.f * m * dt) * a * Math.exp(-dt * (7 + m * 3)); });
        v *= b.g * Math.min(dt / 0.004, 1) * calm;
        l += v * (1 - b.pan) * 0.5; r += v * (1 + b.pan) * 0.5; wet += v * 0.6;
      }
    }

    // --- crowd: murmur, a gasp when they see it, louder and scared after the boom, gone as they leave ---
    const crowdG = 0.05 * (1 + 1.4 * smooth(T_SHOCK + 0.2, T_SHOCK + 1.2, t) * (1 - smooth(27, 30, t)) + 1.8 * smooth(T_BOOM + 0.3, T_BOOM + 1.0, t)) * (1 - s.leave);
    if (crowdG > 0.001) {
      let cv = 0;
      for (let k = 0; k < 6; k++) {
        const amp = crowdEnv[k].run(Math.max(0, Math.sin(t * (2.1 + k * 0.7) + k * 1.3) + white() * 0.2));
        cv += crowd[k].run(white(), 380 + k * 210 + 120 * Math.sin(t * (1.1 + k * 0.3)), 0.25).bp * amp;
      }
      l += cv * crowdG; r += cv * crowdG * 0.95;
    }

    // --- music: a tense low pad from the first frame with a pulse that tightens toward the boom ---
    const padG = 0.06 * (t < T_BOOM ? 1 : Math.exp(-(t - T_BOOM) * 3));
    if (padG > 0.0005) {
      let pv = 0;
      [73.42, 110.0, 146.83, 174.61, 220.0].forEach((f, k) => { ph[2 + k] += f / SR; pv += saw(ph[2 + k]) * (k === 0 ? 0.8 : 0.45); });
      pv = padLP.run(pv) * padG;
      l += pv; r += pv; wet += pv * 0.8;
    }
    if (t < T_BOOM) {
      const rate = 1.0 + 1.3 * smooth(STORY_START - 2, T_BOOM, t);
      const pp = (t * rate) % 1;
      const thump = Math.sin(TAU * 50 * pp) * Math.exp(-pp * 16) * 0.2 * Math.min(pp / 0.01, 1);
      l += thump; r += thump;
    }
    // after the boom: a dark drone that never lets up
    const drG = 0.06 * smooth(T_BOOM + 1, T_BOOM + 5, t) * (1 - smooth(T_ARRIVE - 1, T_ARRIVE, t));
    if (drG > 0) {
      let dv = 0;
      [55.0, 82.41, 110.0, 130.81, 164.81].forEach((f, k) => { ph[10 + k] += (f * (1 + 0.003 * k)) / SR; dv += saw(ph[10 + k]) * (k === 0 ? 0.9 : 0.45); });
      dv = droneLP.run(dv) * drG;
      l += dv; r += dv; wet += dv * 0.9;
    }

    // --- the boom: a huge, deep thud with a long rumbling tail (soft attack, no click) ---
    {
      const dt = t - T_BOOM;
      if (dt > 0 && dt < 9) {
        ph[8] += (32 + 26 * Math.exp(-dt * 2.5)) / SR;
        const env = Math.min(dt / 0.03, 1) * Math.exp(-dt * 0.7);
        const b = Math.sin(TAU * ph[8]) * env * 0.5 + boomF.run(white(), 90 + 200 * Math.exp(-dt * 2), 0.5).lp * env * 0.55;
        l += b; r += b; wet += b * 0.5;
      }
    }
    // --- the eruption's roar, heard from the boom on: a constant deep rumble ---
    const roarG = 0.16 * smooth(T_BOOM, T_BOOM + 2.5, t) * (1 - 0.4 * smooth(T_FLOW, T_ARRIVE, t)) * (1 - smooth(T_ARRIVE, T_ARRIVE + 0.6, t));
    if (roarG > 0) {
      const fc = 110 + 40 * Math.sin(t * 0.37) + 25 * Math.sin(t * 1.3);
      const sub = roarSub.run(white()) * 2.2;
      l += (roarL.run(white(), fc, 0.6).lp + sub) * roarG; r += (roarR.run(white(), fc * 1.07, 0.6).lp + sub) * roarG;
    }

    // --- car horns and a siren as people flee ---
    for (const [ht, hf, hp] of horns) {
      const dt = t - ht;
      if (dt > 0 && dt < 0.8) {
        ph[16] += hf / SR;
        const v = hornLP.run(saw(ph[16]) * 0.5 + saw(ph[16] * 1.5) * 0.3) * Math.min(dt / 0.04, 1) * Math.min((0.8 - dt) / 0.12, 1) * 0.02;
        l += v * (1 - hp) * 0.5; r += v * (1 + hp) * 0.5; wet += v * 0.6;
      }
    }
    if (t > 35 && t < 60) {
      const e = smooth(35, 37, t) * (1 - smooth(GRID.t0, GRID.t0 + 2, t)) * 0.025;
      ph[17] += (900 + 350 * Math.sin(t * 1.3)) / SR;
      const v = sirenF.run(saw(ph[17])) * e;
      l += v * 0.7; r += v * 1.1; wet += v;
    }

    // --- falling ash: a soft, dry hiss ---
    const ashG = 0.05 * s.snowFall * (1 - smooth(T_ARRIVE - 3, T_ARRIVE, t));
    if (ashG > 0) {
      l += ashL.run(white(), 3200, 0.7).bp * ashG; r += ashR.run(white(), 3500, 0.7).bp * ashG;
    }

    // --- thunder overhead: low, rolling, never cracking ---
    for (const th of thunder) {
      const dt = t - th.t;
      if (dt > 0 && dt < 4) {
        const env = Math.min(dt / 0.15, 1) * Math.exp(-dt * 1.1) * (0.7 + 0.3 * Math.sin(dt * 9 + th.pan));
        const v = thF.run(white(), 140 + 120 * Math.exp(-dt * 2), 0.5).lp * env * th.g * 2.5;
        l += v * (1 - th.pan * 0.3); r += v * (1 + th.pan * 0.3); wet += v * 0.6;
      }
    }

    // --- roofs caving in: a wooden creak, then a low thud ---
    for (const c of caves) {
      const dt = t - c.t;
      if (dt > -0.5 && dt < 0) {
        ph[30] += (180 + 60 * Math.sin(dt * 23)) / SR;
        const v = creakF.run(saw(ph[30]), 600, 0.3).bp * (1 + dt * 2) * c.g * 0.25;
        l += v * (1 - c.pan) * 0.5; r += v * (1 + c.pan) * 0.5; wet += v;
      } else if (dt >= 0 && dt < 1.5) {
        ph[31] += (55 + 30 * Math.exp(-dt * 8)) / SR;
        const v = Math.sin(TAU * ph[31]) * Math.min(dt / 0.02, 1) * Math.exp(-dt * 3.5) * c.g;
        l += v * (1 - c.pan) * 0.5; r += v * (1 + c.pan) * 0.5; wet += v * 0.7;
      }
    }

    // --- the grid fails: a mains hum that sags and stutters, then soft relay thuds ---
    if (t > GRID.brown - 2 && t < GRID.t0 + GRID.span + 0.6) {
      const down = smooth(GRID.t0, GRID.t0 + GRID.span + 0.5, t);
      const g = 0.025 * smooth(GRID.brown - 2, GRID.brown, t) * gridBrown(t) * (1 - down);
      ph[40] += (60 * (1 - 0.4 * down)) / SR;
      const v = humLP.run(saw(ph[40]) + 0.5 * saw(ph[40] * 2)) * g;
      l += v; r += v; wet += v * 0.3;
    }
    for (const [ct, cg, cp] of clunks) {
      const dt = t - ct;
      if (dt > 0 && dt < 0.5) {
        ph[41] += (60 + 40 * Math.exp(-dt * 20)) / SR;
        const v = Math.sin(TAU * ph[41]) * Math.min(dt / 0.01, 1) * Math.exp(-dt * 10) * cg;
        l += v * (1 - cp) * 0.5; r += v * (1 + cp) * 0.5; wet += v * 0.8;
      }
    }

    // --- the hot ash cloud: a roar that builds from the ridge to the balcony, then a high ring in the white ---
    const fl = smooth(T_FLOW - 1, T_ARRIVE, t);
    const flowG = (0.04 + 0.5 * fl * fl) * smooth(T_FLOW - 1, T_FLOW + 2, t) * (1 - smooth(T_ARRIVE + 0.3, T_SWITCH - 0.25, t));
    if (flowG > 0) {
      const fc = 160 + 900 * fl * fl + 60 * Math.sin(t * 2.1);
      const sub = flowSub.run(white()) * 3.0;
      const hi = flowHi.run(white(), 1500 + 900 * fl, 0.8).bp * fl * fl * 0.3;
      l += (flowL.run(white(), fc, 0.5).lp + sub + hi) * flowG;
      r += (flowR.run(white(), fc * 1.05, 0.5).lp + sub + hi) * flowG;
    }
    if (t > T_ARRIVE - 0.2 && t < T_SWITCH) {
      const e = smooth(T_ARRIVE - 0.2, T_ARRIVE + 0.4, t) * (1 - smooth(T_SWITCH - 0.6, T_SWITCH - 0.1, t)) * 0.035;
      ph[22] += 2093 / SR; ph[23] += 3136 / SR;
      const v = (Math.sin(TAU * ph[22]) + 0.4 * Math.sin(TAU * ph[23])) * e;
      l += v; r += v; wet += v;
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    L[n] = l + rl * 0.9; R[n] = r + rr * 0.9;
  }

  // the video loops: from T_SWITCH on (in the white) the soundtrack becomes what plays just before the first
  // frame, so the end runs straight into the start
  {
    const a = Math.round(T_SWITCH * SR), b = Math.round((STORY_START - LOOP) * SR), n = Math.round(LOOP * SR), xf = Math.round(0.2 * SR);
    for (let i = 0; i < n && a + i < N; i++) {
      const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      L[a + i] = L[a + i] * wo + L[b + i] * wi;
      R[a + i] = R[a + i] * wo + R[b + i] * wi;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 2.1); R[n] = Math.tanh(R[n] * 2.1);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack NaN at ${(n / SR).toFixed(3)} s`);
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
