// Procedural soundtrack, synced to the same timeline as the picture.
//   node audio.mjs            -> out/soundtrack.wav
// The bed is an endless RISING pitch (a Shepard-Risset glissando, the mirror of shrink-trillion's falling one): eight
// sine tones an octave apart, all sliding up together, each fading in at the bottom and out at the top, so it seems to
// rise forever. It climbs faster the faster your speed grows, and at light speed it stops dead and holds (a chord that
// swells into the white). Under it: the street (traffic, voices, a gasp and a scream as you and the cheetah fly past
// in the first second), your footsteps and the cheetah's paws, cars and people whooshing past, the wind rising to a
// roar; the sonic boom (a double thump) and glass raining; the blast's rumble growing as the air goes off behind you;
// the fire's roar; the splash as you hit the sea, the hiss of steam; a pulse on every lap of the Earth; a soft hit on
// every named step; the slam at light speed. The loop: the track is made in one run that starts before frame 0; under
// the white it fades over into the moments just before frame 0, and the glissando is tuned so the fade joins it.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_DURATION, T_SWITCH, LOOP, STEPS, V_SOUND, V_GLOW, V_SEA, V_LIFT, V_1PC, V_C, T_WHITE, growRate, speedAt, distAt, LAP, weightAt } from './src/timeline.js';
import { rng, smooth, clamp } from './src/util.js';
import { PASSES, PLANE_PASS_S, PLANE_V } from './src/things.js';
import { HOME_PASSES } from './src/corridor.js';
import { HITS } from './src/wrecks.js';
import { tPass, V_SPACE } from './src/timeline.js';

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
const env = (dt, a, d) => (dt < 0 ? 0 : dt < a ? dt / a : Math.exp(-(dt - a) / d));
function loadClip(name, ss = 0, t = 30) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds', name);
  if (!fs.existsSync(file)) return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-t', String(t), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  return { f, pk: pk || 1, n: f.length / 2 };
}

// ---- the glissando: octaves per second (faster as your speed grows faster; zero once you hit light speed) ----
const NL = 8, FMIN = 32;
const rawRate = (t) => (0.06 + 0.13 * clamp(growRate(t), 0, 1.4)) * (1 - smooth(V_C - 0.05, V_C + 0.25, t));
function glissPos(T0, N, M) {
  const p = new Float64Array(N);
  let acc = 0;
  for (let n = 0; n < N; n++) { p[n] = acc; acc += rawRate(T0 + n / SR) / SR; }
  const o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR);
  const span = p[o0 + sw] - p[o0 + sw - M];
  const k = Math.max(1, Math.round(span)) / span;
  for (let n = 0; n < N; n++) p[n] *= k;
  return p;
}

export function makeSoundtrack(outFile) {
  const T0 = -LOOP - 2.5;
  const N = Math.round((VIDEO_DURATION - T0) * SR);
  const M = Math.round(VIDEO_DURATION * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const R0 = rng(77);
  const white = () => R0() * 2 - 1;
  const gp = glissPos(T0, N, M);
  const gph = new Float64Array(NL * 2);
  const revL = new Reverb(1), revR = new Reverb(2);
  // filters
  const windF = [new SVF(), new SVF()], roarLP = [new OnePole(80), new OnePole(80)], rum = [new OnePole(60), new OnePole(60)];
  const hissF = [new SVF(), new SVF()], fireF = [new SVF(), new SVF()], cityF = new SVF(), cityF2 = new SVF(), trafLP = new OnePole(180);
  const stepLP = new OnePole(110), stepLP2 = new OnePole(160), pawLP = new OnePole(260), boomLP = new OnePole(70), boomLP2 = new OnePole(120);
  const glassF = new SVF(), splashF = new SVF(), whooF = [new SVF(), new SVF()], subLP = new OnePole(45), slamLP = new OnePole(90);
  const bellPh = new Float64Array(3), choirPh = new Float64Array(6);
  const hitLP = new OnePole(85), hitLP2 = new OnePole(140), crackF = new SVF();
  // footsteps: your gait (same cadence as the picture: ~5 steps/s at frame 0 up to 8, fewer as you weigh less)
  const steps = [], paws = [], whoosh = [], tinkles = [];
  {
    let ph = 0, last = 0;
    for (let t = T0; t < V_LIFT; t += 1 / 1200) {
      const w = clamp(weightAt(t), 0, 1);
      const sps = (5.2 + 2.8 * smooth(-1, 4, t)) * (0.45 + 0.55 * Math.sqrt(w));
      ph += sps / 1200;
      if (Math.floor(ph) !== last) { last = Math.floor(ph); steps.push({ t, w, k: last % 2 }); }
    }
    // the cheetah: four paws a stride, 3.4 strides a second, till it drops behind
    for (let t = T0; t < 1.6; t += 1 / 3.4) for (const o of [0, 0.07, 0.38, 0.45]) paws.push(t + o / 3.4);
    // things whooshing past: cars and people while you can still hear them pass
    const r = rng(5);
    for (let t = -1; t < 5.2; t += 0.12 + r() * 0.3) whoosh.push({ t, pan: r() < 0.5 ? -0.7 : 0.7, a: 0.4 + 0.6 * r(), f: 500 + 900 * r() });
    // glass: tiny soft pings raining from the sound barrier on (no clicks: each one fades in over a few ms)
    // things you pass: a whoosh each (boats and ships, islands), a rumble burst (towers, mountains)
    for (const [ps, loud, kind] of PASSES) { const t = tPass(ps); if (t > 10.5 && t < 23) whoosh.push({ t, pan: r() < 0.5 ? -0.6 : 0.6, a: loud, f: kind === 0 ? 700 + 500 * r() : kind === 1 ? 300 + 200 * r() : 180 + 150 * r(), big: kind }); }
    for (let t = V_SOUND + 0.04; t < 9.5; t += 0.012 + r() * 0.03) tinkles.push({ t, f: 2600 + r() * 4200, d: 0.03 + r() * 0.08, a: (0.3 + 0.7 * r()) * (1 - smooth(6.5, 9.5, t)), pan: r() * 2 - 1 });
  }
  for (let n = 0; n < N; n++) {
    const t = T0 + n / SR;
    const vel = speedAt(t), lv = Math.log10(Math.max(vel, 1));
    const end = 1 - smooth(T_WHITE - 0.2, T_WHITE + 0.4, t);
    let l = 0, r = 0;
    // --- the endless rise ---
    let gl = 0, gr = 0;
    for (let k = 0; k < NL; k++) {
      const x = (((k + gp[n]) % NL) + NL) % NL / NL;        // 0 = bottom, 1 = top; climbs as gp grows
      const f = FMIN * Math.pow(2, x * NL);
      const amp = Math.pow(Math.sin(Math.PI * x), 2) * (x < 0.5 ? 1 : 1 - 0.35 * (x - 0.5));
      gph[k] += f / SR; gph[k + NL] += f * 1.0035 / SR;
      if (gph[k] > 1e6) gph[k] -= 1e6;
      if (gph[k + NL] > 1e6) gph[k + NL] -= 1e6;
      gl += Math.sin(TAU * gph[k]) * amp; gr += Math.sin(TAU * gph[k + NL]) * amp;
    }
    const gg = 0.07 * (0.8 + 0.4 * smooth(20, V_C, t) + 0.35 * smooth(V_C, T_WHITE, t)) * end;
    l += gl * gg; r += gr * gg;
    // --- the street: traffic hum and voices, gone once the boom hits ---
    const city = 1 - smooth(V_SOUND - 0.2, V_SOUND + 0.6, t);
    const traf = trafLP.run(white()) * 1.1 * city;
    const vox = (cityF.run(white(), 700 + 250 * Math.sin(t * 3.1), 2.2).bp * 0.09 + cityF2.run(white(), 1100 + 200 * Math.sin(t * 2.3), 2.5).bp * 0.065) * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + Math.sin(t * 1.7)))) * city;
    const sg = 1 + 1.0 * (1 - smooth(4.6, 5.2, t));   // the street's opening seconds a bit louder
    l += (traf + vox) * sg; r += (traf * 0.9 + vox * 1.1) * sg;
    // --- the wind: from a rush round your ears to a roar ---
    const wk = smooth(1.3, 3.6, lv);
    const wfc = 300 + 2500 * smooth(1.3, 3.0, lv);
    for (let c = 0; c < 2; c++) {
      const wn = windF[c].run(white(), wfc * (c ? 1.07 : 1), 0.8).lp;
      const g = (0.1 + 0.25 * wk) * (1 + 0.15 * Math.sin(t * (7 + c) + Math.sin(t * 2.1))) * end;
      if (c) r += wn * g * sg; else l += wn * g * sg;
    }
    // --- footsteps (soft thuds) and the cheetah's paws ---
    let st = 0;
    for (const s of steps) { const dt = t - s.t; if (dt > -0.001 && dt < 0.25) st += env(dt, 0.004, 0.05) * (0.6 + 0.4 * s.w) * (1 - smooth(3.0, 6.0, t) * 0.7); }
    const stepS = stepLP2.run(stepLP.run(white())) * st * 2.2 * sg;
    l += stepS; r += stepS;
    let pw = 0;
    for (const p of paws) { const dt = t - p; if (dt > -0.001 && dt < 0.15) pw += env(dt, 0.003, 0.03); }
    const pawS = pawLP.run(white()) * pw * 0.5 * (1 - smooth(0.6, 1.5, t));
    l += pawS * 1.3; r += pawS * 0.6;
    // --- whooshes: cars and people flashing past ---
    for (const w of whoosh) {
      const dt = t - w.t;
      if (dt > -0.12 && dt < 0.25) {
        const e = Math.exp(-Math.pow(dt / 0.06, 2)) * w.a * (w.big !== undefined ? 0.22 : 0.18 * (1 - smooth(3.5, 5.2, t)));
        const s = whooF[w.pan > 0 ? 1 : 0].run(white(), w.f * (1 - 0.4 * dt / 0.25), 1.2).bp * e;
        if (w.pan > 0) { r += s; l += s * 0.4; } else { l += s; r += s * 0.4; }
      }
    }
    // --- the airliner you overtake: a jet's roar swelling and cut off as you pass ---
    { let tp = 12.6; for (let k = 0; k < 30; k++) { tp = tPass(PLANE_PASS_S + PLANE_V * tp); } const dj = t - tp;
      if (dj > -1.2 && dj < 0.8) { const e = smooth(-1.2, -0.05, dj) * Math.exp(-Math.max(dj, 0) / 0.15); const x = whooF[0].run(white(), 900 + 600 * smooth(-1.2, 0, dj), 0.8).bp * e * 0.35; l += x; r += x * 0.8; } }
    // --- each time you pass home: a deep thud (until laps blur together) ---
    for (const hp of HOME_PASSES) { const dh = t - hp; if (dh > -0.01 && dh < 1.5 && hp < 34) { const x = Math.sin(TAU * 46 * dh) * env(dh, 0.008, 0.25) * 0.12; l += x; r += x; } }
    // --- what you go through (the ship, the tower, the mountain): a crack, a huge low boom and its rolling rumble ---
    for (const h of HITS) {
      const dh = t - h.t;
      if (dh > -0.01 && dh < 3.5) {
        const low = hitLP2.run(hitLP.run(white() * 3 * env(dh, 0.004, 0.7) + Math.sin(TAU * (50 - 14 * Math.min(dh, 1)) * dh) * 2.2 * env(dh, 0.008, 1.1)));
        const crack = crackF.run(white(), 1800, 0.7).bp * env(dh, 0.0015, 0.06) * 0.6;
        const x = (low * 0.55 + crack) * h.k;
        l += x; r += x;
      }
    }
    // --- the ring of fire from space: a deep roar swelling into the white ---
    { const ru = smooth(V_SPACE, V_SPACE + 0.8, t) * (1 - smooth(T_WHITE, T_WHITE + 0.4, t)); if (ru > 0) { const x = (rum[0].y + rum[1].y) * 0.0 + Math.sin(TAU * 41 * t) * 0.05 * ru + Math.sin(TAU * 55.3 * t) * 0.03 * ru; l += x; r += x; } }
    // --- the sonic boom: a double thump (the N-wave), then the glass ---
    const db = t - V_SOUND;
    if (db > -0.01 && db < 3) {
      const th = env(db, 0.004, 0.09) - 0.85 * env(db - 0.11, 0.004, 0.12);
      const b = boomLP2.run(boomLP.run(white() * 0.4 + th * 2.5)) * 0.5;
      l += b; r += b;
    }
    let gls = 0, glr = 0;
    for (const g of tinkles) { const dt = t - g.t; if (dt > 0 && dt < g.d * 4) { const e = Math.min(1, dt / 0.004) * Math.exp(-dt / g.d) * g.a * 0.012; const s = Math.sin(TAU * g.f * dt) * e; gls += s * (1 - g.pan) * 0.5; glr += s * (1 + g.pan) * 0.5; } }
    const glassBed = glassF.run(white(), 4200, 1.5).bp * 0.04 * smooth(V_SOUND, V_SOUND + 0.1, t) * (1 - smooth(6.0, 8.5, t));
    l += gls + glassBed; r += glr + glassBed;
    // --- the blast behind you: a deep rolling rumble that grows with the energy you dump (from Mach 2) ---
    const bl = smooth(5.1, 6.8, t) * (0.75 + 0.25 * smooth(8.5, 16, t)) * end;
    for (let c = 0; c < 2; c++) {
      const x = rum[c].run(roarLP[c].run(white()) * 6);
      const am = 0.75 + 0.25 * Math.sin(t * (2.3 + c * 0.4) + Math.sin(t * 0.9 + c));
      // a pulse per lap of the Earth once laps take under ~13 s (smooth, never a strobe)
      const laps = distAt(t) / LAP, lapRate = vel / LAP;
      const pulse = t > V_1PC ? 1 - 0.35 * smooth(0.0, 0.3, lapRate) * (1 - smooth(2.5, 4, lapRate)) * (0.5 + 0.5 * Math.cos(TAU * laps)) : 1;
      const v = x * 0.9 * bl * am * pulse;
      if (c) r += v; else l += v;
    }
    // --- the fire: the air ahead of you glowing, then you a fireball ---
    const fk = smooth(V_GLOW - 0.4, V_GLOW + 1.5, t) * end;
    for (let c = 0; c < 2; c++) {
      const x = fireF[c].run(white(), 900 + 500 * Math.sin(t * 1.3 + c), 0.6).bp * 0.16 * fk * (0.8 + 0.2 * Math.sin(t * 11 + c * 2));
      if (c) r += x; else l += x;
    }
    // --- the sea: a deep splash as you hit it, then the hiss of steam ---
    const sp = t - V_SEA;
    if (sp > -0.02 && sp < 3) { const x = splashF.run(white(), 250 + 900 * Math.exp(-Math.max(sp, 0) / 0.2), 0.7).bp * env(sp, 0.02, 0.5) * 1.4; l += x; r += x; }
    const hiss = smooth(V_SEA, V_SEA + 1, t) * (1 - 0.5 * smooth(24, 28, t)) * end;
    for (let c = 0; c < 2; c++) { const x = hissF[c].run(white(), 5500, 0.9).bp * 0.035 * hiss; if (c) r += x; else l += x; }
    // --- your feet leave the sea: a soft rising whoomph ---
    const dl = t - V_LIFT;
    if (dl > -0.3 && dl < 2) { const e = smooth(-0.3, 0.1, dl) * Math.exp(-Math.max(dl, 0) / 0.6); const x = subLP.run(white()) * 5 * e; l += x; r += x; }
    // --- a soft hit on every named step: a low boom and a bell ---
    let boom = 0, bell = 0;
    for (const h of STEPS) {
      if (Math.abs(h - V_SOUND) < 0.01) continue;
      const dt = t - h;
      if (dt > 0 && dt < 4) { boom += Math.sin(TAU * 52 * dt * (1 - 0.15 * Math.min(dt, 1))) * env(dt, 0.015, 0.6); bell += env(dt, 0.004, 1.2); }
    }
    let bellS = 0;
    for (let j = 0; j < 3; j++) bellPh[j] += [587.33, 880.0, 1174.66][j] / SR;
    if (bell > 0) bellS = (Math.sin(TAU * bellPh[0]) + 0.5 * Math.sin(TAU * bellPh[1]) + 0.25 * Math.sin(TAU * bellPh[2])) * bell * 0.028;
    boom *= 0.13 * end;
    l += boom + bellS; r += boom + bellS;
    // --- the slam at light speed: a huge low hit and a bright crash, then the held chord and a choir into the white ---
    const ds = t - V_C;
    if (ds > -0.01 && ds < 4) {
      const hit = slamLP.run(white() * 2 + Math.sin(TAU * 38 * ds) * 3) * env(ds, 0.006, 0.9) * 0.33;
      const crash = white() * env(ds, 0.01, 0.35) * 0.025;
      l += hit + crash; r += hit + crash * 0.9;
    }
    let choir = 0;
    const CF = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    for (let k = 0; k < 6; k++) { choirPh[k] += CF[k] * (1 + 0.003 * Math.sin(t * 5 + k)) / SR; choir += Math.sin(TAU * choirPh[k]) * (k < 3 ? 1 : 0.5); }
    choir *= 0.012 * (1.2 * smooth(V_C + 0.5, T_WHITE, t)) * (1 - smooth(T_WHITE, T_WHITE + 0.5, t));
    l += choir; r += choir;
    // --- reverb on the tonal parts ---
    const wet = (gl * gg + gr * gg) * 0.4 + bellS + choir + boom * 0.4;
    l += revL.run(wet * 0.6) * 0.9; r += revR.run(wet * 0.6) * 0.9;
    L[n] = l; R[n] = r;
  }
  // a gasp and a scream from the sidewalk as you and the cheetah blast past (the owner's own clips in sounds/)
  {
    const put = (clip, at, vol, pan, ss = 0) => {
      if (!clip) return;
      const n0 = Math.round((at - T0) * SR), len = clip.n;
      for (let i = 0; i < len; i++) {
        const n = n0 + i; if (n < 0 || n >= N) continue;
        const f = Math.min(1, i / (0.01 * SR), (len - i) / (0.25 * SR));
        const g = vol / clip.pk * f;
        L[n] += clip.f[2 * i] * g * (1 - Math.max(0, pan)); R[n] += clip.f[2 * i + 1] * g * (1 + Math.min(0, pan));
      }
    };
    put(loadClip('gasp.mp3'), 0.05, 0.22, 0.5);
    put(loadClip('scream.mp3', 0, 1.6), 0.55, 0.2, 0.6);
  }
  // the video's track: [0, T_SWITCH) as made; from T_SWITCH it fades over into the run's own lead-in to frame 0
  const o0 = Math.round(-T0 * SR), sw = Math.round(T_SWITCH * SR), xf = Math.round(0.35 * SR);
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
  // level by loudness (RMS -15 dB), the loud hits caught by a soft limit
  let ss = 0;
  for (let n = 0; n < M; n++) ss += OL[n] * OL[n] + OR[n] * OR[n];
  const gain = Math.pow(10, -15 / 20) / Math.sqrt(ss / (2 * M));
  for (let n = 0; n < M; n++) { OL[n] = 0.95 * Math.tanh(OL[n] * gain / 0.95); OR[n] = 0.95 * Math.tanh(OR[n] * gain / 0.95); }
  const g = 1;
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
