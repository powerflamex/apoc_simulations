// Procedural soundtrack for "What if the Moon fell to Earth?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// A warm night on the rooftop (the pool, voices, the city), a low tone that swells as the Moon nears; the sea
// rising (rumble and rushing water) and earthquakes; a deep crack and grinding as the Moon breaks; meteors
// whistling in and booming on the horizon; the impact and a roar into the white, which turns back into the
// rooftop at the start (the video loops).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, V_BREAK, V_METEORS, V_IMPACT, T_SWITCH, METEORS } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000, TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF { constructor() { this.l = 0; this.b = 0; } run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 30), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; } }
class Reverb {
  constructor(seed) { const r = rng(seed); this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 })); this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 })); }
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
  const N = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const N0 = Math.round(LOOP * SR);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(384);
  const white = () => R0() * 2 - 1;
  // the falling pieces (same schedule as moon.js): a whistle once it starts burning in, a boom when it lands
  // (the closer the hit, the louder; the shockwave arrives as a second, longer rumble that shakes everything)
  const booms = METEORS.flatMap((m) => [{ t: m.land, g: m.g * (0.85 + R0() * 0.3), pan: m.pan, k: 2.2 },
    ...(m.amp > 0.3 ? [{ t: m.arrive, g: m.g * 0.8, pan: m.pan * 0.5, k: 0.9 }] : [])]);
  const whistles = METEORS.map((m) => ({ t: m.t0 + m.dur * 0.3, end: m.land, f0: 1400 + R0() * 1200, pan: m.pan }));

  const crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const lapLP = new OnePole(900), cityLP = new OnePole(180), cityLP2 = new OnePole(120), padLP = new OnePole(500), humLP = new OnePole(200);
  const rumbleLP = new OnePole(70), rumbleLP2 = new OnePole(50), surgeF = new SVF(), crackLP = new OnePole(140), grindF = new SVF();
  const boomLP = new OnePole(90), boomLP2 = new OnePole(60), whistleF = new SVF(), roarLP = new OnePole(250), roarLP2 = new OnePole(160), swellF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(32);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0;
    const calm = 1 - smooth(2.5, 7, v);
    // the rooftop: pool lapping, voices, the city far below
    const lap = lapLP.run(white()) * 0.05 * (0.6 + 0.4 * Math.sin(v * 1.6)) * (1 - smooth(3, 6, v));
    l += lap; r += lap * 0.9;
    if (calm > 0.01) {
      let cv = 0;
      for (let k = 0; k < 5; k++) { const a = crowdE[k].run(Math.max(0, Math.sin(v * (2.0 + k * 0.6) + k) + white() * 0.25)); cv += crowdF[k].run(white(), 380 + k * 220 + 100 * Math.sin(v * (1.1 + k * 0.3)), 0.3).bp * a; }
      const c = cityLP2.run(cityLP.run(white())) * 2.4;
      l += (cv * 0.04 + c * 0.05) * calm; r += (cv * 0.038 + c * 0.05) * calm; wet += cv * 0.02 * calm;
    }
    // the Moon's tone: a low, slowly beating chord that swells as it comes closer
    {
      const g = 0.05 * (0.4 + 0.6 * smooth(0, V_BREAK, v)) * (1 - smooth(V_IMPACT, V_IMPACT + 0.5, v));
      let pv = 0;
      [55, 82.4, 110, 130.8].forEach((f, k) => { ph[k] += f * (1 + 0.002 * k + 0.004 * smooth(0, V_BREAK, v)) / SR; pv += saw(ph[k]) * [0.6, 0.4, 0.35, 0.25][k]; });
      padLP.set(250 + 900 * smooth(0, V_BREAK, v));
      pv = padLP.run(pv) * g;
      l += pv; r += pv; wet += pv * 0.6;
    }
    // the sea rising and earthquakes
    {
      const sea = smooth(2, 6, v) * (1 - smooth(V_IMPACT + 0.5, V_IMPACT + 2, v));
      const ru = rumbleLP2.run(rumbleLP.run(white())) * (5 * s.quake + 1.5 * sea);
      const su = surgeF.run(white(), 380 + 220 * Math.sin(v * 0.7), 0.5).bp * 0.07 * sea * (0.6 + 0.4 * Math.sin(v * 1.1) * Math.sin(v * 0.43));
      l += ru + su; r += ru * 0.96 + su * 1.1; wet += su * 0.3;
    }
    // the break: a deep crack, then grinding rock
    {
      const dt = v - V_BREAK;
      if (dt > -0.05 && dt < 4) {
        const c = crackLP.run(white()) * 9 * Math.exp(-Math.max(dt, 0) * 2.2) * smooth(-0.05, 0.02, dt);
        ph[8] += (35 + 25 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const sub = Math.sin(TAU * ph[8]) * 0.45 * Math.exp(-Math.max(dt, 0) * 0.9) * smooth(-0.05, 0.05, dt);
        l += c + sub; r += c * 0.95 + sub; wet += c * 0.5;
      }
      const gr = smooth(V_BREAK, V_BREAK + 2, v) * (1 - smooth(V_METEORS, V_METEORS + 4, v));
      if (gr > 0) { const x = grindF.run(white() * (R0() < 0.05 ? 4 : 1), 220 + 120 * Math.sin(v * 3.1), 0.7).bp * gr * 0.12; l += x; r += x * 0.9; wet += x * 0.4; }
    }
    // meteors: a whistle coming in, a boom on the horizon
    for (const w of whistles) {
      if (v > w.t && v < w.end) {
        const k = (v - w.t) / (w.end - w.t);
        const x = whistleF.run(white(), w.f0 * (1 - 0.6 * k), 0.15).bp * 0.05 * Math.sin(Math.PI * Math.min(k * 1.2, 1));
        l += x * (1 - w.pan) * 0.5; r += x * (1 + w.pan) * 0.5; wet += x * 0.3;
      }
    }
    for (const b of booms) {
      const dt = v - b.t;
      if (dt > -0.01 && dt < 5) {
        const x = boomLP2.run(boomLP.run(white())) * 6 * b.g * Math.exp(-Math.max(dt, 0) * b.k) * smooth(-0.01, 0.03, dt);
        l += x * (1 - b.pan * 0.4); r += x * (1 + b.pan * 0.4); wet += x * 0.6;
      }
    }
    // the impact and the roar into the white
    {
      const dt = v - V_IMPACT;
      if (dt > -0.02) {
        const hit = boomLP2.run(boomLP.run(white())) * 14 * Math.exp(-Math.max(dt, 0) * 0.7) * smooth(-0.02, 0.05, dt);
        const roar = roarLP2.run(roarLP.run(white())) * 9 * smooth(0, 1.2, dt) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH + 0.2, v));
        l += hit + roar; r += hit * 0.97 + roar; wet += hit * 0.4;
      }
      const sw = smooth(V_IMPACT + 0.5, T_SWITCH, v) * (1 - smooth(T_SWITCH, T_SWITCH + 0.3, v));
      if (sw > 0) { const x = swellF.run(white(), 300 + 5000 * sw * sw, 0.6).bp * sw * 0.18; l += x; r += x; wet += x * 0.8; }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    if (n < 0) { PL[n + N0] = l + rl * 0.8; PR[n + N0] = r + rr * 0.8; } else { L[n] = l + rl * 0.8; R[n] = r + rr * 0.8; }
  }
  {   // inside the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.3 * SR);
    for (let i = 0; i < N0; i++) { const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2); L[a + i] = L[a + i] * wo + PL[i] * wi; R[a + i] = R[a + i] * wo + PR[i] * wi; }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.8); R[n] = Math.tanh(R[n] * 1.8);
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
