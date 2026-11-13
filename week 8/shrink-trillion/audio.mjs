// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// The bed is an endless falling pitch (a Shepard-Risset glissando): eight sine tones an octave apart, all sliding down
// together, each fading in at the top and out at the bottom, so it seems to fall forever. It slides faster as you
// shrink faster. A soft hit (a low boom and a gentle bell) on each named step. Under it: the park (voices, birds, the
// dog sniffing, the owner's scream in the first second), the ant's steps, the dew drop landing over you, the water
// (soft bubbling), the busy hum inside the bacterium, and inside the atom a deep hum and a high choir chord that swells
// into the white. The loop: the whole track is made in one run that starts before frame 0; under the white it fades
// over into the moments just before frame 0, and the glissando's speed is tuned so the fade joins it to itself.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STEPS, T_DROP, T_SINK, T_ATOM, T_REVEAL, T_DIVE, T_WHITE, shrinkRate } from './src/timeline.js';
import { antDist } from './src/grass.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAMS = [];      // (no scream in this one: the owner asked for it out, Nov 13)
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
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

// ---- the glissando: octaves per second (faster as you shrink faster), tuned so one video length is whole octaves ----
const NL = 8, FMIN = 30;
const rawRate = (t) => 0.07 + 0.11 * clamp(shrinkRate(t), 0, 1.2);
function glissPos(T0, N, M) {
  const p = new Float64Array(N);
  let acc = 0;
  for (let n = 0; n < N; n++) { p[n] = acc; acc += rawRate(T0 + n / SR) / SR; }
  // the fade at the loop mixes the track with itself one video length earlier: make that span a whole number of octaves
  const o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR);
  const span = p[o0 + sw] - p[o0 + sw - M];
  const k = Math.max(1, Math.round(span)) / span;
  for (let n = 0; n < N; n++) p[n] *= k;
  return p;
}

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const M = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const gp = glissPos(T0, N, M);
  const gph = new Float64Array(NL * 2);
  const crowdF = new SVF(), crowdF2 = new SVF(), windLP = new OnePole(300), subLP = new OnePole(55), stepLP = new OnePole(90), stepLP2 = new OnePole(140);
  const sniffF = new SVF(), splashF = new SVF(), bubF = new SVF(), bubF2 = new SVF(), cellF = new SVF(), humLP = new OnePole(80);
  const revL = new Reverb(1), revR = new Reverb(2);
  const bellPh = new Float64Array(3), choirPh = new Float64Array(6);
  const birds = []; { const r = rng(5); for (let i = 0; i < 14; i++) birds.push({ t: -3.4 + r() * 8.6, f: 2600 + r() * 1800, n: 2 + Math.floor(r() * 4), pan: r() }); }
  const steps = [];
  { let prev = antDist(4.0); for (let t = 4.0; t < 10.5; t += 0.005) { const d = antDist(t); if (Math.floor(d / 1.3) !== Math.floor(prev / 1.3)) steps.push(t); prev = d; } }
  const bubbles = []; { const r = rng(9); for (let t = T_DROP[1]; t < T_SINK[1] + 1; t += 0.05 + r() * 0.25) bubbles.push({ t, f: 300 + r() * 900, d: 0.04 + r() * 0.08, a: 0.3 + r() * 0.7, pan: r() }); }
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const white = () => R0() * 2 - 1;
    const end = 1 - 0.6 * smooth(T_WHITE - 0.3, T_WHITE + 0.3, t);
    // --- the endless fall ---
    let gl = 0, gr = 0;
    for (let k = 0; k < NL; k++) {
      const x = (((k - gp[n]) % NL) + NL) % NL / NL;        // 1 = top, 0 = bottom; falls as gp grows
      const f = FMIN * Math.pow(2, x * NL);
      const amp = Math.pow(Math.sin(Math.PI * x), 2) * (x < 0.5 ? 1 : 1 - 0.35 * (x - 0.5));
      gph[k] += f / SR; gph[k + NL] += f * 1.0035 / SR;
      if (gph[k] > 1e6) gph[k] -= 1e6;
      if (gph[k + NL] > 1e6) gph[k + NL] -= 1e6;
      gl += Math.sin(TAU * gph[k]) * amp; gr += Math.sin(TAU * gph[k + NL]) * amp;
    }
    const gg = 0.075 * (0.85 + 0.25 * smooth(30, T_WHITE, t)) * end;
    gl *= gg; gr *= gg;
    // --- the park: voices, birds, the dog sniffing, a breeze ---
    const park = 1 - smooth(5.0, 7.0, t);
    const vox = crowdF.run(white(), 650 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + crowdF2.run(white(), 1050 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.045;
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * park * 1.1;
    let bird = 0, birdR = 0;
    for (const b of birds) { const dt = t - b.t; if (dt > 0 && dt < b.n * 0.13) { const k = (dt % 0.13) / 0.13; const e = Math.sin(Math.PI * Math.min(1, k / 0.6)) * (k < 0.6 ? 1 : 0); const s = Math.sin(TAU * (b.f + 900 * k) * dt) * e * 0.02 * park; bird += s * (1 - b.pan); birdR += s * b.pan; } }
    const sn = t > 1.8 && t < 5.2 ? Math.pow(Math.max(0, Math.sin(t * 9.0)), 6) * smooth(1.8, 3, t) * (1 - smooth(4.5, 5.2, t)) : 0;
    const sniff = sniffF.run(white(), 1400 + 600 * sn, 1.2).bp * sn * 0.22;
    const air = 1 - smooth(T_DROP[1] - 0.2, T_DROP[1] + 0.3, t);
    const wind = windLP.run(white()) * 0.25 * air;
    // --- the ant's steps ---
    let step = 0;
    for (const ts of steps) { const dt = t - ts; if (dt > 0 && dt < 0.5) step += env(dt, 0.012, 0.09); }
    const stepS = stepLP2.run(stepLP.run(white())) * step * 1.3;
    // --- the drop lands over you (a deep soft splash), then the water: bubbling ---
    const sp = t - T_DROP[1];
    const splash = sp > -0.05 && sp < 2.5 ? splashF.run(white(), 300 + 900 * Math.exp(-Math.max(sp, 0) / 0.25), 0.7).bp * env(sp, 0.03, 0.5) * 1.1 : 0;
    const water = smooth(T_DROP[1], T_DROP[1] + 0.5, t) * (1 - smooth(T_SINK[0], T_SINK[1], t));
    let bub = 0, bubR = 0;
    for (const b of bubbles) { const dt = t - b.t; if (dt > 0 && dt < b.d * 3) { const e = Math.sin(Math.PI * Math.min(1, dt / (b.d * 3))) * b.a; const s = Math.sin(TAU * b.f * (1 + 2.5 * dt / b.d) * dt) * e * 0.012 * water; bub += s * (1 - b.pan); bubR += s * b.pan; } }
    const murmur = bubF.run(white(), 380, 1.5).bp * 0.08 * water + bubF2.run(white(), 160, 1.2).bp * 0.06 * water;
    // --- inside the bacterium: a warm busy hum ---
    const cell = smooth(T_SINK[0] + 0.5, T_SINK[1], t) * (1 - smooth(33, 36, t));
    const cellS = cellF.run(white(), 500 + 200 * Math.sin(t * 3.7), 3).bp * 0.07 * cell * (0.7 + 0.3 * Math.sin(t * 11));
    // --- the soft hits on each named step ---
    let boom = 0, bell = 0;
    for (const h of STEPS) {
      const dt = t - h;
      if (dt > 0 && dt < 4) { boom += Math.sin(TAU * 55 * dt * (1 - 0.15 * Math.min(dt, 1))) * env(dt, 0.02, 0.6); bell += env(dt, 0.004, 1.2); }
    }
    let bellS = 0;
    for (let j = 0; j < 3; j++) bellPh[j] += [523.25, 784.0, 1046.5][j] / SR;
    if (bell > 0) bellS = (Math.sin(TAU * bellPh[0]) + 0.5 * Math.sin(TAU * bellPh[1]) + 0.25 * Math.sin(TAU * bellPh[2])) * bell * 0.03;
    boom *= 0.12 * end;
    // --- inside the atom: a deep hum, a high choir chord swelling into the white ---
    const atom = smooth(T_ATOM, T_ATOM + 2, t);
    const hum = humLP.run(white()) * 2.0 * atom * end + Math.sin(TAU * 32.7 * t) * 0.04 * atom * end;
    let choir = 0;
    const CF = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    for (let k = 0; k < 6; k++) { choirPh[k] += CF[k] * (1 + 0.003 * Math.sin(t * 5 + k)) / SR; choir += Math.sin(TAU * choirPh[k]) * (k < 3 ? 1 : 0.5); }
    choir *= 0.011 * (atom * 0.35 + 2.4 * smooth(T_DIVE + 1, T_WHITE, t) + 0.6 * smooth(T_REVEAL[0], T_REVEAL[0] + 1, t)) * (1 - smooth(T_WHITE, T_WHITE + 0.5, t));
    const sub = subLP.run(white()) * 2.4 * (0.05 + 0.1 * smooth(4, T_WHITE, t)) * end;
    const wetIn = (gl + gr) * 0.4 + bellS + choir + boom * 0.5;
    const wl = revL.run(wetIn * 0.6), wr = revR.run(wetIn * 0.6);
    L[n] = gl + crowd + bird + sniff * 0.9 + wind + stepS + splash + bub + murmur + cellS + boom + bellS + hum + choir + sub + wl * 0.9;
    R[n] = gr + crowd * 0.9 + birdR + sniff + wind * 0.9 + stepS + splash * 0.9 + bubR + murmur * 0.9 + cellS * 0.9 + boom + bellS + hum + choir + sub + wr * 0.9;
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
  const o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
