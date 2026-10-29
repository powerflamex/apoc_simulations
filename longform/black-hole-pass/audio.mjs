// Soundtrack for "What if a black hole passed Earth?" (no voice), synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// Music in the black hole Short's style (a minor drone that darkens chapter by chapter, trailer "braam" hits on each
// gold popup, a soft low boom at each chapter stamp, sub-bass as the hole nears, a riser into the white-out that cuts
// to silence, a soft chord under the closing question). Under it, the world on screen: the avenue's murmur and
// traffic, horns in the gridlock, sirens in the last hour; the highway's idling engines; the subway's rumble and the
// torrent; wind once gravity flips; space is music only (plus a deep shimmer as planets tear). Your phone: a soft
// double buzz with a chime for each text, the alert tone for emergency alerts. No sharp clicks: every onset is soft.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, SHOTS, NOTES, POPS, CHAPTERS, FF_LEN, V_FF, state } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;

class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
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
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));
// a soft gate: 1 inside [a, b], with fades of f seconds
const gate = (t, a, b, f = 0.4) => smooth(a - f, a, t) * (1 - smooth(b, b + f, t));

// which scene plays at video time v (the flash-forward's sound is the end's)
function sceneAt(v) {
  for (const s of SHOTS) if (v >= s[0] && v < s[1]) return s[2];
  return 'end';
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(4242);

  // the music: chords per chapter (Hz), darker and lower each time
  const CHORDS = [
    [0, [73.42, 110, 146.83, 174.61]],     // (the flash-forward: the end's cluster)
    [5, [110, 130.81, 164.81, 220]],       // A minor: a normal night
    [24, [87.31, 110, 130.81, 174.61]],    // F: Neptune
    [50, [98, 116.54, 146.83, 196]],       // G minor
    [95, [82.41, 98, 123.47, 164.81]],     // E minor: the highway
    [150, [73.42, 110, 146.83, 174.61]],   // D minor: the last hour
    [200, [69.3, 82.41, 103.83, 138.59]],  // the subway: dissonant
    [252, [65.41, 69.3, 98, 130.81]],      // the end
    [300, [55, 58.27, 82.41, 110]],        // falling in
  ];
  const chordAt = (v) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (v >= ts) c = ch; return c; };
  const HITS = POPS.map(([t], i) => [t, 0.55 + 0.05 * i, [55, 49, 46.25, 41.2, 55, 49, 43.65, 41.2, 36.7, 32.7][i] || 41.2]);
  HITS.unshift([0.02, 0.9, 41.2]);                         // the first frame lands with a hit under the title
  const BOOMS = CHAPTERS.filter((c) => c.stamp).map((c) => c.v);
  // horns in the gridlock (avenue and highway), sirens in the last hour
  const horns = [];
  for (let i = 0; i < 46; i++) { const t = 38 + R0() * 112; if (sceneAt(t) === 'street' || sceneAt(t) === 'highway') horns.push([t, [349, 392, 415, 440, 466][Math.floor(R0() * 5)], R0() * 2 - 1, 0.25 + R0() * 0.5]); }
  horns.sort((a, b) => a[0] - b[0]);

  const ph = new Float64Array(16);
  let brownL = 0, brownR = 0, hornPh = 0, sirPh = 0, subPh = 0, endPh = [0, 0, 0, 0], buzzPh = 0, chimePh = [0, 0], alertPh = [0, 0], shimPh = [0, 0, 0];
  const braamPh = [0, 0, 0, 0];
  const cityLP = new OnePole(260), cityLP2 = new OnePole(300), murmurF = new SVF(), murmurF2 = new SVF();
  const engineLP = new OnePole(90), rumbleLP = new OnePole(60), torrentF = new SVF(), torrentF2 = new SVF();
  const windL = new SVF(), windR = new SVF(), riserF = new SVF(), braamLP = new SVF(), whooshF = new SVF();
  const droneLP = [new OnePole(400), new OnePole(400)];
  const revL = new Reverb(1), revR = new Reverb(2);
  // the shot cuts (for a soft whoosh into and out of space)
  const SPACE_CUTS = SHOTS.filter((s) => s[2] === 'space').flatMap((s) => [s[0], s[1]]);

  let s = state(0);
  for (let n = 0; n < N; n++) {
    const v = n / SR;
    const t = v < FF_LEN ? V_FF + v : v;     // the story moment (the flash-forward plays the end's sound)
    if (n % 64 === 0) s = state(v);
    const white = () => R0() * 2 - 1;
    const scene = sceneAt(v);
    const ffScene = v < FF_LEN ? 'street' : scene;
    const silent = v >= 330.5 && v < 333;

    // ---- the avenue: city hum + crowd murmur, then panic, then the last hour, then the flood and the wind ----
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const onStreet = ffScene === 'street' ? 1 : 0;
    const cityG = onStreet * (0.28 + 0.12 * s.panic) * (1 - 0.6 * smooth(262, 290, t));
    const city = cityLP.run(brownL) * cityG, city2 = cityLP2.run(brownR) * cityG;
    const murmG = onStreet * (0.06 + 0.07 * s.panic) * (1 - smooth(255, 270, t)) + (scene === 'subway' ? 0.08 * (1 - smooth(234, 244, v)) : 0);
    const mm = white();
    const murm = (murmurF.run(mm, 520 + 180 * Math.sin(v * 3.1) * Math.sin(v * 1.7), 0.7).bp + murmurF2.run(mm, 900 + 260 * Math.sin(v * 2.3), 0.8).bp * 0.6) * murmG * (0.75 + 0.25 * Math.sin(v * 5.3) * Math.sin(v * 2.9));

    // horns
    let horn = 0, hornPan = 0;
    for (const [ht, hf, hp, hd] of horns) {
      const dt = v - ht;
      if (dt > 0 && dt < hd) { hornPh += hf / SR; horn += (saw(hornPh) * 0.5 + saw(hornPh * 1.5) * 0.3) * Math.min(dt / 0.03, 1) * Math.min((hd - dt) / 0.08, 1) * 0.02; hornPan = hp; }
    }
    // sirens in the last hour (wailing)
    const sirG = (scene === 'street' ? 1 : 0) * gate(v, 152, 199, 2) * 0.035;
    sirPh += (650 + 280 * Math.sin(v * TAU * 0.18)) / SR;
    const siren = sirG > 0 ? Math.sin(TAU * sirPh) * sirG * (0.7 + 0.3 * Math.sin(v * 0.4)) : 0;

    // the highway: idling engines (a low throb) and the odd horn
    const engG = scene === 'highway' ? 0.16 : 0;
    const engine = engineLP.run(white()) * engG * (2.4 + Math.sin(v * TAU * 7) * 0.6);

    // the subway: rumble (stronger in the shaking), the torrent, the roar of water
    const rumG = scene === 'subway' ? 0.15 + 0.35 * gate(v, 214.5, 219, 1) + 0.15 * smooth(220, 225, v) : 0;
    const rumble = rumbleLP.run(white()) * rumG * 5;
    const torG = scene === 'subway' ? 0.22 * smooth(219.5, 221.5, v) * (1 - 0.3 * smooth(244, 252, v)) : 0;
    const tw = white();
    const torrent = (torrentF.run(tw, 900, 0.4).bp * 0.8 + torrentF2.run(tw, 2600, 0.6).bp * 0.4) * torG;

    // ---- the end: wind once gravity goes (and while you're lifted), then the fall's roar ----
    const windG = onStreet * 0.17 * smooth(262, 296, t) + (scene === 'fall' ? 0.17 * (1 - smooth(316, 326, v)) : 0);
    const wfc = 380 + 700 * smooth(262, 300, t) + 150 * Math.sin(v * 0.37) + 80 * Math.sin(v * 1.3);
    const wl = windL.run(white(), wfc, 0.35).bp * windG * 1.4;
    const wr = windR.run(white(), wfc * 1.12, 0.35).bp * windG * 1.4;

    // ---- your phone ----
    let buzz = 0, chime = 0, alert = 0;
    for (const [nt, , kind] of NOTES) {
      const dt = v - nt;
      if (dt < -0.05 || dt > 2.4) continue;
      if (kind === 'alert') {
        // the alert tone (two tones together, pulsing), softened
        if (dt < 2.2) { alertPh[0] += 853 / SR; alertPh[1] += 960 / SR; const pulse = smooth(0, 0.05, dt % 0.55) * (1 - smooth(0.4, 0.48, dt % 0.55)); alert += (Math.sin(TAU * alertPh[0]) + Math.sin(TAU * alertPh[1])) * pulse * 0.03 * (1 - smooth(1.8, 2.2, dt)); }
      } else if (kind !== 'me') {
        // two short buzzes + a soft two-note chime
        const b = gate(dt, 0.02, 0.22, 0.03) + gate(dt, 0.36, 0.56, 0.03);
        buzzPh += 165 / SR;
        buzz += Math.sin(TAU * buzzPh) * b * 0.05 * (0.7 + 0.3 * Math.sin(TAU * buzzPh * 0.5));
        const c1 = env(dt - 0.05, 0.008, 0.25), c2 = env(dt - 0.2, 0.008, 0.35);
        chimePh[0] += 1318.5 / SR; chimePh[1] += 1760 / SR;
        chime += (Math.sin(TAU * chimePh[0]) * c1 + Math.sin(TAU * chimePh[1]) * c2) * 0.022;
      } else {
        // your own message sending: a soft whoosh up
        const k = gate(dt, 0.05, 0.35, 0.08);
        chime += whooshF.run(white(), 1200 + 3000 * clamp(dt / 0.4), 0.5).bp * k * 0.06;
      }
    }

    // ---- music: drone ----
    const ch = chordAt(v);
    const dG = (0.09 + 0.04 * smooth(24, 150, v) + 0.02 * smooth(200, 300, v) + (scene === 'space' || scene === 'fall' ? 0.03 : 0)) * smooth(0, 1.2, v) * (silent || v >= 333 ? 0 : 1);
    const cutoff = 300 + 500 * smooth(5, 150, v) + 600 * smooth(200, 300, v) + 1500 * smooth(318, 330, v);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    const bend = 1 + 0.07 * Math.pow(smooth(312, 330.4, v), 2);
    for (let k = 0; k < ch.length; k++) {
      const f = ch[k] * bend;
      ph[k] += (f * 0.997) / SR; ph[k + 4] += (f * 1.003) / SR;
      dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6);
      dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dG; dr = droneLP[1].run(dr) * dG;

    // braam hits on the popups (and the first frame), a soft low boom at each chapter stamp
    let braam = 0;
    for (const [ht, hs, hf] of HITS) {
      const dt = v - ht;
      if (dt > -0.01 && dt < 7) {
        const e = env(dt, 0.07, 1.9) * hs;
        for (let k = 0; k < 4; k++) braamPh[k] += (hf * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamLP.run(braam, 900, 0.6).lp * 0.15;
    let boom = 0;
    for (const bt of BOOMS) { const dt = v - bt; if (dt > -0.01 && dt < 4) boom += Math.sin(TAU * (42 * dt - 6 * dt * dt)) * env(dt, 0.04, 0.9) * 0.22; }

    // sub-bass as the hole nears, the quake
    subPh += (32 + 5 * Math.sin(v * 0.7)) / SR;
    const subG = (0.05 * smooth(150, 200, t) + 0.09 * smooth(252, 299, t) + (scene === 'fall' ? 0.07 : 0)) * (silent ? 0 : 1);
    const sub = Math.sin(TAU * subPh) * subG;

    // a deep shimmer as the planets tear (space), and a soft whoosh at each cut into and out of space
    let shim = 0;
    const shG = scene === 'space' ? 0.03 * gate(v, 28, 36, 2) + 0.03 * gate(v, 66, 77, 2) + 0.04 * gate(v, 110, 119.5, 2) : 0;
    if (shG > 0) for (let k = 0; k < 3; k++) { shimPh[k] += ([880, 1108.7, 1318.5][k] * (1 + 0.003 * Math.sin(v * (3 + k)))) / SR; shim += Math.sin(TAU * shimPh[k]) * (0.5 + 0.5 * Math.sin(v * (4 + k * 2.3))) * shG; }
    let whoosh = 0;
    for (const c of SPACE_CUTS) { const dt = v - c; if (dt > -0.6 && dt < 0.5) whoosh += riserF.run(white(), 300 + 2500 * clamp((dt + 0.6) / 1.1), 0.4).bp * Math.sin(Math.PI * clamp((dt + 0.6) / 1.1)) * 0.12; }

    // the riser into the white-out (from 316), hard cut at 330.5
    let riser = 0;
    if (v > 316 && v < 330.5) { const k = smooth(316, 330.4, v); riser = riserF.run(white(), 400 + 7000 * k * k, 0.25).bp * k * k * 0.2 * (1 - smooth(330.45, 330.5, v)); }
    // the closing: a soft distant chord
    let endc = 0;
    if (v > 333) {
      const e = smooth(333, 335, v) * (1 - smooth(338.4, 339.9, v));
      [110, 164.81, 220, 261.63].forEach((f, k) => { endPh[k] += f / SR; endc += Math.sin(TAU * endPh[k]) * [0.5, 0.35, 0.3, 0.18][k]; });
      endc *= e * 0.06;
    }

    // ---- mix ----
    const wetIn = (dl + dr) * 0.5 + braam * 0.7 + shim + endc + chime * 0.5;
    const rl = revL.run(wetIn * 0.6), rr = revR.run(wetIn * 0.6);
    let l = city * 0.9 + city2 * 0.2 + murm + dl + braam + boom + sub + engine + rumble + torrent + wl + shim + riser + endc + rl * 0.9 + horn * (1 - hornPan) * 0.5 + siren * 0.9 + buzz + chime + alert + whoosh;
    let r = city2 * 0.9 + city * 0.2 + murm * 0.9 + dr + braam + boom + sub + engine * 0.95 + rumble + torrent * 0.9 + wr + shim * 0.9 + riser + endc + rr * 0.9 + horn * (1 + hornPan) * 0.5 + siren * 0.7 + buzz + chime + alert + whoosh;
    if (silent) { l = 0; r = 0; }
    L[n] = l; R[n] = r;
  }

  // master: soft clip + normalize to -1 dBFS, 5 ms fades
  let peak = 0;
  for (let n = 0; n < N; n++) { L[n] = Math.tanh(L[n] * 1.3); R[n] = Math.tanh(R[n] * 1.3); peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n])); }
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
