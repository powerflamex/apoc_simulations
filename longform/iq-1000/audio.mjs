// Soundtrack for "What if your IQ was 1,000 times higher?", synced to src/timeline.js, with the owner's narration.
//   node audio.mjs  -> out/soundtrack.wav
// The plaza's own sound is made first on the WORLD clock (real seconds): the crowd's murmur, traffic and the car
// that nearly hits the kid, the fountain, the guitarist strumming, the kid's ball, the pigeons taking off, the rain
// arriving, and the thunder ~6 s after the lightning (2 km away). Then it is played back along worldT(v), like a tape
// slowing down: as your brain speeds up every pitch sinks by the same factor, the voices turn into a rumble and drop
// below hearing (a high-pass at ~25 Hz is your ears' limit); when you let go it spins back up and the thunder lands.
// Over it, on the video clock (your own head): a slow pad that changes chord at each stage, a soft deep whoomp at
// each doubling, bright plucks while you notice things and while your mind races, a riser as the lightning crawls
// down, a deep hit at each flash, your heartbeat in the silence, and the rush when you let go.
// The voice (voice.m4a, cleaned with ffmpeg) is placed line by line from src/voice.js; the bed dips under it.
// No sharp clicks anywhere: every impact has a soft onset.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SEC, W, VIDEO_DURATION, BEATS, V_FF, FF_LEN, worldT, speed, rainAt } from './src/timeline.js';
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
// the story moment at video time t (the flash-forward replays the frozen plaza)
const storyOf = (t) => (t < FF_LEN ? V_FF + t : t);
const HEART = 60 / 70;

// ---------------- the plaza, on the world clock ----------------
function makePlaza() {
  const WMAX = worldT(VIDEO_DURATION) + 1;
  const NA = Math.ceil(WMAX * SR);
  const AL = new Float32Array(NA), AR = new Float32Array(NA);
  const R0 = rng(9191);
  const white = () => R0() * 2 - 1;
  const RE = rng(77);
  // car passes (both directions), the near lanes louder; the one that would have hit the kid, close and loud
  const cars = [];
  for (let w = -2; w < WMAX; w += 1.4 + RE() * 3) cars.push({ w, d: 2.2 + RE() * 1.6, dir: RE() < 0.5 ? -1 : 1, g: 0.35 + RE() * 0.5 });
  cars.push({ w: W.catch + 0.8 - 1.3, d: 2.6, dir: 1, g: 1.6, close: true });
  // the kid's ball: dribbled (a soft bounce 1.6 times a second), then off his knee, bouncing toward the road; caught
  const thuds = [];
  for (let w = Math.ceil(2 * 1.6) / 1.6; w < W.kick; w += 1 / 1.6) thuds.push({ w, g: 0.55 });
  for (const dt of [0.42, 0.78, 1.12]) thuds.push({ w: W.kick + dt, g: 0.45 });
  const strumAt = (k) => k / 1.53;
  const CHORD = [[43, 47, 50, 55, 59, 67], [38, 45, 50, 57, 62, 66], [40, 47, 52, 55, 59, 64], [36, 43, 48, 52, 55, 64]];   // G D Em C
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Karplus-Strong strings for the guitar (6), restruck at each strum with a soft (low-passed) excitation
  const strings = Array.from({ length: 6 }, () => ({ buf: new Float32Array(2048), len: 100, i: 0, exc: 0, lp: 0, left: 0 }));
  const crowdF = Array.from({ length: 6 }, () => new SVF()), crowdE = Array.from({ length: 6 }, () => new OnePole(3));
  const trafLP = new OnePole(160), carF = [new SVF(), new SVF()], founF = [new SVF(), new SVF()], rainF = [new SVF(), new SVF(), new SVF(), new SVF()];
  const thudF = new SVF(), flapF = [new SVF(), new SVF()], thunF = [new SVF(), new SVF()], thunSub = new OnePole(40), excLP = new OnePole(2500);
  const ph = new Float64Array(16);
  let strumK = Math.floor(0), nextStrum = strumAt(1);
  for (let n = 0; n < NA; n++) {
    const w = n / SR;
    let l = 0, r = 0;
    const rain = rainAt(w);
    // the crowd: a murmur of voices (less once everyone hurries out of the rain)
    let cv = 0;
    for (let q = 0; q < 6; q++) {
      const amp = crowdE[q].run(Math.max(0, Math.sin(w * (1.9 + q * 0.71) + q * 1.3) + 0.6 * Math.sin(w * (0.41 + q * 0.13)) + white() * 0.35));
      cv += crowdF[q].run(white(), 300 + q * 260, 0.32).bp * amp;
    }
    cv *= 0.06 * (1 - 0.5 * rain);
    l += cv; r += cv * 0.9;
    // traffic: a low bed and passing cars
    const tr = trafLP.run(white()) * 0.12;
    l += tr; r += tr * 0.95;
    for (const c of cars) {
      const dt = w - c.w;
      if (dt < 0 || dt > c.d) continue;
      const k = Math.sin(Math.PI * dt / c.d), pan = c.dir * (dt / c.d * 2 - 1);
      const f = (c.close ? 380 : 520) + 600 * k * (c.dir * pan > 0 ? 0.8 : 1.1);
      const x = carF[0].run(white(), f, 0.7).bp * k * k * 0.06 * c.g + (c.close ? carF[1].run(white(), 90 + 60 * k, 0.6).lp * k * k * 0.35 : 0);
      l += x * (1 - pan) * 0.6; r += x * (1 + pan) * 0.6;
    }
    // the fountain, off to the left
    const fo = founF[0].run(white(), 2400, 0.5).bp * 0.035 + founF[1].run(white(), 700, 0.6).bp * 0.02;
    l += fo * 1.2; r += fo * 0.45;
    // the guitarist, to the right: G, D, Em, C, a strum ~1.5 times a second
    if (w >= nextStrum) {
      strumK++; nextStrum = strumAt(strumK + 1);
      const ch = CHORD[Math.floor(strumK / 4) % 4];
      strings.forEach((s, i) => { s.len = Math.round(SR / N(ch[i])); s.exc = Math.round(0.006 * SR); s.left = Math.round(i * 0.012 * SR) ; });
    }
    let gt = 0;
    for (const s of strings) {
      if (s.left > 0) { s.left--; continue; }
      let x = s.buf[s.i];
      if (s.exc > 0) { x += excLP.run(white()) * 0.6; s.exc--; }
      const j = (s.i + 1) % s.len;
      const y = 0.4985 * (x + s.buf[j]);
      s.buf[s.i] = y;
      s.i = j;
      gt += x;
    }
    gt *= 0.05 * (1 - 0.4 * rain);
    l += gt * 0.55; r += gt * 1.1;
    // the ball: soft thuds (no slaps)
    for (const t of thuds) {
      const dt = w - t.w;
      if (dt < -0.01 || dt > 0.25) continue;
      const e = env(dt + 0.01, 0.012, 0.05);
      ph[0] += (95 + 60 * Math.exp(-Math.max(dt, 0) * 30)) / SR;
      const x = (Math.sin(TAU * ph[0]) * 0.6 + thudF.run(white(), 300, 0.7).lp * 0.4) * e * t.g * 0.25;
      l += x * 0.6; r += x;
    }
    // the catch: a soft pat in your hand
    {
      const dt = w - W.catch;
      if (dt > -0.01 && dt < 0.2) { const e = env(dt + 0.01, 0.01, 0.04); const x = thudF.run(white(), 500, 0.8).lp * e * 0.35; l += x; r += x; }
    }
    // the pigeons take off: a burst of wingbeats, fading as they climb away
    {
      const dt = w - W.pigeons;
      if (dt > 0 && dt < 3) {
        const g = smooth(0, 0.15, dt) * Math.exp(-dt * 1.1);
        const flap = 0.5 + 0.5 * Math.sin(TAU * 6.2 * dt) + 0.4 * (0.5 + 0.5 * Math.sin(TAU * 6.9 * dt + 1));
        const x = flapF[0].run(white(), 1100, 0.7).bp * flap * g * 0.22;
        l += x * 1.1; r += x * 0.7;
      }
    }
    // the rain: a hiss on the pavement, a patter, a low wash
    if (rain > 0.001) {
      const hs = rainF[0].run(white(), 5200, 0.6).bp * 0.07 + rainF[1].run(white(), 1600, 0.8).bp * 0.05;
      const lo = rainF[2].run(white(), 380, 0.7).bp * 0.05;
      l += (hs + lo) * rain; r += (rainF[3].run(white(), 5000, 0.6).bp * 0.07 + lo * 0.9 + hs * 0.3) * rain;
    }
    // the thunder (the bolt 2 km away; it reaches you ~5.8 s after the stroke): a crack, then a long rolling rumble
    {
      const dt = w - (W.stroke + 2000 / 343);
      if (dt > -0.05 && dt < 9) {
        const crack = env(dt + 0.05, 0.04, 0.35) * thunF[0].run(white(), 900, 0.5).bp * 0.9;
        const roll = (0.6 + 0.4 * Math.sin(dt * 3.1) * Math.sin(dt * 1.3)) * env(dt, 0.25, 2.6);
        const x = crack + (thunF[1].run(white(), 120, 0.5).lp * 1.6 + thunSub.run(white()) * 5) * roll;
        l += x * 0.5; r += x * 0.48;
      }
    }
    AL[n] = l; AR[n] = r;
  }
  return { AL, AR, NA };
}

// the pad: one chord per stage (video time it is fully in, notes (midi), level, brightness)
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  [0, [38, 45, 50, 57, 64], 0.8, 700],            // the frozen plaza (flash-forward): open fifths, still
  [6.5, [55, 59, 62, 66], 0.35, 900],              // a normal afternoon: Gmaj7, light
  [SEC.x2, [52, 55, 59, 62, 66], 0.6, 1100],       // slow motion: Em9
  [SEC.rain, [48, 55, 59, 62, 64], 0.6, 1000],     // the rain: Cmaj7
  [SEC.see, [50, 53, 57, 60], 0.75, 900],          // you see it coming: Dm7
  [SEC.catch + 0.3, [45, 52, 57, 61, 64], 0.7, 1300], // caught: A major
  [SEC.mind, [50, 57, 62, 66, 69, 74], 0.8, 1700], // your mind races: D major, wide
  [SEC.stuck, [47, 54, 59, 62], 0.65, 800],        // stuck: Bm
  [SEC.guitar, [43, 50, 55, 59, 62], 0.55, 900],   // the guitar: G
  [SEC.sink, [40, 47, 52, 55], 0.7, 520],          // the sound sinks: Em, low and dark
  [SEC.hush, [], 0, 400],                          // [silence]
  [SEC.silent + 1, [26, 38], 0.3, 220],            // a low hum
  [SEC.frozen, [38, 45, 50, 52, 57], 0.6, 750],    // frozen: Dsus2
  [SEC.bolt, [37, 44, 49, 52], 0.75, 700],         // something moves: C#m
  [SEC.stroke + 0.2, [38, 45, 50, 54, 57, 62], 0.9, 1400],   // the flash: D, wide
  [SEC.cost, [36, 43, 48, 51], 0.75, 600],         // your brain heating up: Cm
  [SEC.x1000, [38, 45, 50, 57, 62, 66], 0.85, 1200], // a thousand times: D major
  [SEC.letgo - 1, [38, 45, 50], 0.4, 500],         // let go
  [SEC.letgo + 2, [], 0, 400],
  [SEC.end, [43, 50, 55, 59, 62, 64], 0.65, 1000], // back: G add6, warm
].map(([t, m, g, fc]) => ({ t, f: m.map(N), g, fc }));
// bright plucks: while you notice things and while your mind races
const PLUCKS = [[SEC.climb, SEC.x2 + 2, [67, 71, 74, 78, 81, 83]], [SEC.mind, SEC.x16 + 3, [74, 78, 81, 85, 86, 90, 93]], [SEC.x1000 + 1, SEC.letgo - 3, [74, 81, 86, 90]]];

function loadVoice() {
  const src = path.join(ROOT, 'voice.m4a');
  if (!fs.existsSync(src)) return null;
  const raw = path.join(ROOT, 'out', 'voice_clean.f32');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  const fx = 'highpass=f=75:p=2,afftdn=nf=-55:nr=4:tn=1,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1:g=4,' +
    'treble=g=7:f=5000,deesser=i=0.3,acompressor=threshold=-28dB:ratio=3.5:attack=10:release=110:makeup=3';
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
  if (rec) {   // level: the speech to -17 dBFS RMS
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
  const duck = new Float32Array(NS);
  if (rec) {
    const on = new Uint8Array(NS);
    for (const [a, b, at] of VOICE) {
      const i0 = Math.max(0, Math.round((at - 0.1) * SR)), i1 = Math.min(NS, Math.round((at + b - a + 0.15) * SR));
      on.fill(1, i0, i1);
    }
    let y = 0;
    const att = 1 - Math.exp(-1 / (0.12 * SR)), rel = 1 - Math.exp(-1 / (0.7 * SR)), LA = Math.round(0.2 * SR);
    for (let i = 0; i < NS; i++) { const x = on[Math.min(NS - 1, i + LA)]; y += (x > y ? att : rel) * (x - y); duck[i] = y; }
  }

  // ---- the plaza, played back along the world clock ----
  const plaza = makePlaza();
  const hp1 = [new OnePole(26), new OnePole(26)], hp2 = [new OnePole(26), new OnePole(26)];

  // heartbeats you can still hear, from the silence on (each world-clock beat, at the video time it lands)
  const hearts = [];
  {
    let last = Math.floor(worldT(SEC.sink) / HEART);
    for (let t = SEC.sink; t < SEC.end + 30; t += 1 / 240) {
      const k = Math.floor(worldT(t) / HEART);
      if (k > last) { hearts.push({ t, f: speed(t) }); last = k; }
    }
  }
  const padLP = [new SVF(), new SVF()], whoompF = new SVF(), riseF = [new SVF(), new SVF()], hitF = new SVF(), hitSub = new OnePole(30);
  const heartF = new SVF(), rushF = [new SVF(), new SVF()], ffF = new SVF(), ffSub = new OnePole(35), heatF = new SVF();
  const revL = new Reverb(31), revR = new Reverb(32);
  const ph = new Float64Array(160), padPh = new Float64Array(CHORDS.length * 16), padW = new Float64Array(CHORDS.length);
  let padFc = 400;
  const beats = BEATS.filter((b) => b.v > FF_LEN);
  const RP = rng(55);
  const plucks = [];
  for (const [a, b, notes] of PLUCKS) for (let t = a; t < b; t += 0.14 + RP() * 0.22) plucks.push({ t, f: N(notes[Math.floor(RP() * notes.length)]), p: RP() * 2 - 1, g: 0.5 + RP() * 0.5 });

  for (let n = 0; n < NS; n++) {
    const t = n / SR;
    const v = storyOf(t);
    if (n % 48 === 0) {
      padFc = 0;
      for (let i = 0; i < CHORDS.length; i++) {
        const c = CHORDS[i], nx = CHORDS[i + 1];
        padW[i] = smooth(c.t - 1.8, c.t + 0.6, t) * (nx ? 1 - smooth(nx.t - 1.8, nx.t + 0.6, t) : 1);
        padFc += padW[i] * c.fc;
      }
    }
    let l = 0, r = 0, wet = 0;       // music (dips under the voice)
    let hl = 0, hr = 0, hwet = 0;    // hits and the big moments
    let al = 0, ar = 0;              // the plaza (dips under the voice too)
    const dk = 1 - 0.8 * duck[n];
    // --- the plaza: read along the world clock (linear interpolation), then your ears' low limit ---
    {
      const pos = worldT(v) * SR, i = Math.floor(pos), k = pos - i;
      if (i >= 0 && i + 1 < plaza.NA) {
        al = plaza.AL[i] * (1 - k) + plaza.AL[i + 1] * k;
        ar = plaza.AR[i] * (1 - k) + plaza.AR[i + 1] * k;
      }
      // (two one-pole high-passes ~ 26 Hz: what sinks under that is gone)
      al -= hp1[0].run(al); al -= hp2[0].run(al);
      ar -= hp1[1].run(ar); ar -= hp2[1].run(ar);
      // the sinking sound gets a little quieter as it drops (it loses its detail first)
      const f = speed(v), g = 1 / (1 + 0.12 * Math.log2(f));
      al *= g; ar *= g;
    }
    // --- the pad ---
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
          const x = (saw(padPh[j]) * 0.45 + Math.sin(TAU * padPh[j + 8]) * 0.75) * a * w * c.g;
          pl += x * (q % 2 ? 0.8 : 1.1); pr += x * (q % 2 ? 1.1 : 0.8);
        }
      }
      pl = padLP[0].run(pl, Math.max(150, padFc), 0.7).lp * 0.05; pr = padLP[1].run(pr, Math.max(150, padFc), 0.7).lp * 0.05;
      l += pl; r += pr; wet += (pl + pr) * 0.6;
    }
    // --- bright plucks (soft sine bells) ---
    for (const p of plucks) {
      const dt = t - p.t;
      if (dt < 0 || dt > 1.4) continue;
      const e = env(dt, 0.006, 0.35);
      const x = Math.sin(TAU * p.f * dt) * e * 0.012 * p.g;
      l += x * (1 - 0.5 * p.p); r += x * (1 + 0.5 * p.p); wet += x * 2;
    }
    // --- each doubling: a deep, soft whoomp ---
    for (let i = 0; i < beats.length; i++) {
      const dt = t - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.4);
        ph[140 + (i % 2)] += (36 + 26 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const x = (Math.sin(TAU * ph[140 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.7) * e * 0.2;
        hl += x; hr += x; hwet += x * 0.25;
      }
    }
    // --- the lightning's leader crawling down: a thin rising tone and air, up to the flash ---
    {
      const g = smooth(SEC.bolt + 2, SEC.leader + 2, t) * (1 - smooth(SEC.stroke - 0.05, SEC.stroke + 0.05, t));
      if (g > 0.001) {
        const k = smooth(SEC.leader - 4, SEC.stroke, t);
        ph[60] += (180 + 700 * k * k) / SR;
        const x = Math.sin(TAU * ph[60]) * 0.03 * g * (0.4 + 0.6 * k) + riseF[0].run(white(), 600 + 2400 * k * k, 0.8).bp * 0.05 * g * k;
        hl += x; hr += x * 0.9; hwet += x * 0.6;
      }
    }
    // --- each flash: a deep soft hit and a bright bloom ---
    for (const st of [SEC.stroke, SEC.stroke2, SEC.stroke3]) {
      const dt = t - st;
      if (dt > -0.05 && dt < 6) {
        const d = Math.max(dt, 0), att = smooth(-0.04, 0.05, dt);
        ph[70] += (28 + 40 * Math.exp(-d * 3)) / SR;
        const sub = Math.sin(TAU * ph[70]) * Math.exp(-d * 1.2) * 0.45 + hitSub.run(white()) * 3 * Math.exp(-d * 1.5);
        const air = hitF.run(white(), 300 + 2600 * Math.exp(-d * 2.2), 0.9).bp * Math.exp(-d * 1.4) * 0.12;
        let ch = 0;
        [146.8, 220, 293.7, 370, 440].forEach((f, q) => { ph[74 + q] += f / SR; ch += Math.sin(TAU * ph[74 + q]); });
        ch *= smooth(0, 0.3, d) * Math.exp(-d * 0.55) * 0.03;
        const g = st === SEC.stroke ? 1 : 0.7;
        hl += (sub + air + ch) * att * g; hr += (sub * 0.97 + air * 0.95 + ch) * att * g; hwet += (air + ch) * att * g;
      }
    }
    // --- your heart (felt more than heard): a deep lub-dub, drawn out when you're fast ---
    for (const hb of hearts) {
      const s = Math.min(3, Math.pow(hb.f, 0.22)), dt = (t - hb.t) / s;
      if (dt < 0 || dt > 0.9) continue;
      const e = env(dt, 0.03, 0.1) + 0.6 * env(dt - 0.28, 0.03, 0.12);
      ph[90] += (42 + 12 * e) / SR;
      const x = (Math.sin(TAU * ph[90]) + heartF.run(white(), 80, 0.6).lp * 0.8) * e * 0.3 * (t < SEC.back ? 1 : 0.4);
      hl += x; hr += x;
    }
    // --- letting go: a rush building to the world snapping back ---
    {
      const g = smooth(SEC.letgo - 0.5, SEC.back - 0.3, t) * (1 - smooth(SEC.back - 0.3, SEC.back + 1.2, t));
      if (g > 0.001) {
        const k = smooth(SEC.letgo, SEC.back, t);
        const f = 300 + 3500 * k * k;
        hl += rushF[0].run(white(), f, 0.8).bp * g * 0.09; hr += rushF[1].run(white(), f * 1.1, 0.8).bp * g * 0.09;
      }
    }
    // --- your brain heating up: a deep, slowly pulsing hum with a faint sizzle on top, growing with the heat ---
    {
      const f = speed(v);
      const heat = smooth(SEC.cost - 2, SEC.cost + 30, v) * (0.45 + 0.55 * smooth(Math.log(250), Math.log(1024), Math.log(f))) * (1 - smooth(SEC.letgo, SEC.back, v));
      if (heat > 0.002) {
        ph[110] += 46 / SR; ph[111] += 69.3 / SR;
        const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
        const hum = (Math.sin(TAU * ph[110]) + 0.5 * Math.sin(TAU * ph[111])) * 0.05 * heat * pulse;
        const siz = heatF.run(white(), 5500, 0.6).bp * 0.012 * heat * heat;
        hl += hum + siz; hr += hum + siz * 0.8; hwet += siz;
      }
    }
    // --- frame 0: the flash-forward opens on a low hit and a held, glassy tone ---
    if (t < FF_LEN) {
      const fade = 1 - smooth(FF_LEN - 0.6, FF_LEN, t);
      ph[100] += (32 + 30 * Math.exp(-t * 3)) / SR;
      const hit = Math.sin(TAU * ph[100]) * env(t, 0.015, 0.8) * 0.35 + ffSub.run(white()) * 2 * env(t, 0.02, 0.6);
      let gl = 0;
      [1174.7, 1760, 2349.3].forEach((f, q) => { ph[104 + q] += f / SR; gl += Math.sin(TAU * ph[104 + q]) / (q + 1); });
      gl *= 0.008 * smooth(0, 0.8, t) * fade;
      hl += hit * fade + gl; hr += hit * fade + gl; hwet += gl * 2 + hit * 0.3;
    }
    // the silence: everything but the low hum steps back
    const hush = 1 - 0.85 * smooth(SEC.hush - 0.6, SEC.hush, t) * (1 - smooth(SEC.silent + 1, SEC.silent + 3, t));
    const fade = 1 - smooth(SEC.out - 2.5, SEC.out, t);
    // levels: the plaza and music dip ~14 dB under the voice, the hits ~8 dB
    const ga = 2.5 * dk, gh = 1.6 * (1 - 0.6 * duck[n]), gp = 1.6 * dk;
    const rl = revL.run((wet * ga + hwet * gh) * 0.5), rr = revR.run((wet * ga + hwet * gh) * 0.5);
    L[n] = (l * ga + hl * gh + al * gp + rl * 0.7) * fade * hush;
    R[n] = (r * ga + hr * gh + ar * gp + rr * 0.7) * fade * hush;
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
