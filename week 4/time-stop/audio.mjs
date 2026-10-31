// Procedural soundtrack for "What if you could stop time and leave no DNA?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// The world's sounds (rain, traffic, the crowd, horns, sirens, the helicopters, the alarms) run on the world clock:
// as time stops they slide down and choke off (a tape-stop: the filter closes, the level drops), and come back
// with a rush when it starts. While time is stopped: near silence, a faint high ring, a low hum, your heartbeat.
// Every stop is a reversed swell into a deep hit and a glassy shimmer (the ripple). The heists: soft whooshes and
// low thuds for the bags, little bell chimes for the stones, paper riffles for the cash, a riser through the gold
// with a trailer hit on every step. A tense pulse under it all, building. The owner's "Noooo" (sounds/nooo.mp3) when
// the vault guards find it empty. The last stop rises into the white, which turns into the lead-in (the loop).
// Every onset is soft (5 ms+): no clicks or clacks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, RUNS, FREEZES, RESUMES, rateAt, shotAt, streetEp, TRUCK_BAGS, JEWEL_A, JEWEL_B, BANK_A, BANK_B, GOLD_A, GOLD_STEPS, V_END_FREEZE } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const VOICE_AT = 43.85;                                 // the guard's "Noooo" as he turns and sees the empty vault
const VOICE = ['nooo.mp3', 0.55, 2.3];                  // [file, skip, length]

class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR);
    this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h;
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
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

function loadClip(dir) {
  const [f, skip, len] = VOICE;
  const file = path.join(dir, 'sounds', f);
  if (!fs.existsSync(file)) { console.warn('audio: no sounds/nooo.mp3: the voice is left out'); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(skip), '-t', String(len), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x));
  console.log(`audio: voice from sounds/${f}`);
  return { a, g: 0.5 / Math.max(pk, 1e-6) };
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(5150);
  const white = () => R0() * 2 - 1;
  const VC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // ---- one-shots ----
  const bags = TRUCK_BAGS.map((t) => ({ t: t - 0.1, pan: -0.2 + R0() * 0.3, f: new SVF(), ph: 0 }));
  const chimes = [];
  for (let k = 0; k < 26; k++) chimes.push({ t: JEWEL_A + (k / 26) * (JEWEL_B - JEWEL_A) + R0() * 0.08, f: [1568, 1760, 2093, 2349, 2637, 3136][Math.floor(R0() * 6)], pan: R0() * 1.4 - 0.7, ph: 0 });
  const riffles = [];
  for (let k = 0; k < 22; k++) riffles.push({ t: BANK_A + (k / 22) * (BANK_B - BANK_A) + R0() * 0.06, pan: R0() * 1.2 - 0.6, f: new SVF() });
  const HITS = [...GOLD_STEPS.map((t, i) => ({ t, k: 0.6 + 0.13 * i, root: 55 * Math.pow(2, -i / 12) })), { t: 3.65, k: 0.45, root: 49 }, { t: 9.75, k: 0.45, root: 52 }, { t: 19.75, k: 0.5, root: 46 }];
  const horns = [{ t: 3.9, f: 392, d: 0.5, p: 0.5 }, { t: 4.7, f: 349, d: 0.35, p: -0.4 }, { t: 22.2, f: 415, d: 0.6, p: 0.3 }, { t: 47.1, f: 370, d: 0.5, p: -0.5 }, { t: 49.8, f: 330, d: 0.7, p: 0.6 }];
  // the tense pulse: D minor, 8ths at 104 bpm; its notes per bar
  const BPM = 104, BEAT = 60 / BPM;
  const BASS = [73.42, 73.42, 87.31, 65.41];

  const trafLP = new OnePole(180), trafLP2 = new OnePole(220);
  const rainF = [new SVF(), new SVF()], patF = new SVF();
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const worldLP = [new SVF(), new SVF()];
  const sirenF = new SVF(), heliF = new SVF(), heliLP = new OnePole(90), alarmF = new SVF(), hornF = new SVF();
  const swellF = new SVF(), rushF = new SVF(), boomLP = new OnePole(90), shimF = new SVF();
  const pulseF = new SVF(), braamLP = new SVF(), subLP = new OnePole(80), riserF = new SVF(), padLP = [new OnePole(500), new OnePole(500)];
  const humLP = new OnePole(120), heartLP = new OnePole(70);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;          // l/r: the world (tape-stopped); dl/dr: not
    const rate = rateAt(v);
    const shot = shotAt(v), place = shot.place, ep = streetEp(v);
    const street = place === 'street' ? 1 : 0;
    const end = 1 - smooth(T_SWITCH - 0.25, T_SWITCH + 0.05, v);

    // ===== the world (only while time runs) =====
    // the square: traffic, the rain (a hiss and patter), the crowd talking
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998; brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const inside = street ? 0 : 1;
    const amb = 1 - 0.5 * inside;                       // muffled through the walls when inside
    l += trafLP.run(brownL) * 0.28 * amb; r += trafLP2.run(brownR) * 0.28 * amb;
    if (inside) { ph[12] += 120 / SR; const rt = rainF[1].run(white(), 400, 1.2).bp * 0.03 + Math.sin(TAU * ph[12]) * 0.006; l += rt; r += rt; }
    {
      const w = white();
      const hiss = rainF[0].run(w, 5200, 0.6).bp * 0.06 + rainF[1].run(w, 1800, 0.9).bp * 0.04;
      const pat = 0;     // (no patter: single-drop ticks read as clicks)
      l += (hiss + pat) * street; r += (hiss * 0.95 - pat * 0.7) * street;
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const a = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * a;
      }
      l += cv * 0.022 * street; r += cv * 0.02 * street;
    }
    for (const h of horns) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d) {
        const e = smooth(0, 0.04, dt) * (1 - smooth(h.d - 0.08, h.d, dt)) * 0.01;
        ph[2] += h.f / SR; ph[3] += h.f * 1.26 / SR;
        const hv = hornF.run(saw(ph[2]) + saw(ph[3]), 1400, 0.6).lp * e;
        l += hv * (1 - h.p) * 0.5; r += hv * (1 + h.p) * 0.5; wet += hv * 0.4;
      }
    }
    // sirens (the manhunt and after): two wails sweeping, far and near
    if ((ep >= 1 && street) || (place === 'jewel' && v > 10.6)) {
      const out = street ? 1 : 0.9;   // (heard through the store's window)
      for (let k = 0; k < 2; k++) {
        const f = 700 + 450 * (0.5 + 0.5 * Math.sin(v * (k ? 1.7 : 1.1) + k * 2));
        ph[6 + k] += f / SR;
        const sv = sirenF.run(Math.sin(TAU * ph[6 + k]) + 0.3 * saw(ph[6 + k]), 2200, 0.7).lp * (k ? 0.012 : 0.02) * out;
        l += sv * (k ? 1.3 : 0.7); r += sv * (k ? 0.7 : 1.3); wet += sv * 0.6;
      }
      // the helicopters: a beating thump over a rush
      const blade = Math.pow(0.5 + 0.5 * Math.cos(TAU * ((v * 19) % 1)), 6);
      if (street) {
      const hv = (heliLP.run(white()) * 2.5 + heliF.run(white(), 300, 0.6).bp * 0.6) * (0.25 + 0.75 * blade) * (ep === 2 ? 0.12 : 0.08);
      l += hv; r += hv * 0.9;
      }
    }
    // the alarms: the store's bell (soft, filtered), the bank's and the vault's whoop
    {
      let av = 0;
      if (v > 9.6 && v < 15.4) { ph[10] += 1250 / SR; av += Math.sin(TAU * ph[10]) * (0.6 + 0.4 * Math.sin(v * TAU * 16)) * 0.05 * (place === 'jewel' ? 1 : 0); }
      if ((v > 19.6 && v < 21.4) || (v > 43.6 && v < 46.0)) { const f = 600 + 500 * ((v * 1.6) % 1); ph[11] += f / SR; av += (Math.sin(TAU * ph[11]) + 0.2 * Math.sin(2 * TAU * ph[11])) * 0.024; }
      if (av) { const vv = alarmF.run(av, 2600, 0.7).lp; l += vv; r += vv; wet += vv * 0.7; }
    }
    // the guard's "Noooo"
    if (VC) {
      const i = Math.round((v - VOICE_AT) * SR);
      if (i >= 0 && i < VC.a.length) {
        const fade = Math.min(1, i / (0.01 * SR), (VC.a.length - i) / (0.25 * SR));
        const s = VC.a[i] * VC.g * fade;
        l += s * 0.95; r += s; wet += s * 0.3;
      }
    }
    // the tape-stop: the world slides down and chokes off as time stops
    {
      const fc = 150 + 15000 * rate * rate;
      const g = Math.pow(rate, 0.6);
      l = worldLP[0].run(l, fc, 0.7).lp * g; r = worldLP[1].run(r, fc, 0.7).lp * g;
    }

    // ===== while time is stopped: a faint high ring, a low hum, your heartbeat =====
    const fz = 1 - rate;
    if (fz > 0.001) {
      ph[20] += 3150 / SR; ph[21] += 3163 / SR; ph[22] += 4720 / SR;
      const ring = (Math.sin(TAU * ph[20]) + Math.sin(TAU * ph[21]) + 0.4 * Math.sin(TAU * ph[22])) * 0.0028 * fz;
      ph[23] += 55 / SR; ph[24] += 82.4 / SR;
      const hum = humLP.run(Math.sin(TAU * ph[23]) + 0.5 * Math.sin(TAU * ph[24])) * 0.12 * fz;
      const hb = ((v % 0.86) + 0.86) % 0.86, heart = heartLP.run((env(hb, 0.008, 0.07) + 0.7 * env(hb - 0.22, 0.008, 0.07)) * Math.sin(TAU * 48 * hb)) * 0.5 * fz;
      dl += (ring + hum + heart) * end; dr += (ring * 0.9 + hum + heart) * end; wet += ring * 2;
    }

    // ===== every stop: a reversed swell into a deep hit and a glassy shimmer; every start: a rush =====
    for (const f of [...FREEZES]) {
      const dt = v - f;
      if (dt > -0.5 && dt < 0.06) {
        const k = smooth(-0.5, 0, dt);
        const sw = swellF.run(white(), 300 + 4000 * k * k, 0.5).bp * k * k * 0.22 * (1 - smooth(-0.01, 0.05, dt));
        dl += sw; dr += sw; wet += sw * 0.4;
      }
      if (dt >= 0 && dt < 2.5) {
        ph[30] += (32 + 50 * Math.exp(-dt * 7)) / SR;
        const boom = (boomLP.run(Math.sin(TAU * ph[30])) * 1.6 + Math.sin(TAU * ph[30]) * 0.5) * env(dt, 0.006, 0.55) * 0.75 * (f === V_END_FREEZE ? 0 : 1);
        let sh = 0;
        [1975, 2637, 3322, 3951].forEach((fr, q) => { ph[31 + q] += fr * (1 - 0.06 * dt) / SR; sh += Math.sin(TAU * ph[31 + q]) * env(dt - q * 0.03, 0.01, 0.5 + 0.2 * q); });
        sh = shimF.run(sh, 6000, 0.7).lp * 0.035;
        dl += boom + sh; dr += boom + sh * 0.9; wet += sh * 1.5 + boom * 0.2;
      }
    }
    for (const s0 of RESUMES) {
      const dt = v - s0;
      if (dt > -0.02 && dt < 0.8) {
        const k = env(dt + 0.02, 0.03, 0.18);
        const ru = rushF.run(white(), 400 + 5000 * clamp(dt / 0.3), 0.5).bp * k * 0.25;
        ph[36] += (70 - 30 * clamp(dt / 0.3)) / SR;
        const wh = Math.sin(TAU * ph[36]) * env(dt + 0.02, 0.01, 0.15) * 0.35;
        dl += ru + wh; dr += ru * 0.9 + wh; wet += ru * 0.3;
      }
    }

    // ===== the heists =====
    for (const b of bags) {
      const dt = v - b.t;
      if (dt > 0 && dt < 0.6) {
        const sw = b.f.run(white(), 500 + 1500 * Math.sin(Math.PI * clamp(dt / 0.35)), 0.8).bp * Math.sin(Math.PI * clamp(dt / 0.35)) * 0.07;
        b.ph += (60 + 20 * Math.exp(-(dt - 0.4) * 20)) / SR;
        const th = dt > 0.4 ? Math.sin(TAU * b.ph) * env(dt - 0.4, 0.006, 0.07) * 0.22 : 0;
        dl += sw * (1 - b.pan) + th; dr += sw * (1 + b.pan) + th; wet += sw * 0.3;
      }
    }
    for (const c of chimes) {
      const dt = v - c.t;
      if (dt > 0 && dt < 1.2) {
        c.ph += c.f / SR;
        const s = (Math.sin(TAU * c.ph) + 0.3 * Math.sin(TAU * c.ph * 2.76)) * env(dt, 0.005, 0.28) * 0.02;
        dl += s * (1 - c.pan); dr += s * (1 + c.pan); wet += s * 1.2;
      }
    }
    for (const c of riffles) {
      const dt = v - c.t;
      if (dt > 0 && dt < 0.25) {
        const flick = 0.5 + 0.5 * Math.sin(dt * TAU * 60);
        const s = c.f.run(white(), 3000, 0.9).bp * Math.sin(Math.PI * dt / 0.25) * flick * 0.05;
        dl += s * (1 - c.pan); dr += s * (1 + c.pan); wet += s * 0.3;
      }
    }

    // ===== the music: a tense pulse (heists), a pad, trailer hits, the riser through the gold and into the white =====
    {
      const on = (smooth(-1, 0.5, v) * 0.6 + 0.4 * smooth(5, 8, v)) * end;
      const bt = v / (BEAT / 2), step = Math.floor(bt), fr = bt - step;
      const note = BASS[((Math.floor(step / 8) % 4) + 4) % 4] * (Math.abs(step) % 2 ? 2 : 1);   // (step < 0 in the lead-in)
      ph[40] += note / SR; ph[41] += note * 1.007 / SR;
      const e8 = Math.min(fr / 0.02, 1) * Math.exp(-fr * 3.5);
      const pv = pulseF.run(saw(ph[40]) + saw(ph[41]), 300 + 900 * smooth(28, 42, v) + 600 * e8, 0.5).lp * e8 * 0.07 * on;
      dl += pv; dr += pv; wet += pv * 0.3;
      // the pad: D minor, darkening into the gold
      const chord = v < 28 ? [146.8, 174.6, 220] : v < 46 ? [146.8, 174.6, 233.1] : [146.8, 185, 220];
      let a = 0, b = 0;
      chord.forEach((f, q) => { ph[44 + q] += f / SR; ph[48 + q] += f * 1.005 / SR; a += saw(ph[44 + q]); b += saw(ph[48 + q]); });
      const pg = (0.02 + 0.03 * smooth(26, 40, v)) * end;
      padLP[0].set(500 + 900 * smooth(28, 50, v)); padLP[1].set(540 + 900 * smooth(28, 50, v));
      const xl = padLP[0].run(a) * pg, xr = padLP[1].run(b) * pg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.5;
      // trailer hits (the gold steps and the popups)
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 4) continue;
        const e = env(dt + 0.02, 0.025, 0.9 + 0.6 * h.k) * h.k * (1 - smooth(3, 4, dt));
        const hf = h.root * (1 - 0.03 * Math.min(dt, 1));
        ph[52] += hf / SR; ph[53] += hf * 1.005 / SR; ph[54] += hf * 2 / SR;
        braam += (saw(ph[52]) + saw(ph[53]) + 0.5 * saw(ph[54])) * e;
        ph[55] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[55]) * env(dt + 0.02, 0.012, 0.7) * h.k;
      }
      const bf = braamLP.run(braam, 1200, 0.6).lp * 0.09, sv = subLP.run(sub) * 0.45 + sub * 0.2;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.5;
      // risers: through the gold vault, and into the last stop's white
      const k1 = smooth(GOLD_A, GOLD_STEPS[3], v) * (1 - smooth(GOLD_STEPS[3], GOLD_STEPS[3] + 0.15, v));
      const k2 = smooth(V_END_FREEZE - 3.5, T_SWITCH - 0.05, v) * (1 - smooth(T_SWITCH - 0.05, T_SWITCH + 0.15, v));
      const k = Math.max(k1 * 0.7, k2);
      if (k > 0) { const rv = riserF.run(white(), 250 + 3000 * k * k, 0.35).bp * k * k * 0.12; dl += rv; dr += rv; wet += rv * 0.5; }
    }

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
