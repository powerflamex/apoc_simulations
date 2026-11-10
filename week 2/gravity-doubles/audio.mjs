// Procedural soundtrack for "What if gravity doubled every 5 seconds?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) A riverside plaza at sunset: the crowd,
// the fountain, traffic, an airliner overhead. Every doubling lands as a deep, heavy "whoomp", and a low drone
// sinks a semitone with each one. Your breathing strains and your heart pounds; the black-out muffles everything;
// you hit the ground. Far-off collapses arrive late (sound takes ~2 s to cross the river): the wheel, the towers,
// the bridge, the plane's crash. Rain; then the ground itself rumbles, the crust roars red-hot, and the collapse
// rises into the white, which turns back into the plaza at the start (the video loops).
// No sharp clicks or crackles anywhere (they read as "plastic breaking"): every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, T_SWITCH, DOUBLE, T0, gAt, vAtG, V_FALL, V_CRASH, V_HEART, V_BREATH, V_RAIN, V_GLOW, V_ATOMS, V_BH, V_GRID } from './src/timeline.js';
import { WHEEL, BRIDGE, B, fallDur, inFrame, CAM, PLANE } from './src/layout.js';
import { SEG_FALL, TOWER_FALL } from './src/bridge.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const C = 343;   // speed of sound, m/s

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
const dist = (x, z) => Math.hypot(x - CAM.x, z - CAM.z);

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);          // synthesis starts LOOP s before the first frame; that lead-in becomes the end
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(9191);
  const white = () => R0() * 2 - 1;

  // ---- scheduled events ----
  // each doubling: a deep whoomp, heavier every time
  const doublings = [];
  for (let k = 1; k < 16; k++) { const v = k * DOUBLE - T0; if (v > -1 && v < T_SWITCH - 0.5) doublings.push({ t: v, k }); }
  // the far collapses, heard when their sound arrives: towers in view, the wheel, the bridge, the plane
  const rumbles = [];
  for (const b of B) {
    if (!inFrame(b)) continue;
    const d = dist(b.x, b.z);
    if (d > 2200 || b.h < 40) continue;
    rumbles.push({ t: b.vFall + d / C, dur: fallDur(b) + 1.5, g: Math.min(0.5, 0.05 + b.h / 600) * Math.min(1, 700 / d), pan: Math.max(-0.8, Math.min(0.8, (b.x - CAM.x) / d * 3)) });
  }
  const wd = dist(WHEEL.x, WHEEL.z);
  const wheelGroan = { t0: WHEEL.v0 - 0.6 + wd / C, t1: WHEEL.v1 + wd / C };
  const wheelHit = { t: WHEEL.v1 + wd / C, g: 0.6 };
  const bd = dist(BRIDGE.x, (BRIDGE.t1 + BRIDGE.t2) / 2);
  const cableSnaps = [{ t: BRIDGE.v0 + bd / C, g: 0.45, pan: 0.5 }, { t: BRIDGE.v0 + 0.12 + bd / C, g: 0.35, pan: 0.55 }];
  const splashes = SEG_FALL.map((vf, i) => ({ t: vf + Math.sqrt(2 * (BRIDGE.deck + 2.4) / (9.81 * gAt(vf))) * 1.6 + bd / C, g: 0.05 + 0.04 * Math.sin(i * 1.7) ** 2 }));
  const towersB = TOWER_FALL.map((vf) => ({ t: vf + 1.2 + bd / C, g: 0.35, pan: 0.5 }));
  const crashD = Math.hypot(-125 - CAM.x, PLANE.z - CAM.z);
  const crash = { t: V_CRASH + crashD / C, g: 0.7 };
  // people around you going down: soft groans and gasps between 1.5x and 4x, then nothing
  const groans = [];
  for (let k = 0; k < 26; k++) { const g = 1.5 + Math.pow(R0(), 0.8) * 2.6; groans.push({ t: vAtG(g), f: 140 + R0() * 160, d: 0.5 + R0() * 0.6, g: 0.008 + R0() * 0.01, pan: R0() * 1.6 - 0.8 }); }
  // the near heavy thuds: bodies, the lamp posts and tree crowns hitting the paving
  const thuds = [];
  for (let k = 0; k < 30; k++) { const g = 2.4 + Math.pow(R0(), 0.7) * 12; thuds.push({ t: vAtG(g), f: 55 + R0() * 35, g: 0.05 + R0() * 0.06, pan: R0() * 1.6 - 0.8 }); }
  // the crust cracking at the end: deep ground thumps
  const cracks = [];
  for (let t = vAtG(1300); t < V_BH; t += 0.25 + R0() * 0.6) cracks.push({ t, f: 35 + R0() * 25, g: 0.08 + R0() * 0.1, pan: R0() * 1.4 - 0.7 });

  // ---- voices ----
  const cityLP = new OnePole(220), cityLP2 = new OnePole(160);
  const crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const fountF = new SVF(), fountF2 = new SVF(), jetF = new SVF();
  const breathF = new SVF(), breathE = new OnePole(8);
  const muffL = new OnePole(8000), muffR = new OnePole(8000);
  const rumbleL = new SVF(), rumbleR = new SVF(), rumSub = new OnePole(50);
  const groanF = new SVF(), boomF = new SVF(), crashF = new SVF(), splashF = new SVF(), rainF = new SVF(), rainF2 = new SVF();
  const flowF = new SVF(), flowSub = new OnePole(40), roarL = new SVF(), roarR = new SVF(), roarHi = new SVF();
  const padLP = new OnePole(700), droneLP = new OnePole(380), whoompF = new SVF(), jetEngF = new SVF(), metalF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(64);

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    const g = s.g;
    let l = 0, r = 0, wet = 0;          // ambient bus (gets muffled when you black out)
    let dl = 0, dr = 0;                  // your body (breath, heart): not muffled

    // --- the plaza at sunset: distant traffic, the crowd, the fountain ---
    const life = 1 - smooth(4, 9, v);
    const city = (cityLP2.run(cityLP.run(white())) * 0.5) * 0.12 * (1 - smooth(6, 12, v)) * (1 - smooth(V_GRID, V_GRID + 3, v) * 0.5);
    l += city; r += city * 0.92;
    let cv = 0;
    for (let k = 0; k < 5; k++) {
      const amp = crowdE[k].run(Math.max(0, Math.sin(v * (2.1 + k * 0.7) + k * 1.3) + white() * 0.2));
      cv += crowdF[k].run(white(), 350 + k * 230 + 100 * Math.sin(v * (1.1 + k * 0.3)), 0.25).bp * amp;
    }
    const crowdG = 0.05 * life * (1 + 0.8 * smooth(1, 3, v) * (1 - smooth(4, 7, v)));
    l += cv * crowdG; r += cv * crowdG * 0.95;
    // the fountain: a splashing hiss that gets lower and quieter as the jets shrink, gone with the pumps
    const fountG = 0.05 / Math.pow(Math.max(g, 1), 0.35) * s.pump;
    if (fountG > 1e-4) {
      const fn = white();
      const f1 = fountF.run(fn, 2600 / Math.sqrt(g) + 600, 0.6).bp, f2 = fountF2.run(fn, 900, 0.8).bp;
      l += (f1 * 0.7 + f2 * 0.5) * fountG * 0.9; r += (f1 * 0.6 + f2 * 0.6) * fountG * 1.1; wet += f1 * fountG * 0.3;
    }
    // the airliner overhead: a distant roar sweeping right to left, power pushed up as it sinks
    if (v < V_CRASH + 0.3) {
      const pw = 1 + 0.6 * smooth(2.5, 5.5, v);
      const pan = Math.max(-0.9, Math.min(0.9, 0.7 - v * 0.15));
      const e = 0.05 * pw * (1 - smooth(V_CRASH - 0.2, V_CRASH + 0.3, v));
      const jn = jetEngF.run(white(), 500 + 400 * smooth(2.5, 5.5, v), 0.4).bp;
      ph[1] += (240 + 160 * smooth(2.5, 5.5, v)) / SR;
      const whine = Math.sin(TAU * ph[1]) * 0.15 * smooth(2.5, 5, v);
      l += (jn + whine * 0.3) * e * (1 - pan) * 0.5; r += (jn + whine * 0.3) * e * (1 + pan) * 0.5; wet += jn * e * 0.4;
    }
    // groans as people go down
    for (const q of groans) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        ph[2] += (q.f * (1 - 0.25 * dt / q.d)) / SR;
        const vv = groanF.run(Math.sin(TAU * ph[2]) + 0.35 * Math.sin(2 * TAU * ph[2]), q.f * 2, 0.7).lp * Math.sin(Math.PI * dt / q.d) * q.g * 5;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.5;
      }
    }
    for (const q of thuds) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.5) {
        ph[3] += (q.f + 30 * Math.exp(-dt * 20)) / SR;
        const vv = Math.sin(TAU * ph[3]) * Math.min(dt / 0.012, 1) * Math.exp(-dt * 9) * q.g;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.4;
      }
    }

    // --- every doubling: a deep whoomp (soft attack), heavier each time ---
    for (const d of doublings) {
      const dt = v - d.t;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.08, 1) * Math.exp(-Math.max(dt, 0) * 2.0);
        ph[4 + (d.k % 2)] += (30 + 34 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const gk = 0.22 + 0.03 * Math.min(d.k, 12);
        const vv = (Math.sin(TAU * ph[4 + (d.k % 2)]) * 0.9 + whoompF.run(white(), 120, 0.7).lp * 0.8) * e * gk;
        dl += vv; dr += vv;
      }
    }
    // --- a low drone that sinks a semitone with each doubling ---
    {
      const semis = (v + T0) / DOUBLE;
      const f0 = 98 * Math.pow(2, -semis / 12);
      const dg = 0.05 * smooth(-1, 1, v) * (1 - smooth(T_SWITCH - 0.5, T_SWITCH, v)) * (1 + 0.6 * s.heat);
      let pv = 0;
      [1, 1.5, 2, 2.4, 3].forEach((m, k) => { ph[8 + k] += (f0 * m * (1 + 0.002 * k)) / SR; pv += saw(ph[8 + k]) * (k === 0 ? 0.8 : 0.4); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.6;
    }

    // --- your body: strained breathing (until you can't), a pounding heart (until it stops), the fall ---
    {
      const strain = smooth(1.2, 4.0, g);
      const bRate = 0.35 + 0.25 * strain;
      const bp = (v * bRate) % 1;
      const inhale = bp < 0.45 ? Math.sin(Math.PI * bp / 0.45) : 0;
      const exhale = bp >= 0.45 ? Math.sin(Math.PI * (bp - 0.45) / 0.55) * 0.7 : 0;
      const be = breathE.run((inhale + exhale) * (0.3 + 0.7 * strain)) * s.breath * smooth(-1, 0.5, v);
      const bn = breathF.run(white(), 900 + 700 * inhale, 0.5).bp * be * 0.08;
      dl += bn; dr += bn;
      const hb = 1.6 + 1.0 * strain - 0.8 * smooth(V_BREATH, V_HEART, v);   // beats per second, faltering at the end
      ph[20] += hb / SR;
      const hp = ph[20] % 1;
      const lub = Math.exp(-Math.pow((hp - 0.05) / 0.03, 2)), dub = 0.7 * Math.exp(-Math.pow((hp - 0.3) / 0.03, 2));
      ph[21] += 48 / SR;
      const heart = Math.sin(TAU * ph[21]) * (lub + dub) * 0.22 * smooth(0.5, 3.5, v + 3) * (0.5 + 0.7 * strain) * s.heart;
      dl += heart; dr += heart;
      // hitting the ground
      const dt = v - (V_FALL + 0.5);
      if (dt > 0 && dt < 0.6) {
        ph[22] += (50 + 40 * Math.exp(-dt * 25)) / SR;
        const vv = Math.sin(TAU * ph[22]) * Math.min(dt / 0.01, 1) * Math.exp(-dt * 8) * 0.5;
        dl += vv; dr += vv;
      }
    }

    // --- far collapses: deep rolling rumbles, arriving late ---
    let rum = 0, rp = 0;
    for (const q of rumbles) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.dur + 2) {
        const e = Math.min(dt / 0.4, 1) * Math.exp(-Math.max(0, dt - q.dur) * 1.4) * q.g;
        rum += e; rp += e * q.pan;
      }
    }
    if (rum > 0) {
      const sub = rumSub.run(white()) * 3;
      const pn = rp / rum;
      const k = Math.tanh(rum * 0.8) * 0.5;
      l += (rumbleL.run(white(), 120, 0.6).lp + sub) * k * (1 - pn * 0.5); r += (rumbleR.run(white(), 130, 0.6).lp + sub) * k * (1 + pn * 0.5); wet += sub * k * 0.4;
    }
    // the wheel: a long low metal groan as it gives, then the impact
    if (v > wheelGroan.t0 && v < wheelGroan.t1 + 0.3) {
      const k = clamp((v - wheelGroan.t0) / (wheelGroan.t1 - wheelGroan.t0));
      ph[24] += (70 - 25 * k + 6 * Math.sin(v * 7)) / SR;
      const vv = metalF.run(saw(ph[24]) + 0.5 * saw(ph[24] * 1.49), 260 + 120 * k, 2.5).bp * 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.05));
      l += vv * 1.1; r += vv * 0.8; wet += vv * 1.2;
    }
    for (const q of [wheelHit, ...cableSnaps, ...towersB, crash]) {
      const dt = v - q.t;
      if (dt > 0 && dt < 4) {
        ph[26] += (34 + 30 * Math.exp(-dt * 3)) / SR;
        const e = Math.min(dt / 0.04, 1) * Math.exp(-dt * 1.1) * q.g;
        const vv = Math.sin(TAU * ph[26]) * e * 0.6 + boomF.run(white(), 80 + 160 * Math.exp(-dt * 2.5), 0.5).lp * e * 0.8;
        const pn = q.pan || 0;
        l += vv * (1 - pn * 0.4); r += vv * (1 + pn * 0.4); wet += vv * 0.5;
      }
    }
    for (const q of splashes) {
      const dt = v - q.t;
      if (dt > 0 && dt < 1.2) {
        const vv = splashF.run(white(), 450, 1.0).bp * Math.min(dt / 0.08, 1) * Math.exp(-dt * 3.5) * q.g;
        l += vv * 0.6; r += vv * 1.2; wet += vv * 0.6;
      }
    }

    // --- rain: a heavy, dense hiss ---
    if (s.rain > 0.001) {
      const vv = rainF.run(white(), 3800, 0.6).bp * 0.5 + rainF2.run(white(), 1200, 0.8).bp * 0.4;
      l += vv * s.rain * 0.09; r += vv * s.rain * 0.09; wet += vv * s.rain * 0.05;
    }
    // --- the ground flowing: a slow, enormous groan under everything ---
    const flowG = 0.12 * s.flow * (1 - smooth(T_SWITCH - 1.5, T_SWITCH - 0.3, v));
    if (flowG > 0) {
      const sub = flowSub.run(white()) * 3.5 * (0.7 + 0.3 * Math.sin(v * 1.3));
      const fl = flowF.run(white(), 70 + 20 * Math.sin(v * 0.8), 0.7).lp;
      l += (sub + fl) * flowG; r += (sub + fl * 0.9) * flowG;
    }
    for (const q of cracks) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.8) {
        ph[30] += (q.f + 20 * Math.exp(-dt * 12)) / SR;
        const vv = Math.sin(TAU * ph[30]) * Math.min(dt / 0.02, 1) * Math.exp(-dt * 5) * q.g;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // --- the red-hot crust and the collapse: a roar that rises into the white ---
    const roarK = smooth(V_GLOW, V_ATOMS, v) * 0.3 + smooth(V_ATOMS - 1, V_BH + 1.5, v) * 0.7;
    const roarG = 0.35 * roarK * roarK * (1 - smooth(T_SWITCH - 0.7, T_SWITCH - 0.1, v));
    if (roarG > 0) {
      const fc = 140 + 700 * roarK * roarK;
      const hi = roarHi.run(white(), 1600 + 1200 * roarK, 0.8).bp * roarK * 0.25;
      l += (roarL.run(white(), fc, 0.5).lp + hi) * roarG; r += (roarR.run(white(), fc * 1.05, 0.5).lp + hi) * roarG;
    }
    if (v > V_BH && v < T_SWITCH) {
      const e = smooth(V_BH, V_BH + 1.2, v) * (1 - smooth(T_SWITCH - 0.6, T_SWITCH - 0.1, v)) * 0.03;
      ph[40] += 2093 / SR; ph[41] += 3136 / SR;
      const vv = (Math.sin(TAU * ph[40]) + 0.4 * Math.sin(TAU * ph[41])) * e;
      dl += vv; dr += vv;
    }

    // the black-out muffles the world; hearing comes back as you come round
    const muff = Math.max(s.grey * 0.6, s.black * 1.25);
    const fc = 9000 * Math.pow(220 / 9000, clamp(muff));
    muffL.set(fc); muffR.set(fc);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.8, outR = r + dr + rr * 0.8;
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
