// Procedural soundtrack for "What if gravity turned off for 5 seconds?", synced to src/timeline.js (video clock;
// the story runs 8x slow, so every sound from the square is slowed and deepened: slow motion).
//   node audio.mjs  -> out/soundtrack.wav
// Two layers:
//   the BED: a deep, slow drone that swells toward 0.00, the fountain's hiss slowed into a low rushing, the square's
//     voices as a slowed murmur, the air thinning (a pressure hiss that rises with the fog), all heard "through water";
//   the HITS: your scream and the crowd's, slowed (the owner's own clip at about half speed, low-passed, in a long
//     reverb) from frame 0; a deep tick every quarter story-second (2 s of video) and a boom at every whole second the
//     counter passes; a soft pressure "pop" when your ears go; the cars sliding past; at 0.00 the slam (the sound
//     snaps back toward real speed), then every landing: people's thuds, the cars' crashes, the pool's collapse, and
//     your splash into the white.
// The loop: under the white the run's own lead-in fades in, so the sound runs on across the seam. Soft onsets only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, tOf, vOf, T_ON, T_SPLASH, V_SPLASH, V_WHITE, V_ZERO, T_FOG } from './src/timeline.js';
import { CARS, carAt } from './src/traffic.js';
import { PEOPLE } from './src/people.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; }
}
class Reverb {
  constructor(seed, size = 1.6) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * size)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.3) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

function loadClip(name, ss = 0, t = 30) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-t', String(t), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1, n: f.length / 2 };
}
const at = (c, pos, ch) => { const i = Math.floor(pos), k = pos - i; if (i < 0 || i + 1 >= c.n) return 0; return c.f[i * 2 + ch] * (1 - k) + c.f[(i + 1) * 2 + ch] * k; };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const BL = new Float32Array(N), BR = new Float32Array(N);
  const idx = (v) => Math.round((v - T0) * SR);
  const R0 = rng(4040);
  const white = () => R0() * 2 - 1;
  const add = (v0, dur, fn) => { const a = Math.max(0, idx(v0)), b = Math.min(N, idx(v0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(v0)) / SR); L[n] += l; R[n] += r; } };
  const clip = (name, ss, len, v0, gain, rate, pan, lpHz, rev) => {
    const c = loadClip(name, ss, len + 0.3);
    if (!c) return;
    const g = gain / c.pk, n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    const f1 = new SVF(), f2 = new SVF();
    for (let i = 0; i < n2; i++) {
      const o = idx(v0) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, i / (SR * 0.02)) * Math.min(1, (n2 - i) / (SR * 0.25));
      const l = f1.run(at(c, i * rate, 0), lpHz, 0.9).lp, r = f2.run(at(c, i * rate, 1), lpHz, 0.9).lp;
      L[o] += l * g * fade * (1 - pan); R[o] += r * g * fade * (1 + pan);
      if (rev) { REV[o] += (l + r) * 0.5 * g * fade * rev; }
    }
  };
  const REV = new Float32Array(N);

  // ================= the bed =================
  {
    const droneF = [new SVF(), new SVF()], rushF = [new SVF(), new SVF()], airF = [new SVF(), new SVF()], murF = Array.from({ length: 5 }, () => new SVF()), murE = Array.from({ length: 5 }, () => new OnePole(1.2));
    let bL = 0, bR = 0, ph1 = 0, ph2 = 0, ph3 = 0;
    for (let n = 0; n < N; n++) {
      const v = T0 + n / SR, t = tOf(v);
      const off = t < T_ON ? 1 : 0, after = smooth(V_ZERO, V_ZERO + 0.5, v);
      bL = bL * 0.997 + white() * 0.05; bR = bR * 0.997 + white() * 0.05;
      let l = 0, r = 0;
      // the drone: two low tones a slow fifth apart, swelling toward 0.00
      const sw = 0.35 + 0.65 * smooth(0, V_ZERO, v);
      ph1 += (41 + 3 * smooth(0, V_ZERO, v)) / SR; ph2 += (61.5 + 4.5 * smooth(0, V_ZERO, v)) / SR; ph3 += 0.07 / SR;
      const dr = (Math.sin(TAU * ph1) * 0.55 + Math.sin(TAU * ph2) * 0.3 * (0.6 + 0.4 * Math.sin(TAU * ph3))) * sw * (1 - 0.7 * after);
      l += dr * 0.5; r += dr * 0.5;
      // the fountain, slowed: a deep rushing
      const rs = 0.6 * (1 - 0.6 * after);
      l += rushF[0].run(bL * 4, 220 + 60 * Math.sin(v * 0.3), 0.7).lp * rs; r += rushF[1].run(bR * 4, 240 + 60 * Math.sin(v * 0.27 + 1), 0.7).lp * rs;
      // the square's voices: a slowed murmur (formant-ish bands that open and close slowly)
      for (let j = 0; j < 5; j++) {
        const syl = 0.5 + 0.5 * Math.sin(v * (0.4 + j * 0.13) + j * 2 + Math.sin(v * (0.17 + j * 0.05)) * 2);
        const e = murE[j].run(syl > 0.6 ? 1 : 0), o = murF[j].run(white(), 160 + j * 70 + 40 * Math.sin(v * (0.3 + j * 0.1)), 4).bp * 0.05 * e * (1 - after);
        l += o * (j % 2 ? 0.5 : 1); r += o * (j % 2 ? 1 : 0.5);
      }
      // the air thinning: a pressure hiss rising with the fog
      const ak = smooth(vOf(2.5), vOf(T_ON), v) * (1 - after * 0.8);
      if (ak > 0) { const fc = 1200 + 2600 * ak; l += airF[0].run(white(), fc, 1.2).bp * 0.04 * ak; r += airF[1].run(white(), fc * 1.05, 1.2).bp * 0.04 * ak; }
      BL[n] = l; BR[n] = r;
    }
  }

  // ================= the hits =================
  // screams on frame 0, slowed and deep, in a long reverb (you, then the crowd round you)
  clip('scream.mp3', 0.0, 1.6, -0.35, 0.85, 0.5, 0, 2200, 0.5);
  clip('scream.mp3', 0.35, 1.2, 0.6, 0.35, 0.44, -0.5, 1600, 0.6);
  clip('scream.mp3', 0.15, 1.2, 1.3, 0.3, 0.56, 0.5, 1800, 0.6);
  clip('gasp.mp3', 0, 1.4, 4.2, 0.25, 0.5, 0.3, 1500, 0.5);
  clip('omg.mp3', 0, 1.8, 9.5, 0.28, 0.55, -0.3, 1700, 0.5);
  clip('scream.mp3', 0.5, 1.0, 19.6, 0.22, 0.5, -0.6, 1500, 0.6);
  // at 0.00 the screams again, nearer real speed (the slow motion "snaps" a little), as everyone drops
  clip('scream.mp3', 0.0, 1.3, V_ZERO + 0.25, 0.55, 0.72, 0.2, 3500, 0.4);
  clip('scream.mp3', 0.4, 1.0, V_ZERO + 1.1, 0.3, 0.66, -0.4, 3000, 0.4);
  // the countdown: a deep tick every quarter story-second, a boom at each whole second
  {
    const lp = new OnePole(120);
    for (let k = 0; k < 20; k++) {
      const tk = 0.25 * (k + 1); if (tk >= T_ON) break;
      const v0 = vOf(tk), whole = Math.abs(tk - Math.round(tk)) < 1e-6;
      const g = whole ? 0.9 : 0.22 + 0.2 * (tk / T_ON), f0 = whole ? 48 : 95;
      let ph = 0;
      add(v0, whole ? 3.5 : 0.9, (dt) => { ph += f0 * (1 + 0.6 * Math.exp(-dt * 6)) / SR; const o = Math.sin(TAU * ph) * env(dt, 0.008, whole ? 1.1 : 0.18) * g + lp.run(white()) * env(dt, 0.004, 0.08) * g * 1.2; return [o, o]; });
      if (whole) REV[idx(v0)] += 0.4;
    }
  }
  // your ears pop: the bed dips (handled in the mix) and a soft low pressure thump
  const V_POP = [14.6, 27.0];
  for (const vp of V_POP) { const f = new OnePole(60); add(vp, 1.2, (dt) => { const o = f.run(white()) * env(dt, 0.02, 0.25) * 3.0; return [o, o]; }); }
  // the cars sliding by when the street is in view (a slow, deep tyre-less whoosh)
  for (const c of CARS.filter((c) => c.drive)) {
    const f = new SVF(), o = {};
    for (let v = 17; v < 26; v += 1 / 60) {}
    add(17, 10, (dt) => {
      const v = 17 + dt; carAt(c, tOf(v), o);
      const d = Math.hypot(o.x - 3.8, o.z - 7.2), g = 0.5 / (1 + d / 6) * smooth(0, 1, dt) * smooth(10, 8.5, dt);
      const x = f.run(white(), 300 + 300 / (1 + d / 10), 1.5).bp * g;
      return [x * 0.8, x * 1.2];
    });
  }
  // 0.00: the slam (a deep hit, the drone cut), then a rising rush as everything drops
  {
    let ph = 0; const lp = new OnePole(90);
    add(V_ZERO, 5, (dt) => { ph += 34 * (1 + 0.8 * Math.exp(-dt * 5)) / SR; const o = Math.sin(TAU * ph) * env(dt, 0.006, 1.4) * 1.3 + lp.run(white()) * env(dt, 0.004, 0.35) * 2.5; return [o, o]; });
    REV[idx(V_ZERO)] += 0.8;
    const f = new SVF();
    add(V_ZERO + 0.4, V_SPLASH - V_ZERO, (dt) => { const k = dt / (V_SPLASH - V_ZERO - 0.4); const o = f.run(white(), 200 + 1500 * k * k, 0.9).bp * 0.45 * smooth(0, 0.3, k) * (0.4 + 0.6 * k); return [o, o]; });
  }
  // every landing: people (soft thuds, the nearest louder), the cars (a low metal crash), the pool's collapse
  const thud = (v0, g, pan, fc = 140) => { if (v0 > V_WHITE || g < 0.004) return; const f = new OnePole(fc), f2 = new OnePole(fc * 0.5); add(v0, 0.9, (dt) => { const o = (f.run(white()) * 2.5 + f2.run(white()) * 2) * env(dt, 0.004, 0.12) * g; return [o * (1 - pan), o * (1 + pan)]; }); };
  const crash = (v0, g, fc, d, pan) => { if (v0 > V_WHITE) return; const f = new SVF(), th = new OnePole(70); add(v0, d * 5, (dt) => { const o = f.run(white(), fc * (1 - 0.5 * Math.min(dt / d, 1)), 0.9).lp * env(dt, 0.004, d) * g + th.run(white()) * env(dt, 0.003, 0.15) * g * 3; return [o * (1 - pan), o * (1 + pan)]; }); };
  const st = {};
  let nThud = 0;
  for (const p of PEOPLE) {
    if (p.gone || p.kind === 'dunk') continue;
    const tl = p.y + p.u[1] * 5 > 0.2 ? (() => { const y5 = p.y + p.u[1] * 5 + 0.243, vy = p.u[1] + 0.097; return T_ON + (vy + Math.sqrt(vy * vy + 2 * 9.81 * y5)) / 9.81; })() : T_ON;
    const d = Math.hypot(p.x - 0.3, p.z - 8.5);
    if (d > 26) continue;
    thud(vOf(tl), 0.8 / (1 + d / 6), clamp((p.x - 0.3) / 15, -0.8, 0.8));
    nThud++;
  }
  let nCrash = 0;
  for (const c of CARS) { carAt(c, 9, st); const d = Math.hypot(st.x - 0.3, st.z - 8); crash(vOf(st.tl), 1.4 / (1 + d / 12), 700, 0.45, -0.6); nCrash++; }
  // the pool collapsing back into its box (a heavy slosh) and its water slopping over the glass
  { const f = new SVF(); add(vOf(T_ON + 0.5), 6, (dt) => { const o = f.run(white(), 300 + 500 * Math.exp(-dt), 0.8).lp * env(dt, 0.15, 1.5) * 1.2; return [o * 0.7, o * 1.1]; }); }
  // your splash: a deep plunge and the spray rushing over the lens into the white
  {
    let ph = 0; const lp = new OnePole(80), f = new SVF(), f2 = new SVF();
    add(V_SPLASH - 0.05, T_SWITCH - V_SPLASH + 1, (dt) => {
      ph += 55 * (1 + Math.exp(-dt * 4)) / SR;
      const boom = Math.sin(TAU * ph) * env(dt, 0.01, 0.9) * 1.1 + lp.run(white()) * env(dt, 0.005, 0.3) * 3;
      const spray = f.run(white(), 2500 - 1200 * Math.min(dt, 1), 0.7).bp * env(dt, 0.08, 1.2) * 0.5 + f2.run(white(), 600, 0.8).lp * env(dt, 0.05, 1.0) * 0.5;
      const o = boom + spray;
      return [o, o];
    });
    REV[idx(V_SPLASH)] += 0.6;
  }
  // the reverb tail of the slowed voices, booms and splash
  { const rl = new Reverb(31, 2.2), rr = new Reverb(32, 2.3); for (let n = 0; n < N; n++) { const x = REV[n]; L[n] += rl.run(x, 0.88, 0.45) * 0.55; R[n] += rr.run(x, 0.88, 0.45) * 0.55; } }

  // ================= the mix =================
  const rms = (A, B, a, b) => { let e = 0, c = 0; for (let n = idx(a); n < idx(b); n++) { e += A[n] * A[n] + B[n] * B[n]; c += 2; } return Math.sqrt(e / c); };
  const hitR = rms(L, R, 0, V_ZERO), bedR = rms(BL, BR, 0, V_ZERO);
  const gBed = (hitR / bedR) * Math.pow(10, -3 / 20);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  const popF = [new SVF(), new SVF()];
  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    // your ears popping: the whole sound muffles for a moment and comes back
    let muff = 0; for (const vp of V_POP) muff = Math.max(muff, smooth(vp - 0.6, vp, v) * (1 - smooth(vp + 0.2, vp + 1.6, v)));
    let l = L[n] + BL[n] * gBed, r = R[n] + BR[n] * gBed;
    if (muff > 0) { const fc = 7000 * Math.pow(300 / 7000, muff); l = popF[0].run(l, fc, 0.9).lp; r = popF[1].run(r, fc, 0.9).lp; } else { popF[0].run(l, 7000, 0.9); popF[1].run(r, 7000, 0.9); }
    ML[n] = l; MR[n] = r;
  }
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = ML[o0 + n], r = MR[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = Math.max(0, o0 + n - M);
      l = l * wo + ML[j] * wi; r = r * wo + MR[j] * wi;
    }
    OL[n] = l; OR[n] = r;
  }
  let e = 0; for (let n = 0; n < M; n++) e += OL[n] * OL[n] + OR[n] * OR[n];
  const gl = Math.pow(10, -17.3 / 20) / Math.sqrt(e / (2 * M));
  const ceil = Math.pow(10, -1 / 20), knee = 0.6;
  const lim = (x) => { const a = Math.abs(x); if (a <= knee) return x; return Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee))); };
  for (let n = 0; n < M; n++) {
    OL[n] = lim(OL[n] * gl); OR[n] = lim(OR[n] * gl);
    if (!Number.isFinite(OL[n]) || !Number.isFinite(OR[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
  }
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n], -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n], -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  console.log(`audio: ${nThud} landings, ${nCrash} cars, bed ${(20 * Math.log10(gBed * bedR / hitR)).toFixed(1)} dB under the hits`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
