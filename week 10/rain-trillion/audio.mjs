// Procedural soundtrack for "What if it rained 1 trillion times harder?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// The BED: rain hiss that gets heavier and lower with the counter (a light patter -> a roaring waterfall), wind, a deep
//   rumble rising with each step, the street's panic (voices) at the start, the open-water roar; quiet in space.
// The HITS: a scream in the first second (the owner's clip), thunder with the lightning, cars knocking and piling up,
//   the bus lifting off, a splash for each floor of balconies and each roof that goes under, the lamps shorting out,
//   the tower, the summit and Everest going under (each bigger), the edge of space, the trillion slam, whooshes on the
//   two cuts, the falling water's roar into the white. The loop: the opening's lead-in fades in under the white.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, V_WHITE, V_BUS, V_ROOFS, V_TOWER, V_SUMMIT, V_EVEREST, V_SPACE, V_TRILLION, V_OUT, V_DIVE, V_LAND, V_CUT2, V_TOWN, V_SC0, V_SC1, V_EC0, V_EC1, logM, vAtDepth, state } from './src/timeline.js';
import { B, BAL } from './src/layout.js';
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
  const END = V_WHITE + 0.1;

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
      const pop = GR() < 0.0025 * (0.4 + k) ? 30 : 0;
      o += cr.run(white() * pop, base * 3.1, 0.15).bp * 0.25;
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
  const V_CUT1 = V_OUT + 0.95;
  {
    const rainF = [new SVF(), new SVF()], roarF = [new SVF(), new SVF()], deepF = [new SVF(), new SVF()], windF = [new SVF(), new SVF()];
    const talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
    let bL = 0, bR = 0, ph = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const k = clamp((logM(Math.max(t, -1)) - 5) / 7);
      const sp = (t > V_CUT1 && t < V_CUT2) ? 1 : 0;
      // the first seconds as loud as the rest: the downpour and the gushing street at full roar from frame 0
      const early = 1 + 1.3 * (1 - smooth(3.5, 8, t));
      bL = bL * 0.996 + white() * 0.04; bR = bR * 0.996 + white() * 0.04;
      let l = 0, r = 0;
      // rain: a bright hiss (patter) that thickens and drops into a roar
      const hiss = (0.55 + 0.6 * k) * (1 - 0.7 * sp) * early;
      const fc = 5200 - 3600 * k;
      l += rainF[0].run(white(), fc, 0.7).bp * 0.33 * hiss; r += rainF[1].run(white(), fc * 1.05, 0.7).bp * 0.33 * hiss;
      // the water's roar (the street river, then the open water churning), lower and bigger as it climbs
      const roar = (0.25 + 0.9 * k) * (1 - 0.8 * sp) * early;
      l += roarF[0].run(white() + bL * 2, 300 + 500 * (1 - k), 0.7).lp * 0.35 * roar; r += roarF[1].run(white() + bR * 2, 320 + 520 * (1 - k), 0.7).lp * 0.35 * roar;
      // wind
      const w = (0.3 + 0.5 * k + 0.2 * Math.sin(t * 0.7)) * (1 - 0.9 * sp);
      const wf = 500 + 700 * k + 250 * Math.sin(t * 1.3);
      l += windF[0].run(white() * 0.4 + bL * 2, wf, 0.9).lp * 0.22 * w; r += windF[1].run(white() * 0.4 + bR * 2, wf * 1.07, 0.9).lp * 0.22 * w;
      // a deep rumble stepping up with the counter (a drone in space)
      ph += (32 + 14 * k) / SR;
      const g = 0.06 + 0.3 * k;
      l += (deepF[0].run(bL * 3, 55 + 110 * k, 0.8).lp * 1.3 + Math.sin(TAU * ph) * 0.35 * k) * g;
      r += (deepF[1].run(bR * 3, 60 + 110 * k, 0.8).lp * 1.3 + Math.sin(TAU * ph) * 0.35 * k) * g;
      // the street's panic: shouting voices for the first seconds
      const city = 1 - smooth(6, 11, t);
      for (let j = 0; j < 6 && city > 0; j++) {
        const syl = 0.5 + 0.5 * Math.sin(t * (3.1 + j * 0.7) + j * 2 + Math.sin(t * (1.3 + j * 0.3)) * 2);
        const o = talkF[j].run(white(), 650 + j * 170 + 300 * Math.sin(t * (2 + j)), 4).bp * 0.05 * talkE[j].run(syl > 0.6 ? 1 : 0) * city;
        l += o * (j % 2 ? 0.6 : 1); r += o * (j % 2 ? 1 : 0.6);
      }
      BL[n] = l; BR[n] = r;
    }
  }

  // ---------------- the hits ----------------
  const clips = [['scream.mp3', 0.0, 1.9, 0.05, 1.0, 1, -0.15], ['scream.mp3', 0.0, 1.5, 1.75, 0.5, 1.12, 0.35], ['gasp.mp3', 0, 1.0, 4.55, 0.45, 1, 0.25], ['omg.mp3', 0, 0.9, V_BUS + 0.25, 0.4, 1, -0.3]];
  for (const [name, ss, len, t0, gain, rate, pan] of clips) {
    const c = loadClip(name, ss, len + 0.2);
    if (!c) continue;
    const g = gain / c.pk, n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    for (let i = 0; i < n2; i++) {
      const o = idx(t0) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, i / (SR * 0.005)) * Math.min(1, (n2 - i) / (SR * 0.12));
      L[o] += at(c, i * rate, 0) * g * fade * (1 - pan); R[o] += at(c, i * rate, 1) * g * fade * (1 + pan);
    }
  }
  // thunder with every lightning stroke the picture shows (a crack, then the rolling boom)
  {
    const seen = new Set();
    for (let t = -1; t < V_CUT1; t += 1 / 120) {
      const s = state(t);
      if (s.bolt > 0.5 && !seen.has(s.boltV)) { seen.add(s.boltV); const t0 = s.boltV; crack(t0 + 0.02, 0.35); boom(t0 + 0.08, 0.5, 45, 0.9); crash(t0 + 0.1, 0.25, 500, 0.8, 0); }
    }
  }
  // the waterfalls off the roofs and awnings and the gushing drainpipes (a churning splash bed for the first seconds)
  {
    const f1 = new SVF(), f2 = new SVF();
    add(-0.5, 9, (dt) => { const t = dt - 0.5; const e = 1 - smooth(5, 8.5, t); const o = (f1.run(white(), 900, 0.5).bp * 0.5 + f2.run(white(), 2600, 0.6).bp * 0.35) * e * 0.55; return [o, o * 0.9]; });
  }
  // cars knocking together as they float off, the pile-up at the cross street
  for (const t of [0.6, 1.4, 2.1, 2.9, 3.6, 4.8]) crash(t, 0.18, 1200, 0.12, (GR() - 0.5) * 0.8);
  crash(5.6, 0.32, 900, 0.3, -0.2); crash(6.1, 0.25, 800, 0.25, 0.1);
  // you on the taxi, the pull-up onto the bus roof
  boom(3.95, 0.25, 90, 0.12); crash(4.0, 0.15, 1800, 0.08, 0.2); boom(5.5, 0.22, 80, 0.15);
  // the bus lifts off: a hollow metal groan, a boom, water slapping
  groan(V_BUS - 0.5, V_BUS + 1.6, 0.35, 90, 3); boom(V_BUS, 0.7, 48, 0.8); splash(V_BUS + 0.05, 0.7, 0.9);
  // the counter's steps
  for (const t of [10, 29]) boom(t, 0.65, 40, 1.0);
  // balconies: a splash as the water comes over each floor; the street lamps pop as they go under
  for (let f = 1; f <= 8; f++) { const t = vAtDepth(BAL.g0 + (f - 1) * BAL.fh); splash(t, 0.35, 0.5); boom(t, 0.18, 70, 0.2); }
  { const t = vAtDepth(7.75); for (let k = 0; k < 4; k++) { const tk = t + k * 0.12; const f = new SVF(); add(tk, 0.25, (dt) => { const o = f.run(white(), 3000, 0.4).bp * env(dt, 0.002, 0.04) * 0.4; return [o, o]; }); } }
  // the roofs: every frontage roof that goes under gets a slap of water and a thud (a rolling run of them)
  for (const b of B) if (b.front && b.h < 60) { const t = vAtDepth(b.h); if (t > 12 && t < 22) { splash(t, 0.22, 0.35); boom(t, 0.2, 60 + 30 * GR(), 0.25); } }
  boom(V_ROOFS, 0.8, 42, 1.0); splash(V_ROOFS, 0.8, 1.0);
  // the city's towers: deeper thuds as each goes under
  for (const b of B) if (!b.front && b.h > 70) { const t = vAtDepth(b.h); if (t > 19 && t < 25.5 && GR() < 0.5) boom(t, 0.25, 45, 0.4); }
  // the tallest tower, the summit, Everest, the edge of space: each bigger
  boom(V_TOWER, 1.0, 38, 1.3); crash(V_TOWER, 0.6, 900, 0.6, 0); glass(V_TOWER + 0.05, 0.35, 16, 0.2); splash(V_TOWER, 0.8, 1.2);
  boom(V_TOWN, 0.6, 50, 0.7); splash(V_TOWN, 0.6, 0.8);
  // the cut-aways: a whoosh into the summit and back, into the Himalaya and back
  for (const t of [V_SC0, V_SC1, V_EC0, V_EC1]) whoosh(t - 0.18, 0.45, 200, 1600, 0.6, 0);
  boom(V_SUMMIT, 1.15, 33, 1.6); crash(V_SUMMIT, 0.8, 600, 0.9, 0); splash(V_SUMMIT, 1.0, 1.4);
  boom(V_EVEREST, 1.3, 28, 1.9); crash(V_EVEREST, 0.6, 400, 1.2, 0);
  boom(V_SPACE, 1.1, 30, 2.0); whoosh(V_SPACE - 0.4, 0.6, 80, 500, 1.6, 0);
  // the trillion slam and the pull-out, the cut to space, the dive back, the second cut
  boom(V_TRILLION, 1.5, 26, 2.2); crash(V_TRILLION, 0.7, 500, 1.0, 0);
  whoosh(V_OUT, 0.8, 70, 900, 1.2, 0); whoosh(V_CUT1 - 0.15, 0.6, 200, 1800, 0.6, 0);
  whoosh(V_DIVE, 0.6, 60, 700, V_CUT2 - V_DIVE + 0.2, 0); whoosh(V_CUT2 - 0.15, 0.7, 200, 1800, 0.7, 0);
  boom(V_CUT2, 0.6, 40, 0.8);
  // the falling water: a roar rising from the landing into the white, then a hard boom on the lens
  {
    const wf = new SVF(), wf2 = new SVF();
    add(V_LAND, T_SWITCH + 0.6 - V_LAND, (dt) => {
      const t = V_LAND + dt;
      const k = smooth(V_LAND, V_WHITE, t);
      const e = (0.2 + 1.4 * k * k) * (1 - 0.8 * smooth(V_WHITE, V_WHITE + 0.15, t)) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.5, t));
      const o = (wf.run(white(), 250 + 2200 * k, 1.0).lp * 0.8 + wf2.run(white(), 3000, 0.6).bp * 0.4 * k) * e * 0.7;
      return [o, o];
    });
    boom(V_WHITE - 0.02, 1.2, 30, 1.2); splash(V_WHITE, 1.0, 0.8);
  }
  // space: the shell of falling rain as a soft high hiss
  {
    const f = new SVF();
    add(V_CUT1, V_CUT2 - V_CUT1, (dt) => { const e = smooth(0, 0.4, dt) * (1 - smooth(V_CUT2 - V_CUT1 - 0.4, V_CUT2 - V_CUT1, dt)); const o = f.run(white(), 6000, 0.8).bp * 0.12 * e; return [o, o * 0.9]; });
  }
  // ---------------- the mix ----------------
  const rms = (A, Bq, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + Bq[n] * Bq[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 1, 45), bedR = rms(BL, BR, 1, 45);
  const gBed = (hitR / bedR) * Math.pow(10, -6 / 20);
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
  // a slow leveler: lifts the quiet stretches between hits toward the hits (half the gap in dB, at most +10 dB),
  // a 60 ms attack / 600 ms release so it never pumps or clicks
  {
    let ms = 0; for (let n = 0; n < M; n++) ms += OL[n] * OL[n] + OR[n] * OR[n];
    const T = Math.sqrt(ms / (2 * M)) * 1.4;
    const aA = 1 - Math.exp(-1 / (0.06 * SR)), aR = 1 - Math.exp(-1 / (0.6 * SR));
    let env = T, g = 1;
    const G = new Float32Array(M);
    for (let n = 0; n < M; n++) { const x = Math.sqrt((OL[n] * OL[n] + OR[n] * OR[n]) / 2); const sq = x * x; env += (sq > env * env ? aA : aR) * (x - env); G[n] = Math.min(3.2, Math.max(0.6, Math.pow(T / Math.max(env, 1e-6), 0.5))); }
    // smooth the gain itself (no fast wobble)
    const aG = 1 - Math.exp(-1 / (0.08 * SR));
    for (let n = 0; n < M; n++) { g += aG * (G[n] - g); OL[n] *= g; OR[n] *= g; }
  }
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
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
