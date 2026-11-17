// Procedural soundtrack for "What if you screamed 1 trillion times louder?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: YOUR SCREAM, a real recorded scream (sounds/scream.mp3) whose attack lands right on frame 0, held for
// the whole video (grains of its steady middle, overlapped) and growing heavier as its power grows: more drive, an
// octave-down layer, a roar under it. Around it: the street (traffic, voices) that falls silent; the crowd's gasp;
// a deep boom on every step; glass shattering where and when each window breaks (glass.js: the near panes loud, the
// far ones a rain of tinkles); car alarms from 1,000,000x; people screaming as they're thrown; from the shock wave on a
// roaring wind; the rumble and crunch of every chunk of building that breaks away (city.js); a rising wash into the
// white. The loop: under the white the run's own lead-in (the scream's attack) fades in, so the sound runs on across
// the seam. Every onset is soft (2 ms+): no clacks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, HITS, BEATS, logMult, V_FILL, V_FLASH, V_RING, V_BACK, V_WHITE } from './src/timeline.js';
import { MOUTH, CAM } from './src/layout.js';
import { SOURCES } from './src/glass.js';
import { CHUNKS, TOWERS } from './src/city.js';
import { CARS } from './src/traffic.js';
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

function loadClip(name, ss = 0, t = 30) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-t', String(t), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1, n: f.length / 2 };
}
// read a clip at a fractional sample position (linear), channel ch
const at = (c, pos, ch) => { const i = Math.floor(pos), k = pos - i; if (i < 0 || i + 1 >= c.n) return 0; return c.f[i * 2 + ch] * (1 - k) + c.f[(i + 1) * 2 + ch] * k; };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const idx = (t) => Math.round((t - T0) * SR);
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;

  // ================= your scream =================
  const scr = loadClip('scream.mp3');
  const S_ON = -0.12;                      // the clip starts here: its attack peaks just after frame 0
  if (scr) {
    const g0 = 0.42 / scr.pk;
    const voice = new Float32Array(N * 2), sub = new Float32Array(N);
    // the clip itself, from its start to 3.3 s in
    for (let i = 0; i < scr.n && i < 3.3 * SR; i++) {
      const o = idx(S_ON) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, (3.3 * SR - i) / (0.3 * SR));
      voice[o * 2] += scr.f[i * 2] * fade; voice[o * 2 + 1] += scr.f[i * 2 + 1] * fade;
    }
    // then grains of its steady middle (0.45-3.25 s), 0.6 s long, every 0.3 s, Hann windows (they sum flat)
    const GR = rng(31), GL = 0.6 * SR, HOP = 0.3 * SR;
    const tStart = S_ON + 3.0;
    for (let g = 0; ; g++) {
      const o0 = idx(tStart) + g * HOP;
      if (o0 >= N) break;
      const src = (0.45 + GR() * (3.25 - 0.45 - 0.7)) * SR, rate = 1 + (GR() - 0.5) * 0.04;
      const fadeIn = g < 2 ? (g + 1) / 3 : 1;
      for (let i = 0; i < GL; i++) {
        const o = o0 + i; if (o >= N) break;
        const w = 0.5 - 0.5 * Math.cos(TAU * i / GL);
        voice[o * 2] += at(scr, src + i * rate, 0) * w * fadeIn; voice[o * 2 + 1] += at(scr, src + i * rate, 1) * w * fadeIn;
      }
      // the octave-down layer: the same grain read at half speed
      for (let i = 0; i < GL; i++) {
        const o = o0 + i; if (o >= N) break;
        const w = 0.5 - 0.5 * Math.cos(TAU * i / GL);
        sub[o] += (at(scr, src + i * rate * 0.5, 0) + at(scr, src + i * rate * 0.5, 1)) * 0.5 * w;
      }
    }
    // grow it: drive, the octave down, a roar shaped by the voice's own envelope
    const envF = new OnePole(30), lowF = new SVF(), roarF = new SVF(), subF = new SVF();
    for (let n = 0; n < N; n++) {
      const t = T0 + n / SR;
      const Lm = logMult(t);
      const k = clamp(Lm / 12, 0, 1);
      let l = voice[n * 2] * g0, r = voice[n * 2 + 1] * g0;
      const drive = 1 + 5 * k * k;
      l = Math.tanh(l * drive) / Math.sqrt(drive) * (1 + 0.6 * k); r = Math.tanh(r * drive) / Math.sqrt(drive) * (1 + 0.6 * k);
      const e = envF.run(Math.abs(l + r));
      const sb = subF.run(sub[n] * g0, 500, 0.8).lp * smooth(4, 10, Lm) * 1.6;
      const ro = roarF.run(white(), 180 + 500 * k, 0.9).lp * e * smooth(6, 11, Lm) * 2.2;
      const body = lowF.run(l + r, 160, 1.2).lp * 0.8 * k;
      // (under the white at the end the scream is swallowed by the roar)
      const keep = 1 - 0.6 * smooth(V_FLASH, T_SWITCH, t);
      L[n] += (l + sb + ro + body) * keep; R[n] += (r + sb + ro + body) * keep;
    }
  }

  // ================= the street, the wind, the rumble =================
  // building chunks breaking away: how much rubble is moving each moment (near ones count more)
  const BIN = 100, NB = Math.ceil((VIDEO_DURATION - T0) * BIN) + 2;
  const rub = new Float32Array(NB);
  const crunch = [];
  const CR = rng(55);
  for (const c of CHUNKS) {
    if (!Number.isFinite(c.dep)) continue;
    const near = 1 / (1 + Math.hypot(c.w[0] - CAM.x, c.w[2] - CAM.z) / 25);
    for (let k = 0; k < 150; k++) { const b = Math.round((c.dep - T0) * BIN) + k; if (b >= 0 && b < NB) rub[b] += near * Math.exp(-k / 60) * 0.004; }
    if (c.r < 60 && CR() < 0.08) crunch.push({ t: c.dep + CR() * 0.3, g: 0.25 * near, fc: 250 + 700 * CR(), d: 0.25 + 0.5 * CR(), pan: clamp((c.w[0] - CAM.x) / 30, -0.8, 0.8), f: new SVF() });
  }
  const cityLP = new OnePole(240), talkF = Array.from({ length: 6 }, () => new SVF()), talkE = Array.from({ length: 6 }, () => new OnePole(3));
  const windF = [new SVF(), new SVF()], rubF = new SVF(), rubLP = new OnePole(80), washF = new SVF(), crackF = new SVF();
  const subLP = new OnePole(70), boomLP = new OnePole(90);
  const revL = new Reverb(21), revR = new Reverb(22);
  let brownL = 0, brownR = 0, wetPrev = 0;
  const BEAT = HITS.map((t, n) => ({ t, k: 0.3 + 0.05 * n, f: 60 * Math.pow(2, -n / 16) }));
  BEAT.push({ t: V_RING, k: 1.0, f: 34 }, { t: V_WHITE, k: 1.1, f: 30 });
  // the towers: a long groan as each one goes, a deep crash where it lands
  for (const T of TOWERS) {
    for (let k = 0; k < 4; k++) crunch.push({ t: T.t + T.T - 0.1 + k * 0.18, g: 0.55 - 0.08 * k, fc: 160 + 120 * k, d: 0.9, pan: clamp((T.b.x - CAM.x) / 60, -0.7, 0.7), f: new SVF() });
    crunch.push({ t: T.t, g: 0.18, fc: 110, d: T.T * 0.6, pan: clamp((T.b.x - CAM.x) / 60, -0.7, 0.7), f: new SVF() });
  }
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const Lm = logMult(t);
    let l = 0, r = 0, wet = 0;
    brownL = brownL * 0.995 + white() * 0.05; brownR = brownR * 0.995 + white() * 0.05;
    // the street: traffic hum and voices, quiet once everyone's stopped
    const street = 1 - smooth(1.5, 7, t);
    if (street > 0) {
      const hum = cityLP.run(brownL) * 2.2;
      l += hum * 0.1 * street; r += hum * 0.1 * street;
      for (let k = 0; k < 6; k++) {
        const syl = 0.5 + 0.5 * Math.sin(t * (3.1 + k * 0.7) + k * 2 + Math.sin(t * (1.3 + k * 0.3)) * 2);
        const e = talkE[k].run(syl > 0.65 ? 1 : 0);
        const o = talkF[k].run(white(), 500 + k * 180 + 250 * Math.sin(t * (2 + k)), 3).bp;
        const g = 0.02 * e * street;
        l += o * g * (k % 2 ? 0.6 : 1); r += o * g * (k % 2 ? 1 : 0.6);
      }
    }
    // the wind: from the shock wave on, a roaring gale that keeps rising
    const wk = smooth(15.5, 24, t) * (0.5 + 0.5 * smooth(24, 44, t));
    if (wk > 0) {
      const fc = 300 + 900 * wk + 250 * Math.sin(t * 0.7);
      const a = windF[0].run(brownL * 3 + white() * 0.25, fc, 0.9).lp, b = windF[1].run(brownR * 3 + white() * 0.25, fc * 1.07, 0.9).lp;
      const gust = 0.75 + 0.25 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1);
      l += a * 0.22 * wk * gust; r += b * 0.22 * wk * gust;
      // the shock wave's crackle: sparse sharp-but-soft pops
      const cr = crackF.run(white() * (R0() < 0.0015 * wk ? 30 : 0), 2600, 1.5).bp * 0.03;
      l += cr; r += cr;
    }
    // rubble: a deep rumble that follows how much is breaking
    const rb = rub[Math.min(NB - 1, Math.floor((t - T0) * BIN))];
    if (rb > 0) {
      const o = rubF.run(brownL * 4, 120 + 300 * Math.min(rb, 1), 0.8).lp * Math.min(rb, 1.4) * 0.5 + rubLP.run(brownR) * Math.min(rb, 1.4) * 1.2;
      l += o; r += o; wet += o * 0.2;
    }
    // booms on every step
    for (const b of BEAT) {
      const dt = t - b.t; if (dt < -0.01 || dt > 3.2) continue;
      const f = b.f * (1 + 0.7 * Math.exp(-dt * 9));
      const o = Math.sin(TAU * f * Math.max(dt, 0) - 4 * Math.exp(-dt * 9)) * env(dt, 0.006, 0.8) * b.k * 0.85;
      const bl = boomLP.run(white()) * env(dt, 0.004, 0.3) * b.k * 2.2;
      l += o + bl; r += o + bl; wet += o * 0.25;
    }
    // the echo rushing back up the street at you: a rising roar, cut by the hit; a soft wash under the white
    const wa = Math.max(smooth(V_BACK, V_WHITE, t) * (1 - smooth(V_WHITE, V_WHITE + 0.25, t)) * 1.6, 0.35 * smooth(V_WHITE, V_WHITE + 0.1, t) * (1 - smooth(T_SWITCH - 0.2, T_SWITCH + 0.3, t)));
    if (wa > 0) { const o = washF.run(white(), 400 + 4000 * wa, 1.3).bp * wa * 0.35; l += o; r += o; }
    const rv = revL.run(wet, 0.82), rv2 = revR.run(wet, 0.82);
    L[n] += l + rv * 0.5; R[n] += r + rv2 * 0.5;
  }

  // ================= events written straight into the buffer =================
  const add = (t0, dur, fn) => { const a = Math.max(0, idx(t0)), b = Math.min(N, idx(t0 + dur)); for (let n = a; n < b; n++) { const [l, r] = fn((n - idx(t0)) / SR); L[n] += l; R[n] += r; } };
  // glass: a crash for each pane (loud when near), then shards tinkling down
  const GRr = rng(91);
  const panes = SOURCES.filter((s) => s.t < VIDEO_DURATION + 1).sort((a, b) => a.t - b.t);
  let lastBig = -9;
  for (const s of panes) {
    const d = Math.hypot(s.x - CAM.x, s.y - 1.4, s.z - CAM.z);
    const near = 1 / (1 + d / 6);
    const big = s.n >= 14;
    const g = (big ? 0.38 : 0.1) * near * (1 - 0.6 * smooth(20, 40, s.t));
    if (g < 0.004) continue;
    const pan = clamp((s.x - CAM.x) / 15, -0.85, 0.85);
    const f1 = new SVF(), f2 = new SVF();
    add(s.t, 0.6, (dt) => {
      const o = (f1.run(white(), 4200, 0.6).hp * env(dt, 0.005, 0.12) * 0.6 + f2.run(white(), 5200, 0.25).bp * env(dt, 0.006, 0.25)) * g;
      return [o * (1 - pan) * 0.8, o * (1 + pan) * 0.8];
    });
    // tinkles: little pings as the shards land
    const nt = big ? 10 : 3;
    for (let k = 0; k < nt; k++) {
      const tk = s.t + 0.25 + GRr() * (big ? 1.4 : 0.9), fq = 2500 + 5500 * GRr(), dk = 0.03 + 0.08 * GRr(), gk = g * (0.25 + 0.4 * GRr());
      let ph = 0;
      add(tk, 0.45, (dt) => { ph += fq / SR; const o = Math.sin(TAU * ph) * env(dt, 0.002, dk) * gk; return [o * (1 - pan), o * (1 + pan)]; });
    }
    if (big && near > 0.15 && s.t - lastBig > 0.3) lastBig = s.t;
  }
  // car alarms: the nearest five, each its own pattern (a whooping siren, a two-tone, a chirp), until the car's thrown
  const alarms = CARS.filter((c) => Number.isFinite(c.tAlarm)).map((c) => ({ c, d: Math.hypot(c.sx - CAM.x, c.sz - CAM.z) })).sort((a, b) => a.d - b.d).slice(0, 5);
  alarms.forEach(({ c, d }, k) => {
    const g = 0.05 / (1 + d / 20), pan = clamp((c.sx - CAM.x) / 12, -0.8, 0.8);
    const end = Math.min(c.tFlip, VIDEO_DURATION) + 0.05;
    let ph = 0;
    const lp = new OnePole(3000);
    add(c.tAlarm, end - c.tAlarm, (dt) => {
      let f;
      if (k % 3 === 0) f = 900 + 600 * (0.5 + 0.5 * Math.sin(TAU * 2.2 * dt));           // whoop
      else if (k % 3 === 1) f = (Math.floor(dt * 2.6) % 2) ? 1250 : 950;                  // two-tone
      else f = 1500 + 900 * ((dt * 7) % 1);                                               // chirp
      ph += f / SR;
      const sq = Math.tanh(Math.sin(TAU * ph) * 4) * 0.6;
      const o = lp.run(sq) * g * Math.min(1, dt / 0.02) * Math.min(1, (end - c.tAlarm - dt) / 0.04) * (1 - 0.5 * smooth(20, 35, c.tAlarm + dt));
      return [o * (1 - pan), o * (1 + pan)];
    });
  });
  // building chunks: a heavy crunch for some of the near ones
  for (const c of crunch) {
    add(c.t, c.d * 5, (dt) => { const o = c.f.run(white(), c.fc * (1 - 0.5 * Math.min(dt / c.d, 1)), 0.9).lp * env(dt, 0.004, c.d) * c.g; return [o * (1 - c.pan), o * (1 + c.pan)]; });
  }
  // the people: a gasp from the crowd at the start, "oh my god" when the glass goes, screams as they're thrown
  const clips = [['gasp.mp3', 0, 1.6, 0.55, 0.3, 1, 0], ['omg.mp3', 0, 1.8, 7.2, 0.3, 1, -0.4]];
  const thrown = PEOPLE.filter((p) => p.tKnock > 10 && p.tKnock < 26).map((p) => ({ p, d: Math.hypot(p.sx - CAM.x, p.sz - CAM.z) })).sort((a, b) => a.d - b.d).slice(0, 4);
  thrown.forEach(({ p, d }, k) => clips.push(['scream.mp3', 0.15 + 0.4 * k, 1.1, p.tKnock - 0.05, 0.16 / (1 + d / 12), [1.12, 0.92, 1.2, 1.04][k], clamp((p.sx - CAM.x) / 8, -0.8, 0.8)]));
  for (const [name, ss, len, t0, gain, rate, pan] of clips) {
    const c = loadClip(name, ss, len + 0.2);
    if (!c) continue;
    const g = gain / c.pk;
    const n2 = Math.floor(Math.min(c.n, len * SR) / rate);
    for (let i = 0; i < n2; i++) {
      const o = idx(t0) + i; if (o < 0 || o >= N) continue;
      const fade = Math.min(1, i / (SR * 0.005)) * Math.min(1, (n2 - i) / (SR * 0.08));
      const pos = i * rate;
      L[o] += at(c, pos, 0) * g * fade * (1 - pan); R[o] += at(c, pos, 1) * g * fade * (1 + pan);
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
    OL[n] = Math.tanh(OL[n] * 1.3); OR[n] = Math.tanh(OR[n] * 1.3);
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
  console.log(`audio: ${panes.length} panes, ${alarms.length} alarms, ${crunch.length} crunches, ${thrown.length} thrown screams`);
  return outFile;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
