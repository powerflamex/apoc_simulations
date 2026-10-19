// Procedural soundtrack for "What if Earth stopped spinning?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) A busy crossing at golden hour: traffic,
// the crowd, a couple of horns. Then the wind: it rises with every 100 mph (louder, higher, a howl through the
// street canyon), and every 100 mph lands as a deep "whoomp" while a low drone climbs a semitone. People cry out as
// they go down; glass showers from the towers; cars tumble (soft low thuds); buildings come down as rolling rumbles
// (heard late: sound takes time to arrive); a double sonic boom when the wind passes the speed of sound; the
// tallest tower's long roar; the ocean's roar growing to a wall of sound; then deep water (muffled, bubbles),
// which turns back into the street at the start (the video loops).
// No sharp clicks or crackles anywhere (they read as "plastic breaking"): every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_HIT, V_OCEAN, V_SOUND, V_STOP, oceanZ, tOf } from './src/timeline.js';
import { B, CARS, CAM, LANDMARK } from './src/layout.js';
import { PEOPLE } from './src/people.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const C = 343;

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
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;

  // ---- scheduled events ----
  const beats = BEATS.filter((b) => b.v < T_SWITCH);
  // people crying out as they go down (near ones louder), a few at a time
  const cries = PEOPLE.filter((p) => !p.far && p.vFall > -1 && p.vFall < 8).slice(0, 40).map((p) => ({
    t: p.vFall + 0.1, f: (p.kid ? 380 : 190) + R0() * 120, d: 0.5 + R0() * 0.5, g: 0.012 + 0.012 * R0(), pan: clamp(p.x / 18, -0.85, 0.85), vow: R0(),
  }));
  // horns at the start (soft, distant)
  const horns = [{ t: -0.6, f: 392, d: 0.5, pan: -0.4 }, { t: 1.3, f: 330, d: 0.35, pan: 0.5 }, { t: 2.4, f: 415, d: 0.6, pan: -0.2 }, { t: 4.8, f: 349, d: 0.7, pan: 0.3 }];
  // glass showering from the towers near the avenue
  const glass = B.filter((b) => b.front && b.z > -400).map((b) => ({ t: b.vGlass + Math.hypot(b.x - CAM.x, b.z - CAM.z) / C, g: 0.012 + Math.min(0.03, b.h / 4000), pan: clamp((b.x - CAM.x) / 40, -0.8, 0.8) }));
  // cars thudding as they roll over and tumble
  const thuds = CARS.filter((c) => !c.far).map((c) => ({ t: c.v + 0.35 + R0() * 0.3, f: 48 + R0() * 30, g: 0.05 + R0() * 0.05, pan: clamp(c.x / 15, -0.8, 0.8) }));
  for (let k = 0; k < 30; k++) thuds.push({ t: 9 + R0() * 25, f: 45 + R0() * 30, g: 0.03 + R0() * 0.04, pan: R0() * 1.6 - 0.8 });
  // buildings coming down: rolling rumbles, delayed by distance (the camera moves; use its later spot, roughly)
  const rumbles = [];
  for (const b of B) {
    if (b.far || b.h < 25) continue;
    const d = Math.max(60, Math.hypot(b.x, b.z + 200));
    if (d > 1500) continue;
    rumbles.push({ t: b.vFall + d / C * 0.5, dur: b.dur + 1, g: Math.min(0.5, 0.04 + b.h / 500) * Math.min(1, 400 / d), pan: clamp(b.x / 120, -0.8, 0.8) });
  }
  const land = { t: LANDMARK.vFall + 0.6, dur: LANDMARK.dur + 2, g: 1.0 };

  const cityLP = new OnePole(250), cityLP2 = new OnePole(180);
  const crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const windF = [new SVF(), new SVF(), new SVF(), new SVF()], howlF = [new SVF(), new SVF()], windSub = new OnePole(60), gustE = new OnePole(1.5);
  const cryF = [new SVF(), new SVF()], hornF = new SVF(), glassF = [new SVF(), new SVF()], thudF = new SVF();
  const rumL = new SVF(), rumR = new SVF(), rumSub = new OnePole(45), whoompF = new SVF(), boomF = new SVF();
  const oceanF = [new SVF(), new SVF(), new SVF()], oceanSub = new OnePole(50), padLP = new OnePole(600);
  const muffL = new OnePole(9000), muffR = new OnePole(9000), bubF = new SVF();
  const revL = new Reverb(3), revR = new Reverb(4);
  const ph = new Float64Array(64);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    const k = s.k;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;

    // --- the street: traffic hum and the crowd (gone once the wind takes over) ---
    const life = 1 - smooth(3, 9, v);
    const city = cityLP2.run(cityLP.run(white())) * 0.5 * 0.12 * (1 - smooth(4, 12, v));
    l += city; r += city * 0.92;
    let cv = 0;
    for (let q = 0; q < 5; q++) {
      const amp = crowdE[q].run(Math.max(0, Math.sin(v * (2.1 + q * 0.7) + q * 1.3) + white() * 0.2));
      cv += crowdF[q].run(white(), 380 + q * 230 + 100 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
    }
    const crowdG = 0.045 * life * (1 + 1.2 * smooth(0, 2.5, v));
    l += cv * crowdG; r += cv * crowdG * 0.95;
    for (const h of horns) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d + 0.1) {
        ph[1] += h.f / SR; ph[2] += h.f * 1.26 / SR;
        const e = Math.min(dt / 0.04, 1) * Math.min(1, (h.d + 0.1 - dt) / 0.08);
        const hv = hornF.run(saw(ph[1]) + saw(ph[2]), 900, 1.2).lp * e * 0.03;
        l += hv * (1 - h.pan) * 0.5; r += hv * (1 + h.pan) * 0.5; wet += hv * 0.6;
      }
    }
    // people crying out as they go down: a soft vowel with a falling pitch
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        ph[3] += c.f * (1.15 - 0.3 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(ph[3]);
        const f1 = 700 + 200 * c.vow, f2 = 1100 + 500 * c.vow;
        const vv = (cryF[0].run(src, f1, 0.3).bp + 0.6 * cryF[1].run(src, f2, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }

    // --- the wind: louder and higher with every 100 mph, gusting, howling through the street canyon ---
    {
      const gust = gustE.run(0.6 + 0.4 * Math.sin(v * 1.3) * Math.sin(v * 0.71 + 1) + 0.2 * white());
      const lvl = (0.04 + 0.36 * Math.pow(k, 1.1)) * (0.75 + 0.35 * gust) * (1 - smooth(V_HIT - 0.05, V_HIT + 0.1, v));
      const fc = 220 + 1300 * k;
      const wn = white();
      const a = windF[0].run(wn, fc * (0.9 + 0.2 * gust), 0.7).bp;
      const b = windF[1].run(wn, fc * 2.3, 0.9).bp * 0.5;
      const lo = windSub.run(white()) * 2.5 * k;
      const howl = howlF[0].run(wn, 380 + 520 * k + 120 * Math.sin(v * 0.9), 0.06).bp * 0.35 + howlF[1].run(wn, 600 + 800 * k + 150 * Math.sin(v * 1.4 + 2), 0.07).bp * 0.25;
      const wl = (a + b + howl) * lvl + lo * lvl * 0.8;
      const wr = (windF[2].run(wn, fc * 1.1, 0.7).bp + windF[3].run(wn, fc * 2.1, 0.9).bp * 0.5 + howl * 0.8) * lvl + lo * lvl * 0.8;
      l += wl; r += wr; wet += (a + howl) * lvl * 0.25;
    }
    // --- the beats: a deep whoomp at every 100 mph ---
    for (let i = 0; i < beats.length; i++) {
      const dt = v - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.2);
        ph[10 + (i % 2)] += (32 + 30 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const g = 0.2 + 0.025 * i;
        const vv = (Math.sin(TAU * ph[10 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.8) * e * g;
        dl += vv; dr += vv;
      }
    }
    // --- a low drone that climbs a semitone with each 100 mph (the tension) ---
    {
      const semis = Math.min(s.wind, 1037) / 100;
      const f0 = 55 * Math.pow(2, semis / 12);
      const dg = 0.045 * smooth(-1, 1, v) * (1 - smooth(V_HIT - 0.1, V_HIT + 0.2, v));
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[14 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[14 + q]) * (q === 0 ? 0.8 : 0.35); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.5;
    }
    // --- glass showering: soft shimmering swells (no sharp attacks) ---
    {
      let gs = 0, gp = 0;
      for (const g of glass) {
        const dt = v - g.t;
        if (dt > 0 && dt < 2.5) { const e = smooth(0, 0.25, dt) * Math.exp(-dt * 1.4) * g.g; gs += e; gp += e * g.pan; }
      }
      if (gs > 0) {
        const pn = gp / gs, w = white();
        const vv = (glassF[0].run(w, 5200, 0.5).bp + 0.6 * glassF[1].run(w, 3100, 0.6).bp) * Math.tanh(gs * 3) * 0.35;
        l += vv * (1 - pn * 0.6); r += vv * (1 + pn * 0.6); wet += vv * 0.6;
      }
    }
    // --- cars: soft low thuds ---
    for (const q of thuds) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.5) {
        ph[20] += (q.f + 25 * Math.exp(-dt * 18)) / SR;
        const vv = Math.sin(TAU * ph[20]) * Math.min(dt / 0.015, 1) * Math.exp(-dt * 8) * q.g + thudF.run(white(), 160, 0.8).lp * Math.min(dt / 0.02, 1) * Math.exp(-dt * 10) * q.g * 0.6;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.4;
      }
    }
    // --- buildings coming down: deep rolling rumbles ---
    {
      let rum = 0, rp = 0;
      for (const q of rumbles) {
        const dt = v - q.t;
        if (dt > 0 && dt < q.dur + 2) { const e = Math.min(dt / 0.4, 1) * Math.exp(-Math.max(0, dt - q.dur) * 1.4) * q.g; rum += e; rp += e * q.pan; }
      }
      const dtl = v - land.t;
      if (dtl > 0 && dtl < land.dur + 3) rum += Math.min(dtl / 0.6, 1) * Math.exp(-Math.max(0, dtl - land.dur) * 1.0) * land.g;
      if (rum > 0) {
        const sub = rumSub.run(white()) * 3, pn = rp / rum;
        const kk = Math.tanh(rum * 0.7) * 0.5;
        l += (rumL.run(white(), 120, 0.6).lp + sub) * kk * (1 - pn * 0.5); r += (rumR.run(white(), 130, 0.6).lp + sub) * kk * (1 + pn * 0.5); wet += sub * kk * 0.4;
      }
    }
    // --- the sonic boom: a double low boom (soft onset) ---
    for (const tb of [V_SOUND, V_SOUND + 0.18]) {
      const dt = v - tb;
      if (dt > 0 && dt < 2.5) {
        ph[24] += (28 + 40 * Math.exp(-dt * 6)) / SR;
        const e = Math.min(dt / 0.02, 1) * Math.exp(-dt * 2.2);
        const vv = (Math.sin(TAU * ph[24]) * 0.8 + boomF.run(white(), 90 + 200 * Math.exp(-dt * 5), 0.6).lp * 0.9) * e * 0.55;
        dl += vv; dr += vv; wet += vv * 0.6;
      }
    }
    // --- the ocean: a roar that grows as it comes (closer = louder and brighter) ---
    if (v > V_OCEAN - 3 && v < V_HIT + 0.3) {
      const dist = Math.max(1, CAM.z - 380 - oceanZ(v));
      const g = clamp(1800 / dist) ** 1.3 * smooth(V_OCEAN - 3, V_OCEAN + 4, v) * 0.55;
      const fc = 120 + 900 * clamp(1500 / dist);
      const wn = white();
      const vv = oceanF[0].run(wn, fc, 0.5).lp + 0.6 * oceanF[1].run(wn, fc * 2.5, 0.7).bp + oceanSub.run(white()) * 3;
      l += vv * g; r += (vv * 0.9 + oceanF[2].run(wn, fc * 1.3, 0.6).lp * 0.2) * g; wet += vv * g * 0.3;
    }
    // --- deep water: everything muffled, a low churning, bubbles drifting up ---
    const under = s.under;
    if (under > 0) {
      const ch = oceanSub.run(white()) * 2.5 * 0.2;
      ph[30] += (300 + 200 * Math.sin(v * 3.1)) / SR;
      const bub = Math.sin(TAU * ph[30]) * Math.pow(Math.max(0, Math.sin(v * 9.3)), 8) * 0.02;
      l += (ch + bub) * under; r += (ch + bub * 0.8) * under;
    }
    const muff = under;
    const fcm = 9000 * Math.pow(250 / 9000, clamp(muff));
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
