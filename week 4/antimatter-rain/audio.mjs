// Procedural soundtrack for "What if it rained antimatter?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// Wind/roar bed (an action disaster). On the street: the rain's hiss and patter, voices, a horn; every burst's blast
// arrives when sound would get there (a crack and a long rumble, louder the closer it was), the first one breaks
// every window on the street (glass raining down, tinkling) and sets off the car alarms; people scream; the sign
// buzzes and the power dies. The drop right over you: a crack swallowed by a roar. Over the city: the booms run
// together into one roar of fire, with a low drone climbing under it. In space: muffled, a deep rumble and the
// drone swelling to the end, the roar into the white, which turns back into the street's rain (loop).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, STORY_START, LOOP, BURSTS, V_GLASS, V_POWER, V_SIGN, V_NEAR, V_DRONE, V_SPACE, V_END, V_DINO, SOUND, psiAt, BEATS } from './src/timeline.js';
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.8)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.88, damp = 0.4) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

// when each burst is heard: on the street (where you stand), then from the drone over the city
const DRONE_EAR = { x: -2500, y: 900, z: 3500 };
const BOOMS = [];
for (const b of BURSTS) {
  let vh, g;
  if (b.vHit < V_NEAR + 0.05) { vh = b.vHit; g = Math.min(2.2, Math.sqrt(psiAt(b.d)) * 1.1); }
  else if (b.v >= V_DRONE - 2) {
    const d = Math.hypot(b.x - DRONE_EAR.x, b.y - DRONE_EAR.y, b.z - DRONE_EAR.z);
    vh = b.v + d / SOUND; g = Math.min(1.2, Math.sqrt(psiAt(d)) * 1.1);
    if (vh < V_DRONE) continue;
  } else continue;
  if (vh < V_SPACE + 1) BOOMS.push({ v: vh, g, seed: b.seed });
}
BOOMS.sort((a, b) => a.v - b.v);

export function makeSoundtrack(outFile) {
  const N = Math.round((VIDEO_DURATION + STORY_START) * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(1000);
  const white = () => R0() * 2 - 1;

  const rainF = [new SVF(), new SVF(), new SVF(), new SVF()], patF = [new SVF(), new SVF()], patE = [new OnePole(30), new OnePole(30)];
  const voiceF = Array.from({ length: 6 }, () => new SVF()), voiceE = Array.from({ length: 6 }, () => new OnePole(5));
  const crackF = [new SVF(), new SVF()], rollF = [new SVF(), new SVF()], rollSub = new OnePole(45);
  const glassF = [new SVF(), new SVF()];
  const roarF = [new SVF(), new SVF()], roarSub = new OnePole(35), gust = new OnePole(0.6);
  const deepF = new SVF(), deepSub = new OnePole(25);
  const padLP = new OnePole(380), padLP2 = new OnePole(380);
  const muffL = new OnePole(14000), muffR = new OnePole(14000);
  const revL = new Reverb(7), revR = new Reverb(8);
  const ph = new Float64Array(48);
  const HORNS = [{ v: -0.9, f: 392, d: 0.6, p: 0.5 }, { v: 1.7, f: 349, d: 1.4, p: -0.4 }, { v: 4.4, f: 415, d: 2.2, p: 0.3 }, { v: 5.0, f: 330, d: 1.6, p: -0.6 }];
  const ALARMS = [0.2, 0.45, 0.9, 1.4, 2.1].map((d, i) => ({ v: V_GLASS + d, f: [900, 1150, 800, 1020, 1300][i], p: [-0.6, 0.6, 0.1, -0.3, 0.4][i], r: [1.6, 2.3, 1.1, 3.1, 1.9][i] }));
  // glass: thousands of little pings as the shards hit the pavement, starting at the far end of the street
  const PINGS = [];
  for (let k = 0; k < 900; k++) {
    const t = V_GLASS + Math.pow(R0(), 1.4) * 2.4 + 0.2;
    PINGS.push({ v: t, f: 2200 + R0() * 5200, pan: R0() * 1.8 - 0.9, g: 0.006 + 0.02 * R0() * R0(), d: 0.02 + 0.06 * R0() });
  }
  PINGS.sort((a, b) => a.v - b.v);
  let pi0 = 0, bi0 = 0;

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;      // d*: not muffled in space
    const street = v < V_NEAR + 0.02 ? 1 : 0;
    const air = v < V_SPACE ? 1 : 0;

    // --- the rain: a broad hiss, plus the patter (quieter over the city: the roar takes over) ---
    if (air) {
      const k = 0.07 * (street ? 1 : 0.35);
      l += (rainF[0].run(white(), 5200, 0.7).bp * 0.6 + rainF[1].run(white(), 1600, 0.8).bp * 0.5) * k;
      r += (rainF[2].run(white(), 5000, 0.7).bp * 0.6 + rainF[3].run(white(), 1700, 0.8).bp * 0.5) * k;
      if (street) for (let c = 0; c < 2; c++) {
        const e = patE[c].run(Math.max(0, white()) ** 6 * 4);
        const pv = patF[c].run(white(), 2600 + 800 * c, 0.5).bp * e * 0.09;
        if (c === 0) l += pv; else r += pv;
      }
    }
    // --- the street: voices (calm, then shouting and screaming after the blast), a few horns ---
    if (street) {
      const calm = 1 - smooth(0.3, 1.0, v);
      const panic = smooth(V_GLASS + 0.2, V_GLASS + 0.8, v) * (1 - smooth(8.5, 11, v));
      const gasp = env(v - 0.35, 0.08, 0.6);
      let cv = 0;
      for (let q = 0; q < 6; q++) {
        const rate = 2.1 + q * 0.7 + 2.5 * panic;
        const a = voiceE[q].run(Math.max(0, Math.sin(v * rate + q * 1.3) + white() * 0.3));
        const f0 = 380 + q * 220 + (500 + q * 160) * panic + 80 * Math.sin(v * (1.1 + q * 0.3) + panic * Math.sin(v * 9 + q));
        cv += voiceF[q].run(white(), f0, 0.18 - 0.08 * panic).bp * a;
      }
      const cg = 0.03 * calm + 0.05 * gasp + 0.075 * panic;
      l += cv * cg; r += cv * cg * 0.93; wet += cv * cg * 0.4;
      for (const hn of HORNS) {
        const dt = v - hn.v;
        if (dt < 0 || dt > hn.d + 0.2) continue;
        const e = Math.min(dt / 0.05, 1) * Math.min(Math.max(hn.d + 0.15 - dt, 0) / 0.08, 1);
        ph[20] += hn.f / SR; ph[21] += hn.f * 1.26 / SR;
        const hv = (Math.tanh(2 * Math.sin(TAU * ph[20])) + 0.7 * Math.tanh(2 * Math.sin(TAU * ph[21]))) * e * 0.02;
        l += hv * (1 - hn.p) * 0.6; r += hv * (1 + hn.p) * 0.6; wet += hv * 0.6;
      }
      // car alarms: sweeping wails and pulsing beeps
      ALARMS.forEach((al, i) => {
        const dt = v - al.v;
        if (dt < 0) return;
        const e = Math.min(dt / 0.1, 1);
        ph[24 + i] += al.f * (1 + 0.25 * Math.sin(TAU * dt * al.r * 0.5)) / SR;
        const beep = i % 2 ? (Math.sin(TAU * dt * al.r) > 0 ? 1 : 0.15) : 1;
        const av = Math.sin(TAU * ph[24 + i]) * e * beep * 0.011;
        l += av * (1 - al.p); r += av * (1 + al.p); wet += av * 0.8;
      });
      // the windows: a burst of breaking glass along the street, then shards raining down and ringing on the ground
      {
        const dt = v - V_GLASS;
        if (dt > 0 && dt < 0.9) {
          const e = env(dt, 0.004, 0.18) + 0.35 * env(dt - 0.12, 0.01, 0.25);
          l += glassF[0].run(white(), 5200, 0.4).hp * e * 0.32; r += glassF[1].run(white(), 4800, 0.4).hp * e * 0.32;
          wet += e * white() * 0.05;
        }
        while (pi0 < PINGS.length && PINGS[pi0].v + 0.3 < v) pi0++;
        for (let i = pi0; i < PINGS.length && PINGS[i].v <= v; i++) {
          const p = PINGS[i], t = v - p.v;
          if (t > 0.3) continue;
          const pv = Math.sin(TAU * p.f * t) * env(t, 0.0008, p.d) * p.g;
          l += pv * (1 - p.pan); r += pv * (1 + p.pan); wet += pv * 0.5;
        }
      }
      // the sign: buzzing as the power falters, then the hum of the grid dying
      {
        const bz = smooth(V_SIGN - 1.0, V_SIGN - 0.8, v) * (1 - smooth(V_SIGN, V_SIGN + 0.25, v));
        if (bz > 0) { ph[1] += 120 / SR; const fl = Math.sin(v * 53) > -0.2 ? 1 : 0.2; const bv = (saw(ph[1]) * 0.5 + saw(ph[1] * 2) * 0.25) * bz * fl * 0.02; l += bv; r += bv; }
        const dt = v - V_POWER;
        if (dt > 0 && dt < 2.5) { ph[2] += (60 * Math.exp(-dt * 1.2) + 18) / SR; const pv = Math.sin(TAU * ph[2]) * env(dt, 0.02, 0.7) * 0.14; dl += pv; dr += pv; }
      }
    }
    // --- the booms: each burst's blast as it arrives (a crack, then a long rumble) ---
    {
      let crackE = 0, rollE = 0;
      while (bi0 < BOOMS.length && BOOMS[bi0].v + 5 < v) bi0++;
      for (let i = bi0; i < BOOMS.length && BOOMS[i].v <= v; i++) {
        const b = BOOMS[i], dt = v - b.v;
        crackE += b.g * b.g * env(dt, 0.004, 0.09);
        rollE += b.g * env(dt, 0.06, 1.1) * (0.75 + 0.25 * Math.sin(dt * 6 + b.seed * 30));
      }
      const roll = Math.min(rollE, 3) / (1 + 0.15 * Math.max(0, rollE - 3));
      if (crackE > 0) { const c = crackF[0].run(white(), 1100, 0.5).lp * Math.min(crackE, 3) * 0.9; l += c; r += crackF[1].run(white(), 1000, 0.5).lp * Math.min(crackE, 3) * 0.9; wet += c * 0.5; }
      if (roll > 0) {
        const rv = (rollF[0].run(white(), 140, 0.5).lp * 1.2 + rollSub.run(white()) * 3.5) * roll * 0.3;
        l += rv; r += rollF[1].run(white(), 160, 0.5).lp * 1.2 * roll * 0.3 + rollSub.y * 3.5 * roll * 0.3; wet += rv * 0.4;
      }
    }
    // --- the drop right over you: everything white, one enormous crack swallowed by a roar ---
    {
      const dt = v - V_NEAR;
      if (dt > 0 && dt < 3) {
        const c = crackF[0].run(white(), 2500, 0.3).lp * env(dt, 0.002, 0.25) * 2.2;
        l += c; r += c; wet += c * 0.6;
        const ro = roarF[0].run(white(), 300 + 900 * Math.exp(-dt * 2), 0.4).lp * env(dt, 0.01, 1.2) * 1.4;
        dl += ro; dr += ro;
      }
    }
    // --- the city burning: one wide roar of fire and wind, rising and falling in gusts ---
    {
      const k = smooth(V_DRONE - 0.4, V_DRONE + 1, v) * (1 - smooth(V_SPACE - 0.3, V_SPACE + 0.2, v)) + smooth(V_END - 6, V_END, v) * 1.4;
      if (k > 0) {
        const g = gust.run(0.6 + 0.4 * Math.sin(v * 0.7) * Math.sin(v * 0.31 + 2) + 0.25 * white());
        const lv = (roarF[0].run(white(), 260 + 300 * g, 0.55).bp * 0.7 + roarSub.run(white()) * 2.0) * (0.13 + 0.07 * g) * k;
        const rv = (roarF[1].run(white(), 300 + 300 * g, 0.55).bp * 0.7 + roarSub.y * 2.0) * (0.13 + 0.07 * g) * k;
        if (v < V_SPACE) { l += lv; r += rv; } else { dl += lv; dr += rv; }
      }
    }
    // --- a low drone: two notes a minor third apart, climbing with the drops, loudest at the end ---
    {
      const climb = clamp((v - 8) / (V_END - 8));
      const f0 = 41.2 * Math.pow(2, climb * 0.75);
      const dg = (0.012 + 0.06 * smooth(8, V_END, v)) * smooth(6, 12, v) * (1 - smooth(V_END + 0.2, V_END + 0.7, v));
      let pv = 0, pv2 = 0;
      [1, 1.189, 1.5, 2].forEach((m, q) => { ph[10 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[10 + q]) * (q === 0 ? 0.8 : 0.35); });
      [1.003, 1.192, 1.498].forEach((m, q) => { ph[15 + q] += (f0 * m * 2) / SR; pv2 += saw(ph[15 + q]) * 0.25; });
      pv = padLP.run(pv) * dg; pv2 = padLP2.run(pv2) * dg * 0.6;
      dl += pv + pv2 * 0.6; dr += pv * 0.9 + pv2; wet += (pv + pv2) * 0.4;
    }
    // --- space: a deep rumble under everything; a swell at each big moment ---
    if (v >= V_SPACE) {
      const dv = (deepF.run(white(), 70, 0.5).lp * 1.5 + deepSub.run(white()) * 3) * 0.12 * smooth(V_SPACE, V_SPACE + 1, v) * (1 + 1.5 * smooth(V_SPACE + 10, V_END, v));
      dl += dv; dr += dv;
      for (const bt of BEATS) {
        const dt = v - bt.v;
        if (bt.v < V_SPACE || dt < -1 || dt > 3) continue;
        ph[40] += (36 + 10 * Math.exp(-Math.max(dt, 0))) / SR;
        const ev = Math.sin(TAU * ph[40]) * smooth(-1, 0, dt) * env(Math.max(dt, 0) + 0.001, 0.001, 1.0) * (bt.v === V_DINO ? 0.22 : 0.1);
        dl += ev; dr += ev; wet += ev * 0.5;
      }
    }
    // --- the white at the end: a final blast ---
    {
      const dt = v - V_END;
      if (dt > -0.1 && dt < 1.5) {
        const c = crackF[1].run(white(), 1800, 0.3).lp * env(dt + 0.1, 0.05, 0.4) * 1.6;
        dl += c; dr += c; wet += c * 0.5;
      }
    }

    // in space, the world below is far away: muffled
    const fcm = v >= V_SPACE ? 500 : 14000;
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // the white at the end fades into the lead-in to the first frame (the street's rain just before drop 1)
    const a = N - N0, xf = Math.round(0.8 * SR);
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
