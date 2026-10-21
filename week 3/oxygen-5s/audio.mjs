// Procedural soundtrack for "What if oxygen disappeared for 5 seconds?", synced to src/timeline.js.
//   node audio.mjs  -> out/soundtrack.wav
// Slow motion, so everything sounds stretched and deep. Before the moment (only heard in the loop's lead-in): wind
// on the summit, tourists chattering, the tour helicopter's rotor. The moment: a deep thump as a fifth of the air
// vanishes; your ears pop: from then on the world is muffled and a thin ringing hangs over it. The helicopter's rotor
// winds down into slow, deep "whomps". The statue pours away in a grainy rumble; the mountain gives way under you in a
// rising sub-bass rumble, with the rush of air as you start to fall; the sea's explosion is a roar that never stops
// growing; far off the city comes down in rolling thunder. Your heart: one slow beat every few seconds (12x slow).
// A low drone climbs toward 5.00 s. Then the oxygen comes back: one enormous boom and a roar of fire into the white,
// which turns back into the summit's wind at the start (the loop). No sharp clicks anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, VIDEO_DURATION, LOOP, T_SWITCH, V5, tau, vOfTau, SLOW, SEGS } from './src/timeline.js';
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
    for (const c of this.combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    y /= this.combs.length;
    for (const a of this.aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; y = o - v * 0.5; }
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (dt, att, dec) => (dt < 0 ? 0 : Math.min(dt / att, 1) * Math.exp(-dt / dec));

export function makeSoundtrack(outFile) {
  const N = Math.round(VIDEO_DURATION * SR);
  const N0 = Math.round(LOOP * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const PL = new Float32Array(N0), PR = new Float32Array(N0);
  const R0 = rng(4242);
  const white = () => R0() * 2 - 1;
  const MOMENTS = SEGS.slice(1, 5).map((g) => g.vm);   // the moment, and each replay of it from another place

  const windF = [new SVF(), new SVF()], windSub = new OnePole(60), gustE = new OnePole(0.8);
  const chatF = Array.from({ length: 4 }, () => new SVF()), chatE = Array.from({ length: 4 }, () => new OnePole(4));
  const heliF = new SVF(), thumpF = new SVF(), popF = new SVF();
  const grainF = [new SVF(), new SVF()], rumSub = new OnePole(40), rumF = new SVF();
  const seaF = [new SVF(), new SVF()], seaSub = new OnePole(35);
  const fallF = [new SVF(), new SVF()], cityF = new SVF(), padLP = new OnePole(380);
  const fireF = [new SVF(), new SVF()], fireSub = new OnePole(45), boomF = new SVF();
  const muffL = new OnePole(12000), muffR = new OnePole(12000);
  const revL = new Reverb(7), revR = new Reverb(8);
  const ph = new Float64Array(32);
  // the city's buildings coming down far away: a scatter of slow rolling rumbles
  const thunder = [];
  for (let k = 0; k < 26; k++) thunder.push({ v: 17 + Math.pow(R0(), 0.8) * 40, d: 3 + R0() * 4, g: 0.05 + 0.08 * R0(), pan: R0() * 1.6 - 0.8 });

  let s = state(-LOOP);
  for (let n = -N0; n < N; n++) {
    const v = n / SR;
    if (n % 48 === 0) s = state(v);
    const t = s.t;
    let l = 0, r = 0, wet = 0, dl = 0, dr = 0;   // d*: inside your head, not muffled (ringing, heartbeat, drone)
    const before = 1 - smooth(-0.002, 0.004, t);

    // --- the summit before: wind, voices, the helicopter (its rotor slows to deep whomps after) ---
    {
      const gust = gustE.run(0.6 + 0.4 * Math.sin(v * 0.9) * Math.sin(v * 0.37 + 1) + 0.15 * white());
      const wv = (windF[0].run(white(), 500 + 300 * gust, 0.7).bp * 0.5 + windSub.run(white()) * 1.2) * (0.06 + 0.04 * gust);
      l += wv; r += windF[1].run(white(), 560 + 300 * gust, 0.7).bp * 0.5 * (0.06 + 0.04 * gust) + windSub.y * 1.2 * 0.08;
      let cv = 0;
      for (let q = 0; q < 4; q++) {
        const a = chatE[q].run(Math.max(0, Math.sin(v * (2.3 + q * 0.8) + q) + white() * 0.25));
        cv += chatF[q].run(white(), 420 + q * 260 + 90 * Math.sin(v * (1.3 + q * 0.4)), 0.25).bp * a;
      }
      l += cv * 0.035 * before; r += cv * 0.032 * before;
      // the rotor: 13 blade passes a second, slowed 12x after the moment, and winding down
      const w = t > 0 ? Math.exp(-t / 0.9) : 1;
      const rate = t > 0 ? (13 * w) / SLOW : 13;
      ph[1] += rate / SR;
      const blade = Math.pow(Math.max(0, Math.sin(TAU * ph[1])), 6);
      const hv = heliF.run(white() * 0.6 + Math.sin(TAU * 55 * v) * 0.4, t > 0 ? 160 : 420, 0.6).lp * blade * (t > 0 ? 0.16 * w + 0.03 : 0.07);
      l += hv * 0.6; r += hv * 1.0; wet += hv * 0.4;
    }

    // --- the moment (and each replay of it): a deep thump as the air thins; your ears pop ---
    for (let mi = 0; mi < MOMENTS.length; mi++) {
      const dt = v - MOMENTS[mi];
      const nextA = mi + 1 < MOMENTS.length ? MOMENTS[mi + 1] : SEGS[5].b;
      if (dt > -0.01 && dt < 6 && v < nextA + 1.5) {
        ph[2] += (28 + 40 * Math.exp(-Math.max(dt, 0) * 2)) / SR;
        const e = env(dt, 0.04, 1.4) * (1 - smooth(4, 6, dt));
        const vv = (Math.tanh(2 * Math.sin(TAU * ph[2])) * 0.6 + thumpF.run(white(), 180, 0.7).lp * 0.8) * e * 0.6 * (1 - smooth(nextA - 0.3, nextA + 0.4, v));
        dl += vv; dr += vv;
        const pop = popF.run(white(), 900, 0.8).lp * env(dt - 0.15, 0.03, 0.25) * 0.35 * (1 - smooth(1, 2, dt));
        dl += pop; dr += pop * 0.9;
      }
    }
    // the ringing in your ears (soft, fading slowly)
    {
      const ring = smooth(0, 0.08, t) * (1 - 0.6 * smooth(0.5, 4.5, t)) * (1 - s.ignite);
      if (ring > 0) {
        ph[3] += 3400 / SR; ph[4] += 3412 / SR;
        const vv = (Math.sin(TAU * ph[3]) + Math.sin(TAU * ph[4])) * 0.006 * ring;
        dl += vv; dr += vv;
      }
    }

    // --- the statue pouring away: a grainy rumble (filtered, no grit clicks) ---
    if (t > 0) {
      const k = smooth(0, 1.2, t) * (1 - smooth(2.6, 3.6, t));
      const gv = (grainF[0].run(white(), 700, 0.6).bp * 0.6 + grainF[1].run(white(), 260, 0.6).lp) * k * 0.09;
      l += gv; r += gv * 0.9; wet += gv * 0.4;
    }
    // --- the mountain giving way under you: a sub-bass rumble that keeps rising ---
    if (t > 0) {
      const k = smooth(0.2, 4.5, t) * (1 - s.ignite);
      const sub = rumSub.run(white()) * 3.5;
      const rv = (sub + rumF.run(white(), 120 + 60 * k, 0.6).lp) * k * 0.35;
      l += rv; r += rv; wet += rv * 0.2;
    }
    // --- falling: the rush of air past you (slowed, deep) ---
    if (t > 1.2) {
      const k = smooth(1.2, 4.0, t) * (1 - s.ignite);
      const fv = (fallF[0].run(white(), 300 + 200 * k, 0.6).bp + 0.5 * fallF[1].run(white(), 140, 0.7).lp) * k * 0.14;
      l += fv; r += fv * 0.95;
    }
    // --- Copacabana: the sea erupting right in front of you, a roar that swells as the blast comes up the sand ---
    if (s.place === 2) {
      const k = smooth(0, 0.012, t);
      const bv = (seaF[0].run(white(), 120 + 500 * k, 0.5).lp * 1.6 + seaSub.run(white()) * 3) * (0.15 + 0.6 * k);
      l += bv; r += bv; wet += bv * 0.4;
    }
    // --- Botafogo: every window: a soft rushing hiss of glass turning to dust (no clinks) ---
    if (s.place === 3) {
      const k = smooth(0, 0.01, t) * (1 - smooth(0.08, 0.1, t));
      const gv = grainF[0].run(white(), 2600, 0.7).bp * 0.08 * k;
      l += gv; r += gv; wet += gv * 0.8;
    }
    // --- the sea exploding: a roar that never stops growing ---
    if (t > 0) {
      const k = Math.pow(smooth(0.05, 5, t), 0.8) * (1 - s.ignite * 0.5);
      const sv = (seaF[0].run(white(), 90 + 260 * k, 0.5).lp * 1.3 + seaF[1].run(white(), 420 + 300 * k, 0.6).bp * 0.4 + seaSub.run(white()) * 2.5) * k * 0.3;
      l += sv * 0.9; r += sv; wet += sv * 0.4;
    }
    // --- the city coming down, far away ---
    {
      let tv = 0;
      for (const q of thunder) { const dt = v - q.v; if (dt > 0 && dt < q.d + 3) tv += Math.min(dt / 0.8, 1) * Math.exp(-Math.max(0, dt - q.d) * 1.2) * q.g; }
      if (tv > 0) { const cv = cityF.run(white(), 110, 0.6).lp * Math.tanh(tv * 2) * 0.5; l += cv; r += cv * 0.9; wet += cv * 0.5; }
    }

    // --- your heart: a beat every ~10 s of video (12x slow), deep ---
    {
      const hb = smooth(0.05, 0.4, t) * (1 - s.ignite);
      if (hb > 0) {
        const cyc = ((t * 1.15) % 1);
        const beat = env(cyc, 0.004, 0.025) + 0.6 * env(cyc - 0.3, 0.004, 0.025);
        ph[5] += 40 / SR;
        const vv = Math.sin(TAU * ph[5]) * beat * 0.5 * hb;
        dl += vv; dr += vv;
      }
    }
    // --- a low drone that climbs toward 5.00 s ---
    {
      const f0 = 41 * Math.pow(2, clamp(t, 0, 5) / 5 * 0.75);
      const dg = 0.04 * smooth(-0.5, 1, t) * (1 - s.ignite);
      let pv = 0;
      [1, 1.5, 2, 3].forEach((m, q) => { ph[10 + q] += (f0 * m * (1 + 0.003 * q)) / SR; pv += saw(ph[10 + q]) * (q === 0 ? 0.8 : 0.35); });
      pv = padLP.run(pv) * dg;
      dl += pv; dr += pv; wet += pv * 0.4;
    }
    // --- 5.00 s: the oxygen comes back; the hydrogen burns: one huge boom, a roar of fire into the white ---
    {
      const dt = v - V5;
      if (dt > -0.05) {
        ph[6] += (20 + 45 * Math.exp(-Math.max(dt, 0) * 3)) / SR;
        const bv = (Math.tanh(2.5 * Math.sin(TAU * ph[6])) * 0.8 + boomF.run(white(), 260, 0.6).lp) * env(dt, 0.03, 1.2) * 1.2 * (1 - smooth(1.2, 1.9, dt));
        dl += bv; dr += bv; wet += bv * 0.6;
        const fv = (fireF[0].run(white(), 500, 0.5).lp + fireF[1].run(white(), 1500, 0.7).bp * 0.4 + fireSub.run(white()) * 2) * smooth(0, 0.2, dt) * (1 - smooth(1.0, 1.9, dt)) * 0.45;
        l += fv; r += fv; wet += fv * 0.4;
      }
    }

    // your ears popped: the outside world is muffled from the moment on (less so by the end, the roar gets through)
    const muff = smooth(0.0, 0.06, t) * (1 - 0.5 * smooth(2, 5, t)) * (1 - s.ignite);
    const fcm = 12000 * Math.pow(700 / 12000, muff);
    muffL.set(fcm); muffR.set(fcm);
    l = muffL.run(l); r = muffR.run(r);
    const rl = revL.run(wet * 0.5), rr = revR.run(wet * 0.5);
    const outL = l + dl + rl * 0.9, outR = r + dr + rr * 0.9;
    if (n < 0) { PL[n + N0] = outL; PR[n + N0] = outR; } else { L[n] = outL; R[n] = outR; }
  }

  {   // in the white, the soundtrack turns into the lead-in to the first frame
    const a = N - N0, xf = Math.round(0.5 * SR);
    for (let i = 0; i < N0; i++) {
      const kk = Math.min(1, i / xf), wi = Math.sin(kk * Math.PI / 2), wo = Math.cos(kk * Math.PI / 2);
      L[a + i] = L[a + i] * wo + PL[i] * wi;
      R[a + i] = R[a + i] * wo + PR[i] * wi;
    }
  }
  let peak = 0;
  for (let n = 0; n < N; n++) {
    L[n] = Math.tanh(L[n] * 1.5); R[n] = Math.tanh(R[n] * 1.5);
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
