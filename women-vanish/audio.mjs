// Procedural soundtrack for "What if every woman disappeared?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Shibuya at noon: a big crowd talking, the crossing's bird-chirp signal, traffic idling. At V_EVENT half the voices
// stop at once, a soft low thump, and everything the women carried clatters to the street. Then horns, the dull thud of
// each driverless car bumping into the one ahead (traffic.js), confused voices. Time speeds up: a rush of air,
// crickets on the first night, then wind and birds over the decades, a slow swell into the white, which turns back
// into the crossing at the start (the video loops).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, V_EVENT, V_RISE, V_SUNUP, T_SWITCH, V_WARD, V_CLASS, V_BACK } from './src/timeline.js';
import { BUMPS, RACER } from './src/traffic.js';
import { B, FALL, fallSpan, FALL109 } from './src/blocks.js';
import { ITEMS, CAM0 } from './src/people.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000, TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF { constructor() { this.l = 0; this.b = 0; } run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 30), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; } }
class Reverb {
  constructor(seed) { const r = rng(seed); this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 })); this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 })); }
  run(x, fb = 0.84, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const sq = (ph) => (ph - Math.floor(ph) < 0.5 ? 1 : -1);

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const N0 = Math.round(LOOP * SR);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(77);
  const white = () => R0() * 2 - 1;
  // events
  // what the women carried landing on the street: a soft thud for a bag, a quiet tap for a phone; only the ones near
  // you are heard (quieter with distance), each with its own filter
  const clatter = ITEMS.map((it) => { const d = Math.hypot(it.x - CAM0.x, it.z - CAM0.z); return { t: V_EVENT + Math.sqrt(2 * it.y0 / 9.8), g: (it.kind === 0 ? 1 : 0.5) / (1 + (d / 7) ** 2), f: it.kind === 0 ? 240 + R0() * 120 : 1500 + R0() * 500, dec: it.kind === 0 ? 30 : 55, pan: R0() * 1.6 - 0.8, F: new SVF() }; }).filter((c) => c.g > 0.03);
  // (a car nudging the one ahead at walking pace: a dull, distant thud, quieter the farther away it is)
  const bumps = BUMPS.map((b) => ({ t: V_EVENT + b.tau, g: b.g / (1 + (Math.hypot(b.x - CAM0.x, b.z - CAM0.z) / 20) ** 2), pan: R0() * 1.4 - 0.7, lp: new OnePole(90), lp2: new OnePole(70) }));
  const horns = [];
  for (let t = V_EVENT + 1.2; t < V_RISE + 1.5; t += 0.5 + R0() * 1.4) horns.push({ t, d: 0.3 + R0() * 0.9, f: 360 + R0() * 160, g: 0.3 + R0() * 0.5, pan: R0() * 1.6 - 0.8 });
  const crashT = V_EVENT + RACER.tau;
  const sirens = [6.5, 9.4, 11.8, 19.2, 21.4].map((t, k) => ({ t, d: 3 + R0() * 2.5, g: 0.6 + R0() * 0.4, pan: R0() * 1.6 - 0.8, p: 0, lp: new OnePole(1400) }));
  // buildings coming down that you can see: a deep rumble, louder for the big ones
  const falls = FALL.map((f, i) => (f && f.big !== undefined ? { t: f.v, d: fallSpan(f) + 2.5, g: Math.min(1, B[i].h / 90) * 0.8 + 0.2, lp: new OnePole(90), lp2: new OnePole(60) } : null)).filter(Boolean);
  falls.push({ t: FALL109, d: 4, g: 0.7, lp: new OnePole(90), lp2: new OnePole(60) });
  const birds = [];
  for (let t = 24; t < T_SWITCH; t += 0.25 + R0() * 1.1) birds.push({ t, n: 1 + Math.floor(R0() * 4), f: 2800 + R0() * 2200, pan: R0() * 1.6 - 0.8, g: 0.4 + R0() * 0.6 });

  const voiceF = Array.from({ length: 10 }, () => new SVF()), voiceE = Array.from({ length: 10 }, () => new OnePole(4));
  const trafLP = new OnePole(120), trafLP2 = new OnePole(90), clatF = new SVF(), bumpLP = new OnePole(110), crunchF = new SVF(), hornLP = new OnePole(1800);
  const windF = new SVF(), windLP = new OnePole(0.4), rushF = new SVF(), padLP = new OnePole(600), thumpLP = new OnePole(80), cricketE = new OnePole(30);
  const crashLP = new OnePole(160), crashLP2 = new OnePole(110), crashF = new SVF(), alarmLP = new OnePole(2200), fireLP = new OnePole(150), fireLP2 = new OnePole(100), humLP = new OnePole(140);
  const kidF = [new SVF(), new SVF()], kidE = [new OnePole(4), new OnePole(4)];
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(24);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0;
    const street = 1 - smooth(V_RISE + 0.5, 16, v);        // the street sound fades as we rise and time speeds up
    // the crowd: ten groups of voices; half stop when the women vanish, the rest get louder and more agitated
    {
      let cl = 0, cr = 0;
      for (let k = 0; k < 10; k++) {
        const woman = k < 5;
        const on = woman ? (v < V_EVENT ? 1 : 0) : 1 + 0.6 * smooth(V_EVENT + 0.6, V_EVENT + 2.5, v);
        if (on === 0) continue;
        const a = voiceE[k].run(Math.max(0, Math.sin(v * (2.3 + k * 0.55) + k * 1.7) * 0.8 + 0.25 + white() * 0.3));
        const fc = (woman ? 520 : 300) + k * 60 + 140 * Math.sin(v * (1.3 + k * 0.21) + k);
        const x = voiceF[k].run(white(), fc, 0.25).bp * a * on * 0.045 * street;
        if (k % 2) cl += x; else cr += x;
      }
      l += cl + cr * 0.5; r += cr + cl * 0.5; wet += (cl + cr) * 0.25;
    }
    // traffic idling, the city hum
    { const x = trafLP2.run(trafLP.run(white())) * 1.6 * street; l += x; r += x * 0.95; }
    // the crossing signal: "piyo piyo" chirps (they keep going whatever happens)
    {
      const per = 1.15, tt = ((v % per) + per) % per;
      for (const off of [0, 0.22]) {
        const d = tt - off;
        if (d > 0 && d < 0.12) { const f = 2900 - 900 * (d / 0.12); ph[0] += f / SR; const x = Math.sin(TAU * ph[0]) * 0.035 * Math.sin(Math.PI * d / 0.12) * street; l += x * 0.7; r += x; wet += x * 0.5; }
      }
    }
    // the moment: a soft low thump and a breath of air
    {
      const d = v - V_EVENT;
      if (d > -0.05 && d < 2.5) {
        ph[1] += (55 - 20 * Math.min(d, 1)) / SR;
        const th = Math.sin(TAU * ph[1]) * 0.5 * Math.exp(-Math.max(d, 0) * 2.5) * smooth(-0.05, 0.02, d);
        const air = rushF.run(white(), 900 + 2000 * Math.exp(-Math.max(d, 0) * 3), 0.6).bp * 0.12 * Math.exp(-Math.max(d, 0) * 2) * smooth(-0.05, 0.03, d);
        l += th + air; r += th + air; wet += air;
      }
    }
    // bags and phones hitting the street
    for (const c of clatter) {
      const d = v - c.t;
      if (d > 0 && d < 0.18) { const x = c.F.run(white(), c.f, 0.7).bp * c.g * 0.11 * Math.exp(-d * c.dec) * smooth(0, 0.004, d); l += x * (1 - c.pan * 0.6); r += x * (1 + c.pan * 0.6); wet += x * 0.4; }
    }
    // car horns
    for (const h of horns) {
      const d = v - h.t;
      if (d > 0 && d < h.d) {
        ph[2] += h.f / SR; ph[3] += h.f * 1.26 / SR;
        const x = hornLP.run((sq(ph[2]) + sq(ph[3])) * 0.5) * 0.06 * h.g * smooth(0, 0.02, d) * (1 - smooth(h.d - 0.05, h.d, d)) * street;
        l += x * (1 - h.pan * 0.5); r += x * (1 + h.pan * 0.5); wet += x * 0.6;
      }
    }
    // the bumps: a dull thud (no crackle)
    for (const b of bumps) {
      const d = v - b.t;
      if (d > -0.01 && d < 0.6) {
        const th = b.lp2.run(b.lp.run(white())) * 4.0 * b.g * Math.exp(-Math.max(d, 0) * 12) * smooth(-0.01, 0.015, d);
        l += th * (1 - b.pan * 0.4); r += th * (1 + b.pan * 0.4); wet += th * 0.3;
      }
    }
    // time speeding up: a rush of air
    {
      const k = smooth(V_RISE - 0.3, V_RISE + 2, v) * (1 - smooth(V_RISE + 4, 18, v));
      if (k > 0) { const x = rushF.run(white(), 400 + 2500 * k, 0.7).bp * 0.12 * k; l += x; r += x; wet += x * 0.4; }
    }
    // the first night: crickets
    if (s.night > 0.01) {
      const pulse = cricketE.run(Math.sin(v * TAU * 14) > 0.2 && Math.sin(v * TAU * 0.8) > -0.3 ? 1 : 0);
      ph[4] += 4300 / SR; ph[5] += 4720 / SR;
      const x = (Math.sin(TAU * ph[4]) * pulse + Math.sin(TAU * ph[5]) * cricketE.y * 0.6 * (Math.sin(v * 1.3) > 0 ? 1 : 0)) * 0.018 * s.night;
      l += x; r += x * 0.8; wet += x * 0.5;
    }
    // the decades: wind and birds
    {
      const k = smooth(22, 30, v);
      if (k > 0) {
        const g = 0.5 + 0.5 * Math.sin(v * 0.23) * Math.sin(v * 0.11 + 1);
        const x = windF.run(white(), 300 + 500 * g, 0.4).bp * 0.08 * k * (0.6 + 0.4 * g);
        l += x; r += x * 0.9; wet += x * 0.3;
      }
    }
    for (const b of birds) {
      const d = v - b.t;
      if (d > 0 && d < b.n * 0.14) {
        const dd = d % 0.14;
        if (dd < 0.09) { const f = b.f * (1 + 0.25 * Math.sin(dd / 0.09 * Math.PI)); ph[6] += f / SR; const x = Math.sin(TAU * ph[6]) * 0.02 * b.g * Math.sin(Math.PI * dd / 0.09) * smooth(22, 30, v); l += x * (1 - b.pan * 0.6); r += x * (1 + b.pan * 0.6); wet += x * 0.6; }
      }
    }
    // the crash behind the queue: a heavy, dull impact and a crunch of metal (no high crackle)
    {
      const d = v - crashT;
      if (d > -0.01 && d < 1.6) {
        ph[16] += (50 + 35 * Math.exp(-Math.max(d, 0) * 8)) / SR;
        const on = smooth(-0.01, 0.004, d);
        const thump = Math.sin(TAU * ph[16]) * 0.5 * Math.exp(-Math.max(d, 0) * 6) * on;
        const body = crashLP2.run(crashLP.run(white())) * 3.0 * Math.exp(-Math.max(d, 0) * 5) * on;
        const metal = crashF.run(white(), 650 + 250 * Math.sin(d * 37), 0.4).bp * 0.16 * Math.exp(-Math.max(d, 0) * 7) * on;
        const x = (thump + body + metal) * street;
        l += x * 1.15; r += x * 0.8; wet += (body + metal) * 0.5 * street;
      }
    }
    // the hit car's alarm: a two-tone wail, on and on (until we rise above it)
    {
      const d = v - crashT - 0.4;
      if (d > 0) {
        const f = Math.floor(d / 0.42) % 2 ? 860 : 1120;
        ph[17] += f / SR;
        const x = alarmLP.run(sq(ph[17])) * 0.016 * smooth(0, 0.05, d) * (1 - smooth(V_RISE, V_RISE + 3, v));
        l += x * 1.1; r += x * 0.7; wet += x * 0.5;
      }
    }
    // ambulances far off across the city
    for (const sr of sirens) {
      const d = v - sr.t;
      if (d > 0 && d < sr.d) { const f = Math.floor(d / 0.65) % 2 ? 770 : 960; sr.p += f / SR; const x = sr.lp.run(Math.sin(TAU * sr.p)) * 0.012 * sr.g * Math.sin(Math.PI * d / sr.d); l += x * (1 - sr.pan * 0.6); r += x * (1 + sr.pan * 0.6); wet += x * 0.9; }
    }
    // the fires on the first night: a low roar
    { const k = smooth(V_BACK, V_BACK + 0.8, v) * (1 - smooth(23.5, 25.5, v)); if (k > 0) { const x = fireLP2.run(fireLP.run(white())) * 1.3 * k; l += x; r += x * 0.9; wet += x * 0.3; } }
    // buildings coming down: a deep rumble
    for (const c of falls) {
      const d = v - c.t;
      if (d > -0.01 && d < c.d) { const x = c.lp2.run(c.lp.run(white())) * 3.4 * c.g * smooth(-0.01, 0.2, d) * (1 - smooth(c.d * 0.35, c.d, d)); l += x; r += x * 0.95; wet += x * 0.4; }
    }
    // inside: the city drops away (hard cut); a ward, then a classroom
    {
      const ins = smooth(V_WARD - 0.012, V_WARD + 0.012, v) * (1 - smooth(V_BACK - 0.012, V_BACK + 0.012, v));
      l *= 1 - ins; r *= 1 - ins; wet *= 1 - ins;
      const wW = smooth(V_WARD - 0.012, V_WARD + 0.012, v) * (1 - smooth(V_CLASS - 0.012, V_CLASS + 0.012, v));
      const wC = smooth(V_CLASS - 0.012, V_CLASS + 0.012, v) * (1 - smooth(V_BACK - 0.012, V_BACK + 0.012, v));
      const hum = humLP.run(white()) * 0.3;
      if (wW > 0) {   // the ward: air-con hum, heart monitors beeping, an alarm from an empty bed
        let x = hum;
        for (const [rate, off, f, g, k] of [[1.25, 0, 1000, 0.03, 18], [1.05, 0.4, 1180, 0.02, 19]]) { const tb = (v * rate + off) % 1; if (tb < 0.07) { ph[k] += f / SR; x += Math.sin(TAU * ph[k]) * g * Math.sin(Math.PI * tb / 0.07); } }
        const ta = v % 1.25; let al = 0;
        for (const [o, f] of [[0, 880], [0.22, 660], [0.44, 880]]) { const dd = ta - o; if (dd > 0 && dd < 0.16) { ph[20] += f / SR; al += Math.sin(TAU * ph[20]) * 0.024 * Math.sin(Math.PI * dd / 0.16); } }
        l += (x + al * 0.7) * wW; r += (x + al * 1.2) * wW; wet += (x - hum + al) * wW * 0.6;
      }
      if (wC > 0) {   // the classroom: a quiet hum, a few boys murmuring, the school chime
        let x = hum * 0.6;
        for (let k = 0; k < 2; k++) { const a = kidE[k].run(Math.max(0, Math.sin(v * (1.7 + k * 0.9) + k) * 0.7 + 0.1)); x += kidF[k].run(white(), 800 + k * 250 + 120 * Math.sin(v * 1.9 + k), 0.3).bp * a * 0.03; }
        const NOTES = [659.3, 523.3, 587.3, 392.0];
        NOTES.forEach((f, k) => { const d = v - (V_CLASS + 0.15 + k * 0.62); if (d > 0 && d < 2.5) { ph[21] += f / SR; ph[22] += 2.0 * f / SR; ph[23] += 3.01 * f / SR; const env = Math.exp(-d * 1.6) * smooth(0, 0.01, d); x += (Math.sin(TAU * ph[21]) + 0.4 * Math.sin(TAU * ph[22]) + 0.15 * Math.sin(TAU * ph[23])) * 0.05 * env; } });
        l += x * wC; r += x * wC; wet += x * wC * 0.7;
      }
    }
    // a low, slow chord under the time-lapse, swelling into the white
    {
      const k = smooth(V_RISE, 16, v) * (1 - smooth(T_SWITCH, T_SWITCH + 0.3, v));
      if (k > 0) {
        let pv = 0;
        [55, 82.4, 110, 164.8, 220].forEach((f, i) => { ph[8 + i] += f * (1 + 0.003 * i) / SR; pv += saw(ph[8 + i]) * [0.5, 0.35, 0.3, 0.2, 0.12][i]; });
        padLP.set(300 + 1600 * smooth(V_SUNUP, T_SWITCH, v));
        pv = padLP.run(pv) * 0.06 * k * (0.7 + 0.8 * smooth(V_SUNUP - 4, T_SWITCH, v));
        l += pv; r += pv; wet += pv * 0.7;
      }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    if (n < 0) { PL[n + N0] = l + rl * 0.7; PR[n + N0] = r + rr * 0.7; } else { L[n] = l + rl * 0.7; R[n] = r + rr * 0.7; }
  }
  {   // inside the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.35 * SR);
    for (let i = 0; i < N0; i++) { const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2); L[a + i] = L[a + i] * wo + PL[i] * wi; R[a + i] = R[a + i] * wo + PR[i] * wi; }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.6); R[n] = Math.tanh(R[n] * 1.6);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) { buf.writeInt16LE(Math.round(clamp(L[n] * g, -1, 1) * 32767), 44 + n * 4); buf.writeInt16LE(Math.round(clamp(R[n] * g, -1, 1) * 32767), 46 + n * 4); }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
