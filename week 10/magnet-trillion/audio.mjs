// Procedural soundtrack for "What if you were 1 trillion times more magnetic?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Three layers, mixed like hot trillion (quiet between the hits, every hit standing out):
//   the BED, ~10 dB under the hits: the crowd (voices, then yelling) until it's pushed away; a magnet's hum (a low
//     electric drone with its harmonics, the pitch rising a little with every step, beating); a deep rumble that grows;
//   the HITS: screams on frame 0 (the owner's clips); at every step a deep "thoom" with a zap rising into it (the
//     field jumping); and a sound for EVERY KIND of thing as it lands on the pile (things.js LANDINGS + the cars, the bus,
//     the chunks, the ships, the bridge): keys and coins tink, phones tock, forks clink, bikes clatter and ring,
//     signs thump, carts rattle, manhole covers clang like a bell, chairs clank, lamp posts ring long, cars crunch,
//     the bus crunches after a long scrape, bollards clunk, beams clang, the buildings' chunks boom, ships groan as they
//     lift and land with the biggest booms, the bridge's cables snap;
//   the MUSIC, ~3 dB under the hits: the minor drone that opens up, braams on the steps, a riser into 1 trillion.
//   Half a second of near silence before 1 trillion, then the biggest hit and a shimmering roar into the white.
// The loop: under the white the run's own lead-in fades in, so the sound runs on across the seam. Every onset is soft
// (a few ms attack), so nothing clicks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, HITS, logMult, V_WHITE, V_TRILLION } from './src/timeline.js';
import { LANDINGS } from './src/things.js';
import { SMALLS } from './src/smalls.js';
import { CARS, SHIPS } from './src/layout.js';
import { BUSF } from './src/traffic.js';
import { CHUNKS } from './src/city.js';
import { DECK } from './src/harbor.js';
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

export const V_HUSH = [V_TRILLION - 0.55, V_TRILLION - 0.02];

// where the camera is (roughly: behind you, rising to ~5 m) and how near a sound is
const near = (x, z, s = 10) => 1 / (1 + Math.hypot(x - 1.5, z - 6) / s);
const panOf = (x, s = 14) => clamp((x - 1.0) / s, -0.85, 0.85);

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);       // the hits
  const BL = new Float32Array(N), BR = new Float32Array(N);     // the bed
  const idx = (t) => Math.round((t - T0) * SR);
  const R0 = rng(4321);
  const white = () => R0() * 2 - 1;
  const add = (t0, dur, fn) => { const a = Math.max(0, idx(t0)), b = Math.min(N, idx(t0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(t0)) / SR); L[n] += l; R[n] += r; } };
  const live = (t) => t > T0 && t < V_WHITE - 0.05 && !(t > V_HUSH[0] - 0.05 && t < V_HUSH[1]);

  // ================= the bed =================
  {
    const talkF = Array.from({ length: 8 }, () => new SVF()), talkE = Array.from({ length: 8 }, () => new OnePole(4));
    const humF = [new SVF(), new SVF()], deepF = [new SVF(), new SVF()], windF = [new SVF(), new SVF()];
    let bL = 0, bR = 0, ph = 0, ph2 = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR, Lm = logMult(t);
      bL = bL * 0.996 + white() * 0.05; bR = bR * 0.996 + white() * 0.05;
      let l = 0, r = 0;
      // the crowd: voices and yelling (stronger once things fly), fading as they're pushed away
      const crowd = (0.6 + 0.4 * smooth(0, 3, t)) * (1 - 0.7 * smooth(17, 22, t)) * (1 - smooth(34, 38, t));
      if (crowd > 0) for (let j = 0; j < 8; j++) {
        const syl = 0.5 + 0.5 * Math.sin(t * (2.6 + j * 0.55) + j * 2 + Math.sin(t * (1.1 + j * 0.3)) * 2);
        const e = talkE[j].run(syl > 0.6 ? 1 : 0);
        const o = talkF[j].run(white(), 650 + j * 160 + 300 * Math.sin(t * (1.7 + j)), 2.5).bp * 0.03 * e * crowd;
        l += o * (j % 2 ? 0.55 : 1); r += o * (j % 2 ? 1 : 0.55);
      }
      // the magnet's hum: a low electric drone (odd harmonics) that rises a little with every step and gets rougher
      const hk = 0.35 + 0.65 * smooth(0, 30, t);
      const f0 = 48 * Math.pow(2, (Lm - 2.5) / 14);
      ph += f0 / SR; ph2 += f0 * 1.007 / SR;
      const hum = (Math.sin(TAU * ph) + 0.45 * Math.sin(TAU * 3 * ph) + 0.25 * Math.sin(TAU * 5 * ph2) + 0.12 * Math.sin(TAU * 7 * ph)) * 0.09 * hk;
      const buzz = humF[0].run(Math.sign(Math.sin(TAU * 2 * ph)) * 0.5, 240 + 500 * smooth(10, 36, t), 1.5).bp * 0.05 * smooth(4, 30, t);
      l += hum + buzz; r += hum * 0.95 + buzz;
      // wind and a deep rumble growing with everything moving
      const wk = 0.15 + 0.5 * smooth(9, 30, t);
      l += windF[0].run(bL * 3, 300 + 200 * Math.sin(t * 0.37), 1.2).bp * wk * 0.6; r += windF[1].run(bR * 3, 330 + 200 * Math.sin(t * 0.29), 1.2).bp * wk * 0.6;
      const dk = smooth(12, 30, t) * (1 - 0.5 * smooth(V_WHITE, T_SWITCH, t));
      if (dk > 0) { l += deepF[0].run(bL * 3, 70 + 60 * dk, 0.8).lp * 1.4 * dk; r += deepF[1].run(bR * 3, 75 + 60 * dk, 0.8).lp * 1.4 * dk; }
      BL[n] = l; BR[n] = r;
    }
  }

  // ================= the hits =================
  // the field jumping on every step: a zap rising into a deep thoom (bigger each time); the biggest at 1 trillion
  {
    const BEAT = HITS.map((t, n) => ({ t, k: 0.32 + 0.04 * n, f: 58 * Math.pow(2, -n / 20) }));
    BEAT[BEAT.length - 1].k = 1.6; BEAT[BEAT.length - 1].f = 30;
    const boomLP = new OnePole(90), swF = new SVF();
    const revL = new Reverb(21), revR = new Reverb(22);
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      let l = 0, r = 0, wet = 0;
      for (const b of BEAT) {
        const dt = t - b.t; if (dt < -0.45 || dt > 3.5) continue;
        if (dt < 0) {
          const k = (dt + 0.45) / 0.45, o = swF.run(white(), 400 + 3500 * k * k, 2.5).bp * k * k * b.k * 0.3;
          l += o; r += o; continue;
        }
        const f = b.f * (1 + 0.8 * Math.exp(-dt * 10));
        const o = Math.sin(TAU * f * dt - 4 * Math.exp(-dt * 9)) * env(dt, 0.006, b.k > 1.5 ? 1.6 : 0.75) * b.k * 0.9;
        const bl = boomLP.run(white()) * env(dt, 0.004, 0.25) * b.k * 2.0;
        l += o + bl; r += o + bl; wet += o * 0.25;
      }
      const rv = revL.run(wet, 0.82), rv2 = revR.run(wet, 0.82);
      L[n] += l + rv * 0.5; R[n] += r + rv2 * 0.5;
    }
  }
  // ---- the sound of each kind of thing landing ----
  // a ringing metal hit: partials [freq, gain, decay], plus a short soft noise thump
  const ring = (t, g, pan, partials, thump = 0.5, tf = 900) => {
    if (!live(t) || g < 0.003) return;
    const ph = partials.map(() => R0() * TAU), f = new SVF();
    const dur = Math.max(...partials.map((p) => p[2])) * 5;
    add(t, dur, (dt) => {
      let o = 0;
      for (let k = 0; k < partials.length; k++) { const [fq, pg, dec] = partials[k]; o += Math.sin(TAU * fq * dt + ph[k]) * pg * env(dt, 0.003, dec); }
      o += f.run(white(), tf, 0.9).lp * env(dt, 0.004, 0.05) * thump * 3;
      o *= g; return [o * (1 - pan), o * (1 + pan)];
    });
  };
  // a crunch: low thud, crumpling (noise in bumps), a tinkle of glass
  const crunch = (t, g, pan, size = 1) => {
    if (!live(t)) return;
    const f = new SVF(), f2 = new SVF(), th = new OnePole(70), gl = new SVF();
    add(t, 1.6 * size, (dt) => {
      const bumps = 0.5 + 0.5 * Math.sin(dt * 47 + Math.sin(dt * 23) * 3);
      let o = th.run(white()) * env(dt, 0.004, 0.18 * size) * 4 + f.run(white(), 500 / size + 300 * Math.exp(-dt * 6), 0.9).bp * env(dt, 0.006, 0.25 * size) * bumps * 1.6;
      o += gl.run(white(), 5200, 0.6).bp * env(dt - 0.03, 0.003, 0.12) * 0.25 * (dt > 0.03 ? 1 : 0);
      o += f2.run(white(), 120, 0.8).lp * env(dt, 0.01, 0.5 * size) * 1.2;
      o *= g; return [o * (1 - pan), o * (1 + pan)];
    });
  };
  // a boom: thump + rumble (rubble)
  const boom = (t, g, f0, dec, pan) => {
    if (!live(t)) return;
    const f = new SVF(), th = new OnePole(55);
    add(t, dec * 5, (dt) => {
      const o = (Math.sin(TAU * f0 * dt * (1 + 0.6 * Math.exp(-dt * 6))) * env(dt, 0.005, dec) * 1.2 + f.run(white(), 1600 * Math.exp(-dt * 3) + 110, 0.8).lp * env(dt, 0.004, dec * 0.8) * 1.4
        + th.run(white()) * env(dt, 0.004, 0.25) * 3) * g;
      return [o * (1 - pan), o * (1 + pan)];
    });
  };
  // a scrape (a car or the bus dragged over the stone): band noise with grit
  const scrape = (t0, t1, g, pan, fc = 900) => {
    if (!(t1 > t0)) return;
    const f = new SVF(), fl = new OnePole(30);
    add(t0, t1 - t0 + 0.2, (dt) => {
      const u = dt / (t1 - t0), k = smooth(0, 0.08, u) * (1 - smooth(0.95, 1.05, u));
      const grit = 0.6 + 0.4 * clamp(fl.run(white() * 6), -1, 1);
      const o = f.run(white(), fc * (0.8 + 0.5 * u), 1.6).bp * k * grit * g;
      return [o * (1 - pan), o * (1 + pan)];
    });
  };
  // a groan (a ship's hull straining): a slow low saw through a resonant filter
  const groan = (t, dur, g, f0, pan) => {
    if (!live(t)) return;
    let ph = 0; const f = new SVF();
    add(t, dur, (dt) => { const fq = f0 * (1 - 0.3 * dt / dur) * (1 + 0.04 * Math.sin(dt * 9)); ph += fq / SR; const saw = (ph % 1) * 2 - 1;
      const o = f.run(saw, fq * 3.2, 5).bp * g * Math.min(1, dt / 0.3) * Math.min(1, (dur - dt) / 0.5); return [o * (1 - pan), o * (1 + pan)]; });
  };
  const RR = rng(77);
  // the small things: the ones that hit you (all within a metre of the camera's view), soft and many, capped per 50 ms
  {
    const last = {};
    const smalls = SMALLS.map((s) => ({ s, t: s.tR + Math.min(0.9, Math.max(0.22, Math.sqrt(2 * Math.hypot(s.src.x, s.src.y - 1, s.src.z) / 26))) })).sort((a, b) => a.t - b.t);
    for (const { s, t } of smalls) {
      const slot = Math.floor(t / 0.05);
      if (last[slot]) continue; last[slot] = 1;
      const pan = (RR() - 0.5) * 0.6;
      if (s.kind === 'key') ring(t, 0.05, pan, [[2600 + 900 * RR(), 0.6, 0.07], [4100 + 900 * RR(), 0.35, 0.05], [6800, 0.2, 0.03]], 0.2, 2500);
      else if (s.kind === 'coin') ring(t, 0.045, pan, [[3300 + 800 * RR(), 0.7, 0.09], [7400, 0.3, 0.05]], 0.15, 3000);
      else if (s.kind === 'phone') { const f = new SVF(); if (live(t)) add(t, 0.2, (dt) => { const o = f.run(white(), 1100, 1.2).bp * env(dt, 0.003, 0.03) * 0.22; return [o * (1 - pan), o * (1 + pan)]; }); }
      else ring(t, 0.06, pan, [[1900 + 500 * RR(), 0.6, 0.12], [5200, 0.35, 0.06]], 0.2, 2200);
    }
  }
  // everything else, by kind (the nearer, the louder; at most one of a kind per 80 ms, the nearest)
  {
    const all = [...LANDINGS.map((l) => ({ ...l })),
      ...CARS.filter((c) => c.f).map((c) => ({ t: c.f.tL, kind: 'car', x: c.f.p1.x, z: c.f.p1.z, tR: c.f.tR, mode: c.f.mode, x0: c.x, z0: c.z })),
      { t: BUSF.tL, kind: 'bus', x: BUSF.p1.x, z: BUSF.p1.z, tR: BUSF.tR },
      ...CHUNKS.map((c) => ({ t: c.f.tL, kind: 'chunk', x: c.f.p1.x, z: c.f.p1.z, size: c.w * c.h * c.d })),
      ...SHIPS.map((s) => ({ t: s.f.tL, kind: 'ship', x: s.f.p1.x, z: s.f.p1.z, tR: s.f.tR, big: s.kind < 2 })),
      ...DECK.filter((d) => d.f).map((d) => ({ t: d.f.tL, kind: 'deck', x: d.f.p1.x, z: d.f.p1.z, tR: d.f.tR }))];
    all.sort((a, b) => a.t - b.t);
    const slots = {};
    for (const e of all) {
      const key = `${e.kind}:${Math.floor(e.t / 0.08)}`;
      if (slots[key]) continue; slots[key] = 1;
      const pan = panOf(e.x), g = near(e.x, e.z);
      switch (e.kind) {
        case 'bike': ring(e.t, 0.32 * g, pan, [[520 + 60 * RR(), 0.5, 0.25], [1350 + 120 * RR(), 0.35, 0.18], [2150, 0.25, 0.12], [3300, 0.12, 0.08]], 0.7, 700); break;
        case 'sign': ring(e.t, 0.3 * g, pan, [[180 + 40 * RR(), 0.7, 0.12], [430, 0.3, 0.1], [910, 0.2, 0.06]], 1.0, 500); break;
        case 'cart': { ring(e.t, 0.26 * g, pan, [[780, 0.4, 0.15], [1650, 0.3, 0.1], [2600, 0.2, 0.07]], 0.5, 900); for (let k = 1; k < 5; k++) ring(e.t + k * 0.045, 0.1 * g, pan, [[2200 + 500 * RR(), 0.5, 0.03]], 0.3, 2000); break; }
        case 'cover': ring(e.t, 0.55 * g, pan, [[178, 0.7, 0.9], [469, 0.45, 0.6], [828, 0.3, 0.35], [1310, 0.15, 0.2]], 1.3, 350); break;
        case 'chair': case 'table': case 'bin': ring(e.t, 0.26 * g, pan, [[640 + 120 * RR(), 0.5, 0.18], [1580, 0.3, 0.1], [2700, 0.15, 0.06]], 0.6, 800); break;
        case 'lamp': ring(e.t, 0.45 * g, pan, [[96, 0.6, 1.6], [262, 0.45, 1.1], [517, 0.3, 0.7], [860, 0.15, 0.4]], 1.0, 300); break;
        case 'bollard': ring(e.t, 0.3 * g, pan, [[240, 0.6, 0.2], [610, 0.3, 0.12]], 1.0, 400); break;
        case 'kiosk': boom(e.t, 0.5, 48, 0.5, pan); ring(e.t, 0.3, pan, [[150, 0.5, 0.6], [390, 0.3, 0.4]], 0.5, 300); break;
        case 'beam': ring(e.t, 0.38 * g, pan, [[305 + 40 * RR(), 0.6, 1.2], [742, 0.4, 0.8], [1250, 0.25, 0.5], [1960, 0.12, 0.3]], 1.0, 350); break;
        case 'car': { crunch(e.t, 0.55 * g, pan, 1); if (e.mode === 'slide') scrape(e.tR + 0.1, e.t, 0.22 * near(e.x0, e.z0, 12), panOf(e.x0), 700); break; }
        case 'bus': { scrape(e.tR + 0.3, e.t, 0.5, panOf(10), 420); crunch(e.t, 0.9, panOf(e.x), 1.8); boom(e.t, 0.5, 40, 0.8, panOf(e.x)); break; }
        case 'chunk': boom(e.t, 0.32 * Math.max(0.35, near(e.x, e.z, 40)), 36 + 10 * RR(), 0.7, pan * 0.6); break;
        case 'ship': { if (e.big) { groan(e.tR - 0.6, 3.2, 0.5, 44, pan * 0.5); boom(e.t, 1.0, 28, 1.6, pan * 0.4); } else { groan(e.tR - 0.3, 1.6, 0.25, 70, pan * 0.5); boom(e.t, 0.55, 38, 0.9, pan * 0.4); } break; }
        case 'deck': { ring(e.tR, 0.3, pan * 0.5, [[220, 0.5, 0.4], [95, 0.6, 0.8]], 0.2, 600); boom(e.t, 0.45, 32, 1.0, pan * 0.4); break; }
        default: ring(e.t, 0.2 * g, pan, [[900, 0.5, 0.1]], 0.4, 800);
      }
    }
  }
  // the end: everything stretched toward you: a rising shimmer (many glassy partials gliding up) and a roar into the white
  {
    const f = new SVF(), ph = new Float64Array(12);
    add(V_TRILLION + 0.1, V_WHITE - V_TRILLION + 2.5, (dt) => {
      const t = V_TRILLION + 0.1 + dt, k = smooth(V_TRILLION, V_WHITE, t) * (1 - smooth(V_WHITE + 0.3, T_SWITCH, t));
      let o = 0;
      for (let j = 0; j < 12; j++) { const fq = (300 + j * 170) * Math.pow(2, 1.4 * smooth(V_TRILLION, V_WHITE, t)) * (1 + 0.003 * j); ph[j] += fq / SR; o += Math.sin(TAU * ph[j]) * (0.5 + 0.5 * Math.sin(t * (1.3 + j * 0.4) + j)) / 12; }
      const roar = f.run(white(), 200 + 2500 * k, 1.1).bp * k * 0.5;
      const s = o * 0.35 * k + roar;
      return [s, s];
    });
  }
  // the people: screams on frame 0 (round you, as their things are torn away), a gasp, "oh my god", screams as the cars come
  for (const [name, ss, len, t0, gain, rate, pan] of [['scream.mp3', 0.0, 1.2, -0.15, 1.0, 1.1, -0.3], ['scream.mp3', 0.15, 1.1, 0.25, 0.75, 0.93, 0.35], ['scream.mp3', 0.3, 0.9, 0.9, 0.5, 1.22, 0.1],
    ['gasp.mp3', 0, 1.4, 2.0, 0.4, 1.0, 0.4], ['omg.mp3', 0, 1.8, 4.3, 0.45, 1.0, -0.3], ['scream.mp3', 0.4, 0.9, 10.6, 0.45, 0.88, -0.5], ['scream.mp3', 0.1, 1.0, 11.4, 0.4, 1.05, -0.2],
    ['scream.mp3', 0.25, 0.9, 13.7, 0.35, 0.97, 0.4], ['omg.mp3', 0, 1.8, 17.4, 0.35, 0.92, 0.2], ['scream.mp3', 0.05, 1.0, 26.2, 0.3, 0.9, -0.3]]) {
    const c = loadClip(name, ss, len + 0.2);
    if (!c) continue;
    const g = gain / c.pk, n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    for (let i = 0; i < n2; i++) {
      const o = idx(t0) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, i / (SR * 0.005)) * Math.min(1, (n2 - i) / (SR * 0.12));
      L[o] += at(c, i * rate, 0) * g * fade * (1 - pan); R[o] += at(c, i * rate, 1) * g * fade * (1 + pan);
    }
  }

  // ================= the music (the minor drone of detuned saws through a low-pass that opens up, braams on the steps,
  // a sub, a riser into 1 trillion). It starts low on frame 0 and builds the whole way. =================
  const UL = new Float32Array(N), UR = new Float32Array(N);
  {
    const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
    const CHORDS = [[-9, [110, 130.81, 164.81, 220]], [10.0, [87.31, 110, 130.81, 174.61]], [17.0, [73.42, 110, 146.83, 174.61]],
      [26.0, [69.3, 73.42, 103.83, 138.59]], [32.8, [65.41, 69.3, 98.0, 130.81]]];
    const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };
    const ph = new Float64Array(8), bph = [0, 0, 0, 0], lp = [new OnePole(300), new OnePole(300)], bLP = new SVF(), subLP = new OnePole(70), rise = new SVF();
    const revL = new Reverb(31), revR = new Reverb(32);
    const BRM = HITS.map((t, n) => ({ t, k: 0.35 + 0.045 * n, f: chordAt(t + 0.01)[0] / 2 }));
    BRM[BRM.length - 1].k = 1.6;
    let subPh = 0, prevCh = null, xf = 1;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const ch = chordAt(t);
      const g = (0.6 + 0.75 * smooth(0, 36, t) + 0.3 * smooth(26, 36, t)) * (1 - 0.6 * smooth(V_WHITE + 0.3, T_SWITCH, t));
      const cut = 320 + 700 * smooth(0, 22, t) + 1800 * smooth(22, 36.8, t);
      lp[0].set(cut); lp[1].set(cut * 1.06);
      const bend = 1 + 0.05 * Math.pow(smooth(30, 36.5, t), 2);
      let dl = 0, dr = 0;
      for (let k = 0; k < 4; k++) {
        ph[k] += ch[k] * bend * 0.997 / SR; ph[k + 4] += ch[k] * bend * 1.003 / SR;
        dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
      }
      if (prevCh !== ch) { prevCh = ch; xf = 0; }
      xf = Math.min(1, xf + 1 / (0.25 * SR));
      dl = lp[0].run(dl) * g * 0.11 * (0.4 + 0.6 * xf); dr = lp[1].run(dr) * g * 0.11 * (0.4 + 0.6 * xf);
      let br = 0;
      for (const B of BRM) {
        const dt = t - B.t; if (dt < -0.01 || dt > 6) continue;
        const e = (dt < 0.06 ? Math.max(dt, 0) / 0.06 : Math.exp(-(dt - 0.06) / (B.k > 1.5 ? 2.6 : 1.5))) * B.k;
        for (let k = 0; k < 4; k++) bph[k] += B.f * [1, 1.004, 2, 3.01][k] / SR;
        br += (saw(bph[0]) + saw(bph[1]) + 0.5 * saw(bph[2]) + 0.25 * saw(bph[3])) * e;
      }
      br = bLP.run(br, 700 + 900 * smooth(0, 36, t), 0.6).lp * 0.16;
      subPh += (33 + 5 * Math.sin(t * 0.7)) / SR;
      const sub = (Math.sin(TAU * subPh) * 0.6 + subLP.run(white()) * 2) * 0.12 * smooth(8, 26, t) * (1 - smooth(V_WHITE, T_SWITCH, t));
      const rk = smooth(30, V_HUSH[0], t) * (t < V_HUSH[0] + 0.08 ? 1 - smooth(V_HUSH[0], V_HUSH[0] + 0.08, t) : 0);
      const ri = rise.run(white(), 300 + 3200 * rk * rk, 0.7).bp * rk * rk * 0.3;
      const wet = (dl + dr) * 0.5 + br * 0.6;
      const wl = revL.run(wet * 0.5), wr = revR.run(wet * 0.5);
      UL[n] = dl + br + sub + ri + wl * 0.8; UR[n] = dr + br + sub + ri + wr * 0.8;
    }
  }

  // ================= the mix =================
  const rms = (A, B, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + B[n] * B[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 1, 40), bedR = rms(BL, BR, 1, 40), musR = rms(UL, UR, 1, 40);
  const gBed = (hitR / bedR) * Math.pow(10, -10 / 20), gMus = (hitR / musR) * Math.pow(10, -3 / 20);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const hush = 1 - 0.985 * smooth(V_HUSH[0], V_HUSH[0] + 0.1, t) * (1 - smooth(V_HUSH[1] - 0.03, V_HUSH[1], t));
    ML[n] = (L[n] + BL[n] * gBed + UL[n] * gMus) * hush; MR[n] = (R[n] + BR[n] * gBed + UR[n] * gMus) * hush;
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
  // a slow leveller: the quiet gaps lifted toward ~-15 dB, the loudest moments eased a little, each hit keeps its attack
  {
    let e0 = 0; for (let n = 0; n < M; n++) e0 += OL[n] * OL[n] + OR[n] * OR[n];
    const ref = Math.sqrt(e0 / (2 * M)), W = Math.round(0.02 * SR), K = Math.ceil(M / W), lev = new Float32Array(K);
    for (let k = 0; k < K; k++) { let q = 0; for (let n = k * W; n < Math.min(M, (k + 1) * W); n++) q += OL[n] * OL[n] + OR[n] * OR[n]; lev[k] = Math.sqrt(q / (2 * W)); }
    const envl = new Float32Array(K); let y = ref;
    for (let k = 0; k < K; k++) {
      const tk = k * W / SR; if (tk > V_HUSH[0] - 0.05 && tk < V_HUSH[1] + 0.5) { envl[k] = Math.max(y, 1e-6); continue; }
      const a = lev[k] > y ? 0.25 : 0.06; y += a * (lev[k] - y); envl[k] = Math.max(y, 1e-6); }
    const gk = new Float32Array(K); for (let k = 0; k < K; k++) gk[k] = clamp(Math.pow(ref / envl[k], 0.7), 0.5, 4);
    let gs = gk[0];
    for (let n = 0; n < M; n++) { const k = Math.floor(n / W); gs += (gk[k] - gs) * 0.0004; OL[n] *= gs; OR[n] *= gs; }
  }
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  const gl = Math.pow(10, -11.7 / 20) / Math.sqrt(e / (2 * M));
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
  console.log(`audio: bed ${(20 * Math.log10(gBed * bedR / hitR)).toFixed(1)} dB, music ${(20 * Math.log10(gMus * musR / hitR)).toFixed(1)} dB under the hits`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
