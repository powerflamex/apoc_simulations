// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A cosmic topic, so music carries it (like the black hole's and star-picker's): a low drone whose chord darkens as
// the star nears, a trailer "braam" on every beat (bigger each time, the biggest at the closest pass), sub-bass. The
// beach under it: surf, voices, a little traffic; the sea's roar when it races up the sand and again when the beach
// goes under; a deep rumble when the ground shakes; a whoosh at the two time-lapse dashes. After the pass the music
// thins out to a cold high chord and wind; it fades away as the lens freezes.
// The owner's scream (sfx/scream.mp3) in the first second (once).
// The loop: the whole track is made in one run that starts before frame 0, so the moments just before the first frame
// exist; under the solid ice at the end the track fades over into them, and the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, POPUPS, T_SURGE, T_DASH1, T_DASH2, T_FLOOD, T_QUAKE, T_ZERO, T_SUNSET, T_LENS, T_SOLID, T_MOON } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAMS = [[0.1, 1.0]];     // [when, how loud]: the two suns on frame 0 (once only: twice was too much)
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

// the drone's chords: golden hour, the star's night, the closest pass, the cold
const CH = {
  gold: [55, 82.41, 110, 130.81],
  night: [49, 73.42, 98, 116.54],
  pass: [41.2, 61.74, 82.41, 98],
  cold: [110, 164.81, 220, 246.94],
};
const mixCh = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
function chordAt(t) {
  if (t < T_DASH2) {
    let c = mixCh(CH.gold, CH.night, smooth(T_SUNSET[0], T_SUNSET[1] + 1, t));
    return mixCh(c, CH.pass, smooth(T_QUAKE, T_ZERO, t));
  }
  return CH.cold;
}
// the hits: [when, how big] (every popup; the closest pass biggest)
const HITS = POPUPS.map((p) => [p.t, p.t === T_ZERO ? 1.9 : p.t === T_FLOOD || p.t === T_QUAKE ? 1.35 : p.t === T_MOON ? 1.15 : p.t > T_DASH2 ? 0.7 : 1.0]);

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;                         // the run starts before frame 0 (filters settle, the loop's lead-in)
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const ph = new Float64Array(16);
  const surfLP = new OnePole(600), surfLP2 = new OnePole(420), crowdF = new SVF(), crowdF2 = new SVF(), trafLP = new OnePole(180);
  const subLP = new OnePole(60), rumbleLP = new OnePole(90), rumbleLP2 = new OnePole(140);
  const droneLP = [new OnePole(400), new OnePole(400)], braamF = new SVF(), whooshF = new SVF(), windF = new SVF(), windF2 = new SVF();
  const seaL = new SVF(), seaR = new SVF(), seaLP = new OnePole(500);
  const revL = new Reverb(1), revR = new Reverb(2);
  const braamPh = [0, 0, 0, 0];
  let bL = 0;
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const white = () => R0() * 2 - 1;
    // everything thins out as the lens freezes
    const fade = 1 - 0.85 * smooth(T_LENS, T_SOLID, t);
    const part2 = t >= T_DASH2 ? 1 : 0;
    // --- the beach: surf, voices (a stir at every hit, shouting as the sea comes up), a little traffic ---
    const swell = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
    const surf = surfLP2.run(surfLP.run(white())) * 0.42 * swell * fade * (1 - 0.6 * smooth(T_DASH2 + 2, T_LENS, t));
    const vox = crowdF.run(white(), 700 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + crowdF2.run(white(), 1100 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.04;
    let stir = 0;
    for (const [h, b] of HITS) { const dt = t - h; if (dt > 0 && dt < 4) stir += b * smooth(0.05, 0.4, dt) * Math.exp(-dt / 1.3); }
    const panic = smooth(T_SURGE, T_SURGE + 1.5, t) * (1 - smooth(T_SURGE + 5, T_SURGE + 8, t)) + smooth(T_FLOOD, T_FLOOD + 1, t) * (1 - smooth(T_FLOOD + 4, T_ZERO, t));
    const crowdG = (0.75 + 0.8 * stir + 1.5 * panic) * fade * (1 - 0.7 * part2);
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * crowdG;
    bL = clamp(bL + white() * 0.02, -1, 1) * 0.998;
    const traffic = trafLP.run(bL) * 0.2 * fade * (1 - 0.6 * part2);
    // --- the drone ---
    const ch = chordAt(t);
    const dg = (0.07 + 0.03 * smooth(0, T_ZERO, t) - 0.04 * part2) * fade;
    const cutoff = part2 ? 900 : 320 + 900 * smooth(2, T_ZERO, t);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    for (let k = 0; k < 4; k++) {
      const f = ch[k];
      ph[k] += (f * 0.997) / SR; ph[k + 4] += (f * 1.003) / SR;
      dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dg; dr = droneLP[1].run(dr) * dg;
    // --- braams on the hits (a low brass chord, no noise burst) ---
    let braam = 0;
    for (const [h, b] of HITS) {
      const dt = t - h;
      if (dt > -0.01 && dt < 6) {
        const e = env(dt, 0.04, 1.6) * b;
        const hf = chordAt(h + 0.1)[0] / 2;
        for (let j = 0; j < 4; j++) braamPh[j] += (hf * [1, 1.004, 2, 3.01][j]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamF.run(braam, 850, 0.6).lp * 0.17 * fade;
    // --- the sea's roar: as it races up the sand, and when the beach goes under ---
    const sea = Math.pow(smooth(T_SURGE - 0.3, T_SURGE + 1.2, t) * (1 - smooth(T_SURGE + 4.5, T_SURGE + 7.5, t)), 1.3) * 0.5
      + Math.pow(smooth(T_FLOOD - 0.4, T_FLOOD + 1.2, t) * (1 - smooth(T_FLOOD + 3.5, T_QUAKE + 1.5, t)), 1.3) * 0.6;
    const seaF = 300 + 300 * sea;
    const sl = seaLP.run(seaL.run(white(), seaF * (1 + 0.2 * Math.sin(t * 0.9)), 0.35).bp) * sea * 2.4;
    const sr2 = seaR.run(white(), seaF * 1.25 * (1 + 0.2 * Math.sin(t * 1.3 + 1)), 0.35).bp * sea * 1.0;
    // --- the ground shaking: a deep, uneven rumble ---
    const qk = t >= T_QUAKE - 0.2 && t < T_DASH2 ? smooth(T_QUAKE - 0.2, T_QUAKE + 0.3, t) * (1 - 0.5 * smooth(T_ZERO, T_ZERO + 2, t)) * (1 - smooth(T_DASH2 - 0.6, T_DASH2, t)) : 0;
    const rumble = rumbleLP2.run(rumbleLP.run(white())) * 5.0 * qk * (0.7 + 0.3 * Math.sin(t * 4.1) * Math.sin(t * 2.3));
    // --- sub-bass: the star's weight, growing to the pass ---
    const sub = subLP.run(white()) * 2.5 * (0.04 + 0.16 * smooth(4, T_ZERO, t)) * (1 - part2) * fade;
    // --- the dashes: a whoosh (filtered noise sweeping up, then down) ---
    let whoosh = 0;
    for (const td of [T_DASH1, T_DASH2]) {
      const dt = t - td;
      if (dt > -0.6 && dt < 0.6) { const k = Math.exp(-Math.pow(dt / 0.22, 2)); whoosh += whooshF.run(white(), 400 + 2600 * k, 0.5).bp * k * 0.5; }
    }
    // --- the cold: wind ---
    const wk = smooth(T_DASH2, T_DASH2 + 3, t) * (0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.21 + 2)) * (1 - 0.5 * smooth(T_LENS + 2, T_SOLID, t));
    const wind = windF.run(white(), 500 + 250 * Math.sin(t * 0.5), 1.4).bp * wk * 0.22, wind2 = windF2.run(white(), 750 + 300 * Math.sin(t * 0.4 + 1), 1.4).bp * wk * 0.2;
    const wet = (dl + dr) * 0.5 + braam * 0.8;
    const wl = revL.run(wet * 0.6), wr = revR.run(wet * 0.6);
    L[n] = surf + crowd + traffic * 0.8 + dl + braam + sub + sl + sr2 * 0.3 + rumble + whoosh + wind + wl * 0.9;
    R[n] = surf * 0.95 + crowd * 0.9 + traffic + dr + braam + sub + sr2 + sl * 0.3 + rumble * 0.95 + whoosh + wind2 + wr * 0.9;
  }
  // the owner's scream (sfx/scream.mp3). The file's 0.57 s of silence is cut; its level follows the mix around it
  {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx', 'scream.mp3'),
      '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    for (const [at, vol] of SCREAMS) {
      const n0 = Math.round((at - T0) * SR), len = sc.length >> 1;
      let mix = 0, own = 0;
      for (let i = 0; i < len; i++) { mix += L[n0 + i] ** 2 + R[n0 + i] ** 2; own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2; }
      const g = 0.56 * vol * Math.sqrt(mix / own);
      for (let i = 0; i < len; i++) {
        const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
        L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
      }
    }
  }
  // the video's track: [0, T_SWITCH) as made; from T_SWITCH on it fades over into the run's own lead-in to frame 0
  // ([-LOOP, 0)), so its last sample is followed (on the loop) by the sample that really came next
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = L[o0 + n], r = R[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = o0 + n - M;                    // the same moment before frame 0
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
