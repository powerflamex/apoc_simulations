// Procedural soundtrack for "What if you were 1 trillion times heavier?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a busy street at midday (traffic hum, voices, a horn); the bench creaking under you, then the wood
// snapping (V_SNAP) and a gasp from the people round you; the sidewalk cracking and caving in (V_CRACK), a shout;
// the crash through the station roof (V_PUNCH), the fall, a huge thud on the track bed (V_LAND) and a scream echoing
// in the station's hum; the floor groaning, then giving way (V_SINK). In the rock: a grinding roar that rises with your
// speed, a deep hit on every step of your weight, a sub-bass swell when your own gravity takes hold (V_GRAV), the
// rattle of gravel circling you, a monstrous crunch at x1 trillion (V_MTN), the roar going hollow and huge through the
// time-lapse, a rising wash into the white. The loop: under the white the street starts again, so the sound runs on
// across the seam. Every onset is soft (5 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, HITS, V_SNAP, V_CRACK, V_PUNCH, V_LAND, V_SINK, V_GRAV, V_ORBIT, V_WALLS, V_MTN, V_LAPSE, V_CORE, V_FLASH, speedAt, rateAt, depthStreet, D_SEWER, D_CAVE, D_KOLA } from './src/timeline.js';
import { MINE, CAVE } from './src/layers.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
class SVF {
  constructor() { this.l = 0; this.b = 0; }
  run(x, fc, q) { const f = 2 * Math.sin(Math.PI * Math.min(Math.max(fc, 20), SR / 8) / SR); this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return { lp: this.l, bp: this.b, hp: h }; }
}
class Reverb {
  constructor(seed) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.6)), i: 0, lp: 0 }));
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

function loadClip(name, ss, t) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-t', String(t), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1 };
}

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;
  // the hits: a deep boom on each step of your weight, bigger each time
  const BEATS = HITS.map((t, n) => ({ t, k: 0.35 + 0.06 * n, f: 58 * Math.pow(2, -n / 14) }));
  // crashes: noise bursts with a crunch (t, gain, brightness, decay)
  const CRASH = [
    [V_SNAP, 0.55, 2600, 0.12], [V_SNAP + 0.05, 0.3, 1800, 0.2],
    [V_CRACK, 0.75, 1400, 0.35], [V_CRACK + 0.12, 0.4, 900, 0.5],
    [V_PUNCH - 0.08, 0.9, 1100, 0.5], [V_PUNCH + 0.3, 0.6, 1500, 0.4],
    [V_LAND, 1.2, 700, 0.8], [V_LAND + 0.05, 0.6, 2400, 0.25],
    [V_SINK - 0.15, 0.9, 900, 0.6], [V_SINK + 0.1, 0.6, 600, 0.9],
    [V_MTN, 1.3, 800, 1.2], [V_MTN + 0.1, 0.7, 2000, 0.6],
  ].map(([t, g, fc, d]) => ({ t, g, fc, d, f: new SVF() }));
  // splinters and pebbles: little ticks after the bench and the slab break, and when you land
  // when your feet pass a depth (m below the street)
  const passAt = (D) => { let lo = V_SINK, hi = 45; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (depthStreet(m) < D) lo = m; else hi = m; } return lo; };
  const V_SPLASH1 = passAt(D_SEWER - 0.8), V_LAKE = passAt(D_CAVE + CAVE.b * 0.62), V_BIT = passAt(D_KOLA);
  // splashes: the sewer's water, the cave's lake (a big one); a whoosh past each mine tunnel; a clang at the drill pipe's end
  const SPL = [[V_SPLASH1, 0.45, 0.5], [V_LAKE, 0.9, 1.1]].map(([t, g, d]) => ({ t, g, d, f: new SVF(), f2: new SVF() }));
  const WHO = MINE.flatMap((m) => [m, ...(m.a2 !== null ? [m] : [])]).map((m) => ({ t: passAt(m.D), f: new SVF() }));
  const CLANG = { t: V_BIT, ph: [0, 0, 0] };
  console.log(`audio: sewer ${V_SPLASH1.toFixed(2)} s, lake ${V_LAKE.toFixed(2)} s, Kola bit ${V_BIT.toFixed(2)} s, ${WHO.length} tunnels`);
  const TICKS = [];
  for (const [t0, n, span] of [[V_SNAP + 0.1, 14, 0.6], [V_CRACK + 0.15, 22, 1.2], [V_PUNCH + 0.4, 26, 1.0], [V_LAND + 0.1, 24, 1.4]]) for (let i = 0; i < n; i++) TICKS.push({ t: t0 + Math.pow(R0(), 1.5) * span, g: 0.04 + 0.06 * R0(), fc: 1500 + 3000 * R0(), pan: R0() * 1.6 - 0.8, f: new SVF() });
  const HORNS = [{ t: -0.5, f: 420, d: 0.3 }, { t: 2.6, f: 380, d: 0.5 }, { t: 4.4, f: 440, d: 0.25 }].map((h) => ({ ...h, ph: 0, lp: new OnePole(1500) }));
  const cityLP = new OnePole(240), cityLP2 = new OnePole(300);
  const talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
  const creakF = new SVF(), humF = new SVF(), roarF = [new SVF(), new SVF()], grindF = new SVF(), rattleF = new SVF(), washF = new SVF(), whooshF = new SVF();
  const subLP = new OnePole(70), boomLP = new OnePole(90), rumbleLP = new OnePole(60);
  const revL = new Reverb(21), revR = new Reverb(22);
  const ph = new Float64Array(16);
  let brownL = 0, brownR = 0, crE = 0;
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    // (the loop: past T_SWITCH the street comes back under the white)
    const tv = t;
    let l = 0, r = 0, wet = 0;
    brownL = brownL * 0.995 + white() * 0.05; brownR = brownR * 0.995 + white() * 0.05;
    const street = 1 - smooth(V_PUNCH - 0.2, V_PUNCH + 0.4, tv);
    const station = smooth(V_PUNCH, V_PUNCH + 0.5, tv) * (1 - smooth(V_SINK, V_SINK + 1.5, tv));
    const bore = smooth(V_SINK - 0.1, V_SINK + 0.6, tv);
    // ---- the street: traffic hum, voices, footsteps of noise ----
    if (street > 0) {
      const hum = cityLP.run(brownL) * 2.2 + cityLP2.run(white()) * 0.02;
      l += hum * 0.12 * street; r += hum * 0.12 * street;
      for (let k = 0; k < 6; k++) {
        const syl = 0.5 + 0.5 * Math.sin(tv * (3.1 + k * 0.7) + k * 2 + Math.sin(tv * (1.3 + k * 0.3)) * 2);
        const e = talkE[k].run(syl > 0.65 ? 1 : 0);
        const o = talkF[k].run(white(), 500 + k * 180 + 250 * Math.sin(tv * (2 + k)), 3).bp;
        const g = 0.03 * e * street * (1 - 0.6 * smooth(V_SNAP, V_SNAP + 0.4, tv));
        l += o * g * (k % 2 ? 0.6 : 1); r += o * g * (k % 2 ? 1 : 0.6);
      }
      for (const h of HORNS) { const dt = tv - h.t; if (dt < 0 || dt > h.d + 0.1) continue; h.ph += h.f / SR; const a = Math.min(dt / 0.02, 1) * Math.min(1, (h.d - dt) / 0.05 + 1e-9); const o = h.lp.run((h.ph % 1) * 2 - 1 + ((h.ph * 1.26) % 1) - 0.5) * 0.03 * Math.max(0, a) * street; l += o * 0.7; r += o; }
      // the bench creaking before it goes (a slow, groaning wood squeal)
      if (tv < V_SNAP + 0.02 && tv > -1) {
        const c = creakF.run(white(), 380 + 140 * Math.sin(tv * 9) + 80 * Math.sin(tv * 23), 8).bp * 0.5;
        const k = smooth(-1, V_SNAP, tv) * (0.5 + 0.5 * Math.sin(tv * 5.7));
        l += c * 0.16 * k; r += c * 0.16 * k;
      }
    }
    // ---- the station: fluorescent hum, the floor groaning under you ----
    if (station > 0) {
      ph[0] += 120 / SR; ph[1] += 240 / SR;
      const hm = (Math.sin(TAU * ph[0]) * 0.6 + Math.sin(TAU * ph[1]) * 0.3) * 0.012 + humF.run(white(), 200, 4).bp * 0.02;
      l += hm * station; r += hm * station;
      const gr = grindF.run(white(), 120 + 60 * Math.sin(tv * 3), 6).bp * smooth(V_LAND + 0.5, V_SINK, tv) * (0.6 + 0.4 * Math.sin(tv * 7));
      l += gr * 0.5 * station; r += gr * 0.5 * station;
      wet += (l + r) * 0.1;
    }
    // the fall into the station: a short whoosh
    { const dt = tv - V_PUNCH; if (dt > 0 && dt < 1.1) { const o = whooshF.run(white(), 400 + 1200 * dt, 1.5).bp * Math.sin(Math.PI * dt / 1.1) * 0.3; l += o; r += o; } }
    // ---- the rock: a roar that rises with your speed; deep rumble; the gravel rattling round you ----
    if (bore > 0) {
      const sp = tv > V_SINK ? speedAt(tv) * Math.min(rateAt(tv), 30) : 0;
      const k = clamp(Math.log10(1 + sp / 5) / 3.2, 0, 1);
      const fc = 140 + 1400 * k;
      const a = roarF[0].run(brownL * 3 + white() * 0.3, fc, 1.2).lp, b = roarF[1].run(brownR * 3 + white() * 0.3, fc * 1.1, 1.2).lp;
      const g = (0.05 + 0.16 * k) * bore;
      l += a * g; r += b * g;
      const rum = rumbleLP.run(brownL) * 1.6 * (0.4 + 0.6 * k) * bore;
      l += rum; r += rum;
      // the gravel circling you: a fast stony rattle that grows with the orbits
      const rat = smooth(V_GRAV + 0.5, V_ORBIT + 1, tv) * (1 - smooth(V_MTN + 1, V_MTN + 3, tv));
      if (rat > 0) {
        const tr = (Math.sin(tv * 47) * Math.sin(tv * 31.7 + 1) > 0.6 ? 1 : 0.15) * rat;
        const o = rattleF.run(white(), 2400, 2).bp * tr * 0.08;
        l += o * (0.6 + 0.4 * Math.sin(tv * 6)); r += o * (0.6 - 0.4 * Math.sin(tv * 6));
      }
      // your own gravity: a deep sub swell
      const sw = smooth(V_GRAV - 0.2, V_GRAV + 2.5, tv) * (0.6 + 0.4 * smooth(V_MTN - 1, V_MTN + 1, tv));
      ph[2] += (34 + 4 * smooth(V_GRAV, V_CORE, tv)) / SR;
      const sub = Math.sin(TAU * ph[2]) * 0.12 * sw * (1 - smooth(V_FLASH, T_SWITCH, tv));
      l += sub; r += sub;
      // the time-lapse: everything hollow and huge, with a rising wash into the white
      const wa = smooth(V_LAPSE, V_CORE, tv) * 0.6 + smooth(V_CORE + 1, T_SWITCH - 0.1, tv) * 0.9;
      if (wa > 0) { const o = washF.run(white(), 300 + 3500 * smooth(V_LAPSE, T_SWITCH, tv), 1.4).bp * wa * 0.3 * (1 - smooth(T_SWITCH - 0.15, T_SWITCH + 0.2, tv)); l += o; r += o; }
      wet += (l + r) * 0.05 * bore;
    }
    // ---- crashes, ticks, hits ----
    for (const c of CRASH) {
      const dt = tv - c.t;
      if (dt < 0 || dt > c.d * 6) continue;
      const e = env(dt, 0.004, c.d);
      const o = c.f.run(white(), c.fc * (1 - 0.5 * Math.min(dt / c.d, 1)), 0.9).lp * e * c.g;
      l += o; r += o; wet += o * 0.6;
    }
    for (const k of TICKS) {
      const dt = tv - k.t; if (dt < 0 || dt > 0.08) continue;
      const o = k.f.run(white(), k.fc, 0.6).bp * env(dt, 0.0015, 0.012) * k.g * 6;
      l += o * (1 - k.pan) * 0.6; r += o * (1 + k.pan) * 0.6;
    }
    for (const sp of SPL) {
      const dt = tv - sp.t; if (dt < -0.02 || dt > sp.d * 5) continue;
      const e = env(dt, 0.006, sp.d);
      const o = sp.f.run(white(), 900 + 1600 * Math.exp(-dt * 3), 1.2).bp * e * sp.g + sp.f2.run(white(), 180, 1.0).lp * env(dt, 0.004, 0.15) * sp.g * 1.6;
      l += o; r += o; wet += o * 0.5;
    }
    for (const w of WHO) {
      const dt = tv - w.t; if (Math.abs(dt) > 0.25) continue;
      const o = w.f.run(white(), 600 + 900 * Math.exp(-dt * dt * 200), 1.5).bp * Math.exp(-dt * dt * 120) * 0.22;
      l += o * (1 + Math.sin(w.t * 7) * 0.5); r += o * (1 - Math.sin(w.t * 7) * 0.5);
    }
    { const dt = tv - CLANG.t; if (dt > 0 && dt < 2.5) { let o = 0; [523, 1187, 2011].forEach((f, k) => { CLANG.ph[k] += f / SR; o += Math.sin(TAU * CLANG.ph[k]) * env(dt, 0.002, 0.5 / (k + 1)); }); l += o * 0.08; r += o * 0.08; wet += o * 0.05; } }
    for (const b of BEATS) {
      const dt = tv - b.t; if (dt < -0.01 || dt > 3) continue;
      const f = b.f * (1 + 0.6 * Math.exp(-dt * 10));
      const o = Math.sin(TAU * f * Math.max(dt, 0) - 4 * Math.exp(-dt * 10)) * env(dt, 0.005, 0.7) * b.k * 0.9;
      const bl = boomLP.run(white()) * env(dt, 0.003, 0.25) * b.k * 2;
      l += o + bl; r += o + bl; wet += o * 0.3;
    }
    // ---- reverb (the station echoes more) ----
    const rv = revL.run(wet * (0.6 + 1.4 * station), 0.84), rv2 = revR.run(wet * (0.6 + 1.4 * station), 0.84);
    l += rv * 0.5; r += rv2 * 0.5;
    L[n] = l; R[n] = r;
  }
  // the people: a gasp when the bench goes, "oh my god" at the cracks, a scream when you land in the station
  for (const [name, ss, len, at, gain, room] of [['gasp.mp3', 0, 1.6, V_SNAP + 0.3, 0.32, 0], ['omg.mp3', 0, 1.8, V_CRACK + 0.25, 0.35, 0], ['scream.mp3', 0.55, 2.4, V_LAND + 0.25, 0.4, 1]]) {
    const c = loadClip(name, ss, len);
    if (!c) continue;
    const o0 = Math.round((at - T0) * SR), g = gain / c.pk;
    const n2 = c.f.length / 2;
    for (let i = 0; i < n2 && o0 + i < N; i++) {
      const fade = Math.min(1, i / (SR * 0.005)) * Math.min(1, (n2 - i) / (SR * 0.05));
      L[o0 + i] += c.f[i * 2] * g * fade; R[o0 + i] += c.f[i * 2 + 1] * g * fade;
      // (a little echo in the station)
      if (room && o0 + i + 9000 < N) { L[o0 + i + 9000] += c.f[i * 2] * g * fade * 0.25; R[o0 + i + 7000] += c.f[i * 2 + 1] * g * fade * 0.25; }
    }
  }
  // the video's track: [0, T_SWITCH) as made; from T_SWITCH on it fades over into the run's own lead-in to frame 0
  const M = Math.round(VIDEO_DURATION * SR), o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
  const OL = new Float32Array(M), OR = new Float32Array(M);
  for (let n = 0; n < M; n++) {
    let l = L[o0 + n], r = R[o0 + n];
    if (n >= sw) {
      const k = Math.min(1, (n - sw) / xf), wi = Math.sin(k * Math.PI / 2), wo = Math.cos(k * Math.PI / 2);
      const j = o0 + n - M;
      l = l * wo + L[j] * wi; r = r * wo + R[j] * wi;
    }
    OL[n] = l; OR[n] = r;
  }
  let peak = 0;
  for (let n = 0; n < M; n++) {
    OL[n] = Math.tanh(OL[n] * 1.4); OR[n] = Math.tanh(OR[n] * 1.4);
    if (!Number.isFinite(OL[n]) || !Number.isFinite(OR[n])) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    peak = Math.max(peak, Math.abs(OL[n]), Math.abs(OR[n]));
  }
  const gn = 0.89 / peak;
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n] * gn, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n] * gn, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
