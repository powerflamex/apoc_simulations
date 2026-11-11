// Procedural soundtrack for "What if the oceans drained away?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// What you hear: a packed beach and the sea rushing out (a wide hiss sliding down in pitch as it goes), the owner's
// scream on frame 0 (sounds/scream.mp3, set near the level of what follows, not above it); a whoosh and a soft thud at
// every jump forward; a deep hit on every popup, lower each time; a low drone that sinks as you go down. In each place its
// own sound: water dripping and steel groaning at the wreck, whales calling on the shelf (and a gasp at the cliff,
// sounds/gasp.mp3), a longer, lower groan from the cargo ship, steam hissing and the ground rumbling at the vents, the
// Titanic creaking under sheets of running water ("oh my god", sounds/omg.mp3), water roaring off the mountain, wind
// moaning in the trench, then almost nothing at the bottom but drips and one soft deep note at -36,000 ft. Then the
// roar: far, low, growing until it is everything ("nooo", sounds/nooo.mp3), the crash on the lens, and in the white it
// turns back into the sea rushing out, so the sound runs on across the loop. Every onset is soft (5 ms+): no clacks.
// The master level is set from the opening second (-25 dB), not by the loudest moment.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, CUTS, DASHES, BEATS, V_WRECK, V_WHALES, V_EDGE, V_CARGO, V_VENTS, V_TITANIC, V_MOUNT, V_TRENCH, V_BOTTOM, V_FLOOR, V_ROAR, V_WAVE, V_HIT, V_WHITE } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_OPENING_DB = -25;
const CLIPS = [
  { name: 'scream.mp3', at: 0.1, db: -27 },
  { name: 'gasp.mp3', at: V_EDGE + 1.75, db: -27 },
  { name: 'omg.mp3', at: V_TITANIC + 0.95, db: -27 },
  { name: 'nooo.mp3', at: V_WAVE + 1.05, db: -25 },
];

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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.9)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.87, damp = 0.32) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));
const win = (v, a, b, f = 0.3) => smooth(a - f, a + f * 0.5, v) * (1 - smooth(b - f, b + f * 0.5, v));

function loadClip(dir, name) {
  const file = path.join(dir, 'sounds', name);
  if (!fs.existsSync(file)) { console.warn(`audio: no sounds/${name}: left out`); return null; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const raw = r.stdout;
  console.log(`audio: sounds/${name}`);
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

export function makeSoundtrack(outFile) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  const N = Math.round(VIDEO_DURATION * SR), N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N), PL = new Float32Array(N0), PR = new Float32Array(N0);
  const rnd = rng(8848);
  const white = () => rnd() * 2 - 1;
  const clips = CLIPS.map((c) => ({ ...c, data: loadClip(ROOT, c.name) }));

  // ---- events laid out up front ----
  // drips: where water is still running off things (the wreck, the boxes, the Titanic, the trench walls)
  const DRIPS = [];
  {
    const R2 = rng(77);
    const zone = (a, b, rate, gain, wet) => { for (let t = a; t < b; t += (0.4 + R2() * 1.2) / rate) DRIPS.push({ t, f: 700 + R2() * 1900, g: gain * (0.4 + R2() * 0.6), pan: R2() * 2 - 1, wet, ph: 0 }); };
    zone(V_WRECK + 0.1, V_WHALES - 0.2, 15, 0.1, 0.5);
    zone(V_CARGO + 0.1, V_VENTS - 0.2, 7, 0.07, 0.5);
    zone(V_TITANIC + 0.1, V_MOUNT - 0.2, 18, 0.1, 0.6);
    zone(V_TRENCH + 0.2, V_BOTTOM, 4, 0.06, 0.9);
    zone(V_BOTTOM, V_ROAR + 0.5, 5, 0.09, 1.0);
  }
  // steel groaning: [start, length, pitch, gain]
  const GROANS = [[V_WRECK + 0.3, 1.7, 96, 0.8], [V_CARGO + 0.45, 2.3, 64, 0.8], [V_TITANIC + 0.35, 2.7, 52, 1.0], [V_TITANIC + 2.5, 1.6, 71, 0.6]]
    .map(([t, d, f, g], i) => ({ t, d, f, g, ph: 0, f1: new SVF(), f2: new SVF(), seed: i * 1.7 }));
  // whales: [start, length, f0, f1, f2] (a moan that rises and falls)
  const CALLS = [[V_WHALES + 0.45, 2.3, 150, 330, 120], [V_WHALES + 2.9, 1.9, 260, 520, 300], [V_EDGE + 0.2, 2.0, 120, 210, 90]]
    .map(([t, d, a, b, c]) => ({ t, d, a, b, c, ph: 0 }));
  const HITS = BEATS.map((t, n) => ({ t, k: Math.abs(t - V_FLOOR) < 0.3 ? 0.8 : clamp(0.34 + 0.045 * n, 0, 0.85), root: 55 * Math.pow(2, -Math.min(n, 12) / 22) }));

  const rushF = [new SVF(), new SVF()], rushLP = [new OnePole(5200), new OnePole(5200)];
  const crowdF = [new SVF(), new SVF(), new SVF()], crowdE = [new OnePole(5), new OnePole(6), new OnePole(4)];
  const whooshF = [new SVF(), new SVF()];
  const braamLP = new SVF(), subLP = new OnePole(90), droneLP = [new OnePole(210), new OnePole(210)];
  const hissF = [new SVF(), new SVF()], rumbleLP = new OnePole(70), fallsLP = [new OnePole(420), new OnePole(420)], fallsF = new SVF();
  const windF = [new SVF(), new SVF()], roarLP = [new SVF(), new SVF()], roarSub = new OnePole(60), riserF = new SVF(), crashLP = new OnePole(2200);
  const revL = new Reverb(3), revR = new Reverb(11);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;

  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    let l = 0, r = 0, wet = 0;
    const put = (x, pan, w = 0.3) => { l += x * (1 - pan) * 0.7; r += x * (1 + pan) * 0.7; wet += x * w; };
    const wl = white(), wr = white();
    brownL = clamp(brownL + wl * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + wr * 0.02, -1, 1) * 0.998;

    // --- the sea rushing out: a wide hiss, sliding lower as the water gets further away; a little of it again after
    //     every jump (it is always just ahead of you) ---
    {
      let g = 1.0 * (1 - smooth(0.6, 4.4, v)) + 0.12 * (1 - smooth(4, 4.8, v));
      for (const c of CUTS) { const dt = v - c; if (dt > 0 && dt < 8) g += 0.3 * smooth(0, 0.3, dt) * Math.exp(-dt / 2.6); }
      g *= 1 - smooth(V_BOTTOM + 1, V_FLOOR, v);
      if (g > 0.001) {
        const fc = 1500 - 900 * smooth(-0.6, 4.5, v) + (v > 4.8 ? 300 : 0);
        const a = rushLP[0].run(rushF[0].run(wl, fc * (1 + 0.15 * Math.sin(v * 2.3)), 0.9).bp + 0.25 * wl);
        const b = rushLP[1].run(rushF[1].run(wr, fc * (1 + 0.15 * Math.sin(v * 1.9 + 1)), 0.9).bp + 0.25 * wr);
        const sw = 0.75 + 0.25 * Math.sin(v * 5.3 + Math.sin(v * 1.7) * 2);
        l += a * 0.26 * g * sw; r += b * 0.26 * g * (1.5 - sw * 0.5); wet += (a + b) * 0.03 * g;
      }
    }
    // --- the crowd: a beach full of people shouting; after that, the few who walk on with you ---
    {
      const crowd = 0.9 * (1 - smooth(3.9, 4.9, v)) + 0.06 * win(v, V_WHALES, V_CARGO, 0.4) + 0.04 * win(v, V_TITANIC, V_MOUNT, 0.4) + 0.12 * win(v, V_WAVE + 0.2, V_HIT, 0.3);
      if (crowd > 0.001) {
        let c = 0;
        for (let q = 0; q < 3; q++) {
          const e = crowdE[q].run(0.5 + 0.5 * Math.sin(v * (3.3 + q * 1.9) + q * 2.1) + white() * 0.3);
          c += crowdF[q].run(white(), 760 + q * 480 + 140 * Math.sin(v * (0.9 + q * 0.5)), 0.6).bp * e;
        }
        put(c * 0.16 * crowd, 0.15 * Math.sin(v * 0.3), 0.5);
      }
    }
    // --- every jump forward: a whoosh up into the cut and away, with a soft thud on it ---
    for (const c of DASHES) {
      const dt = v - c;
      if (dt < -0.4 || dt > 0.6) continue;
      const e = dt < 0 ? Math.pow(smooth(-0.4, 0, dt), 2) : Math.pow(1 - smooth(0, 0.55, dt), 1.5);
      const fc = 350 + 2600 * e;
      const a = whooshF[0].run(wl, fc, 0.5).bp, b = whooshF[1].run(wr, fc * 1.07, 0.5).bp;
      l += a * 0.2 * e; r += b * 0.2 * e; wet += (a + b) * 0.03 * e;
      if (dt > -0.02) { ph[20] += (46 + 30 * Math.exp(-Math.max(dt, 0) * 9)) / SR; const s = Math.sin(TAU * ph[20]) * env(dt + 0.02, 0.02, 0.22) * 0.32; l += s; r += s; }
    }
    // --- a deep hit on every popup (lower each time), and the drone sinking with you ---
    {
      let braam = 0, sub = 0;
      for (const h of HITS) {
        const dt = v - h.t;
        if (dt < -0.02 || dt > 4) continue;
        const e = env(dt + 0.02, 0.03, 0.85 + 0.6 * h.k) * h.k * (1 - smooth(2.8, 4, dt));
        const hf = h.root * (1 - 0.04 * Math.min(dt, 1));
        ph[10] += hf / SR; ph[11] += hf * 1.007 / SR; ph[12] += hf * 2 / SR;
        braam += (saw(ph[10]) + saw(ph[11]) + 0.5 * saw(ph[12])) * e;
        ph[14] += (30 + 34 * Math.exp(-Math.max(dt, 0) * 5)) / SR;
        sub += Math.sin(TAU * ph[14]) * env(dt + 0.02, 0.015, 0.6 + 0.3 * h.k) * h.k;
      }
      const bf = braamLP.run(braam, 820, 0.6).lp * 0.1;
      const sv = subLP.run(sub) * 0.52 + sub * 0.2;
      l += bf + sv; r += bf * 0.97 + sv; wet += bf * 0.5;
      const dg = (0.02 * smooth(4, 6, v) + 0.045 * smooth(8, 30, v) + 0.03 * smooth(30, 36, v)) * (1 - 0.6 * smooth(V_FLOOR - 1.5, V_FLOOR, v)) * (1 - smooth(V_HIT - 0.1, V_WHITE, v));
      if (dg > 0.0005) {
        const dn = Math.pow(2, -(7 / 12) * smooth(5, 39, v));
        let a = 0, b = 0;
        [55, 82.4, 110].forEach((f, q) => { ph[40 + q] += f * dn / SR; ph[44 + q] += f * dn * 1.006 / SR; a += saw(ph[40 + q]); b += saw(ph[44 + q]); });
        const xl = droneLP[0].run(a) * dg, xr = droneLP[1].run(b) * dg;
        l += xl; r += xr; wet += (xl + xr) * 0.4;
      }
    }
    // --- drips ---
    for (const d of DRIPS) {
      const dt = v - d.t;
      if (dt < 0 || dt > 0.25) continue;
      d.ph += d.f * (1 + 0.5 * Math.exp(-dt * 40)) / SR;
      put(Math.sin(TAU * d.ph) * env(dt, 0.005, 0.035) * d.g * 1.5, d.pan * 0.7, d.wet);
    }
    // --- steel groaning ---
    for (const g of GROANS) {
      const dt = v - g.t;
      if (dt < 0 || dt > g.d) continue;
      const u = dt / g.d, e = smooth(0, 0.22, u) * (1 - smooth(0.7, 1, u));
      const f = g.f * (1 + 0.1 * Math.sin(u * 5 + g.seed) - 0.12 * u);
      g.ph += f / SR;
      const src = saw(g.ph) * (0.6 + 0.4 * Math.sin(TAU * 13 * dt + 3 * Math.sin(dt * 7)));
      const x = g.f1.run(src, 300 + 110 * Math.sin(dt * 3.1 + g.seed), 0.14).bp * 0.5 + g.f2.run(src, 760 + 260 * Math.sin(dt * 2.3), 0.12).bp * 0.3;
      put(x * e * 0.24 * g.g, -0.2, 0.7);
    }
    // --- whales ---
    for (const c of CALLS) {
      const dt = v - c.t;
      if (dt < 0 || dt > c.d) continue;
      const u = dt / c.d, e = Math.pow(Math.sin(Math.PI * u), 0.8);
      const f = (u < 0.45 ? c.a + (c.b - c.a) * smooth(0, 0.45, u) : c.b + (c.c - c.b) * smooth(0.45, 1, u)) * (1 + 0.018 * Math.sin(TAU * 5.2 * dt));
      c.ph += f / SR;
      const x = Math.sin(TAU * c.ph) + 0.35 * Math.sin(TAU * c.ph * 2 + 1) + 0.12 * Math.sin(TAU * c.ph * 3);
      put(x * e * 0.12, 0.25 * Math.sin(c.t), 1.0);
    }
    // --- the vents: steam hissing, the ground rumbling ---
    {
      const k = win(v, V_VENTS, V_TITANIC, 0.3);
      if (k > 0.001) {
        const a = hissF[0].run(wl, 4200 + 900 * Math.sin(v * 3.1), 0.7).bp, b = hissF[1].run(wr, 5200 + 900 * Math.sin(v * 2.3 + 1), 0.7).bp;
        const m = 0.7 + 0.3 * Math.sin(v * 9 + 2 * Math.sin(v * 2.1));
        const rb = rumbleLP.run(brownL) * 0.55;
        l += (a * 0.07 * m + rb * 1.6) * k; r += (b * 0.07 * (1.4 - m * 0.6) + rb * 1.6) * k; wet += (a + b) * 0.015 * k;
      }
    }
    // --- the mountain: water roaring down it, growing as more of it stands clear ---
    {
      const k = win(v, V_MOUNT, V_TRENCH, 0.3) * (0.4 + 0.6 * smooth(V_MOUNT, V_TRENCH, v));
      if (k > 0.001) {
        const fb = fallsF.run(wl, 1500, 0.9).bp;
        const a = fallsLP[0].run(brownL) * 0.9 + fb * 0.05, b = fallsLP[1].run(brownR) * 0.9 + fb * 0.04;
        l += a * 0.32 * k; r += b * 0.32 * k; wet += (a + b) * 0.05 * k;
      }
    }
    // --- the trench: wind moaning between the walls; quieter and quieter at the bottom ---
    {
      const k = (0.45 * win(v, V_WRECK, V_TRENCH, 0.4) + win(v, V_TRENCH, V_ROAR + 0.4, 0.4)) * (1 - 0.6 * smooth(V_BOTTOM + 1.5, V_FLOOR, v));   // (a breath of it everywhere on the open seabed)
      if (k > 0.001) {
        const a = windF[0].run(wl, 230 + 70 * Math.sin(v * 0.9) + 40 * Math.sin(v * 2.3), 0.12).bp, b = windF[1].run(wr, 330 + 90 * Math.sin(v * 0.7 + 2), 0.14).bp;
        const m = 0.6 + 0.4 * Math.sin(v * 0.8 + Math.sin(v * 0.31) * 2);
        l += a * 0.2 * k * m; r += b * 0.17 * k * (1.4 - m * 0.6); wet += (a + b) * 0.07 * k;
      }
    }
    // --- the water coming back: a far, low roar that grows until it is everything; the crash; then it is the sea again ---
    {
      const u = clamp((v - V_WAVE) / (V_HIT - V_WAVE));
      const k = (0.13 * smooth(V_ROAR - 0.15, V_ROAR + 0.7, v) + 0.95 * Math.pow(u, 2.3)) * (1 - smooth(V_HIT + 0.05, T_SWITCH - 0.1, v));
      if (k > 0.001) {
        const fc = 110 + 2600 * Math.pow(u, 2.2);
        const a = roarLP[0].run(brownL * 3 + wl * 0.25 * u, fc, 0.9).lp, b = roarLP[1].run(brownR * 3 + wr * 0.25 * u, fc * 1.1, 0.9).lp;
        const sb = roarSub.run(brownL + brownR) * 1.6;
        l += (a * 0.7 + sb * 0.6) * k; r += (b * 0.7 + sb * 0.6) * k; wet += (a + b) * 0.09 * k;
        const rv = riserF.run(white(), 300 + 4200 * u * u, 0.35).bp * u * u * 0.16 * (1 - smooth(V_HIT, V_HIT + 0.1, v));
        l += rv; r += rv;
      }
      const dt = v - V_HIT;
      if (dt > -0.03 && dt < 1.2) {
        const e = env(dt + 0.03, 0.03, 0.4) * (1 - smooth(0.5, 0.75, dt));
        const x = crashLP.run(white()) * e * 0.3;
        ph[30] += (34 + 40 * Math.exp(-Math.max(dt, 0) * 6)) / SR;
        const s = Math.sin(TAU * ph[30]) * env(dt + 0.03, 0.02, 0.5) * 0.6;
        l += x + s; r += x * 0.96 + s; wet += x * 0.3;
      }
    }
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + rl * 0.7, outR = r + rr * 0.7;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }
  {   // in the white, the soundtrack turns into the lead-in to the first frame (the sea rushing out, the crowd)
    const a = N - N0, xf = Math.round(0.36 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  // the master level: from the opening second, not from the loudest moment
  const out = (x, g) => 0.95 * Math.tanh((x * g) / 0.95);
  const openingDb = (g) => { let s = 0; for (let n = 0; n < SR; n++) { const m = (out(L[n], g) + out(R[n], g)) / 2; s += m * m; } return 10 * Math.log10(s / SR + 1e-12); };
  let lo = 0.01, hi = 100;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (openingDb(m) < TARGET_OPENING_DB) lo = m; else hi = m; }
  const gn = Math.sqrt(lo * hi);
  // the clips at their own levels (RMS over each clip's loud part), added after the master gain
  const CL = new Float32Array(N), CR = new Float32Array(N);
  for (const c of clips) {
    if (!c.data) continue;
    let s = 0, k = 0;
    for (let i = 0; i < c.data.length; i++) { const x = c.data[i]; if (Math.abs(x) > 0.02) { s += x * x; k++; } }
    const g = Math.pow(10, c.db / 20) / Math.max(Math.sqrt(s / Math.max(k, 1)), 1e-9);
    const i0 = Math.round(c.at * SR), len = Math.min(c.data.length, Math.round(2.6 * SR));
    for (let i = 0; i < len; i++) {
      const nn = i0 + i;
      if (nn < 0 || nn >= N) continue;
      const f = Math.min(1, i / (0.012 * SR), (len - i) / (0.12 * SR));
      CL[nn] += c.data[i] * f * g * 0.92; CR[nn] += c.data[i] * f * g;
    }
    console.log(`audio: ${c.name} at ${c.at.toFixed(2)} s, ${c.db} dB (${(c.data.length / SR).toFixed(2)} s long)`);
  }
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    const a = out(L[n], gn) + CL[n], b = out(R[n], gn) + CR[n];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  console.log(`audio: master gain ${gn.toFixed(3)} (opening at ${TARGET_OPENING_DB} dB)`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
