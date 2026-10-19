// Procedural soundtrack for "What if you stood on Jupiter?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) Inside your helmet: your breathing and
// heartbeat, the wind rushing past you (louder the faster you fall), the jet stream slamming into you, a warm
// swell as the Sun sets, the hiss inside the clouds, thunder rolling in the storm layer, rain, then near-silence
// in the dark (only you); the probe's slow metal groan; the glowing air as a rising roar, your visor cracking
// (a muffled crunch and a glassy ring, no sharp click), soft chimes for the diamonds, the deep ocean surging,
// and everything rising into the white, which turns back into the wind at the start (the video loops).
// No sharp clicks or crackles anywhere: every impact is soft.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, T_SWITCH, BOLTS, V_WIND, V_SUNSET, V_LAMP, V_PROBE, V_CRACK, V_DIAMOND, V_OCEAN, V_METAL, V_WHITE, V_GLOW, V_BASE3 } from './src/timeline.js';
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
  run(x, fb = 0.86, damp = 0.35) {
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

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);          // synthesis starts LOOP s before the first frame; that lead-in becomes the end
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;

  // ---- scheduled events ----
  // thunder: each flash rumbles in a moment later (farther = later, deeper, longer)
  const thunder = BOLTS.map(([t, x, y, z, g]) => {
    const d = Math.hypot(x, z);
    return { t: t + d / 4, g: Math.min(0.9, g * 0.8 * (6 / (d + 2))), dur: 1.4 + d * 0.12, pan: Math.max(-0.8, Math.min(0.8, x / (d + 1))) };
  });
  // diamond chimes: sparse soft bells
  const chimes = [];
  for (let t = V_DIAMOND + 0.3; t < V_OCEAN + 2; t += 0.18 + R0() * 0.5) chimes.push({ t, f: [2093, 2349, 2637, 3136, 3520, 4186][Math.floor(R0() * 6)] * (R0() < 0.3 ? 0.5 : 1), g: 0.012 + R0() * 0.02, pan: R0() * 1.6 - 0.8 });

  const windF = new SVF(), windF2 = new SVF(), windL = new OnePole(300), gustF = new SVF();
  const hissF = new SVF(), rainF = new SVF(), rainF2 = new SVF();
  const breathF = new SVF(), breathE = new OnePole(8);
  const thunL = new SVF(), thunR = new SVF(), thunSub = new OnePole(45);
  const roarL = new SVF(), roarR = new SVF(), roarHi = new SVF(), roarSub = new OnePole(40);
  const padLP = new OnePole(900), droneLP = new OnePole(260), groanF = new SVF(), crunchF = new SVF(), slamF = new SVF();
  const surgeF = new SVF(), surgeSub = new OnePole(35);
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(64);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0;     // the world outside (muffled through the helmet)
    let dl = 0, dr = 0;            // you: breath, heart (not muffled)

    // --- wind rushing past: louder and brighter the faster you fall; the jet stream slams in from the side ---
    const fallK = smooth(-2, 6, v) * 0.6 + 0.4 * smooth(6, 20, v) - 0.5 * smooth(V_BASE3, V_LAMP + 1, v) + 0.3 * smooth(V_GLOW, 55, v);
    const slam = smooth(V_WIND - 0.1, V_WIND + 0.4, v) * (1 - smooth(12, 16.5, v));
    const windG = (0.05 + 0.07 * fallK + 0.12 * slam) * (1 - smooth(T_SWITCH - 0.6, T_SWITCH, v) * 0.5);
    {
      const wn = white();
      const fc = 400 + 600 * fallK + 700 * slam + 200 * Math.sin(v * 0.7);
      const a = windF.run(wn, fc, 0.6).bp, b = windF2.run(wn, fc * 0.45, 0.9).bp;
      const lo = windL.run(wn) * 2.5;
      const gust = 0.75 + 0.25 * Math.sin(v * 1.3 + Math.sin(v * 0.37) * 2);
      l += (a * 0.8 + b * 0.5 + lo * 0.4) * windG * gust * (1 + 0.5 * slam); r += (a * 0.6 + b * 0.6 + lo * 0.4) * windG * gust * (1 - 0.3 * slam);
    }
    // the slam itself: a deep soft whoomp and a rushing swell from the right
    {
      const dt = v - V_WIND;
      if (dt > -0.05 && dt < 2.5) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.12, 1) * Math.exp(-Math.max(dt, 0) * 1.6);
        ph[1] += (32 + 30 * Math.exp(-Math.max(dt, 0) * 3)) / SR;
        const vv = (Math.sin(TAU * ph[1]) * 0.8 + slamF.run(white(), 160, 0.6).lp * 1.2) * e * 0.5;
        dl += vv * 0.8; dr += vv;
      }
    }
    // --- inside a cloud deck: a dense, soft hiss ---
    const inK = Math.max(s.in1, s.in2 * 0.7, s.in3 * 0.6);
    if (inK > 0.001) {
      const vv = hissF.run(white(), 2400, 0.7).bp * inK * 0.07;
      l += vv; r += vv * 0.95; wet += vv * 0.3;
    }
    // --- rain under the storms ---
    if (s.rain > 0.001) {
      const vv = rainF.run(white(), 3600, 0.6).bp * 0.5 + rainF2.run(white(), 1100, 0.8).bp * 0.4;
      l += vv * s.rain * 0.08; r += vv * s.rain * 0.08; wet += vv * s.rain * 0.04;
    }
    // --- thunder: deep rolling rumbles ---
    let th = 0, tp = 0;
    for (const q of thunder) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.dur + 2) {
        const e = Math.min(dt / 0.15, 1) * Math.exp(-Math.max(0, dt - 0.1) * (2.2 / q.dur)) * q.g * (0.7 + 0.3 * Math.sin(dt * 9 + q.t));
        th += e; tp += e * q.pan;
      }
    }
    if (th > 0) {
      const sub = thunSub.run(white()) * 3;
      const pn = tp / th, k = Math.tanh(th) * 0.5;
      l += (thunL.run(white(), 140, 0.5).lp + sub) * k * (1 - pn * 0.5); r += (thunR.run(white(), 150, 0.5).lp + sub) * k * (1 + pn * 0.5); wet += sub * k * 0.5;
    }
    // --- the probe: a slow, low metal groan as it crumples ---
    if (s.probe > 0.01) {
      ph[3] += (62 + 6 * Math.sin(v * 1.7)) / SR;
      const vv = groanF.run(saw(ph[3]) + 0.5 * saw(ph[3] * 1.51), 230 + 60 * Math.sin(v * 0.9), 2.2).bp * 0.035 * s.probe * (0.6 + 0.4 * Math.sin(v * 0.6));
      l += vv * 0.7; r += vv * 1.1; wet += vv * 1.2;
    }
    // --- the glowing air: a roar that rises toward the end; the ocean surges under it ---
    const roarK = smooth(V_GLOW - 1, 52, v) * 0.35 + smooth(52, V_OCEAN, v) * 0.15 + smooth(V_OCEAN, V_WHITE + 1, v) * 0.5;
    const roarG = 0.28 * roarK * (1 - smooth(T_SWITCH - 0.5, T_SWITCH - 0.05, v));
    if (roarG > 0.0005) {
      const fc = 120 + 900 * roarK * roarK;
      const sub = roarSub.run(white()) * 3;
      const hi = roarHi.run(white(), 1500 + 1500 * roarK, 0.8).bp * roarK * 0.3;
      l += (roarL.run(white(), fc, 0.5).lp + sub * 0.5 + hi) * roarG; r += (roarR.run(white(), fc * 1.05, 0.5).lp + sub * 0.5 + hi) * roarG;
    }
    if (s.ocean > 0.01) {
      const sw = 0.5 + 0.5 * Math.sin(v * 1.1 + Math.sin(v * 0.4) * 1.5);
      const vv = (surgeSub.run(white()) * 3 + surgeF.run(white(), 90 + 60 * sw, 0.7).lp) * s.ocean * 0.12 * sw * (1 - smooth(T_SWITCH - 0.6, T_SWITCH, v));
      l += vv; r += vv * 0.9;
    }
    // --- the visor cracks: a muffled crunch and a glassy ring ---
    {
      const dt = v - V_CRACK;
      if (dt > 0 && dt < 2.5) {
        const e = Math.min(dt / 0.012, 1) * Math.exp(-dt * 9);
        const cr = crunchF.run(white(), 900, 1.2).bp * e * 0.35;
        ph[5] += 1760 / SR; ph[6] += 2637 / SR;
        const ring = (Math.sin(TAU * ph[5]) + 0.5 * Math.sin(TAU * ph[6])) * Math.min(dt / 0.02, 1) * Math.exp(-dt * 2.2) * 0.03;
        // a second, smaller one as the crack spreads
        const dt2 = dt - 0.55;
        const e2 = dt2 > 0 ? Math.min(dt2 / 0.012, 1) * Math.exp(-dt2 * 10) : 0;
        dl += cr + ring + crunchF.run(white(), 1300, 1.2).bp * e2 * 0.2; dr += cr * 0.9 + ring;
      }
    }
    // --- diamond chimes ---
    for (const q of chimes) {
      const dt = v - q.t;
      if (dt > 0 && dt < 2.2) {
        const e = Math.min(dt / 0.006, 1) * Math.exp(-dt * 3.2) * q.g * smooth(V_DIAMOND, V_DIAMOND + 1, v) * (1 - smooth(V_OCEAN, V_OCEAN + 2, v));
        const vv = (Math.sin(TAU * q.f * dt) + 0.3 * Math.sin(TAU * q.f * 2.76 * dt) * Math.exp(-dt * 6)) * e;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 1.4;
      }
    }

    // --- music bed: a warm swell at sunset, then a low drone that sinks as you go deeper ---
    {
      const sw = smooth(V_WIND + 2, V_SUNSET - 0.5, v) * (1 - smooth(V_SUNSET + 2, V_SUNSET + 7, v));
      if (sw > 0.001) {
        let pv = 0;
        [130.81, 196.0, 261.63, 329.63, 392.0].forEach((f, k) => { ph[10 + k] += (f * (1 + 0.0015 * k)) / SR; pv += saw(ph[10 + k]) * (k === 0 ? 0.7 : 0.4); });
        pv = padLP.run(pv) * 0.035 * sw;
        dl += pv; dr += pv; wet += pv * 0.8;
      }
      const deep = smooth(V_SUNSET, 30, v);
      const f0 = 65.4 * Math.pow(2, -smooth(20, V_WHITE, v) * 7 / 12);
      const dg = 0.05 * deep * (1 - smooth(T_SWITCH - 0.5, T_SWITCH, v)) * (1 + 0.6 * smooth(V_GLOW, V_WHITE, v));
      if (dg > 0.0005) {
        let pv = 0;
        [1, 1.5, 2, 2.38].forEach((m, k) => { ph[20 + k] += (f0 * m * (1 + 0.002 * k)) / SR; pv += saw(ph[20 + k]) * (k === 0 ? 0.8 : 0.35); });
        pv = droneLP.run(pv) * dg;
        dl += pv; dr += pv; wet += pv * 0.6;
      }
      // the end: a bright tone rising into the white
      if (v > V_METAL && v < T_SWITCH) {
        const e = smooth(V_METAL, V_WHITE + 1, v) * (1 - smooth(T_SWITCH - 0.5, T_SWITCH - 0.05, v)) * 0.03;
        ph[30] += 1046.5 / SR; ph[31] += 1568 / SR;
        const vv = (Math.sin(TAU * ph[30]) + 0.5 * Math.sin(TAU * ph[31])) * e;
        dl += vv; dr += vv; wet += vv;
      }
    }

    // --- you: breathing in the helmet (faster when scared), your heart ---
    {
      const fear = 0.2 + 0.3 * smooth(V_WIND, V_WIND + 1, v) + 0.2 * smooth(V_LAMP - 3, V_LAMP, v) + 0.3 * smooth(V_CRACK - 0.5, V_CRACK + 0.5, v);
      const bRate = 0.3 + 0.35 * fear;
      ph[40] += bRate / SR;
      const bp = ph[40] % 1;
      const inhale = bp < 0.42 ? Math.sin(Math.PI * bp / 0.42) : 0;
      const exhale = bp >= 0.42 ? Math.sin(Math.PI * (bp - 0.42) / 0.58) * 0.7 : 0;
      const be = breathE.run((inhale + exhale) * (0.4 + 0.6 * fear)) * (1 - smooth(V_WHITE, T_SWITCH - 0.4, v));
      const bn = breathF.run(white(), 800 + 600 * inhale, 0.5).bp * be * 0.07;
      dl += bn; dr += bn;
      const hb = 1.1 + 0.9 * fear;
      ph[41] += hb / SR;
      const hp = ph[41] % 1;
      const lub = Math.exp(-Math.pow((hp - 0.05) / 0.03, 2)), dub = 0.7 * Math.exp(-Math.pow((hp - 0.3) / 0.03, 2));
      ph[42] += 46 / SR;
      const heart = Math.sin(TAU * ph[42]) * (lub + dub) * 0.16 * (0.4 + 0.8 * fear) * (1 - smooth(V_WHITE, T_SWITCH - 0.4, v));
      dl += heart; dr += heart;
    }

    // the helmet muffles the outside a little; more in the dark quiet
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.7, outR = r + dr + rr * 0.7;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // inside the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.3 * SR);
    for (let i = 0; i < N0; i++) {
      const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.8); R[n] = Math.tanh(R[n] * 1.8);
    if (!Number.isFinite(L[n]) || !Number.isFinite(R[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  }
  const gn = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {   // no fade at the ends: they join up when the video loops
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
