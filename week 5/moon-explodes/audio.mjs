// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// A cosmic topic, so music carries it (black-hole style): a dark drone whose chord shifts at every time-lapse leap,
// a whoosh into each leap and a trailer "braam" on it, sub-bass. Under it the harbour: water lapping on the steps,
// the city's hum, the crowd talking (it goes quiet at the burst, then murmurs, gasps, screams). The owner's scream
// (sfx/scream.mp3) at the burst, in the first second. The pieces hitting each other: deep soft booms. The tide: the
// sea washing up the terraces and back. The ring: a high shimmer. The falling pieces: distant booms and whooshes;
// the splash: its boom arrives 1.5 s after the flash (500 m at the speed of sound), then the wave rushing over the
// deck; the hard rain: a roar that keeps growing, booms everywhere, the towers hit; the giant chunk: a rising roar
// into the biggest hit, into the white. Every onset is soft (8 ms+): no clicks or clacks.
// The loop: the whole track is made in one run that starts before frame 0, so the moments just before the first frame
// exist; under the white at the end the track fades over into them, and the last sample runs straight into the first.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, V_BURST, JUMPS, SHATTER, CRASHES, METEORS, HITS, FAR_HITS, V_SPLASH, V_WAVE, V_RAIN, V_RUN,
  V_FIRST, V_CHUNK, V_HIT, state } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const SCREAM_AT = V_BURST + 0.05;          // (0.5 s: everyone screams as it comes apart)
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.7)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.87, damp = 0.4) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

// the drone's chords, darkening as it goes (the ring opens up for a moment)
const CHORDS = [[-9, [110, 164.81, 220, 261.63]], [V_BURST, [73.42, 110, 146.83, 174.61]], [9.0, [87.31, 130.81, 174.61, 220]],
  [12.3, [98, 146.83, 196, 246.94]], [16.6, [82.41, 123.47, 164.81, 196]], [V_RAIN, [69.3, 103.83, 138.59, 164.81]], [38.0, [55, 58.27, 82.41, 110]]];
const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;                         // the run starts before frame 0 (filters settle, the loop's lead-in)
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const white = () => R0() * 2 - 1;
  // ---- events ----
  const leaps = JUMPS.map((t, i) => ({ t, k: 0.45 + 0.07 * i }));
  // { t, f (Hz), g, d (decay s), pan, bl: how much blast (the crack and roar you hear on a phone speaker, which can't
  // play the deep part) }
  const booms = [];
  booms.push({ t: V_BURST, f: 34, g: 1.0, d: 2.2, pan: 0.1, bl: 0.7 });
  for (const [, v] of SHATTER) booms.push({ t: v + 0.05, f: 42 + R0() * 10, g: 0.35, d: 1.2, pan: R0() * 0.8 - 0.4, bl: 0.4 });
  for (const c of CRASHES) booms.push({ t: c.v + 0.04, f: 48 + R0() * 14, g: 0.12 * c.size, d: 0.8, pan: R0() * 0.8 - 0.4, bl: 0.18 * c.size });
  booms.push({ t: V_SPLASH + 1.46, f: 30, g: 1.0, d: 2.5, pan: 0.25, bl: 1.1 });       // the splash's boom, 500 m off
  for (const h of HITS) booms.push({ t: h.v + 1.0, f: 30 + 6 * R0(), g: 0.55 + 0.2 * h.size, d: 2.0, pan: clamp(h.t.x / 600, -0.8, 0.8), bl: 0.45 + 0.15 * h.size });
  for (const h of FAR_HITS) booms.push({ t: h.v + 1.5, f: 26, g: 0.35, d: 2.6, pan: clamp(h.p[0] / 9000, -0.7, 0.7), bl: 0.12 });
  for (const m of METEORS) if (m.kind === 1 && R0() < 0.35) booms.push({ t: m.v1 + 0.6 + R0() * 0.8, f: 38 + R0() * 18, g: 0.12 + 0.08 * R0(), d: 1.0, pan: R0() * 1.4 - 0.7, bl: 0.06 });
  // the giant chunk: the loudest thing in the video, and it rings on into the white (it alone isn't faded early)
  booms.push({ t: V_HIT, f: 24, g: 1.9, d: 3.5, pan: 0, bl: 3.2, fin: true });
  for (const b of booms) if (b.bl) { b.F = new SVF(); b.F2 = new SVF(); b.mph = 0; }
  // whooshes: the first piece, the fireballs that hit, the splash's fireball
  const whoosh = [];
  for (const m of METEORS) if (m.kind >= 2 || (m.kind === 0 && m.v0 === V_FIRST)) whoosh.push({ t0: m.v0, t1: m.v1, g: m.kind === 0 ? 0.25 : 0.5, pan: clamp(m.p1[0] / 1500, -0.7, 0.7) });
  // synth voices (each its own phase and filters: no shared pitch squeaks): gasps at the burst, "ooh" at the first
  // piece, screams at the splash and in the hard rain
  const cries = [];
  const addCries = (t0, t1, n, g, f0 = 230, df = 300) => { for (let k = 0; k < n; k++) cries.push({ t: t0 + R0() * (t1 - t0), f: f0 + R0() * df, d: 0.5 + R0() * 0.8, g: g * (0.6 + 0.6 * R0()), pan: R0() * 1.6 - 0.8, vow: R0(), ph: 0, fA: new SVF(), fB: new SVF() }); };
  addCries(V_BURST + 0.2, V_BURST + 1.6, 8, 0.01);
  addCries(V_FIRST + 0.2, V_FIRST + 1.5, 6, 0.006, 180, 120);
  addCries(V_SPLASH + 0.1, V_SPLASH + 1.2, 10, 0.012);
  addCries(V_WAVE + 0.1, V_WAVE + 1.5, 10, 0.012);
  addCries(V_RUN - 0.5, V_HIT, 46, 0.011);
  // levels (tide) ahead of time for the wash
  const S = (t) => state(t);

  const lapLP = new OnePole(500), lapLP2 = new OnePole(350), cityLP = new OnePole(180), cityLP2 = new OnePole(220);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const washF = new SVF(), washF2 = new SVF(), washLP = new OnePole(300);
  const droneLP = [new OnePole(400), new OnePole(400)], braamF = new SVF(), whF = new SVF(), whF2 = new SVF(), riserF = new SVF();
  const subLP = new OnePole(60), roarF = new SVF(), roarF2 = new SVF(), roarLP = new OnePole(90), shimF = new OnePole(3000);
  const boomLP = new OnePole(140);
  const revL = new Reverb(1), revR = new Reverb(2);
  const ph = new Float64Array(16);
  let bL = 0, bR = 0, tideVel = 0, braamPh = [0, 0, 0, 0], shPh = [0, 0, 0, 0];
  const bph = booms.map(() => 0);
  let st = S(T0), stT = T0;
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    if (t - stT > 0.005) { const nx = S(t); tideVel = (nx.tide - st.tide) / (t - stT); st = nx; stT = t; }
    const fade = 1 - smooth(T_SWITCH - 1.4, T_SWITCH - 0.05, t);     // everything dies away under the white
    let l = 0, r = 0, wet = 0;
    // --- the harbour: water lapping, the city's hum ---
    const lap = lapLP2.run(lapLP.run(white())) * (0.45 + 0.35 * Math.sin(t * 0.8) * Math.sin(t * 0.31 + 1)) * 0.6;
    bL = clamp(bL + white() * 0.02, -1, 1) * 0.998; bR = clamp(bR + white() * 0.02, -1, 1) * 0.998;
    const hum = 0.28 * (1 - 0.6 * st.black);
    l += lap + cityLP.run(bL) * hum; r += lap * 0.9 + cityLP2.run(bR) * hum;
    // --- the crowd talking (quiet after the burst, back to a murmur, gone in the hard rain) ---
    {
      let cv = 0;
      for (let q = 0; q < 5; q++) {
        const amp = talkE[q].run(Math.max(0, Math.sin(t * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
        cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(t * (1.1 + q * 0.3)), 0.25).bp * amp;
      }
      const talk = (1 - 0.8 * smooth(V_BURST, V_BURST + 0.6, t)) + 0.6 * smooth(3, 6, t) * (1 - smooth(V_RAIN, V_RAIN + 3, t)) + 0.5 * smooth(V_RUN - 1, V_RUN + 1, t) * (1 - smooth(V_HIT - 2.45, V_HIT - 0.45, t));
      l += cv * 0.03 * talk; r += cv * 0.028 * talk;
    }
    // --- the tide washing up the terraces and back (louder the faster the water moves), the wave over the deck ---
    {
      const w = clamp(Math.abs(tideVel) / 6) * 0.3 + st.slosh * 0.08 + st.flood * 0.35 + st.surge * 0.15;
      const wn = white();
      const wv = (washF.run(wn, 420 + 250 * st.flood, 0.6).bp + washF2.run(wn, 1100, 0.8).bp * 0.12) * w * 0.8;
      const lo = washLP.run(wn) * w * 0.5;
      l += wv + lo; r += wv * 0.9 + lo; wet += wv * 0.3;
    }
    // --- the scream: see below (mixed from the file) ---
    // --- the drone (its chord follows the leaps), darker and louder as it goes ---
    {
      const ch = chordAt(t);
      const dg = (0.045 + 0.03 * smooth(0, 10, t) + 0.035 * smooth(V_RAIN, 44, t)) * fade;
      const cutoff = 350 + 250 * smooth(V_BURST, 3, t) + 500 * smooth(V_RAIN, 46, t);
      droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
      let dl = 0, dr = 0;
      for (let k = 0; k < 4; k++) {
        ph[k] += (ch[k] * 0.997) / SR; ph[k + 4] += (ch[k] * 1.003) / SR;
        dl += saw(ph[k]) * (k === 0 ? 0.9 : 0.6); dr += saw(ph[k + 4]) * (k === 0 ? 0.9 : 0.6);
      }
      dl = droneLP[0].run(dl) * dg; dr = droneLP[1].run(dr) * dg;
      l += dl; r += dr; wet += (dl + dr) * 0.4;
    }
    // --- the leaps: a whoosh into each, a braam on it ---
    {
      let braam = 0, rise = 0;
      for (const j of leaps) {
        const dt = t - j.t;
        if (dt > -0.6 && dt < 0.05) { const k = smooth(-0.6, 0.0, dt); rise += riserF.run(white(), 300 + 2600 * k * k, 0.45).bp * k * k * j.k * (1 - smooth(-0.02, 0.05, dt)); }
        if (dt > -0.01 && dt < 4) {
          const e = env(dt, 0.03, 1.1) * j.k;
          const hf = chordAt(j.t + 0.01)[0] / 2;
          for (let q = 0; q < 4; q++) braamPh[q] += (hf * [1, 1.004, 2, 3.01][q]) / SR;
          braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
        }
      }
      braam = braamF.run(braam, 800, 0.6).lp * 0.15 * fade;
      rise *= 0.35 * fade;
      l += braam + rise; r += braam + rise; wet += braam * 0.5 + rise * 0.3;
    }
    // --- the ring: a high shimmer while it glows over you ---
    {
      const g = smooth(12.3, 13.6, t) * (1 - smooth(16.5, 19.5, t)) * 0.014;
      if (g > 0) {
        let sh = 0;
        for (let q = 0; q < 4; q++) { shPh[q] += ([1174.7, 1568, 1760, 2349.3][q] * (1 + 0.002 * Math.sin(t * (2 + q)))) / SR; sh += Math.sin(TAU * shPh[q]) * (0.5 + 0.5 * Math.sin(t * (0.9 + q * 0.6) + q)); }
        const v = shimF.run(sh) * g;
        l += v; r += v * 0.9; wet += v * 1.2;
      }
    }
    // --- the cracking before the burst: a low rising groan ---
    {
      const g = smooth(-1.2, V_BURST, t) * (1 - smooth(V_BURST, V_BURST + 0.05, t)) * 0.18;
      if (g > 0) { ph[9] += (38 + 20 * smooth(-1.2, V_BURST, t)) / SR; const v = (Math.sin(TAU * ph[9]) + 0.3 * roarF2.run(white(), 120, 0.6).bp) * g; l += v; r += v; }
    }
    // --- booms (deep, soft: the pieces hitting, the splash, the towers, the big ones) ---
    {
      let bm = 0, sub = 0, bp = 0, xl = 0, xr = 0;
      const finFade = 1 - smooth(T_SWITCH - 1.0, T_SWITCH - 0.05, t);
      booms.forEach((b, i) => {
        const dt = t - b.t;
        if (dt < 0 || dt > b.d * 3.5) return;
        const fd = b.fin ? finFade : fade;
        const e = env(dt, 0.012, b.d) * b.g * fd;
        bph[i] += (b.f * (1 + 1.2 * Math.exp(-dt * 6))) / SR;
        const x = Math.sin(TAU * bph[i]) * e;
        sub += x; bm += x * (1 - b.pan) * 0.5; bp += x * (1 + b.pan) * 0.5;
        // the blast: a burst of noise whose brightness falls away fast, a punchy mid thump, crackle
        if (b.bl && dt < 0.4 + b.d) {
          const eb = env(dt, 0.004, 0.22 + 0.12 * b.bl) * b.bl * fd;
          const tail = env(dt, 0.02, 0.5 + 0.35 * b.bl) * b.bl * fd;
          const wn = white();
          const crack = b.F.run(wn, 350 + 4200 * Math.exp(-dt / 0.15), 0.7).lp * eb;
          const rumble = b.F2.run(wn, 160 + 260 * Math.exp(-dt / 0.6), 0.5).lp * tail * 0.9;
          b.mph += (62 * (1 + 1.6 * Math.exp(-dt * 9))) / SR;
          const thump = Math.tanh(2.5 * Math.sin(TAU * b.mph)) * env(dt, 0.003, 0.18) * b.bl * fd * 0.5;
          const crk = R0() < 0.004 * Math.exp(-dt / 0.6) ? white() * 1.25 * eb : 0;
          const v = crack + rumble + thump + crk;
          xl += v * (1 - 0.6 * b.pan); xr += v * (1 + 0.6 * b.pan); wet += v * 0.35;
        }
      });
      const rb = boomLP.run(white()) * 1.5 * Math.min(1, Math.abs(sub)) ;
      l += (bm + rb * 0.5) * 0.55 + xl * 0.5; r += (bp + rb * 0.5) * 0.55 + xr * 0.5; wet += sub * 0.25;
    }
    // --- whooshes (the pieces coming down) ---
    {
      let w = 0;
      for (const m of whoosh) {
        if (t < m.t0 - 0.05 || t > m.t1 + 0.3) continue;
        const u = clamp((t - m.t0) / (m.t1 - m.t0));
        w += m.g * smooth(0, 0.4, u) * (1 - smooth(1.0, 1.15, (t - m.t0) / (m.t1 - m.t0)));
      }
      if (w > 0) { const wn = white(); const v = (whF.run(wn, 500 + 900 * clamp(w), 0.6).bp + 0.5 * whF2.run(wn, 180, 0.7).bp) * Math.min(w, 1.2) * 0.35 * fade; l += v; r += v * 0.95; wet += v * 0.3; }
    }
    // --- the hard rain's roar, and the giant chunk's ---
    {
      const g = (0.12 * smooth(V_FIRST, V_RAIN, t) + 0.5 * st.rain + 0.35 * smooth(V_CHUNK - 3.9, V_CHUNK + 0.1, t) + 0.9 * Math.pow(st.chunk, 2)) * fade;
      if (g > 0.001) {
        const wn = white();
        const fc = 140 + 200 * st.rain + 380 * Math.pow(st.chunk, 2);
        const v = (roarF.run(wn, fc, 0.55).bp * 1.2 + roarLP.run(wn) * 2.2) * g * (0.8 + 0.2 * Math.sin(t * 1.3) * Math.sin(t * 3.1));
        l += v; r += v * 0.97 + roarF2.run(wn, fc * 1.3, 0.6).bp * g * 0.4; wet += v * 0.15;
      }
      const sg = (0.06 * st.rain + 0.4 * Math.pow(st.chunk, 3)) * fade;
      if (sg > 0) { const sv = subLP.run(white()) * 3 * sg; l += sv; r += sv; }
    }
    // --- voices ---
    for (const c of cries) {
      const dt = t - c.t;
      if (dt > 0 && dt < c.d) {
        c.ph += c.f * (1.25 - 0.35 * dt / c.d + 0.02 * Math.sin(dt * 30)) / SR;
        const src = saw(c.ph);
        const vv = (c.fA.run(src, 700 + 200 * c.vow, 0.3).bp + 0.6 * c.fB.run(src, 1150 + 450 * c.vow, 0.3).bp) * Math.sin(Math.PI * dt / c.d) * c.g;
        l += vv * (1 - c.pan) * 0.5; r += vv * (1 + c.pan) * 0.5; wet += vv * 0.5;
      }
    }
    const wl = revL.run(wet * 0.5), wr = revR.run(wet * 0.5);
    L[n] = l + wl * 0.8; R[n] = r + wr * 0.8;
  }
  // the owner's scream (sfx/scream.mp3) as it comes apart. The file's 0.57 s of silence is cut
  {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.55', '-i', path.join(path.dirname(fileURLToPath(import.meta.url)), 'sfx', 'scream.mp3'),
      '-t', '2.6', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
    const sc = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
    const n0 = Math.round((SCREAM_AT - T0) * SR), len = sc.length >> 1;
    let mix = 0, own = 0;
    for (let i = 0; i < len; i++) { mix += L[n0 + i] ** 2 + R[n0 + i] ** 2; own += sc[2 * i] ** 2 + sc[2 * i + 1] ** 2; }
    const g = 1.4 * Math.sqrt(mix / own) * 0.45;
    for (let i = 0; i < len; i++) {
      const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.3 * SR));
      L[n0 + i] += sc[2 * i] * g * f; R[n0 + i] += sc[2 * i + 1] * g * f;
    }
  }
  // the video's track: [0, T_SWITCH) as made; from T_SWITCH on it fades over into the run's own lead-in to frame 0
  // ([-LOOP, 0)), so its last sample is followed (on the loop) by the sample that really came next
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
  for (let n = 0; n < M; n++) { OL[n] = Math.tanh(OL[n] * 1.3); OR[n] = Math.tanh(OR[n] * 1.3); peak = Math.max(peak, Math.abs(OL[n]), Math.abs(OR[n])); }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + M * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + M * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(M * 4, 40);
  for (let n = 0; n < M; n++) {
    buf.writeInt16LE(Math.round(clamp(OL[n] * g, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(OR[n] * g, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
