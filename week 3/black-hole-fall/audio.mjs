// Procedural soundtrack for "What if you fell into a black hole?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// Music, not wind (a cosmic topic; the style of week 1/black-hole): a minor-key drone that darkens and tightens
// as you fall, a trailer "braam" on every 10% of light speed (louder each time; the biggest at the edge), a
// sub-bass that swells toward the edge; inside, the bed thins to an eerie high shimmer, your breathing and your
// heart inside the helmet, the thrusters' muffled roar, a slow pulse counting down; the slow-motion end sinks
// in pitch under a riser that blooms into the white, and the white turns into the lead-in to the first frame
// (the video loops). Every attack is soft (no clicks or crackles).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STAMPS, V_EDGE, V_WIDE0, V_WIDE1, V_BURN0, V_BURN1, V_SLOW, V_END } from './src/timeline.js';
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
  run(x, fb = 0.88, damp = 0.35) {
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
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;

  // braam hits: every stamp, stronger each time; the edge is the biggest; roots step down
  const HITS = STAMPS.map((st, i) => {
    const edge = st.text === 'THE EDGE', burn = st.label === 'TIME LEFT';
    return { t: st.v, g: edge ? 1.25 : burn ? 0.8 : 0.45 + 0.06 * i, f: edge ? 36.7 : burn ? 41.2 : [55, 51.9, 49, 46.25, 43.65, 41.2, 38.9][i] };
  });
  // drone chords (Hz): A minor -> F -> D minor -> Bb (inside) -> a dark cluster in the last seconds
  const CHORDS = [
    [-5, [110, 130.81, 164.81, 220]],
    [12, [87.31, 110, 130.81, 174.61]],
    [24, [73.42, 110, 146.83, 174.61]],
    [V_EDGE, [58.27, 87.31, 116.54, 146.83]],
    [V_SLOW - 4, [55, 58.27, 82.41, 87.31]],
  ];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const droneLP = [new OnePole(400), new OnePole(400)];
  const braamLP = new SVF(), subLP = new OnePole(60), airF = new SVF(), airF2 = new SVF();
  const jetF = new SVF(), jetSub = new OnePole(50), riserF = new SVF(), breathF = new SVF(), breathE = new OnePole(8);
  const whooshF = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(64);
  const HP = HITS.map(() => new Float64Array(4));   // each hit keeps its own phases

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    // slow motion: the world's sounds sink in pitch at the end
    const slow = smooth(V_SLOW - 0.2, V_SLOW + 0.8, v);
    const pitch = 1 - 0.45 * slow;
    let l = 0, r = 0, wet = 0;

    // --- drone pad, darkening; it opens up (brighter filter) as you near the edge ---
    const ch = chordAt(v);
    const cutoff = (260 + 700 * smooth(0, V_EDGE, v) + 500 * Math.pow(smooth(V_EDGE - 6, V_EDGE, v), 2)) * (1 - 0.6 * smooth(V_EDGE, V_EDGE + 1.5, v)) + 300 * smooth(V_EDGE + 3, V_SLOW, v);
    droneLP[0].set(cutoff * pitch); droneLP[1].set(cutoff * 1.07 * pitch);
    const dG = 0.12 * (1 + 0.5 * smooth(10, V_EDGE, v)) * (1 - 0.5 * smooth(V_EDGE, V_EDGE + 1, v) + 0.4 * smooth(V_EDGE + 4, V_SLOW, v)) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v) * 0.8);
    let dl = 0, dr = 0;
    for (let k = 0; k < 4; k++) {
      const bend = 1 + 0.05 * Math.pow(smooth(V_SLOW - 6, V_SLOW, v), 2);
      const f = ch[k] * bend * pitch;
      ph[k] += (f * 0.997) / SR;
      ph[k + 4] += (f * 1.003) / SR;
      const a = (k === 0 ? 0.9 : 0.6);
      dl += saw(ph[k]) * a; dr += saw(ph[k + 4]) * a;
    }
    // (chord changes keep each saw's phase running, so they never click)
    dl = droneLP[0].run(dl) * dG; dr = droneLP[1].run(dr) * dG;
    l += dl; r += dr; wet += (dl + dr) * 0.5;

    // --- braam hits ---
    let braam = 0;
    HITS.forEach((h, i) => {
      const dt = v - h.t;
      if (dt > -0.01 && dt < 6) {
        const e = Math.min(Math.max(dt, 0) / 0.07, 1) * Math.exp(-Math.max(dt - 0.07, 0) / 1.7) * h.g;
        const q = HP[i];
        for (let k = 0; k < 4; k++) q[k] += (h.f * pitch * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(q[0]) + saw(q[1]) + 0.5 * saw(q[2]) + 0.25 * saw(q[3])) * e;
      }
    });
    braam = braamLP.run(braam, 850, 0.6).lp * 0.2;
    l += braam; r += braam; wet += braam * 0.7;

    // --- sub swell toward the edge; a deep pulse inside counting the seconds down ---
    ph[20] += (31 + 4 * Math.sin(v * 0.6)) * pitch / SR;
    const subG = 0.05 + 0.2 * Math.pow(smooth(8, V_EDGE, v), 1.5) * (1 - 0.8 * smooth(V_EDGE, V_EDGE + 1, v)) + 0.18 * smooth(V_SLOW - 3, V_END, v);
    let sub = (Math.sin(TAU * ph[20]) * 0.7 + subLP.run(white()) * 2.0) * subG;
    if (v > V_EDGE + 1 && v < V_SLOW) {   // a slow heartbeat-like pulse, one per second of time left
      const p = (v - V_EDGE) % 1;
      const e = Math.min(p / 0.03, 1) * Math.exp(-p * 7) * 0.22 * smooth(V_EDGE + 1, V_EDGE + 3, v);
      ph[21] += 44 / SR;
      sub += Math.sin(TAU * ph[21]) * e;
    }
    sub *= 1 - smooth(T_SWITCH - 0.3, T_SWITCH, v);
    l += sub; r += sub;

    // --- airy motion bed (outside): a soft filtered rush, faster as you fall; the far shot is calm ---
    {
      const wide = smooth(V_WIDE0 - 0.1, V_WIDE0 + 0.3, v) * (1 - smooth(V_WIDE1 - 0.3, V_WIDE1 + 0.1, v));
      const g = (0.03 + 0.06 * smooth(0, V_EDGE, v)) * (1 - smooth(V_EDGE - 0.2, V_EDGE + 0.6, v)) * (1 - 0.7 * wide);
      if (g > 0.0005) {
        const fc = 500 + 1600 * smooth(0, V_EDGE, v) + 200 * Math.sin(v * 0.5);
        const wn = white();
        l += airF.run(wn, fc, 0.7).bp * g; r += airF2.run(white(), fc * 1.1, 0.7).bp * g;
      }
      // soft whooshes at the cuts in and out of the far shot
      for (const tc of [V_WIDE0, V_WIDE1]) {
        const dt = v - tc + 0.35;
        if (dt > 0 && dt < 1.0) {
          const e = Math.sin(Math.PI * dt / 1.0) ** 2 * 0.12;
          const w = whooshF.run(white(), 300 + 2500 * dt, 0.8).bp * e;
          l += w; r += w;
        }
      }
    }

    // --- inside: an eerie high shimmer (glassy partials), the light piling up above you ---
    {
      const g = 0.03 * smooth(V_EDGE + 0.5, V_EDGE + 4, v) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v)) * (1 + 0.8 * smooth(V_SLOW - 5, V_END, v));
      if (g > 0.0003) {
        let sh = 0;
        [1318.5, 1760, 2093, 2637].forEach((f, k) => { ph[24 + k] += f * pitch * (1 + 0.003 * Math.sin(v * (2 + k))) / SR; sh += Math.sin(TAU * ph[24 + k]) * (0.5 + 0.5 * Math.sin(v * (0.7 + k * 0.53) + k)); });
        l += sh * g; r += sh * g * 0.9; wet += sh * g * 1.5;
      }
    }

    // --- thrusters: a muffled roar through your suit ---
    {
      const b = smooth(V_BURN0, V_BURN0 + 0.15, v) * (1 - smooth(V_BURN1 - 0.25, V_BURN1, v));
      if (b > 0.0005) {
        const flick = 0.85 + 0.15 * Math.sin(v * 37) * Math.sin(v * 13);
        const x = (jetF.run(white(), 380, 0.7).lp * 1.2 + jetSub.run(white()) * 3) * b * 0.32 * flick;
        l += x; r += x;
      }
    }

    // --- you: breathing in the helmet and your heart (faster when scared) ---
    {
      const fear = 0.15 + 0.25 * smooth(20, V_EDGE, v) + 0.35 * smooth(V_BURN0 - 2, V_BURN0, v) + 0.25 * smooth(V_SLOW - 4, V_SLOW, v);
      const bRate = (0.28 + 0.4 * fear) * pitch;
      ph[40] += bRate / SR;
      const bp = ph[40] % 1;
      const inhale = bp < 0.42 ? Math.sin(Math.PI * bp / 0.42) : 0;
      const exhale = bp >= 0.42 ? Math.sin(Math.PI * (bp - 0.42) / 0.58) * 0.7 : 0;
      const on = smooth(V_EDGE - 1, V_EDGE + 1.5, v) * (1 - smooth(V_END - 1.2, V_END - 0.3, v)) + 0.4 * (1 - smooth(V_EDGE - 1, V_EDGE + 1.5, v));
      const be = breathE.run((inhale + exhale) * (0.4 + 0.6 * fear)) * on;
      const bn = breathF.run(white(), (800 + 600 * inhale) * pitch, 0.5).bp * be * 0.07;
      l += bn; r += bn;
      const hb = (1.0 + 1.0 * fear) * pitch;
      ph[41] += hb / SR;
      const hp = ph[41] % 1;
      const lub = Math.exp(-Math.pow((hp - 0.05) / 0.03, 2)), dub = 0.7 * Math.exp(-Math.pow((hp - 0.3) / 0.03, 2));
      ph[42] += 46 * pitch / SR;
      const heart = Math.sin(TAU * ph[42]) * (lub + dub) * 0.13 * (0.4 + 0.8 * fear) * on;
      l += heart; r += heart;
    }

    // --- the end: a riser blooming into the white ---
    if (v > V_SLOW - 1 && v < T_SWITCH) {
      const k = smooth(V_SLOW - 1, V_END, v);
      const fade = 1 - smooth(T_SWITCH - 0.25, T_SWITCH, v);
      const x = riserF.run(white(), 300 + 3200 * k * k, 0.35).bp * k * k * 0.26 * fade;
      ph[30] += (523.25 + 523.25 * k) / SR; ph[31] += (784 + 784 * k) / SR;
      const tone = (Math.sin(TAU * ph[30]) + 0.5 * Math.sin(TAU * ph[31])) * k * k * 0.05 * fade;
      l += x + tone; r += x + tone; wet += (x + tone) * 0.8;
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.8, outR = r + rr * 0.8;
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
