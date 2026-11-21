// Procedural soundtrack for "What if you were 1 trillion times stronger?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Two layers, like scream-trillion's (owner, Nov 18: a flat roar is boring; every hit must be heard on its own):
//   the BED: the harbor plaza (traffic hum, people talking, a little wind) fading out as things start flying, and a deep
//     rumble that steps up with the counter, kept well under the hits; wind rushing during your bounds and the leap.
//   the HITS: the crowd's gasp in the first second; for every lift, the thing groaning and creaking in your hands (deeper
//     the bigger it is) and the ground cracking under your feet; a whoosh as you throw it; the crash where it lands (the
//     car's crunch and glass, the bus, the truck clanging into the ship's hull, the jet's explosion, the ship coming down
//     on the far shore, the tower), each bigger than the last; a thump at every bound; at the mountain a grinding roar
//     of rock tearing, the launch, the biggest boom of the video when it lands, and the dust wall's roar into the white.
// The loop: under the white the run's own lead-in fades in, so the sound runs on across the seam. Soft onsets only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, B, V_WHITE, logS } from './src/timeline.js';
import { MOVES } from './src/choreo.js';
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
const at = (c, pos, ch) => { const i = Math.floor(pos), k = pos - i; if (i < 0 || i + 1 >= c.n) return 0; return c.f[i * 2 + ch] * (1 - k) + c.f[(i + 1) * 2 + ch] * k; };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);       // the hits
  const BL = new Float32Array(N), BR = new Float32Array(N);     // the bed
  const idx = (t) => Math.round((t - T0) * SR);
  const R0 = rng(4711);
  const white = () => R0() * 2 - 1;
  const add = (t0, dur, fn, AL = L, AR = R) => { const a = Math.max(0, idx(t0)), b = Math.min(N, idx(t0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(t0)) / SR); AL[n] += l; AR[n] += r; } };
  const END = V_WHITE - 0.05;

  // ---------------- building blocks ----------------
  // a heavy crash: noise through a falling low-pass with a thump under it, a little reverb tail
  const crash = (t, g, fc, d, pan = 0) => {
    if (t > END) return;
    const f = new SVF(), th = new OnePole(70);
    add(t, d * 5 + 0.2, (dt) => { const o = f.run(white(), fc * (1 - 0.55 * Math.min(dt / (d * 2), 1)), 0.9).lp * env(dt, 0.004, d) * g + th.run(white()) * env(dt, 0.003, 0.14) * g * 3; return [o * (1 - pan), o * (1 + pan)]; });
  };
  // a boom: a falling sine with noise in it
  const boom = (t, g, f0, d) => {
    if (t > END + 0.02) return;
    const lp = new OnePole(120);
    add(t, d * 4, (dt) => { const f = f0 * (1 + 0.9 * Math.exp(-dt * 7)); const o = (Math.sin(TAU * f * dt - 5 * Math.exp(-dt * 7)) * 0.8 + lp.run(white()) * 2.2) * env(dt, 0.005, d) * g; return [o, o]; });
  };
  // glass: a burst, then shards
  const GR = rng(91);
  const glass = (t, g, n = 8, pan = 0) => {
    if (t > END) return;
    const f1 = new SVF(), f2 = new SVF();
    add(t, 0.6, (dt) => { const o = (f1.run(white(), 4200, 0.6).hp * env(dt, 0.005, 0.12) * 0.6 + f2.run(white(), 5200, 0.25).bp * env(dt, 0.006, 0.25)) * g; return [o * (1 - pan), o * (1 + pan)]; });
    for (let k = 0; k < n; k++) {
      const tk = t + 0.2 + GR() * 1.1, fq = 2500 + 5500 * GR(), dk = 0.03 + 0.08 * GR(), gk = g * (0.2 + 0.35 * GR());
      let ph = 0;
      add(tk, 0.4, (dt) => { ph += fq / SR; const o = Math.sin(TAU * ph) * env(dt, 0.002, dk) * gk; return [o * (1 - pan), o * (1 + pan)]; });
    }
  };
  // a whoosh: band-passed noise sweeping up then down (a big thing going past)
  const whoosh = (t, g, f0, f1, d, pan = 0) => {
    if (t > END) return;
    const f = new SVF();
    add(t, d, (dt) => { const k = dt / d, fc = f0 + (f1 - f0) * Math.sin(Math.PI * Math.min(k * 1.2, 1)); const o = f.run(white(), fc, 1.1).bp * Math.sin(Math.PI * k) ** 1.5 * g; return [o * (1 - pan * (1 - 2 * k)), o * (1 + pan * (1 - 2 * k))]; });
  };
  // the groan of something heavy in your hands: a few narrow resonances on noise, wandering in pitch, plus creaks
  const groan = (t0, t1, g, base, n = 3) => {
    const fs_ = Array.from({ length: n }, () => new SVF());
    const cr = new SVF();
    const ph = Array.from({ length: n }, () => GR() * 6);
    add(t0, t1 - t0, (dt) => {
      const k = dt / (t1 - t0), e = smooth(0, 0.18, k) * (1 - smooth(0.85, 1, k)) * (0.6 + 0.4 * k);
      let o = 0;
      for (let i = 0; i < n; i++) {
        const fc = base * (1 + i * 0.73) * (1 + 0.12 * Math.sin(dt * (1.3 + i) + ph[i]) + 0.25 * k);
        o += fs_[i].run(white(), fc, 0.04).bp * (1 - i * 0.2);
      }
      // creaks: sparse soft pops through a resonance
      const pop = GR() < 0.0009 * (0.4 + k) ? 30 : 0;
      o += cr.run(white() * pop, base * 3.1, 0.15).bp * 0.08;
      o *= e * g;
      return [o, o];
    });
  };
  // the ground cracking under your feet: a sharp crack and a rumble
  const crack = (t, g) => {
    if (t > END) return;
    const f = new SVF(), lp = new OnePole(90);
    add(t, 1.6, (dt) => { const o = f.run(white(), 2200 * Math.exp(-dt * 8) + 300, 0.5).bp * env(dt, 0.002, 0.07) * g * 1.4 + lp.run(white()) * env(dt, 0.01, 0.4) * g * 2.2; return [o, o]; });
  };
  // water: a splash and spray roar
  const splash = (t, g, d) => {
    if (t > END) return;
    const f = new SVF(), f2 = new SVF();
    add(t, d * 3, (dt) => { const o = (f.run(white(), 1400 + 600 * Math.sin(dt * 3), 0.7).lp * 1.2 + f2.run(white(), 4000, 0.9).hp * 0.3) * env(dt, 0.02, d) * g; return [o, o * 0.95]; });
  };

  // ---------------- the bed ----------------
  {
    const hum = new OnePole(220), talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
    const deepF = [new SVF(), new SVF()], windF = [new SVF(), new SVF()];
    let bL = 0, bR = 0, ph = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const Lm = logS(Math.max(t, -1)), k = clamp((Lm - 1.5) / 10.5, 0, 1);
      bL = bL * 0.997 + white() * 0.04; bR = bR * 0.997 + white() * 0.04;
      let l = 0, r = 0;
      // the plaza: traffic hum and voices, fading out as the bus flies
      const city = 1 - smooth(3.5, 9, t);
      if (city > 0) {
        const h = hum.run(white()) * 1.4;
        l += h * 0.12 * city; r += h * 0.12 * city;
        for (let j = 0; j < 6; j++) {
          const syl = 0.5 + 0.5 * Math.sin(t * (3.1 + j * 0.7) + j * 2 + Math.sin(t * (1.3 + j * 0.3)) * 2);
          const o = talkF[j].run(white(), 500 + j * 180 + 250 * Math.sin(t * (2 + j)), 3).bp * 0.02 * talkE[j].run(syl > 0.65 ? 1 : 0) * city;
          l += o * (j % 2 ? 0.6 : 1); r += o * (j % 2 ? 1 : 0.6);
        }
      }
      // the rumble: steps up with the counter
      ph += (34 + 10 * k) / SR;
      const g = (0.05 + 0.25 * k) * (1 - 0.5 * smooth(V_WHITE, T_SWITCH, t));
      l += (deepF[0].run(bL * 3, 60 + 120 * k, 0.8).lp * 1.4 + Math.sin(TAU * ph) * 0.3 * k) * g;
      r += (deepF[1].run(bR * 3, 66 + 120 * k, 0.8).lp * 1.4 + Math.sin(TAU * ph) * 0.3 * k) * g;
      // wind: while you bound and fly, and after the mountain goes
      let w = 0;
      for (const [t0, t1, , , kind] of MOVES) if (kind !== 'jog' && kind !== 'run') w = Math.max(w, smooth(t0, t0 + 0.3, t) * (1 - smooth(t1 - 0.1, t1 + 0.3, t)) * (kind === 'leap' ? 1.6 : 0.7));
      w = Math.max(w, 0.8 * smooth(B.mtnThrow, B.mtnLand, t));
      if (w > 0) {
        const fc = 400 + 900 * w + 200 * Math.sin(t * 1.7);
        l += windF[0].run(white() * 0.5 + bL * 2, fc, 0.9).lp * 0.28 * w; r += windF[1].run(white() * 0.5 + bR * 2, fc * 1.08, 0.9).lp * 0.28 * w;
      }
      BL[n] = l; BR[n] = r;
    }
  }

  // ---------------- the hits ----------------
  // the crowd's gasp in the first second (and in the loop's lead-in it's the run-up to it)
  const clips = [['gasp.mp3', 0, 1.6, 0.06, 0.6, 1, 0.1], ['omg.mp3', 0, 1.8, B.busThrow + 0.15, 0.32, 1, -0.4]];
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
  // the car
  groan(-0.9, B.carToss + 0.1, 0.05, 520, 2);
  whoosh(B.carToss - 0.05, 0.25, 300, 1400, 0.7, -0.3);
  crash(B.carLand, 0.55, 1500, 0.25, -0.2); glass(B.carLand + 0.02, 0.35, 8, -0.2);
  crash(B.carLand + 0.5, 0.22, 900, 0.2, -0.3);
  // the bus
  groan(B.busGrab, B.busThrow + 0.1, 0.11, 230, 3);
  crack(B.busGrab + 0.6, 0.12);
  whoosh(B.busThrow - 0.05, 0.4, 200, 900, 1.2, -0.4);
  crash(B.busLand, 0.75, 1100, 0.35, -0.3); glass(B.busLand + 0.03, 0.4, 12, -0.3); boom(B.busLand, 0.25, 55, 0.5);
  crash(B.busLand + 0.55, 0.35, 700, 0.3, -0.3); crash(B.busLand + 1.05, 0.2, 500, 0.3, -0.3);
  // the truck
  groan(B.truckGrab, B.truckThrow + 0.1, 0.13, 160, 3);
  crack(B.truckGrab + 0.5, 0.22); crack(B.truckUp, 0.18);
  whoosh(B.truckThrow - 0.05, 0.45, 160, 700, 1.4, 0.0);
  // it clangs into the ship's hull: a metal boom with a long ring, then it drops onto the quay
  {
    const t = B.truckHit, f = [new SVF(), new SVF(), new SVF()], rv = new Reverb(31);
    add(t, 3.2, (dt) => {
      const ex = env(dt, 0.002, 0.04) * white() * 6;
      let o = 0;
      [97, 151, 233].forEach((fq, i) => { o += f[i].run(ex, fq, 0.012).bp * (0.6 - i * 0.15); });
      o = o * env(dt, 0.002, 1.1) * 0.55;
      const w = rv.run(o * 0.5, 0.86);
      return [o + w * 0.5, o + w * 0.5];
    });
    crash(t, 0.8, 1300, 0.3, 0); boom(t, 0.35, 48, 0.6);
    crash(t + 0.85, 0.45, 800, 0.35, 0);
  }
  // the jet: a hollow metal groan, the throw (a rush), the explosion against the ship and the fire
  groan(B.jetGrab, B.jetThrow + 0.1, 0.14, 120, 4);
  crack(B.jetGrab + 0.4, 0.3); crack(B.jetUp + 0.2, 0.25);
  whoosh(B.jetThrow - 0.05, 0.6, 140, 600, 1.3, 0.2);
  {
    const t = B.jetHit;
    boom(t, 0.95, 38, 1.1); crash(t, 0.9, 1800, 0.5, 0.1); glass(t + 0.05, 0.3, 14, 0.2);
    // the fire's roar and crackle until the ship is thrown
    const f = new SVF(), cr = new SVF();
    add(t, B.shipThrow + 0.5 - t, (dt) => {
      const e = smooth(0, 0.3, dt) * (0.5 + 0.5 * Math.exp(-dt / 1.5)) * (1 - smooth(B.shipThrow - t, B.shipThrow - t + 0.5, dt));
      const o = (f.run(white(), 500 + 200 * Math.sin(dt * 2.3), 0.8).lp * 0.6 + cr.run(white() * (GR() < 0.002 ? 25 : 0), 1800, 0.5).bp * 0.12) * e * 0.4;
      return [o * 1.1, o * 0.9];
    });
  }
  // the ship: the hull's deep groan as it comes up, water pouring off it, the throw, the crash on the far shore
  groan(B.shipGrab, B.shipThrow + 0.2, 0.2, 55, 4);
  crack(B.shipGrab + 0.6, 0.45); crack(B.shipGrab + 2.0, 0.35);
  crash(B.shipGrab + 1.4, 0.35, 400, 0.8, 0.3); crash(B.shipGrab + 2.4, 0.3, 350, 0.8, -0.4);      // the end pieces breaking off
  {
    const f = new SVF();
    add(B.shipGrab + 0.5, B.shipThrow - B.shipGrab + 1.2, (dt) => { const k = smooth(0, 1.5, dt) * (1 - smooth(3.6, 4.6, dt)); const o = f.run(white(), 1800, 0.6).lp * k * 0.5; return [o, o]; });
  }
  whoosh(B.shipThrow - 0.1, 0.7, 70, 300, 2.2, 0);
  boom(B.shipLand, 1.1, 32, 1.6); crash(B.shipLand, 0.95, 900, 0.9, -0.2); splash(B.shipLand + 0.05, 0.6, 1.4);
  // the tower: a structural groan, the base floors crushing, glass, the throw, the crash across the harbor
  groan(B.towerGrab, B.towerThrow + 0.2, 0.2, 70, 4);
  crack(B.towerGrab + 0.5, 0.55); crash(B.towerGrab + 0.6, 0.45, 600, 0.6, 0.2);
  glass(B.towerUp + 0.2, 0.45, 26, 0.1);
  whoosh(B.towerThrow - 0.1, 0.7, 60, 260, 2.0, 0.3);
  boom(B.towerLand, 1.15, 30, 1.6);
  for (let k = 0; k < 5; k++) crash(B.towerLand + k * 0.22, 0.85 - 0.12 * k, 700 - 80 * k, 0.9, 0.3);
  // your bounds: a thump and a crack at each touchdown
  for (const [t0, t1, a, b, kind, nb] of MOVES) {
    if (kind === 'bound') for (let i = 1; i <= nb; i++) { const t = t0 + ((i / nb) * 0.88 + 0.12) * (t1 - t0); boom(t, 0.3, 60, 0.25); crack(t, 0.2); }
    if (kind === 'bound' || kind === 'leap') boom(t0 + (kind === 'leap' ? 0 : 0.12 * (t1 - t0)), kind === 'leap' ? 0.55 : 0.25, 55, 0.3);
  }
  // the leap's landing
  boom(B.leapLand, 0.9, 42, 0.8); crack(B.leapLand, 0.55); crash(B.leapLand, 0.5, 700, 0.5, 0);
  // the mountain: rock grinding and tearing while you lift it, cracks, then the launch
  {
    const f = [new SVF(), new SVF()], lp = new OnePole(60);
    const t0 = B.mtnGrab, t1 = B.mtnThrow + 0.3;
    add(t0, t1 - t0, (dt) => {
      const k = dt / (t1 - t0), e = smooth(0, 0.2, k) * (0.4 + 0.6 * k) * (1 - smooth(0.93, 1, k));
      const o = (f[0].run(white(), 90 + 140 * k + 30 * Math.sin(dt * 5), 0.5).lp * 1.3 + lp.run(white()) * 2.5 + f[1].run(white(), 700 + 400 * Math.sin(dt * 2.1), 0.3).bp * 0.15 * (GR() < 0.3 ? 1 : 0.4)) * e * 0.42;
      return [o, o];
    });
    for (let k = 0; k < 7; k++) { const t = B.mtnGrab + 0.6 + k * 0.62 + 0.2 * GR(); crack(t, 0.4 + 0.08 * k); crash(t + 0.05, 0.25 + 0.05 * k, 300, 0.7, (k % 2 ? 0.4 : -0.4)); }
    // the heave and launch: a rising roar
    const fl = new SVF();
    add(B.mtnUp - 0.2, B.mtnLand - B.mtnUp + 0.3, (dt) => { const k = dt / (B.mtnLand - B.mtnUp + 0.3); const o = fl.run(white(), 120 + 500 * Math.sin(Math.PI * k), 0.6).lp * Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.9; return [o, o]; });
    boom(B.mtnThrow, 0.9, 30, 1.0);
    // the landing: the biggest boom of the video, and the dust wall's roar rising into the white
    boom(B.mtnLand, 1.5, 24, 2.0); crash(B.mtnLand, 1.1, 500, 1.4, 0);
    const wf = new SVF();
    add(B.mtnLand, T_SWITCH + 0.6 - B.mtnLand, (dt) => {
      const t = B.mtnLand + dt;
      const k = smooth(B.mtnLand, V_WHITE, t);
      const e = (0.25 + 1.1 * k * k) * (1 - 0.75 * smooth(V_WHITE, V_WHITE + 0.12, t)) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.5, t));
      const o = wf.run(white(), 200 + 2600 * k, 1.0).lp * e * 0.6;
      return [o, o];
    });
    boom(V_WHITE - 0.02, 0.8, 34, 0.9);
  }

  // ---------------- the mix ----------------
  const rms = (A, Bq, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + Bq[n] * Bq[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 1, 44), bedR = rms(BL, BR, 1, 44);
  const gBed = (hitR / bedR) * Math.pow(10, -11 / 20);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  for (let n = 0; n < N; n++) { ML[n] = L[n] + BL[n] * gBed; MR[n] = R[n] + BR[n] * gBed; }
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
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  const gl = Math.pow(10, -17.3 / 20) / Math.sqrt(e / (2 * M));
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
  console.log(`audio: bed ${(20 * Math.log10(gBed * bedR / hitR)).toFixed(1)} dB under the hits`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
