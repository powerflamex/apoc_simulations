// Soundtrack for "What if you watched the universe die?", synced to src/timeline.js (video clock), with the owner's
// narration once he records it.
//   node audio.mjs  -> out/soundtrack.wav
// Music for a cosmic topic (the black hole Short's kind): a slow drone pad that changes chord with each stage and
// thins out as the universe empties, deep soft "braam" swells on the big steps, a sub that grows under the black
// hole, a riser that cuts to silence at the last light. Around it: the terrace at dusk (hill wind, the crowd's
// murmur, the city's far hum), the time-lapse rush, the red giant's low roar, its shells sweeping out (a slow
// whoosh), a thin icy tone and a soft glassy shimmer while the air falls as snow, a tone that sinks while the far
// galaxy reddens and goes, soft low bells as the stars go out, deep booms for the dead stars crashing, the black
// hole's disk roaring, the evaporation's rising fizz, far soft thuds as black holes go out, the last flash; then
// almost nothing; Penrose: a low tone rising into the new Big Bang, the white, and the terrace again.
// No sharp clicks anywhere: every hit has a soft onset.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { state, SEC, VIDEO_DURATION, BEATS, V_FF, FF_LEN, CRASHES, POPS } from './src/timeline.js';
import { VOICE } from './src/voice.js';
import { rng, smooth, clamp } from './src/util.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const TAU = Math.PI * 2;

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 2.0)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.9, damp = 0.4) {
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
const env = (dt, a, d) => (dt < 0 ? 0 : Math.min(dt / a, 1) * Math.exp(-Math.max(0, dt - a) / d));

// the story moment shown at video time t (the flash-forward replays the black hole; the closing shot is the dusk)
const storyOf = (t) => (t < FF_LEN ? V_FF + t : t >= SEC.end + 1 ? SEC.prom + 2 + (t - SEC.end - 1) : t);

// the pad: one chord per stage (video time it is fully in, notes as midi, level, brightness)
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  [0, [33, 40, 45, 48, 52], 0.9, 700],      // flash-forward: A minor, low and wide
  [SEC.walk + 0.5, [43, 50, 55, 59, 62], 0.7, 1200],   // the terrace, time racing: Gmaj7
  [SEC.giant, [40, 47, 52, 55, 59], 0.85, 900],         // the red giant: E minor(add9), heavy
  [SEC.wd, [45, 52, 57, 60, 64, 71], 0.6, 1800],        // the white dwarf: A minor, high and cold
  [SEC.snow + 3.5, [57, 64, 71], 0.35, 2400],           // [silence]: a high glint only
  [SEC.leave, [41, 48, 53, 57, 60], 0.65, 1100],        // the far galaxies: Fmaj7
  [SEC.out, [38, 45, 50, 53, 57], 0.65, 900],           // the stars go out: D minor
  [SEC.last, [26, 38], 0.3, 220],                       // [silence]: a low hum
  [SEC.sunFade + 1, [34, 41, 46], 0.5, 500],            // black dwarf: Bb, bare
  [SEC.dark, [31, 38, 43, 46], 0.6, 600],               // the dark, the crashes: G minor, low
  [SEC.bh, [29, 36, 41, 44, 48], 0.85, 800],            // the black hole: F minor, swelling
  [SEC.fire + 2.5, [29, 36], 0.4, 300],                 // [silence]
  [SEC.atoms, [33, 40, 45, 48], 0.6, 700],              // atoms: A minor
  [SEC.evap + 4.5, [], 0, 400],                         // [silence] as Earth goes
  [SEC.float, [26, 33, 38], 0.5, 350],                  // floating in the dark: D, very low
  [SEC.googol, [26, 33, 38, 45, 50], 0.65, 700],        // a googol years
  [SEC.lastLight, [], 0, 400],                          // the last light [silence]
  [SEC.nothing + 1.5, [21, 33], 0.38, 220],                 // nothing: one low tone
  [SEC.penrose, [33, 40, 45, 52], 0.65, 650],               // Penrose: bare fifths, rising toward the bang
  [SEC.bang - 0.6, [], 0, 400],
  [SEC.end, [45, 52, 57, 61, 64], 0.6, 1000],           // the terrace again
].map(([t, m, g, fc]) => ({ t, f: m.map(N), g, fc }));

function loadVoice() {
  const src = path.join(ROOT, 'voice.m4a');
  if (!fs.existsSync(src)) return null;
  const raw = path.join(ROOT, 'out', 'voice_clean.f32');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  // his Oct 25 take (closet, phone at the cheek): clean (noise ~-64 dB), less boomy than the Big Crunch take but duller
  // at 1.5-6 kHz (~5 dB under it). So: rumble out, a light de-hiss, the low warmth kept, presence and air lifted to
  // where the Big Crunch's final mix sat (which he liked), "s" sounds softened, firm compression so the voice stays
  // up front
  const fx = 'highpass=f=75:p=2,afftdn=nf=-55:nr=4:tn=1,equalizer=f=250:t=q:w=1:g=-0.5,equalizer=f=2300:t=q:w=1.2:g=6,' +
    'equalizer=f=3800:t=q:w=1:g=4,treble=g=8:f=5000,deesser=i=0.3,acompressor=threshold=-28dB:ratio=3.5:attack=10:release=110:makeup=3';
  const tag = raw + '.fx';
  if (!fs.existsSync(raw) || fs.statSync(raw).mtimeMs < fs.statSync(src).mtimeMs || !fs.existsSync(tag) || fs.readFileSync(tag, 'utf8') !== fx) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', fx, '-ac', '1', '-ar', String(SR), '-f', 'f32le', raw]);
    fs.writeFileSync(tag, fx);
  }
  const b = fs.readFileSync(raw);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

export function makeSoundtrack(outFile) {
  const NS = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(NS), R = new Float32Array(NS), V = new Float32Array(NS);
  const R0 = rng(4343);
  const white = () => R0() * 2 - 1;

  // ---- the voice, line by line (short fades at every cut) ----
  const rec = loadVoice();
  if (rec) for (const [a, b, at] of VOICE) {
    const i0 = Math.round(a * SR), n = Math.round((b - a) * SR), o = Math.round(at * SR), f = Math.round(0.02 * SR);
    for (let k = 0; k < n && o + k < NS; k++) V[o + k] += rec[i0 + k] * Math.min(1, k / f, (n - 1 - k) / f);
  }
  if (rec) {   // level: the speech (louder than -40 dBFS in 20 ms blocks) to -17 dBFS RMS
    let e = 0, c = 0;
    const B = Math.round(0.02 * SR);
    for (let i = 0; i + B < NS; i += B) {
      let s = 0;
      for (let k = 0; k < B; k++) s += V[i + k] * V[i + k];
      if (s / B > 1e-4) { e += s; c += B; }
    }
    const g = c ? Math.pow(10, -17 / 20) / Math.sqrt(e / c) : 1;
    for (let i = 0; i < NS; i++) V[i] *= g;
  }
  // ---- how much the bed dips: 1 while the voice talks (from the line table, smoothed) ----
  const duck = new Float32Array(NS);
  if (rec) {
    const on = new Uint8Array(NS);
    for (const [a, b, at] of VOICE) on.fill(1, Math.max(0, Math.round((at - 0.1) * SR)), Math.min(NS, Math.round((at + b - a + 0.15) * SR)));
    let y = 0;
    const att = 1 - Math.exp(-1 / (0.12 * SR)), rel = 1 - Math.exp(-1 / (0.7 * SR)), LA = Math.round(0.2 * SR);
    for (let i = 0; i < NS; i++) { const x = on[Math.min(NS - 1, i + LA)]; y += (x > y ? att : rel) * (x - y); duck[i] = y; }
  }

  // ---- the bed ----
  const windF = [new SVF(), new SVF()], windE = new OnePole(0.4), crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const humLP = new OnePole(140), carF = new SVF(), rushF = [new SVF(), new SVF()], whoompF = new SVF();
  const padLP = [new SVF(), new SVF()], braamLP = new SVF(), giantF = [new SVF(), new SVF()], giantSub = new OnePole(40);
  const shedF = [new SVF(), new SVF()], iceF = [new SVF(), new SVF()], boomF = CRASHES.map(() => new SVF()), boomSub = CRASHES.map(() => new OnePole(30));
  const diskF = [new SVF(), new SVF()], diskSub = new OnePole(38), fizzF = [new SVF(), new SVF()], popF = POPS.map(() => new SVF());
  const riserF = [new SVF(), new SVF()], bangF = [new SVF(), new SVF(), new SVF()], whiteF = [new SVF(), new SVF()];
  const ffRum = new SVF(), ffSub = new OnePole(35), flashF = new SVF(), flashSub = new OnePole(30);
  const revL = new Reverb(31), revR = new Reverb(32);
  const ph = new Float64Array(260), padPh = new Float64Array(CHORDS.length * 16), padW = new Float64Array(CHORDS.length);
  let padFc = 400;
  const RE = rng(77);
  const cars = []; for (let t = 4; t < VIDEO_DURATION; t += 3 + RE() * 5) cars.push({ t, dir: RE() < 0.5 ? -1 : 1, d: 3 + RE() * 3 });
  // the stars going out: soft low bells, more and more of them, then fewer
  const bells = []; for (let t = SEC.bright - 1; t < SEC.last; t += 0.9 + RE() * 1.8) bells.push({ t, f: N([57, 60, 62, 64, 67, 69, 72][Math.floor(RE() * 7)]) * (t > SEC.small ? 0.5 : 1), p: RE() * 2 - 1, g: 0.5 + 0.5 * RE() });
  const beats = BEATS.filter((b) => b.v > FF_LEN && !b.quiet);

  let s = state(storyOf(0));
  for (let n = 0; n < NS; n++) {
    const t = n / SR;
    const v = storyOf(t);
    if (n % 48 === 0) {
      s = state(v);
      padFc = 0;
      for (let i = 0; i < CHORDS.length; i++) {
        const c = CHORDS[i], nx = CHORDS[i + 1];
        padW[i] = smooth(c.t - 1.8, c.t + 0.6, t) * (nx ? 1 - smooth(nx.t - 1.8, nx.t + 0.6, t) : 1);
        padFc += padW[i] * c.fc;
      }
    }
    let l = 0, r = 0, wet = 0;         // ambience + music (dips under the voice)
    let hl = 0, hr = 0, hwet = 0;      // hits and the big moments (they sit in the silences)
    const dk = 1 - 0.8 * duck[n];
    const ff = t < FF_LEN ? 1 : 0;
    const closing = t >= SEC.end + 1 ? 1 : 0;
    const demo = t >= SEC.void && t < SEC.end + 1 ? 1 : 0;
    const earth = !ff && !demo;
    const inAfter = closing ? smooth(SEC.end + 1, SEC.end + 4, t) : smooth(SEC.walk - 0.3, SEC.walk + 0.8, t);
    const race = smooth(Math.log10(1 / 3600), Math.log10(30), Math.log10(s.E));

    // --- the terrace at dusk: wind over the hill, the crowd's murmur, the city's far hum, a car now and then ---
    if (earth && (t < SEC.lapse + 3 || closing)) {
      const people = s.crowd * inAfter;
      const wnd = windE.run(0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1) + 0.2 * white());
      const wn = white();
      l += windF[0].run(wn, 300 + 200 * wnd, 0.7).bp * 0.06 * (0.4 + wnd) * inAfter; r += windF[1].run(wn, 340 + 200 * wnd, 0.7).bp * 0.06 * (0.4 + wnd) * inAfter;
      if (people > 0.005) {
        let cv = 0;
        for (let q = 0; q < 5; q++) {
          const amp = crowdE[q].run(Math.max(0, Math.sin(t * (1.7 + q * 0.63) + q * 1.3) + 0.6 * Math.sin(t * (0.37 + q * 0.11)) + white() * 0.3));
          cv += crowdF[q].run(white(), 360 + q * 230, 0.35).bp * amp;
        }
        l += cv * 0.04 * people; r += cv * 0.037 * people;
        const hum = humLP.run(white()) * 0.5 * 0.14 * people;
        l += hum; r += hum * 0.92;
        let cl = 0, cr = 0;
        for (const c of cars) {
          const dt = t - c.t;
          if (dt < 0 || dt > c.d) continue;
          const k = Math.sin(Math.PI * dt / c.d), pan = c.dir * (dt / c.d * 2 - 1);
          const x = carF.run(white(), 300 + 300 * k, 0.8).bp * k * k * 0.02 * people;
          cl += x * (1 - pan) * 0.5; cr += x * (1 + pan) * 0.5;
        }
        l += cl; r += cr;
      }
    }
    // --- the ages racing: a rushing wash (as long as there is air to hear it in) ---
    if (earth && race > 0.005) {
      const g = race * 0.03 * (0.3 + 0.7 * s.air) * (1 - s.dissolve);
      const rf = 300 + 1300 * race + 150 * Math.sin(t * 0.6);
      l += rushF[0].run(white(), rf, 0.9).bp * g; r += rushF[1].run(white(), rf * 1.12, 0.9).bp * g;
    }
    // --- the pad: a chord per stage, cross-fading ---
    {
      let pl = 0, pr = 0;
      for (let i = 0; i < CHORDS.length; i++) {
        const c = CHORDS[i], w = padW[i];
        if (w < 0.001 || !c.f.length) continue;
        for (let q = 0; q < c.f.length; q++) {
          const j = i * 16 + q;
          const lfo = 1 + 0.003 * Math.sin(t * (0.21 + q * 0.07) + q);
          padPh[j] += c.f[q] * lfo / SR;
          padPh[j + 8] += c.f[q] * 1.004 / SR;
          const a = 1 / Math.sqrt(c.f.length) * (0.75 + 0.25 * Math.sin(t * (0.13 + 0.05 * q) + q * 2));
          const x = (saw(padPh[j]) * 0.5 + Math.sin(TAU * padPh[j + 8]) * 0.7) * a * w * c.g;
          pl += x * (q % 2 ? 0.8 : 1.1); pr += x * (q % 2 ? 1.1 : 0.8);
        }
      }
      const fade = 1 - s.fadeOut;
      pl = padLP[0].run(pl, Math.max(150, padFc), 0.7).lp * 0.055 * fade; pr = padLP[1].run(pr, Math.max(150, padFc), 0.7).lp * 0.055 * fade;
      l += pl; r += pr; wet += (pl + pr) * 0.7;
    }
    if (earth && !closing) {
      // --- the red giant: a low roar swelling with it ---
      const gk = s.giant * (1 - s.wd);
      if (gk > 0.002) {
        const wn = white();
        const x = (giantF[0].run(wn, 60 + 140 * gk, 0.6).lp + giantSub.run(white()) * 2.2) * 0.13 * gk;
        l += x; r += x * 0.97; wet += x * 0.2;
      }
      // --- its shells sweeping out: a slow whoosh ---
      const sk = s.shed * (1 - s.nebula) * Math.sin(Math.PI * Math.min(1, s.nebula * 1.4));
      if (sk > 0.002) {
        const f = 500 + 2500 * s.nebula;
        l += shedF[0].run(white(), f, 0.7).bp * sk * 0.07; r += shedF[1].run(white(), f * 1.1, 0.7).bp * sk * 0.07; wet += sk * 0.02;
      }
      // --- the white dwarf and the freeze: a thin icy tone; the snow: a soft glassy shimmer (no clicks) ---
      const ik = s.wd * (1 - smooth(SEC.leave - 1, SEC.leave + 2, v));
      if (ik > 0.002) {
        ph[160] += 1760 * (1 + 0.002 * Math.sin(t * 0.7)) / SR; ph[161] += 2637 / SR;
        const x = (Math.sin(TAU * ph[160]) * 0.6 + Math.sin(TAU * ph[161]) * 0.3) * 0.006 * ik;
        const sh = (iceF[0].run(white(), 5800, 0.35).bp * (0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.9))) * 0.012 * s.snowfall;
        l += x + sh; r += x + iceF[1].run(sh, 5500, 0.5).bp * 0.5 + sh * 0.5; wet += (x + sh) * 2;
      }
      // --- the telescope: a soft tone that sinks as the galaxy reddens, and fades with it ---
      if (s.scope > 0.002) {
        ph[162] += 330 * Math.pow(2, -0.9 * s.redden) / SR;
        const x = Math.sin(TAU * ph[162]) * 0.012 * s.scope * (1 - s.fadeGal);
        l += x; r += x; wet += x * 1.5;
      }
      // --- the stars going out: soft low bells ---
      for (const b of bells) {
        const dt = v - b.t;
        if (dt < 0 || dt > 4) continue;
        ph[164] += b.f / SR; ph[165] += b.f * 2.76 / SR;
        const e = Math.min(dt / 0.04, 1) * Math.exp(-dt * 1.1);
        const x = (Math.sin(TAU * ph[164]) + 0.25 * Math.sin(TAU * ph[165]) * Math.exp(-dt * 3)) * e * 0.012 * b.g;
        hl += x * (1 - b.p * 0.6); hr += x * (1 + b.p * 0.6); hwet += x * 1.6;
      }
      // --- two dead stars crashing: a deep soft boom with a long tail ---
      CRASHES.forEach(([ct, , k], ci) => {
        const dt = v - ct;
        if (dt < -0.05 || dt > 9) return;
        ph[230 + ci] += (28 + 30 * Math.exp(-Math.max(dt, 0) * 1.4)) / SR;
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.15, 1) * Math.exp(-Math.max(dt, 0) * 0.55);
        const x = (Math.sin(TAU * ph[230 + ci]) * 0.9 + boomF[ci].run(white(), 70 + 200 * Math.exp(-Math.max(dt, 0) * 1.2), 0.6).lp * 1.2 + boomSub[ci].run(white()) * 3) * e * 0.38 * k;
        hl += x; hr += x * 0.97; hwet += x * 0.5;
      });
      // --- the black hole: a sub that grows with it, and its disk's roar ---
      const bk = s.bh * (1 - s.earthGone * 0.7) * (1 - smooth(SEC.lastLight - 0.3, SEC.lastLight + 0.4, v)) * (1 - smooth(SEC.fire + 2.4, SEC.fire + 3, v) * (1 - smooth(SEC.atoms - 0.6, SEC.atoms, v)));
      if (bk > 0.002) {
        ph[168] += (31 + 3 * Math.sin(t * 0.3)) / SR;
        const sub = Math.sin(TAU * ph[168]) * 0.09 * bk;
        const wn = white();
        const roar = (diskF[0].run(wn, 120 + 380 * s.disk, 0.5).lp + diskF[1].run(wn, 600 + 500 * s.disk, 0.8).bp * 0.3 + diskSub.run(white()) * 2) * 0.12 * s.disk;
        l += sub + roar; r += sub + roar * 0.96; wet += roar * 0.25;
      }
      // --- Earth evaporating: a rising glassy fizz ---
      const ek = s.dissolve * (1 - s.earthGone) * (1 - smooth(SEC.evap + 4.3, SEC.evap + 4.6, v));
      if (ek > 0.002) {
        const f = 2500 + 5000 * s.dissolve;
        l += fizzF[0].run(white(), Math.min(f, 5800), 0.5).bp * ek * 0.06; r += fizzF[1].run(white(), Math.min(f * 1.07, 5900), 0.5).bp * ek * 0.06; wet += ek * 0.03;
      }
      // --- far black holes going out: soft distant thuds ---
      POPS.forEach(([pt, d], pi) => {
        const dt = v - pt;
        if (dt < -0.03 || dt > 1.6) return;
        ph[210 + pi] += (45 + 25 * Math.exp(-Math.max(dt, 0) * 6)) / SR;
        const x = (Math.sin(TAU * ph[210 + pi]) + popF[pi].run(white(), 120, 0.7).lp * 0.6) * env(dt + 0.03, 0.04, 0.35) * 0.1;
        hl += x * (1 - d[0] * 0.7); hr += x * (1 + d[0] * 0.7); hwet += x * 0.8;
      });
      // --- shrinking, hotter, brighter: a riser that cuts at the last light ---
      const rk = smooth(SEC.hotter - 1, SEC.lastLight, v) * (v < SEC.lastLight ? 1 : 0);
      if (rk > 0.002) {
        const f = 300 + 5000 * rk * rk;
        ph[172] += (40 + 260 * Math.pow(rk, 3)) / SR;
        const x = riserF[0].run(white(), f, 0.6).bp * rk * rk * 0.12 + Math.sin(TAU * ph[172]) * 0.06 * rk * rk;
        hl += x; hr += riserF[1].run(white(), f * 1.1, 0.6).bp * rk * rk * 0.12 + Math.sin(TAU * ph[172]) * 0.06 * rk * rk; hwet += x * 0.5;
      }
      // --- the last light: one huge soft flash of sound, ringing away into nothing ---
      {
        const dt = v - SEC.lastLight;
        if (dt > -0.03 && dt < 12) {
          const att = smooth(-0.03, 0.05, dt), d = Math.max(dt, 0);
          ph[174] += (26 + 40 * Math.exp(-d * 2.5)) / SR;
          const x = (Math.sin(TAU * ph[174]) * Math.exp(-d * 0.6) * 0.6 + flashSub.run(white()) * 3 * Math.exp(-d * 0.8) + flashF.run(white(), 300 + 3000 * Math.exp(-d * 1.5), 0.8).bp * Math.exp(-d * 0.9) * 0.25) * att;
          let ring = 0;
          [880, 1318.5, 1760].forEach((f, q) => { ph[176 + q] += f / SR; ring += Math.sin(TAU * ph[176 + q]) / (q + 1); });
          ring *= Math.exp(-d * 0.35) * smooth(0, 0.3, d) * 0.018;
          hl += x + ring; hr += x * 0.97 + ring; hwet += (x * 0.5 + ring) * 0.9;
        }
      }
    }
    // --- the new Big Bang (Penrose's): a low tone rising out of the silence, a deep soft boom, a
    // bright rush of air and a warm major chord blooming out of it, ringing into the white ---
    if (!closing) for (const BANG of [SEC.bang]) {
      const lead = BANG === SEC.bang ? 6 : 0.5;
      const db = t - BANG;
      if (db > -lead && db < 0.05) {
        const p = smooth(-lead, 0, db) * (1 - smooth(0, 0.05, db));
        ph[56] += (38 + 70 * p * p) / SR;
        const x = Math.sin(TAU * ph[56]) * 0.22 * p * p + bangF[2].run(white(), 500 + 2500 * p * p, 0.9).bp * 0.05 * p * p;
        hl += x; hr += x;
      }
      if (db > -0.05 && db < 6) {
        const att = smooth(-0.04, 0.05, db), d = Math.max(db, 0);
        ph[46] += (24 + 46 * Math.exp(-d * 3)) / SR;
        const sub = Math.sin(TAU * ph[46]) * Math.exp(-d * 1.4) * 0.55;
        const rum = bangF[0].run(white(), 150, 0.6).lp * Math.exp(-d * 1.1) * 1.4;
        const fa = 280 + 2600 * Math.exp(-d * 2.2);
        const air = bangF[1].run(white(), fa, 0.9).bp * Math.exp(-d * 1.6) * 0.16;
        let ch = 0;
        [130.8, 196, 261.6, 329.6, 392].forEach((f, q) => { ph[50 + q] += f / SR; ch += Math.sin(TAU * ph[50 + q]); });
        ch *= smooth(0, 0.25, d) * Math.exp(-d * 0.5) * 0.035;
        hl += (sub + rum + air + ch) * att; hr += (sub + rum * 0.97 + air * 0.95 + ch) * att; hwet += (air + ch) * att;
      }
      const dw = t - SEC.whiteout;
      if (BANG === SEC.bang && dw > -2 && dw < 6) {
        const e = (dw < 0 ? Math.pow(smooth(-2, 0, dw), 2) : Math.exp(-dw * 0.8)) * (1 - smooth(4, 6, dw));
        const x = whiteF[0].run(white(), 2400, 0.7).bp * 0.4 * e * 0.12;
        let ring = 0;
        if (dw > 0) { [880, 1318.5, 1760].forEach((f, q) => { ph[134 + q] += f / SR; ring += Math.sin(TAU * ph[134 + q]) / (q + 1); }); ring *= Math.exp(-dw * 0.5) * smooth(0, 0.4, dw) * 0.02; }
        hl += x + ring; hr += x * 0.97 + ring; hwet += (x + ring) * 0.9;
      }
    }
    // --- each step: a deep, soft braam swell ---
    // (each beat its own phases; the sum goes through the filters once per sample)
    {
      let raw = 0, eSum = 0, fc = 300;
      for (let i = 0; i < beats.length; i++) {
        const dt = t - beats[i].v;
        if (dt > -0.05 && dt < 4.5) {
          const e = Math.min(Math.max(dt + 0.05, 0) / 0.09, 1) * Math.exp(-Math.max(dt, 0) * 1.3);
          const f0 = 36 + 8 * (i % 3), j = 190 + (i % 6) * 3;
          ph[j] += f0 / SR; ph[j + 1] += f0 * 1.005 / SR; ph[j + 2] += f0 * 2 / SR;
          raw += (saw(ph[j]) + saw(ph[j + 1]) + 0.5 * saw(ph[j + 2])) * e;
          eSum += e; fc = Math.max(fc, 300 + 700 * Math.exp(-Math.max(dt, 0) * 2));
        }
      }
      const x = braamLP.run(raw, fc, 0.6).lp * 0.11 + whoompF.run(white(), 100, 0.7).lp * eSum * 0.08;
      hl += x; hr += x; hwet += x * 0.35;
    }
    // --- frame 0: the flash-forward opens on a low hit over the disk's roar ---
    if (ff) {
      const x = (ffSub.run(white()) * 4 + ffRum.run(white(), 140, 0.6).lp) * 0.13 * (1 - smooth(FF_LEN - 0.4, FF_LEN, t));
      ph[143] += (30 + 30 * Math.exp(-t * 3)) / SR;
      const hit = Math.sin(TAU * ph[143]) * env(t, 0.012, 0.7) * 0.35;
      hl += x + hit; hr += x * 0.96 + hit; hwet += (x + hit) * 0.3;
    }

    // near-silence: the nothing after the last light
    const hush = 1 - 0.56 * smooth(SEC.lastLight + 5, SEC.lastLight + 9, t) * (1 - smooth(SEC.death, SEC.unless, t));
    const fade = 1 - s.fadeOut;
    const ga = 2.5 * dk, gh = 1.6 * (1 - 0.6 * duck[n]);
    const rl = revL.run((wet * ga + hwet * gh) * 0.5), rr = revR.run((wet * ga + hwet * gh) * 0.5);
    L[n] = (l * ga + hl * gh + rl * 0.75) * fade * hush;
    R[n] = (r * ga + hr * gh + rr * 0.75) * fade * hush;
  }

  // ---- mix: bed + voice, a gentle limiter, normalized peak ----
  let peak = 0;
  for (let n = 0; n < NS; n++) {
    let a = L[n] + V[n], b = R[n] + V[n];
    a = Math.tanh(a * 1.3) / 1.3; b = Math.tanh(b * 1.3) / 1.3;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    L[n] = a; R[n] = b;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
  }
  const gn = Math.min(1.6, 0.89 / peak);
  const buf = Buffer.alloc(44 + NS * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + NS * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(NS * 4, 40);
  for (let n = 0; n < NS; n++) {
    buf.writeInt16LE(Math.round(clamp(L[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
