// Procedural soundtrack for "What if you lived for 1 trillion seconds?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// The street corner, sped up: the crowd's murmur and the traffic racing faster and higher as time speeds up, smearing
// into one rushing wash. Every 10x lands as a deep soft "whoomp" while a low drone climbs a semitone. A cold wind in
// the winters; the city's hum thinning out as the people leave; then birdsong and leaves in the forest; a warm chord
// at "You're old" and at the finish; the last tower's groan and crash, the river coming back, a wolf's howl; at
// the finish line the time-lapse rush stops dead and you hear the forest at normal speed; a riser into the white flash
// (and back into the street: it loops).
// No sharp clicks or crackles anywhere: every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, BEATS, T_SWITCH, V_FLASH, V_END, logS, V_CRACK, V_FALL, V_IMPACT, V_RIVER, V_ANIMALS, V_REAL } from './src/timeline.js';
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
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;
  const beats = BEATS.map((v) => ({ v }));

  const crowdF = Array.from({ length: 4 }, () => new SVF()), crowdE = Array.from({ length: 4 }, () => new OnePole(4));
  const trafLP = new OnePole(220), trafF = new SVF(), rushF = [new SVF(), new SVF()], whoompF = new SVF(), padLP = new OnePole(700);
  const windF = [new SVF(), new SVF()], windE = new OnePole(0.6), leafF = [new SVF(), new SVF()], leafE = new OnePole(1.5);
  const riseF = [new SVF(), new SVF()];
  const groanF = new SVF(), crashF = [new SVF(), new SVF()], crashSub = new OnePole(45), rumF = [new SVF(), new SVF()], rivF = [new SVF(), new SVF()], rivE = new OnePole(3), howlLP = new OnePole(1800);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  // birds: a list of chirps (time, pitch, length, pan), more of them as the forest grows
  const BR = rng(4243), birds = [];
  for (let t = 18; t < T_SWITCH; t += 0.05) {
    const s = state(t);
    const dens = Math.max(s.wild * 0.6, s.soil);
    if (BR() < dens * 0.09) {
      const n = 1 + Math.floor(BR() * 3), f0 = 2300 + BR() * 2400, pan = BR() * 2 - 1;
      for (let k = 0; k < n; k++) birds.push({ t: t + k * (0.09 + BR() * 0.05), f: f0 * (1 + (BR() - 0.5) * 0.15), d: 0.05 + BR() * 0.07, pan, g: 0.5 + BR() * 0.5, up: BR() < 0.5 });
    }
  }

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const fast = clamp((Math.log10(Math.max(s.rate, 1)) - 3.0) / 6);   // 0 at frame 0's pace .. 1 at years per second
    const end = 1 - smooth(V_REAL - 0.25, V_REAL + 0.05, v);           // the rush stops dead at the finish line

    // --- the corner, sped up: the crowd's murmur, the traffic; smearing into one wash ---
    {
      const ppl = s.people;
      if (ppl > 0.005) {
        let cv = 0;
        for (let q = 0; q < 4; q++) {
          const amp = crowdE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.8) * (2 + 6 * fast) + q) + white() * 0.25));
          cv += crowdF[q].run(white(), (520 + q * 300) * (1 + 1.2 * fast), 0.3).bp * amp;
        }
        l += cv * 0.06 * ppl * (1 - 0.5 * fast); r += cv * 0.055 * ppl * (1 - 0.5 * fast);
        const traf = (trafLP.run(white()) * 0.5 + trafF.run(white(), 300 + 500 * fast, 0.8).bp * 0.4) * 0.2 * ppl;
        l += traf; r += traf * 0.9;
      }
      // the time-lapse rush: a soft wind-like wash that brightens as the pace climbs
      const rushG = (0.02 + 0.05 * fast) * end;
      const rf = 300 + 1700 * fast + 200 * Math.sin(v * 0.7);
      l += rushF[0].run(white(), rf, 0.9).bp * rushG; r += rushF[1].run(white(), rf * 1.1, 0.9).bp * rushG;
      // winters: a cold wind gusting
      const wnd = s.season.snow * (1 - s.season.lock);
      if (wnd > 0.01) {
        const gst = windE.run(0.6 + 0.4 * Math.sin(v * 3.1) + 0.2 * white());
        l += windF[0].run(white(), 500 + 400 * gst, 0.5).bp * 0.09 * wnd * gst; r += windF[1].run(white(), 560 + 400 * gst, 0.5).bp * 0.09 * wnd * gst;
      }
      // the forest: leaves rustling
      const fo = Math.max(s.wild * 0.5, s.soil);
      if (fo > 0.01) {
        const ge = leafE.run(0.6 + 0.4 * Math.sin(v * 0.8) + 0.3 * white());
        l += leafF[0].run(white(), 3200, 0.7).bp * 0.035 * fo * ge; r += leafF[1].run(white(), 3600, 0.7).bp * 0.035 * fo * ge;
      }
    }
    // --- every 10x: a deep, soft whoomp ---
    for (let i = 0; i < beats.length; i++) {
      const dt = v - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.4);
        ph[2 + (i % 2)] += (34 + 28 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const g = 0.2 + 0.015 * i;
        const vv = (Math.sin(TAU * ph[2 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.7) * e * g;
        dl += vv; dr += vv; wet += vv * 0.2;
      }
    }
    // --- the drone: a semitone higher with every 10x (the tension) ---
    {
      const semis = Math.max(0, logS(v) - 3.4) * 1.2;
      const f0 = 49 * Math.pow(2, semis / 12);
      const dg = 0.04 * smooth(-1, 1.5, v) * (1 - smooth(V_FLASH, T_SWITCH, v) * 0.5);
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[6 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[6 + q]) * (q === 0 ? 0.8 : 0.3); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.4;
    }
    // --- birdsong ---
    for (const b of birds) {
      const dt = v - b.t;
      if (dt < 0 || dt > b.d) continue;
      const k = dt / b.d, e = Math.sin(Math.PI * k) * 0.022 * b.g;
      const f = b.f * (b.up ? 1 + 0.35 * k : 1.3 - 0.35 * k);
      ph[20] += f / SR;
      const vv = Math.sin(TAU * ph[20]) * e;
      l += vv * (1 - 0.5 * b.pan); r += vv * (1 + 0.5 * b.pan); wet += vv * 0.8;
    }
    // --- warm chords: "You're old" (1 billion seconds) and the finish line ---
    for (const [t0, chord] of [[12.0, [196, 246.9, 293.7, 392]], [42.0, [130.8, 196, 261.6, 329.6, 392]]]) {
      const dt = v - t0;
      if (dt > 0 && dt < 4.5) {
        const e = smooth(0, 0.5, dt) * (1 - smooth(2.4, 4.5, dt)) * 0.03;
        let cv = 0;
        chord.forEach((f, q) => { ph[30 + q] += f / SR; cv += Math.sin(TAU * ph[30 + q]) * (q === 0 ? 1 : 0.6); });
        l += cv * e; r += cv * e; wet += cv * e * 1.6;
      }
    }
    // --- the last tower: a low groan as it cracks and leans, a deep crash when it lands, rumbling rubble ---
    {
      const g = smooth(V_CRACK, V_CRACK + 0.4, v) * (1 - smooth(V_IMPACT - 0.1, V_IMPACT + 0.1, v));
      if (g > 0.001) {
        ph[44] += (38 + 10 * Math.sin(v * 2.1) + 18 * smooth(V_FALL, V_IMPACT, v)) / SR;
        const gr = (saw(ph[44]) * 0.4 + groanF.run(white(), 140 + 220 * smooth(V_FALL, V_IMPACT, v), 2.5).bp * 1.2) * g * 0.12 * (0.6 + 0.4 * smooth(V_FALL, V_IMPACT, v));
        l += gr; r += gr; wet += gr * 0.4;
      }
      const dt = v - V_IMPACT;
      if (dt > -0.02 && dt < 4.5) {
        ph[45] += (30 + 34 * Math.exp(-Math.max(dt, 0) * 3)) / SR;
        const e = Math.min(Math.max(dt + 0.02, 0) / 0.05, 1) * Math.exp(-Math.max(dt, 0) * 1.3);
        const sub = crashSub.run(white()) * 3;
        const vv = (Math.sin(TAU * ph[45]) * 0.9 + crashF[0].run(white(), 90 + 260 * Math.exp(-Math.max(dt, 0) * 2), 0.6).lp * 1.2 + sub) * e * 0.22;
        const rum = smooth(0.1, 0.5, dt) * (1 - smooth(1.5, 4.5, dt)) * 0.12;
        dl += vv; dr += vv; wet += vv * 0.5;
        l += rumF[0].run(white(), 160, 0.6).lp * rum + crashF[1].run(white(), 900, 0.8).bp * rum * 0.4; r += rumF[1].run(white(), 175, 0.6).lp * rum;
      }
    }
    // --- the river: a steady murmur from the moment the stream comes back ---
    {
      const g = smooth(V_RIVER[0] + 0.3, V_RIVER[1], v) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      if (g > 0.001) {
        const am = rivE.run(0.7 + 0.3 * Math.sin(v * 5.3) * Math.sin(v * 2.9) + 0.2 * white());
        l += rivF[0].run(white(), 1100 + 250 * Math.sin(v * 1.3), 0.45).bp * 0.07 * g * am; r += rivF[1].run(white(), 1250 + 250 * Math.sin(v * 1.1), 0.45).bp * 0.07 * g * am;
      }
    }
    // --- a wolf howls (a soft, rising and falling tone, far off) ---
    for (const [t0, pan] of [[V_ANIMALS + 1.0, -0.4], [V_REAL + 1.8, 0.3]]) {
      const dt = v - t0;
      if (dt > 0 && dt < 2.4) {
        const k = dt / 2.4, e = Math.sin(Math.PI * Math.min(1, dt / 0.35)) * 0 + smooth(0, 0.3, dt) * (1 - smooth(1.6, 2.4, dt)) * 0.03;
        const f = 380 + 260 * Math.sin(Math.PI * Math.min(1, k * 1.4)) - 80 * k;
        ph[48] += f * (1 + 0.012 * Math.sin(v * 31)) / SR;
        const hv = howlLP.run(Math.sin(TAU * ph[48]) + 0.25 * Math.sin(2 * TAU * ph[48])) * e;
        l += hv * (1 - pan); r += hv * (1 + pan); wet += hv * 2.5;
      }
    }
    // --- the riser into the white flash ---
    {
      const k = smooth(V_FLASH - 0.6, T_SWITCH, v);
      if (k > 0.001) {
        const g = Math.pow(k, 1.6) * 0.16;
        l += riseF[0].run(white(), 400 + 3200 * k, 1.2).bp * g; r += riseF[1].run(white(), 420 + 3300 * k, 1.2).bp * g;
        ph[40] += (110 + 330 * k) / SR; const tn = Math.sin(TAU * ph[40]) * g * 0.4;
        l += tn; r += tn; wet += tn;
      }
    }
    const fade = 1 - smooth(T_SWITCH - 0.25, T_SWITCH, v);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = (l + dl + rl * 0.8) * fade, outR = (r + dr + rr * 0.8) * fade;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // the silence at the end turns into the lead-in to the first frame (the video loops)
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
