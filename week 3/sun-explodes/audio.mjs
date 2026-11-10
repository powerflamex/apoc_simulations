// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A cosmic topic, so music carries it (like the black hole's): a minor-key drone that darkens and climbs, trailer
// "braam" hits on the beats, sub-bass. Under it: the beach (surf, a murmur of people, light traffic) until the light
// lands; a deep impact + a high ringing whine at the flash; then a fire roar that grows (soft, filtered noise: no
// crackles), a steam hiss as the sea boils, a final riser that cuts to silence at the white-out. The end runs
// straight into the start (the loop).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, BEATS, V_FLASH, V_BLAST, storyT } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const SCREAM_AT = V_FLASH + 0.05;   // 1.75 s: the scream starts as the light lands
const TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 30), SR / 8) / SR);
    this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h;
    return { lp: this.l, bp: this.b, hp: h };
  }
}
class Reverb {
  constructor(seed) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.7)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.87, damp = 0.4) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  // braams on the beats (the flash hardest), roots falling as it goes on
  const HITS = BEATS.map((b, i) => [b.v, i === 0 ? 1.3 : 0.55 + 0.05 * i, [55, 49, 46.25, 43.65, 41.2, 38.9, 36.7, 34.65, 32.7][i] || 32.7]);
  // drone: A minor -> F -> D minor -> a dissonant cluster for the end
  const CHORDS = [[-9, [110, 130.81, 164.81, 220]], [V_FLASH, [110, 130.81, 164.81, 207.65]], [20, [87.31, 110, 130.81, 174.61]], [36, [73.42, 110, 146.83, 174.61]], [50, [69.3, 73.42, 103.83, 138.59]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const ph = new Float64Array(16);
  const surfLP = new OnePole(600), surfLP2 = new OnePole(420), crowdF = new SVF(), crowdF2 = new SVF(), trafLP = new OnePole(180);
  const roarL = new SVF(), roarR = new SVF(), roarLP = new OnePole(900), hissF = new SVF(), subLP = new OnePole(60), impLP = new OnePole(200);
  const droneLP = [new OnePole(400), new OnePole(400)], braamF = new SVF(), riserF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  let braamPh = [0, 0, 0, 0], subPh = 0, whinePh = 0, bL = 0, bR = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    const T = storyT(Math.min(t, V_BLAST));
    const white = () => R0() * 2 - 1;
    const end = t >= T_SWITCH;
    const pre = 1 - smooth(V_FLASH, V_FLASH + 6, t);              // the beach before (fades as people flee)
    // --- the beach: surf swells, a murmur of voices, light traffic ---
    const swell = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
    const surf = surfLP2.run(surfLP.run(white())) * 0.5 * swell * (1 - smooth(25, 34, t) * 0.8);
    const vox = crowdF.run(white(), 700 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + crowdF2.run(white(), 1100 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.04;
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * pre * (1 + 1.5 * smooth(V_FLASH, V_FLASH + 0.5, t));
    bL = clamp(bL + white() * 0.02, -1, 1) * 0.998;
    const traffic = trafLP.run(bL) * 0.3 * (1 - smooth(V_FLASH + 1, V_FLASH + 4, t));
    // --- the flash: a deep impact and a ringing whine (your ears) ---
    const df = t - V_FLASH;
    let impact = 0, whine = 0;
    if (df > -0.02 && df < 6) {
      subPh += (38 * Math.exp(-df * 0.6) + 22) / SR;
      impact = (Math.sin(TAU * subPh) * 0.9 + impLP.run(white()) * 3.0) * env(df, 0.01, 1.4);
      whinePh += (4200 + 80 * Math.sin(df * 2)) / SR;
      whine = Math.sin(TAU * whinePh) * 0.035 * env(df, 0.05, 2.2);
    }
    // --- the drone ---
    const ch = chordAt(t);
    const dG = (0.05 + 0.09 * smooth(V_FLASH, V_FLASH + 3, t) + 0.05 * smooth(30, 60, t)) * (end ? 0 : 1);
    const cutoff = 300 + 700 * smooth(V_FLASH, 40, t) + 1600 * smooth(55, V_BLAST, t);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    const bend = 1 + 0.07 * Math.pow(smooth(52, V_BLAST, t), 2);
    for (let k = 0; k < ch.length; k++) {
      ph[k] += (ch[k] * bend * 0.997) / SR; ph[k + 4] += (ch[k] * bend * 1.003) / SR;
      dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dG; dr = droneLP[1].run(dr) * dG;
    // --- braams ---
    let braam = 0;
    for (const [ht, hs, hf] of HITS) {
      const dt = t - ht;
      if (dt > -0.01 && dt < 6) {
        const e = env(dt, 0.05, 1.7) * hs;
        for (let k = 0; k < 4; k++) braamPh[k] += (hf * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamF.run(braam, 850, 0.6).lp * 0.17;
    // --- the fire roar: grows with the heat; deep and soft ---
    const roarG = (0.06 * smooth(9, 14, t) + 0.18 * smooth(14, 30, t) + 0.22 * smooth(40, 62, t)) * (end ? 0 : 1);
    const rf = 260 + 260 * smooth(14, 60, t) + 60 * Math.sin(t * 0.5) + 40 * Math.sin(t * 1.7);
    const rl = roarLP.run(roarL.run(white(), rf, 0.5).bp) * roarG * 2.4;
    const rr = roarR.run(white(), rf * 1.1, 0.5).bp * roarG * 1.0;
    // --- steam: a soft hiss as the sea boils ---
    const hissG = 0.05 * smooth(24, 32, t) * (1 - 0.5 * smooth(50, 60, t)) * (end ? 0 : 1);
    const hiss = hissF.run(white(), 3000 + 600 * Math.sin(t * 0.4), 1.2).bp * hissG;
    // --- sub rumble under the end ---
    const sub = subLP.run(white()) * 2.5 * (0.05 * smooth(30, 50, t) + 0.25 * smooth(55, V_BLAST, t)) * (end ? 0 : 1);
    // --- the riser into the blast; silence at the white ---
    let riser = 0;
    if (t > V_BLAST - 6 && !end) { const k = smooth(V_BLAST - 6, T_SWITCH - 0.05, t); riser = riserF.run(white(), 250 + 2600 * k * k, 0.3).bp * k * k * 0.5; }
    const wet = (dl + dr) * 0.5 + braam * 0.8 + whine;
    const wl = revL.run(wet * 0.6), wr = revR.run(wet * 0.6);
    let l = surf + crowd + traffic * 0.8 + impact * 0.5 + whine + dl + braam + rl + rr * 0.3 + hiss + sub + riser + wl * 0.9;
    let r = surf * 0.95 + crowd * 0.9 + traffic + impact * 0.5 + whine * 0.9 + dr + braam + rr + rl * 0.3 + hiss * 0.9 + sub + riser + wr * 0.9;
    if (end) { l = 0; r = 0; }
    L[n] = l; R[n] = r;
  }
  // the loop: under the white (from T_SWITCH on) the beach ambience fades in exactly as it sounds just before the
  // first frame (same swell phase), so the end runs straight into the start
  {
    const a = Math.round(T_SWITCH * SR), n = N - a, xf = Math.round(0.25 * SR);
    const amb = makeAmbience(rng(5));
    for (let i = 0; i < n; i++) {
      const t = (i - n) / SR;                      // time relative to frame 0 (negative)
      const k = Math.min(1, i / xf);
      const [al, ar] = amb(t);
      L[a + i] = L[a + i] * (1 - k) + al * k;
      R[a + i] = R[a + i] * (1 - k) + ar * k;
    }
  }
  // the owner's scream (sfx/scream.mp3): the crowd screams as the light hits. The file's 0.57 s of silence is cut,
  // so the scream starts at SCREAM_AT; it sits about level with the flash's boom, with a short fade at each end
  {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx', 'scream.mp3'),
      '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    const n0 = Math.round(SCREAM_AT * SR), len = sc.length >> 1;
    let mix = 0, own = 0;
    for (let i = 0; i < len; i++) { mix += L[n0 + i] ** 2 + R[n0 + i] ** 2; own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2; }
    const g = 1.4 * Math.sqrt(mix / own) * 0.22;   // (8 dB quieter than at first: still the loudest moment, about as loud as the flash's boom)
    for (let i = 0; i < len; i++) {
      const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
      L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
    }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) { L[n] = Math.tanh(L[n] * 1.3); R[n] = Math.tanh(R[n] * 1.3); peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n])); }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    buf.writeInt16LE(Math.round(clamp(L[n] * g, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * g, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
// the beach before the flash (surf, voices, traffic), as a function of time with its own filters
function makeAmbience(R0) {
  const sLP = new OnePole(600), sLP2 = new OnePole(420), c1 = new SVF(), c2 = new SVF(), tLP = new OnePole(180);
  let b = 0;
  return (t) => {
    const white = () => R0() * 2 - 1;
    const swell = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
    const surf = sLP2.run(sLP.run(white())) * 0.5 * swell;
    const vox = c1.run(white(), 700 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + c2.run(white(), 1100 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.04;
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7))));
    b = clamp(b + white() * 0.02, -1, 1) * 0.998;
    const traffic = tLP.run(b) * 0.3;
    return [surf + crowd + traffic * 0.8, surf * 0.95 + crowd * 0.9 + traffic];
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
