// Procedural soundtrack for "What if asteroids of every size hit your city?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// What you hear, stop by stop (every stop starts over on the hilltop: wind, the city's hum below, the crowd):
//   - a roar that rises as the rock comes in (louder and deeper for each bigger one);
//   - a deep hit as it bursts or lands, bigger every time (sub + a low brass-like chord);
//   - what follows: glass tinkling across the city and then right round you (house-size); towers groaning down and the
//     blast's roar (jumbo jet); the ground shaking and rock raining (skyscraper); fire roaring (Everest); the bay hissing
//     to steam and a grinding crush (Texas); a vast grinding rumble and the roar of molten rock (the Moon);
//   - the white: a whoosh into it, then the hilltop again.
// The owner's own clips (sounds/, kept out of git): the scream as the house-size fireball flares on frame 0's second,
// a gasp at the jet's burst, "oh my god" when the Texas-size one appears, "nooo" under the Moon.
// Every onset is soft (5 ms+); the loop: under the last white the hilltop starts again, so the sound runs on over the seam.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STOPS, S } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;

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
  run(x, fb = 0.86, damp = 0.3) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

// which stop is on at v (as in timeline.js)
const stopIdx = (v) => { let i = 0; while (i + 1 < STOPS.length && v >= STOPS[i + 1].t0) i++; return i; };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 0.6;                              // a little lead-in before the loop's own lead-in
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;

  // ---- the hits: each burst/landing, then the blast reaching you (the white) ----
  const HITS = [];
  STOPS.forEach((st, i) => {
    const k = 0.5 + 0.1 * i;
    HITS.push({ t: st.hit, k: Math.min(1.05, k), root: 55 * Math.pow(2, -i / 12), deep: i >= 3 });
    if (i > 0) HITS.push({ t: st.t0 - 0.1, k: Math.min(1.1, 0.55 + 0.1 * i), root: 41, deep: true });   // (the white of the stop before)
  });
  HITS.push({ t: T_SWITCH - 0.1, k: 1.2, root: 33, deep: true });
  HITS.push({ t: S.house.you, k: 0.55, root: 62, deep: false });                                      // (the boom reaching the terrace)
  // ---- glass: tinkles across the city as the house-size boom sweeps in, then a shower round you ----
  const TINK = [];
  for (let k = 0; k < 420; k++) {
    const near = k > 300;
    const t = near ? S.house.you + Math.pow(R0(), 1.5) * 0.9 : 1.45 + R0() * 2.1;
    TINK.push({ t, f: 2600 + R0() * 4200, f2: 1.0 + 0.37 + R0() * 0.4, d: 0.08 + R0() * 0.22, g: (near ? 0.03 : 0.006 + 0.012 * (t - 1.45) / 2.1) * (0.4 + R0()), pan: R0() * 1.8 - 0.9, ph: 0, ph2: 0 });
  }
  // the jumbo jet's shock passing over the city: more glass, far off
  for (let k = 0; k < 160; k++) TINK.push({ t: S.jet.hit + 0.5 + R0() * (S.jet.you - S.jet.hit - 0.6), f: 2400 + R0() * 3500, f2: 1.41 + R0() * 0.3, d: 0.1 + R0() * 0.2, g: 0.005 + 0.008 * R0(), pan: R0() * 1.6 - 0.8, ph: 0, ph2: 0 });
  // ---- towers groaning as they go down (jumbo jet, skyscraper) ----
  const GROAN = [];
  for (let k = 0; k < 9; k++) GROAN.push({ t: S.jet.hit + 0.6 + k * 0.38 + R0() * 0.3, f: 38 + R0() * 22, g: 0.14 + 0.1 * R0(), pan: R0() * 1.4 - 0.7, fl: new SVF(), ph: 0 });
  for (let k = 0; k < 6; k++) GROAN.push({ t: S.tower.hit + 1.6 + k * 0.6 + R0() * 0.3, f: 34 + R0() * 20, g: 0.16 + 0.1 * R0(), pan: R0() * 1.4 - 0.7, fl: new SVF(), ph: 0 });
  // ---- rocks raining after the crater (soft thuds, far then near) ----
  const THUDS = Array.from({ length: 40 }, () => ({ t: S.tower.hit + 1.0 + R0() * (S.tower.you - S.tower.hit - 1.2), g: 0.08 + 0.18 * R0(), pan: R0() * 1.6 - 0.8, f: new SVF(), ph: 0 }));
  // ---- fire crackle (soft) ----
  const CRK = Array.from({ length: 700 }, () => {
    const st = [S.everest, S.texas, S.moon][Math.floor(R0() * 3)];
    return { t: st.hit + R0() * (st.you - st.hit), d: 0.02 + R0() * 0.05, f: 900 + R0() * 2600, g: 0.008 * (0.4 + R0()), pan: R0() * 1.8 - 0.9, fl: new SVF() };
  });

  const windF = [new SVF(), new SVF()], cityLP = new OnePole(180), cityLP2 = new OnePole(210);
  const talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
  const roarF = [new SVF(), new SVF(), new SVF()], roarLP = new OnePole(60), roarLP2 = new OnePole(60);
  const blastF = [new SVF(), new SVF()], blastLP = new OnePole(90);
  const hissF = [new SVF(), new SVF()], fireF = [new SVF(), new SVF()], fireLP = new OnePole(260);
  const quakeLP = new OnePole(40), quakeLP2 = new OnePole(40), whooshF = new SVF();
  const braamLP = new SVF(), subLP = new OnePole(80), droneLP = [new OnePole(400), new OnePole(400)];
  const revL = new Reverb(31), revR = new Reverb(32);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = 0; n < N; n++) {
    let v = T0 + n / SR;
    // (before frame 0 the loop's own lead-in: the end of the house-size stop's opening)
    const i = stopIdx(v), st = STOPS[i];
    const dt0 = v - st.t0, th = v - st.hit, ty = v - st.you;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    // --- the hilltop: wind, the city's hum below, the crowd talking; back after every white ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    {
      const calm = (i === 0 ? 1 : smooth(0.0, 0.25, dt0)) * (1 - 0.7 * smooth(st.hit - 0.3, st.hit + 0.5, v));
      const w = white();
      l += windF[0].run(w, 500 + 150 * Math.sin(v * 0.7), 0.9).bp * 0.025 + cityLP.run(brownL) * 0.09 * calm;
      r += windF[1].run(white(), 560 + 150 * Math.sin(v * 0.6 + 1), 0.9).bp * 0.025 + cityLP2.run(brownR) * 0.09 * calm;
      let cv = 0;
      for (let q = 0; q < 6; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      // (the crowd: murmur, then louder and alarmed as the rock comes, shouting at the hit)
      const talk = (0.6 + 1.6 * smooth(st.t0 + 0.2, st.hit, v) + 1.0 * smooth(st.hit, st.hit + 0.4, v) * (1 - smooth(st.hit + 2, st.you, v))) * (i === 0 ? 1 : smooth(0, 0.3, dt0));
      l += cv * 0.05 * talk; r += cv * 0.046 * talk;
    }
    // --- the roar of the rock coming in: rises to the hit, bigger and lower for each stop ---
    {
      const size = i / 5;
      const pre = smooth(st.t0 - 0.2, st.hit, v);
      const g = (0.08 + 0.4 * size) * pre * pre * (1 - smooth(st.hit, st.hit + 0.25, v)) * (i === 0 ? 0.6 + 0.4 * smooth(-1, 0.9, v) : 1);
      if (g > 0.001) {
        const w = white();
        const fc = (900 - 650 * size) * (0.7 + 0.6 * pre);
        const rv = (roarF[0].run(w, fc, 0.55).bp * 0.8 + roarF[1].run(w, fc * 2.2, 0.7).bp * 0.3 + roarLP.run(white()) * 3.0 * size) * g;
        dl += rv; dr += roarF[2].run(w, fc * 1.07, 0.55).bp * 0.8 * g + roarLP2.run(white()) * 3.0 * size * g; wet += rv * 0.35;
      }
    }
    // --- the blast coming at you after the hit: a roar that swells to the white ---
    {
      const size = i / 5;
      const k = smooth(st.hit + 0.2, st.you, v);
      const g = (0.05 + 0.25 * size) * (0.3 + 0.7 * k * k) * (th > 0 ? 1 : 0) * (1 - smooth(st.you - 0.02, st.you + 0.1, v)) * (i === 0 ? 0.4 : 1);
      if (g > 0.001) {
        const w = white();
        const fc = 140 + 380 * k;
        const bv = (blastF[0].run(w, fc, 0.6).bp + blastLP.run(white()) * 2.4) * g;
        dl += bv; dr += blastF[1].run(white(), fc * 1.1, 0.6).bp * g + blastLP.y * 2.4 * g; wet += bv * 0.4;
      }
    }
    // --- the ground shaking (skyscraper and up) ---
    {
      const g = i >= 2 ? smooth(st.hit - 0.05, st.hit + 0.3, v) * (0.5 + 0.12 * i) * (1 - smooth(st.you - 0.1, st.you + 0.1, v)) : 0;
      if (g > 0) {
        const am = 0.7 + 0.3 * Math.sin(v * 7.3) * Math.sin(v * 3.1);
        const qv = quakeLP.run(white()) * 8 * g * am, qr = quakeLP2.run(white()) * 8 * g * am;
        ph[25] += (29 + 4 * Math.sin(v * 2.3)) / SR;
        const sv = Math.sin(TAU * ph[25]) * 0.22 * g * am;
        dl += qv + sv; dr += qr + sv; wet += qv * 0.3;
      }
    }
    // --- fire (Everest on) and the bay hissing to steam (Texas) ---
    {
      const g = i >= 3 ? smooth(st.hit - 0.6, st.hit + 0.8, v) * (1 - smooth(st.you - 0.05, st.you + 0.1, v)) : 0;
      if (g > 0) {
        const w = white();
        const fv = (fireF[0].run(w, 650 + 200 * Math.sin(v * 3.1), 0.7).bp * 0.6 + fireLP.run(white()) * 1.2) * 0.2 * g * (0.75 + 0.25 * Math.sin(v * 9) * Math.sin(v * 5.3));
        l += fv; r += fireF[1].run(w, 820, 0.7).bp * 0.12 * g + fireLP.y * 0.24 * g; wet += fv * 0.3;
      }
      const hs = i === 4 ? smooth(st.hit - 1.1, st.hit + 0.5, v) * (1 - smooth(st.you - 0.05, st.you + 0.1, v)) : 0;
      if (hs > 0) {
        const hv = hissF[0].run(white(), 3800, 0.5).bp * 0.05 * hs, hr = hissF[1].run(white(), 4300, 0.5).bp * 0.05 * hs;
        l += hv; r += hr; wet += (hv + hr) * 0.5;
      }
    }
    // --- glass ---
    for (const q of TINK) {
      const d = v - q.t;
      if (d < 0 || d > q.d * 5) continue;
      q.ph += q.f / SR; q.ph2 += q.f * q.f2 / SR;
      const e = Math.min(1, d / 0.005) * Math.exp(-d / q.d);
      const gv = (Math.sin(TAU * q.ph) + 0.5 * Math.sin(TAU * q.ph2)) * e * q.g;
      l += gv * (1 - q.pan) * 0.5; r += gv * (1 + q.pan) * 0.5; wet += gv * 0.6;
    }
    for (const g of GROAN) {
      const d = v - g.t;
      if (d < 0 || d > 3) continue;
      g.ph += (g.f * (1 - 0.2 * Math.min(d / 2.5, 1))) / SR;
      const e = smooth(0, 0.25, d) * (1 - smooth(1.8, 3, d));
      const gv = (saw(g.ph) * 0.4 + g.fl.run(white(), 180 + 120 * Math.sin(d * 3), 0.6).bp * 0.6) * e * g.g;
      dl += gv * (1 - g.pan * 0.5); dr += gv * (1 + g.pan * 0.5); wet += gv * 0.7;
    }
    for (const w of THUDS) {
      const d = v - w.t;
      if (d < -0.01 || d > 1.2) continue;
      w.ph += (70 - 30 * Math.min(d * 3, 1)) / SR;
      const wv = (Math.sin(TAU * w.ph) * env(d + 0.01, 0.01, 0.15) + w.f.run(white(), 900 - 600 * Math.min(d * 2, 1), 0.6).bp * 0.5 * env(d + 0.01, 0.012, 0.2)) * w.g;
      dl += wv * (1 - w.pan * 0.5); dr += wv * (1 + w.pan * 0.5); wet += wv * 0.6;
    }
    for (const c of CRK) {
      const d = v - c.t;
      if (d > 0 && d < c.d) {
        const e = smooth(0, 0.008, d) * (1 - smooth(c.d - 0.01, c.d, d));
        const cv = c.fl.run(white(), c.f, 0.5).bp * e * c.g * 2.0;
        l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5;
      }
    }
    // --- the whoosh into each white ---
    {
      let k = 0;
      for (let q = 1; q <= STOPS.length; q++) { const t = q < STOPS.length ? STOPS[q].t0 : T_SWITCH; const d = v - t; if (d > -0.6 && d < 0.3) k = Math.max(k, smooth(-0.6, -0.05, d) * (1 - smooth(0.0, 0.3, d))); }
      if (k > 0.001) { const wv = whooshF.run(white(), 300 + 3800 * k * k, 0.4).bp * k * k * 0.14; dl += wv; dr += wv; wet += wv * 0.5; }
    }
    // --- the hits ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const d = v - h.t;
        if (d < -0.02 || d > 5) continue;
        const e = env(d + 0.02, 0.03, (0.8 + 0.8 * h.k) * (h.deep ? 1.5 : 1)) * h.k * (1 - smooth(3.5, 5, d));
        const hf = h.root * (1 - 0.04 * Math.min(d, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.006 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(d, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(d + 0.02, 0.012, (0.7 + 0.4 * h.k) * (h.deep ? 2 : 1)) * h.k;
      }
      const bf = braamLP.run(braam, 1200, 0.6).lp * 0.075;
      const sv = subLP.run(sub) * 0.36 + sub * 0.18;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- a tense drone that steps up with each size ---
    {
      const roots = [110, 116.5, 123.5, 130.8, 138.6, 146.8];
      const f0 = roots[i];
      const ch = [f0, f0 * 1.26, f0 * 1.5];
      const dg = 0.035 + 0.012 * i;
      let a = 0, b = 0;
      ch.forEach((f, q) => { ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
      const cutf = 300 + 120 * i + 400 * smooth(st.hit, st.you, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    L[n] = l + dl + rl * 0.8; R[n] = r + dr + rr * 0.8;
  }
  // ---- the owner's voice clips, each set relative to the mix around it ----
  const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds');
  const clip = (name, skip, len, at, vol, refFrom, refTo) => {
    const file = path.join(DIR, name);
    if (!fs.existsSync(file)) { console.warn(`audio: no sounds/${name}: left out`); return; }
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(skip), '-i', file, '-t', String(len), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    const n0 = Math.round((at - T0) * SR), cl = sc.length >> 1;
    let mix = 0, own = 0;
    const h0 = Math.round((refFrom - T0) * SR), h1 = Math.round((refTo - T0) * SR);
    for (let k = h0; k < h1; k++) mix += L[k] ** 2 + R[k] ** 2;
    mix /= (h1 - h0);
    for (let k = 0; k < cl; k++) own += sc[2 * k] ** 2 + sc[2 * k + 1] ** 2;
    own /= cl;
    const g = vol * Math.sqrt(mix / own);
    for (let k = 0; k < cl && n0 + k < N; k++) {
      const f = Math.min(1, k / (0.01 * SR), (cl - k) / (0.25 * SR));
      L[n0 + k] += sc[2 * k] * g * f; R[n0 + k] += sc[2 * k + 1] * g * f;
    }
    console.log(`audio: ${name} at ${at}s, gain ${g.toFixed(2)}`);
  };
  clip('scream.mp3', 0.08, 2.4, 0.15, 0.42, S.house.hit, S.house.hit + 2);
  clip('gasp.mp3', 0.23, 0.42, S.jet.hit + 0.1, 0.5, S.jet.hit, S.jet.hit + 2);
  clip('omg.mp3', 0.0, 0.9, S.texas.t0 + 0.45, 0.6, S.texas.t0 + 0.3, S.texas.hit);
  clip('nooo.mp3', 0.13, 2.6, S.moon.t0 + 1.2, 0.55, S.moon.t0 + 0.5, S.moon.hit);

  // the video's track: [0, T_SWITCH) as made; from T_SWITCH on it fades over into the run's own lead-in to frame 0
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.3 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = L[o0 + n], r = R[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = o0 + n - M;
      l = l * wo + L[j] * wi; r = r * wo + R[j] * wi;
    }
    OL[n] = l; OR[n] = r;
  }
  let peak = 0;
  for (let n = 0; n < M; n++) {
    OL[n] = Math.tanh(OL[n] * 1.4); OR[n] = Math.tanh(OR[n] * 1.4);
    if (!Number.isFinite(OL[n]) || !Number.isFinite(OR[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(OL[n]), Math.abs(OR[n]));
  }
  const gn = 0.89 / peak;
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
