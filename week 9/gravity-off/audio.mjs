// Procedural soundtrack for "What if gravity turned off?" (the time ladder), synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav (prints the loudness of every second)
// Every stop has the same shape, each one bigger than the last:
//   a rising tone from the stop's start to the moment gravity comes back -> a BOOM (bigger at every stop) -> the rush of
//   the fall (a whoosh that climbs) -> the HIT at the hand-over (under the white flash).
// Under it a loud bed (levelled to about -13 dB every second, like asteroid-sizes):
//   5 SECONDS: your scream on frame 0, the crowd screaming (the owner's clips at different pitches, many voices), the
//     fountain's hiss, city wind; then your splash, the drifting car's, the kid crashing into the tree.
//   1 MINUTE: thin whistling wind, the crowd's screams going thin and dull (the air is leaving), screams again in the
//     fall, the cars crashing onto the street.
//   10 MINUTES / 1 HOUR: no air, so a deep drone and a low rumble (a cinematic bed, the drone's root steps up each stop);
//     the oceans crashing back at the end of 1 HOUR.
//   1 DAY: the drone, then the Sun's roar swelling to the white (the loudest moment), the loop's lead-in under it.
// The loop: under the white the run's own lead-in fades in, so the sound runs on across the seam. Soft onsets only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, V_WHITE, STOPS, stopAt, setGravityBack, T_SPLASH, T_KIDTREE } from './src/timeline.js';
import { CARS, carAt } from './src/traffic.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const dB = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const saw = (p) => 2 * (p - Math.floor(p)) - 1;
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

function loadClip(name) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-t', '30', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1, n: f.length / 2 };
}
const CLIPS = {};
const getClip = (name) => (name in CLIPS ? CLIPS[name] : (CLIPS[name] = loadClip(name)));
const at = (c, pos, ch) => { const i = Math.floor(pos), k = pos - i; if (i < 0 || i + 1 >= c.n) return 0; return c.f[i * 2 + ch] * (1 - k) + c.f[(i + 1) * 2 + ch] * k; };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const buf2 = () => [new Float32Array(N), new Float32Array(N)];
  const [L, R] = buf2();            // the hits
  const [BL, BR] = buf2();          // the bed
  const [CL, CR] = buf2();          // the crowd (part of the bed)
  const REV = new Float32Array(N), CREV = new Float32Array(N);
  const idx = (v) => Math.round((v - T0) * SR);
  const R0 = rng(4040);
  const white = () => R0() * 2 - 1;
  const add = (v0, dur, fn) => { const a = Math.max(0, idx(v0)), b = Math.min(N, idx(v0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(v0)) / SR); L[n] += l; R[n] += r; } };
  const clipInto = (TL, TR, TREV, name, ss, len, v0, gain, rate, pan, lpHz, rev) => {
    const c = getClip(name);
    if (!c) return;
    const s0 = ss * SR, n2 = Math.floor(Math.max(0, Math.min(c.n - s0 - 2, len * SR)) / rate);
    const g = gain / c.pk, f1 = new SVF(), f2 = new SVF();
    for (let i = 0; i < n2; i++) {
      const o = idx(v0) + i;
      const fade = Math.min(1, i / (SR * 0.02)) * Math.min(1, (n2 - i) / (SR * 0.25));
      const l = f1.run(at(c, s0 + i * rate, 0), lpHz, 0.9).lp, r = f2.run(at(c, s0 + i * rate, 1), lpHz, 0.9).lp;
      if (o < 0 || o >= N) continue;
      TL[o] += l * g * fade * (1 - pan); TR[o] += r * g * fade * (1 + pan);
      if (rev) TREV[o] += (l + r) * 0.5 * g * fade * rev;
    }
  };
  const clip = (...a) => clipInto(L, R, REV, ...a);
  const rmsOf = (A, B, a, b) => { let e = 0, c = 0; const i0 = clamp(idx(a), 0, N), i1 = clamp(idx(b), 0, N); for (let n = i0; n < i1; n++) { e += A[n] * A[n] + B[n] * B[n]; c += 2; } return c ? Math.sqrt(e / c) : 0; };
  const ON = STOPS.map((s) => s.on), END = STOPS.map((s) => s.end), V0 = STOPS.map((s) => (s.i === 0 ? -LOOP : s.v0));

  // ================= the bed =================
  {
    const windF = [new SVF(), new SVF()], hissF = [new SVF(), new SVF()];
    const zF = [new SVF(), new SVF()], dF = [new OnePole(300), new OnePole(300)], rumF = [new OnePole(70), new OnePole(75)], fallF = [new SVF(), new SVF()], fallLP = [new OnePole(110), new OnePole(120)];
    const sunF = [new SVF(), new SVF()], sunLP = [new OnePole(60), new OnePole(64)];
    const ph = new Float64Array(16);
    for (let n = 0; n < N; n++) {
      const v = T0 + n / SR, i = stopAt(v);
      const on = ON[i], end = END[i], v0 = V0[i];
      const since = v - (i === 0 ? -10 : END[i - 1]);
      const fadeIn = i === 0 ? 1 : smooth(0, 0.12, since);
      let l = 0, r = 0;
      // city air (5 SECONDS; thin and whistling in 1 MINUTE)
      if (i <= 1) {
        const thin = i === 1 ? 1 : 0;
        const g1 = 0.6 + 0.4 * Math.sin(v * 0.5 + Math.sin(v * 0.23) * 2);
        const fc = thin ? 900 + 500 * Math.sin(v * 0.7) : 300 + 80 * Math.sin(v * 0.4);
        l += windF[0].run(white(), fc, thin ? 0.12 : 0.5).bp * (thin ? 0.35 : 0.6) * g1;
        r += windF[1].run(white(), fc * 1.1, thin ? 0.12 : 0.5).bp * (thin ? 0.35 : 0.6) * g1;
        if (!thin) { l += hissF[0].run(white(), 3200, 0.6).bp * 0.18; r += hissF[1].run(white(), 3400, 0.6).bp * 0.18; }
      }
      // the drone: a low chord whose root steps up each stop (louder in the airless stops)
      {
        const roots = [55, 58.27, 61.74, 65.41, 69.3];
        const f0 = roots[i] * (1 + 0.02 * smooth(on, end, v));
        const dg = (i <= 1 ? 0.16 : 0.42) * fadeIn;
        let a = 0, b = 0;
        [1, 1.5, 2.0, 2.52].forEach((m, q) => { ph[q] += f0 * m / SR; ph[4 + q] += f0 * m * 1.004 / SR; a += saw(ph[q]) / (q + 1); b += saw(ph[4 + q]) / (q + 1); });
        l += dF[0].run(a) * dg; r += dF[1].run(b) * dg;
        // a slow low rumble under it (space)
        if (i >= 2) { l += rumF[0].run(white()) * 2.2 * fadeIn; r += rumF[1].run(white()) * 2.2 * fadeIn; }
      }
      // the rising tone: from the stop's start to gravity coming back, climbing an octave, pulsing faster; cut there
      if (v < on) {
        const k = clamp((v - v0) / (on - v0)), k2 = k * k;
        const f = 110 * Math.pow(2, k * 1.0 + i * 0.12);
        ph[8] += f / SR; ph[9] += f * 1.007 / SR; ph[10] += f * 0.5 / SR; ph[11] += (2 + 10 * k2) / SR;
        const trem = 1 - 0.35 * smooth(0.5, 0.95, k) * (0.5 + 0.5 * Math.sin(TAU * ph[11]));
        const a = (0.1 + 0.9 * k2) * trem * (1 - smooth(on - 0.03, on, v)) * fadeIn * (0.8 + 0.1 * i);
        const fc = 300 + 2600 * k2;
        l += (zF[0].run(saw(ph[8]) + saw(ph[9]), fc, 0.7).lp * 0.3 + Math.sin(TAU * ph[10]) * 0.4) * a;
        r += (zF[1].run(saw(ph[8]) + saw(ph[9]), fc * 1.04, 0.7).lp * 0.3 + Math.sin(TAU * ph[10]) * 0.4) * a;
      }
      // the fall: a rush that climbs till the hit
      if (v >= on && i < 4) {
        const k = clamp((v - on) / (end - on));
        const g = (0.25 + 0.75 * k * k) * (1 - smooth(end - 0.02, end + 0.05, v));
        const fc = 250 + 1800 * k * k;
        l += (fallF[0].run(white(), fc, 0.6).bp * 1.2 + fallLP[0].run(white()) * 2.0) * g;
        r += (fallF[1].run(white(), fc * 1.08, 0.6).bp * 1.2 + fallLP[1].run(white()) * 2.0) * g;
      }
      // 1 DAY: the Sun blowing apart, a deep roar swelling to the white
      if (i === 4) {
        const k = smooth(31.75, V_WHITE, v), kk = Math.pow(k, 2.2);
        const fc = 120 + 900 * kk;
        l += (sunF[0].run(white(), fc, 0.5).lp * 1.0 + sunLP[0].run(white()) * 3.0) * (0.15 + 1.6 * kk);
        r += (sunF[1].run(white(), fc * 1.05, 0.5).lp * 1.0 + sunLP[1].run(white()) * 3.0) * (0.15 + 1.6 * kk);
      }
      BL[n] = l; BR[n] = r;
    }
  }
  // the crowd: screams and shouts (5 SECONDS at real speed; 1 MINUTE thinner and duller as the air goes, then louder in
  // the fall). The owner's clips at different rates = different voices.
  {
    const RC = rng(777);
    const pick = () => {
      const p = RC();
      if (p < 0.7) { const len = 0.6 + RC() * 0.9; return ['scream.mp3', RC() * (3.4 - len), len]; }
      if (p < 0.88) return ['omg.mp3', 0, 0.88];
      return ['gasp.mp3', 0, 1.0];
    };
    let nc = 0;
    for (let v = -LOOP; v < 6.8; v += 0.22 + RC() * 0.3) {
      const [name, ss, len] = pick();
      clipInto(CL, CR, CREV, name, ss, len, v, 0.3 + RC() * 0.5, 0.82 + RC() * 0.35, RC() * 1.6 - 0.8, 2500 + RC() * 3000, 0.35); nc++;
    }
    for (let v = 7.1; v < 14.7; v += 0.35 + RC() * 0.45) {
      const fallK = smooth(10.6, 11.2, v);
      const [name, ss, len] = pick();
      clipInto(CL, CR, CREV, name, ss, len, v, (0.18 + RC() * 0.3) * (1 + 1.2 * fallK), 0.85 + RC() * 0.3, RC() * 1.6 - 0.8, 1100 + RC() * 900 + 2000 * fallK, 0.5); nc++;
    }
    const rl = new Reverb(41, 2.0), rr = new Reverb(42, 2.1);
    for (let n = 0; n < N; n++) { const x = CREV[n]; CL[n] += rl.run(x, 0.85, 0.4) * 0.6; CR[n] += rr.run(x, 0.85, 0.4) * 0.6; }
    console.log(`audio: ${nc} crowd voices`);
  }

  // ================= the hits =================
  // frame 0: your scream, close and loud
  clip('scream.mp3', 0.08, 2.2, 0.0, 1.0, 0.95, 0.05, 6500, 0.25);
  // a big hit: sub drop + a brass-like chord + a noise body; k = size
  const boom = (v0, k, root = 55, deep = false) => {
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0, ps = 0;
    const lp = new SVF(), body = new OnePole(140), body2 = new OnePole(600);
    add(v0 - 0.01, 6, (d) => {
      const e = env(d, 0.02, (0.9 + 0.7 * k) * (deep ? 1.4 : 1)) * (1 - smooth(4.5, 6, d));
      const hf = root * (1 - 0.05 * Math.min(d, 1));
      p1 += hf / SR; p2 += hf * 1.006 / SR; p3 += hf * 2 / SR; p4 += hf * 3.01 / SR;
      const br = lp.run(saw(p1) + saw(p2) + 0.5 * saw(p3) + 0.25 * saw(p4), 900 + 600 * k, 0.6).lp * 0.22 * e;
      ps += (26 + 44 * Math.exp(-d * 5)) / SR;
      const sub = Math.sin(TAU * ps) * env(d, 0.008, 0.9 + 0.5 * k) * 1.4;
      const nz = body.run(white()) * env(d, 0.004, 0.35) * 5 + body2.run(white()) * env(d, 0.003, 0.15) * 1.6;
      const o = (br + sub + nz) * k;
      return [o, o];
    });
    REV[idx(v0)] += 1.2 * k;
  };
  // gravity back at every stop: each boom bigger than the last
  const KON = [0.55, 0.7, 0.85, 1.0, 1.25];
  STOPS.forEach((S, i) => boom(S.on, KON[i], [49, 52, 55, 58.3, 41.2][i], i >= 2));
  // the white: the Sun's glare reaching you, the biggest hit of all
  boom(V_WHITE - 0.35, 1.45, 36.7, true);
  // the hit at every hand-over (under the flash), bigger each time
  const KEND = [0.6, 0.8, 0.95, 1.1];
  for (let i = 0; i < 4; i++) {
    const e = STOPS[i].end;
    boom(e - 0.03, KEND[i], [46, 49, 52, 55][i], true);
    const f = new SVF();
    add(e - 0.05, 2.5, (d) => { const o = f.run(white(), 1800 - 1200 * Math.min(d, 1), 0.7).lp * env(d, 0.01, 0.5) * 1.2 * KEND[i]; return [o, o]; });
  }
  // 5 SECONDS: the drifting car's splash, your splash into the fountain, the kid crashing into the tree
  {
    const vOf0 = (t) => t - 0.38;
    setGravityBack(5);
    const drifter = CARS.find((c) => c.drifter), st = {};
    carAt(drifter, 9, st);
    const splashHit = (v0, g) => {
      let ph = 0; const lp = new OnePole(80), f = new SVF(), f2 = new SVF();
      add(v0 - 0.03, 2.5, (d) => {
        ph += 55 * (1 + Math.exp(-d * 4)) / SR;
        const b = Math.sin(TAU * ph) * env(d, 0.01, 0.7) * 1.2 + lp.run(white()) * env(d, 0.005, 0.25) * 3.0;
        const spray = f.run(white(), 2500 - 1200 * Math.min(d, 1), 0.7).bp * env(d, 0.06, 0.8) * 0.9 + f2.run(white(), 600, 0.8).lp * env(d, 0.04, 0.7) * 0.8;
        const o = (b + spray) * g; return [o, o];
      });
      REV[idx(v0)] += 0.5 * g;
    };
    if (st.tl < 7.4) splashHit(vOf0(st.tl), 0.6);
    splashHit(vOf0(T_SPLASH), 0.75);
    const f = new SVF(), f2 = new SVF(), th = new OnePole(90);
    let ph = 0;
    add(vOf0(T_KIDTREE) - 0.05, 2.5, (d) => {
      ph += 62 * (1 + Math.exp(-d * 5)) / SR;
      const leaves = f.run(white(), 1800, 0.7).bp * env(d, 0.03, 0.7) * 1.4;
      const br = f2.run(white() * (R0() < 0.004 ? 12 : 0.3), 600, 1.2).bp * env(d, 0.02, 0.5) * 1.4;
      const o = (leaves + br + th.run(white()) * env(d, 0.005, 0.25) * 7 + Math.sin(TAU * ph) * env(d, 0.008, 0.45) * 1.1) * 0.6;
      return [o * 1.2, o * 0.8];
    });
  }
  // 1 MINUTE: the cars hitting the street (the ones that land before the hand-over)
  {
    setGravityBack(60);
    const st = {};
    let nCar = 0;
    for (const c of CARS) {
      carAt(c, 70, st);
      const v = 10.6 + (st.tl - 60);
      if (!(v < STOPS[1].end - 0.05) || v < 10.6) continue;
      const g = 0.5 + 0.3 * R0(), f = new SVF(), th = new OnePole(70), pan = R0() * 1.2 - 0.6;
      add(v, 2.0, (d) => { const o = (f.run(white(), 900 * (1 - 0.5 * Math.min(d / 0.4, 1)), 0.9).lp * env(d, 0.004, 0.4) * 2.2 + th.run(white()) * env(d, 0.003, 0.15) * 6) * g; return [o * (1 - pan), o * (1 + pan)]; });
      nCar++;
    }
    setGravityBack(5);
    console.log(`audio: ${nCar} cars hit the street`);
  }
  // 1 HOUR: the oceans crashing back onto the sea floor (a roar building to the hand-over)
  {
    const f = new SVF(), lp = new OnePole(90), e = STOPS[3].end;
    add(e - 2.2, 2.8, (d) => { const k = smooth(0, 2.2, d) * (1 - smooth(2.25, 2.8, d)); const o = (f.run(white(), 500 + 1500 * k, 0.6).bp * 1.5 + lp.run(white()) * 3.5) * k * k; return [o, o]; });
  }
  // the reverb tail of the hits
  { const rl = new Reverb(31, 2.2), rr = new Reverb(32, 2.3); for (let n = 0; n < N; n++) { const x = REV[n]; L[n] += rl.run(x, 0.88, 0.45) * 0.5; R[n] += rr.run(x, 0.88, 0.45) * 0.5; } }

  // ================= the mix =================
  // the bed (crowd + the rest) levelled every 1/4 s to its target: about -13 dB, -14.5 in the airless stops, swelling to
  // -10 under the Sun's roar
  const [SL, SR_] = buf2();
  const cr = rmsOf(CL, CR, 0, 14.8), br = rmsOf(BL, BR, 0, 14.8);
  const gc = br / Math.max(cr, 1e-9) * 1.4;
  for (let n = 0; n < N; n++) { SL[n] = BL[n] + CL[n] * gc; SR_[n] = BR[n] + CR[n] * gc; }
  const target = (v) => { const i = stopAt(v); if (i <= 1) return -13; if (i < 4) return -14.5; return -14 + 8 * smooth(41, V_WHITE, v); };
  const HOP = 0.25, gp = [];
  for (let v = T0; v <= VIDEO_DURATION + HOP; v += HOP) gp.push(Math.pow(10, target(v) / 20) / Math.max(rmsOf(SL, SR_, v - 0.5, v + 0.5), 1e-6));
  const gMed = [...gp].sort((a, b) => a - b)[gp.length >> 1];
  const gs = gp.map((g, i) => { const a = gp[Math.max(0, i - 1)], c = gp[Math.min(gp.length - 1, i + 1)]; return clamp(Math.cbrt(a * g * c), gMed / 4, gMed * 4); });
  for (let n = 0; n < N; n++) { const u = (n / SR) / HOP, i = Math.min(gs.length - 2, Math.floor(u)), k = u - i, g = gs[i] * (1 - k) + gs[i + 1] * k; SL[n] *= g; SR_[n] *= g; }
  // the hits: the last stop's boom (gravity back after a day) at -4 dB RMS over its first second
  const gH = Math.pow(10, -4 / 20) / rmsOf(L, R, STOPS[4].on, STOPS[4].on + 1);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  for (let n = 0; n < N; n++) { ML[n] = L[n] * gH + SL[n]; MR[n] = R[n] * gH + SR_[n]; }
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
  // a soft limiter: nothing over -1 dB
  const ceil = Math.pow(10, -1 / 20), knee = 0.6;
  const lim = (x) => { const a = Math.abs(x); if (a <= knee) return x; return Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee))); };
  for (let n = 0; n < M; n++) {
    OL[n] = lim(OL[n]); OR[n] = lim(OR[n]);
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
  const secs = [];
  for (let s = 0; s * SR < M; s++) { let e = 0, c = 0; for (let n = s * SR; n < Math.min(M, (s + 1) * SR); n++) { e += OL[n] * OL[n] + OR[n] * OR[n]; c += 2; } secs.push(`${String(s).padStart(2)}:${dB(Math.sqrt(e / c)).toFixed(1).padStart(6)}`); }
  for (let i = 0; i < secs.length; i += 10) console.log(secs.slice(i, i + 10).join('  '));
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
