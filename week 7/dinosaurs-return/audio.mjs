// Procedural soundtrack for "What if dinosaurs came back?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a city street in a panic (traffic idling, a crowd's roar, car alarms once things start getting crushed)
// and over it the T. rex: a roar down the street on frame 0 (nobody knows what one sounded like: this one is made up, a
// deep growling bellow with a rumble you'd feel), a heavy thud for every footstep (louder as it comes closer), steel
// crumpling and glass bursting under its foot at 0:06, a roar at you at 0:09, the car it bites creaking, whooshing through
// the air and crashing down. The owner's scream as the ground shakes at 0:03 (sounds/scream.mp3, set near the footsteps'
// level, not above). Wingbeats overhead (0:15), a stampede of hooves with low bellows (0:17), a rush of water, a crash
// and a wash of spray in the harbour (0:23), a far, low call from the Brachiosaurus (0:26), steel scraping (0:30), a whoosh
// as you turn, the second one's roar and the owner's gasp (0:33), its breathing close to you, sniffs, a growl, your
// heartbeat, and the last roar into the lens as everything goes white. Under it all a deep hit on each 3 s beat and a dark
// drone. The loop: in the white the soundtrack turns into the lead-in of the first frame (the far roar starting), so the
// sound runs on across the seam. Every onset is soft (8 ms+): no clacks. The master level is set from the opening second
// (-25 dB), not by the loudest moment.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_STOMP, V_CRUSH, V_ROAR, V_TOSS, V_QUETZ, V_HERD, V_SEA, V_BRACH, V_SHOVE, V_TWO, V_SEES, V_SNIFF, V_JAWS, V_LUNGE, V_WHITE } from './src/timeline.js';
import { PRINTS } from './src/rex.js';
import { HERD, herdAt, HERD_SP } from './src/herd.js';
import { makeGait } from './src/loft.js';
import { CAM0, TARGET_BOAT } from './src/layout.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_OPENING_DB = -25;
const TOSS_LAND = V_TOSS + 0.66 + 1.22;          // the thrown car hits the street (traffic.js logs this flight time)
const SCREAM_AT = V_STOMP - 0.15, SCREAM_DB = -27, GASP_AT = V_TWO + 0.45, GASP_DB = -26;

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

// ---- a roar: a growling voice (pulses at f0 with a subharmonic and a rough flutter) through a big animal's formants,
//      with breath noise, a felt rumble underneath, then saturated. Each one has its own phases and filters. ----
function makeRoar({ t0, dur, f0 = 62, gain = 1, pan = 0, far = 0, seed = 1, shape = 'roar' }) {
  const R = rng(seed);
  const F = [new SVF(), new SVF(), new SVF(), new SVF()], N = [new SVF(), new SVF()], lp = new OnePole(far ? 1400 : 5200), sub = new OnePole(70);
  let ph = 0, ph2 = 0, ph3 = 0, jit = 0, fl = 0;
  return {
    t0, end: t0 + dur + 0.6,
    run(v, white) {
      const t = v - t0;
      if (t < 0 || t > dur + 0.6) return 0;
      const u = t / dur;
      const a = smooth(0, 0.22, t) * (1 - smooth(dur - 0.15, dur + 0.55, t));
      // pitch: rises into the bellow, sags, drops at the end
      const f = f0 * (shape === 'growl' ? 1 + 0.06 * Math.sin(t * 3.1) : 1 + 0.32 * Math.sin(Math.PI * Math.min(u * 1.2, 1)) - 0.18 * smooth(0.75, 1, u));
      jit += (white() * 0.5 - jit) * 0.002;
      ph += f * (1 + 0.04 * jit) / SR; ph2 += f * 0.5 / SR; ph3 += 27 / SR;
      // the flutter (a rattle in the throat), irregular
      fl = 0.55 + 0.45 * Math.sin(TAU * (23 + 6 * Math.sin(t * 1.7)) * t + 2 * Math.sin(t * 5.3));
      let src = saw(ph) * 0.8 + saw(ph * 2.01) * 0.25 + Math.sin(TAU * ph2) * 0.55 * (0.6 + 0.4 * Math.sin(t * 2.3));
      src *= 0.4 + 0.6 * fl;
      const br = white();
      const open = shape === 'growl' ? 0.35 : 0.6 + 0.4 * Math.sin(Math.PI * Math.min(u * 1.3, 1));
      let y = F[0].run(src, 380 + 140 * open, 0.55).bp * 1.2
        + F[1].run(src, 820 + 380 * open, 0.5).bp * 0.9
        + F[2].run(src + br * 0.4, 1900 + 500 * open, 0.45).bp * 0.55 * open
        + F[3].run(br, 3100, 0.6).bp * 0.18 * open
        + N[0].run(br, 650 + 300 * open, 0.35).bp * 0.35 * fl;
      y = Math.tanh(y * 2.2) * 0.6;
      y = lp.run(y);
      // the rumble you feel, under it
      y += sub.run(Math.sin(TAU * ph3) * (0.6 + 0.4 * fl)) * 0.9 + N[1].run(br, 90, 0.7).bp * 0.4 * fl;
      return y * a * gain;
    },
    pan,
  };
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const SCREAM = loadClip(DIR, 'scream.mp3'), GASP = loadClip(DIR, 'gasp.mp3');
  const CL = new Float32Array(N), CR = new Float32Array(N);      // the owner's clips alone (levels set at the end)

  // ---- roars ----
  const ROARS = [
    makeRoar({ t0: -1.05, dur: 2.5, f0: 66, gain: 0.55, pan: -0.15, far: 1, seed: 3 }),
    makeRoar({ t0: V_ROAR - 0.2, dur: 2.0, f0: 60, gain: 1.0, pan: -0.05, far: 0, seed: 7 }),
    makeRoar({ t0: V_TWO + 0.4, dur: 1.9, f0: 70, gain: 0.85, pan: -0.5, far: 0, seed: 11 }),
    makeRoar({ t0: V_SEES - 0.3, dur: 2.8, f0: 44, gain: 0.45, pan: 0, far: 0, seed: 13, shape: 'growl' }),
    makeRoar({ t0: V_JAWS - 0.1, dur: 2.0, f0: 48, gain: 0.6, pan: 0, far: 0, seed: 17, shape: 'growl' }),
    makeRoar({ t0: V_LUNGE + 0.22, dur: 1.25, f0: 58, gain: 1.6, pan: 0, far: 0, seed: 19 }),
  ];
  // ---- footsteps: every T. rex foot-down (both of them), louder as they come closer ----
  const STEPS = PRINTS.map((p) => {
    const d = Math.hypot(p.x - CAM0.x, p.z - CAM0.z);
    return { t: p.t, g: clamp(7 / (d + 2), 0.04, 1.4), pan: clamp((p.x - CAM0.x) / 25, -0.7, 0.7), d, f: new SVF(), f2: new SVF(), ph: 0 };
  });
  STEPS.push({ t: V_CRUSH, g: 0.25, pan: 0, d: 30, f: new SVF(), f2: new SVF(), ph: 0 });
  // ---- the herd's hooves: every foot-down of every Triceratops ----
  const HOOF = [];
  {
    const gait = makeGait({ speedAt: () => HERD_SP, C: 4.6, vFull: 8, minStep: 0.5 });
    for (const h of HERD) for (const off of [0, 0.5, 0.5, 0]) {
      for (let n = Math.floor(gait.gAt(15) + off); n < gait.gAt(26) + off; n++) {
        const t = gait.vOf(n - off), q = herdAt(h, t);
        if (q.s < 0 || q.x < -45) continue;
        const d = Math.hypot(q.x - CAM0.x, q.z - CAM0.z);
        HOOF.push({ t, g: clamp(3.2 / (d + 3), 0.02, 0.6), pan: clamp((q.x - CAM0.x) / 15, -0.85, 0.85), f: new SVF(), ph: 0, fr: 48 + R0() * 18 });
      }
    }
  }
  // ---- impacts: crunch (soft-edged noise in the low mids), glass (a wash of high bursts), a thud ----
  const CRUNCH = [];
  const addCrunch = (t, g, n = 14, spread = 0.35, pan = 0) => { for (let k = 0; k < n; k++) CRUNCH.push({ t: t + Math.pow(R0(), 1.6) * spread, d: 0.06 + R0() * 0.16, f: 300 + R0() * 1500, g: g * (0.4 + R0() * 0.8), pan: pan + (R0() - 0.5) * 0.4, fl: new SVF() }); };
  const GLASS = [];
  const addGlass = (t, g, n = 50, spread = 0.9, pan = 0) => { for (let k = 0; k < n; k++) GLASS.push({ t: t + Math.pow(R0(), 1.4) * spread, d: 0.04 + R0() * 0.12, f: 2800 + R0() * 5000, g: g * (0.4 + R0() * 0.8), pan: pan + (R0() - 0.5) * 0.6, fl: new SVF() }); };
  const THUDS = [];
  const addThud = (t, g, f = 45, pan = 0, dec = 0.5) => THUDS.push({ t, g, f, pan, dec, n: new SVF(), ph: 0 });
  addCrunch(V_CRUSH - 0.04, 0.5, 22, 0.4, 0.1); addGlass(V_CRUSH, 0.05, 60, 0.7, 0.1); addThud(V_CRUSH, 0.8, 40, 0.1);
  addCrunch(V_TOSS + 0.3, 0.25, 8, 0.3, 0.1);                                   // the bite
  addCrunch(TOSS_LAND, 0.55, 22, 0.35, -0.3); addGlass(TOSS_LAND + 0.02, 0.05, 50, 0.6, -0.3); addThud(TOSS_LAND, 0.9, 42, -0.3);
  addCrunch(TOSS_LAND + 0.42, 0.3, 10, 0.25, -0.35); addThud(TOSS_LAND + 0.42, 0.35, 50, -0.35, 0.3);
  addCrunch(TOSS_LAND + 0.84, 0.18, 6, 0.2, -0.35);
  addCrunch(V_SHOVE, 0.4, 16, 0.6, 0.3); addThud(V_SHOVE, 0.5, 48, 0.3, 0.35);
  // the harbour: a rush of water as it breaks the surface; the crash on the boat (fibreglass crunching, a boom)
  const M_T0 = V_SEA - 0.14, M_T1 = V_SEA + 1.15;
  const bpan = clamp((TARGET_BOAT.x - CAM0.x) / 60, -0.8, 0.8);
  addCrunch(M_T1, 0.35, 14, 0.4, bpan * 0.6); addThud(M_T1, 0.9, 36, bpan * 0.5, 0.8);
  // car alarms: start when the ground starts shaking and when the cars get hit, each its own tone pair and pan
  const ALARMS = [[V_CRUSH + 0.3, 740, 980, 0.2, 0.012], [TOSS_LAND + 0.3, 690, 920, -0.4, 0.01], [V_STOMP + 0.1, 820, 1100, 0.55, 0.006], [V_SHOVE + 0.25, 760, 1010, 0.35, 0.012]].map(([t, a, b, pan, g]) => ({ t, a, b, pan, g, ph: 0, lp: new OnePole(2500) }));
  // whooshes: the car flying, the pterosaur overhead (two wingbeats), the turn
  const WHOOSH = [[V_TOSS + 0.66, 0.9, 0.06, -0.2], [V_QUETZ + 0.15, 0.7, 0.07, -0.3], [V_QUETZ + 0.8, 0.7, 0.09, -0.15], [V_QUETZ + 1.45, 0.9, 0.06, 0.1], [V_TWO - 0.2, 0.55, 0.05, 0]].map(([t, d, g, pan]) => ({ t, d, g, pan, f: new SVF() }));
  // the herd's low bellows, and the Brachiosaurus' far call
  const CALLS = [makeRoar({ t0: V_HERD - 0.1, dur: 0.9, f0: 95, gain: 0.28, pan: -0.5, far: 1, seed: 23, shape: 'growl' }), makeRoar({ t0: V_HERD + 1.3, dur: 0.8, f0: 105, gain: 0.25, pan: -0.2, far: 1, seed: 29, shape: 'growl' }),
    makeRoar({ t0: V_BRACH - 0.2, dur: 2.2, f0: 38, gain: 0.3, pan: -0.1, far: 1, seed: 31, shape: 'growl' })];
  // sniffs: three quick draws of breath through big nostrils, and a huff out
  const SNIFFS = [0, 0.32, 0.6, 1.25].map((o, k) => ({ t: V_SNIFF + 0.1 + o, d: k === 3 ? 0.55 : 0.22, out: k === 3, f: new SVF() }));
  // your heartbeat, faster as it comes
  const HEART = [];
  for (let t = V_SEES - 0.5; t < V_LUNGE; ) { HEART.push(t); t += 60 / (95 + 50 * smooth(V_SEES, V_LUNGE, t)); }

  const trafLP = new OnePole(180), crowdF = [new SVF(), new SVF(), new SVF()], crowdE = [new OnePole(1.5), new OnePole(2.2), new OnePole(1.1)];
  const waterF = [new SVF(), new SVF()], sprayF = new SVF(), scrapeF = new SVF();
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(300), new OnePole(300)], riserF = new SVF(), heartF = new OnePole(120);
  const revL = new Reverb(41), revR = new Reverb(42);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;
  const HITS = BEATS.map((t, n) => ({ t, k: clamp(0.3 + 0.045 * n, 0, 0.9), root: 49 * Math.pow(2, -Math.min(n, 12) / 24) }));

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0;
    const put = (x, pan, w = 0.3) => { l += x * (1 - pan) * 0.5 * 1.4; r += x * (1 + pan) * 0.5 * 1.4; wet += x * w; };
    // --- the street: idling traffic, a crowd's roar of panic that thins out as they run past and away ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    {
      const tr = 0.16 * (1 - 0.5 * smooth(28, 33, v));
      l += trafLP.run(brownL) * tr; r += trafLP.y * 0.3 * tr + brownR * 0.004;
      const crowd = (0.75 - 0.35 * smooth(8, 16, v)) * (1 - smooth(25, 31, v)) + 0.3 * smooth(16.8, 17.5, v) * (1 - smooth(20, 23, v));
      if (crowd > 0.001) {
        let c = 0;
        for (let q = 0; q < 3; q++) {
          const e = crowdE[q].run(0.5 + 0.5 * Math.sin(v * (3.1 + q * 1.7) + q * 2.1) + white() * 0.3);
          c += crowdF[q].run(white(), 700 + q * 450 + 120 * Math.sin(v * (0.9 + q * 0.5)), 0.6).bp * e;
        }
        put(c * 0.05 * crowd, 0.1 * Math.sin(v * 0.3), 0.5);
      }
    }
    // --- footsteps ---
    for (const s of STEPS) {
      const dt = v - s.t;
      if (dt < -0.01 || dt > 1.6) continue;
      s.ph += (s.d < 25 ? 34 : 42) * (1 - 0.35 * Math.min(dt * 3, 1)) / SR;
      const e = smooth(-0.01, 0.012, dt);
      const x = (Math.sin(TAU * s.ph) * Math.exp(-dt / 0.28) * 0.9 + s.f.run(white(), 140, 0.5).bp * Math.exp(-dt / 0.12) * 0.5 + s.f2.run(white(), 2600, 0.7).bp * 0.05 * smooth(0, 0.05, dt) * Math.exp(-dt / 0.35) * (s.d < 20 ? 1 : 0.3)) * e * s.g;
      put(x, s.pan, 0.25);
    }
    // --- hooves ---
    for (const h of HOOF) {
      const dt = v - h.t;
      if (dt < -0.01 || dt > 0.6) continue;
      h.ph += h.fr / SR;
      put((Math.sin(TAU * h.ph) * Math.exp(-dt / 0.09) + h.f.run(white(), 300, 0.6).bp * Math.exp(-dt / 0.05) * 0.7) * smooth(-0.01, 0.01, dt) * h.g * 0.9, h.pan, 0.2);
    }
    // --- roars and calls ---
    for (const ro of ROARS) { const x = ro.run(v, white); if (x) put(x * 0.55, ro.pan, 0.45); }
    for (const ro of CALLS) { const x = ro.run(v, white); if (x) put(x * 0.55, ro.pan, 0.7); }
    // --- crunches, glass, thuds ---
    for (const c of CRUNCH) {
      const dt = v - c.t;
      if (dt < 0 || dt > c.d) continue;
      const e = smooth(0, 0.012, dt) * (1 - smooth(c.d * 0.5, c.d, dt));
      put(c.fl.run(white(), c.f, 0.35).bp * e * c.g * 0.9, c.pan, 0.4);
    }
    for (const c of GLASS) {
      const dt = v - c.t;
      if (dt < 0 || dt > c.d) continue;
      const e = smooth(0, 0.01, dt) * (1 - smooth(c.d * 0.4, c.d, dt));
      put(c.fl.run(white(), c.f, 0.5).bp * e * c.g, c.pan, 0.6);
    }
    for (const c of THUDS) {
      const dt = v - c.t;
      if (dt < -0.01 || dt > 3) continue;
      c.ph += c.f * (1 - 0.4 * Math.min(dt * 2, 1)) / SR;
      put((Math.sin(TAU * c.ph) * Math.exp(-dt / c.dec) * 0.7 + c.n.run(white(), 220, 0.5).bp * Math.exp(-dt / 0.15) * 0.4) * smooth(-0.01, 0.012, dt) * c.g, c.pan, 0.5);
    }
    // --- car alarms (soft-edged two-tone) ---
    for (const a of ALARMS) {
      const dt = v - a.t;
      if (dt < 0) continue;
      const f = Math.sin(TAU * 1.6 * dt) > 0 ? a.a : a.b;
      a.ph += f / SR;
      const sq = Math.tanh(Math.sin(TAU * a.ph) * 3);
      put(a.lp.run(sq) * a.g * smooth(0, 0.05, dt) * (1 - smooth(V_TWO - 1, V_SEES, v) * 0.6), a.pan, 0.4);
    }
    // --- whooshes ---
    for (const w of WHOOSH) {
      const dt = v - w.t;
      if (dt < 0 || dt > w.d) continue;
      const u = dt / w.d;
      put(w.f.run(white(), 300 + 1400 * Math.sin(Math.PI * u), 0.6).bp * Math.sin(Math.PI * u) ** 2 * w.g * 3, w.pan, 0.3);
    }
    // --- the harbour: the rush as it comes out, the spray coming down after the crash ---
    {
      const rush = smooth(M_T0 - 0.3, M_T0 + 0.1, v) * (1 - smooth(M_T0 + 0.3, M_T0 + 1.2, v)) + 1.4 * smooth(M_T1 - 0.05, M_T1 + 0.08, v) * (1 - smooth(M_T1 + 0.3, M_T1 + 3.2, v));
      if (rush > 0.001) {
        const w = white();
        put((waterF[0].run(w, 900, 0.5).bp + waterF[1].run(w, 2400, 0.6).bp * 0.6) * 0.16 * rush, bpan, 0.6);
      }
      const spray = smooth(M_T1 + 0.3, M_T1 + 0.8, v) * (1 - smooth(M_T1 + 1.5, M_T1 + 3.5, v));
      if (spray > 0.001) put(sprayF.run(white(), 5000, 0.7).bp * 0.05 * spray * (0.6 + 0.4 * Math.sin(v * 37) * Math.sin(v * 11)), bpan, 0.6);
    }
    // --- steel scraping as the car is shoved ---
    {
      const k = smooth(V_SHOVE, V_SHOVE + 0.05, v) * (1 - smooth(V_SHOVE + 0.4, V_SHOVE + 1.0, v));
      if (k > 0.001) put(scrapeF.run(white(), 1300 + 500 * Math.sin(v * 29), 0.2).bp * 0.12 * k, 0.3, 0.4);
    }
    // --- sniffs ---
    for (const s of SNIFFS) {
      const dt = v - s.t;
      if (dt < 0 || dt > s.d) continue;
      const u = dt / s.d;
      const e = s.out ? Math.sin(Math.PI * Math.min(u * 3, 1) / 2) * (1 - u) : Math.sin(Math.PI * u);
      put(s.f.run(white(), s.out ? 600 : 1100 + 500 * u, 0.5).bp * e * (s.out ? 0.5 : 0.32), 0, 0.3);
    }
    // --- your heartbeat ---
    for (const t of HEART) {
      const dt = v - t;
      if (dt < 0 || dt > 0.6) continue;
      const x = (Math.sin(TAU * 52 * dt) * env(dt, 0.012, 0.07) + 0.7 * Math.sin(TAU * 46 * (dt - 0.17)) * env(dt - 0.17, 0.012, 0.08)) * 0.45 * smooth(V_SEES - 0.5, V_SEES + 1, v);
      l += heartF.run(x) * 1.2; r += heartF.y * 1.2;
    }
    // --- the music: a deep hit on each beat, a dark drone, a riser into the last roar ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 4) continue;
        const e = env(dt + 0.02, 0.03, 0.9 + 0.6 * h.k) * h.k * (1 - smooth(2.8, 4, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.007 / SR; ph[12] += hf * 2 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12])) * e;
        ph[14] += (30 + 35 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.015, 0.6 + 0.3 * h.k) * h.k;
      }
      const bf = braamLP.run(braam, 900, 0.6).lp * 0.07;
      const sv = subLP.run(sub) * 0.35 + sub * 0.15;
      l += bf + sv; r += bf * 0.97 + sv; wet += bf * 0.5;
      const dg = (0.02 + 0.02 * smooth(8, 16, v) + 0.03 * smooth(27, 40, v)) * (1 - smooth(V_WHITE, T_SWITCH, v));
      let a = 0, b = 0;
      [55, 65.4, 82.4].forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.005 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      l += xl; r += xr; wet += (xl + xr) * 0.4;
      const k = smooth(V_JAWS, V_LUNGE + 0.25, v) * (1 - smooth(V_LUNGE + 0.25, V_LUNGE + 0.35, v));
      if (k > 0.001) { const rv = riserF.run(white(), 300 + 3800 * k * k, 0.35).bp * k * k * 0.1; l += rv; r += rv; wet += rv * 0.5; }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.7, outR = r + rr * 0.7;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
    // the owner's clips, kept apart for now
    if (n >= 0) {
      if (SCREAM) { const i = Math.round((v - SCREAM_AT) * SR); if (i >= 0 && i < SCREAM.length) { const f = Math.min(1, i / (0.01 * SR), (SCREAM.length - i) / (0.08 * SR)); CL[n] += SCREAM[i] * f * 0.85; CR[n] += SCREAM[i] * f; } }
      if (GASP) { const i = Math.round((v - GASP_AT) * SR); if (i >= 0 && i < GASP.length) { const f = Math.min(1, i / (0.01 * SR), (GASP.length - i) / (0.05 * SR)); CL[n] += GASP[i] * f; CR[n] += GASP[i] * f * 0.9; } }
    }
  }
  {   // in the white, the soundtrack turns into the lead-in to the first frame (the far roar starting)
    const a = N - N0, xf = Math.round(0.34 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  // the master level: from the opening second, not from the loudest moment
  const out = (x, g) => 0.95 * Math.tanh((x * g) / 0.95);
  const openingDb = (g) => { let s = 0; for (let n = 0; n < SR; n++) { const m = (out(L[n], g) + out(R[n], g)) / 2; s += m * m; } return 10 * Math.log10(s / SR + 1e-12); };
  let lo = 0.01, hi = 100;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (openingDb(m) < TARGET_OPENING_DB) lo = m; else hi = m; }
  const gn = Math.sqrt(lo * hi);
  // the clips at their own levels (RMS over each clip), added after the master gain
  const clipGain = (clip, db) => {
    if (!clip) return 0;
    let s = 0, c = 0;
    for (let i = 0; i < clip.length; i++) { const x = clip[i]; if (Math.abs(x) > 0.02) { s += x * x; c++; } }
    return Math.pow(10, db / 20) / Math.max(Math.sqrt(s / Math.max(c, 1)), 1e-9);
  };
  const gS = clipGain(SCREAM, SCREAM_DB), gG = clipGain(GASP, GASP_DB);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    const v = n / SR;
    const k = v < (SCREAM_AT + GASP_AT) / 2 ? gS : gG;
    const a = out(L[n], gn) + CL[n] * k, b = out(R[n], gn) + CR[n] * k;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  console.log(`audio: master gain ${gn.toFixed(3)} (opening at ${TARGET_OPENING_DB} dB); scream ${SCREAM_DB} dB, gasp ${GASP_DB} dB`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
