// Procedural soundtrack, synced to the same timeline as the visuals.
//   node audio.mjs            -> out/soundtrack.wav
// Layers: city + surf ambience, a minor-key drone that darkens, trailer "braam" hits on story beats,
// sub-bass quake, rising wind, glass crackle, a final riser that cuts to silence at the white-out,
// and a soft chord under the end card.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, DURATION, STORY_START, T_SWITCH, LOOP } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;

class OnePole { // lowpass
  constructor(fc) { this.y = 0; this.set(fc); }
  set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); }
  run(x) { return (this.y += this.a * (x - this.y)); }
}
class SVF { // state-variable filter (bandpass / lowpass)
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 40), SR / 8) / SR);
    this.l += f * this.b;
    const h = x - this.l - q * this.b;
    this.b += f * h;
    return { lp: this.l, bp: this.b, hp: h };
  }
}
class Reverb { // small Schroeder reverb
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
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

export function makeSoundtrack(outFile) {
  const N = Math.round(DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(99);

  // story beats for braam hits [time, strength, root Hz]
  const HITS = [[17.8, 0.45, 55], [30.8, 0.8, 49], [51.4, 0.9, 46.25], [58.4, 1.0, 41.2], [65.4, 1.1, 36.7]];
  // drone chord progression (Hz): A minor -> F -> D minor -> dissonant cluster
  const CHORDS = [
    [0, [110, 130.81, 164.81, 220]],
    [24, [87.31, 110, 130.81, 174.61]],
    [38, [73.42, 110, 146.83, 174.61]],
    [52, [69.3, 73.42, 103.83, 138.59]],
  ];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  // pre-pick glass crackle events
  const crackles = [];
  for (let i = 0; i < 520; i++) crackles.push({ t: 52 + Math.pow(R0(), 0.8) * 22, f: 2500 + R0() * 6000, g: 0.02 + R0() * 0.05, pan: R0() * 2 - 1 });
  crackles.sort((a, b) => a.t - b.t);
  // car horns early on
  const horns = [[3.2, 392, -0.6], [9.8, 349, 0.5], [26.5, 415, -0.3], [41.0, 440, 0.4], [43.2, 392, -0.5], [44.0, 466, 0.6]];

  const phases = new Float64Array(16);
  let brownL = 0, brownR = 0;
  const surfLP = new OnePole(500), surfLP2 = new OnePole(380);
  const cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const windL = new SVF(), windR = new SVF();
  const subLP = new OnePole(70);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const braamLP = new SVF();
  const riserF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  let hornPh = 0, braamPh = [0, 0, 0, 0], subPh = 0, endPh = [0, 0, 0, 0], shimPh = [0, 0, 0];
  let ci = 0;
  const active = [];

  let s = state(0);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    if (n % 48 === 0) s = state(t);
    const white = () => R0() * 2 - 1;
    const end = t >= 76.0;

    // --- ambience: city hum + surf (fade as the world falls apart) ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const cityG = 0.32 * smooth(0, 1.5, t) * (1 - smooth(46, 56, t));
    const city = cityLP.run(brownL) * cityG;
    const city2 = cityLP2.run(brownR) * cityG;
    const swell = 0.55 + 0.45 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1);
    const surfG = 0.22 * smooth(0, 2, t) * (1 - smooth(50, 60, t)) * (1 + s.tide * 1.5);
    const surf = surfLP2.run(surfLP.run(white())) * surfG * swell;

    // horns
    let horn = 0, hornPan = 0;
    for (const [ht, hf, hp] of horns) {
      const dt = t - ht;
      if (dt > 0 && dt < 0.7) {
        hornPh += hf / SR;
        horn += (saw(hornPh) * 0.5 + saw(hornPh * 1.5) * 0.3) * Math.min(dt / 0.02, 1) * Math.min((0.7 - dt) / 0.1, 1) * 0.018;
        hornPan = hp;
      }
    }

    // --- drone pad ---
    const ch = chordAt(t);
    const dG = 0.11 * smooth(1.0, 8, t) * (1 + 0.6 * smooth(30, 60, t)) * (end ? 0 : 1);
    const cutoff = 280 + 900 * smooth(10, 70, t) + 1400 * smooth(68, 75.8, t);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    for (let k = 0; k < ch.length; k++) {
      // slow upward bend in the last act (tension)
      const bend = 1 + 0.06 * Math.pow(smooth(60, 75.8, t), 2);
      const f = ch[k] * bend;
      phases[k] += (f * 0.997) / SR;
      phases[k + 4] += (f * 1.003) / SR;
      dl += saw(phases[k]) * (k === 0 ? 0.9 : 0.6);
      dr += saw(phases[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dG;
    dr = droneLP[1].run(dr) * dG;

    // --- braam hits ---
    let braam = 0;
    for (const [ht, hs, hf] of HITS) {
      const dt = t - ht;
      if (dt > -0.01 && dt < 7) {
        const e = env(dt, 0.06, 1.9) * hs;
        for (let k = 0; k < 4; k++) braamPh[k] += (hf * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    const bf = braamLP.run(braam, 900, 0.6);
    braam = bf.lp * 0.16;

    // --- sub quake ---
    subPh += (34 + 6 * Math.sin(t * 0.7)) / SR;
    const subG = (0.10 * smooth(35, 46, t) + 0.22 * smooth(50, 72, t)) * (end ? 0 : 1);
    const quake = (Math.sin(TAU * subPh) * 0.6 + subLP.run(white()) * 2.5) * subG * (0.75 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 2.9));

    // --- wind ---
    const windG = (0.04 * smooth(20, 40, t) + 0.25 * smooth(44, 72, t)) * (end ? 0 : 1);
    const wfc = 420 + 600 * smooth(44, 74, t) + 180 * Math.sin(t * 0.37) + 90 * Math.sin(t * 1.3);
    const wl = windL.run(white(), wfc, 0.35).bp * windG * 1.4;
    const wr = windR.run(white(), wfc * 1.12, 0.35).bp * windG * 1.4;

    // --- moon shredding shimmer (glassy high partials) ---
    let shim = 0;
    const shG = 0.035 * smooth(25, 31, t) * (1 - smooth(36, 42, t));
    if (shG > 0) {
      for (let k = 0; k < 3; k++) {
        shimPh[k] += ([1760, 2217, 2637][k] * (1 + 0.002 * Math.sin(t * (3 + k)))) / SR;
        shim += Math.sin(TAU * shimPh[k]) * (0.5 + 0.5 * Math.sin(t * (5 + k * 2.3)));
      }
      shim *= shG;
    }

    // --- glass crackle ---
    while (ci < crackles.length && crackles[ci].t <= t) active.push({ ...crackles[ci++], age: 0 });
    let cl = 0, cr = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const c = active[i];
      c.age += 1 / SR;
      if (c.age > 0.08 || end) { active.splice(i, 1); continue; }
      const v = Math.sin(TAU * c.f * c.age) * white() * Math.exp(-c.age * 60) * c.g;
      cl += v * (1 - c.pan) * 0.5; cr += v * (1 + c.pan) * 0.5;
    }

    // --- final riser into the white-out, hard cut at 76.0 ---
    let riser = 0;
    if (t > 68 && !end) {
      const k = smooth(68, 75.9, t);
      riser = riserF.run(white(), 400 + 7000 * k * k, 0.25).bp * k * k * 0.5;
    }

    // --- end card: a soft, distant chord ---
    let endc = 0;
    if (t > 76.5) {
      const e = smooth(76.5, 78.2, t) * (1 - smooth(79.0, 80, t));
      [110, 164.81, 220, 261.63].forEach((f, k) => { endPh[k] += f / SR; endc += Math.sin(TAU * endPh[k]) * [0.5, 0.35, 0.3, 0.18][k]; });
      endc *= e * 0.05;
    }

    // mix
    const wetIn = (dl + dr) * 0.5 + braam * 0.7 + shim + endc;
    const wl2 = revL.run(wetIn * 0.6), wr2 = revR.run(wetIn * 0.6);
    let l = city * 0.9 + city2 * 0.2 + surf + dl + braam + quake + wl + shim + cl + riser + endc + wl2 * 0.9 + horn * (1 - hornPan) * 0.5;
    let r = city2 * 0.9 + city * 0.2 + surf + dr + braam + quake + wr + shim * 0.9 + cr + riser + endc + wr2 * 0.9 + horn * (1 + hornPan) * 0.5;
    if (t >= 76.0 && t < 76.5) { l *= 0; r *= 0; } // silence at the white-out
    L[n] = l; R[n] = r;
  }

  // master: soft clip + normalize to -1 dBFS, 5 ms fades
  // the video loops: from T_SWITCH on (under the full cover) the soundtrack becomes what plays just before the
  // first frame, so the end runs straight into the start
  {
    const a = Math.round(T_SWITCH * SR), b = Math.round((STORY_START - LOOP) * SR), n = Math.round(LOOP * SR), xf = Math.round(0.15 * SR);
    for (let i = 0; i < n; i++) {
      const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      L[a + i] = L[a + i] * wo + L[b + i] * wi;
      R[a + i] = R[a + i] * wo + R[b + i] * wi;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.4); R[n] = Math.tanh(R[n] * 1.4);
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
  const out = makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav'));
  console.log('wrote', out);
}
