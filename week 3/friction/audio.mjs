// Procedural soundtrack for "What if friction disappeared?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) A San Francisco street at golden hour: a
// little traffic, people, the cable car's bell (ding-ding). Then everyone goes down at once (soft thuds, cries), and
// the bell rings and rings as the cable car slides back. Sliding without friction makes no scraping sound at all:
// what you hear is the air rushing (rising with the fastest car's speed), a low drone that climbs a semitone at
// every beat, a deep "whoomp" on each beat, and splashes as things go into the bay. Lamp posts topple (soft low
// thuds); the houses creak and rumble down; the ground cracks with a deep boom; the hillside's rumble and the wind
// grow as you ride it down at up to 90 mph; the roar of the earth pouring into the bay; the plunge; muffled water,
// which turns back into the street at the start (the video loops).
// No sharp clicks or crackles anywhere (they read as "plastic breaking"): every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, slide, topSpeed, slabU, slabD, tOf, VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_CRACK, V_SLIDE, V_TOE_BAY, V_PLUNGE, V_NAILS, VT, Z_EDGE } from './src/timeline.js';
import { H, CARS, LAMPS, CABLE, YOU_AT } from './src/layout.js';
import { PEOPLE } from './src/people.js';
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

// when something let go on the hill goes into the bay (video time), or null
function intoBay(o) {
  const s = {};
  for (let v = 0; v < 60; v += 0.25) {
    slide(o, tOf(v), s);
    if (s.phase >= 2) {
      let lo = v - 0.25, hi = v;
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; slide(o, tOf(m), s); if (s.phase >= 2) hi = m; else lo = m; }
      return hi + 0.55;
    }
  }
  return null;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;

  // ---- scheduled events ----
  const beats = BEATS.filter((b) => b.v < T_SWITCH);
  // people near you going down: a soft cry, then a low thud as they hit the ground
  const near = PEOPLE.filter((p) => !p.cable && p.vFall < 2 && Math.abs(p.z - YOU_AT.z) < 140).slice(0, 34);
  const cries = near.map((p) => ({ t: p.vFall + 0.05, f: (p.kid ? 380 : 180) + R0() * 140, d: 0.45 + R0() * 0.5, g: (0.01 + 0.012 * R0()) * clamp(30 / Math.max(10, Math.abs(p.z - YOU_AT.z))), pan: clamp(p.x / 14, -0.8, 0.8), vow: R0() }));
  const thuds = near.map((p) => ({ t: p.vFall + 0.48, f: 55 + R0() * 25, g: 0.05 * clamp(25 / Math.max(8, Math.abs(p.z - YOU_AT.z))), pan: clamp(p.x / 14, -0.8, 0.8) }));
  // the cable car's bell: ding-ding as it climbs, then the gripman ringing and ringing as it slides back
  const bells = [{ t: -0.75, g: 0.05 }, { t: -0.5, g: 0.05 }];
  for (let t = 2.2; t < 9; t += 0.26 + R0() * 0.08) bells.push({ t, g: 0.045 * Math.exp(-(t - 2.2) / 4) });
  // lamp posts hitting the ground (the near ones)
  for (const l of LAMPS) if (l.vFall < 1e8 && l.z0 < -330) thuds.push({ t: l.vFall + 1.25, f: 70 + R0() * 20, g: 0.04 * clamp(60 / Math.max(15, Math.abs(l.z0 - YOU_AT.z))), pan: clamp(l.x / 14, -0.7, 0.7) });
  // splashes: every car, and the cable car, going into the bay (heard as the long lens shows them)
  const splashes = [];
  for (const c of CARS) {
    if (c.flat || c.plateau || c.cross) continue;
    const v = intoBay({ z0: c.z0, ts: 0, vt: VT.car, u0: c.u0 || 0 });
    if (v !== null && v < T_SWITCH) splashes.push({ t: v + 0.15, g: 0.05 + 0.03 * R0(), pan: clamp(c.x / 10, -0.6, 0.6), big: 1 });
  }
  { const v = intoBay(CABLE); if (v !== null) splashes.push({ t: v + 0.15, g: 0.16, pan: 0.1, big: 2.2 }); }
  // houses: creaking as they rack (the ones near you loud), then a rumble as they come down
  const creaks = [], rumbles = [];
  for (const b of H) {
    if (b.vFall > 1e8 || !b.front) continue;
    const d = Math.max(15, Math.hypot(b.x, b.z - YOU_AT.z));
    if (d < 260) creaks.push({ t: b.vFall, d: b.dur, f0: 160 + R0() * 220, g: 0.035 * clamp(40 / d), pan: clamp(b.x / 30, -0.85, 0.85), seed: R0() * 9 });
    rumbles.push({ t: b.vFall + b.dur * 0.4, dur: b.dur, g: 0.25 * clamp(60 / d) ** 0.8, pan: clamp(b.x / 40, -0.7, 0.7) });
  }

  const cityLP = new OnePole(260), cityLP2 = new OnePole(170);
  const crowdF = Array.from({ length: 4 }, () => new SVF()), crowdE = Array.from({ length: 4 }, () => new OnePole(3));
  const airF = [new SVF(), new SVF(), new SVF()], airSub = new OnePole(70), gustE = new OnePole(1.2);
  const cryF = [new SVF(), new SVF()], thudF = new SVF(), splF = [new SVF(), new SVF()], splSub = new OnePole(60);
  const creakF = [new SVF(), new SVF()], rumL = new SVF(), rumR = new SVF(), rumSub = new OnePole(45), whoompF = new SVF(), boomF = new SVF();
  const earthF = [new SVF(), new SVF()], earthSub = new OnePole(38), pourF = [new SVF(), new SVF()], pourSub = new OnePole(55), padLP = new OnePole(600);
  const muffL = new OnePole(9000), muffR = new OnePole(9000);
  const revL = new Reverb(3), revR = new Reverb(4);
  const ph = new Float64Array(64);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;

    // --- the street: a little traffic, people talking (gone as everyone goes down) ---
    const life = 1 - smooth(0.2, 3, v);
    const city = cityLP2.run(cityLP.run(white())) * 0.5 * 0.1 * (1 - smooth(1, 8, v));
    l += city; r += city * 0.92;
    let cv = 0;
    for (let q = 0; q < 4; q++) {
      const amp = crowdE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.7) + q * 1.3) + white() * 0.2));
      cv += crowdF[q].run(white(), 400 + q * 260 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
    }
    l += cv * 0.03 * life; r += cv * 0.03 * life * 0.95;
    // the bell: a warm two-partial ding with a soft onset
    for (let i = 0; i < bells.length; i++) {
      const bl = bells[i], dt = v - bl.t;
      if (dt > 0 && dt < 1.6) {
        const e = Math.min(dt / 0.008, 1) * Math.exp(-dt * 3.2) * bl.g;
        const vv = (Math.sin(TAU * 1180 * dt) * 0.6 + Math.sin(TAU * 1180 * 2.76 * dt) * 0.25 * Math.exp(-dt * 6) + Math.sin(TAU * 590 * dt) * 0.3) * e;
        l += vv * 0.55; r += vv * 0.45; wet += vv * 0.8;
      }
    }
    // cries as people go down: a soft vowel with a falling pitch
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        ph[3] += c.f * (1.15 - 0.3 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(ph[3]);
        const vv = (cryF[0].run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * cryF[1].run(src, 1100 + 500 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // soft low thuds (people hitting the ground, lamp posts)
    for (const q of thuds) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.5) {
        ph[20] += (q.f + 20 * Math.exp(-dt * 18)) / SR;
        const vv = Math.sin(TAU * ph[20]) * Math.min(dt / 0.015, 1) * Math.exp(-dt * 9) * q.g + thudF.run(white(), 150, 0.8).lp * Math.min(dt / 0.02, 1) * Math.exp(-dt * 12) * q.g * 0.5;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.4;
      }
    }

    // --- the air rushing: nothing scrapes, but everything is moving faster and faster ---
    {
      const sp = v < V_NAILS + 3 ? topSpeed(v) / 85 : 0.25 * (1 - smooth(V_NAILS + 3, V_CRACK, v));
      const ride = v > V_SLIDE ? Math.pow(slabU(v) / 40, 1.3) : 0;
      const k = clamp(Math.max(sp * 0.7, ride));
      const gust = gustE.run(0.6 + 0.4 * Math.sin(v * 1.3) * Math.sin(v * 0.71 + 1) + 0.2 * white());
      const lvl = (0.02 + 0.34 * Math.pow(k, 1.2)) * (0.75 + 0.35 * gust) * (1 - smooth(V_PLUNGE + 0.3, V_PLUNGE + 0.45, v));
      const fc = 260 + 1400 * k;
      const wn = white();
      const a = airF[0].run(wn, fc * (0.9 + 0.2 * gust), 0.7).bp, b = airF[1].run(wn, fc * 2.2, 0.9).bp * 0.5;
      const c2 = airF[2].run(wn, fc * 1.15, 0.7).bp;
      const lo = airSub.run(white()) * 2.5 * k;
      l += (a + b) * lvl + lo * lvl * 0.8; r += (c2 + b) * lvl + lo * lvl * 0.8; wet += a * lvl * 0.2;
    }
    // --- the beats: a deep whoomp ---
    for (let i = 0; i < beats.length; i++) {
      const dt = v - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.2);
        ph[10 + (i % 2)] += (32 + 30 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const g = 0.2 + 0.02 * i;
        const vv = (Math.sin(TAU * ph[10 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.8) * e * g;
        dl += vv; dr += vv;
      }
    }
    // --- a low drone that climbs a semitone at every beat (the tension) ---
    {
      let semis = 0;
      for (const b of beats) if (v >= b.v) semis += smooth(0, 0.6, v - b.v);
      const f0 = 49 * Math.pow(2, semis / 12);
      const dg = 0.04 * smooth(-0.8, 1.5, v) * (1 - smooth(V_PLUNGE + 0.3, V_PLUNGE + 0.6, v));
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[14 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[14 + q]) * (q === 0 ? 0.8 : 0.35); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.5;
    }
    // --- splashes: a soft low whump and a wash of spray ---
    {
      let g = 0, gp = 0, sub = 0;
      for (const q of splashes) {
        const dt = v - q.t;
        if (dt > 0 && dt < 2.5) { const e = Math.min(dt / 0.03, 1) * Math.exp(-dt * 2.2) * q.g; g += e; gp += e * q.pan; sub += e * q.big; }
      }
      if (g > 0) {
        const pn = gp / g, w = white();
        const vv = (splF[0].run(w, 900, 0.6).bp * 0.7 + splF[1].run(w, 2600, 0.8).bp * 0.4) * Math.tanh(g * 4) * 0.5 + splSub.run(white()) * 2.4 * Math.tanh(sub * 3) * 0.4;
        l += vv * (1 - pn * 0.5); r += vv * (1 + pn * 0.5); wet += vv * 0.4;
      }
    }
    // --- houses creaking (a slow, rough, resonant groan) and rumbling down ---
    {
      let cr = 0, cp = 0;
      for (const q of creaks) {
        const dt = v - q.t;
        if (dt > 0 && dt < q.d) { const e = Math.sin(Math.PI * dt / q.d) * q.g; cr += e; cp += e * q.pan; }
      }
      if (cr > 0) {
        const pn = cp / cr;
        const trem = 0.55 + 0.45 * Math.sin(TAU * (17 + 6 * Math.sin(v * 1.7)) * v);
        const src = white() * trem;
        const fc = 210 + 120 * Math.sin(v * 2.3) + 60 * Math.sin(v * 5.1);
        const vv = (creakF[0].run(src, fc, 0.05).bp * 0.5 + creakF[1].run(src, fc * 2.7, 0.08).bp * 0.25) * Math.tanh(cr * 8) * 0.6;
        l += vv * (1 - pn * 0.6); r += vv * (1 + pn * 0.6); wet += vv * 0.5;
      }
      let rum = 0, rp = 0;
      for (const q of rumbles) {
        const dt = v - q.t;
        if (dt > 0 && dt < q.dur + 2) { const e = Math.min(dt / 0.4, 1) * Math.exp(-Math.max(0, dt - q.dur) * 1.4) * q.g; rum += e; rp += e * q.pan; }
      }
      if (rum > 0) {
        const sub = rumSub.run(white()) * 3, pn = rp / rum, kk = Math.tanh(rum * 0.6) * 0.45;
        l += (rumL.run(white(), 120, 0.6).lp + sub) * kk * (1 - pn * 0.5); r += (rumR.run(white(), 130, 0.6).lp + sub) * kk * (1 + pn * 0.5); wet += sub * kk * 0.4;
      }
    }
    // --- the crack: a deep boom, then the ground's grinding rumble growing with the slide ---
    for (const tb of [V_CRACK, V_SLIDE]) {
      const dt = v - tb;
      if (dt > 0 && dt < 3) {
        ph[24] += (26 + 36 * Math.exp(-dt * 5)) / SR;
        const e = Math.min(dt / 0.02, 1) * Math.exp(-dt * 1.6) * (tb === V_CRACK ? 0.7 : 0.45);
        const vv = (Math.sin(TAU * ph[24]) * 0.8 + boomF.run(white(), 80 + 160 * Math.exp(-dt * 4), 0.6).lp * 0.9) * e;
        dl += vv; dr += vv; wet += vv * 0.6;
      }
    }
    if (v > V_CRACK) {
      const k = clamp(smooth(V_CRACK, V_SLIDE + 2, v) * 0.35 + slabU(v) / 45) * (1 - smooth(V_PLUNGE + 0.3, V_PLUNGE + 0.45, v));
      const g = earthSub.run(white()) * 3.2;
      const vv = (earthF[0].run(white(), 70 + 60 * k, 0.5).lp + g) * 0.42 * k + earthF[1].run(white(), 300 + 200 * k, 0.4).bp * 0.12 * k * (0.6 + 0.4 * Math.sin(v * 7.3));
      l += vv; r += vv * 0.95; wet += vv * 0.25;
    }
    // --- the earth pouring into the bay: a roar, louder as you near it ---
    if (v > V_TOE_BAY - 0.5) {
      const youZ = YOU_AT.z + slabD(v);
      const dist = Math.max(8, Z_EDGE - youZ);
      const g = clamp(150 / dist) ** 1.2 * smooth(V_TOE_BAY - 0.5, V_TOE_BAY + 3, v) * 0.5 * (1 - smooth(V_PLUNGE + 0.3, V_PLUNGE + 0.45, v));
      const fc = 160 + 900 * clamp(120 / dist);
      const wn = white();
      const vv = pourF[0].run(wn, fc, 0.5).lp + 0.6 * pourF[1].run(wn, fc * 2.6, 0.7).bp + pourSub.run(white()) * 2.5;
      l += vv * g; r += vv * g * 0.92; wet += vv * g * 0.3;
    }
    // --- the plunge: a big soft splash, then deep, muddy water (muffled, a low churn, bubbles) ---
    {
      const dt = v - (V_PLUNGE + 0.35);
      if (dt > 0 && dt < 2.5) {
        ph[26] += (30 + 40 * Math.exp(-dt * 5)) / SR;
        const e = Math.min(dt / 0.02, 1) * Math.exp(-dt * 2.0) * 0.55;
        const vv = Math.sin(TAU * ph[26]) * e + splSub.run(white()) * 2 * e;
        dl += vv; dr += vv;
      }
    }
    const under = s.under || (v > V_PLUNGE + 0.42 ? 1 : 0);
    if (under > 0) {
      const ch = pourSub.run(white()) * 2.5 * 0.2;
      ph[30] += (280 + 180 * Math.sin(v * 3.1)) / SR;
      const bub = Math.sin(TAU * ph[30]) * Math.pow(Math.max(0, Math.sin(v * 9.3)), 8) * 0.02;
      l += (ch + bub) * under; r += (ch + bub * 0.8) * under;
    }
    const fcm = 9000 * Math.pow(250 / 9000, clamp(under));
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl * (1 - 0.7 * under) + rl * 0.8, outR = r + dr * (1 - 0.7 * under) + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // inside the deep water, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.5 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
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
