// Procedural soundtrack for "What if you went back in time 1 trillion hours?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Three layers:
//   the BED, each stop's own air (crossfaded under each jump): today's traffic running backward with tape-rewind chirps,
//     1912's crowd murmur, the forest's leaves and birds, the ice age's cold wind, the grassland's wind and insects,
//     dusk crickets, the surf, the Cretaceous' insect hum;
//   the HITS: a shout on frame 0 (the owner's clip); every jump = the device charging (a rising whine), a whoosh and a
//     deep boom; and each stop's danger: hooves and wheels and a whinny, the moose's bellow and hoof thunder, the
//     mastodons' footsteps and trumpets, the bear's charge and roars, the cats' growls and hiss, the shark's splash, the
//     brachiosaur's footsteps and call, the Acrocanthosaurus' roars and running feet;
//   the MUSIC: a minor drone whose root steps down at every jump (deeper into the past), a braam on each jump.
// The loop: under the last white the run's own lead-in (today's street) fades in, so the sound runs on across the seam.
// Every onset is soft (a few ms attack), so nothing clicks; a slow leveller keeps the whole track at -9 to -16 dB.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, JUMPS, V_WHITE, stopAt } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; }
}
class Reverb {
  constructor(seed) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.84, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));
const win = (v, a, b, c, d) => smooth(a, b, v) * (1 - smooth(c, d, v));
function loadClip(name) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) { console.warn(`audio: no sounds/${name}: left out`); return null; }
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 27 });
  const f = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1, n: f.length / 2 };
}

// a roar / growl / bellow: a voice at f0 with a subharmonic and a throat rattle, through a big animal's formants
function makeVoice({ t0, dur, f0 = 62, gain = 1, pan = 0, seed = 1, shape = 'roar', formant = 1, glide = 0.32 }) {
  const R = rng(seed);
  const F = [new SVF(), new SVF(), new SVF(), new SVF()], N = [new SVF(), new SVF()], sub = new OnePole(70);
  let ph = 0, ph2 = 0, ph3 = 0, jit = 0;
  return {
    t0, pan,
    run(v, white) {
      const t = v - t0;
      if (t < 0 || t > dur + 0.6) return 0;
      const u = t / dur;
      const a = smooth(0, shape === 'hiss' ? 0.05 : 0.15, t) * (1 - smooth(dur - 0.15, dur + 0.5, t));
      const f = f0 * (shape === 'growl' ? 1 + 0.06 * Math.sin(t * 3.1) : 1 + glide * Math.sin(Math.PI * Math.min(u * 1.2, 1)) - 0.18 * smooth(0.75, 1, u));
      jit += (white() * 0.5 - jit) * 0.002;
      ph += f * (1 + 0.04 * jit) / SR; ph2 += f * 0.5 / SR; ph3 += 27 / SR;
      const fl = 0.55 + 0.45 * Math.sin(TAU * (23 + 6 * Math.sin(t * 1.7)) * t + 2 * Math.sin(t * 5.3));
      const br = white();
      if (shape === 'hiss') return N[0].run(br, 4200, 0.6).bp * a * gain * (0.7 + 0.3 * fl);
      let src = saw(ph) * 0.8 + saw(ph * 2.01) * 0.25 + Math.sin(TAU * ph2) * 0.55 * (0.6 + 0.4 * Math.sin(t * 2.3));
      src *= 0.4 + 0.6 * fl;
      const open = shape === 'growl' ? 0.35 : 0.6 + 0.4 * Math.sin(Math.PI * Math.min(u * 1.3, 1));
      let y = F[0].run(src, (380 + 140 * open) * formant, 0.55).bp * 1.2
        + F[1].run(src, (820 + 380 * open) * formant, 0.5).bp * 0.9
        + F[2].run(src + br * 0.4, (1900 + 500 * open) * formant, 0.45).bp * 0.55 * open
        + F[3].run(br, 3100 * formant, 0.6).bp * 0.18 * open
        + N[0].run(br, (650 + 300 * open) * formant, 0.35).bp * 0.35 * fl;
      y = Math.tanh(y * 2.2) * 0.6;
      y += sub.run(Math.sin(TAU * ph3) * (0.6 + 0.4 * fl)) * 0.6 * (formant < 1.5 ? 1 : 0.2) + N[1].run(br, 90, 0.7).bp * 0.3 * fl;
      return y * a * gain;
    },
  };
}
// a brassy trumpet (the mastodons): a bright saw through a trunk-like resonance, pitch up then down
function makeTrumpet({ t0, dur, f0 = 330, gain = 1, pan = 0 }) {
  const F = [new SVF(), new SVF()];
  let ph = 0;
  return {
    t0, pan,
    run(v, white) {
      const t = v - t0;
      if (t < 0 || t > dur + 0.4) return 0;
      const u = t / dur;
      const a = smooth(0, 0.08, t) * (1 - smooth(dur - 0.2, dur + 0.3, t));
      const f = f0 * (1 + 0.5 * Math.sin(Math.PI * Math.min(u * 1.6, 1)) - 0.25 * smooth(0.6, 1, u)) * (1 + 0.012 * Math.sin(t * 38));
      ph += f / SR;
      const s = saw(ph) + 0.4 * saw(ph * 2) + 0.15 * white();
      return Math.tanh((F[0].run(s, 1300, 0.3).bp * 1.4 + F[1].run(s, 2600, 0.4).bp * 0.6) * 1.8) * a * gain;
    },
  };
}
// a whinny: a high voice that rises, flutters and falls
function makeWhinny({ t0, gain = 1, pan = 0 }) {
  const F = [new SVF(), new SVF()];
  let ph = 0;
  return {
    t0, pan,
    run(v, white) {
      const t = v - t0;
      if (t < 0 || t > 1.4) return 0;
      const f = 700 + 600 * Math.sin(Math.PI * Math.min(t / 0.5, 1)) * (t < 0.5 ? 1 : 1 - smooth(0.5, 1.2, t)) + 90 * Math.sin(t * 60);
      ph += f / SR;
      const s = saw(ph) * (0.6 + 0.4 * Math.sin(t * 55)) + 0.2 * white();
      const a = smooth(0, 0.05, t) * (1 - smooth(0.9, 1.35, t));
      return (F[0].run(s, 1100, 0.4).bp + F[1].run(s, 2400, 0.5).bp * 0.6) * a * gain;
    },
  };
}

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 1.0;                                    // a lead-in before frame 0 (used under the loop's white)
  const T1 = VIDEO_DURATION + 0.2;
  const N = Math.ceil((T1 - T0) * SR);
  const idx = (t) => clamp(Math.round((t - T0) * SR), 0, N - 1);
  const L = new Float32Array(N), R = new Float32Array(N);     // hits
  const BL = new Float32Array(N), BR = new Float32Array(N);   // bed
  const UL = new Float32Array(N), UR = new Float32Array(N);   // music
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;
  const put = (A, B, n, x, pan) => { A[n] += x * Math.cos((pan + 1) * Math.PI / 4) * 1.41; B[n] += x * Math.sin((pan + 1) * Math.PI / 4) * 1.41; };
  const J = JUMPS, ALLJ = [...JUMPS, V_WHITE];

  // ---------- the owner's shout on frame 0 ----------
  const SCREAM = loadClip('scream.mp3');
  if (SCREAM) {
    const at = 0.08, g = 0.55 / SCREAM.pk;
    for (let i = 0; i < SCREAM.n; i++) {
      const t = at + i / SR, n = idx(t);
      if (t > T1) break;
      const fade = Math.min(1, i / 200) * (1 - smooth(2.2, 3.2, i / SR));
      L[n] += SCREAM.f[i * 2] * g * fade; R[n] += SCREAM.f[i * 2 + 1] * g * fade;
    }
  }

  // ---------- one-shot voices ----------
  // (all timed from the jumps: J[0] 1912 .. J[6] dinosaurs)
  const VOICES = [
    makeWhinny({ t0: J[0] + 3.0, gain: 0.55, pan: 0.1 }),                                                           // the team spooks
    makeWhinny({ t0: J[1] - 0.9, gain: 0.45, pan: -0.05 }),
    makeVoice({ t0: J[1] + 0.6, dur: 1.4, f0: 95, gain: 0.55, pan: -0.4, seed: 3, shape: 'growl', formant: 1.3 }),     // the moose
    makeVoice({ t0: J[2] - 2.0, dur: 0.8, f0: 110, gain: 0.7, pan: -0.1, seed: 4, formant: 1.3 }),
    makeTrumpet({ t0: J[2] + 2.35, dur: 1.5, f0: 300, gain: 0.55, pan: -0.2 }),                                     // mastodons
    makeTrumpet({ t0: J[2] + 3.75, dur: 1.1, f0: 240, gain: 0.35, pan: -0.5 }),
    makeTrumpet({ t0: J[2] + 4.9, dur: 0.9, f0: 330, gain: 0.5, pan: -0.05 }),
    makeVoice({ t0: J[3] + 2.55, dur: 0.9, f0: 72, gain: 1.0, pan: -0.15, seed: 7 }),                               // the bear stands and roars
    makeVoice({ t0: J[3] + 3.4, dur: 0.8, f0: 52, gain: 0.45, pan: -0.15, seed: 8, shape: 'growl' }),
    makeVoice({ t0: J[3] + 4.3, dur: 0.6, f0: 78, gain: 0.8, pan: -0.15, seed: 9 }),
    makeVoice({ t0: J[4] - 0.4, dur: 0.6, f0: 70, gain: 1.1, pan: -0.05, seed: 10 }),
    makeVoice({ t0: J[4] + 1.5, dur: 1.3, f0: 120, gain: 0.45, pan: -0.6, seed: 11, shape: 'growl', formant: 1.5 }),  // cats
    makeVoice({ t0: J[4] + 2.6, dur: 1.2, f0: 105, gain: 0.4, pan: 0.6, seed: 12, shape: 'growl', formant: 1.5 }),
    makeVoice({ t0: J[4] + 3.7, dur: 1.4, f0: 115, gain: 0.5, pan: -0.3, seed: 13, shape: 'growl', formant: 1.5 }),
    makeVoice({ t0: J[5] - 1.25, dur: 0.45, f0: 0, gain: 0.5, pan: -0.2, seed: 14, shape: 'hiss' }),
    makeVoice({ t0: J[5] - 0.8, dur: 0.7, f0: 150, gain: 0.9, pan: -0.1, seed: 15, formant: 1.6, glide: 0.5 }),
    makeVoice({ t0: 40.0, dur: 2.2, f0: 38, gain: 0.55, pan: -0.3, seed: 16, shape: 'growl', formant: 0.6 }),       // the brachiosaur's call
    makeVoice({ t0: 40.2, dur: 1.1, f0: 60, gain: 0.9, pan: -0.1, seed: 17 }),                                      // Acrocanthosaurus
    makeVoice({ t0: 45.25, dur: 1.0, f0: 56, gain: 1.5, pan: 0, seed: 19 }),
  ];
  // ---------- footfalls: [time, gain, pan, weight (0 light .. 1 huge)] ----------
  const STEPS = [];
  // 1912: the gallop (four beats a stride): close as the team crosses, quieter on the far side of its loop, loud as it comes
  for (let t = J[0]; t < J[1]; ) {
    const u = t - J[0], near = u < 1.4 ? 0.55 : u < 2.6 ? 0.55 - 0.3 * smooth(1.4, 2.6, u) : 0.25 + 0.75 * smooth(3.2, 5.5, u) ** 2;
    const sp = 8.6 + 2.6 * smooth(3.2, 4.0, u), per = 5.2 / sp / 4;
    STEPS.push([t, 0.08 + 0.5 * near, -0.05, 0.15]); t += per * (0.85 + 0.3 * ((t * 7.3) % 1));
  }
  // the moose: heavy steps, then its charge
  for (let t = J[1] + 0.3; t < J[2] - 1.9; t += 0.42 + 0.1 * ((t * 3.1) % 1)) STEPS.push([t, 0.12 + 0.2 * smooth(J[1], J[2] - 2, t), -0.3, 0.45]);
  for (let t = J[2] - 1.9; t < J[2]; ) { STEPS.push([t, 0.2 + 0.5 * smooth(J[2] - 1.9, J[2], t) ** 2, -0.2, 0.4]); t += 0.12 + 0.08 * ((t * 13.1) % 1); }
  // the mastodons
  for (let t = J[2] + 0.1; t < J[3]; t += 0.42 + 0.2 * ((t * 3.7) % 1)) STEPS.push([t, 0.18 + 0.45 * smooth(J[2], J[3] - 0.1, t), ((t * 5.1) % 1) - 0.6, 0.85]);
  // the bear's charge, the thump as it drops from standing, its run at you
  for (let t = J[3]; t < J[3] + 2.4; ) { STEPS.push([t, 0.2 + 0.5 * smooth(J[3], J[3] + 2.3, t), -0.2, 0.55]); t += 0.11 + 0.06 * ((t * 9.7) % 1); }
  STEPS.push([J[3] + 3.4, 0.9, 0, 0.7]);
  for (let t = J[3] + 3.6; t < J[4]; ) { STEPS.push([t, 0.4 + 0.5 * smooth(J[3] + 3.6, J[4], t), -0.1, 0.6]); t += 0.16 + 0.05 * ((t * 7.7) % 1); }
  // the lead cat's run (light, quick), then its leap
  for (let t = J[4] + 1.0; t < J[5] - 0.8; ) { STEPS.push([t, 0.05 + 0.3 * smooth(J[4] + 1, J[5] - 0.8, t) ** 2, -0.05, 0.2]); t += 0.13 + 0.04 * ((t * 11.3) % 1); }
  STEPS.push([J[5] - 0.82, 0.55, -0.05, 0.4]);
  // the brachiosaur (huge, slow) and the Acrocanthosaurus running
  for (let t = 38.6; t < 42.5; t += 0.95) STEPS.push([t, 0.55, -0.2, 1.0]);
  for (let t = 41.0; t < V_WHITE; t += 0.38) STEPS.push([t, 0.2 + 0.8 * smooth(41.0, 45.8, t) ** 1.5, -0.05, 0.8]);
  // the jumps: [time] -> charge, whoosh, boom
  const revL = new Reverb(11), revR = new Reverb(12);
  {
    const sF = STEPS.map(() => ({ f: new SVF(), ph: 0 }));
    const jW = ALLJ.map(() => ({ f: new SVF(), f2: new SVF(), ph: 0, ph2: 0 }));
    const splash = new SVF(), splash2 = new SVF(), pour = new SVF();
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      let l = 0, r = 0;
      for (const vo of VOICES) { const y = vo.run(t, white); if (y) { l += y * Math.cos((vo.pan + 1) * Math.PI / 4) * 1.41; r += y * Math.sin((vo.pan + 1) * Math.PI / 4) * 1.41; } }
      // footfalls: a felt thump (a falling sine) + a short soft noise crunch
      STEPS.forEach(([ts, g, pan, wt], i) => {
        const d = t - ts;
        if (d < 0 || d > 1.2) return;
        const S = sF[i];
        const f = (40 + 60 * (1 - wt)) * (1 + 1.5 * Math.exp(-d / 0.03));
        S.ph += f / SR;
        const y = (Math.sin(TAU * S.ph) * env(d, 0.004, 0.08 + 0.25 * wt) * (0.6 + 0.6 * wt) + S.f.run(white(), 300 + 900 * (1 - wt), 0.6).bp * env(d, 0.003, 0.03 + 0.05 * wt) * 0.6) * g;
        l += y * (1 - Math.max(pan, 0)); r += y * (1 + Math.min(pan, 0));
      });
      // the jumps
      ALLJ.forEach((Jt, i) => {
        const d = t - Jt, W = jW[i];
        if (d < -0.95 || d > 1.6) return;
        // the device charging: a rising whine with a flutter
        if (d < 0.05) { const u = smooth(-0.95, 0, d); W.ph += (300 + 2600 * u * u) / SR; const y = (Math.sin(TAU * W.ph) * 0.6 + Math.sin(TAU * W.ph * 1.5) * 0.25) * u * u * 0.22 * (1 - smooth(0, 0.05, d)); l += y; r += y; }
        // the whoosh: noise swept from high to low through the white
        const ws = win(d, -0.25, -0.02, 0.15, 0.55);
        if (ws > 0) { const fc = 5000 * Math.exp(-Math.max(d + 0.25, 0) * 4.5) + 250; const y = W.f.run(white(), fc, 0.5).bp * ws * 0.9; l += y * (1 + 0.3 * Math.sin(d * 9)); r += y * (1 - 0.3 * Math.sin(d * 9)); }
        // the boom
        if (d > 0) { W.ph2 += (32 + 40 * Math.exp(-d / 0.08)) / SR; const y = Math.sin(TAU * W.ph2) * env(d, 0.006, 0.55) * 0.75 + W.f2.run(white(), 180, 0.6).bp * env(d, 0.004, 0.12) * 0.6; l += y; r += y; }
      });
      // the shark's splash and the water pouring off it
      // the shark: its bow wave growing once the head is up (J[5] + 2.2), a big splash as it lunges out (J[5] + 4.3), water pouring off it
      {
        const u = t - J[5];
        if (u > 0 && u < 7.2) {
          const bow = smooth(1.0, 2.6, u) * (1 - smooth(6.7, 7.0, u)), d = u - 4.3;
          let y = pour.run(white(), 900 + 1800 * smooth(2, 6, u), 0.6).bp * bow * (0.25 + 0.35 * smooth(2.2, 4.3, u));
          if (d > 0) y += splash.run(white(), 1200 * Math.exp(-d * 1.5) + 200, 0.5).bp * env(d, 0.01, 0.5) * 1.2 + splash2.run(white(), 90, 0.8).bp * env(d, 0.01, 0.35) * 1.3;
          l += y; r += y;
        }
      }
      // the wagon's wheels rattling as it comes
      { const w = win(t, J[0], J[0] + 0.3, J[1] - 0.2, J[1] + 0.05) * (0.3 + 0.7 * smooth(J[0] + 3, J[1], t) ** 2); if (w > 0) { const y = pour.run(white(), 700, 0.8).bp * (0.6 + 0.4 * Math.sin(t * 52)) * w * 0.25; l += y; r += y; } }
      const wet = (l + r) * 0.5;
      const rl = revL.run(wet * 0.25), rr2 = revR.run(wet * 0.25);
      L[n] += l + rl * 0.5; R[n] += r + rr2 * 0.5;
    }
  }

  // ---------- the bed: each stop's own air ----------
  {
    const f = Array.from({ length: 12 }, () => new SVF()), lp = new OnePole(250), lp2 = new OnePole(120);
    const birds = []; { const r = rng(7); for (let t = J[1]; t < J[2] + 0.5; t += 0.15 + r() * 0.5) birds.push([t, 2600 + r() * 3000, 0.06 + r() * 0.1, r() * 2 - 1]); }
    const bph = birds.map(() => 0);
    const chirps = []; { const r = rng(8); for (let t = T0; t < J[0] + 0.3; t += 0.12 + r() * 0.2) chirps.push([t, r() < 0.5 ? 1 : -1]); }
    let cph = 0, iph = 0, wph = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const k = t < 0 ? 0 : stopAt(t);
      // weights per stop, crossfaded over the white of each jump
      const wOf = (kk) => { const a = kk === 0 ? -99 : J[kk - 1], b = kk < J.length ? J[kk] : 99; return smooth(a - 0.08, a + 0.08, t) * (1 - smooth(b - 0.08, b + 0.08, t)); };
      const ww = [0, 1, 2, 3, 4, 5, 6, 7].map(wOf);
      if (t < 0) { ww.fill(0); ww[0] = 1; }
      if (t > V_WHITE) { ww.fill(0); ww[7] = 1 - smooth(V_WHITE, V_WHITE + 0.2, t); }
      const nz = white();
      let l = 0, r = 0;
      // today: traffic rumble, cars swishing past backward (a swell then a cut), tape-rewind squeaks
      if (ww[0] > 0) {
        const rum = lp.run(nz) * 2.2;
        const ph = ((t + 3) * 1.7) % 1, sw = Math.pow(ph, 3) * (ph < 0.97 ? 1 : (1 - ph) / 0.03);
        const swish = f[0].run(nz, 600 + 2200 * ph, 0.7).bp * sw * 0.9;
        let ch = 0; for (const [tc, s] of chirps) { const d = t - tc; if (d > 0 && d < 0.12) { cph += (1800 + s * 1400 * d / 0.12 + 300 * Math.sin(d * 300)) / SR; ch += Math.sin(TAU * cph) * Math.sin(Math.PI * d / 0.12) * 0.12; } }
        const crowd = f[1].run(nz, 500 + 200 * Math.sin(t * 3.1), 0.4).bp * (0.5 + 0.3 * Math.sin(t * 4.3) * Math.sin(t * 1.7)) * 0.6;
        l += (rum + swish * (0.7 + 0.3 * Math.sin(t)) + ch + crowd) * ww[0]; r += (rum + swish * (0.7 - 0.3 * Math.sin(t)) + ch * 0.8 + crowd) * ww[0];
      }
      // 1912: a crowd murmuring, a low city hum
      if (ww[1] > 0) {
        const c = f[2].run(nz, 450 + 150 * Math.sin(t * 2.3), 0.35).bp * (0.6 + 0.4 * Math.sin(t * 3.7) * Math.sin(t * 1.3)) * 0.8 + lp2.run(nz) * 1.6;
        l += c * ww[1]; r += c * ww[1] * 0.95;
      }
      // the forest: leaves in the wind, birds
      if (ww[2] > 0) {
        const lv = f[3].run(nz, 2200 + 800 * Math.sin(t * 0.7), 0.6).bp * (0.5 + 0.5 * Math.sin(t * 0.9) ** 2) * 0.55;
        let b = 0; birds.forEach(([tb, fb, db, pan], i) => { const d = t - tb; if (d > 0 && d < db) { bph[i] += fb * (1 + 0.3 * Math.sin(d / db * Math.PI * 3)) / SR; b += Math.sin(TAU * bph[i]) * Math.sin(Math.PI * d / db) * 0.09; } });
        l += (lv + b) * ww[2]; r += (lv * 0.9 + b * 0.7) * ww[2];
      }
      // the ice age: a cold howling wind
      if (ww[3] > 0) {
        const wd = f[4].run(nz, 500 + 350 * Math.sin(t * 0.6) + 150 * Math.sin(t * 1.9), 0.15).bp * 0.9 + f[5].run(nz, 1400, 0.4).bp * 0.15;
        l += wd * ww[3]; r += wd * ww[3] * (0.85 + 0.15 * Math.sin(t));
      }
      // the grassland: wind through the grass, insects
      if (ww[4] > 0) {
        iph += 4800 / SR;
        const g = f[6].run(nz, 1800, 0.5).bp * (0.5 + 0.4 * Math.sin(t * 1.1)) * 0.5 + Math.sin(TAU * iph) * (0.5 + 0.5 * Math.sin(t * 40)) * 0.02 + lp2.run(nz) * 0.8;
        l += g * ww[4]; r += g * ww[4];
      }
      // dusk: crickets, a low wind
      if (ww[5] > 0) {
        cph += 4300 / SR;
        const cr = Math.sin(TAU * cph) * Math.max(0, Math.sin(t * 2 * TAU * 7)) * (Math.sin(t * TAU * 1.1) > 0 ? 1 : 0.2) * 0.08;
        const wd = f[7].run(nz, 400, 0.3).bp * 0.55;
        l += (cr + wd) * ww[5]; r += (cr * 0.7 + wd) * ww[5];
      }
      // the shore: waves breaking on the rocks, sea wind
      if (ww[6] > 0) {
        const sw = Math.pow(0.5 + 0.5 * Math.sin(t * TAU / 4.2), 2);
        const s = f[8].run(nz, 500 + 1500 * sw, 0.4).bp * (0.3 + 0.9 * sw) * 0.9 + f[9].run(nz, 2500, 0.6).bp * 0.15;
        l += s * ww[6]; r += s * ww[6] * (0.9 + 0.1 * Math.cos(t));
      }
      // the Cretaceous: an insect drone, a warm wind
      if (ww[7] > 0) {
        wph += 210 / SR;
        const ins = f[10].run(nz, 6000, 0.5).bp * (0.4 + 0.6 * Math.abs(Math.sin(t * 25))) * 0.2 + Math.sin(TAU * wph) * 0.015 * (1 + Math.sin(t * 7)) + f[11].run(nz, 700, 0.3).bp * 0.3;
        l += ins * ww[7]; r += ins * ww[7];
      }
      BL[n] = l; BR[n] = r;
    }
  }

  // ---------- the music: a minor drone, its root stepping down at each jump; a braam on each jump ----------
  {
    const ROOT = [55, 49, 46.25, 41.2, 43.65, 38.9, 36.7, 32.7];
    const ph = new Float64Array(6), f1 = new SVF(), f2 = new SVF(), bph = new Float64Array(4), bf = new SVF();
    let root = ROOT[0];
    const rv = new Reverb(21);
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const k = t < 0 ? 0 : stopAt(t);
      root += (ROOT[k] - root) * 0.0004;
      const fr = [root, root * 1.5, root * 2, root * 2.378, root * 3, root * 4.01];
      let y = 0;
      for (let i = 0; i < 6; i++) { ph[i] += fr[i] * (1 + 0.002 * Math.sin(t * (0.3 + i * 0.17))) / SR; y += saw(ph[i]) * [0.5, 0.3, 0.35, 0.22, 0.15, 0.08][i]; }
      const open = 300 + 600 * (0.5 + 0.5 * Math.sin(t * 0.5)) + 1200 * smooth(30, 45, t);
      y = f1.run(y, open, 0.6).lp * 0.35;
      // braams
      let b = 0, dl = 9;
      for (const Jt of ALLJ) {
        const d = t - Jt;
        if (d < 0 || d > 2.2) continue;
        dl = Math.min(dl, d);
        for (let i = 0; i < 4; i++) { bph[i] += ROOT[Math.min(stopAt(Jt + 0.01), 7)] * [1, 1.006, 2, 1.5][i] / SR; b += saw(bph[i]) * env(d, 0.02, 0.7) * [0.6, 0.5, 0.3, 0.25][i]; }
      }
      b = bf.run(b, 200 + 1800 * Math.exp(-dl * 2.5), 0.5).lp;
      const out = y + b * 0.8;
      const w = rv.run(out * 0.4);
      UL[n] = out + w * 0.6; UR[n] = out * 0.95 + w * 0.65;
    }
  }

  // ================= the mix =================
  const rms = (A, B, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + B[n] * B[n]; c += 2; } return Math.sqrt(e / c) || 1e-9; };
  const hitR = rms(L, R, 0, 46), bedR = rms(BL, BR, 0, 46), musR = rms(UL, UR, 0, 46);
  const gBed = (hitR / bedR) * Math.pow(10, -7 / 20), gMus = (hitR / musR) * Math.pow(10, -6 / 20);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    // (the lead-in before frame 0 is played under the loop's white: a little louder so the seam never dips)
    const t = T0 + n / SR, gb = gBed * (1 + 0.8 * (1 - smooth(0.0, 0.4, t)));
    ML[n] = L[n] + BL[n] * gb + UL[n] * gMus; MR[n] = R[n] + BR[n] * gb + UR[n] * gMus;
  }
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = ML[o0 + n], r = MR[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = o0 + n - M;
      l = l * wo + ML[j] * wi; r = r * wo + MR[j] * wi;
    }
    OL[n] = l; OR[n] = r;
  }
  // a slow leveller: the quiet gaps lifted, the loudest moments eased a little, each hit keeps its attack
  {
    let e0 = 0; for (let n = 0; n < M; n++) e0 += OL[n] * OL[n] + OR[n] * OR[n];
    const ref = Math.sqrt(e0 / (2 * M)), W = Math.round(0.02 * SR), K = Math.ceil(M / W), lev = new Float32Array(K);
    for (let k = 0; k < K; k++) { let q = 0; for (let n = k * W; n < Math.min(M, (k + 1) * W); n++) q += OL[n] * OL[n] + OR[n] * OR[n]; lev[k] = Math.sqrt(q / (2 * W)); }
    const envl = new Float32Array(K); let y = ref;
    for (let k = 0; k < K; k++) { const a = lev[k] > y ? 0.25 : 0.06; y += a * (lev[k] - y); envl[k] = Math.max(y, 1e-6); }
    const gk = new Float32Array(K); for (let k = 0; k < K; k++) gk[k] = clamp(Math.pow(ref / envl[k], 0.75), 0.45, 4);
    let gs = gk[0];
    for (let n = 0; n < M; n++) { const k = Math.floor(n / W); gs += (gk[k] - gs) * 0.0004; OL[n] *= gs; OR[n] *= gs; }
  }
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  const gl = Math.pow(10, -12 / 20) / Math.sqrt(e / (2 * M));
  const ceil = Math.pow(10, -1 / 20), knee = 0.6;
  const lim = (x) => { const a = Math.abs(x); if (a <= knee) return x; return Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee))); };
  for (let n = 0; n < M; n++) {
    OL[n] = lim(OL[n] * gl); OR[n] = lim(OR[n] * gl);
    if (!Number.isFinite(OL[n]) || !Number.isFinite(OR[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
  }
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n], -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n], -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
