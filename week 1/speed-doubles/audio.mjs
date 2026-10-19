// Procedural soundtrack for "What if your speed doubled every 2 seconds?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the apps on top; this is the bed under it.) 42nd Street at sunset: the crowd, horns,
// phone shutters; then your footsteps speeding up and the wind rising to a roar; the sonic boom, glass raining
// and car alarms behind you; the plasma roar into the white. In space a whoosh every lap, the laps fusing into a
// hum whose pitch is the lap rate; the oceans hissing, the crust rumbling, Earth's break-up; the solar laps
// rising again into the white, which turns back into the street at the start (the video loops).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, V_GO, V_SOUND, V_ORBIT, V_LIGHT, V_BOOM, V_SUN, V_BALL, T_SWITCH, mphAt, rateAt, distAt, solarPathAU } from './src/timeline.js';
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
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 30), SR / 8) / SR);
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
  const L = new Float32Array(N), R = new Float32Array(N);
  const N0 = Math.round(LOOP * SR);          // synthesis starts LOOP s before the first frame; that lead-in becomes the end
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;

  // events
  const steps = [];            // footfalls: cadence climbs with your speed until it is a blur
  {
    let t = V_GO;
    while (t < V_GO + 11) { const T = t - V_GO; const f = Math.min(2.4 + T * 0.55, 9); steps.push({ t, g: 0.16 * (1 - smooth(7, 11, T)) }); t += 1 / f; }
  }
  const shutters = [];
  for (let t = -1; t < V_GO + 3; t += 0.15 + R0() * 0.5) shutters.push({ t, pan: R0() * 1.6 - 0.8, g: 0.02 + R0() * 0.03 });
  const horns = [];
  for (let t = -1; t < 12; t += 1.5 + R0() * 3) horns.push({ t, f: 330 + R0() * 120, d: 0.25 + R0() * 0.4, pan: R0() * 1.6 - 0.8, g: 0.012 + R0() * 0.01 });
  const glass = [];
  for (let i = 0; i < 1400; i++) { const t = V_SOUND + 0.1 + Math.pow(R0(), 1.4) * 5.5; glass.push({ t, f: 2500 + R0() * 6000, d: 0.02 + R0() * 0.08, g: (0.02 + R0() * 0.05) * (1 - smooth(V_SOUND, V_SOUND + 6, t) * 0.7), pan: R0() * 1.8 - 0.9 }); }
  // laps around Earth (whooshes while you can still count them)
  const LAP_M = 40.075e6;
  const lapE = (v) => distAt(v) / LAP_M;

  const fs1 = new SVF(), crowdF = Array.from({ length: 5 }, () => new SVF()), crowdE = Array.from({ length: 5 }, () => new OnePole(3));
  const cityLP = new OnePole(200), cityLP2 = new OnePole(140), windF = new SVF(), windF2 = new SVF(), roarLP = new OnePole(120), roarLP2 = new OnePole(80);
  const boomLP = new OnePole(90), boomLP2 = new OnePole(70), glassF = new SVF(), alarmLP = new OnePole(2000), plasmaF = new SVF(), hissF = new SVF();
  const rumbleLP = new OnePole(60), rumbleLP2 = new OnePole(45), whooshF = new SVF(), humLP = new OnePole(800), padLP = new OnePole(600), swellF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(32);

  let s = state(-LOOP);
  let lastLap = Math.floor(lapE(-LOOP));
  const lapHits = [];
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0;
    const street = v < V_ORBIT;
    const mph = s.mph;

    // ---- 42nd Street before you go: crowd murmur, traffic hum, horns, phone shutters (fading as you leave) ----
    const here = 1 - smooth(V_GO + 0.5, V_GO + 6, v);
    if (here > 0.001) {
      let cv = 0;
      for (let k = 0; k < 5; k++) {
        const a = crowdE[k].run(Math.max(0, Math.sin(v * (2.3 + k * 0.6) + k) + white() * 0.25));
        cv += crowdF[k].run(white(), 350 + k * 230 + 100 * Math.sin(v * (1.3 + k * 0.4)), 0.3).bp * a;
      }
      const c = cityLP2.run(cityLP.run(white())) * 2.2;
      l += (cv * 0.05 + c * 0.06) * here; r += (cv * 0.048 + c * 0.06) * here; wet += cv * 0.02 * here;
    }
    for (const e of shutters) { const dt = v - e.t; if (dt > 0 && dt < 0.03) { const x = white() * e.g * (dt < 0.004 || (dt > 0.016 && dt < 0.02) ? 1 : 0.15) * here; l += x * (1 - e.pan) * 0.5; r += x * (1 + e.pan) * 0.5; } }
    for (const h of horns) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d) {
        ph[0] += h.f / SR;
        const x = (saw(ph[0]) * 0.6 + saw(ph[0] * 1.26) * 0.4) * h.g * Math.min(dt / 0.02, 1) * Math.min((h.d - dt) / 0.05, 1) * (1 - smooth(V_GO + 2, V_GO + 7, v));
        l += x * (1 - h.pan) * 0.5; r += x * (1 + h.pan) * 0.5; wet += x * 0.3;
      }
    }

    // ---- your footsteps ----
    for (const st of steps) {
      const dt = v - st.t;
      if (dt > 0 && dt < 0.12) {
        ph[1] += (70 + 60 * Math.exp(-dt * 40)) / SR;
        const x = (Math.sin(TAU * ph[1]) * Math.exp(-dt * 30) + white() * 0.4 * Math.exp(-dt * 90)) * st.g;
        l += x; r += x;
      }
    }

    // ---- wind: rising with speed into a roar ----
    if (street) {
      const w = smooth(V_GO + 1, V_SOUND, v);
      const wg = 0.02 + 0.12 * w + 0.08 * s.heat;
      const w1 = windF.run(white(), 300 + 1600 * w + 400 * Math.sin(v * 2.1), 0.5).bp;
      const w2 = windF2.run(white(), 2400 + 900 * Math.sin(v * 3.3), 0.7).bp;
      const ro = roarLP2.run(roarLP.run(white())) * 4 * smooth(V_SOUND - 3, V_SOUND + 2, v);
      l += (w1 + w2 * 0.35) * wg * smooth(V_GO, V_GO + 1.5, v) + ro * 0.12; r += (w1 * 0.95 + w2 * 0.4) * wg * smooth(V_GO, V_GO + 1.5, v) + ro * 0.12;
      // plasma: crackle and roar as the air ahead glows
      if (s.heat > 0) {
        const cr = plasmaF.run(white() * (R0() < 0.02 ? 6 : 1), 900 + 2500 * s.heat, 0.4).bp * s.heat * 0.09;
        l += cr; r += cr * 0.9;
      }
    }

    // ---- the sonic boom (an N-wave double crack), the rumble, glass raining, car alarms ----
    {
      const dt = v - V_SOUND;
      if (dt > -0.01 && dt < 4) {
        const nw = (dt > 0 && dt < 0.11 ? (1 - 2 * dt / 0.11) : 0) * 0.9;
        const b = boomLP2.run(boomLP.run(white())) * 6 * Math.exp(-Math.max(dt, 0) * 1.6) * smooth(-0.01, 0.02, dt);
        l += nw + b; r += nw * 0.95 + b; wet += (nw + b) * 0.5;
      }
      let gl = 0;
      for (const g of glass) { const t = v - g.t; if (t > 0 && t < g.d) gl += Math.sin(TAU * g.f * t) * Math.exp(-t * 60) * g.g * (1 + white() * 0.3); }
      if (gl !== 0) { const gv = glassF.run(gl, 5200, 0.6).hp; l += gv * 0.9; r += gv; wet += gv * 0.6; }
      const al = smooth(V_SOUND + 0.4, V_SOUND + 1.2, v) * (1 - smooth(V_SOUND + 4.5, V_SOUND + 6.5, v));
      if (al > 0) {
        ph[2] += (Math.sin(v * TAU * 2.4) > 0 ? 880 : 660) / SR;
        ph[3] += (Math.sin(v * TAU * 1.3 + 1) > 0 ? 1040 : 780) / SR;
        const a = alarmLP.run(Math.sign(Math.sin(TAU * ph[2])) * 0.5 + Math.sign(Math.sin(TAU * ph[3])) * 0.4) * 0.018 * al;
        l += a * 0.7; r += a; wet += a * 0.8;
      }
    }

    // ---- space: a whoosh each lap, then the laps fuse into a hum whose pitch is the lap rate ----
    if (!street && v < V_BOOM + 0.2) {
      const k = Math.floor(lapE(v));
      if (k > lastLap) { for (let j = lastLap + 1; j <= k; j++) lapHits.push(v); lastLap = k; if (lapHits.length > 40) lapHits.splice(0, lapHits.length - 40); }
      const rate = (lapE(v + 0.01) - lapE(v - 0.01)) / 0.02;
      let wh = 0;
      if (rate < 12) for (const t of lapHits) { const dt = v - t; if (dt > -0.2 && dt < 0.25) wh += Math.exp(-Math.pow(dt / 0.06, 2)); }
      if (wh > 0.001) { const x = whooshF.run(white(), 600 + 2400 * clamp(wh), 0.6).bp * wh * 0.18; l += x; r += x * 0.9; wet += x * 0.5; }
      const humG = smooth(6, 30, rate) * 0.07;
      if (humG > 0) {
        const f0 = Math.min(40 + rate * 0.9, 900);
        let hv = 0;
        [1, 2, 3].forEach((m, i) => { ph[4 + i] += f0 * m / SR; hv += saw(ph[4 + i]) * [0.7, 0.35, 0.2][i]; });
        humLP.set(400 + f0 * 3);
        hv = humLP.run(hv) * humG;
        l += hv; r += hv; wet += hv * 0.4;
      }
      // a low space pad
      let pv = 0;
      [55, 82.4, 110, 164.8].forEach((f, i) => { ph[8 + i] += f * (1 + 0.002 * i) / SR; pv += saw(ph[8 + i]) * 0.3; });
      pv = padLP.run(pv) * 0.05 * smooth(V_ORBIT, V_ORBIT + 1, v);
      l += pv; r += pv; wet += pv * 0.8;
      // the oceans hissing, the crust rumbling
      const boil = smooth(V_LIGHT + 6, V_LIGHT + 8.6, v);
      if (boil > 0) { const x = hissF.run(white(), 3500, 0.5).bp * boil * 0.06; l += x; r += x * 1.05; }
      const melt = smooth(V_LIGHT + 8.6, V_BOOM, v);
      if (melt > 0) { const x = rumbleLP2.run(rumbleLP.run(white())) * 8 * melt; l += x; r += x; }
    }
    // ---- Earth breaks apart ----
    {
      const dt = v - V_BOOM;
      if (dt > -0.01 && dt < 3) {
        const b = boomLP2.run(boomLP.run(white())) * 9 * Math.exp(-Math.max(dt, 0) * 1.1) * smooth(-0.01, 0.03, dt);
        l += b; r += b; wet += b * 0.7;
      }
    }
    // ---- the solar laps: a hum rising with the lap rate, then the swell into the white ----
    if (v > V_SUN - 0.2) {
      const au = solarPathAU(v);
      const rate = mphAt(v) * rateAt(v) / 3600 / (au * 9.296e7 * TAU);
      const f0 = Math.min(30 + rate * 3, 700);
      let hv = 0;
      [1, 1.5, 2].forEach((m, i) => { ph[14 + i] += f0 * m / SR; hv += saw(ph[14 + i]) * [0.6, 0.3, 0.25][i]; });
      humLP.set(300 + f0 * 2);
      hv = humLP.run(hv) * 0.06 * smooth(V_SUN - 0.2, V_SUN + 1, v) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      l += hv; r += hv; wet += hv * 0.5;
      let pv = 0;
      [110, 164.8, 220, 277.2, 329.6].forEach((f, i) => { ph[18 + i] += f * (1 + 0.003 * Math.sin(v + i)) / SR; pv += Math.sin(TAU * ph[18 + i]) * 0.25; });
      pv *= 0.05 * smooth(V_SUN, V_SUN + 2, v) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH, v));
      l += pv; r += pv; wet += pv;
      const sw = smooth(V_BALL - 1, T_SWITCH, v) * (1 - smooth(T_SWITCH, T_SWITCH + 0.3, v));
      if (sw > 0) { const x = swellF.run(white(), 400 + 5000 * sw * sw, 0.6).bp * sw * 0.2; l += x; r += x; wet += x * 0.8; }
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    if (n < 0) { PL[n + N0] = l + rl * 0.8; PR[n + N0] = r + rr * 0.8; } else { L[n] = l + rl * 0.8; R[n] = r + rr * 0.8; }
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
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {   // no fade at the ends: they join up when the video loops
    buf.writeInt16LE(Math.round(clamp(L[n] * g, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(R[n] * g, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
