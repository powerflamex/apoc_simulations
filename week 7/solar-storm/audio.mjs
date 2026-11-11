// Procedural soundtrack for "What if the biggest solar storm ever hit tonight?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a busy street at night (traffic, a crowd talking, the electric hum of every sign and lamp) under an
// eerie music bed for the aurora (a dark minor drone and a high shimmer that rises with it). A whine climbs to the hit;
// the lights flicker (the hum stutters, 0:02.7). 0:05 the hit: a deep hit, a zap for every sign and lamp as it dies,
// and then the hum is simply gone; the owner's scream. The transformer buzzes louder and louder and bangs (0:07.5),
// sizzles, and arcs crackle away along the wires; the owner's gasp. The crash at the dead crossing (0:14.2): a crunch,
// glass, then horns. The phone's no-service tone (0:18). Footsteps and voices out of the subway (0:22). A low rumble
// as the satellites come down (0:26). The skyline goes dark (0:29): a deep power-down groan and the owner's "oh my god".
// A long riser into the white (0:42-0:46), cut, and in the white the soundtrack turns into the lead-in of frame 0 so the
// loop has no seam. Every onset is soft (5 ms+): no clacks. The master level is set from the opening second (-25 dB).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_FLICK, V_HIT, V_XF, V_LINES, V_BUMP, V_PHONE, V_SUBWAY, V_SATS, V_SKYLINE, V_FULL, V_FLARE, V_WHITE, aurora } from './src/timeline.js';
import { FLASHES, RUNNERS } from './src/power.js';
import { CAM_X } from './src/layout.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_OPENING_DB = -25;
const SCREAM_AT = V_HIT + 0.02, SCREAM_LEN = 1.7, SCREAM_DB = -14.5, GASP_AT = V_XF + 0.25, GASP_DB = -15, OMG_AT = V_SKYLINE + 0.9, OMG_DB = -17;

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.7)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
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
  const raw = r.stdout;
  console.log(`audio: sounds/${name}`);
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

// the street's electric hum (signs, lamps, transformers): on until the hit, stuttering at the flicker
function humAt(v) {
  if (v >= V_HIT + 0.08) return 0;
  const t = v - V_FLICK;
  let k = 1;
  if (t > 0 && t < 0.5) k = 1 - 0.85 * (smooth(0, 0.03, t) * (1 - smooth(0.09, 0.13, t))) - 0.6 * (smooth(0.24, 0.27, t) * (1 - smooth(0.3, 0.36, t)));
  return k * (1 + 0.6 * smooth(V_HIT - 2, V_HIT, v)) * (1 - smooth(V_HIT, V_HIT + 0.08, v));
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(1859);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const SCREAM = loadClip(DIR, 'scream.mp3'), GASP = loadClip(DIR, 'gasp.mp3'), OMG = loadClip(DIR, 'omg.mp3');
  const CL = new Float32Array(N), CR = new Float32Array(N);

  // zaps: every sign, screen and lamp as it dies (near ones louder), the insulators flashing over as the arcs pass
  const ZAPS = FLASHES.map((f) => { const d = Math.hypot(f.x - CAM_X, f.z - 5); return { t: f.t, g: clamp(6 / (d + 4), 0.03, 0.9) * f.k, pan: clamp((f.x - CAM_X) / 25, -0.8, 0.8), fl: new SVF(), f: 1800 + R0() * 2400, d: 0.05 + R0() * 0.06 }; });
  // crunch, glass, thuds
  const CRUNCH = [], GLASS = [], THUDS = [];
  const addCrunch = (t, g, n = 14, spread = 0.35, pan = 0) => { for (let k = 0; k < n; k++) CRUNCH.push({ t: t + Math.pow(R0(), 1.6) * spread, d: 0.06 + R0() * 0.16, f: 300 + R0() * 1500, g: g * (0.4 + R0() * 0.8), pan: pan + (R0() - 0.5) * 0.4, fl: new SVF() }); };
  const addGlass = (t, g, n = 50, spread = 0.9, pan = 0) => { for (let k = 0; k < n; k++) GLASS.push({ t: t + Math.pow(R0(), 1.4) * spread, d: 0.04 + R0() * 0.12, f: 2800 + R0() * 5000, g: g * (0.4 + R0() * 0.8), pan: pan + (R0() - 0.5) * 0.6, fl: new SVF() }); };
  const addThud = (t, g, f = 45, pan = 0, dec = 0.5) => THUDS.push({ t, g, f, pan, dec, n: new SVF(), ph: 0 });
  addCrunch(V_BUMP, 0.2, 20, 0.35, -0.35); addGlass(V_BUMP + 0.02, 0.025, 50, 0.6, -0.35); addThud(V_BUMP, 0.28, 50, -0.35, 0.35);
  addThud(V_XF, 0.3, 38, -0.2, 0.6);                                         // the transformer's bang
  // horns after the crash (each a soft-edged two-note chord), a car alarm
  const HORNS = [[V_BUMP + 0.5, 1.1, 392, -0.35], [V_BUMP + 1.9, 0.5, 440, -0.2], [V_BUMP + 2.6, 0.7, 415, 0.3], [V_BUMP + 3.6, 1.4, 370, -0.45], [V_BUMP + 6.0, 0.6, 440, 0.2], [V_SUBWAY + 4.2, 0.9, 392, -0.5], [V_FULL + 2.2, 0.7, 415, -0.3], [V_FULL + 5.5, 1.0, 370, 0.4]]
    .map(([t, d, f, pan]) => ({ t, d, f, pan, ph: 0, ph2: 0, lp: new OnePole(2200) }));
  const ALARM = { t: V_BUMP + 0.45, a: 760, b: 1010, pan: -0.4, g: 0.008, ph: 0, lp: new OnePole(2400) };
  // footsteps out of the subway
  const STEPS = [];
  for (let k = 0; k < 90; k++) STEPS.push({ t: V_SUBWAY - 0.6 + k * 0.11 + R0() * 0.05, g: 0.05 + R0() * 0.05, pan: 0.45 + R0() * 0.3, f: new SVF(), fr: 700 + R0() * 500 });
  const HITS = BEATS.map((t, n) => ({ t, k: [0.42, 0.3, 0.4, 0.3, 0.35, 0.4, 0.6, 0.55][n] ?? 0.4, root: [41, 46, 49, 52, 49, 46, 39, 44][n] ?? 46 }));

  const trafLP = new OnePole(160), crowdF = [new SVF(), new SVF(), new SVF()], crowdE = [new OnePole(1.5), new OnePole(2.2), new OnePole(1.1)];
  const crE = new OnePole(70), humF = new OnePole(900), whineF = new SVF(), xfBuzzF = new OnePole(1500), sizF = [new SVF(), new SVF()], arcF = new SVF(), rumbleF = new OnePole(90), satF = new SVF();
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(380), new OnePole(380)], riserF = new SVF(), shimLP = new OnePole(5000);
  const revL = new Reverb(41), revR = new Reverb(42);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  const clipGain = (clip, db) => {
    if (!clip) return 0;
    let s = 0, c = 0;
    for (let i = 0; i < clip.length; i++) { const x = clip[i]; if (Math.abs(x) > 0.02) { s += x * x; c++; } }
    return Math.pow(10, db / 20) / Math.max(Math.sqrt(s / Math.max(c, 1)), 1e-9);
  };
  const gS = clipGain(SCREAM, SCREAM_DB), gG = clipGain(GASP, GASP_DB), gO = clipGain(OMG, OMG_DB);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0;
    const put = (x, pan, w = 0.3) => { l += x * (1 - pan) * 0.5 * 1.4; r += x * (1 + pan) * 0.5 * 1.4; wet += x * w; };
    // --- the street: traffic (quieter once everyone slows), a crowd talking (a rush of voices at the hit) ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    {
      const tr = 0.14 * (1 - 0.45 * smooth(V_HIT, V_HIT + 4, v));
      l += trafLP.run(brownL) * tr; r += trafLP.y * 0.35 * tr + brownR * 0.004;
      const crowd = 0.5 + 0.25 * smooth(V_HIT, V_HIT + 0.6, v) * (1 - 0.5 * smooth(V_HIT + 3, V_HIT + 8, v)) + 0.35 * smooth(V_SUBWAY - 0.5, V_SUBWAY + 1, v) * (1 - smooth(V_SUBWAY + 5, V_SUBWAY + 9, v)) + 0.2 * smooth(V_SKYLINE, V_SKYLINE + 1, v) - 0.3 * smooth(V_FLARE, V_WHITE, v);
      let c = 0;
      for (let q = 0; q < 3; q++) {
        const e = crowdE[q].run(0.5 + 0.5 * Math.sin(v * (3.1 + q * 1.7) + q * 2.1) + white() * 0.3);
        c += crowdF[q].run(white(), 600 + q * 420 + 120 * Math.sin(v * (0.9 + q * 0.5)), 0.6).bp * e;
      }
      put(c * 0.045 * crowd, 0.1 * Math.sin(v * 0.3), 0.5);
    }
    // --- the hum of the city's electrics: 60 Hz and its harmonics, buzzy; gone at the hit ---
    {
      const hk = humAt(v);
      if (hk > 0.001) {
        ph[0] += 60 / SR;
        const x = (Math.sin(TAU * ph[0]) * 0.5 + Math.sin(TAU * ph[0] * 2) * 0.35 + saw(ph[0] * 3) * 0.12 + saw(ph[0] * 5) * 0.06) * hk;
        const y = humF.run(x) * 0.03;
        l += y; r += y * 0.92;
      }
      // a thin whine that climbs as the storm comes in (0-5 s), stops at the hit
      const wk = smooth(-1, V_HIT - 0.2, v) * (1 - smooth(V_HIT, V_HIT + 0.05, v));
      if (wk > 0.001) { ph[1] += (900 + 2600 * wk * wk) / SR; const x = Math.sin(TAU * ph[1]) * 0.006 * wk * wk; put(x, 0.2, 0.6); }
    }
    // --- zaps as each lit thing dies ---
    for (const z of ZAPS) {
      const dt = v - z.t;
      if (dt < 0 || dt > z.d + 0.05) continue;
      const e = smooth(0, 0.005, dt) * (1 - smooth(z.d * 0.4, z.d, dt)) * (0.6 + 0.4 * Math.sin(dt * 900));
      put(z.fl.run(white(), z.f, 0.3).bp * e * z.g * 0.25, z.pan, 0.5);
    }
    // --- the transformer: a buzz louder and louder, the bang, sizzle, then arcs crackling away along the wires ---
    {
      const bz = smooth(V_XF - 1.0, V_XF, v) * (1 - smooth(V_XF, V_XF + 0.03, v));
      if (bz > 0.001) { ph[2] += 120 / SR; const x = xfBuzzF.run(Math.tanh(saw(ph[2]) * 4 + white() * 0.6 * bz)) * 0.035 * bz * bz; put(x, -0.2, 0.3); }
      const b = v - V_XF;
      if (b > 0 && b < 3) {
        const crack = env(b, 0.005, 0.12) * 0.7 + 0.35 * Math.exp(-b / 0.9) * (0.5 + 0.5 * Math.tanh(Math.sin(v * 37) * Math.sin(v * 53) * 6));
        put((sizF[0].run(white(), 2600, 0.4).bp * 0.6 + sizF[1].run(white(), 700, 0.5).bp * 0.5) * crack * 0.16, -0.2, 0.5);
      }
      // the arcs on the wires: crackling hiss that moves off up the street
      let ak = 0;
      for (const rr of RUNNERS) { const t = v - rr[0]; if (t > 0 && t < 3.2) ak += Math.exp(-t / 1.4) * smooth(0, 0.05, t); }
      if (ak > 0.001) { const cr = 0.25 + 0.75 * crE.run(R0() < 0.04 ? 1 : 0); put(arcF.run(white(), 3200, 0.5).bp * ak * cr * 0.22, -0.3 + 0.2 * Math.sin(v * 0.8), 0.6); }
    }
    // --- crunch, glass, thuds ---
    for (const c of CRUNCH) { const dt = v - c.t; if (dt < 0 || dt > c.d) continue; put(c.fl.run(white(), c.f, 0.35).bp * smooth(0, 0.01, dt) * (1 - smooth(c.d * 0.5, c.d, dt)) * c.g * 0.9, c.pan, 0.4); }
    for (const c of GLASS) { const dt = v - c.t; if (dt < 0 || dt > c.d) continue; put(c.fl.run(white(), c.f, 0.5).bp * smooth(0, 0.008, dt) * (1 - smooth(c.d * 0.4, c.d, dt)) * c.g, c.pan, 0.6); }
    for (const c of THUDS) {
      const dt = v - c.t;
      if (dt < -0.01 || dt > 3) continue;
      c.ph += c.f * (1 - 0.4 * Math.min(dt * 2, 1)) / SR;
      put((Math.sin(TAU * c.ph) * Math.exp(-dt / c.dec) * 0.7 + c.n.run(white(), 260, 0.5).bp * Math.exp(-dt / 0.12) * 0.5) * smooth(-0.01, 0.01, dt) * c.g, c.pan, 0.5);
    }
    // --- horns and the alarm ---
    for (const h of HORNS) {
      const dt = v - h.t;
      if (dt < 0 || dt > h.d + 0.1) continue;
      h.ph += h.f / SR; h.ph2 += h.f * 1.26 / SR;
      const e = smooth(0, 0.03, dt) * (1 - smooth(h.d, h.d + 0.08, dt));
      put(h.lp.run(Math.tanh((saw(h.ph) + saw(h.ph2)) * 1.5)) * e * 0.022, h.pan, 0.5);
    }
    {
      const dt = v - ALARM.t;
      if (dt > 0) { const f = Math.sin(TAU * 1.6 * dt) > 0 ? ALARM.a : ALARM.b; ALARM.ph += f / SR; put(ALARM.lp.run(Math.tanh(Math.sin(TAU * ALARM.ph) * 3)) * ALARM.g * smooth(0, 0.05, dt) * (1 - 0.6 * smooth(V_FULL, V_WHITE, v)), ALARM.pan, 0.5); }
    }
    // --- your phone: no service (two soft falling notes) ---
    for (const [t0, f] of [[V_PHONE + 0.1, 880], [V_PHONE + 0.3, 660]]) {
      const dt = v - t0;
      if (dt > 0 && dt < 0.5) { const x = Math.sin(TAU * f * dt) * env(dt, 0.008, 0.12) * 0.05; l += x; r += x; wet += x * 0.3; }
    }
    // --- footsteps out of the subway ---
    for (const s of STEPS) { const dt = v - s.t; if (dt < 0 || dt > 0.08) continue; put(s.f.run(white(), s.fr, 0.6).bp * smooth(0, 0.006, dt) * Math.exp(-dt / 0.025) * s.g, s.pan, 0.4); }
    // --- the satellites: a far rumble and a hiss ---
    {
      const k = smooth(V_SATS - 0.3, V_SATS + 0.8, v) * (1 - smooth(V_SATS + 3.2, V_SATS + 4.5, v));
      if (k > 0.001) { const x = rumbleF.run(brownL) * 0.5 * k + satF.run(white(), 1800 + 900 * Math.sin(v * 0.9), 0.7).bp * 0.025 * k; put(x, -0.3 + 0.5 * smooth(V_SATS, V_SATS + 3, v), 0.7); }
    }
    // --- the skyline: a deep power-down groan ---
    {
      const t = v - V_SKYLINE - 0.4;
      if (t > 0 && t < 3.2) { ph[3] += (95 * Math.exp(-t / 1.1) + 28) / SR; const x = (saw(ph[3]) * 0.6 + Math.sin(TAU * ph[3] * 0.5)) * env(t, 0.15, 1.3) * 0.08; put(x, 0, 0.5); }
    }
    // --- the music: hits on the beats, a dark drone, a shimmer that follows the aurora, the riser to the white ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 4) continue;
        const e = env(dt + 0.02, 0.025, 0.9 + 0.6 * h.k) * h.k * (1 - smooth(2.8, 4, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.007 / SR; ph[12] += hf * 2 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12])) * e;
        ph[14] += (30 + 35 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.015, 0.6 + 0.3 * h.k) * h.k;
      }
      const bf = braamLP.run(braam, 900, 0.6).lp * 0.07;
      const sv = subLP.run(sub) * 0.35 + sub * 0.15;
      l += bf + sv; r += bf * 0.97 + sv; wet += bf * 0.5;
      const dg = (0.022 + 0.012 * smooth(V_HIT, V_HIT + 3, v) + 0.02 * smooth(V_FULL, V_FLARE, v)) * (1 - smooth(V_WHITE, T_SWITCH, v));
      let a = 0, b = 0;
      [55, 65.4, 82.4].forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.005 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      l += xl; r += xr; wet += (xl + xr) * 0.4;
      // the shimmer: a slow-moving cluster of high tones (A minor add 9), swelling with the aurora
      const sk = 0.004 * Math.min(aurora(v), 3) * (1 - smooth(V_WHITE, T_SWITCH, v));
      let sh = 0;
      [880, 1046.5, 1318.5, 1975.5, 2349.3].forEach((f, q) => { ph[50 + q] += f * (1 + 0.002 * Math.sin(v * (0.3 + q * 0.17))) / SR; sh += Math.sin(TAU * ph[50 + q]) * (0.5 + 0.5 * Math.sin(v * (0.7 + q * 0.31) + q)); });
      const sx = shimLP.run(sh) * sk;
      l += sx * (1 + 0.3 * Math.sin(v * 0.5)); r += sx * (1 - 0.3 * Math.sin(v * 0.5)); wet += sx * 1.2;
      const k = smooth(V_FLARE, V_WHITE, v) * (1 - smooth(V_WHITE, V_WHITE + 0.12, v));
      if (k > 0.001) { const rv = riserF.run(white(), 300 + 4200 * k * k, 0.35).bp * k * k * 0.12; l += rv; r += rv; wet += rv * 0.5; ph[60] += (110 * (1 + 2 * k * k)) / SR; const p = saw(ph[60]) * k * k * 0.04; l += p; r += p; }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.7, outR = r + rr * 0.7;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
    if (n >= 0) {
      const clip = (C, at, g, kl, kr, len = 1e9) => { if (!C) return; const i = Math.round((v - at) * SR), L2 = Math.min(C.length, Math.round(len * SR)); if (i >= 0 && i < L2) { const f = Math.min(1, i / (0.01 * SR), (L2 - i) / (0.35 * SR)); CL[n] += C[i] * f * g * kl; CR[n] += C[i] * f * g * kr; } };
      clip(SCREAM, SCREAM_AT, gS, 0.85, 1, SCREAM_LEN); clip(GASP, GASP_AT, gG, 1, 0.9); clip(OMG, OMG_AT, gO, 0.95, 1);
    }
  }
  {   // in the white, the soundtrack turns into the lead-in to the first frame
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
    const v = n / SR;
    const a = out(L[n], gn) + CL[n], b = out(R[n], gn) + CR[n];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  console.log(`audio: master gain ${gn.toFixed(3)} (opening at ${TARGET_OPENING_DB} dB)`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
