// Procedural soundtrack for "What if you fell into a volcano?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// No music: what you would hear. On the rim: wind, the lava lake's deep surf-like roar far below, the tourists talking,
// the rock under you cracking and gravel trickling off; a gasp and the owner's "oh my god" (sounds/gasp.mp3,
// sounds/omg.mp3, local only) as you tip over. The fall: the wind rising with your real speed, the lake's roar
// growing as you near it, a low drone of heat. The hit: a deep thud and a crunch (slowed, like the picture), then the
// crust: a close hiss and bubbling, a groan as the crack opens, your shoes sizzling, the gas blowing through, the
// tourists faint and far above. Then the lake wakes: a rising rumble, booming bubble bursts, lava spattering round you,
// the rift tearing, the dome swelling, and the eruption's roar into the white, which turns back into the rim (loop).
// Levels: the opening second sits at about -26 dB RMS like the owner's other Shorts. Every onset is soft (8 ms+).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_DURATION, LOOP, T_SWITCH, storyT, speedAt, heightAt, V_IMPACT, V_SLIP, V_CRACK, V_SMOKE, V_HAZE, V_UP, V_WAKE,
  V_BUB1, V_BUB2, V_RAIN, V_RIFT, V_DOME, V_BURST, V_FLASH, BUBBLES,
} from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// (the gasp starts just before frame 0, inside the white at the loop, so it is already loud on frame 0)
// (gasp.mp3 is silent for its first 0.23 s; omg.mp3 is cut at 0.88 s, before the rest of what's said)
const GASP_AT = -0.5, OMG_AT = 0.18, OMG_LEN = 0.88;
const TARGET_OPENING_DB = -25;

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 2.2)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.4) {
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
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-Math.max(dt - att, 0) / dec));

function loadClip(dir, file, rmsDb) {
  const f = path.join(dir, 'sounds', file);
  if (!fs.existsSync(f)) { console.warn(`audio: no sounds/${file}: left out`); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let s = 0, n = 0;
  for (const x of a) if (Math.abs(x) > 0.02) { s += x * x; n++; }
  const g = Math.pow(10, rmsDb / 20) / Math.sqrt(s / Math.max(n, 1) + 1e-12);
  console.log(`audio: sounds/${file}`);
  return { a, g };
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const GASP = loadClip(DIR, 'gasp.mp3', -12), OMG = loadClip(DIR, 'omg.mp3', -13);

  // per-sample story values on a coarse grid
  const STEP = 240, grid = [];
  for (let n = -N0 - STEP; n < N + 2 * STEP; n += STEP) {
    const v = n / SR, T = storyT(v);
    grid.push({ T, sp: speedAt(T), h: heightAt(T) });
  }
  const at = (n) => {
    const f = (n + N0 + STEP) / STEP, i = Math.floor(f), k = f - i;
    const a = grid[i], b = grid[i + 1] || a;
    return { T: a.T + (b.T - a.T) * k, sp: a.sp + (b.sp - a.sp) * k, h: a.h + (b.h - a.h) * k };
  };

  // one-off events (video time): [t, kind, gain, pan]
  const ev = [];
  // gravel trickling off the lip as it gives way (soft, low)
  for (let k = 0; k < 14; k++) ev.push([-0.8 + R0() * 2.4, 'grit', 0.25 + R0() * 0.3, R0() * 1.2 - 0.6]);
  ev.push([-0.55, 'crack', 0.7, 0], [V_SLIP - 0.05, 'crack', 1.0, 0.1]);
  ev.push([V_IMPACT, 'impact', 0.55, 0]);
  ev.push([V_CRACK, 'groan', 0.6, 0.4]);
  for (const [bv, x, z, size] of BUBBLES) {
    const d = Math.hypot(x, z - 117);
    ev.push([bv + d / 343, 'bubble', Math.min(1.3, size * 0.5 * 40 / (20 + d)) * (bv > V_WAKE - 0.5 ? 1.6 : 0.8), clamp(-x / 60, -0.8, 0.8)]);
  }
  for (let k = 0; k < 18; k++) ev.push([V_RAIN + 0.4 + R0() * 2.8, 'splat', 0.3 + R0() * 0.5, R0() * 1.6 - 0.8]);
  ev.push([V_RIFT, 'tear', 1.0, -0.3], [V_BURST, 'burst', 1.0, 0]);
  for (const e of ev) { e.push({ f1: new SVF(), f2: new SVF(), lp: new OnePole(120), ph: 0 }); }

  const windF = [new SVF(), new SVF()], windLP = [new OnePole(500), new OnePole(500)];
  const surfLP = new OnePole(90), surfLP2 = new OnePole(55), surfF = new SVF();
  const crowdF = [new SVF(), new SVF(), new SVF()], crowdE = new OnePole(3);
  const hissF = new SVF(), bubF = new SVF(), bubE = new OnePole(8), sizF = new SVF(), gasF = new SVF();
  const rumLP = new OnePole(60), rumLP2 = new OnePole(40), roarF = new SVF(), roarLP = new OnePole(300);
  const riserF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  let ph0 = 0, ph1 = 0, brown = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    const st = at(n);
    const onLake = v >= V_IMPACT;
    let l = 0, r = 0, wet = 0;

    // ---- wind: a breeze on the rim, then the roar of the fall rising with your real speed ----
    {
      const k = clamp(st.sp / 57);
      const fall = onLake ? 0 : k;
      const g = 0.08 * (1 - smooth(1.5, 3, v) * 0.3) + 1.25 * Math.pow(fall, 0.75);
      const fc = 350 + 2400 * fall * fall + 120 * Math.sin(v * 0.6);
      windLP[0].set(fc * 1.3); windLP[1].set(fc * 1.4);
      const a = windF[0].run(white(), fc, 0.9).bp, b = windF[1].run(white(), fc * 1.07, 0.9).bp;
      const flutter = 1 + 0.2 * fall * Math.sin(v * 8.7) * Math.sin(v * 3.1);
      const cut = onLake ? 1 - smooth(V_IMPACT, V_IMPACT + 0.05, v) : 1;
      l += (windLP[0].run(white()) * 0.5 + a) * g * flutter * cut;
      r += (windLP[1].run(white()) * 0.5 + b) * g * flutter * cut;
    }
    // ---- the lake: a deep surf-like roar, louder as you near it; huge once you're on it and as it wakes ----
    {
      const near = onLake ? 1 : 1 / (1 + Math.pow(st.h / 90, 1.4));
      const wake = smooth(V_WAKE - 1, V_BURST, v);
      const g = (0.08 + 0.32 * near) * (1 + 1.2 * wake);
      const swell = 0.6 + 0.4 * Math.sin(v * 0.9) * Math.sin(v * 0.37 + 1);
      const x = (surfLP2.run(surfLP.run(white())) * 9 + surfF.run(white(), 160 + 60 * swell, 0.6).bp * 0.4) * g * swell;
      l += x; r += x * 0.95; wet += x * 0.3;
    }
    // ---- close to the crust: hiss and bubbling ----
    if (onLake) {
      const k = smooth(V_IMPACT + 0.3, V_IMPACT + 2, v);
      const hs = hissF.run(white(), 5200, 0.7).bp * 0.045 * k;
      const burst = bubE.run(Math.max(0, Math.sin(v * 11.3) * Math.sin(v * 6.9 + 1) * Math.sin(v * 2.9 + 2)));
      const bb = bubF.run(white(), 140 + 260 * burst, 0.4).bp * 0.22 * k * (0.2 + 2.2 * burst) * (1 + smooth(V_WAKE, V_BURST, v));
      l += hs + bb; r += hs * 0.9 + bb * 1.05; wet += bb * 0.3;
    }
    // ---- your shoes sizzling ----
    {
      const g = smooth(V_SMOKE - 0.3, V_SMOKE + 1.2, v) * (1 - smooth(V_UP - 0.4, V_UP + 0.6, v) * 0.6) * 0.06;
      if (g > 1e-4) {
        const crk = Math.pow(Math.max(0, Math.sin(v * 37.1) * Math.sin(v * 23.3 + 1)), 6);
        const x = sizF.run(white(), 3800 + 1500 * crk, 0.5).bp * g * (0.6 + 1.5 * crk);
        l += x * 0.8; r += x;
      }
    }
    // ---- the gas blowing through ----
    {
      const g = smooth(V_HAZE - 1, V_HAZE + 0.8, v) * (1 - smooth(V_UP, V_UP + 2, v)) * 0.16;
      if (g > 1e-4) { const x = gasF.run(white(), 600 + 300 * Math.sin(v * 0.8), 0.6).bp * g; l += x * 1.1; r += x * 0.8; wet += x * 0.5; }
    }
    // ---- the crowd: on the rim round you, then far above (an echo off the walls) ----
    {
      // the tourists: talking, then an uproar as the rock gives way, fading above you as you drop
      const top = (1 + 1.6 * smooth(-0.7, 0.1, v)) * (1 - smooth(0.8, 4.0, v));
      const far = smooth(V_UP - 0.5, V_UP + 0.8, v) * (1 - smooth(V_WAKE - 0.5, V_WAKE + 0.5, v)) * 0.25;
      const g = top * 0.9 + far;
      if (g > 1e-4) {
        const e = crowdE.run(0.6 + 0.4 * Math.abs(Math.sin(v * 3.1) * Math.sin(v * 1.7 + 1)));
        let x = crowdF[0].run(white(), 420 + 120 * Math.sin(v * 5.3), 0.25).bp;
        x += crowdF[1].run(white(), 950 + 250 * Math.sin(v * 4.1 + 1), 0.3).bp * 0.7;
        x += crowdF[2].run(white(), 2200 + 400 * Math.sin(v * 6.7 + 2), 0.4).bp * 0.35;
        x *= e * g * 0.13;
        l += x * 0.9 * (1 - far); r += x * (1 - far); wet += x * (1 + 4 * far);
      }
    }
    // ---- the voices: a gasp, then "oh my god" ----
    for (const [C, t0, pan, len] of [[GASP, GASP_AT, -0.15, 9], [OMG, OMG_AT, 0.2, OMG_LEN]]) {
      if (!C) continue;
      const i = Math.round((v - t0) * SR);
      if (i >= 0 && i < C.a.length && v - t0 < len) {
        const fade = Math.min(1, i / (0.01 * SR));
        const x = C.a[i] * C.g * fade * (1 - smooth(len - 0.06, len, v - t0));
        l += x * (1 - pan) * 0.9; r += x * (1 + pan) * 0.9; wet += x * 0.35;
      }
    }
    // ---- a low drone of heat, rising toward the end ----
    {
      const g = (0.05 * smooth(3, 11, v) + 0.25 * smooth(V_WAKE - 1, V_BURST, v)) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH, v));
      if (g > 1e-4) {
        ph0 += (38 + 4 * Math.sin(v * 0.7)) / SR; ph1 += 57.3 / SR;
        const x = (rumLP2.run(rumLP.run(white())) * 8 + Math.sin(TAU * ph0) * 0.3 + Math.sin(TAU * ph1) * 0.1) * g;
        l += x; r += x;
      }
    }
    // ---- the dome swelling: a riser into the eruption ----
    {
      const k = smooth(V_DOME, V_BURST, v) * (1 - smooth(V_BURST, V_BURST + 0.15, v));
      if (k > 1e-4) { const x = riserF.run(white(), 200 + 2400 * k * k, 0.4).bp * k * k * 0.22; l += x; r += x; wet += x * 0.5; }
    }
    // ---- the eruption's roar, into the white ----
    {
      const k = smooth(V_BURST - 0.05, V_BURST + 0.6, v) * (1 - smooth(T_SWITCH - 0.25, T_SWITCH + 0.05, v));
      if (k > 1e-4) {
        roarLP.set(500 + 900 * k);
        const x = (roarLP.run(white()) * 2.2 + roarF.run(white(), 220 + 300 * Math.sin(v * 1.3), 0.5).bp * 0.6) * k * 0.6;
        l += x; r += x * 0.97; wet += x * 0.6;
      }
    }

    // ---- one-off events ----
    for (const [t0, kind, g, pan, S] of ev) {
      const dt = v - t0;
      if (dt < -0.01 || dt > 4) continue;
      let x = 0;
      if (kind === 'grit') {
        x = S.f1.run(white(), 1800, 0.8).bp * env(dt, 0.01, 0.05) * g * 0.08;
      } else if (kind === 'crack') {
        // rock giving way: a low crunch and a dull thump (no sharp click)
        S.ph += (70 - 30 * Math.min(dt, 1)) / SR;
        x = (S.lp.run(white()) * 3 * env(dt, 0.012, 0.18) + Math.sin(TAU * S.ph) * env(dt, 0.01, 0.25) * 0.4 + S.f1.run(white(), 900, 1.2).bp * env(dt, 0.015, 0.09) * 0.4) * g * 0.6;
      } else if (kind === 'impact') {
        // slowed with the picture: a deep thud, the crust crunching, and a long hiss
        S.ph += (48 - 22 * Math.min(dt, 1.5)) / SR;
        x = (Math.sin(TAU * S.ph) * env(dt, 0.01, 0.7) * 1.1 + S.lp.run(white()) * 5 * env(dt, 0.01, 0.4) + S.f1.run(white(), 700, 1.0).bp * env(dt, 0.02, 0.35) * 0.6
          + S.f2.run(white(), 4000, 0.8).bp * env(dt - 0.15, 0.2, 1.4) * 0.12) * g;
      } else if (kind === 'groan') {
        S.ph += (55 + 20 * Math.sin(dt * 2)) / SR;
        x = (Math.sin(TAU * S.ph) * 0.4 + S.lp.run(white()) * 3) * env(dt, 0.25, 0.9) * g * 0.5 + S.f1.run(white(), 260, 0.3).bp * env(dt - 0.3, 0.2, 0.8) * g * 0.4;
      } else if (kind === 'bubble') {
        // a gas bubble bursting: a low "bloomp" and a splash
        S.ph += (95 * Math.exp(-dt * 3) + 35) / SR;
        x = (Math.sin(TAU * S.ph) * env(dt, 0.015, 0.3) * 0.9 + S.lp.run(white()) * 4 * env(dt, 0.01, 0.35) + S.f1.run(white(), 600, 0.8).bp * env(dt - 0.05, 0.02, 0.6) * 0.5) * g;
      } else if (kind === 'splat') {
        x = (S.lp.run(white()) * 3 * env(dt, 0.008, 0.08) + S.f1.run(white(), 3000, 0.9).bp * env(dt, 0.02, 0.5) * 0.2) * g * 0.5;
      } else if (kind === 'tear') {
        S.ph += (42 + 8 * Math.sin(dt * 5)) / SR;
        x = (Math.sin(TAU * S.ph) * 0.8 + S.lp.run(white()) * 5 + S.f1.run(white(), 400, 0.6).bp * 0.6) * env(dt, 0.06, 1.2) * g * 0.8;
      } else if (kind === 'burst') {
        S.ph += (40 * Math.exp(-dt * 0.8) + 22) / SR;
        x = (Math.sin(TAU * S.ph) * 1.2 + S.lp.run(white()) * 6) * env(dt, 0.02, 1.5) * g;
      }
      l += x * (1 - pan * 0.6); r += x * (1 + pan * 0.6); wet += x * 0.5;
    }

    // a constant low air so it never goes dead silent
    brown = clamp(brown + white() * 0.02, -1, 1) * 0.998;
    l += brown * 0.02; r += brown * 0.02;

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.8, outR = r + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the rim just before the first frame (the loop)
    const a = N - N0, xf = Math.round(0.34 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }

  const out = (x, g) => 0.95 * Math.tanh((x * g) / 0.95);
  const openingDb = (g) => { let s = 0; for (let n = 0; n < SR; n++) { const m = (out(L[n], g) + out(R[n], g)) / 2; s += m * m; } return 10 * Math.log10(s / SR + 1e-12); };
  let lo = 0.01, hi = 100;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (openingDb(m) < TARGET_OPENING_DB) lo = m; else hi = m; }
  const gn = Math.sqrt(lo * hi);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    const a = out(L[n], gn), b = out(R[n], gn);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
