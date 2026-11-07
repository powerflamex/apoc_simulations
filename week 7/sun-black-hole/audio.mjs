// Procedural soundtrack for "What if the Sun turned into a black hole?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a busy beach at noon (the surf, people talking) and the owner's gasp on frame 0 (sounds/gasp.mp3, about
// -25 dB: a natural reaction, not a scream); under it a low cosmic drone (music, as in the black hole video: this is a
// cosmic topic) with a soft hit on each 3 s step and a ticking pulse that tightens as the counter closes. When the Sun goes
// out: one deep hit, the drone drops away, the crowd's murmur rises and someone says "oh my god" (sounds/omg.mp3, about
// -27 dB). The zoom into the black hole: a glassy shimmer. Then the dark beach: the surf, a hit on every beat, the crowd
// leaving, a fire's soft crackle, the wind rising with the steam and the snow, the surf thickening to a slushy hiss, the
// sea ice booming and singing, then a still, cold high tone; a riser as the lens freezes and one last hit. The loop: under
// the solid ice the beach's sound comes back, so the sound runs on across the seam. Every onset is soft (8 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_DURATION, LOOP, T_SWITCH, STEPS, V_DARK, V_GONE, V_LIGHTS, V_HOME, V_FIRE, V_STEAM, V_SNOW, V_PALMS, V_BURY, V_SLUSH, V_ICE, V_YEAR, V_SHUT,
} from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const CLIPS = [
  { name: 'gasp.mp3', at: 0.2, db: -25 },        // the owner's gasp on frame 0
  { name: 'omg.mp3', at: V_DARK + 0.55, db: -27 },
];

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
  run(x, fb = 0.88, damp = 0.3) {
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

function loadClip(dir, name) {
  const file = path.join(dir, 'sounds', name);
  if (!fs.existsSync(file)) { console.warn(`audio: no sounds/${name}: left out`); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  console.log(`audio: sounds/${name}`);
  return a;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(9191);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const clips = CLIPS.map((c) => ({ ...c, data: loadClip(DIR, c.name), buf: new Float32Array(N) }));

  // ---- the beats: a soft hit on each (deeper after the dark), a big one when the Sun goes out ----
  const HITS = STEPS.map((t, n) => ({ t, k: t === V_DARK ? 0.8 : clamp(0.32 + 0.035 * n, 0, 0.8), root: t === V_DARK ? 30 : 49 * Math.pow(2, -Math.min(n, 12) / 30), deep: t === V_DARK }));
  HITS.push({ t: V_SHUT, k: 1.0, root: 33, deep: true });
  // waves breaking on the beach (real time), until the slush and the ice
  const CRASH = [];
  for (let t = -3; t < V_ICE + 1; t += 3.2 + R0() * 2.6) CRASH.push({ t, g: 0.7 + 0.5 * R0(), d: 2.2 + R0() * 1.2, pan: R0() * 1.2 - 0.6, f: new SVF(), f2: new SVF() });
  // the fire's crackle: soft little pops
  const POPS = [];
  for (let k = 0; k < 160; k++) POPS.push({ t: V_FIRE - 0.3 + R0() * (V_BURY - V_FIRE + 0.6), d: 0.012 + R0() * 0.03, f: 1800 + R0() * 2500, g: 0.012 + 0.02 * R0(), pan: -0.45 + R0() * 0.3, fl: new SVF() });
  // the sea ice: deep booms, then long falling "zings", as real sea ice sings
  const BOOMS = [{ t: V_ICE + 0.15, g: 0.8, f: 36 }, { t: V_ICE + 1.6, g: 0.45, f: 44 }, { t: V_YEAR + 0.6, g: 0.4, f: 40 }].map((b) => ({ ...b, n: new SVF(), ph: 0 }));
  const ZINGS = Array.from({ length: 8 }, (_, i) => ({ t: V_ICE + 0.4 + i * 0.36 + R0() * 0.2, f: 1700 + R0() * 1700, d: 0.8 + R0() * 0.6, g: 0.03 + 0.02 * R0(), pan: R0() * 1.4 - 0.7, ph: 0 }));
  // the lens freezing over: crackles
  const CRK = Array.from({ length: 220 }, () => ({ t: V_YEAR + 1.3 + R0() * (V_SHUT - V_YEAR - 1.3), d: 0.02 + R0() * 0.05, f: 2500 + R0() * 4000, g: 0.012 * (0.5 + R0()), pan: R0() * 1.8 - 0.9, fl: new SVF() }));
  const TICKS = [];
  for (let t = 0; t < V_DARK - 3.2; t += 0.5) TICKS.push({ t, g: 0.25 + 0.2 * t / 6 });
  for (const t of [V_DARK - 3, V_DARK - 2, V_DARK - 1]) TICKS.push({ t, g: 0.75 });
  const CHORDS = [[-9, [73.4, 87.3, 110]], [V_DARK, [65.4, 77.8, 98]], [V_LIGHTS, [61.7, 73.4, 92.5]], [V_SNOW, [55, 65.4, 82.4]], [V_ICE, [49, 58.3, 73.4]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
  const surfLP = new OnePole(500), surfLP2 = new OnePole(520), windF = [new SVF(), new SVF()], windLP = new OnePole(120);
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(400), new OnePole(400)], shimF = [new SVF(), new SVF()], tickF = new SVF();
  const riserF = new SVF(), slushF = new SVF(), hissF = new SVF();
  const revL = new Reverb(31), revR = new Reverb(32);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    // (the lead-in before frame 0 is played under the solid ice at the end, and crossfades into it)
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const day = v < V_DARK ? 1 : 0;
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    // --- the surf: a steady wash and the waves breaking; thickening to a slushy hiss; gone under the ice ---
    {
      const sea = 1 - smooth(V_ICE - 0.2, V_ICE + 0.8, v);
      const thick = smooth(V_SLUSH - 0.4, V_SLUSH + 1, v);
      if (sea > 0) {
        const wash = (surfLP.run(brownL) * 0.5 + 0.5 * surfLP2.run(brownR)) * 0.35 * sea * (1 - 0.5 * thick);
        l += wash; r += wash * 0.95;
        for (const c of CRASH) {
          const dt = v - c.t;
          if (dt < 0 || dt > c.d + 0.5) continue;
          const e = smooth(0, 0.35, dt) * Math.exp(-Math.max(0, dt - 0.3) / (c.d * 0.45));
          const w = white();
          const cv = (c.f.run(w, 700 - 300 * thick, 0.7).bp + c.f2.run(w, 2400 - 1600 * thick, 0.9).bp * 0.4) * e * c.g * 0.22 * sea;
          l += cv * (1 - c.pan) * 0.6; r += cv * (1 + c.pan) * 0.6; wet += cv * 0.15;
        }
        if (thick > 0) { const sv = slushF.run(white(), 900 + 300 * Math.sin(v * 3), 0.5).bp * 0.05 * thick * sea * (0.6 + 0.4 * Math.sin(v * 1.9)); l += sv; r += sv * 0.9; }
      }
    }
    // --- people talking (louder, a rising murmur, when it goes dark), until they've gone ---
    {
      const crowd = (1 - smooth(V_HOME + 0.5, V_FIRE + 0.5, v)) * (v < -0.2 || v > 0 ? 1 : 1);
      const react = smooth(V_DARK + 0.2, V_DARK + 1.2, v) * (1 - smooth(V_GONE + 2, V_LIGHTS + 1, v));
      if (crowd > 0) {
        let cv = 0;
        for (let q = 0; q < 6; q++) {
          const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.6) + q * 1.3) + white() * 0.2));
          cv += talkF[q].run(white(), 340 + q * 210 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
        }
        const g = (0.034 + 0.05 * react) * crowd;
        l += cv * g; r += cv * g * 0.92; wet += cv * g * 0.3;
      }
    }
    // --- the clips (set to their levels after the mix) ---
    if (n >= 0) for (const c of clips) {
      if (!c.data) continue;
      const i = Math.round((v - c.at) * SR);
      if (i >= 0 && i < c.data.length) c.buf[n] = c.data[i] * Math.min(1, i / (0.01 * SR), (c.data.length - i) / (0.06 * SR));
    }
    // --- the countdown: a soft low pulse, twice a second through the time-lapse, then on each of the last 3 seconds ---
    for (const t of TICKS) {
      const dt = v - t.t;
      if (dt < 0 || dt > 0.4) continue;
      const e = env(dt, 0.01, 0.09) * t.g;
      const tv = Math.sin(TAU * 58 * dt) * e * 0.55 + tickF.run(white(), 240, 0.5).bp * e * 0.6;
      dl += tv; dr += tv; wet += tv * 0.2;
    }
    // --- the fire's crackle ---
    for (const c of POPS) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        const e = smooth(0, 0.008, dt) * (1 - smooth(c.d - 0.008, c.d, dt));
        const cv = c.fl.run(white(), c.f, 0.6).bp * e * c.g * 2;
        l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5; wet += cv * 0.2;
      }
    }
    {
      const fr = smooth(V_FIRE - 0.3, V_FIRE + 0.4, v) * (1 - smooth(V_BURY - 0.4, V_BURY + 0.8, v));
      if (fr > 0) { const fv = windLP.run(white()) * 0.25 * fr; l += fv * 0.7; r += fv * 0.4; }
    }
    // --- the wind: rising with the steam and the snow, gone in the still cold ---
    {
      const g = smooth(V_STEAM - 0.5, V_SNOW, v) * (1 - smooth(V_SLUSH + 1, V_ICE + 1, v));
      if (g > 0) {
        const w = white();
        const fc = 420 + 260 * Math.sin(v * 0.6) + 180 * Math.sin(v * 1.7);
        const wv = (windF[0].run(w, fc, 0.5).bp + windF[1].run(w, fc * 2.2, 0.6).bp * 0.4) * 0.16 * g;
        l += wv; r += wv * (0.8 + 0.2 * Math.sin(v * 0.9)); wet += wv * 0.2;
        const hv = hissF.run(white(), 6500, 0.7).bp * 0.012 * smooth(V_SNOW - 0.3, V_SNOW + 0.8, v) * g;
        l += hv; r += hv;
      }
    }
    // --- the sea ice: booms and singing ---
    for (const b of BOOMS) {
      const dt = v - b.t;
      if (dt < 0 || dt > 3) continue;
      b.ph += (b.f * (1 - 0.3 * Math.min(dt, 1))) / SR;
      const bv = (Math.sin(TAU * b.ph) * 0.6 + b.n.run(white(), 260, 0.5).bp * 0.4) * Math.exp(-dt / 0.8) * smooth(0, 0.015, dt) * b.g;
      dl += bv; dr += bv; wet += bv * 0.8;
    }
    for (const z of ZINGS) {
      const dt = v - z.t;
      if (dt > 0 && dt < z.d) {
        z.ph += z.f * (1 - 0.55 * dt / z.d) / SR;
        const zv = Math.sin(TAU * z.ph) * env(dt, 0.012, z.d * 0.35) * z.g;
        l += zv * (1 - z.pan) * 0.5; r += zv * (1 + z.pan) * 0.5; wet += zv * 1.5;
      }
    }
    for (const c of CRK) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        const e = smooth(0, 0.008, dt) * (1 - smooth(c.d - 0.012, c.d, dt));
        const cv = c.fl.run(white(), c.f, 0.5).bp * e * c.g * 2.5;
        l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5; wet += cv * 0.6;
      }
    }
    // --- the lens freezing: a riser into the last hit ---
    {
      const k = smooth(V_YEAR + 1, V_SHUT, v) * (1 - smooth(V_SHUT - 0.02, V_SHUT + 0.06, v));
      if (k > 0) { const rv = riserF.run(white(), 300 + 4200 * k * k, 0.35).bp * k * k * 0.11; dl += rv; dr += rv; wet += rv * 0.5; }
    }
    // --- the beats ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 6) continue;
        const e = env(dt + 0.02, 0.03, (0.9 + 0.8 * h.k) * (h.deep ? 1.8 : 1)) * h.k * (1 - smooth(4.5, 6, dt));
        const hf = h.root * (1 - 0.05 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.006 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (26 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, (0.7 + 0.4 * h.k) * (h.deep ? 2.2 : 1)) * h.k;
      }
      const bf = braamLP.run(braam, 1100, 0.6).lp * 0.085;
      const sv = subLP.run(sub) * 0.5 + sub * 0.22;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the zoom: a glassy shimmer while you look at the ring; then the cold's high tone ---
    {
      const z = smooth(12.3, 13.6, v) * (1 - smooth(14.8, 15.6, v));
      const cold = smooth(V_ICE, V_ICE + 2, v) * (1 - smooth(V_SHUT - 0.05, V_SHUT + 0.3, v));
      const g = z * 1.0 + cold * 0.6;
      if (g > 0) {
        const w = white();
        const sv = (shimF[0].run(w, 5200 + 1400 * Math.sin(v * 0.7), 0.93).bp + shimF[1].run(w, 7900, 0.95).bp * 0.6) * 0.016 * g * (0.7 + 0.3 * Math.sin(v * 5));
        ph[22] += 1318.5 / SR; ph[23] += 1322 / SR; ph[24] += 1975.5 / SR;
        const tone = (Math.sin(TAU * ph[22]) + Math.sin(TAU * ph[23]) + 0.6 * Math.sin(TAU * ph[24]) * z) * 0.006 * g;
        l += sv * 0.8 + tone; r += sv + tone; wet += (sv + tone) * 1.6;
      }
    }
    // --- the drone: dark chords; it drops away for a breath when the Sun goes out ---
    {
      const ch = chordAt(v);
      const out = 1 - 0.85 * smooth(V_DARK, V_DARK + 0.15, v) * (1 - smooth(V_GONE - 0.5, V_GONE + 1.5, v));
      const dg = (0.028 + 0.02 * smooth(3, 9, v) + 0.025 * smooth(V_LIGHTS, V_SNOW, v)) * out * (1 - smooth(V_SHUT + 0.1, T_SWITCH, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const cutf = 260 + 420 * smooth(2, 9, v) * (1 - 0.4 * smooth(V_DARK, V_DARK + 2, v)) + 300 * smooth(V_SNOW, V_YEAR, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    void day;
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }
  {   // under the solid ice the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.34 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.4); R[n] = Math.tanh(R[n] * 1.4);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const gn = 0.89 / peak;
  // the clips, each set to its level (RMS over the clip) in the finished mix
  for (const c of clips) {
    if (!c.data) continue;
    let s2 = 0, k = 0;
    for (let n = 0; n < N; n++) if (c.buf[n] !== 0) { s2 += c.buf[n] * c.buf[n]; k++; }
    const rms = Math.sqrt(s2 / Math.max(k, 1)), gg = Math.pow(10, c.db / 20) / Math.max(rms, 1e-9);
    for (let n = 0; n < N; n++) if (c.buf[n] !== 0) { const s = c.buf[n] * gg / gn; L[n] += s * 0.95; R[n] += s; }
    console.log(`audio: ${c.name} at ${c.db} dB RMS`);
  }
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
