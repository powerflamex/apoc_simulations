// Soundtrack for "What if the universe started shrinking?", synced to src/timeline.js (video clock), with the
// owner's narration.
//   node audio.mjs  -> out/soundtrack.wav
// The bed: the seaside at dusk (waves, the crowd's murmur, traffic), a slow pad that changes chord with each stage, a
// soft deep whoomp at every step, the time-lapse rush while the ages race, a shimmering swell as Andromeda pours
// through the Milky Way, a tone that sinks while the far galaxy is red and climbs as it turns blue, a rising rush as
// the galaxies come back and a deep soft boom as they crash, crickets on the warm night, the bay boiling (a broad
// hiss), the glowing sky's low oven roar, the lava's slow deep bubbling, the fog of fire roaring up to the moment the
// Sun is lost, then a near-silence; adrift: a deep pulse that quickens through the last three minutes, everything
// sucked into one point (a rising whoosh), a second of silence, the new Big Bang, the white, and the seaside again.
// The opening demonstration (the whole universe from outside) has its own: a rush of air while it spreads out, a tone
// and a whoosh rising as it falls in, near-silence on the last point of light, and the same new Big Bang.
// The voice (voice.m4a, cleaned with ffmpeg) is placed line by line from src/voice.js; the bed dips under it.
// No sharp clicks anywhere: every impact has a soft onset.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { state, SEC, VIDEO_DURATION, BEATS, V_FF, FF_LEN, scaleRate } from './src/timeline.js';
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.8)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.88, damp = 0.4) {
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

// the story moment shown at video time t (the flash-forward replays the city melting; the closing shot is the dusk)
const storyOf = (t) => (t < FF_LEN ? V_FF + t : t >= SEC.end + 1 ? SEC.prom + 2 + (t - SEC.end - 1) : t);

// the pad: one chord per stage (video time it is fully in, notes in Hz, level, brightness)
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);   // midi -> Hz
const CHORDS = [
  [0, [38, 45, 50, 53], 1.0, 500],          // flash-forward: D minor, low
  [5, [50, 57, 62, 66, 69], 0.7, 1300],     // the whole universe, spreading out: D major, wide
  [SEC.dStop, [45, 52, 57, 59, 64], 0.6, 1000],      // it stops: Asus2, hanging
  [SEC.dFall + 0.2, [46, 53, 58, 61], 0.85, 800],    // it falls back in: Bb minor
  [SEC.dCrunch + 0.1, [], 0, 400],                   // [silence]: one point of light
  [SEC.dBang + 1.4, [50, 57, 62, 66, 71], 0.75, 1400], // a new universe: D6/9, bright
  [SEC.walk, [50, 54, 57, 62, 64], 0.7, 1000],       // the promenade at dusk: D(add9), warm
  [54, [46, 50, 53, 57, 62], 0.9, 1300],    // Andromeda: Bbmaj7, wide and bright
  [84.9, [58, 65, 70], 0.25, 2000],         // [silence]: only a high glint
  [88, [41, 48, 53, 57, 60], 0.85, 1200],   // one ball of stars: Fmaj7
  [94.5, [45, 52, 57, 60], 0.8, 900],       // the turn: A minor
  [129, [43, 50, 55, 59, 62], 0.9, 1400],   // the galaxies come back: Gmaj7, rising
  [144.6, [26, 38], 0.35, 220],             // [silence]: a low hum
  [148, [48, 55, 60, 64], 0.75, 1100],      // no more dark: C major, open
  [153, [45, 52, 57, 60, 64], 0.75, 900],   // the night gets warm: Am(add9)
  [182, [41, 48, 53, 57, 64], 0.7, 1100],   // a summer night: Fmaj7
  [194, [40, 47, 52, 55], 0.8, 800],        // boiling: E minor, darker
  [208, [38, 45, 50, 51], 0.85, 600],       // the sky glows: Dm(b9), uneasy
  [225, [33, 40, 45, 46], 0.9, 500],        // the ground melts: low and tight
  [245, [33, 38, 39, 45], 0.85, 600],       // the fog of fire
  [270, [38, 45, 50, 57, 64], 0.8, 1000],   // hotter than the Sun: open fifths
  [296.5, [], 0, 400],                      // [silence]: Earth boils away
  [300, [26, 38, 45], 0.55, 300],           // adrift: low
  [325, [38, 45, 50, 57], 0.7, 700],        // everything
  [341.5, [], 0, 400],                      // the squeeze, the crunch, the bang
  [352, [50, 54, 57, 62, 66], 0.7, 1000],   // the seaside again: D major
].map(([t, m, g, fc]) => ({ t, f: m.map(N), g, fc }));

function loadVoice() {
  const src = path.join(ROOT, 'voice.m4a');
  if (!fs.existsSync(src)) return null;
  const raw = path.join(ROOT, 'out', 'voice_clean.f32');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  // the Big Rip v3 clean-up (owner-approved): rumble out, the boom and mud cut a little, presence and air back, the
  // hiss down, "s" sounds softened, firm compression so the voice stays up front
  const fx = 'highpass=f=80:p=2,afftdn=nf=-50:nr=6:tn=1,equalizer=f=140:t=q:w=1:g=-3,equalizer=f=270:t=q:w=1:g=-5,' +
    'equalizer=f=520:t=q:w=1.2:g=-3,equalizer=f=3300:t=q:w=0.9:g=4,treble=g=7:f=7000,deesser=i=0.3,' +
    'acompressor=threshold=-28dB:ratio=4:attack=8:release=100:makeup=3';
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
  {   // level: the speech (louder than -40 dBFS in 20 ms blocks) to -17 dBFS RMS
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
    for (const [a, b, at] of VOICE) {
      const i0 = Math.max(0, Math.round((at - 0.1) * SR)), i1 = Math.min(NS, Math.round((at + b - a + 0.15) * SR));
      on.fill(1, i0, i1);
    }
    let y = 0;
    const att = 1 - Math.exp(-1 / (0.12 * SR)), rel = 1 - Math.exp(-1 / (0.7 * SR)), LA = Math.round(0.2 * SR);
    for (let i = 0; i < NS; i++) {
      const x = on[Math.min(NS - 1, i + LA)];
      y += (x > y ? att : rel) * (x - y);
      duck[i] = y;
    }
  }

  // ---- the bed ----
  const waveF = [new SVF(), new SVF()], waveE = new OnePole(0.8), surfLP = new OnePole(900);
  const crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const trafLP = new OnePole(180), carF = new SVF(), rushF = [new SVF(), new SVF()], whoompF = new SVF();
  const padLP = [new SVF(), new SVF()], shimF = [new SVF(), new SVF()], comeF = [new SVF(), new SVF()];
  const boomF = new SVF(), boomSub = new OnePole(30), crickF = new SVF(), hissF = [new SVF(), new SVF()];
  const roarF = [new SVF(), new SVF()], roarSub = new OnePole(45), lavaF = new SVF(), pulseF = new SVF();
  const sqF = new SVF(), bangF = [new SVF(), new SVF(), new SVF()], whiteF = [new SVF(), new SVF()], driftF = [new SVF(), new SVF()];
  const ffRum = new SVF(), ffSub = new OnePole(35);
  const revL = new Reverb(31), revR = new Reverb(32);
  const ph = new Float64Array(160), padPh = new Float64Array(CHORDS.length * 16), padW = new Float64Array(CHORDS.length);
  let padFc = 400;
  // soft random events (times fixed by the seed): car passes, the lava's slow bubbles, crickets
  const RE = rng(77);
  const cars = []; for (let t = 4; t < VIDEO_DURATION; t += 2.5 + RE() * 4) cars.push({ t, dir: RE() < 0.5 ? -1 : 1, d: 2.5 + RE() * 2 });
  const bubbles = []; for (let t = SEC.melt; t < SEC.space; t += 0.6 + RE() * 1.4) bubbles.push({ t, f: 38 + RE() * 40, g: 0.4 + RE() * 0.6, p: RE() * 2 - 1 });
  const chirps = []; for (let t = SEC.summer - 2; t < SEC.wNight1 + 1; t += 0.35 + RE() * 0.5) chirps.push({ t, f: 4300 + RE() * 700, n: 2 + Math.floor(RE() * 3), p: RE() * 2 - 1 });
  const beats = BEATS.filter((b) => b.v > FF_LEN && !b.quiet);
  const dRushF = [new SVF(), new SVF()], dFallF = new SVF();

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
    const demo = t >= SEC.demo && t < SEC.walk ? 1 : 0;
    const earth = !s.space && !ff && !demo;
    const inAfter = closing ? smooth(SEC.end + 1, SEC.end + 4, t) : smooth(SEC.walk - 0.3, SEC.walk + 0.8, t);
    const race = smooth(Math.log10(1 / 3600), Math.log10(30), Math.log10(s.E));   // 0 real time .. 1 the ages racing

    // --- the seaside: waves on the bay (until it boils away), the crowd's murmur and traffic in real time ---
    if (earth) {
      const sea = (s.sea > -60 ? 1 : 0) * (1 - s.boil) * (1 - 0.7 * race);
      if (sea > 0.005) {
        const swell = waveE.run(0.5 + 0.5 * Math.sin(t * 0.9) + 0.15 * white());
        const wn = white();
        const w = (waveF[0].run(wn, 420, 0.6).bp * (0.5 + 0.8 * swell) + surfLP.run(white()) * 0.4) * 0.1;
        l += w * sea * inAfter; r += waveF[1].run(wn, 480, 0.6).bp * (0.5 + 0.8 * swell) * 0.1 * sea * inAfter;
      }
      const people = s.crowd * inAfter;
      if (people > 0.005) {
        let cv = 0;
        for (let q = 0; q < 5; q++) {
          const amp = crowdE[q].run(Math.max(0, Math.sin(t * (1.7 + q * 0.63) + q * 1.3) + 0.6 * Math.sin(t * (0.37 + q * 0.11)) + white() * 0.3));
          cv += crowdF[q].run(white(), 360 + q * 230, 0.35).bp * amp;
        }
        l += cv * 0.05 * people; r += cv * 0.046 * people;
        const tr = trafLP.run(white()) * 0.55 * 0.18 * people * s.traffic;
        l += tr; r += tr * 0.92;
        let cl = 0, cr = 0;
        for (const c of cars) {
          const dt = t - c.t;
          if (dt < 0 || dt > c.d) continue;
          const k = Math.sin(Math.PI * dt / c.d), pan = c.dir * (dt / c.d * 2 - 1);
          const x = carF.run(white(), 500 + 500 * k, 0.8).bp * k * k * 0.05 * people * s.traffic;
          cl += x * (1 - pan) * 0.5; cr += x * (1 + pan) * 0.5;
        }
        l += cl; r += cr;
      }
      // --- the ages racing: a rushing wash ---
      if (race > 0.005) {
        const rf = 300 + 1300 * race + 150 * Math.sin(t * 0.6);
        const g = race * 0.035 * (1 - s.glowI * 0.7);
        l += rushF[0].run(white(), rf, 0.9).bp * g; r += rushF[1].run(white(), rf * 1.12, 0.9).bp * g;
      }
    }
    // --- the opening demonstration: a rush of air as the universe spreads out (pitch with its speed); as it falls in,
    // a tone and a whoosh rising to the crunch ---
    if (demo) {
      const sp = Math.abs(scaleRate(t));
      const g = Math.min(1, sp / 0.15) * (1 - smooth(SEC.walk - 1, SEC.walk, t));
      if (g > 0.002) {
        const rf = 350 + 900 * Math.min(1, sp / 0.3);
        l += dRushF[0].run(white(), rf, 0.9).bp * g * 0.05; r += dRushF[1].run(white(), rf * 1.13, 0.9).bp * g * 0.05;
      }
      const sq = t > SEC.dFall && t < SEC.dCrunch + 0.05 ? smooth(SEC.dFall, SEC.dCrunch, t) : 0;
      if (sq > 0.001) {
        const gg = sq * sq * (1 - smooth(SEC.dCrunch - 0.02, SEC.dCrunch + 0.05, t));
        ph[60] += (55 + 500 * Math.pow(sq, 3)) / SR;
        const sw = Math.sin(TAU * ph[60]) * 0.07 + Math.sin(TAU * ph[60] * 1.5) * 0.03;
        const wh = dFallF.run(white(), 400 + 3000 * sq * sq, 0.8).bp * 0.12;
        hl += (sw + wh) * gg; hr += (sw + wh * 0.9) * gg; hwet += (sw + wh) * gg * 0.4;
      }
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
      pl = padLP[0].run(pl, Math.max(150, padFc), 0.7).lp * 0.05 * fade; pr = padLP[1].run(pr, Math.max(150, padFc), 0.7).lp * 0.05 * fade;
      l += pl; r += pr; wet += (pl + pr) * 0.6;
    }
    // --- Andromeda pouring through the Milky Way: a high shimmer that swells through the crash ---
    if (earth && !closing) {
      const g = smooth(SEC.crash - 3, SEC.crash + 4, v) * (1 - smooth(SEC.ball + 2, SEC.turn, v));
      if (g > 0.002) {
        let sv = 0;
        for (let q = 0; q < 6; q++) {
          ph[100 + q] += (1180 + q * 390) * (1 - 0.1 * s.collide) / SR;
          sv += Math.sin(TAU * ph[100 + q]) * (0.5 + 0.5 * Math.sin(t * (0.9 + q * 0.37) + q * 1.7)) ** 3;
        }
        const air = shimF[0].run(white(), 2800, 1.4).bp * 0.6;
        const x = (sv * 0.1 + air) * g * 0.05;
        l += x; r += shimF[1].run(x, 2500, 1.5).hp * 0.9 + x * 0.3; wet += x * 2.2;
      }
      // the telescope: a soft tone that sinks while the galaxy's light is red and climbs as it turns blue
      if (s.scope > 0.002) {
        ph[110] += 330 * Math.pow(2, 0.6 * s.shift) / SR;
        const x = Math.sin(TAU * ph[110]) * 0.012 * s.scope;
        l += x; r += x; wet += x * 1.5;
      }
      // the galaxies coming back: a rising rush
      const cg = smooth(SEC.back - 1, SEC.crash2, v) * (1 - smooth(SEC.crash2, SEC.crash2 + 1.5, v));
      if (cg > 0.002) {
        const f = 400 + 2600 * cg * cg;
        l += comeF[0].run(white(), f, 1.0).bp * cg * 0.06; r += comeF[1].run(white(), f * 1.1, 1.0).bp * cg * 0.06;
      }
    }
    // --- the galaxies crash together: a deep soft boom with a long tail ---
    {
      const dt = v - SEC.crash2;
      if (dt > 0 && dt < 10 && !closing && !ff) {
        ph[124] += (26 + 34 * Math.exp(-dt * 1.4)) / SR;
        const e = Math.min(dt / 0.12, 1) * Math.exp(-dt * 0.5);
        const x = (Math.sin(TAU * ph[124]) * 0.9 + boomF.run(white(), 70 + 220 * Math.exp(-dt * 1.2), 0.6).lp * 1.2 + boomSub.run(white()) * 3) * e * 0.4;
        hl += x; hr += x * 0.97; hwet += x * 0.5;
      }
    }
    // --- the warm night: crickets (soft chirps, no clicks) ---
    if (earth && !closing) {
      const g = smooth(SEC.summer - 2, SEC.summer, v) * (1 - smooth(SEC.wNight1 - 1, SEC.wNight1 + 1, v));
      if (g > 0.002) {
        let cv = 0;
        for (const c of chirps) {
          const dt = v - c.t;
          if (dt < 0 || dt > c.n * 0.06) continue;
          const k = dt / 0.06, ki = Math.floor(k), kf = k - ki;
          ph[112] += c.f / SR;
          cv += Math.sin(TAU * ph[112]) * Math.sin(Math.PI * kf) ** 2;
        }
        cv = crickF.run(cv, 4600, 1.5).bp * g * 0.03;
        l += cv; r += cv * 0.8; wet += cv;
      }
    }
    // --- the bay boiling away: a broad soft hiss ---
    if (earth && s.steam > 0.01) {
      const g = s.steam * 0.08;
      const x = hissF[0].run(white(), 2600, 0.5).bp + hissF[1].run(white(), 700 + 300 * Math.sin(t * 13), 0.4).bp * 0.8;
      l += x * g; r += x * g * 0.95; wet += x * g * 0.4;
    }
    // --- the glowing sky: a low oven roar, growing through the melt and the fog of fire to the moment the Sun is
    // lost; then it drains into near-silence as Earth boils away ---
    if (earth && !closing) {
      const k = clamp(0.4 * s.glowI + 0.6 * s.fog + 0.2 * s.lava) * (1 - smooth(SEC.earthGo + 1.5, SEC.space - 0.3, v));
      if (k > 0.001) {
        const g = Math.pow(k, 1.3) * 0.18;
        const wn = white();
        const x = roarF[0].run(wn, 80 + 260 * k, 0.5).lp + roarF[1].run(wn, 350 + 700 * k, 0.7).bp * 0.4 + roarSub.run(white()) * 2.2;
        l += x * g; r += x * g * 0.97; wet += x * g * 0.2;
      }
      // the lava: slow, deep, soft bubbles
      if (s.lava > 0.01) {
        let bv = 0;
        for (const b of bubbles) {
          const dt = v - b.t;
          if (dt < 0 || dt > 1.5) continue;
          bv += lavaF.run(white(), b.f, 0.5).lp * env(dt, 0.08, 0.35) * b.g;
        }
        hl += bv * s.lava * 0.35; hr += bv * s.lava * 0.32; hwet += bv * s.lava * 0.3;
      }
    }
    // --- adrift in the glow: a low hum and drift; a deep pulse that quickens through the last three minutes ---
    if (s.space && !closing) {
      const g = smooth(SEC.space, SEC.space + 2, v) * (1 - smooth(SEC.crunch - 0.05, SEC.crunch + 0.1, v));
      if (g > 0.002) {
        l += driftF[0].run(white(), 180 + 60 * Math.sin(t * 0.2), 1.2).bp * g * 0.05; r += driftF[1].run(white(), 200 + 60 * Math.sin(t * 0.23), 1.2).bp * g * 0.05;
        const hb = smooth(SEC.last3 - 1, SEC.last3 + 1, v) * (1 - smooth(SEC.squash, SEC.squash + 3, v));
        if (hb > 0.002) {
          const bpm = 50 + 70 * smooth(SEC.last3, SEC.squash, v);
          const per = 60 / bpm;
          const k = ((v - SEC.last3) % per + per) % per;
          const e = env(k, 0.03, 0.12) + 0.5 * env(k - 0.3, 0.03, 0.14);
          ph[126] += (44 + 10 * e) / SR;
          const x = (Math.sin(TAU * ph[126]) + pulseF.run(white(), 85, 0.6).lp * 0.8) * e * hb * 0.2;
          hl += x; hr += x;
        }
        // the heat itself: a roar that climbs with the temperature
        const rk = smooth(SEC.space, SEC.squash, v);
        const x = (roarF[0].run(white(), 90 + 500 * rk, 0.5).lp + roarSub.run(white()) * 2) * 0.18 * g * (0.5 + 0.5 * rk);
        l += x; r += x * 0.97; wet += x * 0.2;
      }
      // the squeeze: everything sucked into one point, a rising whoosh and a tone sweeping up
      const sq = 1 - s.squash;
      if (sq > 0.001 && v < SEC.crunch + 0.05) {
        const gg = sq * sq;
        ph[42] += (55 + 500 * Math.pow(sq, 3)) / SR;
        const sw = Math.sin(TAU * ph[42]) * 0.07 + Math.sin(TAU * ph[42] * 1.5) * 0.03;
        const wh = sqF.run(white(), 400 + 3000 * sq * sq, 0.8).bp * 0.12;
        hl += (sw + wh) * gg; hr += (sw + wh * 0.9) * gg; hwet += (sw + wh) * gg * 0.4;
      }
    }
    // --- the new Big Bang: a low tone rising out of the silence, then a deep soft boom, a bright rush of air and a
    // warm major chord blooming out of it, ringing into the white ---
    if (!closing) for (const BANG of [SEC.dBang, SEC.bang]) {
      const db = t - BANG;
      if (db > -0.5 && db < 0.05) {
        const p = smooth(-0.5, 0, db) * (1 - smooth(0, 0.05, db));
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
      // the white: a bright swell and a ring (at the end only)
      const dw = t - SEC.whiteout;
      if (BANG === SEC.bang && dw > -2 && dw < 6) {
        const e = (dw < 0 ? Math.pow(smooth(-2, 0, dw), 2) : Math.exp(-dw * 0.8)) * (1 - smooth(4, 6, dw));
        const x = whiteF[0].run(white(), 2400, 0.7).bp * 0.4 * e * 0.12;
        let ring = 0;
        if (dw > 0) { [880, 1318.5, 1760].forEach((f, q) => { ph[134 + q] += f / SR; ring += Math.sin(TAU * ph[134 + q]) / (q + 1); }); ring *= Math.exp(-dw * 0.5) * smooth(0, 0.4, dw) * 0.02; }
        hl += x + ring; hr += x * 0.97 + ring; hwet += (x + ring) * 0.9;
      }
    }
    // --- each step: a deep, soft whoomp ---
    for (let i = 0; i < beats.length; i++) {
      const dt = t - beats[i].v;
      if (dt > -0.05 && dt < 2.2 && beats[i].v < SEC.crunch) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.4);
        ph[140 + (i % 2)] += (36 + 26 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const x = (Math.sin(TAU * ph[140 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.7) * e * 0.2;
        hl += x; hr += x; hwet += x * 0.25;
      }
    }
    // --- frame 0: the flash-forward opens on a low hit over the melting city's roar ---
    if (ff) {
      const x = (ffSub.run(white()) * 4 + ffRum.run(white(), 120, 0.6).lp) * 0.14 * (1 - smooth(FF_LEN - 0.4, FF_LEN, t));
      ph[142] += (30 + 30 * Math.exp(-t * 3)) / SR;
      const hit = Math.sin(TAU * ph[142]) * env(t, 0.012, 0.7) * 0.35;
      hl += x + hit; hr += x * 0.96 + hit; hwet += (x + hit) * 0.3;
    }

    // the crunch: a second of near-silence before the bang
    // (and in the opening, the moment of black with one point of light)
    const hush = 1 - 0.85 * Math.max(smooth(SEC.crunch + 0.02, SEC.crunch + 0.1, t) * (1 - smooth(SEC.bang - 0.55, SEC.bang - 0.5, t)),
      smooth(SEC.dCrunch + 0.02, SEC.dCrunch + 0.15, t) * (1 - smooth(SEC.dBang - 0.55, SEC.dBang - 0.5, t)));
    const fade = 1 - s.fadeOut;
    // levels: the ambience and music dip ~14 dB under the voice (it sits in front), the hits ~8 dB
    const ga = 2.5 * dk, gh = 1.6 * (1 - 0.6 * duck[n]);
    const rl = revL.run((wet * ga + hwet * gh) * 0.5), rr = revR.run((wet * ga + hwet * gh) * 0.5);
    L[n] = (l * ga + hl * gh + rl * 0.7) * fade * hush;
    R[n] = (r * ga + hr * gh + rr * 0.7) * fade * hush;
  }

  if (process.env.STEMS) {   // debugging the balance: the bed and the voice on their own (float, no limiter)
    const w = (f, a, b) => { const o = Buffer.alloc(NS * 8); for (let n = 0; n < NS; n++) { o.writeFloatLE(a[n], n * 8); o.writeFloatLE(b[n], n * 8 + 4); } fs.writeFileSync(f, o); };
    w(path.join(ROOT, 'out', 'stem_bed.f32'), L, R); w(path.join(ROOT, 'out', 'stem_voice.f32'), V, V);
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
