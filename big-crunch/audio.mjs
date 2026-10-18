// Procedural soundtrack for "What if you lived 1 trillion years?", synced to src/timeline.js (video clock).
//   node audio.mjs  -> out/soundtrack.wav
// (The owner adds a song in the app on top; this is the bed under it.) The seaside at sunset, sped up: waves,
// the crowd's murmur and the traffic racing faster and higher as time speeds up, a quieter night, then everything
// smears into one rushing wash. Every 10x lands as a deep soft "whoomp" while a low drone climbs a semitone.
// A warm chord when everyone you knew is gone; a shimmering swell for Betelgeuse; the sea surging in and out with
// the ice ages; the asteroid's long rolling boom; the oceans hissing away; the giant Sun's growing roar up to the
// white-out; then space: a quiet hum, the universe rushing back in, the squeeze into one point, a breath of near
// silence, and the new Big Bang: a deep soft boom and a bright chord that ring on into the seaside (it loops).
// No sharp clicks or crackles anywhere: every impact is a soft, low thud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, BEATS, V_NOVA, V_IMPACT, V_ENGULF, V_CRUNCH, V_TURN, V_FADE, T_SWITCH, V_LOCK, V_BANG, logRate } from './src/timeline.js';
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
    this.combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(Math.round(n * (1 + r() * 0.05) * 1.8)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  }
  run(x, fb = 0.88, damp = 0.4) {
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

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const BL = new Float32Array(N), BR = new Float32Array(N);   // the Big Bang, laid over the loop's crossfade
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(777);
  const white = () => R0() * 2 - 1;
  const beats = BEATS.filter((b) => b.v < T_SWITCH);

  const waveF = [new SVF(), new SVF()], waveE = new OnePole(0.8), surfLP = new OnePole(900);
  const crowdF = Array.from({ length: 4 }, () => new SVF()), crowdE = Array.from({ length: 4 }, () => new OnePole(4));
  const trafLP = new OnePole(220), rushF = [new SVF(), new SVF()], whoompF = new SVF(), padLP = new OnePole(700);
  const novaF = [new SVF(), new SVF()], iceF = new SVF(), boomF = new SVF(), rumL = new SVF(), rumR = new SVF(), rumSub = new OnePole(40);
  const hissF = [new SVF(), new SVF()], roarF = [new SVF(), new SVF()], roarSub = new OnePole(55), spaceLP = new OnePole(400);
  const revL = new Reverb(11), revR = new Reverb(12);
  const bangF = [new SVF(), new SVF(), new SVF()];
  const ph = new Float64Array(64);

  let s = state(-LOOP), lr = logRate(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) { s = state(v); lr = logRate(v); }
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;
    const earth = v < V_ENGULF ? 1 : 0;
    const fast = clamp(Math.log10(Math.max(s.E * 60, 0.01) / 0.3) / 4);   // 0 near real time .. 1 once a frame spans hours

    // --- the seaside, sped up: waves (higher and quicker), the crowd's murmur, traffic; smearing into one wash ---
    {
      const sp = Math.min(40, 1 + s.E * 120 * 0.25);                // how sped-up the waves sound
      const swell = waveE.run(0.5 + 0.5 * Math.sin(v * 0.9 * Math.min(sp, 12)) + 0.15 * white());
      const fc = 380 + 900 * fast;
      const wn = white();
      const w = (waveF[0].run(wn, fc, 0.6).bp * (0.5 + 0.8 * swell) + surfLP.run(white()) * 0.4) * 0.11;
      const life = (1 - smooth(V_LOCK + 6, V_LOCK + 12, v)) * (1 - 0.6 * s.ice) * (s.sea > -60 ? 1 : 0.2);
      l += w * life * earth; r += waveF[1].run(wn, fc * 1.15, 0.6).bp * (0.5 + 0.8 * swell) * 0.11 * life * earth;
      // the crowd: a murmur that rises in pitch and blurs as time speeds up, quieter at night, gone after a few days
      const ppl = s.crowd * (1 - 0.7 * smooth(3.1, 4.0, v) * (1 - smooth(5.4, 6.1, v)));
      if (ppl > 0.01) {
        let cv = 0;
        for (let q = 0; q < 4; q++) {
          const amp = crowdE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.8) * (1 + 4 * fast) + q) + white() * 0.25));
          cv += crowdF[q].run(white(), (420 + q * 260) * (1 + 0.8 * fast), 0.3).bp * amp;
        }
        l += cv * 0.05 * ppl; r += cv * 0.045 * ppl;
      }
      const traf = trafLP.run(white()) * 0.5 * 0.18 * s.city * (1 - smooth(5.1, 8.0, v) * 0.6) * earth;
      l += traf; r += traf * 0.9;
      // the time-lapse rush: a soft wind-like wash that brightens as the pace climbs
      const rushG = (0.015 + 0.05 * fast) * earth;
      const rf = 300 + 1600 * fast + 200 * Math.sin(v * 0.7);
      l += rushF[0].run(white(), rf, 0.9).bp * rushG; r += rushF[1].run(white(), rf * 1.1, 0.9).bp * rushG; wet += 0;
    }
    // --- every 10x: a deep, soft whoomp ---
    for (let i = 0; i < beats.length; i++) {
      const dt = v - beats[i].v;
      if (dt > -0.05 && dt < 2.2) {
        const e = Math.min(Math.max(dt + 0.05, 0) / 0.07, 1) * Math.exp(-Math.max(dt, 0) * 2.4);
        ph[2 + (i % 2)] += (34 + 28 * Math.exp(-Math.max(dt, 0) * 4)) / SR;
        const g = 0.18 + 0.012 * i;
        const vv = (Math.sin(TAU * ph[2 + (i % 2)]) * 0.9 + whoompF.run(white(), 110, 0.7).lp * 0.7) * e * g;
        dl += vv; dr += vv; wet += vv * 0.2;
      }
    }
    // --- the drone: a semitone higher with every 10x (the tension), thinning out in space ---
    {
      const semis = Math.min(17.7, Math.log10(Math.max(s.T, 0.5)));
      const f0 = 49 * Math.pow(2, semis / 12);
      const dg = 0.04 * smooth(-1, 1.5, v) * (1 - smooth(V_ENGULF - 0.2, V_ENGULF + 0.6, v));
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[6 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[6 + q]) * (q === 0 ? 0.8 : 0.3); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.4;
    }
    // --- "everyone you've ever met is gone": a warm, sad chord ---
    {
      const dt = v - 15.4;
      if (dt > 0 && dt < 3.0) {
        const e = smooth(0, 0.4, dt) * (1 - smooth(1.6, 3.0, dt)) * 0.035;
        let cv = 0;
        [220, 261.6, 329.6, 392].forEach((f, q) => { ph[12 + q] += f / SR; cv += Math.sin(TAU * ph[12 + q]) * (q === 0 ? 1 : 0.6); });
        l += cv * e; r += cv * e; wet += cv * e * 1.5;
      }
    }
    // --- Betelgeuse: a bright shimmering swell ---
    {
      const dt = v - V_NOVA;
      if (dt > -0.1 && dt < 3.5) {
        const e = smooth(-0.1, 0.35, dt) * (1 - smooth(1.6, 3.5, dt)) * 0.03;
        const wn = white();
        const sh = novaF[0].run(wn, 1900 + 300 * Math.sin(v * 3), 0.4).bp + novaF[1].run(wn, 2900, 0.5).bp * 0.5;
        ph[18] += 880 / SR; ph[19] += 1318.5 / SR;
        const tone = (Math.sin(TAU * ph[18]) + Math.sin(TAU * ph[19]) * 0.6) * 0.25;
        l += (sh + tone) * e; r += (sh * 0.9 + tone) * e; wet += (sh + tone) * e * 2;
      }
    }
    // --- the ice ages: the sea surging out and back ---
    if (s.ice > 0.001 && earth) {
      const g = 0.12 * clamp(s.ice * 2) * (1 - smooth(9, 9.3, Math.log10(Math.max(1, s.Y))));
      const vv = iceF.run(white(), 180 + 260 * s.ice, 0.5).lp * g;
      l += vv; r += vv * 0.95; wet += vv * 0.3;
    }
    // --- the asteroid: a long rolling boom (soft onset), then rumbling ---
    {
      const dt = (v - V_IMPACT) * 1.5;
      if (dt > 0 && dt < 5) {
        ph[22] += (26 + 30 * Math.exp(-dt * 3)) / SR;
        const e = Math.min(dt / 0.06, 1) * Math.exp(-dt * 0.9);
        const vv = (Math.sin(TAU * ph[22]) * 0.8 + boomF.run(white(), 80 + 180 * Math.exp(-dt * 2), 0.6).lp * 1.1) * e * 0.32;
        const sub = rumSub.run(white()) * 3;
        const rum = smooth(0.3, 1.0, dt) * (1 - smooth(2.6, 5, dt)) * 0.2;
        dl += vv; dr += vv; wet += vv * 0.5;
        l += (rumL.run(white(), 110, 0.6).lp + sub) * rum; r += (rumR.run(white(), 120, 0.6).lp + sub) * rum;
      }
    }
    // --- the oceans boiling away: a broad soft hiss and a seething bubble-wash ---
    if (s.steam > 0.01) {
      const wn = white();
      const g = s.steam * 0.09;
      const vv = hissF[0].run(wn, 2600, 0.5).bp + hissF[1].run(white(), 700 + 300 * Math.sin(v * 13), 0.4).bp * 0.8;
      l += vv * g; r += vv * g * 0.95; wet += vv * g * 0.4;
    }
    // --- the giant Sun: a deep roar growing to the white-out ---
    {
      const k = v < V_ENGULF ? smooth(31.1, V_ENGULF, v) : 1 - smooth(V_ENGULF, V_ENGULF + 1.6, v);
      if (k > 0.001) {
        const g = Math.pow(k, 1.4) * 0.6;
        const wn = white();
        const vv = roarF[0].run(wn, 90 + 300 * k, 0.5).lp + roarF[1].run(wn, 400 + 600 * k, 0.7).bp * 0.4 + roarSub.run(white()) * 2.5;
        l += vv * g; r += vv * g * 0.97; wet += vv * g * 0.2;
      }
    }
    // --- space: a quiet hum and a soft high shimmer; once the universe falls back in, a rising rush, a deep roar
    // that climbs as the sky heats, and one huge bright swell into the white-out ---
    if (v > V_ENGULF - 0.5) {
      // (everything drains into a breath of near silence just before the bang, and is gone after it)
      const g = smooth(V_ENGULF - 0.2, V_ENGULF + 1.2, v) * (1 - smooth(V_FADE - 0.3, T_SWITCH - 0.05, v)) * (v < V_BANG ? 1 - 0.9 * s.dim : 0);
      const heat = Math.max(s.glow, 0.5 * s.merge);
      let hv = 0;
      [55, 82.4, 110, 164.8].forEach((f, q) => { ph[30 + q] += f * (1 - 0.03 * s.out + 0.12 * s.back) / SR; hv += Math.sin(TAU * ph[30 + q] + 0.3 * Math.sin(v * (0.2 + q * 0.07))) * (q === 0 ? 1 : 0.5); });
      hv = spaceLP.run(hv) * 0.05 * g * (1 - 0.6 * heat);
      const air = rushF[0].run(white(), 2400 - 800 * s.out + 1800 * s.back, 1.2).bp * (0.012 + 0.03 * s.back) * g;
      l += hv + air; r += hv * 0.98 + air; wet += (hv + air) * 1.2;
      // the falling-in: a deep roar, rising in pitch and loudness as the sky heats up
      const rk = clamp(0.35 * s.merge + 0.65 * heat + 0.4 * s.white);
      if (rk > 0.001) {
        const gg = Math.pow(rk, 1.5) * 0.55 * g;
        const wn = white();
        const vv = roarF[0].run(wn, 70 + 500 * rk, 0.5).lp + roarF[1].run(wn, 300 + 1500 * rk, 0.7).bp * 0.5 + roarSub.run(white()) * 2.0;
        l += vv * gg; r += vv * gg * 0.97; wet += vv * gg * 0.25;
      }
      // the squeeze: everything sucked into one point, a rising whoosh and a tone sweeping up
      const sq = 1 - s.squash;
      if (sq > 0.001) {
        const gg = sq * sq * g;
        ph[42] += (55 + 500 * Math.pow(sq, 3)) / SR;
        const sw = Math.sin(TAU * ph[42]) * 0.07 + Math.sin(TAU * ph[42] * 1.5) * 0.03;
        const wh = hissF[0].run(white(), 400 + 3000 * sq * sq, 0.8).bp * 0.12;
        l += (sw + wh) * gg; r += (sw + wh * 0.9) * gg; wet += (sw + wh) * gg * 0.4;
      }
      // the end: a bright chord swelling into the white
      const dt = v - (V_CRUNCH - 2.2);
      if (dt > 0) {
        const e = smooth(0, 2.2, dt) * 0.05 * g;
        let cv = 0;
        [130.8, 196, 261.6, 329.6, 392].forEach((f, q) => { ph[36 + q] += f / SR; cv += Math.sin(TAU * ph[36 + q]); });
        l += cv * e; r += cv * e; wet += cv * e * 1.5;
      }
    }
    const fade = 1 - smooth(V_FADE - 0.1, T_SWITCH - 0.02, v);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const hush = v < V_BANG ? 1 - 0.8 * s.dim : 1;   // the breath before the bang
    const outL = (l + dl + rl * 0.8) * fade * hush, outR = (r + dr + rr * 0.8) * fade * hush;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
    // --- the new Big Bang: a deep, soft boom (a falling sub tone and a low rumble, no sharp attack), a bright rush of
    // air sweeping down, and a warm major chord blooming out of it; it rings on through the loop and dies away ---
    const db = v - V_BANG;
    if (n >= 0 && db > -0.05 && db < 3.5) {
      const att = smooth(-0.04, 0.05, db), d = Math.max(db, 0);
      const end = 1 - smooth(VIDEO_DURATION - 0.6, VIDEO_DURATION - 0.02, v);
      ph[46] += (24 + 46 * Math.exp(-d * 3)) / SR;
      const sub = Math.sin(TAU * ph[46]) * Math.exp(-d * 1.4) * 0.55;
      const rum = bangF[0].run(white(), 150, 0.6).lp * Math.exp(-d * 1.1) * 1.4;
      const fa = 280 + 2600 * Math.exp(-d * 2.2);
      const airL = bangF[1].run(white(), fa, 0.9).bp * Math.exp(-d * 1.6) * 0.16, airR = bangF[2].run(white(), fa * 1.08, 0.9).bp * Math.exp(-d * 1.6) * 0.16;
      let ch = 0;
      [130.8, 196, 261.6, 329.6, 392].forEach((f, q) => { ph[50 + q] += f / SR; ch += Math.sin(TAU * ph[50 + q]); });
      ch *= smooth(0, 0.25, d) * Math.exp(-d * 0.9) * 0.035;
      BL[n] = (sub + rum + airL + ch) * att * end;
      BR[n] = (sub + rum * 0.97 + airR + ch) * att * end;
    }
  }

  {   // the silence at the end turns into the lead-in to the first frame (the video loops)
    const a = N - N0, xf = Math.round(0.5 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
    for (let n = 0; n < N; n++) { L[n] += BL[n]; R[n] += BR[n]; }
  }

  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.6); R[n] = Math.tanh(R[n] * 1.6);
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
