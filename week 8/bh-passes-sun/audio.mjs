// Procedural soundtrack for "What if a black hole passed by the Sun?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a city street stopped in its tracks (a low traffic hum, a crowd murmuring, rising when something new
// happens), the owner's gasp on frame 0 (sounds/gasp.mp3), "oh my god" when the ring of fire shows (omg.mp3), the scream
// at the closest pass (scream.mp3, cut to 1.7 s, level with the hit). Over it, music as in the black hole videos (a cosmic
// topic): a dark minor drone that opens up as it closes in, a glassy shimmer while the Sun bends, a soft pulse on the
// countdown that tightens to the pass, a "braam" hit on each beat; a deep roar rising as the Sun is torn, the biggest hit at
// 0:31; then the flare: a riser and a bright ringing tone climbing into the white. The loop: under the white the soundtrack
// turns into the lead-in of the first frame, so the sound runs on across the seam. Every onset is soft (8 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_EGG, V_RIVER, V_RING, V_PASS, V_FLARE, V_SKY, V_WHITE } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const CLIPS = [
  { name: 'gasp.mp3', at: 0.15, db: -25 },             // the owner's gasp on frame 0
  { name: 'omg.mp3', at: V_RING + 0.45, db: -27 },
  { name: 'scream.mp3', at: V_PASS + 0.05, db: -25, len: 1.7 },
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.7)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
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
  const R0 = rng(7171);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const clips = CLIPS.map((c) => {
    const data = loadClip(DIR, c.name);
    const n = data ? Math.min(data.length, Math.round((c.len ?? 99) * SR)) : 0;
    return { ...c, data, n, buf: new Float32Array(N) };
  });

  // ---- the beats: a hit on each, the biggest at the pass ----
  const HITS = BEATS.map((t, n) => ({ t, k: t === V_PASS ? 1.0 : clamp(0.34 + 0.05 * n, 0, 0.75), root: t === V_PASS ? 31 : 49 * Math.pow(2, -n / 24), deep: t === V_PASS }));
  // the countdown pulse: twice a second, louder as it closes in, then on each of the last 3 "seconds"
  const TICKS = [];
  for (let t = 0.25; t < V_PASS - 3.2; t += 0.5) TICKS.push({ t, g: 0.18 + 0.32 * t / V_PASS });
  for (let t = V_PASS - 3.0; t < V_PASS - 0.1; t += 0.25) TICKS.push({ t, g: 0.6 });
  const CHORDS = [[-9, [73.4, 87.3, 110]], [V_EGG, [69.3, 82.4, 103.8]], [V_RING, [65.4, 77.8, 98]], [V_PASS, [55, 65.4, 82.4]], [V_FLARE, [61.7, 73.4, 92.5]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
  const humLP = new OnePole(90), humLP2 = new OnePole(160);
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(400), new OnePole(400)], shimF = [new SVF(), new SVF()], tickF = new SVF();
  const roarF = new SVF(), roar2F = new SVF(), riserF = new SVF(), blastF = new SVF(), boomLP = new SVF();
  const revL = new Reverb(41), revR = new Reverb(42);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    // (the lead-in before frame 0 is played under the white at the end, and crossfades into it)
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const end = 1 - smooth(V_WHITE - 0.4, T_SWITCH, v);             // the street fades out into the white
    // --- the city: a low traffic hum (stopped cars idling, the city beyond) ---
    {
      const hv = (humLP.run(brownL) * 0.6 + humLP2.run(brownR) * 0.4) * 0.5 * end * (1 - 0.6 * smooth(V_FLARE, V_SKY, v));
      l += hv; r += hv * 0.95;
    }
    // --- the crowd: a murmur, rising on each new thing ---
    {
      let react = 0;
      for (const [t, g] of [[0, 0.8], [V_EGG, 0.6], [V_RING, 1.0], [V_PASS, 1.3], [V_FLARE + 1.5, 0.8]]) react = Math.max(react, g * smooth(t - 0.1, t + 0.6, v) * (1 - smooth(t + 2.5, t + 5, v)));
      let cv = 0;
      for (let q = 0; q < 6; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.6) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 340 + q * 210 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const g = (0.03 + 0.05 * react) * end;
      l += cv * g; r += cv * g * 0.92; wet += cv * g * 0.3;
    }
    // --- the clips (set to their levels after the mix) ---
    if (n >= 0) for (const c of clips) {
      if (!c.data) continue;
      const i = Math.round((v - c.at) * SR);
      if (i >= 0 && i < c.n) c.buf[n] = c.data[i] * Math.min(1, i / (0.01 * SR), (c.n - i) / (0.08 * SR));
    }
    // --- a glassy shimmer while the Sun bends (the lens), fading as the ring of fire comes ---
    {
      const g = (0.6 + 0.4 * smooth(V_EGG - 1, V_EGG + 1, v)) * (1 - smooth(V_RING - 1, V_RING + 1.5, v));
      if (g > 0) {
        const w = white();
        const sv = (shimF[0].run(w, 5200 + 1400 * Math.sin(v * 0.7), 0.93).bp + shimF[1].run(w, 7900, 0.95).bp * 0.6) * 0.012 * g * (0.7 + 0.3 * Math.sin(v * 5));
        ph[22] += 1318.5 / SR; ph[23] += 1322 / SR;
        const tone = (Math.sin(TAU * ph[22]) + Math.sin(TAU * ph[23])) * 0.004 * g;
        l += sv * 0.8 + tone; r += sv + tone; wet += (sv + tone) * 1.6;
      }
    }
    // --- the countdown pulse ---
    for (const t of TICKS) {
      const dt = v - t.t;
      if (dt < 0 || dt > 0.4) continue;
      const e = env(dt, 0.01, 0.09) * t.g;
      const tv = Math.sin(TAU * 58 * dt) * e * 0.55 + tickF.run(white(), 240, 0.5).bp * e * 0.6;
      dl += tv; dr += tv; wet += tv * 0.2;
    }
    // --- the roar of the Sun being torn: rising from the river of fire to the pass, then rolling on ---
    {
      const u = smooth(V_RIVER - 1, V_PASS, v);
      const g = u * u * (1 - 0.45 * smooth(V_PASS + 1, V_PASS + 5, v)) * (1 - smooth(V_SKY, V_WHITE, v));
      if (g > 0) {
        const w = white();
        const rv = (roarF.run(w, 90 + 900 * u * u, 0.55).bp * 0.5 + roar2F.run(w, 380 + 1500 * u, 0.8).bp * 0.12) * g;
        dl += rv; dr += rv * 0.97; wet += rv * 0.15;
      }
    }
    // --- the pass: a blast on top of the biggest hit ---
    {
      const dt = v - V_PASS;
      if (dt > -0.012 && dt < 4) {
        const bl = blastF.run(white(), 600, 0.6).bp * env(dt + 0.012, 0.014, 0.3) * 0.3;
        ph[33] += 33 / SR; ph[34] += 33.3 / SR; ph[35] += 66.4 / SR;
        const br = boomLP.run(saw(ph[33]) + saw(ph[34]) + 0.5 * saw(ph[35]), 900, 0.6).lp * env(dt + 0.012, 0.03, 0.8) * 0.12;
        dl += bl + br; dr += bl + br; wet += (bl + br) * 0.35;
      }
    }
    // --- the flare: a riser and a bright ringing tone climbing into the white ---
    {
      const k = smooth(V_FLARE, V_WHITE, v) * (1 - smooth(V_WHITE - 0.02, V_WHITE + 0.3, v));
      if (k > 0) {
        const rv = riserF.run(white(), 300 + 5200 * k * k, 0.35).bp * k * k * 0.12;
        ph[24] += (880 + 880 * k) / SR; ph[25] += (1320 + 1320 * k) / SR;
        const tone = (Math.sin(TAU * ph[24]) + 0.5 * Math.sin(TAU * ph[25])) * 0.012 * k * k;
        dl += rv + tone; dr += rv + tone; wet += (rv + tone) * 0.8;
      }
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
    // --- the drone: dark chords, opening up as it closes in ---
    {
      const ch = chordAt(v);
      const dg = (0.03 + 0.02 * smooth(3, 9, v) + 0.02 * smooth(V_RING, V_PASS, v)) * (1 - smooth(V_WHITE - 0.3, T_SWITCH, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const cutf = 260 + 420 * smooth(2, 12, v) + 500 * smooth(V_RING, V_PASS, v) + 600 * smooth(V_FLARE, V_WHITE, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }
  {   // under the white the soundtrack turns into the lead-in to the first frame
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
