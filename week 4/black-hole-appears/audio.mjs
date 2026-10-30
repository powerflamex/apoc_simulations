// Procedural soundtrack for "What if a black hole appeared in front of you?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// A busy Strip at night (traffic, a crowd talking, a club's beat far off), then: a scream in the first second (the
// owner's clip, see SCREAM below), the black hole's thin hiss (its glow) fading as it grows and a deep hum that grows
// with it, the rush of air pouring toward it getting louder, and a trailer "braam" with a sub drop on every step
// (10x every 3 s), bigger each time. Screams as people go, glass, soft crunches as cars go in, the buildings groaning;
// a dark minor drone under the second half (black-hole style); you falling (the roar surges); the planet pouring in
// (deep rumble); the biggest hit at Earth's mass, the marble's shimmer, a riser into the white, which turns back into
// the street at the start (the loop). Every onset is soft (8 ms+): no clicks or clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STEP, V_EARTH, V_YOU, V_MARBLE, shotAt, massAt, hawkingW } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// The scream right at the start. Placeholder: sounds/scream.mp3 if the owner drops his own clip there, otherwise his
// "Noooo" (sounds/nooo.mp3, from rain-1000-years). Both are kept out of git (sounds/ is ignored).
const SCREAM_AT = 0.2;             // video time the voice starts
const SCREAM_FILES = [['scream.mp3', 0.0], ['nooo.mp3', 0.55]];   // [file, seconds of silence at its start]

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

function loadClip(dir) {
  for (const [f, skip] of SCREAM_FILES) {
    const file = path.join(dir, 'sounds', f);
    if (!fs.existsSync(file)) continue;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(skip), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    if (r.status !== 0) continue;
    const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x));
    console.log(`audio: scream from sounds/${f}`);
    return { a, g: 0.62 / Math.max(pk, 1e-6) };
  }
  console.warn('audio: no sounds/scream.mp3 or sounds/nooo.mp3: the scream is left out');
  return null;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;
  const SC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // ---- the steps: a hit every 3 s, bigger each time; the biggest at Earth's mass ----
  const HITS = [];
  for (let n = 1; n * STEP < V_EARTH - 0.5; n++) HITS.push({ t: n * STEP, k: clamp(0.35 + 0.05 * n, 0, 1), root: 55 * Math.pow(2, -Math.min(n, 12) / 24) });
  HITS.push({ t: V_EARTH, k: 1.0, root: 36.7 });
  // ---- cries: people near it going (synth voices, soft) ----
  const cries = [];
  const addCries = (t0, t1, n, g) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: 230 + R0() * 300, d: 0.45 + R0() * 0.7, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0() }); };
  addCries(0.9, 2.6, 6, 0.012); addCries(2.2, 5.2, 14, 0.014); addCries(5.5, 9.0, 12, 0.01); addCries(9, 13, 9, 0.007);
  // ---- soft crunches (cars, poles going in) ----
  const thuds = [];
  for (let k = 0; k < 26; k++) thuds.push({ t: 5.6 + Math.pow(R0(), 0.8) * 9, f: 50 + R0() * 50, g: 0.05 + 0.05 * R0(), pan: R0() * 1.4 - 0.7 });
  // ---- glass: soft shimmering swells as the windows go ----
  const glass = [6.6, 7.4, 8.9, 10.2, 10.9, 11.6, 12.3].map((t) => ({ t, g: 0.035 + 0.01 * R0(), pan: R0() * 1.2 - 0.6 }));
  // ---- car horns at the start (soft two-tone), then alarms ----
  const horns = [{ t: -0.7, f: 392, d: 0.6, p: 0.5 }, { t: 1.3, f: 349, d: 0.5, p: 0.6 }, { t: 2.9, f: 415, d: 0.9, p: 0.3 }, { t: 4.4, f: 370, d: 0.7, p: -0.4 }];
  const alarms = [];
  for (let i = 0; i < 5; i++) alarms.push({ t: 4.8 + R0() * 4, end: 12 + R0() * 3, f: 850 + R0() * 350, rate: 1.5 + R0(), kind: i % 3, g: 0.005 + 0.004 * R0(), pan: R0() * 1.6 - 0.8 });
  // ---- the drone's chords (Hz), darkening: A minor -> F -> D minor -> a low cluster ----
  const CHORDS = [[-9, [110, 130.8, 164.8]], [18, [87.3, 110, 130.8]], [27, [73.4, 87.3, 110]], [36, [55, 58.3, 82.4]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const clubLP = new OnePole(120);
  const hissF = new SVF();
  const windF = [new SVF(), new SVF(), new SVF()], windSub = new OnePole(60);
  const braamLP = new SVF(), subLP = new OnePole(80);
  const cryF = [new SVF(), new SVF()];
  const thudF = new SVF();
  const glassF = [new SVF(), new SVF()];
  const alarmF = new SVF(), hornF = new SVF();
  const groanF = [new SVF(), new SVF()], rumLP = new OnePole(45), rumLP2 = new OnePole(70);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const riserF = new SVF();
  const muffL = new OnePole(14000), muffR = new OnePole(14000), spaceS = new OnePole(8);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;      // d*: not muffled
    const shot = shotAt(v).k;
    const lm = Math.log10(massAt(v));               // 11 .. 24.8
    const space = spaceS.run(shot === 'high' && v > 31 ? 1 : shot === 'zoom' ? 1 : 0);

    // --- the Strip: traffic, a crowd talking, a club's beat far off; it goes as the street goes ---
    const life = 1 - smooth(9, 17, v);
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const traffic = 0.32 * (0.35 + 0.65 * life) * (1 - smooth(16, 22, v));
    l += cityLP.run(brownL) * traffic; r += cityLP2.run(brownR) * traffic;
    {
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = 1 - smooth(1.0, 3.0, v);          // the talking stops when they see it
      l += cv * 0.03 * talk; r += cv * 0.028 * talk;
      // the club: a soft kick at 124 bpm through a wall
      const beat = (v * 124 / 60) % 1;
      ph[1] += (48 + 60 * Math.exp(-beat * 30)) / SR;
      const kick = clubLP.run(Math.sin(TAU * ph[1]) * Math.exp(-beat * 9)) * 0.06 * (1 - smooth(2.5, 5, v));
      l += kick; r += kick;
    }
    for (const h of horns) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d) {
        const e = smooth(0, 0.04, dt) * (1 - smooth(h.d - 0.08, h.d, dt)) * 0.012;
        ph[2] += h.f / SR; ph[3] += h.f * 1.26 / SR;
        const hv = hornF.run(saw(ph[2]) + saw(ph[3]), 1400, 0.6).lp * e;
        l += hv * (1 - h.p) * 0.5; r += hv * (1 + h.p) * 0.5; wet += hv * 0.4;
      }
    }

    // --- the scream (the owner's clip) ---
    if (SC) {
      const i = Math.round((v - SCREAM_AT) * SR);
      if (i >= 0 && i < SC.a.length) {
        const fade = Math.min(1, i / (0.01 * SR), (SC.a.length - i) / (0.05 * SR));
        const s = SC.a[i] * SC.g * fade;
        l += s * 0.9; r += s * 1.0; wet += s * 0.25;
      }
    }

    // --- its glow: a thin high hiss, fading as it gets heavier (Hawking power falls 100x every 3 s) ---
    {
      const hk = clamp((Math.log10(hawkingW(v)) - 0.6) / 9.95);
      if (hk > 0.001) {
        const hs = hissF.run(white(), 7000, 0.4).hp * 0.02 * hk * hk * (1 - 0.3 * Math.sin(v * 31));
        dl += hs; dr += hs;
      }
    }
    // --- its hum: deep, growing with its mass, sliding down ---
    {
      const g = (0.03 + 0.12 * smooth(11, 23, lm)) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH + 0.2, v));
      const f = 46 * Math.pow(2, -(lm - 11) / 30);
      ph[4] += f / SR; ph[5] += f * 1.5 * 1.003 / SR; ph[6] += f * 2.01 / SR;
      const hv = (Math.sin(TAU * ph[4]) + 0.35 * Math.sin(TAU * ph[5]) + 0.18 * Math.sin(TAU * ph[6])) * g * (0.85 + 0.15 * Math.sin(v * 1.7));
      dl += hv; dr += hv;
    }
    // --- the air rushing toward it: a roar that builds (gusting), surging when you fall ---
    {
      const wl = (0.02 + 0.2 * smooth(1, 20, v) + 0.18 * smooth(V_YOU - 0.2, V_YOU + 1.5, v) * (1 - smooth(24.2, 26, v)) + 0.05 * smooth(24, 30, v)) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      const wn = white();
      const gust = 0.75 + 0.25 * Math.sin(v * 0.9) * Math.sin(v * 2.3 + 1);
      const fc = 300 + 500 * smooth(0, 20, v) + 600 * smooth(V_YOU, V_YOU + 2, v) * (1 - smooth(24.2, 25, v));
      const a = windF[0].run(wn, fc, 0.7).bp, b = windF[1].run(wn, fc * 2.3, 0.9).bp * 0.5, lo = windSub.run(white()) * 2.2;
      const wv = (a + b + lo) * wl * gust;
      l += wv; r += windF[2].run(wn, fc * 1.1, 0.7).bp * wl * gust + lo * wl * gust + b * wl * gust; wet += wv * 0.2;
    }
    // --- the steps: a trailer braam with a sub drop, bigger each time ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, 0.9 + 0.8 * h.k) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.005 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, 0.7 + 0.4 * h.k) * h.k;
      }
      const bf = braamLP.run(braam, 300 + 1100 * Math.exp(-0.0), 0.6).lp * 0.11;
      const sv = subLP.run(sub) * 0.5 + sub * 0.25;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- cries ---
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        ph[20] += c.f * (1.25 - 0.35 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(ph[20]);
        const vv = (cryF[0].run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * cryF[1].run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // --- soft crunches ---
    for (const q of thuds) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.6) {
        ph[22] += (q.f + 40 * Math.exp(-dt * 15)) / SR;
        const vv = (Math.sin(TAU * ph[22]) * 0.8 + thudF.run(white(), 200, 0.8).lp) * env(dt, 0.012, 0.12) * q.g;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.4;
      }
    }
    // --- glass ---
    {
      let gs = 0, gp = 0;
      for (const g of glass) { const dt = v - g.t; if (dt > 0 && dt < 3) { const e = smooth(0, 0.25, dt) * Math.exp(-dt * 1.3) * g.g; gs += e; gp += e * g.pan; } }
      if (gs > 0) {
        const pn = gp / gs, w = white();
        const vv = (glassF[0].run(w, 3800, 0.6).bp + 0.7 * glassF[1].run(w, 2200, 0.7).bp) * Math.tanh(gs * 2.5) * 0.09 * (0.75 + 0.25 * Math.sin(v * 37) * Math.sin(v * 23));
        l += vv * (1 - pn * 0.6); r += vv * (1 + pn * 0.6); wet += vv * 0.6;
      }
    }
    // --- car alarms ---
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
      if (av !== 0) { const vv = alarmF.run(av, 1800, 0.7).lp; l += vv; r += vv; wet += vv * 0.7; }
    }
    // --- the buildings groaning and the ground tearing (12 s on), then the planet's deep rumble ---
    {
      const g = smooth(11, 15, v) * (1 - smooth(T_SWITCH - 0.5, T_SWITCH, v));
      const gr = (groanF[0].run(white(), 90 + 30 * Math.sin(v * 0.7), 0.15).bp + 0.6 * groanF[1].run(white(), 140 + 40 * Math.sin(v * 0.43 + 2), 0.12).bp) * 0.12 * g * (1 - 0.6 * space);
      const rum = (rumLP.run(white()) * 3 + rumLP2.run(white()) * 2) * (0.1 * g + 0.25 * smooth(24, 34, v)) * (1 - smooth(T_SWITCH - 0.5, T_SWITCH, v));
      l += gr; r += gr * 0.9; dl += rum; dr += rum; wet += gr * 0.5;
    }
    // --- the drone: a dark minor pad, from ~9 s, swelling ---
    {
      const ch = chordAt(v);
      const dg = (0.035 * smooth(8, 14, v) + 0.05 * smooth(22, 34, v)) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH + 0.1, v));
      if (dg > 1e-4) {
        let a = 0, b = 0;
        ch.forEach((f, q) => {
          ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR;
          a += saw(ph[40 + q]); b += saw(ph[44 + q]);
        });
        const cut = 300 + 500 * smooth(20, 40, v);
        droneLP[0].set(cut); droneLP[1].set(cut * 1.07);
        const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
        dl += xl; dr += xr; wet += (xl + xr) * 0.6;
      }
    }
    // --- the marble: a high glassy shimmer ---
    {
      const g = smooth(V_MARBLE - 0.6, V_MARBLE + 0.4, v) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v)) * 0.03;
      if (g > 0) {
        let s = 0;
        [1318.5, 1760, 2637].forEach((f, q) => { ph[50 + q] += f * (1 + 0.002 * Math.sin(v * (3 + q))) / SR; s += Math.sin(TAU * ph[50 + q]) * (q === 0 ? 1 : 0.5); });
        dl += s * g; dr += s * g * 0.9; wet += s * g;
      }
    }
    // --- the riser into the white (the zoom), cut just inside the white ---
    {
      const k = smooth(40.0, T_SWITCH - 0.05, v) * (1 - smooth(T_SWITCH - 0.05, T_SWITCH + 0.15, v));
      if (k > 0) {
        const rv = riserF.run(white(), 250 + 2600 * k * k, 0.35).bp * k * k * 0.13;
        dl += rv; dr += rv; wet += rv * 0.5;
      }
    }

    // in space the outside sounds go dull
    const fcm = 14000 * Math.pow(600 / 14000, space);
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
    L[n] = Math.tanh(L[n] * 1.4); R[n] = Math.tanh(R[n] * 1.4);
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
