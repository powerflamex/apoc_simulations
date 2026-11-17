// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A cosmic sightseeing topic, so music carries it (like star-picker and planet-picker): a drone whose chord changes with
// every place, a trailer "braam" and a whoosh on every wipe, the picker's click as the cursor locks on. On top, each
// place's own sound, and a sound for the one thing that happens to you there:
//   Venus: a deep furnace roar; the drink flashing to steam (a hiss); a soft thump as the burnt seat gives way
//   Mars: the drink fizzing (soft pitched bubbles, no clicks); the dust storm's roar growing until it swallows you
//   Mercury: no air, so almost nothing: the music, a low groan as the chair sags, a glassy shimmer as the drink bursts
//   Titan: soft footfalls as you run, then wind and a whump on every downstroke of the wings
//   Jupiter: falling: a rush of air rising; a whoosh as you punch through the clouds; thunder after each strike
//   Neptune: a screaming gale that hits as the glass is torn away, and again as you're blown off
//   Pluto: dead quiet, glassy tinks as the frost grows, a shower of them as the drink shatters
//   Earth: a wave surging up the sand, two gull calls; then a riser into the white flash
// The owner's scream (sfx/scream.mp3) once, in the first second (on Venus).
// The loop: the track is made in one run that starts before frame 0; under the white at the end it fades over into
// the run's own lead-in to frame 0, so the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, T_FLASH, LOOP, STOPS, LAND, stopAt, WIPE } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAMS = [[0.1, 0.8]];
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
  run(x, fb = 0.86, damp = 0.4) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

// per place: the drone's chord (Hz), its level, the braam's strength
const MUSIC = {
  venus: { ch: [55, 82.41, 110, 130.81], dg: 0.09, braam: 1.2 },
  mars: { ch: [73.42, 110, 146.83, 174.61], dg: 0.07, braam: 0.8 },
  mercury: { ch: [61.74, 92.5, 123.47, 155.56], dg: 0.08, braam: 1.0 },
  titan: { ch: [65.41, 98, 130.81, 164.81], dg: 0.07, braam: 0.85 },
  jupiter: { ch: [49, 73.42, 98, 116.54], dg: 0.09, braam: 1.3 },
  neptune: { ch: [58.27, 87.31, 116.54, 138.59], dg: 0.08, braam: 1.15 },
  pluto: { ch: [69.3, 103.83, 138.59, 164.81], dg: 0.06, braam: 0.9 },
  earth: { ch: [87.31, 130.81, 174.61, 220], dg: 0.05, braam: 0.6 },
};

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const lands = STOPS.slice(1).map((s) => s.land);
  const ph = new Float64Array(16);
  const droneLP = [new OnePole(400), new OnePole(400)], braamF = new SVF(), whF = new SVF(), whF2 = new SVF();
  const bedL = new SVF(), bedR = new SVF(), bedLP = new OnePole(500), hissF = new SVF(), hissF2 = new SVF(), subLP = new OnePole(60);
  const flapF = new SVF(), evF = new SVF(), seaF = new SVF(), seaLP = new OnePole(700), gullPh = [0, 0], riserF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const braamPh = [0, 0, 0, 0];
  const bub = [];          // Mars: soft bubbles (sine blips with a smooth envelope)
  { const r = rng(5); for (let k = 0; k < 90; k++) bub.push({ t: LAND.mars + 0.08 + r() * 2.2, f: 700 + r() * 1300, a: 0.3 + 0.7 * r() }); }
  const tinks = [];        // Pluto: glassy tinks as the frost grows
  { const r = rng(9); for (let k = 0; k < 26; k++) tinks.push({ t: LAND.pluto + 0.1 + r() * 1.2, f: 2600 + r() * 2600, a: 0.3 + 0.7 * r() }); for (let k = 0; k < 70; k++) tinks.push({ t: LAND.pluto + 3.0 + 0.5 * r() ** 2, f: 1800 + r() * 4200, a: 0.5 + 0.9 * r() }); }
  // Mercury's burst: a shimmer of glassy tinks
  { const r = rng(13); for (let k = 0; k < 40; k++) tinks.push({ t: LAND.mercury + 3.0 + 0.6 * r() ** 2, f: 3000 + r() * 3500, a: 0.3 + 0.6 * r() }); }
  let bubPh = 0, hitPh = 0, groanPh = 0, thudPh = 0, stepPh = 0;
  const thunderF = new SVF(), punchF = new SVF();
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const white = () => R0() * 2 - 1;
    const i = stopAt(t), st = STOPS[i], key = st.key, m = MUSIC[key], mp = MUSIC[STOPS[Math.max(0, i - 1)].key];
    const e = i === 0 ? t : t - st.land;
    const sw = i === 0 ? 1 : smooth(st.land - WIPE / 2, st.land + WIPE / 2, t);
    const fade = 1 - smooth(T_FLASH + 0.25, T_SWITCH - 0.05, t);
    // --- the drone ---
    const dg = (mp.dg + (m.dg - mp.dg) * sw) * fade;
    const cutoff = 360 + 90 * i;
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    for (let k = 0; k < 4; k++) {
      const f = mp.ch[k] + (m.ch[k] - mp.ch[k]) * sw;
      ph[k] += (f * 0.997) / SR; ph[k + 4] += (f * 1.003) / SR;
      dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dg; dr = droneLP[1].run(dr) * dg;
    // --- the wipes: a braam, a whoosh across, the picker's click ---
    let braam = 0, wh = 0, click = 0;
    for (let k = 1; k < STOPS.length; k++) {
      const dt = t - STOPS[k].land;
      if (dt > -0.4 && dt < 5) {
        const mm = MUSIC[STOPS[k].key];
        const ee = env(dt + 0.02, 0.04, 1.4) * mm.braam;
        const hf = mm.ch[0] / 2;
        for (let j = 0; j < 4; j++) braamPh[j] += (hf * [1, 1.004, 2, 3.01][j]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * ee;
        const u = (dt + 0.3) / 0.55;
        if (u > 0 && u < 1) wh += Math.sin(Math.PI * u) ** 2 * (k === 7 ? 0.7 : 1);
        if (dt >= 0 && dt < 0.25) click += (Math.sin(TAU * (520 + 300 * Math.exp(-dt / 0.01)) * dt) * 0.8 + Math.sin(TAU * 150 * dt) * 0.9) * Math.min(1, dt / 0.0008) * Math.exp(-dt / 0.045);
      }
    }
    braam = braamF.run(braam, 850, 0.6).lp * 0.16 * fade;
    let whoosh = 0;
    if (wh > 0) { whoosh = whF.run(white(), 500 + 2600 * wh, 0.7).bp * wh * 0.35 + whF2.run(white(), 300 + 900 * wh, 0.9).bp * wh * 0.25; }
    // --- each place's bed: a band of noise (centre Hz, level) and a hiss ---
    let bedF = 200, bedG = 0, hisF = 3000, hisG = 0;
    if (key === 'venus') { bedF = 120; bedG = 0.28; hisF = 1800; hisG = 0.02; }
    else if (key === 'mars') { const w = smooth(1.0, 4.0, e); bedF = 140 + 220 * w; bedG = 0.04 + 0.42 * w; hisF = 3600; hisG = 0.01 + 0.05 * w; }
    else if (key === 'mercury') { bedF = 90; bedG = 0.02; }
    else if (key === 'titan') { const g = smooth(1.6, 3.0, e); bedF = 300 + 250 * g; bedG = 0.07 + 0.22 * g; hisF = 2600; hisG = 0.008 + 0.03 * g; }
    else if (key === 'jupiter') { const f = smooth(0, 3, e); bedF = 220 + 500 * f; bedG = 0.12 + 0.3 * f; hisF = 2200 + 1500 * f; hisG = 0.02 + 0.05 * f; }
    else if (key === 'neptune') { const g = smooth(0.15, 0.45, e) + 0.5 * smooth(2.8, 3.3, e); bedF = 350 + 250 * g; bedG = 0.08 + 0.4 * g; hisF = 2800; hisG = 0.02 + 0.06 * g; }
    else if (key === 'pluto') { bedF = 150; bedG = 0.01; }
    else if (key === 'earth') { bedF = 250; bedG = 0.04; }
    // (beds cross over during the wipe)
    const bg = bedG * (i === 0 ? 1 : 0.35 + 0.65 * sw) * fade;
    const lf = bedF * (1 + 0.15 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 2.3));
    const bl = bedLP.run(bedL.run(white(), lf, 0.55).bp) * bg * 2.4;
    const br = bedR.run(white(), lf * 1.1, 0.55).bp * bg * 1.2;
    const hs = hissF.run(white(), hisF, 1.2).bp * hisG * fade, hs2 = hissF2.run(white(), hisF * 1.3, 1.2).bp * hisG * fade;
    // --- the events ---
    let ev = 0;
    if (key === 'venus' && e > 0.05) { const k = smooth(0.05, 0.2, e) * (1 - smooth(0.9, 1.6, e)); ev += evF.run(white(), 2400 + 1500 * Math.sin(e * 3), 0.9).bp * 0.4 * k; }
    // Venus: the seat gives way under you: a soft deep thump (a falling sine, no noise burst)
    if (key === 'venus' && e > 3.3 && e < 4.3) { const d = e - 3.3; thudPh += (45 + 50 * Math.exp(-d / 0.06)) / SR; ev += Math.sin(TAU * thudPh) * Math.min(1, d / 0.01) * Math.exp(-d / 0.22) * 0.5; }
    if (key === 'mars') {
      for (const b of bub) { const dt = t - b.t; if (dt > 0 && dt < 0.06) ev += Math.sin(TAU * b.f * (1 + 2 * dt) * dt) * Math.sin(Math.PI * dt / 0.06) ** 2 * 0.05 * b.a; }
    }
    // Mercury: the chair groans as it sags (fast), then the drink's burst shimmers
    if (key === 'mercury' && e > 0.05 && e < 1.6) { const k = Math.sin(Math.PI * clamp((e - 0.05) / 1.5, 0, 1)); groanPh += (60 + 18 * Math.sin(e * 4) - 25 * e) / SR; ev += (saw(groanPh) * 0.6 + Math.sin(TAU * groanPh * 2) * 0.4) * k * 0.1; }
    if (key === 'mercury' || key === 'pluto') {
      for (const b of tinks) { const dt = t - b.t; if (dt > 0 && dt < 0.5) ev += Math.sin(TAU * b.f * dt) * Math.min(1, dt / 0.002) * Math.exp(-dt / 0.09) * 0.03 * b.a; }
    }
    // Titan: soft footfalls while you run, then the wingbeats while you glide
    if (key === 'titan' && e > 0.45 && e < 1.95) {
      const ph = (e * 9.5) / Math.PI, fr = ph - Math.floor(ph);
      if (fr < 0.25) { const d = fr * Math.PI / 9.5; stepPh += (70 + 40 * Math.exp(-d / 0.02)) / SR; ev += Math.sin(TAU * stepPh) * Math.min(1, d / 0.004) * Math.exp(-d / 0.035) * 0.35; }
    }
    if (key === 'titan' && e > 1.9) {
      const cyc = ((e - 1.9) * 5.5) / TAU;
      const fr = cyc - Math.floor(cyc);
      const k = Math.sin(Math.PI * clamp((fr - 0.1) / 0.4, 0, 1)) ** 2;
      ev += flapF.run(white(), 240 + 200 * k, 0.6).bp * k * 0.55;
    }
    // Jupiter: the rush as you punch through the cloud deck, then thunder after each strike
    if (key === 'jupiter') {
      const pk = Math.exp(-(((e - 3.0) / 0.35) ** 2));
      ev += punchF.run(white(), 400 + 1600 * pk, 0.5).bp * pk * 0.5;
      for (const tb of [3.75, 4.55, 4.72, 5.5]) { const d = e - tb - 0.12; if (d > 0 && d < 2.5) ev += thunderF.run(white(), 90 + 60 * Math.exp(-d / 0.3), 0.7).bp * Math.min(1, d / 0.05) * Math.exp(-d / 0.9) * 1.2 * (tb === 4.72 ? 0.6 : 1); }
    }
    // Pluto's shatter: a soft low knock under the tinks
    if (key === 'pluto' && e > 3.0 && e < 3.8) { const d = e - 3.0; thudPh += (90 + 80 * Math.exp(-d / 0.03)) / SR; ev += Math.sin(TAU * thudPh) * Math.min(1, d / 0.005) * Math.exp(-d / 0.12) * 0.3; }
    if (key === 'earth') {
      const surf = 0.35 + 0.65 * (smooth(0.0, 0.8, e) - 0.6 * smooth(1.2, 2.8, e));
      ev += seaLP.run(seaF.run(white(), 600 + 300 * surf, 0.4).bp) * 0.5 * (0.4 + 0.6 * surf * surf) * fade;
      for (const [gt, gf] of [[LAND.earth + 0.5, 2100], [LAND.earth + 1.5, 2300]]) {
        const dt = t - gt;
        if (dt > 0 && dt < 0.45) { gullPh[0] += (gf * (1 - 0.35 * dt / 0.45) + 60 * Math.sin(dt * 90)) / SR; ev += Math.sin(TAU * gullPh[0]) * Math.sin(Math.PI * dt / 0.45) ** 1.5 * 0.035; }
      }
    }
    // the white flash: a riser, then a soft deep thump
    let riser = 0, hit = 0;
    if (t > T_FLASH - 1.6 && t < T_FLASH + 0.3) { const k = smooth(T_FLASH - 1.6, T_FLASH, t); riser = riserF.run(white(), 300 + 2600 * k * k, 0.45).bp * k * k * 0.18 * (1 - smooth(T_FLASH, T_FLASH + 0.3, t)); }
    const dh = t - T_FLASH;
    if (dh > 0 && dh < 1.2) { hitPh += (40 + 60 * Math.exp(-dh / 0.09)) / SR; hit = Math.sin(TAU * hitPh) * Math.min(1, dh / 0.012) * Math.exp(-dh / 0.3) * 0.45; }
    const sub = subLP.run(white()) * 2.0 * (key === 'jupiter' ? 0.25 * smooth(0, 3, e) : key === 'venus' ? 0.15 : key === 'mars' ? 0.25 * smooth(2, 4, e) : 0.05) * fade;
    const wet = (dl + dr) * 0.5 + braam * 0.8 + click * 0.15 + ev * 0.3;
    const wl = revL.run(wet * 0.6), wr = revR.run(wet * 0.6);
    const ck = click * 0.3;
    L[n] = dl + braam + whoosh + ck + bl + br * 0.3 + hs + ev + sub + riser + hit + wl * 0.9;
    R[n] = dr + braam + whoosh * 0.9 + ck + br + bl * 0.3 + hs2 + ev + sub + riser + hit + wr * 0.9;
  }
  // the owner's scream (sfx/scream.mp3), its silent lead-in cut; its level follows the mix around it
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
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), swn = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = L[o0 + n], r = R[o0 + n];
    if (n >= swn) {
      const k = Math.min(1, (n - swn) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
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
