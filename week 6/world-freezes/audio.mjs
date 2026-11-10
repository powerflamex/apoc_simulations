// Procedural soundtrack for "What if the world froze to absolute zero?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a sunny street (traffic, people talking) and, over it, the icy roar of the frost wall coming up the
// avenue; the owner's gasp as it comes (sounds/gasp.mp3, about -25 dB, not a scream); a rush of crystals as it passes you.
// Then a deep hit on every 3 s step (music, bigger each time, over a cold minor drone with a glassy shimmer), and a sound
// for each thing you see: the fountain ringing as it freezes, wings and soft thuds as the birds drop, the engines dying,
// a crackle as everyone freezes, then the street's sound gone. The air: a fizz of dry ice, the hiss of the liquid-air rain
// and the boiling pools, the hush of the snow. With the air gone the sound thins to a cold high tone; the sea ice booms
// and "sings" (long falling zings, as real sea ice does); the towers groan and their glass falls in a soft wash; the lens
// crackles over, a riser, and one last hit as it reaches zero. The loop: under the solid ice the wall's roar and the street
// start again, so the sound runs on across the seam at the same level. Every onset is soft (8 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STEPS, V_FROST, V_FOUNT, V_BIRDS, V_STALL, V_STILL, V_CO2, V_RAIN, V_POUR, V_SNOW, V_BLACK, V_SEA, V_CRACK, V_FALL, V_LENS, V_ZERO } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const GASP_AT = 0.25;                  // the owner's gasp (sounds/gasp.mp3; it stays out of git)
const GASP_DB = -25;                   // its loudness in the finished mix (RMS over the gasp)

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.87, damp = 0.3) {
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
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

function loadClip(dir, name) {
  const file = path.join(dir, 'sounds', name);
  if (!fs.existsSync(file)) { console.warn(`audio: no sounds/${name}: left out`); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  console.log(`audio: sounds/${name}`);
  return a;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const GA = new Float32Array(N);                      // the gasp alone (to set its level in the finished mix)
  const R0 = rng(4747);
  const white = () => R0() * 2 - 1;
  const GASP = loadClip(path.dirname(fileURLToPath(import.meta.url)), 'gasp.mp3');

  // ---- the steps: a deep hit on each (bigger each time), and the last one at zero ----
  const HITS = STEPS.map((t, n) => ({ t, k: clamp(0.3 + 0.045 * n, 0, 0.95), root: 55 * Math.pow(2, -Math.min(n, 12) / 24) }));
  HITS.push({ t: V_ZERO, k: 1.2, root: 32, deep: true });
  // ---- things you see ----
  const THUDS = [
    ...Array.from({ length: 16 }, () => ({ t: V_BIRDS + 0.45 + R0() * 1.1, g: 0.05 + 0.05 * R0(), f: 140 + 80 * R0(), pan: R0() * 1.6 - 0.8 })),   // the birds landing
    { t: V_FALL + 3.6, g: 1.0, f: 34, pan: 0.4 }, { t: V_SEA + 0.05, g: 0.9, f: 38, pan: 0 },
  ].map((c) => ({ ...c, n: new SVF(), ph: 0 }));
  const WINGS = Array.from({ length: 30 }, () => ({ t: 0.4 + R0() * 1.6, f: 11 + R0() * 6, d: 0.6 + R0() * 0.8, pan: R0() * 1.8 - 0.9, g: 0.012 + 0.012 * R0(), fl: new SVF() }));
  // crackles: a soft burst of fizz for each crystal (no clicks: 8 ms+ attack), in waves when things freeze
  const CRK = [];
  const addCrk = (t0, t1, n, g, f0 = 2500) => { for (let k = 0; k < n; k++) CRK.push({ t: t0 + R0() * (t1 - t0), d: 0.02 + R0() * 0.06, f: f0 + R0() * 4000, g: g * (0.5 + R0()), pan: R0() * 1.8 - 0.9, fl: new SVF() }); };
  addCrk(V_FROST - 0.6, V_FROST + 1.5, 70, 0.02); addCrk(V_FOUNT - 0.05, V_FOUNT + 0.8, 60, 0.03, 3500); addCrk(V_STILL - 0.05, V_STILL + 1.2, 90, 0.028);
  addCrk(V_CO2, V_RAIN, 60, 0.012, 5000); addCrk(V_SNOW, V_SNOW + 2, 50, 0.016); addCrk(V_CRACK, V_FALL + 3, 80, 0.02, 1800);
  addCrk(V_LENS - 0.3, V_ZERO, 260, 0.022, 3000);
  // the sea ice singing: long falling "zings" after the boom
  const ZINGS = Array.from({ length: 7 }, (_, i) => ({ t: V_SEA + 0.25 + i * 0.32 + R0() * 0.2, f: 1900 + R0() * 1600, d: 0.7 + R0() * 0.6, g: 0.035 + 0.02 * R0(), pan: R0() * 1.4 - 0.7, ph: 0 }));
  // the glass coming off the towers: a wash of soft high bursts
  const GLASS = Array.from({ length: 140 }, () => ({ t: V_CRACK + 0.3 + R0() * 8.2, d: 0.05 + R0() * 0.14, f: 2400 + R0() * 4000, g: 0.006 + 0.01 * R0(), pan: R0() * 1.6 - 0.8, fl: new SVF() }));
  // the fountain ringing as it freezes: glass-like partials
  const BELL = [1318, 1975, 2637, 3520, 4186].map((f, i) => ({ f, g: 0.03 / (1 + i * 0.5), d: 1.2 + 0.6 * R0(), ph: 0 }));
  const CHORDS = [[-9, [110, 130.8, 164.8]], [V_STILL, [98, 116.5, 146.8]], [V_RAIN, [87.3, 110, 130.8]], [V_BLACK, [73.4, 87.3, 110]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const windF = [new SVF(), new SVF(), new SVF()], windLP = new OnePole(90), cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const engLP = new OnePole(160), rainF = [new SVF(), new SVF()], boilF = new SVF(), dustF = new SVF(), gustF = new SVF();
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(400), new OnePole(400)], shimF = [new SVF(), new SVF()];
  const groanF = new SVF(), riserF = new SVF(), crkGlass = new SVF();
  const revL = new Reverb(21), revR = new Reverb(22);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    // (the lead-in before frame 0 is played under the solid ice at the end, and crossfades into it)
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const street = 1 - smooth(V_STILL - 0.2, V_STILL + 0.4, v);          // the street's own sound, until everyone freezes
    const air = 1 - smooth(V_SNOW + 1, V_BLACK + 2, v);                   // sound needs air: it thins as the air goes

    // --- the sunny street: traffic, people talking ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    {
      const traffic = (0.22 - 0.1 * smooth(V_FROST, V_STALL, v)) * street;
      l += cityLP.run(brownL) * traffic; r += cityLP2.run(brownR) * traffic;
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = (1 - 0.5 * smooth(1, V_FROST, v)) * street;
      l += cv * 0.028 * talk; r += cv * 0.026 * talk;
    }
    // --- the engines: a low idle that coughs and dies at V_STALL ---
    {
      const g = 1 - smooth(V_STALL, V_STALL + 0.9, v);
      if (g > 0) {
        const cough = v > V_STALL - 0.6 ? 0.5 + 0.5 * Math.sin(v * 23) * Math.sin(v * 7) : 1;
        ph[1] += (38 * (1 - 0.4 * smooth(V_STALL, V_STALL + 0.9, v))) / SR;
        const ev = engLP.run(saw(ph[1]) * cough) * 0.12 * g;
        dl += ev; dr += ev * 0.9;
      }
    }
    // --- the frost wall: an icy roar coming up the street, a rush of crystals as it passes you ---
    {
      const near = smooth(-1.5, V_FROST - 0.1, v);
      const g = (0.25 + 0.75 * near * near) * (1 - smooth(V_FROST, V_FROST + 1.4, v));
      if (g > 0) {
        const w = white();
        const fc = 380 + 900 * near;
        const wv = (windF[0].run(w, fc, 0.5).bp + windF[1].run(w, fc * 2.3, 0.6).bp * 0.5 + windLP.run(white()) * 1.2) * 0.2 * g;
        l += wv; r += windF[2].run(w, fc * 1.15, 0.5).bp * 0.2 * g + windLP.y * 1.2 * 0.2 * g; wet += wv * 0.3;
      }
      const k = smooth(V_FROST - 0.5, V_FROST, v) * (1 - smooth(V_FROST, V_FROST + 0.8, v));
      if (k > 0) { const gv = gustF.run(white(), 2500 + 3000 * k, 0.4).bp * 0.16 * k; l += gv; r += gv; wet += gv * 0.5; }
    }
    // --- the owner's gasp ---
    if (GASP && n >= 0) {
      const i = Math.round((v - GASP_AT) * SR);
      if (i >= 0 && i < GASP.length) {
        const fade = Math.min(1, i / (0.01 * SR), (GASP.length - i) / (0.05 * SR));
        GA[n] = GASP[i] * fade;
      }
    }
    // --- pigeons taking off ---
    for (const b of WINGS) {
      const dt = v - b.t;
      if (dt > 0 && dt < b.d) {
        const fl = Math.pow(0.5 + 0.5 * Math.sin(dt * b.f * TAU), 2);
        const wv = b.fl.run(white(), 1500, 0.8).bp * fl * Math.sin(Math.PI * dt / b.d) * b.g * 2.2;
        l += wv * (1 - b.pan) * 0.5; r += wv * (1 + b.pan) * 0.5;
      }
    }
    // --- crackles ---
    for (const c of CRK) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        const e = smooth(0, 0.008, dt) * (1 - smooth(c.d - 0.012, c.d, dt));
        const cv = c.fl.run(white(), c.f, 0.5).bp * e * c.g * 2.5;
        l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5; wet += cv * 0.6;
      }
    }
    // --- the fountain: the splash, then its ring as it freezes ---
    {
      const sp = (1 - smooth(V_FOUNT - 0.1, V_FOUNT + 0.1, v)) * 0.05;
      if (sp > 0) { const sv = crkGlass.run(white(), 3000, 0.9).bp * sp; l += sv * 0.6; r += sv; }
      const dt = v - V_FOUNT;
      if (dt > -0.01 && dt < 3) for (const b of BELL) {
        b.ph += b.f / SR;
        const bv = Math.sin(TAU * b.ph) * env(dt + 0.01, 0.01, b.d) * b.g;
        l += bv * 0.7; r += bv; wet += bv * 1.2;
      }
    }
    // --- thuds (the birds hitting the street; the sea's boom; the tower's top into the bay) ---
    for (const c of THUDS) {
      const dt = v - c.t;
      if (dt < 0 || dt > 3) continue;
      c.ph += (c.f * (1 - 0.4 * Math.min(dt * 2, 1))) / SR;
      const tv = (Math.sin(TAU * c.ph) * 0.5 * Math.exp(-dt / (c.g > 0.5 ? 0.9 : 0.12)) + c.n.run(white(), c.g > 0.5 ? 300 : 900, 0.5).bp * 0.25 * Math.exp(-dt / (c.g > 0.5 ? 0.8 : 0.08))) * smooth(0, 0.012, dt) * c.g;
      l += tv * (1 - c.pan * 0.5); r += tv * (1 + c.pan * 0.5); wet += tv * 0.8;
    }
    // --- the air: dry ice fizzing down, the rain of liquid air, the pools boiling, then the hush of the snow ---
    {
      const dz = smooth(V_CO2 - 0.2, V_CO2 + 1, v) * (1 - smooth(V_RAIN - 0.5, V_RAIN + 0.5, v));
      if (dz > 0) { const dv = dustF.run(white(), 7000, 0.7).bp * 0.03 * dz; l += dv; r += dv * 0.9; wet += dv; }
      const rn = smooth(V_RAIN - 0.2, V_RAIN + 0.8, v) * (0.6 + 0.4 * smooth(V_POUR - 0.4, V_POUR + 0.5, v)) * (1 - smooth(V_SNOW - 0.4, V_SNOW + 0.6, v));
      if (rn > 0) {
        const w = white();
        const rv = (rainF[0].run(w, 4200, 0.7).bp + rainF[1].run(w, 1300, 0.8).bp * 0.6) * 0.12 * rn;
        l += rv; r += rv * 0.95; wet += rv * 0.3;
      }
      const bo = smooth(V_POUR - 0.5, V_POUR + 1.5, v) * (1 - smooth(V_SNOW, V_SNOW + 2, v));
      if (bo > 0) { const bv = boilF.run(white(), 900 + 300 * Math.sin(v * 17), 0.6).bp * 0.06 * bo * (0.6 + 0.4 * Math.sin(v * 41) * Math.sin(v * 13)); l += bv * 0.9; r += bv; }
    }
    // --- the sea ice: a deep boom, then it sings ---
    for (const z of ZINGS) {
      const dt = v - z.t;
      if (dt > 0 && dt < z.d) {
        z.ph += z.f * (1 - 0.55 * dt / z.d) / SR;
        const zv = Math.sin(TAU * z.ph) * env(dt, 0.01, z.d * 0.35) * z.g;
        l += zv * (1 - z.pan) * 0.5; r += zv * (1 + z.pan) * 0.5; wet += zv * 1.5;
      }
    }
    // --- the towers: groans as the steel strains, then the glass ---
    {
      const g = smooth(V_CRACK - 0.1, V_CRACK + 0.6, v) * (1 - smooth(V_FALL + 4, V_LENS + 1, v));
      if (g > 0) {
        ph[20] += (46 + 9 * Math.sin(v * 1.7) + 6 * Math.sin(v * 4.3)) / SR;
        const gv = groanF.run(saw(ph[20]), 300 + 200 * Math.sin(v * 2.1), 0.3).bp * 0.09 * g;
        dl += gv; dr += gv * 0.9; wet += gv * 0.8;
      }
    }
    for (const q of GLASS) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const e = smooth(0, 0.012, dt) * (1 - smooth(q.d - 0.03, q.d, dt));
        const gv = q.fl.run(white(), q.f, 0.6).bp * e * q.g;
        l += gv * (1 - q.pan) * 0.5; r += gv * (1 + q.pan) * 0.5; wet += gv * 0.8;
      }
    }
    // --- the lens freezing over: a riser into the last hit ---
    {
      const k = smooth(V_LENS, V_ZERO, v) * (1 - smooth(V_ZERO - 0.02, V_ZERO + 0.06, v));
      if (k > 0) { const rv = riserF.run(white(), 300 + 4200 * k * k, 0.35).bp * k * k * 0.12; dl += rv; dr += rv; wet += rv * 0.5; }
    }
    // --- the steps ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, (0.8 + 0.8 * h.k) * (h.deep ? 1.6 : 1)) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.006 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, (0.7 + 0.4 * h.k) * (h.deep ? 2 : 1)) * h.k;
      }
      const bf = braamLP.run(braam, 1300, 0.6).lp * 0.1;
      const sv = subLP.run(sub) * 0.5 + sub * 0.25;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the cold: a glassy shimmer from the frost on, thinning to one high tone as the air goes ---
    {
      const g = smooth(V_FROST - 0.5, V_FROST + 2, v) * (1 - smooth(V_ZERO - 0.05, V_ZERO + 0.3, v));
      if (g > 0) {
        const w = white();
        const sv = (shimF[0].run(w, 5600 + 1200 * Math.sin(v * 0.8), 0.92).bp + shimF[1].run(w, 8200, 0.95).bp * 0.6) * 0.014 * g * air * (0.7 + 0.3 * Math.sin(v * 6));
        ph[22] += 1760 / SR; ph[23] += 1764 / SR;
        const tone = (Math.sin(TAU * ph[22]) + Math.sin(TAU * ph[23])) * 0.006 * g * smooth(V_SNOW, V_BLACK + 1, v);
        l += sv * 0.8 + tone; r += sv + tone; wet += (sv + tone) * 1.5;
      }
    }
    // --- the drone: cold minor chords, darkening ---
    {
      const ch = chordAt(v);
      const dg = (0.03 + 0.03 * smooth(6, 14, v) + 0.04 * smooth(24, 40, v)) * (1 - smooth(V_ZERO + 0.2, T_SWITCH, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const cutf = 300 + 500 * smooth(20, 42, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }
  {   // under the solid ice the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.34 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.4); R[n] = Math.tanh(R[n] * 1.4);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const gn = 0.89 / peak;
  // the gasp, set to GASP_DB (RMS over the clip) in the finished mix
  if (GASP) {
    let s2 = 0, c = 0;
    for (let n = 0; n < N; n++) if (GA[n] !== 0) { s2 += GA[n] * GA[n]; c++; }
    const rms = Math.sqrt(s2 / Math.max(c, 1)), gg = Math.pow(10, GASP_DB / 20) / Math.max(rms, 1e-9);
    for (let n = 0; n < N; n++) if (GA[n] !== 0) { const s = GA[n] * gg / gn; L[n] += s * 0.95; R[n] += s; }
    console.log(`audio: gasp at ${GASP_DB} dB RMS`);
  }
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    buf.writeInt16LE(Math.round(clamp(L[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
