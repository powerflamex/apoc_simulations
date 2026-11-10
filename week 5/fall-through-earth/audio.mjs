// Procedural soundtrack for "What if you fell through the Earth?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// An action bed (wind/roar), as the owner likes for physical disasters: the crowd gasping above you in the plaza,
// the metro train's rush as you cut through its tunnel, a roar that rises with your speed (pitch and level follow
// the real speed, so it peaks at the center), a deep rumble through the glowing mantle, a churning boil in the
// liquid core, a soft low thump on every landmark, a riser into the center and a deep boom there. On the way up
// the roar winds down with your speed; the New Zealand street at night murmurs, gasps as you come up, goes quiet
// while you hang, and a whoosh pulls you back down into the white, which becomes the lead-in to the first frame
// (the video loops). Every attack is soft (no clicks).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, BEATS, V_CENTER, V_METRO, V_STREET, V_APEX, V_FLASH, storyT, speedAt, depthAt, rateAt } from './src/timeline.js';
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

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);          // synthesis starts LOOP s before the first frame; that lead-in becomes the end
  const L = new Float32Array(N), Rr = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;

  // per-sample story values are smooth: compute them on a coarse grid and interpolate
  const STEP = 240;
  const grid = [];
  for (let n = -N0 - STEP; n < N + 2 * STEP; n += STEP) {
    const v = n / SR, T = storyT(v);
    grid.push({ sp: speedAt(T), d: depthAt(T), rate: rateAt(v) });
  }
  const at = (n) => {
    const f = (n + N0 + STEP) / STEP, i = Math.floor(f), k = f - i;
    const a = grid[i], b = grid[i + 1] || a;
    return { sp: a.sp + (b.sp - a.sp) * k, d: a.d + (b.d - a.d) * k, rate: a.rate + (b.rate - a.rate) * k };
  };

  const roarF = [new SVF(), new SVF()], roarLP = [new OnePole(800), new OnePole(800)];
  const rumLP = new OnePole(70), rumLP2 = new OnePole(45);
  const boilF = new SVF(), boilE = new OnePole(12);
  const crowdF = [new SVF(), new SVF(), new SVF()], crowdE = new OnePole(3);
  const gaspF = new SVF();
  const metroF = new SVF(), metroLP = new OnePole(120);
  const whooshF = new SVF(), riserF = new SVF(), boomLP = new OnePole(140);
  const hitLP = BEATS.map(() => new OnePole(200));
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(32);
  let brown = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    const st = at(n);
    const km = st.d / 1000;
    let l = 0, r = 0, wet = 0;

    // ---- the roar: rising with your real speed (log), pitch and level ----
    {
      const sp = Math.max(st.sp, 0.5);
      const k = clamp(Math.log10(sp / 5) / Math.log10(7900 / 5));          // 0 at 5 m/s .. 1 at top speed
      const street = smooth(V_STREET - 0.3, V_STREET + 0.2, v);
      const g = (0.08 + 0.24 * Math.pow(k, 1.2)) * (1 - 0.85 * street) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH, v));
      const fc = 260 + 2600 * k * k + 180 * Math.sin(v * 0.7);
      roarLP[0].set(fc * 1.4); roarLP[1].set(fc * 1.5);
      const a = roarF[0].run(white(), fc, 0.9).bp, b = roarF[1].run(white(), fc * 1.08, 0.9).bp;
      const flutter = 1 + 0.18 * k * Math.sin(v * 9.1) * Math.sin(v * 3.3);
      l += (roarLP[0].run(white()) * 0.5 + a) * g * flutter;
      r += (roarLP[1].run(white()) * 0.5 + b) * g * flutter;
    }

    // ---- a deep rumble through the mantle and core ----
    {
      const g = 0.32 * smooth(30, 300, km) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH, v));
      if (g > 1e-4) {
        ph[0] += (34 + 6 * Math.sin(v * 0.9)) / SR;
        const x = (rumLP2.run(rumLP.run(white())) * 9 + Math.sin(TAU * ph[0]) * 0.35) * g * (0.75 + 0.25 * Math.sin(v * 2.3));
        l += x; r += x;
      }
    }
    // ---- the liquid core boiling: churning bursts ----
    {
      const g = 0.12 * smooth(2700, 3100, km) * (1 - smooth(5100, 5300, km));
      if (g > 1e-4) {
        const burst = boilE.run(Math.max(0, Math.sin(v * 13.7) * Math.sin(v * 7.1 + 1) * Math.sin(v * 3.3 + 2)));
        const x = boilF.run(white(), 180 + 220 * burst, 0.5).bp * g * (0.3 + 2.0 * burst);
        l += x; r += x * 0.9; wet += x * 0.5;
      }
    }

    // ---- the crowd: in the plaza above you (fading as you drop) and in the street in New Zealand ----
    {
      const top = (1 - smooth(-0.5, 2.6, v)) * 0.9;
      const nzSt = smooth(V_STREET - 0.4, V_STREET + 0.1, v) * (1 - smooth(T_SWITCH - 0.6, T_SWITCH, v));
      const nzHole = smooth(V_STREET - 3.4, V_STREET - 0.4, v) * (1 - smooth(V_STREET - 0.4, V_STREET + 0.1, v)) * 0.35;
      const g = top + nzSt * 0.75 + nzHole;
      if (g > 1e-4) {
        // babble: a few formant bands on noise, wobbling like voices
        const env = crowdE.run(0.6 + 0.4 * Math.abs(Math.sin(v * 3.1) * Math.sin(v * 1.7 + 1)));
        let x = 0;
        x += crowdF[0].run(white(), 420 + 120 * Math.sin(v * 5.3), 0.25).bp;
        x += crowdF[1].run(white(), 950 + 250 * Math.sin(v * 4.1 + 1), 0.3).bp * 0.7;
        x += crowdF[2].run(white(), 2200 + 400 * Math.sin(v * 6.7 + 2), 0.4).bp * 0.35;
        x *= env * g * 0.16;
        l += x * 0.9; r += x; wet += x * 1.2;
      }
      // gasps: the plaza as you drop, the street as you come up
      for (const [tg, gg] of [[-0.3, 0.8], [V_APEX - 1.3, 0.9]]) {
        const dt = v - tg;
        if (dt > 0 && dt < 1.2) {
          const e = Math.sin(Math.PI * Math.min(dt / 0.25, 1) / 2) * Math.exp(-Math.max(dt - 0.25, 0) * 3.2) * gg;
          const x = gaspF.run(white(), 900 + 500 * dt, 0.6).bp * e * 0.3;
          l += x; r += x; wet += x;
        }
      }
    }

    // ---- the metro: a rushing roar and the train's hum as you cut through the tunnel ----
    {
      const dt = v - V_METRO;
      if (dt > -0.8 && dt < 1.4) {
        const e = Math.exp(-Math.pow(dt / 0.35, 2)) + 0.4 * Math.exp(-Math.pow((dt - 0.3) / 0.6, 2));
        ph[2] += 120 / SR; ph[3] += 181 / SR;
        const hum = (Math.sin(TAU * ph[2]) + 0.6 * Math.sin(TAU * ph[3])) * 0.06;
        const x = (metroF.run(white(), 500 + 1500 * Math.exp(-dt * dt * 8), 0.7).bp * 0.6 + metroLP.run(white()) * 2 + hum) * e * 0.35;
        l += x * 1.1; r += x * 0.8; wet += x * 0.6;
      }
    }

    // ---- a low thump and a whoosh on every landmark ----
    BEATS.forEach((b, i) => {
      if (b.kind === 'metro' || b.kind === 'center') return;
      const dt = v - b.v;
      if (dt > -0.01 && dt < 2.5) {
        const e = Math.min(Math.max(dt, 0) / 0.012, 1) * Math.exp(-Math.max(dt - 0.012, 0) / 0.45) * b.hit;
        ph[8 + (i % 8)] += (58 - 18 * Math.min(dt, 1)) / SR;
        const thump = Math.sin(TAU * ph[8 + (i % 8)]) * e * 0.5 + hitLP[i].run(white()) * e * 1.2;
        l += thump; r += thump; wet += thump * 0.4;
      }
      const dw = v - b.v + 0.45;
      if (dw > 0 && dw < 0.9 && b.kind !== 'street') {
        const e = Math.sin(Math.PI * dw / 0.9) ** 2 * 0.12 * b.hit;
        const w = whooshF.run(white(), 400 + 2600 * dw, 0.8).bp * e;
        l += w; r += w;
      }
    });

    // ---- the center: a riser, then a deep boom ----
    {
      if (v > V_CENTER - 3 && v < V_CENTER + 0.1) {
        const k = smooth(V_CENTER - 3, V_CENTER, v);
        const x = riserF.run(white(), 300 + 4000 * k * k, 0.35).bp * k * k * 0.3;
        l += x; r += x; wet += x * 0.6;
      }
      const dt = v - V_CENTER;
      if (dt > -0.01 && dt < 6) {
        const e = Math.min(Math.max(dt, 0) / 0.02, 1) * Math.exp(-Math.max(dt - 0.02, 0) / 1.6);
        ph[20] += (52 * Math.exp(-dt * 0.6) + 24) / SR;
        const x = (Math.sin(TAU * ph[20]) * 0.9 + boomLP.run(white()) * 2.5) * e * 0.8;
        l += x; r += x; wet += x * 0.8;
      }
    }

    // ---- the end: hanging there (almost quiet), then pulled back down into the white ----
    {
      const dt = v - (V_FLASH - 0.6);
      if (dt > 0 && v < T_SWITCH) {
        const k = smooth(0, T_SWITCH - (V_FLASH - 0.6), dt);
        const x = whooshF.run(white(), 250 + 3500 * k * k, 0.6).bp * k * k * 0.35 * (1 - smooth(T_SWITCH - 0.15, T_SWITCH, v));
        l += x; r += x; wet += x * 0.7;
      }
    }

    // a constant low air so it never goes dead silent
    brown = clamp(brown + white() * 0.02, -1, 1) * 0.998;
    l += brown * 0.02; r += brown * 0.02;

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.7, outR = r + rr * 0.7;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; Rr[n] = outR; }
  }

  {   // inside the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.35 * SR);
    for (let i = 0; i < N0; i++) {
      const k = Math.min(1, i / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      Rr[a + i] = Rr[a + i] * wo + PR[i] * wi;
    }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.5); Rr[n] = Math.tanh(Rr[n] * 1.5);
    if (!Number.isFinite(L[n]) || !Number.isFinite(Rr[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(L[n]), Math.abs(Rr[n]));
  }
  const gn = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {   // no fade at the ends: they join up when the video loops
    buf.writeInt16LE(Math.round(clamp(L[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(Rr[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
