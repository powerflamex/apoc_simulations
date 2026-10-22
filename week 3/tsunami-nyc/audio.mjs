// Procedural soundtrack for "What if a 1,000 ft tsunami hit New York?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) The Battery at sunset: gulls, the crowd's
// murmur turning to shouts, a hiss and gurgle as the harbor drains, car horns and sirens from the city. Under it all
// the wave's roar, far off at first (a low thunder), growing louder and closer as the distance falls; a low drone
// climbing a semitone at every beat, a deep whoomp on each beat, booms as it takes the Statue, the ferry and the
// island. At the end the roar fills everything, the lip comes down: a huge soft crash into white noise, which
// fades into the lead-in of the first frame (the video loops).
// No sharp clicks anywhere: every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, distAt, VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_HIT, V_LIBERTY, V_FERRY, V_GOV } from './src/timeline.js';
import { PEOPLE } from './src/layout.js';
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
  run(x, fb = 0.86, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR), N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;
  const beats = BEATS.filter((b) => b.v < T_SWITCH);
  // shouts as people turn and run (the near ones)
  const shouts = PEOPLE.filter((p) => p.vRun < 30 && p.z < 30).slice(0, 36).map((p) => ({ t: p.vRun - 0.2, f: (p.kid ? 380 : 190) + R0() * 140, d: 0.5 + R0() * 0.6, g: 0.012 + 0.01 * R0(), pan: clamp(p.x / 30, -0.85, 0.85), vow: R0() }));
  const gulls = []; for (let k = 0; k < 14; k++) gulls.push({ t: -0.8 + R0() * 10, f: 1500 + R0() * 700, d: 0.35 + R0() * 0.3, pan: R0() * 1.6 - 0.8, g: 0.008 + 0.006 * R0() });
  const horns = []; for (let k = 0; k < 22; k++) horns.push({ t: 14 + R0() * 32, f: 300 + R0() * 160, d: 0.3 + R0() * 0.6, pan: R0() * 1.6 - 0.8, g: 0.01 + 0.01 * R0() });
  const booms = [{ t: V_LIBERTY + 0.3, g: 0.5 }, { t: V_FERRY + 0.2, g: 0.45 }, { t: V_GOV - 2.3, g: 0.45 }, { t: V_GOV + 0.2, g: 0.6 }];

  const crowdF = Array.from({ length: 4 }, () => new SVF()), crowdE = Array.from({ length: 4 }, () => new OnePole(3));
  const drainF = [new SVF(), new SVF()], gurgE = new OnePole(6);
  const roarF = [new SVF(), new SVF(), new SVF()], roarSub = new OnePole(40), roarSub2 = new OnePole(30);
  const shoutF = [new SVF(), new SVF()], hornF = new SVF(), sirenF = new SVF(), whoompF = new SVF(), boomF = new SVF(), padLP = new OnePole(600), crashF = [new SVF(), new SVF()];
  const revL = new Reverb(3), revR = new Reverb(4);
  const ph = new Float64Array(64);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const end = 1 - smooth(V_HIT - 0.1, V_HIT + 0.4, v);
    // --- the crowd: a murmur that turns into shouting ---
    let cv = 0;
    for (let q = 0; q < 4; q++) {
      const amp = crowdE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.7) + q * 1.3) + white() * 0.25));
      cv += crowdF[q].run(white(), 420 + q * 260 + 120 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
    }
    const cg = (0.03 + 0.05 * smooth(4, 14, v)) * (1 - smooth(30, 40, v)) * end;
    l += cv * cg; r += cv * cg * 0.95;
    for (const c of shouts) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        ph[3] += c.f * (1.2 - 0.25 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(ph[3]);
        const vv = (shoutF[0].run(src, 750 + 200 * c.vow, 0.3).bp + 0.6 * shoutF[1].run(src, 1150 + 500 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // gulls (soft, high, falling cries)
    for (const gl of gulls) {
      const dt = v - gl.t;
      if (dt > 0 && dt < gl.d) {
        ph[5] += gl.f * (1.1 - 0.35 * dt / gl.d) / SR;
        const vv = Math.sin(TAU * ph[5] + 0.6 * Math.sin(TAU * ph[5] * 0.5)) * Math.sin(Math.PI * dt / gl.d) ** 2 * gl.g;
        l += vv * (1 - gl.pan) * 0.5; r += vv * (1 + gl.pan) * 0.5; wet += vv * 0.7;
      }
    }
    // the harbor draining: a hiss and gurgle of water running off the mud
    {
      const k = smooth(-2, 4, v) * (1 - smooth(25, 40, v));
      const gur = gurgE.run(Math.max(0, white()) * 1.5);
      const vv = (drainF[0].run(white(), 1800 + 600 * Math.sin(v * 0.7), 0.6).bp * 0.5 + drainF[1].run(white() * gur, 420, 0.15).bp * 0.8) * 0.05 * k;
      l += vv; r += vv * 0.9; wet += vv * 0.3;
    }
    // horns and a siren from the city
    for (const h of horns) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d + 0.1) {
        ph[1] += h.f / SR; ph[2] += h.f * 1.26 / SR;
        const e = Math.min(dt / 0.04, 1) * Math.min(1, (h.d + 0.1 - dt) / 0.08);
        const vv = hornF.run(saw(ph[1]) + saw(ph[2]), 900, 1.2).lp * e * h.g * end;
        l += vv * (1 - h.pan) * 0.5; r += vv * (1 + h.pan) * 0.5; wet += vv * 0.6;
      }
    }
    {
      const k = smooth(15, 19, v) * (1 - smooth(48, 54, v));
      ph[6] += (700 + 250 * Math.sin(TAU * 0.35 * v)) / SR;
      const vv = sirenF.run(saw(ph[6]), 1400, 0.8).lp * 0.012 * k;
      l += vv * 0.3; r += vv * 0.7; wet += vv;
    }
    // --- the wave's roar: a low thunder far off, louder and brighter as it comes ---
    {
      const d = Math.max(30, distAt(v));
      const g = Math.min(1.4, Math.pow(600 / d, 0.9)) * 0.22 * end;
      const fc = 90 + 900 * clamp(400 / d);
      const wn = white();
      const vv = roarF[0].run(wn, fc, 0.5).lp + 0.5 * roarF[1].run(wn, fc * 2.4, 0.7).bp + roarSub.run(white()) * 3.2 + roarSub2.run(white()) * 2 * Math.sin(v * 0.7);
      l += vv * g; r += (vv * 0.92 + roarF[2].run(wn, fc * 1.3, 0.6).lp * 0.3) * g; wet += vv * g * 0.25;
    }
    // --- the beats: a deep whoomp; a drone that climbs a semitone at each ---
    for (let i = 0; i < beats.length; i++) {
      const dt = v - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.2);
        ph[10 + (i % 2)] += (32 + 30 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const vv = (Math.sin(TAU * ph[10 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.8) * e * (0.2 + 0.02 * i);
        dl += vv; dr += vv;
      }
    }
    {
      let semis = 0;
      for (const b of beats) if (v >= b.v) semis += smooth(0, 0.6, v - b.v);
      const f0 = 46 * Math.pow(2, semis / 12);
      const dg = 0.04 * smooth(-0.8, 1.5, v) * end;
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[14 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[14 + q]) * (q === 0 ? 0.8 : 0.35); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.5;
    }
    // --- booms as it takes the Statue, the ferry, the island ---
    for (const b of booms) {
      const dt = v - b.t;
      if (dt > 0 && dt < 3) {
        ph[24] += (26 + 34 * Math.exp(-dt * 5)) / SR;
        const e = Math.min(dt / 0.03, 1) * Math.exp(-dt * 1.5) * b.g;
        const vv = (Math.sin(TAU * ph[24]) * 0.8 + boomF.run(white(), 90 + 140 * Math.exp(-dt * 4), 0.6).lp * 0.9) * e;
        dl += vv; dr += vv; wet += vv * 0.6;
      }
    }
    // --- the end: the lip comes down, a vast soft crash, then white ---
    {
      const dt = v - (V_HIT - 0.25);
      if (dt > 0) {
        const e = Math.min(dt / 0.25, 1) * (0.6 + 0.4 * Math.exp(-dt * 0.8));
        const vv = (crashF[0].run(white(), 500, 0.5).lp * 1.2 + crashF[1].run(white(), 2200, 0.7).bp * 0.4 + roarSub.run(white()) * 2) * e * 0.35;
        l += vv; r += vv * 0.95; wet += vv * 0.3;
      }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }
  {   // inside the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.6 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi; R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.6); R[n] = Math.tanh(R[n] * 1.6);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const gn = 0.89 / peak;
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
