// Soundtrack for "What if space ripped apart?", synced to src/timeline.js (video clock), with the owner's narration.
//   node audio.mjs  -> out/soundtrack.wav
// The bed: the city at night (crowd murmur, traffic), a slow pad that changes chord with each stage, a soft deep
// whoomp at every step, the time-lapse rush while the sky races, a shimmer as the Milky Way unravels, cold wind in
// the summer snow, TV static and a lost-signal tone, the quake, the air lifting off, Earth splitting (one huge low
// boom), drifting among the pieces, a heartbeat and a rising tone as you stretch, the white, then the city again.
// The voice (voice.m4a, cleaned with ffmpeg) is placed line by line from src/voice.js; the bed dips under it.
// No sharp clicks anywhere: every impact has a soft onset.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { state, SEC, VIDEO_DURATION, BEATS, V_FF, FF_LEN, rate } from './src/timeline.js';
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

// the story moment shown at video time t (the flash-forward replays the split; the closing shot is the city)
const storyOf = (t) => (t < FF_LEN ? V_FF + t : t >= SEC.end + 1 ? SEC.city + 2 + (t - SEC.end - 1) : t);

// the pad: one chord per stage (video time it is fully in, notes in Hz, level, brightness)
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);   // midi -> Hz
const CHORDS = [
  [0, [38, 45, 50, 53], 1.0, 500],          // flash-forward: D minor, low
  [5, [50, 53, 57, 64], 0.8, 900],          // the city: Dm(add9)
  [36, [46, 50, 53, 57, 62], 1.0, 1300],    // the Milky Way: Bbmaj7, wide and bright
  [60.5, [58, 65, 70], 0.25, 2000],         // [silence]: only a high glint
  [63, [43, 50, 55, 58], 0.9, 900],         // "it's also a warning": G minor
  [77, [50, 57, 62, 65], 0.8, 700],         // the stars go out: D minor, darkening
  [107, [41, 48, 53, 57], 0.8, 800],        // the planets: F
  [130, [45, 52, 57, 60], 0.8, 800],        // Jupiter gone: A minor
  [153, [50, 52, 57, 62], 0.8, 1100],       // the Sun: Dsus2, cold
  [182, [47, 50, 54, 57, 59], 0.8, 900],    // a month left, snow: Bm(add11)
  [206, [50, 52, 57, 64], 0.7, 1300],       // the last week: high and thin
  [219, [62, 69, 74], 0.45, 1600],          // the Moon: two high fifths
  [240.3, [26, 38], 0.35, 220],             // [silence]: a dot (a low hum only)
  [249, [38, 45, 50, 53], 0.8, 600],        // alone: D minor, low
  [263, [38, 39, 45, 50, 51], 0.75, 700],   // satellites: a dark cluster
  [290, [33, 38, 39, 45], 0.9, 500],        // the quake: lower and tighter
  [312.3, [], 0, 400],                      // the split: the boom alone
  [319, [38, 45, 52, 57, 64], 0.8, 900],    // floating in the pieces: open fifths
  [340, [38, 45, 50, 53, 57], 0.8, 800],    // you
  [386, [], 0, 400],                        // the white
  [393, [50, 54, 57, 62, 66], 0.7, 1000],   // the city again: D major
].map(([t, m, g, fc]) => ({ t, f: m.map(N), g, fc }));

function loadVoice() {
  const src = path.join(ROOT, 'voice.m4a');
  const raw = path.join(ROOT, 'out', 'voice_clean.f32');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  // The phone was under a blanket with a sock over its mic: the recording came out boomy (100-300 Hz ~10 dB too
  // strong) and dull (little above 5 kHz). So: rumble out, the boom and mud cut, presence and air back, the hiss
  // down, "s" sounds softened, even levels. (Measured against the raw take, Oct 20.)
  // (v3: less cut low down, so the voice keeps its warmth and sounds close; firmer compression so it stays upfront)
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
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;

  // ---- the voice, line by line (short fades at every cut) ----
  const rec = loadVoice();
  for (const [a, b, at] of VOICE) {
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
  {
    const on = new Uint8Array(NS);
    for (const [a, b, at] of VOICE) {
      const i0 = Math.max(0, Math.round((at - 0.1) * SR)), i1 = Math.min(NS, Math.round((at + b - a + 0.15) * SR));
      on.fill(1, i0, i1);
    }
    // look ahead a little so the music is already down when the line starts
    let y = 0;
    const att = 1 - Math.exp(-1 / (0.12 * SR)), rel = 1 - Math.exp(-1 / (0.7 * SR)), LA = Math.round(0.2 * SR);
    for (let i = 0; i < NS; i++) {
      const x = on[Math.min(NS - 1, i + LA)];
      y += (x > y ? att : rel) * (x - y);
      duck[i] = y;
    }
  }

  // ---- the bed ----
  const crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const trafLP = new OnePole(180), carF = [new SVF(), new SVF()], rushF = [new SVF(), new SVF()], whoompF = new SVF();
  const padLP = [new SVF(), new SVF()], shimF = [new SVF(), new SVF()], windF = [new SVF(), new SVF()], gustE = new OnePole(0.6);
  const staticF = new SVF(), rumF = [new SVF(), new SVF()], rumSub = new OnePole(35), crackF = new SVF(), airF = [new SVF(), new SVF()];
  const boomF = new SVF(), boomSub = new OnePole(30), floatF = [new SVF(), new SVF()], thudF = new SVF(), heartF = new SVF();
  const stretchF = new SVF(), whiteF = [new SVF(), new SVF()];
  const revL = new Reverb(21), revR = new Reverb(22);
  const ph = new Float64Array(160), padPh = new Float64Array(CHORDS.length * 16), padW = new Float64Array(CHORDS.length);
  const ffRum = new SVF(), ffSub = new OnePole(35);
  let padFc = 400;
  // soft random events: car passes, low cracks, distant thuds (times fixed by the seed)
  const RE = rng(99);
  const cars = []; for (let t = 4; t < VIDEO_DURATION; t += 2.5 + RE() * 4) cars.push({ t, dir: RE() < 0.5 ? -1 : 1, d: 2.5 + RE() * 2 });
  const cracks = []; for (let t = SEC.crack - 4; t < SEC.float; t += 0.5 + RE() * 1.1) cracks.push({ t, f: 60 + RE() * 90, g: 0.5 + RE() * 0.5 });
  const thuds = []; for (let t = SEC.splitHush + 7; t < SEC.rip; t += 1.8 + RE() * 3.5) thuds.push({ t, f: 40 + RE() * 50, g: 0.3 + RE() * 0.7, p: RE() * 2 - 1 });
  const beats = BEATS.filter((b) => b.v > FF_LEN);
  const Vsplit = SEC.splitHush + 0.2;   // the ground splits

  let s = state(storyOf(0)), rt = rate(storyOf(0));
  for (let n = 0; n < NS; n++) {
    const t = n / SR;
    const v = storyOf(t);
    if (n % 48 === 0) {
      s = state(v); rt = rate(v);
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
    const cityIn = closing ? smooth(SEC.end + 1, SEC.end + 4, t) : smooth(FF_LEN - 0.05, FF_LEN + 0.4, t);   // the city comes in after the flash-forward and after the white

    // --- the city: the crowd's murmur and the traffic (gone in the time-lapse; uneasy before the split) ---
    {
      const people = clamp((1 - s.lapse) * (v < SEC.splitHush ? 1 : 0) * (1 - 0.5 * smooth(SEC.moon - 1, SEC.moon + 1, v) * (1 - smooth(SEC.sats - 2, SEC.sats, v))) *
        (1 - smooth(SEC.splitHush - 3, SEC.splitHush, v)) + 0.4 * smooth(SEC.sats + 4, SEC.gps + 4, v) * (1 - smooth(SEC.crack, SEC.splitHush, v)));
      if (people > 0.005 && !ff) {
        let cv = 0;
        for (let q = 0; q < 5; q++) {
          const amp = crowdE[q].run(Math.max(0, Math.sin(t * (1.7 + q * 0.63) + q * 1.3) + 0.6 * Math.sin(t * (0.37 + q * 0.11)) + white() * 0.3));
          cv += crowdF[q].run(white(), 360 + q * 230, 0.35).bp * amp;
        }
        const snowMuffle = 1 - 0.4 * s.snow;
        l += cv * 0.05 * people * snowMuffle * cityIn; r += cv * 0.046 * people * snowMuffle * cityIn;
      }
      const cityOn = (1 - s.lapse) * (v < SEC.split + 2 ? 1 : 1 - smooth(SEC.split + 2, SEC.split + 6, v)) * (ff ? 0 : 1) * cityIn;
      if (cityOn > 0.005) {
        const tr = trafLP.run(white()) * 0.55 * 0.2 * cityOn;
        l += tr; r += tr * 0.92;
        // cars passing: a soft swelling hiss panned across
        let cl = 0, cr = 0;
        for (const c of cars) {
          const dt = t - c.t;
          if (dt < 0 || dt > c.d) continue;
          const k = Math.sin(Math.PI * dt / c.d), pan = c.dir * (dt / c.d * 2 - 1);
          const x = carF[0].run(white(), 500 + 500 * k, 0.8).bp * k * k * 0.06 * cityOn;
          cl += x * (1 - pan) * 0.5; cr += x * (1 + pan) * 0.5;
        }
        l += cl; r += cr;
      }
    }
    // --- time racing: a rushing wash that brightens with the pace (the street a long exposure) ---
    if (s.lapse > 0.005) {
      const fast = clamp((Math.log10(Math.max(rt, 1)) - 6) / 9);
      const rf = 250 + 1500 * fast + 150 * Math.sin(t * 0.6);
      const g = s.lapse * (0.02 + 0.05 * fast);
      l += rushF[0].run(white(), rf, 0.9).bp * g; r += rushF[1].run(white(), rf * 1.12, 0.9).bp * g; wet += 0;
    }
    // --- the pad: a chord per stage, cross-fading ---
    {
      let pl = 0, pr = 0;
      for (let i = 0; i < CHORDS.length; i++) {
        const c = CHORDS[i], w = padW[i];
        if (w < 0.001 || !c.f.length) continue;
        for (let q = 0; q < c.f.length; q++) {
          const j = i * 16 + q;   // two phases per note: a saw and a slightly detuned sine
          const lfo = 1 + 0.003 * Math.sin(t * (0.21 + q * 0.07) + q);
          padPh[j] += c.f[q] * lfo / SR;
          padPh[j + 8] += c.f[q] * 1.004 / SR;
          const a = 1 / Math.sqrt(c.f.length) * (0.75 + 0.25 * Math.sin(t * (0.13 + 0.05 * q) + q * 2));
          const x = (saw(padPh[j]) * 0.5 + Math.sin(TAU * padPh[j + 8]) * 0.7) * a * w * c.g;
          pl += x * (q % 2 ? 0.8 : 1.1); pr += x * (q % 2 ? 1.1 : 0.8);
        }
      }
      const fc = padFc;
      const fade = 1 - s.fadeOut;
      pl = padLP[0].run(pl, Math.max(150, fc), 0.7).lp * 0.05 * fade; pr = padLP[1].run(pr, Math.max(150, fc), 0.7).lp * 0.05 * fade;
      l += pl; r += pr; wet += (pl + pr) * 0.6;
    }
    // --- the Milky Way unravelling: a high shimmer that glides down as the band frays ---
    {
      const g = (smooth(SEC.mw - 1, SEC.mw + 4, v) * (1 - smooth(SEC.stars + 6, 96, v))) * (ff || closing ? 0 : 1);
      if (g > 0.002) {
        let sv = 0;
        for (let q = 0; q < 6; q++) {
          const f = (1320 + q * 410) * (1 - 0.25 * s.rip) * (1 - 0.35 * s.red);
          ph[100 + q] += f / SR;
          sv += Math.sin(TAU * ph[100 + q]) * (0.5 + 0.5 * Math.sin(t * (0.9 + q * 0.37) + q * 1.7)) ** 3;
        }
        const air = shimF[0].run(white(), 3200 - 1400 * s.rip, 1.4).bp * 0.6;
        const x = (sv * 0.1 + air) * g * 0.05;
        l += x; r += shimF[1].run(x, 2500, 1.5).hp * 0.9 + x * 0.3; wet += x * 2.2;
      }
    }
    // --- cold: wind in gusts once the Sun shrinks, strongest in the summer snow ---
    {
      const g = (0.25 * smooth(SEC.loose, SEC.month, v) + 0.75 * s.snow) * (1 - smooth(SEC.moon - 2, SEC.moon + 2, v)) * (ff || closing ? 0 : 1);
      if (g > 0.003) {
        const gust = gustE.run(0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1) + white() * 0.4);
        const fc = 380 + 520 * gust;
        l += windF[0].run(white(), fc, 0.5).bp * g * 0.09 * (0.4 + gust); r += windF[1].run(white(), fc * 1.1, 0.5).bp * g * 0.09 * (0.4 + gust);
      }
    }
    // --- satellite TV goes to static (on the big screen), then the phones lose GPS: a soft falling two-note tone ---
    {
      const g = s.tv * (t < SEC.gps - 2 ? 1 : 0.15) * (1 - smooth(SEC.gps + 6, SEC.gps + 9, t));
      if (g > 0.003) { const x = staticF.run(white(), 4200, 0.6).bp * g * 0.035; l += x; r += x; }
      const dt = t - (SEC.gps + 0.3);
      if (dt > 0 && dt < 1.6) {
        const f = dt < 0.32 ? 988 : 740;
        ph[120] += f / SR;
        const e = (dt < 0.32 ? env(dt, 0.02, 0.12) : env(dt - 0.32, 0.02, 0.35)) * 0.05;
        const x = Math.sin(TAU * ph[120]) * e;
        hl += x; hr += x; hwet += x * 0.6;
      }
    }
    // --- the quake: a deep rumble building, soft low cracks (no sharp clicks), the air lifting off ---
    {
      const q = smooth(SEC.split + 1, SEC.crack + 4, v) * (1 - smooth(Vsplit + 1, SEC.float + 2, v)) * (closing ? 0 : 1);
      if (q > 0.002) {
        const sub = rumSub.run(white()) * 4;
        const x = (rumF[0].run(white(), 70 + 40 * q, 0.6).lp + sub) * q * 0.22;
        const y = (rumF[1].run(white(), 80 + 40 * q, 0.6).lp + sub) * q * 0.22;
        hl += x; hr += y; hwet += (x + y) * 0.15;
        let cv = 0;
        for (const c of cracks) {
          const dt = v - c.t;
          if (dt < 0 || dt > 1.4) continue;
          cv += crackF.run(white(), c.f + 120 * Math.exp(-dt * 6), 0.4).lp * env(dt, 0.03, 0.3) * c.g;
        }
        hl += cv * q * 0.35; hr += cv * q * 0.33; hwet += cv * q * 0.2;
      }
      const a = s.air * (1 - smooth(Vsplit, Vsplit + 4, v)) * (closing ? 0 : 1);
      if (a > 0.002) {
        const f = 220 + 1400 * a;
        l += airF[0].run(white(), f, 1.1).bp * a * 0.06; r += airF[1].run(white(), f * 1.15, 1.1).bp * a * 0.06;
      }
    }
    // --- Earth splits: one huge low boom, a long rolling tail ---
    {
      const dt = v - Vsplit;
      if (dt > 0 && dt < 14 && !closing) {
        ph[124] += (24 + 38 * Math.exp(-dt * 1.5)) / SR;
        const e = Math.min(dt / 0.09, 1) * Math.exp(-dt * 0.45);
        const x = (Math.sin(TAU * ph[124]) * 0.9 + boomF.run(white(), 70 + 260 * Math.exp(-dt * 1.2), 0.6).lp * 1.3 + boomSub.run(white()) * 3) * e * 0.5;
        hl += x; hr += x * 0.97; hwet += x * 0.5;
      }
    }
    // --- floating in the pieces: a low airy drift, distant soft thuds ---
    {
      const g = smooth(Vsplit + 3, SEC.float, v) * (1 - smooth(SEC.rip - 1, SEC.rip, v)) * (closing ? 0 : 1);
      if (g > 0.002) {
        l += floatF[0].run(white(), 180 + 60 * Math.sin(t * 0.2), 1.2).bp * g * 0.06; r += floatF[1].run(white(), 200 + 60 * Math.sin(t * 0.23), 1.2).bp * g * 0.06;
        let tv = 0;
        for (const d of thuds) {
          const dt = v - d.t;
          if (dt < 0 || dt > 2) continue;
          tv += thudF.run(white(), d.f, 0.5).lp * env(dt, 0.05, 0.5) * d.g;
        }
        hl += tv * g * 0.5; hr += tv * g * 0.45; hwet += tv * g * 0.5;
      }
    }
    // --- you: a heartbeat, and a tone that climbs as space inside you stretches, into the white ---
    if (!closing && !ff) {
      const hb = smooth(SEC.hand, SEC.hand + 4, v) * (1 - smooth(SEC.rip - 6, SEC.rip - 0.5, v));
      if (hb > 0.002) {
        const bpm = 58 + 40 * smooth(SEC.hand + 10, SEC.rip - 4, v);
        const per = 60 / bpm;
        const k = ((v - SEC.hand) % per + per) % per;
        const e = env(k, 0.025, 0.09) + 0.6 * env(k - 0.28, 0.025, 0.11);
        ph[126] += (48 + 12 * e) / SR;
        const x = (Math.sin(TAU * ph[126]) + heartF.run(white(), 90, 0.6).lp * 0.8) * e * hb * 0.22;
        hl += x; hr += x;
      }
      const st = smooth(SEC.hand + 6, SEC.rip, v);
      if (st > 0.001 && v < SEC.rip + 0.05) {
        const f = 110 * Math.pow(16, Math.pow(st, 1.4));
        let x = 0;
        for (let q = 0; q < 4; q++) { ph[128 + q] += f * (q + 1) * (1 + 0.004 * q * Math.sin(t * 5)) / SR; x += Math.sin(TAU * ph[128 + q]) / (q + 1.5); }
        x = stretchF.run(x, 600 + 4000 * st, 0.8).lp * Math.pow(st, 1.6) * 0.07;
        hl += x; hr += x; hwet += x * 0.8;
      }
      // the white: a bright swell that peaks with the flash and rings away
      const dt = t - SEC.rip;
      if (dt > -2.5 && dt < 7) {
        const e = (dt < 0 ? Math.pow(smooth(-2.5, 0, dt), 3) : Math.exp(-dt * 0.8)) * (1 - smooth(5, 7, dt));
        const x = (whiteF[0].run(white(), 2400, 0.7).bp * 0.5 + whiteF[1].run(white(), 300, 0.6).lp * 0.6) * e * 0.18;
        let ring = 0;
        if (dt > 0) { [880, 1318.5, 1760].forEach((f, q) => { ph[134 + q] += f / SR; ring += Math.sin(TAU * ph[134 + q]) / (q + 1); }); ring *= Math.exp(-dt * 0.5) * smooth(0, 0.4, dt) * 0.02; }
        hl += x + ring; hr += x * 0.97 + ring; hwet += (x + ring) * 0.9;
      }
    }
    // --- each step: a deep, soft whoomp ---
    for (let i = 0; i < beats.length; i++) {
      const dt = t - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.4);
        ph[140 + (i % 2)] += (36 + 26 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const x = (Math.sin(TAU * ph[140 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.7) * e * 0.2;
        hl += x; hr += x; hwet += x * 0.25;
      }
    }
    // --- frame 0: the flash-forward opens on a low hit over the split's rumble ---
    if (ff) {
      const x = (ffSub.run(white()) * 4 + ffRum.run(white(), 90, 0.6).lp) * 0.16 * (1 - smooth(FF_LEN - 0.4, FF_LEN, t));
      ph[142] += (30 + 30 * Math.exp(-t * 3)) / SR;
      const hit = Math.sin(TAU * ph[142]) * env(t, 0.012, 0.7) * 0.35;
      hl += x + hit; hr += x * 0.96 + hit; hwet += (x + hit) * 0.3;
    }

    const fade = 1 - s.fadeOut;
    // levels: the ambience and music dip ~14 dB under the voice (it sits in front), the hits ~8 dB
    const ga = 2.5 * dk, gh = 1.6 * (1 - 0.6 * duck[n]);
    const rl = revL.run((wet * ga + hwet * gh) * 0.5), rr = revR.run((wet * ga + hwet * gh) * 0.5);
    L[n] = (l * ga + hl * gh + rl * 0.7) * fade;
    R[n] = (r * ga + hr * gh + rr * 0.7) * fade;
  }

  if (process.env.STEMS) {   // debugging the balance: the bed and the voice on their own (float, no limiter)
    const w = (f, a, b) => { const o = Buffer.alloc(NS * 8); for (let n = 0; n < NS; n++) { o.writeFloatLE(a[n], n * 8); o.writeFloatLE(b[n], n * 8 + 4); } fs.writeFileSync(f, o); };
    w(path.join(ROOT, 'out', 'stem_bed.f32'), L, R); w(path.join(ROOT, 'out', 'stem_voice.f32'), V, V);
  }
  // ---- mix: bed + voice, a gentle limiter, normalized peak ----
  const BED = 1.0;
  let peak = 0;
  for (let n = 0; n < NS; n++) {
    let a = L[n] * BED + V[n], b = R[n] * BED + V[n];
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
