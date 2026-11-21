// Procedural soundtrack for "What if gravity turned off for 5 seconds?", synced to src/timeline.js (video clock;
// the story runs in slow motion, so every sound from the square is slowed and deepened).
//   node audio.mjs  -> out/soundtrack.wav (prints the loudness of every second)
// Two layers:
//   the BED (kept loud: about -11 to -15 dB every second, like asteroid-sizes; the owner called -25 quiet):
//     the crowd screaming and shouting all the way up (the owner's clips, slowed to different pitches, many voices),
//     slow-motion wind (deep howling gusts), a rising tone that climbs and pulses faster toward 0.00 and cuts there,
//     the old drone / slowed fountain / pressure hiss under them; after 0.00 a fast falling rush and the screams back
//     near real speed;
//   the HITS, on top: your scream on frame 0, a boom at every whole second the counter passes (each bigger), the ear
//     pops, the cars sliding past; at 0.00 the slam (the loudest moment), then every landing: people, the cars, the kid
//     into the tree, the pool pouring off the roof, your splash, the fountain's jet crashing down into the white.
// The bed goes through a slow leveller to a target curve; the hits are scaled so the slam sits ~3 dB under full scale.
// The loop: under the white the run's own lead-in fades in, so the sound runs on across the seam. Soft onsets only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, tOf, vOf, T_ON, V_SPLASH, V_WHITE, V_ZERO, V_CRASH, T_KIDTREE } from './src/timeline.js';
import { CARS, carAt } from './src/traffic.js';
import { PEOPLE } from './src/people.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const dB = (x) => 20 * Math.log10(Math.max(x, 1e-9));
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
  const [BL, BR] = buf2();          // bed: drone, slowed fountain, murmur, pressure hiss
  const [WL, WR] = buf2();          // bed: slow-motion wind, then the falling rush
  const [ZL, ZR] = buf2();          // bed: the rising tone
  const [CL, CR] = buf2();          // bed: the crowd screaming
  const REV = new Float32Array(N), CREV = new Float32Array(N);
  const idx = (v) => Math.round((v - T0) * SR);
  const R0 = rng(4040);
  const white = () => R0() * 2 - 1;
  const add = (v0, dur, fn) => { const a = Math.max(0, idx(v0)), b = Math.min(N, idx(v0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(v0)) / SR); L[n] += l; R[n] += r; } };
  // a slice [ss, ss + len] of one of the owner's clips, played at rate (slower = deeper), into the given buffers
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
  const scale = (A, B, g) => { for (let n = 0; n < N; n++) { A[n] *= g; B[n] *= g; } };
  const normTo = (A, B, a, b, target) => { const r = rmsOf(A, B, a, b); if (r > 0) scale(A, B, Math.pow(10, target / 20) / r); };

  // ================= the bed =================
  {
    const rushF = [new SVF(), new SVF()], airF = [new SVF(), new SVF()], murF = Array.from({ length: 5 }, () => new SVF()), murE = Array.from({ length: 5 }, () => new OnePole(1.2));
    const windF = [new SVF(), new SVF(), new SVF(), new SVF()], fallF = [new SVF(), new SVF()], fallLP = [new OnePole(120), new OnePole(130)];
    const zF = [new SVF(), new SVF()];
    let bL = 0, bR = 0, ph1 = 0, ph2 = 0, ph3 = 0, z1 = 0, z2 = 0, z3 = 0, z4 = 0, tr = 0;
    for (let n = 0; n < N; n++) {
      const v = T0 + n / SR;
      const after = smooth(V_ZERO, V_ZERO + 0.5, v), kz = smooth(0, V_ZERO, v);
      bL = bL * 0.997 + white() * 0.05; bR = bR * 0.997 + white() * 0.05;
      let l = 0, r = 0;
      // the drone: two low tones a slow fifth apart, swelling toward 0.00
      const sw = 0.35 + 0.65 * kz;
      ph1 += (41 + 3 * kz) / SR; ph2 += (61.5 + 4.5 * kz) / SR; ph3 += 0.07 / SR;
      const dr = (Math.sin(TAU * ph1) * 0.55 + Math.sin(TAU * ph2) * 0.3 * (0.6 + 0.4 * Math.sin(TAU * ph3))) * sw * (1 - 0.7 * after);
      l += dr * 0.5; r += dr * 0.5;
      // the fountain, slowed: a deep rushing
      const rs = 0.6 * (1 - 0.6 * after);
      l += rushF[0].run(bL * 4, 220 + 60 * Math.sin(v * 0.3), 0.7).lp * rs; r += rushF[1].run(bR * 4, 240 + 60 * Math.sin(v * 0.27 + 1), 0.7).lp * rs;
      // the square's voices: a slowed murmur
      for (let j = 0; j < 5; j++) {
        const syl = 0.5 + 0.5 * Math.sin(v * (0.4 + j * 0.13) + j * 2 + Math.sin(v * (0.17 + j * 0.05)) * 2);
        const e = murE[j].run(syl > 0.6 ? 1 : 0), o = murF[j].run(white(), 160 + j * 70 + 40 * Math.sin(v * (0.3 + j * 0.1)), 4).bp * 0.05 * e * (1 - after);
        l += o * (j % 2 ? 0.5 : 1); r += o * (j % 2 ? 1 : 0.5);
      }
      // the air thinning: a pressure hiss rising toward 0.00
      const ak = smooth(vOf(2.5), vOf(T_ON), v) * (1 - after * 0.8);
      if (ak > 0) { const fc = 1200 + 2600 * ak; l += airF[0].run(white(), fc, 1.2).bp * 0.04 * ak; r += airF[1].run(white(), fc * 1.05, 1.2).bp * 0.04 * ak; }
      BL[n] = l; BR[n] = r;

      // slow-motion wind: deep howling gusts (two resonant bands that sweep slowly), stronger toward 0.00
      {
        const g1 = 0.55 + 0.45 * Math.sin(v * 0.45 + Math.sin(v * 0.21) * 2), g2 = 0.55 + 0.45 * Math.sin(v * 0.38 + 1.7 + Math.sin(v * 0.17) * 2);
        const fc = 160 + 130 * kz + 50 * Math.sin(v * 0.33), wb = (0.5 + 0.5 * kz) * (1 - after);
        const wl = (windF[0].run(white(), fc, 0.3).bp + windF[2].run(white(), fc * 2.6, 0.45).bp * 0.4) * g1 * wb;
        const wr = (windF[1].run(white(), fc * 1.13, 0.3).bp + windF[3].run(white(), fc * 2.9, 0.45).bp * 0.4) * g2 * wb;
        // after 0.00: everything falling, a fast rush of air (real speed: higher, steadier), till the white
        const fr = after * (1 - smooth(V_WHITE, V_WHITE + 1.0, v));
        const fl = (fallF[0].run(white(), 600 + 250 * Math.sin(v * 1.3), 0.6).bp + fallLP[0].run(white()) * 2.5) * fr;
        const frr = (fallF[1].run(white(), 680 + 250 * Math.sin(v * 1.1 + 1), 0.6).bp + fallLP[1].run(white()) * 2.5) * fr;
        WL[n] = wl + fl * 1.2; WR[n] = wr + frr * 1.2;
      }
      // the rising tone: three detuned saws an octave over a sub, climbing ~2.3 octaves to 0.00, opening up and pulsing
      // faster as it goes; cut at 0.00 (the slam takes over)
      {
        const k = clamp(v / V_ZERO, 0, 1), k2 = k * k;
        const f = 55 * Math.pow(2, 2.3 * Math.pow(k, 1.6));
        z1 += f / SR; z2 += f * 1.006 / SR; z3 += f * 0.994 / SR; z4 += f * 0.5 / SR; tr += (2 + 11 * k2) / SR;
        z1 -= Math.floor(z1); z2 -= Math.floor(z2); z3 -= Math.floor(z3); z4 -= Math.floor(z4); tr -= Math.floor(tr);
        const saw = (z1 * 2 - 1) + (z2 * 2 - 1) + (z3 * 2 - 1);
        const trem = 1 - 0.4 * smooth(0.55, 0.95, k) * (0.5 + 0.5 * Math.sin(TAU * tr));
        const a = (0.12 + 0.88 * k2 * k) * trem * (1 - smooth(V_ZERO - 0.04, V_ZERO, v));
        const fc = 260 + 2400 * k2;
        ZL[n] = (zF[0].run(saw, fc, 0.8).lp * 0.35 + Math.sin(TAU * z4) * 0.6) * a;
        ZR[n] = (zF[1].run(saw, fc * 1.04, 0.8).lp * 0.35 + Math.sin(TAU * z4) * 0.6) * a;
      }
    }
  }
  // the crowd: screams and shouts all the way up (slowed, so each voice comes out at its own deep pitch), then near
  // real speed and denser as everyone drops
  {
    const RC = rng(777);
    const pick = (late) => {
      const p = RC();
      if (p < 0.68) { const len = 0.7 + RC() * 0.9; return ['scream.mp3', RC() * (3.4 - len), len]; }
      if (p < 0.86) return ['omg.mp3', 0, 0.88];
      return ['gasp.mp3', 0, late ? 0.6 : 1.0];
    };
    let nc = 0;
    for (let v = 0.5; v < V_ZERO - 0.4; v += 0.5 + RC() * 0.65) {
      const [name, ss, len] = pick(false);
      clipInto(CL, CR, CREV, name, ss, len, v, 0.35 + RC() * 0.55, 0.5 + RC() * 0.3, RC() * 1.6 - 0.8, 1500 + RC() * 2000, 0.55); nc++;
    }
    for (let v = V_ZERO + 0.15; v < V_WHITE - 0.4; v += 0.3 + RC() * 0.45) {
      const [name, ss, len] = pick(true);
      clipInto(CL, CR, CREV, name, ss, len, v, 0.4 + RC() * 0.6, 0.78 + RC() * 0.24, RC() * 1.6 - 0.8, 2500 + RC() * 2500, 0.4); nc++;
    }
    const rl = new Reverb(41, 2.0), rr = new Reverb(42, 2.1);
    for (let n = 0; n < N; n++) { const x = CREV[n]; CL[n] += rl.run(x, 0.85, 0.4) * 0.6; CR[n] += rr.run(x, 0.85, 0.4) * 0.6; }
    console.log(`audio: ${nc} crowd voices`);
  }

  // ================= the hits =================
  // frame 0: your scream, close and only a little slowed; under it the deep slowed one (it starts in the loop's lead-in)
  clip('scream.mp3', 0.08, 1.9, 0.0, 1.0, 0.8, 0.1, 5000, 0.3);
  clip('scream.mp3', 0.0, 1.6, -0.35, 0.85, 0.5, 0, 2200, 0.5);
  clip('gasp.mp3', 0, 1.4, 4.2, 0.35, 0.5, 0.3, 1500, 0.5);
  clip('omg.mp3', 0, 1.8, 9.5, 0.4, 0.55, -0.3, 1700, 0.5);
  // at 0.00 the screams again, nearer real speed (the slow motion "snaps" a little), as everyone drops
  clip('scream.mp3', 0.0, 1.3, V_ZERO + 0.25, 0.7, 0.72, 0.2, 3500, 0.4);
  clip('scream.mp3', 0.4, 1.0, V_ZERO + 1.1, 0.45, 0.66, -0.4, 3000, 0.4);
  // the countdown: a deep tick every quarter story-second, a boom at each whole second, each bigger than the last
  {
    const lp = new OnePole(120);
    for (let k = 0; k < 20; k++) {
      const tk = 0.25 * (k + 1); if (tk >= T_ON) break;
      const v0 = vOf(tk), whole = Math.abs(tk - Math.round(tk)) < 1e-6;
      const g = whole ? 0.5 + 0.3 * tk : 0.08 + 0.16 * (tk / T_ON), f0 = whole ? 50 - 2 * tk : 95;
      let ph = 0;
      add(v0, whole ? 3.5 : 0.9, (dt) => { ph += f0 * (1 + 0.6 * Math.exp(-dt * 6)) / SR; const o = Math.sin(TAU * ph) * env(dt, 0.008, whole ? 1.1 : 0.18) * g + lp.run(white()) * env(dt, 0.004, 0.08) * g * 1.2; return [o, o]; });
      if (whole) REV[idx(v0)] += 0.15 + 0.1 * tk;
    }
  }
  // your ears pop: the sound muffles (in the mix) and a soft low pressure thump
  const V_POP = [21.6, 27.4];
  for (const vp of V_POP) { const f = new OnePole(60); add(vp, 1.2, (dt) => { const o = f.run(white()) * env(dt, 0.02, 0.25) * 2.4; return [o, o]; }); }
  // the cars sliding by when the street is in view (a slow, deep tyre-less whoosh)
  for (const c of CARS.filter((c) => c.drive)) {
    const f = new SVF(), o = {};
    add(14.5, 17, (dt) => {
      const v = 14.5 + dt; carAt(c, tOf(v), o);
      const d = Math.hypot(o.x - 3.0, o.z - 8.0), g = 0.6 / (1 + d / 6) * smooth(0, 1.5, dt) * (c.drifter ? 1 : smooth(8, 6, dt));
      const x = f.run(white(), 300 + 300 / (1 + d / 10), 1.5).bp * g;
      return [x * 0.8, x * 1.2];
    });
  }
  // 0.00: the slam (a deep hit), then a rising rush as everything drops
  {
    let ph = 0; const lp = new OnePole(90);
    const lp2 = new OnePole(300), cr = new SVF();
    add(V_ZERO - 0.02, 7, (dt) => {
      ph += 30 * (1 + 1.2 * Math.exp(-dt * 4)) / SR;
      const sub = Math.sin(TAU * ph) * env(dt, 0.005, 1.1) * 3.0;
      const body = lp.run(white()) * env(dt, 0.004, 0.45) * 6 + lp2.run(white()) * env(dt, 0.003, 0.25) * 2.2;
      const roar = cr.run(white(), 500 + 600 * Math.exp(-dt), 0.7).lp * env(dt, 0.02, 0.9) * 1.2;
      const o = sub + body + roar; return [o, o];
    });
    REV[idx(V_ZERO)] += 2.0;
    const f = new SVF();
    add(V_ZERO + 0.4, V_SPLASH - V_ZERO, (dt) => { const k = dt / (V_SPLASH - V_ZERO - 0.4); const o = f.run(white(), 200 + 1500 * k * k, 0.9).bp * 0.5 * smooth(0, 0.3, k) * (0.4 + 0.6 * k); return [o, o]; });
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
    thud(vOf(tl), 0.9 / (1 + d / 6), clamp((p.x - 0.3) / 15, -0.8, 0.8));
    nThud++;
  }
  let nCrash = 0;
  for (const c of CARS) { carAt(c, 9, st); const d = Math.hypot(st.x - 0.3, st.z - 8); crash(vOf(st.tl), (c.drifter ? 1.8 : 1.3) / (1 + d / 12), 700, 0.45, -0.6); nCrash++;
    if (c.drifter) { const f = new SVF(); add(vOf(st.tl), 4, (dt) => { const o = f.run(white(), 900 - 500 * Math.min(dt, 1), 0.8).lp * env(dt, 0.01, 0.9) * 2.0; return [o * 0.9, o * 1.1]; }); }
  }
  // the kid crashing into the tree: a rush of leaves and the crown's branches giving (soft cracks, no clicks)
  { const f = new SVF(), f2 = new SVF(), th = new OnePole(90); let ph = 0; add(vOf(T_KIDTREE) - 0.05, 4, (dt) => { const leaves = f.run(white(), 1800, 0.7).bp * env(dt, 0.03, 0.9) * 1.7; const br = f2.run(white() * (R0() < 0.004 ? 12 : 0.3), 600, 1.2).bp * env(dt, 0.02, 0.6) * 1.6; ph += 62 * (1 + Math.exp(-dt * 5)) / SR; const o = leaves + br + th.run(white()) * env(dt, 0.005, 0.25) * 9 + Math.sin(TAU * ph) * env(dt, 0.008, 0.55) * 1.4; return [o * 1.2, o * 0.8]; }); }
  // the waterfall off the roof: a pouring roar growing as it falls, a heavy splash on the square
  { const f = new SVF(), lpw = new OnePole(150); const v0 = vOf(T_ON + 0.6), v1 = vOf(T_ON + 2.75); add(v0, 12, (dt) => { const v = v0 + dt; const k = smooth(v0, v1, v) * (1 - smooth(V_WHITE, V_WHITE + 1.5, v)) + 0.6 * smooth(v1, v1 + 0.3, v) * (1 - smooth(V_WHITE, V_WHITE + 1.5, v)); const o = (f.run(white(), 700 + 900 * k, 0.6).bp * 2.2 + lpw.run(white()) * 4.2) * k; return [o * 0.9, o * 0.9]; }); }
  // the fountain's water coming down all round you, and its big jet crashing down on top of you into the white
  { const f = new SVF(), f2 = new SVF(), lp = new OnePole(70); const v0 = vOf(T_ON + 1.4); add(v0, T_SWITCH - v0 + 1, (dt) => { const v = v0 + dt; const rain = smooth(v0, V_CRASH, v) * 0.5; const cr = smooth(V_CRASH - 0.1, V_CRASH + 0.6, v); const o = f.run(white(), 3000, 0.5).bp * rain + (f2.run(white(), 900 + 1400 * cr, 0.7).lp * 1.8 + lp.run(white()) * 3.0) * cr * (1 - 0.6 * smooth(V_WHITE, T_SWITCH, v)); return [o, o]; }); REV[idx(V_CRASH)] += 1.2; }
  // the pool collapsing back into its box (a heavy slosh) and its water slopping over the glass
  { const f = new SVF(); add(vOf(T_ON + 0.5), 6, (dt) => { const o = f.run(white(), 300 + 500 * Math.exp(-dt), 0.8).lp * env(dt, 0.15, 1.5) * 1.0; return [o * 0.7, o * 1.1]; }); }
  // your splash: a deep plunge and the spray rushing over the lens
  {
    let ph = 0; const lp = new OnePole(80), f = new SVF(), f2 = new SVF();
    add(V_SPLASH - 0.05, 3.5, (dt) => {
      ph += 55 * (1 + Math.exp(-dt * 4)) / SR;
      const boom = Math.sin(TAU * ph) * env(dt, 0.01, 0.9) * 1.5 + lp.run(white()) * env(dt, 0.005, 0.3) * 3.6;
      const spray = f.run(white(), 2500 - 1200 * Math.min(dt, 1), 0.7).bp * env(dt, 0.08, 1.2) * 0.9 + f2.run(white(), 600, 0.8).lp * env(dt, 0.05, 1.0) * 0.9;
      const o = boom + spray;
      return [o, o];
    });
    REV[idx(V_SPLASH)] += 0.9;
  }
  // the reverb tail of the slowed voices, booms and splash
  { const rl = new Reverb(31, 2.2), rr = new Reverb(32, 2.3); for (let n = 0; n < N; n++) { const x = REV[n]; L[n] += rl.run(x, 0.88, 0.45) * 0.55; R[n] += rr.run(x, 0.88, 0.45) * 0.55; } }

  // ================= the mix =================
  // the bed's layers balanced against each other (dB, relative), then levelled to an absolute target every 1/4 s
  normTo(CL, CR, 0, V_ZERO, 0);                     // the crowd: the reference
  normTo(WL, WR, 0, V_ZERO, -2);                    // the wind (its falling rush after 0.00 scales with it)
  normTo(ZL, ZR, V_ZERO - 5, V_ZERO, 1);            // the rising tone, at its top (quiet early, it grows)
  normTo(BL, BR, 0, V_ZERO, -7);                    // the old drone / fountain / hiss underneath
  const [SL, SR_] = buf2();
  for (let n = 0; n < N; n++) { SL[n] = CL[n] + WL[n] + ZL[n] + BL[n]; SR_[n] = CR[n] + WR[n] + ZR[n] + BR[n]; }
  // the target bed level (dB RMS): -15 at frame 0 rising to -12 at 0.00; -16 while everything falls (so every landing
  // stands clear of it), back to -15 across the loop
  const target = (v) => (v < V_ZERO ? -15 + 3 * Math.pow(clamp(v / V_ZERO), 1.5) : -16 + smooth(V_WHITE, T_SWITCH + LOOP, v));
  const HOP = 0.25, gp = [];
  for (let v = T0; v <= VIDEO_DURATION + HOP; v += HOP) gp.push(Math.pow(10, target(v) / 20) / Math.max(rmsOf(SL, SR_, v - 0.6, v + 0.6), 1e-6));
  const gMed = [...gp].sort((a, b) => a - b)[gp.length >> 1];
  const gs = gp.map((g, i) => { const a = gp[Math.max(0, i - 1)], c = gp[Math.min(gp.length - 1, i + 1)]; return clamp(Math.cbrt(a * g * c), gMed / 4, gMed * 4); });
  for (let n = 0; n < N; n++) { const u = (n / SR) / HOP, i = Math.min(gs.length - 2, Math.floor(u)), k = u - i, g = gs[i] * (1 - k) + gs[i + 1] * k; SL[n] *= g; SR_[n] *= g; }
  // the hits: the slam's first second at -3 dB RMS
  const gH = Math.pow(10, -3 / 20) / rmsOf(L, R, V_ZERO, V_ZERO + 1);
  const ML = new Float32Array(N), MR = new Float32Array(N);
  const popF = [new SVF(), new SVF()];
  for (let n = 0; n < N; n++) {
    const v = T0 + n / SR;
    // your ears popping: the whole sound muffles for a moment and comes back
    let muff = 0; for (const vp of V_POP) muff = Math.max(muff, smooth(vp - 0.6, vp, v) * (1 - smooth(vp + 0.2, vp + 1.6, v)));
    let l = L[n] * gH + SL[n], r = R[n] * gH + SR_[n];
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
  // loudness of every second (dB RMS), for checking against the owner's targets
  const secs = [];
  for (let s = 0; s * SR < M; s++) { let e = 0, c = 0; for (let n = s * SR; n < Math.min(M, (s + 1) * SR); n++) { e += OL[n] * OL[n] + OR[n] * OR[n]; c += 2; } secs.push(`${String(s).padStart(2)}:${dB(Math.sqrt(e / c)).toFixed(1).padStart(6)}`); }
  for (let i = 0; i < secs.length; i += 10) console.log(secs.slice(i, i + 10).join('  '));
  console.log(`audio: ${nThud} landings, ${nCrash} cars`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
