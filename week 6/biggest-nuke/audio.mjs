// Procedural soundtrack for "What if the biggest nuke ever hit your city?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// The bomb itself is silent for 45 seconds: its sound travels with the blast. So what you hear is the street: the
// evening's traffic and talk, the owner's scream in the first second, tyres and two crashes, the city's hum sagging as the
// power goes, your phone's three falling tones, car alarms, sirens, the crowd running. Under it a deep hit on every 3 s
// beat (music, bigger each time) over a dark minor drone, a high shimmer with the heat, a pulse that quickens. At 0:30
// everything drops away but the pulse ("not a sound yet"). Then a riser, the ground's rumble, and the blast at last: the
// boom and roar into the white, which turns back into the street at the start (the loop). Every onset is soft (8 ms+).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STEPS, V_CRASH, V_POWER, V_PHONE, V_RUN, V_SMOKE, V_BURN, V_QUIET, V_CLOUD, V_DROP, V_WALL } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// the scream right at the start: the owner's clip (sounds/scream.mp3, or his "Noooo"); both stay out of git
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
    return { a, g: 0.36 / Math.max(pk, 1e-6) };
  }
  console.warn('audio: no sounds/scream.mp3 or sounds/nooo.mp3: the scream is left out');
  return null;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(6161);
  const white = () => R0() * 2 - 1;
  const SC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // ---- a hit on each 3 s beat, bigger each time (the music: the bomb itself is silent until the blast); the blast ----
  const HITS = STEPS.filter((t) => t < V_WALL - 0.5).map((t, n) => ({ t, k: clamp(0.28 + 0.05 * n, 0, 0.95), root: 55 * Math.pow(2, -Math.min(n, 12) / 24) }));
  HITS.unshift({ t: 0.0, k: 0.5, root: 41, deep: true });
  HITS.push({ t: V_WALL - 0.1, k: 1.5, root: 30, deep: true, boom: true });
  // ---- cries (each voice its own pitch and filters) ----
  const cries = [];
  const addCries = (t0, t1, n, g) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: 240 + R0() * 300, d: 0.45 + R0() * 0.8, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() }); };
  addCries(0.5, 3.0, 8, 0.011); addCries(V_POWER, V_POWER + 3, 6, 0.01); addCries(V_RUN, V_RUN + 5, 18, 0.013); addCries(17, 21, 6, 0.01);
  addCries(25, 29, 8, 0.011); addCries(V_CLOUD, V_CLOUD + 3.5, 10, 0.013); addCries(V_DROP, V_WALL - 0.2, 16, 0.015);
  // ---- the tyres (a soft band of noise, each with its own pitch) and the two crashes ----
  const TYRES = Array.from({ length: 7 }, () => ({ t: 0.2 + R0() * 1.3, d: 0.8 + R0() * 1.1, f: 900 + R0() * 700, g: 0.012 + R0() * 0.012, pan: R0() * 1.6 - 0.8, fl: new SVF() }));
  const CRASHES = [{ t: V_CRASH, g: 0.9, pan: -0.35 }, { t: V_CRASH + 0.75, g: 0.65, pan: 0.45 }].map((c) => ({ ...c, a: new SVF(), b: new SVF(), lp: new OnePole(90), parts: Array.from({ length: 26 }, () => ({ t: R0() * 0.55, d: 0.05 + R0() * 0.12, f: 1500 + R0() * 3000, g: 0.015 + 0.02 * R0(), fl: new SVF() })) }));
  // ---- car alarms set off round the street once the power goes (two tones, slow, far apart in pitch and place) ----
  const ALARMS = Array.from({ length: 4 }, (_, i) => ({ t: V_POWER + 0.6 + i * 0.9, f: 820 + 230 * i, rate: 2.6 + 0.7 * i, pan: [-0.7, 0.5, -0.2, 0.8][i], ph: 0, fl: new SVF() }));
  // ---- horns and sirens ----
  const HORNS = Array.from({ length: 9 }, () => ({ t: 1.0 + R0() * 8, d: 0.5 + R0() * 1.4, f: 300 + R0() * 200, pan: R0() * 1.6 - 0.8, ph: 0, ph2: 0, fl: new SVF() }));
  // ---- the glass along the street as the wall comes (a wash of soft bursts, no clacks) ----
  const GLASS = Array.from({ length: 90 }, () => ({ t: V_WALL - 0.7 + R0() * 0.8, d: 0.06 + R0() * 0.12, f: 2600 + R0() * 3500, g: 0.012 + 0.012 * R0(), pan: R0() * 1.6 - 0.8, fl: new SVF() }));
  // ---- the drone's chords (Hz), darkening ----
  const CHORDS = [[-9, [110, 130.8, 164.8]], [V_RUN, [98, 116.5, 146.8]], [24, [87.3, 110, 130.8]], [V_CLOUD, [73.4, 87.3, 110]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const cityLP = new OnePole(220), cityLP2 = new OnePole(260), idleLP = new OnePole(120);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const shimF = [new SVF(), new SVF()];
  const braamLP = new SVF(), subLP = new OnePole(80);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const riserF = new SVF(), sirenF = [new SVF(), new SVF()], humLP = new OnePole(500), feetF = new SVF();
  const roarF = [new SVF(), new SVF(), new SVF()], roarSub = new OnePole(55), rumLP = new OnePole(40), rumLP2 = new OnePole(70);
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const gone = 1 - smooth(V_WALL - 0.05, V_WALL + 0.25, v);     // the street, until the wall takes it
    // "not a sound yet": for a moment everything drops away but your heart
    const hush = 1 - 0.88 * smooth(V_QUIET - 0.3, V_QUIET + 0.15, v) * (1 - smooth(V_QUIET + 2.1, V_QUIET + 2.5, v));

    // --- the evening street: traffic, the crowd talking ---
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const flow = 1 - smooth(0.2, 2.2, v);
    const traffic = (0.1 + 0.2 * flow) * gone * hush;
    l += cityLP.run(brownL) * traffic + idleLP.run(white()) * 0.08 * (1 - flow) * gone * hush;
    r += cityLP2.run(brownR) * traffic + idleLP.y * 0.08 * (1 - flow) * gone * hush;
    {
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = (1 - smooth(0.3, 2, v) * 0.6) * gone * hush;
      l += cv * 0.03 * talk; r += cv * 0.028 * talk;
    }
    // --- the crowd running: a wash of feet ---
    {
      const g = smooth(V_RUN, V_RUN + 1.5, v) * (1 - smooth(V_RUN + 6, V_RUN + 11, v)) * gone * hush;
      if (g > 0) {
        const tick = Math.pow(0.5 + 0.5 * Math.sin(v * 17) * Math.sin(v * 11.3 + 1), 2);
        const fv = feetF.run(white(), 500, 0.5).bp * 0.05 * g * (0.5 + tick);
        l += fv; r += fv * 0.92;
      }
    }
    // --- the tyres ---
    for (const q of TYRES) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const e = smooth(0, 0.05, dt) * (1 - smooth(q.d - 0.25, q.d, dt));
        const tv = q.fl.run(white(), q.f * (1 + 0.06 * Math.sin(dt * 34)), 0.09).bp * e * q.g * 1.4;
        l += tv * (1 - q.pan) * 0.5; r += tv * (1 + q.pan) * 0.5; wet += tv * 0.5;
      }
    }
    // --- the crashes: a soft thump, metal and glass (every onset 8 ms+) ---
    for (const c of CRASHES) {
      const dt = v - c.t;
      if (dt < 0 || dt > 2) continue;
      ph[6] += (64 - 26 * Math.min(dt * 3, 1)) / SR;
      const th = Math.sin(TAU * ph[6]) * smooth(0, 0.012, dt) * Math.exp(-dt / 0.14) * 0.34 * c.g;
      const mt = c.a.run(white(), 1100, 0.3).bp * smooth(0, 0.01, dt) * Math.exp(-dt / 0.2) * 0.13 * c.g;
      let cv = th + mt;
      for (const q of c.parts) {
        const d2 = dt - q.t;
        if (d2 > 0 && d2 < q.d) cv += q.fl.run(white(), q.f, 0.5).bp * smooth(0, 0.01, d2) * (1 - smooth(q.d - 0.03, q.d, d2)) * q.g * c.g;
      }
      l += cv * (1 - c.pan) * 0.5; r += cv * (1 + c.pan) * 0.5; wet += cv * 0.7;
    }
    // --- the power goes: the city's hum sags and dies, a far-off thud of substations ---
    {
      const u = (v - V_POWER) / 1.5;
      const g = (1 - smooth(0.2, 1.0, u)) * smooth(-1, 0, u) * gone;
      if (g > 0) {
        ph[2] += (120 * (1 - 0.72 * smooth(0, 1, u))) / SR;
        const hv = humLP.run(saw(ph[2])) * 0.05 * g;
        dl += hv; dr += hv; wet += hv * 0.8;
      }
    }
    // --- your phone: three falling tones (no service) ---
    {
      const dt = v - (V_PHONE + 0.12);
      if (dt > 0 && dt < 0.75) {
        const k = Math.floor(dt / 0.24), u = dt - k * 0.24;
        const e = smooth(0, 0.012, u) * (1 - smooth(0.15, 0.2, u));
        ph[3] += [950, 760, 570][Math.min(k, 2)] / SR;
        const pv = Math.sin(TAU * ph[3]) * e * 0.05;
        l += pv * 0.8; r += pv; wet += pv * 0.3;
      }
    }
    // --- car alarms ---
    for (const a of ALARMS) {
      const dt = v - a.t;
      if (dt > 0) {
        const f = a.f * (Math.floor(dt * a.rate) % 2 ? 1.28 : 1);
        a.ph += f / SR;
        const av = a.fl.run(saw(a.ph), 1600, 0.6).lp * 0.0075 * smooth(0, 0.05, dt) * gone * hush * (1 - 0.5 * smooth(20, 40, v));
        l += av * (1 - a.pan) * 0.5; r += av * (1 + a.pan) * 0.5; wet += av * 0.9;
      }
    }
    // --- horns, then sirens far off ---
    for (const h of HORNS) {
      const dt = v - h.t;
      if (dt > 0 && dt < h.d) {
        h.ph += h.f / SR; h.ph2 += h.f * 1.26 / SR;
        const e = smooth(0, 0.03, dt) * (1 - smooth(h.d - 0.08, h.d, dt));
        const hv = h.fl.run(saw(h.ph) + saw(h.ph2) * 0.7, 1500, 0.5).lp * 0.02 * e;
        l += hv * (1 - h.pan) * 0.5; r += hv * (1 + h.pan) * 0.5; wet += hv * 0.6;
      }
    }
    {
      const sa = smooth(9, 14, v) * gone * hush;
      if (sa > 0) {
        for (let q = 0; q < 2; q++) {
          const f = 650 + 80 * q + 250 * Math.sin(v * (1.3 + 0.4 * q) + q * 2) + 100 * Math.sin(v * 0.7 + 1);
          ph[4 + q] += f / SR;
          const sv = sirenF[q].run(saw(ph[4 + q]), 1400, 0.6).lp * 0.011 * sa;
          l += sv * (q ? 1 : 0.6); r += sv * (q ? 0.6 : 1); wet += sv * 1.2;
        }
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
    // --- the beats: a deep hit with a sub drop ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 5) continue;
        const e = env(dt + 0.02, 0.025, (0.9 + 0.8 * h.k) * (h.deep ? 1.8 : 1)) * h.k * (1 - smooth(3.5, 5, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.005 / SR; ph[12] += hf * 2 / SR; ph[13] += hf * 3.01 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12]) + 0.25 * saw(ph[13])) * e * (h.boom ? 0.6 : 1);
        ph[14] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.012, (0.7 + 0.4 * h.k) * (h.deep ? 2.2 : 1)) * h.k * (h.deep ? 1.4 : 1);
      }
      const bf = braamLP.run(braam, 1400, 0.6).lp * 0.1 * hush;
      const sv = (subLP.run(sub) * 0.5 + sub * 0.25) * hush;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- a high shimmer: the heat (music, not the fire) ---
    {
      const g = smooth(V_SMOKE, V_SMOKE + 4, v) * (1 - smooth(V_WALL - 0.1, V_WALL, v)) * hush;
      if (g > 0) {
        const w = white();
        const trem = 0.7 + 0.3 * Math.sin(v * 7);
        const sv = (shimF[0].run(w, 5200 + 1500 * Math.sin(v * 0.9), 0.9).bp + shimF[1].run(w, 7800, 0.95).bp * 0.6) * 0.016 * g * trem;
        l += sv * 0.8; r += sv; wet += sv * 1.5;
      }
    }
    // --- the pulse: quickening to the end. It's the only thing left in the hush ---
    {
      const g = smooth(V_BURN, V_BURN + 2, v) * (1 - smooth(V_WALL - 0.3, V_WALL, v));
      if (g > 0) {
        const rate = 1.1 + 2.5 * smooth(V_BURN, V_WALL, v);
        ph[30] += rate / SR;
        const cyc = ph[30] % 1;
        const e = env(cyc / rate, 0.012, 0.09);
        ph[31] += (50 + 25 * Math.exp(-cyc / rate * 20)) / SR;
        const pv = Math.sin(TAU * ph[31]) * e * 0.3 * g;
        dl += pv; dr += pv;
      }
    }
    // --- the last 9 seconds: a riser, and a rumble under it as the ground starts to move ---
    {
      const k = smooth(V_CLOUD, V_WALL - 0.05, v) * (1 - smooth(V_WALL - 0.05, V_WALL + 0.05, v));
      if (k > 0) {
        const rv = riserF.run(white(), 200 + 3200 * k * k, 0.35).bp * k * k * 0.14;
        dl += rv; dr += rv; wet += rv * 0.5;
      }
      const g = smooth(V_DROP, V_WALL, v) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH, v));
      if (g > 0) {
        const rum = (rumLP.run(white()) * 3 + rumLP2.run(white()) * 2) * 0.3 * g * g;
        dl += rum; dr += rum;
      }
    }
    // --- the wall: the sound of the bomb, 45 seconds late: a roar into the white ---
    {
      const g = smooth(V_WALL - 0.15, V_WALL + 0.1, v) * (1 - smooth(T_SWITCH - 0.25, T_SWITCH + 0.05, v));
      if (g > 0) {
        const w = white();
        const fc = 1800 - 1200 * smooth(V_WALL, T_SWITCH, v);
        const rv = (roarF[0].run(w, fc, 0.6).bp + roarF[1].run(w, fc * 0.45, 0.7).bp * 0.8 + roarSub.run(white()) * 3) * 0.32 * g;
        l += rv; r += roarF[2].run(w, fc * 1.1, 0.6).bp * 0.32 * g + roarSub.y * 3 * 0.32 * g; wet += rv * 0.3;
      }
    }
    for (const q of GLASS) {
      const dt = v - q.t;
      if (dt > 0 && dt < q.d) {
        const e = smooth(0, 0.012, dt) * (1 - smooth(q.d - 0.03, q.d, dt));
        const gv = q.fl.run(white(), q.f, 0.6).bp * e * q.g;
        l += gv * (1 - q.pan) * 0.5; r += gv * (1 + q.pan) * 0.5; wet += gv * 0.8;
      }
    }
    // --- cries ---
    for (const c of cries) {
      const dt = v - c.t;
      if (dt > 0 && dt < c.d) {
        c.ph += c.f * (1.25 - 0.35 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(c.ph);
        const vv = (c.fA.run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * c.fB.run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g * hush;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // --- the drone: a dark minor pad, from the start, swelling ---
    {
      const ch = chordAt(v);
      const dg = (0.03 + 0.03 * smooth(8, 14, v) + 0.05 * smooth(24, 40, v)) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH + 0.1, v)) * hush;
      let a = 0, b = 0;
      ch.forEach((f, q) => {
        ph[40 + q] += f / SR; ph[44 + q] += f * 1.004 / SR;
        a += saw(ph[40 + q]); b += saw(ph[44 + q]);
      });
      const cutf = 300 + 600 * smooth(20, 42, v);
      droneLP[0].set(cutf); droneLP[1].set(cutf * 1.07);
      const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
      dl += xl; dr += xr; wet += (xl + xr) * 0.6;
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
