// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A journey of wonder, so music carries it: a warm pad whose chord changes with every new world, a soft high shimmer
// whose pitch climbs as you shrink, a whoosh and a low "braam" at every jump to a new world (bigger toward the end),
// sub-bass under it. The park under the opening: people talking, birds, the dog sniffing; the owner's scream
// (sfx/scream.mp3) in the first second. The ant's heavy steps; the mite's slow scrape. Smaller than light: everything
// goes muffled and wavers. Inside the atom: a deep hum and a high choir-like chord that swells into the white.
// The loop: the whole track is made in one run that starts before frame 0; under the white at the end it fades over
// into the moments just before frame 0, so the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, DASHES, T_LIGHT, T_LIGHT_END, T_ATOM, T_REVEAL, T_DIVE, T_WHITE, logS } from './src/timeline.js';
import { antDist } from './src/grass.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAMS = [[0.08, 1.0]];
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
const tri = (ph) => 1 - 4 * Math.abs(ph - Math.floor(ph + 0.5));
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

// a chord per world (Hz): park C, lawn Am, weave F, blood Dm, bacteria Bb, virus Gm, smaller than light (Eb, muffled), DNA Ab, the atom C
const CH = [
  [-99, [65.41, 130.81, 164.81, 196.0]],
  [DASHES[0], [55.0, 110.0, 130.81, 164.81]],
  [DASHES[1], [43.65, 87.31, 130.81, 174.61]],
  [DASHES[2], [36.71, 73.42, 110.0, 174.61]],
  [DASHES[3], [58.27, 116.54, 146.83, 174.61]],
  [DASHES[4], [49.0, 98.0, 116.54, 146.83]],
  [T_LIGHT, [38.89, 77.78, 116.54, 155.56]],
  [DASHES[5], [51.91, 103.83, 130.81, 155.56]],
  [T_ATOM + 1, [32.7, 65.41, 98.0, 130.81]],
];
function chordAt(t) {
  let i = 0;
  while (i < CH.length - 1 && t >= CH[i + 1][0]) i++;
  if (i === 0) return CH[0][1];
  const k = smooth(CH[i][0] - 0.15, CH[i][0] + 0.35, t);
  return CH[i - 1][1].map((x, j) => x + (CH[i][1][j] - x) * k);
}
// the hits: every jump to a new world, growing; the stadium reveal
const HITS = [...DASHES.map((t, i) => [t, 0.8 + i * 0.12]), [T_LIGHT, 0.7], [T_REVEAL[0] + 0.3, 1.5]];

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const ph = new Float64Array(16), shPh = new Float64Array(4), choirPh = new Float64Array(6);
  const crowdF = new SVF(), crowdF2 = new SVF(), windLP = new OnePole(300), subLP = new OnePole(55), stepLP = new OnePole(90), stepLP2 = new OnePole(140);
  const padLP = [new OnePole(500), new OnePole(500)], braamF = new SVF(), whooshF = new SVF(), sniffF = new SVF(), scrapeF = new SVF(), humLP = new OnePole(80);
  const muffL = new OnePole(400), muffR = new OnePole(400);
  const revL = new Reverb(1), revR = new Reverb(2);
  const braamPh = [0, 0, 0, 0];
  const birds = []; { const r = rng(5); for (let i = 0; i < 14; i++) birds.push({ t: -3.4 + r() * 8.6, f: 2600 + r() * 1800, n: 2 + Math.floor(r() * 4), pan: r() }); }
  // the ant's steps: one soft thud per stride of its front legs while it walks
  const steps = [];
  { let prev = antDist(5.6); for (let t = 5.6; t < 12.6; t += 0.005) { const d = antDist(t); if (Math.floor(d / 1.3) !== Math.floor(prev / 1.3)) steps.push(t); prev = d; } }
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const white = () => R0() * 2 - 1;
    const end = 1 - 0.6 * smooth(T_WHITE - 0.3, T_WHITE + 0.3, t);
    // --- the park: voices, birds, the dog sniffing ---
    const park = 1 - smooth(DASHES[0] - 0.2, DASHES[0] + 0.3, t);
    const vox = crowdF.run(white(), 650 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + crowdF2.run(white(), 1050 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.045;
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * park * 1.1;
    let bird = 0, birdR = 0;
    for (const b of birds) { const dt = t - b.t; if (dt > 0 && dt < b.n * 0.13) { const k = (dt % 0.13) / 0.13; const e = Math.sin(Math.PI * Math.min(1, k / 0.6)) * (k < 0.6 ? 1 : 0); const s = Math.sin(TAU * (b.f + 900 * k) * dt) * e * 0.02 * park; bird += s * (1 - b.pan); birdR += s * b.pan; } }
    const sn = t > 1.8 && t < DASHES[0] ? Math.pow(Math.max(0, Math.sin(t * 9.0)), 6) * smooth(1.8, 3, t) : 0;
    const sniff = sniffF.run(white(), 1400 + 600 * sn, 1.2).bp * sn * 0.22;
    const wind = windLP.run(white()) * 0.25 * park;
    // --- the pad ---
    const ch = chordAt(t);
    const light = smooth(T_LIGHT - 0.1, T_LIGHT + 0.6, t) * (1 - smooth(T_LIGHT_END - 0.2, T_LIGHT_END + 0.2, t));
    const pg = (0.055 + 0.035 * smooth(0, T_ATOM, t) + 0.04 * smooth(T_REVEAL[0], T_WHITE, t)) * end;
    const cut = 380 + 1300 * smooth(1, T_WHITE, t);
    padLP[0].set(cut); padLP[1].set(cut * 1.08);
    let pl = 0, pr = 0;
    for (let k = 0; k < 4; k++) {
      const f = ch[k];
      ph[k] += (f * 0.997) / SR; ph[k + 4] += (f * 1.003) / SR;
      pl += saw(ph[k]) * (k === 0 ? 0.8 : 0.55); pr += saw(ph[k + 4]) * (k === 0 ? 0.8 : 0.55);
    }
    pl = padLP[0].run(pl) * pg; pr = padLP[1].run(pr) * pg;
    // --- the shrinking shimmer: a soft high tone that climbs with your size (an octave every 3 powers of ten) ---
    const sf = 300 * Math.pow(2, (logS(t) - 0.5) / 6);
    let shim = 0;
    for (let k = 0; k < 3; k++) { shPh[k] += sf * [1, 1.5, 2.003][k] / SR; shim += tri(shPh[k]) * [1, 0.5, 0.3][k]; }
    shim *= 0.018 * (0.6 + 0.4 * Math.sin(t * 5.1)) * end * (1 - 0.8 * light);
    // --- the hits ---
    let braam = 0;
    for (const [h, b] of HITS) {
      const dt = t - h;
      if (dt > -0.01 && dt < 5) {
        const e = env(dt, 0.05, 1.3) * b;
        const hf = chordAt(h + 0.4)[0];
        for (let j = 0; j < 4; j++) braamPh[j] += (hf * [1, 1.004, 2, 3.01][j]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamF.run(braam, 800, 0.6).lp * 0.15 * end;
    let whoosh = 0;
    for (const td of DASHES) { const dt = t - td; if (dt > -0.6 && dt < 0.5) { const k = Math.exp(-Math.pow(dt / 0.2, 2)); whoosh += whooshF.run(white(), 400 + 2000 * k, 0.6).bp * k * 0.3; } }
    // --- the ant's steps and the mite's slow scrape ---
    let step = 0;
    for (const ts of steps) { const dt = t - ts; if (dt > 0 && dt < 0.5) step += env(dt, 0.012, 0.09); }
    const stepS = stepLP2.run(stepLP.run(white())) * step * 1.4;
    const mite = t > DASHES[1] && t < DASHES[2] ? Math.pow(Math.max(0, Math.sin(t * 4.2)), 3) * smooth(DASHES[1], DASHES[1] + 1, t) * (1 - smooth(16.6, 17.6, t)) : 0;
    const scrape = scrapeF.run(white(), 900, 2).bp * mite * 0.06;
    // --- inside the atom: a deep hum, a high choir-like chord swelling into the white ---
    const atom = smooth(T_ATOM, T_ATOM + 2, t);
    const hum = humLP.run(white()) * 2.2 * atom * end + Math.sin(TAU * 32.7 * t) * 0.05 * atom * end;
    let choir = 0;
    const CF = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    for (let k = 0; k < 6; k++) { choirPh[k] += CF[k] * (1 + 0.003 * Math.sin(t * 5 + k)) / SR; choir += Math.sin(TAU * choirPh[k]) * (k < 3 ? 1 : 0.5); }
    choir *= 0.012 * (atom * 0.35 + 2.4 * smooth(T_DIVE + 1, T_WHITE, t)) * (1 - smooth(T_WHITE, T_WHITE + 0.5, t));
    const sub = subLP.run(white()) * 2.5 * (0.05 + 0.12 * smooth(4, T_WHITE, t)) * end;
    const wetIn = (pl + pr) * 0.5 + braam * 0.8 + shim + choir;
    const wl = revL.run(wetIn * 0.6), wr = revR.run(wetIn * 0.6);
    let l = crowd + bird + sniff * 0.9 + wind + pl + shim + braam + whoosh + stepS + scrape + hum + choir + sub + wl * 0.9;
    let r = crowd * 0.9 + birdR + sniff + wind * 0.9 + pr + shim + braam + whoosh + stepS + scrape * 0.8 + hum + choir + sub + wr * 0.9;
    // smaller than light: muffled and wavering
    muffL.set(lerp(18000, 350 + 150 * Math.sin(t * 7), light)); muffR.set(lerp(18000, 350 + 150 * Math.sin(t * 6.3 + 1), light));
    const ml = muffL.run(l), mr = muffR.run(r);
    L[n] = l * (1 - light) + ml * light * 1.3;
    R[n] = r * (1 - light) + mr * light * 1.3;
  }
  // the owner's scream (sfx/scream.mp3): the file's 0.55 s of silence cut; its level follows the mix around it
  {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx', 'scream.mp3'),
      '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    for (const [at, vol] of SCREAMS) {
      const n0 = Math.round((at - T0) * SR), len = sc.length >> 1;
      let mix = 0, own = 0;
      for (let i = 0; i < len; i++) { mix += L[n0 + i] ** 2 + R[n0 + i] ** 2; own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2; }
      const g = 0.9 * vol * Math.sqrt(mix / own);
      for (let i = 0; i < len; i++) {
        const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
        L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
      }
    }
  }
  // the video's track: [0, T_SWITCH) as made; from T_SWITCH it fades over into the run's own lead-in to frame 0
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = L[o0 + n], r = R[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = o0 + n - M;
      l = l * wo + L[j] * wi; r = r * wo + R[j] * wi;
    }
    OL[n] = l; OR[n] = r;
  }
  let peak = 0;
  for (let n = 0; n < M; n++) { OL[n] = Math.tanh(OL[n] * 1.3); OR[n] = Math.tanh(OR[n] * 1.3); peak = Math.max(peak, Math.abs(OL[n]), Math.abs(OR[n])); }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n] * g, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n] * g, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
const lerp = (a, b, k) => a + (b - a) * k;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
