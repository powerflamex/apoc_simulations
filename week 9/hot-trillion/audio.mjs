// Procedural soundtrack for "What if you were 1 trillion times hotter?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Two layers, mixed like the fixed scream trillion (quiet between the hits):
//   the BED, ~12 dB under the hits: the street (traffic hum, voices) until people run; the roar of the fires (soft, low,
//     fluttering: no crackle clicks); the hiss of the boiling street; a deep rumble that grows as the city boils away;
//   the HITS: your friend's scream on frame 0 and "oh my god" as people run; a deep whoomp on every step of the counter
//     with a rising swell into it; a soft whoosh as each nearby thing catches fire (trees, awnings, cars), windows cracking
//     (soft high tinks), metal groaning as the cars and the building beside you sag, the walls pouring (a long low slide),
//     the towers going (rolls of thunder), the crust breaking up at 100,000,000x (deep cracks, the slabs' rush).
//   Half a second of near silence before 1 trillion, then the biggest hit and a roar into the white.
// The loop: under the white the run's own lead-in fades in, so the sound runs on across the seam. Every onset is soft.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, HITS, logMult, V_WHITE, V_TRILLION, timeOfQAt, heartAt, Q } from './src/timeline.js';
import { CAM, AWNINGS, BLD } from './src/layout.js';
import { CLUMPS } from './src/trees.js';
import { EVENTS } from './src/street.js';
import { CARS } from './src/traffic.js';
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

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);       // the hits
  const BL = new Float32Array(N), BR = new Float32Array(N);     // the bed
  const idx = (t) => Math.round((t - T0) * SR);
  const R0 = rng(4321);
  const white = () => R0() * 2 - 1;
  const add = (t0, dur, fn) => { const a = Math.max(0, idx(t0)), b = Math.min(N, idx(t0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(t0)) / SR); L[n] += l; R[n] += r; } };
  // (how close a sound is to the camera, which walks with you: ~2.8 m behind you, a little right)
  const near = (x, z, s = 12, t = 0) => { const h = heartAt(t); return 1 / (1 + Math.hypot(x - h.x - 0.8, z - h.z - 2.8) / s); };
  const panOf = (x, s = 20) => clamp((x - 0.8) / s, -0.85, 0.85);
  const live = (t) => t > T0 && t < V_WHITE - 0.05;

  // ================= the bed =================
  // how much is burning near the camera each moment (flames' roar)
  const BIN = 50, NB = Math.ceil((VIDEO_DURATION - T0) * BIN) + 2, burn = new Float32Array(NB);
  const addBurn = (t0, dur, g) => { for (let b = Math.max(0, Math.round((t0 - T0) * BIN)); b < Math.min(NB, Math.round((t0 + dur - T0) * BIN)); b++) burn[b] += g; };
  for (const c of CLUMPS) if (Number.isFinite(c.tIgn)) addBurn(c.tIgn, c.burn + 1, 0.3 * near(c.x, c.z, 15));
  for (const a of AWNINGS) if (Number.isFinite(a.tIgn)) addBurn(a.tIgn, a.burn + 1, 0.35 * near(a.x, a.z, 15));
  for (const c of CARS) if (Number.isFinite(c.tCab)) addBurn(c.tCab, 8, 0.3 * near(c.sx, c.sz, 15));
  {
    const cityLP = new OnePole(240), talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
    const fireF = [new SVF(), new SVF()], flut = [new OnePole(6), new OnePole(5)], hissF = [new SVF(), new SVF()], deepF = [new SVF(), new SVF()];
    let bL = 0, bR = 0, ph = 0;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR, Lm = logMult(t);
      bL = bL * 0.996 + white() * 0.05; bR = bR * 0.996 + white() * 0.05;
      let l = 0, r = 0;
      // the street: traffic hum and voices until everyone runs (~4 s)
      const street = 1 - smooth(1.5, 5, t);
      if (street > 0) {
        const hum = cityLP.run(bL) * 2.2;
        l += hum * 0.12 * street; r += hum * 0.12 * street;
        for (let j = 0; j < 6; j++) {
          const syl = 0.5 + 0.5 * Math.sin(t * (3.1 + j * 0.7) + j * 2 + Math.sin(t * (1.3 + j * 0.3)) * 2);
          const e = talkE[j].run(syl > 0.65 ? 1 : 0), o = talkF[j].run(white(), 500 + j * 180 + 250 * Math.sin(t * (2 + j)), 3).bp * 0.025 * e * street;
          l += o * (j % 2 ? 0.6 : 1); r += o * (j % 2 ? 1 : 0.6);
        }
      }
      // the heat off you: a low airy hiss from frame 0, the hot air rising
      const hk = 0.25 + 0.3 * smooth(0, 10, t);
      l += hissF[0].run(white(), 900 + 300 * Math.sin(t * 0.7), 0.7).bp * 0.06 * hk; r += hissF[1].run(white(), 1000 + 300 * Math.sin(t * 0.6), 0.7).bp * 0.06 * hk;
      // the fires: a soft, fluttering roar (low-passed noise), as loud as what's burning near you
      const bk = Math.min(1.5, burn[Math.min(NB - 1, Math.floor((t - T0) * BIN))]) * (1 - smooth(18, 24, t)) + 0.6 * smooth(10, 16, t) * (1 - smooth(20, 26, t));
      if (bk > 0) {
        const fl = [0.6 + 0.4 * clamp(flut[0].run(white() * 5), -1, 1), 0.6 + 0.4 * clamp(flut[1].run(white() * 5), -1, 1)];
        l += fireF[0].run(white(), 380, 0.9).lp * 0.55 * bk * fl[0]; r += fireF[1].run(white(), 420, 0.9).lp * 0.55 * bk * fl[1];
      }
      // the boiling and the deep rumble of everything going: growing with the counter from ~20x
      const dk = smooth(8, 26, t) * (0.4 + 0.6 * smooth(26, 40, t)) * (1 - 0.4 * smooth(V_WHITE, T_SWITCH, t));
      if (dk > 0) {
        ph += (30 + 8 * clamp((Lm - 2) / 10, 0, 1)) / SR;
        const sub = Math.sin(TAU * ph) * 0.3;
        l += (deepF[0].run(bL * 3, 70 + 90 * dk, 0.8).lp * 1.3 + sub) * dk * 0.9; r += (deepF[1].run(bR * 3, 75 + 90 * dk, 0.8).lp * 1.3 + sub) * dk * 0.9;
      }
      BL[n] = l; BR[n] = r;
    }
  }

  // ================= the hits =================
  // a whoomp on every step (deeper and bigger each time), a swell rising into it; the biggest at 1 trillion
  {
    const BEAT = HITS.map((t, n) => ({ t, k: 0.3 + 0.045 * n, f: 62 * Math.pow(2, -n / 18) }));
    BEAT[BEAT.length - 1].k = 1.7; BEAT[BEAT.length - 1].f = 30;
    const boomLP = new OnePole(90), swF = new SVF(), washF = new SVF();
    const revL = new Reverb(21), revR = new Reverb(22);
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      let l = 0, r = 0, wet = 0;
      for (const b of BEAT) {
        const dt = t - b.t; if (dt < -0.5 || dt > 3.5) continue;
        if (dt < 0) {
          // the swell: rising filtered noise into the hit
          const k = (dt + 0.5) / 0.5, o = swF.run(white(), 300 + 2500 * k * k, 1.2).bp * k * k * b.k * 0.35;
          l += o; r += o; continue;
        }
        const f = b.f * (1 + 0.7 * Math.exp(-dt * 9));
        const o = Math.sin(TAU * f * dt - 4 * Math.exp(-dt * 9)) * env(dt, 0.006, b.k > 1.5 ? 1.5 : 0.8) * b.k * 0.85;
        const bl = boomLP.run(white()) * env(dt, 0.004, 0.3) * b.k * 2.0;
        l += o + bl; r += o + bl; wet += o * 0.25;
      }
      // the roar into the white
      const wa = 0.9 * smooth(V_TRILLION + 0.4, V_WHITE, t) * (1 - smooth(V_WHITE + 0.1, V_WHITE + 0.8, t)) + 0.25 * smooth(V_WHITE, V_WHITE + 0.3, t) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.3, t));
      if (wa > 0) { const o = washF.run(white(), 300 + 3000 * wa, 1.2).bp * wa * 0.4; l += o; r += o; }
      const rv = revL.run(wet, 0.82), rv2 = revR.run(wet, 0.82);
      L[n] += l + rv * 0.5; R[n] += r + rv2 * 0.5;
    }
  }
  // a fire catching: a soft whoosh (band noise rising, then settling into the roar)
  const whoosh = (t, g, pan) => {
    if (!live(t) || g < 0.004) return;
    const f = new SVF();
    add(t, 1.2, (dt) => { const o = f.run(white(), 250 + 1400 * Math.exp(-dt * 4) * Math.min(1, dt / 0.08), 1.0).bp * env(dt, 0.06, 0.35) * g; return [o * (1 - pan), o * (1 + pan)]; });
  };
  const ign = [];
  for (const c of CLUMPS) ign.push({ t: c.tIgn, x: c.x, z: c.z, g: 0.5 });
  for (const a of AWNINGS) ign.push({ t: a.tIgn, x: a.x, z: a.z, g: 0.55 });
  for (const c of CARS) ign.push({ t: c.tCab, x: c.sx, z: c.sz, g: 0.45 }, ...c.wheels.slice(0, 2).map((w) => ({ t: w.t, x: w.x, z: w.z, g: 0.2 })));
  ign.filter((e) => live(e.t) && e.t < 20).sort((a, b) => near(b.x, b.z, 12, b.t) - near(a.x, a.z, 12, a.t)).slice(0, 26).forEach((e) => whoosh(e.t, e.g * near(e.x, e.z, 10, e.t), panOf(e.x)));
  // windows cracking: soft high tinks (the shop fronts and windows nearest you, as their heat passes ~9 kW/m²)
  {
    const RR = rng(99), wins = [];
    for (const b of BLD) {
      if (b.dist > 60 || b.kind > 2) continue;
      const fx = b.x > 0 ? b.x - b.w / 2 : b.x + b.w / 2;
      for (let k = 0; k < 6; k++) {
        const z = b.z - b.d / 2 + RR() * b.d, y = 2 + RR() * Math.min(b.h - 3, 15);
        wins.push({ t: timeOfQAt(9e3 * (0.85 + 0.3 * RR()), fx, y, z), x: fx, z });
      }
    }
    wins.filter((w) => live(w.t)).sort((a, b) => near(b.x, b.z, 12, b.t) - near(a.x, a.z, 12, a.t)).slice(0, 40).forEach((w) => {
      const g = 0.16 * near(w.x, w.z, 8, w.t), pan = panOf(w.x, 12), fq = 2600 + 3000 * RR();
      let ph = 0; const f = new SVF();
      add(w.t, 0.5, (dt) => { ph += fq / SR; const o = (Math.sin(TAU * ph) * env(dt, 0.002, 0.05) * 0.6 + f.run(white(), 4500, 0.4).bp * env(dt, 0.003, 0.04)) * g; return [o * (1 - pan), o * (1 + pan)]; });
    });
  }
  // metal groaning (a slow, low, gliding tone through a resonant filter): the cars at 20-30x, the building beside you at 40x
  const groan = (t, dur, g, f0, pan) => {
    if (!live(t)) return;
    let ph = 0; const f = new SVF();
    add(t, dur, (dt) => { const fq = f0 * (1 - 0.25 * dt / dur) * (1 + 0.03 * Math.sin(dt * 11)); ph += fq / SR; const saw = (ph % 1) * 2 - 1;
      const o = f.run(saw, fq * 3, 4).bp * g * Math.min(1, dt / 0.25) * Math.min(1, (dur - dt) / 0.4); return [o * (1 - pan), o * (1 + pan)]; });
  };
  groan(EVENTS.busNear + 0.1, 2.6, 0.3, 92, -0.5); groan(EVENTS.busNear + 1.9, 2.4, 0.26, 78, -0.55); groan(HITS[4] + 0.2, 2.4, 0.18, 95, 0.3);
  groan(HITS[5] + 0.15, 3.0, 0.26, 70, 0.5); groan(HITS[5] + 1.2, 2.5, 0.18, 58, 0.4);
  // the walls pouring down (50-70x): a long low slide, like lava running
  for (const [t, pan] of [[HITS[6] + 0.1, 0.5], [HITS[7] + 0.1, -0.4], [HITS[8] + 0.1, 0.0]]) {
    const f = new SVF();
    add(t, 3.5, (dt) => { const o = f.run(white(), 160 + 80 * Math.sin(dt * 3), 1.4).bp * env(dt, 0.25, 1.4) * 0.6; return [o * (1 - pan), o * (1 + pan)]; });
  }
  // the towers and then the horizon going (1,000x, 10,000x): rolling thunder
  const thunder = (t, g, len) => { if (!live(t)) return; const f = new SVF(), f2 = new OnePole(60);
    add(t, len, (dt) => { const roll = 0.6 + 0.4 * Math.sin(dt * 5.3) * Math.sin(dt * 2.1 + 1); const o = (f.run(white(), 120 + 60 * Math.exp(-dt), 0.8).lp * 1.4 + f2.run(white()) * 2) * env(dt, 0.08, len * 0.35) * g * roll; return [o, o]; }); };
  thunder(HITS[10] + 0.2, 0.9, 4); thunder(HITS[11] + 0.2, 1.1, 4.5);
  // 100,000,000x: the crust breaking: deep cracks and the slabs rushing up past
  {
    const RR = rng(55);
    for (let k = 0; k < 12; k++) {
      const t = HITS[14] + 0.1 + k * 0.42 + RR() * 0.2, pan = RR() * 1.4 - 0.7, g = 0.45 + 0.3 * RR();
      if (!live(t) || t > V_HUSH[0] - 0.2) continue;
      const f = new SVF(), th = new OnePole(80);
      add(t, 1.4, (dt) => { const o = f.run(white(), 600 * Math.exp(-dt * 3) + 90, 0.9).lp * env(dt, 0.004, 0.25) * g + th.run(white()) * env(dt, 0.003, 0.12) * g * 2.5; return [o * (1 - pan), o * (1 + pan)]; });
      const f3 = new SVF();
      add(t + 0.3, 1.2, (dt) => { const o = f3.run(white(), 300 + 1800 * Math.min(1, dt / 0.5) * Math.exp(-dt * 1.5), 1.1).bp * env(dt, 0.2, 0.35) * 0.3; return [o * (1 + pan), o * (1 - pan)]; });
    }
  }
  // ---- the things you walk into ----
  const boomAt = (t, g, f0, dec, pan) => { if (!live(t)) return; const f = new SVF(), th = new OnePole(60);
    add(t, dec * 5, (dt) => { const o = (Math.sin(TAU * f0 * dt * (1 + 0.6 * Math.exp(-dt * 6))) * env(dt, 0.004, dec) * 1.2 + f.run(white(), 2200 * Math.exp(-dt * 3) + 120, 0.8).lp * env(dt, 0.003, dec * 0.7) * 1.4 + th.run(white()) * env(dt, 0.003, 0.2) * 3) * g; return [o * (1 - pan), o * (1 + pan)]; }); };
  // the cart: its umbrella going up (a whoosh), the propane bottle bursting
  whoosh(EVENTS.cartUmb, 0.5, 0.5); boomAt(EVENTS.cartPop, 0.55, 52, 0.5, 0.45);
  // the fountain: hissing as it heats, then all of it flashing to steam at once (a big roaring hiss)
  { const f = new SVF(), f2 = new SVF();
    add(EVENTS.steam, EVENTS.flash - EVENTS.steam, (dt) => { const k = Math.min(1, dt / (EVENTS.flash - EVENTS.steam)); const o = f.run(white(), 3500 + 2000 * k, 0.9).bp * 0.12 * k * k; return [o * 0.6, o * 1.3]; });
    add(EVENTS.flash, 3.5, (dt) => { const o = f2.run(white(), 1400 + 1800 * Math.exp(-dt * 1.5), 0.6).bp * env(dt, 0.05, 0.9) * 0.6; return [o * 0.7, o * 1.3]; });
    boomAt(EVENTS.flash, 0.35, 45, 0.6, 0.3); }
  // the gas station going up: the biggest blast before the end, a long roll after it
  boomAt(EVENTS.boom, 0.75, 34, 1.4, -0.35); thunder(EVENTS.boom + 0.15, 0.55, 4);
  // the glass tower ahead pouring down (200x), the crater opening (1,000x on): low slides and a growing rumble
  { const f = new SVF(); add(HITS[9] + 0.15, 4.5, (dt) => { const o = f.run(white(), 110 + 50 * Math.sin(dt * 2), 1.2).bp * env(dt, 0.3, 1.8) * 1.0; return [o, o]; }); }
  { const f = new SVF(), f2 = new OnePole(50); add(26.5, 8.5, (dt) => { const k = smooth(0, 3, dt) * (1 - smooth(6.5, 8.5, dt)); const o = (f.run(white(), 70 + 40 * k, 0.7).lp * 1.6 + f2.run(white()) * 2.5) * k * 0.55; return [o, o]; }); }
  // the people: your friend and the people round you screaming as they jump back; a gasp; "oh my god" as everyone runs
  for (const [name, ss, len, t0, gain, rate, pan] of [['scream.mp3', 0.0, 1.2, 0.08, 1.0, 1.1, -0.35], ['scream.mp3', 0.15, 1.1, 0.32, 0.7, 0.93, 0.35], ['scream.mp3', 0.3, 0.9, 0.62, 0.5, 1.22, 0.1], ['gasp.mp3', 0, 1.4, 1.3, 0.35, 1.0, 0.4], ['scream.mp3', 0.4, 0.9, 1.75, 0.4, 0.86, -0.5], ['scream.mp3', 0.1, 1.0, 2.3, 0.45, 1.05, 0.55], ['omg.mp3', 0, 1.8, 3.3, 0.4, 1.0, 0.3], ['scream.mp3', 0.25, 0.9, 3.9, 0.35, 0.97, -0.3], ['scream.mp3', 0.05, 1.0, 4.5, 0.3, 1.15, 0.45]]) {
    const c = loadClip(name, ss, len + 0.2);
    if (!c) continue;
    const g = gain / c.pk, n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    for (let i = 0; i < n2; i++) {
      const o = idx(t0) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, i / (SR * 0.005)) * Math.min(1, (n2 - i) / (SR * 0.12));
      L[o] += at(c, i * rate, 0) * g * fade * (1 - pan); R[o] += at(c, i * rate, 1) * g * fade * (1 + pan);
    }
  }
  // the ice cream landing on the road: a soft wet pat
  { const f = new SVF(); add(0.62, 0.3, (dt) => { const o = f.run(white(), 700, 1.0).lp * env(dt, 0.003, 0.05) * 0.12; return [o * 1.3, o * 0.7]; }); }

  // ================= the music (the black hole Short's approach: a minor-key drone of detuned saws through a low-pass
  // that opens up, trailer "braam" hits on the steps, a sub that comes in, a riser into 1 trillion) =================
  // It starts low on frame 0 and builds the whole way: louder, brighter, the chords darker, biggest at 1 trillion.
  const UL = new Float32Array(N), UR = new Float32Array(N);
  {
    const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
    const CHORDS = [[-9, [110, 130.81, 164.81, 220]], [10.8, [87.31, 110, 130.81, 174.61]], [21.2, [73.42, 110, 146.83, 174.61]],
      [29.0, [69.3, 73.42, 103.83, 138.59]], [36.8, [65.41, 69.3, 98.0, 130.81]]];
    const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };
    const ph = new Float64Array(8), bph = [0, 0, 0, 0], lp = [new OnePole(300), new OnePole(300)], bLP = new SVF(), subLP = new OnePole(70), rise = new SVF();
    const revL = new Reverb(31), revR = new Reverb(32);
    const BR = HITS.map((t, n) => ({ t, k: 0.35 + 0.045 * n, f: chordAt(t + 0.01)[0] / 2 }));
    BR[BR.length - 1].k = 1.6;
    let subPh = 0, prevCh = null, xf = 1;
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const ch = chordAt(t);
      const g = (0.6 + 0.75 * smooth(0, 42, t) + 0.3 * smooth(30, 42, t)) * (1 - 0.6 * smooth(V_WHITE + 0.3, T_SWITCH, t));
      const cut = 320 + 700 * smooth(0, 25, t) + 1800 * smooth(25, 42.3, t);
      lp[0].set(cut); lp[1].set(cut * 1.06);
      const bend = 1 + 0.05 * Math.pow(smooth(34, 42, t), 2);
      let dl = 0, dr = 0;
      for (let k = 0; k < 4; k++) {
        ph[k] += ch[k] * bend * 0.997 / SR; ph[k + 4] += ch[k] * bend * 1.003 / SR;
        dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
      }
      // (a soft swell on each chord change instead of a jump)
      if (prevCh !== ch) { prevCh = ch; xf = 0; }
      xf = Math.min(1, xf + 1 / (0.25 * SR));
      dl = lp[0].run(dl) * g * 0.11 * (0.4 + 0.6 * xf); dr = lp[1].run(dr) * g * 0.11 * (0.4 + 0.6 * xf);
      // braams on every step
      let br = 0;
      for (const B of BR) {
        const dt = t - B.t; if (dt < -0.01 || dt > 6) continue;
        const e = (dt < 0.06 ? Math.max(dt, 0) / 0.06 : Math.exp(-(dt - 0.06) / (B.k > 1.5 ? 2.6 : 1.5))) * B.k;
        for (let k = 0; k < 4; k++) bph[k] += B.f * [1, 1.004, 2, 3.01][k] / SR;
        br += (saw(bph[0]) + saw(bph[1]) + 0.5 * saw(bph[2]) + 0.25 * saw(bph[3])) * e;
      }
      br = bLP.run(br, 700 + 900 * smooth(0, 42, t), 0.6).lp * 0.16;
      // the sub (from 20x) and the riser into 1 trillion
      subPh += (33 + 5 * Math.sin(t * 0.7)) / SR;
      const sub = (Math.sin(TAU * subPh) * 0.6 + subLP.run(white()) * 2) * 0.12 * smooth(8, 30, t) * (1 - smooth(V_WHITE, T_SWITCH, t));
      const rk = smooth(34, V_HUSH[0], t) * (t < V_HUSH[0] + 0.08 ? 1 - smooth(V_HUSH[0], V_HUSH[0] + 0.08, t) : 0);
      const ri = rise.run(white(), 300 + 6500 * rk * rk, 0.3).bp * rk * rk * 0.45;
      const wet = (dl + dr) * 0.5 + br * 0.6;
      const wl = revL.run(wet * 0.5), wr = revR.run(wet * 0.5);
      UL[n] = dl + br + sub + ri + wl * 0.8; UR[n] = dr + br + sub + ri + wr * 0.8;
    }
  }

  // ================= the mix =================
  // the bed ~10 dB under the hits; the music ~5 dB under them (so every hit still stands out on top), then the hush
  const rms = (A, B, t0, t1) => { let e = 0, c = 0; for (let n = idx(t0); n < idx(t1); n++) { e += A[n] * A[n] + B[n] * B[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 3, 44), bedR = rms(BL, BR, 3, 44), musR = rms(UL, UR, 3, 44);
  const gBed = (hitR / bedR) * Math.pow(10, -10 / 20), gMus = (hitR / musR) * Math.pow(10, -3 / 20);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const hush = 1 - 0.985 * smooth(V_HUSH[0], V_HUSH[0] + 0.1, t) * (1 - smooth(V_HUSH[1] - 0.03, V_HUSH[1], t));
    const gb = gBed * (1 + 1.0 * (1 - smooth(5, 12, t)));
    ML[n] = (L[n] + BL[n] * gb + UL[n] * gMus) * hush; MR[n] = (R[n] + BR[n] * gb + UR[n] * gMus) * hush;
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
  // a slow leveller: the quiet gaps between hits are lifted toward ~-15 dB, the loudest moments eased down a little,
  // while each hit keeps its attack (the gain follows a ~0.4 s average, not the waveform)
  {
    let e0 = 0; for (let n = 0; n < M; n++) e0 += OL[n] * OL[n] + OR[n] * OR[n];
    const ref = Math.sqrt(e0 / (2 * M)), W = Math.round(0.02 * SR), K = Math.ceil(M / W), lev = new Float32Array(K);
    for (let k = 0; k < K; k++) { let q = 0; for (let n = k * W; n < Math.min(M, (k + 1) * W); n++) q += OL[n] * OL[n] + OR[n] * OR[n]; lev[k] = Math.sqrt(q / (2 * W)); }
    const env = new Float32Array(K); let y = ref;
    for (let k = 0; k < K; k++) {
      // (held through the hush before 1 trillion, so the silence stays silent and the hit isn't turned up)
      const tk = k * W / SR; if (tk > V_HUSH[0] - 0.05 && tk < V_HUSH[1] + 0.5) { env[k] = Math.max(y, 1e-6); continue; }
      const a = lev[k] > y ? 0.25 : 0.06; y += a * (lev[k] - y); env[k] = Math.max(y, 1e-6); }
    const gk = new Float32Array(K); for (let k = 0; k < K; k++) gk[k] = clamp(Math.pow(ref / env[k], 0.7), 0.5, 4);
    let gs = gk[0];
    for (let n = 0; n < M; n++) { const k = Math.floor(n / W); gs += (gk[k] - gs) * 0.0004; OL[n] *= gs; OR[n] *= gs; }
  }
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  const gl = Math.pow(10, -11.7 / 20) / Math.sqrt(e / (2 * M));   // (about asteroid sizes' level: -12.4 dB overall)
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
  console.log(`audio: bed ${(20 * Math.log10(gBed * bedR / hitR)).toFixed(1)} dB, music ${(20 * Math.log10(gMus * musR / hitR)).toFixed(1)} dB under the hits, ${ign.length} fires`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
