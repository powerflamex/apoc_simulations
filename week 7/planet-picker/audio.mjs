// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A cosmic topic, so music carries it (like the black hole's and star-picker's): a drone whose chord changes with
// every planet, a trailer "braam" on every landing (bigger for the bigger planets), sub-bass. On top: the picker (a
// soft tick for every slot the cursor passes, a deeper click when it locks on) and each planet's own low roar, deeper
// and louder with its size. The beach under it all (surf, voices, a little traffic); the owner's scream
// (sfx/scream.mp3) in the first second, at Jupiter filling the sky, and again as the sea starts up the beach.
// The ending: the sea's roar swells from the moment Jupiter lands, a riser as the wall comes in, a deep hit as it
// reaches the lens, then everything dies away under the white.
// The loop: the whole track is made in one run that starts before frame 0, so the moments just before the first frame
// exist; under the white cover at the end the track fades over into them, and the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STOPS, LAND, cursorAt, stopAt, T_WALL, T_HIT, T_RISE } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAMS = [[0.12, 1.0], [T_RISE + 0.5, 0.8]];     // [when, how loud]: Jupiter in the sky; the sea coming up the beach
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

// per stop: the drone's chord, the braam's strength, the planet's roar (low band: centre Hz, gain) and hiss (high band)
const MUSIC = {
  moon0: { ch: [110, 164.81, 220, 261.63], dg: 0.028, braam: 0, low: [300, 0], hiss: [3000, 0] },
  jup0: { ch: [55, 82.41, 110, 130.81], dg: 0.095, braam: 1.35, low: [150, 0.3], hiss: [2400, 0.02] },
  moon: { ch: [110, 164.81, 220, 261.63], dg: 0.03, braam: 0.3, low: [300, 0.01], hiss: [3000, 0] },
  mars: { ch: [73.42, 110, 146.83, 174.61], dg: 0.062, braam: 0.62, low: [380, 0.08], hiss: [2600, 0.012] },
  venus: { ch: [87.31, 130.81, 174.61, 220], dg: 0.066, braam: 0.75, low: [330, 0.08], hiss: [3400, 0.035] },
  neptune: { ch: [65.41, 98, 130.81, 155.56], dg: 0.08, braam: 1.0, low: [230, 0.18], hiss: [2600, 0.02] },
  saturn: { ch: [61.74, 92.5, 123.47, 146.83], dg: 0.086, braam: 1.2, low: [190, 0.25], hiss: [2400, 0.025] },
  jupiter: { ch: [55, 82.41, 110, 130.81], dg: 0.1, braam: 1.55, low: [150, 0.34], hiss: [2400, 0.03] },
};

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;                         // the run starts before frame 0 (filters settle, the loop's lead-in)
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const J = LAND.jupiter;
  // the picker's ticks: every time the cursor passes onto another slot; the click: every landing
  const ticks = [];
  {
    let prev = Math.round(cursorAt(T0));
    for (let t = T0; t < VIDEO_DURATION; t += 0.0005) {
      const p = Math.round(cursorAt(t));
      if (p !== prev) { ticks.push(t); prev = p; }
    }
  }
  const lands = STOPS.slice(1).map((s) => s.land);
  const ph = new Float64Array(16);
  const surfLP = new OnePole(600), surfLP2 = new OnePole(420), crowdF = new SVF(), crowdF2 = new SVF(), trafLP = new OnePole(180);
  const lowL = new SVF(), lowR = new SVF(), lowLP = new OnePole(700), hissF = new SVF(), hissF2 = new SVF(), subLP = new OnePole(60);
  const droneLP = [new OnePole(400), new OnePole(400)], braamF = new SVF(), riserF = new SVF();
  const seaL = new SVF(), seaR = new SVF(), seaLP = new OnePole(500), washF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const braamPh = [0, 0, 0, 0];
  let bL = 0, hitPh = 0;
  let ti = 0;
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const white = () => R0() * 2 - 1;
    const i = stopAt(t), st = STOPS[i], m = MUSIC[st.id], mp = MUSIC[STOPS[Math.max(0, i - 1)].id];
    const sw = i === 0 ? 1 : smooth(st.land, st.land + 0.08, t);
    const fade = 1 - smooth(T_HIT + 0.15, T_SWITCH - 0.1, t);     // everything dies away under the white
    // --- the beach: surf, voices (a stir at every landing, shouting as the sea comes up), a little traffic ---
    const swell = 0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
    const surf = surfLP2.run(surfLP.run(white())) * 0.42 * swell * fade;
    const vox = crowdF.run(white(), 700 + 300 * Math.sin(t * 3.1), 2.2).bp * 0.06 + crowdF2.run(white(), 1100 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.04;
    let stir = 0;
    for (let k = 1; k < STOPS.length; k++) { const dt = t - STOPS[k].land; if (dt > 0 && dt < 4) stir += MUSIC[STOPS[k].id].braam * smooth(0.05, 0.4, dt) * Math.exp(-dt / 1.3); }
    const crowdG = (0.75 + 1.0 * stir + 1.6 * smooth(T_RISE, T_RISE + 2, t) * (1 - 0.6 * smooth(J + 7, T_WALL, t))) * fade;
    const crowd = vox * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * crowdG;
    bL = clamp(bL + white() * 0.02, -1, 1) * 0.998;
    const traffic = trafLP.run(bL) * 0.22 * fade;
    // --- the picker: soft ticks (a short pitched tock, no noise burst), a deeper click on the landing ---
    while (ti + 1 < ticks.length && ticks[ti + 1] <= t) ti++;
    let tick = 0;
    for (let k = Math.max(0, ti - 4); k <= ti && k < ticks.length; k++) {
      const dt = t - ticks[k];
      if (dt >= 0 && dt < 0.03) tick += (Math.sin(TAU * 2350 * dt) * 0.7 + Math.sin(TAU * 1180 * dt) * 0.5) * Math.min(1, dt / 0.0006) * Math.exp(-dt / 0.0055);
    }
    let click = 0;
    for (const lt of lands) {
      const dt = t - lt;
      if (dt >= 0 && dt < 0.25) click += (Math.sin(TAU * (520 + 300 * Math.exp(-dt / 0.01)) * dt) * 0.8 + Math.sin(TAU * 150 * dt) * 0.9) * Math.min(1, dt / 0.0008) * Math.exp(-dt / 0.045);
    }
    // --- the drone (its chord follows the planet; it opens up as the sea rises) ---
    const dg = (mp.dg + (m.dg - mp.dg) * sw) * fade;
    const cutoff = 300 + 130 * Math.min(i, 6) + 1000 * smooth(J + 1, T_HIT, t);
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
        const mm = MUSIC[STOPS[k].id];
        const e = env(dt, 0.04, 1.6) * mm.braam;
        const hf = mm.ch[0] / 2;
        for (let j = 0; j < 4; j++) braamPh[j] += (hf * [1, 1.004, 2, 3.01][j]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamF.run(braam, 850, 0.6).lp * 0.17 * fade;
    // --- the planet's own sound: a roar (low band) and a hiss (high band), swelling in after it lands ---
    const swellIn = i === 0 ? 1 : 0.55 + 0.45 * smooth(st.land, st.land + 1.6, t);
    const lowF = mp.low[0] + (m.low[0] - mp.low[0]) * sw, lowG = (mp.low[1] + (m.low[1] - mp.low[1]) * sw) * swellIn * fade;
    const hisF = mp.hiss[0] + (m.hiss[0] - mp.hiss[0]) * sw, hisG = (mp.hiss[1] + (m.hiss[1] - mp.hiss[1]) * sw) * swellIn * fade;
    const lf = lowF * (1 + 0.15 * Math.sin(t * 0.5) + 0.08 * Math.sin(t * 1.7));
    const rl = lowLP.run(lowL.run(white(), lf, 0.5).bp) * lowG * 2.4;
    const rr = lowR.run(white(), lf * 1.1, 0.5).bp * lowG * 1.0;
    const hs = hissF.run(white(), hisF, 1.2).bp * hisG, hs2 = hissF2.run(white(), hisF * 1.3, 1.2).bp * hisG;
    // --- the ending: the sea's roar (wide rushing water, swelling), a sub rumble, a riser into the hit ---
    const sea = Math.pow(smooth(J + 0.8, T_WALL, t), 1.5) * 0.3 + Math.pow(smooth(T_WALL - 0.5, T_HIT, t), 2) * 0.75;
    const seaF = 260 + 500 * smooth(T_WALL, T_HIT, t);
    const sl = seaLP.run(seaL.run(white(), seaF * (1 + 0.2 * Math.sin(t * 0.9)), 0.35).bp) * sea * 2.6 * fade;
    const sr2 = seaR.run(white(), seaF * 1.25 * (1 + 0.2 * Math.sin(t * 1.3 + 1)), 0.35).bp * sea * 1.1 * fade;
    const sub = subLP.run(white()) * 2.5 * (0.05 * smooth(LAND.neptune, LAND.saturn, t) + 0.1 * smooth(J, J + 4, t) + 0.25 * smooth(T_WALL, T_HIT, t)) * fade;
    let riser = 0;
    if (t > T_WALL && t < T_HIT + 0.1) { const k = smooth(T_WALL, T_HIT, t); riser = riserF.run(white(), 250 + 1700 * k * k, 0.45).bp * k * k * 0.2 * (1 - smooth(T_HIT - 0.03, T_HIT + 0.1, t)); }
    // the hit: a deep thump (a falling sine, no noise burst) and a wash of white water that fades under the white
    let hit = 0;
    const dh = t - (T_HIT - 0.05);
    if (dh > 0 && dh < 1.2) { hitPh += (38 + 70 * Math.exp(-dh / 0.09)) / SR; hit = Math.sin(TAU * hitPh) * Math.min(1, dh / 0.012) * Math.exp(-dh / 0.32) * 0.75; }
    const wash = washF.run(white(), 900 + 600 * Math.sin(t * 2.1), 0.3).bp * 0.5 * smooth(T_HIT - 0.15, T_HIT + 0.05, t) * (1 - smooth(T_HIT + 0.1, T_SWITCH - 0.15, t));
    const wet = (dl + dr) * 0.5 + braam * 0.8 + click * 0.15;
    const wl = revL.run(wet * 0.6), wr = revR.run(wet * 0.6);
    const tk = tick * 0.075, ck = click * 0.32;
    L[n] = surf + crowd + traffic * 0.8 + tk + ck + dl + braam + rl + rr * 0.3 + hs + sub + riser + sl + sr2 * 0.3 + hit + wash + wl * 0.9;
    R[n] = surf * 0.95 + crowd * 0.9 + traffic + tk + ck + dr + braam + rr + rl * 0.3 + hs2 + sub + riser + sr2 + sl * 0.3 + hit + wash * 0.9 + wr * 0.9;
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
