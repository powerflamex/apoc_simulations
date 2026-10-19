// Procedural soundtrack for "What if every electron disappeared?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Shibuya at noon (the crowd, the crossing's bird-chirp signal, music bleeding from the screens, idling engines);
// at V_EVENT everything cuts out: a deep drop, then a thin eerie drone in the silence; a crackle and a rising tone
// as the nuclei push apart, into a roar and the white. In space: a boom as Earth bursts, one at the Moon, a huge one
// at the Sun, softer ones out at Jupiter and Neptune; a swell into the white, which turns back into the street.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, V_EVENT, V_REPEL, V_WHITE, V_SPACE, V_MOON, V_SUNHIT, T_SWITCH } from './src/timeline.js';
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
  const R0 = rng(77);
  const white = () => R0() * 2 - 1;
  const crowdF = Array.from({ length: 6 }, () => new SVF()), crowdE = Array.from({ length: 6 }, () => new OnePole(3));
  const trafLP = new OnePole(160), trafLP2 = new OnePole(110), musLP = new OnePole(1800), dropLP = new OnePole(80), dropLP2 = new OnePole(60);
  const droneLP = new OnePole(900), crackF = new SVF(), roarLP = new OnePole(300), roarLP2 = new OnePole(200), boomLP = new OnePole(70), boomLP2 = new OnePole(55), swellF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(32);
  const booms = [[V_SPACE + 0.1, 1.0, 1.4], [V_MOON, 0.7, 1.6], [V_SUNHIT, 1.2, 0.9], [50.6, 0.45, 1.8], [56.0, 0.4, 1.8]];
  const chirp = (t) => {   // the crossing signal: "piyo-piyo" chirps
    const cyc = ((t % 1.2) + 1.2) % 1.2;
    const on = (cyc < 0.11) || (cyc > 0.16 && cyc < 0.27);
    if (!on) return 0;
    const k = cyc < 0.11 ? cyc / 0.11 : (cyc - 0.16) / 0.11;
    const f = 2600 + 900 * Math.sin(k * Math.PI);
    ph[0] += f / SR;
    return Math.sin(TAU * ph[0]) * Math.sin(Math.PI * k);
  };
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0;
    const before = 1 - smooth(V_EVENT - 0.004, V_EVENT + 0.004, v);   // everything cuts out at once
    if (before > 0.0001) {
      let cv = 0;
      for (let k = 0; k < 6; k++) {
        const a = crowdE[k].run(Math.max(0, Math.sin(v * (2.1 + k * 0.6) + k * 1.3) + white() * 0.25));
        cv += crowdF[k].run(white(), 360 + k * 220 + 110 * Math.sin(v * (1.2 + k * 0.4)), 0.3).bp * a;
      }
      const tr = trafLP2.run(trafLP.run(white())) * 2.5;
      ph[1] += 31 / SR; ph[2] += 46.5 / SR;   // idling engines
      const idle = (saw(ph[1]) * 0.5 + saw(ph[2]) * 0.3) * 0.03;
      // pop music leaking from the big screens: a simple bright chord loop with a beat
      const beat = (v * 2.1) % 1, chord = [[523.3, 659.3, 784], [587.3, 740, 880], [493.9, 622.3, 740], [523.3, 659.3, 784]][Math.floor((v * 2.1) / 4) & 3];
      let mu = 0;
      chord.forEach((f, i) => { ph[3 + i] += f / SR; mu += saw(ph[3 + i]) * 0.3; });
      mu = musLP.run(mu) * 0.035 * (0.6 + 0.4 * Math.exp(-beat * 6));
      const kick = Math.sin(TAU * (60 + 80 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 12) * 0.05;
      const ch = chirp(v) * 0.03;
      l += (cv * 0.05 + tr * 0.05 + idle + mu * 0.9 + kick + ch) * before;
      r += (cv * 0.048 + tr * 0.05 + idle + mu * 1.1 + kick + ch * 0.8) * before;
      wet += (cv * 0.02 + mu * 0.3 + ch * 0.6) * before;
    }
    // the drop as they vanish: a deep thump and a fading ring
    {
      const dt = v - V_EVENT;
      if (dt > 0 && dt < 3) {
        ph[8] += (38 + 30 * Math.exp(-dt * 6)) / SR;
        const d = Math.sin(TAU * ph[8]) * Math.exp(-dt * 1.4) * 0.5 + dropLP2.run(dropLP.run(white())) * 4 * Math.exp(-dt * 3);
        ph[9] += 1760 / SR;
        const ring = Math.sin(TAU * ph[9]) * Math.exp(-dt * 1.2) * 0.02;
        l += d + ring; r += d + ring * 0.9; wet += ring * 2;
      }
    }
    // the ghost world: a thin, eerie drone; then crackle and a rising tone as the nuclei push apart
    if (v > V_EVENT && v < V_SPACE + 0.5) {
      const g = smooth(V_EVENT + 0.5, V_EVENT + 3, v) * (1 - smooth(V_WHITE, V_SPACE + 0.4, v));
      let dv = 0;
      [110, 164.8, 233.1, 329.6].forEach((f, i) => { ph[10 + i] += f * (1 + 0.004 * Math.sin(v * 0.3 + i)) / SR; dv += Math.sin(TAU * ph[10 + i]) * [0.4, 0.3, 0.2, 0.15][i]; });
      dv = droneLP.run(dv) * 0.06 * g;
      const rep = smooth(V_REPEL, V_WHITE, v);
      const cr = crackF.run(white() * (R0() < 0.01 + 0.08 * rep ? 8 : 0.3), 2500 + 3000 * rep, 0.5).bp * rep * 0.08;
      ph[14] += (180 + 900 * rep * rep) / SR;
      const rise = Math.sin(TAU * ph[14]) * rep * rep * 0.05;
      const ro = roarLP2.run(roarLP.run(white())) * 6 * Math.pow(rep, 3);
      l += dv + cr + rise + ro; r += dv + cr * 0.9 + rise + ro; wet += dv * 0.8 + rise;
    }
    // booms in space
    for (const [t0, g, dec] of booms) {
      const dt = v - t0;
      if (dt > -0.01 && dt < 5) {
        const b = boomLP2.run(boomLP.run(white())) * 8 * g * Math.exp(-Math.max(dt, 0) * dec) * smooth(-0.01, 0.03, dt);
        ph[15] += (34 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        const sub = Math.sin(TAU * ph[15]) * g * 0.35 * Math.exp(-Math.max(dt, 0) * dec * 1.3) * smooth(-0.01, 0.02, dt);
        l += b + sub; r += b + sub; wet += b * 0.5;
      }
    }
    // space pad and the swell into the white
    if (v > V_SPACE - 0.2) {
      let pv = 0;
      [55, 82.4, 110, 164.8, 220].forEach((f, i) => { ph[18 + i] += f * (1 + 0.003 * Math.sin(v + i)) / SR; pv += Math.sin(TAU * ph[18 + i]) * 0.25; });
      pv *= 0.06 * smooth(V_SPACE, V_SPACE + 2, v) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH, v));
      const sw = smooth(T_SWITCH - 4, T_SWITCH, v) * (1 - smooth(T_SWITCH, T_SWITCH + 0.3, v));
      const x = swellF.run(white(), 300 + 5000 * sw * sw, 0.6).bp * sw * 0.2;
      l += pv + x; r += pv + x; wet += pv + x * 0.8;
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
