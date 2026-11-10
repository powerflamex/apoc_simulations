// Procedural soundtrack for "What if you grew 1 trillion times bigger?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) Cinematic, like the black hole's music: a
// minor-key drone that darkens and climbs, a trailer "braam" on every power of ten (each bigger than the last),
// sub-bass. Under it, the city while you're in it: the crowd screaming and running, car alarms, the taxi crunched
// under your toe (a soft, low crunch), the two stomps as huge booms with rolling rumbles, buildings coming down;
// then the ground giving way (a long quake rumble), Earth crushed under your shoe (one deep blast), the Sun landing
// in your hand (a warm swell with a shimmer), and a riser into the white, which runs into the street sound of the
// first frame (the loop). No sharp clicks anywhere: every impact is a soft-edged low thud.
// The man running at the camera at the start screams: the owner's clip (sounds/scream.mp3, kept out of git).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, LOOP, T_SWITCH, STAMPS, STOMP1, STOMP2, V_CAR, V_CRUSH_ROCK, V_EARTH_CRACK, V_EARTH_BURST, V_TOUCH, V_PUSH } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.7)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.87, damp = 0.35) {
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
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-Math.max(0, dt - att) / dec));

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;

  // ---- events ----
  // the braams: one on every power of ten, growing; the big moments get more
  const BIG = { '1,000x': 1.15, '1 MILLION x': 1.25, '10 MILLION x': 1.3, '1 BILLION x': 1.4, '1 TRILLION x': 1.6 };
  const HITS = STAMPS.map((st, i) => ({ t: st.v, g: (0.45 + 0.04 * i) * (BIG[st.t] || 1), f: [55, 51.9, 49, 46.25, 43.65, 41.2, 55, 51.9, 49, 46.25, 43.65, 41.2][i] }));
  // booms: [time, strength, how long the rumble rolls, delay to the camera]
  const BOOMS = [
    { t: V_CAR, g: 0.6, roll: 0.8, crunch: 1 },
    { t: STOMP1.down + 0.06, g: 1.0, roll: 3.2 },
    { t: STOMP2.down + 0.05, g: 1.2, roll: 5.0 },
    { t: V_EARTH_BURST, g: 1.35, roll: 4.0 },
    { t: V_TOUCH, g: 0.7, roll: 3.0, warm: 1 },
  ];
  // car alarms: a few cars, two-tone, starting after the taxi crunch and the first stomp
  const ALARMS = [[V_CAR + 0.3, 0.7, -0.4, 0], [STOMP1.down + 0.35, 1.0, 0.5, 1], [STOMP1.down + 0.6, 0.6, -0.7, 2], [STOMP1.down + 0.9, 0.5, 0.2, 0]];
  // the crowd: many voices, each a soft vowel that rises and falls
  const VOICES = [];
  for (let k = 0; k < 26; k++) VOICES.push({ t0: -2 + R0() * 9, dur: 0.8 + R0() * 1.6, f: 220 + R0() * 260, pan: R0() * 2 - 1, g: 0.5 + R0() * 0.5, form: 700 + R0() * 500, ph: 0, vib: 4 + R0() * 3 });
  for (let k = 0; k < 14; k++) VOICES.push({ t0: STOMP1.down + R0() * 2.2, dur: 0.7 + R0() * 1.4, f: 260 + R0() * 300, pan: R0() * 2 - 1, g: 0.6 + R0() * 0.4, form: 800 + R0() * 500, ph: 0, vib: 5 + R0() * 3 });

  // drone chords (Hz): A minor -> F -> D minor -> C minor over B flat -> a bright open fifth for the Sun
  const CHORDS = [
    [-9, [110, 130.81, 164.81, 220]],
    [12.5, [87.31, 110, 130.81, 174.61]],
    [27.5, [73.42, 110, 146.83, 174.61]],
    [37.5, [58.27, 98, 130.81, 155.56]],
    [47.5, [65.41, 98, 130.81, 196]],
  ];
  const chordAt = (t) => { let c = CHORDS[0][1]; for (const [ts, ch] of CHORDS) if (t >= ts) c = ch; return c; };

  const phases = new Float64Array(16), braamPh = new Float64Array(4), alarmPh = new Float64Array(4), warmPh = new Float64Array(4), shimPh = new Float64Array(3);
  let subPh = 0, boomPh = new Float64Array(BOOMS.length), heartPh = 0;
  const droneLP = [new OnePole(400), new OnePole(400)];
  const braamLP = new SVF();
  const cityLP = new OnePole(260), cityLP2 = new OnePole(300);
  const rumLP = new OnePole(90), rumLP2 = new OnePole(60);
  const boomLP = BOOMS.map(() => new OnePole(160));
  const crunchF = new SVF();
  const vowelF = [new SVF(), new SVF()];
  const riserF = new SVF();
  const quakeLP = new OnePole(70);
  const shimHP = new SVF();
  const revL = new Reverb(1), revR = new Reverb(2);
  let brownL = 0, brownR = 0;
  // the scream: from the first frame (the clip's voice starts ~0.1 s in), a little right of centre, like the man
  let SC = null;
  {
    const f = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', 'scream.mp3');
    if (fs.existsSync(f)) {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
      if (r.status === 0) {
        const raw = r.stdout, a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
        let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x));
        SC = { a, g: 0.5 / Math.max(pk, 1e-6), n0: Math.round(-0.06 * SR) };
      }
    } else console.warn('audio: sounds/scream.mp3 not found, the scream is left out');
  }

  for (let n = -N0; n < N; n++) {
    const t = n / SR;
    // ---- the city (fades out as you rise above it) ----
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const cityG = 0.28 * (1 - smooth(9, 13, t));
    const cl0 = cityLP.run(brownL) * cityG, cr0 = cityLP2.run(brownR) * cityG;
    // crowd voices: a saw through a vowel band, gliding (screams), soft edges
    let vl = 0, vr = 0;
    for (const vo of VOICES) {
      const dt = t - vo.t0;
      if (dt < 0 || dt > vo.dur) continue;
      const e = Math.sin(Math.PI * dt / vo.dur) ** 2 * vo.g * (1 - smooth(9, 12, t));
      const f = vo.f * (1 + 0.25 * Math.sin(Math.PI * dt / vo.dur)) * (1 + 0.012 * Math.sin(TAU * vo.vib * dt));
      vo.ph += f / SR;
      const x = saw(vo.ph) * e;
      vl += x * (1 - vo.pan) * 0.5; vr += x * (1 + vo.pan) * 0.5;
    }
    vl = vowelF[0].run(vl, 900, 0.9).bp * 0.13; vr = vowelF[1].run(vr, 950, 0.9).bp * 0.13;
    // car alarms: two soft tones alternating, distant
    let al = 0, ar = 0;
    for (const [t0, g, pan, kind] of ALARMS) {
      const dt = t - t0;
      if (dt < 0) continue;
      const fade = Math.min(1, dt / 0.08) * (1 - smooth(8.5, 12, t));
      if (fade <= 0) continue;
      const hi = Math.floor(dt / (kind === 1 ? 0.18 : 0.42)) % 2 === 0;
      const f = kind === 1 ? (hi ? 1180 : 980) : kind === 2 ? 880 + 300 * Math.sin(TAU * 1.6 * dt) : (hi ? 760 : 640);
      alarmPh[kind] += f / SR;
      const x = Math.sin(TAU * alarmPh[kind]) * 0.018 * g * fade;
      al += x * (1 - pan) * 0.5; ar += x * (1 + pan) * 0.5;
    }

    // ---- the booms ----
    let boom = 0, crunch = 0, warm = 0;
    BOOMS.forEach((b, i) => {
      const dt = t - b.t;
      if (dt < -0.01 || dt > b.roll + 1.5) return;
      // the thump: a sine that drops 70 -> 28 Hz, a soft attack
      const f = 28 + 42 * Math.exp(-Math.max(dt, 0) / 0.18);
      boomPh[i] += f / SR;
      const e = env(dt, 0.012, 0.55) * b.g;
      boom += Math.sin(TAU * boomPh[i]) * e * 0.9;
      // the rolling rumble after it: low noise, slowly dying
      boom += boomLP[i].run(white()) * env(dt, 0.05, b.roll * 0.45) * b.g * 2.2;
      if (b.crunch) crunch += crunchF.run(white(), 420 + 300 * Math.exp(-dt / 0.1), 0.6).bp * env(dt, 0.006, 0.14) * 1.3;
      if (b.warm) {
        [130.81, 196, 261.63, 392].forEach((fw, k) => { warmPh[k] += fw / SR; warm += Math.sin(TAU * warmPh[k]) * [0.5, 0.35, 0.3, 0.15][k]; });
        warm *= env(dt, 0.4, 2.2) * 0.08;
      }
    });
    // the ground groaning under your weight while you grow in the city (a deep, slowly surging rumble)
    const groan = rumLP2.run(white()) * 2.4 * (0.5 + 0.5 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1)) * (0.55 + 0.45 * smooth(-1, 8, t)) * (1 - smooth(12, 16, t)) * 0.5;
    // buildings coming down after the stomps, and the long quake once the rock fails
    const collapse = rumLP.run(white()) * (0.5 * smooth(7.6, 8.6, t) * (1 - smooth(11, 14, t)) + 0.55 * smooth(17, 18, t) * (1 - smooth(20, 23, t))) * 1.6;
    const quakeG = 0.65 * smooth(V_CRUSH_ROCK - 0.4, V_CRUSH_ROCK + 1.5, t) * (1 - smooth(31, 34, t)) + 0.7 * smooth(V_EARTH_CRACK - 0.2, V_EARTH_CRACK + 0.6, t) * (1 - smooth(V_EARTH_BURST, V_EARTH_BURST + 0.3, t));
    subPh += (31 + 5 * Math.sin(t * 0.7)) / SR;
    const quake = (Math.sin(TAU * subPh) * 0.35 + quakeLP.run(white()) * 2.6) * quakeG * (0.7 + 0.3 * Math.sin(t * 6.1) * Math.sin(t * 2.3));

    // ---- the music ----
    const ch = chordAt(t);
    const dG = 0.1 * (0.6 + 0.4 * smooth(-1, 6, t)) * (1 + 0.5 * smooth(25, 55, t));
    const cutoff = 300 + 900 * smooth(5, 55, t) + 1500 * smooth(V_PUSH - 1, T_SWITCH, t);
    droneLP[0].set(cutoff); droneLP[1].set(cutoff * 1.07);
    let dl = 0, dr = 0;
    for (let k = 0; k < ch.length; k++) {
      const bend = 1 + 0.05 * Math.pow(smooth(V_PUSH - 2, T_SWITCH, t), 2);
      const f = ch[k] * bend;
      phases[k] += (f * 0.997) / SR;
      phases[k + 4] += (f * 1.003) / SR;
      dl += saw(phases[k]) * (k === 0 ? 0.9 : 0.6);
      dr += saw(phases[k + 4]) * (k === 0 ? 0.9 : 0.6);
    }
    dl = droneLP[0].run(dl) * dG;
    dr = droneLP[1].run(dr) * dG;
    let braam = 0;
    for (const h of HITS) {
      const dt = t - h.t;
      if (dt > -0.01 && dt < 6) {
        const e = env(dt, 0.05, 1.7) * h.g;
        for (let k = 0; k < 4; k++) braamPh[k] += (h.f * [1, 1.004, 2, 3.01][k]) / SR;
        braam += (saw(braamPh[0]) + saw(braamPh[1]) + 0.5 * saw(braamPh[2]) + 0.25 * saw(braamPh[3])) * e;
      }
    }
    braam = braamLP.run(braam, 850, 0.6).lp * 0.15;
    // your heartbeat in space: two soft low beats every 0.85 s
    let heart = 0;
    if (t > 22 && t < V_PUSH + 1) {
      const hp = (t * 1.18) % 1;
      const b1 = env(hp, 0.01, 0.06), b2 = env(hp - 0.16, 0.01, 0.07) * 0.7;
      heartPh += 48 / SR;
      heart = Math.sin(TAU * heartPh) * (b1 + b2) * 0.2 * smooth(22, 26, t) * (1 - smooth(V_PUSH, V_PUSH + 1, t));
    }
    // the Sun in your hand: a high glassy shimmer that grows into the riser
    let shim = 0;
    const shG = 0.03 * smooth(V_TOUCH - 0.5, V_TOUCH + 1.5, t) * (t < T_SWITCH ? 1 : 0);
    if (shG > 0) {
      for (let k = 0; k < 3; k++) { shimPh[k] += ([1318.5, 1760, 2637][k] * (1 + 0.002 * Math.sin(t * (3 + k)))) / SR; shim += Math.sin(TAU * shimPh[k]) * (0.5 + 0.5 * Math.sin(t * (2 + k * 1.3))); }
      shim *= shG;
    }
    // the riser into the white
    let riser = 0;
    if (t > V_PUSH - 1.5 && t < T_SWITCH + 0.2) {
      const k = smooth(V_PUSH - 1.5, T_SWITCH, t);
      riser = riserF.run(white(), 300 + 4200 * k * k, 0.3).bp * k * k * 0.26 * (1 - smooth(T_SWITCH, T_SWITCH + 0.2, t));
    }

    const wet = (dl + dr) * 0.5 + braam * 0.8 + shim + warm + vl * 0.5 + vr * 0.5;
    const rl = revL.run(wet * 0.55), rr = revR.run(wet * 0.55);
    const low = boom * 0.55 + quake + collapse + groan;
    const outL = cl0 + cr0 * 0.2 + vl + al + dl + braam + low + crunch + heart + shim + warm + riser + rl * 0.9;
    const outR = cr0 + cl0 * 0.2 + vr + ar + dr + braam + low + crunch + heart + shim * 0.9 + warm + riser + rr * 0.9;
    let scL = 0, scR = 0;
    if (SC) {
      const i = n - SC.n0;
      if (i >= 0 && i < SC.a.length) {
        const k = Math.min(1, (SC.a.length - i) / (0.08 * SR));   // a soft end
        const x = SC.a[i] * SC.g * k;
        scL = x * 0.45; scR = x * 0.55;
      }
    }
    const oL = outL + scL, oR = outR + scR;
    if (n < 0) { PL[n + N0] = oL; PR[n + N0] = oR; } else { L[n] = oL; R[n] = oR; }
  }

  {   // in the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.45 * SR);
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
