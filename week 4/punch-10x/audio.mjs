// Procedural soundtrack for "What if every punch was 10x stronger?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) Downtown LA at golden hour: traffic and people
// talking. Every punch: the swish of the arm, then the hit, bigger every time: a dull thud on the bricks, the wall
// bursting (a deep crunch and bricks pattering down), the car (a crunch, glass), the bus (a heavy metal boom), then
// blasts: a boom with a sub-bass drop and a rolling rumble that gets longer and lower with every punch; glass showers,
// car alarms, screams as people run. From punch 12 each blast is a nuclear-sized roar; in space the booms go dull and
// distant under a low drone that climbs one step per punch. The Moon: a huge boom; Earth: the biggest, white noise
// swelling into the white, which turns back into the street at the start (the loop).
// No sharp clicks or crackles anywhere (they read as "plastic breaking"): every impact has a soft (8 ms+) onset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, V_LAST, vPunch, N_PUNCH, shotAt, inSpace } from './src/timeline.js';
import { V_RUN } from './src/layout.js';
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
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;

  // ---- scheduled events ----
  const punches = [];
  for (let n = 1; n <= N_PUNCH; n++) punches.push({ n, v: vPunch(n), big: clamp((n - 2) / 14), huge: clamp((n - 11) / 8), space: inSpace(shotAt(vPunch(n) + 0.1).k) ? 1 : 0 });
  // debris pattering down after the hits near you: soft low taps
  const taps = [];
  for (const p of punches) {
    if (p.n < 2 || p.n > 11) continue;
    const n = p.n === 2 ? 26 : 10 + p.n * 2;
    for (let k = 0; k < n; k++) taps.push({ t: p.v + 0.2 + Math.pow(R0(), 0.7) * (0.6 + 0.12 * p.n), f: 55 + R0() * 80, g: (p.n === 2 ? 0.035 : 0.02) * (0.5 + R0()), pan: R0() * 1.6 - 0.8 });
  }
  // glass: soft shimmers as the windows go (punches 3-9)
  const glass = [];
  for (const n of [3, 4, 5, 6, 7, 8, 9]) glass.push({ t: vPunch(n) + 0.05 + 0.05 * (n - 3), g: 0.03 + 0.012 * (n - 3), pan: (R0() - 0.5) * 0.8 });
  // car alarms after the bus flips; screams when people run and when the blasts knock them over
  const alarms = [];
  for (let i = 0; i < 7; i++) alarms.push({ t: vPunch(4) + 0.3 + R0() * 2.5, end: vPunch(9) + 1 + R0() * 3, f: 820 + R0() * 380, rate: 1.6 + R0() * 1.4, kind: i % 3, g: 0.006 + 0.005 * R0(), pan: R0() * 1.6 - 0.8 });
  const cries = [];
  for (let k = 0; k < 14; k++) cries.push({ t: V_RUN - 0.1 + R0() * 1.8, f: 220 + R0() * 260, d: 0.5 + R0() * 0.6, g: 0.008 + 0.009 * R0(), pan: R0() * 1.6 - 0.8, vow: R0() });
  for (let k = 0; k < 10; k++) cries.push({ t: vPunch(5) + 0.1 + R0() * 1.2, f: 260 + R0() * 300, d: 0.4 + R0() * 0.5, g: 0.008 + 0.008 * R0(), pan: R0() * 1.6 - 0.8, vow: R0() });

  const cityLP = new OnePole(260), cityLP2 = new OnePole(170);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const cryF = [new SVF(), new SVF()];
  const swishF = [new SVF(), new SVF()], thudF = new SVF(), crunchF = new SVF(), blastF = new SVF(), rumF = [new SVF(), new SVF()], rumSub = new OnePole(45);
  const tapF = new SVF(), roarF = [new SVF(), new SVF()], roarSub = new OnePole(55), metalF = [new SVF(), new SVF()];
  const glassF = [new SVF(), new SVF()], alarmF = new SVF(), windF = [new SVF(), new SVF()], windSub = new OnePole(70);
  const padLP = new OnePole(500), endF = new SVF(), endSub = new OnePole(40);
  const muffL = new OnePole(12000), muffR = new OnePole(12000), spaceS = new OnePole(12);
  const revL = new Reverb(3), revR = new Reverb(4);
  const ph = new Float64Array(96);

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;   // d*: not muffled in space (the drone, the deep booms)
    // in space everything outside is dull and distant; the cuts back down to you in the crater bring the roar back
    const space = spaceS.run(v < 31.5 ? 0 : inSpace(shotAt(v).k) ? 1 : 0);

    // --- the street: traffic and people talking, until the blasts take it ---
    const life = 1 - smooth(vPunch(5), vPunch(7), v);
    const city = cityLP2.run(cityLP.run(white())) * 0.07 * (0.3 + 0.7 * life) * (1 - smooth(14, 18, v));
    l += city; r += city * 0.92;
    let cv = 0;
    for (let q = 0; q < 5; q++) {
      const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.7) + q * 1.3) + white() * 0.2));
      cv += talkF[q].run(white(), 380 + q * 230 + 100 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
    }
    const talk = 1 - smooth(vPunch(2), vPunch(3) + 0.5, v);
    l += cv * 0.035 * talk; r += cv * 0.033 * talk;
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        ph[2] += c.f * (1.2 - 0.3 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(ph[2]);
        const vv = (cryF[0].run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * cryF[1].run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // a steady wind once the city is gone and you're high above it (the air still roaring)
    {
      const wl = smooth(14, 20, v) * (1 - space * 0.9) * 0.08;
      if (wl > 0.001) {
        const wn = white();
        const a = windF[0].run(wn, 420 + 120 * Math.sin(v * 0.4), 0.7).bp, b = windF[1].run(wn, 950, 0.9).bp * 0.5;
        const lo = windSub.run(white()) * 2;
        l += (a + b + lo) * wl; r += (a * 0.9 + b + lo) * wl;
      }
    }

    // --- every punch: the swish of the arm, then the hit, then (from punch 5) the blast and its rumble ---
    let rum = 0;
    for (let i = 0; i < punches.length; i++) {
      const p = punches[i];
      const dt = v - p.v;
      if (dt < -0.2 || dt > 9) continue;
      // the swish (only while you're on screen)
      if (p.n <= 9 && dt > -0.16 && dt < 0.05) {
        const k = (dt + 0.16) / 0.21;
        const e = Math.sin(Math.PI * k) * (0.05 + 0.012 * p.n);
        const w = white();
        const sv = swishF[0].run(w, 900 + 2500 * k, 0.9).bp * e, sr = swishF[1].run(w, 1000 + 2700 * k, 0.9).bp * e;
        l += sv; r += sr;
      }
      if (dt < -0.02) continue;
      // the knock itself: a short deep thud (soft 8 ms onset), the bricks / the car / the bus give it a crunch
      if (dt < 1.0) {
        const e = env(dt + 0.02, 0.008, 0.07 + 0.05 * p.big) * (0.35 + 0.3 * p.big) * (1 - 0.6 * p.space);
        ph[13] += (80 + 90 * Math.exp(-Math.max(dt, 0) * 16) - 20 * p.big) / SR;
        const body = Math.tanh(3 * Math.sin(TAU * ph[13])) * 0.55;
        const grit = crunchF.run(white(), 600 + 900 * Math.exp(-Math.max(dt, 0) * 10), 0.7).lp * (p.n >= 2 && p.n <= 4 ? 1.6 : 0.8);
        const cv2 = (body + grit) * e;
        dl += cv2; dr += cv2; wet += cv2 * 0.5;
      }
      // the bus: a heavy metal boom and scrape as it rolls over
      if (p.n === 4 && dt < 2.5) {
        const e = env(dt, 0.012, 0.6) * 0.22 + env(dt - 0.9, 0.05, 0.5) * 0.12;
        const mv = (metalF[0].run(white(), 230 + 40 * Math.sin(dt * 7), 0.15).bp + 0.6 * metalF[1].run(white(), 410, 0.12).bp) * e;
        l += mv; r += mv * 0.95; wet += mv * 0.7;
      }
      // the blast (punch 3 on): a boom with a falling sub-bass and a burst of low noise
      if (p.n >= 3 && dt < 6) {
        ph[10 + (i % 3)] += (24 + (45 + 20 * p.big) * Math.exp(-Math.max(dt, 0) * (7 - 3 * p.huge))) / SR;
        const e = env(dt + 0.02, 0.02, 0.2 + 0.6 * p.big + 0.6 * p.huge) * (1 - smooth(3.5, 6, dt));
        const g = Math.min(0.2 + 0.08 * p.n, 1.0);
        const vv = (Math.tanh(2.2 * Math.sin(TAU * ph[10 + (i % 3)])) * 0.75 + thudF.run(white(), 140 + 380 * Math.exp(-Math.max(dt, 0) * 8), 0.7).lp * 1.3) * e * g;
        dl += vv; dr += vv; wet += vv * 0.5;
        const bb = blastF.run(white(), 280 + 900 * p.big * Math.exp(-Math.max(dt, 0) * 4), 0.6).lp * env(dt + 0.02, 0.025, 0.12 + 0.4 * p.big) * (0.12 + 0.55 * p.big) * (1 - 0.7 * p.space);
        l += bb; r += bb; wet += bb * 0.7;
      }
      rum += env(dt, 0.15, 0.6 + 1.6 * p.big + 1.5 * p.huge) * (p.n >= 4 ? 0.1 + 0.6 * p.big + 0.4 * p.huge : 0);
      // from punch 12: the roar of the fireball rolling up (long, low)
      if (p.n >= 12 && dt < 7) {
        const ee = env(dt - 0.1, 0.25, 1.8) * 0.35 * (1 - 0.6 * p.space);
        const rv = (roarF[0].run(white(), 180 + 400 * Math.exp(-dt * 1.2), 0.5).lp + roarSub.run(white()) * 2.2) * ee;
        l += rv; r += rv * 0.95; wet += rv * 0.3;
      }
    }
    if (rum > 0) {
      const sub = rumSub.run(white()) * 3;
      const kk = Math.tanh(rum) * 0.45;
      l += (rumF[0].run(white(), 110, 0.6).lp + sub) * kk; r += (rumF[1].run(white(), 125, 0.6).lp + sub) * kk; wet += sub * kk * 0.3;
    }
    for (const q of taps) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.35) {
        ph[20] += (q.f + 30 * Math.exp(-dt * 20)) / SR;
        const vv = (Math.sin(TAU * ph[20]) * 0.7 + tapF.run(white(), 220, 0.8).lp) * env(dt, 0.012, 0.07) * q.g;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.4;
      }
    }
    // --- glass showering off the cars and the buildings: soft shimmering swells ---
    {
      let gs = 0, gp = 0;
      for (const g of glass) { const dt = v - g.t; if (dt > 0 && dt < 3.5) { const e = smooth(0, 0.3, dt) * Math.exp(-dt * 1.2) * g.g; gs += e; gp += e * g.pan; } }
      if (gs > 0) {
        const pn = gp / gs, w = white();
        const vv = (glassF[0].run(w, 3600, 0.6).bp + 0.7 * glassF[1].run(w, 2100, 0.7).bp) * Math.tanh(gs * 2.5) * 0.08 * (0.75 + 0.25 * Math.sin(v * 37) * Math.sin(v * 23));
        l += vv * (1 - pn * 0.6); r += vv * (1 + pn * 0.6); wet += vv * 0.6;
      }
    }
    // --- car alarms (soft, rounded tones) ---
    {
      let av = 0;
      for (let i = 0; i < alarms.length; i++) {
        const a = alarms[i];
        const dt = v - a.t;
        if (dt < 0 || v > a.end) continue;
        const fade = smooth(0, 0.3, dt) * (1 - smooth(a.end - 0.5, a.end, v));
        let f = a.f;
        if (a.kind === 0) f *= Math.sin(dt * a.rate * Math.PI) > 0 ? 1 : 0.8;
        else if (a.kind === 1) f *= 1 + 0.12 * Math.sin(dt * a.rate * 6);
        else f *= 0.8 + 0.3 * ((dt * a.rate * 0.5) % 1);
        ph[30 + i] += f / SR;
        av += (Math.sin(TAU * ph[30 + i]) + 0.25 * Math.sin(2 * TAU * ph[30 + i])) * a.g * fade;
      }
      if (av !== 0) { const vv = alarmF.run(av, 1800, 0.7).lp; l += vv * 0.9; r += vv * 0.9; wet += vv * 0.7; }
    }

    // --- a low drone that climbs a step with every punch (the tension), from when the city goes ---
    {
      const pn = clamp((v - vPunch(1)) / 2 + 1, 1, N_PUNCH);
      const f0 = 41 * Math.pow(2, (pn - 1) / 24);
      const dg = (0.02 + 0.045 * smooth(12, 40, v)) * smooth(10, 16, v) * (1 - smooth(V_LAST - 0.05, V_LAST + 0.1, v));
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[60 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[60 + q]) * (q === 0 ? 0.8 : 0.35); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.5;
    }
    // --- the end: Earth blows apart: the biggest boom, white noise swelling into the white ---
    {
      const dt = v - V_LAST - 0.12;
      if (dt > -0.5) {
        const pre = smooth(-0.5, 0, dt);
        if (dt > 0) {
          ph[72] += (20 + 50 * Math.exp(-dt * 5)) / SR;
          const bv = (Math.sin(TAU * ph[72]) * 1.0 + endSub.run(white()) * 4) * env(dt, 0.02, 0.9) * 1.1 * (1 - smooth(0.5, 1.2, dt));
          dl += bv; dr += bv; wet += bv * 0.6;
        }
        const nv = endF.run(white(), 600 + 5000 * pre, 0.5).lp * (0.04 * pre + 0.3 * smooth(0, 0.4, dt)) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.2, v));
        l += nv; r += nv; wet += nv * 0.3;
      }
    }

    // in space everything outside goes dull and distant
    const fcm = 12000 * Math.pow(500 / 12000, space);
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.5 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.5); R[n] = Math.tanh(R[n] * 1.5);
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
