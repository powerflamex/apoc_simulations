// Procedural soundtrack for "What if you jumped 1 trillion times higher?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Two layers (like strong-trillion's): the BED: the street (traffic hum, voices) in the street shots, a deep rumble that
// steps up with the counter, wind while you fly, and a low hum in the space shots (never silent); the HITS: the crowd's
// scream in the first second; a thump and a rising whoosh at every push-off, a boom and a crack at every landing (bigger
// each time); the windows rattling at 10,000x and the muffled punch through the clouds; the sonic boom and the glass at
// 100,000x; the fireball's roar coming down and its impact at 1,000,000x; the push-off blasts from 1 ton to 75 kilotons
// (each deeper and longer); whooshes as the Station and the Moon go past; the last roar rising into the white. The
// loop: under the white the lead-in fades in, so the sound runs on across the seam. Soft onsets only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, V_WHITE, logN, JUMPS, V_TRILLION, V_FAR, V_SPACE } from './src/timeline.js';
import { EVENTS } from './src/events.js';
import { camAt } from './src/camera.js';
import { HOLE_T, FALL_T0 } from './src/fx.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; }
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
const SPACE_AT = new Map();
const inSpace = (t) => { const q = Math.round(t * 50); if (!SPACE_AT.has(q)) SPACE_AT.set(q, !!camAt(q / 50).space); return SPACE_AT.get(q); };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 1.0;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const BL = new Float32Array(N), BR = new Float32Array(N);
  const idx = (t) => Math.round((t - T0) * SR);
  const R0 = rng(4711);
  const white = () => R0() * 2 - 1;
  const add = (t0, dur, fn, AL = L, AR = R) => { const a = Math.max(0, idx(t0)), b = Math.min(N, idx(t0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(t0)) / SR); AL[n] += l; AR[n] += r; } };
  const END = V_WHITE + 0.4;

  // ---------------- building blocks ----------------
  const crash = (t, g, fc, d, pan = 0) => {
    if (t > END) return;
    const f = new SVF(), th = new OnePole(70);
    add(t, d * 5 + 0.2, (dt) => { const o = f.run(white(), fc * (1 - 0.55 * Math.min(dt / (d * 2), 1)), 0.9).lp * env(dt, 0.006, d) * g + th.run(white()) * env(dt, 0.004, 0.14) * g * 3; return [o * (1 - pan), o * (1 + pan)]; });
  };
  const boom = (t, g, f0, d) => {
    if (t > END) return;
    const lp = new OnePole(120);
    add(t, d * 4, (dt) => { const f = f0 * (1 + 0.9 * Math.exp(-dt * 7)); const o = (Math.sin(TAU * f * dt - 5 * Math.exp(-dt * 7)) * 0.8 + lp.run(white()) * 2.2) * env(dt, 0.006, d) * g; return [o, o]; });
  };
  const GR = rng(91);
  const glass = (t, g, n = 8, pan = 0) => {
    if (t > END) return;
    const f1 = new SVF(), f2 = new SVF();
    add(t, 0.6, (dt) => { const o = (f1.run(white(), 4200, 0.6).hp * env(dt, 0.006, 0.12) * 0.5 + f2.run(white(), 5200, 0.25).bp * env(dt, 0.008, 0.25)) * g; return [o * (1 - pan), o * (1 + pan)]; });
    for (let k = 0; k < n; k++) {
      const tk = t + 0.15 + GR() * 1.4, fq = 2500 + 4500 * GR(), dk = 0.03 + 0.08 * GR(), gk = g * (0.15 + 0.3 * GR());
      let ph = 0;
      add(tk, 0.4, (dt) => { ph += fq / SR; const o = Math.sin(TAU * ph) * env(dt, 0.003, dk) * gk; return [o * (1 - pan), o * (1 + pan)]; });
    }
  };
  const whoosh = (t, g, f0, f1, d, pan = 0) => {
    if (t > END) return;
    const f = new SVF();
    add(t, d, (dt) => { const k = dt / d, fc = f0 + (f1 - f0) * Math.sin(Math.PI * Math.min(k * 1.2, 1)); const o = f.run(white(), fc, 1.1).bp * Math.sin(Math.PI * k) ** 1.5 * g; return [o * (1 - pan * (1 - 2 * k)), o * (1 + pan * (1 - 2 * k))]; });
  };
  // a push-off: up-sweeping rush (you leaving), quick at first
  const rise = (t, g, d) => {
    if (t > END) return;
    const f = new SVF();
    add(t, d, (dt) => { const k = dt / d; const fc = 300 + 2600 * Math.pow(k, 0.6); const o = f.run(white(), fc, 0.9).bp * env(dt, 0.01, d * 0.35) * g; return [o, o]; });
  };
  const crack = (t, g) => {
    if (t > END) return;
    const f = new SVF(), lp = new OnePole(90);
    add(t, 1.6, (dt) => { const o = f.run(white(), 2200 * Math.exp(-dt * 8) + 300, 0.5).bp * env(dt, 0.003, 0.07) * g * 1.3 + lp.run(white()) * env(dt, 0.01, 0.4) * g * 2.2; return [o, o]; });
  };
  // a big blast: a deep boom, a crash, and a long rolling roar (longer and lower the bigger it is)
  const blast = (t, g, size) => {
    boom(t, g, 42 - 4 * size, 0.6 + 0.35 * size);
    crash(t, g * 0.9, 1400 - 120 * size, 0.35 + 0.2 * size, 0);
    const f = new SVF(), lp = new OnePole(50);
    const d = 2 + 1.1 * size;
    add(t + 0.05, d, (dt) => { const k = dt / d; const o = (f.run(white(), 160 + 500 * Math.exp(-dt * 1.2), 0.7).lp * 1.1 + lp.run(white()) * 2.4) * smooth(0, 0.08, dt) * (1 - smooth(0.4, 1, k)) * g * 0.55; return [o, o * 0.96]; });
  };

  // ---------------- the bed ----------------
  {
    const hum = new OnePole(220), talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
    const deepF = [new SVF(), new SVF()], windF = [new SVF(), new SVF()], padF = [new SVF(), new SVF()];
    let bL = 0, bR = 0, ph = 0, ph2 = 0, sp = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const tt = t < -0.05 && t > -LOOP - 1.01 ? t : t;
      const Lm = logN(Math.max(tt, -1)), k = clamp((Lm - 1) / 11, 0, 1);
      bL = bL * 0.997 + white() * 0.04; bR = bR * 0.997 + white() * 0.04;
      // street or space (a 60 ms crossfade at each cut)
      const target = inSpace(t) ? 1 : 0;
      sp += (target - sp) * (1 - Math.exp(-1 / (0.06 * SR)));
      let l = 0, r = 0;
      const city = (1 - smooth(16, 24, t) * 0.6) * (1 - sp);
      if (city > 0.001) {
        const h = hum.run(white()) * 1.4;
        l += h * 0.14 * city; r += h * 0.14 * city;
        for (let j = 0; j < 6; j++) {
          const syl = 0.5 + 0.5 * Math.sin(t * (3.1 + j * 0.7) + j * 2 + Math.sin(t * (1.3 + j * 0.3)) * 2);
          const o = talkF[j].run(white(), 500 + j * 180 + 250 * Math.sin(t * (2 + j)), 3).bp * 0.022 * talkE[j].run(syl > 0.65 ? 1 : 0) * city * (1 - smooth(18, 23, t));
          l += o * (j % 2 ? 0.6 : 1); r += o * (j % 2 ? 1 : 0.6);
        }
      }
      // the rumble: steps up with the counter
      ph += (34 + 12 * k) / SR;
      const g = (0.06 + 0.28 * k) * (1 - 0.5 * smooth(V_WHITE, T_SWITCH, t)) * (1 - 0.6 * sp);
      l += (deepF[0].run(bL * 3, 60 + 120 * k, 0.8).lp * 1.4 + Math.sin(TAU * ph) * 0.3 * k) * g;
      r += (deepF[1].run(bR * 3, 66 + 120 * k, 0.8).lp * 1.4 + Math.sin(TAU * ph) * 0.3 * k) * g;
      // wind: while you're in the air in the street shots (jumps 100x-1e6x)
      let w = 0;
      for (let i = 1; i <= 5; i++) { const j = JUMPS[i]; w = Math.max(w, smooth(j.p, j.p + 0.2, t) * (1 - smooth(j.l - 0.3, j.l, t)) * (0.5 + 0.12 * i)); }
      w *= 1 - 0.7 * sp;
      if (w > 0) {
        const fc = 400 + 900 * w + 200 * Math.sin(t * 1.7);
        l += windF[0].run(white() * 0.5 + bL * 2, fc, 0.9).lp * 0.3 * w; r += windF[1].run(white() * 0.5 + bR * 2, fc * 1.08, 0.9).lp * 0.3 * w;
      }
      // space: a low hum with a slow shimmer on top (never silence)
      if (sp > 0.001) {
        ph2 += 55 / SR;
        const pad = (Math.sin(TAU * ph2) * 0.5 + Math.sin(TAU * ph2 * 1.5 + 0.3 * Math.sin(t * 0.7)) * 0.3 + Math.sin(TAU * ph2 * 2.01) * 0.2) * 0.16;
        const sh = padF[0].run(white(), 900 + 300 * Math.sin(t * 0.9), 2.5).bp * 0.06;
        const lo = padF[1].run(bL * 2, 120, 0.7).lp * 0.4;
        l += (pad + sh + lo) * sp; r += (pad * 0.97 + sh * 0.9 + lo) * sp;
      }
      BL[n] = l; BR[n] = r;
    }
  }

  // ---------------- the hits ----------------
  // the crowd's scream and gasp at frame 0 (in the loop's lead-in the same clip starts again on the seam)
  const clips = [['scream.mp3', 0.05, 1.3, -0.15, 1.2, 1.0, -0.25], ['omg.mp3', 0, 1.8, JUMPS[4].p + 0.35, 0.5, 1, -0.35], ['scream.mp3', 0.1, 1.0, JUMPS[5].l + 0.2, 0.55, 0.92, 0.35], ['scream.mp3', 0.1, 1.0, 23.6, 0.5, 1.08, -0.3]];
  for (const [name, ss, len, t0, gain, rate, pan] of clips) {
    const c = loadClip(name, ss, len + 0.2);
    if (!c) continue;
    const g = gain / c.pk, n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    for (const tt of [t0, t0 - VIDEO_DURATION]) {
      for (let i = 0; i < n2; i++) {
        const o = idx(tt) + i; if (o < 0 || o >= N) continue;
        const fade = Math.min(1, i / (SR * 0.006)) * Math.min(1, (n2 - i) / (SR * 0.08));
        L[o] += at(c, i * rate, 0) * g * fade * (1 - pan); R[o] += at(c, i * rate, 1) * g * fade * (1 + pan);
      }
    }
  }
  // every push-off and landing (and the same in the loop's lead-in)
  for (const e of EVENTS) {
    const L10 = Math.log10(e.N), size = clamp((L10 - 1) / 11, 0, 1);
    for (const t of [e.t, e.t - VIDEO_DURATION]) {
      if (e.kind === 'push') {
        if (e.N <= 1e6) { boom(t, 0.2 + 0.08 * L10, 70 - 3 * L10, 0.2 + 0.05 * L10); rise(t, 0.18 + 0.05 * L10, 0.5 + 0.1 * L10); if (e.N >= 100) crack(t, 0.08 + 0.04 * L10); }
        else if (e.N < 1e12) blast(t, (0.55 + 0.45 * size) * (size > 0.85 ? 0.85 : 1), 1 + 6 * size);
      } else {
        boom(t, (0.25 + 0.12 * L10) * (e.N >= 1e6 ? 0.55 : 1), 62 - 3 * L10, 0.25 + 0.08 * L10);
        crack(t, 0.1 + 0.07 * L10);
        if (e.N >= 1e3) crash(t + 0.02, (0.2 + 0.1 * L10) * (e.N >= 1e6 ? 0.55 : 1), 1300, 0.2 + 0.05 * L10, -0.1);
      }
    }
  }
  // the wind-up after the first landing: the crowd keeps shouting, a low riser builds to the 100x push-off
  {
    const c = loadClip('omg.mp3', 0, 1.9);
    if (c) for (const tt of [1.15, 1.15 - VIDEO_DURATION]) for (let i = 0; i < Math.min(c.n, 1.9 * SR); i++) { const o = idx(tt) + i; if (o < 0 || o >= N) continue; const fade = Math.min(1, i / (SR * 0.01)) * Math.min(1, (1.9 * SR - i) / (SR * 0.15)); L[o] += at(c, i, 0) / c.pk * 0.55 * fade * 1.3; R[o] += at(c, i, 1) / c.pk * 0.55 * fade * 0.7; }
    const f = new SVF();
    add(1.0, 2.85, (dt) => { const k = dt / 2.85; const o = f.run(white(), 90 + 500 * k * k, 0.8).lp * (0.45 + 0.55 * k) * 1.3 * (1 - smooth(0.97, 1, k)); return [o, o]; });
    whoosh(1.1, 0.3, 150, 700, 1.3, 0.3);
  }
  // the cars flipping at 1,000x and 10,000x (soft metal crunches)
  for (const t of [JUMPS[2].l + 0.25, JUMPS[3].l + 0.3, JUMPS[3].l + 0.6]) crash(t, 0.22, 900, 0.18, 0.3);
  // 10,000x: the windows rattle, the punch through the clouds
  {
    const f = new SVF();
    const t0 = JUMPS[3].p;
    add(t0, 1.4, (dt) => { const am = 0.5 + 0.5 * Math.sin(TAU * 23 * dt); const o = f.run(white(), 2600, 1.2).bp * am * env(dt, 0.02, 0.45) * 0.35; return [o, o * 0.9]; });
    boom(HOLE_T, 0.28, 48, 0.5); whoosh(HOLE_T - 0.1, 0.25, 200, 800, 0.8, 0);
  }
  // 100,000x: the sonic boom (a double crack) and every window on the street
  {
    const t = JUMPS[4].p + 0.02;
    for (const dt of [0, 0.11]) { crack(t + dt, 0.55); boom(t + dt, 0.5, 45, 0.35); }
    for (let k = 0; k < 10; k++) glass(t + 0.08 + k * 0.14, 0.32 - 0.02 * k, 10, (k % 2 ? 0.5 : -0.5));
  }
  // 1,000,000x: you come back down as a fireball (a rising roar), then the impact
  {
    const f = new SVF(), f2 = new SVF();
    const t0 = FALL_T0 - 1.4, d = JUMPS[5].l - t0;
    add(t0, d + 0.05, (dt) => { const k = dt / d; const o = (f.run(white(), 300 + 1800 * k, 0.8).lp * 0.8 + f2.run(white(), 120, 0.7).lp * 1.2) * (0.2 + 0.8 * k * k) * 0.55; return [o, o]; });
    blast(JUMPS[5].l, 0.28, 1.5);
    glass(JUMPS[5].l + 0.15, 0.3, 14, 0.2);
  }
  // the crouch: a deep charge building under you, the ground cracking more and more often, a sizzle from the glowing
  // cracks, the crowd fleeing, engines reversing
  {
    const t0 = JUMPS[5].l + 0.3, t1 = V_TRILLION;
    const f = new SVF(), lp = new OnePole(55), hs = new SVF();
    add(t0, t1 - t0 + 0.02, (dt) => { const k = dt / (t1 - t0); const o = (f.run(white(), 50 + 260 * k * k, 0.7).lp * 1.3 + lp.run(white()) * 2.2) * (0.25 + 0.95 * k * k) * 0.6 + hs.run(white(), 3200, 1.5).bp * 0.05 * k; return [o, o * 0.97]; });
    let t = t0 + 0.2, n = 0;
    while (t < t1 - 0.05) { crack(t, 0.12 + 0.18 * (t - t0) / (t1 - t0)); n++; t += 0.55 - 0.4 * (t - t0) / (t1 - t0) + 0.1 * GR(); }
    for (let i = 0; i < 5; i++) { const f2 = new SVF(); const ts = 23.6 + i * 0.35 + 0.2 * GR(); add(ts, 3.2, (dt) => { const o = f2.run(white(), 180 + 90 * Math.min(1, dt) + 30 * Math.sin(dt * 9), 6).bp * env(dt, 0.3, 1.8) * 0.12; return [o * (i % 2 ? 0.6 : 1.2), o * (i % 2 ? 1.2 : 0.6)]; }); }
  }
  // the 1-trillion push-off: the biggest blast at your feet, then the long roar of the fireball and the dust wall
  {
    blast(V_TRILLION, 0.26, 7);
    const wf = new SVF();
    add(V_FAR - 0.1, V_SPACE - V_FAR + 0.3, (dt) => { const t = V_FAR - 0.1 + dt, k = smooth(V_FAR, V_SPACE, t); const o = wf.run(white(), 150 + 1600 * k, 0.9).lp * (0.55 + 0.6 * k) * (1 - smooth(V_SPACE - 0.05, V_SPACE + 0.2, t)) * 0.42; return [o, o]; });
    boom(V_SPACE - 0.4, 0.5, 30, 0.6);
  }
  // your flight: a rush away from the Earth, whooshes as the Moon and Jupiter go past, a shimmer into the white
  whoosh(V_SPACE, 0.55, 80, 700, 1.4, 0);
  whoosh(37.6, 0.6, 60, 500, 1.3, -0.4);
  whoosh(39.7, 0.5, 50, 380, 1.4, 0.4);
  {
    const f = new SVF();
    add(43.0, T_SWITCH + 0.6 - 43.0, (dt) => { const t = 43.0 + dt; const k = smooth(43.0, V_WHITE, t); const o = f.run(white(), 600 + 3000 * k, 1.2).bp * (0.15 + 0.7 * k) * (1 - smooth(T_SWITCH + 0.1, T_SWITCH + 0.6, t)); return [o, o]; });
  }
  // people screaming in the street shots after the big landings (a band-passed noise crowd)
  {
    const f = [new SVF(), new SVF(), new SVF()];
    add(-1.9, 32.6, (dt) => { const t = -1.9 + dt; const e = (0.55 + 0.45 * Math.sin(t * 3.3)) * (0.75 + 0.25 * smooth(14.8, 15.6, t) + 0.6 * smooth(1.0, 1.6, t) * (1 - smooth(3.2, 3.8, t)) + 0.5 * smooth(23.4, 24.2, t)) * (1 - smooth(V_TRILLION - 0.2, V_TRILLION + 0.1, t)) * (inSpace(t) ? 0.15 : 1) * 0.55; let o = 0; [700, 1100, 1600].forEach((fc, i) => { o += f[i].run(white(), fc * (1 + 0.15 * Math.sin(t * (2 + i))), 6).bp; }); o *= e; return [o * 0.9, o]; });
  }

  // ---------------- the mix ----------------
  const rms = (A, Bq, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + Bq[n] * Bq[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 0, 44), bedR = rms(BL, BR, 0, 44);
  if (process.env.ADBG) { const bad = (A, nm) => { for (let n = 0; n < N; n++) if (!Number.isFinite(A[n])) { console.log(nm, 'bad at', (T0 + n / SR).toFixed(3)); return; } }; bad(L, 'L'); bad(BL, 'BL'); console.log('hitR', hitR, 'bedR', bedR); }
  const gBed = (hitR / bedR) * Math.pow(10, -3 / 20);
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
  // a slow leveler: lifts the quiet stretches toward the hits (half the gap in dB, at most +10 dB), no pumping
  {
    let ms = 0; for (let n = 0; n < M; n++) ms += OL[n] * OL[n] + OR[n] * OR[n];
    const T = Math.sqrt(ms / (2 * M)) * 1.4;
    const aA = 1 - Math.exp(-1 / (0.06 * SR)), aR = 1 - Math.exp(-1 / (0.6 * SR));
    let en = T, g = 1;
    const G = new Float32Array(M);
    for (let n = 0; n < M; n++) { const x = Math.sqrt((OL[n] * OL[n] + OR[n] * OR[n]) / 2); en += (x > en ? aA : aR) * (x - en); G[n] = Math.min(5.0, Math.max(0.45, Math.pow(T / Math.max(en, 1e-6), 0.8))); }
    const aG = 1 - Math.exp(-1 / (0.08 * SR));
    for (let n = 0; n < M; n++) { g += aG * (G[n] - g); OL[n] *= g; OR[n] *= g; }
  }
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  // a second, slower pass on the half-second loudness: pulls every stretch toward the middle (keeps it in -9..-16 dB)
  {
    const T = Math.sqrt(e / (2 * M));
    const W2 = Math.round(0.25 * SR), cs = new Float64Array(M + 1);
    for (let n = 0; n < M; n++) cs[n + 1] = cs[n] + (OL[n] * OL[n] + OR[n] * OR[n]) / 2;
    const G2 = new Float32Array(M);
    for (let n = 0; n < M; n++) { const a = Math.max(0, n - W2), b = Math.min(M, n + W2); const r = Math.sqrt((cs[b] - cs[a]) / (b - a)); G2[n] = Math.min(1.6, Math.max(0.62, Math.pow(T / Math.max(r, 1e-6), 0.55))); }
    const aG = 1 - Math.exp(-1 / (0.06 * SR));
    let g = G2[0];
    for (let n = 0; n < M; n++) { g += aG * (G2[n] - g); OL[n] *= g; OR[n] *= g; }
    e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  }
  const gl = Math.pow(10, -12.5 / 20) / Math.sqrt(e / (2 * M));
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
