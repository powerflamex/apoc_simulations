// Soundtrack for "What if a nuke hit your city? Survive the first hour" (no voice), synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// Mostly what you would hear, with a quiet low pad under the hour after for feeling. The bomb itself makes no sound for
// 47 seconds: its sound travels with the blast.
//   - the flash-forward: the wall's roar coming up the hill, the hit, into the white;
//   - the evening street: traffic, people talking, your phone's text chimes;
//   - the flash: silence from the bomb; tyres, cries, two crashes, the transformers popping, car alarms, people running,
//     the fire's roar growing, your heartbeat speeding up, sirens far off, the helicopter;
//   - the hit (slowed down 3x on the video, so its sound is slowed too): the roar, the windows bursting, the stairwell
//     door slamming; behind the door, muffled roar and rattling; the wind coming back, the door banging open; ringing ears;
//   - the hour: fire everywhere, the wind rising toward it (the firestorm), the slab falling, the gas main, the park's
//     wide roar and murmur, the garage's echo, the radio's alert tone, the texts, the sirens; a riser into the white,
//     a soft chord under the closing question.
// Every onset is soft (5 ms+): no clicks or clacks. The master gain puts the evening street at about -26 dB RMS and a soft
// limiter keeps the blast under full scale.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, NOTES, POPS, CHAPTERS, GAS, SLAB_FALL, V_RADIO, V_TEXT, V_SIREN, V_WHITE, storyOf, shotAt } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_DB = -23;

class OnePole { constructor(fc) { this.y = 0; this.set(fc); } set(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); } run(x) { return (this.y += this.a * (x - this.y)); } }
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
  constructor(seed, size = 1.6) {
    const r = rng(seed);
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * size)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.86, damp = 0.35) {
    let y = 0;
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));
// video time of a story moment (inside one chapter)
function videoOf(t, from = 5) { let a = from, b = VIDEO_DURATION; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (storyOf(m) < t) a = m; else b = m; } return (a + b) / 2; }

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(7171);
  const white = () => R0() * 2 - 1;

  // key moments on the video clock
  const V_FLASH = 12.0;
  const vt = (t) => videoOf(t);                    // story t (first 60 s) -> video
  const V_HIT = vt(47.0), V_SLAM = vt(47.2), V_BACK = vt(54.4);
  const V_CRASH = V_FLASH + 5.1, V_POWER = V_FLASH + 7.7, V_RUN = V_FLASH + 13.9, V_HEAT = V_FLASH + 20, V_HELI = V_FLASH + 28.7;
  const V_SLAB = SLAB_FALL.v + Math.sqrt((SLAB_FALL.y - 0.6) / 4.9);

  // ---- one-shot events in half-second buckets: { t, d, fn(ev, dt) -> [l, r, wet] } ----
  const B = Array.from({ length: Math.ceil(VIDEO_DURATION * 2) + 2 }, () => []);
  const ev = (o) => { for (let k = Math.max(0, Math.floor(o.t * 2)); k <= Math.min(B.length - 1, Math.floor((o.t + o.d) * 2)); k++) B[k].push(o); };
  const pan = (x, p) => [x * (1 - p) * 0.5, x * (1 + p) * 0.5];
  // a soft thump (sub + body)
  const thump = (t, g, f0 = 55, dec = 0.5, p = 0, wetK = 0.6) => ev({ t, d: dec * 6, ph: 0, fl: new SVF(), fn(e, dt) {
    e.ph += (f0 * (1 - 0.4 * Math.min(dt * 2, 1))) / SR;
    const x = (Math.sin(TAU * e.ph) + e.fl.run(white(), f0 * 4, 0.6).bp * 0.5) * smooth(0, 0.012, dt) * Math.exp(-dt / dec) * g;
    const [a, b] = pan(x, p); return [a, b, x * wetK];
  } });
  // a burst of filtered noise (glass, metal, crackle)
  const tick = (t, d, f, g, p = 0, q = 0.5, wetK = 0.6) => ev({ t, d, fl: new SVF(), fn(e, dt) {
    const x = e.fl.run(white(), f, q).bp * smooth(0, 0.005, dt) * (1 - smooth(d * 0.4, d, dt)) * g;
    const [a, b] = pan(x, p); return [a, b, x * wetK];
  } });
  // a chime (phone)
  const chime = (t, fs, g, p = 0.2) => fs.forEach((f, k) => ev({ t: t + k * 0.13, d: 0.6, ph: 0, fn(e, dt) {
    e.ph += f / SR;
    const x = (Math.sin(TAU * e.ph) + 0.25 * Math.sin(TAU * e.ph * 2)) * smooth(0, 0.006, dt) * Math.exp(-dt / 0.16) * g;
    const [a, b] = pan(x, p); return [a, b, x * 0.4];
  } }));
  // a cry (formant-filtered voice-ish), never close
  const cry = (t, g, p) => { const f = 260 + R0() * 280, d = 0.5 + R0() * 0.8, vow = R0(); ev({ t, d, ph: 0, a: new SVF(), b: new SVF(), fn(e, dt) {
    e.ph += f * (1.25 - 0.35 * dt / d + 0.02 * Math.sin(dt * 30)) / SR;
    const s = saw(e.ph);
    const x = (e.a.run(s, 700 + 200 * vow, 0.3).bp + 0.6 * e.b.run(s, 1150 + 450 * vow, 0.3).bp) * Math.sin(Math.PI * dt / d) * g;
    const [a, b] = pan(x, p); return [a, b, x * 0.6];
  } }); };
  const glassBurst = (t0, spread, n, g, wetK = 0.8) => { for (let k = 0; k < n; k++) tick(t0 + Math.pow(R0(), 1.5) * spread, 0.05 + R0() * 0.14, 2400 + R0() * 4200, g * (0.5 + R0()), R0() * 1.6 - 0.8, 0.5, wetK); };
  const debris = (t0, spread, n, g) => { for (let k = 0; k < n; k++) { const t = t0 + R0() * spread; tick(t, 0.06 + R0() * 0.1, 500 + R0() * 1500, g * (0.4 + R0()), R0() * 1.6 - 0.8, 0.6); if (R0() < 0.3) thump(t, g * 0.5, 70 + R0() * 50, 0.12, R0() - 0.5); } };

  // the flash-forward's hit and the real one
  thump(4.6, 1.0, 34, 0.9); glassBurst(4.6, 0.3, 50, 0.05);
  thump(V_HIT, 1.0, 30, 1.6); glassBurst(V_HIT, 0.9, 120, 0.05);
  thump(V_SLAM, 0.9, 62, 0.35, 0.2, 0.9);                                // the door
  debris(V_SLAM + 0.3, 6.5, 70, 0.025);                                  // things hitting the door and the walls
  thump(V_BACK, 0.6, 58, 0.3, 0.3, 0.9); tick(V_BACK + 0.02, 0.2, 900, 0.08, 0.3, 0.4);   // banged open
  // the evening: texts; the street after the flash: tyres, cries, crashes, transformers, the helicopter's crash
  for (const [t, , kind] of NOTES) {
    if (kind === 'msg') chime(t, [1320, 1760], 0.035);
    else if (kind === 'me') chime(t, [880], 0.025, -0.1);
    else if (kind === 'sys') chime(t, [660, 520], 0.03);
  }
  for (const [t, , kind, , , status] of NOTES) if (kind === 'me' && status === 'Not Delivered') chime(t + 1.4, [520, 390], 0.03, -0.1);
  for (const [t, , kind, , , status] of NOTES) if (kind === 'me' && status === 'Delivered') chime(t + 1.1, [1046, 1568], 0.03, -0.1);
  for (let k = 0; k < 7; k++) ev({ t: V_FLASH + 0.3 + R0() * 1.6, d: 1.4, fl: new SVF(), f: 900 + R0() * 700, g: 0.012 + R0() * 0.01, p: R0() * 1.6 - 0.8, fn(e, dt) {
    const x = e.fl.run(white(), e.f * (1 + 0.06 * Math.sin(dt * 34)), 0.09).bp * smooth(0, 0.05, dt) * (1 - smooth(1.1, 1.4, dt)) * e.g; const [a, b] = pan(x, e.p); return [a, b, x * 0.5];
  } });
  for (let k = 0; k < 6; k++) cry(V_FLASH + 0.5 + R0() * 3, 0.008, R0() * 1.6 - 0.8);
  for (let k = 0; k < 10; k++) cry(V_RUN + R0() * 4, 0.007, R0() * 1.6 - 0.8);
  for (const [t, p] of [[V_CRASH, -0.3], [V_CRASH + 0.75, 0.5]]) { thump(t, 0.2, 64, 0.14, p); debris(t, 0.5, 18, 0.02); }
  for (let k = 0; k < 6; k++) { const t = V_POWER + [0.15, 0.45, 0.72, 0.98, 1.2, 1.42][k], near = 0.1 + k * 0.17; thump(t, 0.06 + 0.12 * near, 70, 0.12, (k % 2 ? 1 : -1) * 0.5); tick(t, 0.08, 900 + 1300 * near, 0.15 * near, (k % 2 ? 1 : -1) * 0.5); }
  thump(V_HELI + 0.3, 0.12, 48, 0.45, 0.4); debris(V_HELI + 0.35, 0.8, 12, 0.012);
  // the hour: the slab, the gas main, far collapses
  thump(V_SLAB, 0.5, 52, 0.4, 0.5); debris(V_SLAB, 1.4, 40, 0.03);
  thump(GAS.t, 1.0, 38, 0.9, 0.3); debris(GAS.t + 0.2, 2.4, 40, 0.03);
  for (let k = 0; k < 8; k++) thump(74 + R0() * 90, 0.06 + R0() * 0.06, 40 + R0() * 20, 0.8, R0() * 1.6 - 0.8, 1.2);
  // popups and chapter stamps: a soft low hit
  for (const [t] of POPS) thump(t, 0.11, 44, 0.5, 0, 1.0);
  for (const c of CHAPTERS) thump(c.v, 0.14, 40, 0.7, 0, 1.0);

  // ---- continuous layers ----
  const cityLP = new OnePole(220), cityLP2 = new OnePole(260);
  const talkF = Array.from({ length: 5 }, () => new SVF()), talkE = Array.from({ length: 5 }, () => new OnePole(3));
  const humF = new OnePole(700), sirenF = [new SVF(), new SVF(), new SVF(), new SVF()];
  const fireLP = new OnePole(150), fireF = new SVF(), crk = Array.from({ length: 4 }, () => ({ t: -1, f: 1500, g: 0, fl: new SVF() }));
  const windF = [new SVF(), new SVF()], windLP = new OnePole(90);
  const roarF = [new SVF(), new SVF(), new SVF()], roarSub = new OnePole(55), muff = new OnePole(300), muff2 = new OnePole(300);
  const feetF = new SVF(), stepF = new SVF(), rotorLP = new OnePole(260), alarmF = [new SVF(), new SVF()];
  const padF = [new SVF(), new SVF()], radioF = [new SVF(), new SVF()], radioE = new OnePole(4), murF = [new SVF(), new SVF(), new SVF()];
  const revL = new Reverb(11), revR = new Reverb(12), garL = new Reverb(21, 0.9), garR = new Reverb(22, 0.9);
  const ph = new Float64Array(64);
  let brownL = 0, brownR = 0;
  const shotOf = (v) => shotAt(v).scene;

  for (let n = 0; n < N; n++) {
    const v = n / SR;
    const t = storyOf(v);
    const shot = shotOf(v);
    let l = 0, r = 0, wet = 0, gwet = 0;
    const ff = v < 5;
    const evening = v >= 5 && v < V_FLASH;
    const pre = v >= 5 && v < V_HIT;                        // before the blast, outside or at the door
    const inside = shot === 'stairs' || shot === 'lobby' || shot === 'garage';
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;

    // --- the evening street (and the flash-forward's last second fading into it): traffic and talk ---
    {
      const g = (evening ? 1 : 0) * smooth(4.95, 5.25, v) + (v >= V_FLASH && v < V_FLASH + 6 ? 1 - smooth(V_FLASH + 1, V_FLASH + 5, v) : 0);
      if (g > 0) {
        const tr = 0.16 * g;
        l += cityLP.run(brownL) * tr; r += cityLP2.run(brownR) * tr;
        let cv = 0;
        for (let q = 0; q < 5; q++) {
          const amp = talkE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.7) + q * 1.3) + white() * 0.2));
          cv += talkF[q].run(white(), 360 + q * 230 + 90 * Math.sin(v * (1.1 + q * 0.3)), 0.25).bp * amp;
        }
        const talk = g * (v < V_FLASH ? 1 : 1 - smooth(V_FLASH + 0.2, V_FLASH + 2, v));
        l += cv * 0.025 * talk; r += cv * 0.023 * talk;
      }
    }
    // --- the city's hum until the blackout ---
    if (v >= 5 && v < V_POWER + 1.5) { ph[2] += 120 / SR; const hv = humF.run(saw(ph[2]) + 0.4 * saw(ph[2] * 2.003)) * 0.01 * (1 - smooth(V_POWER + 1.4, V_POWER + 1.45, v)); l += hv; r += hv; }
    // --- car alarms (from the flash on, until the blast) ---
    if (v > V_FLASH + 0.4 && v < V_HIT) {
      for (let q = 0; q < 2; q++) {
        const dt = v - (V_FLASH + 0.4 + q * 9);
        if (dt < 0) continue;
        const f = (760 + 300 * q) * (1 + 0.35 * (0.5 + 0.5 * Math.sin(dt * (3.1 - q * 0.8) * TAU)));
        ph[8 + q] += f / SR;
        const av = alarmF[q].run(saw(ph[8 + q]), 1600 - 400 * q, 0.6).lp * (0.01 - 0.004 * q) * smooth(0, 0.03, dt);
        l += av * (q ? 0.3 : 0.7); r += av * (q ? 0.7 : 0.3); wet += av * 1.5;
      }
    }
    // --- the crowd running ---
    { const g = smooth(V_RUN, V_RUN + 1.5, v) * (1 - smooth(V_RUN + 4, V_RUN + 10, v)); if (g > 0) { const tk = Math.pow(0.5 + 0.5 * Math.sin(v * 17) * Math.sin(v * 11.3 + 1), 2); const fv = feetF.run(white(), 500, 0.5).bp * 0.025 * g * (0.5 + tk); l += fv; r += fv * 0.92; } }
    // --- the helicopter, faint ---
    if (v > V_FLASH && v < V_HELI) { ph[50] += (11 + 7 * Math.max(0, v - (V_HELI - 3.1))) / SR; const cyc = ph[50] % 1; const rv = rotorLP.run(white()) * (0.25 + 0.75 * Math.exp(-cyc * 6)) * 0.1 * smooth(V_FLASH + 4, V_FLASH + 14, v); l += rv * 0.6; r += rv * 0.9; }
    // --- your heartbeat, faster and louder while you wait for the blast ---
    if (v > V_FLASH + 1 && v < V_HIT + 0.2) {
      const bpm = 78 + 70 * smooth(V_FLASH + 1, V_HIT - 2, v);
      ph[12] += bpm / 60 / SR;
      const c = ph[12] % 1;
      const beat = env(c, 0.012, 0.07) + 0.7 * env(c - 0.28, 0.012, 0.06);
      ph[13] += 48 / SR;
      const hb = Math.sin(TAU * ph[13]) * beat * 0.24 * smooth(V_FLASH + 1, V_FLASH + 6, v) * (0.7 + 0.5 * smooth(V_FLASH + 30, V_HIT, v));
      l += hb; r += hb;
    }
    // --- far sirens before the blast; near sirens at the very end ---
    {
      const g = smooth(V_FLASH + 9, V_FLASH + 16, v) * (v < V_HIT ? 1 : 0) * 0.0028 + smooth(V_SIREN - 1.5, V_SIREN + 3, v) * (1 - smooth(V_WHITE + 1.4, V_WHITE + 1.9, v)) * 0.02;
      if (g > 0) {
        for (let q = 0; q < 2; q++) {
          const f = 640 + 90 * q + 260 * Math.sin(v * (1.3 + 0.4 * q) + q * 2) + 100 * Math.sin(v * 0.7 + 1);
          ph[4 + q] += f / SR;
          const sv = sirenF[q].run(saw(ph[4 + q]), 1400, 0.6).lp * g;
          l += sv * (q ? 1 : 0.6); r += sv * (q ? 0.6 : 1);
          if (shot === 'garage') gwet += sv * 2.2; else wet += sv * 3;
        }
      }
    }
    // --- the fire: from the first flames by the street to the end of the walk; muffled indoors, wide in the park ---
    {
      let g = 0;
      if (ff) g = 1;
      else if (pre) g = smooth(V_HEAT - 2, V_HEAT + 8, v) * (shot === 'street' && t > 41.5 ? 0.6 : 1);
      else if (shot === 'stairs') g = 0.45;
      else if (shot === 'lobby') g = 0.4 + 0.5 * smooth(84, 92, v);
      else if (shot === 'after' || shot === 'burning' || shot === 'walk') g = 1.0 + 0.4 * smooth(128, 200, v);
      else if (shot === 'park') g = 0.6;
      else if (shot === 'garage') g = 0.18 * (1 - smooth(216, 222, v)) + 0.08;
      if (g > 0) {
        const w = white();
        const roar = fireLP.run(w) * 0.5 + fireF.run(w, 260 + 90 * Math.sin(v * 2.3), 0.7).bp * 0.12;
        let cr = 0;
        for (const c of crk) {
          if (v - c.t > 0.06 && R0() < 0.0012) { c.t = v; c.f = 1200 + R0() * 2400; c.g = 0.3 + 0.7 * R0(); }
          const dt = v - c.t;
          if (dt >= 0 && dt < 0.06) cr += c.fl.run(white(), c.f, 0.6).bp * smooth(0, 0.004, dt) * Math.exp(-dt / 0.014) * c.g;
        }
        const crK = shot === 'park' || shot === 'garage' || shot === 'stairs' ? 0.2 : 1;
        const fv = (roar * 0.38 + cr * 0.12 * crK) * g;
        l += fv; r += fv * 0.93; wet += fv * 0.3;
      }
    }
    // --- the wind: the fires pulling air in, rising through the hour (the firestorm), wide in the park ---
    {
      const storm = smooth(700, 1900, t);
      let g = 0;
      if (shot === 'after') g = 0.25;
      else if (shot === 'burning') g = 0.3 + 0.7 * smooth(129, 134, v);
      else if (shot === 'walk') g = 1.1;
      else if (shot === 'park') g = 0.9;
      else if (shot === 'garage') g = 0.15 * (1 - smooth(215, 221, v));
      g *= 0.4 + 0.6 * storm;
      if (g > 0) {
        const gust = 0.7 + 0.3 * Math.sin(v * 0.5) * Math.sin(v * 0.31 + 1);
        const fc = 380 + 300 * gust;
        const wl = windF[0].run(white(), fc, 0.8).bp, wr = windF[1].run(white(), fc * 1.07, 0.8).bp;
        const lo = windLP.run(white()) * 2;
        l += (wl * 0.15 + lo * 0.12) * g * gust; r += (wr * 0.15 + lo * 0.12) * g * gust;
      }
    }
    // --- the blast's roar: coming up the hill in the flash-forward; the hit; muffled behind the door; gone by ~10 s ---
    {
      let g = 0, fc = 1600, mu = 0;
      if (ff) { g = 0.25 + 0.75 * smooth(1.0, 4.6, v); g *= 1 - smooth(4.75, 5.05, v); fc = 900 + 900 * smooth(3, 4.6, v); }
      else if (v >= V_HIT - 0.15 && v < V_SLAM) { g = smooth(V_HIT - 0.15, V_HIT + 0.05, v); fc = 700; }          // (slowed: deeper)
      else if (v >= V_SLAM && v < V_BACK + 3) { g = 1 - smooth(V_SLAM + 2, V_BACK + 2.5, v) * 0.85; fc = 600; mu = 1; }
      if (g > 0) {
        const w = white();
        let rv = roarF[0].run(w, fc, 0.6).bp + roarF[1].run(w, fc * 0.45, 0.7).bp * 0.8 + roarSub.run(white()) * 3;
        if (mu) rv = muff.run(rv) * 1.4;
        rv *= 0.3 * g;
        l += rv; r += mu ? muff2.run(roarF[2].run(w, fc * 1.1, 0.6).bp) * 0.3 * g + roarSub.y * 0.9 * g : roarF[2].run(w, fc * 1.1, 0.6).bp * 0.3 * g + roarSub.y * 0.9 * g;
        wet += rv * 0.25;
      }
    }
    // --- in the stairwell: the building groaning, things settling, the city's roar through the walls ---
    if (shot === 'stairs') {
      const g = smooth(V_SLAM + 1, V_SLAM + 4, v);
      const x = muff.run(brownL) * 0.1 * g + muff2.run(white()) * 0.05 * g;
      l += x; r += x * 0.95;
      if (R0() < 0.00006) debris(v + 0.01, 0.6, 5, 0.02);
    }
    // --- the wind coming back ---
    { const dt = v - (V_BACK - 0.6); if (dt > 0 && dt < 6) { const g = smooth(0, 0.6, dt) * Math.exp(-Math.max(dt - 0.6, 0) / 1.6); const x = windF[0].run(white(), 500 + 400 * g, 0.7).bp * 0.12 * g; l += x; r += x * 0.9; wet += x * 0.5; } }
    // --- ringing ears after the hit ---
    { const dt = v - V_SLAM; if (dt > 0 && dt < 9) { ph[20] += 3900 / SR; const x = Math.sin(TAU * ph[20]) * 0.01 * smooth(0, 0.4, dt) * Math.exp(-dt / 3.5); l += x; r += x; } }
    // --- footsteps (crunching on glass and rubble) when you walk ---
    {
      const walking = shot === 'lobby' || shot === 'walk' || (shot === 'street' && t > 42.6 && t < 45.2) || (shot === 'park' && v > 208.5) || (shot === 'garage' && v < 221);
      if (walking) {
        const rate = shot === 'street' ? 3.2 : 1.8;
        ph[22] += rate / SR;
        const c = ph[22] % 1;
        const st = stepF.run(white(), shot === 'garage' ? 900 : 2200, 0.7).bp * env(c, 0.006, shot === 'lobby' ? 0.06 : 0.035) * (shot === 'lobby' ? 0.14 : 0.08);
        l += st; r += st * 0.9; if (shot === 'garage') gwet += st * 1.5; else wet += st * 0.3;
      }
    }
    // --- people: murmur after the blast, on the street, in the park, in the garage ---
    {
      const g = shot === 'after' ? 0.7 : shot === 'park' ? 1 : shot === 'garage' ? 0.9 * (1 - smooth(V_SIREN - 1, V_SIREN + 2, v)) + 0.6 * smooth(V_SIREN + 0.5, V_SIREN + 2.5, v) : shot === 'burning' ? 0.45 : shot === 'walk' ? 0.35 : 0;
      if (g > 0) {
        let cv = 0;
        for (let q = 0; q < 3; q++) {
          const amp = talkE[q].run(Math.max(0, Math.sin(v * (1.7 + q * 0.6) + q) + white() * 0.25));
          cv += murF[q].run(white(), 300 + q * 260 + 70 * Math.sin(v * (0.9 + q * 0.3)), 0.3).bp * amp;
        }
        const x = cv * 0.05 * g;
        l += x; r += x * 0.95; if (shot === 'garage') gwet += x * 2; else wet += x * 0.4;
      }
    }
    // --- the radio in the garage: the alert tone, then a voice too far to make out ---
    {
      const t0 = V_RADIO;
      const dt = v - t0;
      if (dt > -0.2 && dt < 26 && shot === 'garage') {
        if (dt > 0 && dt < 2.4) {
          ph[30] += 853 / SR; ph[31] += 960 / SR;
          const x = (Math.sin(TAU * ph[30]) + Math.sin(TAU * ph[31])) * 0.03 * smooth(0, 0.02, dt) * (1 - smooth(2.3, 2.4, dt));
          l += x * 1.1; r += x * 0.6; gwet += x * 1.5;
        }
        if (dt > 2.7) {
          const syl = radioE.run(Math.max(0, Math.sin(dt * 9.5) * Math.sin(dt * 3.1 + 1) + 0.15 * white()));
          ph[32] += (120 + 15 * Math.sin(dt * 2)) / SR;
          const src = saw(ph[32]) + 0.3 * white();
          const x = (radioF[0].run(src, 700 + 250 * Math.sin(dt * 4.1), 0.4).bp + 0.6 * radioF[1].run(src, 1700 + 300 * Math.sin(dt * 3.3), 0.4).bp) * syl * 0.045 * (1 - smooth(20, 26, dt));
          l += x * 1.1; r += x * 0.6; gwet += x * 1.2;
        }
      }
    }
    // --- a quiet low pad under the hour (minor, darkening; it opens up when the text gets through) ---
    {
      const g = smooth(64, 70, v) * (1 - smooth(V_WHITE + 1.4, V_WHITE + 2.0, v)) * 0.6 + smooth(V_WHITE + 2.2, V_WHITE + 3.6, v) * (1 - smooth(VIDEO_DURATION - 1.5, VIDEO_DURATION, v)) * 0.8;
      if (g > 0) {
        const lift = smooth(V_TEXT + 1, V_TEXT + 3.5, v);
        const roots = [55, 65.41, 82.41, 98.0 + 5.83 * lift];                // A, C (->), E, G -> A
        let x = 0;
        for (let q = 0; q < 4; q++) { ph[40 + q] += roots[q] * (q === 1 ? 1 + 0.26 * lift : 1) / SR; ph[44 + q] += roots[q] * 1.003 / SR; x += (saw(ph[40 + q]) + saw(ph[44 + q])) * (q === 0 ? 1 : 0.6); }
        const fc = 300 + 200 * Math.sin(v * 0.05) + 500 * lift;
        const pv = padF[0].run(x, fc, 0.9).lp * 0.035 * g;
        l += pv; r += padF[1].run(x, fc * 1.05, 0.9).lp * 0.035 * g; wet += pv * 0.8;
      }
    }
    // --- the riser into the white at the end ---
    { const dt = v - (V_WHITE - 2.8); if (dt > 0 && v < V_WHITE + 1.7) { const g = smooth(0, 4.3, dt); ph[60] += (200 + 900 * g * g) / SR; const x = (saw(ph[60]) * 0.4 + white() * 0.5) * 0.04 * g * g * (1 - smooth(V_WHITE + 1.5, V_WHITE + 1.7, v)); l += x; r += x; wet += x * 0.3; } }

    // --- one-shot events ---
    const bk = B[Math.floor(v * 2)];
    if (bk) for (const e of bk) {
      const dt = v - e.t;
      if (dt < 0 || dt > e.d) continue;
      const [a, b, w] = e.fn(e, dt);
      if (shot === 'stairs' && e.t > V_SLAM - 0.01) { l += a * 0.7; r += b * 0.7; wet += w * 1.3; }
      else if (shot === 'garage') { l += a; r += b; gwet += w; }
      else { l += a; r += b; wet += w; }
    }

    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const gl = garL.run(gwet * 0.5, 0.82, 0.3), gr = garR.run(gwet * 0.5, 0.82, 0.3);
    L[n] = l + rl * 0.8 + gl * 0.9; R[n] = r + rr * 0.8 + gr * 0.9;
  }

  // the master gain: the evening street (5..11 s) at TARGET_DB; a soft limit keeps the blast's peaks under full scale
  const out = (x, g) => 0.95 * Math.tanh((x * g) / 0.95);
  const a0 = Math.round(5.5 * SR), a1 = Math.round(11.5 * SR);
  const evDb = (g) => { let s = 0; for (let n = a0; n < a1; n++) { const m = (out(L[n], g) + out(R[n], g)) / 2; s += m * m; } return 10 * Math.log10(s / (a1 - a0) + 1e-12); };
  let lo = 0.01, hi = 100;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (evDb(m) < TARGET_DB) lo = m; else hi = m; }
  const gn = Math.sqrt(lo * hi);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) {
    const a = out(L[n], gn), b = out(R[n], gn);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`soundtrack went NaN at ${(n / SR).toFixed(3)} s`);
    buf.writeInt16LE(Math.round(clamp(a, -1, 1) * 32767), 44 + n * 4);
    buf.writeInt16LE(Math.round(clamp(b, -1, 1) * 32767), 46 + n * 4);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return outFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  console.log('wrote', makeSoundtrack(path.join(ROOT, 'out', 'soundtrack.wav')));
}
