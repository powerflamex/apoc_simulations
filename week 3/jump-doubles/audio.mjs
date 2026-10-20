// Procedural soundtrack for "What if every jump went twice as high?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) Brickell at dusk: traffic, the crowd murmuring
// and gasping at each landing, then screaming as it runs. Every landing is a deep thump (bigger every time; from
// space a blast with a long rumble) with rubble pattering down after it; every takeoff a rising whoosh (a double
// sonic boom at jump 15, a roar after that); wind while you are in the air, silence in space (just a low drone that
// climbs with every jump, and your heartbeat); the roar of coming back in as a fireball. Glass showers off the towers,
// car alarms start up and keep going, sirens join in, buildings come down in rolling rumbles, fires roar. The Moon:
// one huge boom, white noise swelling into the white, which turns back into the street at the start (the loop).
// No sharp clicks or crackles anywhere (they read as "plastic breaking"): every impact is a soft-edged, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, T_SWITCH, BOUNCES, JUMPS, V_MOON, V_SOUND, altitude, jumpOf } from './src/timeline.js';
import { B, CARS } from './src/layout.js';
import { V_RUN } from './src/people.js';
import { rng, smooth, clamp } from './src/util.js';
import { shotAt, groundPos } from './src/shots.js';

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
  // how far the camera is from the crossing when each landing happens: the sound arrives late and quieter
  const camDist = (v) => { const sh = shotAt(v); if (sh.kind === 'chase' || sh.kind === 'moon') return 15; const p = groundPos(sh, v); return Math.hypot(p[0], p[1], p[2]); };
  const bounces = BOUNCES.map((b) => { const d = camDist(b.v + 0.05); return { ...b, c: Math.cbrt(Math.max(b.Y, 1e-4)), pan: 0, delay: Math.min(d / 343, 0.4), near: 1 / (1 + d / 220) }; });
  const takeoffs = JUMPS.filter((j) => j.n > 6).map((j) => ({ t: j.t0 + j.dw, n: j.n, mph: j.mph }));
  // rubble pattering down after each landing: soft low taps, more and longer for the big ones
  const taps = [];
  for (const b of bounces) {
    const n = Math.round(clamp(3 + 5 * b.c, 3, 40));
    for (let k = 0; k < n; k++) taps.push({ t: b.v + 0.25 + Math.pow(R0(), 0.7) * (0.6 + 0.25 * b.c), f: 60 + R0() * 70, g: 0.02 + 0.02 * R0() * Math.min(b.c, 3), pan: R0() * 1.6 - 0.8 });
  }
  // glass: one soft shimmer per building as its windows go
  const glass = B.filter((b) => b.vGlass < 1e8 && b.dN < 260).map((b) => ({ t: b.vGlass + 0.1, g: Math.min(0.05, 0.008 + b.h / 6000) * Math.min(1, 80 / (b.dN + 20)), pan: clamp(b.x / 60, -0.8, 0.8) }));
  // car alarms: the near ones start when the ground jumps under them (a dozen at most, each its own pitch and rate)
  const alarms = CARS.filter((c) => c.vAlarm < 1e8).sort((a, b) => a.vAlarm - b.vAlarm).slice(0, 12).map((c, i) => ({
    t: c.vAlarm + 0.3 + R0() * 0.5, end: Math.min(c.vFire, c.vAlarm + 22), f: 820 + R0() * 380, rate: 1.6 + R0() * 1.4, kind: i % 3, g: 0.006 + 0.006 * R0(), pan: clamp(c.x / 25, -0.8, 0.8),
  }));
  // sirens far off, once things get serious
  const sirens = [{ t: jumpOf(12).t0 + 1, f: 700, pan: -0.6 }, { t: jumpOf(14).t0 + 0.5, f: 760, pan: 0.5 }, { t: jumpOf(17).t0, f: 640, pan: -0.2 }, { t: jumpOf(20).t0, f: 720, pan: 0.7 }];
  // buildings coming down
  const rumbles = B.filter((b) => b.vFall < 1e8).map((b) => ({ t: b.vFall + 0.1, dur: b.dur + 1, g: Math.min(0.45, 0.06 + b.h / 600), pan: clamp(b.x / 50, -0.8, 0.8) }));
  // crowd cries when the ninth landing knocks the nearest down and everyone runs
  const cries = [];
  for (let k = 0; k < 18; k++) cries.push({ t: V_RUN - 0.1 + R0() * 1.6, f: 200 + R0() * 260, d: 0.5 + R0() * 0.6, g: 0.008 + 0.01 * R0(), pan: R0() * 1.6 - 0.8, vow: R0() });

  const cityLP = new OnePole(260), cityLP2 = new OnePole(170);
  const crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const gaspF = new SVF(), cryF = [new SVF(), new SVF()];
  const thumpF = new SVF(), crunchF = new SVF(), blastF = new SVF(), rumF = [new SVF(), new SVF()], rumSub = new OnePole(45);
  const tapF = new SVF(), whooshF = [new SVF(), new SVF()], boomF = new SVF(), roarF = [new SVF(), new SVF()], roarSub = new OnePole(55);
  const windF = [new SVF(), new SVF(), new SVF()], windSub = new OnePole(70), windE = new OnePole(2.5);
  const glassF = [new SVF(), new SVF()], alarmF = new SVF(), sirenF = new SVF(), fireF = new SVF(), fireSub = new OnePole(60);
  const padLP = new OnePole(500), moonF = new SVF(), moonSub = new OnePole(40);
  const muffL = new OnePole(12000), muffR = new OnePole(12000);
  const revL = new Reverb(3), revR = new Reverb(4);
  const ph = new Float64Array(96);

  let s = state(-LOOP);
  let yPrev = altitude(-LOOP - 1 / SR);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;   // d*: not muffled in space (the drone, your heartbeat)
    const y = s.y;
    const air = Math.exp(-y / 8000);                    // how much air is around you
    const space = smooth(60e3, 140e3, y);

    // --- the street: traffic and the crowd (murmuring, gasping at each landing), until they run ---
    const life = 1 - smooth(V_RUN, V_RUN + 4, v);
    const city = cityLP2.run(cityLP.run(white())) * 0.06 * (0.35 + 0.65 * life);
    l += city; r += city * 0.92;
    let cv = 0;
    for (let q = 0; q < 5; q++) {
      const amp = crowdE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.7) + q * 1.3) + white() * 0.2));
      cv += crowdF[q].run(white(), 360 + q * 230 + 100 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
    }
    l += cv * 0.04 * life; r += cv * 0.038 * life;
    for (const b of bounces) {
      if (b.n > 9) break;
      const dt = v - b.v - 0.15;
      if (dt > 0 && dt < 1.5) {   // a gasp: "ohh!" from everyone
        ph[1] += (240 + 40 * Math.sin(dt * 9)) / SR;
        const vv = gaspF.run(saw(ph[1]) + white() * 0.6, 650 - 150 * dt, 0.5).bp * env(dt, 0.08, 0.45) * 0.05 * (b.n - 5) * 0.5;
        l += vv; r += vv * 0.9; wet += vv * 0.5;
      }
    }
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        ph[2] += c.f * (1.2 - 0.3 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(ph[2]);
        const vv = (cryF[0].run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * cryF[1].run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }

    // --- every landing: a deep thump, bigger every time; from space a blast and a long rolling rumble ---
    let rum = 0;
    for (let i = 0; i < bounces.length; i++) {
      const b = bounces[i];
      const dt = v - b.v - b.delay;
      if (dt < -0.02 || dt > 7) continue;
      const big = clamp(b.c / 10);
      // the crack of the hit itself: a short, deep crunch with harmonics a phone speaker can play (soft 8 ms onset)
      if (dt < 1.2) {
        const e = env(dt + 0.02, 0.008, 0.09 + 0.08 * big + 0.1 * b.hot) * (0.35 + 0.25 * big + 0.2 * b.hot) * (0.5 + 0.5 * b.near);
        ph[13] += (95 + 70 * Math.exp(-Math.max(dt, 0) * 14)) / SR;
        const body = Math.tanh(3 * Math.sin(TAU * ph[13])) * 0.5;
        const grit = crunchF.run(white(), 700 + 900 * Math.exp(-Math.max(dt, 0) * 10), 0.7).lp * 1.4;
        const cv = (body + grit) * e;
        dl += cv; dr += cv; wet += cv * 0.6;
      }
      if (dt < 6) {
        ph[10 + (i % 3)] += (26 + (40 + 30 * big) * Math.exp(-Math.max(dt, 0) * 7)) / SR;
        const e = env(dt + 0.02, 0.025, 0.25 + 0.5 * big + 0.4 * b.hot) * (1 - smooth(3.5, 6, dt));
        const g = Math.min(0.25 + 0.09 * b.c + 0.3 * b.hot, 1.0);
        const vv = (Math.tanh(2.2 * Math.sin(TAU * ph[10 + (i % 3)])) * 0.75 + thumpF.run(white(), 160 + 380 * Math.exp(-Math.max(dt, 0) * 9), 0.7).lp * 1.3) * e * g * (0.55 + 0.45 * b.near);
        dl += vv; dr += vv; wet += vv * 0.5;
        // the blast's body: a burst of low noise
        const bb = blastF.run(white(), 300 + 900 * big * Math.exp(-Math.max(dt, 0) * 4), 0.6).lp * env(dt + 0.02, 0.03, 0.12 + 0.35 * big) * (0.15 + 0.5 * big);
        l += bb; r += bb; wet += bb * 0.7;
      }
      rum += env(dt, 0.15, 0.8 + 2.2 * b.hot + 0.6 * big) * (0.1 + 0.6 * big + 0.4 * b.hot);
    }
    if (rum > 0) {
      const sub = rumSub.run(white()) * 3;
      const kk = Math.tanh(rum) * 0.45;
      l += (rumF[0].run(white(), 110, 0.6).lp + sub) * kk; r += (rumF[1].run(white(), 125, 0.6).lp + sub) * kk; wet += sub * kk * 0.3;
    }
    // rubble pattering down (soft low taps)
    for (const q of taps) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.35) {
        ph[20] += (q.f + 30 * Math.exp(-dt * 20)) / SR;
        const vv = (Math.sin(TAU * ph[20]) * 0.7 + tapF.run(white(), 220, 0.8).lp) * env(dt, 0.012, 0.07) * q.g;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.4;
      }
    }

    // --- every takeoff: a rising whoosh (louder and longer as the jumps grow); a double sonic boom at jump 15;
    //     after that each takeoff tears the air: a boom and a roar ---
    for (const t of takeoffs) {
      const dt = v - t.t;
      if (dt < 0 || dt > 4) continue;
      const k = clamp(Math.log10(t.mph / 40) / 2.8);
      const w = white();
      const fc = 250 + 1500 * (1 - Math.exp(-dt * 5)) * (0.4 + 0.6 * k);
      const e = env(dt, 0.06, 0.25 + 0.5 * k) * (0.05 + 0.14 * k) * air;
      const vv = whooshF[0].run(w, fc, 0.8).bp * e, vr = whooshF[1].run(w, fc * 1.12, 0.8).bp * e;
      l += vv; r += vr; wet += vv * 0.4;
      if (t.n >= 15 && t.n < 31) {
        for (const tb of t.n === 15 ? [0, 0.17] : [0]) {
          const d2 = dt - tb;
          if (d2 > 0 && d2 < 2) {
            ph[24] += (30 + 45 * Math.exp(-d2 * 6)) / SR;
            const ee = env(d2, 0.02, 0.45) * (t.n === 15 ? 0.55 : 0.4);
            const bv = (Math.sin(TAU * ph[24]) * 0.8 + boomF.run(white(), 90 + 260 * Math.exp(-d2 * 5), 0.6).lp * 0.9) * ee;
            dl += bv; dr += bv; wet += bv * 0.6;
          }
        }
        if (t.n >= 17) {   // the air torn open: a roar trailing up after you
          const ee = env(dt, 0.05, 0.7) * 0.22;
          const rv = (roarF[0].run(white(), 260 + 400 * Math.exp(-dt * 2), 0.5).lp + roarSub.run(white()) * 2) * ee;
          l += rv; r += rv * 0.95; wet += rv * 0.3;
        }
      }
    }

    // --- wind while you fly through the air (gone in space) ---
    {
      const yv = altitude(v + 1 / SR);
      const rate = Math.abs(Math.log(1 + yv / 12) - Math.log(1 + yPrev / 12)) * SR;   // how fast the world is rushing by
      yPrev = yv;
      const sh = shotAt(v), flying = sh.kind === 'chase' ? 1 : 0;
      const lvl = windE.run(clamp(rate / 12) * air * 0.2 * flying + 0.025 * air);
      if (lvl > 0.001) {
        const wn = white();
        const fc = 380 + 900 * clamp(rate / 20);
        const a = windF[0].run(wn, fc, 0.7).bp, b = windF[1].run(wn, fc * 2.1, 0.9).bp * 0.5;
        const lo = windSub.run(white()) * 2;
        l += (a + b + lo) * lvl; r += (windF[2].run(wn, fc * 1.1, 0.7).bp + b + lo) * lvl; wet += a * lvl * 0.2;
      }
    }
    // --- coming back in from space: a roar that builds into the landing ---
    if (s.reentry > 0.001) {
      const e = s.reentry;
      const rv = (roarF[1].run(white(), 200 + 700 * e, 0.45).lp * 1.2 + roarSub.run(white()) * 2.5) * e * e * 0.35;
      l += rv; r += rv; wet += rv * 0.3;
    }

    // --- glass showering off the towers: soft shimmering swells ---
    {
      let gs = 0, gp = 0;
      for (const g of glass) {
        const dt = v - g.t;
        if (dt > 0 && dt < 3.5) { const e = smooth(0, 0.35, dt) * Math.exp(-dt * 1.1) * g.g; gs += e; gp += e * g.pan; }
      }
      if (gs > 0) {
        const pn = gp / gs, w = white();
        const vv = (glassF[0].run(w, 3600, 0.6).bp + 0.7 * glassF[1].run(w, 2100, 0.7).bp) * Math.tanh(gs * 2.5) * 0.07 * (0.75 + 0.25 * Math.sin(v * 37) * Math.sin(v * 23));
        l += vv * (1 - pn * 0.6); r += vv * (1 + pn * 0.6); wet += vv * 0.6;
      }
    }
    // --- car alarms (soft, rounded tones; three kinds: two-tone, warble, slow whoop) ---
    {
      let av = 0, ap = 0;
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
        const x = Math.sin(TAU * ph[30 + i]) + 0.25 * Math.sin(2 * TAU * ph[30 + i]);
        av += x * a.g * fade; ap += a.pan * a.g * fade;
      }
      if (av !== 0) {
        const vv = alarmF.run(av, 1800, 0.7).lp * (1 - 0.7 * space);
        l += vv * 0.9; r += vv * 0.9; wet += vv * 0.7;
      }
    }
    // --- sirens far off ---
    for (let i = 0; i < sirens.length; i++) {
      const q = sirens[i], dt = v - q.t;
      if (dt < 0) continue;
      const f = q.f * (1 + 0.45 * (0.5 - 0.5 * Math.cos(dt * TAU / 3.4)));
      ph[50 + i] += f / SR;
      const vv = sirenF.run(Math.sin(TAU * ph[50 + i]), 1500, 0.8).lp * 0.012 * smooth(0, 2, dt) * (1 - 0.8 * space) * (1 - smooth(V_MOON - 2, V_MOON, v));
      l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 1.2;
    }
    // --- buildings coming down: deep rolling rumbles ---
    {
      let rb = 0;
      for (const q of rumbles) { const dt = v - q.t; if (dt > 0 && dt < q.dur + 2) rb += Math.min(dt / 0.4, 1) * Math.exp(-Math.max(0, dt - q.dur) * 1.3) * q.g; }
      if (rb > 0) { const kk = Math.tanh(rb * 0.6) * 0.4; const sub = rumSub.run(white()) * 2.5; l += (rumF[0].run(white(), 140, 0.6).lp + sub) * kk; r += (rumF[1].run(white(), 150, 0.6).lp + sub) * kk; }
    }
    // --- the city burning: a low roar that grows after the landings from space ---
    {
      const fire = smooth(jumpOf(20).t0, jumpOf(26).t0, v) * (1 - smooth(V_MOON - 3, V_MOON - 1, v)) * (1 - 0.75 * space);
      if (fire > 0) { const fv = (fireF.run(white(), 380, 0.5).lp + fireSub.run(white()) * 1.5) * fire * 0.12; l += fv; r += fv * 0.95; wet += fv * 0.3; }
    }

    // --- a low drone that climbs with every jump (the tension), and in space your heartbeat ---
    {
      const jn = s.n + s.p;
      const f0 = 49 * Math.pow(2, (jn - 6) / 26);
      const dg = (0.03 + 0.03 * smooth(15, 30, jn)) * smooth(-1, 2, v) * (1 - smooth(V_MOON - 0.05, V_MOON + 0.1, v));
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[60 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[60 + q]) * (q === 0 ? 0.8 : 0.35); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.5;
      const hb = space * (1 - smooth(V_MOON - 0.3, V_MOON, v));
      if (hb > 0) {
        const bpm = 1.25 + 0.5 * smooth(jumpOf(29).t0, V_MOON, v), cyc = (v * bpm) % 1;
        const beat = env(cyc, 0.01, 0.06) + 0.7 * env(cyc - 0.28, 0.01, 0.06);
        ph[70] += 48 / SR;
        const hv = Math.sin(TAU * ph[70]) * beat * 0.16 * hb;
        dl += hv; dr += hv;
      }
    }
    // --- the Moon: one huge boom, white noise swelling into the white ---
    {
      const dt = v - V_MOON;
      if (dt > -0.4) {
        const pre = smooth(-0.4, 0, dt);
        if (dt > 0) {
          ph[72] += (22 + 50 * Math.exp(-dt * 5)) / SR;
          const bv = (Math.sin(TAU * ph[72]) * 1.0 + moonSub.run(white()) * 4) * env(dt, 0.02, 0.9) * 1.1 * (1 - smooth(0.6, 1.4, dt));
          dl += bv; dr += bv; wet += bv * 0.6;
        }
        const nv = moonF.run(white(), 600 + 5000 * pre, 0.5).lp * (0.05 * pre + 0.3 * smooth(0, 0.4, dt)) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.2, v));
        l += nv; r += nv; wet += nv * 0.3;
      }
    }

    // in space everything outside you goes dull and distant
    const fcm = 12000 * Math.pow(400 / 12000, space);
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
