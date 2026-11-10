// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A cosmic topic, so music carries it (like the black hole's): a drone whose chord changes with every star, a trailer
// "braam" on every landing (bigger for the bigger stars), sub-bass. On top: the picker (a soft tick for every row that
// passes the middle, a deeper click when it locks onto a star) and each star's own sound: Proxima a hollow cold wind
// (the surf stops dead as the sea freezes), Sirius and Vega a searing hiss, the giants a deep roar that grows with
// each one, Betelgeuse everything at once. The beach (surf, voices, traffic) at the start; the owner's scream
// (sfx/scream.mp3) in the first second, at Arcturus's giant disc.
// The loop: the whole track is made in one run that starts before frame 0, so the moments just before the first frame
// exist; under the full cover at the end the track fades over into them, and the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STOPS, LAND, drumPos, stopAt } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAM_AT = 0.12;                    // (in the first second: everyone screams at Arcturus's giant disc)
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

// per stop: the drone's chord, the braam's strength, the star's roar (low band: centre Hz, gain) and hiss (high band)
const MUSIC = {
  sun: { ch: [110, 164.81, 220, 246.94], dg: 0.025, braam: 0, low: [300, 0], hiss: [3000, 0] },
  proxima: { ch: [73.42, 110, 146.83, 174.61], dg: 0.07, braam: 0.55, low: [430, 0.13], hiss: [2600, 0.012] },
  sirius: { ch: [87.31, 130.81, 174.61, 220], dg: 0.07, braam: 0.7, low: [320, 0.07], hiss: [3400, 0.05] },
  vega: { ch: [98, 146.83, 196, 233.08], dg: 0.075, braam: 0.75, low: [290, 0.1], hiss: [3000, 0.06] },
  arcturus: { ch: [69.3, 103.83, 138.59, 164.81], dg: 0.08, braam: 0.9, low: [240, 0.22], hiss: [2600, 0.035] },
  aldebaran: { ch: [65.41, 98, 130.81, 155.56], dg: 0.085, braam: 1.0, low: [200, 0.28], hiss: [2400, 0.04] },
  rigel: { ch: [61.74, 92.5, 123.47, 146.83], dg: 0.09, braam: 1.2, low: [170, 0.36], hiss: [3200, 0.08] },
  betelgeuse: { ch: [55, 58.27, 82.41, 110], dg: 0.1, braam: 1.55, low: [140, 0.5], hiss: [2200, 0.07] },
};

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;                         // the run starts before frame 0 (filters settle, the loop's lead-in)
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  // the picker's ticks: every time a row crosses the middle; the click: every landing
  const ticks = [];
  {
    let prev = Math.round(drumPos(T0));
    for (let t = T0; t < VIDEO_DURATION; t += 0.0005) {
      const p = Math.round(drumPos(t));
      if (p !== prev) { ticks.push(t); prev = p; }
    }
  }
  const lands = STOPS.slice(1).map((s) => s.land);
  const ph = new Float64Array(16);
  const surfLP = new OnePole(600), surfLP2 = new OnePole(420), crowdF = new SVF(), crowdF2 = new SVF(), trafLP = new OnePole(180);
  const lowL = new SVF(), lowR = new SVF(), lowLP = new OnePole(700), hissF = new SVF(), hissF2 = new SVF(), subLP = new OnePole(60);
  const droneLP = [new OnePole(400), new OnePole(400)], braamF = new SVF(), riserF = new SVF(), windF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  let braamPh = [0, 0, 0, 0], clickPh = 0, tickPh = 0, shimPh = [0, 0, 0], bL = 0;
  let ti = 0;
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const white = () => R0() * 2 - 1;
    const i = stopAt(t), st = STOPS[i], m = MUSIC[st.key], mp = MUSIC[STOPS[Math.max(0, i - 1)].key];
    const sw = i === 0 ? 1 : smooth(st.land, st.land + 0.08, t);
    const since = t - st.land;
    const fade = 1 - smooth(T_SWITCH - 1.6, T_SWITCH - 0.1, t);     // everything dies away under the cover
    // --- the beach: surf (stops dead as the sea freezes, back as it thaws), voices, traffic ---
    const waves = 1 - smooth(LAND.proxima, LAND.proxima + 1.0, t) * (1 - smooth(LAND.sirius + 0.6, LAND.sirius + 3, t));
    const swell = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
    const surf = surfLP2.run(surfLP.run(white())) * 0.5 * swell * waves * (1 - smooth(LAND.vega, LAND.vega + 6, t) * 0.7);
    const vox = crowdF.run(white(), 700 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + crowdF2.run(white(), 1100 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.04;
    const crowdG = (1 - 0.7 * smooth(LAND.proxima + 0.5, LAND.proxima + 2, t)) * (1 - smooth(LAND.sirius + 2, LAND.sirius + 6, t))
      + 1.3 * smooth(LAND.arcturus + 0.1, LAND.arcturus + 0.4, t) * (1 - smooth(LAND.arcturus + 2.5, LAND.arcturus + 5.5, t))
      + 1.6 * smooth(LAND.sirius + 0.1, LAND.sirius + 0.5, t) * (1 - smooth(LAND.sirius + 1.5, LAND.sirius + 5, t));
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * crowdG;
    bL = clamp(bL + white() * 0.02, -1, 1) * 0.998;
    const traffic = trafLP.run(bL) * 0.3 * (1 - smooth(LAND.sirius + 0.5, LAND.sirius + 3, t));
    // --- the picker: soft ticks (a short pitched tock, no noise burst), a deeper click on the landing ---
    while (ti + 1 < ticks.length && ticks[ti + 1] <= t) ti++;
    let tick = 0;
    for (let k = Math.max(0, ti - 2); k <= ti; k++) {
      const dt = t - ticks[k];
      if (dt >= 0 && dt < 0.03) tick += (Math.sin(TAU * 2350 * dt) * 0.7 + Math.sin(TAU * 1180 * dt) * 0.5) * Math.min(1, dt / 0.0006) * Math.exp(-dt / 0.0055);
    }
    let click = 0;
    for (const lt of lands) {
      const dt = t - lt;
      if (dt >= 0 && dt < 0.25) click += (Math.sin(TAU * (520 + 300 * Math.exp(-dt / 0.01)) * dt) * 0.8 + Math.sin(TAU * 150 * dt) * 0.9) * Math.min(1, dt / 0.0008) * Math.exp(-dt / 0.045);
    }
    // --- the drone (its chord follows the star) ---
    const dg = (mp.dg + (m.dg - mp.dg) * sw) * fade;
    const cutoff = 300 + 160 * i + 900 * smooth(LAND.rigel, LAND.betelgeuse + 2, t);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    for (let k = 0; k < 4; k++) {
      const f = mp.ch[k] + (m.ch[k] - mp.ch[k]) * sw;
      ph[k] += (f * 0.997) / SR; ph[k + 4] += (f * 1.003) / SR;
      dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dg; dr = droneLP[1].run(dr) * dg;
    // --- braams on the landings ---
    let braam = 0;
    for (let k = 1; k < STOPS.length; k++) {
      const dt = t - STOPS[k].land;
      if (dt > -0.01 && dt < 6) {
        const mm = MUSIC[STOPS[k].key];
        const e = env(dt, 0.04, 1.6) * mm.braam;
        const hf = mm.ch[0] / 2;
        for (let j = 0; j < 4; j++) braamPh[j] += (hf * [1, 1.004, 2, 3.01][j]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamF.run(braam, 850, 0.6).lp * 0.17 * fade;
    // --- the star's own sound: a roar (low band) and a hiss (high band), swelling in after it lands ---
    const swellIn = i === 0 ? 1 : 0.55 + 0.45 * smooth(st.land, st.land + 1.6, t);
    const lowF = mp.low[0] + (m.low[0] - mp.low[0]) * sw, lowG = (mp.low[1] + (m.low[1] - mp.low[1]) * sw) * swellIn * fade;
    const hisF = mp.hiss[0] + (m.hiss[0] - mp.hiss[0]) * sw, hisG = (mp.hiss[1] + (m.hiss[1] - mp.hiss[1]) * sw) * swellIn * fade;
    const lf = lowF * (1 + 0.15 * Math.sin(t * 0.5) + 0.08 * Math.sin(t * 1.7));
    const rl = lowLP.run(lowL.run(white(), lf, 0.5).bp) * lowG * 2.4;
    const rr = lowR.run(white(), lf * 1.1, 0.5).bp * lowG * 1.0;
    const hs = hissF.run(white(), hisF, 1.2).bp * hisG, hs2 = hissF2.run(white(), hisF * 1.3, 1.2).bp * hisG;
    // Proxima: a hollow wind and a glassy shimmer (the cold)
    const coldG = smooth(LAND.proxima, LAND.proxima + 1.5, t) * (1 - smooth(LAND.sirius, LAND.sirius + 0.6, t));
    const wind = windF.run(white(), 480 + 140 * Math.sin(t * 0.6) + 60 * Math.sin(t * 1.9), 0.25).bp * coldG * 0.12;
    let shim = 0;
    if (coldG > 0) for (let k = 0; k < 3; k++) { shimPh[k] += ([1760, 2217, 2637][k] * (1 + 0.002 * Math.sin(t * (3 + k)))) / SR; shim += Math.sin(TAU * shimPh[k]) * (0.5 + 0.5 * Math.sin(t * (1.1 + k * 0.7))); }
    shim *= coldG * 0.012;
    // --- sub rumble, growing with the giants ---
    const sub = subLP.run(white()) * 2.5 * (0.05 * smooth(LAND.vega, LAND.aldebaran, t) + 0.12 * smooth(LAND.rigel, LAND.rigel + 3, t) + 0.18 * smooth(LAND.betelgeuse, LAND.betelgeuse + 1, t)) * fade;
    // --- the last spin: a riser into Betelgeuse ---
    let riser = 0;
    const sp = STOPS[STOPS.length - 2].spin, bl = LAND.betelgeuse;
    if (t > sp && t < bl + 0.12) { const k = smooth(sp, bl, t); riser = riserF.run(white(), 250 + 1500 * k * k, 0.45).bp * k * k * 0.22 * (1 - smooth(bl - 0.02, bl + 0.1, t)); }
    const wet = (dl + dr) * 0.5 + braam * 0.8 + shim + click * 0.15;
    const wl = revL.run(wet * 0.6), wr = revR.run(wet * 0.6);
    const tk = tick * 0.07, ck = click * 0.32;
    let l = surf + crowd + traffic * 0.8 + tk + ck + dl + braam + rl + rr * 0.3 + hs + wind + shim + sub + riser + wl * 0.9;
    let r = surf * 0.95 + crowd * 0.9 + traffic + tk + ck + dr + braam + rr + rl * 0.3 + hs2 + wind * 0.9 + shim * 0.9 + sub + riser + wr * 0.9;
    L[n] = l; R[n] = r;
  }
  // the owner's scream (sfx/scream.mp3): everyone screams at Arcturus's giant disc. The file's 0.57 s of silence is cut
  {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx', 'scream.mp3'),
      '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    const n0 = Math.round((SCREAM_AT - T0) * SR), len = sc.length >> 1;
    let mix = 0, own = 0;
    for (let i = 0; i < len; i++) { mix += L[n0 + i] ** 2 + R[n0 + i] ** 2; own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2; }
    const g = 1.4 * Math.sqrt(mix / own) * 0.4;
    for (let i = 0; i < len; i++) {
      const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
      L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
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
