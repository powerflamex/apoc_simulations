// Procedural soundtrack for "What if a grain of sand hit Earth at the speed of light?", synced to src/timeline.js (video
// clock).   node audio.mjs  -> out/soundtrack.wav
// A crowded beach (surf, gulls, the crowd talking), then: the owner's scream in the first second; a rising whistle as each slow
// grain comes down; every hit its own sound, on the flash, from a soft tick to the deepest boom, each bigger than the last; from
// hit 6 the blast's slam on the tower 0.75 s later; cries as the crowd runs; a dark minor drone under it all, a pulse that
// quickens; the glass going at 0:28; the rumble of the ground from 0:38; the roar into the white, which turns back into the
// beach at the start (the loop). Every onset is soft (8 ms+): no clicks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, HITS, V_LAST, V_REACH, V_ROLL, SHOCK } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
// the scream right at the start: the owner's clip (sounds/scream.mp3, or his "Noooo"); both stay out of git
const SCREAM_AT = 0.12;
const SCREAM_FILES = [['scream.mp3', 0.0], ['nooo.mp3', 0.55]];
const DT_SLAM = 200 / SHOCK;

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
    return { a, g: 0.34 / Math.max(pk, 1e-6) };
  }
  console.warn('audio: no sounds/scream.mp3 or sounds/nooo.mp3: the scream is left out');
  return null;
}

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(7171);
  const white = () => R0() * 2 - 1;
  const SC = loadClip(path.dirname(fileURLToPath(import.meta.url)));

  // ---- each hit: how hard it lands (0..1.5), how low. The last ones are mostly sub; the first is a tick of sand ----
  const HS = HITS.map((h) => ({ ...h, g: Math.pow(h.k / 15, 1.15) * 1.45 + 0.02, root: 62 - h.k * 2.3, fl: new SVF(), fl2: new SVF() }));
  const whistle = [[0.1, 3.0], [4.7, 6.0], [8.2, 9.0], [11.5, 12.0], [14.7, 15.0]];    // [start, hit]: the slow grains, heard coming
  // ---- cries (each voice its own pitch and filters) ----
  const cries = [];
  const addCries = (t0, t1, n, g) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: 240 + R0() * 300, d: 0.45 + R0() * 0.8, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() }); };
  addCries(0.5, 3.0, 8, 0.011); addCries(6.1, 8, 7, 0.011); addCries(9.1, 11.5, 12, 0.012); addCries(12.1, 15, 20, 0.014); addCries(15.1, 18, 14, 0.013);
  addCries(18.2, 21, 12, 0.013); addCries(21.1, 24, 18, 0.015); addCries(24.2, 27, 14, 0.014); addCries(30.2, 32, 8, 0.012);
  // ---- the gulls, early on ----
  const GULLS = Array.from({ length: 7 }, () => ({ t: R0() * 14, d: 0.5 + R0() * 0.5, f: 1500 + R0() * 700, pan: R0() * 1.6 - 0.8, ph: 0 }));
  // ---- the glass going all down the seafront (a wash of soft bursts, no clacks) ----
  const GLASS = Array.from({ length: 130 }, () => ({ t: 25.0 + (R0() < 0.3 ? 0 : 2.6) + R0() * 1.3, d: 0.06 + R0() * 0.14, f: 2600 + R0() * 3800, g: 0.012 + 0.014 * R0(), pan: R0() * 1.6 - 0.8, fl: new SVF() }));
  // ---- the drone's chords (Hz), darkening ----
  const CHORDS = [[-9, [110, 130.8, 164.8]], [12, [98, 116.5, 146.8]], [21, [87.3, 110, 130.8]], [33, [73.4, 87.3, 110]]];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const surfF = [new SVF(), new SVF()], surfLP = new OnePole(900), surfHP = new OnePole(120);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const whF = new SVF(), whF2 = new SVF();
  const braamLP = new SVF(), subLP = new OnePole(80);
  const rumLP = new OnePole(40), rumLP2 = new OnePole(70);
  const droneLP = [new OnePole(400), new OnePole(400)];
  const roarF = [new SVF(), new SVF(), new SVF()], roarSub = new OnePole(55), windF = new SVF();
  const revL = new Reverb(11), revR = new Reverb(12);
  const ph = new Float64Array(64);

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const gone = 1 - smooth(V_REACH - 0.1, V_REACH + 0.2, v);     // the beach, until the last hit takes it

    // --- the beach: surf breaking in slow swells, the crowd talking, gulls ---
    {
      const swell = 0.55 + 0.45 * Math.sin(v * 1.1 + 0.7 * Math.sin(v * 0.37));
      const w = white();
      const away = 1 - 0.75 * smooth(18.2, 21, v);                 // (the sea pulls back)
      const sv = (surfF[0].run(w, 700 + 900 * swell, 0.8).bp * 0.6 + surfLP.run(w) * 0.5) * 0.085 * swell * away * gone;
      const sv2 = surfF[1].run(white(), 1900, 0.9).bp * 0.03 * swell * away * gone;
      l += sv + sv2 * 0.7; r += sv * 0.8 + sv2;
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = (1 - smooth(1.5, 7, v)) * gone;
      l += cv * 0.04 * talk; r += cv * 0.036 * talk;
      for (const g of GULLS) {
        const dt = v - g.t;
        if (dt > 0 && dt < g.d) {
          const e = Math.sin(Math.PI * dt / g.d);
          g.ph += g.f * (1.2 - 0.45 * dt / g.d) / SR;
          const gv = Math.sin(TAU * g.ph + 2 * Math.sin(TAU * g.ph * 2.01)) * e * e * 0.012;
          l += gv * (1 - g.pan) * 0.5; r += gv * (1 + g.pan) * 0.5; wet += gv * 1.5;
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
    // --- a slow grain coming down: a thin rising tear of air, cut off by the hit ---
    for (const [t0, t1] of whistle) {
      if (v > t0 && v < t1 + 0.01) {
        const u = (v - t0) / (t1 - t0);
        const nv = whF.run(white(), 900 + 5200 * u * u, 0.25).bp * u * u * 0.07 * (1 - smooth(t1 - 0.015, t1, v));
        l += nv * 0.8; r += nv; wet += nv * 0.5;
      }
    }
    // --- every hit: on the flash. Sand and air on top, a deep hit under it, a sub drop for the big ones ---
    {
      let braam = 0, sub = 0;
      for (const h of HS) {
        const dt = v - h.t;
        if (dt < 0 || dt > 6) continue;
        // the crack of it (soft edge): noise, darker as they get bigger
        const crack = white() * env(dt, 0.008, 0.05 + 0.14 * h.g) * Math.min(1, 0.12 + h.g * 0.8);
        const cv = h.fl.run(crack, 5200 / (1 + h.k * 0.5), 0.7).lp * 0.8;
        l += cv * 0.9; r += cv; wet += cv * 0.6;
        // sand falling back after it (from hit 2)
        if (h.k >= 2 && h.k < 8) {
          const sv = h.fl2.run(white(), 3400, 0.8).bp * env(dt - 0.15, 0.2, 0.9) * 0.05 * Math.min(1, h.k / 5);
          l += sv * 0.8; r += sv;
        }
        if (h.k < 2) continue;
        const e = env(dt, 0.012, 0.8 + 0.9 * h.g) * h.g * (1 - smooth(4, 6, dt));
        const hf = h.root * (1 - 0.05 * Math.min(dt, 1));
        const a = 10 + (h.k % 6) * 8;
        ph[a] += hf / SR; ph[a + 1] += hf * 1.005 / SR; ph[a + 2] += hf * 2 / SR; ph[a + 3] += hf * 3.01 / SR;
        braam += (saw(ph[a]) + saw(ph[a + 1]) + 0.5 * saw(ph[a + 2]) + 0.25 * saw(ph[a + 3])) * e;
        ph[a + 4] += (26 + 44 * Math.exp(-dt * 5)) / SR;
        sub += Math.sin(TAU * ph[a + 4]) * env(dt, 0.01, 0.6 + 0.7 * h.g) * h.g * 1.3;
      }
      const bf = braamLP.run(braam, 1300, 0.6).lp * 0.1;
      const sv = subLP.run(sub) * 0.5 + sub * 0.25;
      dl += bf + sv; dr += bf * 0.97 + sv; wet += bf * 0.6;
    }
    // --- the blast slamming into the tower, from hit 6 on: a low thump and a rush of wind ---
    {
      let thump = 0, rush = 0;
      for (const h of HS) {
        if (h.k < 6) continue;
        const dt = v - h.t - DT_SLAM;
        if (dt < 0 || dt > 2.5) continue;
        ph[6] += (34 + 30 * Math.exp(-dt * 8)) / SR;
        thump += Math.sin(TAU * ph[6]) * env(dt, 0.015, 0.34) * Math.min(1, 0.45 + h.k * 0.05);
        rush += env(dt, 0.05, 0.75) * Math.min(1, 0.35 + h.k * 0.05);
      }
      const wv = windF.run(white(), 500 + 900 * rush, 0.8).bp * rush * 0.34;
      dl += thump * 0.5 + wv; dr += thump * 0.5 + wv * 0.92; wet += wv * 0.3;
    }
    // --- the pulse: quickening toward the last grain ---
    {
      const g = smooth(15, 18, v) * (1 - smooth(V_LAST - 0.3, V_LAST, v));
      if (g > 0) {
        const rate = 1.1 + 2.3 * smooth(15, V_LAST, v);
        ph[30] += rate / SR;
        const cyc = ph[30] % 1;
        const e = env(cyc / rate, 0.012, 0.09);
        ph[31] += (50 + 25 * Math.exp(-cyc / rate * 20)) / SR;
        const pv = Math.sin(TAU * ph[31]) * e * 0.26 * g;
        dl += pv; dr += pv;
      }
    }
    // --- the ground: a rumble rising from the moment it starts to roll, until the white ---
    {
      const g = smooth(V_ROLL - 3, V_LAST, v) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH, v));
      if (g > 0) {
        const rum = (rumLP.run(white()) * 3 + rumLP2.run(white()) * 2) * 0.42 * g;
        dl += rum; dr += rum;
      }
    }
    // --- the last hit reaching you: a roar into the white ---
    {
      const g = smooth(V_LAST + 0.1, V_REACH, v) * (1 - smooth(T_SWITCH - 0.25, T_SWITCH + 0.05, v));
      if (g > 0) {
        const w = white();
        const fc = 1900 - 1200 * smooth(V_REACH, T_SWITCH, v);
        const rv = (roarF[0].run(w, fc, 0.6).bp + roarF[1].run(w, fc * 0.45, 0.7).bp * 0.8 + roarSub.run(white()) * 3) * 0.34 * g;
        l += rv; r += roarF[2].run(w, fc * 1.1, 0.6).bp * 0.34 * g + roarSub.y * 3 * 0.34 * g; wet += rv * 0.3;
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
        const vv = (c.fA.run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * c.fB.run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    // --- the drone: a dark minor pad, from the start, swelling ---
    {
      const ch = chordAt(v);
      const dg = (0.024 + 0.03 * smooth(9, 15, v) + 0.06 * smooth(20, 42, v)) * (1 - smooth(T_SWITCH - 0.3, T_SWITCH + 0.1, v));
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
