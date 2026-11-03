// Procedural soundtrack for "What if a rogue planet hit Earth?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// A busy crossing at night (traffic, a crowd talking, the crossing's chirping walk signal), then: the owner's "Noooo"
// in the first second, gasps and cries, the screens' emergency chime and sirens far off; a trailer hit with a sub drop
// on every time-lapse jump (bigger each time) over a dark minor drone that swells (black-hole style music: a cosmic
// topic); the Moon's impact as a deep boom; the sea rushing up the street; the ground's rumble and soft cracking; the
// wind roaring toward the planet; the lava's roar and the volcanoes' far booms; things lifting off (whooshes); the
// crust splitting under you, a riser into the white, which turns back into the crossing at the start (the loop).
// Every onset is soft (8 ms+): no clicks or clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STEPS, V_MOON_HIT, V_FLOOD, V_CRACK, V_WIND, V_FISSURE, V_ROCHE, V_LIFT, V_SPLIT, CUT } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// the scream right at the start: sounds/scream.mp3 if the owner drops his own clip there, otherwise his "Noooo"
// (sounds/nooo.mp3). Both stay out of git (sounds/ is ignored).
const SCREAM_AT = 0.15;
const SCREAM_FILES = [['scream.mp3', 0.0], ['nooo.mp3', 0.55]];

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
  const R0 = rng(5151);
  const white = () => R0() * 2 - 1;
  const SC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // ---- the jumps: a hit on each, bigger each time ----
  const HITS = STEPS.map((t, n) => ({ t, k: clamp(0.3 + 0.045 * n, 0, 0.95), root: 55 * Math.pow(2, -Math.min(n, 12) / 24) }));
  HITS.push({ t: V_MOON_HIT, k: 1.0, root: 41.2, moon: true });
  // ---- cries (each voice its own pitch and filters) ----
  const cries = [];
  const addCries = (t0, t1, n, g) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: 240 + R0() * 300, d: 0.45 + R0() * 0.8, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() }); };
  addCries(0.6, 3.0, 8, 0.011); addCries(5, 9, 8, 0.009); addCries(V_MOON_HIT + 0.2, V_MOON_HIT + 2.5, 10, 0.012);
  addCries(V_FLOOD + 1.5, V_FLOOD + 5, 8, 0.01); addCries(V_CRACK, V_CRACK + 3, 8, 0.011); addCries(V_LIFT + 0.5, V_LIFT + 5, 16, 0.013);
  // ---- soft cracks (the ground), low thuds ----
  const thuds = [];
  for (let k = 0; k < 40; k++) thuds.push({ t: V_CRACK - 0.2 + Math.pow(R0(), 0.9) * (V_SPLIT + 1 - V_CRACK), f: 40 + R0() * 45, g: 0.05 + 0.06 * R0(), pan: R0() * 1.4 - 0.7, ph: 0, fl: new SVF() });
  // ---- far volcano booms ----
  const booms = [];
  for (let k = 0; k < 9; k++) booms.push({ t: V_FISSURE + 0.3 + k * 1.3 + R0() * 0.8, g: 0.12 + 0.08 * R0(), ph: 0 });
  // ---- whooshes as things lift ----
  const whoosh = [];
  for (let k = 0; k < 14; k++) whoosh.push({ t: V_LIFT + 0.4 + R0() * 6.5, d: 0.6 + R0() * 0.8, g: 0.05 + 0.04 * R0(), pan: R0() * 1.6 - 0.8, f: new SVF() });
  // ---- the drone's chords (Hz), darkening ----
  const CHORDS = [[-9, [110, 130.8, 164.8]], [12, [98, 116.5, 146.8]], [22, [87.3, 110, 130.8]], [32, [73.4, 87.3, 110]], [40, [55, 58.3, 82.4]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const chirpF = new SVF();
  const windF = [new SVF(), new SVF(), new SVF()], windSub = new OnePole(60);
  const waterF = [new SVF(), new SVF()], waterLP = new OnePole(900);
  const lavaF = new SVF(), hissF = new SVF();
  const braamLP = new SVF(), subLP = new OnePole(80);
  const groanF = [new SVF(), new SVF()], rumLP = new OnePole(40), rumLP2 = new OnePole(70);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const riserF = new SVF(), sirenF = new SVF(), chimeLP = new OnePole(3000);
  const muffL = new OnePole(14000), muffR = new OnePole(14000), cutS = new OnePole(30);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;      // d*: not muffled in the cutaway
    const cut = cutS.run(v >= CUT[0] && v < CUT[1] ? 1 : 0);

    // --- the crossing at night: traffic, the crowd talking, the walk signal chirping ---
    const life = 1 - smooth(14, 26, v);
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const traffic = 0.3 * (0.4 + 0.6 * life) * (1 - smooth(30, 38, v));
    l += cityLP.run(brownL) * traffic; r += cityLP2.run(brownR) * traffic;
    {
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = 1 - smooth(0.5, 2.5, v);
      l += cv * 0.03 * talk; r += cv * 0.028 * talk;
      // the walk signal: two soft chirps a second (like a bird), until the alarm takes over
      const cp = (((v * 1.6) % 1) + 1) % 1;
      const ce = Math.exp(-cp * 22) * smooth(0, 0.01, cp) * (1 - smooth(3.0, 4.0, v));
      ph[1] += (2600 + 900 * Math.exp(-cp * 30)) / SR;
      const ch = chirpF.run(Math.sin(TAU * ph[1]), 2800, 0.5).bp * ce * 0.05;
      l += ch * 0.7; r += ch; wet += ch * 0.5;
    }
    // --- the screens' emergency chime (two-tone, repeating) and sirens far off ---
    {
      const a = smooth(3.8, 4.2, v) * (1 - smooth(22, 28, v));
      if (a > 0) {
        const cyc = ((v - 3.8) % 2.4 + 2.4) % 2.4;
        const t1 = cyc, t2 = cyc - 0.45;
        ph[2] += 880 / SR; ph[3] += 659.3 / SR;
        const c = (Math.sin(TAU * ph[2]) * env(t1, 0.01, 0.35) + Math.sin(TAU * ph[3]) * env(t2, 0.01, 0.45)) * 0.03 * a;
        const cv = chimeLP.run(c);
        l += cv; r += cv * 0.9; wet += cv * 0.8;
      }
      const sa = smooth(6, 10, v) * (1 - smooth(34, 40, v));
      if (sa > 0) {
        const f = 700 + 250 * Math.sin(v * 1.3) + 120 * Math.sin(v * 0.71 + 1);
        ph[4] += f / SR;
        const sv = sirenF.run(saw(ph[4]), 1400, 0.6).lp * 0.012 * sa;
        l += sv * 0.6; r += sv; wet += sv * 1.2;
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
    // --- the jumps: a trailer braam with a sub drop; the Moon's hit is the deepest so far ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, (0.9 + 0.8 * h.k) * (h.moon ? 1.8 : 1)) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.005 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e;
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, (0.7 + 0.4 * h.k) * (h.moon ? 2.2 : 1)) * h.k * (h.moon ? 1.4 : 1);
      }
      const bf = braamLP.run(braam, 1400, 0.6).lp * 0.1;
      const sv = subLP.run(sub) * 0.5 + sub * 0.25;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the sea rushing up the street, loudest as the front passes you, then sloshing ---
    {
      const front = smooth(V_FLOOD + 0.3, V_FLOOD + 3.4, v) * (1 - 0.65 * smooth(V_FLOOD + 3.8, V_FLOOD + 6, v)) * (1 - smooth(V_SPLIT, V_SPLIT + 1, v));
      if (front > 0) {
        const w = white();
        const gst = 0.7 + 0.3 * Math.sin(v * 3.1) * Math.sin(v * 1.7 + 2);
        const wv = (waterF[0].run(w, 650 + 300 * Math.sin(v * 2.3), 0.5).bp + 0.6 * waterF[1].run(w, 1900, 0.8).bp + waterLP.run(white()) * 0.8) * 0.16 * front * gst;
        l += wv; r += wv * 0.95; wet += wv * 0.3;
      }
    }
    // --- the ground: a deep rumble and groan from the first cracks, swelling to the end ---
    {
      const g = smooth(V_CRACK - 1.5, V_CRACK + 0.5, v) * (0.5 + 0.5 * smooth(V_FISSURE - 1, V_SPLIT, v)) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      const gr = (groanF[0].run(white(), 80 + 30 * Math.sin(v * 0.7), 0.15).bp + 0.6 * groanF[1].run(white(), 130 + 40 * Math.sin(v * 0.43 + 2), 0.12).bp) * 0.13 * g;
      const rum = (rumLP.run(white()) * 3 + rumLP2.run(white()) * 2) * (0.12 * g + 0.2 * smooth(V_ROCHE, V_SPLIT + 1, v)) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      l += gr; r += gr * 0.9; dl += rum; dr += rum; wet += gr * 0.5;
    }
    for (const q of thuds) {
      const dt = v - q.t;
      if (dt > 0 && dt < 0.8) {
        q.ph += (q.f + 35 * Math.exp(-dt * 12)) / SR;
        const vv = (Math.sin(TAU * q.ph) * 0.8 + q.fl.run(white(), 180, 0.8).lp) * env(dt, 0.015, 0.16) * q.g;
        l += vv * (1 - q.pan) * 0.5; r += vv * (1 + q.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // --- the wind roaring toward it ---
    {
      const wl = (0.02 + 0.22 * smooth(V_WIND - 1, V_WIND + 4, v) + 0.12 * smooth(V_ROCHE, V_SPLIT, v)) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      const wn = white();
      const gust = 0.75 + 0.25 * Math.sin(v * 0.9) * Math.sin(v * 2.3 + 1);
      const fc = 300 + 500 * smooth(V_WIND - 2, V_WIND + 8, v) + 300 * smooth(V_LIFT, V_SPLIT, v);
      const a = windF[0].run(wn, fc, 0.7).bp, b = windF[1].run(wn, fc * 2.3, 0.9).bp * 0.5, lo = windSub.run(white()) * 2.2;
      const wv = (a + b + lo) * wl * gust;
      l += wv; r += windF[2].run(wn, fc * 1.1, 0.7).bp * wl * gust + lo * wl * gust + b * wl * gust; wet += wv * 0.2;
    }
    // --- the lava: a low roar and a hiss of steam; the volcanoes' booms far off ---
    {
      const g = smooth(V_FISSURE, V_FISSURE + 2.5, v) * (1 - smooth(T_SWITCH - 0.4, T_SWITCH, v));
      if (g > 0) {
        const lv = lavaF.run(white(), 110 + 40 * Math.sin(v * 1.9), 0.3).bp * 0.12 * g + hissF.run(white(), 5200, 0.6).bp * 0.02 * g;
        l += lv; r += lv * 0.92; wet += lv * 0.4;
      }
      for (const b of booms) {
        const dt = v - b.t;
        if (dt > 0 && dt < 3) { b.ph += (34 + 20 * Math.exp(-dt * 4)) / SR; const bv = Math.sin(TAU * b.ph) * env(dt, 0.03, 0.7) * b.g; dl += bv; dr += bv; wet += bv * 0.8; }
      }
    }
    // --- whooshes ---
    for (const w of whoosh) {
      const dt = v - w.t;
      if (dt > 0 && dt < w.d) {
        const k = dt / w.d;
        const vv = w.f.run(white(), 300 + 1500 * k, 0.6).bp * Math.sin(Math.PI * k) * w.g;
        l += vv * (1 - w.pan) * 0.5; r += vv * (1 + w.pan) * 0.5;
      }
    }
    // --- cries ---
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        c.ph += c.f * (1.25 - 0.35 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(c.ph);
        const vv = (c.fA.run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * c.fB.run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // --- the drone: a dark minor pad, from the start, swelling ---
    {
      const ch = chordAt(v);
      const dg = (0.03 + 0.03 * smooth(8, 14, v) + 0.05 * smooth(24, 40, v)) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH + 0.1, v));
      let a = 0, b = 0;
      ch.forEach((f, q) => {
        ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR;
        a += saw(ph[40 + q]); b += saw(ph[44 + q]);
      });
      const cutf = 300 + 600 * smooth(20, 44, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
    }
    // --- the crust splitting under you: a riser into the white, cut just inside it ---
    {
      const k = smooth(V_SPLIT - 0.8, T_SWITCH - 0.05, v) * (1 - smooth(T_SWITCH - 0.05, T_SWITCH + 0.15, v));
      if (k > 0) {
        const rv = riserF.run(white(), 250 + 2600 * k * k, 0.35).bp * k * k * 0.15;
        dl += rv; dr += rv; wet += rv * 0.5;
      }
    }

    // in the cutaway (space) the street goes dull
    const fcm = 14000 * Math.pow(500 / 14000, cut);
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
