// Procedural soundtrack for "What if you screamed 1 trillion times louder?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Built as two layers (owner, Nov 18: the old track sat at one loudness, a flat roar, ~12 dB hotter than the others):
//   the BED: a deep roar with no voice in it that steps up with the counter, the street, the wind, the rubble's rumble,
//     kept ~12 dB under the hits so every break is heard on its own;
//   the HITS: YOUR SCREAM, the real recording, on frame 0 and then in ~1 s bursts at every jump of the counter from
//     1,000,000x on, each one deeper (slower), rougher (driven harder, an octave under it) and echoing longer down the
//     street; a deep boom on every step; glass where and when each pane breaks (glass.js); car alarms; every car that
//     lands; the wall beside you coming down; the pavement torn up past the lens and the asphalt peeling (debris.js);
//     the towers' groans and crashes; people screaming as they're thrown.
//   Half a second of near silence right before 1 trillion, then the biggest hit of the video; the echo's roar into the
//   white. The whole track is set to about the other Shorts' loudness (-15 dBFS, peaks under -1 dB).
// The loop: under the white the run's own lead-in (the scream's attack) fades in, so the sound runs on across the
// seam. Every onset is soft (2 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, HITS, BEATS, logMult, V_RING, V_BACK, V_WHITE } from './src/timeline.js';
import { CAM } from './src/layout.js';
import { SOURCES } from './src/glass.js';
import { CHUNKS, TOWERS } from './src/city.js';
import { CARS } from './src/traffic.js';
import { PEOPLE } from './src/people.js';
import { PAVE, STRIPS } from './src/debris.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const G = 9.81;
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
  run(x, fb = 0.86, damp = 0.3) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

function loadClip(name, ss = 0, t = 30) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-t', String(t), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1, n: f.length / 2 };
}
// read a clip at a fractional sample position (linear), channel ch
const at = (c, pos, ch) => { const i = Math.floor(pos), k = pos - i; if (i < 0 || i + 1 >= c.n) return 0; return c.f[i * 2 + ch] * (1 - k) + c.f[(i + 1) * 2 + ch] * k; };
// how long a thrown thing (physics.js throwAt) is in the air
const flightOf = (T) => (T.vel[1] + Math.sqrt(T.vel[1] * T.vel[1] + 2 * G * Math.max(T.p[1] - T.hs, 0))) / G;

export const V_HUSH = [40.38, 40.97];          // the half second of near silence before 1 trillion

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);       // the hits
  const BL = new Float32Array(N), BR = new Float32Array(N);     // the bed
  const idx = (t) => Math.round((t - T0) * SR);
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;
  const add = (t0, dur, fn) => { const a = Math.max(0, idx(t0)), b = Math.min(N, idx(t0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(t0)) / SR); L[n] += l; R[n] += r; } };

  // ================= your scream: frame 0, then a burst at every jump =================
  const scr = loadClip('scream.mp3');
  const S_ON = -0.12;
  // frame 0: the recording's attack just after it, about a second, sinking away by 1.7 s (as before)
  if (scr) {
    const g0 = 1.0 / scr.pk, sinkF = [new SVF(), new SVF()];
    let pos = 0;
    for (let n = idx(S_ON); n < Math.min(N, idx(1.75)); n++) {
      const t = T0 + n / SR, k = smooth(0.95, 1.7, t);
      pos += 1 - 0.38 * k;
      const fc = 7000 * Math.pow(150 / 7000, k), g = g0 * (1 - k) * Math.min(1, (t - S_ON) / 0.005);
      L[n] += sinkF[0].run(at(scr, pos, 0), fc, 0.9).lp * g; R[n] += sinkF[1].run(at(scr, pos, 1), fc, 0.9).lp * g;
    }
  }
  // the bursts: from 1,000,000x on, at each jump (skipping one that would come too soon after the last), and the
  // biggest at 1 trillion. Each ~1 s: deeper (read slower), rougher (driven, an octave under it), echoing longer
  const BURSTS = [];
  for (let i = 3; i < HITS.length - 1; i++) if (!BURSTS.length || HITS[i] - BURSTS[BURSTS.length - 1] > 2.5) BURSTS.push(HITS[i]);
  BURSTS.push(V_RING);
  if (scr) {
    BURSTS.forEach((t0, k) => {
      const K = BURSTS.length - 1, q = k / K, last = k === K;
      const rate = 1 - 0.42 * q, drive = 1 + 7 * q, oct = 0.15 + 0.6 * q, dur = last ? 1.6 : 1.05;
      const gain = (0.55 + 0.35 * q + (last ? 0.4 : 0)) / scr.pk;
      const dry = new Float32Array(Math.round((dur + 0.05) * SR) * 2);
      const lp = [new SVF(), new SVF()];
      for (let i = 0; i * 2 < dry.length; i++) {
        const dt = i / SR, e = Math.min(1, dt / 0.012) * Math.min(1, Math.max(0, (dur - dt) / 0.28));
        for (const ch of [0, 1]) {
          let x = at(scr, 0.04 * SR + i * rate, ch) + oct * at(scr, 0.04 * SR + i * rate * 0.5, ch);
          x = Math.tanh(x / scr.pk * drive) / Math.tanh(drive) * scr.pk;
          dry[i * 2 + ch] = lp[ch].run(x, 6500 - 3800 * q, 0.8).lp * e * gain;
        }
      }
      // the echoes down the street: more of them, later and darker, the louder it gets
      const taps = [[0, 1]];
      const nT = 2 + Math.round(5 * q);
      for (let j = 1; j <= nT; j++) taps.push([0.13 * Math.pow(j, 1.35) * (1 + 0.6 * q), Math.pow(0.5 + 0.12 * q, j)]);
      for (const [d, g] of taps) {
        const o0 = idx(t0 - 0.02 + d), dark = new OnePole(4000 / (1 + d * 3)), dark2 = new OnePole(4000 / (1 + d * 3));
        const pan = d === 0 ? 0 : (taps.indexOf(taps.find((x) => x[0] === d)) % 2 ? 0.5 : -0.5);
        for (let i = 0; i * 2 < dry.length; i++) {
          const o = o0 + i; if (o < 0 || o >= N) continue;
          L[o] += dark.run(dry[i * 2]) * g * (1 - pan); R[o] += dark2.run(dry[i * 2 + 1]) * g * (1 + pan);
        }
      }
    });
  }

  // ================= the bed =================
  {
    const deepF = [new SVF(), new SVF()], bodyF = [new SVF(), new SVF()], flut = new OnePole(9);
    const cityLP = new OnePole(240), talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
    const windF = [new SVF(), new SVF()], rubF = new SVF(), rubLP = new OnePole(80);
    // how much rubble is moving each moment (near chunks count more)
    const BIN = 100, NB = Math.ceil((VIDEO_DURATION - T0) * BIN) + 2, rub = new Float32Array(NB);
    for (const c of CHUNKS) {
      if (!Number.isFinite(c.dep)) continue;
      const near = 1 / (1 + Math.hypot(c.w[0] - CAM.x, c.w[2] - CAM.z) / 25);
      for (let k = 0; k < 150; k++) { const b = Math.round((c.dep - T0) * BIN) + k; if (b >= 0 && b < NB) rub[b] += near * Math.exp(-k / 60) * 0.004; }
    }
    let bL = 0, bR = 0, brL = 0, brR = 0, ph = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const Lm = logMult(t), k = clamp(Lm / 12, 0, 1);
      bL = bL * 0.997 + white() * 0.04; bR = bR * 0.997 + white() * 0.04;
      brL = brL * 0.995 + white() * 0.05; brR = brR * 0.995 + white() * 0.05;
      let l = 0, r = 0;
      // the roar: noise, no voice, stepping up with the counter
      const fl = 0.65 + 0.35 * clamp(flut.run(white() * 6), -1, 1);
      const dL = deepF[0].run(bL * 3, 70 + 160 * k, 0.8).lp, dR = deepF[1].run(bR * 3, 75 + 160 * k, 0.8).lp;
      const yL = bodyF[0].run(white(), 140 + 380 * k, 1.6).bp, yR = bodyF[1].run(white(), 150 + 400 * k, 1.6).bp;
      ph += (32 + 14 * k) / SR;
      const sub = Math.sin(TAU * ph) * (0.25 + 0.5 * k);
      const g = smooth(0.55, 2.0, t) * (0.07 + 0.045 * Lm) * (1 - 0.5 * smooth(V_WHITE, T_SWITCH, t));
      l += (dL * 1.4 + yL * 0.5 * (0.4 + k) * fl + sub * 0.35) * g; r += (dR * 1.4 + yR * 0.5 * (0.4 + k) * fl + sub * 0.35) * g;
      // the street: traffic hum and voices, quiet once everyone's stopped
      const street = 1 - smooth(1.5, 7, t);
      if (street > 0) {
        const hum = cityLP.run(brL) * 2.2;
        l += hum * 0.1 * street; r += hum * 0.1 * street;
        for (let j = 0; j < 6; j++) {
          const syl = 0.5 + 0.5 * Math.sin(t * (3.1 + j * 0.7) + j * 2 + Math.sin(t * (1.3 + j * 0.3)) * 2);
          const e = talkE[j].run(syl > 0.65 ? 1 : 0), o = talkF[j].run(white(), 500 + j * 180 + 250 * Math.sin(t * (2 + j)), 3).bp * 0.02 * e * street;
          l += o * (j % 2 ? 0.6 : 1); r += o * (j % 2 ? 1 : 0.6);
        }
      }
      // the wind from the shock wave on
      const wk = smooth(11, 20, t) * (0.5 + 0.5 * smooth(20, 44, t));
      if (wk > 0) {
        const fc = 300 + 900 * wk + 250 * Math.sin(t * 0.7);
        const gust = 0.75 + 0.25 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1);
        l += windF[0].run(brL * 3 + white() * 0.25, fc, 0.9).lp * 0.22 * wk * gust; r += windF[1].run(brR * 3 + white() * 0.25, fc * 1.07, 0.9).lp * 0.22 * wk * gust;
      }
      // the rubble's rumble
      const rb = rub[Math.min(NB - 1, Math.floor((t - T0) * BIN))];
      if (rb > 0) { const o = rubF.run(brL * 4, 120 + 300 * Math.min(rb, 1), 0.8).lp * Math.min(rb, 1.4) * 0.5 + rubLP.run(brR) * Math.min(rb, 1.4) * 1.2; l += o; r += o; }
      BL[n] = l; BR[n] = r;
    }
  }

  // ================= the hits =================
  // booms on every step (deeper and bigger each time); the biggest at 1 trillion
  {
    const BEAT = HITS.map((t, n) => ({ t, k: 0.35 + 0.05 * n, f: 60 * Math.pow(2, -n / 16) }));
    BEAT.push({ t: V_RING, k: 1.7, f: 30 }, { t: V_WHITE, k: 1.0, f: 32 });
    const boomLP = new OnePole(90), crackF = new SVF(), washF = new SVF();
    const revL = new Reverb(21), revR = new Reverb(22);
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      let l = 0, r = 0, wet = 0;
      for (const b of BEAT) {
        const dt = t - b.t; if (dt < -0.01 || dt > 3.5) continue;
        const f = b.f * (1 + 0.7 * Math.exp(-dt * 9));
        const o = Math.sin(TAU * f * Math.max(dt, 0) - 4 * Math.exp(-dt * 9)) * env(dt, 0.006, b.k > 1.5 ? 1.4 : 0.8) * b.k * 0.85;
        const bl = boomLP.run(white()) * env(dt, 0.004, 0.3) * b.k * 2.2;
        l += o + bl; r += o + bl; wet += o * 0.25;
      }
      // the shock wave's crackle: sparse soft pops
      const wk = smooth(11, 20, t);
      if (wk > 0) { const cr = crackF.run(white() * (R0() < 0.0012 * wk ? 30 : 0), 2600, 1.5).bp * 0.03; l += cr; r += cr; }
      // the echo rushing back up the street at you: a rising roar, cut by the hit; a soft wash under the white
      const wa = Math.max(smooth(V_BACK, V_WHITE, t) * (1 - smooth(V_WHITE, V_WHITE + 0.25, t)) * 1.6, 0.3 * smooth(V_WHITE, V_WHITE + 0.1, t) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.3, t)));
      if (wa > 0) { const o = washF.run(white(), 400 + 4000 * wa, 1.3).bp * wa * 0.35; l += o; r += o; }
      const rv = revL.run(wet, 0.82), rv2 = revR.run(wet, 0.82);
      L[n] += l + rv * 0.5; R[n] += r + rv2 * 0.5;
    }
  }
  // a heavy crash (noise through a falling low-pass, a thump under it)
  const crash = (t, g, fc, d, pan) => {
    if (!(t > T0) || t > V_WHITE - 0.1 || g < 0.003) return;
    const f = new SVF(), th = new OnePole(70);
    add(t, d * 5, (dt) => { const o = f.run(white(), fc * (1 - 0.5 * Math.min(dt / d, 1)), 0.9).lp * env(dt, 0.004, d) * g + th.run(white()) * env(dt, 0.003, 0.12) * g * 3; return [o * (1 - pan), o * (1 + pan)]; });
  };
  const near = (x, z, s = 12) => 1 / (1 + Math.hypot(x - CAM.x, z - CAM.z) / s);
  const panOf = (x, s = 20) => clamp((x - CAM.x) / s, -0.85, 0.85);
  // glass: a crash for each pane (loud when near), then shards tinkling down
  const GRr = rng(91);
  const panes = SOURCES.filter((s) => s.t < V_WHITE).sort((a, b) => a.t - b.t);
  for (const s of panes) {
    const big = s.n >= 14, g = (big ? 0.5 : 0.13) * near(s.x, s.z, 6);
    if (g < 0.004) continue;
    const pan = panOf(s.x, 15), f1 = new SVF(), f2 = new SVF();
    add(s.t, 0.6, (dt) => { const o = (f1.run(white(), 4200, 0.6).hp * env(dt, 0.005, 0.12) * 0.6 + f2.run(white(), 5200, 0.25).bp * env(dt, 0.006, 0.25)) * g; return [o * (1 - pan) * 0.8, o * (1 + pan) * 0.8]; });
    for (let k = 0; k < (big ? 10 : 3); k++) {
      const tk = s.t + 0.25 + GRr() * (big ? 1.4 : 0.9), fq = 2500 + 5500 * GRr(), dk = 0.03 + 0.08 * GRr(), gk = g * (0.25 + 0.4 * GRr());
      let ph = 0;
      add(tk, 0.45, (dt) => { ph += fq / SR; const o = Math.sin(TAU * ph) * env(dt, 0.002, dk) * gk; return [o * (1 - pan), o * (1 + pan)]; });
    }
  }
  // car alarms: the nearest five, each its own pattern, until the car's thrown
  const alarms = CARS.filter((c) => Number.isFinite(c.tAlarm)).map((c) => ({ c, d: Math.hypot(c.sx - CAM.x, c.sz - CAM.z) })).sort((a, b) => a.d - b.d).slice(0, 5);
  alarms.forEach(({ c, d }, k) => {
    const g = 0.07 / (1 + d / 20), pan = panOf(c.sx, 12), end = Math.min(c.tFlip, V_WHITE) + 0.05;
    let ph = 0;
    const lp = new OnePole(3000);
    add(c.tAlarm, end - c.tAlarm, (dt) => {
      const f = k % 3 === 0 ? 900 + 600 * (0.5 + 0.5 * Math.sin(TAU * 2.2 * dt)) : k % 3 === 1 ? ((Math.floor(dt * 2.6) % 2) ? 1250 : 950) : 1500 + 900 * ((dt * 7) % 1);
      ph += f / SR;
      const o = lp.run(Math.tanh(Math.sin(TAU * ph) * 4) * 0.6) * g * Math.min(1, dt / 0.02) * Math.min(1, (end - c.tAlarm - dt) / 0.04);
      return [o * (1 - pan), o * (1 + pan)];
    });
  });
  // every car that's thrown: a crunch as it's hit and a metal crash where it lands (the nearest twenty)
  let nCars = 0;
  CARS.filter((c) => Number.isFinite(c.T.t0) && c.T.t0 < V_WHITE).map((c) => ({ c, d: Math.hypot(c.sx - CAM.x, c.sz - CAM.z) })).sort((a, b) => a.d - b.d).slice(0, 20).forEach(({ c }) => {
    const tl = c.T.t0 + flightOf(c.T), g = 0.42 * near(c.sx, c.sz, 15), pan = panOf(c.sx);
    crash(c.T.t0, g * 0.4, 1400, 0.12, pan);
    crash(tl, g, 900, 0.35, pan);
    const f = new SVF();
    if (tl < V_WHITE - 0.1) add(tl, 0.8, (dt) => { const o = f.run(white(), 520 + 300 * Math.sin(dt * 60), 0.08).bp * env(dt, 0.003, 0.18) * g * 0.6; return [o * (1 - pan), o * (1 + pan)]; });
    nCars++;
  });
  // building chunks: a crunch for some; the wall beside you coming down is loud and close
  const CR = rng(55);
  let nPeel = 0;
  for (const c of CHUNKS) {
    if (!Number.isFinite(c.dep)) continue;
    if (c.peel) {
      const tl = c.dep + flightOf({ vel: c.kick, p: c.w, hs: c.hs });
      crash(c.dep, 0.12, 300, 0.4, panOf(c.w[0]));
      crash(tl, 0.75 * near(c.w[0], c.w[2], 10), 420, 0.6, panOf(c.w[0], 10));
      nPeel++;
    } else if (c.r < 60 && CR() < 0.08) crash(c.dep + CR() * 0.3, 0.28 * near(c.w[0], c.w[2], 25), 250 + 700 * CR(), 0.25 + 0.5 * CR(), panOf(c.w[0], 30));
  }
  // the pavement torn up round you (a whoosh past the lens for the ones flying your way) and the asphalt ripping up
  for (const P of PAVE) {
    const g = 0.25 * near(P.T.p[0], P.T.p[2], 4), pan = panOf(P.T.p[0], 6), f = new SVF();
    if (P.T.t0 < V_WHITE) add(P.T.t0, 0.7, (dt) => { const o = f.run(white(), 600 + 2400 * Math.exp(-dt * 5), 1.2).bp * env(dt, 0.01, 0.25) * g; return [o * (1 - pan), o * (1 + pan)]; });
    crash(P.T.t0 + flightOf(P.T), g * 0.6, 1200, 0.1, pan);
  }
  for (const S of STRIPS) {
    const g = 0.22 * near(S.T.p[0], S.T.p[2], 10), pan = panOf(S.T.p[0]), f = new SVF();
    if (S.T.t0 < V_WHITE - 0.1) add(S.T.t0, 0.9, (dt) => { const o = f.run(white() * (0.6 + 0.4 * Math.sin(dt * 90)), 220 + 500 * dt, 0.7).lp * env(dt, 0.01, 0.3) * g; return [o * (1 - pan), o * (1 + pan)]; });
    crash(S.T.t0 + flightOf(S.T), g * 0.8, 500, 0.3, pan);
  }
  // the towers: a long groan as each one goes, a deep crash where it lands
  for (const T of TOWERS) {
    const pan = panOf(T.b.x, 60);
    crash(T.t, 0.2, 110, T.T * 0.6, pan);
    for (let k = 0; k < 4; k++) crash(T.t + T.T - 0.1 + k * 0.18, 0.6 - 0.09 * k, 160 + 120 * k, 0.9, pan);
  }
  // the dust ring over the skyline: a long rolling rumble
  { const f = new SVF(); add(36.9, 4.5, (dt) => { const o = f.run(white(), 90 + 60 * dt, 0.6).lp * smooth(0, 1.2, dt) * (1 - smooth(2.5, 4.5, dt)) * 0.9; return [o, o]; }); }
  // the people: a gasp at the start, "oh my god" when the glass goes, screams as they're thrown
  const clips = [['gasp.mp3', 0, 1.6, 0.55, 0.3, 1, 0], ['omg.mp3', 0, 1.8, 7.2, 0.3, 1, -0.4]];
  const thrown = PEOPLE.filter((p) => p.tKnock > 8 && p.tKnock < 26).map((p) => ({ p, d: Math.hypot(p.sx - CAM.x, p.sz - CAM.z) })).sort((a, b) => a.d - b.d).slice(0, 4);
  thrown.forEach(({ p, d }, k) => clips.push(['scream.mp3', 0.15 + 0.4 * k, 1.1, p.tKnock - 0.05, 0.2 / (1 + d / 12), [1.12, 0.92, 1.2, 1.04][k], clamp((p.sx - CAM.x) / 8, -0.8, 0.8)]));
  for (const [name, ss, len, t0, gain, rate, pan] of clips) {
    const c = loadClip(name, ss, len + 0.2);
    if (!c) continue;
    const g = gain / c.pk, n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    for (let i = 0; i < n2; i++) {
      const o = idx(t0) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, i / (SR * 0.005)) * Math.min(1, (n2 - i) / (SR * 0.08));
      L[o] += at(c, i * rate, 0) * g * fade * (1 - pan); R[o] += at(c, i * rate, 1) * g * fade * (1 + pan);
    }
  }

  // ================= the mix =================
  // the bed sits 12 dB under the hits (measured over 0:06-0:44), then the hush before 1 trillion
  const rms = (A, B, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + B[n] * B[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 6, 44), bedR = rms(BL, BR, 6, 44);
  const gBed = (hitR / bedR) * Math.pow(10, -12 / 20);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const hush = 1 - 0.985 * smooth(V_HUSH[0], V_HUSH[0] + 0.1, t) * (1 - smooth(V_HUSH[1] - 0.03, V_HUSH[1], t));
    ML[n] = (L[n] + BL[n] * gBed) * hush; MR[n] = (R[n] + BR[n] * gBed) * hush;
  }
  // the video's track: [0, T_SWITCH) as made; from T_SWITCH on it fades over into the run's own lead-in to frame 0
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
  // level: about -15 dBFS overall like the other Shorts; a soft limiter keeps the peaks under -1 dB
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  const gl = Math.pow(10, -17.3 / 20) / Math.sqrt(e / (2 * M));   // (-17.3 here measures -15 on a mono meter, like shrink-trillion)
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
  console.log(`audio: scream bursts at ${BURSTS.map((t) => t.toFixed(1)).join(' ')}; bed ${(20 * Math.log10(gBed * bedR / hitR)).toFixed(1)} dB under the hits`);
  console.log(`audio: ${panes.length} panes, ${alarms.length} alarms, ${nCars} cars, ${nPeel} wall pieces, ${PAVE.length} slabs, ${STRIPS.length} road cells, ${thrown.length} thrown screams`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
